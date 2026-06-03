#!/usr/bin/env python3
"""Servidor estático do visor + proxies para evitar CORS no navegador:
  - /aemet-radar/   → AEMET radar API
  - /eumetsat-wms   → EUMETSAT EUMETView WMS (satélite, con OAuth2 automático)
"""
import base64
import http.server
import json
import shutil
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import OrderedDict
from pathlib import Path

AEMET_RADAR_PREFIX = '/aemet-radar/'
AEMET_RADAR_UPSTREAM = 'https://www.aemet.es/es/api-eltiempo/radar/'

EUMETSAT_WMS_PREFIX = '/eumetsat-wms'
EUMETSAT_WMS_UPSTREAM = 'https://view.eumetsat.int/geoserver/wms'
EUMETSAT_TOKEN_URL = 'https://api.eumetsat.int/token'

ROOT = Path(__file__).resolve().parent
DEFAULT_PORT = 8000


# ─── Carga de credenciales desde .env ────────────────────────────────────────

def _load_env(path: Path) -> dict:
    """Lee un archivo .env simple (clave=valor) y devuelve un dict."""
    env = {}
    try:
        for line in path.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                key, _, val = line.partition('=')
                env[key.strip()] = val.strip()
    except FileNotFoundError:
        pass
    return env


_env = _load_env(ROOT / '.env')
_EUMETSAT_KEY = _env.get('EUMETSAT_CONSUMER_KEY', '')
_EUMETSAT_SECRET = _env.get('EUMETSAT_CONSUMER_SECRET', '')


# ─── Caché LRU en memoria ─────────────────────────────────────────────────────

class _LRUCache:
    """Caché LRU simple basada en OrderedDict."""

    def __init__(self, max_size: int = 200):
        self._cache: OrderedDict = OrderedDict()
        self._max_size = max_size

    def get(self, key: str):
        if key in self._cache:
            self._cache.move_to_end(key)
            return self._cache[key]
        return None

    def set(self, key: str, value):
        if key in self._cache:
            self._cache.move_to_end(key)
        elif len(self._cache) >= self._max_size:
            self._cache.popitem(last=False)
        self._cache[key] = value


_cache = _LRUCache(max_size=200)


# ─── Gestor de tokens OAuth2 EUMETSAT ────────────────────────────────────────

class _TokenManager:
    """Obtiene y renueva automáticamente el token OAuth2 de EUMETSAT."""

    def __init__(self, consumer_key: str, consumer_secret: str):
        self._key = consumer_key
        self._secret = consumer_secret
        self._token: str = ''
        self._expires_at: float = 0.0

    def get_token(self) -> str:
        # Renueva si faltan menos de 60 segundos para que expire
        if not self._token or time.time() >= self._expires_at - 60:
            self._fetch()
        return self._token

    def _fetch(self):
        credentials = f'{self._key}:{self._secret}'
        b64 = base64.b64encode(credentials.encode()).decode()
        body = b'grant_type=client_credentials'
        req = urllib.request.Request(
            EUMETSAT_TOKEN_URL,
            data=body,
            headers={
                'Authorization': f'Basic {b64}',
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            method='POST',
        )
        ctx = ssl.create_default_context()
        with urllib.request.urlopen(req, context=ctx, timeout=30) as resp:
            data = json.loads(resp.read().decode())
        self._token = data['access_token']
        self._expires_at = time.time() + data.get('expires_in', 3600)
        print(f'[EUMETSAT] Token renovado, válido {data.get("expires_in", 3600)}s')


_token_manager = _TokenManager(_EUMETSAT_KEY, _EUMETSAT_SECRET)


# ─── Handler HTTP ─────────────────────────────────────────────────────────────

class RadarProxyHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self):
        if self.path.startswith(AEMET_RADAR_PREFIX):
            self._proxy_aemet()
            return
        if self.path.startswith(EUMETSAT_WMS_PREFIX):
            self._proxy_eumetsat()
            return
        super().do_GET()

    def _proxy_aemet(self):
        rel = self.path[len(AEMET_RADAR_PREFIX):].split('?', 1)[0]
        upstream = AEMET_RADAR_UPSTREAM + rel
        self._forward(upstream, 'Meteonube-Radar-Proxy/1.0')

    def _proxy_eumetsat(self):
        # self.path = /eumetsat-wms?SERVICE=WMS&VERSION=... — pasamos el query string completo
        suffix = self.path[len(EUMETSAT_WMS_PREFIX):]
        upstream = EUMETSAT_WMS_UPSTREAM + suffix
        try:
            token = _token_manager.get_token()
        except Exception as exc:
            print(f'[EUMETSAT] Error al obtener token: {exc}')
            self.send_error(502, f'EUMETSAT token error: {exc}')
            return
        self._forward(upstream, 'Meteonube-Satellite-Proxy/1.0',
                      extra_headers={'Authorization': f'Bearer {token}'})

    def _forward(self, upstream: str, user_agent: str, extra_headers: dict = None):
        is_satellite = self.path.startswith(EUMETSAT_WMS_PREFIX)

        # Servir desde caché si existe (solo tiles de satélite, que son inmutables por timestamp)
        if is_satellite:
            cached = _cache.get(upstream)
            if cached:
                self.send_response(200)
                self.send_header('Content-Type', cached['content_type'])
                self.send_header('Content-Length', str(cached['length']))
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Cache-Control', 'public, max-age=86400')
                self.end_headers()
                self.wfile.write(cached['body'])
                print(f'[CACHE HIT] {upstream[upstream.find("TIME"):][:40]}')
                return

        headers = {'User-Agent': user_agent}
        if extra_headers:
            headers.update(extra_headers)
        try:
            req = urllib.request.Request(upstream, headers=headers)
            ctx = ssl.create_default_context()
            with urllib.request.urlopen(req, context=ctx, timeout=30) as resp:
                ct = resp.headers.get('Content-Type', 'application/octet-stream')
                body = resp.read()
                length = len(body)

                # Guardar en caché solo tiles de satélite con respuesta válida
                if is_satellite and resp.status == 200:
                    _cache.set(upstream, {'body': body, 'content_type': ct, 'length': length})

                self.send_response(resp.status)
                self.send_header('Content-Type', ct)
                self.send_header('Content-Length', str(length))
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Cache-Control', 'public, max-age=86400' if is_satellite else 'no-cache')
                self.end_headers()
                self.wfile.write(body)
        except urllib.error.HTTPError as exc:
            self.send_error(exc.code, exc.reason)
        except Exception as exc:
            self.send_error(502, str(exc))

    def log_message(self, fmt, *args):
        # Silencia los logs de archivos estáticos para no saturar la consola
        if any(self.path.startswith(p) for p in ['/aemet-radar', '/eumetsat-wms']):
            super().log_message(fmt, *args)


def main():
    if not _EUMETSAT_KEY:
        print('[AVISO] No se encontraron credenciales EUMETSAT en .env')
    port = int(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PORT
    server = http.server.ThreadingHTTPServer(('0.0.0.0', port), RadarProxyHandler)
    print(f'Meteonube viewer: http://0.0.0.0:{port}/  '
          f'(proxy radar: /aemet-radar/ · proxy satélite: /eumetsat-wms)')
    server.serve_forever()


if __name__ == '__main__':
    main()

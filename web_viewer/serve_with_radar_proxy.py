#!/usr/bin/env python3
"""Servidor estático do visor + proxy /aemet-radar/ → AEMET (evita CORS no navegador)."""
import http.server
import ssl
import sys
import urllib.error
import urllib.request
from pathlib import Path

AEMET_RADAR_PREFIX = '/aemet-radar/'
AEMET_RADAR_UPSTREAM = 'https://www.aemet.es/es/api-eltiempo/radar/'
ROOT = Path(__file__).resolve().parent
DEFAULT_PORT = 8000


class RadarProxyHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self):
        if self.path.startswith(AEMET_RADAR_PREFIX):
            self._proxy_aemet()
            return
        super().do_GET()

    def _proxy_aemet(self):
        rel = self.path[len(AEMET_RADAR_PREFIX):].split('?', 1)[0]
        upstream = AEMET_RADAR_UPSTREAM + rel
        try:
            req = urllib.request.Request(
                upstream,
                headers={'User-Agent': 'Meteonube-Radar-Proxy/1.0'}
            )
            ctx = ssl.create_default_context()
            with urllib.request.urlopen(req, context=ctx, timeout=30) as resp:
                body = resp.read()
                self.send_response(resp.status)
                ct = resp.headers.get('Content-Type', 'application/octet-stream')
                self.send_header('Content-Type', ct)
                self.send_header('Content-Length', str(len(body)))
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Cache-Control', 'no-cache')
                self.end_headers()
                self.wfile.write(body)
        except urllib.error.HTTPError as exc:
            self.send_error(exc.code, exc.reason)
        except Exception as exc:
            self.send_error(502, str(exc))


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PORT
    server = http.server.ThreadingHTTPServer(('0.0.0.0', port), RadarProxyHandler)
    print(f'Meteonube viewer: http://0.0.0.0:{port}/  (proxy radar: /aemet-radar/)')
    server.serve_forever()


if __name__ == '__main__':
    main()

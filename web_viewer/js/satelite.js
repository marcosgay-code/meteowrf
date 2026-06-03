/**
 * Visor de imagen satélite Meteosat (EUMETSAT) en tiempo real.
 * Leaflet se carga desde CDN en satelite.html — L es una variable global.
 */

const EUMETSAT_WMS_URL = '/eumetsat-wms';
const REFRESH_INTERVAL_MS = 15 * 60 * 1000;
const ANIM_INTERVAL_MS = 1200; // ms por frame
const NUM_FRAMES = 6;          // 1h30min a 15 min por frame

const LAYER_DIA   = 'msg_fes:rgb_eview'; // visible (solo funciona de día)
const LAYER_NOCHE = 'msg_fes:ir108';     // infrarrojo 10.8µm (día y noche)

// Vista centrada en Galicia con contexto de Cantábrico y N. Portugal
// Ancho: ~5.5° lon ≈ 420 km  |  Alto: ~4° lat ≈ 445 km
// A 1400×1300 px → ~3 px/km → aprovecha al máximo los ~3 km/px nativos de Meteosat
const SAT_SW  = [41.0, -10.5]; // [lat, lng] esquina SW
const SAT_NE  = [45.0,  -5.0]; // [lat, lng] esquina NE
const SAT_W   = 1400;
const SAT_H   = 1300;

/** Península Ibérica: canal visible 6:00–17:00 UTC (sol suficientemente alto).
 *  A partir de las 17:00 UTC (~19:00 local en verano) el sol es demasiado bajo
 *  y EUMETSAT puede devolver errores en rgb_eview; usamos IR108 más fiable. */
function isDia(date) {
    const h = date.getUTCHours() + date.getUTCMinutes() / 60;
    return h >= 6.0 && h <= 17.0;
}

function getLayer(date) {
    return isDia(date) ? LAYER_DIA : LAYER_NOCHE;
}

function toWmsTime(date) {
    return date.toISOString(); // EUMETSAT requiere milisegundos: 2026-06-03T08:30:00.000Z
}

function buildWmsUrl(date) {
    // Convierte lat/lng a metros EPSG:3857 para el parámetro BBOX del WMS
    const R = 6378137;
    const toX = (lon) => lon * Math.PI / 180 * R;
    const toY = (lat) => Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) * R;
    const bbox = [toX(SAT_SW[1]), toY(SAT_SW[0]), toX(SAT_NE[1]), toY(SAT_NE[0])].join(',');
    const params = new URLSearchParams({
        service: 'WMS', request: 'GetMap', version: '1.3.0',
        layers: getLayer(date), styles: '',
        format: 'image/png', transparent: 'true',
        crs: 'EPSG:3857', bbox,
        width: SAT_W, height: SAT_H,
        TIME: toWmsTime(date),
    });
    return `${EUMETSAT_WMS_URL}?${params.toString()}`;
}

function crearOverlay(date, opacity) {
    return L.imageOverlay(buildWmsUrl(date), L.latLngBounds(SAT_SW, SAT_NE), {
        opacity,
        interactive: false,
    });
}

function formatHora(date) {
    return date.toLocaleTimeString('es-ES', {
        hour: '2-digit', minute: '2-digit',
    }) + ' hora local';
}

// ─── Estado global ────────────────────────────────────────────────────────────

let mapaSatelite  = null;
let capaSatelite  = null; // capa en directo
let tiempoActual  = null; // tiempo de la imagen estática activa
let capasFrames   = [];   // capas precargadas para animación
let animando      = false;
let frameActual   = 0;
let intervalAnim  = null;
let pasos         = [];

// ─── Utilidades de tiempo ─────────────────────────────────────────────────────

function getLatestAvailableTime() {
    const t = new Date();
    t.setSeconds(0, 0);
    // 30 min de margen: EUMETSAT tarda ~20-25 min en publicar cada imagen
    t.setMinutes(Math.floor(t.getMinutes() / 15) * 15 - 30);
    return t;
}

function getTimeSteps() {
    // Usar el tiempo de la imagen estática activa como último frame
    const base = tiempoActual || getLatestAvailableTime();
    const steps = [];
    for (let i = NUM_FRAMES - 1; i >= 0; i--) {
        steps.push(new Date(base.getTime() - i * 15 * 60 * 1000));
    }
    return steps;
}

// ─── Animación con precarga ───────────────────────────────────────────────────

function irAFrame(idx) {
    frameActual = idx;
    capasFrames.forEach((l, i) => l.setOpacity(i === idx ? 0.85 : 0));
    const slider = document.getElementById('anim-slider');
    const label  = document.getElementById('anim-time-label');
    if (slider) slider.value = idx;
    if (label)  label.textContent = formatHora(pasos[idx]);
    actualizarTimestamp(pasos[idx]);
}

function reproducirAnim() {
    animando = true;
    const btn = document.getElementById('btn-play-pause');
    if (btn) btn.textContent = '⏸';
    intervalAnim = setInterval(() => {
        irAFrame((frameActual + 1) % pasos.length);
    }, ANIM_INTERVAL_MS);
}

function pausarAnim() {
    animando = false;
    const btn = document.getElementById('btn-play-pause');
    if (btn) btn.textContent = '▶';
    clearInterval(intervalAnim);
}

function resetearAlUltimo() {
    pausarAnim();
    if (capasFrames.length > 0) {
        irAFrame(capasFrames.length - 1);
        document.getElementById('btn-play-pause').textContent = '▶';
    }
}

function abrirVideo() {
    pausarAnim();
    pasos = getTimeSteps();
    frameActual = pasos.length - 1;

    // Limpiar capas anteriores
    capasFrames.forEach(l => mapaSatelite.removeLayer(l));
    capasFrames = [];

    document.getElementById('sat-last-update').classList.add('hidden-mobile');
    const btnPlay = document.getElementById('btn-play-pause');
    btnPlay.textContent = '⏳';
    btnPlay.disabled = true;

    // Mantener capaSatelite visible (última imagen) mientras se precargan los frames
    capaSatelite.setOpacity(0.85);

    let loadedCount = 0;
    pasos.forEach((t) => {
        const capa = crearOverlay(t, 0);
        capa.addTo(mapaSatelite);
        capasFrames.push(capa);

        const onFrameReady = () => {
            loadedCount++;
            if (loadedCount === pasos.length) {
                // Todos los frames terminaron (con éxito o con error): activar animación
                capaSatelite.setOpacity(0);
                btnPlay.textContent = '▶';
                btnPlay.disabled = false;
                irAFrame(pasos.length - 1);
            }
        };
        capa.once('load', onFrameReady);
        capa.once('error', onFrameReady);
    });

    const slider = document.getElementById('anim-slider');
    if (slider) slider.max = pasos.length - 1;
}

// Escuchar mensajes desde index.html para resetear al abrir el panel
window.addEventListener('message', (e) => {
    if (e.data?.type === 'resetSatelite') resetearAlUltimo();
});


// ─── Inicialización ───────────────────────────────────────────────────────────

function inicializar() {
    mapaSatelite = L.map('mapa-satelite', {
        center: [43.0, -7.8],
        zoom: 7,
        zoomControl: true,
        attributionControl: false,
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution:
            '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors ' +
            '© <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 10,
    }).addTo(mapaSatelite);

    tiempoActual = getLatestAvailableTime();
    capaSatelite = crearOverlay(tiempoActual, 0.85);
    capaSatelite.addTo(mapaSatelite);

    actualizarTimestamp(tiempoActual);

    // Esperar a que la imagen estática cargue, luego precargar los frames
    capaSatelite.once('load', () => {
        abrirVideo();
    });

    document.getElementById('btn-play-pause').addEventListener('click', () => {
        if (animando) pausarAnim();
        else reproducirAnim();
    });

    document.getElementById('anim-slider').addEventListener('input', (e) => {
        pausarAnim();
        irAFrame(parseInt(e.target.value));
    });

    const btnRefresh = document.getElementById('btn-sat-refresh');
    if (btnRefresh) {
        btnRefresh.addEventListener('click', () => {
            refrescarCapa();
            btnRefresh.innerHTML = '↻ <span class="refresh-label">Actualizando…</span>';
            setTimeout(() => { btnRefresh.innerHTML = '↻ <span class="refresh-label">Refrescar</span>'; }, 2000);
        });
    }

    setInterval(refrescarCapa, REFRESH_INTERVAL_MS);
}

function refrescarCapa() {
    if (!capaSatelite) return;
    tiempoActual = getLatestAvailableTime();
    capaSatelite.setUrl(buildWmsUrl(tiempoActual));
    actualizarTimestamp(tiempoActual);
}

function actualizarTimestamp(fecha) {
    const el = document.getElementById('sat-last-update');
    if (!el) return;
    const t = fecha || getLatestAvailableTime();
    el.textContent = `Imagen: ${t.toLocaleTimeString('es-ES', {
        hour: '2-digit', minute: '2-digit',
    })} hora local`;
}

document.addEventListener('DOMContentLoaded', inicializar);

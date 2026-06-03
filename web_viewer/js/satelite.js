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

/** Aproximación para la Península Ibérica: día = 5:30–19:30 UTC */
function isDia(date) {
    const h = date.getUTCHours() + date.getUTCMinutes() / 60;
    return h >= 5.5 && h <= 19.5;
}

function getLayer(date) {
    return isDia(date) ? LAYER_DIA : LAYER_NOCHE;
}

function toWmsTime(date) {
    return date.toISOString(); // EUMETSAT requiere milisegundos: 2026-06-03T08:30:00.000Z
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
        const capa = L.tileLayer.wms(EUMETSAT_WMS_URL, {
            layers: getLayer(t),
            TIME: toWmsTime(t),
            format: 'image/png',
            transparent: true,
            version: '1.3.0',
            opacity: 0,
        });
        capa.addTo(mapaSatelite);
        capasFrames.push(capa);

        capa.once('load', () => {
            loadedCount++;
            if (loadedCount === pasos.length) {
                // Frames listos: ocultar capa estática y mostrar último frame
                capaSatelite.setOpacity(0);
                btnPlay.textContent = '▶';
                btnPlay.disabled = false;
                irAFrame(pasos.length - 1);
            }
        });
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
        center: [42.0, -8.0],
        zoom: 6,
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
    capaSatelite = L.tileLayer.wms(EUMETSAT_WMS_URL, {
        layers: getLayer(tiempoActual),
        TIME: toWmsTime(tiempoActual),
        format: 'image/png',
        transparent: true,
        version: '1.3.0',
        opacity: 0.85,
    });
    capaSatelite.addTo(mapaSatelite);

    actualizarTimestamp(tiempoActual);

    // Arrancar animación automáticamente
    abrirVideo();

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
    capaSatelite.setParams({ layers: getLayer(tiempoActual), TIME: toWmsTime(tiempoActual) });
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

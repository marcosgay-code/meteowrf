/**
 * radar.js — radar AEMET rexional CCD (A Coruña / Galicia).
 * Timeline e imaxes vía /aemet-radar/ (proxy no servidor). Sen probes Image() no navegador.
 */
import { state } from './store.js';
import {
    createRadarOverlay,
    cornersFromAemetRing,
    cornersFromBounds
} from './radar-canvas-overlay.js';

/** Proxy local (serve_with_radar_proxy.py) ou equivalente en produción. */
const RADAR_API_BASE = '/aemet-radar';
const RADAR_STATION = 'CCD';
const RADAR_PARAM = 'PPI';
const RADAR_PPI_SUFFIX = 'PPI.Z_005_240';
const RADAR_RADIUS_KM = 240;
const RADAR_CENTER = { lat: 43.16902998, lng: -8.52690718 };
/** PNG PPI AEMET (CCD): o círculo útil de 240 km ocupa ~1002 px; o resto é margen gris. */
const RADAR_IMAGE_WIDTH_PX = 3050;
const RADAR_IMAGE_HEIGHT_PX = 3811;
const RADAR_DISC_RADIUS_PX = 501;

const RADAR_FRAME_WINDOW = 12;
const RADAR_ANIM_MS = 900;
const FRAME_INTERVAL_MIN = 10;
/** Co API caída: probar o slot actual (se elimina só se a imaxe non existe). */
const PUBLISH_SLOT_OFFSET_MIN = 0;
/** Reconsultar timeline AEMET co radar activo (novos frames cada ~10 min). */
const RADAR_TIMELINE_REFRESH_MS = 30 * 1000;
const RADAR_TIMELINE_BOOT_REFRESH_MS = 15 * 1000;
const RADAR_PROXY_RECHECK_MS = 60 * 1000;

let radarDeps = {};
let radarProxyOk = null;
let radarProxyCheckedAt = 0;
/** Evita aplicar un frame obsoleto se o usuario muda de hora rápido. */
let radarFrameShowToken = 0;
let radarRefreshTimer = null;
let radarBootRefreshTimer = null;
let radarTimelineRefreshInFlight = false;
let lastRadarTimelineFetchAt = 0;
const radarCornersCache = new Map();

export function initRadarModule(deps) {
    radarDeps = deps || {};
}

async function ensureRadarProxy(force = false) {
    const now = Date.now();
    if (!force && radarProxyOk !== null && now - radarProxyCheckedAt < RADAR_PROXY_RECHECK_MS) {
        return radarProxyOk;
    }
    try {
        const res = await fetch(`${RADAR_API_BASE}/timeline/${RADAR_PARAM}/${RADAR_STATION}`, {
            cache: 'no-store'
        });
        radarProxyOk = res.ok;
    } catch {
        radarProxyOk = false;
    }
    radarProxyCheckedAt = now;
    return radarProxyOk;
}

function failRadar(msg) {
    state.layers.radar = false;
    removeRadarLayer();
    updateRadarStatus(msg);
    syncToggleUi();
}

/**
 * Bounds do PNG completo: o disco interior (~501 px) = 240 km.
 * Mapear todo o ancho do PNG a 480 km encolle a lluvia ~3× no mapa.
 */
function computeRadarBounds() {
    const { lat, lng } = RADAR_CENTER;
    const kmPerPx = RADAR_RADIUS_KM / RADAR_DISC_RADIUS_PX;
    const widthKm = RADAR_IMAGE_WIDTH_PX * kmPerPx;
    const heightKm = RADAR_IMAGE_HEIGHT_PX * kmPerPx;
    const latDelta = (heightKm / 2) / 111.0;
    const lngDelta = (widthKm / 2) / (111.0 * Math.cos((lat * Math.PI) / 180));
    return L.latLngBounds(
        [lat - latDelta, lng - lngDelta],
        [lat + latDelta, lng + lngDelta]
    );
}

function computeRadarCorners() {
    return cornersFromBounds(computeRadarBounds());
}

async function fetchRadarCornersFromApi(fichero) {
    try {
        const url = `${RADAR_API_BASE}/bounds-radar/${RADAR_PARAM}/${encodeURIComponent(fichero)}`;
        const res = await fetch(url);
        if (!res.ok) return null;
        const ring = await res.json();
        return cornersFromAemetRing(ring, RADAR_CENTER);
    } catch {
        return null;
    }
}

async function resolveRadarCorners(fichero) {
    if (radarCornersCache.has(fichero)) {
        return radarCornersCache.get(fichero);
    }
    const fromApi = await fetchRadarCornersFromApi(fichero);
    const corners = fromApi || computeRadarCorners();
    radarCornersCache.set(fichero, corners);
    return corners;
}

function prefetchRadarCorners(frames) {
    return Promise.all(frames.map((f) => resolveRadarCorners(f.fichero)));
}

function radarImageUrl(fichero) {
    return `${RADAR_API_BASE}/imagen-radar/${RADAR_PARAM}/${encodeURIComponent(fichero)}`;
}

function madridParts(date) {
    const fmt = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Madrid',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    }).formatToParts(date);
    const getType = (type) => parseInt(fmt.find((p) => p.type === type)?.value || '0', 10);
    return {
        year: getType('year'),
        month: getType('month'),
        day: getType('day'),
        hour: getType('hour'),
        minute: getType('minute')
    };
}

function dateFromMadridParts({ year, month, day, hour, minute }) {
    const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
    for (const off of ['+02:00', '+01:00']) {
        const d = new Date(`${iso}${off}`);
        const p = madridParts(d);
        if (p.year === year && p.month === month && p.day === day && p.hour === hour && p.minute === minute) {
            return d.getTime();
        }
    }
    return new Date(`${iso}+01:00`).getTime();
}

function alignToMadrid10Min(ms) {
    const p = madridParts(new Date(ms));
    p.minute = Math.floor(p.minute / FRAME_INTERVAL_MIN) * FRAME_INTERVAL_MIN;
    return dateFromMadridParts(p);
}

/** CCD + YYMMDD + HHMMSS(00) en UTC → ex. CCD260524214000.PPI.Z_005_240.png */
function buildRegionalFicheroFromDate(date) {
    const d = new Date(date);
    const yy = String(d.getUTCFullYear()).slice(2);
    const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
    const da = String(d.getUTCDate()).padStart(2, '0');
    const h = String(d.getUTCHours()).padStart(2, '0');
    const mi = String(d.getUTCMinutes()).padStart(2, '0');
    return `${RADAR_STATION}${yy}${mo}${da}${h}${mi}00.${RADAR_PPI_SUFFIX}.png`;
}

function normalizeTimelineFrames(raw) {
    return raw
        .filter((f) => f?.fichero && f?.fecha)
        .sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime())
        .slice(-RADAR_FRAME_WINDOW);
}

/** Usa lineaTiempo oficial + Elementos CCD (mesma fonte que o visor AEMET). */
function extractCcdFramesFromBlock(block) {
    const elementos = block.Elementos.filter(
        (e) => e['Nombre radar'] === RADAR_STATION && e['Nombre fichero']
    );
    const byFecha = new Map(elementos.map((e) => [e.Fecha, e]));
    const linea = Array.isArray(block.lineaTiempo) ? block.lineaTiempo : [];

    let frames = linea
        .map((fecha) => byFecha.get(fecha))
        .filter(Boolean)
        .map((e) => ({ fecha: e.Fecha, fichero: e['Nombre fichero'] }));

    if (!frames.length) {
        frames = elementos.map((e) => ({
            fecha: e.Fecha,
            fichero: e['Nombre fichero']
        }));
    }
    return normalizeTimelineFrames(frames);
}

async function fetchAemetTimeline() {
    if (!(await ensureRadarProxy(true))) return null;
    try {
        const url = `${RADAR_API_BASE}/timeline/${RADAR_PARAM}/${RADAR_STATION}`;
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) return null;
        const data = await res.json();
        const block = Array.isArray(data) ? data[0] : null;
        if (!block?.Elementos?.length) return null;
        lastRadarTimelineFetchAt = Date.now();
        return extractCcdFramesFromBlock(block);
    } catch {
        return null;
    }
}

function buildSyntheticTimeline() {
    const frames = [];
    let t = alignToMadrid10Min(Date.now()) - PUBLISH_SLOT_OFFSET_MIN * 60 * 1000;
    for (let i = 0; i < RADAR_FRAME_WINDOW; i++) {
        frames.unshift({
            fecha: new Date(t).toISOString(),
            fichero: buildRegionalFicheroFromDate(t)
        });
        t -= FRAME_INTERVAL_MIN * 60 * 1000;
    }
    return frames;
}

async function buildTimeline() {
    const fromApi = await fetchAemetTimeline();
    if (fromApi?.length) return fromApi;
    lastRadarTimelineFetchAt = Date.now();
    return buildSyntheticTimeline();
}

function startRadarAutoRefresh() {
    stopRadarAutoRefresh();
    radarRefreshTimer = setInterval(() => {
        refreshRadarTimeline({ silent: true });
    }, RADAR_TIMELINE_REFRESH_MS);
    if (radarBootRefreshTimer) clearTimeout(radarBootRefreshTimer);
    radarBootRefreshTimer = setTimeout(() => {
        if (state.layers.radar) refreshRadarTimeline({ silent: true });
    }, RADAR_TIMELINE_BOOT_REFRESH_MS);
}

function stopRadarAutoRefresh() {
    if (radarRefreshTimer) {
        clearInterval(radarRefreshTimer);
        radarRefreshTimer = null;
    }
    if (radarBootRefreshTimer) {
        clearTimeout(radarBootRefreshTimer);
        radarBootRefreshTimer = null;
    }
}

/**
 * Reconsulta AEMET e, se hai frames novos, actualiza o slider.
 * Se o usuario estaba no último frame, salta ao máis recente.
 */
async function refreshRadarTimeline({ silent = false } = {}) {
    if (!state.layers.radar || !state.map || radarTimelineRefreshInFlight) return;
    radarTimelineRefreshInFlight = true;
    try {
        const frames = await buildTimeline();
        if (!state.layers.radar || !frames?.length) return;

        const prevFrames = state.radarFrames;
        const prevIndex = state.radarFrameIndex;
        const prevFichero = prevFrames[prevIndex]?.fichero;
        const wasOnLatest = prevFrames.length > 0 && prevIndex >= prevFrames.length - 1;
        const latestChanged = !prevFrames.length
            || prevFrames[prevFrames.length - 1]?.fichero !== frames[frames.length - 1]?.fichero;

        state.radarFrames = frames;

        let nextIndex = frames.length - 1;
        if (!wasOnLatest && prevFichero) {
            const kept = frames.findIndex((f) => f.fichero === prevFichero);
            if (kept >= 0) nextIndex = kept;
        }

        if (latestChanged || nextIndex !== prevIndex) {
            await showRadarFrameAtIndex(nextIndex);
        } else if (wasOnLatest) {
            updateRadarTimeLabel();
        }
        syncRadarSlider();

        if (!silent && latestChanged) {
            updateRadarStatus('');
        }
    } finally {
        radarTimelineRefreshInFlight = false;
    }
}

function maybeRefreshStaleRadarTimeline() {
    if (!state.layers.radar || !state.radarFrames.length) return;
    const age = Date.now() - lastRadarTimelineFetchAt;
    if (age >= RADAR_TIMELINE_REFRESH_MS) {
        refreshRadarTimeline({ silent: true });
    }
}

function formatRadarTimeLabel(isoDate) {
    if (!isoDate) return '';
    const d = new Date(isoDate);
    if (Number.isNaN(d.getTime())) return '';
    const parts = new Intl.DateTimeFormat('es-ES', {
        timeZone: 'Europe/Madrid',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    }).formatToParts(d);
    const get = (type) => parts.find((p) => p.type === type)?.value || '00';
    return `${get('hour')}:${get('minute')}`;
}

function updateRadarTimeLabel() {
    const label = document.getElementById('radar-time-label');
    const slider = document.getElementById('radar-time-slider');
    const frame = state.radarFrames[state.radarFrameIndex];
    const time = frame && state.layers.radar ? formatRadarTimeLabel(frame.fecha) : '';

    if (label) {
        label.textContent = time || '--:--';
    }
    if (slider) {
        slider.setAttribute(
            'aria-label',
            time ? `Hora do radar (observación): ${time}` : 'Hora do radar (observación)'
        );
    }
}

function updateRadarStatus(msg) {
    const el = document.getElementById('status-panel');
    if (!el) return;
    if (msg) {
        el.textContent = msg;
        el.dataset.radarMsg = '1';
    } else if (el.dataset.radarMsg === '1') {
        el.textContent = '';
        delete el.dataset.radarMsg;
    }
}

function updateRadarControlsVisibility(visible) {
    const radarOn = !!(visible && state.layers.radar);
    const radarGroup = document.getElementById('radar-time-controls');
    const dateControls = document.getElementById('date-controls');
    const timeControls = document.getElementById('time-controls');
    const lastUpdated = document.getElementById('last-updated');
    const timeline = document.querySelector('.timeline-controls');

    if (radarGroup) radarGroup.classList.toggle('hidden', !radarOn);
    if (dateControls) dateControls.classList.toggle('hidden', radarOn);
    if (timeControls) timeControls.classList.toggle('hidden', radarOn);
    if (lastUpdated) lastUpdated.classList.toggle('hidden', radarOn);
    if (timeline) timeline.classList.toggle('timeline-radar-mode', radarOn);
}

function syncRadarSlider() {
    const slider = document.getElementById('radar-time-slider');
    if (!slider || !state.radarFrames.length) return;
    slider.max = String(state.radarFrames.length - 1);
    slider.value = String(state.radarFrameIndex);
}

function syncRadarPlayButton() {
    const btn = document.getElementById('btn-radar-play');
    if (!btn) return;
    if (state.radarPlaying) {
        btn.textContent = '⏸';
        btn.title = 'Pausar animación do radar';
        btn.setAttribute('aria-label', 'Pausar animación do radar');
    } else {
        btn.textContent = '▶';
        btn.title = 'Animar radar (observación)';
        btn.setAttribute('aria-label', 'Animar radar');
    }
}

function stopRadarAnimation() {
    state.radarPlaying = false;
    if (state.radarAnimTimer) {
        clearInterval(state.radarAnimTimer);
        state.radarAnimTimer = null;
    }
    syncRadarPlayButton();
}

function attachRadarLayerErrorHandler() {
    if (!state.radarLayer) return;
    state.radarLayer.off('error');
    state.radarLayer.on('error', () => {
        if (!state.layers.radar || !state.radarFrames.length) return;
        const badFichero = state.radarFrames[state.radarFrameIndex]?.fichero;
        refreshRadarTimeline({ silent: true }).then(() => {
            if (!state.layers.radar || !state.radarFrames.length) return;
            const stillThere = state.radarFrames.some((f) => f.fichero === badFichero);
            if (stillThere) {
                const remaining = state.radarFrames.filter((f) => f.fichero !== badFichero);
                if (!remaining.length) {
                    failRadar('Radar non dispoñible. Reinicia o servidor: ./run_server.sh restart -f');
                    return;
                }
                state.radarFrames = remaining;
                showRadarFrameAtIndex(Math.min(state.radarFrameIndex, remaining.length - 1));
                syncRadarSlider();
            }
        });
    });
}

async function showRadarFrameAtIndex(index) {
    if (!state.radarFrames.length || !state.map) return;
    const clamped = Math.max(0, Math.min(index, state.radarFrames.length - 1));
    const token = ++radarFrameShowToken;
    const frame = state.radarFrames[clamped];
    const url = radarImageUrl(frame.fichero);
    const corners = await resolveRadarCorners(frame.fichero);
    if (token !== radarFrameShowToken || !state.layers.radar || !state.map) return;

    const options = {
        opacity: state.varLayerOpacityMap['radar'] ?? 1,
        pane: 'radarPane',
        interactive: false
    };

    if (!state.radarLayer) {
        state.radarLayer = createRadarOverlay(url, corners, options).addTo(state.map);
        attachRadarLayerErrorHandler();
    } else if (state.radarLayer._url !== url) {
        state.radarLayer.setUrl(url);
        state.radarLayer.setCorners(corners);
        state.radarLayer.setOpacity(state.varLayerOpacityMap['radar'] ?? 1);
        attachRadarLayerErrorHandler();
    } else {
        state.radarLayer.setCorners(corners);
        state.radarLayer.setOpacity(state.varLayerOpacityMap['radar'] ?? 1);
    }

    state.radarFrameIndex = clamped;
    state.radarFrameTime = frame.fecha;
    updateRadarTimeLabel();
    syncRadarSlider();
}

export function stepRadarFrame(delta) {
    if (!state.layers.radar || !state.radarFrames.length) return;
    stopRadarAnimation();
    const next = state.radarFrameIndex + delta;
    if (next < 0) showRadarFrameAtIndex(state.radarFrames.length - 1);
    else if (next >= state.radarFrames.length) showRadarFrameAtIndex(0);
    else showRadarFrameAtIndex(next);
}

export function toggleRadarAnimation() {
    if (!state.layers.radar || state.radarFrames.length < 2) return;
    if (state.radarPlaying) {
        stopRadarAnimation();
        return;
    }
    state.radarPlaying = true;
    syncRadarPlayButton();
    state.radarAnimTimer = setInterval(() => {
        if (!state.layers.radar || !state.radarFrames.length) {
            stopRadarAnimation();
            return;
        }
        const next = state.radarFrameIndex + 1;
        showRadarFrameAtIndex(next >= state.radarFrames.length ? 0 : next);
    }, RADAR_ANIM_MS);
}

function removeRadarLayer() {
    stopRadarAnimation();
    stopRadarAutoRefresh();
    radarTimelineRefreshInFlight = false;
    lastRadarTimelineFetchAt = 0;
    radarFrameShowToken += 1;
    radarCornersCache.clear();
    if (state.radarLayer && state.map?.hasLayer(state.radarLayer)) {
        state.map.removeLayer(state.radarLayer);
    }
    state.radarLayer = null;
    state.radarFrameTime = null;
    state.radarFrames = [];
    state.radarFrameIndex = 0;
    updateRadarStatus('');
    updateRadarControlsVisibility(false);
    updateRadarTimeLabel();
}

function syncToggleUi() {
    if (radarDeps.syncTogglesUI) radarDeps.syncTogglesUI();
    if (radarDeps.syncRadarExclusiveUi) radarDeps.syncRadarExclusiveUi();
}

function loadAndShowRadar() {
    updateRadarStatus('Cargando radar AEMET (A Coruña)…');
    updateRadarControlsVisibility(true);

    ensureRadarProxy().then((ok) => {
        if (!state.layers.radar) return;
        if (!ok) {
            failRadar('Servidor sen proxy radar. Executa: ./run_server.sh restart -f');
            return;
        }
        return buildTimeline();
    }).then((frames) => {
        if (!state.layers.radar || frames == null) return;

        if (!frames.length) {
            failRadar('Radar AEMET non dispoñible agora');
            return;
        }

        state.radarFrames = frames;
        state.radarFrameIndex = frames.length - 1;
        prefetchRadarCorners(frames).finally(() => {
            if (!state.layers.radar) return;
            showRadarFrameAtIndex(state.radarFrameIndex);
            syncRadarSlider();
            syncRadarPlayButton();
            updateRadarStatus('');
            startRadarAutoRefresh();
            if (radarDeps.syncRadarScale) radarDeps.syncRadarScale();
        });
    });
}

export function setRadarEnabled(enabled) {
    state.layers.radar = !!enabled;
    if (enabled && radarDeps.clearDataLayersForRadar) {
        radarDeps.clearDataLayersForRadar();
    }
    syncToggleUi();
    syncRadarLayer();
    if (radarDeps.refreshView) radarDeps.refreshView();
}

export function syncRadarLayer() {
    if (!state.map) return;

    if (!state.layers.radar) {
        removeRadarLayer();
        return;
    }

    if (state.radarLayer && state.radarFrames.length) {
        state.radarLayer.setOpacity(state.varLayerOpacityMap['radar'] ?? 1);
        updateRadarControlsVisibility(true);
        updateRadarTimeLabel();
        maybeRefreshStaleRadarTimeline();
        return;
    }

    loadAndShowRadar();
}

export function setupRadarControls() {
    const slider = document.getElementById('radar-time-slider');
    const play = document.getElementById('btn-radar-play');

    if (slider) {
        slider.oninput = (e) => {
            stopRadarAnimation();
            showRadarFrameAtIndex(parseInt(e.target.value, 10));
        };
    }
    if (play) play.onclick = () => toggleRadarAnimation();

    if (!document.documentElement.dataset.radarVisibilityBound) {
        document.documentElement.dataset.radarVisibilityBound = '1';
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && state.layers.radar) {
                refreshRadarTimeline({ silent: true });
            }
        });
    }
}

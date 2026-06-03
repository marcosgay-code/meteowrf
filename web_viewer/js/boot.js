/**
 * Arranque: modo simple/vuelo e inicialización do visor.
 */
import { state } from './store.js';
import {
    LS_UI_MODE_KEY,
    LS_OPACITY_MAP_KEY,
    LS_OPACITY_VAR_MAP_KEY,
    formatLastUpdatedForDisplay
} from './utils.js';
import { els } from './dom.js';
import { loadManifest } from './data.js';
import { refreshView } from './view.js';
import { WindParticles } from './particles.js';
import { initMap, initMapModule, getDomainBounds } from './map.js';
import {
    setupControls,
    applyUiModeAndStart,
    updateUIForType,
    updateMarkers,
    scheduleGradientScaleLabelsLayout,
    resumeParticlesAfterContextChange,
    syncParticlesPauseButton,
    populateVars,
    initUi
} from './ui.js';

function createParticleEngine() {
    const engine = new WindParticles(null);
    engine.setContext({
        getMap: () => state.map,
        getParticlesPaused: () => state.particlesPaused,
        getDomainBounds
    });
    console.log('✅ particleEngine creado desde boot.js');
    return engine;
}

function pruneLocalStorageKeepOpacityOnly() {
    try {
        const mapOp = localStorage.getItem(LS_OPACITY_MAP_KEY);
        const varOp = localStorage.getItem(LS_OPACITY_VAR_MAP_KEY);
        const uiMode = localStorage.getItem(LS_UI_MODE_KEY);
        localStorage.clear();
        if (mapOp !== null) localStorage.setItem(LS_OPACITY_MAP_KEY, mapOp);
        if (varOp !== null) localStorage.setItem(LS_OPACITY_VAR_MAP_KEY, varOp);
        if (uiMode !== null) localStorage.setItem(LS_UI_MODE_KEY, uiMode);
    } catch (e) {
        /* modo privado / bloqueo */
    }
}

function readUiModeFromUrl() {
    const p = new URLSearchParams(window.location.search);
    const m = (p.get('modo') || p.get('mode') || '').toLowerCase();
    if (m === 'simple' || m === 'sencillo') return 'simple';
    if (m === 'flight' || m === 'vuelo') return 'flight';
    return null;
}

function persistUiMode(mode) {
    try {
        localStorage.setItem(LS_UI_MODE_KEY, mode);
    } catch (e) { /* */ }
}

function resolveSavedUiMode() {
    try {
        const s = localStorage.getItem(LS_UI_MODE_KEY);
        if (s === 'simple' || s === 'flight') return s;
    } catch (e) { /* */ }
    return null;
}

function shouldForceModePickerOverlay() {
    const p = new URLSearchParams(window.location.search);
    if (p.has('elegir')) return true;
    const modo = (p.get('modo') || '').toLowerCase();
    if (modo === 'elixe' || modo === 'elegir' || modo === 'picker') return true;
    return false;
}

/** Cablea ui.js e map.js (chámase unha vez desde main.js). */
export function wireApp(mapModule) {
    mapModule.initMapModule({
        els,
        resumeParticlesAfterContextChange,
        syncParticlesPauseButton,
        populateVars,
        updateUIForType,
        updateMarkers,
        updateImage: () => refreshView()
    });

    initUi({
        els,
        updateImage: () => refreshView(),
        getDomainForView: () => mapModule.getDomainForView(),
        startApp: () => runStartup()
    });
}

/** Inicialización tras elixir modo (equivalente ao antigo init() de app.js). */
export async function runStartup() {
    try {
        pruneLocalStorageKeepOpacityOnly();
        if (els.lastUpdated) els.lastUpdated.textContent = 'Cargando…';

        await loadManifest();

        if (els.lastUpdated) {
            if (state.manifest?.last_updated) {
                const short = formatLastUpdatedForDisplay(state.manifest.last_updated);
                els.lastUpdated.textContent = short ? `Actualizado: ${short}` : '';
            } else {
                els.lastUpdated.textContent = '';
            }
        }

        state.particleEngine = createParticleEngine();
        initMap();
        setupControls();
        updateUIForType();
        refreshView();
        updateMarkers();

        if (typeof ResizeObserver !== 'undefined' && els.dynamicScale) {
            new ResizeObserver(() => scheduleGradientScaleLabelsLayout()).observe(els.dynamicScale);
        }
    } catch (e) {
        console.error('Failed to load manifest', e);
        if (els.lastUpdated) els.lastUpdated.textContent = 'Erro cargando datos';
    }
}

/** Selector de modo e arranque (equivalente ao antigo bootApp() de app.js). */
export function bootApp() {
    const fromUrl = readUiModeFromUrl();
    if (fromUrl) {
        persistUiMode(fromUrl);
        applyUiModeAndStart(fromUrl);
        return;
    }

    const forcePicker = shouldForceModePickerOverlay();
    const saved = resolveSavedUiMode();
    const useSavedFirst = !!saved && !forcePicker;
    if (useSavedFirst) {
        applyUiModeAndStart(saved);
        return;
    }

    const picker = document.getElementById('mode-picker-overlay');
    const bSimple = document.getElementById('mode-pick-simple');
    const bFlight = document.getElementById('mode-pick-flight');
    if (picker && bSimple && bFlight) {
        picker.classList.remove('hidden');
        bSimple.addEventListener('click', () => {
            persistUiMode('simple');
            applyUiModeAndStart('simple');
        });
        bFlight.addEventListener('click', () => {
            persistUiMode('flight');
            applyUiModeAndStart('flight');
        });
    } else {
        applyUiModeAndStart('flight');
    }
}

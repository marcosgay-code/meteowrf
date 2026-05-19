/** simple = só choiva, nube (%), temperatura e vento superficie · flight = comportamento actual */

// ============================================
// PUENTE: estado (store.js) + utils (utils.js) desde main.js
// ============================================

let appState = null;
let usingCentralState = false;
let utilsWired = false;
let __appBootCalled = false;

// particles.js (módulo ES6 vía main.js)
let WindParticlesClass = null;

function applyParticlesModule(particlesModule) {
    if (!particlesModule?.WindParticles || WindParticlesClass) return;
    WindParticlesClass = particlesModule.WindParticles;
    console.log('✅ WindParticles cargado desde módulo');
}

function createParticleEngine() {
    if (!WindParticlesClass) {
        console.error('❌ WindParticles non dispoñible (fallou a carga do módulo)');
        return null;
    }
    const engine = new WindParticlesClass(null);
    engine.setContext({
        getMap: () => state.map,
        getParticlesPaused: () => state.particlesPaused,
        getDomainBounds: () => getDomainBounds()
    });
    console.log('✅ particleEngine creado desde módulo externo');
    return engine;
}
// ui.js (módulo ES6 vía main.js)
let uiModule = null;
let stepDay, stepTime, updateTooltip, updateMarkers, openSounding, cycleSoundingsMode;
let applySoundingsModeFromCycle, syncSoundingsCycleUI;
let toggleScalarVariable, setWeatherLayer, loadImage, updateSoundingImage, updateMeteogramImage;
let updateDynamicScale, syncVariableDataLayersOpacity, applyScaleChromeVisibility, setupScaleGradientToggle;
let updateAvailableHours, resumeParticlesAfterContextChange, syncTogglesUI, updateModeVisibility, syncParticlesPauseButton;
let syncVarButtonsActive, scheduleGradientScaleLabelsLayout, updateCurrentVarLabel, syncDynamicScaleInteractiveAttrs;
let setupControls, populateDates, populateVars, populateVarButtons, updateUIForType, applyUiModeAndStart, derivePrimaryCurrentVar;

function applyUiModule(ui) {
    if (!ui || uiModule) return;
    uiModule = ui;
    stepDay = ui.stepDay;
    stepTime = ui.stepTime;
    updateTooltip = ui.updateTooltip;
    openSounding = ui.openSounding;
    window.openSounding = ui.openSounding;
    updateMarkers = ui.updateMarkers;
    cycleSoundingsMode = ui.cycleSoundingsMode;
    applySoundingsModeFromCycle = ui.applySoundingsModeFromCycle;
    syncSoundingsCycleUI = ui.syncSoundingsCycleUI;
    toggleScalarVariable = ui.toggleScalarVariable;
    setWeatherLayer = ui.setWeatherLayer;
    loadImage = ui.loadImage;
    updateSoundingImage = ui.updateSoundingImage;
    updateMeteogramImage = ui.updateMeteogramImage;
    updateDynamicScale = ui.updateDynamicScale;
    syncVariableDataLayersOpacity = ui.syncVariableDataLayersOpacity;
    applyScaleChromeVisibility = ui.applyScaleChromeVisibility;
    setupScaleGradientToggle = ui.setupScaleGradientToggle;
    updateAvailableHours = ui.updateAvailableHours;
    resumeParticlesAfterContextChange = ui.resumeParticlesAfterContextChange;
    syncTogglesUI = ui.syncTogglesUI;
    updateModeVisibility = ui.updateModeVisibility;
    syncParticlesPauseButton = ui.syncParticlesPauseButton;
    syncVarButtonsActive = ui.syncVarButtonsActive;
    updateCurrentVarLabel = ui.updateCurrentVarLabel;
    scheduleGradientScaleLabelsLayout = ui.scheduleGradientScaleLabelsLayout;
    syncDynamicScaleInteractiveAttrs = ui.syncDynamicScaleInteractiveAttrs;
    setupControls = ui.setupControls;
    populateDates = ui.populateDates;
    populateVars = ui.populateVars;
    populateVarButtons = ui.populateVarButtons;
    updateUIForType = ui.updateUIForType;
    applyUiModeAndStart = ui.applyUiModeAndStart;
    derivePrimaryCurrentVar = ui.derivePrimaryCurrentVar;
    console.log('✅ UI cargada desde módulo');
}

// map.js (módulo ES6 vía main.js)
let mapModule = null;
let initMap, getDomainBounds, setDomainInternal, getDomainForView, updateDisplayControl, updateLeafletOverlay;

function applyMapModule(map) {
    if (!map || mapModule) return;
    mapModule = map;
    initMap = map.initMap;
    getDomainBounds = map.getDomainBounds;
    setDomainInternal = map.setDomainInternal;
    getDomainForView = map.getDomainForView;
    updateDisplayControl = map.updateDisplayControl;
    updateLeafletOverlay = map.updateLeafletOverlay;
    console.log('✅ Mapa cargado desde módulo');
}

function wireMapDeps() {
    if (!mapModule) return;
    mapModule.initMapModule({
        els,
        resumeParticlesAfterContextChange: () => resumeParticlesAfterContextChange(),
        syncParticlesPauseButton: () => syncParticlesPauseButton(),
        populateVars: () => populateVars(),
        updateUIForType: () => updateUIForType(),
        updateMarkers: () => updateMarkers(),
        updateImage: () => updateImage()
    });
}

function wireUiDeps() {
    if (!uiModule) return;
    uiModule.initUi({
        els,
        updateImage: () => updateImage(),
        getDomainForView: () => getDomainForView(),
        startApp: () => init()
    });
}

// Referencias a utils (asígnanse desde js/utils.js vía main.js)
let LS_UI_MODE_KEY;
let LS_OPACITY_MAP_KEY;
let LS_OPACITY_VARS_KEY;
let SIMPLE_SCALAR_IDS;
let SIMPLE_LAYER_IDS;
let VAR_SHORT_LABELS;
let LAYER_SHORT_LABELS;
let LAYER_ICONS;
let VAR_ICONS;
let HIDDEN_UI_VAR_IDS;
let WIND_VAR_IDS;
let CLOUD_VAR_IDS;
let WIND_SPEED_VAR_IDS;
let LAYER_ORDER;
let COLOR_RAMPS;
let getRampColor;
let getRampForVariable;
let formatLastUpdatedForDisplay;
let getTimeString;
let scalarVarCategory;
let isCloudVariable;

function applyUtilsBundle(bundle) {
    if (!bundle || utilsWired) return;

    LS_UI_MODE_KEY = bundle.LS_UI_MODE_KEY;
    LS_OPACITY_MAP_KEY = bundle.LS_OPACITY_MAP_KEY;
    LS_OPACITY_VARS_KEY = bundle.LS_OPACITY_VARS_KEY;
    SIMPLE_SCALAR_IDS = bundle.SIMPLE_SCALAR_IDS;
    SIMPLE_LAYER_IDS = bundle.SIMPLE_LAYER_IDS;
    VAR_SHORT_LABELS = bundle.VAR_SHORT_LABELS;
    LAYER_SHORT_LABELS = bundle.LAYER_SHORT_LABELS;
    LAYER_ICONS = bundle.LAYER_ICONS;
    VAR_ICONS = bundle.VAR_ICONS;
    HIDDEN_UI_VAR_IDS = bundle.HIDDEN_UI_VAR_IDS;
    WIND_VAR_IDS = bundle.WIND_VAR_IDS;
    CLOUD_VAR_IDS = bundle.CLOUD_VAR_IDS;
    WIND_SPEED_VAR_IDS = bundle.WIND_SPEED_VAR_IDS;
    LAYER_ORDER = bundle.LAYER_ORDER;
    COLOR_RAMPS = bundle.COLOR_RAMPS;
    getRampColor = bundle.getRampColor;
    formatLastUpdatedForDisplay = bundle.formatLastUpdatedForDisplay;
    getTimeString = bundle.getTimeString;
    scalarVarCategory = bundle.scalarVarCategory;

    const isCloudFromUtils = bundle.isCloudVariable;
    isCloudVariable = (varId) => isCloudFromUtils(varId, state.manifest);

    const getRampFromUtils = bundle.getRampForVariable;
    getRampForVariable = (varId) => getRampFromUtils(varId, state.manifest);

    utilsWired = true;
    console.log('✅ Utils centralizados activos (desde utils.js)');
}

function connectCentralState(centralState) {
    if (usingCentralState) return;

    console.log('🔄 Conectando con estado centralizado...');

    if (!appState) {
        appState = centralState;
    } else {
        Object.keys(appState).forEach(key => {
            if (centralState[key] !== undefined && typeof centralState[key] === 'object' && centralState[key] !== null && !Array.isArray(centralState[key])) {
                Object.assign(centralState[key], appState[key]);
            } else {
                centralState[key] = appState[key];
            }
        });
        appState = centralState;
    }

    usingCentralState = true;

    if (typeof window !== 'undefined') {
        window.__appState = appState;
    }

    console.log('✅ Estado centralizado activo');
}

function tryStartApp() {
    if (__appBootCalled || !usingCentralState || !utilsWired || !WindParticlesClass || !uiModule) return;
    __appBootCalled = true;
    bootApp();
}

function receiveCentralState(centralState, utilsBundle, particlesModule, ui, map) {
    if (centralState) connectCentralState(centralState);
    if (utilsBundle) applyUtilsBundle(utilsBundle);
    if (particlesModule) applyParticlesModule(particlesModule);
    if (ui) applyUiModule(ui);
    if (map) applyMapModule(map);
    tryStartApp();
}

if (window.__centralState) {
    receiveCentralState(window.__centralState, window.__utilsBundle, window.__particlesModule, window.__uiModule, window.__mapModule);
} else {
    window.__appReady = receiveCentralState;
}

// Definición original do state (fallback se main.js non cargou a tempo)
const _fallbackState = {
    /** @type {'flight'|'simple'} */
    uiMode: 'flight',
    manifest: null,
    currentDomain: 'd02',
    currentDate: null,
    currentHour: 0,
    currentHourIndex: 0,
    availableHours: [],
    currentVar: 'sfcwind',
    currentZoom: '',
    currentStation: '',
    overlayOpacity: 0.45,
    /** Opacidade das capas de datos WRF (escalares, vectores, nubes…), 0–1 */
    variableLayerOpacity: 1,

    vectorMode: 'particles',
    particlesPaused: false,

    gridDataMap: {},
    gridUrlMap: {},
    gridVectorModeMap: {},
    vectorGridUrlMap: {},
    gridLoadingMap: {},
    gridLoadedUrlMap: {},
    gridFailedUrlMap: {},

    layers: {
        blcloudpct: false,
        rain: false,
        soundings: true,
        takeoffs_names: false,
        boundaries: false,
        provinces: true
    },

    boundariesLayer: null,
    provincesLayer: null,
    particleEngine: null,
    map: null,
    baseLayer: null,
    scalarOverlayByVarId: {},
    vectorOverlay: null,
    dynamicOverlays: {},
    markers: [],
    clickMarker: null,
    isTooltipPinned: false,
    isInteractionLocked: false,

    soundingsMode: 'dots_blue',
    scaleChromeExpanded: true,
    activeScalarVarIds: [],

    particlesControlButton: null,
    particlesControlContainer: null,
    particlesControl: null,
    zoomIndicator: null,
    vectorLayerGroup: null
};

if (!appState) {
    appState = _fallbackState;
    console.log('⚠️ Usando estado local (fallback)');
}

// Proxy: todo o código que usa state.* redirixe a appState
const state = new Proxy({}, {
    get(target, prop) {
        return appState[prop];
    },
    set(target, prop, value) {
        appState[prop] = value;
        return true;
    }
});

if (typeof window !== 'undefined') {
    window.__appState = appState;
}

console.log('✅ Proxy state configurado');

const els = {
    dateSelector: document.getElementById('date-selector'),
    varSelector: null,
    // viewTypeSelector removed
    modeSelector: document.getElementById('mode-selector'),

    // Groups
    varGroup: null,
    modeGroup: document.getElementById('mode-group'),
    opacitySlider: document.getElementById('opacity-slider'),
    variableOpacitySlider: document.getElementById('variable-opacity-slider'),
    overlayContainer: document.getElementById('overlay-container'),
    timelineControls: document.querySelector('.timeline-controls'),

    // Elements for Sounding/Meteogram (still in HTML)
    imgSounding: document.getElementById('img-sounding'),
    imgMeteogram: document.getElementById('img-meteogram'),
    imgScale: document.getElementById('img-scale'),
    dateSelector: document.getElementById('date-selector'),
    timeSelector: document.getElementById('time-selector'),
    lastUpdated: document.getElementById('last-updated'),
    closeModalBtn: document.getElementById('close-modal'),

    // Wind Tooltip
    windTooltip: document.getElementById('wind-tooltip'),
    wtStationName: document.getElementById('wt-station-name'),
    wtVarName: document.getElementById('wt-var-name') || document.createElement('div'), // Fallback
    wtValue: document.getElementById('wt-value') || document.getElementById('wt-speed'),
    wtUnits: document.getElementById('wt-units') || document.createElement('span'),
    wtDirDeg: document.getElementById('wt-dir-deg'),

    wtDirArrow: document.getElementById('wt-dir-arrow'),
    windParticles: null, // Will be created dynamically for Leaflet or handled as custom layer
    mapContainer: document.getElementById('map'),
    dynamicScale: document.getElementById('dynamic-scale')
};

/** Borra todo localStorage salvo opacidades e modo UI. */
function pruneLocalStorageKeepOpacityOnly() {
    try {
        const mapOp = localStorage.getItem(LS_OPACITY_MAP_KEY);
        const varOp = localStorage.getItem(LS_OPACITY_VARS_KEY);
        const uiMode = localStorage.getItem(LS_UI_MODE_KEY);
        localStorage.clear();
        if (mapOp !== null) localStorage.setItem(LS_OPACITY_MAP_KEY, mapOp);
        if (varOp !== null) localStorage.setItem(LS_OPACITY_VARS_KEY, varOp);
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
    const p = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
    if (p.has('elegir')) return true;
    const modo = (p.get('modo') || '').toLowerCase();
    if (modo === 'elixe' || modo === 'elegir' || modo === 'picker') return true;
    return false;
}

// --- Initialization ---

async function init() {
    wireUiDeps();
    wireMapDeps();
    try {
        pruneLocalStorageKeepOpacityOnly();
        if (els.lastUpdated) els.lastUpdated.textContent = 'Cargando…';
        // Añadimos un timestamp para evitar que el navegador guarde el archivo en caché
        const resp = await fetch('manifest.json?t=' + new Date().getTime());
        state.manifest = await resp.json();

        if (els.lastUpdated) {
            if (state.manifest.last_updated) {
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
        updateImage();
        updateMarkers();

        if (typeof ResizeObserver !== 'undefined' && els.dynamicScale) {
            new ResizeObserver(() => scheduleGradientScaleLabelsLayout()).observe(els.dynamicScale);
        }
    } catch (e) {
        console.error("Failed to load manifest", e);
        if (els.lastUpdated) els.lastUpdated.textContent = 'Erro cargando datos';
    }
}

function setDomain(dom) {
    // This function is now manually called by setDomainInternal but kept for legacy or forced switches
    setDomainInternal(dom);
    const bounds = getDomainBounds();
    if (bounds && state.map) {
        state.map.fitBounds(bounds, { animate: false, maxZoom: 12 });
    }
}


function bootApp() {
    wireUiDeps();
    wireMapDeps();
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

// --- Logic ---

function getBasePath() {
    const base = state.manifest.base_path;
    const dateCompact = state.currentDate.replace(/-/g, ''); // YYYY-MM-DD -> YYYYMMDD
    return `${base}/${state.currentDomain}/${dateCompact}`;
}

function getDomainRootPath() {
    // For static files like terrain, rivers, etc.
    // base / domain
    return `${state.manifest.base_path}/${state.currentDomain}`;
}

function updateImage() {
    if (!state.currentDate) return;

    updateMapOverlays();
    updateMarkers();

    if (state.currentStation) {
        updateSoundingImage();
        updateMeteogramImage();
    }

    if (!state.currentDomain) {
        if (state.particleEngine) state.particleEngine.stop();
        return;
    }

    // Determine all variables that need to be loaded as grids
    const varsToLoad = [...state.activeScalarVarIds];
    if (state.manifest && state.manifest.configuration.layers) {
        state.manifest.configuration.layers.forEach(l => {
            if (state.layers[l.id]) varsToLoad.push(l.id);
        });
    }


    // Fetch data grids for all required variables
    varsToLoad.forEach(vId => {
        if (vId && vId !== 'none') updateDataGrid(vId);
    });

    // Partículas integration
    if (state.particleEngine) {
        const isWind = WIND_SPEED_VAR_IDS.has(state.currentVar);
        const showParticles = (state.vectorMode === 'particles' && isWind);

        if (showParticles && state.gridDataMap[state.currentVar] && state.gridDataMap[state.currentVar].grid && state.gridDataMap[state.currentVar].grid.twsKn) {
            state.particleEngine.setGrid(state.gridDataMap[state.currentVar]);
        } else {
            state.particlesPaused = false;
            state.particleEngine.stop();
            syncParticlesPauseButton();
        }
    }

}

async function updateDataGrid(varId) {
    if (!varId) varId = state.currentVar;
    const hhmm = getTimeString(state.currentHour);
    const dayPath = getBasePath();
    const url = `${dayPath}/${hhmm}_${varId}.json`;

    if (state.gridLoadingMap[varId] === url) return;
    if (state.gridFailedUrlMap[varId] === url) return;

    const isWind = WIND_SPEED_VAR_IDS.has(varId);
    const currentZoom = state.map ? state.map.getZoom() : 5;
    const cacheKey = state.vectorMode + "_" + currentZoom;

    // Optimization: Skip fetch if URL already loaded. 
    // And cached vector image matches current mode+zoom
    if (state.gridLoadedUrlMap[varId] === url) {
        if (!isWind || state.gridVectorModeMap[varId] === cacheKey) {
            return; // Fully cached
        }
        // Mode or zoom changed for wind: re-generate vector without re-fetching
        state.vectorGridUrlMap[varId] = await generateVectorImageDataURL(state.gridDataMap[varId], state.vectorMode);
        state.gridVectorModeMap[varId] = cacheKey;
        if (state.activeScalarVarIds.includes(varId) || state.layers[varId]) updateImage();
        return;
    }

    state.gridLoadingMap[varId] = url;
    state.gridUrlMap[varId] = null; // Clear old dynamic overlay

    try {
        const resp = await fetch(url);
        if (resp.ok) {
            const data = await resp.json();
            state.gridDataMap[varId] = data;
            console.log("Data grid loaded", varId, data.grid.nx, data.grid.ny);

            // Generate overlay directly from grid data
            state.gridUrlMap[varId] = await generateGridImageDataURL(state.gridDataMap[varId]);

            // Generate vector overlay if wind data
            if (isWind && state.gridDataMap[varId].grid.twsKn) {
                state.vectorGridUrlMap[varId] = await generateVectorImageDataURL(state.gridDataMap[varId], state.vectorMode);
            }

            // Re-trigger particles if applicable
            if (state.particleEngine && state.vectorMode === 'particles') {
                if (isWind && state.gridDataMap[state.currentVar] && state.gridDataMap[state.currentVar].grid.twsKn) {
                    state.particleEngine.setGrid(state.gridDataMap[state.currentVar]);
                }
            }

            // Update cache maps
            state.gridLoadedUrlMap[varId] = url;
            delete state.gridFailedUrlMap[varId];
            if (isWind) state.gridVectorModeMap[varId] = cacheKey;

            // Refresh UI if this variable is active as scalar or as manifest layer
            if (state.activeScalarVarIds.includes(varId) || state.layers[varId]) {
                updateImage();
            }
        } else {
            state.gridDataMap[varId] = null;
            state.gridFailedUrlMap[varId] = url;
        }
    } catch (e) {
        console.error("Error loading data grid", e);
        state.gridDataMap[varId] = null;
    } finally {
        state.gridLoadingMap[varId] = null;
    }
}


/** Aplica state.variableLayerOpacity a imageOverlays, liñas de vento e canvas de partículas */

function updateMapOverlays() {
    if (!state.map) return;

    const bounds = getDomainBounds();
    const varOp = state.variableLayerOpacity;

    // If no domain (bounds is null), hide all domain-specific overlays
    if (!bounds || !state.currentDomain) {
        Object.keys(state.scalarOverlayByVarId).forEach(k => {
            if (state.scalarOverlayByVarId[k]) state.map.removeLayer(state.scalarOverlayByVarId[k]);
            delete state.scalarOverlayByVarId[k];
        });
        if (state.vectorOverlay) state.map.removeLayer(state.vectorOverlay);
        state.vectorOverlay = null;
        Object.keys(state.dynamicOverlays).forEach(k => {
            if (state.dynamicOverlays[k]) state.map.removeLayer(state.dynamicOverlays[k]);
            delete state.dynamicOverlays[k];
        });
        els.imgScale.classList.add('hidden');
        if (els.dynamicScale) {
            els.dynamicScale.classList.add('hidden');
            syncDynamicScaleInteractiveAttrs();
        }
        return;
    }

    const hhmm = getTimeString(state.currentHour);
    const dayPath = getBasePath(); // Daily folder
    const rootPath = getDomainRootPath(); // Domain root

    // 1. Variables escalares do manifest (0–2 capas, z crecente)
    const wantedScalars = new Set(state.activeScalarVarIds.filter(id => id && id !== 'none'));
    Object.keys(state.scalarOverlayByVarId).forEach(vid => {
        if (!wantedScalars.has(vid)) {
            const lyr = state.scalarOverlayByVarId[vid];
            if (lyr) state.map.removeLayer(lyr);
            delete state.scalarOverlayByVarId[vid];
        }
    });
    let zScalar = 20;
    state.activeScalarVarIds.forEach(vid => {
        if (!vid || vid === 'none') return;
        const gridUrl = state.gridUrlMap[vid];
        state.scalarOverlayByVarId[vid] = updateLeafletOverlay(
            state.scalarOverlayByVarId[vid],
            !!gridUrl,
            gridUrl,
            bounds,
            { opacity: varOp, zIndex: zScalar }
        );
        zScalar += 1;
    });

    // 2. Vectors/Barbs/Particles
    const isWind = WIND_SPEED_VAR_IDS.has(state.currentVar);
    const showVector = (state.vectorMode !== 'particles' && isWind);
    let vecUrl = '';

    if (showVector) {
        // Only use dynamic grid-based vector
        vecUrl = state.vectorGridUrlMap[state.currentVar] || '';
    }

    state.vectorOverlay = updateLeafletOverlay(state.vectorOverlay, showVector, vecUrl, bounds, { opacity: varOp, zIndex: 30 });

    if (!state.vectorLayerGroup) {
        state.vectorLayerGroup = L.layerGroup().addTo(state.map);
    }

    if (showVector) {
        renderStreamlinesNative(state.gridDataMap[state.currentVar]);
    } else {
        state.vectorLayerGroup.clearLayers();
    }

    // 3. Dynamic Overlays (Clouds, Rain, etc.)
    // Only show if NOT already shown as base variable
    const dynamicLayers = state.manifest.configuration.layers || [];
    dynamicLayers.forEach(layer => {
        let showLayer = state.layers[layer.id];
        if (state.activeScalarVarIds.includes(layer.id)) showLayer = false;

        let layerUrl = state.gridUrlMap[layer.id] || '';
        state.dynamicOverlays[layer.id] = updateLeafletOverlay(state.dynamicOverlays[layer.id], showLayer, layerUrl, bounds, { opacity: varOp, zIndex: 40 });
    });

    // 4. Scale
    let scaleVar = derivePrimaryCurrentVar();
    dynamicLayers.forEach(layer => {
        if (state.layers[layer.id]) scaleVar = layer.id;
    });

    els.imgScale.classList.add('hidden');
    if (scaleVar && scaleVar !== 'none') {
        els.dynamicScale.classList.remove('hidden');
        updateDynamicScale(scaleVar);
        syncDynamicScaleInteractiveAttrs();
    } else {
        els.dynamicScale.classList.add('hidden');
        syncDynamicScaleInteractiveAttrs();
    }

    syncVariableDataLayersOpacity();
}


function toggleLayer(imgEl, show, src) {
    if (show) {
        loadImage(imgEl, src);
    } else {
        imgEl.classList.add('hidden');
    }
}

// --- Time & Animation ---


// Arranque: bootApp() chámase desde receiveCentralState() cando estado + utils + particles están listos

/**
 * Dynamic Grid Overlay Generator
 */
async function generateGridOverlay(varId) {
    const data = state.gridDataMap[varId];
    if (!data) return;
    try {
        // 1. Scalar Background
        state.gridUrlMap[varId] = await generateGridImageDataURL(data);

        // 2. Vectors/Barbs from JSON (only if wind)
        const isWind = data.grid && data.grid.twsKn && data.grid.twdDeg;
        if (isWind) {
            state.vectorGridUrlMap[varId] = await generateVectorImageDataURL(data, state.vectorMode);
        }

        updateMapOverlays();
    } catch (e) {
        console.error("Error generating grid overlay:", e);
    }
}

async function generateAllGridOverlays() {
    for (const varId in state.gridDataMap) {
        await generateGridOverlay(varId);
    }
}

async function generateGridImageDataURL(gridData) {
    if (!gridData || !gridData.grid || (!gridData.grid.twsKn && !gridData.grid.values)) return null;
    const g = gridData.grid;
    const nx = g.nx;
    const ny = g.ny;
    const vals = g.twsKn || g.values;
    const ramp = getRampForVariable(gridData.variable);
    const canvas = document.createElement('canvas');
    canvas.width = nx;
    canvas.height = ny;
    const ctx = canvas.getContext('2d');
    const imgData = ctx.createImageData(nx, ny);
    const data = imgData.data;
    for (let y = 0; y < ny; y++) {
        for (let x = 0; x < nx; x++) {
            // Map grid [row][col] to canvas Top-Down
            const idxGrid = (ny - 1 - y) * nx + x;
            const val = vals[idxGrid] || 0;
            const color = getRampColor(val, ramp);
            const idxData = (y * nx + x) * 4;
            data[idxData] = color.r;
            data[idxData + 1] = color.g;
            data[idxData + 2] = color.b;
            data[idxData + 3] = Math.round(color.a * 255);
        }
    }
    ctx.putImageData(imgData, 0, 0);
    return canvas.toDataURL();
}

/**
 * Generate Vectors/Barbs Canvas
 */
async function generateVectorImageDataURL(gridData, mode) {
    if (!gridData || !gridData.grid || !gridData.grid.twsKn) return null;
    renderStreamlinesNative(gridData);
    return 'STREAMLINES_NATIVE';
}

function renderStreamlinesNative(gridData) {
    if (!state.vectorLayerGroup) return;
    state.vectorLayerGroup.clearLayers();
    if (!state.map || !gridData || !gridData.grid || !gridData.grid.twsKn) return;

    const g = gridData.grid;
    const nx = g.nx;
    const ny = g.ny;
    const tws = g.twsKn;
    const twd = g.twdDeg;

    const bounds = getDomainBounds();
    if (!bounds) return;
    const b = bounds.toBBoxString().split(',').map(Number);
    const dLeft = b[0], dBottom = b[1], dRight = b[2], dTop = b[3];
    const dLonR = dRight - dLeft;
    const dLatR = dTop - dBottom;

    const mapBounds = state.map.getBounds();
    const zoom = state.map.getZoom();
    const baseZoom = state.currentDomain === 'd02' ? 8 : 5;
    const zoomMag = Math.pow(2, Math.max(0, zoom - baseZoom));

    // Espaciado adaptativo. A medida que hacemos zoom (visión más profunda), el sembrado se vuelve relativamente más denso.
    const seedStep = Math.max(0.5, 3 / zoomMag);
    const maxSegments = 120;

    // Matriz de ocupación adaptativa (evita juntar demasiado las líneas)
    const maskRes = Math.max(0.5, seedStep * 0.8);
    const cols = Math.ceil(nx / maskRes);
    const rows = Math.ceil(ny / maskRes);
    const mask = new Uint8Array(cols * rows);

    function isOccupied(x, y) {
        const mx = Math.floor(x / maskRes);
        const my = Math.floor(y / maskRes);
        if (mx < 0 || mx >= cols || my < 0 || my >= rows) return false;
        return mask[my * cols + mx] === 1;
    }
    function occupy(x, y) {
        const mx = Math.floor(x / maskRes);
        const my = Math.floor(y / maskRes);
        if (mx >= 0 && mx < cols && my >= 0 && my < rows) {
            mask[my * cols + mx] = 1;
        }
    }

    function sampleWind(x, y) {
        const x0 = Math.floor(x), y0 = Math.floor(y);
        const x1 = Math.min(nx - 1, x0 + 1), y1 = Math.min(ny - 1, y0 + 1);
        if (x0 < 0 || y0 < 0 || x0 >= nx || y0 >= ny) return null;

        const tx = x - x0, ty = y - y0;
        const idx = (ix, iy) => (ny - 1 - iy) * nx + ix;

        const s00 = tws[idx(x0, y0)], s10 = tws[idx(x1, y0)], s01 = tws[idx(x0, y1)], s11 = tws[idx(x1, y1)];
        const d00 = twd[idx(x0, y0)], d10 = twd[idx(x1, y0)], d01 = twd[idx(x0, y1)], d11 = twd[idx(x1, y1)];

        const s = (1 - tx) * (1 - ty) * s00 + tx * (1 - ty) * s10 + (1 - tx) * ty * s01 + tx * ty * s11;
        const d = (1 - tx) * (1 - ty) * d00 + tx * (1 - ty) * d10 + (1 - tx) * ty * d01 + tx * ty * d11;
        return { speed: s, dir: d };
    }

    const ds = 0.5; // Distancia fija de paso (células de malla base)
    function stepRK2(x, y, dirSign = 1) {
        const v1 = sampleWind(x, y);
        if (!v1 || v1.speed < 0.5) return null;

        const ang1 = (270 - v1.dir) * Math.PI / 180;
        const k1x = Math.cos(ang1) * ds * dirSign;
        const k1y = -Math.sin(ang1) * ds * dirSign;

        const v2 = sampleWind(x + k1x * 0.5, y + k1y * 0.5);
        if (!v2 || v2.speed < 0.5) return null;
        const ang2 = (270 - v2.dir) * Math.PI / 180;
        const k2x = Math.cos(ang2) * ds * dirSign;
        const k2y = -Math.sin(ang2) * ds * dirSign;

        return { x: x + k2x, y: y + k2y, speed: v2.speed };
    }

    const lines = [];
    const arrows = [];

    const padLat = (dLatR * 0.1);
    const padLon = (dLonR * 0.1);
    const innerBounds = L.latLngBounds(
        [mapBounds.getSouth() - padLat, mapBounds.getWest() - padLon],
        [mapBounds.getNorth() + padLat, mapBounds.getEast() + padLon]
    );

    // Integración sólo para sectores visibles (acelera procesado con zoom x10)
    for (let y = 0; y < ny; y += seedStep) {
        for (let x = 0; x < nx; x += seedStep) {
            const jitter = seedStep * 0.4;
            let x0 = x + (Math.random() - 0.5) * jitter;
            let y0 = y + (Math.random() - 0.5) * jitter;

            const lat0 = dTop - (y0 / ny) * dLatR;
            const lon0 = dLeft + (x0 / nx) * dLonR;

            if (!innerBounds.contains([lat0, lon0])) continue;
            if (isOccupied(x0, y0)) continue;

            let points = [[x0, y0]];

            let currX = x0, currY = y0;
            for (let i = 0; i < maxSegments; i++) {
                const v = stepRK2(currX, currY, +1);
                if (!v || isOccupied(v.x, v.y)) break;
                points.push([v.x, v.y]);
                occupy(v.x, v.y);
                currX = v.x; currY = v.y;
            }

            currX = x0; currY = y0;
            for (let i = 0; i < maxSegments; i++) {
                const v = stepRK2(currX, currY, -1);
                if (!v || isOccupied(v.x, v.y)) break;
                points.unshift([v.x, v.y]);
                occupy(v.x, v.y);
                currX = v.x; currY = v.y;
            }

            if (points.length < 5) continue;

            const latLngs = points.map(p => [
                dTop - (p[1] / ny) * dLatR,
                dLeft + (p[0] / nx) * dLonR
            ]);
            lines.push(latLngs);

            const mid = Math.floor(points.length / 2);
            if (mid > 0 && mid < points.length - 1) {
                const p1 = points[mid - 1];
                const p2 = points[mid];
                const pt1 = [dTop - (p1[1] / ny) * dLatR, dLeft + (p1[0] / nx) * dLonR];
                const pt2 = [dTop - (p2[1] / ny) * dLatR, dLeft + (p2[0] / nx) * dLonR];
                arrows.push({ p1: pt1, p2: pt2 });
            }
        }
    }

    const color = 'rgba(0, 0, 0, 0.75)';
    const lineOp = state.variableLayerOpacity;

    // MultiPolyline es increíblemente eficiente para miles de segmentos
    L.polyline(lines, {
        color: color,
        opacity: lineOp,
        weight: 1.0,  // Grosor SVG estrictamente nativo a 1 pixel de pantalla
        lineCap: 'round',
        lineJoin: 'round',
        interactive: false
    }).addTo(state.vectorLayerGroup);

    const arrowLines = [];
    const arrowLenScreen = 4.5; // Longitud rígida basada en píxeles de pantalla nativos

    arrows.forEach(arr => {
        const p1Px = state.map.latLngToLayerPoint(arr.p1);
        const p2Px = state.map.latLngToLayerPoint(arr.p2);

        if (Math.abs(p2Px.x - p1Px.x) < 0.1 && Math.abs(p2Px.y - p1Px.y) < 0.1) return;

        const angle = Math.atan2(p2Px.y - p1Px.y, p2Px.x - p1Px.x);

        const hx1 = p2Px.x - arrowLenScreen * Math.cos(angle - Math.PI / 6);
        const hy1 = p2Px.y - arrowLenScreen * Math.sin(angle - Math.PI / 6);
        const hx2 = p2Px.x - arrowLenScreen * Math.cos(angle + Math.PI / 6);
        const hy2 = p2Px.y - arrowLenScreen * Math.sin(angle + Math.PI / 6);

        const hLatlng1 = state.map.layerPointToLatLng([hx1, hy1]);
        const hLatlng2 = state.map.layerPointToLatLng([hx2, hy2]);

        arrowLines.push([hLatlng1, arr.p2, hLatlng2]);
    });

    if (arrowLines.length > 0) {
        L.polyline(arrowLines, {
            color: color,
            opacity: lineOp,
            weight: 1.5,
            lineCap: 'round',
            lineJoin: 'round',
            interactive: false
        }).addTo(state.vectorLayerGroup);
    }
};



let gradientScaleLabelsLayoutRaf = null;

/**
 * Reparte etiquetas da escala entre fila inferior e superior só cando,
 * medindo no DOM, detectamos solapamento horizontal na fila inferior.
 */

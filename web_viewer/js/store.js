/**
 * Estado global da aplicación.
 */

export const state = {
    /** @type {'flight'|'simple'} */
    uiMode: 'flight',

    manifest: null,

    currentDomain: 'd02',
    currentDate: null,
    currentHour: 0,
    currentHourIndex: 0,
    availableHours: [],

    currentVar: 'none',
    currentZoom: '',
    currentStation: '',

    overlayOpacity: 0.45,
    /** Opacidade individual por capa (clave: varId o layerId → 0–1). Default: 1 */
    varLayerOpacityMap: {},

    vectorMode: 'particles',
    /** Pausa solo a animación das partículas (non cambia a modo vector) */
    particlesPaused: false,

    gridDataMap: {},
    gridUrlMap: {},
    gridVectorModeMap: {},
    vectorGridUrlMap: {},
    gridLoadingMap: {},
    gridLoadedUrlMap: {},
    /** URLs que devolvieron 404 (evita repetir peticións inútiles) */
    gridFailedUrlMap: {},

    layers: {
        blcloudpct: false,
        rain: false,
        radar: false,
        soundings: true,
        takeoffs_names: false,
        boundaries: false,
        provinces: true
    },

    boundariesLayer: null,
    provincesLayer: null,
    radarLayer: null,
    radarFrameTime: null,
    /** @type {{ fecha: string, fichero: string }[]} */
    radarFrames: [],
    radarFrameIndex: 0,
    radarPlaying: false,
    radarAnimTimer: null,
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

    /** Ciclo timeline: dots_blue → names_green → hidden */
    soundingsMode: 'dots_blue',

    scaleChromeExpanded: true,

    /** Variables escalares activas: modo flight máx. 2; modo simple só 1 */
    activeScalarVarIds: [],

    // Asignados en initMap() / updateMapOverlays() (non están no bloque inicial de app.js)
    particlesControlButton: null,
    particlesControlContainer: null,
    particlesControl: null,
    zoomIndicator: null,
    vectorLayerGroup: null
};

/** Actualiza propiedades do estado (suscripcións máis adiante). */
export function setState(key, value) {
    if (typeof key === 'object' && key !== null) {
        Object.assign(state, key);
    } else {
        state[key] = value;
    }
}

/** Limpa cachés de grids WRF (p.ex. ao cambiar dominio ou data). */
export function clearGridCache() {
    state.gridDataMap = {};
    state.gridUrlMap = {};
    state.gridVectorModeMap = {};
    state.vectorGridUrlMap = {};
    state.gridLoadedUrlMap = {};
    state.gridLoadingMap = {};
    state.gridFailedUrlMap = {};
}

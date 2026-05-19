/**
 * Capa de datos WRF: manifest, rutas, fetch de grids e xeración de overlays.
 */
import { state } from './store.js';
import { getTimeString, getRampForVariable, WIND_SPEED_VAR_IDS } from './utils.js';
import { generateGridImageDataURL } from './raster.js';
import { generateVectorImageDataURL } from './vectors.js';

let refreshViewFn = null;
let updateMapOverlaysFn = null;

/** Registra callbacks do orquestador (evita dependencia circular data ↔ view). */
export function initDataLayer({ refreshView, updateMapOverlays }) {
    refreshViewFn = refreshView;
    updateMapOverlaysFn = updateMapOverlays;
}

function notifyViewRefresh(varId) {
    if (state.activeScalarVarIds.includes(varId) || state.layers[varId]) {
        refreshViewFn?.();
    }
}

function notifyMapOverlays() {
    if (updateMapOverlaysFn) updateMapOverlaysFn();
    else refreshViewFn?.();
}

/**
 * Carga manifest.json (sen tocar o DOM).
 * @returns {Promise<object>}
 */
export async function loadManifest() {
    const resp = await fetch('manifest.json?t=' + new Date().getTime());
    if (!resp.ok) throw new Error(`manifest HTTP ${resp.status}`);
    const manifest = await resp.json();
    state.manifest = manifest;
    return manifest;
}

export function getBasePath() {
    if (!state.manifest?.base_path || !state.currentDate) return '';
    const dateCompact = state.currentDate.replace(/-/g, '');
    return `${state.manifest.base_path}/${state.currentDomain}/${dateCompact}`;
}

export function getDomainRootPath() {
    if (!state.manifest?.base_path) return '';
    return `${state.manifest.base_path}/${state.currentDomain}`;
}

export async function generateGridOverlay(varId) {
    const data = state.gridDataMap[varId];
    if (!data) return;
    try {
        const ramp = getRampForVariable(data.variable ?? varId, state.manifest);
        state.gridUrlMap[varId] = generateGridImageDataURL(data, ramp);

        const isWind = data.grid?.twsKn && data.grid?.twdDeg;
        if (isWind) {
            state.vectorGridUrlMap[varId] = await generateVectorImageDataURL(data, state.vectorMode);
        }

        notifyMapOverlays();
    } catch (e) {
        console.error('Error generating grid overlay:', e);
    }
}

export async function generateAllGridOverlays() {
    for (const varId in state.gridDataMap) {
        await generateGridOverlay(varId);
    }
}

export async function updateDataGrid(varId) {
    if (!varId) varId = state.currentVar;
    const hhmm = getTimeString(state.currentHour);
    const dayPath = getBasePath();
    if (!dayPath) return;

    const url = `${dayPath}/${hhmm}_${varId}.json`;

    if (state.gridLoadingMap[varId] === url) return;
    if (state.gridFailedUrlMap[varId] === url) return;

    const isWind = WIND_SPEED_VAR_IDS.has(varId);
    const currentZoom = state.map ? state.map.getZoom() : 5;
    const cacheKey = state.vectorMode + '_' + currentZoom;

    if (state.gridLoadedUrlMap[varId] === url) {
        if (!isWind || state.gridVectorModeMap[varId] === cacheKey) {
            return;
        }
        state.vectorGridUrlMap[varId] = await generateVectorImageDataURL(
            state.gridDataMap[varId],
            state.vectorMode
        );
        state.gridVectorModeMap[varId] = cacheKey;
        notifyViewRefresh(varId);
        return;
    }

    state.gridLoadingMap[varId] = url;
    state.gridUrlMap[varId] = null;

    try {
        const resp = await fetch(url);
        if (resp.ok) {
            const data = await resp.json();
            state.gridDataMap[varId] = data;
            console.log('Data grid loaded', varId, data.grid.nx, data.grid.ny);

            const ramp = getRampForVariable(data.variable ?? varId, state.manifest);
            state.gridUrlMap[varId] = generateGridImageDataURL(state.gridDataMap[varId], ramp);

            if (isWind && state.gridDataMap[varId].grid.twsKn) {
                state.vectorGridUrlMap[varId] = await generateVectorImageDataURL(
                    state.gridDataMap[varId],
                    state.vectorMode
                );
            }

            if (state.particleEngine && state.vectorMode === 'particles') {
                if (
                    isWind &&
                    state.gridDataMap[state.currentVar] &&
                    state.gridDataMap[state.currentVar].grid.twsKn
                ) {
                    state.particleEngine.setGrid(state.gridDataMap[state.currentVar]);
                }
            }

            state.gridLoadedUrlMap[varId] = url;
            delete state.gridFailedUrlMap[varId];
            if (isWind) state.gridVectorModeMap[varId] = cacheKey;

            notifyViewRefresh(varId);
        } else {
            state.gridDataMap[varId] = null;
            state.gridFailedUrlMap[varId] = url;
        }
    } catch (e) {
        console.error('Error loading data grid', e);
        state.gridDataMap[varId] = null;
    } finally {
        state.gridLoadingMap[varId] = null;
    }
}

/**
 * Orquestador da vista: mapa, capas e carga de grids (sen fetch directo).
 */
import { state } from './store.js';
import { WIND_SPEED_VAR_IDS } from './utils.js';
import { getDomainBounds, updateLeafletOverlay } from './map.js';
import {
    derivePrimaryCurrentVar,
    updateDynamicScale,
    updateRadarScale,
    syncDynamicScaleInteractiveAttrs,
    syncVariableDataLayersOpacity,
    syncParticlesPauseButton,
    updateSoundingImage,
    updateMeteogramImage,
    updateMarkers,
    getVarOpacity
} from './ui.js';
import { updateDataGrid } from './data.js';
import { renderStreamlinesNative } from './vectors.js';
import { syncRadarLayer } from './radar.js';

function scaleElements() {
    return {
        imgScale: document.getElementById('img-scale'),
        dynamicScale: document.getElementById('dynamic-scale')
    };
}

/** Actualización completa: overlays, marcadores, grids e partículas. */
export function refreshView() {
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

    if (state.layers.radar) {
        if (state.particleEngine) {
            state.particlesPaused = true;
            state.particleEngine.stop();
            syncParticlesPauseButton();
        }
        return;
    }

    const varsToLoad = [...state.activeScalarVarIds];
    if (state.manifest?.configuration?.layers) {
        state.manifest.configuration.layers.forEach(l => {
            if (state.layers[l.id]) varsToLoad.push(l.id);
        });
    }

    varsToLoad.forEach(vId => {
        if (vId && vId !== 'none') updateDataGrid(vId);
    });

    if (state.particleEngine) {
        const isWind = WIND_SPEED_VAR_IDS.has(state.currentVar);
        const showParticles = state.vectorMode === 'particles' && isWind;

        if (showParticles && state.gridDataMap[state.currentVar]?.grid?.twsKn) {
            state.particleEngine.setGrid(state.gridDataMap[state.currentVar]);
        } else {
            state.particlesPaused = false;
            state.particleEngine.stop();
            syncParticlesPauseButton();
        }
    }
}

/** Aplica capas Leaflet desde state (sen fetch). */
export function updateMapOverlays() {
    if (!state.map) return;

    const bounds = getDomainBounds();
    const { imgScale, dynamicScale } = scaleElements();

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
        if (imgScale) imgScale.classList.add('hidden');
        if (dynamicScale) {
            dynamicScale.classList.add('hidden');
            syncDynamicScaleInteractiveAttrs();
        }
        syncRadarLayer();
        return;
    }

    if (state.layers.radar) {
        Object.keys(state.scalarOverlayByVarId).forEach(k => {
            if (state.scalarOverlayByVarId[k]) state.map.removeLayer(state.scalarOverlayByVarId[k]);
            delete state.scalarOverlayByVarId[k];
        });
        if (state.vectorOverlay) {
            state.map.removeLayer(state.vectorOverlay);
            state.vectorOverlay = null;
        }
        Object.keys(state.dynamicOverlays).forEach(k => {
            if (state.dynamicOverlays[k]) state.map.removeLayer(state.dynamicOverlays[k]);
            delete state.dynamicOverlays[k];
        });
        if (state.vectorLayerGroup) state.vectorLayerGroup.clearLayers();
        if (imgScale) imgScale.classList.add('hidden');
        if (dynamicScale) {
            dynamicScale.classList.remove('hidden');
            updateRadarScale();
            syncDynamicScaleInteractiveAttrs();
        }
        syncRadarLayer();
        return;
    }

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
            { opacity: getVarOpacity(vid), zIndex: zScalar }
        );
        zScalar += 1;
    });

    const isWind = WIND_SPEED_VAR_IDS.has(state.currentVar);
    const showVector = state.vectorMode !== 'particles' && isWind;
    let vecUrl = '';
    if (showVector) {
        vecUrl = state.vectorGridUrlMap[state.currentVar] || '';
    }

    state.vectorOverlay = updateLeafletOverlay(
        state.vectorOverlay,
        showVector,
        vecUrl,
        bounds,
        { opacity: getVarOpacity(state.currentVar), zIndex: 30 }
    );

    if (!state.vectorLayerGroup) {
        state.vectorLayerGroup = L.layerGroup().addTo(state.map);
    }

    if (showVector) {
        renderStreamlinesNative(state.gridDataMap[state.currentVar]);
    } else {
        state.vectorLayerGroup.clearLayers();
    }

    const dynamicLayers = state.manifest?.configuration?.layers || [];
    dynamicLayers.forEach(layer => {
        let showLayer = state.layers[layer.id];
        if (state.activeScalarVarIds.includes(layer.id)) showLayer = false;

        const layerUrl = state.gridUrlMap[layer.id] || '';
        state.dynamicOverlays[layer.id] = updateLeafletOverlay(
            state.dynamicOverlays[layer.id],
            showLayer,
            layerUrl,
            bounds,
            { opacity: getVarOpacity(layer.id), zIndex: 40 }
        );
    });

    let scaleVar = derivePrimaryCurrentVar();
    dynamicLayers.forEach(layer => {
        if (state.layers[layer.id]) scaleVar = layer.id;
    });

    if (imgScale) imgScale.classList.add('hidden');
    if (scaleVar && scaleVar !== 'none') {
        if (dynamicScale) dynamicScale.classList.remove('hidden');
        updateDynamicScale(scaleVar);
        syncDynamicScaleInteractiveAttrs();
    } else {
        if (dynamicScale) dynamicScale.classList.add('hidden');
        syncDynamicScaleInteractiveAttrs();
    }

    syncVariableDataLayersOpacity();
    syncRadarLayer();
}

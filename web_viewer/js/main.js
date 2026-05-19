// js/main.js
import {
    COLOR_RAMPS,
    getRampColor,
    getRampForVariable,
    formatLastUpdatedForDisplay,
    getTimeString,
    WIND_VAR_IDS,
    CLOUD_VAR_IDS,
    WIND_SPEED_VAR_IDS,
    SIMPLE_SCALAR_IDS,
    SIMPLE_LAYER_IDS,
    LS_UI_MODE_KEY,
    LS_OPACITY_MAP_KEY,
    LS_OPACITY_VARS_KEY,
    VAR_SHORT_LABELS,
    LAYER_SHORT_LABELS,
    LAYER_ICONS,
    VAR_ICONS,
    HIDDEN_UI_VAR_IDS,
    LAYER_ORDER,
    scalarVarCategory,
    isCloudVariable
} from './utils.js';

import { state as centralState, setState, clearGridCache } from './store.js';
import { WindParticles } from './particles.js';
import * as ui from './ui.js';
import * as map from './map.js';

console.log('✅ Módulo utils.js importado correctamente');
console.log('   - COLOR_RAMPS tiene', Object.keys(COLOR_RAMPS).length, 'rampas');

console.log('✅ Módulo store.js importado correctamente');
console.log('✅ Módulo particles.js importado correctamente');
console.log('✅ Módulo ui.js importado correctamente');
console.log('✅ Módulo map.js importado correctamente');

const utilsBundle = {
    COLOR_RAMPS,
    WIND_VAR_IDS,
    CLOUD_VAR_IDS,
    WIND_SPEED_VAR_IDS,
    SIMPLE_SCALAR_IDS,
    SIMPLE_LAYER_IDS,
    LS_UI_MODE_KEY,
    LS_OPACITY_MAP_KEY,
    LS_OPACITY_VARS_KEY,
    VAR_SHORT_LABELS,
    LAYER_SHORT_LABELS,
    LAYER_ICONS,
    VAR_ICONS,
    HIDDEN_UI_VAR_IDS,
    LAYER_ORDER,
    getRampColor,
    getRampForVariable,
    formatLastUpdatedForDisplay,
    getTimeString,
    scalarVarCategory,
    isCloudVariable
};

const particlesModule = { WindParticles };

if (window.__appReady) {
    window.__appReady(centralState, utilsBundle, particlesModule, ui, map);
} else {
    window.__centralState = centralState;
    window.__utilsBundle = utilsBundle;
    window.__particlesModule = particlesModule;
    window.__uiModule = ui;
    window.__mapModule = map;
}

window.__debugStore = centralState;
window.__debugUtils = utilsBundle;
window.__debugParticles = particlesModule;
window.__debugUi = ui;
window.__debugMap = map;
window.__centralState = centralState;
window.__clearGridCache = clearGridCache;
window.__setState = setState;

console.log('✅ Estado central, utils, particles, ui e map dispoñibles para app.js');

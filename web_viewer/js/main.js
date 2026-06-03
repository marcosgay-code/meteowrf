/**
 * Punto de entrada único do visor Meteonube (ES modules).
 */
import { state, clearGridCache, setState } from './store.js';
import { refreshView, updateMapOverlays } from './view.js';
import { initDataLayer } from './data.js';
import { els } from './dom.js';
import { wireApp, bootApp } from './boot.js';
import * as map from './map.js';
import { syncVarButtonsActive, syncTogglesUI, derivePrimaryCurrentVar } from './ui.js';

initDataLayer({ refreshView, updateMapOverlays });
wireApp(map);
bootApp();

/** Depuración opcional na consola do navegador */
if (typeof window !== 'undefined') {
    window.__meteonube = { state, clearGridCache, setState, els, refreshView, updateMapOverlays, syncVarButtonsActive, syncTogglesUI, derivePrimaryCurrentVar };
}

console.log('⛅ Meteonube visor arrancado (main.js)');

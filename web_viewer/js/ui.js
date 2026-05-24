/**
 * ui.js — interfaz (timeline, tooltips, sondeos, toggles, escala).
 * Depende de store.js, utils.js e initUi() (cableado desde boot.js).
 */
import { state, clearGridCache } from './store.js';
import {
  getTimeString,
  getRampForVariable,
  WIND_VAR_IDS,
  CLOUD_VAR_IDS,
  WIND_SPEED_VAR_IDS,
  SIMPLE_SCALAR_IDS,
  SIMPLE_LAYER_IDS,
  VAR_SHORT_LABELS,
  LAYER_SHORT_LABELS,
  LAYER_ICONS,
  LAYER_ORDER,
  LS_OPACITY_MAP_KEY,
  LS_OPACITY_VARS_KEY,
  LS_UI_MODE_KEY,
  VAR_ICONS,
  HIDDEN_UI_VAR_IDS,
  scalarVarCategory,
  isCloudVariable as isCloudVarUtil,
  formatDateSelectorLabel
} from './utils.js';

let deps = {};

export function initUi(appDeps) {
  deps = appDeps || {};
  window.openSounding = openSounding;
}

function isCloudVariable(varId) {
  return isCloudVarUtil(varId, state.manifest);
}

function rampForVar(varId) {
  return getRampForVariable(varId, state.manifest);
}

function updateImage() {
  if (deps.updateImage) deps.updateImage();
}

export function derivePrimaryCurrentVar() {
    const ids = state.activeScalarVarIds;
    const speedWind = ids.find(id => WIND_SPEED_VAR_IDS.has(id));
    if (speedWind) return speedWind;
    const anyWind = ids.find(id => WIND_VAR_IDS.has(id));
    if (anyWind) return anyWind;
    return ids[0] || 'none';
}
function applyDerivedCurrentVar() {
    state.currentVar = derivePrimaryCurrentVar();
    if (deps.els.varSelector) {
        deps.els.varSelector.value = state.currentVar === 'none' ? 'none' : state.currentVar;
    }
}
/** Alternar chip de variable: modo simple = unha sola entre capas (choiva/nube) e escalares */
export function toggleScalarVariable(varId) {
    if (state.uiMode === 'simple') {
        const idx = state.activeScalarVarIds.indexOf(varId);
        if (idx !== -1) {
            state.activeScalarVarIds.splice(idx, 1);
        } else {
            state.activeScalarVarIds = [varId];
            SIMPLE_LAYER_IDS.forEach(lid => {
                state.layers[lid] = false;
            });
        }
        applyDerivedCurrentVar();
        syncVarButtonsActive();
        syncTogglesUI();
        updateModeVisibility();
        updateImage();
        return;
    }
    const idx = state.activeScalarVarIds.indexOf(varId);
    if (idx !== -1) {
        state.activeScalarVarIds.splice(idx, 1);
    } else {
        const cat = scalarVarCategory(varId);
        state.activeScalarVarIds = state.activeScalarVarIds.filter(v => {
            if (cat === 'wind' && WIND_VAR_IDS.has(v)) return false;
            if (cat === 'cloud' && CLOUD_VAR_IDS.has(v)) return false;
            return true;
        });
        state.activeScalarVarIds.push(varId);
        while (state.activeScalarVarIds.length > 2) {
            state.activeScalarVarIds.shift();
        }
    }
    applyDerivedCurrentVar();
    syncVarButtonsActive();
    updateModeVisibility();
    updateImage();
}
export function updateMarkers() {
    // Clear old markers
    state.markers.forEach(m => state.map.removeLayer(m));
    state.markers = [];
    // Hide everything if no domain is active
    if (!state.currentDomain) return;
    const config = state.manifest.configuration;
    // Takeoffs: Always visible if enabled
    // Legacy takeoffs logic removed. Names are now drawn on soundings (blue dots).
    // Soundings (Stations): ALWAYS visible regardless of WHICH domain is active, but NOT if no domain is active
    if (state.layers.soundings) {
        const soundingsMap = config.soundings || {};
        const allSoundings = [];
        Object.keys(soundingsMap).forEach(domKey => {
            soundingsMap[domKey].forEach(s => {
                if (!allSoundings.find(x => x.id === s.id)) {
                    s.domain = domKey;
                    allSoundings.push(s);
                }
            });
        });
        allSoundings.forEach(s => {
            if (s.lat != null && s.lon != null) {
                const isActive = state.currentStation === s.id;
                const fillNormal = state.soundingsMode === 'names_green' ? '#16a34a' : '#2563eb';
                const fillActive = state.soundingsMode === 'names_green' ? '#4ade80' : '#38bdf8';
                const marker = L.circleMarker([s.lat, s.lon], {
                    radius: 5,
                    fillColor: isActive ? fillActive : fillNormal,
                    color: "#fff",
                    weight: 2,
                    opacity: 1,
                    fillOpacity: 1,
                    interactive: false // Usamos el touchMarker para la interacción
                }).addTo(state.map);
                // Marcador invisible para ampliar masivamente la zona táctil (radio 25px)
                const touchMarker = L.circleMarker([s.lat, s.lon], {
                    radius: 25,
                    color: 'transparent',
                    fillColor: 'transparent',
                    interactive: true,
                    bubblingMouseEvents: false // <-- Evita que el clic pase al mapa de fondo
                }).addTo(state.map);
                if (state.layers.takeoffs_names) {
                    marker.bindTooltip(s.name, { 
                        permanent: true, 
                        direction: 'top', 
                        className: 'label-takeoff' 
                    });
                }
                touchMarker.on('click', (e) => {
                    deps.els.windTooltip.classList.add('hidden');
                    if (e.originalEvent) e.originalEvent.stopPropagation();
                    marker.openPopup();
                });
                const activeVarId = getActiveScalarVarId();
                const pointData = getPointData([s.lat, s.lon], activeVarId);
                let dataHtml = '';
                if (pointData) {
                    dataHtml = `
                        <div class="popup-data">
                            <strong>${pointData.title}:</strong> ${pointData.value.toFixed(1)} ${pointData.units}
                            ${pointData.dir !== null ? `<span class="popup-dir" style="display:inline-block; transform:rotate(${pointData.dir + 180}deg)">↑</span>` : ''}
                        </div>
                    `;
                }
                const popupContent = `
                    <div class="sounding-popup">
                        <strong>${s.name}</strong>
                        ${dataHtml}
                        <button type="button" class="popup-btn">ver gráficas</button>
                    </div>
                `;
                marker.bindPopup(popupContent, {
                    className: 'custom-sounding-popup',
                    offset: [0, 0]
                });
                marker.on('popupopen', () => {
                    deps.els.windTooltip.classList.add('hidden');
                    const btn = marker.getPopup()?.getElement()?.querySelector('.popup-btn');
                    if (btn) {
                        btn.onclick = (ev) => {
                            ev.preventDefault();
                            openSounding(s.id);
                        };
                    }
                });
                marker.on('popupclose', () => {
                    deps.els.windTooltip.classList.add('hidden');
                });
                state.markers.push(marker);
                state.markers.push(touchMarker);
            }
        });
    }
}
// Global function to open the sounding modal from the popup button
export function openSounding(stationId) {
    // Set state immediately to block tooltips
    document.documentElement.classList.add('has-modal');
    document.body.classList.add('has-modal');
    // Close any open popups (the marker's bubble)
    if (state.map) state.map.closePopup();
    // Clear any pinned tooltip marker
    if (state.clickMarker) {
        state.map.removeLayer(state.clickMarker);
        state.clickMarker = null;
    }
    state.isTooltipPinned = false;
    // Hide the wind tooltip
    deps.els.windTooltip.classList.add('hidden');
    state.currentStation = stationId;
    updateUIForType();
    updateImage();
    updateMarkers();
    if (state.currentStation) {
        deps.els.overlayContainer.classList.remove('hidden');
        if (deps.els.overlayContainer.querySelector('.modal-content')) {
            deps.els.overlayContainer.querySelector('.modal-content').scrollTop = 0;
        }
    }
}
export function applySoundingsModeFromCycle() {
    if (state.soundingsMode === 'dots_blue') {
        state.layers.soundings = true;
        state.layers.takeoffs_names = false;
    } else if (state.soundingsMode === 'names_green') {
        state.layers.soundings = true;
        state.layers.takeoffs_names = true;
    } else {
        state.soundingsMode = 'hidden';
        state.layers.soundings = false;
        state.layers.takeoffs_names = false;
    }
}
export function syncSoundingsCycleUI() {
    const btn = document.getElementById('btn-sounding-cycle');
    if (!btn) return;
    btn.classList.remove('sounding-cycle-btn--blue', 'sounding-cycle-btn--green', 'sounding-cycle-btn--off');
    if (state.soundingsMode === 'dots_blue') {
        btn.classList.add('sounding-cycle-btn--blue');
        btn.setAttribute('aria-label', 'Sondeos: puntos azuis. Pulsa para etiquetas en verde.');
        btn.title = 'Sondeos: puntos azuis';
    } else if (state.soundingsMode === 'names_green') {
        btn.classList.add('sounding-cycle-btn--green');
        btn.setAttribute('aria-label', 'Sondeos con etiquetas (verde). Pulsa para desactivar.');
        btn.title = 'Sondeos con etiquetas';
    } else {
        btn.classList.add('sounding-cycle-btn--off');
        btn.setAttribute('aria-label', 'Sondeos desactivados. Pulsa para puntos azuis.');
        btn.title = 'Sondeos apagados';
    }
}
export function cycleSoundingsMode() {
    const order = ['dots_blue', 'names_green', 'hidden'];
    const i = Math.max(0, order.indexOf(state.soundingsMode));
    state.soundingsMode = order[(i + 1) % order.length];
    applySoundingsModeFromCycle();
    syncSoundingsCycleUI();
    updateMarkers();
    updateImage();
}
export function applyScaleChromeVisibility() {
    document.body.classList.toggle('scale-gradient-hide-details', !state.scaleChromeExpanded);
    if (deps.els.dynamicScale) {
        deps.els.dynamicScale.setAttribute('aria-expanded', state.scaleChromeExpanded ? 'true' : 'false');
    }
    if (state.map) requestAnimationFrame(() => state.map.invalidateSize());
}
export function syncDynamicScaleInteractiveAttrs() {
    if (!deps.els.dynamicScale) return;
    const visible = !deps.els.dynamicScale.classList.contains('hidden');
    deps.els.dynamicScale.tabIndex = visible ? 0 : -1;
    deps.els.dynamicScale.setAttribute('aria-hidden', visible ? 'false' : 'true');
}
/** Un clic no gradiente alterna etiquetas numéricas, fila “Actualizado”/escala km, etiqueta da variable no mapa; en móbil tamén o panel de chips por riba da data/hora. */
export function setupScaleGradientToggle() {
    if (!deps.els.dynamicScale || deps.els.dynamicScale.dataset.gradientToggleBound === '1') return;
    deps.els.dynamicScale.dataset.gradientToggleBound = '1';
    deps.els.dynamicScale.addEventListener('click', (e) => {
        e.stopPropagation();
        state.scaleChromeExpanded = !state.scaleChromeExpanded;
        applyScaleChromeVisibility();
    });
    deps.els.dynamicScale.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        state.scaleChromeExpanded = !state.scaleChromeExpanded;
        applyScaleChromeVisibility();
    });
    applyScaleChromeVisibility();
    syncDynamicScaleInteractiveAttrs();
}
export function updateModeVisibility() {
    if (!state.map) return;
    const isWind = WIND_SPEED_VAR_IDS.has(state.currentVar);
    if (state.particlesControlContainer) {
        state.particlesControlContainer.style.display = isWind ? 'block' : 'none';
        syncParticlesPauseButton();
    }
}
/** Reanuda animación de partículas (data/hora/zoom ou botón). */
export function resumeParticlesAfterContextChange() {
    if (!state.particlesPaused) {
        syncParticlesPauseButton();
        return;
    }
    state.particlesPaused = false;
    syncParticlesPauseButton();
    const isWind = WIND_SPEED_VAR_IDS.has(state.currentVar);
    const showParticles = (state.vectorMode === 'particles' && isWind);
    if (state.particleEngine && showParticles && state.gridDataMap[state.currentVar] &&
        state.gridDataMap[state.currentVar].grid && state.gridDataMap[state.currentVar].grid.twsKn) {
        state.particleEngine.unfreezeAnimation();
    }
}
export function syncParticlesPauseButton() {
    const btn = state.particlesControlButton;
    if (!btn) return;
    const isWind = WIND_SPEED_VAR_IDS.has(state.currentVar);
    if (!isWind || state.vectorMode !== 'particles') {
        btn.title = 'Pausar animación do vento (partículas)';
        btn.innerHTML = '⏸️';
        btn.style.backgroundColor = '#ffffff';
        return;
    }
    if (state.particlesPaused) {
        btn.title = 'Reanudar animación do vento';
        btn.innerHTML = '▶️';
        btn.style.backgroundColor = '#cce8ff';
    } else {
        btn.title = 'Pausar animación do vento (partículas)';
        btn.innerHTML = '⏸️';
        btn.style.backgroundColor = '#ffffff';
    }
}
/**
 * Sync Toggle Buttons Visual State with Internal State
 */
export function syncTogglesUI() {
    document.querySelectorAll('#weather-layers .btn-toggle').forEach(btn => {
        const id = btn.dataset.layerId;
        btn.classList.toggle('active', !!(id && state.layers[id]));
    });
    updateCurrentVarLabel();
}
export function setWeatherLayer(selectedId) {
    if (!selectedId) return;
    state.layers[selectedId] = !state.layers[selectedId];
    if (state.uiMode === 'simple' && SIMPLE_LAYER_IDS.includes(selectedId)) {
        if (state.layers[selectedId]) {
            state.activeScalarVarIds = [];
            SIMPLE_LAYER_IDS.forEach(lid => {
                if (lid !== selectedId) state.layers[lid] = false;
            });
        }
        applyDerivedCurrentVar();
        syncVarButtonsActive();
        syncTogglesUI();
        updateModeVisibility();
        updateImage();
        return;
    }
    // Mutual exclusivity for cloud layers
    if (state.layers[selectedId] && isCloudVariable(selectedId)) {
        for (const layerId in state.layers) {
            if (layerId !== selectedId && isCloudVariable(layerId)) {
                state.layers[layerId] = false;
            }
        }
    }
    syncTogglesUI();
    updateImage();
}
export function updateAvailableHours() {
    const date = state.currentDate;
    // Get hours from manifest or default 0..23
    let hours = [];
    if (state.manifest.hours && state.manifest.hours[date]) {
        hours = state.manifest.hours[date];
    }
    // Fallback if empty (e.g. data missing but folder exists?) or manifest older
    if (!hours || hours.length === 0) {
        hours = Array.from({ length: 24 }, (_, i) => i);
    }
    state.availableHours = hours;
    // Default to the first element if no other logic matches
    let newIndex = 0;
    // Reset or clamp index
    const prevHour = state.currentHour;
    // Si la fecha seleccionada es hoy, intentar usar la hora actual + offset utc, o la más cercana anterior
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const todayStr = `${yyyy}-${mm}-${dd}`;
    // Si estamos inicializando en el día de hoy o cambiamos al día de hoy, y venimos de prevHour == 0 o primera carga
    if (state.currentDate === todayStr && prevHour === 0) {
        const utcCurrentHour = today.getUTCHours();
        // Buscar la hora más cercana disponible menor o igual a la actual
        // hours[] suele contener timestamps enteros (ej: 0, 1, 2, ..., 23) interpolados
        for (let i = hours.length - 1; i >= 0; i--) {
            if (hours[i] <= utcCurrentHour) {
                newIndex = i;
                break;
            }
        }
    } else {
        // Lógica original: intentar recuperar la hora previa si cambiamos de día
        const foundIndex = hours.indexOf(prevHour);
        if (foundIndex !== -1) {
            newIndex = foundIndex;
        }
    }
    state.currentHourIndex = newIndex;
    state.currentHour = hours[newIndex];
    // Update Slider
    // deps.els.timeSlider.max = hours.length - 1;
    // deps.els.timeSlider.value = newIndex;
    // Update Min/Max Labels
    // document.getElementById('time-min').textContent = getTimeString(hours[0]).substring(0, 2) + ":00" || "00:00";
    // document.getElementById('time-max').textContent = getTimeString(hours[hours.length - 1]).substring(0, 2) + ":00" || "23:00";
    deps.els.timeSelector.innerHTML = '';
    hours.forEach(h => {
        const opt = document.createElement('option');
        opt.value = h;
        const utcHour = getTimeString(h).substring(0, 2);
        const dateStr = state.currentDate;
        const isoStr = `${dateStr}T${utcHour}:00:00Z`;
        const d = new Date(isoStr);
        const localHour = String(d.getHours()).padStart(2, '0');
        opt.textContent = `${localHour}:00`;
        deps.els.timeSelector.appendChild(opt);
    });
    if (hours.length <= 1) {
        document.getElementById('prev-time-btn').classList.add('hidden');
        document.getElementById('next-time-btn').classList.add('hidden');
    } else {
        document.getElementById('prev-time-btn').classList.remove('hidden');
        document.getElementById('next-time-btn').classList.remove('hidden');
    }
    updateTimeSelectorUI();
}
export function syncVarButtonsActive() {
    document.querySelectorAll('#vars-wind .btn-toggle, #vars-other .btn-toggle, #vars-clouds .btn-toggle').forEach(btn => {
        btn.classList.toggle('active', state.activeScalarVarIds.includes(btn.dataset.varId));
    });
    updateCurrentVarLabel();
}
export function updateCurrentVarLabel() {
    const labelEl = document.getElementById('current-var-label');
    if (!labelEl) return;
    const parts = [];
    const cfg = state.manifest && state.manifest.configuration;
    if (cfg && cfg.variables) {
        state.activeScalarVarIds.forEach(id => {
            const v = cfg.variables.find(x => x.id === id);
            if (v) {
                const units = v.units ? ` (${v.units})` : '';
                parts.push((v.title || id) + units);
            }
        });
    }
    if (cfg && cfg.layers) {
        cfg.layers.forEach(layer => {
            if (state.layers[layer.id]) {
                const units = layer.units ? ` (${layer.units})` : '';
                parts.push((layer.title || layer.id) + units);
            }
        });
    }
    if (parts.length === 0) {
        labelEl.classList.add('hidden');
        labelEl.textContent = '';
    } else {
        labelEl.textContent = parts.join(' · ');
        labelEl.classList.remove('hidden');
    }
}
function getPointData(latlng, varId) {
    if (!latlng || !varId) return null;
    const gridData = state.gridDataMap[varId];
    if (!gridData || !gridData.grid) return null;
    const bounds = getDomainBounds();
    if (!bounds) return null;
    const g = gridData.grid;
    const b = bounds.toBBoxString().split(',').map(Number);
    const left = b[0], bottom = b[1], right = b[2], top = b[3];
    // Normalize coordinates (handle [lat, lon] array or {lat, lng} object)
    let lat, lng;
    if (Array.isArray(latlng)) {
        lat = latlng[0];
        lng = latlng[1];
    } else {
        lat = latlng.lat;
        lng = latlng.lng;
    }
    const col = Math.floor((lng - left) / (right - left) * g.nx);
    const row = Math.floor((lat - bottom) / (top - bottom) * g.ny);
    if (col >= 0 && col < g.nx && row >= 0 && row < g.ny) {
        const idx = row * g.nx + col;
        let value = null;
        let dir = null;
        if (g.twsKn) {
            value = g.twsKn[idx];
            dir = g.twdDeg[idx];
        } else if (g.values) {
            value = g.values[idx];
        }
        if (value !== null && value !== undefined) {
            const vConfig = state.manifest.configuration.variables.find(v => v.id === varId) ||
                state.manifest.configuration.layers.find(v => v.id === varId);
            const varTitle = vConfig ? vConfig.title : varId;
            const units = gridData.units || '';
            return { value, units, dir, title: varTitle };
        }
    }
    return null;
}
function isMapPopupOpen() {
    return !!(state.map && state.map._popup && state.map._popup.isOpen());
}

export function updateTooltip(latlng, stationName = null) {
    // No tapar popups de sondeos ni o modais
    if (document.body.classList.contains('has-modal') || isMapPopupOpen()) {
        deps.els.windTooltip.classList.add('hidden');
        return;
    }
    if (!latlng) {
        deps.els.windTooltip.classList.add('hidden');
        return;
    }
    // Handle station name
    if (deps.els.wtStationName) {
        if (stationName) {
            deps.els.wtStationName.textContent = stationName;
            deps.els.wtStationName.classList.remove('hidden');
        } else {
            deps.els.wtStationName.classList.add('hidden');
        }
    }
    const activeVarId = getActiveScalarVarId();
    const data = getPointData(latlng, activeVarId);
    if (data) {
        if (deps.els.wtVarName) deps.els.wtVarName.textContent = data.title;
        if (deps.els.wtValue) deps.els.wtValue.textContent = data.value.toFixed(1);
        if (deps.els.wtUnits) deps.els.wtUnits.textContent = data.units;
        // Direction handling
        if (data.dir !== null && data.dir !== undefined) {
            if (deps.els.wtDirDeg) {
                deps.els.wtDirDeg.textContent = Math.round(data.dir);
                deps.els.wtDirDeg.parentElement.classList.remove('hidden');
            }
            if (deps.els.wtDirArrow) deps.els.wtDirArrow.style.transform = `rotate(${(data.dir + 180) % 360}deg)`;
        } else {
            if (deps.els.wtDirDeg) deps.els.wtDirDeg.parentElement.classList.add('hidden');
        }
        // Tooltip position
        const containerPoint = state.map.latLngToContainerPoint(latlng);
        deps.els.windTooltip.style.left = `${containerPoint.x}px`;
        deps.els.windTooltip.style.top = `${containerPoint.y}px`;
        deps.els.windTooltip.classList.remove('hidden');
        return;
    }
    deps.els.windTooltip.classList.add('hidden');
}
/** Aplica state.variableLayerOpacity a imageOverlays, liñas de vento e canvas de partículas */
export function syncVariableDataLayersOpacity() {
    if (!state.map) return;
    const o = state.variableLayerOpacity;
    Object.keys(state.scalarOverlayByVarId).forEach(vid => {
        const lyr = state.scalarOverlayByVarId[vid];
        if (lyr && lyr.setOpacity) lyr.setOpacity(o);
    });
    if (state.vectorOverlay && state.vectorOverlay.setOpacity) {
        state.vectorOverlay.setOpacity(o);
    }
    Object.keys(state.dynamicOverlays).forEach(k => {
        const lyr = state.dynamicOverlays[k];
        if (lyr && lyr.setOpacity) lyr.setOpacity(o);
    });
    if (state.vectorLayerGroup) {
        state.vectorLayerGroup.eachLayer(lyr => {
            if (lyr && lyr.setStyle) {
                lyr.setStyle({ opacity: o, fillOpacity: o });
            }
        });
    }
    const windCanvas = document.getElementById('wind-particles');
    if (windCanvas) windCanvas.style.opacity = String(o);
}
function getActiveScalarVarId() {
    let activeVar = derivePrimaryCurrentVar();
    if (state.manifest && state.manifest.configuration.layers) {
        state.manifest.configuration.layers.forEach(l => {
            if (state.layers[l.id]) activeVar = l.id;
        });
    }
    return activeVar;
}
function getDomainBounds() {
    if (!state.manifest || !state.manifest.configuration || !state.manifest.configuration.domain_bounds) return null;
    const db = state.manifest.configuration.domain_bounds;
    const b = db[state.currentDomain];
    if (!b) {
        // Fallback to first domain if not found
        const first = Object.keys(db)[0];
        const fb = db[first];
        if (!fb) return null;
        return L.latLngBounds([fb.bottom, fb.left], [fb.top, fb.right]);
    }
    return L.latLngBounds([b.bottom, b.left], [b.top, b.right]);
}
export function updateSoundingImage() {
    if (!state.currentStation) return;
    const s = findStationInConfig(state.currentStation);
    const domain = s ? s.domain : 'd01';
    const dateCompact = state.currentDate.replace(/-/g, '');
    const hhmm = getTimeString(state.currentHour);
    const base = state.manifest.base_path;
    const dayPath = `${base}/${domain}/${dateCompact}`;
    const fname = `${hhmm}_sounding_${state.currentStation}.webp`;
    loadImage(deps.els.imgSounding, `${dayPath}/${fname}`);
}
export function updateMeteogramImage() {
    if (!state.currentStation) return;
    const s = findStationInConfig(state.currentStation);
    const domain = s ? s.domain : 'd01';
    const dateCompact = state.currentDate.replace(/-/g, '');
    const base = state.manifest.base_path;
    const dayPath = `${base}/${domain}/${dateCompact}`;
    const fname = `meteogram_${state.currentStation}.webp`;
    loadImage(deps.els.imgMeteogram, `${dayPath}/${fname}`);
}
function findStationInConfig(id) {
    if (!state.manifest || !state.manifest.configuration.soundings) return null;
    const map = state.manifest.configuration.soundings;
    let found = null;
    Object.keys(map).forEach(dom => {
        const s = map[dom].find(x => x.id === id);
        if (s) {
            s.domain = dom; // Should be tagged already if from updateMarkers, but safe
            found = s;
        }
    });
    return found;
}
export function loadImage(imgEl, src) {
    // Simple load with error hiding
    const img = new Image();
    img.onload = () => {
        imgEl.src = src;
        imgEl.classList.remove('hidden');
    };
    img.onerror = () => {
        console.error("Failed to load image:", src);
        imgEl.classList.add('hidden'); // Hide if missing
    };
    img.src = src;
}
function updateTimeSelectorUI() {
    if (deps.els.timeSelector && state.currentHour !== null) {
        deps.els.timeSelector.value = state.currentHour;
    }
}
export function stepDay(dir) {
    resumeParticlesAfterContextChange();
    const dates = Array.from(deps.els.dateSelector.options).map(o => o.value);
    const currentDateIdx = dates.indexOf(state.currentDate);
    
    if (currentDateIdx === -1) return;
    
    const currentDt = new Date(state.currentDate);
    const nextDt = new Date(currentDt);
    if (dir > 0) {
        nextDt.setDate(currentDt.getDate() + 1); // Día Siguiente
    } else {
        nextDt.setDate(currentDt.getDate() - 1); // Día Anterior
    }
    const yyyy = nextDt.getFullYear();
    const mm = String(nextDt.getMonth() + 1).padStart(2, '0');
    const dd = String(nextDt.getDate()).padStart(2, '0');
    const nextDateStr = `${yyyy}-${mm}-${dd}`;
    if (dates.includes(nextDateStr)) {
        state.currentDate = nextDateStr;
        deps.els.dateSelector.value = nextDateStr;
        updateAvailableHours();
        updateImage();
    }
}
export function stepTime(dir) {
    resumeParticlesAfterContextChange();
    let newIdx = state.currentHourIndex + dir;
    const max = state.availableHours.length;
    // Check if we need to change day
    if (newIdx >= max || newIdx < 0) {
        // Find current date index
        const dates = Array.from(deps.els.dateSelector.options).map(o => o.value);
        const currentDateIdx = dates.indexOf(state.currentDate);
        // Determine next date index
        // dates are usually sorted Descending (Latest -> Archive)? 
        // populateDates sorts: Latest + Archive.
        // scan_availability sorts: Latest (Desc?), Archive (Desc?).
        // If dates are [2026-02-18, 2026-02-17], then index 0 is tomorrow, index 1 is today.
        // We need to check the actual date values to be sure or rely on the list order.
        // Let's assume the list is [Future...Today...Past].
        // Next Day (Time forward) -> value > current or index - 1?
        // Wait, "Next Day" means Time + 24h.
        // If list is sorted Descending (Newest first):
        //   Forward in time -> Move to a date that is "newer" than current? No.
        //   Forward in time -> Move to Next Calendar Day.
        // Let's do robust date math.
        const currentDt = new Date(state.currentDate);
        const nextDt = new Date(currentDt);
        if (dir > 0) {
            // Forward -> Next Day
            nextDt.setDate(currentDt.getDate() + 1);
        } else {
            // Backward -> Prev Day
            nextDt.setDate(currentDt.getDate() - 1);
        }
        const yyyy = nextDt.getFullYear();
        const mm = String(nextDt.getMonth() + 1).padStart(2, '0');
        const dd = String(nextDt.getDate()).padStart(2, '0');
        const nextDateStr = `${yyyy}-${mm}-${dd}`;
        if (dates.includes(nextDateStr)) {
            // Switch Date
            state.currentDate = nextDateStr;
            deps.els.dateSelector.value = nextDateStr;
            updateAvailableHours();
            // Set hour
            if (dir > 0) {
                // Moving Forward: Came from end of prev day -> Start of new day
                state.currentHourIndex = 0;
            } else {
                // Moving Backward: Came from start of next day -> End of prev day
                state.currentHourIndex = state.availableHours.length - 1;
            }
            state.currentHour = state.availableHours[state.currentHourIndex];
        } else {
            // No next/prev day available -> Loop within current day
            if (newIdx >= max) newIdx = 0;
            if (newIdx < 0) newIdx = max - 1;
            state.currentHourIndex = newIdx;
            state.currentHour = state.availableHours[newIdx];
        }
    } else {
        state.currentHourIndex = newIdx;
        state.currentHour = state.availableHours[newIdx];
    }

    updateTimeSelectorUI();
    updateImage();
}

let gradientScaleLabelsLayoutRaf = null;

function layoutGradientScaleLabels() {
    if (!deps.els.dynamicScale || deps.els.dynamicScale.classList.contains('hidden')) return;
    const overlay = deps.els.dynamicScale.querySelector('.scale-labels-overlay');
    if (!overlay) return;
    const spans = [...overlay.querySelectorAll('span')];
    if (spans.length <= 1) return;
    for (const el of spans) el.classList.remove('scale-label--row-top');
    void overlay.offsetWidth;
    const cRect = overlay.getBoundingClientRect();
    if (cRect.width < 1) return;
    const items = spans.map(el => {
        const r = el.getBoundingClientRect();
        return { el, left: r.left - cRect.left, right: r.right - cRect.left };
    }).sort((a, b) => a.left - b.left);
    const GAP = 2;
    let rowBottomRight = -Infinity;
    let rowTopRight = -Infinity;
    for (const { el, left, right } of items) {
        const fitsBottom = left >= rowBottomRight + GAP;
        const fitsTop = left >= rowTopRight + GAP;
        if (fitsBottom) {
            rowBottomRight = Math.max(rowBottomRight, right);
        } else if (fitsTop) {
            el.classList.add('scale-label--row-top');
            rowTopRight = Math.max(rowTopRight, right);
        } else {
            const overlapB = Math.max(0, rowBottomRight + GAP - left);
            const overlapT = Math.max(0, rowTopRight + GAP - left);
            if (overlapT <= overlapB) {
                el.classList.add('scale-label--row-top');
                rowTopRight = Math.max(rowTopRight, right);
            } else {
                rowBottomRight = Math.max(rowBottomRight, right);
            }
        }
    }
}
export function scheduleGradientScaleLabelsLayout() {
    if (!deps.els.dynamicScale) return;
    if (gradientScaleLabelsLayoutRaf != null) cancelAnimationFrame(gradientScaleLabelsLayoutRaf);
    gradientScaleLabelsLayoutRaf = requestAnimationFrame(() => {
        gradientScaleLabelsLayoutRaf = null;
        layoutGradientScaleLabels();
    });
}
/**
 * Update Dynamic Scale UI
 */
export function updateDynamicScale(varId) {
    const ramp = rampForVar(varId);
    if (!ramp || !deps.els.dynamicScale) return;
    const lastStop = ramp[ramp.length - 1];
    const maxVal = lastStop.v;
    const minVal = ramp[0].v;
    const gradientStops = ramp.map((stop, i) => {
        const pct = ((stop.v - minVal) / (maxVal - minVal) * 100).toFixed(0);
        const r = stop.c[0];
        const g = stop.c[1];
        const b = stop.c[2];
        const a = stop.c.length > 3 ? stop.c[3] : 1.0;
        return `rgb(${r}, ${g}, ${b}) ${pct}%`;
    }).join(', ');
    deps.els.dynamicScale.innerHTML = `
        <div class="scale-body scale-body--full">
            <div class="scale-gradient-container">
                <div class="scale-gradient" style="background: linear-gradient(to right, ${gradientStops});">
                    <div class="scale-labels-overlay">
                        ${ramp.map(step => {
        const pos = ((step.v - minVal) / (maxVal - minVal) * 100).toFixed(1);
        return `<span style="left: ${pos}%;">${Math.round(step.v)}</span>`;
    }).join('')}
                    </div>
                </div>
            </div>
        </div>
    `;
    scheduleGradientScaleLabelsLayout();
}
// ============================================
// UI RESTANTE (Paso 8b)
// ============================================

export function setupControls() {
    // Set initial domain based on view bounds if map exists, else d01
    const initialDomain = state.map ? deps.getDomainForView() : 'd01';
    state.currentDomain = initialDomain;


    // Dates
    populateDates();

    // Variables (Initial)
    populateVars();

    // Listeners
    deps.els.dateSelector.onchange = (e) => {
        resumeParticlesAfterContextChange();
        state.currentDate = e.target.value;
        clearGridCache();
        updateAvailableHours();
        updateImage();
    };

    deps.els.timeSelector.onchange = (e) => {
        resumeParticlesAfterContextChange();
        const selectedHour = parseInt(e.target.value, 10);
        const index = state.availableHours.indexOf(selectedHour);
        if (index !== -1) {
            state.currentHourIndex = index;
            state.currentHour = selectedHour;
            updateImage();
        }
    };

    /*
    deps.els.viewTypeSelector.onchange = (e) => {
        state.viewType = e.target.value;
        updateUIForType();
        updateImage();
    };
    */

    deps.els.varSelector.onchange = (e) => {
        const v = e.target.value;
        if (v === 'none') state.activeScalarVarIds = [];
        else state.activeScalarVarIds = [v];
        applyDerivedCurrentVar();
        syncVarButtonsActive();
        updateModeVisibility();
        updateImage();
    };

    if (deps.els.opacitySlider) {
        const savedOpacity = localStorage.getItem(LS_OPACITY_MAP_KEY);
        if (savedOpacity !== null) {
            deps.els.opacitySlider.value = savedOpacity;
            state.overlayOpacity = savedOpacity / 100;
            if (state.baseLayer) {
                state.baseLayer.setOpacity(state.overlayOpacity);
            }
        }
        deps.els.opacitySlider.oninput = (e) => {
            state.overlayOpacity = e.target.value / 100;
            localStorage.setItem(LS_OPACITY_MAP_KEY, e.target.value);
            if (state.baseLayer) {
                state.baseLayer.setOpacity(state.overlayOpacity);
            }
        };
    }

    if (deps.els.variableOpacitySlider) {
        const savedVarOp = localStorage.getItem(LS_OPACITY_VARS_KEY);
        if (savedVarOp !== null) {
            const v = Math.max(10, Math.min(100, parseInt(savedVarOp, 10) || 100));
            deps.els.variableOpacitySlider.value = String(v);
            state.variableLayerOpacity = v / 100;
        }
        deps.els.variableOpacitySlider.oninput = (e) => {
            const v = Math.max(10, Math.min(100, parseInt(e.target.value, 10) || 100));
            state.variableLayerOpacity = v / 100;
            localStorage.setItem(LS_OPACITY_VARS_KEY, String(v));
            syncVariableDataLayersOpacity();
        };
    }

    const opacityToggleBtn = document.getElementById('btn-opacity-toggle');
    const opacityContainer = document.getElementById('opacity-container');
    if (opacityToggleBtn && opacityContainer) {
        opacityToggleBtn.addEventListener('click', () => {
            const isOpen = opacityContainer.classList.toggle('show');
            opacityToggleBtn.classList.toggle('active', isOpen);
        });
    }

    const opacityModeSimple = document.getElementById('opacity-mode-simple');
    const opacityModeFlight = document.getElementById('opacity-mode-flight');
    if (opacityModeSimple) {
        opacityModeSimple.addEventListener('click', () => switchUiMode('simple'));
    }
    if (opacityModeFlight) {
        opacityModeFlight.addEventListener('click', () => switchUiMode('flight'));
    }
    syncOpacityModeButtons();
    if (deps.els.closeModalBtn) {
        deps.els.closeModalBtn.addEventListener('click', () => {
            deps.els.overlayContainer.classList.add('hidden');
            document.documentElement.classList.remove('has-modal');
            document.body.classList.remove('has-modal');
            state.currentStation = '';
            deps.els.imgSounding.classList.remove('expanded');
            deps.els.imgMeteogram.classList.remove('expanded');
            updateUIForType();
            updateMarkers(); // Un-highlight active marker
        });
    }

    // Image Fullscreen and Swipe/Drag to change time
    [deps.els.imgSounding, deps.els.imgMeteogram].forEach(img => {
        if (!img) return;

        let startX = 0;
        let isDragging = false;
        const threshold = 50;

        const onStart = (clientX) => {
            startX = clientX;
            isDragging = true;
        };

        const onEnd = (clientX) => {
            if (!isDragging) return;
            isDragging = false;

            // Prevent swipe actions if the image is expanded
            if (img.classList.contains('expanded')) return;

            const diff = startX - clientX;
            if (Math.abs(diff) > threshold) {
                if (diff > 0) stepTime(1);
                else stepTime(-1);
            }
        };

        img.addEventListener('touchstart', e => onStart(e.changedTouches[0].clientX), { passive: true });
        img.addEventListener('touchend', e => onEnd(e.changedTouches[0].clientX));

        img.addEventListener('mousedown', e => {
            onStart(e.clientX);
            e.preventDefault(); // Prevents native HTML image drag
        });
        img.addEventListener('mouseup', e => onEnd(e.clientX));
        img.addEventListener('mouseleave', e => {
            if (isDragging) onEnd(e.clientX);
        });

        img.addEventListener('click', function (e) {
            const diff = startX - e.clientX;
            // Only toggle expanded if it was a click, not a significant drag
            if (Math.abs(diff) <= threshold) {
                this.classList.toggle('expanded');
            }
        });
    });

    // Toggles (Static)
    // Dynamic Layers from Manifest
    const overlaysGroup = document.getElementById('overlays-group');
    // Clear dynamic toggles but keep static ones if they exist? 
    // Actually the user said "treat in id='overlays-group'".
    // Let's assume we append or clear. Existing static layers are: roads, cities, peaks, takeoffs.
    // They are hardcoded in HTML.

    const sortedLayers = [...state.manifest.configuration.layers].sort((a, b) => {
        const ai = LAYER_ORDER.indexOf(a.id);
        const bi = LAYER_ORDER.indexOf(b.id);
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });
    rebuildWeatherLayerButtons(sortedLayers);

    // Sondeos: ciclo 🪂 na liña da data (esquerda do día)
    const btnSoundingCycle = document.getElementById('btn-sounding-cycle');
    if (btnSoundingCycle) {
        btnSoundingCycle.addEventListener('click', () => cycleSoundingsMode());
    }
    applySoundingsModeFromCycle();
    syncSoundingsCycleUI();

    const toggleBoundaries = document.getElementById('toggle-boundaries');
    if (toggleBoundaries) {
        toggleBoundaries.checked = state.layers.boundaries || false;
        toggleBoundaries.onchange = (e) => {
            state.layers.boundaries = e.target.checked;
            if (state.layers.boundaries) {
                if (state.boundariesLayer && !state.map.hasLayer(state.boundariesLayer)) {
                    state.boundariesLayer.addTo(state.map);
                }
            } else {
                if (state.boundariesLayer && state.map.hasLayer(state.boundariesLayer)) {
                    state.map.removeLayer(state.boundariesLayer);
                }
            }
        };
    }

    const toggleProvinces = document.getElementById('toggle-provinces');
    if (toggleProvinces) {
        toggleProvinces.checked = state.layers.provinces || false;
        toggleProvinces.onchange = (e) => {
            state.layers.provinces = e.target.checked;
            if (state.layers.provinces) {
                if (state.provincesLayer && !state.map.hasLayer(state.provincesLayer)) {
                    state.provincesLayer.addTo(state.map);
                }
            } else {
                if (state.provincesLayer && state.map.hasLayer(state.provincesLayer)) {
                    state.map.removeLayer(state.provincesLayer);
                }
            }
        };
    }


    state.vectorMode = 'particles';
    syncTogglesUI();
    updateModeVisibility();

    // Playback
    const prevDayBtn = document.getElementById('prev-day-btn');
    const nextDayBtn = document.getElementById('next-day-btn');
    const prevTimeBtn = document.getElementById('prev-time-btn');
    const nextTimeBtn = document.getElementById('next-time-btn');

    if (prevDayBtn) prevDayBtn.onclick = () => stepDay(-1);
    if (nextDayBtn) nextDayBtn.onclick = () => stepDay(1);
    if (prevTimeBtn) prevTimeBtn.onclick = () => stepTime(-1);
    if (nextTimeBtn) nextTimeBtn.onclick = () => stepTime(1);

    // Keyboard
    document.addEventListener('keydown', (e) => {
        // if (state.viewType === 'meteogram') return; // Removed restriction
        if (e.key === 'ArrowRight') stepTime(1);
        if (e.key === 'ArrowLeft') stepTime(-1);
    });

    // Responsive Menu
    const menuToggle = document.getElementById('menu-toggle');
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebar-overlay');

    if (menuToggle && sidebar) {
        menuToggle.onclick = () => {
            sidebar.classList.toggle('open');
        };
    }

    if (overlay && sidebar) {
        overlay.onclick = () => {
            sidebar.classList.remove('open');
        };
    }

    if (deps.els.overlayContainer) {
        // No longer using click-to-close for inline display
    }

    // Map events for tooltip
    if (state.map) {
        state.map.on('mousemove', (e) => {
            if (!state.isTooltipPinned && !isMapPopupOpen()) updateTooltip(e.latlng);
        });
        state.map.on('popupopen', () => {
            deps.els.windTooltip.classList.add('hidden');
        });
        state.map.on('mouseout', () => {
            if (!state.isTooltipPinned) deps.els.windTooltip.classList.add('hidden');
        });
        state.map.on('click', (e) => {
            if (state.isTooltipPinned) {
                // If a tooltip is already open, close it and don't open a new one on this click
                if (state.clickMarker) {
                    state.map.removeLayer(state.clickMarker);
                    state.clickMarker = null;
                }
                state.isTooltipPinned = false;
                deps.els.windTooltip.classList.add('hidden');
                return;
            }

            // Otherwise, open a new tooltip
            state.clickMarker = L.circleMarker(e.latlng, {
                radius: 5,
                fillColor: '#f00',
                color: '#fff',
                weight: 2,
                opacity: 1,
                fillOpacity: 1,
                interactive: false
            }).addTo(state.map);
            state.isTooltipPinned = true;
            updateTooltip(e.latlng);
        });
        state.map.on('movestart', () => {
            if (state.clickMarker) {
                state.map.removeLayer(state.clickMarker);
                state.clickMarker = null;
            }
            state.isTooltipPinned = false;
            deps.els.windTooltip.classList.add('hidden');
        });

        // Ensure map resizes correctly when the window or orientation changes
        window.addEventListener('resize', () => {
            state.map.invalidateSize();
            scheduleGradientScaleLabelsLayout();
        });
        window.addEventListener('orientationchange', () => {
            // Short delay to allow browser to calculate new dimensions
            setTimeout(() => {
                state.map.invalidateSize();
                scheduleGradientScaleLabelsLayout();
            }, 200);
        });
    }

    setupScaleGradientToggle();
}


export function updateUIForType() {
    // Map controls always visible (selector no mapa: só modo vuelo)
    if (deps.els.varGroup) {
        deps.els.varGroup.classList.toggle('hidden', state.uiMode === 'simple');
    }
    document.getElementById('overlays-group').classList.remove('hidden');
    document.getElementById('scale-container').classList.remove('hidden');

    // Invalidate station if it doesn't exist globally
    if (state.currentStation) {
        const soundingsMap = state.manifest.configuration.soundings || {};
        let existsGlobally = false;
        for (const dom in soundingsMap) {
            if (soundingsMap[dom].some(s => (s.id || s) === state.currentStation)) {
                existsGlobally = true;
                break;
            }
        }
        if (!existsGlobally) {
            state.currentStation = '';
            deps.els.overlayContainer.classList.add('hidden');
            document.documentElement.classList.remove('has-modal');
            document.body.classList.remove('has-modal');
        }
    }

    // Images Visibility controls
    deps.els.mapContainer.classList.remove('hidden');

    // Image Visibility controls inside modal
    const showStationPlots = (state.currentStation && state.currentStation !== '');
    if (showStationPlots) {
        deps.els.imgSounding.classList.remove('hidden');
        deps.els.imgMeteogram.classList.remove('hidden');
    } else {
        deps.els.imgSounding.classList.add('hidden');
        deps.els.imgMeteogram.classList.add('hidden');
    }

    if (deps.els.timelineControls) {
        deps.els.timelineControls.classList.remove('hidden');
    }

    updateModeVisibility();
}
export function populateDates() {
    // Combine Latest + Archive
    const dates = [
        ...state.manifest.dataset_dates.latest,
        ...state.manifest.dataset_dates.archive
    ];

    deps.els.dateSelector.innerHTML = '';
    dates.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d;
        opt.textContent = formatDateSelectorLabel(d);
        deps.els.dateSelector.appendChild(opt);
    });



    if (dates.length > 0) {
        // Try to select Today
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        const todayStr = `${yyyy}-${mm}-${dd}`;

        if (dates.includes(todayStr)) {
            state.currentDate = todayStr;
        } else if (state.manifest.last_updated) {
            const fromManifest = state.manifest.last_updated.split(' ')[0];
            state.currentDate = dates.includes(fromManifest) ? fromManifest : dates[0];
        } else {
            state.currentDate = dates[0];
        }
        // Sync UI
        deps.els.dateSelector.value = state.currentDate;
    }
    updateAvailableHours();
}


/*
function updateViewTypeVisibility() {
    // Logic moved to updateUIForType
}
*/

export function populateVarButtons() {
    const vars = state.manifest && state.manifest.configuration
        && state.manifest.configuration.variables
        ? state.manifest.configuration.variables : [];
    const containers = {
        wind:  document.getElementById('vars-wind'),
        other: document.getElementById('vars-other'),
        clouds: document.getElementById('vars-clouds')
    };
    if (!containers.wind || !containers.other) return;
    containers.wind.innerHTML = '';
    containers.other.innerHTML = '';
    if (containers.clouds) containers.clouds.innerHTML = '';

    vars.forEach(v => {
        if (HIDDEN_UI_VAR_IDS.has(v.id)) return;
        if (state.uiMode === 'simple' && !SIMPLE_SCALAR_IDS.includes(v.id)) return;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn-toggle';
        btn.dataset.varId = v.id;
        const iconSrc = VAR_ICONS[v.id];
        if (iconSrc) {
            const img = document.createElement('img');
            img.src = iconSrc; img.alt = ''; img.className = 'btn-icon';
            btn.appendChild(img);
        }
        const label = (v.id in VAR_SHORT_LABELS) ? VAR_SHORT_LABELS[v.id] : (v.title || v.id);
        if (label) {
            const span = document.createElement('span'); span.textContent = label;
            btn.appendChild(span);
        } else if (iconSrc) {
            btn.classList.add('icon-only');
        }
        if (state.activeScalarVarIds.includes(v.id)) btn.classList.add('active');
        btn.onclick = () => toggleScalarVariable(v.id);
        let target;
        if (CLOUD_VAR_IDS.has(v.id) && containers.clouds) target = containers.clouds;
        else if (WIND_VAR_IDS.has(v.id)) target = containers.wind;
        else target = containers.other;
        target.appendChild(btn);
    });
    updateCurrentVarLabel();
}


export function populateVars() {
    const vars = state.manifest.configuration.variables || [];

    state.activeScalarVarIds = state.activeScalarVarIds.filter(
        id => vars.some(v => v.id === id) && !HIDDEN_UI_VAR_IDS.has(id)
    );
    if (state.uiMode === 'simple') {
        const allow = new Set(SIMPLE_SCALAR_IDS);
        state.activeScalarVarIds = state.activeScalarVarIds.filter(id => allow.has(id));
        if (state.activeScalarVarIds.length > 1) {
            state.activeScalarVarIds = [state.activeScalarVarIds[0]];
        }
    }
    if (state.activeScalarVarIds.length === 0) {
        if (state.uiMode === 'simple') {
            state.activeScalarVarIds = [];
        } else {
            const sfcwind = vars.find(v => v.id === 'sfcwind');
            if (sfcwind) state.activeScalarVarIds = [sfcwind.id];
            else {
                const vis = vars.find(v => !HIDDEN_UI_VAR_IDS.has(v.id));
                if (vis) state.activeScalarVarIds = [vis.id];
            }
        }
    }

    if (deps.els.varSelector) deps.els.varSelector.innerHTML = '';

    const noneOpt = document.createElement('option');
    noneOpt.value = 'none';
    noneOpt.textContent = 'Ocultar';
    if (deps.els.varSelector) deps.els.varSelector.appendChild(noneOpt);

    vars.forEach(v => {
        if (HIDDEN_UI_VAR_IDS.has(v.id)) return;
        if (state.uiMode === 'simple' && !SIMPLE_SCALAR_IDS.includes(v.id)) return;
        const opt = document.createElement('option');
        opt.value = v.id;
        opt.textContent = v.title || v.id;
        if (deps.els.varSelector) deps.els.varSelector.appendChild(opt);
    });

    applyDerivedCurrentVar();

    populateVarButtons();
    updateModeVisibility();
}

let __appStarted = false;

function persistUiMode(mode) {
    try {
        localStorage.setItem(LS_UI_MODE_KEY, mode);
    } catch (e) { /* */ }
}

function rebuildWeatherLayerButtons(sortedLayers) {
    const container = document.getElementById('weather-layers');
    if (!container || !state.manifest?.configuration?.layers) return;
    const layers = sortedLayers || [...state.manifest.configuration.layers].sort((a, b) => {
        const ai = LAYER_ORDER.indexOf(a.id);
        const bi = LAYER_ORDER.indexOf(b.id);
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });
    container.innerHTML = '';
    layers.forEach(layer => {
        if (state.uiMode === 'simple' && !SIMPLE_LAYER_IDS.includes(layer.id)) return;
        if (typeof state.layers[layer.id] === 'undefined') state.layers[layer.id] = false;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn-toggle';
        btn.dataset.layerId = layer.id;

        const iconSrc = LAYER_ICONS[layer.id];
        if (iconSrc) {
            const img = document.createElement('img');
            img.src = iconSrc; img.alt = ''; img.className = 'btn-icon';
            btn.appendChild(img);
        }
        const label = (layer.id in LAYER_SHORT_LABELS) ? LAYER_SHORT_LABELS[layer.id] : layer.title;
        if (label) {
            const span = document.createElement('span'); span.textContent = label;
            btn.appendChild(span);
        } else if (iconSrc) {
            btn.classList.add('icon-only');
        }
        if (state.layers[layer.id]) btn.classList.add('active');
        btn.onclick = () => { setWeatherLayer(layer.id); syncTogglesUI(); };
        container.appendChild(btn);
    });
}

function syncOpacityModeButtons() {
    const bSimple = document.getElementById('opacity-mode-simple');
    const bFlight = document.getElementById('opacity-mode-flight');
    if (!bSimple || !bFlight) return;
    bSimple.classList.toggle('active', state.uiMode === 'simple');
    bFlight.classList.toggle('active', state.uiMode === 'flight');
}

function applyUiModeCore(mode) {
    state.uiMode = mode;
    document.body.classList.toggle('theme-simple', mode === 'simple');
    document.body.classList.toggle('theme-flight', mode === 'flight');
    if (mode === 'simple') {
        state.soundingsMode = 'hidden';
        state.layers.soundings = false;
        state.layers.takeoffs_names = false;
        state.layers.rain = true;
        state.layers.blcloudpct = false;
        state.layers.lowfrac = false;
        state.layers.midfrac = false;
        state.layers.highfrac = false;
        state.layers.provinces = false;
        ensureSimpleTopBrand();
    } else {
        removeSimpleTopBrand();
    }
    syncOpacityModeButtons();
    persistUiMode(mode);
}

/** Cambia entre modo simple e voo desde o panel de opacidade (ou outro control). */
export function switchUiMode(mode) {
    if (mode !== 'simple' && mode !== 'flight') return;
    if (state.uiMode === mode) return;
    applyUiModeCore(mode);
    rebuildWeatherLayerButtons();
    populateVars();
    syncTogglesUI();
    applySoundingsModeFromCycle();
    syncSoundingsCycleUI();
    updateUIForType();
    updateMarkers();
    if (deps.updateImage) deps.updateImage();
}

/** Barra Meteonube arriba: só no modo simple (non existe no HTML en vuelo). */
function ensureSimpleTopBrand() {
    const root = document.querySelector('.app-root');
    if (!root || root.querySelector('.simple-top-brand')) return;
    const hdr = document.createElement('header');
    hdr.className = 'simple-top-brand';
    hdr.setAttribute('aria-label', 'Meteonube');
    const a = document.createElement('a');
    a.href = 'https://meteonube.es';
    a.className = 'simple-top-brand-link';
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.title = 'meteonube.es';
    const spanIcon = document.createElement('span');
    spanIcon.className = 'simple-top-brand-icon';
    spanIcon.setAttribute('aria-hidden', 'true');
    spanIcon.textContent = '⛅';
    const spanText = document.createElement('span');
    spanText.className = 'simple-top-brand-text';
    spanText.textContent = 'Meteonube';
    a.appendChild(spanIcon);
    a.appendChild(spanText);
    hdr.appendChild(a);
    root.insertBefore(hdr, root.firstChild);
}

function removeSimpleTopBrand() {
    document.querySelector('.app-root .simple-top-brand')?.remove();
}

export function applyUiModeAndStart(mode) {
    if (__appStarted) return;
    __appStarted = true;
    applyUiModeCore(mode);
    const picker = document.getElementById('mode-picker-overlay');
    if (picker) picker.classList.add('hidden');
    if (deps.startApp) deps.startApp();
}

/**
 * map.js — mapa Leaflet, dominios, overlays e eventos.
 */
import { state } from './store.js';
import { WIND_SPEED_VAR_IDS } from './utils.js';

let deps = {};

export function initMapModule(appDeps) {
    deps = appDeps || {};
}

export function initMap() {
    if (state.map) return;

    // Initialize Leaflet map
    // User wants: cannot move (dragging: false) but zoom enabled
    state.map = L.map('map', {
        dragging: true,
        touchZoom: true,
        scrollWheelZoom: true,
        doubleClickZoom: true,
        boxZoom: false,
        zoomControl: true,
        attributionControl: false,
        minZoom: 3,
        maxZoom: 16,
        /** Botóns +/- do control: pasos intermedios (ex.: 8 → 8.5 → 9). Rueda/pinch tamén respectan zoomSnap. */
        zoomSnap: 0.5,
        zoomDelta: 0.5
    });

    // --- Base Layers Configuration ---
    const baseMaps = {
        "Relieve": L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', {
            maxZoom: 19,
            attribution: '&copy; OpenStreetMap'
        }),
        "OpenTopoMap": L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
            maxZoom: 17,
            attribution: '&copy; OpenStreetMap | &copy; OpenTopoMap'
        }),
        "Satélite": L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            maxZoom: 19,
            attribution: '&copy; Esri'
        })
    };

    // Add default layer
    baseMaps["OpenTopoMap"].addTo(state.map);
    state.baseLayer = baseMaps["OpenTopoMap"];
    if (state.baseLayer) state.baseLayer.setOpacity(state.overlayOpacity);

    // Track active base layer to apply opacity across switches
    state.map.on('baselayerchange', (e) => {
        state.baseLayer = e.layer;
        if (state.baseLayer) state.baseLayer.setOpacity(state.overlayOpacity);
    });

    // Add layer control
    L.control.layers(baseMaps).addTo(state.map);

    // Add boundaries high-z-index overlay
    state.map.createPane('boundariesPane');
    state.map.getPane('boundariesPane').style.zIndex = 450;
    state.map.getPane('boundariesPane').style.pointerEvents = 'none'; // allow clicks through

    state.boundariesLayer = L.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
        pane: 'boundariesPane',
        attribution: '&copy; Esri',
        maxZoom: 19
    });

    state.provincesLayer = L.geoJSON(null, {
        pane: 'boundariesPane',
        style: {
            color: '#ffffff',
            weight: 1.8,
            opacity: 1.0,
            fillOpacity: 0
        },
        interactive: false
    });

    // Fetch local geojson lines asynchronously
    fetch('spain-provinces.geojson')
        .then(res => res.json())
        .then(data => {
            if (state.provincesLayer) state.provincesLayer.addData(data);
        })
        .catch(err => console.error("Could not load borders geojson", err));

    if (state.layers.boundaries) {
        state.boundariesLayer.addTo(state.map);
    }
    if (state.layers.provinces) {
        state.provincesLayer.addTo(state.map);
    }

    // Initial particle color based on default base layer (Relieve)
    if (state.particleEngine) {
        state.particleEngine.particleColor = 'rgba(0, 0, 0, 0.7)';
    }

    state.map.on('baselayerchange', (e) => {
        if (!state.particleEngine) return;
        if (e.name === 'Satélite') {
            state.particleEngine.particleColor = 'rgba(0, 255, 255, 0.8)';
        } else {
            // Relieve or OpenTopoMap
            state.particleEngine.particleColor = 'rgba(0, 0, 0, 0.7)';
        }
    });

    const leafletScale = L.control.scale({ imperial: false, position: 'bottomright' });
    leafletScale.addTo(state.map);
    const leafletScaleRoot = leafletScale.getContainer?.() || leafletScale._container;
    const scaleAnchor = document.getElementById('leaflet-scale-anchor');
    if (leafletScaleRoot && scaleAnchor) {
        scaleAnchor.appendChild(leafletScaleRoot);
        leafletScaleRoot.style.position = 'static';
        leafletScaleRoot.style.margin = '0';
    }

    L.Control.ParticlesPause = L.Control.extend({
        options: { position: 'topright' },
        onAdd: function (map) {
            const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-custom leaflet-control-particles');
            const btn = L.DomUtil.create('a', '', container);
            btn.href = '#';
            btn.title = 'Pausar animación do vento (partículas)';
            btn.innerHTML = '⏸️';
            btn.style.backgroundColor = '#ffffff';
            btn.style.textDecoration = 'none';

            L.DomEvent.on(btn, 'click', function (e) {
                L.DomEvent.stopPropagation(e);
                L.DomEvent.preventDefault(e);

                const isWind = WIND_SPEED_VAR_IDS.has(state.currentVar);
                if (!isWind || state.vectorMode !== 'particles' || !state.particleEngine) return;

                if (state.particlesPaused) {
                    deps.resumeParticlesAfterContextChange();
                } else {
                    state.particlesPaused = true;
                    state.particleEngine.freezeAnimation();
                    deps.syncParticlesPauseButton();
                }
            });

            state.particlesControlButton = btn;
            state.particlesControlContainer = container;
            return container;
        }
    });
    state.particlesControl = new L.Control.ParticlesPause();
    state.particlesControl.addTo(state.map);

    // Add Variable Selector Control
    L.Control.VarSelector = L.Control.extend({
        options: { position: 'topleft' },
        onAdd: function (map) {
            const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-custom var-selector-control');
            container.style.backgroundColor = '#fff';
            container.style.pointerEvents = 'auto';

            const select = L.DomUtil.create('select', 'leaflet-var-selector', container);
            select.style.border = 'none';
            select.style.background = 'transparent';
            select.style.color = '#333';
            select.style.outline = 'none';
            select.style.cursor = 'pointer';
            select.style.fontSize = '12px';
            select.style.fontWeight = '500';
            select.style.padding = '0 4px';
            select.style.height = '22px';

            L.DomEvent.disableClickPropagation(container);
            L.DomEvent.on(select, 'mousedown touchstart click', function (e) {
                L.DomEvent.stopPropagation(e);
            });

            deps.els.varSelector = select;
            deps.els.varGroup = container;

            return container;
        }
    });
    new L.Control.VarSelector().addTo(state.map);

    // Vista inicial: escritorio zoom 8; móvil/tablet (≤1024px, coma layout CSS) medio nivel menos → 7.5 (zoomSnap 0.5)
    const initialZoom = (typeof window !== 'undefined' && window.matchMedia('(max-width: 1024px)').matches) ? 7.5 : 8;
    const initialBounds = getDomainBounds();
    if (initialBounds) {
        state.map.setView(initialBounds.getCenter(), initialZoom);
    } else {
        // Fallback to Spain center
        state.map.setView([40.4168, -3.7038], initialZoom);
    }

    // Create canvas layer for wind particles
    // We'll use L.Canvas or just a custom overlay.
    // Let's use a simple L.Layer for the particle canvas later.
    const canvasOverlay = L.Layer.extend({
        onAdd: function (map) {
            const canvas = L.DomUtil.create('canvas', 'leaflet-layer z-particles');
            canvas.id = 'wind-particles';
            this._canvas = canvas;
            map.getPanes().overlayPane.appendChild(canvas);
            map.on('moveend', this._update, this);
            this._update();
        },
        onRemove: function (map) {
            map.getPanes().overlayPane.removeChild(this._canvas);
            map.off('moveend', this._update, this);
        },
        _update: function () {
            const map = this._map;
            const size = map.getSize();
            const canvas = this._canvas;
            canvas.width = size.x;
            canvas.height = size.y;
            const pos = map.containerPointToLayerPoint([0, 0]);
            L.DomUtil.setPosition(canvas, pos);

            if (state.particleEngine) {
                state.particleEngine.canvas = canvas;
                state.particleEngine.ctx = canvas.getContext('2d');
                if (!state.particlesPaused) {
                    state.particleEngine.initParticles();
                }
            }
        }
    });
    // Instantiate and add overlay
    const overlay = new canvasOverlay();
    overlay.addTo(state.map);

    /** Ao cambiar só zoom: reanudar partículas se estaban en pausa */
    state.map.on('zoomend', () => {
        deps.resumeParticlesAfterContextChange();
    });

    // Re-render grid overlays on zoom or pan to adjust detail and handle domain switching
    state.map.on('moveend zoomend dragend', () => {
        // Delay unlocking to swallow residual click events from touch devices
        setTimeout(() => {
            state.isInteractionLocked = false;
        }, 150);

        const newDom = getDomainForView();
        if (newDom !== state.currentDomain && newDom !== null) {
            setDomainInternal(newDom);
        } else {
            // Fuerza la regeneración de vectores según nivel de zoom para mantener grosores constantes
            deps.updateImage();
        }
        updateDisplayControl();
    });

    state.map.on('movestart zoomstart touchstart dragstart', () => {
        state.isInteractionLocked = true;
    });

    // Create the Zoom/Domain indicator as a direct child of the map container 
    // to avoid layout conflicts with Leaflet controls
    const indicator = L.DomUtil.create('div', 'zoom-domain-display', deps.els.mapContainer);
    indicator.style.backgroundColor = 'rgba(0,0,0,0.85)';
    indicator.style.color = 'white';
    indicator.style.padding = '3px 10px';
    indicator.style.borderRadius = '8px';
    indicator.style.fontSize = '12px';
    indicator.style.fontWeight = '500';
    indicator.style.boxShadow = '0 4px 15px rgba(0,0,0,0.4)';
    indicator.style.backdropFilter = 'blur(4px)';
    indicator.style.border = '1px solid rgba(255,255,255,0.2)';
    indicator.style.position = 'absolute';
    indicator.style.top = '15px';
    indicator.style.left = '50%';
    indicator.style.transform = 'translateX(-50%)';
    indicator.style.zIndex = '10001';
    indicator.style.pointerEvents = 'none';
    indicator.style.margin = '0';
    state.zoomIndicator = indicator;

    updateDisplayControl();
    deps.updateUIForType();
}
export function updateDisplayControl() {
    if (!state.zoomIndicator) return;
    const zoom = state.map ? state.map.getZoom() : 8;
    const dom = state.currentDomain;

    if (dom === null) {
        state.zoomIndicator.innerHTML = `Zoom: <strong>${zoom}</strong>`;
    } else {
        const domLabel = dom.toUpperCase();
        state.zoomIndicator.innerHTML = `Zoom: <strong>${zoom}</strong> | <strong>${domLabel}</strong>`;
    }
}

export function getDomainForView() {
    return 'd02';
}

export function setDomainInternal(dom) {
    console.log("Auto-switching domain to:", dom);
    state.currentDomain = dom;

    // Clear existing overlays
    Object.keys(state.scalarOverlayByVarId).forEach(k => {
        if (state.scalarOverlayByVarId[k]) state.map.removeLayer(state.scalarOverlayByVarId[k]);
        delete state.scalarOverlayByVarId[k];
    });
    if (state.vectorOverlay) { state.map.removeLayer(state.vectorOverlay); state.vectorOverlay = null; }
    Object.keys(state.dynamicOverlays).forEach(k => {
        if (state.dynamicOverlays[k]) state.map.removeLayer(state.dynamicOverlays[k]);
        delete state.dynamicOverlays[k];
    });

    deps.populateVars();
    deps.updateUIForType();
    deps.updateMarkers();
    deps.updateImage();
}
export function getDomainBounds() {
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

export function updateLeafletOverlay(existingLayer, show, url, bounds, options) {
    if (!show || url === 'STREAMLINES_NATIVE') {
        if (existingLayer) state.map.removeLayer(existingLayer);
        return null;
    }

    if (existingLayer) {
        if (existingLayer._url === url) {
            if (options && options.opacity !== undefined) {
                existingLayer.setOpacity(options.opacity);
            }
            return existingLayer;
        }
        state.map.removeLayer(existingLayer);
    }

    const newLayer = L.imageOverlay(url, bounds, options).addTo(state.map);
    return newLayer;
}

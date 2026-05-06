const state = {
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

    vectorMode: 'particles', // scalar vs vector vs barb vs particles

    gridDataMap: {},       // Map of varId -> grid data
    gridUrlMap: {},        // Map of varId -> dataUrl (canvas image)
    gridVectorModeMap: {},  // Map of varId -> mode used for vectorGridUrlMap
    vectorGridUrlMap: {},  // Map of varId -> dataUrl (canvas arrows/barbs)
    gridLoadingMap: {},    // Map of varId -> url loading
    gridLoadedUrlMap: {},  // Map of varId -> last loaded JSON URL

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
    weatherOverlay: null,
    vectorOverlay: null,
    dynamicOverlays: {}, // Store L.imageOverlay by layer id
    markers: [],
    clickMarker: null,
    isTooltipPinned: false,
    isInteractionLocked: false
};

const els = {
    dateSelector: document.getElementById('date-selector'),
    varSelector: null,
    // viewTypeSelector removed
    modeSelector: document.getElementById('mode-selector'),

    // Groups
    varGroup: null,
    modeGroup: document.getElementById('mode-group'),
    opacitySlider: document.getElementById('opacity-slider'),
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

// --- Initialization ---

async function init() {
    try {
        // Añadimos un timestamp para evitar que el navegador guarde el archivo en caché
        const resp = await fetch('manifest.json?t=' + new Date().getTime());
        state.manifest = await resp.json();

        // Show last updated
        if (state.manifest.last_updated) {
            els.lastUpdated.textContent = `Actualizado: ${state.manifest.last_updated}`;
        }

        state.particleEngine = new WindParticles(null);
        initMap();
        setupControls();
        updateUIForType();
        updateImage();
        updateMarkers();
    } catch (e) {
        console.error("Failed to load manifest", e);
        els.lastUpdated.textContent = "Erro cargando datos";
    }
}

function initMap() {
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
        attributionControl: true,
        minZoom: 3,
        maxZoom: 16
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

    // Add scale control (Km/Miles)
    L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(state.map);

    L.Control.ParticlesToggle = L.Control.extend({
        options: { position: 'topright' },
        onAdd: function (map) {
            const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-custom leaflet-control-particles');
            const btn = L.DomUtil.create('a', '', container);
            btn.href = '#';
            btn.title = 'Alternar Modo Partículas de Vento';
            btn.innerHTML = '💨';
            btn.style.backgroundColor = '#ffffff';
            btn.style.textDecoration = 'none';

            L.DomEvent.on(btn, 'click', function (e) {
                L.DomEvent.stopPropagation(e);
                L.DomEvent.preventDefault(e);

                if (state.vectorMode === 'vector') {
                    state.vectorMode = 'particles';
                } else {
                    state.vectorMode = 'vector';
                }
                updateModeVisibility(); // Update button styling
                updateImage();
            });

            state.particlesControlButton = btn;
            state.particlesControlContainer = container;
            return container;
        }
    });
    state.particlesControl = new L.Control.ParticlesToggle();
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

            select.addEventListener('change', (e) => {
                state.currentVar = e.target.value;
                updateUIForType();
                updateImage();
            });

            els.varSelector = select;
            els.varGroup = container;

            return container;
        }
    });
    new L.Control.VarSelector().addTo(state.map);

    // Initial View: Start at Zoom 7 as requested
    // Initial View: Start at Zoom 7 as requested
    const initialBounds = getDomainBounds();
    if (initialBounds) {
        state.map.setView(initialBounds.getCenter(), 8);
    } else {
        // Fallback to Spain center
        state.map.setView([40.4168, -3.7038], 8);
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
                state.particleEngine.initParticles();
            }
        }
    });
    // Instantiate and add overlay
    const overlay = new canvasOverlay();
    overlay.addTo(state.map);

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
            updateImage();
        }
        updateDisplayControl();
    });

    state.map.on('movestart zoomstart touchstart dragstart', () => {
        state.isInteractionLocked = true;
    });

    // Create the Zoom/Domain indicator as a direct child of the map container 
    // to avoid layout conflicts with Leaflet controls
    const indicator = L.DomUtil.create('div', 'zoom-domain-display', els.mapContainer);
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
    updateUIForType();
}

function updateDisplayControl() {
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

function getDomainForView() {
    return 'd02';
}

function setDomainInternal(dom) {
    console.log("Auto-switching domain to:", dom);
    state.currentDomain = dom;

    // Clear existing overlays
    if (state.weatherOverlay) { state.map.removeLayer(state.weatherOverlay); state.weatherOverlay = null; }
    if (state.vectorOverlay) { state.map.removeLayer(state.vectorOverlay); state.vectorOverlay = null; }
    Object.keys(state.dynamicOverlays).forEach(k => {
        if (state.dynamicOverlays[k]) state.map.removeLayer(state.dynamicOverlays[k]);
        delete state.dynamicOverlays[k];
    });

    populateVars();
    updateUIForType();
    updateMarkers();
    updateImage();
}

function updateMarkers() {
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
                const marker = L.circleMarker([s.lat, s.lon], {
                    radius: 5,
                    fillColor: isActive ? "#0af" : "#25f",
                    color: "#fff",
                    weight: 2,
                    opacity: 1,
                    fillOpacity: 1,
                    zIndex: 1000
                }).addTo(state.map);

                if (state.layers.takeoffs_names) {
                    marker.bindTooltip(s.name, { 
                        permanent: true, 
                        direction: 'top', 
                        className: 'label-takeoff' 
                    });
                }

                marker.on('click', (e) => {
                    els.windTooltip.classList.add('hidden');
                    if (e.originalEvent) e.originalEvent.stopPropagation();
                });

                marker.on('mouseover', (e) => {
                    updateTooltip(e.latlng, s.name);
                });

                marker.on('mouseout', () => {
                    updateTooltip(null);
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
                        <button class="popup-btn" onclick="openSounding('${s.id}')">ver gráficas</button>
                    </div>
                `;

                marker.bindPopup(popupContent, {
                    className: 'custom-sounding-popup',
                    offset: [0, 0]
                });

                state.markers.push(marker);
            }
        });
    }
}

// Global function to open the sounding modal from the popup button
window.openSounding = function (stationId) {
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
    els.windTooltip.classList.add('hidden');

    state.currentStation = stationId;
    updateUIForType();
    updateImage();
    updateMarkers();

    if (state.currentStation) {
        els.overlayContainer.classList.remove('hidden');
        if (els.overlayContainer.querySelector('.modal-content')) {
            els.overlayContainer.querySelector('.modal-content').scrollTop = 0;
        }
    }
};

function setupControls() {
    // Set initial domain based on view bounds if map exists, else d01
    const initialDomain = state.map ? getDomainForView() : 'd01';
    state.currentDomain = initialDomain;


    // Dates
    populateDates();

    // Variables (Initial)
    populateVars();

    // Listeners
    els.dateSelector.onchange = (e) => {
        state.currentDate = e.target.value;
        updateAvailableHours();
        updateImage();
    };

    els.timeSelector.onchange = (e) => {
        const selectedHour = parseInt(e.target.value, 10);
        const index = state.availableHours.indexOf(selectedHour);
        if (index !== -1) {
            state.currentHourIndex = index;
            state.currentHour = selectedHour;
            updateImage();
        }
    };

    /*
    els.viewTypeSelector.onchange = (e) => {
        state.viewType = e.target.value;
        updateUIForType();
        updateImage();
    };
    */

    els.varSelector.onchange = (e) => {
        state.currentVar = e.target.value;
        updateModeVisibility();
        updateImage();
    };

    if (els.opacitySlider) {
        const savedOpacity = localStorage.getItem('meteowrf_layer_opacity');
        if (savedOpacity !== null) {
            els.opacitySlider.value = savedOpacity;
            state.overlayOpacity = savedOpacity / 100;
            if (state.baseLayer) {
                state.baseLayer.setOpacity(state.overlayOpacity);
            }
        }
        els.opacitySlider.oninput = (e) => {
            state.overlayOpacity = e.target.value / 100;
            localStorage.setItem('meteowrf_layer_opacity', e.target.value);
            if (state.baseLayer) {
                state.baseLayer.setOpacity(state.overlayOpacity);
            }
        };
    }

    if (els.closeModalBtn) {
        els.closeModalBtn.addEventListener('click', () => {
            els.overlayContainer.classList.add('hidden');
            document.documentElement.classList.remove('has-modal');
            document.body.classList.remove('has-modal');
            state.currentStation = '';
            els.imgSounding.classList.remove('expanded');
            els.imgMeteogram.classList.remove('expanded');
            updateUIForType();
            updateMarkers(); // Un-highlight active marker
        });
    }

    // Image Fullscreen and Swipe/Drag to change time
    [els.imgSounding, els.imgMeteogram].forEach(img => {
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

    // Dynamic Layers from Manifest (Exclusive Group - Checkboxes acting as Radio)
    const weatherLayersGroup = document.getElementById('weather-layers');
    if (weatherLayersGroup) {
        weatherLayersGroup.innerHTML = ''; // Clear
        weatherLayersGroup.className = 'checkbox-group'; // Use checkbox styling if available, or keep radio-group

        if (state.manifest.configuration.layers) {
            state.manifest.configuration.layers.forEach(layer => {
                // Initialize state if needed
                if (typeof state.layers[layer.id] === 'undefined') {
                    state.layers[layer.id] = false;
                }

                const div = document.createElement('div');
                div.className = 'checkbox-item'; // or radio-item

                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.name = 'weather-layer'; // Name not strictly needed for exclusivity in checkbox, but good for grouping
                checkbox.id = `layer-${layer.id}`;
                checkbox.value = layer.id;
                checkbox.checked = state.layers[layer.id];
                checkbox.dataset.layerId = layer.id;

                // On change, toggle this layer exclusively
                checkbox.onchange = () => {
                    setWeatherLayer(layer.id);
                };

                const label = document.createElement('label');
                label.htmlFor = `layer-${layer.id}`;
                label.textContent = layer.title;

                div.appendChild(checkbox);
                div.appendChild(label);
                weatherLayersGroup.appendChild(div);
            });
        }
    }

    // Static Toggles Listeners
    const toggleTakeoffsNames = document.getElementById('toggle-takeoffs-names');
    if (toggleTakeoffsNames) {
        toggleTakeoffsNames.checked = state.layers.takeoffs_names || false;
        toggleTakeoffsNames.onchange = (e) => {
            state.layers.takeoffs_names = e.target.checked;
            updateMarkers(); // Now affecting markers directly
            updateImage();
        };
    }

    const toggleSoundings = document.getElementById('toggle-soundings');
    if (toggleSoundings) {
        toggleSoundings.checked = state.layers.soundings || false;
        toggleSoundings.onchange = (e) => {
            state.layers.soundings = e.target.checked;
            updateMarkers();
        };
    }

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

    if (els.overlayContainer) {
        // No longer using click-to-close for inline display
    }

    // Map events for tooltip
    if (state.map) {
        state.map.on('mousemove', (e) => {
            if (!state.isTooltipPinned) updateTooltip(e.latlng);
        });
        state.map.on('mouseout', () => {
            if (!state.isTooltipPinned) els.windTooltip.classList.add('hidden');
        });
        state.map.on('click', (e) => {
            if (state.isTooltipPinned) {
                // If a tooltip is already open, close it and don't open a new one on this click
                if (state.clickMarker) {
                    state.map.removeLayer(state.clickMarker);
                    state.clickMarker = null;
                }
                state.isTooltipPinned = false;
                els.windTooltip.classList.add('hidden');
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
            els.windTooltip.classList.add('hidden');
        });

        // Ensure map resizes correctly when the window or orientation changes
        window.addEventListener('resize', () => {
            state.map.invalidateSize();
        });
        window.addEventListener('orientationchange', () => {
            // Short delay to allow browser to calculate new dimensions
            setTimeout(() => {
                state.map.invalidateSize();
            }, 200);
        });
    }
}
function updateUIForType() {
    // Map controls always visible
    if (els.varGroup) els.varGroup.classList.remove('hidden');
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
            els.overlayContainer.classList.add('hidden');
            document.documentElement.classList.remove('has-modal');
            document.body.classList.remove('has-modal');
        }
    }

    // Images Visibility controls
    els.mapContainer.classList.remove('hidden');

    // Image Visibility controls inside modal
    const showStationPlots = (state.currentStation && state.currentStation !== '');
    if (showStationPlots) {
        els.imgSounding.classList.remove('hidden');
        els.imgMeteogram.classList.remove('hidden');
    } else {
        els.imgSounding.classList.add('hidden');
        els.imgMeteogram.classList.add('hidden');
    }

    if (els.timelineControls) {
        els.timelineControls.classList.remove('hidden');
    }

    updateModeVisibility();
}

function updateModeVisibility() {
    if (!state.map) return;
    const WIND_VARS = ['sfcwind', 'wind1500', 'wind2000', 'wind2500', 'wind3000', 'blwind', 'bltopwind'];
    const isWind = WIND_VARS.includes(state.currentVar);

    if (state.particlesControlContainer) {
        state.particlesControlContainer.style.display = isWind ? 'block' : 'none';

        if (state.vectorMode === 'particles') {
            state.particlesControlButton.style.backgroundColor = '#e1f0fa';
        } else {
            state.particlesControlButton.style.backgroundColor = '#ffffff';
        }
    }
}

/**
 * Sync Toggle Buttons Visual State with Internal State
 */
function syncTogglesUI() {
    // Disabled logic from sidebar
}

function setWeatherLayer(selectedId) {
    if (!selectedId) return;

    // Toggle the selected layer independently
    state.layers[selectedId] = !state.layers[selectedId];

    // Mutual exclusivity for cloud layers
    if (state.layers[selectedId] && isCloudVariable(selectedId)) {
        for (const layerId in state.layers) {
            if (layerId !== selectedId && isCloudVariable(layerId)) {
                state.layers[layerId] = false;
            }
        }
    }

    // Special Link: If activating Rain, also activate Clouds (blcloudpct)
    if (selectedId === 'rain' && state.layers['rain']) {
        state.layers['blcloudpct'] = true;
        for (const layerId in state.layers) {
            if (layerId !== 'blcloudpct' && isCloudVariable(layerId)) {
                state.layers[layerId] = false;
            }
        }
    }

    updateWeatherLayerUI(); // Sync checkbox circles
    updateImage();
}

function updateWeatherLayerUI() {
    const group = document.getElementById('weather-layers');
    if (!group) return;

    const checkboxes = group.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(cb => {
        const layerId = cb.dataset.layerId;
        if (layerId && typeof state.layers[layerId] !== 'undefined') {
            cb.checked = state.layers[layerId];
        }
    });
}

function setDomain(dom) {
    // This function is now manually called by setDomainInternal but kept for legacy or forced switches
    setDomainInternal(dom);
    const bounds = getDomainBounds();
    if (bounds && state.map) {
        state.map.fitBounds(bounds, { animate: false, maxZoom: 12 });
    }
}

function populateDates() {
    // Combine Latest + Archive
    const dates = [
        ...state.manifest.dataset_dates.latest,
        ...state.manifest.dataset_dates.archive
    ];

    els.dateSelector.innerHTML = '';
    dates.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d;
        opt.textContent = d;
        els.dateSelector.appendChild(opt);
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
        } else {
            // Default to latest available (first in list)
            state.currentDate = dates[0];
        }
        // Sync UI
        els.dateSelector.value = state.currentDate;
    }
    updateAvailableHours();
}

function updateAvailableHours() {
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
    // els.timeSlider.max = hours.length - 1;
    // els.timeSlider.value = newIndex;

    // Update Min/Max Labels
    // document.getElementById('time-min').textContent = getTimeString(hours[0]).substring(0, 2) + ":00" || "00:00";
    // document.getElementById('time-max').textContent = getTimeString(hours[hours.length - 1]).substring(0, 2) + ":00" || "23:00";

    els.timeSelector.innerHTML = '';
    hours.forEach(h => {
        const opt = document.createElement('option');
        opt.value = h;
        const utcHour = getTimeString(h).substring(0, 2);
        const dateStr = state.currentDate;
        const isoStr = `${dateStr}T${utcHour}:00:00Z`;
        const d = new Date(isoStr);
        const localHour = String(d.getHours()).padStart(2, '0');
        opt.textContent = `${localHour}:00`;
        els.timeSelector.appendChild(opt);
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

/*
function updateViewTypeVisibility() {
    // Logic moved to updateUIForType
}
*/

function populateVars() {
    // Variables
    const vars = state.manifest.configuration.variables || [];
    const currentVar = state.currentVar;

    els.varSelector.innerHTML = '';

    // Add "Ocultar" option
    const noneOpt = document.createElement('option');
    noneOpt.value = 'none';
    noneOpt.textContent = 'Ocultar';
    els.varSelector.appendChild(noneOpt);

    vars.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v.id;
        opt.textContent = v.title || v.id;
        els.varSelector.appendChild(opt);
    });

    // Attempt restore
    if (currentVar === 'none') {
        els.varSelector.value = 'none';
    } else if (vars.some(v => v.id === currentVar)) {
        els.varSelector.value = currentVar;
    } else {
        // Default to sfcwind if available, otherwise 'none'
        const sfcwind = vars.find(v => v.id === 'sfcwind');
        state.currentVar = sfcwind ? sfcwind.id : (vars.length > 0 ? vars[0].id : 'none');
        els.varSelector.value = state.currentVar;
    }

    // Update Mode Visibility based on new var
    updateModeVisibility();
}

// --- Logic ---

function getTimeString(h) {
    return h.toString().padStart(2, '0') + '00';
}

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
    const varsToLoad = [state.currentVar];
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
        const isWind = ['sfcwind', 'wind1500', 'wind2000', 'wind2500', 'wind3000', 'blwind', 'bltopwind'].includes(state.currentVar);
        const showParticles = (state.vectorMode === 'particles' && isWind);

        if (showParticles && state.gridDataMap[state.currentVar] && state.gridDataMap[state.currentVar].grid && state.gridDataMap[state.currentVar].grid.twsKn) {
            state.particleEngine.setGrid(state.gridDataMap[state.currentVar]);
        } else {
            state.particleEngine.stop();
        }
    }

}

async function updateDataGrid(varId) {
    if (!varId) varId = state.currentVar;
    const hhmm = getTimeString(state.currentHour);
    const dayPath = getBasePath();
    const url = `${dayPath}/${hhmm}_${varId}.json`;

    if (state.gridLoadingMap[varId] === url) return;

    const isWind = ['sfcwind', 'wind1500', 'wind2000', 'wind2500', 'wind3000', 'blwind', 'bltopwind'].includes(varId);
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
        if (varId === state.currentVar || state.layers[varId]) updateImage();
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
            if (isWind) state.gridVectorModeMap[varId] = cacheKey;

            // Refresh UI if this is the active variable or an active layer
            if (varId === state.currentVar || state.layers[varId]) {
                updateImage();
            }
        } else {
            state.gridDataMap[varId] = null;
        }
    } catch (e) {
        console.error("Error loading data grid", e);
        state.gridDataMap[varId] = null;
    } finally {
        state.gridLoadingMap[varId] = null;
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

function updateTooltip(latlng, stationName = null) {
    // Prevent tooltip from showing if a modal is open
    if (document.body.classList.contains('has-modal')) {
        els.windTooltip.classList.add('hidden');
        return;
    }

    if (!latlng) {
        els.windTooltip.classList.add('hidden');
        return;
    }

    // Handle station name
    if (els.wtStationName) {
        if (stationName) {
            els.wtStationName.textContent = stationName;
            els.wtStationName.classList.remove('hidden');
        } else {
            els.wtStationName.classList.add('hidden');
        }
    }

    const activeVarId = getActiveScalarVarId();
    const data = getPointData(latlng, activeVarId);

    if (data) {
        if (els.wtVarName) els.wtVarName.textContent = data.title;
        if (els.wtValue) els.wtValue.textContent = data.value.toFixed(1);
        if (els.wtUnits) els.wtUnits.textContent = data.units;

        // Direction handling
        if (data.dir !== null && data.dir !== undefined) {
            if (els.wtDirDeg) {
                els.wtDirDeg.textContent = Math.round(data.dir);
                els.wtDirDeg.parentElement.classList.remove('hidden');
            }
            if (els.wtDirArrow) els.wtDirArrow.style.transform = `rotate(${(data.dir + 180) % 360}deg)`;
        } else {
            if (els.wtDirDeg) els.wtDirDeg.parentElement.classList.add('hidden');
        }

        // Tooltip position
        const containerPoint = state.map.latLngToContainerPoint(latlng);
        els.windTooltip.style.left = `${containerPoint.x}px`;
        els.windTooltip.style.top = `${containerPoint.y}px`;
        els.windTooltip.classList.remove('hidden');
        return;
    }

    els.windTooltip.classList.add('hidden');
}

function updateMapOverlays() {
    if (!state.map) return;

    const bounds = getDomainBounds();

    // If no domain (bounds is null), hide all domain-specific overlays
    if (!bounds || !state.currentDomain) {
        if (state.weatherOverlay) state.map.removeLayer(state.weatherOverlay);
        state.weatherOverlay = null;
        if (state.vectorOverlay) state.map.removeLayer(state.vectorOverlay);
        state.vectorOverlay = null;
        Object.keys(state.dynamicOverlays).forEach(k => {
            if (state.dynamicOverlays[k]) state.map.removeLayer(state.dynamicOverlays[k]);
            delete state.dynamicOverlays[k];
        });
        els.imgScale.classList.add('hidden');
        if (els.dynamicScale) els.dynamicScale.classList.add('hidden');
        return;
    }

    const hhmm = getTimeString(state.currentHour);
    const dayPath = getBasePath(); // Daily folder
    const rootPath = getDomainRootPath(); // Domain root

    // 1. Variable: HHMM_var.webp (Scalar Base)
    const activeScalarVar = getActiveScalarVarId();

    const gridUrl = state.gridUrlMap[activeScalarVar];

    if (gridUrl && activeScalarVar !== 'none') {
        state.weatherOverlay = updateLeafletOverlay(state.weatherOverlay, true, gridUrl, bounds, { opacity: 1.0, zIndex: 20 });
    } else {
        if (state.weatherOverlay) {
            state.map.removeLayer(state.weatherOverlay);
            state.weatherOverlay = null;
        }
    }

    // 2. Vectors/Barbs/Particles
    const isWind = ['sfcwind', 'wind1500', 'wind2000', 'wind2500', 'wind3000', 'blwind', 'bltopwind'].includes(state.currentVar);
    const showVector = (state.vectorMode !== 'particles' && isWind);
    let vecUrl = '';

    if (showVector) {
        // Only use dynamic grid-based vector
        vecUrl = state.vectorGridUrlMap[state.currentVar] || '';
    }

    state.vectorOverlay = updateLeafletOverlay(state.vectorOverlay, showVector, vecUrl, bounds, { opacity: 1.0, zIndex: 30 });

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
        if (layer.id === activeScalarVar) showLayer = false; // Already shown as base scalar

        let layerUrl = state.gridUrlMap[layer.id] || '';
        state.dynamicOverlays[layer.id] = updateLeafletOverlay(state.dynamicOverlays[layer.id], showLayer, layerUrl, bounds, { opacity: 1.0, zIndex: 40 });
    });

    // 4. Scale
    let scaleVar = state.currentVar;
    dynamicLayers.forEach(layer => {
        if (state.layers[layer.id]) scaleVar = layer.id;
    });

    els.imgScale.classList.add('hidden');
    if (scaleVar && scaleVar !== 'none') {
        els.dynamicScale.classList.remove('hidden');
        updateDynamicScale(scaleVar);
    } else {
        els.dynamicScale.classList.add('hidden');
    }
}

function getActiveScalarVarId() {
    let activeVar = state.currentVar;
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

function updateLeafletOverlay(existingLayer, show, url, bounds, options) {
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

function updateSoundingImage() {
    if (!state.currentStation) return;
    const s = findStationInConfig(state.currentStation);
    const domain = s ? s.domain : 'd01';
    const dateCompact = state.currentDate.replace(/-/g, '');
    const hhmm = getTimeString(state.currentHour);
    const base = state.manifest.base_path;
    const dayPath = `${base}/${domain}/${dateCompact}`;
    const fname = `${hhmm}_sounding_${state.currentStation}.webp`;
    loadImage(els.imgSounding, `${dayPath}/${fname}`);
}

function updateMeteogramImage() {
    if (!state.currentStation) return;
    const s = findStationInConfig(state.currentStation);
    const domain = s ? s.domain : 'd01';
    const dateCompact = state.currentDate.replace(/-/g, '');
    const base = state.manifest.base_path;
    const dayPath = `${base}/${domain}/${dateCompact}`;
    const fname = `meteogram_${state.currentStation}.webp`;
    loadImage(els.imgMeteogram, `${dayPath}/${fname}`);
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

function loadImage(imgEl, src) {
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

function toggleLayer(imgEl, show, src) {
    if (show) {
        loadImage(imgEl, src);
    } else {
        imgEl.classList.add('hidden');
    }
}

// --- Time & Animation ---

function updateTimeSelectorUI() {
    if (els.timeSelector && state.currentHour !== null) {
        els.timeSelector.value = state.currentHour;
    }
}

function stepDay(dir) {
    const dates = Array.from(els.dateSelector.options).map(o => o.value);
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
        els.dateSelector.value = nextDateStr;
        updateAvailableHours();
        updateImage();
    }
}

function stepTime(dir) {
    let newIdx = state.currentHourIndex + dir;
    const max = state.availableHours.length;

    // Check if we need to change day
    if (newIdx >= max || newIdx < 0) {
        // Find current date index
        const dates = Array.from(els.dateSelector.options).map(o => o.value);
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
            els.dateSelector.value = nextDateStr;
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
        // Within same day
        state.currentHourIndex = newIdx;
        state.currentHour = state.availableHours[newIdx];
    }

    updateTimeSelectorUI();
    updateImage();
}

// Start
init();

/**
 * Optimized Wind Particle Engine
 */
class WindParticles {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas ? canvas.getContext('2d') : null;
        this.grid = null;
        this.animFrame = null;
        this.numParticles = 800;
        this.maxAge = 80;
        this.speedFactor = 0.8;
        this.particleColor = 'rgba(0, 255, 255, 0.8)';
        // Typed array for better performance [x, y, age]
        this.particles = new Float32Array(this.numParticles * 3);
    }

    setGrid(gridData) {
        const grid = gridData.grid;
        if (this.grid === grid && this.animFrame) return;
        this.grid = grid;
        if (grid) {
            this.initParticles();
            this.start();
        } else {
            this.stop();
        }
    }

    initParticles() {
        if (!this.canvas) return;
        const w = this.canvas.width;
        const h = this.canvas.height;
        for (let i = 0; i < this.numParticles; i++) {
            this.particles[i * 3] = Math.random() * w;     // x
            this.particles[i * 3 + 1] = Math.random() * h; // y
            this.particles[i * 3 + 2] = Math.random() * this.maxAge; // age
        }
    }

    start() {
        if (this.animFrame) return;
        this.lastTime = performance.now();
        this.render(this.lastTime);
    }

    stop() {
        if (this.animFrame) {
            cancelAnimationFrame(this.animFrame);
            this.animFrame = null;
        }
        if (this.ctx && this.canvas) {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        }
    }

    render(time) {
        if (!state.map || !this.grid || !this.canvas || !this.canvas.width || !this.ctx) return;

        let deltaTime = time - (this.lastTime || time);
        this.lastTime = time;
        if (deltaTime > 100) deltaTime = 16.666;
        const timeScale = deltaTime / 16.666;

        const bounds = getDomainBounds();
        if (!bounds) return;

        // Trails effect
        this.ctx.globalCompositeOperation = 'destination-in';
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.96)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.globalCompositeOperation = 'source-over';

        this.ctx.beginPath();
        this.ctx.strokeStyle = this.particleColor;
        this.ctx.lineWidth = 1.0;

        const w = this.canvas.width;
        const h = this.canvas.height;
        const g = this.grid;
        const gNx = g.nx;
        const gNy = g.ny;
        const tws = g.twsKn;
        const twd = g.twdDeg;

        // OPTIMIZATION: Project corners once per frame instead of every particle
        const nw = state.map.containerPointToLatLng([0, 0]);
        const se = state.map.containerPointToLatLng([w, h]);
        const lonRange = se.lng - nw.lng;
        const latRange = se.lat - nw.lat;

        const b = bounds.toBBoxString().split(',').map(Number); // [west, south, east, north]
        const domainWest = b[0], domainSouth = b[1], domainEast = b[2], domainNorth = b[3];
        const domainLonR = domainEast - domainWest;
        const domainLatR = domainNorth - domainSouth;

        for (let i = 0; i < this.numParticles; i++) {
            const idx = i * 3;
            let px = this.particles[idx];
            let py = this.particles[idx + 1];
            let page = this.particles[idx + 2];

            if (page > this.maxAge) {
                px = Math.random() * w;
                py = Math.random() * h;
                page = 0;
            }

            // High-performance linear interpolation for lat/lon
            const pLon = nw.lng + (px / w) * lonRange;
            const pLat = nw.lat + (py / h) * latRange;

            // Map LatLng to Grid indices
            const col = Math.floor((pLon - domainWest) / domainLonR * gNx);
            const row = Math.floor((pLat - domainSouth) / domainLatR * gNy);

            if (col >= 0 && col < gNx && row >= 0 && row < gNy) {
                const gIdx = row * gNx + col;
                const speed = tws[gIdx] || 0;
                const dir = ((twd[gIdx] || 0) + 180) * (Math.PI / 180);

                const vx = Math.sin(dir) * speed * this.speedFactor * 0.12 * timeScale;
                const vy = -Math.cos(dir) * speed * this.speedFactor * 0.12 * timeScale;

                this.ctx.moveTo(px, py);
                px += vx;
                py += vy;
                this.ctx.lineTo(px, py);
                page++;

                // Respawn if out of viewport
                if (px < 0 || px > w || py < 0 || py > h) {
                    page = this.maxAge + 1;
                }
            } else {
                px = Math.random() * w;
                py = Math.random() * h;
                page = 0;
            }

            this.particles[idx] = px;
            this.particles[idx + 1] = py;
            this.particles[idx + 2] = page;
        }
        this.ctx.stroke();

        this.animFrame = requestAnimationFrame((newTime) => this.render(newTime));
    }
}

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

function getRampColor(val, ramp) {
    if (!ramp) ramp = COLOR_RAMPS.wind;
    const first = ramp[0];
    const last = ramp[ramp.length - 1];

    const getColor = (stop) => ({
        r: stop.c[0], g: stop.c[1], b: stop.c[2],
        a: stop.c.length > 3 ? stop.c[3] : 1.0
    });

    if (val <= first.v) return getColor(first);
    if (val >= last.v) return getColor(last);

    for (let i = 0; i < ramp.length - 1; i++) {
        const r1 = ramp[i];
        const r2 = ramp[i + 1];
        if (val >= r1.v && val <= r2.v) {
            const p = (val - r1.v) / (r2.v - r1.v);
            const c1 = getColor(r1);
            const c2 = getColor(r2);
            return {
                r: Math.round(c1.r + (c2.r - c1.r) * p),
                g: Math.round(c1.g + (c2.g - c1.g) * p),
                b: Math.round(c1.b + (c2.b - c1.b) * p),
                a: c1.a + (c2.a - c1.a) * p
            };
        }
    }
    return { r: 0, g: 0, b: 0, a: 0 };
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

    // MultiPolyline es increíblemente eficiente para miles de segmentos
    L.polyline(lines, {
        color: color,
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
            weight: 1.5,
            lineCap: 'round',
            lineJoin: 'round',
            interactive: false
        }).addTo(state.vectorLayerGroup);
    }
};



/**
 * Update Dynamic Scale UI
 */
function updateDynamicScale(varId) {
    const ramp = getRampForVariable(varId);
    if (!ramp || !els.dynamicScale) return;

    const gridData = state.gridDataMap[varId];
    let unit = (gridData && gridData.units) || 'kt';

    // Fallback to manifest units if grid not loaded
    if (!gridData && state.manifest && state.manifest.configuration.variables) {
        const v = state.manifest.configuration.variables.find(x => x.id === varId) ||
            state.manifest.configuration.layers.find(x => x.id === varId);
        if (v) unit = v.units;
    }
    const lastStop = ramp[ramp.length - 1];
    const maxVal = lastStop.v;
    const minVal = ramp[0].v;

    // Generate gradient stops
    const gradientStops = ramp.map((stop, i) => {
        const pct = ((stop.v - minVal) / (maxVal - minVal) * 100).toFixed(0);
        const r = stop.c[0];
        const g = stop.c[1];
        const b = stop.c[2];
        const a = stop.c.length > 3 ? stop.c[3] : 1.0;
        // Legend should show the true color clearly, ignoring alpha so it doesn't blend invisibly into the DOM background.
        // Or if transparency is desired in the legend, use rgba(). For clarity in meteorology ramps, forcing opaque rgb is often best.
        // Let's use rgba but with a minimum opacity so it's visible, or just force rgb.
        return `rgb(${r}, ${g}, ${b}) ${pct}%`;
    }).join(', ');

    els.dynamicScale.innerHTML = `
        <div class="scale-header">
            <span class="scale-unit">${unit}</span>
        </div>
        <div class="scale-body">
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
}

const COLOR_RAMPS = {
    // Wind Speed (km/h) - 15 levels (0-60 typical)
    wind: [
        { v: 0.0, c: [239, 239, 239, 0.4] },
        { v: 4.3, c: [166, 206, 227, 0.6] },
        { v: 8.6, c: [31, 120, 180, 0.7] },
        { v: 12.9, c: [178, 223, 138, 0.7] },
        { v: 17.1, c: [51, 160, 44, 0.7] },
        { v: 21.4, c: [255, 242, 138, 0.7] },
        { v: 25.7, c: [255, 228, 0, 0.8] },
        { v: 30.0, c: [253, 191, 111, 0.8] },
        { v: 34.3, c: [255, 127, 0, 0.8] },
        { v: 38.6, c: [251, 154, 153, 0.9] },
        { v: 42.9, c: [227, 26, 28, 0.9] },
        { v: 47.1, c: [202, 178, 214, 0.9] },
        { v: 51.4, c: [106, 61, 154, 0.9] },
        { v: 55.7, c: [148, 0, 87, 0.9] },
        { v: 60.0, c: [80, 0, 40, 0.9] }
    ],

    // Rain (mm/h) - Custom ramp from colormaps.py
    rain: [
        { v: 0.0, c: [255, 255, 255, 0.0] },
        { v: 0.1, c: [154, 231, 236, 0.2] },
        { v: 0.5, c: [154, 231, 236, 0.9] },
        { v: 1.0, c: [31, 120, 180, 0.9] },
        { v: 2.0, c: [178, 223, 138, 0.9] },
        { v: 4.0, c: [51, 160, 44, 0.9] },
        { v: 8.0, c: [255, 242, 138, 0.9] },
        { v: 12.0, c: [255, 228, 0, 0.9] },
        { v: 16.0, c: [253, 191, 111, 0.9] },
        { v: 20.0, c: [255, 127, 0, 0.9] }
    ],

    // Convergences (m/s) - 15 levels (-3 to 3)
    convergencias: [
        { v: -3.0, c: [0, 67, 196, 0.7] },
        { v: -2.6, c: [31, 120, 180, 0.7] },
        { v: -2.1, c: [166, 206, 227, 0.7] },
        { v: -1.7, c: [0, 169, 167, 0.7] },
        { v: -1.3, c: [152, 235, 238, 0.7] },
        { v: -0.8, c: [51, 160, 44, 0.7] },
        { v: -0.4, c: [178, 223, 138, 0.7] },
        { v: 0.0, c: [248, 253, 133, 0.2] },
        { v: 0.4, c: [255, 228, 0, 0.7] },
        { v: 0.8, c: [253, 191, 111, 0.7] },
        { v: 1.3, c: [255, 127, 0, 0.7] },
        { v: 1.7, c: [251, 154, 153, 0.7] },
        { v: 2.1, c: [227, 26, 28, 0.7] },
        { v: 2.6, c: [202, 178, 214, 0.7] },
        { v: 3.0, c: [106, 61, 154, 0.7] }
    ],

    // Thermals (m/star) - 17 levels (0-3.75)
    thermals: [
        { v: 0.00, c: [239, 239, 239, 0.4] },
        { v: 0.23, c: [203, 223, 233, 0.4] },
        { v: 0.47, c: [166, 206, 227, 0.5] },
        { v: 0.70, c: [31, 120, 180, 0.6] },
        { v: 0.94, c: [208, 231, 189, 0.6] },
        { v: 1.17, c: [178, 223, 138, 0.7] },
        { v: 1.41, c: [51, 160, 44, 0.7] },
        { v: 1.64, c: [244, 246, 186, 0.7] },
        { v: 1.88, c: [248, 253, 133, 0.8] },
        { v: 2.11, c: [255, 228, 0, 0.8] },
        { v: 2.34, c: [246, 215, 175, 0.8] },
        { v: 2.58, c: [253, 191, 111, 0.8] },
        { v: 2.81, c: [255, 127, 0, 0.9] },
        { v: 3.05, c: [245, 197, 196, 0.9] },
        { v: 3.28, c: [251, 154, 153, 0.9] },
        { v: 3.52, c: [227, 26, 28, 0.9] },
        { v: 3.75, c: [127, 0, 0, 0.9] }
    ],

    // Clouds (%)
    clouds: [
        { v: 0, c: [255, 255, 255, 0.0] },
        { v: 10, c: [255, 255, 255, 0.05] },
        { v: 30, c: [250, 250, 250, 0.2] },
        { v: 50, c: [240, 240, 240, 0.35] },
        { v: 70, c: [225, 225, 225, 0.5] },
        { v: 85, c: [210, 210, 210, 0.6] },
        { v: 100, c: [195, 195, 205, 0.7] } // Opacidad limitada a 0.7 para nunca tapar el mapa geográfico
    ],

    // Cloud Fraction (0.0 to 1.0) para variables como low_cloudfrac, mid_cloudfrac, high_cloudfrac
    clouds_frac: [
        { v: 0.0, c: [255, 255, 255, 0.0] },
        { v: 0.1, c: [255, 255, 255, 0.05] },
        { v: 0.3, c: [250, 250, 250, 0.15] },
        { v: 0.5, c: [240, 240, 240, 0.3] },
        { v: 0.7, c: [225, 225, 225, 0.45] },
        { v: 0.85, c: [210, 210, 210, 0.55] },
        { v: 1.0, c: [195, 195, 205, 0.65] } // Opacidad pico de 0.65 para permitir la suma de capas (low+mid+high)
    ],

    // CAPE (J/kg)
    cape: [
        { v: 0, c: [166, 206, 227, 0.5] },
        { v: 111, c: [31, 120, 180, 0.6] },
        { v: 370, c: [178, 223, 138, 0.7] },
        { v: 926, c: [51, 160, 44, 0.7] },
        { v: 1963, c: [253, 191, 111, 0.8] },
        { v: 3000, c: [255, 127, 0, 0.9] }
    ],

    // Temperature (ºC) - Rainbow ramp (-5 to 45)
    temperature: [
        { v: -5, c: [128, 0, 128, 0.7] },
        { v: 0, c: [0, 0, 255, 0.7] },
        { v: 5, c: [0, 150, 255, 0.7] },
        { v: 10, c: [0, 255, 255, 0.7] },
        { v: 15, c: [0, 255, 0, 0.7] },
        { v: 20, c: [150, 255, 0, 0.7] },
        { v: 25, c: [255, 255, 0, 0.7] },
        { v: 30, c: [255, 200, 0, 0.7] },
        { v: 35, c: [255, 127, 0, 0.7] },
        { v: 40, c: [255, 0, 0, 0.7] },
        { v: 45, c: [150, 0, 0, 0.7] }
    ],

    // Heights (m) - Proportional to WindSpeed palette (500-4000)
    heights: [
        { v: 500, c: [239, 239, 239, 0.4] },
        { v: 750, c: [166, 206, 227, 0.6] },
        { v: 1000, c: [31, 120, 180, 0.7] },
        { v: 1250, c: [178, 223, 138, 0.7] },
        { v: 1500, c: [51, 160, 44, 0.7] },
        { v: 1750, c: [255, 242, 138, 0.7] },
        { v: 2000, c: [255, 228, 0, 0.8] },
        { v: 2250, c: [253, 191, 111, 0.8] },
        { v: 2500, c: [255, 127, 0, 0.8] },
        { v: 2750, c: [251, 154, 153, 0.9] },
        { v: 3000, c: [227, 26, 28, 0.9] },
        { v: 3250, c: [202, 178, 214, 0.9] },
        { v: 3500, c: [106, 61, 154, 0.9] },
        { v: 3750, c: [148, 0, 87, 0.9] },
        { v: 4000, c: [80, 0, 40, 0.9] }
    ]
};

function isCloudVariable(varId) {
    if (!varId) return false;
    const v = varId.toLowerCase();
    let title = '';

    // Buscar en manifest para chequear el nombre
    if (state.manifest && state.manifest.configuration) {
        let l = null;
        if (state.manifest.configuration.layers) l = state.manifest.configuration.layers.find(x => x.id === varId);
        if (!l && state.manifest.configuration.variables) l = state.manifest.configuration.variables.find(x => x.id === varId);
        if (l && l.title) title = l.title.toLowerCase();
    }

    // Detect typical WRF cloud ids: hcc, mcc, lcc, cloudfrac, blcloudpct
    return v.includes('cloud') || v.includes('cfrac') || v.includes('cld') || v.includes('nub') ||
        v === 'hcc' || v === 'mcc' || v === 'lcc' ||
        title.includes('nube') || title.includes('nubosidad') || title.includes('cloud');
}

function getRampForVariable(varId) {
    if (!varId) return COLOR_RAMPS.wind;
    const v = varId.toLowerCase();
    if (v.includes('wind')) return COLOR_RAMPS.wind;
    if (v === 'rain') return COLOR_RAMPS.rain;
    if (v === 'wblmaxmin') return COLOR_RAMPS.convergencias;
    if (v === 'wstar') return COLOR_RAMPS.thermals;
    if (v.includes('cloudfrac') || v.includes('cfrac') || v === 'hcc' || v === 'mcc' || v === 'lcc') return COLOR_RAMPS.clouds_frac;
    if (isCloudVariable(varId)) return COLOR_RAMPS.clouds;
    if (v === 'cape') return COLOR_RAMPS.cape;
    if (v === 't2m' || v.includes('temp')) return COLOR_RAMPS.temperature;
    if (v === 'hglider' || v.includes('zbl') || v.includes('zsf')) return COLOR_RAMPS.heights;
    return COLOR_RAMPS.wind;
}

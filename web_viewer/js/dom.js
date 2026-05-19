/**
 * Referencias a elementos DOM do visor (unha soa fonte de verdade).
 */
export const els = {
    dateSelector: document.getElementById('date-selector'),
    varSelector: null,
    modeSelector: document.getElementById('mode-selector'),
    varGroup: null,
    modeGroup: document.getElementById('mode-group'),
    opacitySlider: document.getElementById('opacity-slider'),
    variableOpacitySlider: document.getElementById('variable-opacity-slider'),
    overlayContainer: document.getElementById('overlay-container'),
    timelineControls: document.querySelector('.timeline-controls'),
    imgSounding: document.getElementById('img-sounding'),
    imgMeteogram: document.getElementById('img-meteogram'),
    imgScale: document.getElementById('img-scale'),
    timeSelector: document.getElementById('time-selector'),
    lastUpdated: document.getElementById('last-updated'),
    closeModalBtn: document.getElementById('close-modal'),
    windTooltip: document.getElementById('wind-tooltip'),
    wtStationName: document.getElementById('wt-station-name'),
    wtVarName: document.getElementById('wt-var-name') || document.createElement('div'),
    wtValue: document.getElementById('wt-value') || document.getElementById('wt-speed'),
    wtUnits: document.getElementById('wt-units') || document.createElement('span'),
    wtDirDeg: document.getElementById('wt-dir-deg'),
    wtDirArrow: document.getElementById('wt-dir-arrow'),
    windParticles: null,
    mapContainer: document.getElementById('map'),
    dynamicScale: document.getElementById('dynamic-scale')
};

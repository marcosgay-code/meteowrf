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
    wtRows: document.getElementById('wt-rows'),
    windParticles: null,
    mapContainer: document.getElementById('map'),
    dynamicScale: document.getElementById('dynamic-scale')
};

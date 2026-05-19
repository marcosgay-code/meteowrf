/**
 * Vectorización de viento WRF: streamlines nativos en Leaflet.
 * Requiere Leaflet global (L), store.js e map.js.
 */
import { state } from './store.js';
import { getDomainBounds } from './map.js';

/**
 * Renderiza liñas de corrente (streamlines) a partir dun grid de vento.
 * @param {object} gridData Grid con twsKn e twdDeg
 */
export function renderStreamlinesNative(gridData) {
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

    const seedStep = Math.max(0.5, 3 / zoomMag);
    const maxSegments = 120;

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

    const ds = 0.5;
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
    const lineOp = state.variableLayerOpacity;

    L.polyline(lines, {
        color: color,
        opacity: lineOp,
        weight: 1.0,
        lineCap: 'round',
        lineJoin: 'round',
        interactive: false
    }).addTo(state.vectorLayerGroup);

    const arrowLines = [];
    const arrowLenScreen = 4.5;

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
            opacity: lineOp,
            weight: 1.5,
            lineCap: 'round',
            lineJoin: 'round',
            interactive: false
        }).addTo(state.vectorLayerGroup);
    }
}

/**
 * Adaptador para capas vectoriais: pinta streamlines e devolve o marcador esperado por map.js.
 * @param {object} gridData
 * @param {string} _mode Reservado (barbas / streamlines no futuro)
 * @returns {string|null}
 */
export function generateVectorImageDataURL(gridData, _mode) {
    if (!gridData?.grid?.twsKn) return null;
    renderStreamlinesNative(gridData);
    return 'STREAMLINES_NATIVE';
}

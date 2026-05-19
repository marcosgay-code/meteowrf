/**
 * Rasterización de grids WRF a data URL (canvas).
 * Función pura respecto a state: recibe grid + rampa de color.
 */
import { getRampColor } from './utils.js';

/**
 * @param {object} gridData JSON del grid WRF
 * @param {object} ramp Rampa de color (desde getRampForVariable)
 * @returns {string|null} data URL PNG o null si non hai datos
 */
export function generateGridImageDataURL(gridData, ramp) {
    if (!gridData || !gridData.grid || (!gridData.grid.twsKn && !gridData.grid.values)) return null;
    const g = gridData.grid;
    const nx = g.nx;
    const ny = g.ny;
    const vals = g.twsKn || g.values;
    const canvas = document.createElement('canvas');
    canvas.width = nx;
    canvas.height = ny;
    const ctx = canvas.getContext('2d');
    const imgData = ctx.createImageData(nx, ny);
    const data = imgData.data;
    for (let y = 0; y < ny; y++) {
        for (let x = 0; x < nx; x++) {
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

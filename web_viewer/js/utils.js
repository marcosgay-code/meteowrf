/**
 * Utilidades puras: constantes, ramps de cor e helpers sen DOM/state.
 * Constantes e utilidades compartidas do visor.
 */

// ============================================
// CONSTANTES
// ============================================

export const LS_UI_MODE_KEY = 'meteonube_ui_mode';
export const LS_OPACITY_MAP_KEY = 'meteowrf_layer_opacity';
export const LS_OPACITY_VARS_KEY = 'meteowrf_variable_layer_opacity';

export const SIMPLE_SCALAR_IDS = ['sfcwind', 't2m'];
export const SIMPLE_LAYER_IDS = ['rain', 'blcloudpct'];

/** Non mostrar na UI (chips nin despregable mapa); seguen no manifest/backend */
export const HIDDEN_UI_VAR_IDS = new Set(['blwind', 'bltopwind']);

export const WIND_VAR_IDS = new Set(['sfcwind', 'wind1500', 'wind2000', 'wind2500', 'wind3000', 'blwind', 'bltopwind', 'wblmaxmin']);
export const CLOUD_VAR_IDS = new Set(['zblcl', 'zsfclcl', 'hglider', 'cape']);
/** Ventos con campo vector/partículas (exclúe p.ex. converxencias e vars só backend) */
export const WIND_SPEED_VAR_IDS = new Set(['sfcwind', 'wind1500', 'wind2000', 'wind2500', 'wind3000']);

export const VAR_SHORT_LABELS = {
    sfcwind: '',
    wind1500: '1.5',
    wind2000: '2',
    wind2500: '2.5',
    wind3000: '3',
    wblmaxmin: '',
    hglider: 'Teito',
    wstar: 'Térmica',
    cape: 'CAPE',
    zblcl: 'Base',
    zsfclcl: 'Base Cu',
    t2m: '🌡️'
};

export const LAYER_SHORT_LABELS = {
    lowfrac: 'Baixa',
    midfrac: 'Media',
    highfrac: 'Alta',
    blcloudpct: '',
    rain: '🌧️'
};

export const LAYER_ICONS = { blcloudpct: 'icons/nube.svg?v=1' };

export const VAR_ICONS = {
    wblmaxmin: 'icons/converxencia.png?v=1',
    sfcwind: 'icons/viento.png?v=1'
};

export const LAYER_ORDER = ['blcloudpct', 'lowfrac', 'midfrac', 'highfrac', 'rain'];

// ============================================
// COLOR RAMPS
// ============================================

export const COLOR_RAMPS = {
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
        { v: 100, c: [195, 195, 205, 0.7] }
    ],

    // Cloud Fraction (0.0 to 1.0)
    clouds_frac: [
        { v: 0.0, c: [255, 255, 255, 0.0] },
        { v: 0.1, c: [255, 255, 255, 0.05] },
        { v: 0.3, c: [250, 250, 250, 0.15] },
        { v: 0.5, c: [240, 240, 240, 0.3] },
        { v: 0.7, c: [225, 225, 225, 0.45] },
        { v: 0.85, c: [210, 210, 210, 0.55] },
        { v: 1.0, c: [195, 195, 205, 0.65] }
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

// ============================================
// FUNCIÓNS PURAS
// ============================================

export function getRampColor(val, ramp) {
    if (!ramp) ramp = COLOR_RAMPS.wind;
    const first = ramp[0];
    const last = ramp[ramp.length - 1];

    const getColor = (stop) => ({
        r: stop.c[0],
        g: stop.c[1],
        b: stop.c[2],
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

/**
 * @param {string} varId
 * @param {object|null} [manifest] manifest.json (opcional, para títulos)
 */
export function isCloudVariable(varId, manifest = null) {
    if (!varId) return false;
    const v = varId.toLowerCase();
    let title = '';

    if (manifest?.configuration) {
        let l = null;
        if (manifest.configuration.layers) {
            l = manifest.configuration.layers.find((x) => x.id === varId);
        }
        if (!l && manifest.configuration.variables) {
            l = manifest.configuration.variables.find((x) => x.id === varId);
        }
        if (l?.title) title = l.title.toLowerCase();
    }

    return (
        v.includes('cloud') ||
        v.includes('cfrac') ||
        v.includes('cld') ||
        v.includes('nub') ||
        v === 'hcc' ||
        v === 'mcc' ||
        v === 'lcc' ||
        title.includes('nube') ||
        title.includes('nubosidad') ||
        title.includes('cloud')
    );
}

/**
 * @param {string} varId
 * @param {object|null} [manifest]
 */
export function getRampForVariable(varId, manifest = null) {
    if (!varId) return COLOR_RAMPS.wind;
    const v = varId.toLowerCase();
    if (v.includes('wind')) return COLOR_RAMPS.wind;
    if (v === 'rain') return COLOR_RAMPS.rain;
    if (v === 'wblmaxmin') return COLOR_RAMPS.convergencias;
    if (v === 'wstar') return COLOR_RAMPS.thermals;
    if (v.includes('cloudfrac') || v.includes('cfrac') || v === 'hcc' || v === 'mcc' || v === 'lcc') {
        return COLOR_RAMPS.clouds_frac;
    }
    if (isCloudVariable(varId, manifest)) return COLOR_RAMPS.clouds;
    if (v === 'cape') return COLOR_RAMPS.cape;
    if (v === 't2m' || v.includes('temp')) return COLOR_RAMPS.temperature;
    if (v === 'hglider' || v.includes('zbl') || v.includes('zsf')) return COLOR_RAMPS.heights;
    return COLOR_RAMPS.wind;
}

export function formatLastUpdatedForDisplay(raw) {
    if (!raw) return '';
    const s = String(raw).trim();
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
    let date;
    if (m) {
        date = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
    } else {
        date = new Date(s);
        if (Number.isNaN(date.getTime())) return '';
    }
    const dayNum = date.getDate();
    let monthLbl = '';
    try {
        monthLbl = new Intl.DateTimeFormat('gl-ES', { month: 'short' }).format(date);
    } catch {
        monthLbl = new Intl.DateTimeFormat('es-ES', { month: 'short' }).format(date);
    }
    monthLbl = monthLbl.replace(/\./g, '').trim();
    const hh = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    return `${dayNum} ${monthLbl} ${hh}:${min}`;
}

/** Iniciais do selector de data: L, M, X (mércores), J, V, S, D */
const WEEKDAY_SELECTOR_LETTERS = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];

function localDayKey(d) {
    return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

/** Etiqueta do selector de data: «L 24 maio», «M hoxe», «X mañá», etc. */
export function formatDateSelectorLabel(isoDate) {
    const parts = String(isoDate).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!parts) return isoDate;
    const date = new Date(+parts[1], +parts[2] - 1, +parts[3]);
    if (Number.isNaN(date.getTime())) return isoDate;

    const dayLetter = WEEKDAY_SELECTOR_LETTERS[date.getDay()];
    const today = new Date();
    const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    const targetKey = localDayKey(date);

    if (targetKey === localDayKey(today)) return `${dayLetter} hoxe`;
    if (targetKey === localDayKey(tomorrow)) return `${dayLetter} mañá`;

    let month = '';
    try {
        month = new Intl.DateTimeFormat('gl-ES', { month: 'long' }).format(date);
    } catch {
        month = new Intl.DateTimeFormat('es-ES', { month: 'long' }).format(date);
    }
    month = month.replace(/\./g, '').trim().toLowerCase();

    const dayNum = date.getDate();
    const month5 = month.slice(0, 5);

    return `${dayLetter} ${dayNum} ${month5}`;
}

export function getTimeString(h) {
    return h.toString().padStart(2, '0') + '00';
}

export function scalarVarCategory(varId) {
    if (WIND_VAR_IDS.has(varId)) return 'wind';
    if (CLOUD_VAR_IDS.has(varId)) return 'cloud';
    return 'other';
}

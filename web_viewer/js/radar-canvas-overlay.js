/**
 * Capa Leaflet: imaxe radar deformada aos 4 vértices xeográficos (NW, NE, SE, SW).
 * Equivalente funcional ao imageCanvasOverlay de AEMET, con warping por canvas.
 */

/** @typedef {[L.LatLng, L.LatLng, L.LatLng, L.LatLng]} RadarCorners */

const RadarCanvasOverlay = L.Layer.extend({
    options: {
        opacity: 1,
        interactive: false,
        className: 'leaflet-radar-canvas-overlay'
    },

    initialize(url, corners, options) {
        this._url = url;
        this._corners = normalizeCorners(corners);
        L.setOptions(this, options);
    },

    onAdd(map) {
        this._map = map;
        this._initContainer();
        this._loadImage();
        this.getPane().appendChild(this._container);
        map.on('move zoom viewreset resize', this._redraw, this);
        if (map.options.zoomAnimation) {
            map.on('zoomanim', this._animateZoom, this);
        }
        this._redraw();
    },

    onRemove() {
        const map = this._map;
        if (map) {
            map.off('move zoom viewreset resize', this._redraw, this);
            map.off('zoomanim', this._animateZoom, this);
        }
        L.DomUtil.remove(this._container);
        this._container = null;
        this._canvas = null;
        this._image = null;
        this._map = null;
    },

    setUrl(url) {
        if (this._url === url && this._imageLoaded) return this;
        this._url = url;
        this._imageLoaded = false;
        this._loadImage();
        return this;
    },

    setCorners(corners) {
        this._corners = normalizeCorners(corners);
        this._redraw();
        return this;
    },

    setBounds(bounds) {
        return this.setCorners(bounds);
    },

    setOpacity(opacity) {
        this.options.opacity = opacity;
        this._redraw();
        return this;
    },

    getBounds() {
        return L.latLngBounds(this._corners);
    },

    getElement() {
        return this._canvas;
    },

    _initContainer() {
        this._container = L.DomUtil.create('div', this.options.className);
        this._canvas = L.DomUtil.create('canvas', '', this._container);
        this._canvas.style.pointerEvents = this.options.interactive ? 'auto' : 'none';
    },

    _loadImage() {
        if (!this._image) {
            this._image = L.DomUtil.create('img', 'leaflet-radar-canvas-overlay__img');
            this._image.decoding = 'async';
        }
        this._imageLoaded = false;
        this._image.onload = () => {
            this._imageLoaded = true;
            this.fire('load');
            this._redraw();
        };
        this._image.onerror = () => {
            this._imageLoaded = false;
            this.fire('error');
        };
        this._image.src = this._url;
    },

    _animateZoom(e) {
        if (!this._map || !this._container) return;
        const scale = this._map.getZoomScale(e.zoom);
        const offset = this._map._latLngBoundsToNewLayerBounds(this.getBounds(), e.zoom, e.center).min;
        L.DomUtil.setTransform(this._container, offset, scale);
    },

    _redraw() {
        if (!this._map || !this._canvas || !this._imageLoaded) return;

        L.DomUtil.setTransform(this._container, null, 1);

        const pts = this._corners.map((ll) => this._map.latLngToLayerPoint(ll));
        const xs = pts.map((p) => p.x);
        const ys = pts.map((p) => p.y);
        const minX = Math.min(...xs);
        const minY = Math.min(...ys);
        const maxX = Math.max(...xs);
        const maxY = Math.max(...ys);
        const w = Math.max(1, Math.ceil(maxX - minX));
        const h = Math.max(1, Math.ceil(maxY - minY));

        L.DomUtil.setPosition(this._container, L.point(minX, minY));
        this._canvas.width = w;
        this._canvas.height = h;
        this._canvas.style.width = `${w}px`;
        this._canvas.style.height = `${h}px`;

        const ctx = this._canvas.getContext('2d');
        ctx.clearRect(0, 0, w, h);
        ctx.globalAlpha = this.options.opacity;

        const local = pts.map((p) => L.point(p.x - minX, p.y - minY));
        const img = this._image;
        const iw = img.naturalWidth || img.width;
        const ih = img.naturalHeight || img.height;

        // NW, NE, SE, SW → dúas triangles para cubrir o cuadrilátero
        drawImageTriangle(ctx, img,
            0, 0, iw, 0, iw, ih,
            local[0].x, local[0].y, local[1].x, local[1].y, local[2].x, local[2].y);
        drawImageTriangle(ctx, img,
            0, 0, iw, ih, 0, ih,
            local[0].x, local[0].y, local[2].x, local[2].y, local[3].x, local[3].y);
    }
});

/** Converte anel AEMET [[lng,lat],…] en [NW, NE, SE, SW]. Orde API: SE, NE, NW, SW. */
export function cornersFromAemetRing(ring, center = null) {
    if (!Array.isArray(ring) || ring.length < 4) return null;
    const pts = ring.map((p) => {
        if (!Array.isArray(p) || p.length < 2) return null;
        const lng = Number(p[0]);
        const lat = Number(p[1]);
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
        return L.latLng(lat, lng);
    });
    if (pts.some((p) => !p)) return null;

    const lats = pts.map((p) => p.lat);
    const lngs = pts.map((p) => p.lng);
    const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
    const midLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;
    const latSpan = Math.max(...lats) - Math.min(...lats);
    const lngSpan = Math.max(...lngs) - Math.min(...lngs);
    const refLat = center?.lat ?? 43.17;
    const refLng = center?.lng ?? -8.53;
    const nearRadar = Math.abs(midLat - refLat) < 10 && Math.abs(midLng - refLng) < 12;
    const plausible = latSpan > 4 && lngSpan > 4 && latSpan < 25 && lngSpan < 30;
    if (!nearRadar || !plausible) return null;

    if (ring.length >= 4 && ring.length <= 5) {
        // Orde oficial AEMET: 0=SE, 1=NE, 2=NW, 3=SW
        return [pts[2], pts[1], pts[0], pts[3]];
    }

    const north = Math.max(...lats);
    const south = Math.min(...lats);
    const east = Math.max(...lngs);
    const west = Math.min(...lngs);
    return [
        L.latLng(north, west),
        L.latLng(north, east),
        L.latLng(south, east),
        L.latLng(south, west)
    ];
}

export function cornersFromBounds(bounds) {
    const b = L.latLngBounds(bounds);
    return [b.getNorthWest(), b.getNorthEast(), b.getSouthEast(), b.getSouthWest()];
}

/** true se NW/NE comparten lat e NW/SW comparten lng (rectángulo alineado ao mapa). */
export function cornersAreAxisAligned(corners, eps = 1e-5) {
    const [nw, ne, se, sw] = normalizeCorners(corners);
    return (
        Math.abs(nw.lat - ne.lat) < eps
        && Math.abs(sw.lat - se.lat) < eps
        && Math.abs(nw.lng - sw.lng) < eps
        && Math.abs(ne.lng - se.lng) < eps
    );
}

export function cornersToBounds(corners) {
    return L.latLngBounds(normalizeCorners(corners));
}

/**
 * Crea a capa radar: imageOverlay (rápido) se as esquinas son rectángulo;
 * canvas con warping só se o cuadrilátero está deformado.
 */
export function createRadarOverlay(url, corners, options) {
    if (cornersAreAxisAligned(corners)) {
        const layer = L.imageOverlay(url, cornersToBounds(corners), options);
        layer.setCorners = function setCorners(c) {
            return this.setBounds(cornersToBounds(c));
        };
        return layer;
    }
    return new RadarCanvasOverlay(url, corners, options);
}

/** @deprecated Usar createRadarOverlay */
export function createRadarCanvasOverlay(url, corners, options) {
    return createRadarOverlay(url, corners, options);
}

function normalizeCorners(corners) {
    if (corners && typeof corners.getNorthWest === 'function') {
        return cornersFromBounds(corners);
    }
    if (!Array.isArray(corners) || corners.length < 4) {
        throw new Error('RadarCanvasOverlay requires 4 corners');
    }
    return corners.slice(0, 4).map((c) => L.latLng(c));
}

/** Afín: triángulo orixe (imaxe) → triángulo destino (mapa). */
function drawImageTriangle(ctx, img, sx0, sy0, sx1, sy1, sx2, sy2, dx0, dy0, dx1, dy1, dx2, dy2) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(dx0, dy0);
    ctx.lineTo(dx1, dy1);
    ctx.lineTo(dx2, dy2);
    ctx.closePath();
    ctx.clip();

    const denom = sx0 * (sy2 - sy1) - sx1 * sy2 + sx2 * sy1 + (sx1 - sx2) * sy0;
    if (Math.abs(denom) < 1e-12) {
        ctx.restore();
        return;
    }

    const m11 = -(sy0 * (dx2 - dx1) - sy1 * dx2 + sy2 * dx1 + (sy1 - sy2) * dx0) / denom;
    const m12 = (sx1 * dx2 + sx0 * (dx1 - dx2) - sx2 * dx1 + (sx2 - sx1) * dx0) / denom;
    const m21 = (sy0 * (dy2 - dy1) - sy1 * dy2 + sy2 * dy1 + (sy1 - sy2) * dy0) / denom;
    const m22 = -(sx1 * dy2 + sx0 * (dy1 - dy2) - sx2 * dy1 + (sx2 - sx1) * dy0) / denom;
    const dx = (sx0 * (sy2 * dy1 - sy1 * dy2) + sy0 * (sx1 * dy2 - sx2 * dy1) + (sx2 * sy1 - sx1 * sy2) * dy0) / denom;
    const dy = (sx0 * (sy1 * dx2 - sy2 * dx1) + sy0 * (sx2 * dx1 - sx1 * dx2) + (sx1 * sy2 - sx2 * sy1) * dx0) / denom;

    ctx.transform(m11, m12, m21, m22, dx, dy);
    ctx.drawImage(img, 0, 0);
    ctx.restore();
}

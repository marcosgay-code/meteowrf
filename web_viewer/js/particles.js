/**
 * Motor de partículas para animación de viento (WRF).
 * Dependencias do mapa/estado inxéctanse con setContext() — sen usar window.
 */

export class WindParticles {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas ? canvas.getContext('2d') : null;
        this.grid = null;
        this.animFrame = null;
        this.numParticles = 800;
        this.maxAge = 80;
        this.speedFactor = 0.8;
        this.particleColor = 'rgba(0, 255, 255, 0.8)';
        this.particles = new Float32Array(this.numParticles * 3);
        this.lastTime = null;
        this._getMap = null;
        this._getParticlesPaused = null;
        this._getDomainBounds = null;
    }

    /** @param {{ getMap: () => object, getParticlesPaused: () => boolean, getDomainBounds: () => object }} ctx */
    setContext(ctx) {
        if (!ctx) return;
        this._getMap = ctx.getMap;
        this._getParticlesPaused = ctx.getParticlesPaused;
        this._getDomainBounds = ctx.getDomainBounds;
    }

    /** Compatibilidade: só límites de dominio */
    setGetBoundsFn(fn) {
        this._getDomainBounds = fn;
    }

    _map() {
        return this._getMap ? this._getMap() : null;
    }

    _particlesPaused() {
        return this._getParticlesPaused ? this._getParticlesPaused() : false;
    }

    setGrid(gridData) {
        const grid = gridData && gridData.grid;
        if (!gridData || !grid) {
            this.grid = null;
            this.stop();
            return;
        }

        if (this.grid === grid && (this.animFrame || this._particlesPaused())) return;

        this.grid = grid;
        this.initParticles();

        if (this._particlesPaused()) {
            if (this.animFrame) {
                cancelAnimationFrame(this.animFrame);
                this.animFrame = null;
            }
            return;
        }
        this.start();
    }

    freezeAnimation() {
        if (this.animFrame) {
            cancelAnimationFrame(this.animFrame);
            this.animFrame = null;
        }
    }

    unfreezeAnimation() {
        if (this.grid && !this.animFrame) this.start();
    }

    initParticles() {
        if (!this.canvas) return;
        const w = this.canvas.width;
        const h = this.canvas.height;
        for (let i = 0; i < this.numParticles; i++) {
            this.particles[i * 3] = Math.random() * w;
            this.particles[i * 3 + 1] = Math.random() * h;
            this.particles[i * 3 + 2] = Math.random() * this.maxAge;
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
        const map = this._map();
        if (!map || !this.grid || !this.canvas || !this.canvas.width || !this.ctx) return;
        if (this._particlesPaused()) return;

        let deltaTime = time - (this.lastTime || time);
        this.lastTime = time;
        if (deltaTime > 100) deltaTime = 16.666;
        const timeScale = deltaTime / 16.666;

        const bounds = this._getDomainBounds ? this._getDomainBounds() : null;
        if (!bounds) return;

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

        const nw = map.containerPointToLatLng([0, 0]);
        const se = map.containerPointToLatLng([w, h]);
        const lonRange = se.lng - nw.lng;
        const latRange = se.lat - nw.lat;

        const b = bounds.toBBoxString().split(',').map(Number);
        const domainWest = b[0];
        const domainSouth = b[1];
        const domainEast = b[2];
        const domainNorth = b[3];
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

            const pLon = nw.lng + (px / w) * lonRange;
            const pLat = nw.lat + (py / h) * latRange;

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

        if (!this._particlesPaused()) {
            this.animFrame = requestAnimationFrame((newTime) => this.render(newTime));
        } else {
            this.animFrame = null;
        }
    }
}

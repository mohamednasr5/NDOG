/**
 * FILE NAME: js/particles.js
 * PURPOSE: Lightweight canvas particle system for hero backgrounds and 404 page.
 *          Auto-throttles on mobile and respects prefers-reduced-motion.
 * DEPENDENCIES: utils.js (isMobile)
 * EXPORTS: particles.mount, particles.unmount
 */

import { isMobile } from "./utils.js";

export const particles = {
  _raf: null,
  _canvas: null,
  _ctx: null,
  _particles: [],
  _running: false,
  _mouse: { x: -9999, y: -9999 },

  mount(targetEl, opts = {}) {
    if (!targetEl) return;
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) return;

    const canvas = document.createElement("canvas");
    canvas.className = "particle-canvas";
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:0;";
    targetEl.style.position = targetEl.style.position || "relative";
    targetEl.insertBefore(canvas, targetEl.firstChild);
    this._canvas = canvas;
    this._ctx = canvas.getContext("2d");
    this._opts = {
      count: opts.count || (isMobile() ? 30 : 80),
      color: opts.color || "#f59e0b",
      linkColor: opts.linkColor || "rgba(245,158,11,0.15)",
      maxDist: opts.maxDist || 120,
      speed: opts.speed || 0.5,
      size: opts.size || 2,
      ...opts
    };
    this._resize();
    this._spawn();
    this._running = true;
    this._loop();

    window.addEventListener("resize", this._resize);
    window.addEventListener("mousemove", this._onMouse);
  },

  unmount() {
    this._running = false;
    cancelAnimationFrame(this._raf);
    window.removeEventListener("resize", this._resize);
    window.removeEventListener("mousemove", this._onMouse);
    if (this._canvas?.parentNode) this._canvas.parentNode.removeChild(this._canvas);
    this._canvas = null;
    this._ctx = null;
    this._particles = [];
  },

  _resize() {
    if (!this._canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = this._canvas.parentElement.getBoundingClientRect();
    this._canvas.width = r.width * dpr;
    this._canvas.height = r.height * dpr;
    this._canvas.style.width = r.width + "px";
    this._canvas.style.height = r.height + "px";
    this._ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  },

  _spawn() {
    const r = this._canvas.parentElement.getBoundingClientRect();
    this._particles = Array.from({ length: this._opts.count }, () => ({
      x: Math.random() * r.width,
      y: Math.random() * r.height,
      vx: (Math.random() - 0.5) * this._opts.speed,
      vy: (Math.random() - 0.5) * this._opts.speed,
      r: this._opts.size * (0.5 + Math.random() * 0.8)
    }));
  },

  _onMouse(e) {
    const r = this._canvas?.parentElement.getBoundingClientRect();
    if (!r) return;
    this._mouse.x = e.clientX - r.left;
    this._mouse.y = e.clientY - r.top;
  },

  _loop() {
    if (!this._running || !this._ctx) return;
    const r = this._canvas.parentElement.getBoundingClientRect();
    this._ctx.clearRect(0, 0, r.width, r.height);

    // Update + draw particles
    for (const p of this._particles) {
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0 || p.x > r.width) p.vx *= -1;
      if (p.y < 0 || p.y > r.height) p.vy *= -1;
      // Mouse repel
      const dx = p.x - this._mouse.x;
      const dy = p.y - this._mouse.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < 10000) {
        const d = Math.sqrt(d2) || 1;
        p.x += (dx / d) * 0.8;
        p.y += (dy / d) * 0.8;
      }
      this._ctx.beginPath();
      this._ctx.arc(p.x, p.y, Math.max(0.5, p.r), 0, Math.PI * 2);
      this._ctx.fillStyle = this._opts.color;
      this._ctx.globalAlpha = 0.7;
      this._ctx.fill();
    }

    // Draw links
    this._ctx.globalAlpha = 1;
    for (let i = 0; i < this._particles.length; i++) {
      for (let j = i + 1; j < this._particles.length; j++) {
        const a = this._particles[i];
        const b = this._particles[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < this._opts.maxDist) {
          this._ctx.beginPath();
          this._ctx.moveTo(a.x, a.y);
          this._ctx.lineTo(b.x, b.y);
          this._ctx.strokeStyle = this._opts.linkColor;
          this._ctx.globalAlpha = 1 - d / this._opts.maxDist;
          this._ctx.lineWidth = 0.6;
          this._ctx.stroke();
        }
      }
    }
    this._ctx.globalAlpha = 1;
    this._raf = requestAnimationFrame(() => this._loop());
  }
};

window.__particles = particles;

/**
 * FILE NAME: js/charts.js
 * PURPOSE: Tiny canvas chart library (no dependencies). Bar / line / donut.
 *          Used by dashboard, admin analytics, staking APR projection.
 * DEPENDENCIES: utils.js (formatNumber)
 * EXPORTS: charts.bar, charts.line, charts.donut, charts.sparkline
 */

import { formatNumber } from "./utils.js";

export const charts = {
  _ctx(canvas) {
    if (!canvas) return null;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight || 120;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx, w, h };
  },

  bar(canvas, labels, values, color = "#f59e0b") {
    const env = this._ctx(canvas);
    if (!env) return;
    const { ctx, w, h } = env;
    const pad = { l: 40, r: 10, t: 10, b: 24 };
    const cw = w - pad.l - pad.r;
    const ch = h - pad.t - pad.b;
    const max = Math.max(...values, 1);
    const bw = cw / values.length * 0.7;
    const gap = cw / values.length * 0.3;

    // Axis
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.l, pad.t);
    ctx.lineTo(pad.l, pad.t + ch);
    ctx.lineTo(pad.l + cw, pad.t + ch);
    ctx.stroke();

    // Bars
    values.forEach((v, i) => {
      const x = pad.l + i * (bw + gap) + gap / 2;
      const bh = (v / max) * ch;
      const y = pad.t + ch - bh;
      const grad = ctx.createLinearGradient(x, y, x, y + bh);
      grad.addColorStop(0, color);
      grad.addColorStop(1, color + "44");
      ctx.fillStyle = grad;
      ctx.fillRect(x, y, bw, bh);
      // Label
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.font = "10px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(labels[i], x + bw / 2, pad.t + ch + 14);
      ctx.fillText(formatNumber(v), x + bw / 2, y - 4);
    });
  },

  line(canvas, labels, values, color = "#f59e0b") {
    const env = this._ctx(canvas);
    if (!env) return;
    const { ctx, w, h } = env;
    const pad = { l: 40, r: 10, t: 10, b: 24 };
    const cw = w - pad.l - pad.r;
    const ch = h - pad.t - pad.b;
    const max = Math.max(...values, 1);
    const min = Math.min(...values, 0);
    const range = Math.max(max - min, 1);

    // Axis
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.l, pad.t);
    ctx.lineTo(pad.l, pad.t + ch);
    ctx.lineTo(pad.l + cw, pad.t + ch);
    ctx.stroke();

    // Line + area
    ctx.beginPath();
    const pts = values.map((v, i) => ({
      x: pad.l + (i / Math.max(values.length - 1, 1)) * cw,
      y: pad.t + ch - ((v - min) / range) * ch
    }));
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));

    // Fill area
    ctx.lineTo(pts[pts.length - 1].x, pad.t + ch);
    ctx.lineTo(pts[0].x, pad.t + ch);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, pad.t, 0, pad.t + ch);
    grad.addColorStop(0, color + "55");
    grad.addColorStop(1, color + "00");
    ctx.fillStyle = grad;
    ctx.fill();

    // Stroke line
    ctx.beginPath();
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Points
    pts.forEach((p, i) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    });

    // X labels
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.font = "10px sans-serif";
    ctx.textAlign = "center";
    labels.forEach((l, i) => {
      if (i % Math.ceil(labels.length / 8) === 0) {
        ctx.fillText(l, pts[i].x, pad.t + ch + 14);
      }
    });
  },

  donut(canvas, segments, colors) {
    const env = this._ctx(canvas);
    if (!env) return;
    const { ctx, w, h } = env;
    const cx = w / 2;
    const cy = h / 2;
    const r = Math.min(w, h) / 2 - 10;
    const total = segments.reduce((s, v) => s + v, 0) || 1;
    let start = -Math.PI / 2;
    segments.forEach((v, i) => {
      const angle = (v / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, start, start + angle);
      ctx.closePath();
      ctx.fillStyle = colors[i % colors.length];
      ctx.fill();
      start += angle;
    });
    // Donut hole
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.6, 0, Math.PI * 2);
    ctx.fillStyle = getComputedStyle(document.body).getPropertyValue("--bg") || "#0a0a0a";
    ctx.fill();
  },

  sparkline(canvas, values, color = "#f59e0b") {
    const env = this._ctx(canvas);
    if (!env) return;
    const { ctx, w, h } = env;
    const max = Math.max(...values, 1);
    const min = Math.min(...values, 0);
    const range = Math.max(max - min, 1);
    ctx.beginPath();
    values.forEach((v, i) => {
      const x = (i / Math.max(values.length - 1, 1)) * w;
      const y = h - ((v - min) / range) * h;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
};

window.__charts = charts;

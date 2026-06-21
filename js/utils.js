/**
 * NileDogs (NDOG) — Shared UI Utilities
 * toast, animateCount, openModal, closeModal
 * Extracted from app.js to break circular dependencies:
 *   app.js → claim/dashboard/referral/missions/notifications → app.js
 */

// ─── TOAST ────────────────────────────────────────────────────────────────────
export function toast(message, type = "info", duration = 3200) {
  const host = document.getElementById("toastHost");
  if (!host) return;
  // De-dupe: if an identical toast (same type + message) is already
  // visible, just restart its timer instead of stacking a second copy.
  const existing = Array.from(host.children).find(
    el => el.dataset.toastKey === `${type}:${message}`
  );
  if (existing) {
    clearTimeout(existing._toastTimer);
    existing._toastTimer = setTimeout(() => existing.remove(), duration + 400);
    return;
  }
  const tEl = document.createElement("div");
  tEl.className = `toast toast--${type}`;
  tEl.dataset.toastKey = `${type}:${message}`;
  const icons = { ok: "\u2705", err: "\u26a0\ufe0f", info: "\u2139\ufe0f" };
  tEl.innerHTML = `<span class="toast__icon">${icons[type] || "\u2139\ufe0f"}</span><span>${message}</span>`;
  host.appendChild(tEl);
  tEl._toastTimer = setTimeout(() => tEl.remove(), duration + 400);
}

// ─── COUNTER ANIMATION ────────────────────────────────────────────────────────
export function animateCount(el, target, duration = 800) {
  if (!el) return;
  const start = parseInt(el.textContent.replace(/[^0-9.-]/g, "")) || 0;
  if (start === target) return;
  const t0 = performance.now();
  function step(now) {
    const p = Math.min(1, (now - t0) / duration);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(start + (target - start) * eased).toLocaleString();
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// ─── MODAL ────────────────────────────────────────────────────────────────────
export function openModal(id) {
  document.getElementById(id)?.classList.remove("hidden");
}

export function closeModal(id) {
  document.getElementById(id)?.classList.add("hidden");
}

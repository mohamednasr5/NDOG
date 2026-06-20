/**
 * NileDogs (NDOG) — App Shell
 * ------------------------------------------------------------------
 * - Module bootstrap & SPA router
 * - Particle background canvas
 * - Preloader / toast / modal helpers
 * - Top-bar balance binding
 * - View switching with page transitions
 * - Service worker registration
 * - Launch countdown
 */

import { APP_CONFIG, onUser, getCurrentUser, googleLogin, logout, initAuth } from "./auth.js";
import { bindDashboard } from "./dashboard.js";
import { initClaim } from "./claim.js";
import { initReferral } from "./referral.js";
import { initMissions } from "./missions.js";
import { initLeaderboard } from "./leaderboard.js";
import { initNotifications } from "./notifications.js";

// ───────────────────────────────────────────────────────────────────
// TOAST
// ───────────────────────────────────────────────────────────────────
export function toast(message, type = "info", duration = 3200) {
  const host = document.getElementById("toastHost");
  if (!host) return;
  const t = document.createElement("div");
  t.className = `toast toast--${type}`;
  const icons = { ok: "✅", err: "⚠️", info: "ℹ️" };
  t.innerHTML = `<span class="toast__icon">${icons[type] || "ℹ️"}</span><span>${message}</span>`;
  host.appendChild(t);
  setTimeout(() => t.remove(), duration + 400);
}
window.ndogToast = toast;

// ───────────────────────────────────────────────────────────────────
// COUNTER ANIMATION
// ───────────────────────────────────────────────────────────────────
export function animateCount(el, target, duration = 800) {
  if (!el) return;
  const start = parseInt(el.textContent.replace(/[^0-9.-]/g, "")) || 0;
  if (start === target) return;
  const t0 = performance.now();
  function step(t) {
    const p = Math.min(1, (t - t0) / duration);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(start + (target - start) * eased).toLocaleString();
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// ───────────────────────────────────────────────────────────────────
// MODAL
// ───────────────────────────────────────────────────────────────────
export function openModal(id) {
  document.getElementById(id)?.classList.remove("hidden");
}
export function closeModal(id) {
  document.getElementById(id)?.classList.add("hidden");
}
document.addEventListener("click", (e) => {
  if (e.target.matches("[data-close-modal]") || e.target.closest("[data-close-modal]")) {
    const modal = e.target.closest(".modal");
    if (modal) modal.classList.add("hidden");
  }
});

// ───────────────────────────────────────────────────────────────────
// PARTICLE BACKGROUND
// ───────────────────────────────────────────────────────────────────
function initParticles() {
  const canvas = document.getElementById("particles");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  let particles = [];
  let w, h;

  function resize() {
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
    const count = Math.min(60, Math.floor(w * h / 22000));
    particles = Array.from({ length: count }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: Math.random() * 1.6 + 0.4,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      hue: Math.random() < 0.6 ? 205 : 48 // mostly Nile blue, sometimes gold
    }));
  }

  function draw() {
    ctx.clearRect(0, 0, w, h);
    // particles
    particles.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > w) p.vx *= -1;
      if (p.y < 0 || p.y > h) p.vy *= -1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${p.hue}, 90%, 65%, 0.7)`;
      ctx.fill();
    });
    // links between near particles
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < 110) {
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = `rgba(78, 192, 255, ${0.15 * (1 - d / 110)})`;
          ctx.lineWidth = 0.6;
          ctx.stroke();
        }
      }
    }
    requestAnimationFrame(draw);
  }

  resize();
  window.addEventListener("resize", resize);
  draw();
}

// ───────────────────────────────────────────────────────────────────
// LAUNCH COUNTDOWN
// ───────────────────────────────────────────────────────────────────
function initCountdown() {
  const els = {
    d: document.getElementById("lcDays"),
    h: document.getElementById("lcHours"),
    m: document.getElementById("lcMins"),
    s: document.getElementById("lcSecs")
  };
  if (!els.d) return;
  function tick() {
    const now = Date.now();
    const diff = Math.max(0, APP_CONFIG.launchDate.getTime() - now);
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    els.d.textContent = String(d).padStart(2, "0");
    els.h.textContent = String(h).padStart(2, "0");
    els.m.textContent = String(m).padStart(2, "0");
    els.s.textContent = String(s).padStart(2, "0");
  }
  tick();
  setInterval(tick, 1000);
}

// ───────────────────────────────────────────────────────────────────
// SPA ROUTER
// ───────────────────────────────────────────────────────────────────
const VIEWS = ["dashboard", "claim", "referral", "missions", "leaderboard", "whitepaper"];

function setView(name) {
  if (!VIEWS.includes(name)) name = "dashboard";
  // hide all views
  document.querySelectorAll(".view").forEach(v => v.classList.remove("view--active"));
  const target = document.getElementById(`view-${name}`);
  if (target) target.classList.add("view--active");

  // nav active states
  document.querySelectorAll("[data-view]").forEach(el => {
    el.classList.toggle("active", el.dataset.view === name);
  });

  // close sidenav
  closeSidenav();

  // scroll top
  window.scrollTo({ top: 0, behavior: "smooth" });

  // update URL hash without scrolling
  const url = new URL(location.href);
  url.searchParams.set("view", name);
  history.replaceState(null, "", url);

  // notify modules
  document.dispatchEvent(new CustomEvent("ndog:viewchange", { detail: { view: name } }));
}

function closeSidenav() {
  document.getElementById("sidenav")?.classList.remove("open");
  document.getElementById("sidenavScrim")?.classList.remove("show");
}

function bindNavigation() {
  document.addEventListener("click", (e) => {
    const link = e.target.closest("[data-view]");
    if (!link) return;
    e.preventDefault();
    setView(link.dataset.view);
  });

  // menu toggle
  document.getElementById("menuToggle")?.addEventListener("click", () => {
    document.getElementById("sidenav").classList.toggle("open");
    document.getElementById("sidenavScrim").classList.toggle("show");
  });
  document.getElementById("sidenavScrim")?.addEventListener("click", closeSidenav);

  // logout
  document.getElementById("logoutBtn")?.addEventListener("click", logout);
  document.getElementById("bannedLogout")?.addEventListener("click", logout);

  // google login
  document.getElementById("googleLoginBtn")?.addEventListener("click", async () => {
    const btn = document.getElementById("googleLoginBtn");
    btn.disabled = true;
    btn.textContent = "Connecting…";
    try {
      await googleLogin();
    } catch (err) {
      toast(err.message || "Google login failed. Try again.", "err");
      btn.disabled = false;
      btn.innerHTML = `<svg viewBox="0 0 24 24" width="22" height="22"><path fill="#fff" d="M21.35 11.1h-9.18v2.92h5.27c-.23 1.4-1.6 4.1-5.27 4.1-3.17 0-5.76-2.62-5.76-5.86s2.59-5.86 5.76-5.86c1.81 0 3.02.77 3.71 1.43l2.53-2.44C16.9 3.4 14.79 2.5 12.17 2.5 6.99 2.5 2.81 6.68 2.81 11.86S6.99 21.22 12.17 21.22c5.86 0 9.74-4.11 9.74-9.9 0-.66-.07-1.17-.16-1.67z"/></svg> Continue with Google`;
    }
  });
}

// ───────────────────────────────────────────────────────────────────
// COPY TO CLIPBOARD
// ───────────────────────────────────────────────────────────────────
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast("Copied to clipboard", "ok", 1800);
    return true;
  } catch {
    // Fallback
    const ta = document.createElement("textarea");
    ta.value = text; document.body.appendChild(ta);
    ta.select(); document.execCommand("copy"); ta.remove();
    toast("Copied", "ok", 1800);
    return true;
  }
}

document.addEventListener("click", (e) => {
  const cpBtn = e.target.closest("[data-copy-target]");
  if (!cpBtn) return;
  const target = document.getElementById(cpBtn.dataset.copyTarget);
  if (target) copyText(target.value);
  const btn = e.target.closest("#copyRefBtn");
  if (btn) {
    const link = document.getElementById("dashRefLink")?.textContent;
    if (link) copyText(link);
  }
});

// ───────────────────────────────────────────────────────────────────
// SERVICE WORKER
// ───────────────────────────────────────────────────────────────────
function registerSW() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js?v=1.0.1")
      .then(reg => {
        console.log("[NDOG] SW registered:", reg.scope);
        // Auto-update: when a new SW takes over, reload once so the user
        // gets the latest cached app shell.
        let refreshing = false;
        navigator.serviceWorker.addEventListener("controllerchange", () => {
          if (refreshing) return;
          refreshing = true;
          console.log("[NDOG] New SW activated — reloading for fresh content");
          window.location.reload();
        });
        // Check for updates every 5 minutes
        setInterval(() => reg.update().catch(() => {}), 5 * 60 * 1000);
      })
      .catch(err => console.warn("[NDOG] SW failed:", err));
  });
}

// ───────────────────────────────────────────────────────────────────
// PRELOADER
// ───────────────────────────────────────────────────────────────────
function hidePreloader() {
  const p = document.getElementById("preloader");
  if (!p) return;
  setTimeout(() => {
    p.classList.add("done");
    setTimeout(() => p.remove(), 600);
  }, 900);
}

// Safety net: force-hide preloader after 6 seconds even if auth hangs
setTimeout(() => {
  const p = document.getElementById("preloader");
  if (p && !p.classList.contains("done")) {
    console.warn("[NDOG] Forcing preloader hide after timeout");
    p.classList.add("done");
    setTimeout(() => p.remove(), 600);
    // Also show login screen as fallback if app hasn't initialized
    const shell = document.getElementById("appShell");
    const login = document.getElementById("loginScreen");
    if (shell?.classList.contains("hidden") && login?.classList.contains("hidden")) {
      login?.classList.remove("hidden");
    }
  }
}, 6000);

// Global error handler — surface JS errors to the user
window.addEventListener("error", (e) => {
  console.error("[NDOG] Uncaught error:", e.error || e.message);
  // If error happens before auth ready, hide preloader and show login
  const p = document.getElementById("preloader");
  if (p && !p.classList.contains("done")) {
    p.classList.add("done");
    setTimeout(() => p.remove(), 600);
  }
});

// Handle module load failures (e.g., file:// protocol, network errors)
window.addEventListener("unhandledrejection", (e) => {
  console.error("[NDOG] Unhandled promise rejection:", e.reason);
});

// ───────────────────────────────────────────────────────────────────
// BOOTSTRAP
// ───────────────────────────────────────────────────────────────────
function bootstrap() {
  // Initial UI bindings
  bindNavigation();
  initParticles();
  initCountdown();
  registerSW();

  // Initialize modules (they all listen to onUser)
  bindDashboard();
  initClaim();
  initReferral();
  initMissions();
  initLeaderboard();
  initNotifications();

  // Wire user → UI
  onUser((user) => {
    const login = document.getElementById("loginScreen");
    const shell = document.getElementById("appShell");

    if (!user) {
      login?.classList.remove("hidden");
      shell?.classList.add("hidden");
      hidePreloader();
      return;
    }

    login?.classList.add("hidden");
    shell?.classList.remove("hidden");
    hidePreloader();

    // top bar balance
    animateCount(document.getElementById("topbarBalNum"), user.balance || 0);

    // sidenav profile
    const sideAvatar = document.getElementById("sideAvatar");
    if (sideAvatar && user.photoURL) sideAvatar.src = user.photoURL;
    document.getElementById("sideName").textContent = user.name || "User";
    document.getElementById("sideCode").textContent = user.referralCode || "NDOG—";
  });

  // Initial view from URL
  initAuth(() => {
    const initialView = new URLSearchParams(location.search).get("view") || "dashboard";
    setTimeout(() => setView(initialView), 100);
  });
}

// Expose for inline handlers if needed
window.ndogSetView = setView;
window.ndogCopyText = copyText;

// Capture ?ref= param before login
const refParam = new URLSearchParams(location.search).get("ref");
if (refParam) sessionStorage.setItem("ndog_ref", refParam);

bootstrap();

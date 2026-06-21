/**
 * NileDogs (NDOG) — App Shell
 * v2.0.3 - FIXES:
 *   - منع النقر المتكرر على زر تسجيل الدخول (disabled أثناء المعالجة).
 *   - تحسين معالجة أخطاء تسجيل الدخول وإظهار رسائل مناسبة.
 *   - إزالة الاعتماد على sessionStorage غير الضروري.
 *   - استخدام popup-only مع fallback واضح.
 *   - إضافة مهلة لإعادة تمكين الزر بعد 5 ثوانٍ كشبكة أمان.
 */

import { APP_CONFIG, persistenceReady } from "./firebase-config.js";
import { onUser, getCurrentUser, googleLogin, logout, initAuth } from "./auth.js";
import { bindDashboard } from "./dashboard.js";
import { initClaim } from "./claim.js";
import { initReferral } from "./referral.js";
import { initMissions } from "./missions.js";
import { initLeaderboard } from "./leaderboard.js";
import { initNotifications } from "./notifications.js";
import {
  t, getLang, setLang, toggleLang, applyTranslations, onLangChange, isRTL
} from "./i18n.js";

// ───────────────────────────────────────────────────────────────────
// TOAST
// ───────────────────────────────────────────────────────────────────
export function toast(message, type = "info", duration = 3200) {
  const host = document.getElementById("toastHost");
  if (!host) return;

  // منع تكرار نفس الرسالة
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
  const icons = { ok: "✅", err: "⚠️", info: "ℹ️" };
  tEl.innerHTML = `<span class="toast__icon">${icons[type] || "ℹ️"}</span><span>${message}</span>`;
  host.appendChild(tEl);
  tEl._toastTimer = setTimeout(() => tEl.remove(), duration + 400);
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
  function step(now) {
    const p = Math.min(1, (now - t0) / duration);
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
      hue: Math.random() < 0.6 ? 205 : 48
    }));
  }

  function draw() {
    ctx.clearRect(0, 0, w, h);
    particles.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > w) p.vx *= -1;
      if (p.y < 0 || p.y > h) p.vy *= -1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${p.hue}, 90%, 65%, 0.7)`;
      ctx.fill();
    });
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
  document.querySelectorAll(".view").forEach(v => v.classList.remove("view--active"));
  const target = document.getElementById(`view-${name}`);
  if (target) target.classList.add("view--active");

  document.querySelectorAll("[data-view]").forEach(el => {
    el.classList.toggle("active", el.dataset.view === name);
  });

  closeSidenav();
  window.scrollTo({ top: 0, behavior: "smooth" });

  const url = new URL(location.href);
  url.searchParams.set("view", name);
  history.replaceState(null, "", url);

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

  document.getElementById("menuToggle")?.addEventListener("click", () => {
    document.getElementById("sidenav").classList.toggle("open");
    document.getElementById("sidenavScrim").classList.toggle("show");
  });
  document.getElementById("sidenavScrim")?.addEventListener("click", closeSidenav);

  document.getElementById("logoutBtn")?.addEventListener("click", logout);
  document.getElementById("bannedLogout")?.addEventListener("click", logout);

  // ─── زر تسجيل الدخول مع منع النقر المتكرر ────────────────────
  document.getElementById("googleLoginBtn")?.addEventListener("click", async function handler(e) {
    const btn = this;
    if (btn.disabled) return; // منع النقر المتكرر

    btn.disabled = true;
    const labelSpan = btn.querySelector("span");
    const originalText = labelSpan ? labelSpan.textContent : "";
    if (labelSpan) labelSpan.textContent = t("login.connecting");

    try {
      await googleLogin();
      // في حال نجاح تسجيل الدخول، سيتم إخفاء الشاشة تلقائياً عن طريق onUser
    } catch (err) {
      const isInfo = err.code === "auth/standalone-escape";
      toast(err.message || t("login.connectFailed"), isInfo ? "info" : "err", isInfo ? 6000 : 3200);
      // إعادة تمكين الزر فقط إذا لم يتم تسجيل الدخول
      btn.disabled = false;
      if (labelSpan) labelSpan.textContent = originalText || t("login.googleBtn");
    }

    // شبكة أمان: إعادة تمكين الزر بعد 5 ثوانٍ في حال علق (مثلاً بسبب تأخير)
    setTimeout(() => {
      if (btn.disabled) {
        btn.disabled = false;
        if (labelSpan) labelSpan.textContent = originalText || t("login.googleBtn");
      }
    }, 5000);
  });
}

// ───────────────────────────────────────────────────────────────────
// LANGUAGE SWITCHER
// ───────────────────────────────────────────────────────────────────
function bindLanguageSwitcher() {
  const langToggle = document.getElementById("langToggle");
  const langToggleLbl = document.getElementById("langToggleLbl");
  if (langToggle) {
    if (langToggleLbl) langToggleLbl.textContent = (getLang() === "ar") ? "ع" : "EN";
    langToggle.addEventListener("click", () => {
      const newLang = toggleLang();
      if (langToggleLbl) langToggleLbl.textContent = (newLang === "ar") ? "ع" : "EN";
    });
  }

  document.querySelectorAll(".lang-pill[data-lang]").forEach(pill => {
    pill.classList.toggle("active", pill.dataset.lang === getLang());
    pill.addEventListener("click", () => {
      setLang(pill.dataset.lang);
      document.querySelectorAll(".lang-pill[data-lang]").forEach(p =>
        p.classList.toggle("active", p.dataset.lang === pill.dataset.lang));
      if (langToggleLbl) langToggleLbl.textContent = (getLang() === "ar") ? "ع" : "EN";
    });
  });

  onLangChange(() => {
    applyTranslations();
    document.dispatchEvent(new CustomEvent("ndog:langchange"));
  });
}

// ───────────────────────────────────────────────────────────────────
// COPY TO CLIPBOARD
// ───────────────────────────────────────────────────────────────────
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast(t("common.copied"), "ok", 1800);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text; document.body.appendChild(ta);
    ta.select(); document.execCommand("copy"); ta.remove();
    toast(t("common.copied"), "ok", 1800);
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
  if (location.protocol !== "https:" && location.hostname !== "localhost") return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js?v=2.0.3")
      .then(reg => {
        console.log("[NDOG] SW registered:", reg.scope);
        reg.addEventListener("updatefound", () => {
          const newWorker = reg.installing;
          if (newWorker) {
            newWorker.addEventListener("statechange", () => {
              if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
                console.log("[NDOG] New SW installed, requesting skipWaiting");
                newWorker.postMessage({ type: "SKIP_WAITING" });
              }
            });
          }
        });

        let refreshing = false;
        navigator.serviceWorker.addEventListener("controllerchange", () => {
          if (refreshing) return;
          refreshing = true;
          console.log("[NDOG] New SW activated — reloading");
          window.location.reload();
        });

        navigator.serviceWorker.addEventListener("message", (event) => {
          if (event.data?.type === "SW_UPDATED") {
            console.log("[NDOG] SW update confirmed, version:", event.data.version);
          }
        });

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

setTimeout(() => {
  const p = document.getElementById("preloader");
  if (p && !p.classList.contains("done")) {
    console.warn("[NDOG] Failsafe: forcing preloader hide");
    p.classList.add("done");
    setTimeout(() => p.remove(), 600);
    const shell = document.getElementById("appShell");
    const login = document.getElementById("loginScreen");
    if (shell?.classList.contains("hidden") && login?.classList.contains("hidden")) {
      login?.classList.remove("hidden");
    }
    if (shell?.classList.contains("hidden")) {
      const msg = document.createElement("div");
      msg.style.cssText = "position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#ffd700;color:#0a1f44;padding:12px 24px;border-radius:12px;font-size:14px;font-weight:600;z-index:99999;cursor:pointer;box-shadow:0 4px 20px rgba(0,0,0,0.3);";
      msg.textContent = "\u26A1 تحديث متاح — اضغط لإعادة التحميل";
      msg.addEventListener("click", () => {
        if ("caches" in window) {
          caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))));
        }
        setTimeout(() => location.reload(), 300);
      });
      document.body.appendChild(msg);
    }
  }
}, 6000);

window.addEventListener("error", (e) => {
  console.error("[NDOG] Uncaught error:", e.error || e.message);
  const p = document.getElementById("preloader");
  if (p && !p.classList.contains("done")) {
    p.classList.add("done");
    setTimeout(() => p.remove(), 600);
  }
});

window.addEventListener("unhandledrejection", (e) => {
  console.error("[NDOG] Unhandled promise rejection:", e.reason);
  // إذا كان الخطأ متعلقاً بـ CSP أو تسجيل الدخول، نعرض رسالة للمستخدم
  if (e.reason?.message?.includes("CSP") || e.reason?.message?.includes("eval")) {
    toast("⚠️ هناك تعارض في سياسة الأمان (CSP). قد تحتاج إلى تعديل إعدادات الموقع.", "err", 8000);
  }
});

document.addEventListener("ndog:authError", (e) => {
  toast(e.detail?.message || "خطأ في المصادقة", "err", 5000);
});

// ───────────────────────────────────────────────────────────────────
// BOOTSTRAP
// ───────────────────────────────────────────────────────────────────
async function bootstrap() {
  applyTranslations();
  bindNavigation();
  bindLanguageSwitcher();
  initParticles();
  initCountdown();
  registerSW();

  bindDashboard();
  initClaim();
  initReferral();
  initMissions();
  initLeaderboard();
  initNotifications();

  onUser((user) => {
    const login = document.getElementById("loginScreen");
    const shell = document.getElementById("appShell");

    if (!user) {
      login?.classList.remove("hidden");
      shell?.classList.add("hidden");
      hidePreloader();
      document.querySelector(".nav-link.admin-only")?.classList.add("hidden");
      return;
    }

    login?.classList.add("hidden");
    shell?.classList.remove("hidden");
    hidePreloader();

    animateCount(document.getElementById("topbarBalNum"), user.balance || 0);

    const sideAvatar = document.getElementById("sideAvatar");
    if (sideAvatar && user.photoURL) sideAvatar.src = user.photoURL;
    document.getElementById("sideName").textContent = user.name || "User";
    document.getElementById("sideCode").textContent = user.referralCode || "NDOG—";

    document.querySelector(".nav-link.admin-only")?.classList.add("hidden");
  });

  // انتظار تهيئة persistence ثم تهيئة المصادقة
  await persistenceReady;
  initAuth(() => {
    const initialView = new URLSearchParams(location.search).get("view") || "dashboard";
    setTimeout(() => setView(initialView), 100);
  });
}

window.ndogSetView = setView;
window.ndogCopyText = copyText;
window.ndogGetLang = getLang;
window.ndogSetLang = setLang;
window.ndogToggleLang = toggleLang;
window.ndogIsRTL = isRTL;

const refParam = new URLSearchParams(location.search).get("ref");
if (refParam) sessionStorage.setItem("ndog_ref", refParam);

// تأجيل bootstrap إلى ما بعد اكتمال تحميل الوحدات
setTimeout(bootstrap, 0);

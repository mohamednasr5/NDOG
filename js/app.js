/**
 * FILE NAME: js/app.js
 * PURPOSE: Application bootstrap. Initializes i18n, auth, notifications, analytics,
 *          particles, theme, service worker registration, and global UI wiring.
 *          This is the entry point imported by every HTML page.
 * DEPENDENCIES: All other js/* modules
 * EXPORTS: app (window.app)
 */

import { auth } from "./auth.js";
import { i18n } from "./i18n.js";
import { notifications } from "./notifications.js";
import { analytics } from "./analytics.js";
import { particles } from "./particles.js";
import { $, $$, getCookie, setCookie, isMobile, showToast } from "./utils.js";

class App {
  constructor() {
    this.ready = false;
  }

  async init() {
    // 1. Theme (instant to avoid flash)
    this._initTheme();

    // 2. i18n
    await i18n.init();

    // 3. Auth
    auth.onReady((user) => this._onUserChange(user));

    // 4. Notifications
    notifications.start();

    // 5. Particles (only on hero sections, desktop)
    if (!isMobile()) {
      const hero = $(".hero, .particles-target");
      if (hero) particles.mount(hero, { color: "#f59e0b", linkColor: "rgba(245,158,11,0.18)" });
    }

    // 6. Wire global UI (nav, login button, theme toggle, language switcher)
    this._wireNav();
    this._wireAuthButtons();
    this._wireThemeToggle();
    this._wireLangSwitcher();

    // 7. Service worker
    this._registerSW();

    // 8. Track page view
    analytics.screen(document.title || location.pathname);

    // 9. Mark ready
    this.ready = true;
    document.body.classList.add("app-ready");
    document.dispatchEvent(new CustomEvent("ndog:ready"));

    console.log("[app] Ready ✓", {
      lang: i18n.getLang(),
      theme: this._theme(),
      mobile: isMobile()
    });
  }

  _onUserChange(user) {
    if (user) {
      // Update profile button in nav
      $$("[data-auth-slot]").forEach((slot) => {
        slot.innerHTML = `
          <button class="btn btn--profile" data-action="profile">
            <img src="${user.photoURL || "/assets/icons/icon-512.png"}" alt="" width="28" height="28" />
            <span class="profile-name">${(user.displayName || "User").split(" ")[0]}</span>
          </button>
          <button class="btn btn--ghost btn--sm" data-action="logout">Logout</button>
        `;
        slot.querySelector('[data-action="logout"]').addEventListener("click", () => auth.signOut());
        slot.querySelector('[data-action="profile"]').addEventListener("click", () => (location.href = "/dashboard"));
      });
      analytics.setUser(user.uid, {
        role: user.role || "user",
        country: user.country || "unknown",
        vip: user.vipLevel || 0,
        founder: !!user.founder
      });
      // Show role-specific nav items
      if (user.role === "admin" || user.role === "mod") {
        $$("[data-admin-only]").forEach((el) => el.style.display = "");
      }
    } else {
      $$("[data-auth-slot]").forEach((slot) => {
        slot.innerHTML = `<button class="btn btn--primary" data-action="signin">
          <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M21.35 11.1H12v2.8h5.35c-.5 2.4-2.65 4.1-5.35 4.1-3.2 0-5.8-2.6-5.8-5.8s2.6-5.8 5.8-5.8c1.45 0 2.75.5 3.8 1.45l2-2C16.45 3.85 14.4 3 12 3 7 3 3 7 3 12s4 9 9 9c5.4 0 9-3.85 9-9 0-.65-.05-1.25-.15-1.9z"/></svg>
          <span>Sign in</span>
        </button>`;
        slot.querySelector('[data-action="signin"]').addEventListener("click", () => auth.signIn());
      });
      // Trigger One Tap
      auth.initOneTap();
    }
  }

  _wireNav() {
    // Mobile menu toggle
    const toggle = $("[data-menu-toggle]");
    const nav = $("[data-nav]");
    if (toggle && nav) {
      toggle.addEventListener("click", () => {
        nav.classList.toggle("open");
        toggle.setAttribute("aria-expanded", nav.classList.contains("open"));
      });
      // Close on outside click
      document.addEventListener("click", (e) => {
        if (!nav.contains(e.target) && !toggle.contains(e.target)) nav.classList.remove("open");
      });
    }
    // Highlight active link in main nav
    const path = location.pathname.split("/").pop() || "index.html";
    $$("[data-nav] a").forEach((a) => {
      const href = a.getAttribute("href") || "";
      if (href.endsWith(path)) a.classList.add("active");
    });

    // Bottom-nav: highlight active link (CSS handles show/hide on mobile)
    const bn = document.getElementById("bottom-nav");
    if (bn) {
      const cur = path.toLowerCase();
      bn.querySelectorAll("a").forEach((a) => {
        const href = (a.getAttribute("href") || "").toLowerCase();
        const target = href.replace(/^\//, "");
        if (target === cur || (target === "index.html" && (cur === "" || cur === "index.html"))) {
          a.classList.add("active");
        }
      });
    }
  }

  _wireAuthButtons() {
    $$("[data-action='signin']").forEach((b) => b.addEventListener("click", () => auth.signIn()));
    $$("[data-action='logout']").forEach((b) => b.addEventListener("click", () => auth.signOut()));
  }

  _initTheme() {
    const saved = getCookie("ndog_theme") || (window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "dark");
    document.documentElement.dataset.theme = saved;
  }

  _theme() {
    return document.documentElement.dataset.theme || "dark";
  }

  _wireThemeToggle() {
    $$("[data-theme-toggle]").forEach((b) =>
      b.addEventListener("click", () => {
        const cur = this._theme();
        const next = cur === "dark" ? "light" : "dark";
        document.documentElement.dataset.theme = next;
        setCookie("ndog_theme", next, 365);
        document.dispatchEvent(new CustomEvent("ndog:themechange", { detail: { theme: next } }));
      })
    );
  }

  _wireLangSwitcher() {
    $$("[data-lang-btn]").forEach((b) =>
      b.addEventListener("click", () => i18n.setLang(b.dataset.langBtn))
    );
  }

  async _registerSW() {
    if (!("serviceWorker" in navigator)) return;
    try {
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      console.log("[app] SW registered:", reg.scope);
    } catch (e) {
      console.warn("[app] SW registration failed:", e);
    }
  }
}

export const app = new App();

// Bootstrap
if (document.readyState !== "loading") {
  app.init();
} else {
  document.addEventListener("DOMContentLoaded", () => app.init());
}

window.app = app;

/**
 * FILE NAME: js/i18n.js
 * PURPOSE: Internationalization layer. Loads AR/EN dictionaries, applies translations
 *          to DOM via data-i18n attributes, persists user language, handles RTL switching.
 * DEPENDENCIES: utils.js (getCookie, setCookie, getBrowserLang)
 * EXPORTS: i18n.t, i18n.setLang, i18n.getLang, i18n.apply, i18n.init
 */

import { getCookie, setCookie, getBrowserLang } from "./utils.js";

// Use fetch() for JSON loading — more browser-compatible than import assertions
const DICT_PATHS = {
  en: "/locales/en.json",
  ar: "/locales/ar.json"
};

const dictCache = {};
let currentLang = getCookie("ndog_lang") || getBrowserLang() || "en";

export const i18n = {
  getLang() {
    return currentLang;
  },

  async loadDict(lang) {
    if (dictCache[lang]) return dictCache[lang];
    try {
      const r = await fetch(DICT_PATHS[lang] || DICT_PATHS.en);
      if (!r.ok) throw new Error("HTTP " + r.status);
      dictCache[lang] = await r.json();
      return dictCache[lang];
    } catch (e) {
      console.warn("[i18n] Failed to load dict:", lang, e);
      // Fallback: try relative path
      try {
        const r = await fetch(`locales/${lang}.json`);
        dictCache[lang] = await r.json();
        return dictCache[lang];
      } catch (e2) {
        console.error("[i18n] Fallback failed:", e2);
        return {};
      }
    }
  },

  t(key, vars = {}) {
    const dict = dictCache[currentLang] || {};
    let str = dict[key] ?? key;
    for (const [k, v] of Object.entries(vars)) {
      str = str.replace(new RegExp(`\\{${k}\\}`, "g"), v);
    }
    return str;
  },

  async setLang(lang) {
    if (!DICTS[lang]) lang = "en";
    currentLang = lang;
    setCookie("ndog_lang", lang, 365);
    await this.loadDict(lang);
    this.apply();
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    document.dispatchEvent(new CustomEvent("ndog:langchange", { detail: { lang } }));
  },

  apply(root = document) {
    root.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      el.textContent = this.t(key);
    });
    root.querySelectorAll("[data-i18n-attr]").forEach((el) => {
      // format: data-i18n-attr="placeholder:auth.email,title:nav.home"
      el.getAttribute("data-i18n-attr")
        .split(",")
        .forEach((pair) => {
          const [attr, key] = pair.split(":").map((s) => s.trim());
          if (attr && key) el.setAttribute(attr, this.t(key));
        });
    });
    document.documentElement.lang = currentLang;
    document.documentElement.dir = currentLang === "ar" ? "rtl" : "ltr";
  },

  async init() {
    await this.loadDict(currentLang);
    this.apply();
    // Render language switcher state
    document.querySelectorAll("[data-lang-btn]").forEach((btn) => {
      btn.classList.toggle("active", btn.getAttribute("data-lang-btn") === currentLang);
      btn.addEventListener("click", () => this.setLang(btn.getAttribute("data-lang-btn")));
    });
  }
};

// Auto-init on DOM ready
if (document.readyState !== "loading") {
  i18n.init();
} else {
  document.addEventListener("DOMContentLoaded", () => i18n.init());
}

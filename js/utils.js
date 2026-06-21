/**
 * FILE NAME: js/utils.js
 * PURPOSE: Pure helper utilities — DOM, formatting, validation, crypto-hashing,
 *          storage wrappers, debounce/throttle, QR/data-uri helpers. No side effects on init.
 * DEPENDENCIES: None
 * EXPORTS: $, $$, formatNDOG, formatNumber, shortAddr, isValidEmail, debounce, throttle,
 *          sleep, getQueryParam, setCookie, getCookie, eraseCookie, safeHTML,
 *          fingerprintHash, copyToClipboard, downloadCSV, showToast, formatDate,
 *          timeAgo, clamp, randomInt, isMobile, isRTL, getBrowserLang, getCountryFromLang
 */

/* ============ DOM ============ */
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/* ============ Formatters ============ */
export function formatNDOG(amt, decimals = 2) {
  const n = Number(amt) || 0;
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals
  }) + " NDOG";
}

export function formatNumber(n, decimals = 0) {
  return (Number(n) || 0).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals
  });
}

export function shortAddr(addr, head = 6, tail = 4) {
  if (!addr || typeof addr !== "string") return "";
  if (addr.length <= head + tail) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}

export function formatDate(ts, opts = { dateStyle: "medium", timeStyle: "short" }) {
  if (!ts) return "—";
  const d = ts?.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
  return new Intl.DateTimeFormat(undefined, opts).format(d);
}

export function timeAgo(ts) {
  if (!ts) return "";
  const d = ts?.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return Math.floor(diff / 60) + "m ago";
  if (diff < 86400) return Math.floor(diff / 3600) + "h ago";
  if (diff < 2592000) return Math.floor(diff / 86400) + "d ago";
  return formatDate(ts, { dateStyle: "medium" });
}

/* ============ Validation ============ */
export function isValidEmail(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || ""));
}

export function isValidReferralCode(s) {
  return /^[A-Z0-9]{6,12}$/.test(String(s || ""));
}

export function isValidWallet(s) {
  return /^0x[a-fA-F0-9]{40}$|^T[A-Za-z0-9]{33}$|^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(String(s || ""));
}

/* ============ Timing ============ */
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function debounce(fn, wait = 250) {
  let t;
  return function (...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);
  };
}

export function throttle(fn, limit = 100) {
  let inThrottle = false;
  return function (...args) {
    if (inThrottle) return;
    fn.apply(this, args);
    inThrottle = true;
    setTimeout(() => (inThrottle = false), limit);
  };
}

export const clamp = (v, min, max) => Math.min(Math.max(v, min), max);
export const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

/* ============ URL & Cookies ============ */
export function getQueryParam(name, source = window.location.search) {
  return new URLSearchParams(source).get(name);
}

export function setCookie(name, value, days = 365) {
  const exp = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${exp}; path=/; SameSite=Lax; Secure`;
}

export function getCookie(name) {
  const match = document.cookie.match(new RegExp("(?:^|; )" + name.replace(/([.$?*|{}()[\]\\/+^])/g, "\\$1") + "=([^;]*)"));
  return match ? decodeURIComponent(match[1]) : null;
}

export function eraseCookie(name) {
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/;`;
}

/* ============ Security ============ */
const sanitizer = document.createElement("div");
export function safeHTML(str) {
  sanitizer.textContent = String(str ?? "");
  return sanitizer.innerHTML;
}

/** Lightweight FNV-1a hash for device fingerprinting (non-cryptographic). */
export async function fingerprintHash(input) {
  let hash = 0x811c9dc5;
  const s = String(input);
  for (let i = 0; i < s.length; i++) {
    hash ^= s.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  // Mix with a SHA-256 of the input for stronger collision resistance
  try {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
    const hex = Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
    return (hash >>> 0).toString(16) + hex.slice(0, 24);
  } catch {
    return (hash >>> 0).toString(16);
  }
}

/* ============ Clipboard / Download ============ */
export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  }
}

export function downloadCSV(filename, rows) {
  const csv = rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/* ============ Environment detection ============ */
export const isMobile = () => /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
export const isRTL = () => document.documentElement.dir === "rtl" || document.documentElement.lang === "ar";

export function getBrowserLang() {
  const nav = (navigator.language || navigator.userLanguage || "en").toLowerCase();
  return nav.startsWith("ar") ? "ar" : "en";
}

export function getCountryFromLang() {
  // Best-effort country hint from locale; refined server-side via IP later
  const nav = (navigator.language || "en").toLowerCase();
  if (nav.includes("eg")) return "EG";
  if (nav.includes("sa")) return "SA";
  if (nav.includes("ae")) return "AE";
  return null;
}

/* ============ Toast system (used everywhere) ============ */
export function showToast(message, type = "info", duration = 4000) {
  let host = $("#toast-host");
  if (!host) {
    host = document.createElement("div");
    host.id = "toast-host";
    host.className = "toast-host";
    document.body.appendChild(host);
  }
  const t = document.createElement("div");
  t.className = `toast toast--${type}`;
  t.innerHTML = `<span class="toast__icon">${type === "success" ? "✓" : type === "error" ? "✕" : type === "warn" ? "!" : "i"}</span><span class="toast__msg">${safeHTML(message)}</span>`;
  host.appendChild(t);
  requestAnimationFrame(() => t.classList.add("toast--show"));
  setTimeout(() => {
    t.classList.remove("toast--show");
    setTimeout(() => t.remove(), 400);
  }, duration);
}

/* ============ Misc ============ */
export function generateReferralCode(uid) {
  // Deterministic 8-char code from uid + random salt
  const base = (uid || "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 4).padEnd(4, "X");
  const rnd = Math.random().toString(36).toUpperCase().slice(2, 6);
  return (base + rnd).slice(0, 8);
}

export function next24hTimestamp() {
  return Date.now() + 24 * 60 * 60 * 1000;
}

export function hoursUntil(ts) {
  if (!ts) return 0;
  return Math.max(0, (ts - Date.now()) / 3.6e6);
}

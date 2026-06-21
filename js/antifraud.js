/**
 * FILE NAME: js/antifraud.js
 * PURPOSE: Client-side anti-fraud layer. Generates device fingerprints, detects
 *          multi-account signals, enforces rate limits, logs suspicious activity
 *          to /fraudLogs, and surfaces alerts to admins.
 * DEPENDENCIES: firebase.js (firebaseDb), utils.js (fingerprintHash, getCookie, setCookie),
 *               auth.js (getCurrentUserUid — lazy import to avoid circular dep)
 * EXPORTS: antifraud.fingerprint, antifraud.checkRate, antifraud.logSuspicious,
 *          antifraud.detectMultiAccount, antifraud.isVPN, antifraud.botScore
 */

import { firebaseDb } from "./firebase.js";
import { fingerprintHash, getCookie, setCookie, showToast } from "./utils.js";
import { ref, push, serverTimestamp, get, set } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const RATE_BUCKETS = new Map(); // in-memory rate limit buckets

export const antifraud = {
  _fp: null,
  _signals: {},

  /**
   * Builds a stable device fingerprint from browser characteristics.
   * Stored in cookie for cross-session detection.
   */
  async fingerprint() {
    if (this._fp) return this._fp;
    const cached = getCookie("ndog_fp");
    if (cached) {
      this._fp = cached;
      return cached;
    }
    const parts = [
      navigator.userAgent,
      navigator.language,
      navigator.languages?.join(",") || "",
      navigator.platform,
      navigator.hardwareConcurrency || 0,
      (navigator.deviceMemory || 0).toString(),
      screen.width + "x" + screen.height + "x" + (screen.colorDepth || 0),
      new Date().getTimezoneOffset().toString(),
      navigator.maxTouchPoints || 0,
      navigator.connection?.effectiveType || "unknown",
      navigator.connection?.rtt || 0
    ];
    // Canvas fingerprint (additional entropy)
    try {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      ctx.textBaseline = "top";
      ctx.font = "14px 'Arial'";
      ctx.fillStyle = "#f60";
      ctx.fillRect(125, 1, 62, 20);
      ctx.fillStyle = "#069";
      ctx.fillText("NileDogs-NDOG", 2, 15);
      parts.push(canvas.toDataURL());
    } catch {
      /* canvas blocked */
    }
    // WebGL fingerprint
    try {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
      if (gl) {
        const ext = gl.getExtension("WEBGL_debug_renderer_info");
        if (ext) parts.push(gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) + "/" + gl.getParameter(ext.UNMASKED_RENDERER_WEBGL));
      }
    } catch {
      /* webgl blocked */
    }

    this._fp = await fingerprintHash(parts.join("|"));
    setCookie("ndog_fp", this._fp, 365);
    return this._fp;
  },

  /**
   * Detects VPN/proxy by querying ipapi.co (client-side heuristic only —
   * server should cross-verify). Returns { ip, country, isVPN, isProxy, isHosting }.
   */
  async isVPN() {
    try {
      const r = await fetch("https://ipapi.co/json/", { signal: AbortSignal.timeout(3500) });
      const j = await r.json();
      return {
        ip: j.ip,
        country: j.country_code || null,
        isVPN: !!(j.asn && /vpn|proxy|hosting|datacenter|server/i.test(j.org || "")),
        isProxy: !!(j.asn && /proxy/i.test(j.org || "")),
        isHosting: !!(j.asn && /hosting|datacenter|server/i.test(j.org || "")),
        org: j.org || null
      };
    } catch {
      return { ip: null, country: null, isVPN: false, isProxy: false, isHosting: false, org: null };
    }
  },

  /**
   * Bot probability score 0..1 based on behavioral signals.
   */
  botScore() {
    let score = 0;
    if (!navigator.webdriver === false) score += 0.5; // webdriver flag
    if (navigator.plugins?.length === 0) score += 0.1;
    if (navigator.languages?.length === 0) score += 0.1;
    if (/HeadlessChrome|PhantomJS|SlimerJS|Selenium/i.test(navigator.userAgent)) score += 0.5;
    if (window.outerWidth === 0 || window.outerHeight === 0) score += 0.1;
    if (navigator.permissions && Notification.permission === "default" && !window.Notification) score += 0.05;
    return Math.min(1, score);
  },

  /**
   * Detects multi-account signals:
   *  - Same fingerprint already used by a different uid
   *  - Multiple accounts from same IP within 24h
   */
  async detectMultiAccount(uid) {
    try {
      const fp = await this.fingerprint();
      const fpSnap = await get(ref(firebaseDb, `devices/${fp}`));
      if (fpSnap.exists()) {
        const data = fpSnap.val();
        if (data.uid && data.uid !== uid) {
          this.logSuspicious({
            type: "MULTI_ACCOUNT_FP",
            uid,
            existingUid: data.uid,
            fingerprint: fp
          });
          return { multi: true, reason: "fingerprint_reuse", existingUid: data.uid };
        }
      }
      // Register this device→uid binding
      await set(ref(firebaseDb, `devices/${fp}`), {
        uid,
        ua: navigator.userAgent.slice(0, 200),
        ts: serverTimestamp()
      });
      return { multi: false };
    } catch (e) {
      console.warn("[antifraud] detectMultiAccount failed:", e);
      return { multi: false, error: e.message };
    }
  },

  /**
   * Generic rate limiter. Returns { ok, retryAfter }.
   * @param key - bucket key (e.g. "claim:uid123")
   * @param max - max actions in window
   * @param windowMs - window in ms
   */
  checkRate(key, max = 1, windowMs = 24 * 60 * 60 * 1000) {
    const now = Date.now();
    const bucket = RATE_BUCKETS.get(key) || { count: 0, resetAt: now + windowMs };
    if (now > bucket.resetAt) {
      bucket.count = 0;
      bucket.resetAt = now + windowMs;
    }
    bucket.count++;
    RATE_BUCKETS.set(key, bucket);
    if (bucket.count > max) {
      return { ok: false, retryAfter: bucket.resetAt - now };
    }
    return { ok: true };
  },

  /**
   * Pushes a suspicious event to /fraudLogs and triggers admin alerts.
   */
  async logSuspicious(payload) {
    try {
      const entry = {
        ...payload,
        ua: navigator.userAgent.slice(0, 200),
        url: location.pathname,
        ts: serverTimestamp()
      };
      const fp = await this.fingerprint().catch(() => "unknown");
      entry.fingerprint = fp;
      await push(ref(firebaseDb, "fraudLogs"), entry);
      // Admin alert node
      await push(ref(firebaseDb, "adminAlerts"), {
        type: payload.type,
        severity: payload.severity || "medium",
        ts: serverTimestamp(),
        fp,
        uid: payload.uid || null,
        read: false
      });
    } catch (e) {
      console.warn("[antifraud] logSuspicious failed:", e);
    }
  },

  /**
   * Comprehensive pre-action check. Call before any reward-granting action.
   * Returns { allowed, reasons[] }.
   */
  async preActionCheck(uid, actionKey, maxPerWindow = 1, windowMs = 24 * 3600 * 1000) {
    const reasons = [];
    // 1. Rate limit
    const rate = this.checkRate(`${actionKey}:${uid}`, maxPerWindow, windowMs);
    if (!rate.ok) {
      reasons.push("rate_limited");
      showToast("Rate limited. Try again later.", "warn");
    }
    // 2. Bot score
    const bot = this.botScore();
    if (bot > 0.6) {
      reasons.push("bot_suspected");
      this.logSuspicious({ type: "BOT_SUSPECTED", uid, score: bot, action: actionKey, severity: "high" });
    }
    // 3. Multi-account
    const ma = await this.detectMultiAccount(uid);
    if (ma.multi) reasons.push("multi_account");
    // 4. VPN/hosting detection (only for sensitive actions)
    if (actionKey === "claim" || actionKey === "referral_link") {
      const v = await this.isVPN();
      if (v.isHosting || v.isVPN) {
        this.logSuspicious({ type: "VPN_USAGE", uid, ip: v.ip, org: v.org, action: actionKey, severity: "low" });
        // Don't block — just flag
      }
    }
    return { allowed: reasons.length === 0, reasons };
  }
};

// Expose for inline debugging
window.__antifraud = antifraud;

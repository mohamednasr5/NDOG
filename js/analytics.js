/**
 * FILE NAME: js/analytics.js
 * PURPOSE: Firebase Analytics wrapper + custom event logger.
 *          Delegates to firebaseAnalytics; falls back to console if disabled.
 * DEPENDENCIES: firebase.js (firebaseAnalytics), utils.js
 * EXPORTS: analytics.log, analytics.screen, analytics.setUser, analytics.event
 */

import { firebaseAnalytics } from "./firebase.js";
import { logEvent, setUserProperties, setUserId, setAnalyticsCollectionEnabled } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-analytics.js";

export const analytics = {
  _enabled: !!firebaseAnalytics,

  async log(eventName, params = {}) {
    if (!this._enabled || !firebaseAnalytics) {
      console.debug("[analytics]", eventName, params);
      return;
    }
    try {
      logEvent(firebaseAnalytics, eventName, params);
    } catch (e) {
      console.warn("[analytics] log failed:", e);
    }
  },

  async screen(name) {
    return this.log("screen_view", { firebase_screen: name, firebase_screen_class: name });
  },

  async setUser(uid, props = {}) {
    if (!this._enabled || !firebaseAnalytics) return;
    try {
      if (uid) setUserId(firebaseAnalytics, uid);
      if (Object.keys(props).length) setUserProperties(firebaseAnalytics, props);
    } catch (e) {
      console.warn("[analytics] setUser failed:", e);
    }
  },

  async setEnabled(on) {
    this._enabled = on && !!firebaseAnalytics;
    if (firebaseAnalytics) {
      try {
        await setAnalyticsCollectionEnabled(firebaseAnalytics, on);
      } catch (e) {
        console.warn("[analytics] setEnabled failed:", e);
      }
    }
  },

  // Convenience event wrappers
  event: {
    login: (method = "google") => analytics.log("login", { method }),
    signup: (method = "google") => analytics.log("sign_up", { method }),
    claim: (amount, streak) => analytics.log("claim", { amount, streak, currency: "NDOG" }),
    referral_link_copied: () => analytics.log("referral_link_copied"),
    referral_bound: (level) => analytics.log("referral_bound", { level }),
    mission_complete: (id, reward) => analytics.log("mission_complete", { mission_id: id, reward }),
    airdrop_claim: (id, reward) => analytics.log("airdrop_claim", { task_id: id, reward }),
    stake: (amount, days, apr) => analytics.log("stake", { amount, days, apr }),
    stake_claim: (amount, reward) => analytics.log("stake_claim", { amount, reward }),
    leaderboard_view: (board) => analytics.log("leaderboard_view", { board }),
    error: (code, msg) => analytics.log("app_error", { code, message: String(msg).slice(0, 100) })
  }
};

window.__analytics = analytics;

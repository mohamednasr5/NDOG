/**
 * FILE NAME: js/auth.js
 * PURPOSE: Google Authentication (popup + One Tap), session persistence,
 *          auto-login, role-based access (user/mod/admin), profile sync,
 *          referral binding on first login, first-login reward grant,
 *          banned user detection, idle-logout, device registration.
 * DEPENDENCIES: firebase.js, utils.js, antifraud.js, database.js (lazy)
 * EXPORTS: auth.signIn, auth.signOut, auth.onReady, auth.requireRole,
 *          auth.currentUser, auth.isAdmin, auth.isMod
 */

import { firebaseAuth, firebaseDb } from "./firebase.js";
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  onAuthStateChanged,
  signOut as fbSignOut,
  setPersistence,
  browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { ref, get, set, update, onValue, serverTimestamp, runTransaction } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { showToast, getQueryParam, getCookie, setCookie, generateReferralCode } from "./utils.js";
import { antifraud } from "./antifraud.js";

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

const FIRST_LOGIN_REWARD = 100; // NDOG
const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
let _currentUser = null;
let _profileUnsub = null;
let _idleTimer = null;

export const auth = {
  /** Returns current user object (or null). */
  currentUser() {
    return _currentUser;
  },

  isAdmin() {
    return _currentUser?.role === "admin";
  },

  isMod() {
    return _currentUser?.role === "mod" || _currentUser?.role === "admin";
  },

  /** Trigger Google popup sign-in (with redirect fallback on mobile). */
  async signIn() {
    try {
      const isMobile = /Mobi|Android/i.test(navigator.userAgent);
      if (isMobile && !("AbortController" in window)) {
        await signInWithRedirect(firebaseAuth, googleProvider);
        return;
      }
      await signInWithPopup(firebaseAuth, googleProvider);
    } catch (e) {
      if (e.code === "auth/popup-blocked" || e.code === "auth/cancelled-popup-request") {
        await signInWithRedirect(firebaseAuth, googleProvider);
      } else if (e.code !== "auth/popup-closed-by-user") {
        console.error("[auth] signIn error:", e);
        showToast(e.message || "Sign-in failed", "error");
      }
    }
  },

  /** Google One Tap (GIS) — loaded from Google Identity Services. */
  initOneTap() {
    if (!window.google?.accounts?.id) {
      // Lazy-load GIS
      const s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client";
      s.async = true;
      s.defer = true;
      s.onload = () => this._renderOneTap();
      document.head.appendChild(s);
    } else {
      this._renderOneTap();
    }
  },

  _renderOneTap() {
    try {
      window.google.accounts.id.initialize({
        client_id: "829364393352.apps.googleusercontent.com",
        callback: async (response) => {
          // One Tap returns a JWT credential; Firebase handles via signInWithCredential
          // For simplicity we fall back to popup if One Tap credential isn't directly usable
          if (response.credential) {
            // Best-effort: trigger normal popup flow (Firebase handles ID token in popup)
            await this.signIn();
          }
        },
        auto_select: false,
        cancel_on_tap_outside: true
      });
      window.google.accounts.id.prompt();
    } catch (e) {
      console.warn("[auth] One Tap init failed:", e);
    }
  },

  async signOut() {
    try {
      if (_profileUnsub) {
        _profileUnsub();
        _profileUnsub = null;
      }
      await fbSignOut(firebaseAuth);
      _currentUser = null;
      setCookie("ndog_session", "", -1);
      showToast("Signed out", "info", 2000);
      // Redirect to home if on protected page
      if (document.body.dataset.proted === "true") {
        location.href = "/";
      }
    } catch (e) {
      console.error("[auth] signOut error:", e);
    }
  },

  /**
   * Bootstrap auth state. Called once on app start.
   * @param {Function} cb - called with (user|null) after profile is loaded
   */
  onReady(cb) {
    // Handle redirect result first
    getRedirectResult(firebaseAuth).catch((e) => console.warn("[auth] redirect result:", e.code));

    onAuthStateChanged(firebaseAuth, async (firebaseUser) => {
      if (!firebaseUser) {
        _currentUser = null;
        if (_profileUnsub) {
          _profileUnsub();
          _profileUnsub = null;
        }
        document.body.classList.remove("logged-in");
        document.body.classList.add("logged-out");
        cb?.(null);
        return;
      }
      try {
        await this._loadOrCreateProfile(firebaseUser);
        await this._registerDevice(firebaseUser.uid);
        // Realtime profile sync
        if (_profileUnsub) _profileUnsub();
        _profileUnsub = onValue(ref(firebaseDb, `users/${firebaseUser.uid}`), (snap) => {
          if (snap.exists()) {
            _currentUser = { ...firebaseUser, ...snap.val() };
            cb?.(_currentUser);
            // Ban enforcement
            if (snap.val().banned) {
              showToast("This account is banned.", "error");
              this.signOut();
              return;
            }
            // Role classes for CSS targeting
            document.body.dataset.role = snap.val().role || "user";
          }
        });
        document.body.classList.add("logged-in");
        document.body.classList.remove("logged-out");
        // Idle timeout
        this._startIdleTimer();
      } catch (e) {
        console.error("[auth] profile load error:", e);
        showToast("Failed to load profile", "error");
      }
    });
  },

  /**
   * Load profile from DB; create if missing (first login).
   * Bind referral code from URL or cookie if first-time.
   */
  async _loadOrCreateProfile(fbUser) {
    const profileRef = ref(firebaseDb, `users/${fbUser.uid}`);
    const snap = await get(profileRef);
    const refFromUrl = getQueryParam("ref") || getCookie("ndog_pending_ref");
    const lang = (navigator.language || "en").slice(0, 2);
    const countryGuess = (navigator.language || "").includes("-") ? navigator.language.split("-")[1].toUpperCase() : null;

    if (!snap.exists()) {
      // FIRST LOGIN — create profile + grant welcome bonus + bind referral
      const referralCode = generateReferralCode(fbUser.uid);
      const newProfile = {
        uid: fbUser.uid,
        email: fbUser.email || null,
        displayName: fbUser.displayName || "Anon NDOG",
        photoURL: fbUser.photoURL || null,
        role: "user",
        balance: FIRST_LOGIN_REWARD,
        communityScore: 0,
        loyaltyScore: 0,
        vipLevel: 0,
        founder: false,
        banned: false,
        country: countryGuess,
        language: lang,
        referralCode,
        referredBy: refFromUrl || null,
        createdAt: serverTimestamp(),
        lastLogin: serverTimestamp(),
        firstLoginReward: true,
        streak: 0,
        lastClaimAt: 0
      };
      await set(profileRef, newProfile);
      // Index referral code for lookup
      await set(ref(firebaseDb, `referralCodes/${referralCode}`), fbUser.uid);
      // Credit referrer if applicable
      if (refFromUrl) {
        await this._creditReferrer(refFromUrl, fbUser.uid);
        showToast("Welcome bonus: 100 NDOG + referral linked!", "success");
      } else {
        showToast("Welcome bonus: 100 NDOG credited!", "success");
      }
      // Log first-login event for analytics
      await set(ref(firebaseDb, `analytics/firstLogins/${fbUser.uid}`), { ts: serverTimestamp(), country: countryGuess });
      // Clear pending referral cookie
      if (getCookie("ndog_pending_ref")) {
        document.cookie = "ndog_pending_ref=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/;";
      }
    } else {
      // Existing user — update lastLogin
      await update(profileRef, { lastLogin: serverTimestamp(), language: lang });
    }

    // Check admin status
    const adminSnap = await get(ref(firebaseDb, `admins/${fbUser.uid}`));
    if (adminSnap.exists()) {
      await update(profileRef, { role: adminSnap.val().role || "admin" });
    }
  },

  /**
   * Credits the referrer chain (Level 1: 50, Level 2: 20, Level 3: 10).
   * Prevents self-referral.
   */
  async _creditReferrer(refCode, newUid) {
    try {
      if (!refCode || !newUid) return;
      // Look up referrer uid from code
      const codeSnap = await get(ref(firebaseDb, `referralCodes/${refCode}`));
      if (!codeSnap.exists()) {
        console.warn("[auth] Referral code not found:", refCode);
        return;
      }
      const l1Uid = codeSnap.val();
      if (l1Uid === newUid) {
        await antifraud.logSuspicious({
          type: "SELF_REFERRAL_ATTEMPT",
          uid: newUid,
          refCode,
          severity: "high"
        });
        return;
      }
      // Credit L1
      await runTransaction(ref(firebaseDb, `users/${l1Uid}/balance`), (cur) => (cur || 0) + 50);
      await push(ref(firebaseDb, `referrals/${l1Uid}`), {
        level: 1,
        referredUid: newUid,
        reward: 50,
        ts: serverTimestamp()
      });
      // Find L2 (referrer of L1)
      const l1Snap = await get(ref(firebaseDb, `users/${l1Uid}/referredBy`));
      if (l1Snap.exists()) {
        const l2Uid = l1Snap.val();
        if (l2Uid && l2Uid !== newUid) {
          await runTransaction(ref(firebaseDb, `users/${l2Uid}/balance`), (cur) => (cur || 0) + 20);
          await push(ref(firebaseDb, `referrals/${l2Uid}`), {
            level: 2,
            referredUid: newUid,
            reward: 20,
            ts: serverTimestamp()
          });
          // Find L3
          const l2Snap = await get(ref(firebaseDb, `users/${l2Uid}/referredBy`));
          if (l2Snap.exists()) {
            const l3Uid = l2Snap.val();
            if (l3Uid && l3Uid !== newUid) {
              await runTransaction(ref(firebaseDb, `users/${l3Uid}/balance`), (cur) => (cur || 0) + 10);
              await push(ref(firebaseDb, `referrals/${l3Uid}`), {
                level: 3,
                referredUid: newUid,
                reward: 10,
                ts: serverTimestamp()
              });
            }
          }
        }
      }
      // Update conversion stats on referrer
      await runTransaction(ref(firebaseDb, `users/${l1Uid}/referralCount`), (c) => (c || 0) + 1);
    } catch (e) {
      console.error("[auth] creditReferrer error:", e);
    }
  },

  /** Register this device in /devices keyed by fingerprint. */
  async _registerDevice(uid) {
    try {
      const fp = await antifraud.fingerprint();
      await set(ref(firebaseDb, `devices/${fp}`), {
        uid,
        ua: navigator.userAgent.slice(0, 200),
        lang: navigator.language,
        lastSeen: serverTimestamp()
      });
      await set(ref(firebaseDb, `users/${uid}/devices/${fp}`), { lastSeen: serverTimestamp() });
    } catch (e) {
      console.warn("[auth] device register failed:", e);
    }
  },

  /** Role-based access guard. Call from protected pages. */
  requireRole(minRole) {
    const order = { user: 1, mod: 2, admin: 3 };
    const cur = order[_currentUser?.role || "user"] || 1;
    if (cur < (order[minRole] || 1)) {
      showToast("Access denied.", "error");
      location.href = "/";
      return false;
    }
    return true;
  },

  _startIdleTimer() {
    if (_idleTimer) clearTimeout(_idleTimer);
    const reset = () => {
      clearTimeout(_idleTimer);
      _idleTimer = setTimeout(() => {
        console.log("[auth] Idle timeout — signing out");
        this.signOut();
      }, IDLE_TIMEOUT_MS);
    };
    ["mousemove", "keydown", "touchstart", "scroll"].forEach((ev) =>
      window.addEventListener(ev, reset, { passive: true })
    );
    reset();
  }
};

// Pre-store referral code if URL has one (for users not yet signed in)
(function captureReferral() {
  const r = getQueryParam("ref");
  if (r) {
    setCookie("ndog_pending_ref", r, 7); // 7-day attribution window
  }
})();

// Expose for inline buttons
window.__auth = auth;

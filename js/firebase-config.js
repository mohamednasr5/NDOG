/**
 * NileDogs (NDOG) — Firebase Configuration
 * ------------------------------------------------------------------
 * Replace the placeholder values below with the credentials from
 * your own Firebase project (Project Settings → General → SDK setup).
 * Then enable the following in the Firebase Console:
 *
 *   1. Authentication → Sign-in method → Google (Enabled)
 *   2. Realtime Database  → Create database (production mode)
 *   3. Hosting            → (optional) deploy rules separately
 *   4. Project Settings → Authorized domains → add:
 *        - mohamednasr5.github.io
 *
 * The Firebase SDK is loaded via ES module CDN imports (no bundler).
 * ------------------------------------------------------------------
 */

import { initializeApp } from
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  setPersistence,
  browserLocalPersistence,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getDatabase,
  ref,
  get,
  set,
  update,
  push,
  remove,
  onValue,
  query,
  orderByChild,
  orderByValue,
  limitToLast,
  limitToFirst,
  equalTo,
  serverTimestamp,
  onDisconnect
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

// ───────────────────────────────────────────────────────────────────
// 1. PROJECT CONFIG  ← Your ndog-a3265 Firebase project credentials
// ───────────────────────────────────────────────────────────────────
export const firebaseConfig = {
  apiKey:            "AIzaSyAwvOJCX4qSAtqcF_fcnHtQgsTArnIrrhc",
  authDomain:        "ndog-a3265.firebaseapp.com",
  databaseURL:       "https://ndog-a3265-default-rtdb.europe-west1.firebasedatabase.app",
  projectId:         "ndog-a3265",
  storageBucket:     "ndog-a3265.firebasestorage.app",
  messagingSenderId: "829364393352",
  appId:             "1:829364393352:web:82d0d0a99a3b3f2200163d",
  measurementId:     "G-YF7HC7T8M0"
};

// ───────────────────────────────────────────────────────────────────
// 2. APP CONSTANTS
// ───────────────────────────────────────────────────────────────────
export const APP_CONFIG = {
  name:           "NileDogs",
  ticker:         "NDOG",
  domain:         "https://mohamednasr5.github.io/NDOG/",
  launchDate:     new Date("2028-01-01T00:00:00Z"),
  referralReward: { l1: 50, l2: 20, l3: 10 },   // NDOG per referred user
  claimBase:      10,                            // base daily claim amount
  streakBonus:    { 7: 1.5, 14: 2, 30: 3 },     // multiplier by streak length
  referralBonus:  0.25,                          // extra multiplier if user came via referral
  rewardLevels: [
    { nameKey: "dash.level.bronze",  min:    0, icon: "🥉", color: "#cd7f32" },
    { nameKey: "dash.level.silver",  min:  500, icon: "🥈", color: "#c0c0c0" },
    { nameKey: "dash.level.gold",    min: 2000, icon: "🥇", color: "#ffd700" },
    { nameKey: "dash.level.diamond", min:10000, icon: "💎", color: "#b9f2ff" },
    { nameKey: "dash.level.legend",  min:50000, icon: "👑", color: "#ff6ec7" }
  ],
  adminUIDs: ["REPLACE_WITH_YOUR_FIREBASE_UID"]  // ← set your admin UID(s)
};

// ───────────────────────────────────────────────────────────────────
// 3. INITIALIZE FIREBASE
// ───────────────────────────────────────────────────────────────────
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db   = getDatabase(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

// Persist sessions locally so users stay logged in after refresh.
setPersistence(auth, browserLocalPersistence).catch(err =>
  console.warn("[NDOG] Auth persistence failed:", err)
);

// ───────────────────────────────────────────────────────────────────
// 4. EXPORT HELPERS
// ───────────────────────────────────────────────────────────────────
export {
  ref, get, set, update, push, remove, onValue,
  query, orderByChild, orderByValue,
  limitToLast, limitToFirst, equalTo,
  serverTimestamp, onDisconnect,
  signInWithPopup, signInWithRedirect, getRedirectResult,
  signOut, onAuthStateChanged
};

/**
 * Generate a unique, human-readable referral code: NDOG + 5 random digits.
 * @returns {string}
 */
export function generateReferralCode() {
  const n = Math.floor(10000 + Math.random() * 89999);
  return `NDOG${n}`;
}

/**
 * Lightweight device fingerprint for anti-multi-account protection.
 * Combines screen, timezone, language, and a stored random token.
 * @returns {Promise<string>}
 */
export async function getDeviceFingerprint() {
  const stored = localStorage.getItem("ndog_device_id");
  if (stored) return stored;
  const parts = [
    navigator.userAgent,
    navigator.language,
    screen.width + "x" + screen.height,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    new Date().getTimezoneOffset()
  ].join("|");
  const token = btoa(unescape(encodeURIComponent(parts)))
                  .replace(/[^a-zA-Z0-9]/g, "")
                  .slice(0, 24) + Date.now().toString(36);
  localStorage.setItem("ndog_device_id", token);
  return token;
}
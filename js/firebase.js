/**
 * FILE NAME: js/firebase.js
 * PURPOSE: Firebase initialization singleton. Exposes app, auth, db, storage, analytics.
 *          Provides connection pooling, offline persistence, and graceful degradation.
 * DEPENDENCIES: Firebase JS SDK v10+ (loaded via ESM CDN in HTML).
 * EXPORTS: firebaseApp, firebaseAuth, firebaseDb, firebaseStorage, firebaseAnalytics
 */

import { initializeApp, getApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  initializeAuth,
  browserPopupRedirectResolver
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getDatabase, connectDatabaseEmulator } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { getAnalytics, isSupported } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-analytics.js";

export const firebaseConfig = {
  apiKey: "AIzaSyAwvOJCX4qSAtqcF_fcnHtQgsTArnIrrhc",
  authDomain: "ndog-a3265.firebaseapp.com",
  databaseURL: "https://ndog-a3265-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "ndog-a3265",
  storageBucket: "ndog-a3265.firebasestorage.app",
  messagingSenderId: "829364393352",
  appId: "1:829364393352:web:82d0d0a99a3b3f2200163d",
  measurementId: "G-YF7HC7T8M0"
};

// Singleton initializer — prevents duplicate-app errors on HMR/reload
export const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);

// Auth with local persistence (survives browser restart)
export const firebaseAuth = (function buildAuth() {
  try {
    return getAuth(firebaseApp);
  } catch (e) {
    return initializeAuth(firebaseApp, {
      persistence: browserLocalPersistence,
      popupRedirectResolver: browserPopupRedirectResolver
    });
  }
})();

// Force local persistence for auto-login
setPersistence(firebaseAuth, browserLocalPersistence).catch((err) => {
  console.warn("[firebase] Persistence set failed:", err.code);
});

// Realtime Database
export const firebaseDb = getDatabase(firebaseApp);

// Storage
export const firebaseStorage = getStorage(firebaseApp);

// Analytics (only in supported browsers — disabled in SSR/file://)
export const firebaseAnalytics = await isSupported().then((ok) => (ok ? getAnalytics(firebaseApp) : null)).catch(() => null);

// Connection state heartbeat — used by antifraud to detect offline spoofing
export const connectionRef = firebaseDb ? getDatabase(firebaseApp).ref(".info/connected") : null;

console.log("[firebase] Initialized ✓", {
  projectId: firebaseConfig.projectId,
  region: "europe-west1",
  analytics: !!firebaseAnalytics
});

/**
 * NileDogs (NDOG) — Firebase Initialization
 * ------------------------------------------------
 * This file MUST be loaded AFTER the Firebase compat SDK scripts in the HTML:
 *   firebase-app-compat.js
 *   firebase-auth-compat.js
 *   firebase-database-compat.js
 *
 * It initializes the Firebase app (singleton), then exposes
 * `window.NDOG.db` (Realtime Database) and `window.NDOG.auth`
 * (Authentication) so every other module can access them.
 */
(function () {
  'use strict';

  var firebaseConfig = {
    apiKey: 'AIzaSyAwvOJCX4qSAtqcF_fcnHtQgsTArnIrrhc',
    authDomain: 'ndog-a3265.firebaseapp.com',
    databaseURL:
      'https://ndog-a3265-default-rtdb.europe-west1.firebasedatabase.app',
    projectId: 'ndog-a3265',
    storageBucket: 'ndog-a3265.firebasestorage.app',
    messagingSenderId: '829364393352',
    appId: '1:829364393352:web:82d0d0a99a3b3f2200163d',
    measurementId: 'G-YF7HC7T8M0',
  };

  // Guard: ensure Firebase SDK is available
  if (typeof window.firebase === 'undefined') {
    console.error(
      '[NDOG] Firebase SDK not loaded. Make sure the compat scripts are included before this file.'
    );
    return;
  }

  // Initialize Firebase app (only once — even if this script runs again)
  if (!window.firebase.apps || !window.firebase.apps.length) {
    window.firebase.initializeApp(firebaseConfig);
  }

  // Create the global NDOG namespace
  window.NDOG = window.NDOG || {};

  // Expose database & auth references
  window.NDOG.db = window.firebase.database();
  window.NDOG.auth = window.firebase.auth();

  // Reactive state — updated by the auth module
  window.NDOG.currentUser = null;
  window.NDOG.userProfile = null;

  console.log('[NDOG] Firebase initialized successfully.');
})();
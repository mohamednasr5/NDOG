/**
 * NileDogs (NDOG) — Firebase Initialization (FIXED v1.3.0)
 * ✅ Fixed: Added timeout handling for Firebase SDK CDN load failures
 * 
 * This file MUST be loaded AFTER the Firebase compat SDK scripts in the HTML:
 *   firebase-app-compat.js
 *   firebase-auth-compat.js
 *   firebase-database-compat.js
 *
 * It initializes the Firebase app (singleton), then exposes
 * `window.NDOG.db` (Realtime Database) and `window.NDOG.auth`
 * (Authentication) so every other module can access them.
 * 
 * IMPROVEMENTS:
 * - Added timeout detection for Firebase SDK failures
 * - Better error messaging for users on slow/offline connections
 * - Graceful fallback with retry button
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

  // ============================================================
  // TIMEOUT HANDLER: If Firebase SDK doesn't load within 12 seconds,
  // show an error message to the user with a retry option.
  // ============================================================
  var firebaseLoadTimer = setTimeout(function () {
    if (typeof window.firebase === 'undefined') {
      console.error(
        '[NDOG] ❌ Firebase SDK failed to load within 12 seconds. ' +
        'This usually means a connection issue with Google CDN.'
      );

      // Show error screen to user
      var errorScreen = document.createElement('div');
      errorScreen.id = 'firebase-error-screen';
      errorScreen.style.cssText =
        'position:fixed;inset:0;z-index:99999;' +
        'background:linear-gradient(135deg,#0a1f44 0%,#1a3a5c 100%);' +
        'display:flex;align-items:center;justify-content:center;' +
        'font-family:system-ui,sans-serif;';

      errorScreen.innerHTML =
        '<div style="text-align:center;max-width:420px;width:90%;color:#fff;padding:32px;">' +
        '<div style="font-size:56px;margin-bottom:24px;">⚠️</div>' +
        '<h2 style="font-size:24px;font-weight:700;margin:0 0 16px;color:#d4a017;">Connection Error</h2>' +
        '<p style="font-size:16px;color:#e0e7ff;margin:0 0 12px;line-height:1.6;">' +
        'Unable to load Firebase services. This may indicate:' +
        '</p>' +
        '<ul style="text-align:left;font-size:14px;color:#cbd5e1;margin:12px 0 24px;padding:0 16px;">' +
        '<li>✓ No internet connection</li>' +
        '<li>✓ Network is blocking Google CDN</li>' +
        '<li>✓ Browser firewall or extension blocking requests</li>' +
        '</ul>' +
        '<p style="font-size:14px;color:#94a3b8;margin:0 0 24px;">' +
        'Please check your connection and try again.' +
        '</p>' +
        '<button id="firebase-retry-btn" ' +
        'style="padding:14px 40px;margin:8px;' +
        'background:#d4a017;color:#0a1f44;border:none;border-radius:8px;' +
        'font-size:16px;font-weight:700;cursor:pointer;' +
        'transition:all 0.3s ease;' +
        '"' +
        'onmouseover="this.style.background=\'#ffaa00\'" ' +
        'onmouseout="this.style.background=\'#d4a017\'"' +
        '>' +
        '🔄 Retry</button>' +
        '<p style="font-size:12px;color:#475569;margin:12px 0 0;">' +
        'If the problem persists, try opening this link in a different browser.' +
        '</p>' +
        '</div>';

      document.body.appendChild(errorScreen);

      // Add retry functionality
      var retryBtn = document.getElementById('firebase-retry-btn');
      if (retryBtn) {
        retryBtn.addEventListener('click', function () {
          retryBtn.textContent = '⏳ Retrying...';
          retryBtn.disabled = true;
          window.location.reload();
        });
      }
    }
  }, 12000); // 12 second timeout

  // ============================================================
  // GUARD: Ensure Firebase SDK is available
  // ============================================================
  if (typeof window.firebase === 'undefined') {
    console.error(
      '[NDOG] Firebase SDK not loaded. Make sure the compat scripts are included before this file.'
    );
    // Don't throw — let the timeout handler show the error
    return;
  }

  // Firebase SDK loaded successfully — clear the timeout
  clearTimeout(firebaseLoadTimer);

  // ============================================================
  // Initialize Firebase app (only once — even if this script runs again)
  // ============================================================
  if (!window.firebase.apps || !window.firebase.apps.length) {
    try {
      window.firebase.initializeApp(firebaseConfig);
      console.log('[NDOG] ✅ Firebase app initialized successfully');
    } catch (err) {
      console.error('[NDOG] Firebase initialization error:', err);
      // Remove the error screen if it exists
      var existing = document.getElementById('firebase-error-screen');
      if (existing) existing.remove();
      // Show a new error
      var initError = document.createElement('div');
      initError.style.cssText =
        'position:fixed;inset:0;z-index:99999;' +
        'background:#0a1f44;color:#fff;' +
        'display:flex;align-items:center;justify-content:center;' +
        'font-family:system-ui,sans-serif;';
      initError.innerHTML =
        '<div style="text-align:center;max-width:400px;width:90%;">' +
        '<h2>Firebase Init Error</h2>' +
        '<p>' + err.message + '</p>' +
        '<button onclick="location.reload()" style="padding:10px 30px;' +
        'background:#d4a017;border:none;border-radius:8px;cursor:pointer;' +
        'font-weight:700;">Retry</button></div>';
      document.body.appendChild(initError);
      return;
    }
  }

  // ============================================================
  // Create the global NDOG namespace
  // ============================================================
  window.NDOG = window.NDOG || {};

  // ============================================================
  // Expose database & auth references
  // ============================================================
  try {
    window.NDOG.db = window.firebase.database();
    window.NDOG.auth = window.firebase.auth();
    
    // Reactive state — updated by the auth module
    window.NDOG.currentUser = null;
    window.NDOG.userProfile = null;

    console.log('[NDOG] ✅ Firebase initialized successfully.');
    
    // Remove error screen if it was displayed
    var errorScreen = document.getElementById('firebase-error-screen');
    if (errorScreen) {
      errorScreen.remove();
    }
  } catch (err) {
    console.error('[NDOG] Error setting up Firebase references:', err);
    var refError = document.createElement('div');
    refError.style.cssText =
      'position:fixed;inset:0;z-index:99999;' +
      'background:#0a1f44;color:#fff;' +
      'display:flex;align-items:center;justify-content:center;';
    refError.innerHTML =
      '<div style="text-align:center;max-width:400px;width:90%;">' +
      '<h2>Firebase Reference Error</h2>' +
      '<p>' + err.message + '</p>' +
      '<button onclick="location.reload()" style="padding:10px 30px;' +
      'background:#d4a017;border:none;border-radius:8px;cursor:pointer;' +
      'font-weight:700;">Reload</button></div>';
    document.body.appendChild(refError);
  }
})();
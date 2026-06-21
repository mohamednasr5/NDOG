/**
 * ═══════════════════════════════════════════════════════════════
 *  NileDogs (NDOG) — Main Application Orchestrator
 *  Loaded LAST. Bootstraps all modules after DOM is ready.
 * ═══════════════════════════════════════════════════════════════
 *
 *  Module Load Order:
 *    1. NDOG.Particles  — background particle animation
 *    2. NDOG.Notify     — toast notification system
 *    3. NDOG.Security   — device fingerprint & anti-fraud
 *    4. NDOG.Auth       — Firebase auth + user profile (triggers login flow)
 *       └── On login success calls:
 *           a. NDOG.UI.init()           — navigation, translations, games, countdown
 *           b. NDOG.Claim.init()        — daily claim logic
 *           c. NDOG.Referrals.init()    — referral system
 *           d. NDOG.Missions.init()     — missions & tasks
 *           e. NDOG.Leaderboard.init()   — rankings display
 *           f. NDOG.Staking.init()       — staking features
 *           g. NDOG.Airdrop.init()       — airdrop campaigns
 *           h. NDOG.Admin.init()         — admin panel (if user is admin)
 *    5. Service Worker registration
 *    6. Preloader failsafe (8 seconds)
 *
 *  Note: Auth.init() is the critical path — it handles the login
 *  flow and triggers everything else. If a user is already logged
 *  in, it immediately loads their profile and bootstraps the app.
 *  If not, it shows the login screen.
 */
(function () {
  'use strict';

  /* ────────────────────────────────────────────────────
     MODULE LOADER — safely initialize optional modules
  ──────────────────────────────────────────────────── */
  function safeInit(moduleName) {
    if (window.NDOG && window.NDOG[moduleName] && typeof window.NDOG[moduleName].init === 'function') {
      try {
        window.NDOG[moduleName].init();
      } catch (err) {
        console.error('[NDOG] Error initializing ' + moduleName + ':', err);
      }
    }
  }

  /* ────────────────────────────────────────────────────
     WAIT FOR DOM READY
  ──────────────────────────────────────────────────── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    // DOM already loaded (script loaded with defer or at bottom)
    bootstrap();
  }

  function bootstrap() {
    console.log('[NDOG] Bootstrapping NileDogs Ecosystem v3.0.0...');

    /* ─────────── Step 1: Visual & Utility Modules ─────────── */

    // Particles background — pure visual, no dependencies
    safeInit('Particles');

    // Toast notification system — needed before any notifications fire
    safeInit('Notify');

    // Security / device fingerprint — runs early for anti-fraud
    safeInit('Security');

    /* ─────────── Step 2: Authentication ─────────────────── */

    // Auth is the critical path module.
    // It handles:
    //   - Google Sign-In via Firebase Auth
    //   - New user profile creation (with ref code generation)
    //   - Existing user profile loading
    //   - Referral code processing from URL params
    //   - Banned user detection → banned modal
    //
    // Auth.init() internally calls:
    //   UI.init()          → sets up navigation, translations, countdown, games
    //   UI.updateDashboard() → populates dashboard with user data
    //   UI.hidePreloader()  → fades out the loading screen
    //   Claim.init()        → daily claim logic
    //   Referrals.init()    → referral tracking
    //   Missions.init()     → missions & tasks display
    //   Leaderboard.init()  → leaderboard rankings
    //   Staking.init()      → staking features (if available)
    //   Airdrop.init()      → airdrop campaigns (if available)
    //   Admin.init()        → admin panel (if user role === 'admin')
    //
    // If no user is logged in, it shows the login screen and hides the app shell.
    safeInit('Auth');

    /* ─────────── Step 3: Service Worker ──────────────────── */

    // Register service worker for offline support & caching
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').then(function (reg) {
        console.log('[NDOG] Service Worker registered (scope: ' + reg.scope + ')');

        // Listen for updates
        reg.addEventListener('updatefound', function () {
          var newWorker = reg.installing;
          newWorker.addEventListener('statechange', function () {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // New version available — could notify user
              console.log('[NDOG] New service worker version available');
            }
          });
        });
      }).catch(function (err) {
        console.warn('[NDOG] Service Worker registration failed:', err);
      });
    }

    /* ─────────── Step 4: Preloader Failsafe ─────────────── */

    // If for any reason the normal preloader hide doesn't fire within 8 seconds,
    // force-hide it and ensure the user can interact with the app.
    setTimeout(function () {
      var preloader = document.getElementById('preloader');
      if (preloader && !preloader.classList.contains('done')) {
        console.warn('[NDOG] Failsafe: forcing preloader hide after 8s timeout');

        preloader.classList.add('done');
        setTimeout(function () {
          if (preloader.parentNode) {
            preloader.remove();
          }
        }, 600);

        // Ensure login screen is visible if app shell is hidden
        var appShell = document.getElementById('appShell');
        var loginScreen = document.getElementById('loginScreen');
        if (appShell && appShell.classList.contains('hidden') &&
            loginScreen && loginScreen.classList.contains('hidden')) {
          loginScreen.classList.remove('hidden');
          loginScreen.style.opacity = '1';
          loginScreen.style.visibility = 'visible';
        }
      }
    }, 8000);

    /* ─────────── Step 5: Global Error Handling ──────────── */

    // Listen for module loading errors (e.g. stale cached ES modules)
    window.addEventListener('error', function (e) {
      if (e.message && e.message.indexOf('does not provide an export') !== -1) {
        console.error('[NDOG] Module error detected — stale cache likely, suggest hard reload');

        // Show a subtle update prompt to the user
        var existingPrompt = document.getElementById('ndog-update-prompt');
        if (!existingPrompt) {
          var prompt = document.createElement('div');
          prompt.id = 'ndog-update-prompt';
          prompt.style.cssText =
            'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);' +
            'background:linear-gradient(135deg,#ffd700,#ffaa00);color:#0a1f44;' +
            'padding:14px 28px;border-radius:14px;font-size:15px;font-weight:700;' +
            'z-index:999999;cursor:pointer;box-shadow:0 6px 30px rgba(255,215,0,0.4);' +
            'font-family:system-ui,sans-serif;text-align:center;max-width:90vw;';
          prompt.textContent =
            '\u26A1 \u062A\u062D\u062F\u064A\u062B \u0645\u062A\u0627\u062D \u2014 ' +
            '\u0627\u0636\u063A\u0637 \u0644\u0644\u062A\u062D\u062F\u064A\u062B / Update available';
          prompt.addEventListener('click', function () {
            prompt.textContent = '\u23F3 \u062C\u0627\u0631\u064A \u0627\u0644\u062A\u062D\u062F\u064A\u062B... / Updating...';
            // Clear caches
            if ('caches' in window) {
              caches.keys().then(function (keys) {
                return Promise.all(keys.map(function (k) { return caches.delete(k); }));
              });
            }
            // Tell service worker to skip waiting
            if (navigator.serviceWorker && navigator.serviceWorker.controller) {
              navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' });
            }
            setTimeout(function () { location.reload(); }, 500);
          });
          document.body.appendChild(prompt);
        }
      }
    });

    /* ─────────── Step 6: Visibility Change ──────────────── */

    // Refresh data when user returns to the tab
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && window.NDOG && window.NDOG.Auth) {
        // Refresh profile data silently
        if (typeof window.NDOG.Auth.refreshSession === 'function') {
          window.NDOG.Auth.refreshSession();
        }
      }
    });

    /* ─────────── Step 7: Online/Offline Handling ────────── */

    window.addEventListener('online', function () {
      console.log('[NDOG] Connection restored');
      if (window.NDOG && window.NDOG.Notify && window.NDOG.Notify.info) {
        window.NDOG.Notify.info('\u{1F4E1} ' + (window.NDOG.UI && window.NDOG.UI.language === 'ar'
          ? '\u062A\u0645 \u0627\u0633\u062A\u0639\u0627\u062F\u0629 \u0627\u0644\u0627\u062A\u0635\u0627\u0644'
          : 'Connection restored'));
      }
    });

    window.addEventListener('offline', function () {
      console.log('[NDOG] Connection lost');
      if (window.NDOG && window.NDOG.Notify && window.NDOG.Notify.warning) {
        window.NDOG.Notify.warning('\u{1F6AB} ' + (window.NDOG.UI && window.NDOG.UI.language === 'ar'
          ? '\u0644\u0627 \u064A\u0648\u062C\u062F \u0627\u062A\u0635\u0627\u0644 \u0628\u0627\u0644\u0625\u0646\u062A\u0631\u0646\u062A'
          : 'No internet connection'));
      }
    });

    /* ─────────── Done ──────────────────────────────────── */
    console.log('[NDOG] NileDogs Ecosystem v3.0.0 loaded successfully');
  }
})();

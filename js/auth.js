/**
 * NileDogs (NDOG) — Authentication Module (FIXED v1.3.0)
 * ✅ Fixed race condition: getRedirectResult() now called before onAuthStateChanged
 * 
 * Handles the full login / logout lifecycle:
 *   1. Calls getRedirectResult() first to handle mobile redirect flow
 *   2. Listens for Firebase auth state changes.
 *   3. On sign-in: checks ban, fingerprint, creates profile if new,
 *      processes referral codes, loads data, then shows the app shell.
 *   4. On sign-out: clears local state and shows the login screen.
 *   5. Checks URL for ?ref= referral code and stores in sessionStorage.
 */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ */
  /*  Internal helpers                                                    */
  /* ------------------------------------------------------------------ */

  /**
   * Guess the user's country from the browser timezone.
   * This is a lightweight heuristic — not geolocation-accurate, but
   * good enough for leaderboard grouping.
   * @returns {string} 2-letter country code or 'XX'
   */
  function guessCountry() {
    try {
      var tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
      var parts = tz.split('/');
      if (parts.length >= 2) {
        var cityMap = {
          'America/New_York': 'US', 'America/Chicago': 'US', 'America/Denver': 'US',
          'America/Los_Angeles': 'US', 'America/Anchorage': 'US', 'America/Sao_Paulo': 'BR',
          'America/Argentina/Buenos_Aires': 'AR', 'America/Mexico_City': 'MX',
          'America/Bogota': 'CO', 'America/Lima': 'PE', 'America/Santiago': 'CL',
          'America/Toronto': 'CA', 'America/Vancouver': 'CA', 'America/Montevideo': 'UY',
          'America/Caracas': 'VE', 'America/Havana': 'CU', 'America/Guatemala': 'GT',
          'America/El_Salvador': 'SV', 'America/Tegucigalpa': 'HN', 'America/Managua': 'NI',
          'America/San_Jose': 'CR', 'America/Panama': 'PA', 'America/Detroit': 'US',
          'America/Indianapolis': 'US', 'Europe/London': 'GB', 'Europe/Paris': 'FR',
          'Europe/Berlin': 'DE', 'Europe/Madrid': 'ES', 'Europe/Rome': 'IT',
          'Europe/Amsterdam': 'NL', 'Europe/Brussels': 'BE', 'Europe/Vienna': 'AT',
          'Europe/Zurich': 'CH', 'Europe/Stockholm': 'SE', 'Europe/Oslo': 'NO',
          'Europe/Copenhagen': 'DK', 'Europe/Helsinki': 'FI', 'Europe/Warsaw': 'PL',
          'Europe/Prague': 'CZ', 'Europe/Budapest': 'HU', 'Europe/Bucharest': 'RO',
          'Europe/Athens': 'GR', 'Europe/Lisbon': 'PT', 'Europe/Dublin': 'IE',
          'Europe/Istanbul': 'TR', 'Europe/Moscow': 'RU', 'Europe/Kiev': 'UA',
          'Europe/Minsk': 'BY', 'Europe/Sofia': 'BG', 'Europe/Zagreb': 'HR',
          'Europe/Belgrade': 'RS', 'Europe/Tallinn': 'EE', 'Europe/Riga': 'LV',
          'Europe/Vilnius': 'LT', 'Europe/Tirane': 'AL', 'Europe/Skopje': 'MK',
          'Europe/Podgorica': 'ME', 'Europe/Sarajevo': 'BA', 'Europe/Ljubljana': 'SI',
          'Europe/Bratislava': 'SK', 'Europe/Kaliningrad': 'RU', 'Europe/Volgograd': 'RU',
          'Europe/Samara': 'RU', 'Asia/Dubai': 'AE', 'Asia/Riyadh': 'SA',
          'Asia/Qatar': 'QA', 'Asia/Kuwait': 'KW', 'Asia/Bahrain': 'BH',
          'Asia/Muscat': 'OM', 'Asia/Baghdad': 'IQ', 'Asia/Tehran': 'IR',
          'Asia/Karachi': 'PK', 'Asia/Kolkata': 'IN', 'Asia/Colombo': 'LK',
          'Asia/Dhaka': 'BD', 'Asia/Kathmandu': 'NP', 'Asia/Almaty': 'KZ',
          'Asia/Tashkent': 'UZ', 'Asia/Bangkok': 'TH', 'Asia/Ho_Chi_Minh': 'VN',
          'Asia/Phnom_Penh': 'KH', 'Asia/Vientiane': 'LA', 'Asia/Yangon': 'MM',
          'Asia/Jakarta': 'ID', 'Asia/Kuala_Lumpur': 'MY', 'Asia/Singapore': 'SG',
          'Asia/Manila': 'PH', 'Asia/Shanghai': 'CN', 'Asia/Hong_Kong': 'HK',
          'Asia/Taipei': 'TW', 'Asia/Seoul': 'KR', 'Asia/Tokyo': 'JP',
          'Asia/Macau': 'MO', 'Asia/Ulaanbaatar': 'MN', 'Africa/Cairo': 'EG',
          'Africa/Lagos': 'NG', 'Africa/Johannesburg': 'ZA', 'Africa/Nairobi': 'KE',
          'Africa/Casablanca': 'MA', 'Africa/Tunis': 'TN', 'Africa/Algiers': 'DZ',
          'Africa/Khartoum': 'SD', 'Africa/Addis_Ababa': 'ET', 'Africa/Dar_es_Salaam': 'TZ',
          'Africa/Accra': 'GH', 'Africa/Abidjan': 'CI', 'Africa/Dakar': 'SN',
          'Australia/Sydney': 'AU', 'Australia/Melbourne': 'AU', 'Australia/Brisbane': 'AU',
          'Australia/Perth': 'AU', 'Australia/Adelaide': 'AU', 'Pacific/Auckland': 'NZ',
          'Pacific/Fiji': 'FJ', 'Pacific/Honolulu': 'US', 'Pacific/Guam': 'GU',
        };
        var mapped = cityMap[tz];
        if (mapped) return mapped;
      }
      return 'XX';
    } catch (err) {
      return 'XX';
    }
  }

  /**
   * Escape HTML to prevent XSS in ban modal.
   */
  function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Determine rank from total earned NDOG.
   * @param {number} totalEarned
   * @returns {string}
   */
  function computeRank(totalEarned) {
    if (totalEarned >= 100000) return 'Diamond';
    if (totalEarned >= 50000) return 'Platinum';
    if (totalEarned >= 20000) return 'Gold';
    if (totalEarned >= 5000) return 'Silver';
    return 'Bronze';
  }

  /* ------------------------------------------------------------------ */
  /*  Module                                                              */
  /* ------------------------------------------------------------------ */

  window.NDOG = window.NDOG || {};
  window.NDOG.Auth = {
    /* ---------------------------------------------------------------- */
    /*  Initialization                                                    */
    /* ---------------------------------------------------------------- */

    /**
     * Kick off the auth listener. Should be called once after all
     * scripts have loaded.
     * 
     * FIXED: Now calls getRedirectResult() BEFORE onAuthStateChanged()
     * This fixes the mobile redirect race condition.
     */
    init: function () {
      var self = this;
      this.checkReferralParam();

      // Bind the Google login button
      var loginBtn = document.getElementById('btnGoogleLogin');
      if (loginBtn) {
        loginBtn.addEventListener('click', function () {
          loginBtn.disabled = true;
          loginBtn.querySelector('span') && (loginBtn.querySelector('span').textContent = '...');
          self.loginWithGoogle().finally(function () {
            loginBtn.disabled = false;
          });
        });
      }

      // Bind logout buttons
      var logoutBtns = document.querySelectorAll('[data-logout]');
      for (var i = 0; i < logoutBtns.length; i++) {
        logoutBtns[i].addEventListener('click', function () {
          self.logout();
        });
      }

      // ============================================================
      // CRITICAL FIX: Handle getRedirectResult BEFORE onAuthStateChanged
      // This prevents race conditions on mobile where redirect flow
      // may not be captured by onAuthStateChanged alone.
      // ============================================================
      window.NDOG.auth.getRedirectResult()
        .then(function(result) {
          if (result && result.user) {
            console.log('[NDOG.Auth] ✅ Redirect result received for:', result.user.uid);
            // The user will be caught by onAuthStateChanged next
          } else {
            console.log('[NDOG.Auth] No redirect result');
          }
        })
        .catch(function(err) {
          // Common errors: auth/popup-closed-by-user, etc.
          // Don't fail — just log and continue
          if (err.code !== 'auth/popup-closed-by-user') {
            console.warn('[NDOG.Auth] getRedirectResult error:', err.code, err.message);
          }
        })
        .finally(function() {
          // Now set up the state listener
          // This will catch both new logins and existing sessions
          window.NDOG.auth.onAuthStateChanged(function (user) {
            if (user) {
              window.NDOG.currentUser = user;
              self.handleLogin(user);
            } else {
              window.NDOG.currentUser = null;
              window.NDOG.userProfile = null;
              self.showLoginScreen();
            }
          });
        });
    },

    /* ---------------------------------------------------------------- */
    /*  Login / Logout                                                     */
    /* ---------------------------------------------------------------- */

    /**
     * Open the Google sign-in popup.
     * @returns {Promise<object|null>} Firebase user or null
     */
    loginWithGoogle: async function () {
      try {
        var provider = new window.firebase.auth.GoogleAuthProvider();
        provider.addScope('profile');
        provider.addScope('email');
        var result = await window.NDOG.auth.signInWithPopup(provider);
        return result.user;
      } catch (error) {
        if (error.code === 'auth/popup-closed-by-user') {
          window.NDOG.Notify.info('Sign-in popup was closed.');
        } else {
          window.NDOG.Notify.error('Login failed: ' + (error.message || 'Unknown error'));
        }
        return null;
      }
    },

    /**
     * Sign out and reload.
     */
    logout: async function () {
      try {
        if (window.NDOG.Particles) window.NDOG.Particles.destroy();

        await window.NDOG.auth.signOut();

        var fpToken = localStorage.getItem('ndog_fp_token');
        localStorage.clear();
        if (fpToken) localStorage.setItem('ndog_fp_token', fpToken);
        sessionStorage.clear();

        window.NDOG.userProfile = null;
        window.location.reload();
      } catch (error) {
        console.error('[NDOG.Auth] logout error:', error);
        window.NDOG.Notify.error('Logout failed. Please try again.');
      }
    },

    /* ---------------------------------------------------------------- */
    /*  Post-login handler                                                 */
    /* ---------------------------------------------------------------- */

    /**
     * Full post-login flow:
     *   1. Show preloader
     *   2. Check if banned
     *   3. Check device fingerprint
     *   4. Load or create profile
     *   5. Process referral code
     *   6. Update lastLogin, recalc rank
     *   7. Set window.NDOG.userProfile
     *   8. Show app shell, hide preloader
     *   9. Initialize sub-modules
     *  10. Check admin role
     *
     * @param {object} user – Firebase User
     */
    handleLogin: async function (user) {
      var uid = user.uid;

      this.showPreloader(true);

      try {
        var isBanned = await this.checkBan(uid);
        if (isBanned) return;

        if (window.NDOG.Security) {
          var fingerprint = window.NDOG.Security.generateFingerprint();
          var duplicate = await window.NDOG.DB.checkFingerprint(fingerprint, uid);
          if (duplicate) {
            await window.NDOG.DB.flagAccount(uid, 'Multi-account suspected', {
              fingerprint: fingerprint,
              existingUid: duplicate.uid,
              existingTimestamp: duplicate.timestamp,
            });
            await window.NDOG.Security.logFraudEvent(uid, 'multi_account', {
              fingerprint: fingerprint,
              existingUid: duplicate.uid,
            });
          }
          await window.NDOG.DB.storeFingerprint(fingerprint, uid);
        }

        var profileSnap = await window.NDOG.db.ref('users/' + uid).once('value');
        var profile = profileSnap.val();
        var isNewUser = !profile;

        if (isNewUser) {
          var refCode = window.NDOG.DB.generateReferralCode();
          var country = guessCountry();

          profile = {
            displayName: user.displayName || '',
            email: user.email || '',
            photoURL: user.photoURL || '',
            balance: 0,
            totalClaimed: 0,
            totalEarned: 0,
            referralCode: refCode,
            referredBy: null,
            referralCount: 0,
            referralEarnings: 0,
            country: country,
            scores: 0,
            rank: 'Bronze',
            claimCount: 0,
            spinCount: 0,
            luckyBoxCount: 0,
            lastClaim: 0,
            lastSpin: 0,
            lastLuckyBox: 0,
            createdAt: window.firebase.database.ServerValue.TIMESTAMP,
            lastLogin: window.firebase.database.ServerValue.TIMESTAMP,
            isBanned: false,
            banReason: '',
            suspiciousScore: 0,
          };

          await window.NDOG.DB.createUserProfile(uid, profile);
          console.log('[NDOG.Auth] New user created:', uid);

          // Process referral for new users
          await this.processReferral(uid, profile);
        } else {
          // Update lastLogin for existing users
          await window.NDOG.db.ref('users/' + uid).update({
            lastLogin: window.firebase.database.ServerValue.TIMESTAMP,
          });
        }

        // Update rank
        var rank = computeRank(profile.totalEarned || 0);
        if (profile.rank !== rank) {
          await window.NDOG.db.ref('users/' + uid).update({ rank: rank });
          profile.rank = rank;
        }

        window.NDOG.userProfile = profile;

        // Show app shell
        this.showAppShell();
        this.showPreloader(false);

        // Initialize sub-modules
        this.initModules(profile);

        // Check admin role
        this.checkAdminRole(uid);

        // Update leaderboard entry
        if (profile) {
          window.NDOG.DB.updateLeaderboard(uid, {
            displayName: profile.displayName || 'Anon',
            balance: profile.balance || 0,
            country: profile.country || 'XX',
            referralCount: profile.referralCount || 0,
            avatar: profile.photoURL || '',
          });
        }
      } catch (err) {
        console.error('[NDOG.Auth] handleLogin error:', err);
        window.NDOG.Notify.error('Something went wrong while loading your data.');
        this.showPreloader(false);
        this.showLoginScreen();
      }
    },

    /* ---------------------------------------------------------------- */
    /*  Ban checks                                                         */
    /* ---------------------------------------------------------------- */

    /**
     * Check if a user is banned.
     * @param {string} uid
     * @returns {Promise<boolean>}
     */
    checkBan: async function (uid) {
      try {
        var snap = await window.NDOG.db.ref('bannedUsers/' + uid).once('value');
        var banData = snap.val();
        if (banData) {
          this.showBannedModal(banData.reason || 'Violation of terms of service.');
          window.NDOG.auth.signOut();
          return true;
        }
        return false;
      } catch (err) {
        console.error('[NDOG.Auth] checkBan error:', err);
        return false;
      }
    },

    /**
     * Display a modal telling the user they are banned.
     * @param {string} reason
     */
    showBannedModal: function (reason) {
      var existing = document.getElementById('bannedModal');
      if (existing) existing.remove();

      var overlay = document.createElement('div');
      overlay.id = 'bannedModal';
      overlay.style.cssText =
        'position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;' +
        'background:rgba(0,0,0,.7);backdrop-filter:blur(4px);';

      overlay.innerHTML =
        '<div style="background:#1a1a2e;color:#fff;padding:40px;border-radius:16px;max-width:420px;width:90%;text-align:center;">' +
        '<div style="font-size:48px;margin-bottom:16px;">🚫</div>' +
        '<h2 style="font-size:22px;font-weight:700;margin:0 0 12px;">Account Suspended</h2>' +
        '<p style="color:#94a3b8;font-size:14px;line-height:1.6;margin:0 0 24px;">' +
        'Your account has been suspended for the following reason:<br><br>' +
        '<strong style="color:#f87171;">' + escapeHtml(reason) + '</strong></p>' +
        '<p style="color:#64748b;font-size:13px;margin:0;">If you believe this is a mistake, please contact support.</p>' +
        '</div>';

      document.body.appendChild(overlay);
      this.showPreloader(false);
    },

    /* ---------------------------------------------------------------- */
    /*  Referral code from URL                                             */
    /* ---------------------------------------------------------------- */

    /**
     * Extract ?ref= from URL, store in sessionStorage, and clean URL.
     */
    checkReferralParam: function () {
      var params = new URLSearchParams(window.location.search);
      var refCode = params.get('ref');
      if (refCode && refCode.trim().length > 0) {
        sessionStorage.setItem('ndog_ref', refCode.trim());
        window.history.replaceState({}, '', window.location.pathname + window.location.hash);
      }
    },

    /**
     * Process the stored referral code for a newly registered user.
     * @param {string} uid      – new user's UID
     * @param {object} profile  – the new user's profile (already saved)
     */
    processReferral: async function (uid, profile) {
      var refCode = sessionStorage.getItem('ndog_ref');
      if (!refCode) return;

      try {
        var snap = await window.NDOG.db
          .ref('users')
          .orderByChild('referralCode')
          .equalTo(refCode)
          .limitToFirst(1)
          .once('value');

        var data = snap.val();
        if (!data) {
          console.warn('[NDOG.Auth] Referral code not found:', refCode);
          sessionStorage.removeItem('ndog_ref');
          return;
        }

        var referrerUid = Object.keys(data)[0];
        if (referrerUid === uid) {
          sessionStorage.removeItem('ndog_ref');
          return;
        }

        await window.NDOG.DB.updateUserProfile(uid, { referredBy: referrerUid });
        await window.NDOG.DB.processReferral(referrerUid, uid, refCode);
        await window.NDOG.DB.updateReferralCounts(referrerUid);

        window.NDOG.Notify.success('Referral code applied! You and your referrer earned rewards.');
      } catch (err) {
        console.error('[NDOG.Auth] processReferral error:', err);
      }

      sessionStorage.removeItem('ndog_ref');
    },

    /* ────────────────────────────────────────────────────
       UI State Management
    ──────────────────────────────────────────────────── */

    showLoginScreen: function () {
      var loginScreen = document.getElementById('loginScreen');
      var appShell = document.getElementById('appShell');
      if (loginScreen) {
        loginScreen.classList.remove('hidden');
        loginScreen.style.opacity = '1';
        loginScreen.style.visibility = 'visible';
      }
      if (appShell) {
        appShell.classList.add('hidden');
      }
    },

    showAppShell: function () {
      var appShell = document.getElementById('appShell');
      var loginScreen = document.getElementById('loginScreen');
      if (appShell) {
        appShell.classList.remove('hidden');
      }
      if (loginScreen) {
        loginScreen.classList.add('hidden');
        loginScreen.style.opacity = '0';
        loginScreen.style.visibility = 'hidden';
      }
    },

    showPreloader: function (show) {
      var preloader = document.getElementById('preloader');
      if (preloader) {
        if (show) {
          preloader.style.opacity = '1';
          preloader.style.visibility = 'visible';
          preloader.classList.remove('done');
        } else {
          preloader.classList.add('done');
          setTimeout(function () {
            if (preloader.parentNode) {
              preloader.remove();
            }
          }, 600);
        }
      }
    },

    initModules: function (profile) {
      if (window.NDOG.UI && typeof window.NDOG.UI.init === 'function') {
        try {
          window.NDOG.UI.init();
        } catch (err) {
          console.error('[NDOG.Auth] Error initializing UI:', err);
        }
      }

      if (window.NDOG.Claim && typeof window.NDOG.Claim.init === 'function') {
        try {
          window.NDOG.Claim.init();
        } catch (err) {
          console.error('[NDOG.Auth] Error initializing Claim:', err);
        }
      }

      if (window.NDOG.Referrals && typeof window.NDOG.Referrals.init === 'function') {
        try {
          window.NDOG.Referrals.init();
        } catch (err) {
          console.error('[NDOG.Auth] Error initializing Referrals:', err);
        }
      }

      if (window.NDOG.Missions && typeof window.NDOG.Missions.init === 'function') {
        try {
          window.NDOG.Missions.init();
        } catch (err) {
          console.error('[NDOG.Auth] Error initializing Missions:', err);
        }
      }

      if (window.NDOG.Leaderboard && typeof window.NDOG.Leaderboard.init === 'function') {
        try {
          window.NDOG.Leaderboard.init();
        } catch (err) {
          console.error('[NDOG.Auth] Error initializing Leaderboard:', err);
        }
      }

      if (window.NDOG.Staking && typeof window.NDOG.Staking.init === 'function') {
        try {
          window.NDOG.Staking.init();
        } catch (err) {
          console.error('[NDOG.Auth] Error initializing Staking:', err);
        }
      }

      if (window.NDOG.Airdrop && typeof window.NDOG.Airdrop.init === 'function') {
        try {
          window.NDOG.Airdrop.init();
        } catch (err) {
          console.error('[NDOG.Auth] Error initializing Airdrop:', err);
        }
      }
    },

    checkAdminRole: async function (uid) {
      try {
        var snap = await window.NDOG.db.ref('admins/' + uid).once('value');
        if (snap.val()) {
          if (window.NDOG.Admin && typeof window.NDOG.Admin.init === 'function') {
            window.NDOG.Admin.init();
          }
        }
      } catch (err) {
        console.error('[NDOG.Auth] checkAdminRole error:', err);
      }
    },

    /**
     * Refresh user session and profile data
     */
    refreshSession: async function () {
      if (!window.NDOG.currentUser) return;
      
      try {
        var uid = window.NDOG.currentUser.uid;
        var snap = await window.NDOG.db.ref('users/' + uid).once('value');
        var profile = snap.val();
        if (profile) {
          window.NDOG.userProfile = profile;
          if (window.NDOG.UI && typeof window.NDOG.UI.updateDashboard === 'function') {
            window.NDOG.UI.updateDashboard();
          }
        }
      } catch (err) {
        console.error('[NDOG.Auth] refreshSession error:', err);
      }
    }
  };
})();
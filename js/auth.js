/**
 * NileDogs (NDOG) — Authentication Module
 * --------------------------------------------
 * Handles the full login / logout lifecycle:
 *   1. Listens for Firebase auth state changes.
 *   2. On sign-in: checks ban, fingerprint, creates profile if new,
 *      processes referral codes, loads data, then shows the app shell.
 *   3. On sign-out: clears local state and shows the login screen.
 *   4. Checks URL for ?ref= referral code and stores in sessionStorage.
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
      // timezones look like "Europe/London" or "America/New_York"
      var parts = tz.split('/');
      if (parts.length >= 2) {
        // Map common cities / regions
        var cityMap = {
          'America/New_York': 'US',
          'America/Chicago': 'US',
          'America/Denver': 'US',
          'America/Los_Angeles': 'US',
          'America/Anchorage': 'US',
          'America/Sao_Paulo': 'BR',
          'America/Argentina/Buenos_Aires': 'AR',
          'America/Mexico_City': 'MX',
          'America/Bogota': 'CO',
          'America/Lima': 'PE',
          'America/Santiago': 'CL',
          'America/Toronto': 'CA',
          'America/Vancouver': 'CA',
          'America/Montevideo': 'UY',
          'America/Caracas': 'VE',
          'America/Havana': 'CU',
          'America/Guatemala': 'GT',
          'America/El_Salvador': 'SV',
          'America/Tegucigalpa': 'HN',
          'America/Managua': 'NI',
          'America/San_Jose': 'CR',
          'America/Panama': 'PA',
          'America/Detroit': 'US',
          'America/Indianapolis': 'US',
          'Europe/London': 'GB',
          'Europe/Paris': 'FR',
          'Europe/Berlin': 'DE',
          'Europe/Madrid': 'ES',
          'Europe/Rome': 'IT',
          'Europe/Amsterdam': 'NL',
          'Europe/Brussels': 'BE',
          'Europe/Vienna': 'AT',
          'Europe/Zurich': 'CH',
          'Europe/Stockholm': 'SE',
          'Europe/Oslo': 'NO',
          'Europe/Copenhagen': 'DK',
          'Europe/Helsinki': 'FI',
          'Europe/Warsaw': 'PL',
          'Europe/Prague': 'CZ',
          'Europe/Budapest': 'HU',
          'Europe/Bucharest': 'RO',
          'Europe/Athens': 'GR',
          'Europe/Lisbon': 'PT',
          'Europe/Dublin': 'IE',
          'Europe/Istanbul': 'TR',
          'Europe/Moscow': 'RU',
          'Europe/Kiev': 'UA',
          'Europe/Minsk': 'BY',
          'Europe/Sofia': 'BG',
          'Europe/Zagreb': 'HR',
          'Europe/Belgrade': 'RS',
          'Europe/Tallinn': 'EE',
          'Europe/Riga': 'LV',
          'Europe/Vilnius': 'LT',
          'Europe/Tirane': 'AL',
          'Europe/Skopje': 'MK',
          'Europe/Podgorica': 'ME',
          'Europe/Sarajevo': 'BA',
          'Europe/Ljubljana': 'SI',
          'Europe/Bratislava': 'SK',
          'Europe/Kaliningrad': 'RU',
          'Europe/Volgograd': 'RU',
          'Europe/Samara': 'RU',
          'Asia/Dubai': 'AE',
          'Asia/Riyadh': 'SA',
          'Asia/Qatar': 'QA',
          'Asia/Kuwait': 'KW',
          'Asia/Bahrain': 'BH',
          'Asia/Muscat': 'OM',
          'Asia/Baghdad': 'IQ',
          'Asia/Tehran': 'IR',
          'Asia/Karachi': 'PK',
          'Asia/Kolkata': 'IN',
          'Asia/Colombo': 'LK',
          'Asia/Dhaka': 'BD',
          'Asia/Kathmandu': 'NP',
          'Asia/Almaty': 'KZ',
          'Asia/Tashkent': 'UZ',
          'Asia/Bangkok': 'TH',
          'Asia/Ho_Chi_Minh': 'VN',
          'Asia/Phnom_Penh': 'KH',
          'Asia/Vientiane': 'LA',
          'Asia/Yangon': 'MM',
          'Asia/Jakarta': 'ID',
          'Asia/Kuala_Lumpur': 'MY',
          'Asia/Singapore': 'SG',
          'Asia/Manila': 'PH',
          'Asia/Shanghai': 'CN',
          'Asia/Hong_Kong': 'HK',
          'Asia/Taipei': 'TW',
          'Asia/Seoul': 'KR',
          'Asia/Tokyo': 'JP',
          'Asia/Macau': 'MO',
          'Asia/Ulaanbaatar': 'MN',
          'Africa/Cairo': 'EG',
          'Africa/Lagos': 'NG',
          'Africa/Johannesburg': 'ZA',
          'Africa/Nairobi': 'KE',
          'Africa/Casablanca': 'MA',
          'Africa/Tunis': 'TN',
          'Africa/Algiers': 'DZ',
          'Africa/Khartoum': 'SD',
          'Africa/Addis_Ababa': 'ET',
          'Africa/Dar_es_Salaam': 'TZ',
          'Africa/Accra': 'GH',
          'Africa/Abidjan': 'CI',
          'Africa/Dakar': 'SN',
          'Australia/Sydney': 'AU',
          'Australia/Melbourne': 'AU',
          'Australia/Brisbane': 'AU',
          'Australia/Perth': 'AU',
          'Australia/Adelaide': 'AU',
          'Pacific/Auckland': 'NZ',
          'Pacific/Fiji': 'FJ',
          'Pacific/Honolulu': 'US',
          'Pacific/Guam': 'GU',
        };
        var mapped = cityMap[tz];
        if (mapped) return mapped;

        // Fallback: use the region part (e.g. "Africa" → not useful, skip)
        // If the city part matches a known country subdivision, we still return XX
        return 'XX';
      }
    } catch (e) {
      // ignore
    }
    return 'XX';
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
        // Request basic profile + email
        provider.addScope('profile');
        provider.addScope('email');
        var result = await window.NDOG.auth.signInWithPopup(provider);
        return result.user;
      } catch (error) {
        // Handle common errors gracefully
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
        // Stop any running listeners / animations
        if (window.NDOG.Particles) window.NDOG.Particles.destroy();

        await window.NDOG.auth.signOut();

        // Clear local session data (but keep fingerprint token)
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

      // 1. Show preloader
      this.showPreloader(true);

      try {
        // 2. Check ban status
        var isBanned = await this.checkBan(uid);
        if (isBanned) return; // showBannedModal already called

        // 3. Device fingerprint check
        if (window.NDOG.Security) {
          var fingerprint = window.NDOG.Security.generateFingerprint();
          var duplicate = await window.NDOG.DB.checkFingerprint(fingerprint, uid);
          if (duplicate) {
            // Flag the account but still let them in (admin will review)
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
          // Store current fingerprint
          await window.NDOG.DB.storeFingerprint(fingerprint, uid);
        }

        // 4. Load or create user profile
        var profileSnap = await window.NDOG.db.ref('users/' + uid).once('value');
        var profile = profileSnap.val();
        var isNewUser = !profile;

        if (isNewUser) {
          // Create profile
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
            createdAt: window.firebase.database.ServerValue.TIMESTAMP,
            lastLogin: window.firebase.database.ServerValue.TIMESTAMP,
            isBanned: false,
            banReason: '',
          };

          await window.NDOG.DB.createUserProfile(uid, profile);
          // Re-read to get server timestamps
          var freshSnap = await window.NDOG.db.ref('users/' + uid).once('value');
          profile = freshSnap.val();

          // Log registration analytics
          try {
            window.NDOG.db.ref('analytics/totalUsers').transaction(function (c) {
              return (c || 0) + 1;
            });
          } catch (e) {
            // ignore
          }

          window.NDOG.Notify.success('Welcome to NileDogs! 🐕');
        } else {
          // Update lastLogin
          await window.NDOG.DB.updateUserProfile(uid, {
            lastLogin: window.firebase.database.ServerValue.TIMESTAMP,
            photoURL: user.photoURL || profile.photoURL || '',
            displayName: user.displayName || profile.displayName || '',
          });
        }

        // 5. Process referral code from URL (only for new users)
        if (isNewUser) {
          await this.processReferral(uid, profile);
        }

        // 6. Recompute rank from totalEarned
        if (profile) {
          var rank = computeRank(profile.totalEarned || 0);
          if (rank !== profile.rank) {
            await window.NDOG.DB.updateUserProfile(uid, { rank: rank });
            profile.rank = rank;
          }
        }

        // 7. Set global state
        window.NDOG.userProfile = profile;

        // 8. Show app shell
        this.showAppShell();
        this.showPreloader(false);

        // 9. Initialize sub-modules
        this.initModules(profile);

        // 10. Check admin role
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
          // Also sign out
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
      // Ensure modal container exists or create one
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
        // Clean the URL
        window.history.replaceState({}, '', window.location.pathname + window.location.hash);
      }
    },

    /**
     * Process the stored referral code for a newly registered user.
     * Finds the referrer by referralCode, then triggers 3-level rewards.
     *
     * @param {string} uid      – new user's UID
     * @param {object} profile  – the new user's profile (already saved)
     */
    processReferral: async function (uid, profile) {
      var refCode = sessionStorage.getItem('ndog_ref');
      if (!refCode) return;

      try {
        // Find the user whose referralCode matches
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

        // Get the referrer's UID
        var referrerUid = Object.keys(data)[0];
        if (referrerUid === uid) {
          // Can't refer yourself
          sessionStorage.removeItem('ndog_ref');
          return;
        }

        // Update the new user's profile with referredBy
        await window.NDOG.DB.updateUserProfile(uid, { referredBy: referrerUid });

        // Process 3-level referral rewards
        await window.NDOG.DB.processReferral(referrerUid, uid, refCode);

        // Update referral counts
        await window.NDOG.DB.updateReferralCounts(referrerUid);

        window.NDOG.Notify.success('Referral code applied! You and your referrer earned rewards.');
      } catch (err) {
        console.error('[NDOG.Auth] processReferral error:', err);
      }

      sessionStorage.removeItem('ndog_ref');
    },

    /* ---------------------------------------------------------------- */
    /*  UI toggles                                                         */
    /* ---------------------------------------------------------------- */

    /**
     * Show / hide the preloader overlay.
     * @param {boolean} show
     */
    showPreloader: function (show) {
      var el = document.getElementById('preloader');
      if (!el) return;
      if (show) {
        el.classList.remove('done');
        el.style.display = '';
      } else {
        el.classList.add('done');
        // Fade out after animation
        setTimeout(function () {
          el.style.display = 'none';
        }, 500);
      }
    },

    /**
     * Show the login screen, hide the app shell.
     */
    showLoginScreen: function () {
      var loginEl = document.getElementById('loginScreen');
      var appEl = document.getElementById('appShell');
      var preloader = document.getElementById('preloader');

      if (loginEl) {
        loginEl.classList.remove('hidden');
        loginEl.style.display = '';
      }
      if (appEl) {
        appEl.classList.add('hidden');
      }
      if (preloader) {
        preloader.classList.add('done');
        setTimeout(function () {
          if (preloader.parentNode) preloader.style.display = 'none';
        }, 600);
      }

      // Start particles on the login screen
      if (window.NDOG.Particles) window.NDOG.Particles.init();
    },

    /**
     * Show the app shell, hide the login screen.
     */
    showAppShell: function () {
      var loginEl = document.getElementById('loginScreen');
      var appEl = document.getElementById('appShell');
      var preloader = document.getElementById('preloader');

      if (loginEl) loginEl.classList.add('hidden');
      if (appEl) {
        appEl.classList.remove('hidden');
        appEl.style.display = '';
      }
      if (preloader) {
        preloader.classList.add('done');
        setTimeout(function () {
          if (preloader.parentNode) preloader.style.display = 'none';
        }, 600);
      }
    },

    /* ---------------------------------------------------------------- */
    /*  Sub-module initialization                                          */
    /* ---------------------------------------------------------------- */

    /**
     * Initialize all app modules after successful login.
     * Each module's init() is called only if it exists.
     * @param {object} profile
     */
    initModules: function (profile) {
      // Particles (keep running or restart)
      if (window.NDOG.Particles) window.NDOG.Particles.init();

      // Referrals
      if (window.NDOG.Referrals) window.NDOG.Referrals.init(profile);

      // Any other modules can be initialized here in the future
      if (window.NDOG.UI) window.NDOG.UI.init(profile);       if (window.NDOG.UI) window.NDOG.UI.updateDashboard(profile);       if (window.NDOG.Claim) window.NDOG.Claim.init(profile);       if (window.NDOG.Missions) window.NDOG.Missions.init(profile);       if (window.NDOG.Leaderboard) window.NDOG.Leaderboard.init(profile);       if (window.NDOG.Staking) window.NDOG.Staking.init(profile);       if (window.NDOG.Airdrop) window.NDOG.Airdrop.init(profile);       // e.g., window.NDOG.Claim.init(profile);
      // e.g., window.NDOG.Missions.init(profile);
      // e.g., window.NDOG.Airdrop.init(profile);
    },

    /* ---------------------------------------------------------------- */
    /*  Admin check                                                        */
    /* ---------------------------------------------------------------- */

    /**
     * Check if the current user is an admin and show admin UI elements.
     * @param {string} uid
     */
    checkAdminRole: function (uid) {
      window.NDOG.DB.getAdminRole(uid, function (snap) {
        var role = snap.val();
        if (role) {
          window.NDOG.isAdmin = true;
          window.NDOG.adminRole = role.role || role;

          // Show admin link/button if it exists in the DOM
          var adminLinks = document.querySelectorAll('[data-admin-only]');
          for (var i = 0; i < adminLinks.length; i++) {
            adminLinks[i].style.display = '';
          }

          console.log('[NDOG.Auth] Admin role detected:', window.NDOG.adminRole);
        }
      });
    },
  };

  /* ------------------------------------------------------------------ */
  /*  Internal                                                            */
  /* ------------------------------------------------------------------ */

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str || ''));
    return div.innerHTML;
  }
})();

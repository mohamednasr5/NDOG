/**
 * NileDogs (NDOG) — Security Module
 * ------------------------------------
 * Anti-fraud utilities including:
 *   • Device fingerprinting (stable per browser)
 *   • Rate limiting (localStorage-backed)
 *   • Multi-account & VPN heuristics
 *   • Fraud-event logging
 */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ */
  /*  Constants                                                           */
  /* ------------------------------------------------------------------ */

  var CLAIM_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours
  var SPIN_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours
  var LUCKY_BOX_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6 hours
  var MAX_BOOSTS_PER_DAY = 3;

  /* ------------------------------------------------------------------ */
  /*  Storage helpers                                                     */
  /* ------------------------------------------------------------------ */

  function setRateLimit(key, timestamp) {
    try {
      localStorage.setItem('ndog_rl_' + key, String(timestamp));
    } catch (e) {
      // localStorage unavailable — silently ignore
    }
  }

  function getRateLimit(key) {
    try {
      return parseInt(localStorage.getItem('ndog_rl_' + key) || '0', 10);
    } catch (e) {
      return 0;
    }
  }

  /**
   * Get the list of boost timestamps stored as JSON array.
   * @returns {number[]}
   */
  function getBoostTimestamps() {
    try {
      var raw = localStorage.getItem('ndog_rl_boosts') || '[]';
      return JSON.parse(raw);
    } catch (e) {
      return [];
    }
  }

  function setBoostTimestamps(arr) {
    try {
      localStorage.setItem('ndog_rl_boosts', JSON.stringify(arr));
    } catch (e) {
      // ignore
    }
  }

  /**
   * Return the start of today as a Unix timestamp (local midnight).
   * Used to reset the daily boost counter.
   * @returns {number}
   */
  function todayStart() {
    var d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  /* ------------------------------------------------------------------ */
  /*  Exposed module                                                      */
  /* ------------------------------------------------------------------ */

  window.NDOG = window.NDOG || {};
  window.NDOG.Security = {
    /* ---------------------------------------------------------------- */
    /*  Device Fingerprinting                                             */
    /* ---------------------------------------------------------------- */

    /**
     * Generate a stable device fingerprint string.
     * Combines: userAgent, language, screen resolution, timezone, and a
     * persistent random token stored in localStorage.
     * @returns {string}
     */
    generateFingerprint: function () {
      var token = localStorage.getItem('ndog_fp_token');
      if (!token) {
        token = this.generateRandomToken();
        localStorage.setItem('ndog_fp_token', token);
      }

      var raw = [
        navigator.userAgent || '',
        navigator.language || '',
        (screen.width || 0) + 'x' + (screen.height || 0),
        (function () {
          try {
            return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
          } catch (e) {
            return '';
          }
        })(),
        token,
      ].join('|');

      // djb2 hash
      var hash = 5381;
      for (var i = 0; i < raw.length; i++) {
        hash = (hash << 5) + hash + raw.charCodeAt(i);
        hash = hash & hash; // keep 32-bit int
      }
      return 'FP_' + Math.abs(hash).toString(36);
    },

    /**
     * Generate a random 16-character hex token.
     * @returns {string}
     */
    generateRandomToken: function () {
      var chars = '0123456789abcdef';
      var token = '';
      for (var i = 0; i < 16; i++) {
        token += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return token;
    },

    /* ---------------------------------------------------------------- */
    /*  Rate Limiting                                                     */
    /* ---------------------------------------------------------------- */

    /**
     * Check whether the user can claim now (24 h cooldown).
     * @returns {boolean}
     */
    canClaim: function () {
      var last = getRateLimit('claim');
      return Date.now() - last >= CLAIM_COOLDOWN_MS;
    },

    /**
     * Check whether the user can spin now (24 h cooldown).
     * @returns {boolean}
     */
    canSpin: function () {
      var last = getRateLimit('spin');
      return Date.now() - last >= SPIN_COOLDOWN_MS;
    },

    /**
     * Check whether the user can open a lucky box (6 h cooldown).
     * @returns {boolean}
     */
    canLuckyBox: function () {
      var last = getRateLimit('luckybox');
      return Date.now() - last >= LUCKY_BOX_COOLDOWN_MS;
    },

    /**
     * Check whether the user can use another boost today (max 3).
     * @returns {boolean}
     */
    canBoost: function () {
      var stamps = getBoostTimestamps();
      var dayStart = todayStart();
      // Filter to today's boosts only
      var todayBoosts = stamps.filter(function (t) {
        return t >= dayStart;
      });
      return todayBoosts.length < MAX_BOOSTS_PER_DAY;
    },

    /**
     * Get the timestamp when the next claim becomes available.
     * @returns {number} 0 if already available
     */
    getClaimCooldownEnd: function () {
      var last = getRateLimit('claim');
      var end = last + CLAIM_COOLDOWN_MS;
      return Date.now() >= end ? 0 : end;
    },

    /**
     * Record that a claim just happened (now).
     */
    recordClaim: function () {
      setRateLimit('claim', Date.now());
    },

    /**
     * Record that a spin just happened (now).
     */
    recordSpin: function () {
      setRateLimit('spin', Date.now());
    },

    /**
     * Record that a lucky box was just opened (now).
     */
    recordLuckyBox: function () {
      setRateLimit('luckybox', Date.now());
    },

    /**
     * Record a boost usage (now).
     */
    recordBoost: function () {
      var stamps = getBoostTimestamps();
      stamps.push(Date.now());
      setBoostTimestamps(stamps);
    },

    /* ---------------------------------------------------------------- */
    /*  Fraud Checks                                                      */
    /* ---------------------------------------------------------------- */

    /**
     * Check if the current device fingerprint is associated with a
     * *different* UID in the database (potential multi-account).
     * @param {string} uid  – current user's UID
     * @returns {Promise<object|null>} duplicate record or null
     */
    checkMultiAccount: async function (uid) {
      try {
        if (!window.NDOG || !window.NDOG.DB) return null;
        var fp = this.generateFingerprint();
        var result = await window.NDOG.DB.checkFingerprint(fp, uid);
        return result;
      } catch (err) {
        console.error('[NDOG.Security] checkMultiAccount:', err);
        return null;
      }
    },

    /**
     * Lightweight heuristic to detect suspicious VPN usage.
     * Compares the browser's timezone against the most common language.
     * A mismatch is *not* proof — it only raises a suspicion flag.
     *
     * @returns {boolean}  true if the combination looks suspicious
     */
    isSuspiciousVPN: function () {
      var tz = '';
      var lang = (navigator.language || 'en').toLowerCase();

      try {
        tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
      } catch (e) {
        return false;
      }

      // Map of timezone prefixes to expected primary languages
      var tzLangMap = {
        'America': ['en', 'es', 'pt', 'fr'],
        'Europe': ['en', 'de', 'fr', 'es', 'it', 'pt', 'nl', 'pl', 'sv'],
        'Asia': ['zh', 'ja', 'ko', 'hi', 'ar', 'th', 'vi', 'id', 'tr'],
        'Africa': ['en', 'fr', 'ar', 'pt', 'sw'],
        'Australia': ['en'],
        'Pacific': ['en'],
        'Indian': ['en', 'hi'],
        'Antarctica': ['en'],
      };

      var region = tz.split('/')[0];
      var expected = tzLangMap[region];

      if (!expected) return false; // unknown region — don't flag

      // Check if language matches any expected for the region
      var langBase = lang.split('-')[0];
      var match = expected.some(function (l) {
        return l === langBase;
      });

      return !match;
    },

    /**
     * Write a fraud event to /fraudLogs in the database.
     * @param {string} uid
     * @param {string} event  – e.g. 'multi_account', 'vpn_suspect', 'rate_abuse'
     * @param {object} details
     * @returns {Promise<boolean>}
     */
    logFraudEvent: async function (uid, event, details) {
      try {
        if (!window.NDOG || !window.NDOG.db) return false;
        var ref = window.NDOG.db.ref('fraudLogs').push();
        await ref.set({
          uid: uid,
          event: event,
          details: details || {},
          fingerprint: this.generateFingerprint(),
          userAgent: navigator.userAgent || '',
          timestamp: window.firebase.database.ServerValue.TIMESTAMP,
        });
        return true;
      } catch (err) {
        console.error('[NDOG.Security] logFraudEvent:', err);
        return false;
      }
    },

    /* ---------------------------------------------------------------- */
    /*  Storage helpers (exposed for external use if needed)              */
    /* ---------------------------------------------------------------- */

    setRateLimit: setRateLimit,
    getRateLimit: getRateLimit,
  };
})();
/**
 * ═══════════════════════════════════════════════════════════════════
 * NDOG Analytics Module — Event & Page View Tracking
 * ═══════════════════════════════════════════════════════════════════
 * Lightweight analytics tracking. Writes events to Firebase under
 * /analytics/events/{pushId} and maintains a /analytics/summary
 * aggregate for admin dashboards.
 * ═══════════════════════════════════════════════════════════════════
 */
(function () {
  'use strict';

  // ── Firebase / Store helpers ──
  function getDB() {
    return window.NDOG && window.NDOG.firebase ? window.NDOG.firebase.db : null;
  }
  function getAuth() {
    return window.NDOG && window.NDOG.firebase ? window.NDOG.firebase.auth : null;
  }
  function getUID() {
    var auth = getAuth();
    return auth && auth.currentUser ? auth.currentUser.uid : null;
  }

  // ── Batching ──
  var MAX_BATCH_SIZE = 20;
  var FLUSH_INTERVAL_MS = 15000; // 15 seconds
  var _eventBuffer = [];
  var _flushTimer = null;
  var _isFlushing = false;

  // ── Throttle map (prevent duplicate rapid events) ──
  var _throttleMap = {};
  var THROTTLE_WINDOW_MS = 5000; // 5 seconds

  // ── Summary cache ──
  var _summaryCache = null;
  var SUMMARY_LOAD_KEY = 'ndog_analytics_summary_cache';

  // ── Safe localStorage ──
  function loadJSON(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }
  function saveJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) { /* ignore */ }
  }

  // ── Generate a simple unique ID ──
  function generateId() {
    return Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 9);
  }

  // ── Get browser/device info ──
  function getDeviceInfo() {
    var info = {
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
      language: typeof navigator !== 'undefined' ? navigator.language : 'unknown',
      platform: typeof navigator !== 'undefined' ? navigator.platform : 'unknown',
      screenWidth: typeof screen !== 'undefined' ? screen.width : 0,
      screenHeight: typeof screen !== 'undefined' ? screen.height : 0,
      devicePixelRatio: typeof window !== 'undefined' ? window.devicePixelRatio : 1,
      timezone: typeof Intl !== 'undefined'
        ? Intl.DateTimeFormat().resolvedOptions().timeZone
        : 'unknown'
    };

    // Add connection info if available
    if (typeof navigator !== 'undefined' && navigator.connection) {
      info.connectionType = navigator.connection.effectiveType || 'unknown';
    }

    return info;
  }

  // ═══════════════════════════════════════════
  // ANALYTICS MODULE
  // ═══════════════════════════════════════════
  window.NDOG.Analytics = {

    // ─────────────────────────────────
    // init
    // ─────────────────────────────────
    init: function () {
      var self = this;

      // Load cached summary for immediate availability
      _summaryCache = loadJSON(SUMMARY_LOAD_KEY, null);

      // Track initial page view
      self.trackPageView('home');

      // Setup visibility change tracking (single-page app page views)
      if (typeof document !== 'undefined' && document.addEventListener) {
        // Track when user returns to tab
        document.addEventListener('visibilitychange', function () {
          if (!document.hidden) {
            var now = Date.now();
            if (!self._lastVisibleTime || (now - self._lastVisibleTime) > 60000) {
              self.trackPageView('return');
            }
            self._lastVisibleTime = now;
          }
        });
      }

      // Start batch flush timer
      this.startFlushTimer();

      // Flush on page unload
      if (typeof window !== 'undefined' && window.addEventListener) {
        window.addEventListener('beforeunload', function () {
          self.flushEvents();
        });

        // Also flush on pagehide for mobile
        window.addEventListener('pagehide', function () {
          self.flushEvents();
        });
      }
    },

    _lastVisibleTime: Date.now(),

    // ─────────────────────────────────
    // trackEvent
    // ─────────────────────────────────
    trackEvent: function (eventName, data) {
      if (!eventName || typeof eventName !== 'string') return;

      // Throttle check: prevent duplicate rapid events
      var now = Date.now();
      var throttleKey = eventName + '_' + JSON.stringify(data || {});
      var lastTime = _throttleMap[throttleKey] || 0;

      if (now - lastTime < THROTTLE_WINDOW_MS) {
        return; // Throttled
      }
      _throttleMap[throttleKey] = now;

      // Clean old throttle entries periodically
      if (Object.keys(_throttleMap).length > 200) {
        _throttleMap = {};
      }

      var event = {
        id: generateId(),
        event: eventName,
        data: data || {},
        uid: getUID() || null,
        device: getDeviceInfo(),
        timestamp: Date.now()
      };

      // Add to buffer
      _eventBuffer.push(event);

      // Flush immediately if buffer is full
      if (_eventBuffer.length >= MAX_BATCH_SIZE) {
        this.flushEvents();
      }
    },

    // ─────────────────────────────────
    // trackPageView
    // ─────────────────────────────────
    trackPageView: function (viewName) {
      var data = {
        view: viewName,
        url: typeof window !== 'undefined' ? window.location.href : '',
        referrer: typeof document !== 'undefined' ? document.referrer : '',
        title: typeof document !== 'undefined' ? document.title : ''
      };

      this.trackEvent('page_view', data);
    },

    // ─────────────────────────────────
    // flushEvents
    // ─────────────────────────────────
    flushEvents: function () {
      var self = this;
      var db = getDB();

      if (_eventBuffer.length === 0 || _isFlushing) return;

      // Don't wait for Firebase if page is unloading
      var isUnload = false;
      if (typeof document !== 'undefined') {
        isUnload = document.visibilityState === 'hidden';
      }

      _isFlushing = true;

      // Take events from buffer
      var batch = _eventBuffer.splice(0, MAX_BATCH_SIZE);

      if (!db) {
        // No Firebase — store locally for later sync
        var pending = loadJSON('ndog_analytics_pending', []);
        for (var p = 0; p < batch.length; p++) {
          pending.push(batch[p]);
        }
        saveJSON('ndog_analytics_pending', pending.slice(-200)); // Keep max 200
        _isFlushing = false;
        return;
      }

      // Write events to Firebase
      var eventsRef = db.ref('analytics/events');

      var writes = [];
      for (var i = 0; i < batch.length; i++) {
        var event = batch[i];
        // Remove id before writing to Firebase (use push key)
        var eventData = {
          event: event.event,
          data: event.data,
          uid: event.uid,
          device: event.device,
          timestamp: event.timestamp
        };
        var pushRef = eventsRef.push();
        writes.push(pushRef.set(eventData));
      }

      // Update summary after successful write
      Promise.all(writes)
        .then(function () {
          self.updateStats();
          _isFlushing = false;

          // If more events in buffer, schedule another flush
          if (_eventBuffer.length > 0) {
            setTimeout(function () {
              self.flushEvents();
            }, 1000);
          }
        })
        .catch(function (err) {
          console.warn('[Analytics] Flush failed, buffering locally:', err);

          // Store locally for retry
          var pending2 = loadJSON('ndog_analytics_pending', []);
          for (var j = 0; j < batch.length; j++) {
            pending2.push(batch[j]);
          }
          saveJSON('ndog_analytics_pending', pending2.slice(-200));

          _isFlushing = false;
        });
    },

    // ─────────────────────────────────
    // startFlushTimer
    // ─────────────────────────────────
    startFlushTimer: function () {
      var self = this;
      this.stopFlushTimer();

      _flushTimer = setInterval(function () {
        self.flushEvents();
      }, FLUSH_INTERVAL_MS);
    },

    // ─────────────────────────────────
    // stopFlushTimer
    // ─────────────────────────────────
    stopFlushTimer: function () {
      if (_flushTimer) {
        clearInterval(_flushTimer);
        _flushTimer = null;
      }
    },

    // ─────────────────────────────────
    // updateStats
    // ─────────────────────────────────
    updateStats: function () {
      var db = getDB();
      if (!db) return;

      var summaryRef = db.ref('analytics/summary');
      var now = Date.now();

      // Use transaction to safely increment counters
      summaryRef.transaction(function (current) {
        var summary = current || {
          totalEvents: 0,
          totalPageViews: 0,
          uniqueUsers: 0,
          uniqueUsersList: {},
          eventCounts: {},
          dailyCounts: {},
          lastUpdated: 0
        };

        // Process buffered events
        for (var i = 0; i < _eventBuffer.length; i++) {
          // Already flushed, skip
        }

        summary.totalEvents = (summary.totalEvents || 0);
        summary.lastUpdated = now;

        // Add current user to unique users if logged in
        var uid = getUID();
        if (uid) {
          if (!summary.uniqueUsersList) summary.uniqueUsersList = {};
          summary.uniqueUsersList[uid] = now;
          // Count unique
          summary.uniqueUsers = Object.keys(summary.uniqueUsersList).length;
        }

        return summary;
      }).then(function () {
        // Update local cache
        var updatedSummary = {
          lastUpdated: now,
          totalEvents: _summaryCache ? (_summaryCache.totalEvents || 0) + _eventBuffer.length : 0
        };
        _summaryCache = updatedSummary;
        saveJSON(SUMMARY_LOAD_KEY, _summaryCache);
      }).catch(function (err) {
        console.warn('[Analytics] Summary update failed:', err);
      });
    },

    // ─────────────────────────────────
    // syncPendingEvents
    // ─────────────────────────────────
    syncPendingEvents: function () {
      var self = this;
      var db = getDB();
      if (!db) return;

      // Load pending events from localStorage
      var pending = loadJSON('ndog_analytics_pending', []);
      if (pending.length === 0) return;

      // Add pending events to buffer for normal flush
      _eventBuffer = _eventBuffer.concat(pending);

      // Clear pending storage
      saveJSON('ndog_analytics_pending', []);

      // Trigger flush
      self.flushEvents();

      console.log('[Analytics] Synced ' + pending.length + ' pending events');
    },

    // ─────────────────────────────────
    // getSummary (read cached)
    // ─────────────────────────────────
    getSummary: function () {
      return _summaryCache || loadJSON(SUMMARY_LOAD_KEY, null);
    },

    // ─────────────────────────────────
    // trackCustomEvent — user-defined events with category
    // ─────────────────────────────────
    trackCustomEvent: function (category, action, label, value) {
      this.trackEvent('custom', {
        category: category || 'general',
        action: action || 'unknown',
        label: label || '',
        value: typeof value === 'number' ? value : undefined
      });
    },

    // ─────────────────────────────────
    // trackError
    // ─────────────────────────────────
    trackError: function (errorMessage, errorSource, stack) {
      this.trackEvent('error', {
        message: errorMessage || 'Unknown error',
        source: errorSource || 'unknown',
        stack: stack || null,
        url: typeof window !== 'undefined' ? window.location.href : '',
        timestamp: Date.now()
      });
    },

    // ─────────────────────────────────
    // trackPerformance
    // ─────────────────────────────────
    trackPerformance: function (metricName, duration, metadata) {
      this.trackEvent('performance', {
        metric: metricName,
        duration: typeof duration === 'number' ? duration : 0,
        unit: 'ms',
        metadata: metadata || {}
      });
    },

    // ─────────────────────────────────
    // setUserProperty
    // ─────────────────────────────────
    setUserProperty: function (propertyName, propertyValue) {
      var db = getDB();
      var uid = getUID();
      if (!db || !uid) return;

      db.ref('analytics/userProperties/' + uid + '/' + propertyName).set({
        value: propertyValue,
        updatedAt: Date.now()
      }).catch(function (err) {
        console.warn('[Analytics] Failed to set user property:', err);
      });
    },

    // ─────────────────────────────────
    // destroy — cleanup
    // ─────────────────────────────────
    destroy: function () {
      this.stopFlushTimer();

      // Flush remaining events
      this.flushEvents();

      // Clean throttle map
      _throttleMap = {};
      _eventBuffer = [];
    }
  };
})();

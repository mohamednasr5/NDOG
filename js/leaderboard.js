/**
 * ═══════════════════════════════════════════════════════════════════
 * NDOG Leaderboard Module — Global, Country, and Referral Rankings
 * ═══════════════════════════════════════════════════════════════════
 * Manages leaderboard tabs, podium rendering, ranked lists,
 * and current-user highlighting.
 * ═══════════════════════════════════════════════════════════════════
 */
(function () {
  'use strict';

  // ── Firebase / Store helpers ──
  function getDB() {
        return window.NDOG ? window.NDOG.db : null;
  }
  function getAuth() {
        return window.NDOG ? window.NDOG.auth : null;
  }
  function getUID() {
    var auth = getAuth();
    return auth && auth.currentUser ? auth.currentUser.uid : null;
  }
  function getStore() {
    return window.NDOG && window.NDOG.Store ? window.NDOG.Store : null;
  }
  function t(key) {
    return window.NDOG && window.NDOG.UI ? window.NDOG.UI.t(key) : key;
  }

  // ── Default avatar SVG ──
  var DEFAULT_AVATAR = 'data:image/svg+xml;base64,' +
    btoa('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">' +
      '<rect width="40" height="40" rx="20" fill="#e2e8f0"/>' +
      '<text x="20" y="25" text-anchor="middle" font-size="18" fill="#94a3b8">?</text>' +
    '</svg>');

  // ── Country code to flag emoji ──
  function countryFlag(code) {
    if (!code || code.length !== 2) return '\u{1F30D}';
    var upper = code.toUpperCase();
    return String.fromCodePoint(0x1F1E6 + upper.charCodeAt(0) - 65, 0x1F1E6 + upper.charCodeAt(1) - 65);
  }

  // ── Number formatting ──
  function formatNumber(num) {
    if (num === null || num === undefined) return '0';
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return Math.floor(num).toLocaleString();
  }

  // ── Medal emojis ──
  var MEDALS = ['\u{1F947}', '\u{1F948}', '\u{1F949}'];

  // ═══════════════════════════════════════════
  // LEADERBOARD MODULE
  // ═══════════════════════════════════════════
  window.NDOG.Leaderboard = {
    activeTab: 'global',
    listeners: {},

    // ─────────────────────────────────
    // init
    // ─────────────────────────────────
    init: function () {
      var self = this;

      // Setup tab listeners
      var tabBtns = document.querySelectorAll('[data-leaderboard-tab]');
      for (var i = 0; i < tabBtns.length; i++) {
        tabBtns[i].addEventListener('click', function (e) {
          var tab = e.currentTarget.getAttribute('data-leaderboard-tab');
          if (tab) {
            self.switchTab(tab);
          }
        });
      }

      // Load default tab
      this.switchTab(this.activeTab);
    },

    // ─────────────────────────────────
    // switchTab
    // ─────────────────────────────────
    switchTab: function (tab) {
      this.activeTab = tab;

      // Cleanup previous listeners
      this.cleanup();

      // Update tab buttons
      var tabBtns = document.querySelectorAll('[data-leaderboard-tab]');
      for (var i = 0; i < tabBtns.length; i++) {
        var btn = tabBtns[i];
        if (btn.getAttribute('data-leaderboard-tab') === tab) {
          btn.classList.add('tab--active');
        } else {
          btn.classList.remove('tab--active');
        }
      }

      // Update tab panels
      var panels = document.querySelectorAll('[data-leaderboard-panel]');
      for (var j = 0; j < panels.length; j++) {
        var panel = panels[j];
        if (panel.getAttribute('data-leaderboard-panel') === tab) {
          panel.classList.remove('hidden');
        } else {
          panel.classList.add('hidden');
        }
      }

      // Load data for the selected tab
      switch (tab) {
        case 'global':
          this.loadGlobal();
          break;
        case 'country':
          this.loadCountry();
          break;
        case 'referral':
          this.loadReferral();
          break;
        default:
          this.loadGlobal();
      }
    },

    // ─────────────────────────────────
    // loadGlobal
    // ─────────────────────────────────
    loadGlobal: function () {
      var self = this;
      var db = getDB();
      var uid = getUID();

      if (!db) {
        console.warn('[Leaderboard] Firebase not initialized');
        return;
      }

      // Show loading skeleton
      var container = document.getElementById('globalLeaderboard');
      if (container) {
        container.innerHTML = '<div class="lb-skeleton"><div class="lb-skeleton__row"></div><div class="lb-skeleton__row"></div><div class="lb-skeleton__row"></div></div>';
      }

      var ref = db.ref('leaderboards/global')
        .orderByChild('balance')
        .limitToLast(50);

      var callback = ref.on('value', function (snapshot) {
        if (!snapshot.exists()) {
          var empty = document.getElementById('globalLeaderboard');
          if (empty) {
            empty.innerHTML = '<div class="lb__empty"><p>' + (t('leaderboard.empty') || 'No rankings yet') + '</p></div>';
          }
          return;
        }

        var data = snapshot.val();
        var entries = [];
        var keys = Object.keys(data);

        for (var i = 0; i < keys.length; i++) {
          var entry = data[keys[i]];
          entry.uid = keys[i];
          entries.push(entry);
        }

        // Sort descending by balance
        entries.sort(function (a, b) { return (b.balance || 0) - (a.balance || 0); });

        // Assign ranks
        for (var r = 0; r < entries.length; r++) {
          entries[r].rank = r + 1;
        }

        // Render podium with top 3
        var top3 = entries.slice(0, 3);
        self.renderPodium(top3, uid);

        // Render list (from rank 4 onward)
        var rest = entries.slice(3);
        self.renderList(rest, 4, uid);

        // Highlight current user
        self.highlightCurrentUser(uid);
      });

      this.listeners.global = { ref: ref, event: 'value', callback: callback };
    },

    // ─────────────────────────────────
    // loadCountry
    // ─────────────────────────────────
    loadCountry: function () {
      var self = this;
      var db = getDB();
      var uid = getUID();
      var store = getStore();

      if (!db) {
        console.warn('[Leaderboard] Firebase not initialized');
        return;
      }

      // Show loading skeleton
      var container = document.getElementById('countryLeaderboard');
      if (container) {
        container.innerHTML = '<div class="lb-skeleton"><div class="lb-skeleton__row"></div><div class="lb-skeleton__row"></div><div class="lb-skeleton__row"></div></div>';
      }

      var countryCode = 'EG'; // Default
      if (store && store.user && store.user.country) {
        countryCode = store.user.country;
      }

      // Update country label
      var countryLabel = document.getElementById('countryLeaderboardLabel');
      if (countryLabel) {
        countryLabel.textContent = countryFlag(countryCode) + ' ' + countryCode.toUpperCase();
      }

      // Load all users and filter by country
      var ref = db.ref('users').orderByChild('balance').limitToLast(200);

      var callback = ref.on('value', function (snapshot) {
        if (!snapshot.exists()) {
          var empty = document.getElementById('countryLeaderboard');
          if (empty) {
            empty.innerHTML = '<div class="lb__empty"><p>' + (t('leaderboard.emptyCountry') || 'No rankings in your country yet') + '</p></div>';
          }
          return;
        }

        var data = snapshot.val();
        var entries = [];
        var keys = Object.keys(data);

        for (var i = 0; i < keys.length; i++) {
          var user = data[keys[i]];
          if (user.country === countryCode) {
            user.uid = keys[i];
            entries.push(user);
          }
        }

        // Sort descending by balance
        entries.sort(function (a, b) { return (b.balance || 0) - (a.balance || 0); });

        // Assign ranks
        for (var r = 0; r < entries.length; r++) {
          entries[r].rank = r + 1;
        }

        // Render podium
        var top3 = entries.slice(0, 3);
        self.renderPodium(top3, uid, 'country');

        // Render rest
        var rest = entries.slice(3);
        self.renderList(rest, 4, uid, 'country');

        self.highlightCurrentUser(uid);
      });

      this.listeners.country = { ref: ref, event: 'value', callback: callback };
    },

    // ─────────────────────────────────
    // loadReferral
    // ─────────────────────────────────
    loadReferral: function () {
      var self = this;
      var db = getDB();
      var uid = getUID();

      if (!db) {
        console.warn('[Leaderboard] Firebase not initialized');
        return;
      }

      // Show loading skeleton
      var container = document.getElementById('referralLeaderboard');
      if (container) {
        container.innerHTML = '<div class="lb-skeleton"><div class="lb-skeleton__row"></div><div class="lb-skeleton__row"></div><div class="lb-skeleton__row"></div></div>';
      }

      var ref = db.ref('users')
        .orderByChild('totalReferrals')
        .limitToLast(50);

      var callback = ref.on('value', function (snapshot) {
        if (!snapshot.exists()) {
          var empty = document.getElementById('referralLeaderboard');
          if (empty) {
            empty.innerHTML = '<div class="lb__empty"><p>' + (t('leaderboard.emptyReferral') || 'No referral rankings yet') + '</p></div>';
          }
          return;
        }

        var data = snapshot.val();
        var entries = [];
        var keys = Object.keys(data);

        for (var i = 0; i < keys.length; i++) {
          var user = data[keys[i]];
          user.uid = keys[i];
          user.value = user.totalReferrals || 0;
          entries.push(user);
        }

        // Sort descending by referrals
        entries.sort(function (a, b) { return (b.totalReferrals || 0) - (a.totalReferrals || 0); });

        // Assign ranks
        for (var r = 0; r < entries.length; r++) {
          entries[r].rank = r + 1;
        }

        // Render podium
        var top3 = entries.slice(0, 3);
        self.renderPodium(top3, uid, 'referral');

        // Render rest
        var rest = entries.slice(3);
        self.renderList(rest, 4, uid, 'referral');

        self.highlightCurrentUser(uid);
      });

      this.listeners.referral = { ref: ref, event: 'value', callback: callback };
    },

    // ─────────────────────────────────
    // renderPodium
    // ─────────────────────────────────
    renderPodium: function (top3, currentUid, prefix) {
      var podiumId = (prefix || 'global') + 'Podium';
      var container = document.getElementById(podiumId);
      if (!container) return;

      if (!top3 || top3.length === 0) {
        container.innerHTML = '';
        return;
      }

      // Podium order: 2nd, 1st, 3rd
      var order = [];
      if (top3.length >= 2) order.push(top3[1]); // 2nd place
      if (top3.length >= 1) order.push(top3[0]); // 1st place
      if (top3.length >= 3) order.push(top3[2]); // 3rd place

      var html = '<div class="podium">';

      for (var i = 0; i < order.length; i++) {
        var entry = order[i];
        var rank = entry.rank || i + 1;
        var isMe = currentUid && entry.uid === currentUid;
        var avatar = entry.photoURL || DEFAULT_AVATAR;
        var name = entry.displayName || (t('leaderboard.anonymous') || 'Anonymous');

        var heightClass = '';
        if (rank === 1) heightClass = 'podium__item--first';
        else if (rank === 2) heightClass = 'podium__item--second';
        else heightClass = 'podium__item--third';

        var meClass = isMe ? ' podium__item--me' : '';

        var isReferral = prefix === 'referral';
        var displayValue = isReferral
          ? (entry.totalReferrals || 0) + ' ' + (t('leaderboard.referrals') || 'refs')
          : formatNumber(entry.balance || 0) + ' NDOG';

        html +=
          '<div class="podium__item ' + heightClass + meClass + '">' +
            '<div class="podium__medal">' + (MEDALS[rank - 1] || '#' + rank) + '</div>' +
            '<div class="podium__avatar">' +
              '<img src="' + avatar + '" alt="' + name + '" class="podium__img" onerror="this.src=\'' + DEFAULT_AVATAR + '\'">' +
            '</div>' +
            '<div class="podium__name">' + name + '</div>' +
            '<div class="podium__value">' + displayValue + '</div>' +
            '<div class="podium__stand"></div>' +
          '</div>';
      }

      html += '</div>';
      container.innerHTML = html;
    },

    // ─────────────────────────────────
    // renderList
    // ─────────────────────────────────
    renderList: function (users, startRank, currentUid, prefix) {
      var listId = (prefix || 'global') + 'LeaderboardList';
      var container = document.getElementById(listId);
      if (!container) return;

      if (!users || users.length === 0) {
        container.innerHTML = '';
        return;
      }

      var isReferral = prefix === 'referral';
      var html = '';

      for (var i = 0; i < users.length; i++) {
        var user = users[i];
        var rank = startRank + i;
        var isMe = currentUid && user.uid === currentUid;
        var avatar = user.photoURL || DEFAULT_AVATAR;
        var name = user.displayName || (t('leaderboard.anonymous') || 'Anonymous');
        var countryFlagStr = user.country ? countryFlag(user.country) : '';

        var meClass = isMe ? ' lb-row--me' : '';

        var displayValue = isReferral
          ? (user.totalReferrals || 0) + ' ' + (t('leaderboard.referrals') || 'refs')
          : formatNumber(user.balance || 0) + ' NDOG';

        html +=
          '<div class="lb-row' + meClass + '" data-uid="' + user.uid + '">' +
            '<div class="lb-row__rank">' +
              (rank <= 3 ? (MEDALS[rank - 1] || '#' + rank) : '#' + rank) +
            '</div>' +
            '<div class="lb-row__avatar">' +
              '<img src="' + avatar + '" alt="' + name + '" class="lb-row__img" onerror="this.src=\'' + DEFAULT_AVATAR + '\'">' +
            '</div>' +
            '<div class="lb-row__info">' +
              '<div class="lb-row__name">' + name + '</div>' +
              '<div class="lb-row__country">' + countryFlagStr + '</div>' +
            '</div>' +
            '<div class="lb-row__value">' + displayValue + '</div>' +
          '</div>';
      }

      container.innerHTML = html;
    },

    // ─────────────────────────────────
    // highlightCurrentUser
    // ─────────────────────────────────
    highlightCurrentUser: function (currentUid) {
      if (!currentUid) return;

      // Find and highlight the current user in the list
      var allRows = document.querySelectorAll('.lb-row');
      for (var i = 0; i < allRows.length; i++) {
        var row = allRows[i];
        if (row.getAttribute('data-uid') === currentUid) {
          row.classList.add('lb-row--me');

          // Scroll into view
          setTimeout(function () {
            row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }, 300);
        }
      }

      // Also highlight in podium
      var podiumItems = document.querySelectorAll('.podium__item');
      for (var j = 0; j < podiumItems.length; j++) {
        // Already handled by class during render
      }
    },

    // ─────────────────────────────────
    // cleanup
    // ─────────────────────────────────
    cleanup: function () {
      var db = getDB();
      if (!db) return;

      var keys = Object.keys(this.listeners);
      for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        var listener = this.listeners[key];
        if (listener && listener.ref && listener.event) {
          try {
            listener.ref.off(listener.event, listener.callback);
          } catch (e) {
            console.warn('[Leaderboard] Error detaching listener for', key, e);
          }
        }
      }

      this.listeners = {};
    },

    // ─────────────────────────────────
    // refresh — reload current tab
    // ─────────────────────────────────
    refresh: function () {
      this.switchTab(this.activeTab);
    },

    // ─────────────────────────────────
    // destroy — full cleanup
    // ─────────────────────────────────
    destroy: function () {
      this.cleanup();
      this.activeTab = 'global';
    }
  };
})();

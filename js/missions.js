/**
 * ═══════════════════════════════════════════════════════════════════
 * NDOG Missions Module — Missions, Achievements, Badges System
 * ═══════════════════════════════════════════════════════════════════
 * Manages daily, weekly, monthly missions, badge collection,
 * and time-limited community events.
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

  // ── Storage helpers ──
  var MISSION_CACHE_KEY = 'ndog_missions_cache';

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

  // ── Date utilities ──
  function getStartOfDay(timestamp) {
    var d = new Date(timestamp || Date.now());
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }
  function getStartOfWeek(timestamp) {
    var d = new Date(timestamp || Date.now());
    var day = d.getDay();
    var diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }
  function getStartOfMonth(timestamp) {
    var d = new Date(timestamp || Date.now());
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }
  function isExpired(timestamp) {
    return Date.now() > timestamp;
  }

  // ── Get current progress value for a mission type ──
  function getUserProgressValue(missionDef) {
    var store = getStore();
    if (!store || !store.user) return 0;

    var user = store.user;
    switch (missionDef.type) {
      case 'auto':
      case 'claim':
        return user.totalClaims || 0;
      case 'spin':
        return loadJSON('ndog_spin_today_count', 0);
      case 'social':
      case 'visit':
        return loadJSON('ndog_' + missionDef.id + '_today', 0);
      case 'streak':
        return user.streakDays || (loadJSON('ndog_claim_streak', 0));
      case 'referral':
        return user.totalReferrals || 0;
      case 'claim_count':
        return user.totalClaims || 0;
      case 'balance':
        return user.balance || 0;
      case 'leaderboard': {
        var rank = loadJSON('ndog_leaderboard_rank', 999);
        return rank <= (missionDef.required || 100) ? 1 : 0;
      }
      case 'rank':
        return user.rank === missionDef.required ? 1 : 0;
      default:
        return 0;
    }
  }

  // ═══════════════════════════════════════════
  // MISSIONS MODULE
  // ═══════════════════════════════════════════
  window.NDOG.Missions = {
    activeTab: 'daily',
    definitions: {
      daily: [
        { id: 'login', title: 'daily_login', reward: 5, type: 'auto', icon: '\u{1F511}', description: 'daily_login_desc' },
        { id: 'claim', title: 'daily_claim', reward: 10, type: 'claim', icon: '\u{1F381}', description: 'daily_claim_desc' },
        { id: 'spin', title: 'daily_spin', reward: 5, type: 'spin', icon: '\u{1F3A2}', description: 'daily_spin_desc' },
        { id: 'share', title: 'daily_share', reward: 10, type: 'social', icon: '\u{1F4E4}', description: 'daily_share_desc' },
        { id: 'visit', title: 'daily_visit', reward: 5, type: 'visit', icon: '\u{1F310}', description: 'daily_visit_desc' }
      ],
      weekly: [
        { id: 'streak7', title: 'weekly_streak7', reward: 50, type: 'streak', required: 7, icon: '\u{1F525}', description: 'weekly_streak7_desc' },
        { id: 'refer3', title: 'weekly_refer3', reward: 100, type: 'referral', required: 3, icon: '\u{1F465}', description: 'weekly_refer3_desc' },
        { id: 'claim5', title: 'weekly_claim5', reward: 75, type: 'claim_count', required: 5, icon: '\u{26CF}\u{FE0F}', description: 'weekly_claim5_desc' },
        { id: 'balance500', title: 'weekly_balance500', reward: 50, type: 'balance', required: 500, icon: '\u{1F4B0}', description: 'weekly_balance500_desc' }
      ],
      monthly: [
        { id: 'streak30', title: 'monthly_streak30', reward: 200, type: 'streak', required: 30, icon: '\u{1F525}', description: 'monthly_streak30_desc' },
        { id: 'refer10', title: 'monthly_refer10', reward: 300, type: 'referral', required: 10, icon: '\u{1F465}', description: 'monthly_refer10_desc' },
        { id: 'top100', title: 'monthly_top100', reward: 500, type: 'leaderboard', required: 100, icon: '\u{1F3C6}', description: 'monthly_top100_desc' },
        { id: 'gold_rank', title: 'monthly_gold_rank', reward: 400, type: 'rank', required: 'gold', icon: '\u{1F947}', description: 'monthly_gold_rank_desc' }
      ],
      badges: [
        { id: 'first_claim', title: 'badge_first_claim', icon: '\u{1F31F}', requirement: 'First claim' },
        { id: 'streak_7', title: 'badge_streak_7', icon: '\u{1F525}', requirement: '7-day streak' },
        { id: 'streak_30', title: 'badge_streak_30', icon: '\u{1F525}', requirement: '30-day streak' },
        { id: 'ref_10', title: 'badge_ref_10', icon: '\u{1F465}', requirement: '10 referrals' },
        { id: 'ref_50', title: 'badge_ref_50', icon: '\u{1F465}', requirement: '50 referrals' },
        { id: 'balance_1k', title: 'badge_balance_1k', icon: '\u{1F4B0}', requirement: '1000 NDOG' },
        { id: 'balance_10k', title: 'badge_balance_10k', icon: '\u{1F4B0}', requirement: '10000 NDOG' },
        { id: 'founder', title: 'badge_founder', icon: '\u{1F451}', requirement: 'Joined pre-launch' }
      ],
      events: []
    },

    // ─────────────────────────────────
    // init
    // ─────────────────────────────────
    init: function () {
      var self = this;

      // Setup tab listeners
      var tabBtns = document.querySelectorAll('[data-mission-tab]');
      for (var i = 0; i < tabBtns.length; i++) {
        tabBtns[i].addEventListener('click', function (e) {
          var tab = e.currentTarget.getAttribute('data-mission-tab');
          if (tab) {
            self.switchTab(tab);
          }
        });
      }

      var uid = getUID();
      if (uid) {
        this.loadMissions(uid);
        this.loadEvents();
      }
    },

    // ─────────────────────────────────
    // loadMissions
    // ─────────────────────────────────
    loadMissions: function (uid) {
      var self = this;
      var db = getDB();
      if (!uid || !db) return;

      db.ref('missions/' + uid).once('value', function (snapshot) {
        var progressData = snapshot.exists() ? snapshot.val() : {};

        // Auto-complete login mission
        var today = getStartOfDay();
        if (!progressData.daily) {
          progressData.daily = {};
        }
        if (!progressData.daily.login) {
          progressData.daily.login = { completed: true, completedAt: Date.now() };
          db.ref('missions/' + uid + '/daily/login').set({
            completed: true,
            completedAt: Date.now()
          });
        }

        self.renderMissions(progressData);

        // Load earned badges from user profile
        var store = getStore();
        if (store && store.user && store.user.badges) {
          self.renderBadges(store.user.badges);
        }
      }).catch(function (err) {
        console.error('[Missions] Failed to load missions:', err);
        // Render with empty data
        self.renderMissions({});
      });
    },

    // ─────────────────────────────────
    // switchTab
    // ─────────────────────────────────
    switchTab: function (tab) {
      this.activeTab = tab;

      // Update tab buttons
      var tabBtns = document.querySelectorAll('[data-mission-tab]');
      for (var i = 0; i < tabBtns.length; i++) {
        var btn = tabBtns[i];
        if (btn.getAttribute('data-mission-tab') === tab) {
          btn.classList.add('tab--active');
        } else {
          btn.classList.remove('tab--active');
        }
      }

      // Update tab panels
      var panels = document.querySelectorAll('[data-mission-panel]');
      for (var j = 0; j < panels.length; j++) {
        var panel = panels[j];
        if (panel.getAttribute('data-mission-panel') === tab) {
          panel.classList.remove('hidden');
        } else {
          panel.classList.add('hidden');
        }
      }

      // Re-render active tab
      var uid = getUID();
      if (uid) {
        this.loadMissions(uid);
      }
    },

    // ─────────────────────────────────
    // renderMissions
    // ─────────────────────────────────
    renderMissions: function (progressData) {
      var self = this;
      if (!progressData) progressData = {};

      // Render daily missions
      var dailyContainer = document.getElementById('dailyMissionsList');
      if (dailyContainer) {
        dailyContainer.innerHTML = self._renderMissionList(
          self.definitions.daily,
          progressData.daily || {},
          getStartOfDay(),
          getStartOfDay() + 24 * 60 * 60 * 1000
        );
        self._attachMissionListeners(dailyContainer, 'daily', progressData);
      }

      // Render weekly missions
      var weeklyContainer = document.getElementById('weeklyMissionsList');
      if (weeklyContainer) {
        weeklyContainer.innerHTML = self._renderMissionList(
          self.definitions.weekly,
          progressData.weekly || {},
          getStartOfWeek(),
          getStartOfWeek() + 7 * 24 * 60 * 60 * 1000
        );
        self._attachMissionListeners(weeklyContainer, 'weekly', progressData);
      }

      // Render monthly missions
      var monthlyContainer = document.getElementById('monthlyMissionsList');
      if (monthlyContainer) {
        monthlyContainer.innerHTML = self._renderMissionList(
          self.definitions.monthly,
          progressData.monthly || {},
          getStartOfMonth(),
          getStartOfMonth() + 31 * 24 * 60 * 60 * 1000
        );
        self._attachMissionListeners(monthlyContainer, 'monthly', progressData);
      }
    },

    // ─────────────────────────────────
    // _renderMissionList (internal)
    // ─────────────────────────────────
    _renderMissionList: function (definitions, progressMap, validFrom, validTo) {
      if (!definitions || definitions.length === 0) {
        return '<p class="missions__empty">' + (t('missions.noMissions') || 'No missions available') + '</p>';
      }

      var html = '';
      for (var i = 0; i < definitions.length; i++) {
        var def = definitions[i];
        var progress = progressMap[def.id] || {};
        var completed = progress.completed || false;
        var claimed = progress.claimed || false;

        // Calculate current progress value
        var currentValue = getUserProgressValue(def);
        var targetValue = def.required || 1;
        var percent = Math.min((currentValue / targetValue) * 100, 100);

        var classes = 'mission-card';
        if (completed) classes += ' mission-card--done';
        if (claimed) classes += ' mission-card--claimed';

        html +=
          '<div class="' + classes + '" data-mission-id="' + def.id + '">' +
            '<div class="mission-card__icon">' + def.icon + '</div>' +
            '<div class="mission-card__body">' +
              '<div class="mission-card__title">' + (t('missions.' + def.title) || def.title) + '</div>' +
              '<div class="mission-card__desc">' + (t('missions.' + (def.description || '')) || '') + '</div>' +
              '<div class="mission-card__progress">' +
                '<div class="mission-card__bar">' +
                  '<div class="mission-card__fill" style="width: ' + percent.toFixed(0) + '%;"></div>' +
                '</div>' +
                '<div class="mission-card__label">' +
                  currentValue + ' / ' + targetValue +
                '</div>' +
              '</div>' +
            '</div>' +
            '<div class="mission-card__reward">' +
              (claimed
                ? '<span class="mission-card__badge mission-card__badge--done">' + (t('missions.claimed') || 'Claimed') + '</span>'
                : completed
                  ? '<button class="btn btn--gold btn--sm mission-card__claim-btn" data-mission-id="' + def.id + '" data-mission-period="' + (validTo < getStartOfDay() + 7 * 24 * 60 * 60 * 1000 ? 'daily' : validTo < getStartOfMonth() + 31 * 24 * 60 * 60 * 1000 ? 'weekly' : 'monthly') + '">+' + def.reward + ' NDOG</button>'
                  : '<span class="mission-card__pending">+' + def.reward + ' NDOG</span>'
              ) +
            '</div>' +
          '</div>';
      }

      return html;
    },

    // ─────────────────────────────────
    // _attachMissionListeners (internal)
    // ─────────────────────────────────
    _attachMissionListeners: function (container, period, progressData) {
      var claimBtns = container.querySelectorAll('.mission-card__claim-btn');
      for (var i = 0; i < claimBtns.length; i++) {
        claimBtns[i].addEventListener('click', function (e) {
          var btn = e.currentTarget;
          var missionId = btn.getAttribute('data-mission-id');
          var missionPeriod = btn.getAttribute('data-mission-period') || period;
          if (missionId) {
            window.NDOG.Missions.completeMission(getUID(), missionId, {
              period: missionPeriod
            });
          }
        });
      }
    },

    // ─────────────────────────────────
    // checkMissionCompletion
    // ─────────────────────────────────
    checkMissionCompletion: async function (uid, missionId) {
      if (!uid || !missionId) return;
      var db = getDB();
      if (!db) return;

      // Find the mission definition across all periods
      var periods = ['daily', 'weekly', 'monthly'];
      var foundDef = null;
      var foundPeriod = null;

      for (var p = 0; p < periods.length; p++) {
        var defs = this.definitions[periods[p]];
        for (var i = 0; i < defs.length; i++) {
          if (defs[i].id === missionId) {
            foundDef = defs[i];
            foundPeriod = periods[p];
            break;
          }
        }
        if (foundDef) break;
      }

      if (!foundDef) return;

      // Check progress
      var currentValue = getUserProgressValue(foundDef);
      var targetValue = foundDef.required || 1;

      if (currentValue >= targetValue) {
        var snapshot = await db.ref('missions/' + uid + '/' + foundPeriod + '/' + missionId).once('value');
        var existing = snapshot.exists() ? snapshot.val() : {};

        if (!existing.completed) {
          // Update progress
          await db.ref('missions/' + uid + '/' + foundPeriod + '/' + missionId).update({
            completed: true,
            progress: currentValue,
            completedAt: Date.now()
          });
        }
      } else {
        // Update progress value
        await db.ref('missions/' + uid + '/' + foundPeriod + '/' + missionId).update({
          progress: currentValue,
          updatedAt: Date.now()
        });
      }
    },

    // ─────────────────────────────────
    // completeMission
    // ─────────────────────────────────
    completeMission: async function (uid, missionId, definition) {
      var self = this;
      var db = getDB();
      var store = getStore();

      if (!uid || !db) {
        self.showToast(t('missions.notLoggedIn') || 'Please log in first.', 'error');
        return;
      }

      var period = (definition && definition.period) || 'daily';

      // Find mission definition for reward
      var missionDefs = self.definitions[period] || [];
      var missionDef = null;
      for (var i = 0; i < missionDefs.length; i++) {
        if (missionDefs[i].id === missionId) {
          missionDef = missionDefs[i];
          break;
        }
      }
      if (!missionDef) return;

      // Verify completion
      var snapshot = await db.ref('missions/' + uid + '/' + period + '/' + missionId).once('value');
      var progress = snapshot.exists() ? snapshot.val() : {};

      if (!progress.completed) {
        self.showToast(t('missions.notComplete') || 'Mission not yet completed.', 'warning');
        return;
      }

      if (progress.claimed) {
        self.showToast(t('missions.alreadyClaimed') || 'Reward already claimed.', 'info');
        return;
      }

      try {
        // Mark as claimed
        await db.ref('missions/' + uid + '/' + period + '/' + missionId + '/claimed').set(true);
        await db.ref('missions/' + uid + '/' + period + '/' + missionId + '/claimedAt').set(Date.now());

        // Add reward to balance
        var reward = missionDef.reward;
        await db.ref('users/' + uid + '/balance').transaction(function (currentBalance) {
          return (currentBalance || 0) + reward;
        });

        // Record transaction
        var txRef = db.ref('transactions/' + uid).push();
        await txRef.set({
          type: 'mission_reward',
          missionId: missionId,
          period: period,
          amount: reward,
          timestamp: Date.now(),
          description: 'Mission reward: ' + missionId
        });

        // Update loyalty score
        await db.ref('users/' + uid + '/loyaltyScore').transaction(function (score) {
          return (score || 0) + Math.floor(reward * 0.3);
        });

        // Update local store
        if (store) {
          store.addBalance(reward);
          store.completeMission(missionId);
        }

        // Show success
        self.showToast(
          (t('missions.rewardClaimed') || 'Mission reward claimed') + ': +' + reward + ' NDOG! \u{1F389}',
          'success'
        );

        // Re-render
        self.loadMissions(uid);

        // Analytics
        if (window.NDOG && window.NDOG.Analytics) {
          window.NDOG.Analytics.trackEvent('mission_completed', {
            missionId: missionId,
            period: period,
            reward: reward
          });
        }

      } catch (error) {
        console.error('[Missions] Failed to complete mission:', error);
        self.showToast(t('missions.error') || 'Failed to claim reward. Please try again.', 'error');
      }
    },

    // ─────────────────────────────────
    // renderBadges
    // ─────────────────────────────────
    renderBadges: function (earnedBadges) {
      var container = document.getElementById('badgesCollection');
      if (!container) return;

      if (!earnedBadges) earnedBadges = [];

      var allBadges = this.definitions.badges;
      var html = '';

      for (var i = 0; i < allBadges.length; i++) {
        var badge = allBadges[i];
        var isEarned = earnedBadges.indexOf(badge.id) !== -1;

        var classes = 'badge-card';
        if (isEarned) {
          classes += ' badge-card--earned';
        } else {
          classes += ' badge-card--locked';
        }

        html +=
          '<div class="' + classes + '" data-badge-id="' + badge.id + '" title="' + badge.requirement + '">' +
            '<div class="badge-card__icon">' +
              (isEarned ? badge.icon : '\u{1F512}') +
            '</div>' +
            '<div class="badge-card__name">' + (t('missions.' + badge.title) || badge.title) + '</div>' +
            '<div class="badge-card__req">' +
              (isEarned
                ? (t('missions.earned') || 'Earned')
                : badge.requirement) +
            '</div>' +
          '</div>';
      }

      container.innerHTML = html;
    },

    // ─────────────────────────────────
    // loadEvents
    // ─────────────────────────────────
    loadEvents: function () {
      var self = this;
      var db = getDB();
      if (!db) return;

      db.ref('missionDefinitions/events').once('value', function (snapshot) {
        var events = [];
        if (snapshot.exists()) {
          var data = snapshot.val();
          var keys = Object.keys(data);
          for (var i = 0; i < keys.length; i++) {
            var evt = data[keys[i]];
            evt.id = keys[i];
            events.push(evt);
          }
        }
        // Sort by start date
        events.sort(function (a, b) { return (a.startDate || 0) - (b.startDate || 0); });

        self.definitions.events = events;
        self.renderEvents(events);
      }).catch(function (err) {
        console.error('[Missions] Failed to load events:', err);
        self.renderEvents([]);
      });
    },

    // ─────────────────────────────────
    // renderEvents
    // ─────────────────────────────────
    renderEvents: function (events) {
      var container = document.getElementById('missionEvents');
      if (!container) return;

      if (!events || events.length === 0) {
        container.innerHTML =
          '<div class="events__empty">' +
            '<p>' + (t('missions.noEvents') || 'No active events right now. Check back later!') + '</p>' +
          '</div>';
        return;
      }

      var now = Date.now();
      var html = '';

      for (var i = 0; i < events.length; i++) {
        var evt = events[i];
        var isActive = now >= (evt.startDate || 0) && now <= (evt.endDate || Infinity);
        var isUpcoming = now < (evt.startDate || 0);
        var isExpired = now > (evt.endDate || 0);

        var statusClass = 'event-card';
        if (isActive) statusClass += ' event-card--active';
        else if (isUpcoming) statusClass += ' event-card--upcoming';
        else statusClass += ' event-card--expired';

        var startDateStr = new Date(evt.startDate).toLocaleDateString('en-US', {
          month: 'short', day: 'numeric', year: 'numeric'
        });
        var endDateStr = new Date(evt.endDate).toLocaleDateString('en-US', {
          month: 'short', day: 'numeric', year: 'numeric'
        });

        var statusLabel = isActive
          ? (t('missions.active') || 'Active')
          : isUpcoming
            ? (t('missions.upcoming') || 'Upcoming')
            : (t('missions.ended') || 'Ended');

        html +=
          '<div class="' + statusClass + '" data-event-id="' + evt.id + '">' +
            '<div class="event-card__header">' +
              '<span class="event-card__status">' + statusLabel + '</span>' +
              '<span class="event-card__reward">+' + (evt.reward || 0) + ' NDOG</span>' +
            '</div>' +
            '<div class="event-card__title">' + (evt.title || 'Event') + '</div>' +
            '<div class="event-card__desc">' + (evt.description || '') + '</div>' +
            '<div class="event-card__dates">' +
              startDateStr + ' — ' + endDateStr +
            '</div>' +
            '<div class="event-card__type">' + (evt.type || 'special') + '</div>' +
          '</div>';
      }

      container.innerHTML = html;
    },

    // ─────────────────────────────────
    // checkAllBadgeQualifications
    // ─────────────────────────────────
    checkAllBadgeQualifications: async function (uid) {
      var self = this;
      var db = getDB();
      var store = getStore();
      if (!uid || !db || !store || !store.user) return;

      var user = store.user;
      var allBadges = self.definitions.badges;
      var newBadges = [];

      for (var i = 0; i < allBadges.length; i++) {
        var badge = allBadges[i];
        var alreadyHas = user.badges && user.badges.indexOf(badge.id) !== -1;
        if (alreadyHas) continue;

        var qualifies = false;

        switch (badge.id) {
          case 'first_claim':
            qualifies = (user.totalClaims || 0) >= 1;
            break;
          case 'streak_7':
            qualifies = (user.streakDays || loadJSON('ndog_claim_streak', 0)) >= 7;
            break;
          case 'streak_30':
            qualifies = (user.streakDays || loadJSON('ndog_claim_streak', 0)) >= 30;
            break;
          case 'ref_10':
            qualifies = (user.totalReferrals || 0) >= 10;
            break;
          case 'ref_50':
            qualifies = (user.totalReferrals || 0) >= 50;
            break;
          case 'balance_1k':
            qualifies = (user.balance || 0) >= 1000;
            break;
          case 'balance_10k':
            qualifies = (user.balance || 0) >= 10000;
            break;
          case 'founder': {
            var launchDate = new Date('2028-01-01T00:00:00Z').getTime();
            qualifies = (user.createdAt || Infinity) < launchDate;
            break;
          }
        }

        if (qualifies) {
          newBadges.push(badge.id);
        }
      }

      // Award new badges
      if (newBadges.length > 0) {
        try {
          var currentBadges = user.badges || [];
          var updatedBadges = currentBadges.concat(newBadges);

          await db.ref('users/' + uid + '/badges').set(updatedBadges);

          if (store) {
            for (var b = 0; b < newBadges.length; b++) {
              store.addBadge(newBadges[b]);
            }
          }

          // Show notification for each new badge
          for (var n = 0; n < newBadges.length; n++) {
            var badgeName = '';
            for (var j = 0; j < allBadges.length; j++) {
              if (allBadges[j].id === newBadges[n]) {
                badgeName = allBadges[j].title;
                break;
              }
            }
            self.showToast(
              (t('missions.badgeEarned') || 'Badge earned') + ': ' + badgeName + ' \u{1F3C6}',
              'success'
            );
          }

          // Analytics
          if (window.NDOG && window.NDOG.Analytics) {
            window.NDOG.Analytics.trackEvent('badges_earned', {
              badgeIds: newBadges
            });
          }

        } catch (error) {
          console.error('[Missions] Failed to award badges:', error);
        }
      }
    },

    // ─────────────────────────────────
    // Helper: show toast
    // ─────────────────────────────────
    showToast: function (message, type) {
      if (window.NDOG && window.NDOG.Utils && window.NDOG.Utils.toast) {
        window.NDOG.Utils.toast(message, type);
      } else if (window.NDOG && window.NDOG.Store) {
        window.NDOG.Store.addToast({ message: message, type: type || 'info' });
      } else {
        console.log('[NDOG Missions]', message);
      }
    },

    // ─────────────────────────────────
    // destroy — cleanup
    // ─────────────────────────────────
    destroy: function () {
      this.definitions.events = [];
    }
  };
})();

/**
 * ═══════════════════════════════════════════════════════════════════
 * NDOG Claim Module — Daily Mining / Claim System
 * ═══════════════════════════════════════════════════════════════════
 * Manages daily NDOG token claims, streak tracking, VIP multipliers,
 * boost mining, and claim history.
 * ═══════════════════════════════════════════════════════════════════
 */
(function () {
  'use strict';

  // ── Firebase references (initialized in app.js on window.NDOG.firebase) ──
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
  function getStore() {
    return window.NDOG && window.NDOG.Store ? window.NDOG.Store : null;
  }
  function t(key) {
    return window.NDOG && window.NDOG.i18n ? window.NDOG.i18n.t(key) : key;
  }

  // ── Storage helpers ──
  var COOLDOWN_KEY = 'ndog_claim_cooldown';
  var STREAK_KEY = 'ndog_claim_streak';
  var BOOST_KEY = 'ndog_claim_boosts';
  var BOOST_DATE_KEY = 'ndog_claim_boost_date';
  var LAST_CLAIM_KEY = 'ndog_last_claim_ts';

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
    } catch (e) {
      /* ignore */
    }
  }

  // ── Founder bonus detection ──
  function isFounder() {
    var store = getStore();
    if (store && store.user && store.user.createdAt) {
      var launchDate = new Date('2028-01-01T00:00:00Z').getTime();
      return store.user.createdAt < launchDate;
    }
    return false;
  }

  // ── Referral multiplier ──
  function getReferralMultiplier() {
    var store = getStore();
    if (store && store.user) {
      var refs = store.user.totalReferrals || 0;
      if (refs >= 50) return 1.5;
      if (refs >= 20) return 1.3;
      if (refs >= 10) return 1.2;
      if (refs >= 5) return 1.1;
    }
    return 1.0;
  }

  // ═══════════════════════════════════════════
  // CLAIM MODULE
  // ═══════════════════════════════════════════
  window.NDOG.Claim = {
    BASE_REWARD: 10,
    FOUNDER_BONUS: 0.5,
    STREAK_MULTIPLIERS: { 7: 1.2, 14: 1.5, 30: 2.0, 60: 2.5, 90: 3.0 },
    VIP_LEVELS: [
      { name: 'Bronze', icon: '\u{1F949}', minBalance: 0, multiplier: 1.0 },
      { name: 'Silver', icon: '\u{1F948}', minBalance: 500, multiplier: 1.2 },
      { name: 'Gold', icon: '\u{1F947}', minBalance: 2000, multiplier: 1.5 },
      { name: 'Diamond', icon: '\u{1F48E}', minBalance: 10000, multiplier: 2.0 },
      { name: 'Legendary', icon: '\u{1F451}', minBalance: 50000, multiplier: 3.0 }
    ],
    cooldownMs: 24 * 60 * 60 * 1000,
    lastClaim: null,
    streak: 0,
    canClaim: false,
    cooldownTimer: null,
    boostCount: 0,
    maxBoosts: 3,

    // ─────────────────────────────────
    // init
    // ─────────────────────────────────
    init: function () {
      var self = this;
      var claimBtn = document.getElementById('claimBtn');
      var boostBtn = document.getElementById('boostBtn');

      if (claimBtn) {
        claimBtn.addEventListener('click', function () {
          self.doClaim();
        });
      }

      if (boostBtn) {
        boostBtn.addEventListener('click', function () {
          self.doBoost();
        });
      }

      this.loadState();

      var uid = getUID();
      if (uid) {
        this.loadClaimHistory(uid);
        this.renderVIPLevels(this.getVIPLevel(this.getUserBalance()));
      }

      this.updateRingUI();
      this.updateStreakUI();
    },

    // ─────────────────────────────────
    // loadState
    // ─────────────────────────────────
    loadState: function () {
      var storedCooldown = loadJSON(COOLDOWN_KEY, null);
      var storedStreak = loadJSON(STREAK_KEY, 0);
      var storedBoostDate = loadJSON(BOOST_DATE_KEY, null);
      var storedBoostCount = loadJSON(BOOST_KEY, 0);
      var today = new Date().toDateString();

      this.lastClaim = storedCooldown;
      this.streak = storedStreak;

      if (storedBoostDate === today) {
        this.boostCount = storedBoostCount;
      } else {
        this.boostCount = 0;
        saveJSON(BOOST_DATE_KEY, today);
        saveJSON(BOOST_KEY, 0);
      }

      this.canClaim = this.canClaimNow();

      if (!this.canClaim && this.lastClaim) {
        this.startCooldownTimer();
      } else {
        this.updateCooldownUI();
      }

      var store = getStore();
      if (store) {
        store.setClaim({
          lastClaim: this.lastClaim,
          streakDays: this.streak,
          canClaim: this.canClaim,
          cooldownEnd: this.lastClaim ? this.lastClaim + this.cooldownMs : null
        });
      }
    },

    // ─────────────────────────────────
    // calculateReward
    // ─────────────────────────────────
    calculateReward: function () {
      var base = this.BASE_REWARD;
      var balance = this.getUserBalance();

      // Streak multiplier
      var streakMult = 1.0;
      var streakDays = this.streak;
      var multiplierKeys = Object.keys(this.STREAK_MULTIPLIERS)
        .map(Number)
        .sort(function (a, b) { return a - b; });

      for (var i = 0; i < multiplierKeys.length; i++) {
        if (streakDays >= multiplierKeys[i]) {
          streakMult = this.STREAK_MULTIPLIERS[multiplierKeys[i]];
        }
      }

      // VIP multiplier
      var vip = this.getVIPLevel(balance);
      var vipMult = vip ? vip.multiplier : 1.0;

      // Founder bonus (pre-launch only)
      var founderMult = isFounder() ? (1 + this.FOUNDER_BONUS) : 1.0;

      // Referral multiplier
      var referralMult = getReferralMultiplier();

      // Boost multiplier
      var boostMult = 1.0;

      var totalMultiplier = streakMult * vipMult * founderMult * referralMult * boostMult;
      var reward = base * totalMultiplier;
      reward = Math.floor(reward * 100) / 100;

      return {
        base: base,
        streakMultiplier: streakMult,
        vipMultiplier: vipMult,
        founderMultiplier: founderMult,
        referralMultiplier: referralMult,
        boostMultiplier: boostMult,
        totalMultiplier: totalMultiplier,
        reward: reward
      };
    },

    // ─────────────────────────────────
    // canClaimNow
    // ─────────────────────────────────
    canClaimNow: function () {
      if (!this.lastClaim) return true;
      var now = Date.now();
      return (now - this.lastClaim) >= this.cooldownMs;
    },

    // ─────────────────────────────────
    // updateCooldownUI
    // ─────────────────────────────────
    updateCooldownUI: function () {
      var cooldownEl = document.getElementById('claimCooldown');
      var claimBtn = document.getElementById('claimBtn');

      if (!cooldownEl) return;

      if (this.canClaim) {
        cooldownEl.textContent = t('claim.ready') || 'Ready to claim!';
        if (claimBtn) {
          claimBtn.disabled = false;
          claimBtn.classList.remove('btn--disabled');
          claimBtn.classList.add('btn--gold');
        }
        return;
      }

      var remaining = this.cooldownMs - (Date.now() - this.lastClaim);
      if (remaining < 0) remaining = 0;

      var hours = Math.floor(remaining / (1000 * 60 * 60));
      var minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
      var seconds = Math.floor((remaining % (1000 * 60)) / 1000);

      var timeStr = '';
      if (hours > 0) timeStr += hours + 'h ';
      timeStr += minutes + 'm ' + seconds + 's';

      cooldownEl.textContent = (t('claim.nextIn') || 'Next claim in') + ' ' + timeStr;

      if (claimBtn) {
        claimBtn.disabled = true;
        claimBtn.classList.add('btn--disabled');
        claimBtn.classList.remove('btn--gold');
      }
    },

    // ─────────────────────────────────
    // updateRingUI
    // ─────────────────────────────────
    updateRingUI: function () {
      var ringEl = document.getElementById('claimRing');
      var rewardEl = document.getElementById('claimReward');
      var ringProgress = document.getElementById('claimRingProgress');

      if (!ringEl && !ringProgress) return;

      var progress = 0;
      if (this.lastClaim) {
        var elapsed = Date.now() - this.lastClaim;
        progress = Math.min(elapsed / this.cooldownMs, 1);
      } else {
        progress = 1;
      }

      if (ringProgress) {
        var circumference = 2 * Math.PI * 58;
        var offset = circumference * (1 - progress);
        ringProgress.style.strokeDasharray = circumference;
        ringProgress.style.strokeDashoffset = offset;
      }

      var rewardData = this.calculateReward();
      if (rewardEl) {
        rewardEl.textContent = '+' + rewardData.reward.toFixed(1) + ' NDOG';
      }

      this.updateMultiplierUI(rewardData.totalMultiplier);
    },

    // ─────────────────────────────────
    // doClaim
    // ─────────────────────────────────
    doClaim: async function () {
      var self = this;
      var db = getDB();
      var uid = getUID();
      var store = getStore();

      if (!uid || !db) {
        this.showToast(t('claim.notLoggedIn') || 'Please log in first.', 'error');
        return;
      }

      // Check if user is banned
      if (store && store.user && store.user.banned) {
        this.showToast(t('claim.banned') || 'Account suspended.', 'error');
        return;
      }

      // 1. Check rate limit
      if (!this.canClaimNow()) {
        this.showToast(t('claim.cooldown') || 'Please wait for cooldown to finish.', 'warning');
        return;
      }

      // Disable button
      var claimBtn = document.getElementById('claimBtn');
      if (claimBtn) {
        claimBtn.disabled = true;
        claimBtn.textContent = t('claim.claiming') || 'Claiming...';
      }

      try {
        // 2. Calculate reward
        var rewardData = this.calculateReward();
        var amount = rewardData.reward;

        // 3. Write claim to Firebase /claims/{uid}
        var claimRef = db.ref('claims/' + uid).push();
        await claimRef.set({
          amount: amount,
          timestamp: Date.now(),
          streak: self.streak,
          multiplier: rewardData.totalMultiplier,
          baseReward: rewardData.base,
          streakMult: rewardData.streakMultiplier,
          vipMult: rewardData.vipMultiplier,
          founderMult: rewardData.founderMultiplier,
          referralMult: rewardData.referralMultiplier
        });

        // 4. Update user balance (transaction)
        var userRef = db.ref('users/' + uid + '/balance');
        await userRef.transaction(function (currentBalance) {
          return (currentBalance || 0) + amount;
        });

        // 5. Update streak counter
        var now = Date.now();
        var lastClaimTs = loadJSON(LAST_CLAIM_KEY, 0);
        var oneDayMs = 24 * 60 * 60 * 1000;

        if (lastClaimTs && (now - lastClaimTs) <= oneDayMs * 1.5) {
          // Consecutive day — increment streak
          self.streak += 1;
        } else if (lastClaimTs && (now - lastClaimTs) > oneDayMs * 1.5) {
          // Streak broken — reset
          self.streak = 1;
        } else {
          // First claim
          self.streak = 1;
        }

        // Update streak in Firebase
        await db.ref('users/' + uid + '/totalClaims').transaction(function (count) {
          return (count || 0) + 1;
        });
        await db.ref('users/' + uid + '/streakDays').set(self.streak);

        // 6. Update loyalty/community scores
        var loyaltyIncrement = Math.floor(amount * 0.5);
        var communityIncrement = 1;

        await db.ref('users/' + uid + '/loyaltyScore').transaction(function (score) {
          return (score || 0) + loyaltyIncrement;
        });
        await db.ref('users/' + uid + '/communityScore').transaction(function (score) {
          return (score || 0) + communityIncrement;
        });

        // 7. Update leaderboard
        try {
          var balanceSnapshot = await db.ref('users/' + uid + '/balance').once('value');
          var newBalance = balanceSnapshot.val() || 0;
          await db.ref('leaderboards/global/' + uid).set({
            displayName: (store && store.user && store.user.displayName) || 'Anonymous',
            photoURL: (store && store.user && store.user.photoURL) || null,
            balance: newBalance,
            updatedAt: Date.now()
          });
        } catch (lbErr) {
          console.warn('[Claim] Leaderboard update failed:', lbErr);
        }

        // 8. Update local state
        self.lastClaim = now;
        self.canClaim = false;
        saveJSON(COOLDOWN_KEY, now);
        saveJSON(STREAK_KEY, self.streak);
        saveJSON(LAST_CLAIM_KEY, now);

        if (store) {
          store.setClaim({
            lastClaim: now,
            streakDays: self.streak,
            canClaim: false,
            cooldownEnd: now + self.cooldownMs
          });
          store.addBalance(amount);
          store.incrementClaims();
        }

        // 9. Show success notification
        self.showToast(
          (t('claim.success') || 'Claimed') + ' +' + amount.toFixed(1) + ' NDOG! \u{1F389}',
          'success'
        );

        // Trigger confetti animation if available
        if (window.NDOG && window.NDOG.Utils && window.NDOG.Utils.confetti) {
          window.NDOG.Utils.confetti();
        }

        // 10. Refresh UI
        self.updateCooldownUI();
        self.updateRingUI();
        self.updateStreakUI();
        self.startCooldownTimer();

        // Check for mission completions
        if (window.NDOG && window.NDOG.Missions) {
          window.NDOG.Missions.checkMissionCompletion(uid, 'claim');
        }

        // Fire analytics event
        if (window.NDOG && window.NDOG.Analytics) {
          window.NDOG.Analytics.trackEvent('claim_completed', {
            amount: amount,
            streak: self.streak,
            multiplier: rewardData.totalMultiplier
          });
        }

        // Load updated history
        self.loadClaimHistory(uid);

        // Refresh VIP display
        self.renderVIPLevels(self.getVIPLevel(self.getUserBalance()));

      } catch (error) {
        console.error('[Claim] Error during claim:', error);
        self.showToast(t('claim.error') || 'Failed to claim. Please try again.', 'error');
      } finally {
        if (claimBtn) {
          claimBtn.disabled = !self.canClaim;
          claimBtn.textContent = t('claim.claim') || 'Claim NDOG';
        }
      }
    },

    // ─────────────────────────────────
    // doBoost
    // ─────────────────────────────────
    doBoost: async function () {
      var self = this;
      var db = getDB();
      var uid = getUID();
      var store = getStore();

      if (!uid || !db) {
        this.showToast(t('claim.notLoggedIn') || 'Please log in first.', 'error');
        return;
      }

      // 1. Check boost availability
      if (self.boostCount >= self.maxBoosts) {
        self.showToast(
          (t('claim.boostMax') || 'Boost limit reached') + ' (' + self.maxBoosts + '/' + self.maxBoosts + ')',
          'warning'
        );
        return;
      }

      var boostBtn = document.getElementById('boostBtn');
      if (boostBtn) {
        boostBtn.disabled = true;
        boostBtn.textContent = t('claim.boosting') || 'Boosting...';
      }

      try {
        // 2. Calculate boost amount (random 5-20 NDOG)
        var boostAmount = Math.floor(Math.random() * 16) + 5;
        boostAmount = Math.round(boostAmount * 10) / 10;

        // 3. Add to balance
        await db.ref('users/' + uid + '/balance').transaction(function (currentBalance) {
          return (currentBalance || 0) + boostAmount;
        });

        // Record boost transaction
        var txRef = db.ref('transactions/' + uid).push();
        await txRef.set({
          type: 'boost',
          amount: boostAmount,
          timestamp: Date.now(),
          description: 'Mining boost #' + (self.boostCount + 1)
        });

        // 4. Update boost count
        self.boostCount += 1;
        saveJSON(BOOST_KEY, self.boostCount);

        if (store) {
          store.addBalance(boostAmount);
          store.setMining({ boostCount: self.boostCount });
        }

        // 5. Show success
        self.showToast(
          (t('claim.boostSuccess') || 'Boosted') + ' +' + boostAmount + ' NDOG! \u{26A1}',
          'success'
        );

        // 6. Update UI
        self.updateBoostUI();

        // Analytics
        if (window.NDOG && window.NDOG.Analytics) {
          window.NDOG.Analytics.trackEvent('boost_used', {
            amount: boostAmount,
            boostNumber: self.boostCount
          });
        }

      } catch (error) {
        console.error('[Claim] Boost error:', error);
        self.showToast(t('claim.boostError') || 'Boost failed. Please try again.', 'error');
      } finally {
        if (boostBtn) {
          boostBtn.disabled = self.boostCount >= self.maxBoosts;
          boostBtn.textContent = t('claim.boost') || 'Boost Mining';
        }
      }
    },

    // ─────────────────────────────────
    // loadClaimHistory
    // ─────────────────────────────────
    loadClaimHistory: function (uid) {
      var self = this;
      var db = getDB();
      if (!uid || !db) return;

      var claimsRef = db.ref('claims/' + uid).orderByChild('timestamp').limitToLast(30);
      claimsRef.once('value', function (snapshot) {
        var claims = [];
        if (snapshot.exists()) {
          var data = snapshot.val();
          var keys = Object.keys(data);
          for (var i = 0; i < keys.length; i++) {
            var claim = data[keys[i]];
            claim.id = keys[i];
            claims.push(claim);
          }
          claims.reverse();
        }
        self.renderHistory(claims);
      }).catch(function (err) {
        console.error('[Claim] Failed to load history:', err);
      });
    },

    // ─────────────────────────────────
    // renderHistory
    // ─────────────────────────────────
    renderHistory: function (claims) {
      var container = document.getElementById('claimHistory');
      if (!container) return;

      if (!claims || claims.length === 0) {
        container.innerHTML =
          '<div class="claim-history__empty">' +
            '<p>' + (t('claim.noHistory') || 'No claims yet. Start mining!') + '</p>' +
          '</div>';
        return;
      }

      var html = '';
      for (var i = 0; i < claims.length; i++) {
        var c = claims[i];
        var date = new Date(c.timestamp);
        var dateStr = date.toLocaleDateString('en-US', {
          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });
        var streakLabel = c.streak > 0 ? ' \u{1F525} ' + c.streak + 'd' : '';

        html +=
          '<div class="claim-history__item">' +
            '<div class="claim-history__icon">\u{1F48E}</div>' +
            '<div class="claim-history__info">' +
              '<div class="claim-history__amount">+' + (c.amount || 0).toFixed(1) + ' NDOG' + streakLabel + '</div>' +
              '<div class="claim-history__date">' + dateStr + '</div>' +
            '</div>' +
            (c.multiplier && c.multiplier > 1
              ? '<div class="claim-history__mult">' + c.multiplier.toFixed(1) + 'x</div>'
              : '') +
          '</div>';
      }

      container.innerHTML = html;
    },

    // ─────────────────────────────────
    // getVIPLevel
    // ─────────────────────────────────
    getVIPLevel: function (balance) {
      if (typeof balance !== 'number') balance = 0;
      var levels = this.VIP_LEVELS;
      var current = levels[0];
      for (var i = 0; i < levels.length; i++) {
        if (balance >= levels[i].minBalance) {
          current = levels[i];
        }
      }
      return current;
    },

    // ─────────────────────────────────
    // renderVIPLevels
    // ─────────────────────────────────
    renderVIPLevels: function (currentLevel) {
      var container = document.getElementById('vipLevels');
      if (!container) return;

      var levels = this.VIP_LEVELS;
      var html = '';

      for (var i = 0; i < levels.length; i++) {
        var lvl = levels[i];
        var isCurrent = currentLevel && lvl.name === currentLevel.name;
        var isLocked = !currentLevel || lvl.minBalance > (currentLevel.minBalance || 0);
        var nextUp = false;

        if (currentLevel) {
          var currentIdx = levels.indexOf(currentLevel);
          nextUp = i === currentIdx + 1;
        }

        var classes = 'vip-card';
        if (isCurrent) classes += ' vip-card--active';
        if (nextUp) classes += ' vip-card--next';
        if (isLocked && !isCurrent && !nextUp) classes += ' vip-card--locked';

        html +=
          '<div class="' + classes + '" data-vip="' + lvl.name + '">' +
            '<div class="vip-card__icon">' + lvl.icon + '</div>' +
            '<div class="vip-card__name">' + lvl.name + '</div>' +
            '<div class="vip-card__mult">' + lvl.multiplier.toFixed(1) + 'x</div>' +
            '<div class="vip-card__req">' + (lvl.minBalance === 0 ? 'Default' : lvl.minBalance.toLocaleString() + ' NDOG') + '</div>' +
          '</div>';
      }

      container.innerHTML = html;
    },

    // ─────────────────────────────────
    // startCooldownTimer
    // ─────────────────────────────────
    startCooldownTimer: function () {
      var self = this;
      this.stopCooldownTimer();

      this.cooldownTimer = setInterval(function () {
        if (self.canClaimNow()) {
          self.canClaim = true;
          self.stopCooldownTimer();
          self.updateCooldownUI();
          self.updateRingUI();

          var store = getStore();
          if (store) {
            store.setCanClaim(true);
          }
        } else {
          self.updateCooldownUI();
          self.updateRingUI();
        }
      }, 1000);
    },

    // ─────────────────────────────────
    // stopCooldownTimer
    // ─────────────────────────────────
    stopCooldownTimer: function () {
      if (this.cooldownTimer) {
        clearInterval(this.cooldownTimer);
        this.cooldownTimer = null;
      }
    },

    // ─────────────────────────────────
    // updateStreakUI
    // ─────────────────────────────────
    updateStreakUI: function () {
      var streakEl = document.getElementById('claimStreak');
      var streakFireEl = document.getElementById('claimStreakFire');

      if (streakEl) {
        streakEl.textContent = this.streak + (t('claim.days') || ' days');
      }

      if (streakFireEl) {
        if (this.streak >= 7) {
          streakFireEl.style.display = 'inline';
          streakFireEl.textContent = '\u{1F525}'.repeat(Math.min(Math.floor(this.streak / 7), 5));
        } else {
          streakFireEl.style.display = 'none';
        }
      }

      // Show streak milestone badges
      var milestones = Object.keys(this.STREAK_MULTIPLIERS).map(Number).sort(function (a, b) { return a - b; });
      var nextMilestone = null;
      for (var i = 0; i < milestones.length; i++) {
        if (this.streak < milestones[i]) {
          nextMilestone = milestones[i];
          break;
        }
      }

      var milestoneEl = document.getElementById('claimNextMilestone');
      if (milestoneEl && nextMilestone) {
        var nextMult = this.STREAK_MULTIPLIERS[nextMilestone];
        milestoneEl.textContent =
          (t('claim.nextMilestone') || 'Next') + ': ' + nextMilestone + 'd (' + nextMult.toFixed(1) + 'x)';
      } else if (milestoneEl) {
        milestoneEl.textContent = t('claim.maxStreak') || 'Max streak bonus!';
      }
    },

    // ─────────────────────────────────
    // updateMultiplierUI
    // ─────────────────────────────────
    updateMultiplierUI: function (mult) {
      var multEl = document.getElementById('claimMultiplier');
      if (!multEl) return;

      var rounded = Math.round(mult * 100) / 100;
      multEl.textContent = rounded.toFixed(1) + 'x';

      // Color based on multiplier value
      multEl.classList.remove('mult-low', 'mult-mid', 'mult-high', 'mult-legendary');
      if (rounded >= 3.0) {
        multEl.classList.add('mult-legendary');
      } else if (rounded >= 2.0) {
        multEl.classList.add('mult-high');
      } else if (rounded >= 1.5) {
        multEl.classList.add('mult-mid');
      } else {
        multEl.classList.add('mult-low');
      }
    },

    // ─────────────────────────────────
    // updateBoostUI
    // ─────────────────────────────────
    updateBoostUI: function () {
      var boostCountEl = document.getElementById('boostCount');
      var boostBtn = document.getElementById('boostBtn');

      if (boostCountEl) {
        boostCountEl.textContent = (this.maxBoosts - this.boostCount) + '/' + this.maxBoosts;
      }

      if (boostBtn) {
        if (this.boostCount >= this.maxBoosts) {
          boostBtn.disabled = true;
          boostBtn.classList.add('btn--disabled');
        } else {
          boostBtn.disabled = false;
          boostBtn.classList.remove('btn--disabled');
        }
      }
    },

    // ─────────────────────────────────
    // Helper: get user balance
    // ─────────────────────────────────
    getUserBalance: function () {
      var store = getStore();
      if (store && store.user) {
        return store.user.balance || 0;
      }
      return 0;
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
        console.log('[NDOG Claim]', message);
      }
    },

    // ─────────────────────────────────
    // destroy — cleanup
    // ─────────────────────────────────
    destroy: function () {
      this.stopCooldownTimer();
    }
  };
})();

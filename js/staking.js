/**
 * ═══════════════════════════════════════════════════════════════════
 * NDOG Staking Module — Staking, Unstaking, Compounding
 * ═══════════════════════════════════════════════════════════════════
 * Manages staking plans, active stakes, pending rewards calculation,
 * unstaking (with period validation), reward claims, and compounding.
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

  // ── Number formatting ──
  function formatNumber(num, decimals) {
    if (num === null || num === undefined) return '0';
    var d = typeof decimals === 'number' ? decimals : 2;
    return Number(num).toFixed(d);
  }

  // ── Pending rewards updater interval ──
  var _pendingInterval = null;

  // ═══════════════════════════════════════════
  // STAKING MODULE
  // ═══════════════════════════════════════════
  window.NDOG.Staking = {
    plans: [
      { id: '30d',  period: 30,  apr: 5,  label: '30 Days'  },
      { id: '90d',  period: 90,  apr: 10, label: '90 Days'  },
      { id: '180d', period: 180, apr: 15, label: '180 Days' },
      { id: '365d', period: 365, apr: 25, label: '365 Days' }
    ],
    selectedPlan: null,
    stakes: [],

    // ─────────────────────────────────
    // init
    // ─────────────────────────────────
    init: function () {
      var self = this;

      // Render plan cards
      this.renderPlans();

      // Plan selection listeners
      var planCards = document.querySelectorAll('[data-stake-plan]');
      for (var i = 0; i < planCards.length; i++) {
        planCards[i].addEventListener('click', function (e) {
          var card = e.currentTarget;
          var planId = card.getAttribute('data-stake-plan');
          var plan = self.getPlanById(planId);
          if (plan) {
            self.selectPlan(plan);
          }
        });
      }

      // Stake button
      var stakeBtn = document.getElementById('stakeNowBtn');
      if (stakeBtn) {
        stakeBtn.addEventListener('click', function () {
          self.stake();
        });
      }

      // Amount input listener — live APR calculation
      var amountInput = document.getElementById('stakeAmount');
      if (amountInput) {
        amountInput.addEventListener('input', function () {
          self.updateEstimateUI();
        });
      }

      // Load existing stakes
      var uid = getUID();
      if (uid) {
        this.loadStakes(uid);
        this.loadStakingBalance(uid);
      }

      // Start pending rewards updater
      this.startPendingUpdater();
    },

    // ─────────────────────────────────
    // renderPlans
    // ─────────────────────────────────
    renderPlans: function () {
      var container = document.getElementById('stakingPlans');
      if (!container) return;

      var html = '';
      for (var i = 0; i < this.plans.length; i++) {
        var plan = this.plans[i];

        html +=
          '<div class="stake-plan" data-stake-plan="' + plan.id + '">' +
            '<div class="stake-plan__period">' + plan.label + '</div>' +
            '<div class="stake-plan__apr">' + plan.apr + '% APR</div>' +
            '<div class="stake-plan__daily">' +
              (plan.apr / 365).toFixed(2) + '% ' + (t('staking.daily') || 'daily') +
            '</div>' +
          '</div>';
      }

      container.innerHTML = html;
    },

    // ─────────────────────────────────
    // getPlanById
    // ─────────────────────────────────
    getPlanById: function (planId) {
      for (var i = 0; i < this.plans.length; i++) {
        if (this.plans[i].id === planId) return this.plans[i];
      }
      return null;
    },

    // ─────────────────────────────────
    // selectPlan
    // ─────────────────────────────────
    selectPlan: function (plan) {
      this.selectedPlan = plan;

      // Highlight selected plan card
      var planCards = document.querySelectorAll('[data-stake-plan]');
      for (var i = 0; i < planCards.length; i++) {
        var card = planCards[i];
        if (card.getAttribute('data-stake-plan') === plan.id) {
          card.classList.add('stake-plan--selected');
        } else {
          card.classList.remove('stake-plan--selected');
        }
      }

      // Update summary
      var summaryEl = document.getElementById('stakeSummary');
      if (summaryEl) {
        summaryEl.textContent =
          plan.label + ' \u00B7 ' + plan.apr + '% APR';
      }

      // Enable stake button if amount entered
      var amountInput = document.getElementById('stakeAmount');
      var stakeBtn = document.getElementById('stakeNowBtn');
      if (stakeBtn && amountInput) {
        stakeBtn.disabled = !(parseFloat(amountInput.value) > 0 && this.selectedPlan);
      }

      // Update estimate
      this.updateEstimateUI();
    },

    // ─────────────────────────────────
    // calculateAPR
    // ─────────────────────────────────
    calculateAPR: function (amount, plan) {
      if (!amount || !plan) return 0;
      var rewards = amount * (plan.apr / 100) * (plan.period / 365);
      return Math.floor(rewards * 100) / 100;
    },

    // ─────────────────────────────────
    // updateEstimateUI
    // ─────────────────────────────────
    updateEstimateUI: function () {
      var amountInput = document.getElementById('stakeAmount');
      var estimateEl = document.getElementById('stakeEstimate');

      if (!amountInput || !estimateEl) return;

      var amount = parseFloat(amountInput.value) || 0;
      if (!this.selectedPlan || amount <= 0) {
        estimateEl.textContent = (t('staking.enterAmount') || 'Enter amount & select plan');
        return;
      }

      var totalRewards = this.calculateAPR(amount, this.selectedPlan);
      var dailyRewards = totalRewards / this.selectedPlan.period;

      estimateEl.textContent =
        (t('staking.estimated') || 'Estimated earnings') + ': +' +
        formatNumber(totalRewards) + ' NDOG (' +
        formatNumber(dailyRewards) + ' ' + (t('staking.perDay') || '/day') + ')';
    },

    // ─────────────────────────────────
    // stake
    // ─────────────────────────────────
    stake: async function () {
      var self = this;
      var db = getDB();
      var uid = getUID();
      var store = getStore();

      if (!uid || !db) {
        this.showToast(t('staking.notLoggedIn') || 'Please log in first.', 'error');
        return;
      }

      if (!this.selectedPlan) {
        this.showToast(t('staking.selectPlan') || 'Please select a staking plan.', 'warning');
        return;
      }

      var amountInput = document.getElementById('stakeAmount');
      var amount = parseFloat(amountInput ? amountInput.value : '0');

      if (!amount || amount <= 0) {
        this.showToast(t('staking.enterValidAmount') || 'Please enter a valid amount.', 'warning');
        return;
      }

      // Check minimum stake
      var MIN_STAKE = 10;
      if (amount < MIN_STAKE) {
        this.showToast(
          (t('staking.minStake') || 'Minimum stake') + ': ' + MIN_STAKE + ' NDOG',
          'warning'
        );
        return;
      }

      // Check balance
      var userBalance = (store && store.user) ? (store.user.balance || 0) : 0;
      if (amount > userBalance) {
        this.showToast(t('staking.insufficientBalance') || 'Insufficient balance.', 'error');
        return;
      }

      // Check banned
      if (store && store.user && store.user.banned) {
        this.showToast(t('staking.banned') || 'Account suspended.', 'error');
        return;
      }

      // Disable UI
      var stakeBtn = document.getElementById('stakeNowBtn');
      if (stakeBtn) {
        stakeBtn.disabled = true;
        stakeBtn.textContent = t('staking.staking') || 'Staking...';
      }

      try {
        var plan = this.selectedPlan;
        var now = Date.now();
        var endDate = now + (plan.period * 24 * 60 * 60 * 1000);

        // Create stake entry
        var stakeRef = db.ref('staking/' + uid).push();
        var stakeId = stakeRef.key;

        await stakeRef.set({
          amount: amount,
          lockPeriod: plan.period,
          apr: plan.apr,
          startDate: now,
          endDate: endDate,
          status: 'active',
          rewardsClaimed: 0,
          planId: plan.id,
          createdAt: now
        });

        // Deduct from balance
        await db.ref('users/' + uid + '/balance').transaction(function (currentBalance) {
          var bal = currentBalance || 0;
          if (bal < amount) return; // Abort transaction
          return bal - amount;
        });

        // Add to staking balance
        await db.ref('users/' + uid + '/stakingBalance').transaction(function (stakingBal) {
          return (stakingBal || 0) + amount;
        });

        // Record transaction
        var txRef = db.ref('transactions/' + uid).push();
        await txRef.set({
          type: 'stake',
          amount: amount,
          planId: plan.id,
          lockPeriod: plan.period,
          apr: plan.apr,
          timestamp: now,
          description: 'Staked ' + amount + ' NDOG for ' + plan.label
        });

        // Update local store
        if (store) {
          store.addBalance(-amount);
        }

        // Show success
        this.showToast(
          (t('staking.stakeSuccess') || 'Staked successfully') + ': ' +
          formatNumber(amount) + ' NDOG for ' + plan.label + ' \u{1F3D6}\u{FE0F}',
          'success'
        );

        // Reset form
        if (amountInput) amountInput.value = '';
        this.selectedPlan = null;
        var planCards = document.querySelectorAll('[data-stake-plan]');
        for (var i = 0; i < planCards.length; i++) {
          planCards[i].classList.remove('stake-plan--selected');
        }

        // Reload stakes
        this.loadStakes(uid);
        this.loadStakingBalance(uid);

        // Analytics
        if (window.NDOG && window.NDOG.Analytics) {
          window.NDOG.Analytics.trackEvent('stake_created', {
            amount: amount,
            planId: plan.id,
            period: plan.period,
            apr: plan.apr
          });
        }

      } catch (error) {
        console.error('[Staking] Failed to stake:', error);
        this.showToast(t('staking.stakeError') || 'Staking failed. Please try again.', 'error');
      } finally {
        if (stakeBtn) {
          stakeBtn.disabled = false;
          stakeBtn.textContent = t('staking.stakeNow') || 'Stake Now';
        }
      }
    },

    // ─────────────────────────────────
    // unstake
    // ─────────────────────────────────
    unstake: async function (stakeId) {
      var self = this;
      var db = getDB();
      var uid = getUID();
      var store = getStore();

      if (!uid || !db || !stakeId) return;

      var stake = this.findStake(stakeId);
      if (!stake) {
        this.showToast(t('staking.stakeNotFound') || 'Stake not found.', 'error');
        return;
      }

      var now = Date.now();

      // Check if period has ended
      if (now < stake.endDate) {
        var remainingMs = stake.endDate - now;
        var remainingDays = Math.ceil(remainingMs / (24 * 60 * 60 * 1000));
        this.showToast(
          (t('staking.lockPeriod') || 'Lock period active') + ': ' +
          remainingDays + ' ' + (t('staking.daysRemaining') || 'days remaining'),
          'warning'
        );
        return;
      }

      if (!confirm(t('staking.confirmUnstake') || 'Unstake this position? Principal + rewards will be returned.')) {
        return;
      }

      try {
        var pendingRewards = this.calculatePendingRewards(stake);
        var totalReturn = stake.amount + pendingRewards;

        // Update stake status
        await db.ref('staking/' + uid + '/' + stakeId).update({
          status: 'unstaking',
          unstakedAt: now,
          totalRewards: pendingRewards,
          totalReturn: totalReturn
        });

        // Return principal + rewards to balance
        await db.ref('users/' + uid + '/balance').transaction(function (currentBalance) {
          return (currentBalance || 0) + totalReturn;
        });

        // Remove from staking balance
        await db.ref('users/' + uid + '/stakingBalance').transaction(function (stakingBal) {
          return Math.max((stakingBal || 0) - stake.amount, 0);
        });

        // Record transaction
        var txRef = db.ref('transactions/' + uid).push();
        await txRef.set({
          type: 'unstake',
          stakeId: stakeId,
          principal: stake.amount,
          rewards: pendingRewards,
          totalReturn: totalReturn,
          timestamp: now,
          description: 'Unstaked ' + formatNumber(totalReturn) + ' NDOG'
        });

        // Update local store
        if (store) {
          store.addBalance(totalReturn);
        }

        this.showToast(
          (t('staking.unstakeSuccess') || 'Unstaked') + ': ' +
          formatNumber(totalReturn) + ' NDOG returned \u{1F4B0}',
          'success'
        );

        // Reload
        this.loadStakes(uid);
        this.loadStakingBalance(uid);

        // Analytics
        if (window.NDOG && window.NDOG.Analytics) {
          window.NDOG.Analytics.trackEvent('stake_unstaked', {
            stakeId: stakeId,
            principal: stake.amount,
            rewards: pendingRewards,
            totalReturn: totalReturn
          });
        }

      } catch (error) {
        console.error('[Staking] Unstake failed:', error);
        this.showToast(t('staking.unstakeError') || 'Unstaking failed. Please try again.', 'error');
      }
    },

    // ─────────────────────────────────
    // claimRewards
    // ─────────────────────────────────
    claimRewards: async function (stakeId) {
      var self = this;
      var db = getDB();
      var uid = getUID();
      var store = getStore();

      if (!uid || !db || !stakeId) return;

      var stake = this.findStake(stakeId);
      if (!stake) return;

      var pendingRewards = this.calculatePendingRewards(stake);
      if (pendingRewards <= 0.01) {
        this.showToast(t('staking.noRewards') || 'No rewards to claim.', 'info');
        return;
      }

      try {
        // Reset start for rewards calculation (shift the reward base)
        var now = Date.now();
        await db.ref('staking/' + uid + '/' + stakeId).update({
          rewardsClaimed: (stake.rewardsClaimed || 0) + pendingRewards,
          rewardsLastClaimed: now,
          rewardStartDate: now // Reset reward accumulation start
        });

        // Add rewards to balance
        await db.ref('users/' + uid + '/balance').transaction(function (currentBalance) {
          return (currentBalance || 0) + pendingRewards;
        });

        // Record transaction
        var txRef = db.ref('transactions/' + uid).push();
        await txRef.set({
          type: 'staking_reward',
          stakeId: stakeId,
          amount: pendingRewards,
          timestamp: now,
          description: 'Staking rewards claimed'
        });

        // Update local store
        if (store) {
          store.addBalance(pendingRewards);
        }

        this.showToast(
          (t('staking.rewardsClaimed') || 'Rewards claimed') + ': +' +
          formatNumber(pendingRewards) + ' NDOG \u{1F389}',
          'success'
        );

        this.loadStakes(uid);

        // Analytics
        if (window.NDOG && window.NDOG.Analytics) {
          window.NDOG.Analytics.trackEvent('staking_rewards_claimed', {
            stakeId: stakeId,
            amount: pendingRewards
          });
        }

      } catch (error) {
        console.error('[Staking] Claim rewards failed:', error);
        this.showToast(t('staking.claimError') || 'Failed to claim rewards.', 'error');
      }
    },

    // ─────────────────────────────────
    // compound
    // ─────────────────────────────────
    compound: async function (stakeId) {
      var self = this;
      var db = getDB();
      var uid = getUID();
      var store = getStore();

      if (!uid || !db || !stakeId) return;

      var stake = this.findStake(stakeId);
      if (!stake) return;

      var pendingRewards = this.calculatePendingRewards(stake);
      if (pendingRewards <= 0.01) {
        this.showToast(t('staking.noRewardsCompound') || 'No rewards to compound.', 'info');
        return;
      }

      try {
        var now = Date.now();
        var newAmount = stake.amount + pendingRewards;

        // Update stake with compounded amount
        await db.ref('staking/' + uid + '/' + stakeId).update({
          amount: newAmount,
          rewardsClaimed: (stake.rewardsClaimed || 0) + pendingRewards,
          rewardsLastClaimed: now,
          rewardStartDate: now,
          compoundedAt: now
        });

        // Add to staking balance (since principal increased)
        await db.ref('users/' + uid + '/stakingBalance').transaction(function (stakingBal) {
          return (stakingBal || 0) + pendingRewards;
        });

        // Record transaction
        var txRef = db.ref('transactions/' + uid).push();
        await txRef.set({
          type: 'compound',
          stakeId: stakeId,
          amount: pendingRewards,
          newTotal: newAmount,
          timestamp: now,
          description: 'Rewards compounded into staking'
        });

        this.showToast(
          (t('staking.compoundSuccess') || 'Compounded') + ': +' +
          formatNumber(pendingRewards) + ' NDOG \u{1F517}',
          'success'
        );

        this.loadStakes(uid);

        // Analytics
        if (window.NDOG && window.NDOG.Analytics) {
          window.NDOG.Analytics.trackEvent('staking_compound', {
            stakeId: stakeId,
            amount: pendingRewards,
            newTotal: newAmount
          });
        }

      } catch (error) {
        console.error('[Staking] Compound failed:', error);
        this.showToast(t('staking.compoundError') || 'Compounding failed.', 'error');
      }
    },

    // ─────────────────────────────────
    // loadStakes
    // ─────────────────────────────────
    loadStakes: function (uid) {
      var self = this;
      var db = getDB();
      if (!uid || !db) return;

      db.ref('staking/' + uid).once('value', function (snapshot) {
        var stakes = [];
        if (snapshot.exists()) {
          var data = snapshot.val();
          var keys = Object.keys(data);
          for (var i = 0; i < keys.length; i++) {
            var stake = data[keys[i]];
            stake.id = keys[i];
            stakes.push(stake);
          }
          // Sort by start date descending
          stakes.sort(function (a, b) { return (b.startDate || 0) - (a.startDate || 0); });
        }
        self.stakes = stakes;
        self.renderStakes(stakes);
      }).catch(function (err) {
        console.error('[Staking] Failed to load stakes:', err);
        self.stakes = [];
        self.renderStakes([]);
      });
    },

    // ─────────────────────────────────
    // renderStakes
    // ─────────────────────────────────
    renderStakes: function (stakes) {
      var self = this;
      var container = document.getElementById('activeStakes');
      if (!container) return;

      if (!stakes || stakes.length === 0) {
        container.innerHTML =
          '<div class="stakes__empty">' +
            '<p>' + (t('staking.noStakes') || 'No active stakes. Start staking to earn rewards!') + '</p>' +
          '</div>';
        return;
      }

      var now = Date.now();
      var html = '';

      for (var i = 0; i < stakes.length; i++) {
        var s = stakes[i];
        var isActive = s.status === 'active';
        var isCompleted = now >= s.endDate && s.status === 'active';
        var pendingRewards = isActive ? this.calculatePendingRewards(s) : 0;
        var progress = Math.min(((now - s.startDate) / (s.endDate - s.startDate)) * 100, 100);

        var classes = 'stake-card';
        if (isCompleted) classes += ' stake-card--mature';
        else if (!isActive) classes += ' stake-card--ended';

        var startDateStr = new Date(s.startDate).toLocaleDateString('en-US', {
          month: 'short', day: 'numeric'
        });
        var endDateStr = new Date(s.endDate).toLocaleDateString('en-US', {
          month: 'short', day: 'numeric', year: 'numeric'
        });

        var statusLabel = isCompleted
          ? (t('staking.matured') || 'Matured \u2714')
          : isActive
            ? (t('staking.active') || 'Active')
            : (t('staking.ended') || 'Ended');

        html +=
          '<div class="' + classes + '" data-stake-id="' + s.id + '">' +
            '<div class="stake-card__header">' +
              '<span class="stake-card__plan">' + (s.planId || '—') + '</span>' +
              '<span class="stake-card__status">' + statusLabel + '</span>' +
            '</div>' +
            '<div class="stake-card__body">' +
              '<div class="stake-card__amount">' + formatNumber(s.amount) + ' NDOG</div>' +
              '<div class="stake-card__apr">' + s.apr + '% APR</div>' +
              '<div class="stake-card__progress">' +
                '<div class="stake-card__bar">' +
                  '<div class="stake-card__fill" style="width: ' + progress.toFixed(0) + '%;"></div>' +
                '</div>' +
                '<div class="stake-card__dates">' + startDateStr + ' → ' + endDateStr + '</div>' +
              '</div>' +
            '</div>' +
            (isActive
              ? '<div class="stake-card__pending">' +
                  '<div class="stake-card__pending-label">' +
                    (t('staking.pendingRewards') || 'Pending rewards') + ':' +
                  '</div>' +
                  '<div class="stake-card__pending-value">+' + formatNumber(pendingRewards) + ' NDOG</div>' +
                '</div>' +
                '<div class="stake-card__actions">' +
                  '<button class="btn btn--ghost btn--sm" data-stake-claim="' + s.id + '">' +
                    (t('staking.claimRewards') || 'Claim') +
                  '</button>' +
                  (isCompleted
                    ? '<button class="btn btn--gold btn--sm" data-stake-unstake="' + s.id + '">' +
                        (t('staking.unstake') || 'Unstake') +
                      '</button>'
                    : '<button class="btn btn--ghost btn--sm" data-stake-compound="' + s.id + '">' +
                        (t('staking.compound') || 'Compound') +
                      '</button>'
                  ) +
                '</div>'
              : ''
            ) +
          '</div>';
      }

      container.innerHTML = html;

      // Attach action listeners
      var claimBtns = container.querySelectorAll('[data-stake-claim]');
      for (var c = 0; c < claimBtns.length; c++) {
        claimBtns[c].addEventListener('click', function (e) {
          self.claimRewards(e.currentTarget.getAttribute('data-stake-claim'));
        });
      }

      var unstakeBtns = container.querySelectorAll('[data-stake-unstake]');
      for (var u = 0; u < unstakeBtns.length; u++) {
        unstakeBtns[u].addEventListener('click', function (e) {
          self.unstake(e.currentTarget.getAttribute('data-stake-unstake'));
        });
      }

      var compoundBtns = container.querySelectorAll('[data-stake-compound]');
      for (var p = 0; p < compoundBtns.length; p++) {
        compoundBtns[p].addEventListener('click', function (e) {
          self.compound(e.currentTarget.getAttribute('data-stake-compound'));
        });
      }
    },

    // ─────────────────────────────────
    // calculatePendingRewards
    // ─────────────────────────────────
    calculatePendingRewards: function (stake) {
      if (!stake || stake.status !== 'active') return 0;

      var now = Date.now();
      var rewardStart = stake.rewardStartDate || stake.startDate;
      var elapsedMs = now - rewardStart;
      var elapsedDays = elapsedMs / (24 * 60 * 60 * 1000);

      // APR formula: rewards = principal * (apr/100) * (elapsedDays/365)
      var rewards = stake.amount * (stake.apr / 100) * (elapsedDays / 365);
      return Math.max(Math.floor(rewards * 100) / 100, 0);
    },

    // ─────────────────────────────────
    // updatePendingUI
    // ─────────────────────────────────
    updatePendingUI: function () {
      for (var i = 0; i < this.stakes.length; i++) {
        var stake = this.stakes[i];
        if (stake.status !== 'active') continue;

        var pendingRewards = this.calculatePendingRewards(stake);
        var pendingValueEl = document.querySelector(
          '[data-stake-id="' + stake.id + '"] .stake-card__pending-value'
        );
        if (pendingValueEl) {
          pendingValueEl.textContent = '+' + formatNumber(pendingRewards) + ' NDOG';
        }
      }

      // Update total pending rewards summary
      var totalPending = 0;
      for (var j = 0; j < this.stakes.length; j++) {
        if (this.stakes[j].status === 'active') {
          totalPending += this.calculatePendingRewards(this.stakes[j]);
        }
      }
      var totalEl = document.getElementById('totalPendingRewards');
      if (totalEl) {
        totalEl.textContent = formatNumber(totalPending) + ' NDOG';
      }
    },

    // ─────────────────────────────────
    // startPendingUpdater
    // ─────────────────────────────────
    startPendingUpdater: function () {
      var self = this;
      this.stopPendingUpdater();
      _pendingInterval = setInterval(function () {
        self.updatePendingUI();
      }, 30000); // Update every 30 seconds
    },

    // ─────────────────────────────────
    // stopPendingUpdater
    // ─────────────────────────────────
    stopPendingUpdater: function () {
      if (_pendingInterval) {
        clearInterval(_pendingInterval);
        _pendingInterval = null;
      }
    },

    // ─────────────────────────────────
    // loadStakingBalance
    // ─────────────────────────────────
    loadStakingBalance: function (uid) {
      var self = this;
      var db = getDB();
      if (!uid || !db) return;

      db.ref('users/' + uid + '/stakingBalance').once('value', function (snapshot) {
        var stakingBalance = snapshot.exists() ? snapshot.val() : 0;
        var el = document.getElementById('totalStakingBalance');
        if (el) {
          el.textContent = formatNumber(stakingBalance) + ' NDOG';
        }
      }).catch(function (err) {
        console.error('[Staking] Failed to load staking balance:', err);
      });
    },

    // ─────────────────────────────────
    // findStake
    // ─────────────────────────────────
    findStake: function (stakeId) {
      for (var i = 0; i < this.stakes.length; i++) {
        if (this.stakes[i].id === stakeId) return this.stakes[i];
      }
      return null;
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
        console.log('[NDOG Staking]', message);
      }
    },

    // ─────────────────────────────────
    // destroy — cleanup
    // ─────────────────────────────────
    destroy: function () {
      this.stopPendingUpdater();
      this.stakes = [];
      this.selectedPlan = null;
    }
  };
})();

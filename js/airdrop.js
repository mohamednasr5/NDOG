/**
 * ═══════════════════════════════════════════════════════════════════
 * NDOG Airdrop Module — Airdrop Task Center
 * ═══════════════════════════════════════════════════════════════════
 * Manages social airdrop tasks, verification, reward distribution,
 * and progress tracking.
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
    return window.NDOG && window.NDOG.i18n ? window.NDOG.i18n.t(key) : key;
  }

  // ── Number formatting ──
  function formatNumber(num, decimals) {
    if (num === null || num === undefined) return '0';
    var d = typeof decimals === 'number' ? decimals : 0;
    return Number(num).toFixed(d);
  }

  // ═══════════════════════════════════════════════════════
  // AIRDROP MODULE
  // ═══════════════════════════════════════════════════════
  window.NDOG.Airdrop = {
    tasks: [
      { id: 'telegram',       title: 'airdrop_telegram',       icon: '\u{1F4E8}', reward: 50,  url: 'https://t.me/NileDogsOfficial',        requiresVerification: true },
      { id: 'twitter',        title: 'airdrop_twitter',        icon: '\u{1D54F}',  reward: 50,  url: 'https://x.com/NileDogsNDOG',             requiresVerification: true },
      { id: 'youtube',        title: 'airdrop_youtube',        icon: '\u25B6\uFE0F', reward: 30,  url: 'https://youtube.com/@NileDogs',          requiresVerification: true },
      { id: 'website',        title: 'airdrop_website',        icon: '\u{1F310}', reward: 20,  url: 'https://ndogcoin.com/',                   requiresVerification: true },
      { id: 'partner',        title: 'airdrop_partner',        icon: '\u{1F91D}', reward: 30,  url: '',                                       requiresVerification: false },
      { id: 'social_share',   title: 'airdrop_social_share',   icon: '\u{1F4E4}', reward: 20,  url: '',                                       requiresVerification: false },
      { id: 'referral_bonus', title: 'airdrop_referral_bonus',  icon: '\u{1F465}', reward: 100, url: '',                                       requiresVerification: false }
    ],
    completedTasks: [],

    // ─────────────────────────────────
    // init
    // ─────────────────────────────────
    init: function () {
      var self = this;

      var uid = getUID();
      if (uid) {
        this.loadProgress(uid);
      }
    },

    // ─────────────────────────────────
    // loadProgress
    // ─────────────────────────────────
    loadProgress: function (uid) {
      var self = this;
      var db = getDB();
      if (!uid || !db) return;

      db.ref('airdrops/' + uid).once('value', function (snapshot) {
        var data = snapshot.exists() ? snapshot.val() : {};
        var completed = data.completedTasks || [];

        self.completedTasks = completed;
        self.renderTasks(completed);
        self.updateProgressBar();
      }).catch(function (err) {
        console.error('[Airdrop] Failed to load progress:', err);
        self.completedTasks = [];
        self.renderTasks([]);
        self.updateProgressBar();
      });
    },

    // ─────────────────────────────────
    // renderTasks
    // ─────────────────────────────────
    renderTasks: function (completedList) {
      var self = this;
      var container = document.getElementById('airdropTasks');
      if (!container) return;

      if (!completedList) completedList = [];

      var html = '';

      for (var i = 0; i < this.tasks.length; i++) {
        var task = this.tasks[i];
        var isCompleted = completedList.indexOf(task.id) !== -1;

        var classes = 'airdrop-task';
        if (isCompleted) classes += ' airdrop-task--done';

        var titleText = t('airdrop.' + task.title) || task.title;

        html +=
          '<div class="' + classes + '" data-task-id="' + task.id + '">' +
            '<div class="airdrop-task__icon">' + task.icon + '</div>' +
            '<div class="airdrop-task__body">' +
              '<div class="airdrop-task__title">' + titleText + '</div>' +
              '<div class="airdrop-task__reward">+' + task.reward + ' NDOG</div>' +
            '</div>' +
            '<div class="airdrop-task__action">';

        if (isCompleted) {
          html +=
              '<span class="airdrop-task__badge airdrop-task__badge--done">' +
                (t('airdrop.completed') || 'Completed') + ' \u2714' +
              '</span>';
        } else if (task.requiresVerification && task.url) {
          html +=
              '<button class="btn btn--gold btn--sm airdrop-task__btn" ' +
                'data-airdrop-task="' + task.id + '">' +
                (t('airdrop.verify') || 'Verify & Claim') +
              '</button>';
        } else {
          html +=
              '<button class="btn btn--ghost btn--sm airdrop-task__btn" ' +
                'data-airdrop-task="' + task.id + '">' +
                (t('airdrop.complete') || 'Complete') +
              '</button>';
        }

        html +=
            '</div>' +
          '</div>';
      }

      container.innerHTML = html;

      // Attach click listeners
      var taskBtns = container.querySelectorAll('.airdrop-task__btn');
      for (var b = 0; b < taskBtns.length; b++) {
        taskBtns[b].addEventListener('click', function (e) {
          var btn = e.currentTarget;
          var taskId = btn.getAttribute('data-airdrop-task');
          if (taskId) {
            self.verifyTask(taskId);
          }
        });
      }
    },

    // ─────────────────────────────────
    // verifyTask
    // ─────────────────────────────────
    verifyTask: async function (taskId) {
      var self = this;
      var db = getDB();
      var uid = getUID();
      var store = getStore();

      if (!uid || !db) {
        this.showToast(t('airdrop.notLoggedIn') || 'Please log in first.', 'error');
        return;
      }

      // Find task definition
      var task = null;
      for (var i = 0; i < this.tasks.length; i++) {
        if (this.tasks[i].id === taskId) {
          task = this.tasks[i];
          break;
        }
      }
      if (!task) return;

      // Check if already completed
      if (this.completedTasks.indexOf(taskId) !== -1) {
        this.showToast(t('airdrop.alreadyCompleted') || 'Task already completed.', 'info');
        return;
      }

      // If task has a URL, open it first
      if (task.url) {
        window.open(task.url, '_blank', 'noopener,noreferrer');
      }

      // Special handling for certain tasks
      switch (taskId) {
        case 'partner':
          var partnerCode = prompt(t('airdrop.enterPartnerCode') || 'Enter partner code:');
          if (!partnerCode || partnerCode.trim().length === 0) return;
          break;

        case 'social_share':
          var shareUrl = 'https://ndogcoin.com/?ref=' + (store && store.user ? store.user.referralCode : 'NDOG');
          if (navigator.share) {
            try {
              await navigator.share({
                title: 'NileDogs (NDOG) — Community Rewards',
                text: 'Join NileDogs and earn NDOG tokens daily! Free to join.',
                url: shareUrl
              });
            } catch (shareErr) {
              if (shareErr.name !== 'AbortError') {
                console.warn('[Airdrop] Share failed:', shareErr);
              }
            }
          } else {
            window.open('https://twitter.com/intent/tweet?text=Join%20NileDogs%20%28NDOG%29%20%E2%80%94%20Community%20Rewards%20%F0%9F%90%95&url=' + encodeURIComponent(shareUrl), '_blank', 'noopener,noreferrer');
          }
          break;

        case 'referral_bonus':
          var totalRefs = (store && store.user) ? (store.user.totalReferrals || 0) : 0;
          if (totalRefs < 1) {
            this.showToast(t('airdrop.needReferral') || 'You need at least 1 referral to claim this bonus.', 'warning');
            return;
          }
          break;
      }

      // Disable button
      var btn = document.querySelector('[data-airdrop-task="' + taskId + '"]');
      if (btn) {
        btn.disabled = true;
        btn.textContent = t('airdrop.verifying') || 'Verifying...';
      }

      try {
        // Simulate verification delay (anti-abuse)
        await new Promise(function (resolve) { setTimeout(resolve, 1500); });

        // Complete the task
        await self.completeTask(uid, taskId);

      } catch (error) {
        console.error('[Airdrop] Verification failed:', error);
        self.showToast(t('airdrop.verificationError') || 'Verification failed. Please try again.', 'error');
        if (btn) {
          btn.disabled = false;
          btn.textContent = t('airdrop.verify') || 'Verify & Claim';
        }
      }
    },

    // ─────────────────────────────────
    // completeTask
    // ─────────────────────────────────
    completeTask: async function (uid, taskId) {
      var self = this;
      var db = getDB();
      var store = getStore();

      if (!uid || !db) return;

      // Find task definition for reward
      var task = null;
      for (var i = 0; i < this.tasks.length; i++) {
        if (this.tasks[i].id === taskId) {
          task = this.tasks[i];
          break;
        }
      }
      if (!task) return;

      try {
        // Update completed tasks list in Firebase
        var completedRef = db.ref('airdrops/' + uid + '/completedTasks');
        await completedRef.transaction(function (current) {
          var list = current || [];
          if (list.indexOf(taskId) === -1) {
            list.push(taskId);
          }
          return list;
        });

        // Record individual task completion with timestamp
        await db.ref('airdrops/' + uid + '/tasks/' + taskId).set({
          completed: true,
          completedAt: Date.now(),
          reward: task.reward
        });

        // Add reward to balance
        await db.ref('users/' + uid + '/balance').transaction(function (currentBalance) {
          return (currentBalance || 0) + task.reward;
        });

        // Record transaction
        var txRef = db.ref('transactions/' + uid).push();
        await txRef.set({
          type: 'airdrop_reward',
          taskId: taskId,
          amount: task.reward,
          timestamp: Date.now(),
          description: 'Airdrop task: ' + taskId
        });

        // Update local state
        if (self.completedTasks.indexOf(taskId) === -1) {
          self.completedTasks.push(taskId);
        }

        if (store) {
          store.addBalance(task.reward);
        }

        // Show success
        self.showToast(
          (t('airdrop.taskComplete') || 'Task completed') + ': +' + task.reward + ' NDOG! \u{1F389}',
          'success'
        );

        // Refresh UI
        self.renderTasks(self.completedTasks);
        self.updateProgressBar();

        // Analytics
        if (window.NDOG && window.NDOG.Analytics) {
          window.NDOG.Analytics.trackEvent('airdrop_task_completed', {
            taskId: taskId,
            reward: task.reward,
            totalCompleted: self.completedTasks.length
          });
        }

        // Check for mission completions
        if (window.NDOG && window.NDOG.Missions) {
          window.NDOG.Missions.checkMissionCompletion(uid, 'share');
        }

      } catch (error) {
        console.error('[Airdrop] Failed to complete task:', error);
        self.showToast(t('airdrop.completeError') || 'Failed to complete task. Please try again.', 'error');
      }
    },

    // ─────────────────────────────────
    // updateProgressBar
    // ─────────────────────────────────
    updateProgressBar: function () {
      var count = this.getCompletedCount();
      var total = this.tasks.length;
      var percent = total > 0 ? (count / total) * 100 : 0;

      // Update progress bar
      var barFill = document.getElementById('airdropProgressFill');
      if (barFill) {
        barFill.style.width = percent.toFixed(0) + '%';
      }

      // Update progress label
      var label = document.getElementById('airdropProgressLabel');
      if (label) {
        label.textContent = count + ' / ' + total;
      }

      // Update total rewards earned
      var totalEarned = 0;
      for (var i = 0; i < this.tasks.length; i++) {
        if (this.completedTasks.indexOf(this.tasks[i].id) !== -1) {
          totalEarned += this.tasks[i].reward;
        }
      }

      var earnedEl = document.getElementById('airdropTotalEarned');
      if (earnedEl) {
        earnedEl.textContent = formatNumber(totalEarned) + ' NDOG';
      }

      // Update remaining rewards
      var remaining = 0;
      for (var j = 0; j < this.tasks.length; j++) {
        if (this.completedTasks.indexOf(this.tasks[j].id) === -1) {
          remaining += this.tasks[j].reward;
        }
      }

      var remainingEl = document.getElementById('airdropRemaining');
      if (remainingEl) {
        remainingEl.textContent = '+' + formatNumber(remaining) + ' NDOG';
      }

      // Check if all completed
      if (count === total && total > 0) {
        var congratsEl = document.getElementById('airdropCongrats');
        if (congratsEl) {
          congratsEl.classList.remove('hidden');
          congratsEl.textContent =
            (t('airdrop.allComplete') || 'All airdrop tasks completed!') + ' \u{1F3C6} ' +
            formatNumber(totalEarned) + ' NDOG earned!';
        }
      }
    },

    // ─────────────────────────────────
    // getCompletedCount
    // ─────────────────────────────────
    getCompletedCount: function () {
      return this.completedTasks.length;
    },

    // ─────────────────────────────────
    // getTotalRewards
    // ─────────────────────────────────
    getTotalRewards: function () {
      var total = 0;
      for (var i = 0; i < this.tasks.length; i++) {
        total += this.tasks[i].reward;
      }
      return total;
    },

    // ─────────────────────────────────
    // getEarnedRewards
    // ─────────────────────────────────
    getEarnedRewards: function () {
      var earned = 0;
      for (var i = 0; i < this.tasks.length; i++) {
        if (this.completedTasks.indexOf(this.tasks[i].id) !== -1) {
          earned += this.tasks[i].reward;
        }
      }
      return earned;
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
        console.log('[NDOG Airdrop]', message);
      }
    },

    // ─────────────────────────────────
    // destroy — cleanup
    // ─────────────────────────────────
    destroy: function () {
      this.completedTasks = [];
    }
  };
})();

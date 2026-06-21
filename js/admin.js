/**
 * ═══════════════════════════════════════════════════════════════════
 * NDOG Admin Module — Admin Panel
 * ═══════════════════════════════════════════════════════════════════
 * Manages admin-only functionality: user management, news CRUD,
 * airdrop definitions, analytics overview, fraud logs, and data export.
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
  function getStore() {
    return window.NDOG && window.NDOG.Store ? window.NDOG.Store : null;
  }
  function t(key) {
    return window.NDOG && window.NDOG.i18n ? window.NDOG.i18n.t(key) : key;
  }

  // ── Number formatting ──
  function formatNumber(num) {
    if (num === null || num === undefined) return '0';
    return Math.floor(num).toLocaleString();
  }

  // ── Rank display ──
  var RANK_LABELS = {
    bronze: '\u{1F949} Bronze',
    silver: '\u{1F948} Silver',
    gold:   '\u{1F947} Gold',
    diamond: '\u{1F48E} Diamond',
    legend:  '\u{1F451} Legend'
  };

  var VALID_RANKS = ['bronze', 'silver', 'gold', 'diamond', 'legend'];

  // ═══════════════════════════════════════════
  // ADMIN MODULE
  // ═══════════════════════════════════════════
  window.NDOG.Admin = {
    activeTab: 'users',
    allUsers: [],
    searchQuery: '',

    // ─────────────────────────────────
    // init
    // ─────────────────────────────────
    init: function () {
      var self = this;

      // Check admin access
      if (!this.isAdmin()) {
        this.hideAdminPanel();
        return;
      }

      this.showAdminPanel();

      // Setup tab listeners
      var tabBtns = document.querySelectorAll('[data-admin-tab]');
      for (var i = 0; i < tabBtns.length; i++) {
        tabBtns[i].addEventListener('click', function (e) {
          var tab = e.currentTarget.getAttribute('data-admin-tab');
          if (tab) {
            self.switchTab(tab);
          }
        });
      }

      // Search listener
      var searchInput = document.getElementById('adminSearch');
      if (searchInput) {
        searchInput.addEventListener('input', function () {
          self.searchQuery = searchInput.value.trim().toLowerCase();
          self.searchUsers(self.searchQuery);
        });
      }

      // News form listener
      var newsForm = document.getElementById('adminNewsForm');
      if (newsForm) {
        newsForm.addEventListener('submit', function (e) {
          e.preventDefault();
          var title = (document.getElementById('newsTitle') || {}).value || '';
          var content = (document.getElementById('newsContent') || {}).value || '';
          var category = (document.getElementById('newsCategory') || {}).value || 'general';
          self.createNews(title, content, category);
        });
      }

      // Export button
      var exportBtn = document.getElementById('adminExportBtn');
      if (exportBtn) {
        exportBtn.addEventListener('click', function () {
          self.exportData();
        });
      }

      // Load default tab
      this.switchTab(this.activeTab);
    },

    // ─────────────────────────────────
    // isAdmin
    // ─────────────────────────────────
    isAdmin: function () {
      var store = getStore();
      if (!store || !store.auth) return false;
      return store.auth.isAdmin || store.auth.role === 'admin' || store.auth.role === 'superAdmin';
    },

    // ─────────────────────────────────
    // hideAdminPanel
    // ─────────────────────────────────
    hideAdminPanel: function () {
      var panel = document.getElementById('adminPanel');
      if (panel) panel.classList.add('hidden');

      var navItem = document.querySelector('[data-nav="admin"]');
      if (navItem) navItem.classList.add('hidden');
    },

    // ─────────────────────────────────
    // showAdminPanel
    // ─────────────────────────────────
    showAdminPanel: function () {
      var panel = document.getElementById('adminPanel');
      if (panel) panel.classList.remove('hidden');

      var navItem = document.querySelector('[data-nav="admin"]');
      if (navItem) navItem.classList.remove('hidden');
    },

    // ─────────────────────────────────
    // switchTab
    // ─────────────────────────────────
    switchTab: function (tab) {
      this.activeTab = tab;

      // Update tab buttons
      var tabBtns = document.querySelectorAll('[data-admin-tab]');
      for (var i = 0; i < tabBtns.length; i++) {
        var btn = tabBtns[i];
        if (btn.getAttribute('data-admin-tab') === tab) {
          btn.classList.add('tab--active');
        } else {
          btn.classList.remove('tab--active');
        }
      }

      // Update tab panels
      var panels = document.querySelectorAll('[data-admin-panel]');
      for (var j = 0; j < panels.length; j++) {
        var panel = panels[j];
        if (panel.getAttribute('data-admin-panel') === tab) {
          panel.classList.remove('hidden');
        } else {
          panel.classList.add('hidden');
        }
      }

      // Load tab data
      switch (tab) {
        case 'users':
          this.loadUsers();
          break;
        case 'news':
          this.loadNews();
          break;
        case 'airdrop':
          this.loadAirdropDefs();
          break;
        case 'analytics':
          this.loadAnalytics();
          break;
        case 'fraud':
          this.loadFraudLogs();
          break;
      }
    },

    // ═══════════════════════════════════════════
    // USERS MANAGEMENT
    // ═══════════════════════════════════════════

    // ─────────────────────────────────
    // loadUsers
    // ─────────────────────────────────
    loadUsers: function () {
      var self = this;
      var db = getDB();
      if (!db) return;

      var container = document.getElementById('adminUsersTable');
      if (container) {
        container.innerHTML = '<div class="admin-skeleton"><div class="admin-skeleton__row"></div><div class="admin-skeleton__row"></div><div class="admin-skeleton__row"></div></div>';
      }

      db.ref('users').once('value', function (snapshot) {
        if (!snapshot.exists()) {
          if (container) {
            container.innerHTML = '<p class="admin__empty">' + (t('admin.noUsers') || 'No users found') + '</p>';
          }
          self.allUsers = [];
          return;
        }

        var data = snapshot.val();
        var users = [];
        var keys = Object.keys(data);

        for (var i = 0; i < keys.length; i++) {
          var user = data[keys[i]];
          user.uid = keys[i];
          users.push(user);
        }

        // Sort by balance descending
        users.sort(function (a, b) { return (b.balance || 0) - (a.balance || 0); });

        self.allUsers = users;
        self.renderUsersTable(users);
      }).catch(function (err) {
        console.error('[Admin] Failed to load users:', err);
        self.allUsers = [];
        self.renderUsersTable([]);
      });
    },

    // ─────────────────────────────────
    // searchUsers
    // ─────────────────────────────────
    searchUsers: function (query) {
      if (!query || query.length === 0) {
        this.renderUsersTable(this.allUsers);
        return;
      }

      var filtered = [];
      for (var i = 0; i < this.allUsers.length; i++) {
        var user = this.allUsers[i];
        var name = (user.displayName || '').toLowerCase();
        var email = (user.email || '').toLowerCase();
        var uid = (user.uid || '').toLowerCase();

        if (name.indexOf(query) !== -1 ||
            email.indexOf(query) !== -1 ||
            uid.indexOf(query) !== -1) {
          filtered.push(user);
        }
      }

      this.renderUsersTable(filtered);
    },

    // ─────────────────────────────────
    // renderUsersTable
    // ─────────────────────────────────
    renderUsersTable: function (users) {
      var self = this;
      var container = document.getElementById('adminUsersTable');
      if (!container) return;

      if (!users || users.length === 0) {
        container.innerHTML = '<p class="admin__empty">' + (t('admin.noUsers') || 'No users found') + '</p>';
        return;
      }

      var html =
        '<div class="admin-table">' +
          '<div class="admin-table__header">' +
            '<div class="admin-table__cell admin-table__cell--sm">#</div>' +
            '<div class="admin-table__cell">' + (t('admin.user') || 'User') + '</div>' +
            '<div class="admin-table__cell">' + (t('admin.balance') || 'Balance') + '</div>' +
            '<div class="admin-table__cell">' + (t('admin.rank') || 'Rank') + '</div>' +
            '<div class="admin-table__cell">' + (t('admin.referrals') || 'Refs') + '</div>' +
            '<div class="admin-table__cell admin-table__cell--actions">' + (t('admin.actions') || 'Actions') + '</div>' +
          '</div>';

      var limit = Math.min(users.length, 100); // Show max 100 for performance
      for (var i = 0; i < limit; i++) {
        var user = users[i];
        var avatar = user.photoURL || '';
        var name = user.displayName || (t('admin.anonymous') || 'Anonymous');
        var email = user.email || '';
        var isBanned = user.banned || false;

        var rowClass = 'admin-table__row';
        if (isBanned) rowClass += ' admin-table__row--banned';

        html +=
          '<div class="' + rowClass + '" data-uid="' + user.uid + '">' +
            '<div class="admin-table__cell admin-table__cell--sm">' + (i + 1) + '</div>' +
            '<div class="admin-table__cell">' +
              '<div class="admin-table__user">' +
                (avatar ? '<img src="' + avatar + '" alt="" class="admin-table__avatar">' : '') +
                '<div>' +
                  '<div class="admin-table__name">' + name + '</div>' +
                  '<div class="admin-table__email">' + email + '</div>' +
                '</div>' +
              '</div>' +
            '</div>' +
            '<div class="admin-table__cell">' + formatNumber(user.balance || 0) + ' NDOG</div>' +
            '<div class="admin-table__cell">' + (RANK_LABELS[user.rank] || user.rank || '—') + '</div>' +
            '<div class="admin-table__cell">' + (user.totalReferrals || 0) + '</div>' +
            '<div class="admin-table__cell admin-table__cell--actions">' +
              (isBanned
                ? '<button class="btn btn--ghost btn--xs" data-admin-unban="' + user.uid + '">' + (t('admin.unban') || 'Unban') + '</button>'
                : '<button class="btn btn--danger btn--xs" data-admin-ban="' + user.uid + '">' + (t('admin.ban') || 'Ban') + '</button>'
              ) +
              '<button class="btn btn--ghost btn--xs" data-admin-edit="' + user.uid + '">' + (t('admin.edit') || 'Edit') + '</button>' +
            '</div>' +
          '</div>';
      }

      if (users.length > limit) {
        html +=
          '<div class="admin-table__footer">' +
            (t('admin.showing') || 'Showing') + ' ' + limit + ' / ' + users.length +
          '</div>';
      }

      html += '</div>';
      container.innerHTML = html;

      // Attach listeners
      var banBtns = container.querySelectorAll('[data-admin-ban]');
      for (var b = 0; b < banBtns.length; b++) {
        banBtns[b].addEventListener('click', function (e) {
          self.banUser(e.currentTarget.getAttribute('data-admin-ban'));
        });
      }

      var unbanBtns = container.querySelectorAll('[data-admin-unban]');
      for (var u = 0; u < unbanBtns.length; u++) {
        unbanBtns[u].addEventListener('click', function (e) {
          self.unbanUser(e.currentTarget.getAttribute('data-admin-unban'));
        });
      }

      var editBtns = container.querySelectorAll('[data-admin-edit]');
      for (var e = 0; e < editBtns.length; e++) {
        editBtns[e].addEventListener('click', function (e) {
          var uid2 = e.currentTarget.getAttribute('data-admin-edit');
          var user2 = self.findUser(uid2);
          if (user2) {
            self.showEditModal(uid2, user2.balance || 0, user2.rank || 'bronze');
          }
        });
      }
    },

    // ─────────────────────────────────
    // banUser
    // ─────────────────────────────────
    banUser: async function (uid) {
      var db = getDB();
      var adminUid = getUID();

      if (!uid || !db) return;

      var reason = prompt(t('admin.banReason') || 'Enter ban reason:');
      if (!reason || reason.trim().length === 0) return;

      try {
        // Mark user as banned
        await db.ref('users/' + uid + '/banned').set(true);

        // Add to banned users list
        await db.ref('bannedUsers/' + uid).set({
          reason: reason.trim(),
          bannedAt: Date.now(),
          bannedBy: adminUid
        });

        this.showToast(
          (t('admin.banSuccess') || 'User banned successfully') + '.',
          'success'
        );

        this.loadUsers();

        // Analytics
        if (window.NDOG && window.NDOG.Analytics) {
          window.NDOG.Analytics.trackEvent('admin_ban_user', {
            targetUid: uid,
            reason: reason.trim()
          });
        }

      } catch (error) {
        console.error('[Admin] Ban failed:', error);
        this.showToast(t('admin.banError') || 'Failed to ban user.', 'error');
      }
    },

    // ─────────────────────────────────
    // unbanUser
    // ─────────────────────────────────
    unbanUser: async function (uid) {
      var db = getDB();

      if (!uid || !db) return;

      try {
        await db.ref('users/' + uid + '/banned').set(false);
        await db.ref('bannedUsers/' + uid).remove();

        this.showToast(t('admin.unbanSuccess') || 'User unbanned successfully.', 'success');
        this.loadUsers();

      } catch (error) {
        console.error('[Admin] Unban failed:', error);
        this.showToast(t('admin.unbanError') || 'Failed to unban user.', 'error');
      }
    },

    // ─────────────────────────────────
    // editBalance
    // ─────────────────────────────────
    editBalance: async function (uid, newBalance) {
      var db = getDB();
      if (!uid || !db) return;

      try {
        await db.ref('users/' + uid + '/balance').set(newBalance);

        this.showToast(
          (t('admin.balanceUpdated') || 'Balance updated') + ': ' + formatNumber(newBalance) + ' NDOG',
          'success'
        );

        this.loadUsers();

        if (window.NDOG && window.NDOG.Analytics) {
          window.NDOG.Analytics.trackEvent('admin_edit_balance', {
            targetUid: uid,
            newBalance: newBalance
          });
        }

      } catch (error) {
        console.error('[Admin] Balance update failed:', error);
        this.showToast(t('admin.balanceError') || 'Failed to update balance.', 'error');
      }
    },

    // ─────────────────────────────────
    // editRank
    // ─────────────────────────────────
    editRank: async function (uid, newRank) {
      var db = getDB();
      if (!uid || !db) return;

      if (VALID_RANKS.indexOf(newRank) === -1) {
        this.showToast(t('admin.invalidRank') || 'Invalid rank.', 'error');
        return;
      }

      try {
        await db.ref('users/' + uid + '/rank').set(newRank);

        this.showToast(
          (t('admin.rankUpdated') || 'Rank updated') + ': ' + (RANK_LABELS[newRank] || newRank),
          'success'
        );

        this.loadUsers();

        if (window.NDOG && window.NDOG.Analytics) {
          window.NDOG.Analytics.trackEvent('admin_edit_rank', {
            targetUid: uid,
            newRank: newRank
          });
        }

      } catch (error) {
        console.error('[Admin] Rank update failed:', error);
        this.showToast(t('admin.rankError') || 'Failed to update rank.', 'error');
      }
    },

    // ─────────────────────────────────
    // findUser
    // ─────────────────────────────────
    findUser: function (uid) {
      for (var i = 0; i < this.allUsers.length; i++) {
        if (this.allUsers[i].uid === uid) return this.allUsers[i];
      }
      return null;
    },

    // ─────────────────────────────────
    // showEditModal
    // ─────────────────────────────────
    showEditModal: function (uid, currentBalance, currentRank) {
      var self = this;
      var modal = document.getElementById('adminEditModal');
      if (!modal) return;

      // Populate fields
      var balInput = document.getElementById('editBalance');
      var rankSelect = document.getElementById('editRank');
      var uidLabel = document.getElementById('editUid');

      if (balInput) balInput.value = currentBalance;
      if (rankSelect) rankSelect.value = currentRank;
      if (uidLabel) uidLabel.textContent = uid;

      modal.classList.remove('hidden');

      // Save button
      var saveBtn = document.getElementById('editSaveBtn');
      if (saveBtn) {
        // Remove old listeners by cloning
        var newBtn = saveBtn.cloneNode(true);
        saveBtn.parentNode.replaceChild(newBtn, saveBtn);

        newBtn.addEventListener('click', function () {
          var newBal = parseFloat(balInput ? balInput.value : '0');
          var newRank2 = rankSelect ? rankSelect.value : currentRank;

          if (isNaN(newBal) || newBal < 0) {
            self.showToast(t('admin.invalidBalance') || 'Invalid balance value.', 'error');
            return;
          }

          self.editBalance(uid, newBal);
          if (newRank2 !== currentRank) {
            self.editRank(uid, newRank2);
          }
          self.hideEditModal();
        });
      }

      // Cancel button
      var cancelBtn = document.getElementById('editCancelBtn');
      if (cancelBtn) {
        var newCancelBtn = cancelBtn.cloneNode(true);
        cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
        newCancelBtn.addEventListener('click', function () {
          self.hideEditModal();
        });
      }

      // Close on backdrop click
      var backdrop = modal.querySelector('.modal__backdrop');
      if (backdrop) {
        var newBackdrop = backdrop.cloneNode(true);
        backdrop.parentNode.replaceChild(newBackdrop, backdrop);
        newBackdrop.addEventListener('click', function () {
          self.hideEditModal();
        });
      }
    },

    // ─────────────────────────────────
    // hideEditModal
    // ─────────────────────────────────
    hideEditModal: function () {
      var modal = document.getElementById('adminEditModal');
      if (modal) modal.classList.add('hidden');
    },

    // ═══════════════════════════════════════════
    // NEWS MANAGEMENT
    // ═══════════════════════════════════════════

    // ─────────────────────────────────
    // loadNews
    // ─────────────────────────────────
    loadNews: function () {
      var self = this;
      var db = getDB();
      if (!db) return;

      db.ref('news').orderByChild('createdAt').limitToLast(50).once('value', function (snapshot) {
        var news = [];
        if (snapshot.exists()) {
          var data = snapshot.val();
          var keys = Object.keys(data);
          for (var i = 0; i < keys.length; i++) {
            var item = data[keys[i]];
            item.id = keys[i];
            news.push(item);
          }
          news.reverse();
        }
        self.renderNewsList(news);
      }).catch(function (err) {
        console.error('[Admin] Failed to load news:', err);
        self.renderNewsList([]);
      });
    },

    // ─────────────────────────────────
    // renderNewsList
    // ─────────────────────────────────
    renderNewsList: function (news) {
      var self = this;
      var container = document.getElementById('adminNewsList');
      if (!container) return;

      if (!news || news.length === 0) {
        container.innerHTML = '<p class="admin__empty">' + (t('admin.noNews') || 'No news articles') + '</p>';
        return;
      }

      var html = '';
      for (var i = 0; i < news.length; i++) {
        var item = news[i];
        var date = new Date(item.createdAt).toLocaleDateString('en-US', {
          month: 'short', day: 'numeric', year: 'numeric'
        });

        var contentPreview = (item.content || '').substring(0, 100);
        if ((item.content || '').length > 100) contentPreview += '...';

        html +=
          '<div class="news-card" data-news-id="' + item.id + '">' +
            '<div class="news-card__header">' +
              '<span class="news-card__cat">' + (item.category || 'general') + '</span>' +
              '<span class="news-card__date">' + date + '</span>' +
            '</div>' +
            '<div class="news-card__title">' + (item.title || 'Untitled') + '</div>' +
            '<div class="news-card__preview">' + contentPreview + '</div>' +
            '<div class="news-card__actions">' +
              '<button class="btn btn--danger btn--xs" data-admin-delete-news="' + item.id + '">' +
                (t('admin.delete') || 'Delete') +
              '</button>' +
            '</div>' +
          '</div>';
      }

      container.innerHTML = html;

      // Attach delete listeners
      var deleteBtns = container.querySelectorAll('[data-admin-delete-news]');
      for (var d = 0; d < deleteBtns.length; d++) {
        deleteBtns[d].addEventListener('click', function (e) {
          var newsId = e.currentTarget.getAttribute('data-admin-delete-news');
          self.deleteNews(newsId);
        });
      }
    },

    // ─────────────────────────────────
    // createNews
    // ─────────────────────────────────
    createNews: async function (title, content, category) {
      var db = getDB();
      var uid = getUID();

      if (!db || !uid) return;

      title = (title || '').trim();
      content = (content || '').trim();
      category = (category || 'general').trim();

      if (!title) {
        this.showToast(t('admin.newsTitleRequired') || 'Title is required.', 'warning');
        return;
      }
      if (!content) {
        this.showToast(t('admin.newsContentRequired') || 'Content is required.', 'warning');
        return;
      }

      try {
        var store = getStore();
        var authorName = (store && store.user && store.user.displayName) || 'Admin';

        var newsRef = db.ref('news').push();
        await newsRef.set({
          title: title,
          content: content,
          category: category,
          createdAt: Date.now(),
          author: authorName,
          authorUid: uid
        });

        this.showToast(t('admin.newsCreated') || 'News article created.', 'success');

        // Clear form
        var titleInput = document.getElementById('newsTitle');
        var contentInput = document.getElementById('newsContent');
        if (titleInput) titleInput.value = '';
        if (contentInput) contentInput.value = '';

        this.loadNews();

        if (window.NDOG && window.NDOG.Analytics) {
          window.NDOG.Analytics.trackEvent('admin_create_news', {
            category: category
          });
        }

      } catch (error) {
        console.error('[Admin] News creation failed:', error);
        this.showToast(t('admin.newsError') || 'Failed to create news.', 'error');
      }
    },

    // ─────────────────────────────────
    // deleteNews
    // ─────────────────────────────────
    deleteNews: async function (newsId) {
      var db = getDB();
      if (!db || !newsId) return;

      if (!confirm(t('admin.deleteNewsConfirm') || 'Delete this news article?')) return;

      try {
        await db.ref('news/' + newsId).remove();
        this.showToast(t('admin.newsDeleted') || 'News deleted.', 'success');
        this.loadNews();
      } catch (error) {
        console.error('[Admin] News deletion failed:', error);
        this.showToast(t('admin.deleteError') || 'Failed to delete news.', 'error');
      }
    },

    // ═══════════════════════════════════════════
    // AIRDROP MANAGEMENT
    // ═══════════════════════════════════════════

    // ─────────────────────────────────
    // loadAirdropDefs
    // ─────────────────────────────────
    loadAirdropDefs: function () {
      var db = getDB();
      if (!db) return;

      var container = document.getElementById('adminAirdropDefs');
      if (!container) return;

      // Load airdrop statistics
      db.ref('airdrops').once('value', function (snapshot) {
        if (!snapshot.exists()) {
          container.innerHTML = '<p class="admin__empty">' + (t('admin.noAirdropData') || 'No airdrop data yet') + '</p>';
          return;
        }

        var data = snapshot.val();
        var totalUsers = 0;
        var totalCompleted = 0;
        var taskStats = {};

        var uids = Object.keys(data);
        totalUsers = uids.length;

        for (var i = 0; i < uids.length; i++) {
          var userData = data[uids[i]];
          var tasks = userData.completedTasks || [];
          totalCompleted += tasks.length;

          for (var j = 0; j < tasks.length; j++) {
            var taskId = tasks[j];
            taskStats[taskId] = (taskStats[taskId] || 0) + 1;
          }
        }

        var html =
          '<div class="admin-stats">' +
            '<div class="admin-stats__item">' +
              '<div class="admin-stats__value">' + totalUsers + '</div>' +
              '<div class="admin-stats__label">' + (t('admin.airdropParticipants') || 'Participants') + '</div>' +
            '</div>' +
            '<div class="admin-stats__item">' +
              '<div class="admin-stats__value">' + totalCompleted + '</div>' +
              '<div class="admin-stats__label">' + (t('admin.airdropCompletions') || 'Task Completions') + '</div>' +
            '</div>' +
          '</div>';

        // Task breakdown
        var taskKeys = Object.keys(taskStats);
        if (taskKeys.length > 0) {
          html += '<div class="admin-task-breakdown">';
          html += '<h4>' + (t('admin.taskBreakdown') || 'Task Breakdown') + '</h4>';
          for (var k = 0; k < taskKeys.length; k++) {
            var taskId = taskKeys[k];
            html +=
              '<div class="admin-task-row">' +
                '<span class="admin-task-row__name">' + taskId + '</span>' +
                '<span class="admin-task-row__count">' + taskStats[taskId] + ' users</span>' +
              '</div>';
          }
          html += '</div>';
        }

        container.innerHTML = html;
      }).catch(function (err) {
        console.error('[Admin] Failed to load airdrop defs:', err);
      });
    },

    // ═══════════════════════════════════════════
    // ANALYTICS
    // ═══════════════════════════════════════════

    // ─────────────────────────────────
    // loadAnalytics
    // ─────────────────────────────────
    loadAnalytics: function () {
      var self = this;
      var db = getDB();
      if (!db) return;

      var container = document.getElementById('adminAnalytics');
      if (!container) {
        container.innerHTML = '<div class="admin-skeleton"><div class="admin-skeleton__row"></div><div class="admin-skeleton__row"></div></div>';
      }

      // Load multiple stats in parallel
      Promise.all([
        db.ref('users').once('value'),
        db.ref('claims').once('value'),
        db.ref('staking').once('value'),
        db.ref('analytics/summary').once('value')
      ]).then(function (results) {
        var usersSnap = results[0];
        var claimsSnap = results[1];
        var stakingSnap = results[2];
        var analyticsSnap = results[3];

        // User stats
        var totalUsers = usersSnap.exists() ? Object.keys(usersSnap.val()).length : 0;
        var totalBalance = 0;
        var totalReferrals = 0;
        var totalStaking = 0;

        if (usersSnap.exists()) {
          var usersData = usersSnap.val();
          var userKeys = Object.keys(usersData);
          for (var i = 0; i < userKeys.length; i++) {
            var u = usersData[userKeys[i]];
            totalBalance += (u.balance || 0);
            totalReferrals += (u.totalReferrals || 0);
            totalStaking += (u.stakingBalance || 0);
          }
        }

        // Claim stats
        var totalClaims = 0;
        if (claimsSnap.exists()) {
          var claimsData = claimsSnap.val();
          var claimKeys = Object.keys(claimsData);
          for (var c = 0; c < claimKeys.length; c++) {
            totalClaims += Object.keys(claimsData[claimKeys[c]]).length;
          }
        }

        // Staking stats
        var activeStakes = 0;
        var totalStakedAmount = 0;
        if (stakingSnap.exists()) {
          var stakingData = stakingSnap.val();
          var stakingKeys = Object.keys(stakingData);
          for (var s = 0; s < stakingKeys.length; s++) {
            var userStakes = stakingData[stakingKeys[s]];
            var stakeKeys = Object.keys(userStakes);
            for (var sk = 0; sk < stakeKeys.length; sk++) {
              var stake = userStakes[stakeKeys[sk]];
              if (stake.status === 'active') {
                activeStakes++;
                totalStakedAmount += (stake.amount || 0);
              }
            }
          }
        }

        // Additional analytics
        var summary = analyticsSnap.exists() ? analyticsSnap.val() : {};

        var html =
          '<div class="admin-stats-grid">' +
            // Total Users
            '<div class="admin-stat-card">' +
              '<div class="admin-stat-card__icon">\u{1F465}</div>' +
              '<div class="admin-stat-card__value">' + totalUsers + '</div>' +
              '<div class="admin-stat-card__label">' + (t('admin.totalUsers') || 'Total Users') + '</div>' +
            '</div>' +
            // Total Claims
            '<div class="admin-stat-card">' +
              '<div class="admin-stat-card__icon">\u{26CF}\u{FE0F}</div>' +
              '<div class="admin-stat-card__value">' + totalClaims + '</div>' +
              '<div class="admin-stat-card__label">' + (t('admin.totalClaims') || 'Total Claims') + '</div>' +
            '</div>' +
            // Total Balance
            '<div class="admin-stat-card">' +
              '<div class="admin-stat-card__icon">\u{1F4B0}</div>' +
              '<div class="admin-stat-card__value">' + formatNumber(totalBalance) + '</div>' +
              '<div class="admin-stat-card__label">' + (t('admin.totalSupply') || 'Total NDOG Supply') + '</div>' +
            '</div>' +
            // Total Referrals
            '<div class="admin-stat-card">' +
              '<div class="admin-stat-card__icon">\u{1F517}</div>' +
              '<div class="admin-stat-card__value">' + totalReferrals + '</div>' +
              '<div class="admin-stat-card__label">' + (t('admin.totalReferrals') || 'Total Referrals') + '</div>' +
            '</div>' +
            // Active Stakes
            '<div class="admin-stat-card">' +
              '<div class="admin-stat-card__icon">\u{1F3D6}\u{FE0F}</div>' +
              '<div class="admin-stat-card__value">' + activeStakes + '</div>' +
              '<div class="admin-stat-card__label">' + (t('admin.activeStakes') || 'Active Stakes') + '</div>' +
            '</div>' +
            // Total Staked
            '<div class="admin-stat-card">' +
              '<div class="admin-stat-card__icon">\u{1F4B3}</div>' +
              '<div class="admin-stat-card__value">' + formatNumber(totalStakedAmount) + '</div>' +
              '<div class="admin-stat-card__label">' + (t('admin.totalStaked') || 'Total Staked') + '</div>' +
            '</div>' +
          '</div>';

        if (container) container.innerHTML = html;

      }).catch(function (err) {
        console.error('[Admin] Analytics load failed:', err);
        if (container) {
          container.innerHTML = '<p class="admin__empty">' + (t('admin.analyticsError') || 'Failed to load analytics') + '</p>';
        }
      });
    },

    // ═══════════════════════════════════════════
    // FRAUD LOGS
    // ═══════════════════════════════════════════

    // ─────────────────────────────────
    // loadFraudLogs
    // ─────────────────────────────────
    loadFraudLogs: function () {
      var self = this;
      var db = getDB();
      if (!db) return;

      var container = document.getElementById('adminFraudLogs');
      if (container) {
        container.innerHTML = '<div class="admin-skeleton"><div class="admin-skeleton__row"></div><div class="admin-skeleton__row"></div></div>';
      }

      db.ref('fraudLogs').orderByChild('timestamp').limitToLast(100).once('value', function (snapshot) {
        var logs = [];
        if (snapshot.exists()) {
          var data = snapshot.val();
          var keys = Object.keys(data);
          for (var i = 0; i < keys.length; i++) {
            var log = data[keys[i]];
            log.id = keys[i];
            logs.push(log);
          }
          logs.reverse();
        }
        self.renderFraudLogs(logs);
      }).catch(function (err) {
        console.error('[Admin] Failed to load fraud logs:', err);
        self.renderFraudLogs([]);
      });
    },

    // ─────────────────────────────────
    // renderFraudLogs
    // ─────────────────────────────────
    renderFraudLogs: function (logs) {
      var container = document.getElementById('adminFraudLogs');
      if (!container) return;

      if (!logs || logs.length === 0) {
        container.innerHTML = '<p class="admin__empty">' + (t('admin.noFraudLogs') || 'No fraud logs') + ' \u2705</p>';
        return;
      }

      var html =
        '<div class="fraud-table">' +
          '<div class="fraud-table__header">' +
            '<div class="fraud-table__cell">' + (t('admin.time') || 'Time') + '</div>' +
            '<div class="fraud-table__cell">' + (t('admin.uid') || 'UID') + '</div>' +
            '<div class="fraud-table__cell">' + (t('admin.event') || 'Event') + '</div>' +
            '<div class="fraud-table__cell">' + (t('admin.details') || 'Details') + '</div>' +
          '</div>';

      var limit = Math.min(logs.length, 50);
      for (var i = 0; i < limit; i++) {
        var log = logs[i];
        var date = new Date(log.timestamp).toLocaleString('en-US', {
          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });
        var details = '';
        if (log.details && typeof log.details === 'object') {
          details = JSON.stringify(log.details).substring(0, 80);
          if (JSON.stringify(log.details).length > 80) details += '...';
        } else {
          details = String(log.details || '').substring(0, 80);
        }

        var severity = '';
        if (log.event === 'device_fingerprint_mismatch' || log.event === 'rate_limit_exceeded') {
          severity = ' fraud-table__row--danger';
        } else if (log.event === 'vpn_detected') {
          severity = ' fraud-table__row--warning';
        }

        html +=
          '<div class="fraud-table__row' + severity + '">' +
            '<div class="fraud-table__cell">' + date + '</div>' +
            '<div class="fraud-table__cell fraud-table__cell--uid">' + (log.uid || '—').substring(0, 8) + '...</div>' +
            '<div class="fraud-table__cell">' + (log.event || '—') + '</div>' +
            '<div class="fraud-table__cell">' + details + '</div>' +
          '</div>';
      }

      html += '</div>';
      container.innerHTML = html;
    },

    // ═══════════════════════════════════════════
    // EXPORT
    // ═══════════════════════════════════════════

    // ─────────────────────────────────
    // exportData
    // ─────────────────────────────────
    exportData: function () {
      var db = getDB();
      if (!db) return;

      this.showToast(t('admin.exporting') || 'Exporting data...', 'info');

      Promise.all([
        db.ref('users').once('value'),
        db.ref('claims').once('value'),
        db.ref('staking').once('value'),
        db.ref('missions').once('value'),
        db.ref('airdrops').once('value'),
        db.ref('bannedUsers').once('value'),
        db.ref('fraudLogs').once('value'),
        db.ref('news').once('value')
      ]).then(function (results) {
        var exportObj = {
          exportedAt: new Date().toISOString(),
          users: results[0].exists() ? results[0].val() : {},
          claims: results[1].exists() ? results[1].val() : {},
          staking: results[2].exists() ? results[2].val() : {},
          missions: results[3].exists() ? results[3].val() : {},
          airdrops: results[4].exists() ? results[4].val() : {},
          bannedUsers: results[5].exists() ? results[5].val() : {},
          fraudLogs: results[6].exists() ? results[6].val() : {},
          news: results[7].exists() ? results[7].val() : {}
        };

        var jsonStr = JSON.stringify(exportObj, null, 2);
        var blob = new Blob([jsonStr], { type: 'application/json' });
        var url = URL.createObjectURL(blob);

        var a = document.createElement('a');
        a.href = url;
        a.download = 'ndog-export-' + new Date().toISOString().slice(0, 10) + '.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        window.NDOG.Admin.showToast(t('admin.exportSuccess') || 'Data exported successfully!', 'success');

      }).catch(function (err) {
        console.error('[Admin] Export failed:', err);
        window.NDOG.Admin.showToast(t('admin.exportError') || 'Export failed.', 'error');
      });
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
        console.log('[NDOG Admin]', message);
      }
    },

    // ─────────────────────────────────
    // destroy — cleanup
    // ─────────────────────────────────
    destroy: function () {
      this.allUsers = [];
      this.searchQuery = '';
    }
  };
})();

/**
 * NileDogs (NDOG) — UI Module (FIXED v1.3.0)
 * ✅ Fixed: Changed synchronous XHR to async fetch for translations
 * 
 * This prevents browser freezes and CSP violations
 * since synchronous XHR is deprecated in modern browsers.
 */
(function () {
  'use strict';

  if (!window.NDOG) window.NDOG = {};

  /* ──────────────── LEVEL DEFINITIONS ──────────────── */
  var LEVELS = [
    { name: 'Bronze',  nameAr: 'برونزي',  icon: '\u{1F949}', min: 0 },
    { name: 'Silver',  nameAr: 'فضي',    icon: '\u{1F948}', min: 500 },
    { name: 'Gold',    nameAr: 'ذهبي',    icon: '\u{1F947}', min: 2000 },
    { name: 'Diamond', nameAr: 'ألماسي',   icon: '\u{1F48E}', min: 10000 },
    { name: 'Legend',  nameAr: 'أسطوري',   icon: '\u{1F451}', min: 50000 }
  ];

  /* ──────────────── SPIN WHEEL SEGMENTS ──────────────── */
  var SPIN_SEGMENTS = [
    { label: '5',    value: 5,    color: '#1a3a5c' },
    { label: '10',   value: 10,   color: '#0d47a1' },
    { label: '25',   value: 25,   color: '#1a3a5c' },
    { label: '50',   value: 50,   color: '#0d47a1' },
    { label: '100',  value: 100,  color: '#1a3a5c' },
    { label: '250',  value: 250,  color: '#0d47a1' },
    { label: '500',  value: 500,  color: '#1a3a5c' },
    { label: '1000', value: 1000, color: '#b8860b' }
  ];

  /* ══════════════════════════════════════════════════════ */
  /*  UI OBJECT                                              */
  /* ══════════════════════════════════════════════════════ */
  window.NDOG.UI = {
    activeView: 'dashboard',
    language: localStorage.getItem('ndog_lang') || 'ar',
    translations: null,
    listeners: [],
    translationsLoaded: false,

    /* ───────────────────────────────────────────────────
       INIT — entry point called by Auth after login
    ─────────────────────────────────────────────────── */
    init: function () {
      var self = this;
      
      // Load translations asynchronously
      this.loadTranslations(function() {
        self.applyLanguage();
        self.setupNavigation();
        self.startCountdown();
        self.setupLangToggle();
        self.setupModals();
        self.setupCopyButtons();
        self.setupShareButtons();
        self.initGames();
        self.switchView('dashboard');
        console.log('[NDOG.UI] Initialized');
      });
    },

    /* ════════════════════════════════════════════════════
       TRANSLATIONS / i18n (FIXED: Now async with fetch)
    ════════════════════════════════════════════════════ */

    /**
     * Fetch translation JSON for the current language asynchronously.
     * Falls back to default translations if fetch fails.
     * 
     * FIXED: Changed from synchronous XHR to async fetch
     * This prevents browser freeze and CSP violations
     */
    loadTranslations: function (callback) {
      var self = this;

      // Default English fallback (minimal)
      var defaultEN = {
        'common.copied': 'Copied!',
        'common.copy': 'Copy',
        'cd.days': 'Days',
        'cd.hrs': 'Hrs',
        'cd.min': 'Min',
        'cd.sec': 'Sec',
        'failsafe.msg': 'Loading error. Please refresh.',
        'preloader.loading': 'Loading...',
      };

      // Default Arabic fallback
      var defaultAR = {
        'common.copied': 'تم النسخ!',
        'common.copy': 'نسخ',
        'cd.days': 'يوم',
        'cd.hrs': 'ساعة',
        'cd.min': 'دقيقة',
        'cd.sec': 'ثانية',
        'failsafe.msg': 'حدث خطأ في التحميل',
        'preloader.loading': 'جاري التحميل...',
      };

      // Use async fetch instead of synchronous XHR
      fetch('./locales/' + self.language + '.json', {
        method: 'GET',
        cache: 'force-cache',
        headers: {
          'Accept': 'application/json',
        }
      })
      .then(function(response) {
        if (!response.ok) {
          throw new Error('Translation fetch failed: ' + response.status);
        }
        return response.json();
      })
      .then(function(data) {
        self.translations = data;
        self.translationsLoaded = true;
        console.log('[NDOG.UI] ✅ Translations loaded for', self.language);
        if (typeof callback === 'function') {
          callback();
        }
      })
      .catch(function(err) {
        console.warn('[NDOG.UI] Translation load failed, using defaults:', err.message);
        // Use default translations
        self.translations = self.language === 'ar' ? defaultAR : defaultEN;
        self.translationsLoaded = true;
        if (typeof callback === 'function') {
          callback();
        }
      });
    },

    /**
     * Get a translated string by key
     */
    t: function(key) {
      if (!this.translations) {
        return key; // Return key if translations not loaded yet
      }
      return this.translations[key] || key;
    },

    /**
     * Apply language to the document
     */
    applyLanguage: function () {
      var html = document.documentElement;
      if (this.language === 'ar') {
        html.setAttribute('lang', 'ar');
        html.setAttribute('dir', 'rtl');
        document.body.style.direction = 'rtl';
      } else {
        html.setAttribute('lang', 'en');
        html.setAttribute('dir', 'ltr');
        document.body.style.direction = 'ltr';
      }

      // Update i18n text elements
      this.updateTranslations();
    },

    /**
     * Update all translated elements in the DOM
     */
    updateTranslations: function() {
      var self = this;
      var elements = document.querySelectorAll('[data-i18n]');
      for (var i = 0; i < elements.length; i++) {
        var key = elements[i].getAttribute('data-i18n');
        var translated = self.t(key);
        if (elements[i].tagName === 'INPUT' || elements[i].tagName === 'TEXTAREA') {
          elements[i].placeholder = translated;
        } else {
          elements[i].textContent = translated;
        }
      }
    },

    /* ────────────────────────────────────────────────
       NAVIGATION SETUP
    ──────────────────────────────────────────────── */

    setupNavigation: function () {
      var self = this;
      var navLinks = document.querySelectorAll('[data-view]');
      
      for (var i = 0; i < navLinks.length; i++) {
        navLinks[i].addEventListener('click', function (e) {
          e.preventDefault();
          var view = this.getAttribute('data-view');
          self.switchView(view);
        });
      }
    },

    switchView: function (viewName) {
      // Hide all views
      var views = document.querySelectorAll('[data-view-content]');
      for (var i = 0; i < views.length; i++) {
        views[i].classList.add('hidden');
      }

      // Show selected view
      var selectedView = document.querySelector('[data-view-content="' + viewName + '"]');
      if (selectedView) {
        selectedView.classList.remove('hidden');
        this.activeView = viewName;
      }

      // Update active nav item
      var navItems = document.querySelectorAll('[data-view]');
      for (var j = 0; j < navItems.length; j++) {
        navItems[j].classList.remove('active');
        if (navItems[j].getAttribute('data-view') === viewName) {
          navItems[j].classList.add('active');
        }
      }
    },

    /* ────────────────────────────────────────────────
       LANGUAGE TOGGLE
    ──────────────────────────────────────────────── */

    setupLangToggle: function () {
      var self = this;
      var toggleBtn = document.getElementById('langToggleBtn');
      if (toggleBtn) {
        toggleBtn.addEventListener('click', function () {
          self.language = self.language === 'ar' ? 'en' : 'ar';
          localStorage.setItem('ndog_lang', self.language);
          self.loadTranslations(function() {
            self.applyLanguage();
          });
        });
      }
    },

    /* ────────────────────────────────────────────────
       COUNTDOWN TIMER
    ──────────────────────────────────────────────── */

    startCountdown: function () {
      var targetDate = new Date('2028-01-01T00:00:00Z').getTime();
      var self = this;

      setInterval(function () {
        var now = new Date().getTime();
        var distance = targetDate - now;

        if (distance < 0) {
          var cdElement = document.getElementById('mainCountdown');
          if (cdElement) {
            cdElement.innerHTML = '<p>🎉 NileDogs Launches!</p>';
          }
          return;
        }

        var days = Math.floor(distance / (1000 * 60 * 60 * 24));
        var hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        var minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        var seconds = Math.floor((distance % (1000 * 60)) / 1000);

        var cdElement = document.getElementById('mainCountdown');
        if (cdElement) {
          var daysLabel = self.t('cd.days');
          var hrsLabel = self.t('cd.hrs');
          var minLabel = self.t('cd.min');
          var secLabel = self.t('cd.sec');

          cdElement.innerHTML = 
            '<div class="countdown-item"><span class="countdown-value">' + days + '</span><span class="countdown-label">' + daysLabel + '</span></div>' +
            '<div class="countdown-item"><span class="countdown-value">' + hours + '</span><span class="countdown-label">' + hrsLabel + '</span></div>' +
            '<div class="countdown-item"><span class="countdown-value">' + minutes + '</span><span class="countdown-label">' + minLabel + '</span></div>' +
            '<div class="countdown-item"><span class="countdown-value">' + seconds + '</span><span class="countdown-label">' + secLabel + '</span></div>';
        }
      }, 1000);
    },

    /* ────────────────────────────────────────────────
       MODALS
    ──────────────────────────────────────────────── */

    setupModals: function () {
      var modalBackgrounds = document.querySelectorAll('[data-modal-bg]');
      for (var i = 0; i < modalBackgrounds.length; i++) {
        modalBackgrounds[i].addEventListener('click', function (e) {
          if (e.target === this) {
            this.classList.add('hidden');
          }
        });
      }

      var closeButtons = document.querySelectorAll('[data-modal-close]');
      for (var j = 0; j < closeButtons.length; j++) {
        closeButtons[j].addEventListener('click', function () {
          var modal = this.closest('[data-modal-bg]');
          if (modal) {
            modal.classList.add('hidden');
          }
        });
      }
    },

    openModal: function (modalId) {
      var modal = document.querySelector('[data-modal-bg="' + modalId + '"]');
      if (modal) {
        modal.classList.remove('hidden');
      }
    },

    closeModal: function (modalId) {
      var modal = document.querySelector('[data-modal-bg="' + modalId + '"]');
      if (modal) {
        modal.classList.add('hidden');
      }
    },

    /* ────────────────────────────────────────────────
       COPY & SHARE
    ──────────────────────────────────────────────── */

    setupCopyButtons: function () {
      var self = this;
      var copyButtons = document.querySelectorAll('[data-copy]');
      for (var i = 0; i < copyButtons.length; i++) {
        copyButtons[i].addEventListener('click', function () {
          var text = this.getAttribute('data-copy');
          if (navigator.clipboard) {
            navigator.clipboard.writeText(text).then(function () {
              self.showCopyNotification();
            });
          } else {
            // Fallback for older browsers
            var textarea = document.createElement('textarea');
            textarea.value = text;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            self.showCopyNotification();
          }
        });
      }
    },

    showCopyNotification: function () {
      if (window.NDOG.Notify) {
        window.NDOG.Notify.success(this.t('common.copied'));
      }
    },

    setupShareButtons: function () {
      // Share functionality to be implemented
    },

    /* ────────────────────────────────────────────────
       GAMES
    ──────────────────────────────────────────────── */

    initGames: function () {
      // Initialize game modules here
      // Spin wheel, lucky box, scratch card, etc.
    },

    /* ────────────────────────────────────────────────
       DASHBOARD UPDATE
    ──────────────────────────────────────────────── */

    updateDashboard: function () {
      if (!window.NDOG.userProfile) return;

      var profile = window.NDOG.userProfile;

      // Update user info
      var nameEl = document.getElementById('userDisplayName');
      if (nameEl) {
        nameEl.textContent = profile.displayName || 'Anonymous';
      }

      var balanceEl = document.getElementById('userBalance');
      if (balanceEl) {
        balanceEl.textContent = (profile.balance || 0).toFixed(0);
      }

      var rankEl = document.getElementById('userRank');
      if (rankEl) {
        rankEl.textContent = profile.rank || 'Bronze';
      }

      var avatarEl = document.getElementById('userAvatar');
      if (avatarEl && profile.photoURL) {
        avatarEl.src = profile.photoURL;
      }

      var refCodeEl = document.getElementById('refCode');
      if (refCodeEl) {
        refCodeEl.textContent = profile.referralCode || '';
      }

      var refCountEl = document.getElementById('refCount');
      if (refCountEl) {
        refCountEl.textContent = (profile.referralCount || 0).toString();
      }
    }
  };
})();
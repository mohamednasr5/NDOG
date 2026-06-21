/**
 * ═══════════════════════════════════════════════════════════════
 *  NileDogs (NDOG) — UI Module
 *  Main UI management: views, countdown, modals, i18n, games
 * ═══════════════════════════════════════════════════════════════
 *  Uses IIFE pattern. All public API exposed via window.NDOG.UI.
 *  Depends on: window.NDOG (global namespace), window.NDOG.Notify
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

    /* ───────────────────────────────────────────────────
       INIT — entry point called by Auth after login
    ─────────────────────────────────────────────────── */
    init: function () {
      this.loadTranslations();
      this.applyLanguage();
      this.setupNavigation();
      this.startCountdown();
      this.setupLangToggle();
      this.setupModals();
      this.setupCopyButtons();
      this.setupShareButtons();
      this.initGames();
      this.switchView('dashboard');
      console.log('[NDOG.UI] Initialized');
    },

    /* ════════════════════════════════════════════════════
       TRANSLATIONS / i18n
    ════════════════════════════════════════════════════ */

    /**
     * Fetch translation JSON for the current language.
     * Falls back to the default Arabic translations if fetch fails.
     */
    loadTranslations: function () {
      var self = this;

      // Default English fallback (minimal)
      var defaultEN = {
        'common.copied': 'Copied!',
        'common.copy': 'Copy',
        'cd.days': 'Days',
        'cd.hrs': 'Hrs',
        'cd.min': 'Min',
        'cd.sec': 'Sec'
      };

      var defaultAR = {
        'common.copied': 'تم النسخ!',
        'common.copy': 'نسخ',
        'cd.days': 'يوم',
        'cd.hrs': 'ساعة',
        'cd.min': 'دقيقة',
        'cd.sec': 'ثانية'
      };

      try {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', './locales/' + self.language + '.json', false); // synchronous
        xhr.send();
        if (xhr.status === 200 || xhr.status === 0) {
          self.translations = JSON.parse(xhr.responseText);
          return;
        }
      } catch (e) {
        // Fetch failed — use default
      }

      self.translations = (self.language === 'en') ? defaultEN : defaultAR;
    },

    /**
     * Look up a translation key. Supports dot-notation (e.g. "nav.dashboard").
     * Falls back to returning the key itself if not found.
     */
    t: function (key) {
      if (!this.translations) return key;
      var parts = key.split('.');
      var obj = this.translations;
      for (var i = 0; i < parts.length; i++) {
        if (obj && typeof obj === 'object' && parts[i] in obj) {
          obj = obj[parts[i]];
        } else {
          return key;
        }
      }
      return (typeof obj === 'string') ? obj : key;
    },

    /**
     * Apply the current language to the DOM.
     * Sets text content for [data-i18n] and innerHTML for [data-i18n-html].
     * Sets dir attribute on <html> and updates toggle label.
     */
    applyLanguage: function () {
      var self = this;
      var dir = self.getDirection();

      // Set direction on <html>
      document.documentElement.setAttribute('dir', dir);
      document.documentElement.setAttribute('lang', self.language);

      // Apply text translations
      var textEls = document.querySelectorAll('[data-i18n]');
      for (var i = 0; i < textEls.length; i++) {
        var key = textEls[i].getAttribute('data-i18n');
        textEls[i].textContent = self.t(key);
      }

      // Apply HTML translations
      var htmlEls = document.querySelectorAll('[data-i18n-html]');
      for (var j = 0; j < htmlEls.length; j++) {
        var hKey = htmlEls[j].getAttribute('data-i18n-html');
        htmlEls[j].innerHTML = self.t(hKey);
      }

      // Update lang toggle label
      var toggleLbl = document.getElementById('langToggleLbl');
      if (toggleLbl) {
        toggleLbl.textContent = (self.language === 'ar') ? 'EN' : 'عربي';
      }

      // Highlight active language pill on login screen
      var pills = document.querySelectorAll('.lang-pill');
      for (var p = 0; p < pills.length; p++) {
        pills[p].classList.toggle('active', pills[p].getAttribute('data-lang') === self.language);
      }
    },

    /**
     * Switch language and re-apply.
     */
    switchLanguage: function (lang) {
      if (lang === this.language) return;
      this.language = lang;
      localStorage.setItem('ndog_lang', lang);
      this.loadTranslations();
      this.applyLanguage();
    },

    /**
     * Return 'rtl' for Arabic, 'ltr' for everything else.
     */
    getDirection: function () {
      return (this.language === 'ar') ? 'rtl' : 'ltr';
    },

    /* ════════════════════════════════════════════════════
       NAVIGATION — views, sidenav, bottomnav
    ════════════════════════════════════════════════════ */

    /**
     * Bind all navigation handlers:
     *  - Side nav links
     *  - Bottom nav links
     *  - Dashboard buttons with data-view
     *  - Menu toggle (hamburger)
     *  - Scrim overlay
     */
    setupNavigation: function () {
      var self = this;

      // Side nav links
      var sideLinks = document.querySelectorAll('.sidenav .nav-link[data-view]');
      for (var i = 0; i < sideLinks.length; i++) {
        sideLinks[i].addEventListener('click', function (e) {
          e.preventDefault();
          self.switchView(this.getAttribute('data-view'));
          self.closeSidenav();
        });
      }

      // Bottom nav links
      var bottomLinks = document.querySelectorAll('.bottomnav .bn-link[data-view]');
      for (var j = 0; j < bottomLinks.length; j++) {
        bottomLinks[j].addEventListener('click', function (e) {
          e.preventDefault();
          self.switchView(this.getAttribute('data-view'));
        });
      }

      // Any element with data-view (including dashboard buttons)
      var viewBtns = document.querySelectorAll('[data-view]');
      for (var k = 0; k < viewBtns.length; k++) {
        // Skip if already bound above
        if (viewBtns[k].classList.contains('nav-link') || viewBtns[k].classList.contains('bn-link')) continue;
        viewBtns[k].addEventListener('click', function (e) {
          e.preventDefault();
          var viewName = this.getAttribute('data-view');
          if (viewName && viewName.indexOf('.html') === -1) {
            self.switchView(viewName);
          }
        });
      }

      // Menu toggle (hamburger)
      var menuToggle = document.getElementById('menuToggle');
      if (menuToggle) {
        menuToggle.addEventListener('click', function () {
          self.toggleSidenav();
        });
      }

      // Scrim click — close sidenav
      var scrim = document.getElementById('sidenavScrim');
      if (scrim) {
        scrim.addEventListener('click', function () {
          self.closeSidenav();
        });
      }
    },

    /**
     * Switch the active view in the viewport.
     * Hides all .view sections, shows the target one, updates nav active states.
     */
    switchView: function (viewName) {
      this.activeView = viewName;

      // Hide all views, show target
      var views = document.querySelectorAll('.view');
      for (var i = 0; i < views.length; i++) {
        views[i].classList.remove('view--active');
      }

      var target = document.getElementById('view-' + viewName);
      if (target) {
        target.classList.add('view--active');
      }

      // Update side nav active states
      var sideLinks = document.querySelectorAll('.sidenav .nav-link[data-view]');
      for (var j = 0; j < sideLinks.length; j++) {
        sideLinks[j].classList.toggle('active', sideLinks[j].getAttribute('data-view') === viewName);
      }

      // Update bottom nav active states
      var bottomLinks = document.querySelectorAll('.bottomnav .bn-link[data-view]');
      for (var k = 0; k < bottomLinks.length; k++) {
        bottomLinks[k].classList.toggle('active', bottomLinks[k].getAttribute('data-view') === viewName);
      }

      // Scroll viewport to top
      var viewport = document.getElementById('viewport');
      if (viewport) viewport.scrollTop = 0;
    },

    /**
     * Open the side navigation drawer.
     */
    openSidenav: function () {
      var sidenav = document.getElementById('sidenav');
      var scrim = document.getElementById('sidenavScrim');
      if (sidenav) {
        sidenav.classList.add('open');
        sidenav.setAttribute('aria-hidden', 'false');
      }
      if (scrim) scrim.classList.add('show');
    },

    /**
     * Close the side navigation drawer.
     */
    closeSidenav: function () {
      var sidenav = document.getElementById('sidenav');
      var scrim = document.getElementById('sidenavScrim');
      if (sidenav) {
        sidenav.classList.remove('open');
        sidenav.setAttribute('aria-hidden', 'true');
      }
      if (scrim) scrim.classList.remove('show');
    },

    /**
     * Toggle the side navigation drawer open/closed.
     */
    toggleSidenav: function () {
      var sidenav = document.getElementById('sidenav');
      if (sidenav && sidenav.classList.contains('open')) {
        this.closeSidenav();
      } else {
        this.openSidenav();
      }
    },

    /* ════════════════════════════════════════════════════
       COUNTDOWN — launch timer
    ════════════════════════════════════════════════════ */

    /**
     * Start the countdown timer to January 1, 2028 00:00:00 UTC.
     * Updates #lcDays, #lcHours, #lcMins, #lcSecs every second.
     */
    startCountdown: function () {
      var target = new Date('2028-01-01T00:00:00Z').getTime();
      var elDays = document.getElementById('lcDays');
      var elHours = document.getElementById('lcHours');
      var elMins = document.getElementById('lcMins');
      var elSecs = document.getElementById('lcSecs');

      if (!elDays || !elHours || !elMins || !elSecs) return;

      function update() {
        var now = Date.now();
        var diff = target - now;

        if (diff <= 0) {
          elDays.textContent = '0';
          elHours.textContent = '0';
          elMins.textContent = '0';
          elSecs.textContent = '0';
          return;
        }

        var days = Math.floor(diff / (1000 * 60 * 60 * 24));
        var hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        var mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        var secs = Math.floor((diff % (1000 * 60)) / 1000);

        elDays.textContent = days;
        elHours.textContent = hours;
        elMins.textContent = mins;
        elSecs.textContent = secs;
      }

      update();
      setInterval(update, 1000);
    },

    /* ════════════════════════════════════════════════════
       MODALS — open, close, management
    ════════════════════════════════════════════════════ */

    /**
     * Setup all modal open/close event handlers.
     */
    setupModals: function () {
      var self = this;

      // Close buttons (backdrop + close button)
      var closeTriggers = document.querySelectorAll('[data-close-modal]');
      for (var i = 0; i < closeTriggers.length; i++) {
        closeTriggers[i].addEventListener('click', function () {
          var modal = this.closest('.modal');
          if (modal) {
            self.closeModal(modal.id);
          }
        });
      }

      // QR modal trigger
      var qrTrigger = document.getElementById('qrTrigger');
      if (qrTrigger) {
        qrTrigger.addEventListener('click', function () {
          self.openModal('modalQR');
        });
      }
      var qrTrigger2 = document.getElementById('qrTrigger2');
      if (qrTrigger2) {
        qrTrigger2.addEventListener('click', function () {
          self.openModal('modalQR');
        });
      }
    },

    /**
     * Open a modal by its ID. Removes 'hidden' class and adds 'show' class.
     */
    openModal: function (modalId) {
      var modal = document.getElementById(modalId);
      if (!modal) return;
      modal.classList.remove('hidden');
      // Force reflow so the CSS transition works
      void modal.offsetHeight;
      modal.classList.add('show');
      document.body.style.overflow = 'hidden';
    },

    /**
     * Close a modal by its ID. Removes 'show' class and adds 'hidden' after transition.
     */
    closeModal: function (modalId) {
      var modal = document.getElementById(modalId);
      if (!modal) return;
      modal.classList.remove('show');
      setTimeout(function () {
        modal.classList.add('hidden');
        document.body.style.overflow = '';
      }, 300);
    },

    /**
     * Close all open modals.
     */
    closeAllModals: function () {
      var modals = document.querySelectorAll('.modal.show');
      for (var i = 0; i < modals.length; i++) {
        this.closeModal(modals[i].id);
      }
    },

    /* ════════════════════════════════════════════════════
       COPY BUTTONS
    ════════════════════════════════════════════════════ */

    /**
     * Setup all [data-copy-target] buttons to copy element text/value to clipboard.
     */
    setupCopyButtons: function () {
      var self = this;
      var copyBtns = document.querySelectorAll('[data-copy-target]');
      for (var i = 0; i < copyBtns.length; i++) {
        (function (btn) {
          btn.addEventListener('click', function () {
            var targetId = btn.getAttribute('data-copy-target');
            var target = document.getElementById(targetId);
            if (target) {
              var text = target.value || target.textContent || '';
              if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text).then(function () {
                  if (window.NDOG.Notify && window.NDOG.Notify.success) {
                    window.NDOG.Notify.success(self.t('common.copied') || 'Copied!');
                  }
                }).catch(function () {
                  self._fallbackCopy(target, text);
                });
              } else {
                self._fallbackCopy(target, text);
              }
            }
          });
        })(copyBtns[i]);
      }

      // Copy referral button on dashboard
      var copyRefBtn = document.getElementById('copyRefBtn');
      if (copyRefBtn) {
        copyRefBtn.addEventListener('click', function () {
          var refLink = document.getElementById('dashRefLink');
          if (refLink) {
            var text = refLink.textContent || '';
            if (navigator.clipboard && navigator.clipboard.writeText) {
              navigator.clipboard.writeText(text).then(function () {
                if (window.NDOG.Notify && window.NDOG.Notify.success) {
                  window.NDOG.Notify.success(self.t('common.copied') || 'Copied!');
                }
              }).catch(function () {
                self._fallbackCopy(refLink, text);
              });
            } else {
              self._fallbackCopy(refLink, text);
            }
          }
        });
      }
    },

    /**
     * Fallback copy method for older browsers.
     */
    _fallbackCopy: function (element, text) {
      try {
        var textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        if (window.NDOG.Notify && window.NDOG.Notify.success) {
          window.NDOG.Notify.success(this.t('common.copied') || 'Copied!');
        }
      } catch (e) {
        // Silently fail
      }
    },

    /* ════════════════════════════════════════════════════
       SHARE BUTTONS
    ════════════════════════════════════════════════════ */

    setupShareButtons: function () {
      var self = this;
      var shareBtns = document.querySelectorAll('[data-share]');
      for (var i = 0; i < shareBtns.length; i++) {
        (function (btn) {
          btn.addEventListener('click', function (e) {
            e.preventDefault();
            var platform = btn.getAttribute('data-share');
            var refLink = document.getElementById('dashRefLink');
            var url = refLink ? refLink.textContent : window.location.href;
            var text = (self.language === 'ar')
              ? '\u0627\u0646\u0636\u0645 \u0625\u0644\u0649 NileDogs \u0648\u0627\u0643\u0633\u0628 \u0645\u0643\u0627\u0641\u0622\u062A NDOG!'
              : 'Join NileDogs and earn NDOG rewards!';
            var shareUrl = '';

            switch (platform) {
              case 'whatsapp':
                shareUrl = 'https://wa.me/?text=' + encodeURIComponent(text + ' ' + url);
                break;
              case 'telegram':
                shareUrl = 'https://t.me/share/url?url=' + encodeURIComponent(url) + '&text=' + encodeURIComponent(text);
                break;
              case 'facebook':
                shareUrl = 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(url);
                break;
              case 'x':
                shareUrl = 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(text) + '&url=' + encodeURIComponent(url);
                break;
              case 'messenger':
                shareUrl = 'https://www.facebook.com/dialog/send?link=' + encodeURIComponent(url) + '&app_id=0';
                break;
              default:
                return;
            }

            window.open(shareUrl, '_blank', 'noopener,noreferrer');
          });
        })(shareBtns[i]);
      }
    },

    /* ════════════════════════════════════════════════════
       LANGUAGE TOGGLE (topbar)
    ════════════════════════════════════════════════════ */

    /**
     * Setup the language toggle button in the topbar and login screen pills.
     */
    setupLangToggle: function () {
      var self = this;

      // Topbar lang toggle
      var toggle = document.getElementById('langToggle');
      if (toggle) {
        toggle.addEventListener('click', function () {
          var newLang = (self.language === 'ar') ? 'en' : 'ar';
          self.switchLanguage(newLang);
        });
      }

      // Login screen pills
      var pills = document.querySelectorAll('.lang-pill[data-lang]');
      for (var i = 0; i < pills.length; i++) {
        pills[i].addEventListener('click', function () {
          var lang = this.getAttribute('data-lang');
          if (lang) self.switchLanguage(lang);
        });
      }
    },

    /* ════════════════════════════════════════════════════
       DASHBOARD UPDATE — populate all dashboard data
    ════════════════════════════════════════════════════ */

    /**
     * Update the entire dashboard view with user profile data.
     * @param {Object} profile - User profile object
     */
    updateDashboard: function (profile) {
      if (!profile) return;

      // Avatar
      var dashAvatar = document.getElementById('dashAvatar');
      var sideAvatar = document.getElementById('sideAvatar');
      if (profile.photoURL && profile.photoURL.length > 0) {
        if (dashAvatar) dashAvatar.src = profile.photoURL;
        if (sideAvatar) sideAvatar.src = profile.photoURL;
      } else {
        var defaultAvatar = this._generateAvatar(profile.displayName || 'U');
        if (dashAvatar) dashAvatar.src = defaultAvatar;
        if (sideAvatar) sideAvatar.src = defaultAvatar;
      }

      // Name
      var dashName = document.getElementById('dashName');
      var sideName = document.getElementById('sideName');
      var name = profile.displayName || 'User';
      if (dashName) dashName.textContent = name;
      if (sideName) sideName.textContent = name;

      // Join date
      var dashJoined = document.getElementById('dashJoined');
      if (dashJoined && profile.createdAt) {
        var dateStr = this._formatDate(profile.createdAt);
        dashJoined.textContent = (this.language === 'ar')
          ? '\u0639\u0636\u0648 \u0645\u0646\u0630 ' + dateStr
          : 'Member since ' + dateStr;
      }

      // Country
      var dashCountry = document.getElementById('dashCountry');
      if (dashCountry && profile.country) {
        dashCountry.textContent = '\u{1F30D} ' + profile.country;
      }

      // Referral code
      var refCode = profile.referralCode || 'NDOG\u2014';
      var refLink = 'https://ndogcoin.com/?ref=' + refCode;

      var dashRefCode = document.getElementById('dashRefCode');
      var dashRefLink = document.getElementById('dashRefLink');
      var refCodeInput = document.getElementById('refCodeInput');
      var refLinkInput = document.getElementById('refLinkInput');
      var sideCode = document.getElementById('sideCode');

      if (dashRefCode) dashRefCode.textContent = refCode;
      if (dashRefLink) dashRefLink.textContent = refLink;
      if (refCodeInput) refCodeInput.value = refCode;
      if (refLinkInput) refLinkInput.value = refLink;
      if (sideCode) sideCode.textContent = refCode;

      // Stat counters with animation
      var balance = profile.balance || 0;
      var community = profile.scores || 0;
      var loyalty = profile.loyaltyScore || 0;
      var refs = profile.referralCount || 0;

      this.animateCounter(document.getElementById('statBalance'), balance);
      this.animateCounter(document.getElementById('statCommunity'), community);
      this.animateCounter(document.getElementById('statLoyalty'), loyalty);
      this.animateCounter(document.getElementById('statRefs'), refs);

      // Topbar balance
      var topbarBal = document.getElementById('topbarBalNum');
      if (topbarBal) topbarBal.textContent = balance.toLocaleString();

      // Level progress
      this.updateLevelProgress(balance);

      // Rank chip
      this._updateRankChip(balance);

      // Founder/early adopter banner
      var banner = document.getElementById('earlyAdopterBanner');
      if (banner) {
        if (profile.isFounder) {
          banner.classList.remove('hidden');
        } else {
          banner.classList.add('hidden');
        }
      }
    },

    /**
     * Generate a data URI avatar from initials.
     */
    _generateAvatar: function (name) {
      var initials = name.split(' ').map(function (w) {
        return w.charAt(0);
      }).join('').toUpperCase().substring(0, 2);
      var canvas = document.createElement('canvas');
      canvas.width = 80;
      canvas.height = 80;
      var ctx = canvas.getContext('2d');

      // Background
      ctx.fillStyle = '#0d47a1';
      ctx.fillRect(0, 0, 80, 80);

      // Text
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 32px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(initials, 40, 40);

      return canvas.toDataURL('image/png');
    },

    /**
     * Format a timestamp into a human-readable date.
     */
    _formatDate: function (timestamp) {
      var d = new Date(timestamp);
      var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      return months[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
    },

    /* ════════════════════════════════════════════════════
       ANIMATED COUNTER
    ════════════════════════════════════════════════════ */

    /**
     * Animate a number counter from 0 to targetValue over 1 second (ease-out cubic).
     * @param {HTMLElement} element - The element to animate
     * @param {number} targetValue - The target value
     */
    animateCounter: function (element, targetValue) {
      if (!element) return;
      var start = 0;
      var duration = 1000;
      var startTime = performance.now();

      function animate(currentTime) {
        var elapsed = currentTime - startTime;
        var progress = Math.min(elapsed / duration, 1);
        var eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
        var current = Math.round(start + (targetValue - start) * eased);
        element.textContent = current.toLocaleString();
        if (progress < 1) {
          requestAnimationFrame(animate);
        }
      }

      requestAnimationFrame(animate);
    },

    /* ════════════════════════════════════════════════════
       LEVEL PROGRESS
    ════════════════════════════════════════════════════ */

    /**
     * Update the level progress bar and badges based on the current balance.
     * @param {number} balance - Current user balance
     */
    updateLevelProgress: function (balance) {
      var currentLevel = LEVELS[0];
      var nextLevel = LEVELS[1];
      var isMaxLevel = false;

      // Find current and next level
      for (var i = 0; i < LEVELS.length; i++) {
        if (balance >= LEVELS[i].min) {
          currentLevel = LEVELS[i];
          if (i + 1 < LEVELS.length) {
            nextLevel = LEVELS[i + 1];
          } else {
            nextLevel = null;
            isMaxLevel = true;
          }
        } else {
          nextLevel = LEVELS[i];
          break;
        }
      }

      // Calculate progress percentage
      var progress = 0;
      if (nextLevel) {
        var range = nextLevel.min - currentLevel.min;
        progress = Math.min(((balance - currentLevel.min) / range) * 100, 100);
      } else {
        progress = 100; // Max level
      }

      // Update progress bar
      var fill = document.getElementById('levelFill');
      if (fill) {
        fill.style.width = progress + '%';
      }

      // Update "Next" text
      var nextText = document.getElementById('levelNext');
      if (nextText) {
        if (isMaxLevel) {
          nextText.textContent = (this.language === 'ar')
            ? '\u{1F451} \u0627\u0644\u0645\u0633\u062A\u0648\u0649 \u0627\u0644\u0623\u0642\u0635\u0649!'
            : '\u{1F451} Max Level!';
        } else {
          nextText.textContent = (this.language === 'ar')
            ? '\u0627\u0644\u062A\u0627\u0644\u064A: ' + nextLevel.icon + ' ' + nextLevel.nameAr
            : 'Next: ' + nextLevel.icon + ' ' + nextLevel.name;
        }
      }

      // Update badges
      var badges = document.getElementById('levelBadges');
      if (badges) {
        var html = '';
        for (var j = 0; j < LEVELS.length; j++) {
          var isUnlocked = balance >= LEVELS[j].min;
          var isCurrent = (LEVELS[j].name === currentLevel.name);
          html += '<div class="level-badge' +
            (isUnlocked ? ' unlocked' : '') +
            (isCurrent ? ' current' : '') +
            '">' +
            '<span class="level-badge__icon">' + LEVELS[j].icon + '</span>' +
            '<span class="level-badge__name">' +
            (this.language === 'ar' ? LEVELS[j].nameAr : LEVELS[j].name) +
            '</span>' +
            '</div>';
        }
        badges.innerHTML = html;
      }
    },

    /**
     * Update the rank chip in the dashboard hero.
     */
    _updateRankChip: function (balance) {
      var rankIcon = document.querySelector('.dash__rank-icon');
      var rankName = document.getElementById('dashRankName');
      if (!rankIcon || !rankName) return;

      var currentLevel = LEVELS[0];
      for (var i = 0; i < LEVELS.length; i++) {
        if (balance >= LEVELS[i].min) {
          currentLevel = LEVELS[i];
        }
      }

      rankIcon.textContent = currentLevel.icon;
      rankName.textContent = (this.language === 'ar') ? currentLevel.nameAr : currentLevel.name;
    },

    /* ════════════════════════════════════════════════════
       GAMES — Spin Wheel, Lucky Box, Scratch Card, Treasure Hunt
    ════════════════════════════════════════════════════ */

    /**
     * Initialize all mini-game handlers.
     */
    initGames: function () {
      var self = this;

      // Spin wheel
      var openSpin = document.getElementById('openSpin');
      if (openSpin) {
        openSpin.addEventListener('click', function () {
          self.openModal('modalSpin');
          self.initSpinWheel();
        });
      }

      // Lucky box
      var openLucky = document.getElementById('openLucky');
      if (openLucky) {
        openLucky.addEventListener('click', function () {
          self.openModal('modalLuckyBox');
          self.initLuckyBox();
        });
      }
    },

    /* ──────────────────────────────────────────────────
       SPIN WHEEL
    ────────────────────────────────────────────────── */

    /**
     * Initialize and draw the spin wheel on canvas.
     * The wheel has 8 colored segments with NDOG values.
     */
    initSpinWheel: function () {
      var self = this;
      var canvas = document.getElementById('spinCanvas');
      if (!canvas) return;

      var ctx = canvas.getContext('2d');
      var width = canvas.width;
      var height = canvas.height;
      var centerX = width / 2;
      var centerY = height / 2;
      var radius = Math.max(1, Math.min(centerX, centerY) - 10);
      var numSegments = SPIN_SEGMENTS.length;
      var arcSize = (2 * Math.PI) / numSegments;

      // Draw the wheel
      this._drawWheel(ctx, centerX, centerY, radius, numSegments, arcSize);

      // Spin state
      var spinning = false;

      // Spin button handler
      var spinBtn = document.getElementById('btnSpin');
      if (spinBtn) {
        spinBtn.onclick = function () {
          if (spinning) return;
          spinning = true;
          spinBtn.disabled = true;

          // Random number of full rotations (5-10) + random offset
          var extraDegs = Math.floor(Math.random() * 360);
          var fullTurns = (5 + Math.floor(Math.random() * 6)) * 360;
          var totalDegs = fullTurns + extraDegs;

          // Apply rotation via CSS transform on the canvas wrapper
          canvas.style.transition = 'transform 4s cubic-bezier(0.17, 0.67, 0.12, 0.99)';
          canvas.style.transform = 'rotate(' + totalDegs + 'deg)';

          // After spin completes
          setTimeout(function () {
            spinning = false;
            spinBtn.disabled = false;

            // Determine winning segment
            // The pointer is at the top (270 degrees / -90 degrees from the positive x-axis)
            var normalizedDeg = totalDegs % 360;
            // Pointer at top = 270 deg position in standard coords
            var pointerAngle = (270 - normalizedDeg + 360) % 360;
            var winIndex = Math.floor(pointerAngle / (360 / numSegments));
            winIndex = winIndex % numSegments;

            var prize = SPIN_SEGMENTS[winIndex];

            // Add to balance (via Claim or direct update)
            if (window.NDOG.Claim && window.NDOG.Claim.addBalance) {
              window.NDOG.Claim.addBalance(prize.value, 'spin');
            } else if (window.NDOG.Auth && window.NDOG.Auth.addBalance) {
              window.NDOG.Auth.addBalance(prize.value, 'spin');
            }

            // Show notification
            if (window.NDOG.Notify && window.NDOG.Notify.success) {
              window.NDOG.Notify.success(
                '\u{1F389} +' + prize.value + ' NDOG!'
              );
            }

            // Redraw wheel for next spin
            canvas.style.transition = 'none';
            canvas.style.transform = 'rotate(0deg)';
            self._drawWheel(ctx, centerX, centerY, radius, numSegments, arcSize);

          }, 4200);
        };
      }
    },

    /**
     * Draw the spin wheel segments on the canvas.
     */
    _drawWheel: function (ctx, cx, cy, r, numSegments, arcSize) {
      // Clear
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

      // Draw segments
      for (var i = 0; i < numSegments; i++) {
        var seg = SPIN_SEGMENTS[i];
        var startAngle = i * arcSize - Math.PI / 2; // Start from top
        var endAngle = startAngle + arcSize;

        // Fill segment
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, r, startAngle, endAngle);
        ctx.closePath();
        ctx.fillStyle = seg.color;
        ctx.fill();

        // Gold border
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#ffd700';
        ctx.stroke();

        // Draw label text
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(startAngle + arcSize / 2);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffd700';
        ctx.font = 'bold ' + Math.max(14, Math.round(r / 7)) + 'px system-ui, sans-serif';
        ctx.fillText(seg.label, r * 0.65, 0);
        ctx.restore();
      }

      // Center circle
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(1, r * 0.18), 0, 2 * Math.PI);
      ctx.fillStyle = '#0a1f44';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#ffd700';
      ctx.stroke();

      // Center icon
      ctx.fillStyle = '#ffd700';
      ctx.font = 'bold ' + Math.max(16, Math.round(r / 6)) + 'px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🐕', cx, cy);

      // Outer ring
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, 2 * Math.PI);
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#ffd700';
      ctx.stroke();
    },

    /* ──────────────────────────────────────────────────
       LUCKY BOX
    ────────────────────────────────────────────────── */

    /**
     * Initialize the lucky box game.
     * Clicking "Open Box" triggers a box opening animation and reveals a random reward.
     */
    initLuckyBox: function () {
      var self = this;
      var box = document.getElementById('luckyBox');
      var openBtn = document.getElementById('btnOpenBox');

      if (!box || !openBtn) return;

      // Reset box state
      box.classList.remove('opened');
      box.textContent = '\u{1F381}';
      openBtn.disabled = false;
      openBtn.textContent = self.t('modal.luckyOpen') || 'Open Box';

      openBtn.onclick = function () {
        if (openBtn.disabled) return;
        openBtn.disabled = true;

        // Add opening animation
        box.classList.add('opening');

        setTimeout(function () {
          // Generate random reward 5-100
          var reward = Math.floor(Math.random() * 96) + 5;

          // Reveal reward
          box.classList.remove('opening');
          box.classList.add('opened');
          box.textContent = '+' + reward + ' NDOG';

          openBtn.textContent = (self.language === 'ar') ? '\u{1F44D} تم!' : '\u{1F44D} Done!';

          // Add to balance
          if (window.NDOG.Claim && window.NDOG.Claim.addBalance) {
            window.NDOG.Claim.addBalance(reward, 'lucky');
          } else if (window.NDOG.Auth && window.NDOG.Auth.addBalance) {
            window.NDOG.Auth.addBalance(reward, 'lucky');
          }

          // Notification
          if (window.NDOG.Notify && window.NDOG.Notify.success) {
            window.NDOG.Notify.success('\u{1F381} +' + reward + ' NDOG from Lucky Box!');
          }

        }, 600);
      };
    },

    /* ──────────────────────────────────────────────────
       SCRATCH CARD (standalone — called from external if needed)
    ────────────────────────────────────────────────── */

    /**
     * Initialize the scratch card game on canvas.
     * User scratches a gold surface to reveal a hidden reward.
     * When >60% is scratched, auto-reveals the full reward.
     */
    initScratchCard: function () {
      var self = this;
      var canvas = document.getElementById('scratchCanvas');
      if (!canvas) return;

      var ctx = canvas.getContext('2d');
      var width = canvas.width;
      var height = canvas.height;
      var isRevealed = false;

      // Generate the hidden reward
      var reward = Math.floor(Math.random() * 191) + 10; // 10-200

      // Draw the reward text on the canvas first (underneath)
      ctx.fillStyle = '#0a1f44';
      ctx.fillRect(0, 0, width, height);

      ctx.fillStyle = '#ffd700';
      ctx.font = 'bold ' + Math.max(20, Math.round(width / 6)) + 'px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('+' + reward + ' NDOG', width / 2, height / 2);

      // Save the reward image
      var rewardImage = ctx.getImageData(0, 0, width, height);

      // Draw the gold scratch surface
      ctx.fillStyle = '#c9a227';
      ctx.fillRect(0, 0, width, height);

      // Add some sparkle pattern to the gold surface
      ctx.fillStyle = '#e8c84a';
      for (var i = 0; i < 60; i++) {
        var sx = Math.random() * width;
        var sy = Math.random() * height;
        ctx.beginPath();
        ctx.arc(sx, sy, Math.random() * 2 + 0.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // "Scratch here" text
      ctx.fillStyle = '#8b6914';
      ctx.font = 'bold ' + Math.max(14, Math.round(width / 14)) + 'px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText((this.language === 'ar') ? '\u0627\u062E\u0637\u0634 \u0647\u0646\u0627' : 'Scratch here', width / 2, height / 2);

      var totalPixels = width * height;

      // Scratch interaction handlers
      function getPos(e) {
        var rect = canvas.getBoundingClientRect();
        var scaleX = width / rect.width;
        var scaleY = height / rect.height;
        if (e.touches && e.touches.length > 0) {
          return {
            x: (e.touches[0].clientX - rect.left) * scaleX,
            y: (e.touches[0].clientY - rect.top) * scaleY
          };
        }
        return {
          x: (e.clientX - rect.left) * scaleX,
          y: (e.clientY - rect.top) * scaleY
        };
      }

      function scratch(e) {
        if (isRevealed) return;
        e.preventDefault();
        var pos = getPos(e);

        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 20, 0, Math.PI * 2);
        ctx.fill();

        // Check percentage scratched
        var imageData = ctx.getImageData(0, 0, width, height);
        var scratched = 0;
        for (var p = 3; p < imageData.data.length; p += 4) {
          if (imageData.data[p] === 0) scratched++;
        }
        var percent = (scratched / totalPixels) * 100;

        if (percent > 60) {
          isRevealed = true;
          // Reveal full reward
          ctx.globalCompositeOperation = 'source-over';
          ctx.putImageData(rewardImage, 0, 0);

          // Add to balance
          if (window.NDOG.Claim && window.NDOG.Claim.addBalance) {
            window.NDOG.Claim.addBalance(reward, 'scratch');
          } else if (window.NDOG.Auth && window.NDOG.Auth.addBalance) {
            window.NDOG.Auth.addBalance(reward, 'scratch');
          }

          // Notification
          if (window.NDOG.Notify && window.NDOG.Notify.success) {
            window.NDOG.Notify.success('\u{1F4A1} +' + reward + ' NDOG from Scratch Card!');
          }
        }
      }

      // Mouse events
      canvas.addEventListener('mousedown', function (e) { scratch(e); });
      canvas.addEventListener('mousemove', function (e) {
        if (e.buttons === 1) scratch(e);
      });

      // Touch events
      canvas.addEventListener('touchstart', function (e) { scratch(e); }, { passive: false });
      canvas.addEventListener('touchmove', function (e) { scratch(e); }, { passive: false });
    },

    /* ──────────────────────────────────────────────────
       TREASURE HUNT
    ────────────────────────────────────────────────── */

    /**
     * Initialize the treasure hunt game.
     * Creates a 3x3 grid with 1-3 hidden treasures.
     * Player clicks to reveal spots; finding a treasure earns a reward.
     */
    initTreasureHunt: function () {
      var self = this;
      var container = document.getElementById('treasureGrid');
      if (!container) return;

      container.innerHTML = '';

      // Game state
      var gridSize = 9; // 3x3
      var treasureCount = Math.floor(Math.random() * 3) + 1; // 1-3 treasures
      var treasures = [];
      var revealed = [];
      var found = 0;
      var totalRevealed = 0;

      // Place treasures randomly
      var used = {};
      while (treasures.length < treasureCount) {
        var idx = Math.floor(Math.random() * gridSize);
        if (!used[idx]) {
          used[idx] = true;
          treasures.push(idx);
        }
      }

      // Generate reward for each treasure (10-100 NDOG)
      var treasureRewards = [];
      for (var t = 0; t < treasureCount; t++) {
        treasureRewards.push(Math.floor(Math.random() * 91) + 10);
      }

      // Create grid cells
      for (var i = 0; i < gridSize; i++) {
        var cell = document.createElement('button');
        cell.className = 'treasure-cell';
        cell.setAttribute('data-index', i);
        cell.textContent = '\u{1F30D}'; // Globe emoji for unrevealed
        cell.style.cssText = 'width:80px;height:80px;border-radius:12px;border:2px solid #1a3a5c;' +
          'background:#0d1f3c;font-size:2rem;cursor:pointer;transition:all .2s;display:inline-flex;' +
          'align-items:center;justify-content:center;margin:4px;';

        (function (index, cellEl) {
          cellEl.addEventListener('click', function () {
            if (cellEl.classList.contains('revealed') || totalRevealed >= gridSize) return;

            cellEl.classList.add('revealed');
            totalRevealed++;

            // Check if this is a treasure
            var treasureIdx = treasures.indexOf(index);
            if (treasureIdx !== -1) {
              found++;
              var reward = treasureRewards[treasureIdx];
              cellEl.textContent = '\u{1F4E6}'; // Package emoji
              cellEl.style.background = 'linear-gradient(135deg, #ffd700, #ffaa00)';
              cellEl.style.borderColor = '#ffd700';

              // Show reward text below grid
              var rewardEl = document.createElement('div');
              rewardEl.style.cssText = 'text-align:center;margin-top:8px;color:#ffd700;font-weight:700;font-size:1.1rem;';
              rewardEl.textContent = '\u{1F389} +' + reward + ' NDOG!';
              container.parentNode.appendChild(rewardEl);

              // Add to balance
              if (window.NDOG.Claim && window.NDOG.Claim.addBalance) {
                window.NDOG.Claim.addBalance(reward, 'treasure');
              } else if (window.NDOG.Auth && window.NDOG.Auth.addBalance) {
                window.NDOG.Auth.addBalance(reward, 'treasure');
              }

              // Notification
              if (window.NDOG.Notify && window.NDOG.Notify.success) {
                window.NDOG.Notify.success('\u{1F389} Treasure found! +' + reward + ' NDOG!');
              }
            } else {
              cellEl.textContent = '\u{1F32B}'; // Wind emoji for empty
              cellEl.style.background = '#1a2a44';
              cellEl.style.borderColor = '#2a3a5c';
              cellEl.style.opacity = '0.6';
            }

            // Check if all spots are revealed
            if (totalRevealed >= gridSize) {
              // Show summary
              var summary = document.createElement('div');
              summary.style.cssText = 'text-align:center;margin-top:12px;padding:12px;color:#fff;font-size:1rem;';
              summary.textContent = (self.language === 'ar')
                ? '\u{1F3C1} \u0627\u0646\u062A\u0647\u0629 \u0627\u0644\u0644\u0639\u0628\u0629! \u0648\u062C\u062F\u062A ' + found + ' \u0645\u0646 ' + treasureCount + ' \u0643\u0646\u0648\u0632'
                : '\u{1F3C1} Game over! Found ' + found + ' of ' + treasureCount + ' treasures';
              container.parentNode.appendChild(summary);
            }
          });
        })(i, cell);

        container.appendChild(cell);
      }
    },

    /* ════════════════════════════════════════════════════
       PRELOADER
    ════════════════════════════════════════════════════ */

    /**
     * Hide the loading preloader with a fade-out animation.
     */
    hidePreloader: function () {
      var preloader = document.getElementById('preloader');
      if (preloader) {
        preloader.classList.add('done');
        setTimeout(function () {
          if (preloader.parentNode) {
            preloader.remove();
          }
        }, 600);
      }
    },

    /* ════════════════════════════════════════════════════
       USER PROFILE REFRESH
    ════════════════════════════════════════════════════ */

    /**
     * Refresh the user profile and update the dashboard.
     * Reads the latest profile from Firebase (via Auth module) and re-renders.
     * @param {string} uid - User ID
     */
    refreshProfile: function (uid) {
      var self = this;
      if (!uid || !window.NDOG.Auth) return;

      // Re-read user profile from Firebase
      if (window.NDOG.Auth.getProfile) {
        var profile = window.NDOG.Auth.getProfile();
        if (profile) {
          self.updateDashboard(profile);
        }
      }
    }
  };
})();

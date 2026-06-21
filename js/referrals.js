/**
 * NileDogs (NDOG) — Referral System Module
 * --------------------------------------------
 * Manages the referral UI: stat rendering, share buttons, QR code
 * generation, and referral tree display.
 *
 * Depends on:
 *   - window.NDOG.userProfile  (set by auth.js after login)
 *   - window.NDOG.DB           (set by database.js)
 *   - window.NDOG.Notify       (set by notifications.js)
 *
 * HTML elements it looks for (optional — gracefully degrades):
 *   - #refCode, #refLink, #refCount, #refEarnings, #refTree
 *   - [data-share-whatsapp], [data-share-telegram], [data-share-facebook],
 *     [data-share-x], [data-share-messenger], [data-share-copy]
 *   - #qrModal, #qrCanvas
 */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ */
  /*  State                                                               */
  /* ------------------------------------------------------------------ */

  var _unsubReferral = null;
  var _unsubTree = null;
  var _profile = null;

  /* ------------------------------------------------------------------ */
  /*  Helpers                                                             */
  /* ------------------------------------------------------------------ */

  /**
   * Build the full referral URL.
   * @returns {string}
   */
  function getReferralURL() {
    if (!_profile || !_profile.referralCode) return window.location.origin || '';
    var base = window.location.origin + window.location.pathname;
    return base + '?ref=' + encodeURIComponent(_profile.referralCode);
  }

  /**
   * Safe DOM query — returns null if element doesn't exist.
   * @param {string} sel
   * @returns {HTMLElement|null}
   */
  function $(sel) {
    return document.querySelector(sel);
  }

  /**
   * Escape a string for safe HTML insertion.
   * @param {string} str
   * @returns {string}
   */
  function esc(str) {
    var d = document.createElement('div');
    d.appendChild(document.createTextNode(str || ''));
    return d.innerHTML;
  }

  /**
   * Format a number with commas: 12345 → "12,345"
   * @param {number} n
   * @returns {string}
   */
  function fmt(n) {
    if (typeof n !== 'number' || isNaN(n)) return '0';
    return n.toLocaleString('en-US');
  }

  /**
   * Truncate an Ethereum-style address or long string.
   * @param {string} str
   * @param {number} [maxLen]
   * @returns {string}
   */
  function truncate(str, maxLen) {
    if (!str) return '';
    var max = maxLen || 12;
    if (str.length <= max) return str;
    return str.slice(0, 6) + '...' + str.slice(-4);
  }

  /* ------------------------------------------------------------------ */
  /*  Module                                                              */
  /* ------------------------------------------------------------------ */

  window.NDOG = window.NDOG || {};
  window.NDOG.Referrals = {
    /* ---------------------------------------------------------------- */
    /*  Initialization                                                    */
    /* ---------------------------------------------------------------- */

    /**
     * Called by auth.js after successful login.
     * @param {object} profile – the user's profile data
     */
    init: function (profile) {
      if (!profile) return;
      _profile = profile;

      // Populate static referral info
      this.renderReferralStats(profile);

      // Set up event listeners for share buttons
      this.bindEvents();

      // Start real-time listeners
      this.loadReferralData(profile.uid);
    },

    /* ---------------------------------------------------------------- */
    /*  Data loading                                                      */
    /* ---------------------------------------------------------------- */

    /**
     * Attach Firebase listeners for referral data & tree.
     * @param {string} uid
     */
    loadReferralData: function (uid) {
      var self = this;

      // Listen to referral summary
      if (_unsubReferral) _unsubReferral();
      _unsubReferral = window.NDOG.DB.getReferralData(uid, function (snap) {
        var data = snap.val();
        if (data) {
          self.renderReferralStats(Object.assign({}, _profile, data));
        }
      });

      // Listen to referral tree
      if (_unsubTree) _unsubTree();
      _unsubTree = window.NDOG.DB.getReferralTree(uid, function (snap) {
        var tree = snap.val();
        self.renderReferralTree(tree);
      });
    },

    /* ---------------------------------------------------------------- */
    /*  Render functions                                                   */
    /* ---------------------------------------------------------------- */

    /**
     * Update the referral stat counters in the DOM.
     * @param {object} data – profile + referral data merged
     */
    renderReferralStats: function (data) {
      var codeEl = $('#refCode');
      var linkEl = $('#refLink');
      var countEl = $('#refCount');
      var earningsEl = $('#refEarnings');

      if (codeEl) codeEl.textContent = data.referralCode || '';
      if (linkEl) linkEl.textContent = getReferralURL();
      if (countEl) countEl.textContent = fmt(data.referralCount || 0);
      if (earningsEl) earningsEl.textContent = fmt(data.referralEarnings || 0);
    },

    /**
     * Render the referral tree (directly referred users) into #refTree.
     * @param {object|null} tree – snapshot.val() of the tree query
     */
    renderReferralTree: function (tree) {
      var container = $('#refTree');
      if (!container) return;

      if (!tree) {
        container.innerHTML =
          '<div class="ref-tree__empty" style="text-align:center;color:#64748b;padding:24px 0;">' +
          '<p>No referrals yet. Share your link to start earning!</p>' +
          '</div>';
        return;
      }

      var users = Object.keys(tree).map(function (key) {
        var u = tree[key];
        u._uid = key;
        return u;
      });

      // Sort by createdAt descending (most recent first)
      users.sort(function (a, b) {
        return (b.createdAt || 0) - (a.createdAt || 0);
      });

      if (users.length === 0) {
        container.innerHTML =
          '<div class="ref-tree__empty" style="text-align:center;color:#64748b;padding:24px 0;">' +
          '<p>No referrals yet. Share your link to start earning!</p>' +
          '</div>';
        return;
      }

      var html = '<div class="ref-tree__list" style="display:flex;flex-direction:column;gap:10px;">';

      users.forEach(function (u) {
        var date = u.createdAt
          ? new Date(u.createdAt).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })
          : 'Unknown';

        var name = esc(u.displayName) || 'Anonymous';
        var avatar =
          u.photoURL ||
          'data:image/svg+xml,' +
            encodeURIComponent(
              '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">' +
                '<rect width="40" height="40" rx="20" fill="#334155"/>' +
                '<text x="20" y="25" text-anchor="middle" fill="#fff" font-size="16" font-family="sans-serif">' +
                (name.charAt(0) || '?').toUpperCase() +
                '</text></svg>'
            );

        var earned = u.referralEarnings ? fmt(u.referralEarnings) + ' NDOG' : '—';

        html +=
          '<div class="ref-tree__item" style="display:flex;align-items:center;gap:12px;padding:12px 14px;' +
          'background:rgba(255,255,255,.04);border-radius:12px;border:1px solid rgba(255,255,255,.06);">' +
          '<img src="' + esc(avatar) + '" alt="" style="width:40px;height:40px;border-radius:50%;object-fit:cover;flex-shrink:0;" onerror="this.style.display=\'none\'" />' +
          '<div style="flex:1;min-width:0;">' +
          '<div style="font-weight:600;font-size:14px;color:#e2e8f0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' +
          name + '</div>' +
          '<div style="font-size:12px;color:#64748b;margin-top:2px;">Joined ' + date + '</div>' +
          '</div>' +
          '<div style="text-align:right;flex-shrink:0;">' +
          '<div style="font-size:13px;font-weight:600;color:#f59e0b;">+50 NDOG</div>' +
          '<div style="font-size:11px;color:#64748b;">from this referral</div>' +
          '</div>' +
          '</div>';
      });

      html += '</div>';
      container.innerHTML = html;
    },

    /* ---------------------------------------------------------------- */
    /*  Share functions                                                    */
    /* ---------------------------------------------------------------- */

    /**
     * Share via WhatsApp.
     */
    shareToWhatsApp: function () {
      var url = getReferralURL();
      var text =
        '🐕 Join NileDogs (NDOG) and earn free crypto! Use my referral link:\n' + url;
      var shareUrl = 'https://wa.me/?text=' + encodeURIComponent(text);
      window.open(shareUrl, '_blank', 'noopener,noreferrer');
      this.trackShare('whatsapp');
    },

    /**
     * Share via Telegram.
     */
    shareToTelegram: function () {
      var url = getReferralURL();
      var text =
        '🐕 Join NileDogs (NDOG) and earn free crypto! Use my referral link:';
      var shareUrl =
        'https://t.me/share/url?url=' +
        encodeURIComponent(url) +
        '&text=' +
        encodeURIComponent(text);
      window.open(shareUrl, '_blank', 'noopener,noreferrer');
      this.trackShare('telegram');
    },

    /**
     * Share via Facebook.
     */
    shareToFacebook: function () {
      var url = getReferralURL();
      var shareUrl =
        'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(url);
      window.open(shareUrl, '_blank', 'noopener,noreferrer,width=600,height=400');
      this.trackShare('facebook');
    },

    /**
     * Share via X (Twitter).
     */
    shareToX: function () {
      var url = getReferralURL();
      var text =
        '🐕 Join NileDogs (NDOG) — earn free crypto with my referral link!';
      var shareUrl =
        'https://twitter.com/intent/tweet?text=' +
        encodeURIComponent(text) +
        '&url=' +
        encodeURIComponent(url);
      window.open(shareUrl, '_blank', 'noopener,noreferrer,width=600,height=400');
      this.trackShare('x');
    },

    /**
     * Share via Facebook Messenger.
     */
    shareToMessenger: function () {
      var url = getReferralURL();
      var shareUrl =
        'https://www.facebook.com/dialog/send?link=' +
        encodeURIComponent(url) +
        '&app_id=&redirect_uri=' +
        encodeURIComponent(window.location.origin + '/');
      window.open(shareUrl, '_blank', 'noopener,noreferrer,width=600,height=400');
      this.trackShare('messenger');
    },

    /**
     * Copy referral link to clipboard.
     */
    copyRefLink: function () {
      var url = getReferralURL();
      if (!url) {
        window.NDOG.Notify.warning('No referral link available.');
        return;
      }

      // Try modern clipboard API first
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard
          .writeText(url)
          .then(function () {
            window.NDOG.Notify.success('Referral link copied to clipboard!');
          })
          .catch(function () {
            fallbackCopy(url);
          });
      } else {
        fallbackCopy(url);
      }

      this.trackShare('copy');
    },

    /**
     * Show a QR code modal with the referral URL encoded.
     * Uses the external QR code API to generate the image.
     */
    showQRCode: function () {
      var url = getReferralURL();
      if (!url) {
        window.NDOG.Notify.warning('No referral link available.');
        return;
      }

      // Check if modal already exists
      var modal = $('#qrModal');

      if (!modal) {
        // Create modal
        modal = document.createElement('div');
        modal.id = 'qrModal';
        modal.style.cssText =
          'position:fixed;inset:0;z-index:90000;display:flex;align-items:center;justify-content:center;' +
          'background:rgba(0,0,0,.6);backdrop-filter:blur(4px);opacity:0;transition:opacity .25s ease;';

        modal.innerHTML =
          '<div style="background:#1a1a2e;border-radius:16px;padding:32px;max-width:320px;width:90%;text-align:center;position:relative;">' +
          '<button id="qrModalClose" style="position:absolute;top:12px;right:14px;background:none;border:none;color:#94a3b8;cursor:pointer;font-size:22px;line-height:1;">&times;</button>' +
          '<h3 style="color:#e2e8f0;font-size:18px;font-weight:700;margin:0 0 6px;">Scan QR Code</h3>' +
          '<p style="color:#64748b;font-size:13px;margin:0 0 20px;">Share with friends to earn 50 NDOG per referral!</p>' +
          '<div style="background:#fff;border-radius:12px;padding:16px;display:inline-block;">' +
          '<img id="qrImage" src="" alt="QR Code" style="width:200px;height:200px;display:block;" />' +
          '</div>' +
          '<p id="qrCodeText" style="color:#94a3b8;font-size:12px;margin:16px 0 0;word-break:break-all;user-select:all;"></p>' +
          '</div>';

        document.body.appendChild(modal);

        // Close handlers
        document.getElementById('qrModalClose').addEventListener('click', function () {
          window.NDOG.Referrals.hideQRCode();
        });
        modal.addEventListener('click', function (e) {
          if (e.target === modal) {
            window.NDOG.Referrals.hideQRCode();
          }
        });
      }

      // Update QR image
      var qrImg = $('#qrImage');
      var qrText = $('#qrCodeText');
      if (qrImg) {
        qrImg.src =
          'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' +
          encodeURIComponent(url) +
          '&bgcolor=ffffff&color=1a1a2e';
      }
      if (qrText) {
        qrText.textContent = _profile ? _profile.referralCode : '';
      }

      // Show with fade-in
      modal.style.display = 'flex';
      // Trigger reflow then set opacity
      modal.offsetHeight;
      modal.style.opacity = '1';

      this.trackShare('qr');
    },

    /**
     * Hide the QR code modal.
     */
    hideQRCode: function () {
      var modal = $('#qrModal');
      if (!modal) return;
      modal.style.opacity = '0';
      setTimeout(function () {
        modal.style.display = 'none';
      }, 250);
    },

    /* ---------------------------------------------------------------- */
    /*  Event binding                                                      */
    /* ---------------------------------------------------------------- */

    /**
     * Bind click handlers to share buttons in the DOM.
     */
    bindEvents: function () {
      var self = this;

      var handlers = {
        '[data-share-whatsapp]': function () {
          self.shareToWhatsApp();
        },
        '[data-share-telegram]': function () {
          self.shareToTelegram();
        },
        '[data-share-facebook]': function () {
          self.shareToFacebook();
        },
        '[data-share-x]': function () {
          self.shareToX();
        },
        '[data-share-messenger]': function () {
          self.shareToMessenger();
        },
        '[data-share-copy]': function () {
          self.copyRefLink();
        },
        '[data-share-qr]': function () {
          self.showQRCode();
        },
      };

      Object.keys(handlers).forEach(function (sel) {
        var els = document.querySelectorAll(sel);
        for (var i = 0; i < els.length; i++) {
          (function (el, fn) {
            el.addEventListener('click', function (e) {
              e.preventDefault();
              e.stopPropagation();
              fn();
            });
          })(els[i], handlers[sel]);
        }
      });

      // Also bind by ID for convenience
      var btnCopy = $('#btnCopyRef');
      if (btnCopy) {
        btnCopy.addEventListener('click', function (e) {
          e.preventDefault();
          self.copyRefLink();
        });
      }

      var btnQR = $('#btnShowQR');
      if (btnQR) {
        btnQR.addEventListener('click', function (e) {
          e.preventDefault();
          self.showQRCode();
        });
      }
    },

    /* ---------------------------------------------------------------- */
    /*  Analytics tracking                                                 */
    /* ---------------------------------------------------------------- */

    /**
     * Record a share event (fire-and-forget).
     * @param {string} platform
     */
    trackShare: function (platform) {
      try {
        var uid = window.NDOG.currentUser ? window.NDOG.currentUser.uid : null;
        if (!uid || !window.NDOG.db) return;

        window.NDOG.db.ref('shareEvents').push({
          uid: uid,
          platform: platform,
          referralCode: _profile ? _profile.referralCode : '',
          timestamp: window.firebase.database.ServerValue.TIMESTAMP,
        });
      } catch (e) {
        // silent
      }
    },

    /* ---------------------------------------------------------------- */
    /*  Cleanup                                                            */
    /* ---------------------------------------------------------------- */

    /**
     * Unsubscribe from all Firebase listeners.
     * Call this on logout.
     */
    destroy: function () {
      if (_unsubReferral) {
        _unsubReferral();
        _unsubReferral = null;
      }
      if (_unsubTree) {
        _unsubTree();
        _unsubTree = null;
      }
      _profile = null;

      // Remove QR modal if present
      var modal = $('#qrModal');
      if (modal) modal.remove();
    },
  };

  /* ------------------------------------------------------------------ */
  /*  Fallback clipboard copy (for older browsers / HTTP contexts)        */
  /* ------------------------------------------------------------------ */

  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText =
      'position:fixed;left:-9999px;top:-9999px;opacity:0;';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try {
      var ok = document.execCommand('copy');
      if (ok) {
        window.NDOG.Notify.success('Referral link copied to clipboard!');
      } else {
        window.NDOG.Notify.error('Could not copy. Please copy the link manually.');
      }
    } catch (e) {
      window.NDOG.Notify.error('Could not copy. Please copy the link manually.');
    }
    document.body.removeChild(ta);
  }
})();
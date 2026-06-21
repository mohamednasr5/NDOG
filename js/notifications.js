/**
 * NileDogs (NDOG) — Toast Notification System
 * -----------------------------------------------
 * Lightweight, CSS-animated toast notifications.
 * Renders into `#toastHost`.  The host element must exist in the HTML:
 *
 *   <div id="toastHost"></div>
 *
 * Toast types: 'success', 'error', 'warning', 'info'
 * Each toast auto-removes itself after the given duration (default 4 s).
 */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ */
  /*  Helpers                                                             */
  /* ------------------------------------------------------------------ */

  /**
   * Map toast type → icon SVG string.
   * Uses simple inline SVG so no icon library is required.
   */
  var ICONS = {
    success:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="toast__icon"><polyline points="20 6 9 17 4 12"></polyline></svg>',
    error:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="toast__icon"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>',
    warning:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="toast__icon"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>',
    info:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="toast__icon"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>',
  };

  /**
   * Ensure the host container exists in the DOM. If it doesn't, create it
   * and append to <body> with the correct positioning styles.
   * @returns {HTMLElement}
   */
  function ensureHost() {
    var host = document.getElementById('toastHost');
    if (host) return host;

    host = document.createElement('div');
    host.id = 'toastHost';
    host.style.cssText =
      'position:fixed;top:20px;right:20px;z-index:99999;display:flex;flex-direction:column;gap:10px;pointer-events:none;max-width:380px;width:100%;';
    document.body.appendChild(host);
    return host;
  }

  /**
   * Inject the toast animation keyframes if they don't exist yet.
   */
  function ensureStyles() {
    if (document.getElementById('ndog-toast-styles')) return;

    var style = document.createElement('style');
    style.id = 'ndog-toast-styles';
    style.textContent = [
      '@keyframes toastIn {',
      '  from { transform: translateX(120%); opacity: 0; }',
      '  to   { transform: translateX(0);    opacity: 1; }',
      '}',
      '@keyframes toastOut {',
      '  from { transform: translateX(0);    opacity: 1; }',
      '  to   { transform: translateX(120%); opacity: 0; }',
      '}',
      '.toast {',
      '  pointer-events: auto;',
      '  display: flex;',
      '  align-items: center;',
      '  gap: 10px;',
      '  padding: 14px 18px;',
      '  border-radius: 10px;',
      '  font-size: 14px;',
      '  line-height: 1.45;',
      '  color: #fff;',
      '  background: #1e1e2e;',
      '  box-shadow: 0 8px 30px rgba(0,0,0,.25);',
      '  animation: toastIn .35s cubic-bezier(.21,1.02,.73,1) forwards;',
      '  word-break: break-word;',
      '  border-left: 4px solid transparent;',
      '}',
      '.toast--success { border-left-color: #22c55e; }',
      '.toast--success .toast__icon { color: #22c55e; }',
      '.toast--error   { border-left-color: #ef4444; }',
      '.toast--error .toast__icon   { color: #ef4444; }',
      '.toast--warning { border-left-color: #f59e0b; }',
      '.toast--warning .toast__icon { color: #f59e0b; }',
      '.toast--info    { border-left-color: #3b82f6; }',
      '.toast--info .toast__icon    { color: #3b82f6; }',
      '.toast.removing {',
      '  animation: toastOut .3s ease-in forwards;',
      '}',
      '.toast__icon {',
      '  flex-shrink: 0;',
      '  width: 22px;',
      '  height: 22px;',
      '}',
      '.toast__msg { flex: 1; }',
    ].join('\n');
    document.head.appendChild(style);
  }

  /* ------------------------------------------------------------------ */
  /*  Module                                                              */
  /* ------------------------------------------------------------------ */

  window.NDOG = window.NDOG || {};
  window.NDOG.Notify = {
    /**
     * Show a toast notification.
     * @param {string}  message   – text to display
     * @param {string}  [type]    – 'success' | 'error' | 'warning' | 'info'
     * @param {number}  [duration] – ms before auto-remove (default 4000)
     */
    show: function (message, type, duration) {
      ensureStyles();
      var host = ensureHost();
      if (!host) return;

      var t = (type || 'info').toLowerCase();
      var icon = ICONS[t] || ICONS.info;

      var toast = document.createElement('div');
      toast.className = 'toast toast--' + t;
      toast.innerHTML =
        icon + '<span class="toast__msg">' + escapeHtml(message) + '</span>';
      host.appendChild(toast);

      var ms = typeof duration === 'number' ? duration : 4000;

      setTimeout(function () {
        toast.classList.add('removing');
        setTimeout(function () {
          if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 300);
      }, ms);
    },

    /** Shorthand: success toast (green). */
    success: function (msg) {
      this.show(msg, 'success');
    },

    /** Shorthand: error toast (red, 6 s). */
    error: function (msg) {
      this.show(msg, 'error', 6000);
    },

    /** Shorthand: warning toast (amber). */
    warning: function (msg) {
      this.show(msg, 'warning');
    },

    /** Shorthand: info toast (blue). */
    info: function (msg) {
      this.show(msg, 'info');
    },
  };

  /* ------------------------------------------------------------------ */
  /*  Internal                                                            */
  /* ------------------------------------------------------------------ */

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }
})();
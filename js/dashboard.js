/**
 * FILE NAME: js/dashboard.js
 * PURPOSE: Renders the user dashboard. Subscribes to user profile in realtime,
 *          computes derived metrics (rank, mining status), and updates DOM.
 * DEPENDENCIES: firebase.js, auth.js, database.js, utils.js, i18n.js, charts.js (optional)
 * EXPORTS: dashboard.init, dashboard.refresh
 */

import { auth } from "./auth.js";
import { db, PATHS } from "./database.js";
import { $, $$, formatNDOG, formatNumber, timeAgo, safeHTML, showToast } from "./utils.js";
import { i18n } from "./i18n.js";

let _unsub = null;

export const dashboard = {
  init() {
    auth.onReady((user) => {
      if (!user) {
        this._renderGuest();
        return;
      }
      if (_unsub) _unsub();
      _unsub = db.users.on(user.uid, (snap) => {
        const profile = snap.val();
        if (!profile) return;
        this._render(profile);
        this._renderNotifications(user.uid);
      });
    });
  },

  _renderGuest() {
    const root = $("#dashboard-root");
    if (!root) return;
    root.innerHTML = `
      <div class="card card--guest">
        <div class="guest__logo">
          <img src="/assets/icons/icon-512.png" alt="NDOG" width="120" height="120" />
        </div>
        <h2 data-i18n="auth.welcome">Welcome to NileDogs</h2>
        <p>Sign in to start mining NDOG, claim daily rewards, and join the pack.</p>
        <button class="btn btn--primary btn--lg" id="guest-signin">
          <svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M21.35 11.1H12v2.8h5.35c-.5 2.4-2.65 4.1-5.35 4.1-3.2 0-5.8-2.6-5.8-5.8s2.6-5.8 5.8-5.8c1.45 0 2.75.5 3.8 1.45l2-2C16.45 3.85 14.4 3 12 3 7 3 3 7 3 12s4 9 9 9c5.4 0 9-3.85 9-9 0-.65-.05-1.25-.15-1.9z"/></svg>
          <span data-i18n="auth.login">Sign in with Google</span>
        </button>
      </div>`;
    $("#guest-signin")?.addEventListener("click", () => auth.signIn());
    i18n.apply(root);
  },

  _render(p) {
    const root = $("#dashboard-root");
    if (!root) return;
    const miningReady = !p.lastClaimAt || Date.now() - p.lastClaimAt >= 24 * 3600 * 1000;
    const nextClaimIn = p.lastClaimAt ? Math.max(0, p.lastClaimAt + 24 * 3600 * 1000 - Date.now()) : 0;

    root.innerHTML = `
      <div class="dash-grid">
        <div class="card card--balance">
          <div class="card__label" data-i18n="dash.balance">Balance</div>
          <div class="card__value">${formatNDOG(p.balance || 0)}</div>
          <div class="card__sub">${safeHTML(p.displayName || "Anon NDOG")}</div>
          ${p.founder ? '<span class="badge badge--founder">★ Founder</span>' : ""}
          ${p.vipLevel > 0 ? `<span class="badge badge--vip">VIP ${p.vipLevel}</span>` : ""}
        </div>

        <div class="card card--score">
          <div class="card__label" data-i18n="dash.community">Community Score</div>
          <div class="card__value">${formatNumber(p.communityScore || 0)}</div>
        </div>

        <div class="card card--score">
          <div class="card__label" data-i18n="dash.loyalty">Loyalty Score</div>
          <div class="card__value">${formatNumber(p.loyaltyScore || 0)}</div>
        </div>

        <div class="card card--rank">
          <div class="card__label" data-i18n="dash.rank">Rank</div>
          <div class="card__value">#${formatNumber(p.globalRank || "—")}</div>
          <div class="card__sub" data-i18n="dash.countryRank">Country Rank</div>
          <div class="card__sub">#${formatNumber(p.countryRank || "—")}</div>
        </div>

        <div class="card card--mining ${miningReady ? "is-ready" : "is-cooldown"}">
          <div class="card__label" data-i18n="dash.mining">Mining Status</div>
          <div class="card__value">${miningReady ? "Ready ✓" : "Cooldown"}</div>
          ${!miningReady ? `<div class="card__sub" id="mining-countdown" data-ends="${p.lastClaimAt + 24 * 3600 * 1000}">${this._fmtCountdown(nextClaimIn)}</div>` : ""}
          <button class="btn btn--primary" id="quick-claim" ${miningReady ? "" : "disabled"}>
            <span data-i18n="claim.button">Claim Now</span>
          </button>
        </div>

        <div class="card card--streak">
          <div class="card__label" data-i18n="claim.streak">Streak</div>
          <div class="card__value">${formatNumber(p.streak || 0)} 🔥</div>
          <div class="card__sub">Best: ${formatNumber(p.bestStreak || 0)}</div>
        </div>

        <div class="card card--ref">
          <div class="card__label" data-i18n="ref.total">Total Referrals</div>
          <div class="card__value">${formatNumber(p.referralCount || 0)}</div>
          <a href="/referral.html" class="btn btn--ghost">View Tree →</a>
        </div>

        <div class="card card--vip">
          <div class="card__label" data-i18n="dash.vip">VIP Level</div>
          <div class="card__value">Lv ${p.vipLevel || 0}</div>
          <div class="progress"><div class="progress__bar" style="width:${((p.vipProgress || 0) * 100).toFixed(0)}%"></div></div>
        </div>

        <div class="card card--notif">
          <div class="card__label" data-i18n="dash.notifications">Notifications</div>
          <ul class="notif-list" id="notif-list"><li class="muted">Loading…</li></ul>
        </div>
      </div>
    `;
    i18n.apply(root);
    $("#quick-claim")?.addEventListener("click", () => {
      import("./claim.js").then((m) => m.claim.now());
    });
    if (!miningReady) this._startCountdown();
  },

  _renderNotifications(uid) {
    const list = $("#notif-list");
    if (!list) return;
    db.on(`${PATHS.notifications}/${uid}`, (snap) => {
      const val = snap.val() || {};
      const items = Object.entries(val).sort((a, b) => (b[1].ts || 0) - (a[1].ts || 0)).slice(0, 5);
      if (items.length === 0) {
        list.innerHTML = '<li class="muted">No notifications yet.</li>';
        return;
      }
      list.innerHTML = items
        .map(
          ([k, n]) => `
        <li class="notif notif--${n.type || "info"} ${n.read ? "is-read" : ""}" data-id="${k}">
          <div class="notif__title">${safeHTML(n.title)}</div>
          <div class="notif__body">${safeHTML(n.body || "")}</div>
          <div class="notif__ts">${timeAgo(n.ts)}</div>
        </li>`
        )
        .join("");
    });
  },

  _startCountdown() {
    const el = $("#mining-countdown");
    if (!el) return;
    const ends = Number(el.dataset.ends);
    const tick = () => {
      const remaining = ends - Date.now();
      if (remaining <= 0) {
        el.textContent = "Ready!";
        return;
      }
      el.textContent = this._fmtCountdown(remaining);
      requestAnimationFrame(() => setTimeout(tick, 1000));
    };
    tick();
  },

  _fmtCountdown(ms) {
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  }
};

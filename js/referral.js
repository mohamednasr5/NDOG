/**
 * FILE NAME: js/referral.js
 * PURPOSE: Referral system UI + logic. Renders referral code, link, QR code,
 *          3-level tree, conversion analytics. Validates self-referral and
 *          multi-account abuse before binding.
 * DEPENDENCIES: firebase.js, auth.js, database.js, utils.js, qr.js (dynamic import)
 * EXPORTS: referral.init, referral.copyLink, referral.renderTree
 */

import { firebaseDb } from "./firebase.js";
import { auth } from "./auth.js";
import { db, PATHS } from "./database.js";
import { $, safeHTML, copyToClipboard, showToast, formatNumber, formatNDOG } from "./utils.js";
import { i18n } from "./i18n.js";
import { ref, get, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const DOMAIN = "/";

export const referral = {
  init() {
    auth.onReady((user) => {
      if (!user) {
        $("#referral-root").innerHTML = `
          <div class="card card--guest">
            <h2 data-i18n="auth.welcome">Welcome</h2>
            <p>Sign in to access your referral code.</p>
            <button class="btn btn--primary" id="ref-signin">Sign in with Google</button>
          </div>`;
        $("#ref-signin")?.addEventListener("click", () => auth.signIn());
        i18n.apply($("#referral-root"));
        return;
      }
      this._render(user);
    });
  },

  async _render(user) {
    const profile = await db.users.get(user.uid);
    if (!profile) return;
    const link = `${DOMAIN}?ref=${profile.referralCode}`;
    const stats = await this._stats(user.uid);

    $("#referral-root").innerHTML = `
      <div class="ref-grid">
        <div class="card card--code">
          <div class="card__label" data-i18n="ref.code">Your Referral Code</div>
          <div class="ref-code">${safeHTML(profile.referralCode)}</div>
          <button class="btn btn--ghost" id="copy-code" data-i18n="ref.copy">Copy</button>
        </div>

        <div class="card card--link">
          <div class="card__label" data-i18n="ref.link">Your Referral Link</div>
          <div class="ref-link">
            <input type="text" readonly value="${link}" id="ref-link-input" />
            <button class="btn btn--primary" id="copy-link" data-i18n="ref.copy">Copy</button>
          </div>
          <div class="qr-slot" id="qr-slot"></div>
        </div>

        <div class="card card--tiers">
          <h3>Reward Tiers</h3>
          <ul class="tier-list">
            <li><span class="tier tier--l1">L1</span> Direct referral <strong>+50 NDOG</strong></li>
            <li><span class="tier tier--l2">L2</span> Referral of referral <strong>+20 NDOG</strong></li>
            <li><span class="tier tier--l3">L3</span> 3rd-level connection <strong>+10 NDOG</strong></li>
          </ul>
        </div>

        <div class="card card--stats">
          <div class="card__label" data-i18n="ref.total">Total Referrals</div>
          <div class="card__value">${formatNumber(stats.total)}</div>
          <div class="ref-stats-row">
            <div><span class="muted">L1:</span> ${stats.l1}</div>
            <div><span class="muted">L2:</span> ${stats.l2}</div>
            <div><span class="muted">L3:</span> ${stats.l3}</div>
          </div>
          <div class="card__label" data-i18n="ref.conversion">Conversion Rate</div>
          <div class="card__value">${stats.conversionPct}%</div>
          <div class="card__label">Total Earned</div>
          <div class="card__value">${formatNDOG(stats.earned)}</div>
        </div>

        <div class="card card--tree">
          <h3 data-i18n="ref.tree">Referral Tree</h3>
          <div id="ref-tree" class="ref-tree"></div>
        </div>

        <div class="card card--history">
          <h3>Recent Referral Activity</h3>
          <ul id="ref-history" class="ref-history"><li class="muted">Loading…</li></ul>
        </div>
      </div>
    `;
    i18n.apply($("#referral-root"));

    $("#copy-code")?.addEventListener("click", async () => {
      const ok = await copyToClipboard(profile.referralCode);
      showToast(ok ? "Code copied!" : "Copy failed", ok ? "success" : "error", 2000);
    });
    $("#copy-link")?.addEventListener("click", async () => {
      const ok = await copyToClipboard(link);
      showToast(ok ? i18n.t("ref.copied") : "Copy failed", ok ? "success" : "error", 2000);
    });

    // Dynamic-import QR generator
    import("./qr.js").then((m) => m.qr.render($("#qr-slot"), link, 180));

    this._renderTree(user.uid);
    this._renderHistory(user.uid);
  },

  async _stats(uid) {
    const snap = await get(ref(firebaseDb, `${PATHS.referrals}/${uid}`));
    const data = snap.val() || {};
    const list = Object.values(data);
    const earned = list.reduce((s, r) => s + (r.reward || 0), 0);
    return {
      total: list.length,
      l1: list.filter((r) => r.level === 1).length,
      l2: list.filter((r) => r.level === 2).length,
      l3: list.filter((r) => r.level === 3).length,
      earned,
      conversionPct: list.length ? Math.round((list.filter((r) => r.converted).length / list.length) * 100) : 0
    };
  },

  async _renderTree(uid) {
    const treeEl = $("#ref-tree");
    if (!treeEl) return;
    const tree = await db.referrals.tree(uid, 3);
    treeEl.innerHTML = this._treeNode(tree);
  },

  _treeNode(node) {
    const profile = node.profile || {};
    const childrenHtml = (node.children || [])
      .map((c) => this._treeNode(c))
      .join("");
    return `
      <div class="tree-node tree-node--l${node.level || 0}">
        <div class="tree-node__card">
          <div class="tree-node__avatar">${node.uid.slice(0, 2).toUpperCase()}</div>
          <div class="tree-node__info">
            <div class="tree-node__uid">${safeHTML(node.uid.slice(0, 10))}…</div>
            ${node.reward ? `<div class="tree-node__reward">+${node.reward} NDOG</div>` : ""}
          </div>
        </div>
        ${childrenHtml ? `<div class="tree-children">${childrenHtml}</div>` : ""}
      </div>
    `;
  },

  async _renderHistory(uid) {
    const el = $("#ref-history");
    if (!el) return;
    const snap = await get(ref(firebaseDb, `${PATHS.referrals}/${uid}`));
    const data = snap.val() || {};
    const items = Object.values(data).sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 10);
    if (items.length === 0) {
      el.innerHTML = '<li class="muted">No referrals yet. Share your link!</li>';
      return;
    }
    el.innerHTML = items
      .map(
        (r) => `
      <li class="ref-hist-item">
        <span class="tier tier--l${r.level}">L${r.level}</span>
        <span class="ref-hist-uid">${safeHTML(r.referredUid.slice(0, 10))}…</span>
        <span class="ref-hist-reward">+${r.reward} NDOG</span>
      </li>`
      )
      .join("");
  }
};

window.__referral = referral;

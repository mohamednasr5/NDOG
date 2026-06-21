/**
 * NileDogs (NDOG) — Referral module
 * shareLink/generateQR are imported from share-utils.js (not defined here)
 * to break the circular dependency: app.js → dashboard.js → referral.js → app.js
 * They are re-exported so any other module that imports them from referral.js still works.
 */

import { db, ref, get, APP_CONFIG } from "./firebase-config.js?v=2.0.5";
import { onUser, getCurrentUser } from "./auth.js?v=2.0.5";
import { animateCount, openModal } from "./utils.js?v=2.0.5";
import { t, getLang, onLangChange } from "./i18n.js?v=2.0.5";
import { shareLink, generateQR } from "./share-utils.js?v=2.0.5";

export { shareLink, generateQR };

let bound = false;

export function initReferral() {
  if (bound) return;
  bound = true;

  let lastUser = null;

  onUser((u) => {
    if (u) {
      lastUser = u;
      renderReferral(u);
    }
  });

  document.addEventListener("click", (e) => {
    const shareBtn = e.target.closest("[data-share]");
    if (!shareBtn) return;

    const u = getCurrentUser();
    if (!u) return;

    const url = `${APP_CONFIG.domain}?ref=${u.referralCode}`;
    shareLink(shareBtn.dataset.share, url);
  });

  document.getElementById("qrTrigger2")?.addEventListener("click", () => {
    const u = getCurrentUser();
    if (!u) return;

    generateQR(`${APP_CONFIG.domain}?ref=${u.referralCode}`);
    openModal("qrModal");
  });

  document.addEventListener("ndogviewchange", (e) => {
    if (e.detail.view === "referral") {
      const u = getCurrentUser();
      if (u) renderReferral(u);
    }
  });

  onLangChange(() => {
    if (lastUser) renderReferral(lastUser);
  });
}

function renderReferral(user) {
  const codeInput = document.getElementById("refCodeInput");
  const linkInput = document.getElementById("refLinkInput");

  if (codeInput) codeInput.value = user.referralCode || "";
  if (linkInput) linkInput.value = `${APP_CONFIG.domain}?ref=${user.referralCode || ""}`;

  animateCount(document.getElementById("refStatTotal"), user.totalReferrals || 0);
  animateCount(
    document.getElementById("refStatEarn"),
    (user.totalReferrals || 0) * APP_CONFIG.referralReward.l1
  );

  loadReferralTree(user);
}

async function loadReferralTree(user) {
  const list = document.getElementById("refTreeList");
  if (!list) return;

  list.innerHTML = `<div class="empty">${t("ref.loading")}</div>`;

  const snap = await get(ref(db, "referrals"));
  if (!snap.exists()) {
    list.innerHTML = `<div class="empty">${t("ref.empty")}</div>`;
    renderRefStats(0, 0);
    return;
  }

  const rows = [];
  snap.forEach((child) => {
    const r = child.val();
    if (r.referrer === user.uid) rows.push(r);
  });

  if (!rows.length) {
    list.innerHTML = `<div class="empty">${t("ref.empty")}</div>`;
    renderRefStats(0, 0);
    return;
  }

  const recent = rows
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .slice(0, 50);

  const usersSnap = await get(ref(db, "users"));
  const usersMap = {};
  if (usersSnap.exists()) {
    usersSnap.forEach((c) => {
      usersMap[c.key] = c.val();
    });
  }

  let active = 0;
  const claimsSnap = await get(ref(db, "claims"));
  const claimers = new Set();

  if (claimsSnap.exists()) {
    claimsSnap.forEach((c) => {
      const val = c.val();
      if (val?.userId) claimers.add(val.userId);
    });
  }

  list.innerHTML = recent
    .map((r) => {
      const u = usersMap[r.referredUser] || {};
      if (claimers.has(r.referredUser)) active++;

      const tier = `L${r.level || 1}`;
      const reward = APP_CONFIG.referralReward[`l${r.level || 1}`] || 0;

      return `
        <div class="ref-row">
          <img
            class="ref-row-avatar"
            src="${u.photoURL || defaultAvatar(u.name)}"
            alt="${escapeHtml(u.name || t("ref.anonymous"))}"
            onerror="this.src='${defaultAvatar(u.name)}'"
          />
          <div class="ref-row-meta">
            <div class="ref-row-name">${escapeHtml(u.name || t("ref.anonymous"))}</div>
            <div class="ref-row-sub">${t("ref.joined", {
              date: formatDate(r.createdAt),
              country: u.country || t("lb.globalLabel")
            })}</div>
          </div>
          <span class="ref-row-tier">${tier} · +${reward}</span>
        </div>
      `;
    })
    .join("");

  renderRefStats(rows.length, active);
}

function renderRefStats(total, active) {
  animateCount(document.getElementById("refStatTotal"), total);
  animateCount(document.getElementById("refStatActive"), active);

  const conv = total ? Math.round((active / total) * 100) : 0;
  const el = document.getElementById("refStatConv");
  if (el) el.textContent = `${conv}%`;
}

function defaultAvatar(name = "N") {
  const seed = String(name || "N").slice(0, 1).toUpperCase();
  return `data:image/svg+xml;utf8,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
      <rect width="64" height="64" rx="32" fill="#0a1f44"/>
      <text
        x="50%"
        y="50%"
        font-size="28"
        font-family="Arial"
        font-weight="bold"
        fill="#ffd700"
        text-anchor="middle"
        dominant-baseline="central"
      >${seed}</text>
    </svg>
  `)}`;
}

function formatDate(ts) {
  if (!ts) return "";
  const locale = getLang() === "ar" ? "ar-EG" : "en-US";
  return new Date(ts).toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[c];
  });
}

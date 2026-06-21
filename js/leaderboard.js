/**
 * NileDogs (NDOG) — Leaderboard module
 */

import { db, ref, onValue, get, query, orderByChild, limitToLast } from "./firebase-config.js?v=2.0.5";
import { onUser, getCurrentUser } from "./auth.js?v=2.0.5";
import { t, getLang, onLangChange } from "./i18n.js?v=2.0.5";

let currentTab = "global";
let currentUser = null;

export function initLeaderboard() {
  onUser((u) => { currentUser = u; });

  document.querySelectorAll("[data-ltab]").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll("[data-ltab]").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      currentTab = tab.dataset.ltab;
      loadLeaderboard();
    });
  });

  document.addEventListener("ndog:viewchange", (e) => {
    if (e.detail.view === "leaderboard") loadLeaderboard();
  });

  onLangChange(() => {
    if (document.getElementById("view-leaderboard")?.classList.contains("view--active")) {
      loadLeaderboard();
    }
  });
}

async function loadLeaderboard() {
  const podium = document.getElementById("lbPodium");
  const list   = document.getElementById("lbList");
  if (!podium || !list) return;
  podium.innerHTML = `<div style="grid-column:1/-1" class="empty">${t("lb.loading")}</div>`;
  list.innerHTML = "";

  const snap = await get(ref(db, "users"));
  if (!snap.exists()) {
    podium.innerHTML = `<div style="grid-column:1/-1" class="empty">${t("lb.noData")}</div>`;
    return;
  }

  let users = [];
  snap.forEach(c => { const u = c.val(); if (!u.banned) users.push(u); });

  if (currentTab === "global") {
    users.sort((a, b) => (b.balance || 0) - (a.balance || 0));
  } else if (currentTab === "country") {
    if (currentUser) users = users.filter(u => u.country === currentUser.country);
    users.sort((a, b) => (b.balance || 0) - (a.balance || 0));
  } else if (currentTab === "referral") {
    users.sort((a, b) => (b.totalReferrals || 0) - (a.totalReferrals || 0));
  }

  const top3 = users.slice(0, 3);
  const podiumOrder = [top3[1], top3[0], top3[2]].filter(Boolean);
  podium.innerHTML = podiumOrder.map((u) => {
    const realRank = top3.indexOf(u) + 1;
    const medals = ["🥇", "🥈", "🥉"];
    return `
      <div class="podium podium--${realRank}">
        <div class="podium__rank">${medals[realRank - 1]}</div>
        <img class="podium__avatar" src="${u.photoURL || defaultAvatar(u.name)}" onerror="this.src='${defaultAvatar()}'" alt=""/>
        <div class="podium__name">${escapeHtml(u.name || t("lb.anonymous"))}</div>
        <div class="podium__score">${metric(u).toLocaleString()}</div>
      </div>`;
  }).join("");

  const rest = users.slice(3, 50);
  list.innerHTML = rest.map((u, i) => {
    const rank = i + 4;
    const me = currentUser && u.uid === currentUser.uid ? " me" : "";
    return `
      <div class="lb-row${me}">
        <div class="lb-row__rank">${rank}</div>
        <img class="lb-row__avatar" src="${u.photoURL || defaultAvatar(u.name)}" onerror="this.src='${defaultAvatar()}'" alt=""/>
        <div class="lb-row__meta">
          <div class="lb-row__name">${escapeHtml(u.name || t("lb.anonymous"))}</div>
          <div class="lb-row__country">${u.country || t("lb.globalLabel")}</div>
        </div>
        <div class="lb-row__score">${metric(u).toLocaleString()}</div>
      </div>`;
  }).join("");
}

function metric(u) {
  if (currentTab === "referral") return u.totalReferrals || 0;
  return u.balance || 0;
}

function defaultAvatar(name) {
  const seed = (name || "ndog").slice(0, 1).toUpperCase();
  return `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" rx="32" fill="#0a1f44"/><text x="50%" y="50%" font-size="28" font-family="Arial" font-weight="bold" fill="#ffd700" text-anchor="middle" dominant-baseline="central">${seed}</text></svg>`
  )}`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

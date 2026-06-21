/**
 * NileDogs (NDOG) — Leaderboard module
 * - Global, Country, Referral rankings
 * - Top 3 podium + list
 */

import { db, ref, onValue, get, query, orderByChild, limitToLast } from "./firebase-config.js";
import { onUser, getCurrentUser } from "./auth.js";

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
}

async function loadLeaderboard() {
  const podium = document.getElementById("lbPodium");
  const list   = document.getElementById("lbList");
  if (!podium || !list) return;
  podium.innerHTML = `<div style="grid-column:1/-1" class="empty">Loading…</div>`;
  list.innerHTML = "";

  const snap = await get(ref(db, "users"));
  if (!snap.exists()) {
    podium.innerHTML = `<div style="grid-column:1/-1" class="empty">No data yet.</div>`;
    return;
  }

  let users = [];
  snap.forEach(c => { const u = c.val(); if (!u.banned) users.push(u); });

  // Sort by tab metric
  if (currentTab === "global") {
    users.sort((a, b) => (b.balance || 0) - (a.balance || 0));
  } else if (currentTab === "country") {
    if (currentUser) users = users.filter(u => u.country === currentUser.country);
    users.sort((a, b) => (b.balance || 0) - (a.balance || 0));
  } else if (currentTab === "referral") {
    users.sort((a, b) => (b.totalReferrals || 0) - (a.totalReferrals || 0));
  }

  // Podium
  const top3 = users.slice(0, 3);
  const podiumOrder = [top3[1], top3[0], top3[2]].filter(Boolean);
  podium.innerHTML = podiumOrder.map((u, i) => {
    const realRank = top3.indexOf(u) + 1;
    const medals = ["🥇", "🥈", "🥉"];
    return `
      <div class="podium podium--${realRank}">
        <div class="podium__rank">${medals[realRank - 1]}</div>
        <img class="podium__avatar" src="${u.photoURL || defaultAvatar(u.name)}" onerror="this.src='${defaultAvatar()}'" alt=""/>
        <div class="podium__name">${escapeHtml(u.name || "Anonymous")}</div>
        <div class="podium__score">${metric(u).toLocaleString()}</div>
      </div>`;
  }).join("");

  // List (4+)
  const rest = users.slice(3, 50);
  list.innerHTML = rest.map((u, i) => {
    const rank = i + 4;
    const me = currentUser && u.uid === currentUser.uid ? " me" : "";
    return `
      <div class="lb-row${me}">
        <div class="lb-row__rank">${rank}</div>
        <img class="lb-row__avatar" src="${u.photoURL || defaultAvatar(u.name)}" onerror="this.src='${defaultAvatar()}'" alt=""/>
        <div class="lb-row__meta">
          <div class="lb-row__name">${escapeHtml(u.name || "Anonymous")}</div>
          <div class="lb-row__country">${u.country || "Global"}</div>
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

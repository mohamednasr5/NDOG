/**
 * FILE NAME: js/leaderboard.js
 * PURPOSE: Leaderboard rendering. 6 boards (Global, Country, Referral, Weekly,
 *          Monthly, All-Time). Realtime subscription, virtualized rows for
 *          performance, highlights current user.
 * DEPENDENCIES: firebase.js, auth.js, database.js, utils.js, i18n.js
 * EXPORTS: leaderboard.init, leaderboard.render
 */

import { firebaseDb } from "./firebase.js";
import { auth } from "./auth.js";
import { db, PATHS } from "./database.js";
import { $, $$, safeHTML, formatNDOG, formatNumber, shortAddr } from "./utils.js";
import { i18n } from "./i18n.js";
import { ref, query, orderByValue, limitToLast, onValue, get } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const BOARDS = [
  { id: "global", label: "Global", icon: "🌍" },
  { id: "country", label: "Country", icon: "🏳️" },
  { id: "referral", label: "Referral", icon: "🔗" },
  { id: "weekly", label: "Weekly", icon: "📅" },
  { id: "monthly", label: "Monthly", icon: "📆" },
  { id: "alltime", label: "All-Time", icon: "🏆" }
];

const ROWS_PER_RENDER = 100; // virtualization cap

export const leaderboard = {
  _unsub: null,
  _currentBoard: "global",

  init() {
    const root = $("#leaderboard-root");
    if (!root) return;
    root.innerHTML = `
      <div class="lb-tabs">
        ${BOARDS.map((b) => `<button class="tab-btn ${b.id === "global" ? "active" : ""}" data-board="${b.id}">${b.icon} ${b.label}</button>`).join("")}
      </div>
      <div class="lb-table-wrap">
        <table class="lb-table">
          <thead>
            <tr>
              <th>#</th>
              <th>User</th>
              <th>Country</th>
              <th>Score</th>
              <th>Reward</th>
            </tr>
          </thead>
          <tbody id="lb-body">
            <tr><td colspan="5" class="muted">Loading…</td></tr>
          </tbody>
        </table>
      </div>
    `;

    root.querySelectorAll(".tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        root.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b === btn));
        this._currentBoard = btn.dataset.board;
        this._loadBoard();
      });
    });

    this._loadBoard();
  },

  async _loadBoard() {
    if (this._unsub) this._unsub();
    const board = this._currentBoard;
    const body = $("#lb-body");
    if (!body) return;
    body.innerHTML = '<tr><td colspan="5" class="muted">Loading…</td></tr>';

    const user = auth.currentUser();
    const userCountry = user?.country;

    // Build query
    let path = `${PATHS.leaderboards}/${board}`;
    if (board === "country" && userCountry) {
      path = `${PATHS.leaderboards}/country/${userCountry}`;
    }
    const q = query(ref(firebaseDb, path), orderByValue(), limitToLast(ROWS_PER_RENDER));

    this._unsub = onValue(q, async (snap) => {
      const data = snap.val() || {};
      const entries = Object.entries(data)
        .map(([uid, score]) => ({ uid, score: Number(score) || 0 }))
        .sort((a, b) => b.score - a.score);

      if (entries.length === 0) {
        body.innerHTML = '<tr><td colspan="5" class="muted">No data yet. Be the first!</td></tr>';
        return;
      }

      // Batch-load user profiles (top 100)
      const profilePromises = entries.slice(0, ROWS_PER_RENDER).map((e) => db.users.get(e.uid));
      const profiles = await Promise.all(profilePromises);

      body.innerHTML = entries
        .slice(0, ROWS_PER_RENDER)
        .map((e, idx) => {
          const p = profiles[idx] || {};
          const isMe = user && e.uid === user.uid;
          const rank = idx + 1;
          const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : "";
          const displayName = p.displayName || shortAddr(e.uid, 4, 4);
          const country = p.country || "—";
          const reward = this._rankReward(rank);
          return `
            <tr class="lb-row ${isMe ? "is-me" : ""}">
              <td class="lb-rank">${medal || rank}</td>
              <td class="lb-user">
                <img src="${p.photoURL || "/assets/icons/icon-512.png"}" alt="" width="32" height="32" loading="lazy" />
                ${safeHTML(displayName)} ${p.founder ? '<span class="badge badge--founder">★</span>' : ""}
                ${p.vipLevel > 0 ? `<span class="badge badge--vip">VIP${p.vipLevel}</span>` : ""}
              </td>
              <td>${safeHTML(country)}</td>
              <td><strong>${formatNumber(e.score)}</strong></td>
              <td>${reward > 0 ? formatNDOG(reward) : "—"}</td>
            </tr>
          `;
        })
        .join("");
    });
  },

  _rankReward(rank) {
    if (rank === 1) return 1000;
    if (rank === 2) return 500;
    if (rank === 3) return 250;
    if (rank <= 10) return 100;
    if (rank <= 50) return 50;
    if (rank <= 100) return 25;
    return 0;
  }
};

window.__leaderboard = leaderboard;

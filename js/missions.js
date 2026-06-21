/**
 * FILE NAME: js/missions.js
 * PURPOSE: Mission system. Loads daily/weekly/monthly/event/achievement missions
 *          from DB, tracks progress, grants rewards, prevents double-completion.
 * DEPENDENCIES: firebase.js, auth.js, database.js, antifraud.js, utils.js
 * EXPORTS: missions.init, missions.complete, missions.renderTab
 */

import { firebaseDb } from "./firebase.js";
import { auth } from "./auth.js";
import { db, PATHS } from "./database.js";
import { antifraud } from "./antifraud.js";
import { $, safeHTML, showToast, formatNDOG, timeAgo } from "./utils.js";
import { i18n } from "./i18n.js";
import { ref, get, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const TABS = ["daily", "weekly", "monthly", "events", "achievements"];

export const missions = {
  init() {
    auth.onReady((user) => {
      if (!user) {
        $("#missions-root").innerHTML = `
          <div class="card card--guest">
            <p>Sign in to view missions.</p>
            <button class="btn btn--primary" id="mission-signin">Sign in</button>
          </div>`;
        $("#mission-signin")?.addEventListener("click", () => auth.signIn());
        return;
      }
      this._render(user.uid);
    });
  },

  async _render(uid) {
    const root = $("#missions-root");
    if (!root) return;

    // Load all missions from DB
    const missionsSnap = await get(ref(firebaseDb, PATHS.missions));
    const allMissions = missionsSnap.val() || {};

    // Load user progress
    const progressSnap = await get(ref(firebaseDb, `${PATHS.missionProgress}/${uid}`));
    const progress = progressSnap.val() || {};

    root.innerHTML = `
      <div class="mission-tabs">
        ${TABS.map((t) => `<button class="tab-btn ${t === "daily" ? "active" : ""}" data-tab="${t}" data-i18n="mission.${t}">${t}</button>`).join("")}
      </div>
      ${TABS.map(
        (t) => `
        <div class="mission-panel" data-panel="${t}" style="display:${t === "daily" ? "block" : "none"}">
          ${this._renderMissionList(allMissions[t] || {}, progress, t, uid)}
        </div>`
      ).join("")}
    `;
    i18n.apply(root);

    // Tab switching
    root.querySelectorAll(".tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const tab = btn.dataset.tab;
        root.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b === btn));
        root.querySelectorAll(".mission-panel").forEach((p) => (p.style.display = p.dataset.panel === tab ? "block" : "none"));
      });
    });

    // Complete buttons
    root.querySelectorAll("[data-complete]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.complete;
        const reward = Number(btn.dataset.reward);
        await this.complete(uid, id, reward, btn);
      });
    });
  },

  _renderMissionList(missions, progress, type, uid) {
    const list = Object.entries(missions);
    if (list.length === 0) {
      return `<div class="empty">No ${type} missions available. Check back soon!</div>`;
    }
    return `<ul class="mission-list">${list
      .map(([id, m]) => {
        const prog = progress[id];
        const completed = prog?.completed;
        return `
        <li class="mission-item ${completed ? "is-completed" : ""}">
          <div class="mission-item__icon">${this._icon(m.type || type)}</div>
          <div class="mission-item__body">
            <div class="mission-item__title">${safeHTML(m.title)}</div>
            <div class="mission-item__desc">${safeHTML(m.description || "")}</div>
            ${m.url ? `<a href="${m.url}" target="_blank" rel="noopener" class="mission-item__link">Open Task ↗</a>` : ""}
          </div>
          <div class="mission-item__reward">${formatNDOG(m.reward || 0)}</div>
          <button
            class="btn ${completed ? "btn--ghost" : "btn--primary"}"
            data-complete="${id}"
            data-reward="${m.reward || 0}"
            ${completed ? "disabled" : ""}
          >${completed ? '<span data-i18n="mission.completed">Completed</span>' : '<span data-i18n="mission.complete">Complete</span>'}</button>
        </li>`;
      })
      .join("")}</ul>`;
  },

  _icon(type) {
    const icons = {
      daily: "📅",
      weekly: "🗓️",
      monthly: "📆",
      events: "🎉",
      achievements: "🏆",
      social: "🔗",
      trading: "📈"
    };
    return icons[type] || "✅";
  },

  async complete(uid, missionId, reward, btn) {
    // Anti-fraud
    const check = await antifraud.preActionCheck(uid, `mission:${missionId}`, 1, 24 * 3600 * 1000);
    if (!check.allowed) {
      showToast("Mission already completed or blocked.", "warn");
      return;
    }
    // Optimistic UI
    btn.disabled = true;
    btn.textContent = "Processing…";
    try {
      await db.missions.complete(uid, missionId, reward);
      showToast(`Mission complete! +${reward} NDOG`, "success");
      // Reload
      this._render(uid);
    } catch (e) {
      console.error("[missions] complete failed:", e);
      btn.disabled = false;
      btn.textContent = "Complete";
      showToast("Failed to complete mission.", "error");
    }
  }
};

window.__missions = missions;

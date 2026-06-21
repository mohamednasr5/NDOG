/**
 * FILE NAME: js/airdrop.js
 * PURPOSE: Airdrop center. Renders social tasks (Telegram, Twitter/X, YouTube,
 *          Website, Partner), tracks completion, verifies task URL visit,
 *          grants rewards with anti-fraud pre-check.
 * DEPENDENCIES: firebase.js, auth.js, database.js, antifraud.js, utils.js
 * EXPORTS: airdrop.init, airdrop.verify
 */

import { firebaseDb } from "./firebase.js";
import { auth } from "./auth.js";
import { db, PATHS } from "./database.js";
import { antifraud } from "./antifraud.js";
import { $, $$, safeHTML, showToast, formatNDOG } from "./utils.js";
import { i18n } from "./i18n.js";
import { ref, get, set, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const DEFAULT_TASKS = [
  { id: "tg_join", type: "telegram", title: "Join our Telegram channel", url: "https://t.me/ndogcoin", reward: 50, verifyMethod: "manual" },
  { id: "tg_group", type: "telegram", title: "Join our Telegram group", url: "https://t.me/ndogcoingroup", reward: 30, verifyMethod: "manual" },
  { id: "x_follow", type: "twitter", title: "Follow @ndogcoin on X", url: "https://x.com/ndogcoin", reward: 50, verifyMethod: "manual" },
  { id: "x_retweet", type: "twitter", title: "Retweet the pinned post", url: "https://x.com/ndogcoin", reward: 30, verifyMethod: "manual" },
  { id: "yt_sub", type: "youtube", title: "Subscribe on YouTube", url: "https://youtube.com/@ndogcoin", reward: 50, verifyMethod: "manual" },
  { id: "yt_watch", type: "youtube", title: "Watch the intro video", url: "https://youtube.com/watch?v=ndog-intro", reward: 20, verifyMethod: "manual" },
  { id: "web_visit", type: "website", title: "Visit official website", url: "https://ndogcoin.com/", reward: 10, verifyMethod: "auto" },
  { id: "whitepaper", type: "website", title: "Read the whitepaper", url: "https://ndogcoin.com/whitepaper-en.html", reward: 25, verifyMethod: "auto" }
];

export const airdrop = {
  init() {
    auth.onReady(async (user) => {
      if (!user) {
        $("#airdrop-root").innerHTML = `
          <div class="card card--guest">
            <p>Sign in to access the airdrop center.</p>
            <button class="btn btn--primary" id="air-signin">Sign in</button>
          </div>`;
        $("#air-signin")?.addEventListener("click", () => auth.signIn());
        return;
      }
      await this._render(user.uid);
    });
  },

  async _render(uid) {
    // Load custom partner tasks from DB
    const partnerSnap = await get(ref(firebaseDb, `${PATHS.airdrops}`));
    const partnerTasks = partnerSnap.val() || {};
    const allTasks = [...DEFAULT_TASKS, ...Object.values(partnerTasks)];

    // Load user's completed tasks
    const claimsSnap = await get(ref(firebaseDb, `${PATHS.airdropClaims}/${uid}`));
    const claims = claimsSnap.val() || {};

    const totalEarned = Object.values(claims).reduce((s, c) => s + (c.reward || 0), 0);
    const totalAvailable = allTasks.reduce((s, t) => s + (t.reward || 0), 0);

    $("#airdrop-root").innerHTML = `
      <div class="airdrop-grid">
        <div class="card card--airdrop-stats">
          <div class="card__label">Airdrop Progress</div>
          <div class="card__value">${formatNDOG(totalEarned)} / ${formatNDOG(totalAvailable)}</div>
          <div class="progress"><div class="progress__bar" style="width:${(totalEarned / totalAvailable * 100).toFixed(0)}%"></div></div>
        </div>

        <div class="card card--tasks">
          <h3 data-i18n="airdrop.title">Airdrop Center</h3>
          <ul class="airdrop-list">
            ${allTasks
              .map((t) => {
                const claimed = claims[t.id];
                return `
                <li class="airdrop-item ${claimed ? "is-claimed" : ""}">
                  <div class="airdrop-item__icon">${this._icon(t.type)}</div>
                  <div class="airdrop-item__body">
                    <div class="airdrop-item__title">${safeHTML(t.title)}</div>
                    <a href="${t.url}" target="_blank" rel="noopener" class="airdrop-item__link">${safeHTML(t.url)} ↗</a>
                  </div>
                  <div class="airdrop-item__reward">${formatNDOG(t.reward || 0)}</div>
                  ${
                    claimed
                      ? '<span class="badge badge--done">Claimed</span>'
                      : `<button class="btn btn--primary" data-airdrop-id="${t.id}" data-airdrop-reward="${t.reward}" data-airdrop-url="${t.url}" data-airdrop-method="${t.verifyMethod || "manual"}" data-i18n="airdrop.claim">Claim Reward</button>`
                  }
                </li>`;
              })
              .join("")}
          </ul>
        </div>
      </div>
    `;
    i18n.apply($("#airdrop-root"));

    $$("[data-airdrop-id]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        await this.verify(uid, btn);
      });
    });
  },

  _icon(type) {
    const icons = {
      telegram: "✈️",
      twitter: "𝕏",
      youtube: "▶️",
      website: "🌐",
      partner: "🤝"
    };
    return icons[type] || "🎁";
  },

  async verify(uid, btn) {
    const taskId = btn.dataset.airdropId;
    const reward = Number(btn.dataset.airdropReward);
    const url = btn.dataset.airdropUrl;
    const method = btn.dataset.airdropMethod;

    btn.disabled = true;
    btn.textContent = "Verifying…";

    try {
      // Anti-fraud
      const check = await antifraud.preActionCheck(uid, `airdrop:${taskId}`, 1, 999 * 24 * 3600 * 1000);
      if (!check.allowed) {
        showToast("Task already claimed or blocked.", "warn");
        btn.disabled = false;
        btn.textContent = "Claim Reward";
        return;
      }

      // Open task URL
      window.open(url, "_blank", "noopener,noreferrer");

      if (method === "auto") {
        // Wait 5s to simulate page visit (real verification would need OAuth/webhook)
        await new Promise((r) => setTimeout(r, 5000));
        await this._grant(uid, taskId, reward, btn);
      } else {
        // Manual verification — show modal
        const ok = confirm(`Click OK after completing the task at:\n${url}\n\nFalse claims will be flagged as fraud.`);
        if (!ok) {
          btn.disabled = false;
          btn.textContent = "Claim Reward";
          return;
        }
        await this._grant(uid, taskId, reward, btn);
      }
    } catch (e) {
      console.error("[airdrop] verify failed:", e);
      btn.disabled = false;
      btn.textContent = "Claim Reward";
      showToast(e.message || "Verification failed", "error");
    }
  },

  async _grant(uid, taskId, reward, btn) {
    // Record claim
    await set(ref(firebaseDb, `${PATHS.airdropClaims}/${uid}/${taskId}`), {
      taskId,
      reward,
      ts: serverTimestamp()
    });
    // Credit
    await db.atomicCredit(uid, reward, `airdrop:${taskId}`);
    btn.outerHTML = '<span class="badge badge--done">Claimed</span>';
    showToast(`Task complete! +${reward} NDOG`, "success");
  }
};

window.__airdrop = airdrop;

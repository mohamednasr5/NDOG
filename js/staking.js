/**
 * FILE NAME: js/staking.js
 * PURPOSE: NDOG staking. 4 lock periods (30/90/180/365 days), APR calculation,
 *          compound rewards, claim flow. Atomic debit on stake, atomic credit on claim.
 * DEPENDENCIES: firebase.js, auth.js, database.js, antifraud.js, utils.js
 * EXPORTS: staking.init, staking.stake, staking.claim, staking.compound
 */

import { firebaseDb } from "./firebase.js";
import { auth } from "./auth.js";
import { db, PATHS } from "./database.js";
import { antifraud } from "./antifraud.js";
import { $, safeHTML, showToast, formatNDOG, formatDate } from "./utils.js";
import { i18n } from "./i18n.js";
import { ref, get, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const PLANS = {
  30:  { apr: 12, label: { en: "30 Days", ar: "30 يوم" } },
  90:  { apr: 25, label: { en: "90 Days", ar: "90 يوم" } },
  180: { apr: 55, label: { en: "180 Days", ar: "180 يوم" } },
  365: { apr: 120, label: { en: "365 Days", ar: "365 يوم" } }
};

const MIN_STAKE = 100;
const MAX_STAKE = 1_000_000;

export const staking = {
  PLANS,

  init() {
    auth.onReady((user) => {
      if (!user) {
        $("#staking-root").innerHTML = `
          <div class="card card--guest">
            <p>Sign in to stake NDOG.</p>
            <button class="btn btn--primary" id="stake-signin">Sign in</button>
          </div>`;
        $("#stake-signin")?.addEventListener("click", () => auth.signIn());
        return;
      }
      this._render(user);
    });
  },

  async _render(user) {
    const profile = await db.users.get(user.uid);
    const contractsSnap = await get(ref(firebaseDb, PATHS.stakingContracts));
    const allContracts = contractsSnap.val() || {};
    const myContracts = Object.entries(allContracts)
      .filter(([, c]) => c.uid === user.uid)
      .sort((a, b) => (b[1].startedAt || 0) - (a[1].startedAt || 0));

    const activeTotal = myContracts.filter(([, c]) => c.status === "active").reduce((s, [, c]) => s + c.amount, 0);
    const totalRewards = myContracts.reduce((s, [, c]) => s + (c.rewardsAccrued || 0), 0);

    $("#staking-root").innerHTML = `
      <div class="stake-grid">
        <div class="card card--balance">
          <div class="card__label">Available Balance</div>
          <div class="card__value">${formatNDOG(profile?.balance || 0)}</div>
        </div>
        <div class="card">
          <div class="card__label">Active Stakes</div>
          <div class="card__value">${formatNDOG(activeTotal)}</div>
        </div>
        <div class="card">
          <div class="card__label">Total Rewards Earned</div>
          <div class="card__value">${formatNDOG(totalRewards)}</div>
        </div>

        <div class="card card--plans">
          <h3 data-i18n="stake.title">Stake Your NDOG</h3>
          <div class="stake-plans">
            ${Object.entries(PLANS)
              .map(
                ([days, p]) => `
              <div class="stake-plan" data-days="${days}">
                <div class="stake-plan__days">${p.label[i18n.getLang()] || p.label.en}</div>
                <div class="stake-plan__apr">${p.apr}% APR</div>
                <input type="number" class="stake-plan__input" min="${MIN_STAKE}" max="${MAX_STAKE}" placeholder="Amount" />
                <button class="btn btn--primary" data-stake-btn data-days="${days}">Stake</button>
              </div>`
              )
              .join("")}
          </div>
        </div>

        <div class="card card--contracts">
          <h3>Active Contracts</h3>
          <div id="stake-contracts" class="stake-contracts">
            ${myContracts.length === 0 ? '<div class="empty">No active contracts.</div>' : ""}
            ${myContracts
              .map(
                ([id, c]) => `
              <div class="contract ${c.status}">
                <div class="contract__row">
                  <span class="contract__amount">${formatNDOG(c.amount)}</span>
                  <span class="contract__apr">${c.apr}% APR · ${c.days}d</span>
                </div>
                <div class="contract__row">
                  <span class="muted">Started: ${formatDate(c.startedAt)}</span>
                  <span class="muted">Ends: ${formatDate(c.endsAt)}</span>
                </div>
                <div class="contract__row">
                  <span>Reward: <strong>${formatNDOG(this._computeReward(c))}</strong></span>
                  ${c.status === "active" && Date.now() >= c.endsAt
                    ? `<button class="btn btn--primary" data-claim-contract="${id}">Claim</button>`
                    : c.status === "active"
                    ? `<span class="muted">Locked</span>`
                    : `<span class="badge badge--done">Claimed</span>`}
                </div>
              </div>`
              )
              .join("")}
          </div>
        </div>
      </div>
    `;
    i18n.apply($("#staking-root"));

    // Stake button handlers
    $$("[data-stake-btn]").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        const days = Number(btn.dataset.days);
        const input = btn.parentElement.querySelector(".stake-plan__input");
        const amount = Number(input.value);
        await this.stake(user.uid, amount, days);
      });
    });

    // Claim handlers
    $$("[data-claim-contract]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        await this.claim(user.uid, btn.dataset.claimContract);
      });
    });
  },

  async stake(uid, amount, days) {
    const plan = PLANS[days];
    if (!plan) return showToast("Invalid plan.", "error");
    if (!Number.isFinite(amount) || amount < MIN_STAKE) {
      return showToast(`Minimum stake is ${MIN_STAKE} NDOG.`, "warn");
    }
    if (amount > MAX_STAKE) {
      return showToast(`Maximum stake is ${MAX_STAKE} NDOG.`, "warn");
    }

    // Anti-fraud
    const check = await antifraud.preActionCheck(uid, "stake", 10, 3600 * 1000);
    if (!check.allowed) return;

    try {
      // Debit
      await db.atomicDebit(uid, amount, `stake:${days}d`);
      // Create contract
      await db.staking.create(uid, amount, days, plan.apr);
      showToast(`Staked ${amount} NDOG for ${days} days @ ${plan.apr}% APR`, "success");
      this._render(auth.currentUser());
    } catch (e) {
      console.error("[staking] stake failed:", e);
      showToast(e.message || "Stake failed", "error");
    }
  },

  async claim(uid, contractId) {
    try {
      const cSnap = await get(ref(firebaseDb, `${PATHS.stakingContracts}/${contractId}`));
      const c = cSnap.val();
      if (!c) return showToast("Contract not found.", "error");
      if (c.uid !== uid) return showToast("Not your contract.", "error");
      if (c.status !== "active") return showToast("Already claimed.", "warn");
      if (Date.now() < c.endsAt) return showToast("Still locked.", "warn");

      const reward = this._computeReward(c);
      const total = c.amount + reward;
      await db.atomicCredit(uid, total, `stake_claim:${contractId}`);
      await db.update(`${PATHS.stakingContracts}/${contractId}`, {
        status: "claimed",
        claimedAt: serverTimestamp(),
        rewardPaid: reward
      });
      showToast(`Claimed ${total.toFixed(2)} NDOG (principal + ${reward.toFixed(2)} reward)`, "success");
      this._render(auth.currentUser());
    } catch (e) {
      console.error("[staking] claim failed:", e);
      showToast("Claim failed.", "error");
    }
  },

  _computeReward(c) {
    if (!c) return 0;
    const elapsedMs = Math.min(Date.now(), c.endsAt || 0) - (c.startedAt || 0);
    const elapsedDays = Math.max(0, elapsedMs / 86400000);
    return (c.amount * (c.apr / 100) * elapsedDays) / 365;
  }
};

window.__staking = staking;

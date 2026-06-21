/**
 * FILE NAME: js/claim.js
 * PURPOSE: Daily mining claim logic. Enforces 24h cooldown, streak bonus,
 *          VIP/Founder multipliers, anti-fraud pre-check, atomic credit,
 *          claim history log, leaderboard rank update.
 * DEPENDENCIES: firebase.js, auth.js, database.js, antifraud.js, utils.js
 * EXPORTS: claim.now, claim.nextClaimAt, claim.history
 */

import { firebaseDb } from "./firebase.js";
import { auth } from "./auth.js";
import { db, PATHS } from "./database.js";
import { antifraud } from "./antifraud.js";
import { showToast, formatNDOG } from "./utils.js";
import { ref, runTransaction, serverTimestamp, get } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const BASE_CLAIM = 50;          // base NDOG per claim
const STREAK_BONUS_PER_DAY = 2; // +2 NDOG per consecutive day
const STREAK_CAP = 100;         // max streak bonus
const COOLDOWN_MS = 24 * 60 * 60 * 1000;

const VIP_MULTIPLIERS = { 0: 1, 1: 1.1, 2: 1.25, 3: 1.5, 4: 2, 5: 3 };
const FOUNDER_MULTIPLIER = 1.25;

export const claim = {
  /**
   * Returns timestamp (ms) when next claim is available.
   */
  nextClaimAt(lastClaimAt) {
    return lastClaimAt ? lastClaimAt + COOLDOWN_MS : 0;
  },

  /**
   * Compute the reward for a claim given user profile.
   */
  computeReward(profile) {
    const streak = (profile?.streak || 0) + 1;
    const streakBonus = Math.min(STREAK_CAP, streak * STREAK_BONUS_PER_DAY);
    const vipMult = VIP_MULTIPLIERS[profile?.vipLevel || 0] || 1;
    const founderMult = profile?.founder ? FOUNDER_MULTIPLIER : 1;
    const reward = Math.round(((BASE_CLAIM + streakBonus) * vipMult * founderMult) * 100) / 100;
    return { reward, streak, streakBonus, vipMult, founderMult };
  },

  /**
   * Execute a claim. Atomic + fraud-checked.
   */
  async now() {
    const user = auth.currentUser();
    if (!user) {
      showToast("Please sign in first.", "warn");
      auth.signIn();
      return;
    }
    if (user.banned) {
      showToast("Account banned.", "error");
      return;
    }

    // 1. Fresh profile fetch (don't trust stale cache)
    const profileSnap = await get(ref(firebaseDb, `users/${user.uid}`));
    const p = profileSnap.val();
    if (!p) {
      showToast("Profile not loaded.", "error");
      return;
    }

    // 2. Cooldown check
    const nextAt = this.nextClaimAt(p.lastClaimAt || 0);
    if (nextAt > Date.now()) {
      const wait = Math.ceil((nextAt - Date.now()) / 60000);
      showToast(`Too early. Try again in ${wait} min.`, "warn");
      return;
    }

    // 3. Anti-fraud pre-check
    const check = await antifraud.preActionCheck(user.uid, "claim", 1, COOLDOWN_MS);
    if (!check.allowed) {
      showToast("Claim blocked by anti-fraud system.", "error");
      return;
    }

    // 4. Compute reward
    const { reward, streak, streakBonus, vipMult, founderMult } = this.computeReward(p);

    // 5. Atomic update: balance + streak + lastClaimAt + bestStreak
    try {
      const txResult = await runTransaction(ref(firebaseDb, `users/${user.uid}`), (cur) => {
        const c = cur || {};
        // Re-validate cooldown inside transaction (race-safe)
        if (c.lastClaimAt && Date.now() - c.lastClaimAt < COOLDOWN_MS - 1000) {
          return; // abort — someone else claimed under us
        }
        c.balance = (c.balance || 0) + reward;
        c.streak = streak;
        c.bestStreak = Math.max(c.bestStreak || 0, streak);
        c.lastClaimAt = Date.now();
        c.lastClaimAmount = reward;
        c.totalClaimed = (c.totalClaimed || 0) + reward;
        c.loyaltyScore = (c.loyaltyScore || 0) + 1;
        return c;
      });

      if (!txResult.committed) {
        showToast("Claim race-condition detected. Try again.", "warn");
        return;
      }

      // 6. Log claim history
      await db.claims.log(user.uid, reward, streak, vipMult * founderMult);

      // 7. Update leaderboards (denormalized for fast queries)
      await this._updateLeaderboards(user.uid, p, reward);

      // 8. Push notification
      await db.notifications.send(
        user.uid,
        "Mining Claim Successful",
        `You mined ${reward.toFixed(2)} NDOG. Streak: ${streak} 🔥`,
        "success"
      );

      // 9. Check streak achievements
      await this._checkStreakAchievements(user.uid, streak);

      showToast(`Claimed ${reward.toFixed(2)} NDOG! 🔥 Streak: ${streak}`, "success");
      // Refresh dashboard
      import("./dashboard.js").then((m) => m.dashboard.init());
    } catch (e) {
      console.error("[claim] failed:", e);
      showToast(e.message || "Claim failed.", "error");
      await antifraud.logSuspicious({
        type: "CLAIM_FAILED",
        uid: user.uid,
        error: e.message,
        severity: "medium"
      });
    }
  },

  async _updateLeaderboards(uid, profile, newClaimAmount) {
    const total = (profile?.totalClaimed || 0) + newClaimAmount;
    const updates = {
      [`${PATHS.leaderboards_alltime}/${uid}`]: total,
      [`${PATHS.leaderboards_weekly}/${uid}`]: (await this._weeklyTotal(uid)) + newClaimAmount,
      [`${PATHS.leaderboards_monthly}/${uid}`]: (await this._monthlyTotal(uid)) + newClaimAmount
    };
    if (profile?.country) {
      updates[`leaderboards/country/${profile.country}/${uid}`] = total;
    }
    updates[`leaderboards/global/${uid}`] = total;
    updates[`leaderboards/referral/${uid}`] = profile?.referralCount || 0;
    // Atomic multi-path write
    const { ref, update } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js");
    await update(ref(firebaseDb), updates);
  },

  async _weeklyTotal(uid) {
    // Compute current week's total from /claims
    const weekAgo = Date.now() - 7 * 86400000;
    const snap = await get(ref(firebaseDb, "claims"));
    if (!snap.exists()) return 0;
    let total = 0;
    for (const [, c] of Object.entries(snap.val())) {
      const ts = c.ts?.seconds ? c.ts.seconds * 1000 : c.ts || 0;
      if (c.uid === uid && ts >= weekAgo) total += c.amount || 0;
    }
    return total;
  },

  async _monthlyTotal(uid) {
    const monthAgo = Date.now() - 30 * 86400000;
    const snap = await get(ref(firebaseDb, "claims"));
    if (!snap.exists()) return 0;
    let total = 0;
    for (const [, c] of Object.entries(snap.val())) {
      const ts = c.ts?.seconds ? c.ts.seconds * 1000 : c.ts || 0;
      if (c.uid === uid && ts >= monthAgo) total += c.amount || 0;
    }
    return total;
  },

  async _checkStreakAchievements(uid, streak) {
    const milestones = [7, 14, 30, 60, 100, 365];
    if (milestones.includes(streak)) {
      const bonus = streak * 5;
      await db.atomicCredit(uid, bonus, `streak_milestone:${streak}`);
      await db.notifications.send(
        uid,
        "🔥 Streak Milestone!",
        `${streak}-day streak! Bonus: ${bonus} NDOG`,
        "success"
      );
    }
  },

  async history(uid, limit = 20) {
    return db.claims.history(uid, limit);
  }
};

// Expose for inline buttons
window.__claim = claim;

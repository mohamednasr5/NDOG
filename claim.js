/**
 * NileDogs (NDOG) — Daily Claim module
 * - 24h countdown
 * - Streak tracking
 * - Reward multiplier (streak bonus + referral bonus + founder bonus)
 * - Claim history
 */

import {
  db, ref, get, update, push, onValue,
  APP_CONFIG, serverTimestamp
} from "./firebase-config.js";
import { onUser, getCurrentUser } from "./auth.js";
import { animateCount, toast } from "./app.js";
import { computeLevel } from "./dashboard.js";

let claimTimer = null;
let currentUser = null;
let viewBound = false;

export function initClaim() {
  onUser((u) => {
    currentUser = u;
    if (u) renderClaim();
  });

  document.getElementById("claimBtn")?.addEventListener("click", doClaim);

  if (!viewBound) {
    viewBound = true;
    document.addEventListener("ndog:viewchange", (e) => {
      if (e.detail.view === "claim") renderClaim();
    });
  }

  // Render reward levels (static)
  renderLevelsGrid();
}

function renderLevelsGrid() {
  const grid = document.getElementById("claimLevelsGrid");
  if (!grid) return;
  grid.innerHTML = APP_CONFIG.rewardLevels.map(l => `
    <div class="claim-level" data-level="${l.name}">
      <div class="claim-level__icon">${l.icon}</div>
      <div class="claim-level__name" style="color:${l.color}">${l.name}</div>
      <div class="claim-level__req">${l.min.toLocaleString()}+</div>
    </div>
  `).join("");
}

function computeReward(user) {
  let amount = APP_CONFIG.claimBase;
  let multiplier = 1;

  // streak bonus
  const streak = user.streak || 0;
  for (const [days, mult] of Object.entries(APP_CONFIG.streakBonus)) {
    if (streak >= +days) multiplier = mult;
  }

  // referral bonus
  if (user.referredBy) multiplier += APP_CONFIG.referralBonus;

  // founder bonus
  if (user.isFounder) multiplier += 0.5;

  amount = Math.round(amount * multiplier);
  return { amount, multiplier };
}

function nextClaimTime(lastClaim) {
  return lastClaim + 24 * 3600 * 1000;
}

function renderClaim() {
  if (!currentUser) return;
  const user = currentUser;

  // Highlight current level
  const curLevel = computeLevel(user.balance || 0);
  document.querySelectorAll("#claimLevelsGrid .claim-level").forEach(el => {
    el.classList.toggle("current", el.dataset.level === curLevel.name);
  });

  // Compute reward
  const { amount, multiplier } = computeReward(user);
  const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setText("claimReward", `+${amount} NDOG`);
  setText("claimMult",   `×${multiplier.toFixed(1)}`);
  setText("claimStreak", `${user.streak || 0} days`);

  const btn = document.getElementById("claimBtn");
  const hint = document.getElementById("claimHint");
  const ringFg = document.getElementById("claimRingFg");
  const ringCirc = 628;

  const now = Date.now();
  const next = nextClaimTime(user.lastClaim || 0);

  if (now >= next) {
    // Ready to claim
    if (btn) { btn.disabled = false; btn.textContent = "Claim Daily Reward"; btn.classList.add("btn--gold"); }
    if (hint) hint.textContent = "Ready to claim";
    setText("claimCountdown", "");
    if (ringFg) ringFg.style.strokeDashoffset = 0;
    if (claimTimer) { clearInterval(claimTimer); claimTimer = null; }
  } else {
    // Not yet — start countdown
    if (btn) { btn.disabled = true; btn.classList.remove("btn--gold"); btn.textContent = "Claimed ✓ — Come back later"; }
    if (hint) hint.textContent = "Next claim in";

    if (claimTimer) clearInterval(claimTimer);
    claimTimer = setInterval(() => {
      const remaining = next - Date.now();
      if (remaining <= 0) {
        clearInterval(claimTimer);
        claimTimer = null;
        renderClaim();
        return;
      }
      const h = Math.floor(remaining / 3600000);
      const m = Math.floor((remaining % 3600000) / 60000);
      const s = Math.floor((remaining % 60000) / 1000);
      setText("claimCountdown",
        `⏳ ${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`);

      // ring fill (0 = full, ringCirc = empty)
      const total = 24 * 3600 * 1000;
      const elapsed = total - remaining;
      const pct = elapsed / total;
      if (ringFg) ringFg.style.strokeDashoffset = ringCirc * (1 - pct);
    }, 1000);
  }

  // Claim history (live)
  loadClaimHistory(user.uid);
}

async function doClaim() {
  if (!currentUser) return;
  const user = currentUser;
  const now = Date.now();
  const next = nextClaimTime(user.lastClaim || 0);

  if (now < next) {
    toast("You already claimed today. Come back later!", "err");
    return;
  }

  const btn = document.getElementById("claimBtn");
  btn.disabled = true;
  btn.textContent = "Claiming…";

  try {
    const { amount, multiplier } = computeReward(user);
    const streak = (user.streak || 0) + 1;

    // Atomically-ish update user
    await update(ref(db, `users/${user.uid}`), {
      balance:        (user.balance || 0) + amount,
      lastClaim:      now,
      streak,
      loyaltyScore:   (user.loyaltyScore || 0) + 1,
      communityScore: (user.communityScore || 0) + 5
    });

    // Push to claims history
    await push(ref(db, "claims"), {
      userId: user.uid,
      amount,
      multiplier,
      streak,
      date: now,
      type: "daily"
    });

    // Confetti-ish toast
    toast(`🎉 You claimed ${amount} NDOG! (×${multiplier.toFixed(1)})`, "ok", 3000);
    btn.textContent = "Claimed ✓";
    btn.classList.remove("btn--gold");

    // Re-render (will start countdown)
    setTimeout(renderClaim, 600);
  } catch (err) {
    console.error("[NDOG] Claim failed:", err);
    toast("Claim failed — please try again.", "err");
    btn.disabled = false;
    btn.textContent = "Claim Daily Reward";
  }
}

function loadClaimHistory(uid) {
  const list = document.getElementById("claimHistoryList");
  if (!list) return;
  list.innerHTML = `<div class="empty">Loading history…</div>`;

  const q = ref(db, "claims");
  onValue(q, (snap) => {
    const rows = [];
    snap.forEach(child => {
      const c = child.val();
      if (c.userId !== uid) return;
      rows.push(c);
    });
    rows.sort((a, b) => (b.date || 0) - (a.date || 0));
    if (!rows.length) {
      list.innerHTML = `<div class="empty">No claims yet — claim your first reward today!</div>`;
      return;
    }
    list.innerHTML = rows.slice(0, 30).map(c => `
      <div class="claim-row">
        <div>
          <div class="claim-row__amt">+${c.amount} NDOG</div>
          <div class="claim-row__date">${formatDate(c.date)} · 🔥 ${c.streak || 0}-day streak</div>
        </div>
        <div>${c.multiplier ? `×${c.multiplier.toFixed(1)}` : ""}</div>
      </div>
    `).join("");
  }, { onlyOnce: false });
}

function formatDate(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("en-US", {
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit"
  });
}

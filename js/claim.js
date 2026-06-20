/**
 * NileDogs (NDOG) — Daily Claim module
 */

import {
  db, ref, get, update, push, onValue,
  APP_CONFIG, serverTimestamp
} from "./firebase-config.js";
import { onUser, getCurrentUser } from "./auth.js";
import { animateCount, toast } from "./app.js";
import { computeLevel } from "./dashboard.js";
import { t, getLang, onLangChange } from "./i18n.js";

let claimTimer = null;
let currentUser = null;
let viewBound = false;

// ───────────────────────────────────────────────────────────────────
// BOOST MINING — Random ad delivery
// ───────────────────────────────────────────────────────────────────
const BOOST_AD_OPTIONS = [
  {
    type: "url",
    url: "https://www.effectivecpmnetwork.com/i6pwi8zq?key=0fe53613ffa1192520bdc1c7a7029407"
  },
  {
    type: "script",
    src: "https://pl29822341.effectivecpmnetwork.com/e9/23/c2/e923c23960923f40920a0e6dbcf0222f.js"
  },
  {
    type: "script",
    src: "https://pl29822342.effectivecpmnetwork.com/b0/8b/04/b08b04a4569092e013acea2ac1e3f682.js"
  }
];

function triggerBoostAd() {
  const chosen = BOOST_AD_OPTIONS[Math.floor(Math.random() * BOOST_AD_OPTIONS.length)];

  if (chosen.type === "url") {
    window.open(chosen.url, "_blank", "noopener,noreferrer");
  } else if (chosen.type === "script") {
    const s = document.createElement("script");
    s.src = chosen.src;
    s.async = true;
    document.body.appendChild(s);
    // Auto-cleanup after 30s to avoid memory leaks
    setTimeout(() => { if (s.parentNode) s.parentNode.removeChild(s); }, 30000);
  }
}

function initBoostMining() {
  const btn = document.getElementById("boostMiningBtn");
  if (!btn) return;
  btn.addEventListener("click", () => {
    triggerBoostAd();
  });
}

export function initClaim() {
  onUser((u) => {
    currentUser = u;
    if (u) renderClaim();
  });

  document.getElementById("claimBtn")?.addEventListener("click", doClaim);

  // Initialize boost mining button
  initBoostMining();

  if (!viewBound) {
    viewBound = true;
    document.addEventListener("ndog:viewchange", (e) => {
      if (e.detail.view === "claim") renderClaim();
    });
  }

  renderLevelsGrid();

  onLangChange(() => {
    renderLevelsGrid();
    if (currentUser) renderClaim();
  });
}

function renderLevelsGrid() {
  const grid = document.getElementById("claimLevelsGrid");
  if (!grid) return;
  grid.innerHTML = APP_CONFIG.rewardLevels.map(l => {
    const levelName = t(l.nameKey || l.name);
    return `
    <div class="claim-level" data-level="${l.nameKey || l.name}">
      <div class="claim-level__icon">${l.icon}</div>
      <div class="claim-level__name" style="color:${l.color}">${levelName}</div>
      <div class="claim-level__req">${l.min.toLocaleString()}+</div>
    </div>
  `;
  }).join("");
}

function computeReward(user) {
  let amount = APP_CONFIG.claimBase;
  let multiplier = 1;
  const streak = user.streak || 0;
  for (const [days, mult] of Object.entries(APP_CONFIG.streakBonus)) {
    if (streak >= +days) multiplier = mult;
  }
  if (user.referredBy) multiplier += APP_CONFIG.referralBonus;
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

  const curLevel = computeLevel(user.balance || 0);
  document.querySelectorAll("#claimLevelsGrid .claim-level").forEach(el => {
    el.classList.toggle("current", el.dataset.level === (curLevel.nameKey || curLevel.name));
  });

  const { amount, multiplier } = computeReward(user);
  const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setText("claimReward", `+${amount} NDOG`);
  setText("claimMult",   `×${multiplier.toFixed(1)}`);
  setText("claimStreak", t("claim.streakDays", { n: user.streak || 0 }));

  const btn = document.getElementById("claimBtn");
  const hint = document.getElementById("claimHint");
  const ringFg = document.getElementById("claimRingFg");
  const ringCirc = 628;

  const now = Date.now();
  const next = nextClaimTime(user.lastClaim || 0);

  if (now >= next) {
    if (btn) { btn.disabled = false; btn.textContent = t("claim.btn"); btn.classList.add("btn--gold"); }
    if (hint) hint.textContent = t("claim.ready");
    setText("claimCountdown", "");
    if (ringFg) ringFg.style.strokeDashoffset = 0;
    if (claimTimer) { clearInterval(claimTimer); claimTimer = null; }
  } else {
    if (btn) { btn.disabled = true; btn.classList.remove("btn--gold"); btn.textContent = t("claim.btnClaimed"); }
    if (hint) hint.textContent = t("claim.nextIn");

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

      const total = 24 * 3600 * 1000;
      const elapsed = total - remaining;
      const pct = elapsed / total;
      if (ringFg) ringFg.style.strokeDashoffset = ringCirc * (1 - pct);
    }, 1000);
  }

  loadClaimHistory(user.uid);
}

async function doClaim() {
  if (!currentUser) return;
  const user = currentUser;
  const now = Date.now();
  const next = nextClaimTime(user.lastClaim || 0);

  if (now < next) {
    toast(t("claim.alreadyClaimed"), "err");
    return;
  }

  const btn = document.getElementById("claimBtn");
  btn.disabled = true;
  btn.textContent = t("claim.btnClaiming");

  try {
    const { amount, multiplier } = computeReward(user);
    const streak = (user.streak || 0) + 1;

    await update(ref(db, `users/${user.uid}`), {
      balance:        (user.balance || 0) + amount,
      lastClaim:      now,
      streak,
      loyaltyScore:   (user.loyaltyScore || 0) + 1,
      communityScore: (user.communityScore || 0) + 5
    });

    await push(ref(db, "claims"), {
      userId: user.uid,
      amount,
      multiplier,
      streak,
      date: now,
      type: "daily"
    });

    toast(t("claim.success", { n: amount, m: multiplier.toFixed(1) }), "ok", 3000);
    btn.textContent = t("claim.btnClaimedShort");
    btn.classList.remove("btn--gold");

    setTimeout(renderClaim, 600);
  } catch (err) {
    console.error("[NDOG] Claim failed:", err);
    toast(t("claim.failed"), "err");
    btn.disabled = false;
    btn.textContent = t("claim.btn");
  }
}

function loadClaimHistory(uid) {
  const list = document.getElementById("claimHistoryList");
  if (!list) return;
  list.innerHTML = `<div class="empty">${t("claim.loadingHistory")}</div>`;

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
      list.innerHTML = `<div class="empty">${t("claim.emptyHistory")}</div>`;
      return;
    }
    list.innerHTML = rows.slice(0, 30).map(c => `
      <div class="claim-row">
        <div>
          <div class="claim-row__amt">+${c.amount} NDOG</div>
          <div class="claim-row__date">${formatDate(c.date)} · 🔥 ${c.streak || 0}</div>
        </div>
        <div>${c.multiplier ? `×${c.multiplier.toFixed(1)}` : ""}</div>
      </div>
    `).join("");
  }, { onlyOnce: false });
}

function formatDate(ts) {
  if (!ts) return "—";
  const locale = getLang() === "ar" ? "ar-EG" : "en-US";
  return new Date(ts).toLocaleString(locale, {
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit"
  });
}
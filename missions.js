/**
 * NileDogs (NDOG) — Missions module
 * - Daily / weekly / monthly tasks
 * - Achievement badges
 * - Spin wheel (free daily spin)
 * - Lucky box (free 6h)
 * - Community events & challenges
 */

import { db, ref, get, set, update, push, onValue, APP_CONFIG } from "./firebase-config.js";
import { onUser, getCurrentUser } from "./auth.js";
import { toast, openModal, closeModal, animateCount } from "./app.js";

const MISSIONS = {
  daily: [
    { id: "d1", icon: "🎁", title: "Claim Daily Reward",  desc: "Claim your daily NDOG", reward: 5,  action: "claim" },
    { id: "d2", icon: "👥", title: "Share Referral Link", desc: "Share on social media", reward: 5,  action: "share" },
    { id: "d3", icon: "🎯", title: "Spin the Wheel",      desc: "One free daily spin",   reward: 3,  action: "spin"  },
    { id: "d4", icon: "📦", title: "Open Lucky Box",      desc: "Open a mystery box",    reward: 3,  action: "lucky" },
    { id: "d5", icon: "🏆", title: "Check Leaderboard",   desc: "Visit the leaderboard", reward: 2,  action: "leaderboard" }
  ],
  weekly: [
    { id: "w1", icon: "🔥", title: "7-Day Streak",        desc: "Claim 7 days in a row",      reward: 50,  action: "streak", target: 7 },
    { id: "w2", icon: "👥", title: "Invite 3 Friends",    desc: "Get 3 new referrals",         reward: 100, action: "referrals", target: 3 },
    { id: "w3", icon: "💎", title: "Reach 500 NDOG",      desc: "Grow your balance",           reward: 25,  action: "balance", target: 500 }
  ],
  monthly: [
    { id: "m1", icon: "👑", title: "Founder Status",      desc: "Be a pre-launch member",      reward: 200, action: "founder" },
    { id: "m2", icon: "🥇", title: "Reach Gold Rank",     desc: "Earn 2,000+ NDOG",            reward: 500, action: "balance", target: 2000 },
    { id: "m3", icon: "🌐", title: "Top 100 Globally",    desc: "Climb the leaderboard",       reward: 300, action: "rank" }
  ],
  badges: [
    { id: "b1", icon: "👑", title: "Founder",        desc: "Joined before launch",      req: "isFounder" },
    { id: "b2", icon: "🔥", title: "Streak Master",  desc: "30-day claim streak",        req: "streak30" },
    { id: "b3", icon: "👥", title: "Network Builder",desc: "10+ referrals",              req: "refs10" },
    { id: "b4", icon: "🥇", title: "Gold Member",    desc: "Reach Gold tier",            req: "balance2000" },
    { id: "b5", icon: "💎", title: "Diamond Hands",  desc: "Reach Diamond tier",         req: "balance10000" },
    { id: "b6", icon: "🏆", title: "Legend",         desc: "Reach Legend tier",          req: "balance50000" }
  ],
  events: [
    { id: "e1", icon: "🎉", title: "Launch Countdown Event",  desc: "Join the global launch party on Jan 1, 2028", reward: 1000, status: "Upcoming" },
    { id: "e2", icon: "🌍", title: "Community Challenge: 1M Referrals", desc: "Help the community reach 1M total referrals", reward: 500, status: "Active" },
    { id: "e3", icon: "🎁", title: "Weekly Lucky Draw",         desc: "Top 10 referrers each week share 5000 NDOG",  reward: 500, status: "Active" }
  ]
};

const SPIN_SEGMENTS = [
  { label: "+5",   value: 5,   color: "#1e90ff" },
  { label: "+10",  value: 10,  color: "#ffd700" },
  { label: "+0",   value: 0,   color: "#103463" },
  { label: "+25",  value: 25,  color: "#ff6ec7" },
  { label: "+15",  value: 15,  color: "#36f1a3" },
  { label: "+50",  value: 50,  color: "#a06bff" },
  { label: "+1",   value: 1,   color: "#4ec0ff" },
  { label: "+100", value: 100, color: "#ffb347" }
];

let currentTab = "daily";
let currentUser = null;
let lastSpinAt = 0;
let lastLuckyAt = 0;
let spinAngle = 0;
let spinning = false;

export function initMissions() {
  onUser((u) => {
    currentUser = u;
    if (u) {
      lastSpinAt = u.lastSpin || 0;
      lastLuckyAt = u.lastLucky || 0;
    }
  });

  // Tabs
  document.querySelectorAll("[data-mtab]").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll("[data-mtab]").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      currentTab = tab.dataset.mtab;
      renderTab();
    });
  });

  // Spin modal
  document.getElementById("openSpin")?.addEventListener("click", openSpin);
  document.getElementById("spinNowBtn")?.addEventListener("click", doSpin);
  // Lucky modal
  document.getElementById("openLucky")?.addEventListener("click", openLucky);
  document.getElementById("luckyOpenBtn")?.addEventListener("click", doLucky);

  document.addEventListener("ndog:viewchange", (e) => {
    if (e.detail.view === "missions") renderTab();
  });

  renderTab();
}

function renderTab() {
  const list = document.getElementById("missionsList");
  if (!list) return;
  if (!currentUser) {
    list.innerHTML = `<div class="empty">Sign in to view your missions.</div>`;
    return;
  }
  const items = MISSIONS[currentTab] || [];
  if (currentTab === "badges") {
    list.innerHTML = items.map(b => {
      const unlocked = isBadgeUnlocked(b, currentUser);
      return `
        <div class="mission-card ${unlocked ? "done" : ""}">
          <div class="mission-card__icon" style="${unlocked ? "" : "filter:grayscale(1) opacity(0.5)"}">${b.icon}</div>
          <div class="mission-card__body">
            <div class="mission-card__title">${b.title}${unlocked ? " ✓" : ""}</div>
            <div class="mission-card__desc">${b.desc}</div>
          </div>
          <div class="mission-card__action">
            <span style="font-size:11px;color:${unlocked ? "var(--neon-green)" : "var(--text-mute)"}">${unlocked ? "Unlocked" : "Locked"}</span>
          </div>
        </div>`;
    }).join("");
    return;
  }
  if (currentTab === "events") {
    list.innerHTML = items.map(e => `
      <div class="mission-card">
        <div class="mission-card__icon">${e.icon}</div>
        <div class="mission-card__body">
          <div class="mission-card__title">${e.title}</div>
          <div class="mission-card__desc">${e.desc}</div>
          <div class="mission-card__reward">+${e.reward} NDOG</div>
        </div>
        <div class="mission-card__action">
          <span class="lb-row__score" style="background:rgba(54,241,163,0.15);padding:4px 10px;border-radius:999px;font-size:11px;">${e.status}</span>
        </div>
      </div>`).join("");
    return;
  }
  // tasks
  list.innerHTML = items.map(m => {
    const done = isTaskDone(m, currentUser);
    return `
      <div class="mission-card ${done ? "done" : ""}">
        <div class="mission-card__icon">${m.icon}</div>
        <div class="mission-card__body">
          <div class="mission-card__title">${m.title}${done ? " ✓" : ""}</div>
          <div class="mission-card__desc">${m.desc}</div>
          <div class="mission-card__reward">+${m.reward} NDOG</div>
        </div>
        <div class="mission-card__action">
          ${done
            ? `<button class="btn btn--ghost btn--sm" disabled>Done</button>`
            : `<button class="btn btn--gold btn--sm" data-mission="${m.id}">Go</button>`}
        </div>
      </div>`;
  }).join("");

  // Wire "Go" buttons
  list.querySelectorAll("[data-mission]").forEach(btn => {
    btn.addEventListener("click", () => handleMissionAction(btn.dataset.mission));
  });
}

function isTaskDone(m, user) {
  switch (m.action) {
    case "claim":      return isToday(user.lastClaim);
    case "spin":       return isToday(user.lastSpin);
    case "lucky":      return (Date.now() - (user.lastLucky || 0)) < 6 * 3600 * 1000;
    case "share":      return false; // could track via storage
    case "leaderboard":return false;
    case "streak":     return (user.streak || 0) >= (m.target || 7);
    case "referrals":  return (user.totalReferrals || 0) >= (m.target || 3);
    case "balance":    return (user.balance || 0) >= (m.target || 0);
    case "founder":    return !!user.isFounder;
    case "rank":       return false; // would need leaderboard position
    default:           return false;
  }
}

function isBadgeUnlocked(b, user) {
  switch (b.req) {
    case "isFounder":       return !!user.isFounder;
    case "streak30":        return (user.streak || 0) >= 30;
    case "refs10":          return (user.totalReferrals || 0) >= 10;
    case "balance2000":     return (user.balance || 0) >= 2000;
    case "balance10000":    return (user.balance || 0) >= 10000;
    case "balance50000":    return (user.balance || 0) >= 50000;
    default:                return false;
  }
}

function isToday(ts) {
  if (!ts) return false;
  return Date.now() - ts < 24 * 3600 * 1000;
}

async function handleMissionAction(missionId) {
  const all = [...MISSIONS.daily, ...MISSIONS.weekly, ...MISSIONS.monthly];
  const m = all.find(x => x.id === missionId);
  if (!m || !currentUser) return;

  switch (m.action) {
    case "claim":
      window.ndogSetView("claim");
      break;
    case "share":
      window.ndogSetView("referral");
      toast("Share your referral link to complete this mission!", "info");
      break;
    case "spin":
      openSpin();
      break;
    case "lucky":
      openLucky();
      break;
    case "leaderboard":
      window.ndogSetView("leaderboard");
      break;
    default:
      toast("This mission is automatically tracked.", "info");
  }
}

// ───────────────────────────────────────────────────────────────────
// SPIN WHEEL
// ───────────────────────────────────────────────────────────────────
function openSpin() {
  if (!currentUser) return;
  const canSpin = Date.now() - lastSpinAt >= 24 * 3600 * 1000;
  if (!canSpin) {
    toast("You already spun today. Come back tomorrow!", "err");
    return;
  }
  openModal("spinModal");
  drawWheel(0);
}

function drawWheel(angle) {
  const canvas = document.getElementById("spinCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const radius = Math.min(cx, cy) - 12;
  const seg = (Math.PI * 2) / SPIN_SEGMENTS.length;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // outer glow ring
  ctx.beginPath();
  ctx.arc(cx, cy, radius + 8, 0, Math.PI * 2);
  ctx.strokeStyle = "#ffd700";
  ctx.lineWidth = 3;
  ctx.shadowColor = "#ffd700";
  ctx.shadowBlur = 16;
  ctx.stroke();
  ctx.shadowBlur = 0;

  SPIN_SEGMENTS.forEach((s, i) => {
    const start = angle + i * seg;
    const end = start + seg;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, start, end);
    ctx.closePath();
    ctx.fillStyle = s.color;
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.2)";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Label
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(start + seg / 2);
    ctx.textAlign = "right";
    ctx.fillStyle = "#fff";
    ctx.font = "bold 18px Arial";
    ctx.fillText(s.label, radius - 12, 6);
    ctx.restore();
  });

  // Hub
  ctx.beginPath();
  ctx.arc(cx, cy, 18, 0, Math.PI * 2);
  ctx.fillStyle = "#0a1f44";
  ctx.fill();
  ctx.strokeStyle = "#ffd700";
  ctx.lineWidth = 3;
  ctx.stroke();
}

async function doSpin() {
  if (spinning || !currentUser) return;
  const canSpin = Date.now() - lastSpinAt >= 24 * 3600 * 1000;
  if (!canSpin) {
    toast("Already spun today!", "err");
    return;
  }
  spinning = true;
  const btn = document.getElementById("spinNowBtn");
  btn.disabled = true;
  btn.textContent = "Spinning…";

  // Random winning segment
  const winningIdx = Math.floor(Math.random() * SPIN_SEGMENTS.length);
  const segAngle = (Math.PI * 2) / SPIN_SEGMENTS.length;
  // Pointer is at top (-π/2). We need winning segment center under pointer.
  const targetCenter = -Math.PI / 2;
  const currentSegCenter = spinAngle + winningIdx * segAngle + segAngle / 2;
  // Spin multiple full turns + delta
  const fullTurns = 6;
  const delta = targetCenter - currentSegCenter;
  const final = spinAngle + fullTurns * Math.PI * 2 + delta;

  const duration = 4500;
  const startAngle = spinAngle;
  const t0 = performance.now();
  function step(t) {
    const p = Math.min(1, (t - t0) / duration);
    const eased = 1 - Math.pow(1 - p, 4);
    spinAngle = startAngle + (final - startAngle) * eased;
    drawWheel(spinAngle);
    if (p < 1) requestAnimationFrame(step);
    else {
      onSpinEnd(winningIdx);
    }
  }
  requestAnimationFrame(step);
}

async function onSpinEnd(idx) {
  spinning = false;
  const reward = SPIN_SEGMENTS[idx].value;
  const btn = document.getElementById("spinNowBtn");
  btn.disabled = false;
  btn.textContent = "Spin Again";

  lastSpinAt = Date.now();
  try {
    await update(ref(db, `users/${currentUser.uid}`), {
      balance:  (currentUser.balance || 0) + reward,
      lastSpin: lastSpinAt
    });
    if (reward > 0) {
      toast(`🎉 You won ${reward} NDOG!`, "ok", 3000);
      await push(ref(db, "claims"), {
        userId: currentUser.uid,
        amount: reward,
        type:   "spin",
        date:   Date.now()
      });
    } else {
      toast("Better luck next time! 🎡", "info");
    }
  } catch (err) {
    console.error("[NDOG] Spin reward failed:", err);
    toast("Spin recorded but reward failed. Contact support.", "err");
  }
  setTimeout(() => closeModal("spinModal"), 1800);
}

// ───────────────────────────────────────────────────────────────────
// LUCKY BOX
// ───────────────────────────────────────────────────────────────────
function openLucky() {
  if (!currentUser) return;
  const canOpen = Date.now() - lastLuckyAt >= 6 * 3600 * 1000;
  if (!canOpen) {
    const remaining = 6 * 3600 * 1000 - (Date.now() - lastLuckyAt);
    const h = Math.floor(remaining / 3600000);
    const m = Math.floor((remaining % 3600000) / 60000);
    toast(`Lucky box recharges in ${h}h ${m}m`, "err");
    return;
  }
  openModal("luckyModal");
  const box = document.getElementById("luckyBox");
  if (box) { box.classList.remove("open"); box.textContent = "🎁"; }
  const lb = document.getElementById("luckyOpenBtn");
  if (lb) { lb.disabled = false; lb.textContent = "Open Box"; }
}

async function doLucky() {
  if (!currentUser) return;
  const btn = document.getElementById("luckyOpenBtn");
  btn.disabled = true;
  const box = document.getElementById("luckyBox");
  box.classList.add("open");

  const reward = Math.floor(5 + Math.random() * 96); // 5–100
  lastLuckyAt = Date.now();

  setTimeout(async () => {
    box.textContent = "🎉";
    try {
      await update(ref(db, `users/${currentUser.uid}`), {
        balance:   (currentUser.balance || 0) + reward,
        lastLucky: lastLuckyAt
      });
      toast(`🎉 You found ${reward} NDOG in the lucky box!`, "ok", 3500);
      await push(ref(db, "claims"), {
        userId: currentUser.uid,
        amount: reward,
        type:   "lucky",
        date:   Date.now()
      });
    } catch (err) {
      console.error("[NDOG] Lucky reward failed:", err);
    }
    btn.textContent = "Opened ✓";
    setTimeout(() => closeModal("luckyModal"), 1500);
  }, 700);
}

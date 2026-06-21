/**
 * NileDogs (NDOG) — Missions module
 * Mission titles & descriptions are looked up via i18n.t() so they
 * follow the user's chosen language.
 */

import { db, ref, get, set, update, push, onValue, APP_CONFIG } from "./firebase-config.js";
import { onUser, getCurrentUser } from "./auth.js";
import { toast, openModal, closeModal, animateCount } from "./app.js";
import { t, onLangChange } from "./i18n.js";

const MISSIONS = {
  daily: [
    { id: "d1", icon: "🎁", titleKey: "mission.d1.title", descKey: "mission.d1.desc", reward: 5,  action: "claim" },
    { id: "d2", icon: "👥", titleKey: "mission.d2.title", descKey: "mission.d2.desc", reward: 5,  action: "share" },
    { id: "d3", icon: "🎯", titleKey: "mission.d3.title", descKey: "mission.d3.desc", reward: 3,  action: "spin"  },
    { id: "d4", icon: "📦", titleKey: "mission.d4.title", descKey: "mission.d4.desc", reward: 3,  action: "lucky" },
    { id: "d5", icon: "🏆", titleKey: "mission.d5.title", descKey: "mission.d5.desc", reward: 2,  action: "leaderboard" }
  ],
  weekly: [
    { id: "w1", icon: "🔥", titleKey: "mission.w1.title", descKey: "mission.w1.desc", reward: 50,  action: "streak", target: 7 },
    { id: "w2", icon: "👥", titleKey: "mission.w2.title", descKey: "mission.w2.desc", reward: 100, action: "referrals", target: 3 },
    { id: "w3", icon: "💎", titleKey: "mission.w3.title", descKey: "mission.w3.desc", reward: 25,  action: "balance", target: 500 }
  ],
  monthly: [
    { id: "m1", icon: "👑", titleKey: "mission.m1.title", descKey: "mission.m1.desc", reward: 200, action: "founder" },
    { id: "m2", icon: "🥇", titleKey: "mission.m2.title", descKey: "mission.m2.desc", reward: 500, action: "balance", target: 2000 },
    { id: "m3", icon: "🌐", titleKey: "mission.m3.title", descKey: "mission.m3.desc", reward: 300, action: "rank" }
  ],
  badges: [
    { id: "b1", icon: "👑", titleKey: "mission.b1.title", descKey: "mission.b1.desc", req: "isFounder" },
    { id: "b2", icon: "🔥", titleKey: "mission.b2.title", descKey: "mission.b2.desc", req: "streak30" },
    { id: "b3", icon: "👥", titleKey: "mission.b3.title", descKey: "mission.b3.desc", req: "refs10" },
    { id: "b4", icon: "🥇", titleKey: "mission.b4.title", descKey: "mission.b4.desc", req: "balance2000" },
    { id: "b5", icon: "💎", titleKey: "mission.b5.title", descKey: "mission.b5.desc", req: "balance10000" },
    { id: "b6", icon: "🏆", titleKey: "mission.b6.title", descKey: "mission.b6.desc", req: "balance50000" }
  ],
  events: [
    { id: "e1", icon: "🎉", titleKey: "mission.e1.title", descKey: "mission.e1.desc", reward: 1000, status: "Upcoming" },
    { id: "e2", icon: "🌍", titleKey: "mission.e2.title", descKey: "mission.e2.desc", reward: 500, status: "Active" },
    { id: "e3", icon: "🎁", titleKey: "mission.e3.title", descKey: "mission.e3.desc", reward: 500, status: "Active" }
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

  document.querySelectorAll("[data-mtab]").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll("[data-mtab]").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      currentTab = tab.dataset.mtab;
      renderTab();
    });
  });

  document.getElementById("openSpin")?.addEventListener("click", openSpin);
  document.getElementById("spinNowBtn")?.addEventListener("click", doSpin);
  document.getElementById("openLucky")?.addEventListener("click", openLucky);
  document.getElementById("luckyOpenBtn")?.addEventListener("click", doLucky);

  document.addEventListener("ndog:viewchange", (e) => {
    if (e.detail.view === "missions") renderTab();
  });

  onLangChange(() => {
    renderTab();
  });

  renderTab();
}

function renderTab() {
  const list = document.getElementById("missionsList");
  if (!list) return;
  if (!currentUser) {
    list.innerHTML = `<div class="empty">${t("missions.signInFirst")}</div>`;
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
            <div class="mission-card__title">${t(b.titleKey)}${unlocked ? " ✓" : ""}</div>
            <div class="mission-card__desc">${t(b.descKey)}</div>
          </div>
          <div class="mission-card__action">
            <span style="font-size:11px;color:${unlocked ? "var(--neon-green)" : "var(--text-mute)"}">${unlocked ? t("missions.unlocked") : t("missions.locked")}</span>
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
          <div class="mission-card__title">${t(e.titleKey)}</div>
          <div class="mission-card__desc">${t(e.descKey)}</div>
          <div class="mission-card__reward">+${e.reward} NDOG</div>
        </div>
        <div class="mission-card__action">
          <span class="lb-row__score" style="background:rgba(54,241,163,0.15);padding:4px 10px;border-radius:999px;font-size:11px;">${e.status}</span>
        </div>
      </div>`).join("");
    return;
  }
  list.innerHTML = items.map(m => {
    const done = isTaskDone(m, currentUser);
    return `
      <div class="mission-card ${done ? "done" : ""}">
        <div class="mission-card__icon">${m.icon}</div>
        <div class="mission-card__body">
          <div class="mission-card__title">${t(m.titleKey)}${done ? " ✓" : ""}</div>
          <div class="mission-card__desc">${t(m.descKey)}</div>
          <div class="mission-card__reward">+${m.reward} NDOG</div>
        </div>
        <div class="mission-card__action">
          ${done
            ? `<button class="btn btn--ghost btn--sm" disabled>${t("missions.done")}</button>`
            : `<button class="btn btn--gold btn--sm" data-mission="${m.id}">${t("missions.go")}</button>`}
        </div>
      </div>`;
  }).join("");

  list.querySelectorAll("[data-mission]").forEach(btn => {
    btn.addEventListener("click", () => handleMissionAction(btn.dataset.mission));
  });
}

function isTaskDone(m, user) {
  switch (m.action) {
    case "claim":      return isToday(user.lastClaim);
    case "spin":       return isToday(user.lastSpin);
    case "lucky":      return (Date.now() - (user.lastLucky || 0)) < 6 * 3600 * 1000;
    case "share":      return false;
    case "leaderboard":return false;
    case "streak":     return (user.streak || 0) >= (m.target || 7);
    case "referrals":  return (user.totalReferrals || 0) >= (m.target || 3);
    case "balance":    return (user.balance || 0) >= (m.target || 0);
    case "founder":    return !!user.isFounder;
    case "rank":       return false;
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
      toast(t("missions.shareHint"), "info");
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
      toast(t("missions.autoTracked"), "info");
  }
}

function openSpin() {
  if (!currentUser) return;
  const canSpin = Date.now() - lastSpinAt >= 24 * 3600 * 1000;
  if (!canSpin) {
    toast(t("missions.spinDone"), "err");
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

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(start + seg / 2);
    ctx.textAlign = "right";
    ctx.fillStyle = "#fff";
    ctx.font = "bold 18px Arial";
    ctx.fillText(s.label, radius - 12, 6);
    ctx.restore();
  });

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
    toast(t("missions.spinDone"), "err");
    return;
  }
  spinning = true;
  const btn = document.getElementById("spinNowBtn");
  btn.disabled = true;
  btn.textContent = t("missions.spinning");

  const winningIdx = Math.floor(Math.random() * SPIN_SEGMENTS.length);
  const segAngle = (Math.PI * 2) / SPIN_SEGMENTS.length;
  const targetCenter = -Math.PI / 2;
  const currentSegCenter = spinAngle + winningIdx * segAngle + segAngle / 2;
  const fullTurns = 6;
  const delta = targetCenter - currentSegCenter;
  const final = spinAngle + fullTurns * Math.PI * 2 + delta;

  const duration = 4500;
  const startAngle = spinAngle;
  const t0 = performance.now();
  function step(now) {
    const p = Math.min(1, (now - t0) / duration);
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
  btn.textContent = t("missions.spinAgain");

  lastSpinAt = Date.now();
  try {
    await update(ref(db, `users/${currentUser.uid}`), {
      balance:  (currentUser.balance || 0) + reward,
      lastSpin: lastSpinAt
    });
    if (reward > 0) {
      toast(t("missions.spinWon", { n: reward }), "ok", 3000);
      await push(ref(db, "claims"), {
        userId: currentUser.uid,
        amount: reward,
        type:   "spin",
        date:   Date.now()
      });
    } else {
      toast(t("missions.spinNoLuck"), "info");
    }
  } catch (err) {
    console.error("[NDOG] Spin reward failed:", err);
    toast(t("missions.spinFailed"), "err");
  }
  setTimeout(() => closeModal("spinModal"), 1800);
}

function openLucky() {
  if (!currentUser) return;
  const canOpen = Date.now() - lastLuckyAt >= 6 * 3600 * 1000;
  if (!canOpen) {
    const remaining = 6 * 3600 * 1000 - (Date.now() - lastLuckyAt);
    const h = Math.floor(remaining / 3600000);
    const m = Math.floor((remaining % 3600000) / 60000);
    toast(t("missions.luckyRecharge", { h, m }), "err");
    return;
  }
  openModal("luckyModal");
  const box = document.getElementById("luckyBox");
  if (box) { box.classList.remove("open"); box.textContent = "🎁"; }
  const lb = document.getElementById("luckyOpenBtn");
  if (lb) { lb.disabled = false; lb.textContent = t("missions.openBox"); }
}

async function doLucky() {
  if (!currentUser) return;
  const btn = document.getElementById("luckyOpenBtn");
  btn.disabled = true;
  const box = document.getElementById("luckyBox");
  box.classList.add("open");

  const reward = Math.floor(5 + Math.random() * 96);
  lastLuckyAt = Date.now();

  setTimeout(async () => {
    box.textContent = "🎉";
    try {
      await update(ref(db, `users/${currentUser.uid}`), {
        balance:   (currentUser.balance || 0) + reward,
        lastLucky: lastLuckyAt
      });
      toast(t("missions.luckyWon", { n: reward }), "ok", 3500);
      await push(ref(db, "claims"), {
        userId: currentUser.uid,
        amount: reward,
        type:   "lucky",
        date:   Date.now()
      });
    } catch (err) {
      console.error("[NDOG] Lucky reward failed:", err);
    }
    btn.textContent = t("missions.opened");
    setTimeout(() => closeModal("luckyModal"), 1500);
  }, 700);
}

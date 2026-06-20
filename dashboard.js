/**
 * NileDogs (NDOG) — Dashboard module
 * Binds user data to the dashboard view + top bar.
 */

import { db, ref, onValue, APP_CONFIG } from "./firebase-config.js";
import { onUser, getCurrentUser } from "./auth.js";
import { animateCount, copyText, toast, openModal } from "./app.js";
import { shareLink, generateQR } from "./referral.js";

let bound = false;

export function bindDashboard() {
  if (bound) return;
  bound = true;

  onUser((user) => {
    if (!user) return;
    renderDashboard(user);
  });

  // QR trigger from dashboard
  document.getElementById("qrTrigger")?.addEventListener("click", () => {
    const u = getCurrentUser();
    if (!u) return;
    generateQR(`${APP_CONFIG.domain}?ref=${u.referralCode}`);
    openModal("qrModal");
  });

  // share buttons on dashboard
  document.querySelectorAll("#view-dashboard .ref-card__share [data-share]").forEach(btn => {
    btn.addEventListener("click", () => {
      const u = getCurrentUser();
      if (!u) return;
      shareLink(btn.dataset.share, `${APP_CONFIG.domain}?ref=${u.referralCode}`);
    });
  });
}

function renderDashboard(user) {
  if (!user) return;

  // Helper: safe text setter
  const setText = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };
  const setSrc = (id, val) => {
    const el = document.getElementById(id);
    if (el && val) el.src = val;
  };

  // Avatar
  setSrc("dashAvatar", user.photoURL);

  // Name & meta
  setText("dashName",    user.name || "User");
  setText("dashJoined",  `Member since ${formatDate(user.createdAt)}`);
  setText("dashCountry", `🌍 ${user.country || "Global"}`);

  // Stats
  animateCount(document.getElementById("statBalance"),   user.balance || 0);
  animateCount(document.getElementById("statCommunity"), user.communityScore || 0);
  animateCount(document.getElementById("statLoyalty"),   user.loyaltyScore || 0);
  animateCount(document.getElementById("statRefs"),      user.totalReferrals || 0);
  animateCount(document.getElementById("topbarBalNum"),  user.balance || 0);

  // Rank chip
  const level = computeLevel(user.balance || 0);
  const rankChip = document.getElementById("dashRankChip");
  if (rankChip) {
    rankChip.innerHTML = `<span class="dash__rank-icon">${level.icon}</span><span>${level.name}</span>`;
  }
  setText("dashRankName", level.name);

  // Referral code & link
  setText("dashRefCode", user.referralCode || "NDOG—");
  setText("dashRefLink", `${APP_CONFIG.domain}?ref=${user.referralCode || ""}`);

  // Level progress
  renderLevelProgress(user.balance || 0);

  // Early adopter banner
  const ea = document.getElementById("earlyAdopterBanner");
  if (ea) {
    ea.style.display = user.isFounder ? "flex" : "none";
  }
}

function renderLevelProgress(balance) {
  const levels = APP_CONFIG.rewardLevels;
  const current = computeLevel(balance);
  const next = levels.find(l => l.min > balance);
  const fill = document.getElementById("levelFill");
  const nextLbl = document.getElementById("levelNext");

  if (!next) {
    if (fill) fill.style.width = "100%";
    if (nextLbl) nextLbl.textContent = "Max level reached 👑";
  } else {
    const prevMin = current.min;
    const range = next.min - prevMin;
    const pct = Math.min(100, ((balance - prevMin) / range) * 100);
    if (fill) fill.style.width = pct + "%";
    if (nextLbl) nextLbl.textContent = `Next: ${next.name} (${(next.min - balance).toLocaleString()} NDOG to go)`;
  }

  // Badges
  const wrap = document.getElementById("levelBadges");
  if (wrap) {
    wrap.innerHTML = levels.map(l => `
      <div class="level-badge ${balance >= l.min ? "unlocked" : ""}">
        <span class="lb-icon">${l.icon}</span>
        <span class="lb-name">${l.name}</span>
      </div>
    `).join("");
  }
}

export function computeLevel(balance) {
  const levels = APP_CONFIG.rewardLevels;
  let result = levels[0];
  for (const l of levels) if (balance >= l.min) result = l;
  return result;
}

function formatDate(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

/**
 * NileDogs (NDOG) — Dashboard module
 * Binds user data to the dashboard view + top bar.
 * Imports shareLink/generateQR from share-utils.js (not referral.js)
 * to break the circular dependency: app.js → dashboard.js → referral.js → app.js
 */

import { APP_CONFIG } from "./firebase-config.js";
import { onUser, getCurrentUser } from "./auth.js";
import { animateCount, openModal } from "./utils.js";
import { t, getLang, onLangChange } from "./i18n.js";
import { shareLink, generateQR } from "./share-utils.js";

let bound = false;

export function bindDashboard() {
  if (bound) return;
  bound = true;

  let lastUser = null;

  onUser((user) => {
    if (!user) return;
    lastUser = user;
    renderDashboard(user);
  });

  onLangChange(() => {
    if (lastUser) renderDashboard(lastUser);
  });

  document.getElementById("qrTrigger")?.addEventListener("click", () => {
    const u = getCurrentUser();
    if (!u) return;
    generateQR(`${APP_CONFIG.domain}?ref=${u.referralCode}`);
    openModal("qrModal");
  });

  document.querySelectorAll("#view-dashboard .ref-card__share [data-share]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const u = getCurrentUser();
      if (!u) return;
      shareLink(btn.dataset.share, `${APP_CONFIG.domain}?ref=${u.referralCode}`);
    });
  });
}

function renderDashboard(user) {
  if (!user) return;

  const setText = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  const setSrc = (id, val) => {
    const el = document.getElementById(id);
    if (el && val) el.src = val;
  };

  setSrc("dashAvatar", user.photoURL);
  setText("dashName", user.name || "User");
  setText("dashJoined", t("dash.memberSince", { date: formatDate(user.createdAt) }));
  setText("dashCountry", `🌍 ${user.country || t("lb.globalLabel")}`);

  animateCount(document.getElementById("statBalance"), user.balance || 0);
  animateCount(document.getElementById("statCommunity"), user.communityScore || 0);
  animateCount(document.getElementById("statLoyalty"), user.loyaltyScore || 0);
  animateCount(document.getElementById("statRefs"), user.totalReferrals || 0);
  animateCount(document.getElementById("topbarBalNum"), user.balance || 0);

  const level = computeLevel(user.balance || 0);
  const levelName = t(level.nameKey || level.name);

  const rankChip = document.getElementById("dashRankChip");
  if (rankChip) rankChip.innerHTML = `${levelName}`;

  setText("dashRankName", levelName);
  setText("dashRefCode", user.referralCode || "NDOG—");
  setText("dashRefLink", `${APP_CONFIG.domain}?ref=${user.referralCode || ""}`);

  renderLevelProgress(user.balance || 0);

  const ea = document.getElementById("earlyAdopterBanner");
  if (ea) {
    ea.style.display = user.isFounder ? "flex" : "none";
  }
}

function renderLevelProgress(balance) {
  const levels = APP_CONFIG.rewardLevels || [];
  const current = computeLevel(balance);
  const next = levels.find((l) => l.min > balance);

  const fill = document.getElementById("levelFill");
  const nextLbl = document.getElementById("levelNext");

  if (!next) {
    if (fill) fill.style.width = "100%";
    if (nextLbl) nextLbl.textContent = t("dash.maxLevel");
  } else {
    const prevMin = current.min || 0;
    const range = Math.max(1, next.min - prevMin);
    const pct = Math.min(100, ((balance - prevMin) / range) * 100);

    if (fill) fill.style.width = pct + "%";
    if (nextLbl) {
      const nextName = t(next.nameKey || next.name);
      nextLbl.textContent = t("dash.nextLevel", {
        name: nextName,
        remaining: (next.min - balance).toLocaleString()
      });
    }
  }

  const wrap = document.getElementById("levelBadges");
  if (wrap) {
    wrap.innerHTML = levels.map((l) => {
      const levelName = t(l.nameKey || l.name);
      return `
        <span class="level-badge ${balance >= l.min ? "is-unlocked" : ""}">
          <span class="level-badge__icon">${l.icon || "•"}</span>
          <span class="level-badge__label">${levelName}</span>
        </span>
      `;
    }).join("");
  }
}

function computeLevel(balance) {
  const levels = APP_CONFIG.rewardLevels || [];
  let current = levels[0] || { min: 0, name: "Bronze", nameKey: "dash.level.bronze" };

  for (const l of levels) {
    if (balance >= l.min) current = l;
  }

  return current;
}

function formatDate(ts) {
  if (!ts) return "";
  const locale = getLang() === "ar" ? "ar-EG" : "en-US";
  return new Date(ts).toLocaleDateString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

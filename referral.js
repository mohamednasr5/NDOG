/**
 * NileDogs (NDOG) — Referral module
 * - Referral code & link management
 * - Social sharing (WhatsApp, Telegram, Facebook, X, Messenger)
 * - QR code generator
 * - 3-tier referral tree view
 * - Referral statistics
 */

import { db, ref, onValue, get, APP_CONFIG } from "./firebase-config.js";
import { onUser, getCurrentUser } from "./auth.js";
import { animateCount, toast, openModal } from "./app.js";

const SHARE_URLS = {
  whatsapp: t => `https://wa.me/?text=${encodeURIComponent(t)}`,
  telegram: t => `https://t.me/share/url?url=${encodeURIComponent(APP_CONFIG.domain)}&text=${encodeURIComponent(t)}`,
  facebook: t => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(APP_CONFIG.domain)}&quote=${encodeURIComponent(t)}`,
  x:        t => `https://twitter.com/intent/tweet?text=${encodeURIComponent(t)}&url=${encodeURIComponent(APP_CONFIG.domain)}`,
  messenger:t => `https://www.messenger.com/t/?link=${encodeURIComponent(APP_CONFIG.domain)}&text=${encodeURIComponent(t)}`
};

export function shareLink(platform, url) {
  const text = `🐕 Join me on NileDogs (NDOG)! Use my referral link to earn bonus NDOG tokens and become a founder before launch on Jan 1, 2028. 🚀`;
  const fullText = `${text}\n${url}`;
  const shareUrl = SHARE_URLS[platform] ? SHARE_URLS[platform](fullText) : url;
  window.open(shareUrl, "_blank", "noopener,noreferrer,width=640,height=560");
}

export function generateQR(text) {
  const host = document.getElementById("qrCanvas");
  if (!host) return;
  host.innerHTML = "";
  // Generate QR via the public API as a fallback for non-bundled static site
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {};
  img.onerror = () => {
    // fallback: draw a stylized box if QR fails
    host.innerHTML = `<div style="font-size:14px;color:#333;padding:40px;">${text}</div>`;
  };
  img.src = `https://api.qrserver.com/v1/create-qr-code/?size=216x216&bgcolor=ffffff&color=0a1f44&data=${encodeURIComponent(text)}`;
  img.alt = "QR Code";
  img.style.width = "216px";
  img.style.height = "216px";
  host.appendChild(img);
}

let bound = false;

export function initReferral() {
  if (bound) return;
  bound = true;

  onUser((u) => {
    if (u) renderReferral(u);
  });

  // Share buttons across both dashboard and referral view
  document.addEventListener("click", (e) => {
    const shareBtn = e.target.closest("[data-share]");
    if (!shareBtn) return;
    const u = getCurrentUser();
    if (!u) return;
    const url = `${APP_CONFIG.domain}?ref=${u.referralCode}`;
    shareLink(shareBtn.dataset.share, url);
  });

  // QR triggers
  document.getElementById("qrTrigger2")?.addEventListener("click", () => {
    const u = getCurrentUser();
    if (!u) return;
    generateQR(`${APP_CONFIG.domain}?ref=${u.referralCode}`);
    openModal("qrModal");
  });

  // view change → refresh
  document.addEventListener("ndog:viewchange", (e) => {
    if (e.detail.view === "referral") {
      const u = getCurrentUser();
      if (u) renderReferral(u);
    }
  });
}

function renderReferral(user) {
  // Inputs
  const codeInput = document.getElementById("refCodeInput");
  const linkInput = document.getElementById("refLinkInput");
  if (codeInput) codeInput.value = user.referralCode || "";
  if (linkInput) linkInput.value = `${APP_CONFIG.domain}?ref=${user.referralCode || ""}`;

  // Stats — animate from user record + referral records
  animateCount(document.getElementById("refStatTotal"), user.totalReferrals || 0);
  animateCount(document.getElementById("refStatEarn"),
    (user.totalReferrals || 0) * APP_CONFIG.referralReward.l1);

  loadReferralTree(user);
}

async function loadReferralTree(user) {
  const list = document.getElementById("refTreeList");
  if (!list) return;
  list.innerHTML = `<div class="empty">Loading…</div>`;

  // Read all referrals where this user is the referrer
  const snap = await get(ref(db, "referrals"));
  if (!snap.exists()) {
    list.innerHTML = `<div class="empty">No referrals yet — share your link to grow your network.</div>`;
    renderRefStats(0, 0);
    return;
  }

  const rows = [];
  snap.forEach(child => {
    const r = child.val();
    if (r.referrer === user.uid) rows.push(r);
  });

  if (!rows.length) {
    list.innerHTML = `<div class="empty">No referrals yet — share your link to grow your network.</div>`;
    renderRefStats(0, 0);
    return;
  }

  // Fetch user profiles for each referral (limit 50 for performance)
  const recent = rows.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 50);
  const usersSnap = await get(ref(db, "users"));
  const usersMap = {};
  if (usersSnap.exists()) usersSnap.forEach(c => { usersMap[c.key] = c.val(); });

  // Active = users who have at least one claim
  let active = 0;
  const claimsSnap = await get(ref(db, "claims"));
  const claimers = new Set();
  if (claimsSnap.exists()) claimsSnap.forEach(c => claimers.add(c.val().userId));

  list.innerHTML = recent.map(r => {
    const u = usersMap[r.referredUser] || {};
    if (claimers.has(r.referredUser)) active++;
    const tier = `L${r.level || 1}`;
    return `
      <div class="ref-row">
        <img class="ref-row__avatar" src="${u.photoURL || defaultAvatar(u.name)}" alt="" onerror="this.src='${defaultAvatar()}'"/>
        <div class="ref-row__meta">
          <div class="ref-row__name">${escapeHtml(u.name || "Anonymous")}</div>
          <div class="ref-row__sub">Joined ${formatDate(r.createdAt)} · ${u.country || "Global"}</div>
        </div>
        <span class="ref-row__tier">${tier} · +${APP_CONFIG.referralReward[`l${r.level || 1}`] || 0}</span>
      </div>
    `;
  }).join("");

  renderRefStats(rows.length, active);
}

function renderRefStats(total, active) {
  animateCount(document.getElementById("refStatTotal"), total);
  animateCount(document.getElementById("refStatActive"), active);
  const conv = total ? Math.round((active / total) * 100) : 0;
  document.getElementById("refStatConv").textContent = conv + "%";
}

function defaultAvatar(name) {
  const seed = (name || "ndog").slice(0, 1).toUpperCase();
  return `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" rx="32" fill="#0a1f44"/><text x="50%" y="50%" font-size="28" font-family="Arial" font-weight="bold" fill="#ffd700" text-anchor="middle" dominant-baseline="central">${seed}</text></svg>`
  )}`;
}

function formatDate(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

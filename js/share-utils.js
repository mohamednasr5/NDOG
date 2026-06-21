/**
 * NileDogs (NDOG) — Share utility functions
 * Extracted to break the circular dependency:
 *   app.js → dashboard.js → referral.js → app.js
 * Now: app.js → dashboard.js → share-utils.js (no cycle)
 *      app.js → referral.js → share-utils.js (no cycle)
 */

import { APP_CONFIG } from "./firebase-config.js";
import { t } from "./i18n.js";

const SHARE_URLS = {
  whatsapp: txt => `https://wa.me/?text=${encodeURIComponent(txt)}`,
  telegram: txt => `https://t.me/share/url?url=${encodeURIComponent(APP_CONFIG.domain)}&text=${encodeURIComponent(txt)}`,
  facebook: txt => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(APP_CONFIG.domain)}&quote=${encodeURIComponent(txt)}`,
  x:        txt => `https://twitter.com/intent/tweet?text=${encodeURIComponent(txt)}&url=${encodeURIComponent(APP_CONFIG.domain)}`,
  messenger:txt => `https://www.messenger.com/t/?link=${encodeURIComponent(APP_CONFIG.domain)}&text=${encodeURIComponent(txt)}`
};

export function shareLink(platform, url) {
  const text = t("ref.shareText");
  const fullText = `${text}\n${url}`;
  const shareUrl = SHARE_URLS[platform] ? SHARE_URLS[platform](fullText) : url;
  window.open(shareUrl, "_blank", "noopener,noreferrer,width=640,height=560");
}

export function generateQR(text) {
  const host = document.getElementById("qrCanvas");
  if (!host) return;
  host.innerHTML = "";
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {};
  img.onerror = () => {
    host.innerHTML = `<div style="font-size:14px;color:#333;padding:40px;">${text}</div>`;
  };
  img.src = `https://api.qrserver.com/v1/create-qr-code/?size=216x216&bgcolor=ffffff&color=0a1f44&data=${encodeURIComponent(text)}`;
  img.alt = "QR Code";
  img.style.width = "216px";
  img.style.height = "216px";
  host.appendChild(img);
}

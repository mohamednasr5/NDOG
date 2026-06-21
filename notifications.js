/**
 * NileDogs (NDOG) — Notifications module
 * - In-app notification feed (read from /notifications)
 * - Push notification subscription (best-effort, since Firebase Cloud
 *   Messaging requires a server / VAPID key — we surface a graceful
 *   fallback that asks for permission and falls back to in-app toasts
 *   when new notifications arrive via Realtime DB).
 */

import { db, ref, onValue } from "./firebase-config.js";
import { toast } from "./app.js";

let permissionAsked = false;

export function initNotifications() {
  // Ask for push permission lazily (after first user gesture)
  document.addEventListener("click", () => {
    if (permissionAsked) return;
    permissionAsked = true;
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, { once: true });

  // Listen to /notifications for new entries
  onValue(ref(db, "notifications"), (snap) => {
    if (!snap.exists()) return;
    const notifs = [];
    snap.forEach(c => notifs.push(c.val()));
    notifs.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    const latest = notifs[0];
    if (!latest) return;

    // Show only if newer than 60 seconds
    if (Date.now() - (latest.createdAt || 0) < 60 * 1000) {
      toast(`🔔 ${latest.title}: ${latest.message}`, "info", 5000);

      // Try native push if permission granted
      if ("Notification" in window && Notification.permission === "granted") {
        try {
          new Notification(latest.title, {
            body: latest.message,
            icon: "./assets/icons/icon-192.png",
            badge: "./assets/icons/icon-192.png",
            tag: "ndog-notif"
          });
        } catch (_) { /* service worker will handle */ }
      }
    }
  });
}

/**
 * FILE NAME: js/notifications.js
 * PURPOSE: Browser Notification API + Firebase-native realtime subscription.
 *          Permission request, foreground banner, sound alert, badge counter.
 * DEPENDENCIES: firebase.js, auth.js, database.js, utils.js
 * EXPORTS: notifications.requestPermission, notifications.start, notifications.send
 */

import { firebaseDb } from "./firebase.js";
import { auth } from "./auth.js";
import { db, PATHS } from "./database.js";
import { showToast, getCookie, setCookie } from "./utils.js";
import { ref, onValue, query, orderByChild, limitToLast } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

export const notifications = {
  _unsub: null,
  _audio: null,

  async requestPermission() {
    if (!("Notification" in window)) return false;
    if (Notification.permission === "granted") return true;
    if (Notification.permission === "denied") return false;
    const result = await Notification.requestPermission();
    return result === "granted";
  },

  start() {
    auth.onReady((user) => {
      if (!user) {
        if (this._unsub) {
          this._unsub();
          this._unsub = null;
        }
        return;
      }
      // Subscribe to /notifications/{uid}
      const q = query(ref(firebaseDb, `${PATHS.notifications}/${user.uid}`), orderByChild("ts"), limitToLast(10));
      this._unsub = onValue(q, (snap) => {
        const data = snap.val() || {};
        const items = Object.entries(data).sort((a, b) => (b[1].ts || 0) - (a[1].ts || 0));
        if (items.length === 0) return;
        // Find newest unread since last seen
        const lastSeen = Number(getCookie("ndog_last_notif_ts") || 0);
        const fresh = items.filter(([, n]) => (n.ts?.seconds ? n.ts.seconds * 1000 : n.ts || 0) > lastSeen);
        if (fresh.length === 0) return;
        const latest = fresh[0][1];
        setCookie("ndog_last_notif_ts", Date.now(), 1);
        // Foreground toast
        showToast(`${latest.title}: ${latest.body || ""}`, latest.type || "info");
        // Browser notification
        if (Notification.permission === "granted") {
          try {
            const n = new Notification("NileDogs — " + latest.title, {
              body: latest.body || "",
              icon: "/assets/icons/icon-512.png",
              badge: "/assets/icons/favicon.png",
              tag: "ndog-" + fresh[0][0]
            });
            n.onclick = () => {
              window.focus();
              n.close();
            };
          } catch (e) {
            console.warn("[notif] Browser notification failed:", e);
          }
        }
        // Sound alert
        this._beep();
        // Update badge counter
        this._updateBadge(items.filter(([, n]) => !n.read).length);
      });
    });
  },

  async send(uid, title, body, type = "info") {
    return db.notifications.send(uid, title, body, type);
  },

  _beep() {
    try {
      if (!this._audio) {
        this._audio = new Audio("data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=");
      }
      this._audio.volume = 0.3;
      this._audio.play().catch(() => {});
    } catch {
      /* audio blocked */
    }
  },

  _updateBadge(count) {
    const badge = document.querySelector(".notif-badge");
    if (!badge) return;
    badge.textContent = count > 99 ? "99+" : count;
    badge.style.display = count > 0 ? "flex" : "none";
  }
};

window.__notifications = notifications;

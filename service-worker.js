/**
 * NileDogs (NDOG) — Service Worker
 * ------------------------------------------------------------------
 * Strategy:
 *   - Precache app shell (HTML/CSS/JS + manifest + icons)
 *   - Cache-first for static assets
 *   - Stale-while-revalidate for Firebase SDK (CDN)
 *   - Network-first for navigation requests
 *   - Offline fallback page when everything else fails
 */

const VERSION      = "ndog-v1.0.2";
const SHELL_CACHE  = `${VERSION}-shell`;
const RUNTIME_CACHE = `${VERSION}-runtime`;
const CDN_CACHE    = `${VERSION}-cdn`;

// ✅ Fixed paths — all files are in the root (flat structure)
const APP_SHELL = [
  "./",
  "./index.html",
  "./admin.html",
  "./whitepaper-en.html",
  "./whitepaper-ar.html",
  "./manifest.json",
  "./styles.css",
  "./firebase-config.js",
  "./app.js",
  "./auth.js",
  "./dashboard.js",
  "./claim.js",
  "./referral.js",
  "./missions.js",
  "./leaderboard.js",
  "./admin.js",
  "./notifications.js",
  "./icon.svg",
  "./icon-192.png",
  "./icon-512.png",
  "./offline.html"
];

// -------------------------------------------------------------------
// INSTALL — precache the app shell
// -------------------------------------------------------------------
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(APP_SHELL).catch((err) => console.warn("SW install cache error:", err)))
      .then(() => self.skipWaiting())
  );
});

// -------------------------------------------------------------------
// ACTIVATE — clean up old caches
// -------------------------------------------------------------------
self.addEventListener("activate", (event) => {
  const valid = [SHELL_CACHE, RUNTIME_CACHE, CDN_CACHE];
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => !valid.includes(k)).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// -------------------------------------------------------------------
// FETCH — routing strategy
// -------------------------------------------------------------------
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.method !== "GET") return;

  // Firebase API calls → always network, never cache
  if (
    url.hostname.includes("firebaseio.com") ||
    url.hostname.includes("firebasedatabase.app") ||
    url.hostname.includes("googleapis.com")
  ) return;

  // Firebase SDK CDN → stale-while-revalidate
  if (url.hostname === "www.gstatic.com") {
    event.respondWith(staleWhileRevalidate(req, CDN_CACHE));
    return;
  }

  // Navigation requests → network-first, fallback to cached index, then offline
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(RUNTIME_CACHE).then(c => c.put(req, copy));
          return res;
        })
        .catch(() =>
          caches.match(req)
            .then(r => r || caches.match("./index.html"))
            .then(r => r || caches.match("./offline.html"))
        )
    );
    return;
  }

  // Static assets → cache-first
  event.respondWith(
    caches.match(req).then(cached =>
      cached || fetch(req).then(res => {
        const copy = res.clone();
        caches.open(RUNTIME_CACHE).then(c => c.put(req, copy));
        return res;
      }).catch(() => cached)
    )
  );
});

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  const network = fetch(req).then(res => {
    cache.put(req, res.clone());
    return res;
  }).catch(() => cached);
  return cached || network;
}

// -------------------------------------------------------------------
// PUSH NOTIFICATIONS
// -------------------------------------------------------------------
self.addEventListener("push", (event) => {
  let payload = { title: "NileDogs", body: "You have a new update" };
  try { payload = event.data.json(); } catch (_) { payload.body = event.data.text(); }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "./icon-192.png",
      badge: "./icon-192.png",
      vibrate: [80, 30, 80],
      data: payload.data || { url: "./" }
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "./";
  event.waitUntil(
    clients.matchAll({ type: "window" }).then(list => {
      for (const c of list) {
        if (c.url.includes(url) && "focus" in c) return c.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});

// -------------------------------------------------------------------
// MESSAGE — allow page to trigger skipWaiting
// -------------------------------------------------------------------
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

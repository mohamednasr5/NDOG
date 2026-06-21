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

const VERSION    = "ndog-v2.0.0";
const SHELL_CACHE = `${VERSION}-shell`;
const RUNTIME_CACHE = `${VERSION}-runtime`;
const CDN_CACHE    = `${VERSION}-cdn`;

const APP_SHELL = [
  "./",
  "./index.html",
  "./admin.html",
  "./whitepaper-en.html",
  "./whitepaper-ar.html",
  "./manifest.json",
  "./css/styles.css",
  "./js/i18n.js",
  "./js/share-utils.js",
  "./js/firebase-config.js",
  "./js/app.js",
  "./js/auth.js",
  "./js/dashboard.js",
  "./js/claim.js",
  "./js/referral.js",
  "./js/missions.js",
  "./js/leaderboard.js",
  "./js/admin.js",
  "./js/notifications.js",
  "./assets/icons/icon.svg",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/favicon.png",
  "./assets/icons/apple-touch-icon.png",
  "./offline.html",
  "./sitemap.xml",
  "./robots.txt",
];

// ───────────────────────────────────────────────────────────────────
// INSTALL — precache the app shell
// ───────────────────────────────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(APP_SHELL).catch((e) => console.warn('[SW] Precache partial fail:', e)))
      .then(() => self.skipWaiting())
  );
});

// ───────────────────────────────────────────────────────────────────
// ACTIVATE — clean up old caches + take control immediately
// ───────────────────────────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  const valid = [SHELL_CACHE, RUNTIME_CACHE, CDN_CACHE];
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => !valid.includes(k)).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: "window" }))
      .then(clients => clients.forEach(c =>
        c.postMessage({ type: "SW_ACTIVATED", version: VERSION })
      ))
  );
});

// ───────────────────────────────────────────────────────────────────
// FETCH — routing strategy
// ───────────────────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle GET requests for http/https (skip chrome-extension, moz-extension, etc.)
  if (req.method !== "GET") return;
  if (url.protocol !== "http:" && url.protocol !== "https:") return;

  // Firebase API calls → always network, never cache
  if (url.hostname.includes("firebaseio.com") ||
      url.hostname.includes("firebasedatabase.app") ||
      url.hostname.includes("googleapis.com")) {
    return;
  }

  // Firebase SDK CDN → stale-while-revalidate
  if (url.hostname === "www.gstatic.com") {
    event.respondWith(staleWhileRevalidate(req, CDN_CACHE));
    return;
  }

  // For same-origin static assets, strip ?v= cache-buster so the cache
  // lookup matches across requests with different version tags.
  let cacheKey = req;
  if (url.origin === self.location.origin && url.search.includes("v=")) {
    try { cacheKey = new Request(url.pathname, req); } catch (_) { cacheKey = req; }
  }

  // Navigation requests → network-first, fallback to cached index, then offline
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(RUNTIME_CACHE).then(c => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req)
          .then(r => r || caches.match("./index.html"))
          .then(r => r || caches.match("./offline.html"))
        )
    );
    return;
  }

  // Static assets → cache-first (using stripped cache key)
  event.respondWith(
    caches.match(cacheKey).then(cached => cached || fetch(req).then(res => {
      const copy = res.clone();
      caches.open(RUNTIME_CACHE).then(c => c.put(cacheKey, copy)).catch(() => {});
      return res;
    }).catch(() => cached))
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

// ───────────────────────────────────────────────────────────────────
// PUSH NOTIFICATIONS
// ───────────────────────────────────────────────────────────────────
self.addEventListener("push", (event) => {
  let payload = { title: "NileDogs", body: "You have a new update" };
  try { payload = event.data.json(); } catch (_) { payload.body = event.data.text(); }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "assets/icons/icon-192.png",
      badge: "assets/icons/icon-192.png",
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

// ───────────────────────────────────────────────────────────────────
// MESSAGE — allow page to trigger skipWaiting
// ───────────────────────────────────────────────────────────────────
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

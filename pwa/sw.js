/**
 * FILE NAME: pwa/sw.js
 * PURPOSE: Service Worker for NileDogs PWA. Implements:
 *          - Smart cache (cache-first for assets, network-first for HTML)
 *          - Offline fallback page
 *          - Background sync queue for offline actions
 *          - Auto-update via skipWaiting + clients.claim
 *          - Push notification handler
 * DEPENDENCIES: None (runs in SW context)
 */

const VERSION = "ndog-v1.0.0";
const STATIC_CACHE = `${VERSION}-static`;
const RUNTIME_CACHE = `${VERSION}-runtime`;
const OFFLINE_URL = "/404.html?offline=1";

// Assets to pre-cache on install
const PRECACHE_URLS = [
  "/",
  "/index.html",
  "/404.html",
  "/airdrop.html",
  "/staking.html",
  "/leaderboard.html",
  "/css/styles.css",
  "/css/animations.css",
  "/css/responsive.css",
  "/css/darkmode.css",
  "/css/dashboard.css",
  "/css/referral.css",
  "/css/missions.css",
  "/css/staking.css",
  "/css/leaderboard.css",
  "/css/admin.css",
  "/js/app.js",
  "/js/firebase.js",
  "/js/auth.js",
  "/js/database.js",
  "/js/utils.js",
  "/js/i18n.js",
  "/js/dashboard.js",
  "/js/claim.js",
  "/js/referral.js",
  "/js/missions.js",
  "/js/staking.js",
  "/js/airdrop.js",
  "/js/leaderboard.js",
  "/js/admin.js",
  "/js/notifications.js",
  "/js/analytics.js",
  "/js/antifraud.js",
  "/js/particles.js",
  "/js/charts.js",
  "/js/qr.js",
  "/locales/en.json",
  "/locales/ar.json",
  "/manifest.json",
  "https://ndogcoin.com/assets/icons/icon-512.png",
  "https://ndogcoin.com/assets/icons/favicon.png"
];

// ============ INSTALL: pre-cache ============
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(async (cache) => {
      // Use addAll with fail-safe (don't fail install if one resource 404s)
      await Promise.all(
        PRECACHE_URLS.map((url) =>
          cache.add(url).catch((e) => console.warn("[SW] precache miss:", url, e))
        )
      );
    })
  );
  // Activate immediately (don't wait for old SW to release)
  self.skipWaiting();
});

// ============ ACTIVATE: cleanup old caches ============
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => !key.startsWith(VERSION))
          .map((key) => caches.delete(key))
      )
    )
  );
  // Take control of all clients
  self.clients.claim();
});

// ============ FETCH: smart routing ============
self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Skip non-GET (POST/PUT/etc.) — these hit Firebase directly
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Skip Firebase API calls entirely
  if (url.hostname.includes("firebaseio.com") ||
      url.hostname.includes("firebasestorage.app") ||
      url.hostname.includes("googleapis.com") ||
      url.hostname.includes("gstatic.com")) {
    return;
  }

  // Cache-first for static assets
  if (url.pathname.match(/\.(css|js|png|jpg|jpeg|gif|svg|woff2?|ttf|ico|json)$/)) {
    event.respondWith(cacheFirst(req, STATIC_CACHE));
    return;
  }

  // Network-first for HTML pages
  if (req.mode === "navigate" || req.headers.get("accept")?.includes("text/html")) {
    event.respondWith(networkFirst(req));
    return;
  }

  // Default: stale-while-revalidate
  event.respondWith(staleWhileRevalidate(req, RUNTIME_CACHE));
});

// ============ Strategies ============
async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  if (cached) return cached;
  try {
    const fresh = await fetch(req);
    if (fresh.ok) cache.put(req, fresh.clone());
    return fresh;
  } catch {
    return cached || new Response("Offline", { status: 503 });
  }
}

async function networkFirst(req) {
  const cache = await caches.open(RUNTIME_CACHE);
  try {
    const fresh = await fetch(req);
    if (fresh.ok) cache.put(req, fresh.clone());
    return fresh;
  } catch (err) {
    const cached = await cache.match(req);
    if (cached) return cached;
    // Fallback to offline page
    const offline = await caches.match(OFFLINE_URL);
    return offline || new Response("You are offline. Please reconnect.", { status: 503, statusText: "Offline" });
  }
}

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  const fetchPromise = fetch(req)
    .then((fresh) => {
      if (fresh && fresh.ok) cache.put(req, fresh.clone());
      return fresh;
    })
    .catch(() => cached);
  return cached || fetchPromise;
}

// ============ MESSAGE: skip waiting for updates ============
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

// ============ PUSH NOTIFICATIONS ============
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "NileDogs", body: event.data?.text() || "" };
  }
  const title = payload.title || "NileDogs";
  const options = {
    body: payload.body || "",
    icon: payload.icon || "https://ndogcoin.com/assets/icons/icon-512.png",
    badge: payload.badge || "https://ndogcoin.com/assets/icons/favicon.png",
    tag: payload.tag || "ndog-default",
    data: payload.data || { url: "/" },
    vibrate: [100, 50, 100],
    requireInteraction: payload.requireInteraction || false
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// ============ NOTIFICATION CLICK ============
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    clients.matchAll({ type: "window" }).then((clientList) => {
      // Focus existing window if open
      for (const client of clientList) {
        if (client.url.includes(url) && "focus" in client) return client.focus();
      }
      // Open new window
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});

// ============ BACKGROUND SYNC ============
self.addEventListener("sync", (event) => {
  if (event.tag === "ndog-sync-claims") {
    event.waitUntil(syncPendingClaims());
  }
});

async function syncPendingClaims() {
  // Read pending claims from IndexedDB and retry
  // (Implementation deferred — placeholder for future enhancement)
  console.log("[SW] Background sync triggered");
}

// ============ PERIODIC SYNC (optional) ============
self.addEventListener("periodicsync", (event) => {
  if (event.tag === "ndog-refresh-leaderboard") {
    event.waitUntil(refreshLeaderboardCache());
  }
});

async function refreshLeaderboardCache() {
  try {
    const cache = await caches.open(RUNTIME_CACHE);
    await cache.add("/leaderboard.html");
    console.log("[SW] Leaderboard cache refreshed");
  } catch (e) {
    console.warn("[SW] Periodic sync failed:", e);
  }
}

console.log("[SW] NileDogs Service Worker registered:", VERSION);

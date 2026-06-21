/**
 * NileDogs (NDOG) — Service Worker  v2.0.1
 * ------------------------------------------------------------------
 * CRITICAL FIX: Previous version used cache-first for JS files, which
 * caused the browser to serve stale cached auth.js after deployment.
 * The old cached auth.js didn't have the `getCurrentUser` named export,
 * breaking the entire app with "does not provide an export" error.
 *
 * New strategy:
 *   - JS module files  → NETWORK-FIRST (always fetch fresh, cache fallback)
 *   - CSS / images     → STALE-WHILE-REVALIDATE (fast load, bg update)
 *   - Firebase SDK CDN → STALE-WHILE-REVALIDATE
 *   - Navigation/HTML  → NETWORK-FIRST (always fresh HTML)
 *   - Firebase API     → pass-through (never cache)
 *
 * Additionally: on activate, ALL caches are deleted (not just old-named
 * ones) to guarantee no stale files survive a deployment.
 * ------------------------------------------------------------------
 */

const VERSION     = "ndog-v2.1.1";
const CACHE_ASSET = `${VERSION}-asset`;
const CACHE_CDN   = `${VERSION}-cdn`;

// ───────────────────────────────────────────────────────────────────
// INSTALL — precache critical assets
// ───────────────────────────────────────────────────────────────────
const PRECACHE_ASSETS = [
  "./index.html",
  "./manifest.json",
  "./css/styles.css",
  "./assets/icons/icon.svg",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/favicon.png",
  "./assets/icons/apple-touch-icon.png",
  "./offline.html",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_ASSET)
      .then(cache => cache.addAll(PRECACHE_ASSETS))
      .catch(e => console.warn("[SW] Precache partial fail:", e))
      .then(() => self.skipWaiting())
  );
});

// ───────────────────────────────────────────────────────────────────
// ACTIVATE — DELETE ALL caches + take control
// ───────────────────────────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: "window" }))
      .then(clients => clients.forEach(c =>
        c.postMessage({ type: "SW_UPDATED", version: VERSION })
      ))
  );
});

// ───────────────────────────────────────────────────────────────────
// HELPERS
// ───────────────────────────────────────────────────────────────────
function isJS(url) {
  return url.pathname.endsWith(".js") || url.pathname.endsWith(".mjs");
}
function isCSS(url) {
  return url.pathname.endsWith(".css");
}
function isImage(url) {
  return /\.(png|jpg|jpeg|gif|svg|webp|ico)$/i.test(url.pathname);
}

async function networkFirst(req, cacheName, cacheResp = true) {
  const cache = await caches.open(cacheName);
  try {
    // "reload" forces the browser to bypass its own HTTP cache (disk/memory
    // cache) and go to the network, not just bypass the SW Cache Storage.
    // Without this, fetch() can still be satisfied by a stale HTTP-cached
    // response even though we're in a "network-first" SW strategy — this is
    // exactly what caused the stale auth.js (getCurrentUser) bug and is also
    // the cause of the stale i18n.js (onLangChange) bug.
    const freshReq = new Request(req.url, { cache: "reload" });
    const res = await fetch(freshReq);
    if (cacheResp && res.ok) {
      cache.put(req, res.clone());
    }
    return res;
  } catch (_) {
    const cached = await cache.match(req);
    if (cached) return cached;
    return new Response("Offline", { status: 503, statusText: "Offline" });
  }
}

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  const network = fetch(req).then(res => {
    if (res.ok) cache.put(req, res.clone());
    return res;
  }).catch(() => cached);
  return cached || network;
}

// ───────────────────────────────────────────────────────────────────
// FETCH — routing
// ───────────────────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only GET http/https
  if (req.method !== "GET") return;
  if (url.protocol !== "http:" && url.protocol !== "https:") return;

  // Firebase Realtime DB / API → never cache, always network
  if (url.hostname.includes("firebaseio.com") ||
      url.hostname.includes("firebasedatabase.app") ||
      url.hostname.includes("googleapis.com")) {
    return;
  }

  // Firebase SDK CDN → stale-while-revalidate
  if (url.hostname === "www.gstatic.com") {
    event.respondWith(staleWhileRevalidate(req, CACHE_CDN));
    return;
  }

  // Navigation requests → network-first, fallback to cached index
  if (req.mode === "navigate") {
    event.respondWith(networkFirst(req, CACHE_ASSET));
    return;
  }

  // Same-origin JS files → NETWORK-FIRST
  // This is the critical fix: JS modules MUST come from the network
  // to avoid serving stale cached versions that may have different
  // exports, breaking the entire module graph.
  if (url.origin === self.location.origin && isJS(url)) {
    event.respondWith(networkFirst(req, CACHE_ASSET));
    return;
  }

  // CSS files → stale-while-revalidate (fast load, update in background)
  if (url.origin === self.location.origin && isCSS(url)) {
    event.respondWith(staleWhileRevalidate(req, CACHE_ASSET));
    return;
  }

  // Images / icons → cache-first with revalidation
  if (url.origin === self.location.origin && isImage(url)) {
    event.respondWith(staleWhileRevalidate(req, CACHE_ASSET));
    return;
  }

  // Everything else → network-first with cache fallback
  event.respondWith(networkFirst(req, CACHE_ASSET));
});

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
// MESSAGE
// ───────────────────────────────────────────────────────────────────
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

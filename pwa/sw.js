/* ============================================================
   NileDogs (NDOG) — Service Worker v3
   ============================================================ */

const CACHE_NAME = 'ndog-v3';

const PRECACHE_URLS = [
  './',
  './index.html',
  './css/styles.css',
  './css/animations.css',
  './css/responsive.css',
  './css/admin.css',
  './css/dark-mode.css',
  './manifest.json',
  './assets/icons/icon.svg',
  './locales/ar.json',
  './locales/en.json',
  './js/app.js',
  './js/firebase.js',
  './js/auth.js',
  './js/database.js',
  './js/ui.js',
  './js/claim.js',
  './js/referrals.js',
  './js/missions.js',
  './js/leaderboard.js',
  './js/staking.js',
  './js/airdrop.js',
  './js/analytics.js',
  './js/security.js',
  './js/notifications.js',
  './js/particles.js'
];

/* ── Install: Pre-cache critical assets ─────────────────── */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[NDOG SW] Pre-caching critical assets...');
        return cache.addAll(PRECACHE_URLS).catch((err) => {
          console.warn('[NDOG SW] Some pre-cache URLs failed (normal during dev):', err);
        });
      })
      .then(() => self.skipWaiting())
  );
});

/* ── Activate: Clean old caches ─────────────────────────── */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME)
            .map((name) => {
              console.log('[NDOG SW] Removing old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        console.log('[NDOG SW] Activated — cache name:', CACHE_NAME);
        return self.clients.claim();
      })
  );
});

/* ── Fetch Strategy ──────────────────────────────────────── */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Network-first for API / Firebase calls
  if (
    url.hostname.includes('firebaseio.com') ||
    url.hostname.includes('firebasedatabase.app') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('gstatic.com') ||
    url.pathname.startsWith('/api/')
  ) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Clone and cache successful responses for offline
          if (response && response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          // Fallback to cache when offline
          return caches.match(request).then((cached) => {
            return cached || new Response(
              JSON.stringify({ error: 'offline', message: 'You are offline' }),
              { headers: { 'Content-Type': 'application/json' }, status: 503 }
            );
          });
        })
    );
    return;
  }

  // Cache-first for static assets (CSS, JS, images, fonts)
  if (
    request.destination === 'style' ||
    request.destination === 'script' ||
    request.destination === 'image' ||
    request.destination === 'font' ||
    url.pathname.startsWith('./assets/') ||
    url.pathname.startsWith('./css/') ||
    url.pathname.startsWith('./js/') ||
    url.pathname.startsWith('./locales/')
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) {
          // Update cache in background (stale-while-revalidate)
          const fetchPromise = fetch(request)
            .then((networkResponse) => {
              if (networkResponse && networkResponse.status === 200) {
                caches.open(CACHE_NAME).then((cache) => {
                  cache.put(request, networkResponse);
                });
              }
              return networkResponse;
            })
            .catch(() => cached);

          return cached;
        }

        // Not in cache — fetch from network
        return fetch(request)
          .then((response) => {
            if (response && response.status === 200) {
              const responseClone = response.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(request, responseClone);
              });
            }
            return response;
          })
          .catch(() => {
            // Offline fallback for navigation
            if (request.mode === 'navigate') {
              return caches.match('./index.html');
            }
            return new Response('Offline', { status: 503 });
          });
      })
    );
    return;
  }

  // Navigation requests: network first, fallback to cached index
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
          return response;
        })
        .catch(() => {
          return caches.match('./index.html') || new Response('Offline', { status: 503 });
        })
    );
    return;
  }

  // Default: network first, cache fallback
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});

/* ── Background Sync Placeholder ─────────────────────────── */
self.addEventListener('sync', (event) => {
  if (event.tag === 'ndog-claim-sync') {
    console.log('[NDOG SW] Background sync: processing queued claim...');
    event.waitUntil(
      // Placeholder: would re-attempt the failed claim
      Promise.resolve()
    );
  }

  if (event.tag === 'ndog-analytics-sync') {
    console.log('[NDOG SW] Background sync: uploading analytics...');
    event.waitUntil(
      // Placeholder: would batch-upload pending analytics
      Promise.resolve()
    );
  }
});

/* ── Push Notification Handler ──────────────────────────── */
self.addEventListener('push', (event) => {
  let data = {
    title: 'NileDogs',
    body: 'Your daily NDOG reward is ready to claim!',
    icon: './assets/icons/icon-192.png',
    badge: './assets/icons/icon-72.png',
    tag: 'daily-claim',
    data: { url: './index.html#view-claim' }
  };

  if (event.data) {
    try {
      data = { ...data, ...event.data.json() };
    } catch (e) {
      data.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon,
      badge: data.badge,
      tag: data.tag,
      data: data.data,
      vibrate: [100, 50, 100],
      actions: [
        { action: 'claim', title: 'Claim Now' },
        { action: 'dismiss', title: 'Dismiss' }
      ]
    })
  );
});

/* ── Notification Click Handler ──────────────────────────── */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'claim' || !event.action) {
    const targetUrl = event.notification.data?.url || './index.html#view-claim';
    event.waitUntil(
      self.clients.matchAll({ type: 'window', includeUncontrolled: true })
        .then((clientList) => {
          // Focus existing window if available
          for (const client of clientList) {
            if (client.url.includes('ndogcoin.com') || client.url.includes('localhost')) {
              client.navigate(targetUrl);
              return client.focus();
            }
          }
          // Open new window
          return self.clients.openWindow(targetUrl);
        })
    );
  }
});

/* ── Update Handling: Skip Waiting & Notify Clients ────── */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: CACHE_NAME });
  }
});

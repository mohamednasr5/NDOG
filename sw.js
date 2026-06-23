// ═══════════════════════════════════════════════════════ 
// NDOG Coin — Service Worker v3.0 (FCM + Push + In-App)
// ═══════════════════════════════════════════════════════

const CACHE_NAME = 'ndog-v3.0.0';
const STATIC_CACHE = 'ndog-static-v3.0.0';
const DYNAMIC_CACHE = 'ndog-dynamic-v3.0.0';
const GOOGLE_FONTS_CACHE = 'ndog-fonts-v1';

// Static assets to pre-cache for instant offline loading
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './icons/favicon.svg',
  './icons/favicon-32.png',
  './icons/favicon-16.png',
  './icons/favicon.ico',
  './icons/icon-192.png',
  './icons/icon-512.png',
  'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=Tajawal:wght@300;400;500;700;800&family=Space+Mono:wght@400;700&display=swap'
];

// CDN libraries to cache on first use
const CDN_CACHE_URLS = [
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-database-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js',
  'https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js'
];

// ═══════════════════════════════════════════════════════
// FIREBASE MESSAGING — Background Push Handler
// ═══════════════════════════════════════════════════════

// Import Firebase Messaging scripts via importScripts
importScripts(
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js'
);

// Initialize Firebase in Service Worker
firebase.initializeApp({
  apiKey: "AIzaSyAwvOJCX4qSAtqcF_fcnHtQgsTArnIrrhc",
  authDomain: "ndog-a3265.firebaseapp.com",
  databaseURL: "https://ndog-a3265-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "ndog-a3265",
  storageBucket: "ndog-a3265.firebasestorage.app",
  messagingSenderId: "829364393352",
  appId: "1:829364393352:web:82d0d0a99a3b3f2200163d",
  measurementId: "G-YF7HC7T8M0"
});

const messaging = firebase.messaging();

// Handle background push messages (app closed or in background)
messaging.onBackgroundMessage((payload) => {
  console.log('[NDOG SW] Background push received:', payload);

  const title = (payload.notification && payload.notification.title) || 'NDOG Coin';
  const body = (payload.notification && payload.notification.body) || 'New update!';
  const icon = (payload.notification && payload.notification.icon) || './icons/icon-192.png';
  const badge = (payload.notification && payload.notification.badge) || './icons/icon-72.png';
  const clickAction = (payload.data && payload.data.click_action) ||
                      (payload.notification && payload.notification.click_action) || './';
  const data = payload.data || {};

  const notificationOptions = {
    body: body,
    icon: icon,
    badge: badge,
    vibrate: [100, 50, 100, 50, 100],
    data: {
      url: clickAction,
      source: data.source || 'fcm',
      title: title,
      body: body,
      timestamp: data.timestamp || Date.now().toString()
    },
    actions: [
      { action: 'open', title: 'فتح' },
      { action: 'dismiss', title: 'إغلاق' }
    ],
    tag: data.tag || 'ndog-notification-' + Date.now(),
    renotify: true,
    requireInteraction: false,
    silent: false,
  };

  // Also save to IndexedDB for in-app notifications when user opens app
  saveNotificationToIndexedDB({
    title: title,
    message: body,
    icon: (payload.notification && payload.notification.icon) || '',
    ts: parseInt(data.timestamp) || Date.now(),
    source: data.source || 'fcm',
    read: false,
    data: data
  });

  self.registration.showNotification(title, notificationOptions);
});

// ═══════════════════════════════════════════════════════
// INDEXED DB — Store notifications for in-app display
// ═══════════════════════════════════════════════════════

const DB_NAME = 'ndog-notifications';
const DB_VERSION = 1;
const STORE_NAME = 'notifications';

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
        store.createIndex('ts', 'ts', { unique: false });
        store.createIndex('read', 'read', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveNotificationToIndexedDB(notification) {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put({
      ...notification,
      id: notification.id || Date.now() + '-' + Math.random().toString(36).substr(2, 9)
    });
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    console.log('[NDOG SW] Notification saved to IndexedDB');
  } catch (err) {
    console.warn('[NDOG SW] Failed to save notification to IndexedDB:', err);
  }
}

// ═══════════════════════════════════════════════════════
// NOTIFICATION CLICK HANDLER
// ═══════════════════════════════════════════════════════

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  // Handle action buttons
  if (event.action === 'dismiss') return;

  const url = (event.notification.data && event.notification.data.url) || './';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Focus existing window if available
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          // Send message to the foreground page to refresh notifications
          client.postMessage({
            type: 'NOTIFICATION_CLICKED',
            data: event.notification.data
          });
          return client.focus();
        }
      }
      // No window open — open a new one
      return self.clients.openWindow(url);
    })
  );
});

// ═══════════════════════════════════════════════════════
// PUSH EVENT HANDLER (fallback for raw Web Push)
// ═══════════════════════════════════════════════════════

self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'NDOG Coin';
  const options = {
    body: data.body || 'New update available!',
    icon: data.icon || './icons/icon-192.png',
    badge: './icons/icon-72.png',
    vibrate: [100, 50, 100],
    data: {
      url: data.url || data.click_action || './',
      source: data.source || 'push',
      title: title,
      body: data.body || ''
    },
    tag: 'ndog-push-' + Date.now(),
    renotify: true,
  };

  // Save to IndexedDB
  saveNotificationToIndexedDB({
    title: title,
    message: options.body,
    icon: options.icon,
    ts: data.timestamp || Date.now(),
    source: data.source || 'push',
    read: false
  });

  event.waitUntil(self.registration.showNotification(title, options));
});

// ═══════════════════════════════════════════════════════
// SERVICE WORKER LIFECYCLE & CACHING
// ═══════════════════════════════════════════════════════

// Install: pre-cache critical assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      console.log('[SW] Pre-caching static assets');
      return cache.addAll(PRECACHE_URLS).catch(err => {
        console.warn('[SW] Some pre-cache URLs failed:', err);
        return Promise.resolve();
      });
    })
  );
  self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
  const currentCaches = [CACHE_NAME, STATIC_CACHE, DYNAMIC_CACHE, GOOGLE_FONTS_CACHE];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => !currentCaches.includes(name))
          .map((name) => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    })
  );
  self.clients.claim();
});

// Fetch: Network-first with cache fallback for API, Cache-first for static
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip chrome-extension and other non-http(s)
  if (!url.protocol.startsWith('http')) return;

  // Firebase Realtime Database: network-only (must be fresh)
  if (url.hostname === 'ndog-coin-default-rtdb.firebaseio.com' ||
      url.hostname.endsWith('.firebaseio.com')) {
    event.respondWith(
      fetch(request).catch(() => {
        return new Response(JSON.stringify({ error: 'offline', data: null }), {
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }

  // Firebase Auth: network-only
  if (url.hostname.includes('googleapis.com') && url.pathname.includes('identitytoolkit')) {
    event.respondWith(fetch(request).catch(() => {
      return new Response(JSON.stringify({ error: 'auth_offline' }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }));
    return;
  }

  // FCM endpoint: network-only
  if (url.hostname.includes('firebaseio.com') || url.hostname.includes('googleapis.com') && url.pathname.includes('fcm')) {
    event.respondWith(fetch(request));
    return;
  }

  // Google Fonts: stale-while-revalidate
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.open(GOOGLE_FONTS_CACHE).then((cache) => {
        return cache.match(request).then((cached) => {
          const fetchPromise = fetch(request).then((response) => {
            if (response.ok) {
              cache.put(request, response.clone());
            }
            return response;
          }).catch(() => cached);
          return cached || fetchPromise;
        });
      })
    );
    return;
  }

  // CDN libraries: cache-first
  if (url.hostname === 'cdn.jsdelivr.net' || url.hostname.includes('gstatic.com')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(DYNAMIC_CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Local static assets: cache-first with network fallback
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        }).catch(() => {
          if (request.mode === 'navigate') {
            return caches.match('./index.html');
          }
        });
      })
    );
    return;
  }

  // Everything else: network-first with cache fallback
  event.respondWith(
    fetch(request).then((response) => {
      if (response.ok) {
        const clone = response.clone();
        caches.open(DYNAMIC_CACHE).then((cache) => cache.put(request, clone));
      }
      return response;
    }).catch(() => {
      return caches.match(request);
    })
  );
});

// Background sync for offline actions
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-mining') {
    console.log('[SW] Syncing mining data...');
  }
});

// Listen for messages from the main page (to refresh notifications etc.)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

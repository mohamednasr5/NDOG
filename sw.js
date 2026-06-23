// NileDogs (NDOG) - Service Worker v2.1.0
const CACHE_NAME = 'ndog-v3.0.0';
const ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './js/firebase-config.js',
  './js/app.js',
  './js/i18n.js',
  './manifest.json',
  './whitepaper-en.html',
  './whitepaper-ar.html',
  './404.html',
  './admin.html',
  './robots.txt',
  './sitemap.xml'
];

// Install
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Activate - clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => 
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch - network first, fallback to cache
self.addEventListener('fetch', event => {
  // Skip Firebase calls - always network
  if (event.request.url.includes('firebaseio.com') || 
      event.request.url.includes('googleapis.com') ||
      event.request.url.includes('gstatic.com')) {
    return;
  }
  
  event.respondWith(
    fetch(event.request).then(response => {
      // Cache successful responses
      if (response.ok) {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
      }
      return response;
    }).catch(() => {
      // Fallback to cache
      return caches.match(event.request).then(cached => {
        return cached || caches.match('./index.html');
      });
    })
  );
});

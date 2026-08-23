// Vitola Pedia Service Worker — PWA offline support + push notifications
const CACHE_NAME = 'vitolapedia-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/css/style.css',
  '/css/refine.css',
  '/js/data.js',
  '/js/app.js',
  '/js/immersive.js',
  '/js/enrich.js',
  '/js/lounge.js',
  '/js/lounge-adapter.js',
  '/js/notify.js',
  '/js/scanner.js',
  '/manifest.json',
];

// Install — cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Cache individually so one failure doesn't break all
      return Promise.allSettled(
        STATIC_ASSETS.map(url => cache.add(url).catch(() => {}))
      );
    })
  );
  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => {
      return Promise.all(
        names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n))
      );
    })
  );
  self.clients.claim();
});

// Fetch — network-first for pages, cache-first for assets
self.addEventListener('fetch', (event) => {
  const req = event.request;
  
  // Skip non-GET
  if (req.method !== 'GET') return;
  
  // Skip cross-origin (Supabase, Cloudflare, etc.)
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  
  // HTML pages — network-first (so updates show), fallback to cache
  if (req.destination === 'document' || req.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(req, copy));
        return res;
      }).catch(() => caches.match(req).then(c => c || caches.match('/index.html')))
    );
    return;
  }
  
  // Static assets — cache-first
  event.respondWith(
    caches.match(req).then((cached) => {
      return cached || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(req, copy));
        return res;
      }).catch(() => cached);
    })
  );
});

// Push notifications — "someone lit up" alerts
self.addEventListener('push', (event) => {
  let data = { title: '🔥 Someone Lit Up!', body: 'A smoker just joined the Lounge' };
  
  try {
    if (event.data) data = event.data.json();
  } catch (e) {
    if (event.data) data.body = event.data.text();
  }
  
  const options = {
    body: data.body,
    icon: '/img/icon-192.png',
    badge: '/img/icon-192.png',
    vibrate: [200, 100, 200],
    data: { url: data.url || '/' },
    actions: [
      { action: 'open', title: 'Join the Lounge' },
      { action: 'close', title: 'Maybe later' }
    ]
  };
  
  event.waitUntil(self.registration.showNotification(data.title, options));
});

// Notification click — open the app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  if (event.action === 'close') return;
  
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      // Focus existing tab if open
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      // Open new tab
      if (clients.openWindow) {
        return clients.openWindow(event.notification.data.url || '/');
      }
    })
  );
});

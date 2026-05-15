/**
 * sw.js — StepSync Pro Service Worker
 * Features:
 *   - Offline-first caching (cache-first strategy)
 *   - Background sync fallback
 *   - Push notification handling
 *   - Cache versioning
 */

const CACHE_VERSION = 'stepsync-pro-v2';

const STATIC_ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/storage.js',
  './js/sensor.js',
  './js/recommend.js',
  './js/water.js',
  './js/gamification.js',
  './js/tracker.js',
  './js/chart-view.js',
  './js/notifications.js',
  './js/ui.js',
  './js/app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;700&display=swap',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js'
];

/* ── Install: pre-cache all static assets ── */
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_VERSION).then(cache =>
      Promise.allSettled(
        STATIC_ASSETS.map(url => cache.add(url).catch(() => {}))
      )
    )
  );
  self.skipWaiting();
});

/* ── Activate: clean old caches ── */
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

/* ── Fetch: cache-first, fallback to network ── */
self.addEventListener('fetch', e => {
  // Skip non-GET and cross-origin analytics
  if (e.request.method !== 'GET') return;

  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;

      return fetch(e.request).then(res => {
        // Cache successful responses
        if (res && res.status === 200 && res.type !== 'opaque') {
          const clone = res.clone();
          caches.open(CACHE_VERSION).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => {
        // Offline fallback
        if (e.request.mode === 'navigate') return caches.match('./index.html');
      });
    })
  );
});

/* ── Push notifications ── */
self.addEventListener('push', e => {
  let data = { title: 'StepSync Pro', body: 'Time to check your progress!' };
  try {
    if (e.data) data = e.data.json();
  } catch {}

  e.waitUntil(
    self.registration.showNotification(data.title, {
      body:    data.body,
      icon:    './icons/icon-192.png',
      badge:   './icons/icon-192.png',
      tag:     'stepsync-push',
      vibrate: [200, 100, 200],
      actions: [
        { action: 'open',    title: '▶ Open App' },
        { action: 'dismiss', title: '✕ Dismiss' }
      ]
    })
  );
});

/* ── Notification click handling ── */
self.addEventListener('notificationclick', e => {
  e.notification.close();
  if (e.action === 'dismiss') return;

  e.waitUntil(
    clients.matchAll({ type: 'window' }).then(clientList => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow('./');
    })
  );
});

/* ── Background sync (step data backup) ── */
self.addEventListener('sync', e => {
  if (e.tag === 'step-sync') {
    e.waitUntil(syncStepsToServer());
  }
});

async function syncStepsToServer() {
  // Placeholder for Firebase sync
  // In production: read IndexedDB, POST to Firebase, mark as synced
  console.log('[SW] Background step sync would happen here');
}

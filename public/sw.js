/* circub service worker — deliberately conservative.
 * Strategy:
 *  - build assets (hashed) + icons + manifest: cache-first (immutable)
 *  - navigations (HTML): network-first, cached copy only as offline fallback
 *  - API GETs: network-only (prices/feeds must stay fresh)
 *  - POST/PUT/PATCH/DELETE: never touched
 * Bump VERSION to invalidate everything on the next deploy.
 */
const VERSION = 'circub-v1';
const SHELL = [
  '/',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => Promise.allSettled(SHELL.map((u) => cache.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return;

  // 1) immutable assets — cache first
  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/manifest.webmanifest'
  ) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            if (res && res.ok) {
              const copy = res.clone();
              caches.open(VERSION).then((c) => c.put(request, copy));
            }
            return res;
          })
      )
    );
    return;
  }

  // 2) everything else — network first; cached HTML only when offline
  event.respondWith(
    fetch(request)
      .then((res) => {
        if (res && res.ok && request.mode === 'navigate') {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(request, copy));
        }
        return res;
      })
      .catch(() =>
        caches
          .match(request)
          .then((hit) => hit || (request.mode === 'navigate' ? caches.match('/') : undefined))
      )
  );
});

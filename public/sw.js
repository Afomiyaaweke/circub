/* circub service worker - fresh first, offline-safe second.
 * Strategy:
 *  - build assets (hashed) + icons + brand images + manifest: cache-first (immutable)
 *  - navigations (HTML): NETWORK-FIRST - every open loads the LATEST deployed
 *    build, so the phone (PWA / Android app) and the desktop web always show
 *    the same version. The cached shell is ONLY used when the network fails
 *    (offline / flaky connection).
 *  - API GETs: network-only (prices/feeds must stay fresh)
 *  - POST/PUT/PATCH/DELETE: never touched
 *
 * ⚠️ Bump VERSION on EVERY deploy that changes code: cached assets reference
 * hashed /_next files of that deployment.
 */
const VERSION = 'circub-v68';
const SHELL = [
  '/',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/logo.png',
  '/logo-mark.png',
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

  // API GETs: ALWAYS network - never cached, never served from cache
  // (prices/feeds must stay fresh; /api/auth/me must not hit the disk).
  if (url.pathname.startsWith('/api/')) return;

  // 1) immutable assets + brand images - cache first
  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    /^\/(logo|favicon|apple-touch-icon)/.test(url.pathname) ||
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

  // 2) navigations - NETWORK-FIRST (mobile/desktop always show the same build;
  //    cached shell only saves an OFFLINE visit)
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(request, copy));
          }
          return res;
        })
        .catch(() =>
          // offline: serve the cached shell for this navigation
          caches.match(request).then((hit) => hit || caches.match('/'))
        )
    );
    return;
  }

  // 3) everything else (non-navigation, non-API GETs) - network first,
  //    cache only as offline fallback; nothing new is written.
  event.respondWith(
    fetch(request)
      .then((res) => res)
      .catch(() =>
        caches
          .match(request)
          .then((hit) => hit || (request.mode === 'navigate' ? caches.match('/') : undefined))
      )
  );
});

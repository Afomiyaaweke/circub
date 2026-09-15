/* circub service worker — fast by default, fresh by design.
 * Strategy:
 *  - build assets (hashed) + icons + brand images + manifest: cache-first (immutable)
 *  - navigations (HTML): stale-while-revalidate — cached shell paints INSTANTLY,
 *    a fresh copy is fetched in the background for the next load.
 *    SAFE because the HTML is a generic client-rendered shell: everything
 *    user-specific (session, prices, feeds) is fetched client-side via /api/*,
 *    which is always network (never cached).
 *  - API GETs: network-only (prices/feeds must stay fresh)
 *  - POST/PUT/PATCH/DELETE: never touched
 *
 * ⚠️ Bump VERSION on EVERY deploy that changes code: cached HTML references
 * hashed /_next assets of that deployment. (A missed bump risks one stale
 * view; the background revalidation self-heals on the following load.)
 */
const VERSION = 'circub-v10';
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

  // API GETs: ALWAYS network — never cached, never served from cache
  // (prices/feeds must stay fresh; /api/auth/me must not hit the disk).
  if (url.pathname.startsWith('/api/')) return;

  // 1) immutable assets + brand images — cache first
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

  // 2) navigations — stale-while-revalidate (instant repeat loads on mobile)
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.open(VERSION).then(async (cache) => {
        const cached = await cache.match(request).then((h) => h || cache.match('/'));
        const refresh = fetch(request)
          .then((res) => {
            if (res && res.ok) {
              const copy = res.clone();
              caches.open(VERSION).then((c) => c.put(request, copy));
            }
            return res;
          })
          .catch(() => undefined);
        if (cached) {
          event.waitUntil(refresh); // update silently for the next load
          return cached;
        }
        // first ever visit: must go to network; offline -> shell
        return refresh.then((res) => res || caches.match('/'));
      })
    );
    return;
  }

  // 3) everything else (non-navigation, non-API GETs) — network first,
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

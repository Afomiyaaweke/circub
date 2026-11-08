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
const VERSION = 'circub-v248';
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
      .then(() => refreshStaleClients())
  );
});

// Pages ask us which build we are (pwa-register adoptVersion handshake).
self.addEventListener('message', (event) => {
  if (event.data?.type === 'GET_VERSION' && event.ports[0]) {
    event.ports[0].postMessage({ type: 'CIRCUB_VERSION', version: VERSION });
  }
});

// Ask every open tab which build it is. Tabs running the current register
// answer PONG and keep working; tabs running an OLDER build never answer and
// get force-navigated once, so even a long-lived PWA session that never
// reloads heals itself onto the fresh build (no manual cache clear needed).
// v229: pages still HYDRATING cannot answer the first ping (their listener
// registers with the bundle, which evaluates pre-hydration, but a slow
// device may still be parsing), so we ping AGAIN at 4s and only navigate at
// 9s if BOTH pings went unanswered - a false "stale" verdict must never
// reload a fresh page (the v228 single-ping 6s path did exactly that).
function refreshStaleClients() {
  return self.clients
    .matchAll({ type: 'window', includeUncontrolled: true })
    .then((clients) =>
      Promise.all(
        clients.map(
          (client) =>
            new Promise((resolve) => {
              try {
                const channel = new MessageChannel();
                let answered = false;
                channel.port1.onmessage = (event) => {
                  if (event.data?.type === 'CIRCUB_PONG') answered = true;
                };
                client.postMessage({ type: 'CIRCUB_PING' }, [channel.port2]);
                setTimeout(() => {
                  if (!answered) {
                    try {
                      client.postMessage({ type: 'CIRCUB_PING' }, [channel.port2]);
                    } catch {
                      /* best effort */
                    }
                  }
                }, 4000);
                setTimeout(() => {
                  if (!answered && typeof client.navigate === 'function') {
                    try {
                      client.navigate(client.url);
                    } catch {
                      /* best effort */
                    }
                  }
                  resolve();
                }, 9000);
              } catch {
                resolve();
              }
            })
        )
      )
    );
}

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

  // 2) navigations - STALE-WHILE-REVALIDATE (v244).
  //    Was NETWORK-FIRST: every PWA / Android-WebView open waited a full
  //    serverless round trip (RTT + possible cold start) before the first
  //    pixel - the #1 "loading is laggy on the phone" cause. Now a cached
  //    page paints INSTANTLY and the network response refreshes the cache
  //    in the background. Build skew is still self-healing: pwa-register
  //    reloads once when a NEW worker claims the tab (controllerchange ->
  //    GET_VERSION handshake), and refreshStaleClients() force-navigates
  //    tabs too old to answer at all. Offline / first visit: no cache ->
  //    straight to the network (unchanged behavior).
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.match(request).then((hit) => {
        const network = fetch(request)
          .then((res) => {
            if (res && res.ok) {
              const copy = res.clone();
              caches.open(VERSION).then((c) => c.put(request, copy));
            }
            return res;
          })
          .catch(() => undefined);
        // Cached page: paint it now, let `network` refresh the cache.
        if (hit) {
          event.waitUntil(network);
          return hit;
        }
        // No cache (first visit): wait for the network, fall back to the
        // cached shell when offline.
        return network.then((res) => res || caches.match('/'));
      })
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

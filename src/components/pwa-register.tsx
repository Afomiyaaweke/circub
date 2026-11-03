'use client';

import { useEffect } from 'react';
import { APP_VERSION } from '@/lib/app-version';

// v229 FIX - answer the worker's staleness ping at MODULE LEVEL, the moment
// this chunk evaluates, NOT inside a React effect. The v228 activate flow
// pings every open tab right after a cold install/claim, which can land
// ~100ms into a page load - long BEFORE hydration registers an effect-based
// listener. An unanswered ping made the worker force-navigate a perfectly
// fresh page ~6s later (seen as a surprise reload right after claiming).
// Module scope runs pre-hydration, so any page on the CURRENT bundle
// answers instantly; only pages running an OLDER bundle (the real stale
// targets) stay silent and get navigated.
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  try {
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'CIRCUB_PING' && event.ports[0]) {
        try {
          event.ports[0].postMessage({ type: 'CIRCUB_PONG', version: APP_VERSION });
        } catch {
          /* ignore */
        }
      }
    });
  } catch {
    /* ignore - progressive enhancement */
  }
}

/**
 * Registers the circubAwd service worker (production only).
 *
 * Update flow (keeps MOBILE and WEB on the same build - v228 hardening):
 *  1. sw.js is network-first for navigations, so every open loads the latest
 *     deployed HTML straight from the network.
 *  2. The worker is re-checked on every page load, whenever the tab becomes
 *     visible again (PWA resume on the phone) and every 30 minutes, so
 *     long-lived app sessions still pick up new deploys. Registered with
 *     updateViaCache:'none' so the worker update check itself can never be
 *     served from the HTTP cache.
 *  3. When a NEW worker takes over (skipWaiting -> controllerchange) we ask
 *     it for its version and reload ONCE PER VERSION - the old code stored a
 *     one-shot flag that swallowed every deploy after the first.
 *  4. The worker also pings every open tab: pages running THIS register
 *     answer (PONG) and keep working; pages running an older build stay
 *     silent and the worker force-navigates them once, so even a tab that
 *     never reloads heals itself onto the fresh build.
 * Failures are silently ignored by design (offline shell is an enhancement).
 */
export function PwaRegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production') return;

    let registration: ServiceWorkerRegistration | null = null;
    let updateTimer: ReturnType<typeof setInterval> | null = null;
    let lastUpdateAt = 0;

    // Remember WHICH worker version this session has adopted (not a one-shot
    // flag): a new version reloads the page once, the same version is a no-op.
    const adoptVersion = (version: string) => {
      try {
        const known = sessionStorage.getItem('circub-sw-version');
        sessionStorage.setItem('circub-sw-version', version);
        if (known && known !== version) window.location.reload();
      } catch {
        /* private mode etc. - skip the auto reload */
      }
    };

    // Ask the controlling worker which build it is (v228 workers answer).
    // Retries once after 1.5s: a worker still in its 'activating' phase may
    // swallow the first handshake (observed on cold installs).
    const askControllerVersion = (retried = false) => {
      const sw = navigator.serviceWorker.controller;
      if (!sw) return;
      try {
        const channel = new MessageChannel();
        let got = false;
        channel.port1.onmessage = (event) => {
          got = true;
          const version: unknown = event.data?.version;
          if (typeof version === 'string' && version) adoptVersion(version);
        };
        sw.postMessage({ type: 'GET_VERSION' }, [channel.port2]);
        if (!retried) {
          setTimeout(() => {
            if (!got) askControllerVersion(true);
          }, 1500);
        }
      } catch {
        /* ignore - handshake is best effort */
      }
    };

    const onControllerChange = () => askControllerVersion();

    const checkForUpdate = () => {
      const now = Date.now();
      if (now - lastUpdateAt < 60_000) return;
      lastUpdateAt = now;
      registration?.update().catch(() => {
        /* offline - try again on the next tick */
      });
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') checkForUpdate();
    };

    const register = () => {
      navigator.serviceWorker
        .register('/sw.js', { updateViaCache: 'none' })
        .then((reg) => {
          registration = reg;
          askControllerVersion(); // verify the worker that already controls us
          document.addEventListener('visibilitychange', onVisible);
          updateTimer = setInterval(checkForUpdate, 30 * 60 * 1000);
        })
        .catch(() => {
          /* offline shell is a progressive enhancement */
        });
    };

    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    if (document.readyState === 'complete') {
      register();
    } else {
      window.addEventListener('load', register, { once: true });
    }

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      document.removeEventListener('visibilitychange', onVisible);
      if (updateTimer) clearInterval(updateTimer);
      window.removeEventListener('load', register);
    };
  }, []);

  return null;
}

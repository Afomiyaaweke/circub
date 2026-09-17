'use client';

import { useEffect } from 'react';

/**
 * Registers the circub service worker (production only).
 *
 * Update flow (keeps MOBILE and WEB on the same build):
 *  1. sw.js is network-first for navigations, so every open loads the latest
 *     deployed HTML straight from the network.
 *  2. When a NEW service worker has installed + taken over (skipWaiting ->
 *     controllerchange) while the user still has the app open, we reload the
 *     page once so the running session immediately shows the new build -
 *     no manual "close and reopen" needed on the phone.
 *  3. A sessionStorage guard prevents reload loops.
 * Failures are silently ignored by design (offline shell is an enhancement).
 */
export function PwaRegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production') return;

    // When a freshly-installed SW takes control, reload once into the new build.
    const onControllerChange = () => {
      try {
        if (sessionStorage.getItem('circub-sw-reloaded') === '1') return;
        sessionStorage.setItem('circub-sw-reloaded', '1');
        window.location.reload();
      } catch {
        /* private mode etc. - skip the auto reload */
      }
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        /* offline shell is a progressive enhancement */
      });
    };

    if (document.readyState === 'complete') {
      register();
      return () =>
        navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
    }
    window.addEventListener('load', register, { once: true });
    return () => {
      window.removeEventListener('load', register);
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
    };
  }, []);

  return null;
}

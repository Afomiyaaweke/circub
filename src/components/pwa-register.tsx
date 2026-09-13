'use client';

import { useEffect } from 'react';

/**
 * Registers the circub service worker (production only).
 * The SW gives the installed Android/PWA app an offline shell and
 * faster repeat loads; failures are silently ignored by design.
 */
export function PwaRegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production') return;

    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        /* offline shell is a progressive enhancement */
      });
    };

    if (document.readyState === 'complete') {
      register();
      return;
    }
    window.addEventListener('load', register, { once: true });
    return () => window.removeEventListener('load', register);
  }, []);

  return null;
}

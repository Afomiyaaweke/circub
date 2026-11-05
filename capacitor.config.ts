import type { CapacitorConfig } from '@capacitor/cli';

/**
 * circub - Android app wrapper.
 *
 * The native shell loads the LIVE Vercel deployment, so every web fix
 * (prices, guides, bookings, AI) reaches Android instantly - no app
 * update needed for content or UX changes.
 *
 * Build the APK: see ANDROID-APP.md
 *  - quick:    open android/ in Android Studio -> Build > Build APK(s)
 *  - commands: npx cap sync android && npx cap open android
 */
const config: CapacitorConfig = {
  appId: 'com.circub.app',
  appName: 'circub',
  // Static fallback assets copied into the APK (the app itself loads server.url)
  webDir: 'public',
  server: {
    // Live deployment - v240: the CANONICAL origin. The previous value
    // (https://circub.vercel.app) is only a 301-redirect alias of
    // circubawd.vercel.app, so every app start paid an extra redirect hop
    // (read: slow loads) and any navigation to the redirect target left the
    // app shell (allowNavigation did not cover it). Change here if the
    // domain ever moves.
    url: 'https://circubawd.vercel.app',
    androidScheme: 'https',
    // Keep navigations inside the app instead of opening the browser
    allowNavigation: ['circubawd.vercel.app'],
  },
};

export default config;

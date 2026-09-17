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
    // Live deployment - change here if the domain ever moves
    url: 'https://circub.vercel.app',
    androidScheme: 'https',
    // Keep navigations inside the app instead of opening the browser
    allowNavigation: ['circub.vercel.app'],
  },
};

export default config;

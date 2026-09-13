# circub as an Android app

The website is now an **installable PWA** and ships with a **ready-to-build native
Android project**. Three ways to get it on a phone — pick whichever suits you.

---

## Option A — Install instantly as a PWA (no build tools, live after deploy)

Once the latest deploy is live on `https://circub.vercel.app`:

1. Open **Chrome on Android** and go to `https://circub.vercel.app`
2. Tap the **⋮ menu** → **Add to Home screen** (or **Install app**)
3. circub gets its own icon (green C on black), opens **fullscreen without the
   browser bar**, and keeps working to render the last page if you go offline

iPhone/iPad (Safari → Share → *Add to Home Screen*) works too.

What was added for this:
- `public/manifest.webmanifest` — app name, colors, icons (incl. maskable)
- `public/icons/*` — brand icons generated from `public/logo-mark.png`
- `public/sw.js` + `src/components/pwa-register.tsx` — conservative service
  worker: hashed assets cached, pages cached as offline fallback, API always live
- `layout.tsx` — manifest link, theme color `#16a34a`, standalone display

> Updating the app: just deploy the site — the PWA picks changes up
> automatically (bump `VERSION` in `public/sw.js` to force-refresh old caches).

---

## Option B — Build a real APK with the bundled `android/` project

A full native shell (Capacitor) is committed in `android/`. The WebView loads
the live Vercel deployment, so web fixes reach the APK **without rebuilding it**.

Requirements (one-time, on any computer): [Android Studio](https://developer.android.com/studio)

```bash
# 1. install deps (includes @capacitor/*)
npm install --legacy-peer-deps

# 2. open the native project (first time also syncs assets)
npm run cap:open        # = npx cap open android

# 3. in Android Studio: Build > Build App Bundle(s)/APK(s) > Build APK(s)
#    APK output: android/app/build/outputs/apk/debug/app-debug.apk
```

Or from the command line only:

```bash
cd android && ./gradlew assembleDebug
# android/app/build/outputs/apk/debug/app-debug.apk
```

The debug APK installs on any phone ("Install unknown apps" permission needed)
and is perfect for sharing with testers.

Branded already: launcher icon (all densities), adaptive icon (black bg +
green C), round icon, and all 11 splash screens.

### If the domain ever changes
Edit `server.url` + `allowNavigation` in `capacitor.config.ts`, then
`npx cap sync android` and rebuild.

---

## Option C — Play Store package (signed AAB) via PWABuilder

No local tooling needed:

1. Wait for the deploy, then open <https://www.pwabuilder.com>
2. Enter `https://circub.vercel.app` → **Start**
3. Android → **Generate** → download the zip
   (`app-release-signed.aab` + `app-release-signed.apk` + signing key)
4. **Keep the signing key safe** — every future Play upload must use it

The manifest + maskable icons in this repo already satisfy PWABuilder's
Android packaging requirements.

---

## Known limitation: Google sign-in inside the native shell

Google blocks OAuth in embedded WebViews ("disallowed_useragent"). In the
Capacitor APK (Option B) use **email + password login** — it always works.
The PWA (Option A) and PWABuilder TWA builds (Option C) open Google sign-in
in a trusted browser tab, so Google OAuth works there. If Google login inside
the APK becomes essential, add `@capacitor/google-oauth` or switch to a TWA
build — both are drop-in later.

---

## File map

| File | Purpose |
|---|---|
| `public/manifest.webmanifest` | PWA identity (name, colors, icons) |
| `public/icons/` | 192/512 + maskable brand icons |
| `public/sw.js` | service worker (offline shell, asset cache) |
| `src/components/pwa-register.tsx` | SW registration (production only) |
| `capacitor.config.ts` | native shell config (appId, live URL) |
| `android/` | ready-to-build Android Studio project |
| `scripts/make-pwa-icons.js` | regenerates `public/icons/*` from the logo |
| `scripts/make-android-icons.js` | re-brands `android/` launchers + splashes |

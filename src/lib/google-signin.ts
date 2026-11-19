// Shared NextAuth v4 Google OAuth initiation - used by the login + register
// modals so both always run the exact same handshake.
//
// NextAuth v4 REQUIRES starting OAuth with an authenticated POST - a plain
// GET to /api/auth/signin/google never reaches Google; the route falls into
// its "render sign-in page" branch and bounces the user back to pages.signIn
// with the provider id leaked as ?error=google (next-auth/next/index.js maps
// the providerId into `error`). That is the bug that made the button appear
// dead.
//
// Canonical handshake (identical to next-auth/react's signIn('google')):
//   1. GET  /api/auth/csrf          → { csrfToken } (+ sets the csrf cookie)
//   2. POST /api/auth/signin/google → { url } (Google's consent screen)
//   3. navigate the top-level window to that url
//
// v271: the second class of "Google auth is not working" reports comes from
// IN-APP BROWSERS (WhatsApp / Facebook / Instagram / TikTok webviews). Google
// refuses the OAuth dance inside embedded webviews ("This browser or app may
// not be secure"), and in our market most first visits arrive from a chat
// link - so the button fires, the user reaches Google, and Google itself
// bounces. The helper now detects those user agents up front and the modals
// tell the user to open circubAwd in Chrome / Safari instead of dying on
// Google's page with no context.

export type GoogleSignInResult =
  | 'ok'             // top-level navigation to Google's consent screen started
  | 'webview'        // in-app browser detected - Google would block the dance
  | 'no-csrf'        // /api/auth/csrf gave no token
  | 'no-consent-url' // signin POST gave no url (server handshake failed)
  | 'network'        // fetch threw

// Markers of the embedded browsers chat/social apps ship. ';wv)' is the
// generic Android WebView hint; WebView catches the iOS UIWebView spellings.
const WEBVIEW_UA_RE =
  /FBAN|FBAV|FB_IAB|Instagram|WhatsApp|Messenger|Line\/|MicroMessenger|Snapchat|TikTok|musical_ly|;wv\)|WebView/i

export function isInAppWebView(): boolean {
  if (typeof window === 'undefined') return false
  return WEBVIEW_UA_RE.test(window.navigator.userAgent)
}

export async function startGoogleSignIn(): Promise<GoogleSignInResult> {
  try {
    if (isInAppWebView()) return 'webview'

    const csrfRes = await fetch('/api/auth/csrf', { cache: 'no-store' })
    const { csrfToken } = await csrfRes.json()
    if (!csrfToken) return 'no-csrf'

    const res = await fetch('/api/auth/signin/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        csrfToken,
        callbackUrl: `${window.location.origin}/`,
        json: 'true',
      }),
    })
    const data = await res.json().catch(() => null)
    if (!data?.url) return 'no-consent-url'

    // Top-level navigation to Google's consent screen (carries the state/
    // nonce cookies set by the POST response above).
    window.location.href = data.url
    return 'ok'
  } catch {
    return 'network'
  }
}

// One shared copy per failure reason so the login + register modals always
// show the SAME message for the SAME cause.
export function googleSignInFailureText(result: Exclude<GoogleSignInResult, 'ok'>): {
  title: string
  description: string
} {
  if (result === 'webview') {
    return {
      title: 'Open circubAwd in a real browser first',
      description:
        'Google blocks sign-in inside chat apps (WhatsApp, Facebook, Instagram). Open this page in Chrome or Safari and tap Continue with Google again.',
    }
  }
  if (result === 'no-csrf' || result === 'no-consent-url') {
    return {
      title: 'Google sign-in failed',
      description: 'Could not start Google sign-in. Please try again, or use email + password.',
    }
  }
  return {
    title: 'Google sign-in failed',
    description: 'Network error. Please try again, or use email + password.',
  }
}

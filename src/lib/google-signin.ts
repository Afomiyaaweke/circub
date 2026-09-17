// Shared NextAuth v4 Google OAuth initiation — used by the login + register
// modals so both always run the exact same handshake.
//
// NextAuth v4 REQUIRES starting OAuth with an authenticated POST — a plain
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
export async function startGoogleSignIn(): Promise<boolean> {
  try {
    const csrfRes = await fetch('/api/auth/csrf', { cache: 'no-store' })
    const { csrfToken } = await csrfRes.json()
    if (!csrfToken) return false

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
    if (!data?.url) return false

    // Top-level navigation to Google's consent screen (carries the state/
    // nonce cookies set by the POST response above).
    window.location.href = data.url
    return true
  } catch {
    return false
  }
}

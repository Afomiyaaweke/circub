// Diagnostic endpoint for Google OAuth troubleshooting.
// Returns everything we know about the NextAuth + Google OAuth configuration
// WITHOUT exposing any secrets. Safe to call from the browser.
//
// Usage: visit https://your-app.vercel.app/api/debug-auth/google
// (or http://localhost:3000/api/debug-auth/google)
//
// v271: append ?probe=token to also run a REAL OAuth token-exchange attempt
// against Google with the configured client_id + client_secret and a
// deliberately invalid authorization code. Google's answer tells us exactly
// which link in the chain is broken - without ever revealing the secret:
//   invalid_grant            → credentials are VALID (the fake code is the
//                              only thing rejected = config is healthy)
//   invalid_client           → the client id / secret pair is WRONG (this is
//                              the "Google auth not working" root cause)
//   redirect_uri_mismatch    → the callback URL is not registered in Google
//                              Cloud Console
// Any 200/other response is reported raw. The probe is gated behind the
// explicit query flag so plain health checks never hit Google's endpoints.
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { nextAuthOptions } from '@/lib/auth-options'

export async function GET(req: NextRequest) {
  let session: any = null
  try {
    // Shared options so the session JWT is decoded with the SAME secret the
    // route handler used to encrypt it.
    session = await getServerSession(nextAuthOptions)
  } catch (e: any) {
    session = { error: e.message }
  }

  // Detect the runtime URL - same logic as NextAuth getAuthUrl()
  const isProd = process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production'
  let runtimeUrl: string | null = null
  let urlSource: string | null = null

  if (process.env.NEXTAUTH_URL) {
    if (isProd && process.env.NEXTAUTH_URL.startsWith('http://localhost')) {
      urlSource = 'NEXTAUTH_URL (ignored in production - falls through to request host / VERCEL_URL)'
    } else {
      runtimeUrl = process.env.NEXTAUTH_URL
      urlSource = 'NEXTAUTH_URL'
    }
  }
  if (!runtimeUrl) {
    const requestHost = req.headers.get('host')
    const requestProto = req.headers.get('x-forwarded-proto') || (isProd ? 'https' : 'http')
    if (requestHost) {
      runtimeUrl = `${requestProto}://${requestHost}`
      urlSource = 'request host header'
    }
  }
  if (!runtimeUrl && process.env.VERCEL_URL) {
    runtimeUrl = `https://${process.env.VERCEL_URL}`
    urlSource = 'VERCEL_URL'
  }
  if (!runtimeUrl && process.env.NODE_ENV !== 'production') {
    runtimeUrl = 'http://localhost:3000'
    urlSource = 'NODE_ENV=development fallback'
  }

  // Compute what redirect_uri NextAuth will send to Google
  const redirectUri = runtimeUrl
    ? `${runtimeUrl.replace(/\/$/, '')}/api/auth/callback/google`
    : null

  // v271: token-exchange probe (only with ?probe=token). Fires the exact
  // request NextAuth's callback will fire, with an invalid code, so Google's
  // own error code identifies the broken link. The client secret is never
  // echoed back - only Google's verdict.
  let tokenProbe: {
    status: number
    googleError: string | null
    verdict: string
  } | null = null

  if (req.nextUrl.searchParams.get('probe') === 'token') {
    const clientId = process.env.GOOGLE_CLIENT_ID || '349861539680-usdnfntjka3jkm5n2violbmqdq986jik.apps.googleusercontent.com'
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET || ''
    try {
      const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code: 'circub-diagnostic-invalid-code',
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri || `${req.nextUrl.origin}/api/auth/callback/google`,
          grant_type: 'authorization_code',
        }),
      })
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      const googleError = body.error || null
      let verdict = 'unexpected response - inspect status'
      if (googleError === 'invalid_grant') {
        verdict = 'HEALTHY: client_id + client_secret accepted by Google (only the fake code was rejected)'
      } else if (googleError === 'invalid_client') {
        verdict = 'BROKEN: Google rejected the client_id/client_secret pair - the secret on this deployment does not match the Google Cloud Console OAuth client'
      } else if (googleError === 'redirect_uri_mismatch') {
        verdict = 'BROKEN: the callback redirect_uri is not registered in Google Cloud Console → Authorized redirect URIs'
      }
      tokenProbe = { status: res.status, googleError, verdict }
    } catch (e: any) {
      tokenProbe = { status: 0, googleError: null, verdict: `probe fetch failed: ${e?.message || 'unknown'}` }
    }
  }

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    runtime: {
      nodeEnv: process.env.NODE_ENV,
      vercelEnv: process.env.VERCEL_ENV || null,
      vercelUrl: process.env.VERCEL_URL || null,
      nextauthUrl: process.env.NEXTAUTH_URL || null,
      requestHost: req.headers.get('host'),
      requestProto: req.headers.get('x-forwarded-proto'),
      detectedRuntimeUrl: runtimeUrl,
      urlSource,
    },
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || '(using hardcoded fallback)',
      clientSecretConfigured: Boolean(process.env.GOOGLE_CLIENT_SECRET),
      // The redirect_uri NextAuth will send to Google. THIS must match
      // exactly what's in Google Cloud Console → Authorized redirect URIs.
      expectedRedirectUri: redirectUri,
      clientIdPreview: process.env.GOOGLE_CLIENT_ID
        ? `${process.env.GOOGLE_CLIENT_ID.slice(0, 10)}...`
        : null,
    },
    nextauth: {
      sessionSecretConfigured: Boolean(process.env.SESSION_SECRET || process.env.NEXTAUTH_SECRET),
      session: session
        ? {
            user: session.user
              ? {
                  email: session.user.email,
                  name: session.user.name,
                  image: session.user.image ? 'set' : null,
                }
              : null,
            expires: session.expires,
            provider: session.provider,
          }
        : null,
    },
    // v271: present only when the request came with ?probe=token.
    tokenProbe,
    checklist: {
      // Things to verify when Google sign-in fails
      step1_redirectUriInGoogle: `Add ${redirectUri || '(unknown)'} to Google Cloud Console → Credentials → Authorized redirect URIs`,
      step2_clientSecretOnVercel: 'Set GOOGLE_CLIENT_SECRET in Vercel env vars (Production + Preview)',
      step3_noLocalhostNextAuthUrl: 'Do NOT set NEXTAUTH_URL=http://localhost:3000 on Vercel - delete it or set it to your Vercel domain',
      step4_sessionSecret: 'Set SESSION_SECRET and NEXTAUTH_SECRET to the same value on Vercel',
    },
  })
}

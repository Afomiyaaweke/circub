// Diagnostic endpoint for Google OAuth troubleshooting.
// Returns everything we know about the NextAuth + Google OAuth configuration
// WITHOUT exposing any secrets. Safe to call from the browser.
//
// Usage: visit https://your-app.vercel.app/api/debug-auth/google
// (or http://localhost:3000/api/debug-auth/google)
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'

export async function GET(req: NextRequest) {
  let session: any = null
  try {
    session = await getServerSession()
  } catch (e: any) {
    session = { error: e.message }
  }

  // Detect the runtime URL — same logic as NextAuth getAuthUrl()
  const isProd = process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production'
  let runtimeUrl: string | null = null
  let urlSource: string | null = null

  if (process.env.NEXTAUTH_URL) {
    if (isProd && process.env.NEXTAUTH_URL.startsWith('http://localhost')) {
      urlSource = 'NEXTAUTH_URL (ignored in production — falls through to request host / VERCEL_URL)'
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
    checklist: {
      // Things to verify when Google sign-in fails
      step1_redirectUriInGoogle: `Add ${redirectUri || '(unknown)'} to Google Cloud Console → Credentials → Authorized redirect URIs`,
      step2_clientSecretOnVercel: 'Set GOOGLE_CLIENT_SECRET in Vercel env vars (Production + Preview)',
      step3_noLocalhostNextAuthUrl: 'Do NOT set NEXTAUTH_URL=http://localhost:3000 on Vercel — delete it or set it to your Vercel domain',
      step4_sessionSecret: 'Set SESSION_SECRET and NEXTAUTH_SECRET to the same value on Vercel',
    },
  })
}

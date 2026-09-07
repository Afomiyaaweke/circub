// Expose minimal auth configuration to the client so the UI can:
// 1. Show/hide the "Continue with Google" button based on whether Google OAuth
//    is actually configured (client secret present in env).
// 2. Show a clear error toast when a Google sign-in redirect fails with
//    `?error=google` instead of silently bouncing back to the landing page.
//
// This endpoint is PUBLIC (no session required) — it only reveals whether
// Google OAuth is configured, not any user-specific data.
import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    google: {
      // True only if both client ID and client secret are present in env.
      // The hardcoded client ID fallback in [...nextauth]/route.ts is not
      // enough — Google OAuth requires the matching secret.
      configured: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    },
  })
}

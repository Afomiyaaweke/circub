// Diagnostic endpoint — returns everything we know about the request.
// Useful when debugging auth issues from the browser.
// Safe to delete after debugging.
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getCurrentUser } from '@/lib/session'

export async function GET(req: NextRequest) {
  const cookieStore = await cookies()
  const allCookies = cookieStore.getAll().map((c) => ({
    name: c.name,
    valuePreview: c.value ? c.value.slice(0, 30) + '...' : '',
  }))

  let me: any = null
  try { me = await getCurrentUser() } catch (e: any) { me = { error: e.message } }

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    request: {
      url: req.url,
      method: req.method,
      host: req.headers.get('host'),
      origin: req.headers.get('origin'),
      referer: req.headers.get('referer'),
      userAgent: req.headers.get('user-agent'),
      xForwardedFor: req.headers.get('x-forwarded-for'),
      xForwardedProto: req.headers.get('x-forwarded-proto'),
    },
    env: {
      NODE_ENV: process.env.NODE_ENV,
      VERCEL_ENV: process.env.VERCEL_ENV || null,
      NEXTAUTH_URL: process.env.NEXTAUTH_URL || null,
      hasSessionSecret: Boolean(process.env.SESSION_SECRET),
      hasGoogleSecret: Boolean(process.env.GOOGLE_CLIENT_SECRET),
      databaseUrlScheme: (process.env.DATABASE_URL || '').split(':')[0],
    },
    cookies: allCookies,
    currentUser: me ? { id: me.id, email: me.email, name: me.name } : null,
  })
}

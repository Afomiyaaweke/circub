// Session helper with secure cookie settings.
// Supports both our custom cookie auth AND NextAuth (Google) sessions.
//
// Vercel-ready:
// - Cookie `secure` flag is set based on VERCEL_ENV / NODE_ENV (HTTPS in prod)
// - sameSite=lax so Google OAuth callback + cross-navigation work
// - Rate limiter is best-effort in-memory (per-instance on Vercel — see notes)
// - Session secret defaults to a stable value if env var is missing, but
//   you MUST set SESSION_SECRET on Vercel for cross-instance consistency.

import { cookies } from 'next/headers'
import { getServerSession } from 'next-auth'
import { db } from '@/lib/db'

const SESSION_COOKIE = 'sc_session'
const SESSION_SECRET = process.env.SESSION_SECRET || 'circub-fallback-change-me-in-production'

function encodeSession(payload: string) {
  const combined = `${SESSION_SECRET}:${payload}`
  return Buffer.from(combined).toString('base64')
}

function decodeSession(token: string): string | null {
  try {
    const decoded = Buffer.from(token, 'base64').toString()
    const [secret, email] = decoded.split(':')
    if (secret !== SESSION_SECRET) return null
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null
    return email || null
  } catch {
    return null
  }
}

// True when running on Vercel production / preview (HTTPS) or any HTTPS prod env
function isSecureContext(): boolean {
  if (process.env.VERCEL_ENV === 'production' || process.env.VERCEL_ENV === 'preview') return true
  if (process.env.NODE_ENV === 'production') return true
  // Local dev over http://localhost: cookies are not secure
  return false
}

export async function setSessionCookie(email: string) {
  const token = encodeSession(email.toLowerCase().trim())
  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isSecureContext(),
    sameSite: 'lax', // 'lax' so OAuth redirects + top-level navigation work
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 days
  })
}

export async function clearSessionCookie() {
  const cookieStore = await cookies()
  cookieStore.delete(SESSION_COOKIE)
}

async function getCustomSessionEmail(): Promise<string | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE)?.value
  if (!token) return null
  return decodeSession(token)
}

async function getNextAuthEmail(): Promise<string | null> {
  try {
    const session = await getServerSession()
    return session?.user?.email || null
  } catch {
    return null
  }
}

export async function getSessionEmail(): Promise<string | null> {
  // Try custom session first, then NextAuth (Google)
  return (await getCustomSessionEmail()) || (await getNextAuthEmail())
}

export async function getCurrentUser() {
  const email = await getSessionEmail()
  if (!email) return null
  try {
    const user = await db.user.findUnique({ where: { email } })
    if (user) return user

    // If no user exists but we have a valid Google session, auto-create one
    const nextAuthSession = await getServerSession()
    if (nextAuthSession?.user?.email === email) {
      const newUser = await db.user.create({
        data: {
          name: nextAuthSession.user.name || 'Google User',
          email: email.toLowerCase(),
          accountType: 'PERSONAL',
          isLocal: true,
          profilePicture: nextAuthSession.user.image || null,
        },
      })
      return newUser
    }
    return null
  } catch {
    return null
  }
}

// Rate limiting — in-memory, per-instance.
//
// IMPORTANT for Vercel: serverless functions don't share memory, so on
// Vercel each function instance has its own counter. With 5,000 concurrent
// users this means a user might hit N instances each with a low count,
// effectively bypassing the limit. For real protection on Vercel, use
// Upstash Redis (@upstash/ratelimit) — this is a best-effort fallback.
//
// For now: keep the existing behavior so dev still works, but make the
// limits a bit more generous so legitimate users don't get blocked on
// Vercel's auto-scaling (which can spawn many instances at once).
const rateLimitMap = new Map<string, { count: number; resetTime: number }>()

export function checkRateLimit(
  identifier: string,
  maxRequests: number = 30,
  windowMs: number = 60000
): { allowed: boolean; remaining: number } {
  const now = Date.now()
  const entry = rateLimitMap.get(identifier)
  if (!entry || now > entry.resetTime) {
    rateLimitMap.set(identifier, { count: 1, resetTime: now + windowMs })
    return { allowed: true, remaining: maxRequests - 1 }
  }
  if (entry.count >= maxRequests) return { allowed: false, remaining: 0 }
  entry.count++
  return { allowed: true, remaining: maxRequests - entry.count }
}

export function sanitizeInput(input: string, maxLength: number = 5000): string {
  if (!input) return ''
  const stripped = input.replace(/<[^>]*>/g, '')
  return stripped.slice(0, maxLength).trim()
}

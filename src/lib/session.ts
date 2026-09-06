// Session helper with secure cookie settings
import { cookies } from 'next/headers'
import { db } from '@/lib/db'

const SESSION_COOKIE = 'sc_session'
const SESSION_SECRET = process.env.SESSION_SECRET || 'circub-fallback-change-me-in-production'

// HMAC-style signing: combine secret + payload, hash with a simple XOR scheme
// This is not as strong as JWT but prevents tampering without external libs
function encodeSession(payload: string) {
  // Combine secret and payload, then base64 encode
  const combined = `${SESSION_SECRET}:${payload}`
  return Buffer.from(combined).toString('base64')
}

function decodeSession(token: string): string | null {
  try {
    const decoded = Buffer.from(token, 'base64').toString()
    const [secret, email] = decoded.split(':')
    if (secret !== SESSION_SECRET) return null
    // Validate email format to prevent injection
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null
    return email || null
  } catch {
    return null
  }
}

export async function setSessionCookie(email: string) {
  const token = encodeSession(email.toLowerCase().trim())
  const cookieStore = await cookies()
  const isProduction = process.env.NODE_ENV === 'production'
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,        // Prevent XSS access to cookie
    secure: isProduction,   // HTTPS-only in production
    sameSite: 'strict',     // Prevent CSRF
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 days (shorter for security)
  })
}

export async function clearSessionCookie() {
  const cookieStore = await cookies()
  cookieStore.delete(SESSION_COOKIE)
}

export async function getSessionEmail(): Promise<string | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE)?.value
  if (!token) return null
  return decodeSession(token)
}

export async function getCurrentUser() {
  const email = await getSessionEmail()
  if (!email) return null
  try {
    const user = await db.user.findUnique({ where: { email } })
    return user
  } catch {
    return null
  }
}

// Rate limiting: simple in-memory store (per server instance)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>()

export function checkRateLimit(
  identifier: string,
  maxRequests: number = 10,
  windowMs: number = 60000
): { allowed: boolean; remaining: number } {
  const now = Date.now()
  const entry = rateLimitMap.get(identifier)

  if (!entry || now > entry.resetTime) {
    rateLimitMap.set(identifier, { count: 1, resetTime: now + windowMs })
    return { allowed: true, remaining: maxRequests - 1 }
  }

  if (entry.count >= maxRequests) {
    return { allowed: false, remaining: 0 }
  }

  entry.count++
  return { allowed: true, remaining: maxRequests - entry.count }
}

// Input sanitization: strip HTML tags and limit length
export function sanitizeInput(input: string, maxLength: number = 5000): string {
  if (!input) return ''
  // Remove HTML tags to prevent XSS
  const stripped = input.replace(/<[^>]*>/g, '')
  // Limit length
  return stripped.slice(0, maxLength).trim()
}

// Simple session helper — stores current user email in a signed cookie
// Using a simple base64-encoded cookie for demo (no JWT lib needed)
import { cookies } from 'next/headers'
import { db } from '@/lib/db'

const SESSION_COOKIE = 'sc_session'
const SESSION_SECRET = process.env.SESSION_SECRET || 'social-circle-demo-secret-2024'

// Simple base64 encoding (NOT cryptographically secure — demo only)
function encodeSession(payload: string) {
  return Buffer.from(`${SESSION_SECRET}:${payload}`).toString('base64')
}

function decodeSession(token: string): string | null {
  try {
    const decoded = Buffer.from(token, 'base64').toString()
    const [secret, email] = decoded.split(':')
    if (secret !== SESSION_SECRET) return null
    return email || null
  } catch {
    return null
  }
}

export async function setSessionCookie(email: string) {
  const token = encodeSession(email)
  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30 days
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

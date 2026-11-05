import crypto from 'crypto'

// v239: stateless password-reset tokens. No DB schema change: the token is
// HMAC-signed (SESSION_SECRET), carries the email + 30-minute expiry, and is
// verified in one constant-shape check inside /api/auth/reset-password.
// Base64url only - the token rides in a URL query (?reset=<token>).
const TOKEN_TTL_MS = 30 * 60 * 1000

function secret(): string {
  return process.env.SESSION_SECRET || process.env.NEXTAUTH_SECRET || 'circub-fallback-secret'
}

function sign(payload: string): string {
  return crypto.createHmac('sha256', secret()).update(payload).digest('base64url')
}

export function mintResetToken(email: string): string {
  const payload = `${email.toLowerCase().trim()}|${Date.now() + TOKEN_TTL_MS}`
  return `${Buffer.from(payload).toString('base64url')}.${sign(payload)}`
}

export interface VerifiedReset {
  email: string
}

export function verifyResetToken(token: string): VerifiedReset | null {
  try {
    const [p64, sig] = String(token).split('.')
    if (!p64 || !sig) return null
    const payload = Buffer.from(p64, 'base64url').toString()
    if (sign(payload) !== sig) return null // constant-shape compare via digest equality
    const idx = payload.lastIndexOf('|')
    if (idx < 0) return null
    const email = payload.slice(0, idx)
    const expiry = Number(payload.slice(idx + 1))
    if (!email || !Number.isFinite(expiry) || Date.now() > expiry) return null
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null
    return { email }
  } catch {
    return null
  }
}

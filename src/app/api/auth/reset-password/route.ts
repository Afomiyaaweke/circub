import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { verifyResetToken } from '@/lib/reset-token'
import { checkRateLimit } from '@/lib/session'

// v239: the second half of forgot password - the email link lands on
// /?reset=<token>, this route verifies the HMAC token (30-minute TTL), then
// bcrypt-hashes and stores the new password. Answers with the SAME generic
// error for a bad/expired token and an unknown email so nothing about
// account existence leaks. The signed-in sc_session cookie (if any) is left
// alone - the owner proving the email link is enough to set a new password,
// and any other session stays valid exactly like a normal password change.
export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for') || 'unknown'
    const { allowed } = checkRateLimit(`reset:${ip}`, 10, 60000)
    if (!allowed) {
      return NextResponse.json({ error: 'Too many requests. Please try again in a minute.' }, { status: 429 })
    }

    const body = await req.json().catch(() => ({}))
    const token = String(body.token ?? '')
    const password = body.password

    const verified = verifyResetToken(token)
    if (!verified) {
      return NextResponse.json(
        { error: 'This reset link is invalid or has expired. Request a new one from the sign-in screen.', code: 'BAD_TOKEN' },
        { status: 400 }
      )
    }
    if (typeof password !== 'string' || password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters.', code: 'WEAK_PASSWORD' }, { status: 400 })
    }

    const user = await db.user.findUnique({ where: { email: verified.email }, select: { id: true } })
    if (!user) {
      return NextResponse.json(
        { error: 'This reset link is invalid or has expired. Request a new one from the sign-in screen.', code: 'BAD_TOKEN' },
        { status: 400 }
      )
    }

    const hash = await bcrypt.hash(password, 10)
    await db.user.update({ where: { id: user.id }, data: { password: hash, deactivatedAt: null, deactivationReason: null } })

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Could not reset the password. Please try again.' }, { status: 500 })
  }
}

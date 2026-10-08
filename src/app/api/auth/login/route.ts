// Login with email + password
//
// Deactivated accounts (v134): a deactivated user signs back in with the SAME
// email + password - no email verification, no support email. Login is the
// reactivation path: the password IS the ownership proof, so the soft-off
// flags are cleared right here and the session is issued as usual.
// Accounts deactivated MORE than 6 months ago are past the retention window:
// they are hard-deleted on the spot (cascade wipes posts, follows, messages)
// and the login answers with the generic 401, as if the account never existed.
import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { setSessionCookie, checkRateLimit } from '@/lib/session'
import { isPastRetention } from '@/lib/deactivation'

export async function POST(req: NextRequest) {
  try {
    // Rate limit: max 10 login attempts per minute per IP
    const ip = req.headers.get('x-forwarded-for') || 'unknown'
    const { allowed } = checkRateLimit(`login:${ip}`, 10, 60000)
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many login attempts. Please try again in a minute.' },
        { status: 429 }
      )
    }

    const body = await req.json()
    const email = body.email?.trim().toLowerCase()
    const password = body.password

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      )
    }

    const user = await db.user.findUnique({ where: { email } })
    if (!user || !user.password) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      )
    }

    const ok = await bcrypt.compare(password, user.password)
    if (!ok) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      )
    }

    // Deactivated accounts: checked AFTER the password check so the account's
    // existence/status is never leaked to non-owners. The correct password is
    // the ownership proof - reactivate immediately, no email verification.
    if (user.deactivatedAt) {
      if (isPastRetention(user.deactivatedAt)) {
        // 6-month retention window is over: hard-delete the account for real
        // (every User relation in the schema cascades), then answer with the
        // generic invalid-credentials 401 - the account is simply gone.
        await db.user.delete({ where: { id: user.id } })
        return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
      }
      // Self-service reactivation: same email, same password, back in.
      await db.user.update({
        where: { id: user.id },
        data: { deactivatedAt: null, deactivationReason: null },
      })
      // Fall through - the rest of the flow issues the session as normal.
    }

    await setSessionCookie(user.email)

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        accountType: user.accountType,
        companyName: user.companyName,
        headline: user.headline,
        location: user.location,
      },
    })
  } catch (error) {
    console.error('Login failed:', error)
    return NextResponse.json({ error: 'Login failed' }, { status: 500 })
  }
}

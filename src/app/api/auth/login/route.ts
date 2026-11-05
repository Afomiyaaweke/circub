// Login with email OR username + password
//
// v224: registration REQUIRES a username (the /u/<handle> handle) but this
// route used to match the email column ONLY - signing in with your handle
// answered 401 "Invalid email or password" and read as "sign in is broken".
// The identifier is now resolved as email first, then as a username (leading
// @ stripped, normalized + validated through the SAME normalizeUsername /
// USERNAME_RE pair the register API uses).
//
// Deactivated accounts (v134): a deactivated user signs back in with the SAME
// identifier + password - no email verification, no support email. Login is the
// reactivation path: the password IS the ownership proof, so the soft-off
// flags are cleared right here and the session is issued as usual.
// Accounts deactivated MORE than 6 months ago are past the retention window:
// they are hard-deleted on the spot (cascade wipes posts, follows, messages)
// and the login answers with the generic 401, as if the account never existed.
import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import type { User } from '@prisma/client'
import { db } from '@/lib/db'
import { setSessionCookie, checkRateLimit } from '@/lib/session'
import { isPastRetention } from '@/lib/deactivation'
import { normalizeUsername, USERNAME_RE } from '@/lib/username'
import { caseInsensitiveWhere } from '@/lib/search'
import { withDbRetry } from '@/lib/db-retry'

export async function POST(req: NextRequest) {
  try {
    // Rate limit: max 10 login attempts per minute per IP. x-forwarded-for on
    // Vercel can be a comma-separated chain - key on the FIRST (client) entry
    // so the whole chain text never changes the bucket mid-session.
    const forwarded = req.headers.get('x-forwarded-for') || ''
    const ip = forwarded.split(',')[0].trim() || 'unknown'
    const { allowed } = checkRateLimit(`login:${ip}`, 10, 60000)
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many login attempts. Please try again in a minute.' },
        { status: 429 }
      )
    }

    const body = await req.json()
    const identifier = String(body.email ?? '').trim()
    const password = body.password

    if (!identifier || !password) {
      return NextResponse.json(
        { error: 'Email or username and password are required' },
        { status: 400 }
      )
    }

    // Resolve the identifier: an email-shaped string matches the email
    // column; anything else is treated as the /u/<handle> username (a pasted
    // "@name" keeps working - normalizeUsername strips the leading @).
    // v225 LAST-RESORT: exact display-NAME match (case-insensitive). The top
    // real-world "sign in is broken" report is people typing their display
    // name ("Afomiya") instead of their auto-generated handle - a flat 401
    // told them nothing. If several accounts share the name we ask for the
    // email instead of guessing. Error responses now also carry a machine
    // `code` so the client can react (e.g. point Google-registered users at
    // the Google button instead of a misleading "invalid password").
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    let user: User | null = null
    if (emailRe.test(identifier)) {
      // v240: every lookup goes through withDbRetry - a cold serverless DB
      // used to answer 500 "Login failed" here and a user retrying in a loop
      // then tripped the 10/min rate limit, which read as "sign in is broken".
      user = await withDbRetry(() =>
        db.user.findUnique({ where: { email: identifier.toLowerCase() } })
      )
    } else {
      const username = normalizeUsername(identifier)
      if (USERNAME_RE.test(username)) {
        user = await withDbRetry(() => db.user.findUnique({ where: { username } }))
      }
      if (!user) {
        const candidates = await withDbRetry(() =>
          db.user.findMany({
            where: caseInsensitiveWhere({ name: { contains: identifier } }),
            take: 10,
          })
        )
        const exact = candidates.filter(
          (u) => (u.name || '').trim().toLowerCase() === identifier.toLowerCase()
        )
        if (exact.length === 1) {
          user = exact[0]
        } else if (exact.length > 1) {
          return NextResponse.json(
            {
              error: `Several accounts share the name "${identifier}". Please sign in with your email instead.`,
              code: 'AMBIGUOUS_NAME',
            },
            { status: 401 }
          )
        }
      }
    }
    if (!user) {
      return NextResponse.json(
        {
          error: `No account found for "${identifier}". Check the spelling, try your email, or create a free account.`,
          code: 'NO_ACCOUNT',
        },
        { status: 401 }
      )
    }
    if (!user.password) {
      // A Google-registered account has no local password: the previous
      // "Invalid email or password" here was THE misleading message that
      // made Google users believe sign-in was broken.
      return NextResponse.json(
        {
          error: 'This account was created with Google. Tap "Continue with Google" above to sign in.',
          code: 'GOOGLE_ONLY',
          googleOnly: true,
        },
        { status: 401 }
      )
    }

    const ok = await bcrypt.compare(password, user.password)
    if (!ok) {
      // v240: point at the recovery path IN the message - the top real-world
      // dead end is a forgotten password where the user never notices the
      // "Forgot password?" link under the sign-in button.
      return NextResponse.json(
        {
          error: 'Incorrect password. Please try again, or tap "Forgot password?" below to reset it by email.',
          code: 'WRONG_PASSWORD',
        },
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
        return NextResponse.json(
          { error: 'No account found. This account no longer exists.', code: 'NO_ACCOUNT' },
          { status: 401 }
        )
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
    // v240: say WHAT happened (temporary server/DB trouble) instead of a bare
    // "Login failed" that reads as "my credentials are wrong".
    return NextResponse.json(
      {
        error: 'Sign-in is temporarily unavailable - the database is waking up. Please try again in a few seconds.',
        code: 'TEMPORARY',
      },
      { status: 500 }
    )
  }
}

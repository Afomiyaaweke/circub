// POST /api/auth/deactivate - user-initiated account deactivation.
//
// Flow (matches the "Deactivate account" button next to Sign out):
//   1. Requires a live session.
//   2. Requires a reason (the modal asks "why are you leaving?").
//   3. Soft-off switch on the user row: deactivatedAt + deactivationReason.
//      - getCurrentUser() treats deactivated users as signed out, so every
//        API starts returning 401 immediately.
//      - Login returns 403 with a clear "contact support" message.
//   4. The reason is FORWARDED TO THE CONTACT-US INBOX: a ContactMessage row
//      (the exact channel the /contact page writes to), addressed from the
//      user's account email with subject "Account deactivation request".
//
// Reversible: support clears deactivatedAt/deactivationReason.
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser, checkRateLimit, sanitizeInput } from '@/lib/session'

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for') || 'unknown'
    const { allowed } = checkRateLimit(`deactivate:${ip}`, 3, 60000)
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again in a minute.' },
        { status: 429 }
      )
    }

    const me = await getCurrentUser()
    if (!me) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }
    if (me.deactivatedAt) {
      return NextResponse.json({ error: 'Account is already deactivated' }, { status: 409 })
    }

    const body = await req.json().catch(() => ({}))
    const reason = sanitizeInput(String(body.reason || ''), 2000)
    if (!reason || reason.length < 3) {
      return NextResponse.json(
        { error: 'Please tell us why you are leaving (at least a few words) - it helps us improve circub.' },
        { status: 400 }
      )
    }

    const now = new Date()

    // 1) Soft-off the account.
    await db.user.update({
      where: { id: me.id },
      data: { deactivatedAt: now, deactivationReason: reason },
    })

    // 2) Put the reason into the contact-us email pipeline (same table the
    //    /contact "Send Us a Message" form writes to - one inbox for the team).
    try {
      await db.contactMessage.create({
        data: {
          name: me.name || 'circub user',
          email: me.email,
          subject: 'Account deactivation request',
          message: [
            `A user deactivated their account via the in-app "Deactivate account" button.`,
            ``,
            `Account: ${me.name} (${me.email})`,
            `User ID: ${me.id}`,
            `Account type: ${me.accountType}`,
            `Deactivated at: ${now.toISOString()}`,
            ``,
            `Reason given:`,
            reason,
          ].join('\n'),
        },
      })
    } catch (mailErr) {
      // Deactivation itself must not fail if the inbox write fails - log it.
      console.error('[deactivate] failed to forward reason to contact inbox:', mailErr)
    }

    return NextResponse.json({ ok: true, supportEmail: 'support@tenetbid.com' })
  } catch (error) {
    console.error('Deactivation failed:', error)
    return NextResponse.json({ error: 'Failed to deactivate your account. Please try again.' }, { status: 500 })
  }
}

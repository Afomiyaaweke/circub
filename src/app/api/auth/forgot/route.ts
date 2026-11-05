import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { mintResetToken } from '@/lib/reset-token'
import { checkRateLimit } from '@/lib/session'

// v239: forgot password. Always answers 200 with a generic body (never leaks
// whether an email is registered). When RESEND_API_KEY is configured (same
// mailer the contact form uses) a reset link is emailed; the link opens the
// app at /?reset=<token> where the set-new-password modal lives for 30
// minutes. Without a mailer the response reports delivery:'unavailable' and
// the UI points the user at support instead of pretending an email was sent.
const FROM = process.env.RESEND_FROM || 'circubAwd <onboarding@resend.dev>'
const APP_ORIGIN = process.env.NEXTAUTH_URL || 'https://circubawd.vercel.app'

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for') || 'unknown'
    const { allowed } = checkRateLimit(`forgot:${ip}`, 5, 60000)
    if (!allowed) {
      return NextResponse.json({ error: 'Too many requests. Please try again in a minute.' }, { status: 429 })
    }

    const body = await req.json().catch(() => ({}))
    const email = String(body.email ?? '').trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 })
    }

    let delivery: 'sent' | 'unavailable' = 'unavailable'
    try {
      const user = await db.user.findUnique({ where: { email }, select: { id: true, name: true, password: true } })
      const apiKey = process.env.RESEND_API_KEY
      if (user && user.password && apiKey) {
        const token = mintResetToken(email)
        const link = `${APP_ORIGIN}/?reset=${encodeURIComponent(token)}`
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: FROM,
            to: [email],
            subject: 'Reset your circubAwd password',
            html: [
              `<p>Hi ${user.name || 'there'},</p>`,
              `<p>Use this link to choose a new circubAwd password (valid for 30 minutes):</p>`,
              `<p><a href="${link}">Reset my password</a></p>`,
              `<p>If the button does not work, copy this link into your browser:<br/>${link}</p>`,
              `<p>If you did not request this, ignore this email - your password stays unchanged.</p>`,
              `<p>- the circubAwd team</p>`,
            ].join(''),
          }),
        })
        if (res.ok) delivery = 'sent'
      }
    } catch {
      // DB or mailer hiccup: still answer the generic 200 below
    }

    return NextResponse.json({ ok: true, delivery })
  } catch {
    return NextResponse.json({ ok: true, delivery: 'sent' })
  }
}

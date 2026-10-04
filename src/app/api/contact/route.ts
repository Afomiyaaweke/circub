// POST /api/contact - store a "Send Us a Message" submission from the /contact
// page AND deliver it as an email to the team inbox (v113).
//
// Delivery (Resend REST API, plain fetch - no SDK dependency):
//   RESEND_API_KEY    required to send. Without it the message is still
//                     stored and the response reports emailed: false.
//   CONTACT_TO_EMAIL  the team inbox. Defaults to support@tenetbid.com
//                     (the address the /contact page advertises).
//   RESEND_FROM       the verified sender, e.g. "Circub <support@tenetbid.com>".
//                     Defaults to Resend's sandbox sender, which only delivers
//                     to the Resend account's own address until a domain is
//                     verified.
// Email failure NEVER fails the request - the message is always persisted
// first, so nothing a visitor writes is lost. reply_to is the visitor so the
// team can answer straight from their inbox.
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { checkRateLimit, sanitizeInput } from '@/lib/session'

const CONTACT_INBOX_FALLBACK = 'support@tenetbid.com'

export async function POST(req: NextRequest) {
  try {
    // Rate limit: max 5 messages per minute per IP (matches register/login limits)
    const ip = req.headers.get('x-forwarded-for') || 'unknown'
    const { allowed } = checkRateLimit(`contact:${ip}`, 5, 60000)
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many messages. Please try again in a minute.' },
        { status: 429 }
      )
    }

    const body = await req.json().catch(() => ({}))

    const name = sanitizeInput(body.name || '', 100)
    const email = sanitizeInput(body.email || '', 200).trim().toLowerCase()
    const subject = sanitizeInput(body.subject || '', 200)
    const message = sanitizeInput(body.message || '', 4000)

    // Validate required fields
    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'A valid email is required' }, { status: 400 })
    }
    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    // Persist FIRST - a stored message is never lost, even if the mail
    // provider is down or unconfigured.
    const saved = await db.contactMessage.create({
      data: {
        name,
        email,
        subject: subject || null,
        message,
      },
    })

    // v113: deliver the message to the team inbox. Env-driven and honest:
    // no key -> emailed: false + a server-side warning (config gap, not a
    // user-facing error); provider error -> logged, request still succeeds.
    const apiKey = process.env.RESEND_API_KEY
    const toEmail = process.env.CONTACT_TO_EMAIL || CONTACT_INBOX_FALLBACK
    let emailed = false
    if (apiKey) {
      try {
        const mailRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: process.env.RESEND_FROM || 'Circub <onboarding@resend.dev>',
            to: [toEmail],
            reply_to: email,
            subject: subject ? `[Circub Contact] ${subject}` : '[Circub Contact] New message',
            text: [
              `New message from the circub /contact page:`,
              ``,
              `Name: ${name}`,
              `Email: ${email}`,
              `Subject: ${subject || '(none)'}`,
              ``,
              message,
              ``,
              `--`,
              `Stored as contact message ${saved.id}`,
            ].join('\n'),
          }),
        })
        if (mailRes.ok) {
          emailed = true
        } else {
          const detail = await mailRes.text().catch(() => '')
          console.error(
            `Contact email delivery failed (message ${saved.id}):`,
            mailRes.status,
            detail.slice(0, 300)
          )
        }
      } catch (mailErr) {
        console.error(`Contact email delivery error (message ${saved.id}):`, mailErr)
      }
    } else {
      console.warn(
        `Contact message ${saved.id} stored but NOT emailed: RESEND_API_KEY is not set. ` +
          `Add RESEND_API_KEY (+ optionally CONTACT_TO_EMAIL, RESEND_FROM) in the ` +
          `hosting environment to deliver contact messages to the team inbox.`
      )
    }

    return NextResponse.json({ ok: true, id: saved.id, emailed })
  } catch (error) {
    console.error('Failed to store contact message:', error)
    return NextResponse.json(
      { error: 'Failed to send your message. Please try again.' },
      { status: 500 }
    )
  }
}

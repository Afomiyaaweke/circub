// POST /api/contact - store a "Send Us a Message" submission from the /contact
// page AND deliver it as an email to the team inbox (v113, v196).
//
// v196 DELIVERY CHAIN - messages must reach afomiyaaweke20@gmail.com DIRECTLY,
// with zero required configuration:
//   1. Resend REST API (plain fetch, no SDK) when RESEND_API_KEY is set.
//   2. FormSubmit AJAX relay (https://formsubmit.co/ajax/<inbox>) when Resend
//      is unconfigured OR failed - a free, keyless relay so delivery works
//      out of the box. The very first relayed message makes FormSubmit send
//      an "Activate Form" email to the inbox; the owner clicks that link
//      ONCE and every contact message lands there from then on.
//   Response reports via: 'resend' | 'formsubmit' | null so the pipeline can
//   prove which path delivered.
// Env (all optional):
//   CONTACT_TO_EMAIL  the team inbox. Defaults to afomiyaaweke20@gmail.com.
//   RESEND_API_KEY    enables the Resend path.
//   RESEND_FROM       the verified Resend sender, defaults to Resend's sandbox
//                     sender (delivers to the Resend account's own address).
//   CONTACT_FORM_ORIGIN  Origin/Referer header value FormSubmit requires
//                     (anti-spam). Defaults to the production origin.
// Email failure NEVER fails the request - the message is always persisted
// first, so nothing a visitor writes is lost. reply_to is the visitor so the
// team can answer straight from their inbox.
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { checkRateLimit, sanitizeInput } from '@/lib/session'

const CONTACT_INBOX_FALLBACK = 'afomiyaaweke20@gmail.com'
const FORMSUBMIT_ORIGIN_FALLBACK = 'https://circubawd.vercel.app'

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

    // v113/v196: deliver the message to the team inbox. Env-driven and honest:
    // no key -> the keyless FormSubmit relay takes over; provider error ->
    // logged, request still succeeds.
    const apiKey = process.env.RESEND_API_KEY
    const toEmail = process.env.CONTACT_TO_EMAIL || CONTACT_INBOX_FALLBACK
    let emailed = false
    let via: 'resend' | 'formsubmit' | null = null

    // --- Path 1: Resend (unchanged) ---------------------------------------
    if (apiKey) {
      try {
        const mailRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: process.env.RESEND_FROM || 'circubAwd <onboarding@resend.dev>',
            to: [toEmail],
            reply_to: email,
            subject: subject ? `[circubAwd Contact] ${subject}` : '[circubAwd Contact] New message',
            text: [
              `New message from the circubAwd /contact page:`,
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
          via = 'resend'
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
    }

    // --- Path 2: FormSubmit keyless relay (v196) --------------------------
    // Fires whenever Resend is unconfigured or failed, so delivery to the
    // owner's inbox never depends on having an API key. FormSubmit requires
    // Origin/Referer headers (anti-spam) and answers
    // { success: 'true'|'false', message }. Until the inbox owner clicks the
    // one-time "Activate Form" link, success stays false - that is expected
    // and logged honestly, the message is still stored above.
    if (!emailed) {
      try {
        const siteOrigin = process.env.CONTACT_FORM_ORIGIN || FORMSUBMIT_ORIGIN_FALLBACK
        const fsRes = await fetch(`https://formsubmit.co/ajax/${toEmail}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Origin: siteOrigin,
            Referer: `${siteOrigin}/contact`,
            'User-Agent': 'Mozilla/5.0 (compatible; circubAwd/1.0)',
          },
          signal: AbortSignal.timeout(10_000),
          body: JSON.stringify({
            _subject: subject
              ? `[circubAwd Contact] ${subject}`
              : '[circubAwd Contact] New message',
            _template: 'table',
            _captcha: 'false',
            _replyto: email,
            Name: name,
            Email: email,
            Subject: subject || '(none)',
            Message: message,
            'Stored as': `contact message ${saved.id}`,
          }),
        })
        const fsData: { success?: boolean | string; message?: string } | null = await fsRes
          .json()
          .catch(() => null)
        const fsOk = fsRes.ok && !!fsData && (fsData.success === true || fsData.success === 'true')
        if (fsOk) {
          emailed = true
          via = 'formsubmit'
        } else {
          console.warn(
            `Contact message ${saved.id}: FormSubmit relay did not deliver ` +
              `(status ${fsRes.status}, reply: ${(fsData?.message || '').slice(0, 200)}). ` +
              `If this is the activation prompt, the inbox owner must click the ` +
              `"Activate Form" link FormSubmit emailed to ${toEmail} once.`
          )
        }
      } catch (fsErr) {
        console.error(`Contact message ${saved.id}: FormSubmit relay error:`, fsErr)
      }
    }

    return NextResponse.json({ ok: true, id: saved.id, emailed, via })
  } catch (error) {
    console.error('Failed to store contact message:', error)
    return NextResponse.json(
      { error: 'Failed to send your message. Please try again.' },
      { status: 500 }
    )
  }
}

// v261 EMAIL NOTIFICATIONS ON NEW POSTS - followers hear about it by email.
//
// When a member publishes something (a local price post, a community post or
// a member quest), every active follower of that member gets one branded
// email. The send runs inside `after()` in the route handlers, so the poster's
// response is never delayed by mail delivery and a mailer hiccup can never
// fail a post that already succeeded.
//
// Delivery chain (same mailer the contact form and forgot-password use):
//   Resend REST API (plain fetch, no SDK) when RESEND_API_KEY is set.
//   Without a key this module is a silent no-op - posts work exactly as
//   before and the API just skips delivery (the contact form keeps its own
//   keyless FormSubmit relay; follower mail has no such relay because each
//   email must reach a DIFFERENT follower's inbox).
// Env (all optional):
//   RESEND_API_KEY    enables the Resend path.
//   RESEND_FROM       verified Resend sender, defaults to Resend's sandbox
//                     sender (delivers to the Resend account's own address -
//                     verify a domain to reach arbitrary follower inboxes).
//   RESEND_API_URL    API base override - TEST SEAM so the E2E probe can
//                     point delivery at a local mock server and assert real
//                     send attempts. Defaults to https://api.resend.com.
//   NEXTAUTH_URL      app origin for the CTA link.
// Guardrails: active (non-deactivated) followers only, the author never
// mails themselves, hard cap of 50 recipients per post, 8s per-send timeout,
// and every failure is swallowed (logged) - notifications are additive.
import { db } from '@/lib/db'

const RESEND_URL = process.env.RESEND_API_URL || 'https://api.resend.com'
const FROM = process.env.RESEND_FROM || 'circubAwd <onboarding@resend.dev>'
const APP_ORIGIN = process.env.NEXTAUTH_URL || 'https://circubawd.vercel.app'
const MAX_RECIPIENTS = 50

function esc(v: string): string {
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export async function sendEmail(opts: {
  to: string[]
  subject: string
  html: string
}): Promise<{ ok: boolean; via: string; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return { ok: false, via: 'unconfigured', error: 'RESEND_API_KEY missing' }
  try {
    const res = await fetch(`${RESEND_URL}/emails`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: opts.to, subject: opts.subject, html: opts.html }),
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) {
      return { ok: false, via: 'resend', error: `HTTP ${res.status}` }
    }
    return { ok: true, via: 'resend' }
  } catch (e) {
    return { ok: false, via: 'resend', error: e instanceof Error ? e.message : 'send failed' }
  }
}

export interface NewPostEmail {
  kind: 'PRICE' | 'COMMUNITY' | 'QUEST'
  authorId: string
  authorName: string
  /** One-line headline, e.g. "Meron Tadesse posted a new local price" */
  headline: string
  /** Short label/value rows shown under the headline (max 4 kept). */
  rows: Array<[string, string]>
}

function brandedPostEmail(payload: NewPostEmail): string {
  const rows = payload.rows
    .slice(0, 4)
    .map(
      ([label, value]) =>
        `<tr><td style="padding:6px 14px;color:#8aa39a;font-size:12px;text-transform:uppercase;letter-spacing:.5px;white-space:nowrap;vertical-align:top">${esc(label)}</td>` +
        `<td style="padding:6px 0;color:#eaf2ee;font-size:14px;line-height:1.5">${esc(value)}</td></tr>`
    )
    .join('')
  return [
    `<div style="margin:0;background:#f4f7f5;padding:28px 12px;font-family:system-ui,-apple-system,'Segoe UI',sans-serif">`,
    `<div style="max-width:520px;margin:0 auto;background:#0b1f16;border-radius:16px;overflow:hidden;border:1px solid #1c3a2c">`,
    `<div style="padding:20px 24px;border-bottom:1px solid #1c3a2c">`,
    `<span style="display:inline-flex;width:40px;height:40px;border-radius:9999px;background:#14c37c;color:#02140c;font-size:22px;font-weight:800;align-items:center;justify-content:center;line-height:1">C</span>`,
    `<span style="color:#eaf2ee;font-size:18px;font-weight:700;margin-left:10px;vertical-align:middle">circubAwd</span>`,
    `</div>`,
    `<div style="padding:24px">`,
    `<p style="margin:0 0 6px;color:#14c37c;font-size:12px;text-transform:uppercase;letter-spacing:1px">New post on your network</p>`,
    `<p style="margin:0 0 16px;color:#eaf2ee;font-size:20px;font-weight:700;line-height:1.3">${esc(payload.headline)}</p>`,
    `<table style="width:100%;border-collapse:collapse;background:#02140c;border-radius:12px">${rows}</table>`,
    `<p style="margin:22px 0 0"><a href="${esc(APP_ORIGIN)}" style="display:inline-block;background:#14c37c;color:#02140c;font-weight:700;font-size:15px;padding:12px 26px;border-radius:9999px;text-decoration:none">Open circubAwd</a></p>`,
    `</div>`,
    `<div style="padding:14px 24px;border-top:1px solid #1c3a2c">`,
    `<p style="margin:0;color:#8aa39a;font-size:12px;line-height:1.5">You are getting this because you follow ${esc(payload.authorName)} on circubAwd. Local prices, community posts and bounties from people in your network.</p>`,
    `</div>`,
    `</div></div>`,
  ].join('')
}

/** Email every active follower of the author. Returns the number of sends
 *  Resend accepted. Never throws - caller may fire-and-forget. */
export async function notifyFollowersNewPost(payload: NewPostEmail): Promise<number> {
  try {
    const followers = await db.follow.findMany({
      where: { followingId: payload.authorId },
      select: {
        followerId: true,
        follower: { select: { email: true, name: true, deactivatedAt: true } },
      },
      take: MAX_RECIPIENTS + 20,
    })
    const recipients = followers
      .filter(
        (f) =>
          f.followerId !== payload.authorId &&
          !!f.follower.email &&
          !f.follower.deactivatedAt
      )
      .slice(0, MAX_RECIPIENTS)
    if (recipients.length === 0) return 0

    const subject = `circubAwd: ${payload.headline}`.slice(0, 200)
    const html = brandedPostEmail(payload)
    const results = await Promise.allSettled(
      recipients.map((r) => sendEmail({ to: [r.follower.email], subject, html }))
    )
    const sent = results.filter((r) => r.status === 'fulfilled' && r.value.ok).length
    if (sent < recipients.length) {
      const fails = results
        .filter((r): r is PromiseFulfilledResult<{ ok: boolean; via: string; error?: string }> => r.status === 'fulfilled' && !r.value.ok)
        .map((r) => r.value.error)
      console.error(`email-notify: ${sent}/${recipients.length} delivered`, fails)
    }
    return sent
  } catch (e) {
    console.error('email-notify: batch failed:', e)
    return 0
  }
}

// ---- v263 Pro subscription receipt ----------------------------------------
// Same dark-green brand as the new-post mail, one row table, fired from the
// subscribe route inside after() so a mailer outage can never fail a payment
// response. Returns true when Resend accepted the send.
export async function sendProReceiptEmail(opts: {
  to: string
  name: string
  periodEnd: Date
}): Promise<boolean> {
  try {
    const until = opts.periodEnd.toISOString().slice(0, 10)
    const html = [
      `<div style="margin:0;background:#f4f7f5;padding:28px 12px;font-family:system-ui,-apple-system,'Segoe UI',sans-serif">`,
      `<div style="max-width:520px;margin:0 auto;background:#0b1f16;border-radius:16px;overflow:hidden;border:1px solid #1c3a2c">`,
      `<div style="padding:20px 24px;border-bottom:1px solid #1c3a2c">`,
      `<span style="display:inline-flex;width:40px;height:40px;border-radius:9999px;background:#14c37c;color:#02140c;font-size:22px;font-weight:800;align-items:center;justify-content:center;line-height:1">C</span>`,
      `<span style="color:#eaf2ee;font-size:18px;font-weight:700;margin-left:10px;vertical-align:middle">circubAwd</span>`,
      `</div>`,
      `<div style="padding:24px">`,
      `<p style="margin:0 0 6px;color:#14c37c;font-size:12px;text-transform:uppercase;letter-spacing:1px">Pro subscription receipt</p>`,
      `<p style="margin:0 0 16px;color:#eaf2ee;font-size:20px;font-weight:700;line-height:1.3">Welcome to Pro, ${esc(opts.name)} - unlimited proforma questions are on.</p>`,
      `<table style="width:100%;border-collapse:collapse;background:#02140c;border-radius:12px">`,
      `<tr><td style="padding:6px 14px;color:#8aa39a;font-size:12px;text-transform:uppercase;letter-spacing:.5px;white-space:nowrap">Plan</td><td style="padding:6px 0;color:#eaf2ee;font-size:14px">Pro - $4.99 / month</td></tr>`,
      `<tr><td style="padding:6px 14px;color:#8aa39a;font-size:12px;text-transform:uppercase;letter-spacing:.5px;white-space:nowrap">Active until</td><td style="padding:6px 0;color:#eaf2ee;font-size:14px">${esc(until)} (UTC)</td></tr>`,
      `<tr><td style="padding:6px 14px;color:#8aa39a;font-size:12px;text-transform:uppercase;letter-spacing:.5px;white-space:nowrap">Questions</td><td style="padding:6px 0;color:#eaf2ee;font-size:14px">Unlimited while active</td></tr>`,
      `</table>`,
      `<p style="margin:22px 0 0"><a href="${esc(APP_ORIGIN)}" style="display:inline-block;background:#14c37c;color:#02140c;font-weight:700;font-size:15px;padding:12px 26px;border-radius:9999px;text-decoration:none">Build my proforma</a></p>`,
      `</div>`,
      `<div style="padding:14px 24px;border-top:1px solid #1c3a2c">`,
      `<p style="margin:0;color:#8aa39a;font-size:12px;line-height:1.5">You can cancel any time from the proforma panel on circubAwd - cancelling ends Pro immediately and returns you to the 3 free daily questions.</p>`,
      `</div>`,
      `</div></div>`,
    ].join('')
    const res = await sendEmail({
      to: [opts.to],
      subject: `circubAwd Pro receipt - active until ${until}`,
      html,
    })
    return res.ok
  } catch (e) {
    console.error('email-notify: pro receipt failed:', e)
    return false
  }
}

// v263 POST /api/proforma/subscribe - start the monthly Pro subscription.
//     DELETE /api/proforma/subscribe - cancel it.
//
// The checkout is SIMULATED in this build (no payment gateway keys are wired
// yet): the client's demo card form posts here and the server flips the plan.
// Everything downstream of the "payment" is real: the plan, the 30-day
// period, the unlimited quota, the cancel path and the branded email receipt
// (best-effort, sent inside after() so a mailer outage never fails a
// subscribe response).
//
//   POST   200 { ok:true, plan:'PRO', periodEnd }   401 when signed out
//   DELETE 200 { ok:true, plan:'FREE' }             401 when signed out

import { NextResponse, after } from 'next/server'
import { checkRateLimit, getCurrentUser } from '@/lib/session'
import { db } from '@/lib/db'
import { PRO_CYCLE_DAYS } from '@/lib/proforma'
import { sendProReceiptEmail } from '@/lib/email-notify'

export async function POST() {
  const me = await getCurrentUser()
  if (!me) {
    return NextResponse.json({ error: 'auth', message: 'Sign in to start Pro.' }, { status: 401 })
  }
  if (!checkRateLimit(`proforma-sub:${me.id}`, 10, 60000)) {
    return NextResponse.json({ error: 'rate' }, { status: 429 })
  }

  try {
    // Monthly period: 30 days from now, stored as an absolute instant so the
    // quota check needs no renewal cron - an expired period simply stops
    // being active and the member falls back to the 3 free daily questions.
    const periodEnd = new Date(Date.now() + PRO_CYCLE_DAYS * 86400000)
    await db.user.update({
      where: { id: me.id },
      data: { proformaPlan: 'PRO', proformaPeriodEnd: periodEnd },
    })

    after(async () => {
      const sent = await sendProReceiptEmail({ to: me.email, name: me.name, periodEnd })
      if (sent) console.log(`proforma/subscribe: receipt emailed to ${me.email}`)
    })

    return NextResponse.json({ ok: true, plan: 'PRO', periodEnd: periodEnd.toISOString() })
  } catch (e) {
    console.error('proforma/subscribe failed:', e)
    return NextResponse.json({ error: 'server' }, { status: 500 })
  }
}

export async function DELETE() {
  const me = await getCurrentUser()
  if (!me) {
    return NextResponse.json({ error: 'auth' }, { status: 401 })
  }
  if (!checkRateLimit(`proforma-sub:${me.id}`, 10, 60000)) {
    return NextResponse.json({ error: 'rate' }, { status: 429 })
  }

  try {
    // Cancelling ends Pro immediately (honest, no dark patterns): the member
    // returns to the FREE tier and today's used counter keeps counting.
    await db.user.update({
      where: { id: me.id },
      data: { proformaPlan: 'FREE', proformaPeriodEnd: null },
    })
    return NextResponse.json({ ok: true, plan: 'FREE' })
  } catch (e) {
    console.error('proforma/cancel failed:', e)
    return NextResponse.json({ error: 'server' }, { status: 500 })
  }
}

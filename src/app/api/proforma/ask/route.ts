// v263 POST /api/proforma/ask - consume ONE proforma question.
//
// The client calls this exactly when the proforma conversation completes
// (the results card is about to price the list). The server is the source
// of truth: the FREE tier gets 3 completed runs a day (UTC midnight reset),
// the monthly Pro subscription is unlimited while its period is active.
//
// Responses:
//   200 { ok:true, used, remaining } | { ok:true, unlimited:true, used }
//   401 { error:'auth' }   - not signed in (guests browse, they never ask)
//   402 { error:'limit', used, limit, resetDay } - free day used up -> paywall
//   429 rate-limited (shared in-memory limiter, same as every write route)

import { NextResponse } from 'next/server'
import { checkRateLimit, getCurrentUser } from '@/lib/session'
import { FREE_DAILY_LIMIT, consumeProformaQuestion, isProActive, utcDay } from '@/lib/proforma'

export async function POST() {
  // One ask = one write; the generic per-user limiter keeps this endpoint
  // from being hammered without penalising normal use (3/day free, more on Pro).
  const me = await getCurrentUser()
  if (!me) {
    return NextResponse.json(
      { error: 'auth', message: 'Sign in to ask the proforma - 3 free questions every day.' },
      { status: 401 },
    )
  }
  if (!checkRateLimit(`proforma-ask:${me.id}`, 40, 60000)) {
    return NextResponse.json({ error: 'rate' }, { status: 429 })
  }

  try {
    const result = await consumeProformaQuestion(me)
    if (!result.ok) {
      return NextResponse.json(
        {
          error: 'limit',
          used: FREE_DAILY_LIMIT,
          limit: FREE_DAILY_LIMIT,
          unlimited: false,
          resetDay: utcDay(new Date(Date.now() + 86400000)),
          message: "You've used all 3 free questions today.",
        },
        { status: 402 },
      )
    }
    return NextResponse.json({
      ok: true,
      unlimited: result.unlimited ?? false,
      plan: isProActive(me) ? 'PRO' : 'FREE',
      used: result.used,
      remaining: result.remaining,
    })
  } catch (e) {
    console.error('proforma/ask failed:', e)
    return NextResponse.json({ error: 'server' }, { status: 500 })
  }
}

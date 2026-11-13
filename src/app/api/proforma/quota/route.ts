// v263 GET /api/proforma/quota - the proforma plan + today's free-question
// state for the signed-in member (guests get the same shape with
// signedIn:false so the panel can pitch the plan before any ask).
//
// Read-only on purpose: the daily rollover write happens in the ask route
// when a question is actually consumed, so a page load can never cost quota.

import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/session'
import { quotaPayload } from '@/lib/proforma'

export async function GET() {
  try {
    const user = await getCurrentUser()
    return NextResponse.json(quotaPayload(user))
  } catch (e) {
    console.error('proforma/quota failed:', e)
    // Fail open-ish: report an unauthenticated-shaped payload instead of a
    // 5xx so a DB hiccup never blanks the proforma panel's plan chip.
    return NextResponse.json(quotaPayload(null))
  }
}

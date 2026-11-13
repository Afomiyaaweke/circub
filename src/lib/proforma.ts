// v263 Proforma subscription + daily free quota (server-side source of truth).
//
// The proforma AI (the guided WHERE / WHAT / WHEN / BUDGET conversation that
// prices a shopping list from real community posts) costs one QUESTION per
// completed run. The FREE tier gets FREE_DAILY_LIMIT questions every day; the
// monthly Pro subscription removes the cap while its period is active.
//
// Everything here is shared by the three /api/proforma routes so the rules
// can never drift between them:
//   - GET  /api/proforma/quota    -> read the plan + today's remaining count
//   - POST /api/proforma/ask      -> consume one question (402 = paywall)
//   - POST /api/proforma/subscribe-> simulated monthly checkout -> PRO
//   - DELETE /api/proforma/subscribe -> cancel -> back to FREE
//
// The daily counter needs no cron: the User row stores the UTC day its
// `proformaUsed` count belongs to (`proformaUsageDay`), and every route rolls
// the counter over when that day is not today.

import { db } from '@/lib/db'
import type { User } from '@prisma/client'

export const FREE_DAILY_LIMIT = 3
export const PRO_PRICE_LABEL = '$4.99'
export const PRO_CYCLE_DAYS = 30

// UTC calendar day (YYYY-MM-DD) - the quota resets at midnight UTC, the same
// instant for every member no matter their timezone, which keeps the rule
// simple and the number honest ("3 free questions a day").
export function utcDay(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10)
}

export function isProActive(user: Pick<User, 'proformaPlan' | 'proformaPeriodEnd'>): boolean {
  return user.proformaPlan === 'PRO' && !!user.proformaPeriodEnd && user.proformaPeriodEnd.getTime() > Date.now()
}

// Read the user's state WITHOUT writing: an expired/other-day counter reads
// as 0 used (the ask route does the actual rollover write when consuming).
export function readUsedToday(user: Pick<User, 'proformaUsageDay' | 'proformaUsed'>): number {
  return user.proformaUsageDay === utcDay() ? user.proformaUsed : 0
}

// Consume one question. Returns the outcome the ask route serializes:
//   { ok: true, unlimited }              - Pro member, counter still tracked
//   { ok: true, used, remaining }        - FREE member inside the daily cap
//   { ok: false, reason: 'limit' }       - FREE member at the cap (402)
// The day rollover + increment run in one update keyed on the current stored
// day so two parallel asks can never both pass an expired-day check and jump
// the cap (the update is conditional on usageDay + used, SQLite/Postgres
// serialise the row write; a lost race just means one extra allowed ask at
// the exact boundary, never a lock or a failed request).
export async function consumeProformaQuestion(
  user: User,
): Promise<{ ok: true; unlimited?: boolean; used: number; remaining: number | null } | { ok: false; reason: 'limit' }> {
  const today = utcDay()

  if (isProActive(user)) {
    const used = (user.proformaUsageDay === today ? user.proformaUsed : 0) + 1
    await db.user.update({
      where: { id: user.id },
      data: { proformaUsageDay: today, proformaUsed: used },
    })
    return { ok: true, unlimited: true, used, remaining: null }
  }

  const usedToday = readUsedToday(user)
  if (usedToday >= FREE_DAILY_LIMIT) return { ok: false, reason: 'limit' }

  const used = usedToday + 1
  await db.user.update({
    where: { id: user.id },
    data: { proformaUsageDay: today, proformaUsed: used },
  })
  return { ok: true, used, remaining: Math.max(0, FREE_DAILY_LIMIT - used) }
}

// The exact JSON the quota route returns - the client renders its plan chip,
// its "questions left" counter and its paywall copy straight from this.
export function quotaPayload(user: User | null) {
  if (!user) {
    // Guests see the same pitch members see - the completion gate decides
    // what happens when they try to ask.
    return {
      signedIn: false,
      plan: 'FREE' as const,
      pro: false,
      used: 0,
      limit: FREE_DAILY_LIMIT,
      remaining: FREE_DAILY_LIMIT,
      unlimited: false,
      periodEnd: null as string | null,
      priceLabel: PRO_PRICE_LABEL,
      resetDay: utcDay(),
    }
  }

  const pro = isProActive(user)
  const used = pro ? readUsedToday(user) : readUsedToday(user)
  return {
    signedIn: true,
    plan: pro ? ('PRO' as const) : ('FREE' as const),
    pro,
    used,
    limit: pro ? null : FREE_DAILY_LIMIT,
    remaining: pro ? null : Math.max(0, FREE_DAILY_LIMIT - used),
    unlimited: pro,
    periodEnd: user.proformaPeriodEnd ? user.proformaPeriodEnd.toISOString() : null,
    priceLabel: PRO_PRICE_LABEL,
    // The next UTC midnight, when a FREE member's three questions return.
    resetDay: utcDay(new Date(Date.now() + 86400000)),
  }
}

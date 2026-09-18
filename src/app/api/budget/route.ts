import { NextRequest, NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { webSearch as aiWebSearch } from '@/lib/ai-backends'
import {
  buildSearchTerms,
  estimatePrice,
  localCurrencyForLocation,
  searchLocalPrices,
  saneRange,
  type EstimateLocation,
  type LocalPriceMatch,
} from '@/lib/price-core'
import type { BudgetResponse } from '@/lib/types'

export const runtime = 'nodejs'
export const maxDuration = 60

// ============================================================================
// BUDGET PLANNER API - "how much money do I need to buy this here?"
// Takes an item name (typed, or identified by the PriceLens camera scan),
// a location, an optional quantity and an optional "money I have" amount,
// and returns the budget to set aside:
//   - per-unit price range (best case / typical / priciest realistic)
//   - the SAFE budget = priciest realistic total + 10% buffer
//   - a verdict against the money the user says they have
// Sources, in order of trust: local price posts on circub > AI/web estimate
// (scan result passed as aiHint, or re-estimated here) > keyword rough guess.
// ============================================================================

// --- 1) Per-IP rate limit: max 20 budget runs per rolling 60s ---
const RATE_LIMIT = { windowMs: 60_000, max: 20 }
const rateBuckets = new Map<string, number[]>()
let lastRateSweep = 0

function clientIpFrom(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  )
}

function checkRateLimit(ip: string): { ok: boolean; retryAfterSec: number } {
  const now = Date.now()
  if (now - lastRateSweep > 300_000) {
    lastRateSweep = now
    for (const [k, ts] of rateBuckets) {
      const kept = ts.filter((t) => now - t < RATE_LIMIT.windowMs)
      if (kept.length === 0) rateBuckets.delete(k)
      else rateBuckets.set(k, kept)
    }
  }
  const ts = (rateBuckets.get(ip) || []).filter((t) => now - t < RATE_LIMIT.windowMs)
  if (ts.length >= RATE_LIMIT.max) {
    const retryAfterSec = Math.max(1, Math.ceil((RATE_LIMIT.windowMs - (now - ts[0])) / 1000))
    rateBuckets.set(ip, ts)
    return { ok: false, retryAfterSec }
  }
  ts.push(now)
  rateBuckets.set(ip, ts)
  return { ok: true, retryAfterSec: 0 }
}

// --- 2) Result cache (same item + qty + budget + location repeats) ---------
const CACHE_TTL_MS = 300_000
const CACHE_MAX = 200
const cache = new Map<string, { result: BudgetResponse; expires: number }>()

function cacheKey(itemName: string, location: EstimateLocation | null, quantity: number, available: number | null, hint: { low: number | null; high: number | null; currency: string | null } | null): string {
  return crypto
    .createHash('sha256')
    .update(itemName.toLowerCase())
    .update(JSON.stringify(location ?? {}))
    .update(String(quantity))
    .update(String(available))
    .update(JSON.stringify(hint ?? {}))
    .digest('hex')
}

function getCached(key: string): BudgetResponse | null {
  const hit = cache.get(key)
  if (!hit) return null
  if (Date.now() > hit.expires) {
    cache.delete(key)
    return null
  }
  return hit.result
}

function storeCached(key: string, result: BudgetResponse): void {
  if (cache.size >= CACHE_MAX) {
    const drop = cache.size - CACHE_MAX + 1
    let i = 0
    for (const k of cache.keys()) {
      cache.delete(k)
      if (++i >= drop) break
    }
  }
  cache.set(key, { result, expires: Date.now() + CACHE_TTL_MS })
}

// --- Money formatting / rounding helpers -----------------------------------

function fmtMoney(currency: string, n: number): string {
  return `${currency} ${n.toLocaleString('en-US')}`
}

// Round a computed amount to a sensible granularity for money planning.
function roundMoney(n: number): number {
  if (n >= 10_000) return Math.round(n / 500) * 500
  if (n >= 1_000) return Math.round(n / 50) * 50
  if (n >= 100) return Math.round(n / 5) * 5
  if (n >= 10) return Math.round(n)
  return Math.round(n * 100) / 100
}

// Round UP (never under-budget) to the same kind of granularity.
function ceilMoney(n: number): number {
  if (n >= 10_000) return Math.ceil(n / 500) * 500
  if (n >= 1_000) return Math.ceil(n / 50) * 50
  if (n >= 100) return Math.ceil(n / 5) * 5
  if (n >= 10) return Math.ceil(n)
  return Math.ceil(n * 100) / 100
}

function locationLabel(location: EstimateLocation | null): string {
  if (location?.city) return `${location.city}${location.country ? ', ' + location.country : ''}`
  if (location?.country) return location.country
  return 'worldwide'
}

export async function POST(req: NextRequest) {
  let body: {
    itemName?: string
    location?: EstimateLocation | null
    quantity?: number
    availableBudget?: number | null
    aiHint?: { estimatedLow?: number | null; estimatedHigh?: number | null; currency?: string | null } | null
  }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }

  const itemName = String(body.itemName ?? '').trim().slice(0, 120)
  if (!itemName) {
    return NextResponse.json({ error: 'An item name is required (type it or scan the product first).' }, { status: 400 })
  }
  const location = body.location ?? null
  const quantity = Math.min(99, Math.max(1, Math.round(Number(body.quantity) || 1)))
  const available =
    body.availableBudget === null || body.availableBudget === undefined
      ? null
      : Number.isFinite(Number(body.availableBudget)) && Number(body.availableBudget) >= 0
        ? Number(body.availableBudget)
        : null

  // Sanitize the AI hint once (drops absurd values, swaps low>high).
  const hintSane = hintRawToSane(body.aiHint ?? null)

  // --- Guards ---
  const ip = clientIpFrom(req)
  const rl = checkRateLimit(ip)
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Too many budget runs - please wait ${rl.retryAfterSec}s and try again.` },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } }
    )
  }
  const key = cacheKey(itemName, location, quantity, available, hintSane)
  const cached = getCached(key)
  if (cached) return NextResponse.json(cached, { headers: { 'X-Cache': 'hit' } })

  // --- 1) Local price posts (real prices posted by locals on circub) --------
  const localPrices = await searchLocalPrices(buildSearchTerms(itemName), location, 8)

  // Primary currency: what the location uses; fall back to the AI hint's
  // currency when we have no location at all.
  const locCurrency = localCurrencyForLocation(location || {})
  const currency = !location?.city && !location?.country && hintSane?.currency ? hintSane.currency : locCurrency

  // Only posts in the SAME currency can be merged into the range safely.
  const matched: LocalPriceMatch[] = localPrices.filter((p) => p.currency === currency)

  // --- 2) Collect unit price candidates (one per source) ---------------------
  const candidates: Array<{ low: number | null; high: number | null }> = []
  let source: BudgetResponse['source'] = 'rough'
  if (matched.length > 0) {
    for (const p of matched) candidates.push({ low: p.priceMin, high: p.priceMax })
    source = 'local'
  }
  if (hintSane) {
    candidates.push({ low: hintSane.low, high: hintSane.high })
    if (source !== 'local') source = 'ai'
  }

  let estimateSummary: string | null = null
  if (candidates.length === 0) {
    // Standalone run (no scan hint, no local posts): run the same tiered
    // estimate chain the scanner uses so the planner ALWAYS has numbers.
    const query = `${itemName} price`
    const sources = await aiWebSearch(query, 3).catch(() => [])
    const est = await estimatePrice(query, location, sources)
    const sane = saneRange(est.estimatedLow, est.estimatedHigh, currency)
    if (sane) {
      candidates.push({ low: sane.estimatedLow, high: sane.estimatedHigh })
      estimateSummary = est.summary
      source = est.summary.startsWith('Rough guess') ? 'rough' : 'ai'
    }
  }

  const unit = saneRange(
    candidates.length ? Math.min(...candidates.map((c) => c.low).filter((n): n is number => n !== null)) : null,
    candidates.length ? Math.max(...candidates.map((c) => c.high).filter((n): n is number => n !== null)) : null,
    currency
  )
  if (!unit || (unit.estimatedLow === null && unit.estimatedHigh === null)) {
    return NextResponse.json({ error: 'Could not work out a price range for this item. Try a clearer name.' }, { status: 422 })
  }

  const low = unit.estimatedLow ?? unit.estimatedHigh ?? 0
  const high = unit.estimatedHigh ?? unit.estimatedLow ?? 0
  // Robust typical: median of the per-source midpoints, so one wildly
  // different post (a cafe cup vs 1kg beans) cannot drag the typical away.
  const mids = candidates
    .map((c) => ((c.low ?? c.high ?? 0) + (c.high ?? c.low ?? 0)) / 2)
    .filter((n) => n > 0)
    .sort((a, b) => a - b)
  const median = mids.length % 2 === 1 ? mids[(mids.length - 1) / 2] : (mids[mids.length / 2 - 1] + mids[mids.length / 2]) / 2
  const typical = Math.min(Math.max(median || low + (high - low) / 2, low), high)

  // --- 3) Scale by quantity + build the safe budget --------------------------
  const totalLow = roundMoney(low * quantity)
  const totalTypical = roundMoney(typical * quantity)
  const totalHigh = roundMoney(high * quantity)
  const recommended = ceilMoney(totalHigh * 1.1)

  const breakdown: BudgetResponse['breakdown'] = [
    {
      label: quantity === 1 ? `${itemName} at a typical price` : `${quantity} × ${itemName} at a typical price`,
      amount: totalTypical,
    },
    { label: 'Buffer for price swings and extras', amount: recommended - totalTypical },
  ]

  // --- 4) Verdict against the money the user has -----------------------------
  let verdict: BudgetResponse['verdict'] = null
  if (available !== null) {
    if (available >= recommended) {
      verdict = {
        state: 'ok',
        spare: roundMoney(available - recommended),
        shortBy: null,
        message: `Your ${fmtMoney(currency, available)} covers the safe budget with about ${fmtMoney(currency, roundMoney(available - recommended))} spare.`,
      }
    } else if (available >= totalTypical) {
      verdict = {
        state: 'tight',
        spare: null,
        shortBy: roundMoney(recommended - available),
        message: `Enough for typical prices, but about ${fmtMoney(currency, roundMoney(recommended - available))} short of the safe budget. Bargain, shop around, or trim the quantity.`,
      }
    } else {
      verdict = {
        state: 'short',
        spare: null,
        shortBy: roundMoney(recommended - available),
        message: `Short by about ${fmtMoney(currency, roundMoney(recommended - available))} for the safe budget - typical spend is ${fmtMoney(currency, totalTypical)}.`,
      }
    }
  }

  // --- 5) Cheapest known local option -----------------------------------------
  let cheapest: BudgetResponse['cheapest'] = null
  if (matched.length > 0) {
    const best = matched.reduce((a, b) => (b.priceMin < a.priceMin ? b : a))
    cheapest = {
      productName: best.productName,
      priceMin: best.priceMin,
      priceMax: best.priceMax,
      city: best.city,
      country: best.country,
      currency: best.currency,
    }
  }

  const parts: string[] = []
  if (matched.length > 0) parts.push(`${matched.length} local price post${matched.length !== 1 ? 's' : ''} on circub`)
  if (hintSane || (estimateSummary && source === 'ai')) parts.push('an AI price estimate')
  if (source === 'rough') parts.push('typical market prices (rough guess)')

  const result: BudgetResponse = {
    currency,
    quantity,
    perUnit: { low: roundMoney(low), typical: roundMoney(typical), high: roundMoney(high) },
    total: { low: totalLow, typical: totalTypical, high: totalHigh, recommended },
    cheapest,
    breakdown,
    verdict,
    source,
    note: `Safe budget = priciest realistic total + 10% buffer, from ${parts.join(' + ') || 'market data'} for ${locationLabel(location)}.`,
  }
  storeCached(key, result)
  return NextResponse.json(result)
}

// ---------------------------------------------------------------------------
function hintRawToSane(hint: { estimatedLow?: number | null; estimatedHigh?: number | null; currency?: string | null } | null): { low: number | null; high: number | null; currency: string | null } | null {
  if (!hint) return null
  const sane = saneRange(hint.estimatedLow ?? null, hint.estimatedHigh ?? null, hint.currency || 'USD')
  if (!sane || (sane.estimatedLow === null && sane.estimatedHigh === null)) return null
  return { low: sane.estimatedLow, high: sane.estimatedHigh, currency: hint.currency || null }
}

import { NextRequest, NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { webSearch as aiWebSearch, llmText, parseLooseJson } from '@/lib/ai-backends'
import {
  buildSearchTerms,
  estimatePrice,
  localCurrencyForLocation,
  searchLocalPrices,
  saneRange,
  roughEstimate,
  convertMoney,
  ROUGH_FX_PER_USD,
  type EstimateLocation,
  type LocalPriceMatch,
} from '@/lib/price-core'
import type { BudgetResponse } from '@/lib/types'

export const runtime = 'nodejs'
export const maxDuration = 60

// ============================================================================
// BUDGET PLANNER API - "how much money do I need to buy this here?"
// Takes ONE item (typed or scanned) or a whole shopping LIST, a location,
// an optional currency override and an optional "money I have" amount, and
// returns the budget to set aside:
//   - per-item and combined price ranges (best / typical / priciest)
//   - the SAFE budget = priciest realistic total + 10% buffer
//   - a verdict against the money the user says they have
//   - where to find the items near the location (circub posts + AI guide)
// Sources, in order of trust: local price posts on circub > AI/web estimate
// > keyword rough guess. A requested currency converts the numbers through
// rough USD-based market rates.
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

// --- 2) Result cache (same list + qty + budget + location + currency) -------
const CACHE_TTL_MS = 300_000
const CACHE_MAX = 200
const cache = new Map<string, { result: BudgetResponse; expires: number }>()

function cacheKey(items: Array<{ name: string; quantity: number }>, location: EstimateLocation | null, available: number | null, hint: { low: number | null; high: number | null; currency: string | null } | null, target: string | null): string {
  return crypto
    .createHash('sha256')
    .update(items.map((i) => `${i.name.toLowerCase()}#${i.quantity}`).join('|'))
    .update(JSON.stringify(location ?? {}))
    .update(String(available))
    .update(JSON.stringify(hint ?? {}))
    .update(target ?? '')
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

// --- Per-item computation ----------------------------------------------------
// One item's price research in its NATURAL currency (what the location uses).
// The AI chain (web search + LLM) runs for AT MOST ONE item per request so a
// long shopping list can never push the response past the 60s function cap -
// later unknown items fall back to the instant rough-keyword estimate.

interface ItemBudget {
  name: string
  quantity: number
  naturalCurrency: string
  low: number
  typical: number
  high: number
  perUnit: { low: number; typical: number; high: number }
  total: { low: number; typical: number; high: number; recommended: number }
  itemLineLabel: string
  cheapest: BudgetResponse['cheapest']
  source: BudgetResponse['source']
  matched: LocalPriceMatch[]
  noteParts: string[]
  usedAiChain?: boolean
  error?: string
}

async function computeItem(
  name: string,
  quantity: number,
  location: EstimateLocation | null,
  hint: { low: number | null; high: number | null; currency: string | null } | null,
  allowAiChain: boolean,
): Promise<ItemBudget> {
  const localPrices = await searchLocalPrices(buildSearchTerms(name), location, 8)

  const locCurrency = localCurrencyForLocation(location || {})
  const currency =
    !location?.city && !location?.country && hint?.currency ? hint.currency : locCurrency

  const matched: LocalPriceMatch[] = localPrices.filter((p) => p.currency === currency)

  const candidates: Array<{ low: number | null; high: number | null }> = []
  let source: BudgetResponse['source'] = 'rough'
  if (matched.length > 0) {
    for (const p of matched) candidates.push({ low: p.priceMin, high: p.priceMax })
    source = 'local'
  }
  if (hint) {
    candidates.push({ low: hint.low, high: hint.high })
    if (source !== 'local') source = 'ai'
  }

  let estimateSummary: string | null = null
  let usedAiChain = false
  if (candidates.length === 0) {
    if (allowAiChain) {
      // Full tiered chain, same as the scanner: web sources + LLM estimate.
      usedAiChain = true
      const query = `${name} price`
      const sources = await aiWebSearch(query, 3).catch(() => [])
      const est = await estimatePrice(query, location, sources)
      const sane = saneRange(est.estimatedLow, est.estimatedHigh, currency)
      if (sane) {
        candidates.push({ low: sane.estimatedLow, high: sane.estimatedHigh })
        estimateSummary = est.summary
        source = est.summary.startsWith('Rough guess') ? 'rough' : 'ai'
      }
    }
    if (candidates.length === 0) {
      // Instant keyword-table ballpark - keeps long lists fast and safe.
      const rough = roughEstimate(`${name} price`, currency)
      const sane = saneRange(rough.estimatedLow, rough.estimatedHigh, currency)
      if (sane) {
        candidates.push({ low: sane.estimatedLow, high: sane.estimatedHigh })
        source = 'rough'
      }
    }
  }

  const base: ItemBudget = {
    name,
    quantity,
    naturalCurrency: currency,
    low: 0,
    typical: 0,
    high: 0,
    perUnit: { low: 0, typical: 0, high: 0 },
    total: { low: 0, typical: 0, high: 0, recommended: 0 },
    itemLineLabel: quantity === 1 ? `${name} at a typical price` : `${quantity} × ${name} at a typical price`,
    cheapest: null,
    source,
    matched,
    noteParts: [],
    usedAiChain,
  }

  const unit = saneRange(
    candidates.length ? Math.min(...candidates.map((c) => c.low).filter((n): n is number => n !== null)) : null,
    candidates.length ? Math.max(...candidates.map((c) => c.high).filter((n): n is number => n !== null)) : null,
    currency
  )
  if (!unit || (unit.estimatedLow === null && unit.estimatedHigh === null)) {
    return { ...base, error: 'Could not work out a price range for this item. Try a clearer name.' }
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

  const totalLow = roundMoney(low * quantity)
  const totalTypical = roundMoney(typical * quantity)
  const totalHigh = roundMoney(high * quantity)
  const recommended = ceilMoney(totalHigh * 1.1)

  const parts: string[] = []
  if (matched.length > 0) parts.push(`${matched.length} local price post${matched.length !== 1 ? 's' : ''} on circub`)
  if (hint || (estimateSummary && source === 'ai')) parts.push('an AI price estimate')
  if (source === 'rough') parts.push('typical market prices (rough guess)')

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

  return {
    ...base,
    low,
    typical,
    high,
    perUnit: { low: roundMoney(low), typical: roundMoney(typical), high: roundMoney(high) },
    total: { low: totalLow, typical: totalTypical, high: totalHigh, recommended },
    cheapest,
    noteParts: parts,
  }
}

// Convert one item's numbers into the requested display currency.
function convertItem(item: ItemBudget, target: string): void {
  const cv = (n: number) => convertMoney(n, item.naturalCurrency, target)
  item.perUnit = {
    low: roundMoney(cv(item.perUnit.low) ?? item.perUnit.low),
    typical: roundMoney(cv(item.perUnit.typical) ?? item.perUnit.typical),
    high: roundMoney(cv(item.perUnit.high) ?? item.perUnit.high),
  }
  const convertedHigh = cv(item.total.high) ?? item.total.high
  item.total = {
    low: roundMoney(cv(item.total.low) ?? item.total.low),
    typical: roundMoney(cv(item.total.typical) ?? item.total.typical),
    high: roundMoney(convertedHigh),
    recommended: ceilMoney(convertedHigh * 1.1),
  }
  item.naturalCurrency = target
}

function buildVerdict(available: number | null, currency: string, totalTypical: number, recommended: number): BudgetResponse['verdict'] {
  if (available === null) return null
  if (available >= recommended) {
    return {
      state: 'ok',
      spare: roundMoney(available - recommended),
      shortBy: null,
      message: `Your ${fmtMoney(currency, available)} covers the safe budget with about ${fmtMoney(currency, roundMoney(available - recommended))} spare.`,
    }
  }
  if (available >= totalTypical) {
    return {
      state: 'tight',
      spare: null,
      shortBy: roundMoney(recommended - available),
      message: `Enough for typical prices, but about ${fmtMoney(currency, roundMoney(recommended - available))} short of the safe budget. Bargain, shop around, or trim the quantity.`,
    }
  }
  return {
    state: 'short',
    spare: null,
    shortBy: roundMoney(recommended - available),
    message: `Short by about ${fmtMoney(currency, roundMoney(recommended - available))} for the safe budget - typical spend is ${fmtMoney(currency, totalTypical)}.`,
  }
}

// --- Where to find these things (place suggestions) --------------------------

async function suggestPlaces(
  items: Array<{ name: string }>,
  location: EstimateLocation | null,
  matchedAcrossItems: LocalPriceMatch[],
  startedAt: number,
  allowAiGuide: boolean,
): Promise<NonNullable<BudgetResponse['places']>> {
  const places: NonNullable<BudgetResponse['places']> = []
  const seen = new Set<string>()

  // 1) Real clusters from circub price posts - ranked by post count.
  const groups = new Map<string, { label: string; count: number; items: Set<string>; best: LocalPriceMatch | null }>()
  for (const m of matchedAcrossItems) {
    const label = [m.city, m.country].filter(Boolean).join(', ') || m.country || 'Unknown place'
    const key = label.toLowerCase()
    const g = groups.get(key) ?? { label, count: 0, items: new Set<string>(), best: null }
    g.count += 1
    g.items.add(m.productName)
    if (!g.best || m.priceMin < g.best.priceMin) g.best = m
    groups.set(key, g)
  }
  for (const g of [...groups.values()].sort((a, b) => b.count - a.count).slice(0, 4)) {
    if (seen.has(g.label.toLowerCase())) continue
    seen.add(g.label.toLowerCase())
    places.push({
      name: g.label,
      detail: `${g.count} circub price post${g.count !== 1 ? 's' : ''} here - ${[...g.items].slice(0, 3).join(', ')}${g.best ? ` from ${fmtMoney(g.best.currency, g.best.priceMin)}` : ''}`,
      source: 'circub',
      forItems: [...g.items].slice(0, 4),
    })
  }

  // 2) AI local-shopping guide - ONE call, only for panel requests that ask
  // for it (the scan planner's auto-calc must stay fast) and while we have
  // time budget left.
  const placeName = locationLabel(location)
  const wantsAi = allowAiGuide && (!!location?.city || !!location?.country)
  if (wantsAi && Date.now() - startedAt < 35_000) {
    try {
      const prompt = `You are a local shopping guide. A user in ${placeName} wants to buy: ${items.map((i) => i.name).join(', ')}.\nList 3-4 CONCRETE places in or near ${placeName} where they could realistically find these items (specific markets, shopping streets/areas, malls, or the kind of shops known there). Be practical and specific to this location.\nRespond ONLY with a JSON object:\n{"places":[{"name":"place name","detail":"one short sentence: what to find there and why it fits"}]}`
      const raw = await llmText(prompt, 18_000)
      const parsed = raw ? parseLooseJson(raw) : null
      const list = Array.isArray(parsed?.places) ? (parsed!.places as Array<Record<string, unknown>>) : []
      for (const p of list.slice(0, 4)) {
        const name = String(p?.name ?? '').trim().slice(0, 80)
        const detail = String(p?.detail ?? '').trim().slice(0, 200)
        if (!name || seen.has(name.toLowerCase())) continue
        seen.add(name.toLowerCase())
        places.push({ name, detail: detail || 'Suggested by the local shopping guide.', source: 'ai', forItems: items.map((i) => i.name).slice(0, 4) })
      }
    } catch {
      // AI guide is best-effort - circub places and the generic hint remain.
    }
  }

  // 3) Generic fallback so the section is never empty when we know a place.
  if (allowAiGuide && places.length === 0 && (location?.city || location?.country)) {
    places.push({
      name: `Local markets in ${placeName}`,
      detail: 'No circub posts or guide entries yet for these items - try the busiest market area and ask vendors to compare offers.',
      source: 'generic',
      forItems: items.map((i) => i.name).slice(0, 4),
    })
  }

  return places
}

// ----------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  type Body = {
    itemName?: string
    items?: Array<{ name?: string; quantity?: number }>
    location?: EstimateLocation | null
    quantity?: number
    availableBudget?: number | null
    aiHint?: { estimatedLow?: number | null; estimatedHigh?: number | null; currency?: string | null } | null
    currency?: string | null
  }
  let body: Body
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }

  // Normalize the shopping list: items[] wins; legacy itemName+quantity maps
  // to a one-item list so existing callers (scan planner, older tests) get
  // byte-identical behavior.
  const rawItems: Array<{ name: string; quantity: number }> = Array.isArray(body.items) && body.items.length > 0
    ? body.items.slice(0, 8).map((it) => ({
        name: String(it?.name ?? '').trim().slice(0, 120),
        quantity: Math.min(99, Math.max(1, Math.round(Number(it?.quantity) || 1))),
      })).filter((it) => it.name)
    : []
  const legacyName = String(body.itemName ?? '').trim().slice(0, 120)
  if (rawItems.length === 0) {
    if (!legacyName) {
      return NextResponse.json({ error: 'An item name is required (type it or scan the product first).' }, { status: 400 })
    }
    rawItems.push({ name: legacyName, quantity: Math.min(99, Math.max(1, Math.round(Number(body.quantity) || 1))) })
  }

  const location = body.location ?? null
  const available =
    body.availableBudget === null || body.availableBudget === undefined
      ? null
      : Number.isFinite(Number(body.availableBudget)) && Number(body.availableBudget) >= 0
        ? Number(body.availableBudget)
        : null

  // Requested display currency (Birr, Dollar, ...) - only known codes pass.
  const requested = String(body.currency ?? '').trim().toUpperCase()
  const target = requested && ROUGH_FX_PER_USD[requested] ? requested : null

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
  const key = cacheKey(rawItems, location, available, hintSane, target)
  const cached = getCached(key)
  if (cached) return NextResponse.json(cached, { headers: { 'X-Cache': 'hit' } })

  const startedAt = Date.now()
  const fromPanel = Array.isArray(body.items)

  // --- 1) Price research per item (AI chain capped to ONE attempt/request) --
  let aiChainUsed = false
  const computed: ItemBudget[] = []
  for (const it of rawItems) {
    const allowChain = !aiChainUsed
    const res = await computeItem(it.name, it.quantity, location, fromPanel ? null : hintSane, allowChain)
    if (res.usedAiChain) aiChainUsed = true
    computed.push(res)
  }

  const failed = computed.filter((c) => c.error)
  const okItems = computed.filter((c) => !c.error)
  if (okItems.length === 0) {
    return NextResponse.json({ error: failed[0]?.error || 'Could not work out a price range for this item. Try a clearer name.' }, { status: 422 })
  }

  // --- 2) Currency: compute in natural currency, convert if requested --------
  const naturalFirst = okItems[0].naturalCurrency
  let displayCurrency = naturalFirst
  let converted = false
  if (target && target !== naturalFirst) {
    const probe = convertMoney(100, naturalFirst, target)
    if (probe !== null) {
      displayCurrency = target
      converted = true
      for (const it of okItems) convertItem(it, target)
    }
  }

  const isList = okItems.length > 1 || rawItems.length > 1

  // --- 3) Totals (single item keeps the exact legacy math) -------------------
  let totalLow: number, totalTypical: number, totalHigh: number, recommended: number
  let breakdown: BudgetResponse['breakdown']
  let note: string

  if (!isList) {
    const it = okItems[0]
    totalLow = it.total.low
    totalTypical = it.total.typical
    totalHigh = it.total.high
    recommended = it.total.recommended
    breakdown = [
      { label: it.itemLineLabel, amount: totalTypical },
      { label: 'Buffer for price swings and extras', amount: recommended - totalTypical },
    ]
    note = `Safe budget = priciest realistic total + 10% buffer, from ${it.noteParts.join(' + ') || 'market data'} for ${locationLabel(location)}.`
    if (converted) note += ` Converted to ${displayCurrency} at rough market rates.`
  } else {
    totalLow = roundMoney(okItems.reduce((s, it) => s + it.total.low, 0))
    totalTypical = roundMoney(okItems.reduce((s, it) => s + it.total.typical, 0))
    totalHigh = roundMoney(okItems.reduce((s, it) => s + it.total.high, 0))
    recommended = ceilMoney(totalHigh * 1.1)
    breakdown = [
      ...okItems.map((it) => ({ label: it.itemLineLabel, amount: it.total.typical })),
      { label: 'Buffer for price swings and extras', amount: recommended - totalTypical },
    ]
    const parts: string[] = []
    const localCount = okItems.filter((it) => it.source === 'local').length
    if (localCount > 0) parts.push(`local price posts on circub for ${localCount} item${localCount !== 1 ? 's' : ''}`)
    if (okItems.some((it) => it.source === 'ai')) parts.push('an AI price estimate')
    if (okItems.some((it) => it.source === 'rough')) parts.push('typical market prices (rough guess)')
    note = `Safe budget = priciest realistic total for the whole list + 10% buffer, from ${parts.join(' + ') || 'market data'} for ${locationLabel(location)}.`
    if (converted) note += ` Converted to ${displayCurrency} at rough market rates.`
    if (failed.length > 0) note += ` Could not estimate: ${failed.map((f) => f.name).join(', ')}.`
  }

  // --- 4) Verdict against the money the user has -----------------------------
  const verdict = buildVerdict(available, displayCurrency, totalTypical, recommended)

  // --- 5) Where to find these things ------------------------------------------
  const places = await suggestPlaces(okItems, location, okItems.flatMap((it) => it.matched), startedAt, fromPanel)

  const perUnitFirst = okItems[0].perUnit
  const result: BudgetResponse = {
    currency: displayCurrency,
    quantity: okItems.reduce((s, it) => s + it.quantity, 0),
    perUnit: isList
      ? {
          low: roundMoney(okItems.reduce((s, it) => s + it.perUnit.low, 0)),
          typical: roundMoney(okItems.reduce((s, it) => s + it.perUnit.typical, 0)),
          high: roundMoney(okItems.reduce((s, it) => s + it.perUnit.high, 0)),
        }
      : perUnitFirst,
    total: { low: totalLow, typical: totalTypical, high: totalHigh, recommended },
    cheapest: isList ? null : okItems[0].cheapest,
    breakdown,
    verdict,
    source: okItems.some((it) => it.source === 'local') ? 'local' : okItems.some((it) => it.source === 'ai') ? 'ai' : 'rough',
    note,
    lineItems: isList
      ? computed.map((it) => ({
          name: it.name,
          quantity: it.quantity,
          perUnit: it.perUnit,
          total: it.total,
          source: it.source,
          cheapest: it.cheapest,
          ...(it.error ? { error: it.error } : {}),
        }))
      : undefined,
    places: places.length > 0 ? places : undefined,
    requestedCurrency: target ?? null,
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

import { NextRequest, NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { db } from '@/lib/db'
import {
  identifyItem as aiIdentifyItem,
  webSearch as aiWebSearch,
  llmText,
  parseLooseJson,
} from '@/lib/ai-backends'

export const runtime = 'nodejs'
export const maxDuration = 60

// ============================================================================
// LOAD BALANCER / SURGE PROTECTION (per serverless instance)
// Vercel scales instances horizontally; these guards protect each instance
// and the upstream AI backends from being overwhelmed by many users:
//   1. Per-IP sliding-window rate limit (blocks abusive / runaway clients)
//   2. Concurrency limiter + small waiting queue (smooths bursts)
//   3. Exact-duplicate response cache (double-taps / identical retries)
//   4. Round-robin load balancing across upstream scan backends (direct ZAI
//      first, then proxies) with failover — spreads load for many users.
// ============================================================================

// --- 1) Per-IP rate limiting: max 15 scans per rolling 60s per IP ---
const RATE_LIMIT = { windowMs: 60_000, max: 15 }
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
  // Periodic sweep so the map cannot grow unbounded
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

// --- 2) Concurrency limiter with a bounded waiting queue ---
const MAX_CONCURRENT_SCANS = 4
const MAX_QUEUE_WAITERS = 12
const QUEUE_TIMEOUT_MS = 10_000
let activeScans = 0
const slotWaiters: Array<{
  resolve: () => void
  reject: (e: Error) => void
  timer: NodeJS.Timeout
}> = []

async function acquireScanSlot(): Promise<void> {
  if (activeScans < MAX_CONCURRENT_SCANS) {
    activeScans++
    return
  }
  if (slotWaiters.length >= MAX_QUEUE_WAITERS) {
    throw new Error('QUEUE_FULL')
  }
  await new Promise<void>((resolve, reject) => {
    const entry = {
      resolve,
      reject,
      timer: null as unknown as NodeJS.Timeout,
    }
    entry.timer = setTimeout(() => {
      const i = slotWaiters.indexOf(entry)
      if (i !== -1) slotWaiters.splice(i, 1)
      reject(new Error('QUEUE_TIMEOUT'))
    }, QUEUE_TIMEOUT_MS)
    slotWaiters.push(entry)
  })
  // Resolved by releaseScanSlot — the slot was transferred to us, so the
  // active count is unchanged.
}

function releaseScanSlot(): void {
  const next = slotWaiters.shift()
  if (next) {
    clearTimeout(next.timer)
    next.resolve()
  } else {
    activeScans = Math.max(0, activeScans - 1)
  }
}

// --- 3) Exact-duplicate response cache (30s TTL, guards double-taps) ---
const RESULT_CACHE_TTL_MS = 30_000
const RESULT_CACHE_MAX = 200
const resultCache = new Map<string, { result: ScanResult; expires: number }>()

function resultCacheKey(image: string, location: ScanLocation | null): string {
  return crypto
    .createHash('sha256')
    .update(image)
    .update(JSON.stringify(location ?? {}))
    .digest('hex')
}

function getCachedResult(key: string): ScanResult | null {
  const hit = resultCache.get(key)
  if (!hit) return null
  if (Date.now() > hit.expires) {
    resultCache.delete(key)
    return null
  }
  return hit.result
}

function storeCachedResult(key: string, result: ScanResult): void {
  if (resultCache.size >= RESULT_CACHE_MAX) {
    // Drop the oldest entries (Map preserves insertion order)
    const drop = resultCache.size - RESULT_CACHE_MAX + 1
    let i = 0
    for (const k of resultCache.keys()) {
      resultCache.delete(k)
      if (++i >= drop) break
    }
  }
  resultCache.set(key, { result, expires: Date.now() + RESULT_CACHE_TTL_MS })
}

// --- 4) Round-robin load balancer across optional upstream scan backends ---
// Set ZAI_PROXY_URL / ZAI_PROXY_URLS (comma-separated) to add backends.
// The default is EMPTY on purpose: the previously baked-in preview URL was an
// ephemeral sandbox dev-server that is dead in production and only wasted
// seconds of every failed scan.
const SCAN_PROXY_URLS: string[] = Array.from(
  new Set(
    (process.env.ZAI_PROXY_URLS || process.env.ZAI_PROXY_URL || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  )
)
let scanBackendIndex = 0
function nextScanBackend(): string {
  const url = SCAN_PROXY_URLS[scanBackendIndex % SCAN_PROXY_URLS.length]
  scanBackendIndex++
  return url
}

// Currency mapping
const CURRENCY_BY_COUNTRY_CODE: Record<string, string> = {
  US: 'USD', GB: 'GBP', ET: 'ETB', KE: 'KES', IN: 'INR', CN: 'CNY',
  JP: 'JPY', DE: 'EUR', FR: 'EUR', IT: 'EUR', NG: 'NGN', EG: 'EGP',
  ZA: 'ZAR', BR: 'BRL', CA: 'CAD', AU: 'AUD', AE: 'AED', SA: 'SAR',
  TH: 'THB', ID: 'IDR', MY: 'MYR', SG: 'SGD', PH: 'PHP', VN: 'VND',
  UG: 'UGX', TZ: 'TZS', RW: 'RWF', GH: 'GHS', TR: 'TRY', MX: 'MXN',
}
const CURRENCY_BY_COUNTRY_NAME: Record<string, string> = {
  'united states': 'USD', 'united kingdom': 'GBP', ethiopia: 'ETB',
  kenya: 'KES', india: 'INR', china: 'CNY', japan: 'JPY',
  germany: 'EUR', france: 'EUR', italy: 'EUR', nigeria: 'NGN',
  egypt: 'EGP', 'south africa': 'ZAR', brazil: 'BRL', canada: 'CAD',
  australia: 'AUD', 'saudi arabia': 'SAR', turkey: 'TRY',
}
function localCurrencyForLocation(location: { country?: string | null; countryCode?: string | null }): string {
  if (location.countryCode) {
    const c = CURRENCY_BY_COUNTRY_CODE[location.countryCode.toUpperCase()]
    if (c) return c
  }
  if (location.country) {
    const c = CURRENCY_BY_COUNTRY_NAME[location.country.toLowerCase()]
    if (c) return c
  }
  return 'USD'
}

// ZAI client construction moved to @/lib/zai-config and the provider chains
// (vision / search / text) to @/lib/ai-backends — multi-provider failover that
// works from BOTH inside the z.ai platform AND from Vercel (whose network
// cannot reach the platform's private internal API).

export interface ScanLocation {
  city?: string | null
  country?: string | null
  countryCode?: string | null
  region?: string | null
}

export interface ScanResult {
  item: { name: string; brand?: string | null; category?: string | null; description: string }
  price: { estimatedLow: number | null; estimatedHigh: number | null; currency: string | null; summary: string } | null
  sources: Array<{ title: string; url: string; snippet: string; host: string; date?: string | null }>
  location: ScanLocation | null
  rawQuery: string
  localPrices: Array<{
    id: string; productName: string; category: string; currency: string
    priceMin: number; priceMax: number; city: string | null; country: string
    helpfulCount: number; authorName: string; authorVerifiedLocal: boolean
  }>
}

function extractJson(text: string): unknown | null {
  return parseLooseJson(text)
}

// ---------------------------------------------------------------------------
// Failure classification for the honest error mapping below. The provider
// chains in ai-backends already do retries/failover internally; here we only
// decide WHICH honest message the client deserves.
// ---------------------------------------------------------------------------
function isRateLimitError(e: unknown): boolean {
  return String((e as Error)?.message || e).includes('429')
}

interface PriceEstimate {
  estimatedLow: number | null; estimatedHigh: number | null; currency: string | null; summary: string
}

async function estimatePrice(searchQuery: string, location: ScanLocation | null, sources: ScanResult['sources']): Promise<PriceEstimate> {
  const locationName = location?.city ? `${location.city}${location.country ? ', ' + location.country : ''}` : location?.country || 'worldwide'
  const localCurrency = localCurrencyForLocation(location || {})

  let prompt: string
  if (sources.length > 0) {
    const sourcesBlock = sources.slice(0, 8).map((s, i) => `${i + 1}. ${s.title}\n${s.snippet}\n(${s.host})`).join('\n\n')
    prompt = `You are a price-analysis assistant. Below are web search results for the query:\n"${searchQuery}"\nintended to be purchased in/near: ${locationName}.\n\nSearch results:\n${sourcesBlock}\n\nTask: estimate the current realistic retail price range for this product in that location.\n\nThe local currency in ${locationName} is ${localCurrency}. Express the price in ${localCurrency}.\n\nRespond ONLY with a JSON object:\n{"estimatedLow":<number>,"estimatedHigh":<number>,"currency":"${localCurrency}","summary":"one or two sentences in ${localCurrency}."}`
  } else {
    prompt = `You are a price-analysis assistant. No live web results are available right now.\nEstimate from general knowledge a realistic retail price range for "${searchQuery}" purchased in/near ${locationName}.\nThe local currency is ${localCurrency}. Be conservative and clearly approximate.\n\nRespond ONLY with a JSON object:\n{"estimatedLow":<number>,"estimatedHigh":<number>,"currency":"${localCurrency}","summary":"one or two sentences in ${localCurrency}, starting with 'Approximate (from AI knowledge):'."}`
  }

  // ALWAYS return numbers — the UI must never say "Price unavailable".
  // Tier 1: full analysis prompt (JSON). Tier 2: minimal numeric prompt.
  // Tier 3: regex any price amounts out of the raw model text.
  // Tier 4: keyword-based rough range (clearly labeled as a rough guess).
  const rawTexts: string[] = []

  // --- Tier 1 + 2: LLM attempts -------------------------------------------
  const narrowPrompt = `What does "${searchQuery}" typically cost in ${locationName}? Answer in ${localCurrency} only.\nReply with ONLY a range in the exact form LOW-HIGH (example: 45-120). No words, no currency symbol.`
  for (const p of [prompt, narrowPrompt]) {
    try {
      const content = await llmText(p, p === prompt ? 22_000 : 15_000)
      if (!content) continue
      rawTexts.push(content)
      const parsed = extractJson(content) as Partial<PriceEstimate> & { low?: unknown; high?: unknown } | null
      const low = pickNumber(parsed?.estimatedLow ?? parsed?.low)
      const high = pickNumber(parsed?.estimatedHigh ?? parsed?.high)
      const est = saneRange(low, high, localCurrency)
      if (est) {
        const summary = p === prompt && parsed?.summary
          ? String(parsed.summary).slice(0, 600)
          : `Estimated range for "${searchQuery}" in ${locationName} (approximate).`
        return { ...est, summary }
      }
      // JSON had no numbers — maybe the text still contains an amount (Tier 3)
      const est3 = saneRange(...amountsFromText(content, localCurrency) as [number | null, number | null], localCurrency)
      if (est3) return { ...est3, summary: `Approximate price for "${searchQuery}" in ${locationName}.` }
    } catch { /* next tier */ }
  }

  // --- Tier 3 (again) on any raw text we collected --------------------------
  for (const t of rawTexts) {
    const est = saneRange(...amountsFromText(t, localCurrency) as [number | null, number | null], localCurrency)
    if (est) return { ...est, summary: `Approximate price for "${searchQuery}" in ${locationName}.` }
  }

  // --- Tier 4: keyword rough range (AI totally unreachable) -----------------
  return roughEstimate(searchQuery, localCurrency)
}

function pickNumber(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v.replace(/[,\s]/g, '')) : typeof v === 'number' ? v : NaN
  return Number.isFinite(n) && n > 0 ? n : null
}

// Pull plausible price amounts out of free text ("about 150 to 300 ETB",
// "$25", "ETB 1,200-1,500", "50-200").
function amountsFromText(text: string, currency: string): [number | null, number | null] {
  if (!text) return [null, null]
  const sym = currency === 'USD' ? '\\$' : currency
  // 1) explicit range "120-1500" or "120 to 1500" (optionally currency-marked)
  const range = text.match(new RegExp(`${sym}?\\s*([\\d][\\d,\\.]{0,9})\\s*(?:-|–|—|to|~)\\s*\\$?\\s*([\\d][\\d,\\.]{0,9})`, 'i'))
  if (range) {
    const a = pickNumber(range[1])
    const b = pickNumber(range[2])
    if (a && b) return [a, b]
  }
  // 2) any currency-marked amounts
  const marked = [...text.matchAll(new RegExp(`${sym}\\s*([\\d][\\d,\\.]{0,9})`, 'gi'))].map((m) => pickNumber(m[1])).filter((n): n is number => n !== null)
  if (marked.length >= 2) return [Math.min(...marked), Math.max(...marked)]
  if (marked.length === 1) return [marked[0], null]
  return [null, null]
}

function saneRange(low: number | null, high: number | null, currency: string): PriceEstimate | null {
  if (low === null && high === null) return null
  if (low !== null && high !== null && low > high) [low, high] = [high, low]
  // Discard absurd values (typos like 0.0001 or 999999999)
  const cap = 50_000_000
  if (low !== null && (low < 0.01 || low > cap)) low = null
  if (high !== null && (high < 0.01 || high > cap)) high = null
  if (low === null && high === null) return null
  const round = (n: number) => (n >= 1000 ? Math.round(n / 50) * 50 : n >= 100 ? Math.round(n / 5) * 5 : Math.round(n * 100) / 100)
  return {
    estimatedLow: low !== null ? round(low) : null,
    estimatedHigh: high !== null ? round(high) : null,
    currency,
    summary: '',
  }
}

// Typical USD price bands for generic product keywords + rough FX — the final
// safety net so the user ALWAYS sees an estimate (labeled as a rough guess).
const ROUGH_USD_RANGES: Array<[RegExp, number, number]> = [
  [/iphone|smart ?phone|\bphone\b|galaxy|pixel|redmi|xiaomi|tecno|infinix/i, 60, 1200],
  [/laptop|macbook|notebook|thinkpad|chromebook/i, 250, 2000],
  [/\btv\b|television|monitor|projector/i, 90, 900],
  [/headphone|ear ?bud|air ?pod|speaker|\bbuds\b/i, 10, 350],
  [/watch|smart ?watch|fitbit/i, 20, 700],
  [/camera|\blens\b|dslr|tripod/i, 100, 2500],
  [/shoe|sneaker|boot|sandal|heel/i, 15, 200],
  [/bag|backpack|hand ?bag|luggage|wallet/i, 15, 300],
  [/chip|soda|\bcola\b|biscuit|chocolate|snack|bread|juice|water|milk|coffee|tea|\brice\b|\boil\b|pasta|flour|sugar|\begg/i, 0.5, 15],
  [/shampoo|soap|cream|lotion|detergent|tooth ?paste|deodorant|diaper/i, 1, 25],
  [/shirt|dress|jacket|jeans|trouser|clothes|t-?shirt|hoodie/i, 8, 120],
  [/\bbook\b|pen|pencil|notebook|eraser/i, 1, 40],
  [/toy|game|console|playstation|xbox|nintendo/i, 20, 600],
  [/bike|bicycle|scooter|motorcycle|helmet/i, 50, 3000],
  [/tire|tyre|battery|engine|car ?part/i, 30, 800],
]
const ROUGH_FX_PER_USD: Record<string, number> = {
  USD: 1, ETB: 125, KES: 129, NGN: 1500, UGX: 3700, TZS: 2600, GHS: 12, ZAR: 18,
  EUR: 0.9, GBP: 0.78, INR: 88, CNY: 7.1, AED: 3.67, SAR: 3.75, TRY: 41, BRL: 5.4,
  EGP: 48, JPY: 150, CAD: 1.37, AUD: 1.5, SGD: 1.28, MYR: 4.2, THB: 32, IDR: 16000,
  PHP: 58, VND: 25500, RWF: 1400, MXN: 18,
}

function roughEstimate(searchQuery: string, currency: string): PriceEstimate {
  const hit = ROUGH_USD_RANGES.find(([re]) => re.test(searchQuery))
  const [usdLow, usdHigh] = hit ? [hit[1], hit[2]] : [2, 250]
  const fx = ROUGH_FX_PER_USD[currency] || 1
  const roundRough = (n: number) => (n >= 1000 ? Math.round(n / 100) * 100 : n >= 100 ? Math.round(n / 10) * 10 : n)
  return {
    estimatedLow: roundRough(usdLow * fx),
    estimatedHigh: roundRough(usdHigh * fx),
    currency,
    summary: `Rough guess from typical market prices — live AI pricing was unreachable for "${searchQuery}". Treat as a wide ballpark only.`,
  }
}

export async function POST(req: NextRequest) {
  let body: { image?: string; location?: ScanLocation | null }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }

  const image = body.image
  if (!image || typeof image !== 'string' || !image.startsWith('data:image')) {
    return NextResponse.json({ error: 'A base64 data:image is required' }, { status: 400 })
  }
  const location = body.location ?? null

  // --- Guard 1: per-IP rate limit (protects against runaway clients) ---
  const ip = clientIpFrom(req)
  const rl = checkRateLimit(ip)
  if (!rl.ok) {
    return NextResponse.json(
      { error: `You're scanning very fast — please wait ${rl.retryAfterSec}s and try again.` },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } }
    )
  }

  // --- Guard 2: exact-duplicate response cache (double-taps / retries) ---
  const cacheKey = resultCacheKey(image, location)
  const cached = getCachedResult(cacheKey)
  if (cached) {
    return NextResponse.json(cached, { headers: { 'X-Cache': 'hit' } })
  }

  // --- Guard 3: concurrency limiter + bounded queue (smooths bursts) ---
  try {
    await acquireScanSlot()
  } catch (e) {
    const queueFull = e instanceof Error && e.message === 'QUEUE_FULL'
    return NextResponse.json(
      {
        error: queueFull
          ? 'Scanner is very busy right now. Please try again in a few seconds.'
          : 'Scanner is busy — your scan timed out waiting in the queue. Please try again.',
      },
      { status: queueFull ? 429 : 503, headers: queueFull ? { 'Retry-After': '5' } : undefined }
    )
  }

  let directWasRateLimited = false
  try {
    // Step 1: identify the item (multi-provider vision chain)
    const identified = await aiIdentifyItem(image)

    // Step 2: Run web search (multi-provider chain) + DB search IN PARALLEL
    const locationQualifier = location?.city ? `in ${location.city}${location.country ? ' ' + location.country : ''}` : location?.country ? `in ${location.country}` : ''
    const query = locationQualifier ? `${identified.searchQuery} ${locationQualifier} price` : `${identified.searchQuery} price`

    const webSearchPromise = aiWebSearch(query, 3).catch(() => [] as ScanResult['sources'])

    const dbSearchPromise = (async (): Promise<ScanResult['localPrices']> => {
      try {
        const searchTerms = [identified.name, identified.searchQuery, identified.brand].filter(Boolean).flatMap((s) => {
          const words = s.toLowerCase().split(/\s+/).filter((w) => w.length > 2)
          return [s, ...words]
        })
        const orClauses = searchTerms.flatMap((term) => [{ productName: { contains: term } }, { category: { contains: term } }])
        const allPosts = await db.localPricePost.findMany({
          // caseInsensitiveWhere: production Postgres `contains` is case-sensitive
          where: caseInsensitiveWhere({ OR: orClauses }),
          select: { id: true, productName: true, category: true, currency: true, priceMin: true, priceMax: true, city: true, country: true, helpfulCount: true, author: { select: { name: true, verifiedLocal: true } } },
          take: 15, orderBy: { helpfulCount: 'desc' },
        })
        const matches = allPosts.filter((p) => searchTerms.some((term) => p.productName.toLowerCase().includes(term.toLowerCase()) || p.category.toLowerCase().includes(term.toLowerCase())))
        const locCountry = location?.country?.toLowerCase()
        const locCity = location?.city?.toLowerCase()
        const scored = matches.map((p) => {
          let score = 1
          if (locCountry && p.country.toLowerCase() === locCountry) score = 2
          if (locCity && p.city && p.city.toLowerCase() === locCity) score = 3
          return { p, score }
        }).sort((a, b) => b.score - a.score)
        return scored.slice(0, 6).map(({ p }) => ({
          id: p.id, productName: p.productName, category: p.category, currency: p.currency,
          priceMin: p.priceMin, priceMax: p.priceMax, city: p.city, country: p.country,
          helpfulCount: p.helpfulCount, authorName: p.author?.name || 'Unknown',
          authorVerifiedLocal: p.author?.verifiedLocal || false,
        }))
      } catch (e) { console.error('[/api/scan] DB search failed:', e); return [] }
    })()

    // Wait for both — parallel execution saves ~2-3s
    const [sources, localPrices] = await Promise.all([webSearchPromise, dbSearchPromise])

    // Step 3: ONLY estimate price if no local prices (saves 3-5s when locals exist)
    let finalPrice: PriceEstimate | null = null
    if (localPrices.length > 0) {
      const mins = localPrices.map((p) => p.priceMin)
      const maxs = localPrices.map((p) => p.priceMax)
      finalPrice = {
        estimatedLow: Math.min(...mins), estimatedHigh: Math.max(...maxs),
        currency: localPrices[0].currency,
        summary: `Verified by ${localPrices.length} local${localPrices.length !== 1 ? 's' : ''} in ${localPrices[0].city || localPrices[0].country}.`,
      }
    } else {
      // No local prices — estimate from web search
      finalPrice = await estimatePrice(query, location, sources)
      if (finalPrice && finalPrice.estimatedLow !== null) { finalPrice.currency = localCurrencyForLocation(location || {}) }
    }

    const result: ScanResult = {
      item: { name: identified.name, brand: identified.brand ?? null, category: identified.category ?? null, description: identified.description },
      price: finalPrice, sources, location, rawQuery: query, localPrices,
    }
    storeCachedResult(cacheKey, result)
    return NextResponse.json(result)
  } catch (err) {
    const aggMessage = err instanceof Error ? err.message : String(err)
    directWasRateLimited = isRateLimitError(aggMessage) || /quota/i.test(aggMessage)
    console.error('[/api/scan] all AI providers failed:', aggMessage)

    // ---- ROUND-ROBIN PROXY FAILOVER (optional upstream scan backends) ----
    // Only runs when ZAI_PROXY_URLS is configured. Each backend is tried once
    // per pass in round-robin order; a second pass catches transient failures.
    if (SCAN_PROXY_URLS.length > 0) {
      const failoverRounds = directWasRateLimited ? 1 : 2
      for (let round = 0; round < failoverRounds; round++) {
        if (round > 0) await new Promise((r) => setTimeout(r, 1500))
        const tried = new Set<string>()
        for (let i = 0; i < SCAN_PROXY_URLS.length; i++) {
          const backendUrl = nextScanBackend()
          if (tried.has(backendUrl)) continue
          tried.add(backendUrl)
          try {
            const proxyRes = await fetch(backendUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ image, location }),
              signal: AbortSignal.timeout(20000),
            })
            if (proxyRes.ok) {
              const proxyData = await proxyRes.json()
              storeCachedResult(cacheKey, proxyData as ScanResult)
              return NextResponse.json(proxyData)
            }
            const proxyErrText = await proxyRes.text().catch(() => '')
            console.error(`[/api/scan] backend ${backendUrl} failed:`, proxyRes.status, proxyErrText.slice(0, 200))
          } catch (proxyErr) {
            console.error(`[/api/scan] backend ${backendUrl} fetch failed:`, proxyErr)
          }
        }
      }
    }
    // All providers failed — report honestly. The client holds the captured
    // photo and auto-retries (8s/12s/18s), so a transient outage recovers by
    // itself without the user re-tapping.
    if (directWasRateLimited) {
      return NextResponse.json(
        { error: 'The AI service is rate-limited right now (quota). Scanning should work again in a few minutes — please try again.' },
        { status: 429, headers: { 'Retry-After': '60' } }
      )
    }
    return NextResponse.json(
      { error: 'The AI service is unreachable right now. Your photo is kept — the scan retries automatically in a few seconds.' },
      { status: 503 }
    )
  } finally {
    releaseScanSlot()
  }
}

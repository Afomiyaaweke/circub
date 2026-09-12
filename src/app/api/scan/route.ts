import { NextRequest, NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { db } from '@/lib/db'
import { getZaiClient } from '@/lib/zai-config'

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

// --- 4) Round-robin load balancer across upstream scan backends ---
// Configure extra backends with ZAI_PROXY_URL / ZAI_PROXY_URLS (comma-separated).
const SCAN_PROXY_URLS: string[] = Array.from(
  new Set(
    (
      process.env.ZAI_PROXY_URLS ||
      process.env.ZAI_PROXY_URL ||
      'https://preview-chat-4d8415c1-2b4e-4a0c-985e-795e389c285c.space-z.ai/api/scan'
    )
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

// ZAI client construction moved to @/lib/zai-config — it resolves config
// (env vars -> config files -> baked fallback) and builds the SDK client
// directly via its exported class. This avoids fragile /tmp config-file
// writes and process.cwd() monkey-patching on serverless (Vercel).

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
  if (!text) return null
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenceMatch ? fenceMatch[1] : text
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  try { return JSON.parse(candidate.slice(start, end + 1)) } catch { return null }
}

// ---------------------------------------------------------------------------
// Rate-limit resilience: the upstream AI platform throttles with 429s.
// Burst throttles clear within seconds, so retry with backoff before giving
// up — this converts most transient 429s into successful scans.
// ---------------------------------------------------------------------------
const ZAI_RETRY_DELAYS_MS = [2000, 5000]

function isRateLimitError(e: unknown): boolean {
  return String((e as Error)?.message || e).includes('429')
}

async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  let lastErr: unknown
  for (let attempt = 0; attempt <= ZAI_RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) {
      console.warn(`[/api/scan] ${label} rate-limited, retry ${attempt}/${ZAI_RETRY_DELAYS_MS.length} in ${ZAI_RETRY_DELAYS_MS[attempt - 1]}ms`)
      await new Promise((r) => setTimeout(r, ZAI_RETRY_DELAYS_MS[attempt - 1]))
    }
    const attemptStart = Date.now()
    try {
      return await fn()
    } catch (e) {
      lastErr = e
      if (!isRateLimitError(e)) throw e
      // Instant hard block (<1.5s): an upstream quota gate rejects immediately.
      // Backing off inside THIS request cannot help — fail fast so the client
      // can retry on its own (longer) schedule instead of holding a scan slot.
      if (Date.now() - attemptStart < 1500) throw e
      // Slow 429 (real processing then throttle) — transient burst limit,
      // backoff retries are worth it, continue the loop.
    }
  }
  throw lastErr
}

interface IdentifiedItem {
  name: string; brand?: string | null; category?: string | null
  description: string; searchQuery: string
}

async function identifyItem(zai: any, imageDataUrl: string): Promise<IdentifiedItem> {
  const prompt = `Identify the main product in this image. Respond ONLY with JSON: {"name":"product name","brand":null,"category":"category","description":"one sentence","searchQuery":"search query for price lookup"}. If no product, use name "Unknown item".`
  const response = await withRetry<any>(() => zai.chat.completions.createVision({
    messages: [{ role: 'user', content: [
      { type: 'text', text: prompt },
      { type: 'image_url', image_url: { url: imageDataUrl } },
    ]}],
    thinking: { type: 'disabled' },
  }), 'identify(vision)')
  const content = response.choices?.[0]?.message?.content ?? ''
  const parsed = extractJson(content) as IdentifiedItem | null
  if (parsed && parsed.name) {
    return {
      name: String(parsed.name).slice(0, 120),
      brand: parsed.brand ? String(parsed.brand).slice(0, 80) : null,
      category: parsed.category ? String(parsed.category).slice(0, 60) : null,
      description: parsed.description ? String(parsed.description).slice(0, 400) : '',
      searchQuery: parsed.searchQuery ? String(parsed.searchQuery).slice(0, 200) : String(parsed.name),
    }
  }
  const fallbackName = content.trim().split('\n')[0].slice(0, 120) || 'Unknown item'
  return { name: fallbackName, brand: null, category: null, description: content.slice(0, 400), searchQuery: fallbackName }
}

interface PriceEstimate {
  estimatedLow: number | null; estimatedHigh: number | null; currency: string | null; summary: string
}

async function estimatePrice(zai: any, searchQuery: string, location: ScanLocation | null, sources: ScanResult['sources']): Promise<PriceEstimate | null> {
  if (sources.length === 0) return null
  const locationName = location?.city ? `${location.city}${location.country ? ', ' + location.country : ''}` : location?.country || 'worldwide'
  const localCurrency = localCurrencyForLocation(location || {})
  const sourcesBlock = sources.slice(0, 8).map((s, i) => `${i + 1}. ${s.title}\n${s.snippet}\n(${s.host})`).join('\n\n')
  const prompt = `You are a price-analysis assistant. Below are web search results for the query:\n"${searchQuery}"\nintended to be purchased in/near: ${locationName}.\n\nSearch results:\n${sourcesBlock}\n\nTask: estimate the current realistic retail price range for this product in that location.\n\nThe local currency in ${locationName} is ${localCurrency}. Express the price in ${localCurrency}.\n\nRespond ONLY with a JSON object:\n{"estimatedLow":<number or null>,"estimatedHigh":<number or null>,"currency":"${localCurrency}","summary":"one or two sentences in ${localCurrency}."}`
  const response = await withRetry<any>(() => zai.chat.completions.create({
    messages: [{ role: 'user', content: prompt }],
    thinking: { type: 'disabled' },
  }), 'estimate-price')
  const content = response.choices?.[0]?.message?.content ?? ''
  const parsed = extractJson(content) as PriceEstimate | null
  if (parsed) {
    return {
      estimatedLow: typeof parsed.estimatedLow === 'number' ? parsed.estimatedLow : null,
      estimatedHigh: typeof parsed.estimatedHigh === 'number' ? parsed.estimatedHigh : null,
      currency: localCurrency,
      summary: parsed.summary ? String(parsed.summary).slice(0, 600) : '',
    }
  }
  return { estimatedLow: null, estimatedHigh: null, currency: localCurrency, summary: content.slice(0, 600) }
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
    const { client: zai } = await getZaiClient()

    // Step 1: identify the item
    const identified = await identifyItem(zai, image)

    // Step 2: Run web search + DB search IN PARALLEL (saves ~2-3s)
    const locationQualifier = location?.city ? `in ${location.city}${location.country ? ' ' + location.country : ''}` : location?.country ? `in ${location.country}` : ''
    const query = locationQualifier ? `${identified.searchQuery} ${locationQualifier} price` : `${identified.searchQuery} price`

    const webSearchPromise = withRetry(() => zai.functions.invoke('web_search', { query, num: 3 }), 'web-search').then((searchResults: unknown) => {
      return Array.isArray(searchResults)
        ? searchResults.filter((r: unknown): r is Record<string, unknown> => typeof r === 'object' && r !== null).slice(0, 3).map((r) => ({
            title: String(r.name ?? r.title ?? 'Untitled'), url: String(r.url ?? ''),
            snippet: String(r.snippet ?? ''), host: String(r.host_name ?? r.host ?? ''),
            date: r.date ? String(r.date) : null,
          }))
        : []
    }).catch(() => [] as ScanResult['sources'])

    const dbSearchPromise = (async (): Promise<ScanResult['localPrices']> => {
      try {
        const searchTerms = [identified.name, identified.searchQuery, identified.brand].filter(Boolean).flatMap((s) => {
          const words = s.toLowerCase().split(/\s+/).filter((w) => w.length > 2)
          return [s, ...words]
        })
        const orClauses = searchTerms.flatMap((term) => [{ productName: { contains: term } }, { category: { contains: term } }])
        const allPosts = await db.localPricePost.findMany({
          where: { OR: orClauses },
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
      finalPrice = await estimatePrice(zai, query, location, sources)
      if (finalPrice && finalPrice.estimatedLow !== null) { finalPrice.currency = localCurrencyForLocation(location || {}) }
    }

    const result: ScanResult = {
      item: { name: identified.name, brand: identified.brand ?? null, category: identified.category ?? null, description: identified.description },
      price: finalPrice, sources, location, rawQuery: query, localPrices,
    }
    storeCachedResult(cacheKey, result)
    return NextResponse.json(result)
  } catch (err) {
    directWasRateLimited = isRateLimitError(err)
    console.error('[/api/scan] direct ZAI call failed, trying proxy backends:', err instanceof Error ? err.message : err)

    // ---- ROUND-ROBIN PROXY FAILOVER (load balancing across backends) ----
    // Each configured backend is tried once per pass, in round-robin order,
    // so retries spread across backends instead of hammering one. A second
    // pass (after a short cooldown) catches transient failures — but when the
    // upstream hard-blocked us with an instant quota 429, every backend shares
    // the same account, so a single pass is enough (saves ~4s of dead time).
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
    // All backends failed — report honestly: if the upstream was 429-ing the
    // whole time, tell the user it's a temporary quota throttle, not a bug.
    if (directWasRateLimited) {
      return NextResponse.json(
        { error: 'The AI service is rate-limited right now (quota). Scanning should work again in a few minutes — please try again.' },
        { status: 429, headers: { 'Retry-After': '60' } }
      )
    }
    return NextResponse.json(
      { error: 'Scanner is temporarily unavailable. Please try again.' },
      { status: 503 }
    )
  } finally {
    releaseScanSlot()
  }
}

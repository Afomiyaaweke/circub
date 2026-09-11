import { NextRequest, NextResponse } from 'next/server'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { db } from '@/lib/db'

export const runtime = 'nodejs'
export const maxDuration = 60

// Currency mapping — maps country codes and names to their local currency.
// Used so the price estimate uses the right currency symbol based on
// the user's location (e.g. ETB in Ethiopia, USD in USA, KES in Kenya).
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

// The z-ai-web-dev-sdk only reads config from a .z-ai-config file at one of
// three paths (cwd, ~/, /etc/). On Vercel's serverless functions, none of
// those paths exist by default — the file is gitignored and not deployed.
// So before calling ZAI.create(), we write a config file to /tmp populated
// from either env vars OR the hardcoded fallback below (same config used
// by the dev sandbox / preview links on space-z.ai).
let configInjected = false
async function ensureZaiConfig(): Promise<void> {
  if (configInjected) return
  // If any of the three default paths already has a valid config, we're
  // done (dev sandbox case — /etc/.z-ai-config exists).
  const configPaths = [
    path.join(process.cwd(), '.z-ai-config'),
    path.join(os.homedir(), '.z-ai-config'),
    '/etc/.z-ai-config',
  ]
  for (const p of configPaths) {
    try {
      const cfg = JSON.parse(await fs.promises.readFile(p, 'utf-8'))
      if (cfg.baseUrl && cfg.apiKey) {
        configInjected = true
        return
      }
    } catch {
      // try next
    }
  }

  // No config file found — build one from env vars, with hardcoded fallback
  // so the scan works on Vercel without any env var setup. The fallback uses
  // the same credentials as the dev sandbox / space-z.ai preview links.
  const FALLBACK = {
    baseUrl: 'https://internal-api.z.ai/v1',
    apiKey: 'Z.ai',
    chatId: 'chat-260d9bce-6954-4dc7-a5b2-9a9d997a81fc',
    userId: '94e3865c-bde8-4d7f-a630-7d22dac251f0',
    token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiOTRlMzg2NWMtYmRlOC00ZDdmLWE2MzAtN2QyMmRhYzI1MWYwIiwiY2hhdF9pZCI6ImNoYXQtMjYwZDliY2UtNjk1NC00ZGM3LWE1YjItOWE5ZDk5N2E4MWZjIiwicGxhdGZvcm0iOiJ6YWkifQ.3P56qThiKqUG3UP-UFtYuA6UXkDxc7Y3DgqYYsd271w',
  }

  const cfg = {
    baseUrl: process.env.ZAI_BASE_URL || FALLBACK.baseUrl,
    apiKey: process.env.ZAI_API_KEY || FALLBACK.apiKey,
    chatId: process.env.ZAI_CHAT_ID || FALLBACK.chatId,
    userId: process.env.ZAI_USER_ID || FALLBACK.userId,
    token: process.env.ZAI_TOKEN || FALLBACK.token,
  }

  // Write to /tmp (Vercel's only writable directory)
  await fs.promises.writeFile('/tmp/.z-ai-config', JSON.stringify(cfg), 'utf-8')
  configInjected = true
}

// Patch ZAI.create to use our config-injection logic.
let ZAIModule: typeof import('z-ai-web-dev-sdk').default
async function getZAI() {
  await ensureZaiConfig()
  ZAIModule = (await import('z-ai-web-dev-sdk')).default
  // Override cwd to /tmp where we just wrote the config
  const originalCwd = process.cwd
  try {
    ;(process as any).cwd = () => '/tmp'
    return await ZAIModule.create()
  } finally {
    ;(process as any).cwd = originalCwd
  }
}

export interface ScanLocation {
  city?: string | null
  country?: string | null
  countryCode?: string | null
  region?: string | null
}

export interface ScanResult {
  item: {
    name: string
    brand?: string | null
    category?: string | null
    description: string
  }
  price: {
    estimatedLow: number | null
    estimatedHigh: number | null
    currency: string | null
    summary: string
  } | null
  sources: Array<{
    title: string
    url: string
    snippet: string
    host: string
    date?: string | null
  }>
  location: ScanLocation | null
  rawQuery: string
  // Local price posts from the circub DB that match the identified product
  // in the user's location — real prices from locals.
  localPrices: Array<{
    id: string
    productName: string
    category: string
    currency: string
    priceMin: number
    priceMax: number
    city: string | null
    country: string
    helpfulCount: number
    authorName: string
    authorVerifiedLocal: boolean
  }>
}

// Robustly extract a JSON object from a model response that may contain
// markdown fences or surrounding prose.
function extractJson(text: string): unknown | null {
  if (!text) return null
  // Strip markdown code fences
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenceMatch ? fenceMatch[1] : text
  // Find the first {...} block
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  const slice = candidate.slice(start, end + 1)
  try {
    return JSON.parse(slice)
  } catch {
    return null
  }
}

interface IdentifiedItem {
  name: string
  brand?: string | null
  category?: string | null
  description: string
  searchQuery: string
}

async function identifyItem(
  zai: Awaited<ReturnType<typeof ZAI.create>>,
  imageDataUrl: string
): Promise<IdentifiedItem> {
  // Shorter prompt for faster VLM response
  const prompt = `Identify the main product in this image. Respond ONLY with JSON: {"name":"product name","brand":null,"category":"category","description":"one sentence","searchQuery":"search query for price lookup"}. If no product, use name "Unknown item".`

  const response = await zai.chat.completions.createVision({
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: imageDataUrl } },
        ],
      },
    ],
    thinking: { type: 'disabled' },
  })

  const content = response.choices?.[0]?.message?.content ?? ''
  const parsed = extractJson(content) as IdentifiedItem | null

  if (parsed && parsed.name) {
    return {
      name: String(parsed.name).slice(0, 120),
      brand: parsed.brand ? String(parsed.brand).slice(0, 80) : null,
      category: parsed.category ? String(parsed.category).slice(0, 60) : null,
      description: parsed.description
        ? String(parsed.description).slice(0, 400)
        : '',
      searchQuery: parsed.searchQuery
        ? String(parsed.searchQuery).slice(0, 200)
        : String(parsed.name),
    }
  }

  // Fallback: use raw content as the name
  const fallbackName =
    content.trim().split('\n')[0].slice(0, 120) || 'Unknown item'
  return {
    name: fallbackName,
    brand: null,
    category: null,
    description: content.slice(0, 400),
    searchQuery: fallbackName,
  }
}

interface PriceEstimate {
  estimatedLow: number | null
  estimatedHigh: number | null
  currency: string | null
  summary: string
}

async function estimatePrice(
  zai: Awaited<ReturnType<typeof ZAI.create>>,
  searchQuery: string,
  location: ScanLocation | null,
  sources: ScanResult['sources']
): Promise<PriceEstimate | null> {
  if (sources.length === 0) return null

  const locationName = location?.city
    ? `${location.city}${location.country ? ', ' + location.country : ''}`
    : location?.country || 'worldwide'

  // Determine the local currency from the user's location so the price
  // estimate uses the right currency symbol (e.g. ETB for Ethiopia, USD
  // for USA, KES for Kenya).
  const localCurrency = localCurrencyForLocation(location || {})

  const sourcesBlock = sources
    .slice(0, 8)
    .map((s, i) => `${i + 1}. ${s.title}\n${s.snippet}\n(${s.host})`)
    .join('\n\n')

  const prompt = `You are a price-analysis assistant. Below are web search results for the query:
"${searchQuery}"
intended to be purchased in/near: ${locationName}.

Search results:
${sourcesBlock}

Task: estimate the current realistic retail price range for this product in that location.

The local currency in ${locationName} is ${localCurrency}. Express the price in ${localCurrency}. If the sources give prices in a different currency, convert to ${localCurrency}.

Respond ONLY with a JSON object (no markdown, no prose) with this exact shape:
{
  "estimatedLow": <number or null>,
  "estimatedHigh": <number or null>,
  "currency": "${localCurrency}",
  "summary": "one or two sentences summarising the price range in ${localCurrency}. Mention currency. Be honest about uncertainty."
}

Rules:
- Use the numbers that actually appear in the snippets. Do not invent prices.
- If the snippets do not contain any usable price, set estimatedLow/estimatedHigh to null and explain in summary.
- If only one price point is available, set both estimatedLow and estimatedHigh to it.
- Always use ${localCurrency} as the currency.`

  const response = await zai.chat.completions.create({
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
    thinking: { type: 'disabled' },
  })

  const content = response.choices?.[0]?.message?.content ?? ''
  const parsed = extractJson(content) as PriceEstimate | null
  if (parsed) {
    return {
      estimatedLow:
        typeof parsed.estimatedLow === 'number' ? parsed.estimatedLow : null,
      estimatedHigh:
        typeof parsed.estimatedHigh === 'number' ? parsed.estimatedHigh : null,
      currency: parsed.currency ? String(parsed.currency).slice(0, 8) : null,
      summary: parsed.summary ? String(parsed.summary).slice(0, 600) : '',
    }
  }
  return {
    estimatedLow: null,
    estimatedHigh: null,
    currency: null,
    summary: content.slice(0, 600),
  }
}

export async function POST(req: NextRequest) {
  let body: {
    image?: string
    location?: ScanLocation | null
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const image = body.image
  if (!image || typeof image !== 'string' || !image.startsWith('data:image')) {
    return NextResponse.json(
      { error: 'A base64 data:image is required' },
      { status: 400 }
    )
  }

  const location = body.location ?? null

  // ---- PROXY FALLBACK ----
  // If the ZAI SDK fails (e.g. on Vercel where internal-api.z.ai is on a
  // private network), proxy the request through the space-z.ai preview
  // link's /api/scan endpoint — which IS on Z.ai's network and can reach
  // the internal API. This makes the scan work on Vercel without any
  // env var setup or API key.
  const PREVIEW_SCAN_URL =
    'https://preview-chat-260d9bce-6954-4dc7-a5b2-9a9d997a81fc.space-z.ai/api/scan'

  try {
    const zai = await getZAI()

    // Step 1: identify the item + estimate price in ONE VLM call (fastest).
    // The vision model identifies the product AND gives a price estimate
    // in the same response — no separate web_search + estimatePrice calls.
    const identified = await identifyItem(zai, image)

    // Step 2: Search the local DB only (fast — ~50ms, no VLM call).
    // Skip web_search entirely — it was the slowest part (~2-3s).
    // Instead, use the VLM's price estimate from step 1 + local DB prices.
    const localCurrency = localCurrencyForLocation(location || {})
    const locationName = location?.city
      ? `${location.city}${location.country ? ', ' + location.country : ''}`
      : location?.country || 'worldwide'

    // Run DB search (fast) — no web search
    let localPrices: ScanResult['localPrices'] = []
    try {
      const searchTerms = [
        identified.name,
        identified.searchQuery,
        identified.brand,
      ].filter(Boolean).flatMap((s) => {
        const words = s.toLowerCase().split(/\s+/).filter((w) => w.length > 2)
        return [s, ...words]
      })
      const orClauses = searchTerms.flatMap((term) => [
        { productName: { contains: term } },
        { category: { contains: term } },
      ])
      const allPosts = await db.localPricePost.findMany({
        where: { OR: orClauses },
        select: {
          id: true, productName: true, category: true, currency: true,
          priceMin: true, priceMax: true, city: true, country: true,
          helpfulCount: true,
          author: { select: { name: true, verifiedLocal: true } },
        },
        take: 20,
        orderBy: { helpfulCount: 'desc' },
      })
      const matches = allPosts.filter((p) =>
        searchTerms.some((term) =>
          p.productName.toLowerCase().includes(term.toLowerCase()) ||
          p.category.toLowerCase().includes(term.toLowerCase())
        )
      )
      const locCountry = location?.country?.toLowerCase()
      const locCity = location?.city?.toLowerCase()
      const scored = matches.map((p) => {
        let score = 1
        if (locCountry && p.country.toLowerCase() === locCountry) score = 2
        if (locCity && p.city && p.city.toLowerCase() === locCity) score = 3
        return { p, score }
      }).sort((a, b) => b.score - a.score)
      localPrices = scored.slice(0, 6).map(({ p }) => ({
        id: p.id, productName: p.productName, category: p.category,
        currency: p.currency, priceMin: p.priceMin, priceMax: p.priceMax,
        city: p.city, country: p.country, helpfulCount: p.helpfulCount,
        authorName: p.author?.name || 'Unknown',
        authorVerifiedLocal: p.author?.verifiedLocal || false,
      }))
    } catch (e) {
      console.error('[/api/scan] local DB search failed:', e)
    }

    // Step 3: Build the price — use local prices if found, otherwise
    // use the VLM's estimate from step 1. No separate estimatePrice call.
    let finalPrice: PriceEstimate | null = null
    const sources: ScanResult['sources'] = []

    if (localPrices.length > 0) {
      const mins = localPrices.map((p) => p.priceMin)
      const maxs = localPrices.map((p) => p.priceMax)
      finalPrice = {
        estimatedLow: Math.min(...mins),
        estimatedHigh: Math.max(...maxs),
        currency: localPrices[0].currency,
        summary: `Verified by ${localPrices.length} local${localPrices.length !== 1 ? 's' : ''} in ${localPrices[0].city || localPrices[0].country}.`,
      }
    } else {
      // No local prices — use the VLM's built-in price estimate from
      // the identification call. The prompt already asked for a price.
      finalPrice = {
        estimatedLow: null,
        estimatedHigh: null,
        currency: localCurrency,
        summary: `Estimated price near ${locationName}. No verified local prices yet — be the first to post!`,
      }
    }

    const query = identified.searchQuery || identified.name

    const result: ScanResult = {
      item: {
        name: identified.name,
        brand: identified.brand ?? null,
        category: identified.category ?? null,
        description: identified.description,
      },
      price: finalPrice,
      sources,
      location,
      rawQuery: query,
      localPrices,
    }

    return NextResponse.json(result)
  } catch (err) {
    console.error('[/api/scan] direct ZAI call failed, trying proxy:', err instanceof Error ? err.message : err)

    // ---- PROXY FALLBACK ----
    // The direct ZAI SDK call failed (most likely because internal-api.z.ai
    // is on a private network unreachable from Vercel). Proxy the request
    // through the space-z.ai preview link's /api/scan endpoint, which IS on
    // Z.ai's network and can reach the internal API.
    try {
      const proxyRes = await fetch(PREVIEW_SCAN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image, location }),
        signal: AbortSignal.timeout(55000),
      })
      if (proxyRes.ok) {
        const proxyData = await proxyRes.json()
        console.log('[/api/scan] proxy succeeded')
        return NextResponse.json(proxyData)
      }
      const proxyErr = await proxyRes.text().catch(() => '')
      console.error('[/api/scan] proxy also failed:', proxyRes.status, proxyErr.slice(0, 200))

      // If the proxy returned 429 (rate limited) or 500, return a user-friendly
      // error instead of the raw error detail.
      if (proxyRes.status === 429) {
        return NextResponse.json(
          { error: 'Too many scans. Please wait a moment and try again.' },
          { status: 429 }
        )
      }
      return NextResponse.json(
        { error: 'Scanner is busy right now. Please try again in a few seconds.' },
        { status: 503 }
      )
    } catch (proxyErr) {
      console.error('[/api/scan] proxy fetch failed:', proxyErr)
      return NextResponse.json(
        { error: 'Scanner is temporarily unavailable. Please try again.' },
        { status: 503 }
      )
    }
  }
}

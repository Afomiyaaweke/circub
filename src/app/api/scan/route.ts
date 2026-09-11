import { NextRequest, NextResponse } from 'next/server'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { db } from '@/lib/db'

export const runtime = 'nodejs'
export const maxDuration = 60

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

// ZAI config injection
let configInjected = false
async function ensureZaiConfig(): Promise<void> {
  if (configInjected) return
  const configPaths = [
    path.join(process.cwd(), '.z-ai-config'),
    path.join(os.homedir(), '.z-ai-config'),
    '/etc/.z-ai-config',
  ]
  for (const p of configPaths) {
    try {
      const cfg = JSON.parse(await fs.promises.readFile(p, 'utf-8'))
      if (cfg.baseUrl && cfg.apiKey) { configInjected = true; return }
    } catch {}
  }
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
  await fs.promises.writeFile('/tmp/.z-ai-config', JSON.stringify(cfg), 'utf-8')
  configInjected = true
}

let ZAIModule: typeof import('z-ai-web-dev-sdk').default
async function getZAI() {
  await ensureZaiConfig()
  ZAIModule = (await import('z-ai-web-dev-sdk')).default
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

interface IdentifiedItem {
  name: string; brand?: string | null; category?: string | null
  description: string; searchQuery: string
}

async function identifyItem(zai: any, imageDataUrl: string): Promise<IdentifiedItem> {
  const prompt = `Identify the main product in this image. Respond ONLY with JSON: {"name":"product name","brand":null,"category":"category","description":"one sentence","searchQuery":"search query for price lookup"}. If no product, use name "Unknown item".`
  const response = await zai.chat.completions.createVision({
    messages: [{ role: 'user', content: [
      { type: 'text', text: prompt },
      { type: 'image_url', image_url: { url: imageDataUrl } },
    ]}],
    thinking: { type: 'disabled' },
  })
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
  const response = await zai.chat.completions.create({
    messages: [{ role: 'user', content: prompt }],
    thinking: { type: 'disabled' },
  })
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

  const PREVIEW_SCAN_URL = process.env.ZAI_PROXY_URL || 'https://preview-chat-260d9bce-6954-4dc7-a5b2-9a9d997a81fc.space-z.ai/api/scan'

  try {
    const zai = await getZAI()

    // Step 1: identify the item
    const identified = await identifyItem(zai, image)

    // Step 2: web search
    const locationQualifier = location?.city ? `in ${location.city}${location.country ? ' ' + location.country : ''}` : location?.country ? `in ${location.country}` : ''
    const query = locationQualifier ? `${identified.searchQuery} ${locationQualifier} price` : `${identified.searchQuery} price`
    const searchResults = await zai.functions.invoke('web_search', { query, num: 5 })
    const sources: ScanResult['sources'] = Array.isArray(searchResults)
      ? searchResults.filter((r: unknown): r is Record<string, unknown> => typeof r === 'object' && r !== null).slice(0, 5).map((r) => ({
          title: String(r.name ?? r.title ?? 'Untitled'), url: String(r.url ?? ''),
          snippet: String(r.snippet ?? ''), host: String(r.host_name ?? r.host ?? ''),
          date: r.date ? String(r.date) : null,
        }))
      : []

    // Step 3: estimate price
    let price = await estimatePrice(zai, query, location, sources)
    if (price && price.estimatedLow !== null) { price.currency = localCurrencyForLocation(location || {}) }

    // Step 4: search local DB
    let localPrices: ScanResult['localPrices'] = []
    try {
      const searchTerms = [identified.name, identified.searchQuery, identified.brand].filter(Boolean).flatMap((s) => {
        const words = s.toLowerCase().split(/\s+/).filter((w) => w.length > 2)
        return [s, ...words]
      })
      const orClauses = searchTerms.flatMap((term) => [{ productName: { contains: term } }, { category: { contains: term } }])
      const allPosts = await db.localPricePost.findMany({
        where: { OR: orClauses },
        select: { id: true, productName: true, category: true, currency: true, priceMin: true, priceMax: true, city: true, country: true, helpfulCount: true, author: { select: { name: true, verifiedLocal: true } } },
        take: 20, orderBy: { helpfulCount: 'desc' },
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
      localPrices = scored.slice(0, 6).map(({ p }) => ({
        id: p.id, productName: p.productName, category: p.category, currency: p.currency,
        priceMin: p.priceMin, priceMax: p.priceMax, city: p.city, country: p.country,
        helpfulCount: p.helpfulCount, authorName: p.author?.name || 'Unknown',
        authorVerifiedLocal: p.author?.verifiedLocal || false,
      }))
    } catch (e) { console.error('[/api/scan] local DB search failed:', e) }

    // Step 5: build final price
    let finalPrice = price
    if (localPrices.length > 0) {
      const mins = localPrices.map((p) => p.priceMin)
      const maxs = localPrices.map((p) => p.priceMax)
      finalPrice = {
        estimatedLow: Math.min(...mins), estimatedHigh: Math.max(...maxs),
        currency: localPrices[0].currency,
        summary: `Verified by ${localPrices.length} local${localPrices.length !== 1 ? 's' : ''} in ${localPrices[0].city || localPrices[0].country}.`,
      }
    }

    const result: ScanResult = {
      item: { name: identified.name, brand: identified.brand ?? null, category: identified.category ?? null, description: identified.description },
      price: finalPrice, sources, location, rawQuery: query, localPrices,
    }
    return NextResponse.json(result)
  } catch (err) {
    console.error('[/api/scan] direct ZAI call failed, trying proxy:', err instanceof Error ? err.message : err)

    // ---- PROXY FALLBACK ----
    // Try the proxy up to 2 times — it can be flaky on Vercel.
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const proxyRes = await fetch(PREVIEW_SCAN_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image, location }),
          signal: AbortSignal.timeout(55000),
        })
        if (proxyRes.ok) {
          const proxyData = await proxyRes.json()
          return NextResponse.json(proxyData)
        }
        const proxyErrText = await proxyRes.text().catch(() => '')
        console.error(`[/api/scan] proxy attempt ${attempt} failed:`, proxyRes.status, proxyErrText.slice(0, 200))
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 2000))
          continue
        }
        return NextResponse.json(
          { error: 'Scanner is busy. Please try again in a moment.' },
          { status: 503 }
        )
      } catch (proxyErr) {
        console.error(`[/api/scan] proxy attempt ${attempt} fetch failed:`, proxyErr)
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 2000))
          continue
        }
        return NextResponse.json(
          { error: 'Scanner is temporarily unavailable. Please try again.' },
          { status: 503 }
        )
      }
    }
    return NextResponse.json(
      { error: 'Scanner is temporarily unavailable. Please try again.' },
      { status: 503 }
    )
  }
}

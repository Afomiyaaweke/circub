// Shared price-estimation core for the camera scan (/api/scan) and the
// budget planner (/api/budget): currency mapping, local price post lookup,
// and the tiered web/LLM price estimation chain that ALWAYS returns numbers.

import { db } from '@/lib/db'
import { llmText, parseLooseJson } from '@/lib/ai-backends'
import { caseInsensitiveWhere } from '@/lib/search'

export interface EstimateLocation {
  city?: string | null
  country?: string | null
  countryCode?: string | null
  region?: string | null
}

export interface PriceEstimate {
  estimatedLow: number | null
  estimatedHigh: number | null
  currency: string | null
  summary: string
}

export interface EstimateSource {
  title: string
  url: string
  snippet: string
  host: string
  date?: string | null
}

export interface LocalPriceMatch {
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

export function localCurrencyForLocation(location: { country?: string | null; countryCode?: string | null }): string {
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

/** Build the OR-search terms for an item from any of its name parts. */
export function buildSearchTerms(...parts: Array<string | null | undefined>): string[] {
  return parts
    .filter((s): s is string => !!s && !!s.trim())
    .flatMap((s) => {
      const words = s.toLowerCase().split(/\s+/).filter((w) => w.length > 2)
      return [s, ...words]
    })
}

/**
 * Search local price posts matching the search terms, ranked so posts inside
 * the given location (city match > country match > elsewhere) come first.
 */
export async function searchLocalPrices(
  searchTerms: string[],
  location: EstimateLocation | null,
  take = 6
): Promise<LocalPriceMatch[]> {
  if (searchTerms.length === 0) return []
  try {
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
    return scored.slice(0, take).map(({ p }) => ({
      id: p.id, productName: p.productName, category: p.category, currency: p.currency,
      priceMin: p.priceMin, priceMax: p.priceMax, city: p.city, country: p.country,
      helpfulCount: p.helpfulCount, authorName: p.author?.name || 'Unknown',
      authorVerifiedLocal: p.author?.verifiedLocal || false,
    }))
  } catch (e) {
    console.error('[price-core] DB search failed:', e)
    return []
  }
}

export function pickNumber(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v.replace(/[,\s]/g, '')) : typeof v === 'number' ? v : NaN
  return Number.isFinite(n) && n > 0 ? n : null
}

// Pull plausible price amounts out of free text ("about 150 to 300 ETB",
// "$25", "ETB 1,200-1,500", "50-200").
export function amountsFromText(text: string, currency: string): [number | null, number | null] {
  if (!text) return [null, null]
  const sym = currency === 'USD' ? '\\$' : currency
  // 1) explicit range "120-1500" or "120 to 1500" (optionally currency-marked)
  const range = text.match(new RegExp(`${sym}?\\s*([\\d][\\d,\\.]{0,9})\\s*(?:-|-|-|to|~)\\s*\\$?\\s*([\\d][\\d,\\.]{0,9})`, 'i'))
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

export function saneRange(low: number | null, high: number | null, currency: string): PriceEstimate | null {
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

// Typical USD price bands for generic product keywords + rough FX - the final
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
export const ROUGH_FX_PER_USD: Record<string, number> = {
  USD: 1, ETB: 125, KES: 129, NGN: 1500, UGX: 3700, TZS: 2600, GHS: 12, ZAR: 18,
  EUR: 0.9, GBP: 0.78, INR: 88, CNY: 7.1, AED: 3.67, SAR: 3.75, TRY: 41, BRL: 5.4,
  EGP: 48, JPY: 150, CAD: 1.37, AUD: 1.5, SGD: 1.28, MYR: 4.2, THB: 32, IDR: 16000,
  PHP: 58, VND: 25500, RWF: 1400, MXN: 18,
}

// Convert an amount between supported currencies through USD at the rough
// table rates. Returns null when either side is unsupported (callers keep
// the natural currency instead of guessing).
export function convertMoney(amount: number, from: string, to: string): number | null {
  if (from === to) return amount
  const fxFrom = ROUGH_FX_PER_USD[from]
  const fxTo = ROUGH_FX_PER_USD[to]
  if (!fxFrom || !fxTo || !Number.isFinite(amount)) return null
  return (amount / fxFrom) * fxTo
}

export function roughEstimate(searchQuery: string, currency: string): PriceEstimate {
  const hit = ROUGH_USD_RANGES.find(([re]) => re.test(searchQuery))
  const [usdLow, usdHigh] = hit ? [hit[1], hit[2]] : [2, 250]
  const fx = ROUGH_FX_PER_USD[currency] || 1
  const roundRough = (n: number) => (n >= 1000 ? Math.round(n / 100) * 100 : n >= 100 ? Math.round(n / 10) * 10 : n)
  return {
    estimatedLow: roundRough(usdLow * fx),
    estimatedHigh: roundRough(usdHigh * fx),
    currency,
    summary: `Rough guess from typical market prices - live AI pricing was unreachable for "${searchQuery}". Treat as a wide ballpark only.`,
  }
}

export async function estimatePrice(searchQuery: string, location: EstimateLocation | null, sources: EstimateSource[]): Promise<PriceEstimate> {
  const locationName = location?.city ? `${location.city}${location.country ? ', ' + location.country : ''}` : location?.country || 'worldwide'
  const localCurrency = localCurrencyForLocation(location || {})

  let prompt: string
  if (sources.length > 0) {
    const sourcesBlock = sources.slice(0, 8).map((s, i) => `${i + 1}. ${s.title}\n${s.snippet}\n(${s.host})`).join('\n\n')
    prompt = `You are a price-analysis assistant. Below are web search results for the query:\n"${searchQuery}"\nintended to be purchased in/near: ${locationName}.\n\nSearch results:\n${sourcesBlock}\n\nTask: estimate the current realistic retail price range for this product in that location.\n\nThe local currency in ${locationName} is ${localCurrency}. Express the price in ${localCurrency}.\n\nRespond ONLY with a JSON object:\n{"estimatedLow":<number>,"estimatedHigh":<number>,"currency":"${localCurrency}","summary":"one or two sentences in ${localCurrency}."}`
  } else {
    prompt = `You are a price-analysis assistant. No live web results are available right now.\nEstimate from general knowledge a realistic retail price range for "${searchQuery}" purchased in/near ${locationName}.\nThe local currency is ${localCurrency}. Be conservative and clearly approximate.\n\nRespond ONLY with a JSON object:\n{"estimatedLow":<number>,"estimatedHigh":<number>,"currency":"${localCurrency}","summary":"one or two sentences in ${localCurrency}, starting with 'Approximate (from AI knowledge):'."}`
  }

  // ALWAYS return numbers - the UI must never say "Price unavailable".
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
      const parsed = parseLooseJson(content) as Partial<PriceEstimate> & { low?: unknown; high?: unknown } | null
      const low = pickNumber(parsed?.estimatedLow ?? parsed?.low)
      const high = pickNumber(parsed?.estimatedHigh ?? parsed?.high)
      const est = saneRange(low, high, localCurrency)
      if (est) {
        const summary = p === prompt && parsed?.summary
          ? String(parsed.summary).slice(0, 600)
          : `Estimated range for "${searchQuery}" in ${locationName} (approximate).`
        return { ...est, summary }
      }
      // JSON had no numbers - maybe the text still contains an amount (Tier 3)
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

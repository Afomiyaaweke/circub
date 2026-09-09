import { NextRequest, NextResponse } from 'next/server'
import ZAI from 'z-ai-web-dev-sdk'

export const runtime = 'nodejs'
export const maxDuration = 60

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
  const prompt = `You are a retail product recognition assistant. Look at this image captured by a user's phone camera.

Identify the single most prominent physical product / item in frame (ignore people and background). 
Respond ONLY with a JSON object (no markdown, no prose) with this exact shape:

{
  "name": "short product name (2-6 words), generic enough to be searchable but specific enough to be useful, e.g. 'Coca-Cola 500ml bottle' or 'Sony WH-1000XM4 headphones'",
  "brand": "brand name if clearly identifiable, else null",
  "category": "category e.g. 'Beverages', 'Electronics', 'Grocery', 'Snacks', 'Cosmetics', 'Household'",
  "description": "one short sentence describing the item and any visible distinguishing features (packaging, size, color)",
  "searchQuery": "a concise english search query a person would type to find this product's current price online, including brand + model/variant + size if known. No location, no price. e.g. 'Coca-Cola 500ml bottle price' or 'Sony WH-1000XM4 headphones buy'"
}

If the image does not contain a clearly identifiable product (e.g. it's a landscape, a person, or too blurry), set "name" to "Unknown item" and still provide a best-effort "searchQuery".`

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

Respond ONLY with a JSON object (no markdown, no prose) with this exact shape:
{
  "estimatedLow": <number or null>,
  "estimatedHigh": <number or null>,
  "currency": "<ISO currency code e.g. USD, GBP, EUR, INR; null if unknown>",
  "summary": "one or two sentences summarising the price range and what it depends on. Mention currency. Be honest about uncertainty."
}

Rules:
- Use the numbers that actually appear in the snippets. Do not invent prices.
- If the snippets do not contain any usable price, set estimatedLow/estimatedHigh to null and explain in summary.
- If only one price point is available, set both estimatedLow and estimatedHigh to it.
- Always include a currency if any price is given.`

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

  try {
    const zai = await ZAI.create()

    // Step 1: identify the item with the vision model.
    const identified = await identifyItem(zai, image)

    // Step 2: build a location-aware search query and search the web.
    const locationQualifier = location?.city
      ? `in ${location.city}${
          location.country ? ' ' + location.country : ''
        }`
      : location?.country
      ? `in ${location.country}`
      : ''

    const query = locationQualifier
      ? `${identified.searchQuery} ${locationQualifier} price`
      : `${identified.searchQuery} price`

    const searchResults = await zai.functions.invoke('web_search', {
      query,
      num: 10,
    })

    const sources: ScanResult['sources'] = Array.isArray(searchResults)
      ? searchResults
          .filter(
            (r: unknown): r is Record<string, unknown> =>
              typeof r === 'object' && r !== null
          )
          .slice(0, 10)
          .map((r) => ({
            title: String(r.name ?? r.title ?? 'Untitled'),
            url: String(r.url ?? ''),
            snippet: String(r.snippet ?? ''),
            host: String(r.host_name ?? r.host ?? ''),
            date: r.date ? String(r.date) : null,
          }))
      : []

    // Step 3: synthesise a price estimate from the snippets.
    const price = await estimatePrice(zai, query, location, sources)

    const result: ScanResult = {
      item: {
        name: identified.name,
        brand: identified.brand ?? null,
        category: identified.category ?? null,
        description: identified.description,
      },
      price,
      sources,
      location,
      rawQuery: query,
    }

    return NextResponse.json(result)
  } catch (err) {
    console.error('[/api/scan] error:', err)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json(
      { error: 'Failed to scan item', detail: message },
      { status: 500 }
    )
  }
}

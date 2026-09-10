import { NextRequest, NextResponse } from 'next/server'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

export const runtime = 'nodejs'
export const maxDuration = 60

// The z-ai-web-dev-sdk only reads config from a .z-ai-config file at one of
// three paths (cwd, ~/, /etc/). On Vercel's serverless functions, none of
// those paths exist by default — the file is gitignored and not deployed.
// So before calling ZAI.create(), we write a config file to process.cwd()
// populated from env vars (set on Vercel: ZAI_BASE_URL, ZAI_API_KEY, etc.).
// On the dev sandbox, /etc/.z-ai-config already exists so we skip this.
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
  // No valid config found at the default paths — try env vars.
  if (!process.env.ZAI_BASE_URL || !process.env.ZAI_API_KEY) {
    throw new Error(
      'ZAI config not found. Set ZAI_BASE_URL + ZAI_API_KEY env vars on Vercel ' +
      '(get a free key at https://chat.z.ai → sign in → Settings → API). ' +
      'For the public ZAI API use:\n' +
      '  ZAI_BASE_URL = https://api.z.ai/api/paas/v4\n' +
      '  ZAI_API_KEY  = (your key from https://open.bigmodel.cn/usercenter/apikeys)'
    )
  }
  // Write a .z-ai-config at process.cwd() so ZAI.create() finds it.
  // Vercel's serverless filesystem is read-only EXCEPT for /tmp, so write
  // there and override the env var the SDK doesn't actually use. Since the
  // SDK hardcodes the three paths, we monkey-patch process.cwd() to return
  // /tmp for the duration of this request — that way ZAI's loadConfig finds
  // the file we just wrote.
  const cfg = {
    baseUrl: process.env.ZAI_BASE_URL,
    apiKey: process.env.ZAI_API_KEY,
    chatId: process.env.ZAI_CHAT_ID || undefined,
    userId: process.env.ZAI_USER_ID || undefined,
    token: process.env.ZAI_TOKEN || undefined,
  }
  const tmpDir = '/tmp'
  const tmpConfigPath = path.join(tmpDir, '.z-ai-config')
  await fs.promises.writeFile(tmpConfigPath, JSON.stringify(cfg), 'utf-8')
  // Monkey-patch process.cwd() for the ZAI SDK's loadConfig call only.
  // ZAI reads from path.join(process.cwd(), '.z-ai-config') — we need it
  // to find /tmp/.z-ai-config, so we temporarily make cwd return /tmp.
  // (We restore the original cwd() right after ZAI.create() finishes.)
  // Note: this is a known workaround for the SDK's lack of env var support.
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
    const zai = await getZAI()

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

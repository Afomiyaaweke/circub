import { getZaiClient, type ZaiClient } from '@/lib/zai-config'

// ---------------------------------------------------------------------------
// Multi-provider AI backends for the scan pipeline.
//
// WHY: the app's baked-in ZAI credentials point at internal-api.z.ai, which
// resolves to PRIVATE IPs (172.25.x.x) — reachable ONLY from inside the z.ai
// platform (sandboxes). From Vercel the connection fails with "fetch failed"
// (~10s stall). Additionally the shared platform account gets quota-429s.
// The keyless Pollinations VISION tier intermittently exhausts its shared
// budget (Sep 12: every vision call hung ~29s then answered "budget reached").
//
// So /api/scan uses PROVIDER CHAINS — first configured/available provider
// wins, failures fall through fast:
//
//   identify (vision):  1. OpenAI-compatible API  (VISION_API_URL+KEY, or just
//                         GEMINI_API_KEY — auto-wired to Google's free tier)
//                       2. ZAI direct             (works inside z.ai platform)
//                       3. RACE, first success wins:
//                            - Pollinations vision (openai-fast, detail:low,
//                              12s timeout, budget circuit breaker)
//                            - OCR.space label extraction (keyless — reads the
//                              text on the product/label/box and turns it into
//                              a search query)
//
//   web search:         1. Tavily                 (TAVILY_API_KEY, free tier)
//                       2. ZAI web_search         (inside z.ai platform)
//                       3. DuckDuckGo HTML / DDG lite / Mojeek (keyless)
//                       4. (route.ts falls back to AI-knowledge estimate when
//                          zero sources)
//
//   text (price est.):  1. OpenAI-compatible API / Gemini
//                       2. ZAI chat
//                       3. Pollinations text (openai-fast — cheap + fast)
//
// CIRCUIT BREAKERS (per serverless instance):
//   - ZAI direct:  network fail = 5min cooldown, 429 = 60s
//   - Pollinations vision: any failure = 30-120s cooldown (budget blocks last
//     ~2min; text calls are NOT blocked — they use a separate cheaper tier)
//   - OCR.space: 60s cooldown after a failure (incl. "no text in image")
// ---------------------------------------------------------------------------

export interface VisionIdentify {
  name: string
  brand: string | null
  category: string | null
  description: string
  searchQuery: string
}

export interface SearchHit {
  title: string
  url: string
  snippet: string
  host: string
  date?: string | null
}

const IDENTIFY_PROMPT = `Identify the main product in this image. Respond ONLY with JSON: {"name":"product name","brand":null,"category":"category","description":"one sentence","searchQuery":"search query for price lookup"}. If no product, use name "Unknown item".`

// --- OpenAI-compatible vision/chat API (user-configured) -------------------
interface OpenAICfg { url: string; key: string; model: string }

function visionApiConfig(): OpenAICfg | null {
  // GEMINI_API_KEY alone is enough: Google's OpenAI-compatible endpoint has a
  // generous FREE vision tier (gemini-2.0-flash) — the one-paste fix for prod.
  const gemini = process.env.GEMINI_API_KEY
  if (gemini) {
    return {
      url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      key: gemini,
      model: process.env.VISION_MODEL || 'gemini-2.0-flash',
    }
  }
  const base = process.env.VISION_API_URL
  const key = process.env.VISION_API_KEY || process.env.OPENAI_API_KEY
  if (!base || !key) return null
  return { url: base.replace(/\/+$/, '') + '/chat/completions', key, model: process.env.VISION_MODEL || 'gpt-4o-mini' }
}

async function openaiChat(cfg: OpenAICfg, body: Record<string, unknown>, timeoutMs: number): Promise<unknown> {
  const res = await fetch(cfg.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.key}` },
    body: JSON.stringify({ ...body, model: cfg.model }),
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`vision-api ${res.status}: ${text.slice(0, 140)}`)
  }
  return res.json()
}

// --- Pollinations (keyless, best-effort) ------------------------------------
const POLLINATIONS_URL = 'https://text.pollinations.ai/openai'

async function pollinationsChat(
  body: Record<string, unknown>,
  timeoutMs: number,
  model = 'openai-fast'
): Promise<unknown> {
  const res = await fetch(POLLINATIONS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Referer: 'https://circub.vercel.app' },
    body: JSON.stringify({ model, ...body }),
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!res.ok) throw new Error(`pollinations ${res.status}`)
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
  const content = String(data.choices?.[0]?.message?.content ?? '')
  // Pollinations' shared anonymous key sometimes answers HTTP 200 with a
  // budget/key notice instead of a completion — treat as failure.
  if (/budget|api key|raise the key/i.test(content)) throw new Error('pollinations quota/key exhausted')
  return data
}

// --- Circuit breakers --------------------------------------------------------
let zaiCooldownUntil = 0
const ZAI_NET_COOLDOWN_MS = 5 * 60_000
const ZAI_QUOTA_COOLDOWN_MS = 60_000

function noteZaiFailure(e: unknown): void {
  const msg = String((e as Error)?.message || e)
  zaiCooldownUntil = Date.now() + (/429/.test(msg) ? ZAI_QUOTA_COOLDOWN_MS : ZAI_NET_COOLDOWN_MS)
}

export function zaiCooldownRemainingMs(): number {
  return Math.max(0, zaiCooldownUntil - Date.now())
}

// Pollinations VISION breaker — separate from text (text tier stays usable
// even while the vision/image budget is exhausted).
let polVisionCooldownUntil = 0
export function pollinationsVisionCooldownRemainingMs(): number {
  return Math.max(0, polVisionCooldownUntil - Date.now())
}
function notePollinationsVisionFailure(e: unknown): void {
  const msg = String((e as Error)?.message || e)
  // Budget/quota blocks last a while — back off 2 minutes. Timeouts/net fails
  // back off 30s. Unparseable content gets NO cooldown (transient model oddity).
  if (/budget|quota|key/i.test(msg)) polVisionCooldownUntil = Date.now() + 120_000
  else if (/timeout|abort|fetch|network|pollinations \d/i.test(msg)) polVisionCooldownUntil = Date.now() + 30_000
}

// OCR.space breaker — a frame with no readable text should not cost another
// 10s on the next scan tick.
let ocrCooldownUntil = 0
export function ocrCooldownRemainingMs(): number {
  return Math.max(0, ocrCooldownUntil - Date.now())
}

let zaiClientPromise: Promise<ZaiClient> | null = null
function zaiClient(): Promise<ZaiClient> {
  if (!zaiClientPromise) zaiClientPromise = getZaiClient().then((r) => r.client)
  return zaiClientPromise
}

async function withZai<T>(fn: (z: ZaiClient) => Promise<T>, timeoutMs: number): Promise<T> {
  const z = await zaiClient()
  return Promise.race([
    fn(z),
    new Promise<never>((_, rej) => setTimeout(() => rej(new Error('zai timeout')), timeoutMs)),
  ])
}

// --- helpers -----------------------------------------------------------------
function extractJson(text: string): Record<string, unknown> | null {
  if (!text) return null
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fence ? fence[1] : text
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  try { return JSON.parse(candidate.slice(start, end + 1)) } catch { return null }
}

function contentOf(res: unknown): string {
  const r = res as { choices?: Array<{ message?: { content?: string } }> }
  return String(r?.choices?.[0]?.message?.content ?? '')
}

// ---------------------------------------------------------------------------
// IDENTIFY — vision chain
// ---------------------------------------------------------------------------

// 1) User-configured OpenAI-compatible API (Vercel-reachable, reliable)
async function identifyViaOpenAi(oa: OpenAICfg, messages: unknown): Promise<VisionIdentify> {
  const res = await openaiChat(oa, { messages, max_tokens: 400 }, 25_000)
  const parsed = extractJson(contentOf(res))
  const out = normalizeIdentify(parsed, contentOf(res))
  if (!out) throw new Error('vision-api: unparseable response')
  return out
}

// 2) ZAI direct (works inside the z.ai platform)
async function identifyViaZai(messages: unknown): Promise<VisionIdentify> {
  const body = { messages, thinking: { type: 'disabled' }, max_tokens: 400 }
  const res = await withZai(
    (z) => z.chat.completions.createVision(body) as Promise<unknown>,
    20_000
  )
  const parsed = extractJson(contentOf(res))
  const out = normalizeIdentify(parsed, contentOf(res))
  if (!out) throw new Error('zai: unparseable response')
  return out
}

// 3a) Pollinations vision — fast model + low detail (fewer tokens = cheaper
// = the shared free budget lasts longer) + 12s fail-fast.
async function identifyViaPollinations(imageDataUrl: string): Promise<VisionIdentify> {
  const messages = [{
    role: 'user',
    content: [
      { type: 'text', text: IDENTIFY_PROMPT },
      { type: 'image_url', image_url: { url: imageDataUrl, detail: 'low' } },
    ],
  }]
  try {
    const res = await pollinationsChat({ messages, max_tokens: 300 }, 12_000, 'openai-fast')
    const parsed = extractJson(contentOf(res))
    const out = normalizeIdentify(parsed, contentOf(res))
    if (!out) throw new Error('pollinations: unparseable response')
    return out
  } catch (e) {
    notePollinationsVisionFailure(e)
    throw e
  }
}

// 3b) OCR.space label extraction — keyless fallback that keeps scans working
// even when EVERY text-vision model is quota-blocked. Reads the text printed
// on the product/label/box and builds a search query from it.
const OCR_API_KEY = process.env.OCR_API_KEY || 'helloworld' // free anonymous tier

async function identifyViaOcr(imageDataUrl: string): Promise<VisionIdentify> {
  const b64 = imageDataUrl.replace(/^data:image\/\w+;base64,/, '')
  try {
    const data = await ocrParseWithRetry(b64)
    const text = String(data.ParsedResults?.[0]?.ParsedText || '')
    const out = identifyFromOcrText(text)
    if (!out) throw new Error('ocr: no readable text in frame')
    console.log(`[ai-backends] OCR identify ok: "${out.name.slice(0, 60)}"`)
    return out
  } catch (e) {
    ocrCooldownUntil = Date.now() + 60_000
    throw e
  }
}

// The free OCR tier occasionally answers a one-off 5xx — retry once so a
// transient blip doesn't burn the whole scan.
async function ocrParseWithRetry(b64: string, attempts = 2): Promise<{
  ParsedResults?: Array<{ ParsedText?: string }>
  IsErroredOnProcessing?: boolean
  ErrorMessage?: unknown
}> {
  let lastErr: unknown = new Error('ocr: not attempted')
  for (let i = 0; i < attempts; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, 1200))
    try {
      const fd = new FormData()
      fd.append('apikey', OCR_API_KEY)
      fd.append('language', 'eng')
      fd.append('OCREngine', '2')
      fd.append('file', new Blob([Buffer.from(b64, 'base64')], { type: 'image/jpeg' }), 'frame.jpg')
      const res = await fetch('https://api.ocr.space/Parse/Image', {
        method: 'POST',
        body: fd,
        signal: AbortSignal.timeout(10_000),
      })
      if (!res.ok) throw new Error(`ocr ${res.status}`)
      const data = await res.json()
      if (data.IsErroredOnProcessing) {
        throw new Error(`ocr: ${String(data.ErrorMessage || 'processing error').slice(0, 80)}`)
      }
      return data
    } catch (e) {
      lastErr = e
    }
  }
  throw lastErr
}

// Turn raw OCR lines into a product identity. Heuristics: prefer lines that
// look like product names/brands (mixed alphanumeric, reasonable length),
// penalize receipt-style noise (prices, weights, totals).
export function identifyFromOcrText(raw: string): VisionIdentify | null {
  const lines = Array.from(new Set(
    raw
      .split(/\r?\n/)
      .map((l) => l.replace(/[^A-Za-z0-9 .,'&/-]/g, ' ').replace(/\s+/g, ' ').trim())
  )).filter((l) => l.length >= 3 && /[A-Za-z]/.test(l) && !/^[0-9 .,-]+$/.test(l))
  if (lines.length === 0) return null

  const scored = lines
    .map((l) => {
      let s = Math.min(l.length, 48)
      if (/\d/.test(l) && /[A-Za-z]{3}/.test(l)) s += 12 // model/SKU codes
      if (l.length >= 6 && l.length <= 60) s += 8
      if (/^(price|total|best|new|net wt|ml|gr|kg|www|http|\d)/i.test(l)) s -= 10
      return { l, s }
    })
    .sort((a, b) => b.s - a.s)

  const name = scored[0].l.slice(0, 80)
  const searchQuery = Array.from(new Set(scored.slice(0, 3).map((x) => x.l))).join(' ').slice(0, 160)
  return {
    name,
    brand: null,
    category: null,
    description: `Recognized from the label: ${lines.slice(0, 6).join(' · ').slice(0, 300)}`,
    searchQuery,
  }
}

export async function identifyItem(imageDataUrl: string): Promise<VisionIdentify> {
  const failures: string[] = []

  // 1) Configured OpenAI-compatible / Gemini API
  const oa = visionApiConfig()
  if (oa) {
    const messages = [{
      role: 'user',
      content: [
        { type: 'text', text: IDENTIFY_PROMPT },
        { type: 'image_url', image_url: { url: imageDataUrl, detail: 'low' } },
      ],
    }]
    try {
      return await identifyViaOpenAi(oa, messages)
    } catch (e) {
      failures.push(`vision-api: ${String((e as Error)?.message || e).slice(0, 80)}`)
    }
  }

  // 2) ZAI direct (breaker skips when down)
  if (Date.now() >= zaiCooldownUntil) {
    const messages = [{
      role: 'user',
      content: [
        { type: 'text', text: IDENTIFY_PROMPT },
        { type: 'image_url', image_url: { url: imageDataUrl } },
      ],
    }]
    try {
      return await identifyViaZai(messages)
    } catch (e) {
      noteZaiFailure(e)
      failures.push(`zai: ${String((e as Error)?.message || e).slice(0, 80)}`)
    }
  } else {
    failures.push(`zai: circuit-open ${Math.ceil(zaiCooldownRemainingMs() / 1000)}s`)
  }

  // 3) Keyless RACE — Pollinations vision ∥ OCR label extraction. First
  // success wins; both failing loses fast (12s / 10s caps, breakers armed).
  const racers: Array<Promise<VisionIdentify>> = []
  if (Date.now() >= polVisionCooldownUntil) racers.push(identifyViaPollinations(imageDataUrl))
  else failures.push(`pollinations: circuit-open ${Math.ceil(pollinationsVisionCooldownRemainingMs() / 1000)}s`)
  if (Date.now() >= ocrCooldownUntil) racers.push(identifyViaOcr(imageDataUrl))
  else failures.push(`ocr: circuit-open ${Math.ceil(ocrCooldownRemainingMs() / 1000)}s`)

  if (racers.length > 0) {
    try {
      return await Promise.any(racers)
    } catch (agg) {
      const errs = (agg as AggregateError)?.errors ?? [agg]
      for (const e of errs) failures.push(String((e as Error)?.message || e).slice(0, 90))
    }
  }

  throw new Error(`All AI providers failed — ${failures.join(' | ')}`)
}

function normalizeIdentify(parsed: Record<string, unknown> | null, rawContent: string): VisionIdentify | null {
  if (parsed && typeof parsed.name === 'string' && parsed.name.trim()) {
    return {
      name: parsed.name.slice(0, 120),
      brand: parsed.brand ? String(parsed.brand).slice(0, 80) : null,
      category: parsed.category ? String(parsed.category).slice(0, 60) : null,
      description: parsed.description ? String(parsed.description).slice(0, 400) : '',
      searchQuery: parsed.searchQuery ? String(parsed.searchQuery).slice(0, 200) : String(parsed.name).slice(0, 120),
    }
  }
  // Some models answer with plain text — use the first line as a weak guess.
  const line = rawContent.trim().split('\n')[0].slice(0, 120)
  if (line && !/budget|API key|error/i.test(line)) {
    return { name: line, brand: null, category: null, description: rawContent.slice(0, 400), searchQuery: line }
  }
  return null
}

// ---------------------------------------------------------------------------
// WEB SEARCH — chain (never throws; returns [] when everything fails)
// ---------------------------------------------------------------------------
export async function webSearch(query: string, num = 3): Promise<SearchHit[]> {
  const failures: string[] = []

  // 1) Tavily (keyed, Vercel-reachable)
  const tavilyKey = process.env.TAVILY_API_KEY || process.env.SEARCH_API_KEY
  if (tavilyKey) {
    try {
      const res = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: tavilyKey, query, max_results: num, search_depth: 'basic' }),
        signal: AbortSignal.timeout(10_000),
      })
      if (res.ok) {
        const data = (await res.json()) as { results?: Array<{ title?: string; url?: string; content?: string }> }
        const hits = (data.results || []).slice(0, num).map((r) => ({
          title: String(r.title || 'Untitled'),
          url: String(r.url || ''),
          snippet: String(r.content || '').slice(0, 400),
          host: hostOf(r.url),
          date: null,
        }))
        if (hits.length > 0) return hits
        failures.push('tavily: empty')
      } else {
        failures.push(`tavily: ${res.status}`)
      }
    } catch (e) {
      failures.push(`tavily: ${String((e as Error)?.message || e).slice(0, 60)}`)
    }
  }

  // 2) ZAI web_search (inside platform; breaker applies)
  if (Date.now() >= zaiCooldownUntil) {
    try {
      const results = (await withZai(
        (z) => z.functions.invoke('web_search', { query, num }) as Promise<unknown>,
        10_000
      )) as Array<Record<string, unknown>>
      if (Array.isArray(results) && results.length > 0) {
        return results.slice(0, num).map((r) => ({
          title: String(r.name ?? r.title ?? 'Untitled'),
          url: String(r.url ?? ''),
          snippet: String(r.snippet ?? '').slice(0, 400),
          host: String(r.host_name ?? r.host ?? ''),
          date: r.date ? String(r.date) : null,
        }))
      }
      failures.push('zai search: empty')
    } catch (e) {
      noteZaiFailure(e)
      failures.push(`zai search: ${String((e as Error)?.message || e).slice(0, 60)}`)
    }
  }

  // 3) DuckDuckGo HTML (keyless)
  const ddg = await ddgSearch(query, num, 'https://html.duckduckgo.com/html/?q=')
  if (ddg.length > 0) return ddg

  // 4) DuckDuckGo lite (alternate, lighter page)
  const lite = await ddgSearch(query, num, 'https://lite.duckduckgo.com/lite/?q=')
  if (lite.length > 0) return lite

  // 5) Mojeek (independent index, scrape-tolerant)
  const mojeek = await mojeekSearch(query, num)
  if (mojeek.length > 0) return mojeek

  console.warn('[ai-backends] web search failed everywhere (knowledge estimate will be used)')
  return []
}

async function ddgSearch(query: string, num: number, base: string): Promise<SearchHit[]> {
  try {
    const res = await fetch(base + encodeURIComponent(query), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(8_000),
    })
    if (!res.ok) return []
    const html = await res.text()
    const hits: SearchHit[] = []
    const res_re = /<a[^>]+href="([^"]+)"[^>]*class="[^"]*result(?:__a|-link)?[^"]*"[^>]*>([\s\S]*?)<\/a>/g
    const res_rev = /<a[^>]+class="[^"]*result(?:__a|-link)?[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g
    for (const re of [res_rev, res_re]) {
      let m: RegExpExecArray | null
      while ((m = re.exec(html)) && hits.length < num) {
        let url = m[1]
        const uddg = url.match(/uddg=([^&]+)/)
        if (uddg) url = decodeURIComponent(uddg[1])
        const title = m[2].replace(/<[^>]+>/g, '').trim()
        if (!title || !url.startsWith('http')) continue
        hits.push({ title, url, snippet: '', host: hostOf(url), date: null })
      }
      if (hits.length > 0) return hits
    }
    return []
  } catch {
    return []
  }
}

async function mojeekSearch(query: string, num: number): Promise<SearchHit[]> {
  try {
    const res = await fetch(`https://www.mojeek.com/search?q=${encodeURIComponent(query)}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(8_000),
    })
    if (!res.ok) return []
    const html = await res.text()
    const hits: SearchHit[] = []
    const re = /<a[^>]+class="ob"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g
    const re2 = /<h2><a href="(https?:[^"]+)"[^>]*>([\s\S]*?)<\/a><\/h2>/g
    for (const rx of [re, re2]) {
      let m: RegExpExecArray | null
      while ((m = rx.exec(html)) && hits.length < num) {
        const title = m[2].replace(/<[^>]+>/g, '').trim()
        if (!title || !m[1].startsWith('http')) continue
        hits.push({ title, url: m[1], snippet: '', host: hostOf(m[1]), date: null })
      }
      if (hits.length > 0) return hits
    }
    return []
  } catch {
    return []
  }
}

function hostOf(url: string | undefined): string {
  if (!url) return ''
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return '' }
}

// ---------------------------------------------------------------------------
// TEXT — chain for the price-estimation prompt
// ---------------------------------------------------------------------------
export async function llmText(prompt: string, timeoutMs = 20_000): Promise<string | null> {
  const failures: string[] = []

  const oa = visionApiConfig()
  if (oa) {
    try {
      const res = await openaiChat(oa, { messages: [{ role: 'user', content: prompt }], max_tokens: 400 }, timeoutMs)
      const content = contentOf(res)
      if (content) return content
      failures.push('vision-api: empty')
    } catch (e) {
      failures.push(`vision-api: ${String((e as Error)?.message || e).slice(0, 60)}`)
    }
  }

  if (Date.now() >= zaiCooldownUntil) {
    try {
      const res = await withZai(
        (z) => z.chat.completions.create({ messages: [{ role: 'user', content: prompt }], thinking: { type: 'disabled' } }) as Promise<unknown>,
        timeoutMs
      )
      const content = contentOf(res)
      if (content) return content
      failures.push('zai: empty')
    } catch (e) {
      noteZaiFailure(e)
      failures.push(`zai: ${String((e as Error)?.message || e).slice(0, 60)}`)
    }
  }

  try {
    const res = await pollinationsChat({ messages: [{ role: 'user', content: prompt }], max_tokens: 400 }, timeoutMs, 'openai-fast')
    const content = contentOf(res)
    if (content) return content
    failures.push('pollinations: empty')
  } catch (e) {
    failures.push(`pollinations: ${String((e as Error)?.message || e).slice(0, 60)}`)
  }

  console.warn('[ai-backends] text LLM failed everywhere:', failures.join(' | '))
  return null
}

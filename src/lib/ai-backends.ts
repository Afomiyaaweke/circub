import { getZaiClient, type ZaiClient } from '@/lib/zai-config'

// ---------------------------------------------------------------------------
// Multi-provider AI backends for the scan pipeline.
//
// WHY: the app's baked-in ZAI credentials point at internal-api.z.ai, which
// resolves to PRIVATE IPs (172.25.x.x) — reachable ONLY from inside the z.ai
// platform (sandboxes). From Vercel the connection fails with "fetch failed"
// (~10s stall). Additionally the shared platform account gets quota-429s.
//
// So /api/scan uses PROVIDER CHAINS — first configured/available provider
// wins, failures fall through:
//
//   identify (vision):  1. OpenAI-compatible API  (VISION_API_URL + VISION_API_KEY)
//                       2. ZAI direct             (works inside z.ai platform)
//                       3. Pollinations           (keyless, best-effort)
//
//   web search:         1. Tavily                 (TAVILY_API_KEY, free tier)
//                       2. ZAI web_search         (inside z.ai platform)
//                       3. DuckDuckGo HTML        (keyless, best-effort)
//
//   text (price est.):  1. OpenAI-compatible API
//                       2. ZAI chat
//                       3. Pollinations
//
// The ZAI direct path has a CIRCUIT BREAKER: a network failure (e.g. Vercel
// -> private IP) puts it on a 5-minute cooldown so scans don't stall; a 429
// quota block puts it on a 60-second cooldown.
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

async function pollinationsChat(body: Record<string, unknown>, timeoutMs: number): Promise<unknown> {
  const res = await fetch(POLLINATIONS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Referer: 'https://circub.vercel.app' },
    body: JSON.stringify({ model: 'openai', ...body }),
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!res.ok) throw new Error(`pollinations ${res.status}`)
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
  const content = String(data.choices?.[0]?.message?.content ?? '')
  // Pollinations' shared anonymous key sometimes answers HTTP 200 with a
  // budget/key notice instead of a completion (any length) — treat as failure.
  if (/budget|api key|raise the key/i.test(content)) throw new Error('pollinations quota/key exhausted')
  return data
}

// --- ZAI direct with circuit breaker ----------------------------------------
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
export async function identifyItem(imageDataUrl: string): Promise<VisionIdentify> {
  const messages = [{
    role: 'user',
    content: [
      { type: 'text', text: IDENTIFY_PROMPT },
      { type: 'image_url', image_url: { url: imageDataUrl } },
    ],
  }]
  const body = { messages, thinking: { type: 'disabled' }, max_tokens: 400 }

  const failures: string[] = []

  // 1) User-configured OpenAI-compatible API (Vercel-reachable, reliable)
  const oa = visionApiConfig()
  if (oa) {
    try {
      const res = await openaiChat(oa, { messages, max_tokens: 400 }, 25_000)
      const parsed = extractJson(contentOf(res))
      const out = normalizeIdentify(parsed, contentOf(res))
      if (out) return out
      failures.push('vision-api: unparseable response')
    } catch (e) {
      failures.push(`vision-api: ${String((e as Error)?.message || e).slice(0, 80)}`)
    }
  }

  // 2) ZAI direct (works inside the z.ai platform; breaker skips when down)
  if (Date.now() >= zaiCooldownUntil) {
    try {
      const res = await withZai(
        (z) => z.chat.completions.createVision(body) as Promise<unknown>,
        20_000
      )
      const parsed = extractJson(contentOf(res))
      const out = normalizeIdentify(parsed, contentOf(res))
      if (out) return out
      failures.push('zai: unparseable response')
    } catch (e) {
      noteZaiFailure(e)
      failures.push(`zai: ${String((e as Error)?.message || e).slice(0, 80)}`)
    }
  } else {
    failures.push(`zai: circuit-open ${Math.ceil(zaiCooldownRemainingMs() / 1000)}s`)
  }

  // 3) Pollinations (keyless, intermittent — final resort)
  try {
    const res = await pollinationsChat({ messages, max_tokens: 400 }, 25_000)
    const parsed = extractJson(contentOf(res))
    const out = normalizeIdentify(parsed, contentOf(res))
    if (out) return out
    failures.push('pollinations: unparseable response')
  } catch (e) {
    failures.push(`pollinations: ${String((e as Error)?.message || e).slice(0, 80)}`)
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

  // 3) DuckDuckGo HTML (keyless, best-effort, short timeout)
  try {
    const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(8_000),
    })
    if (res.ok) {
      const html = await res.text()
      const hits: SearchHit[] = []
      const re = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g
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
      failures.push('ddg: no results parsed')
    } else {
      failures.push(`ddg: ${res.status}`)
    }
  } catch (e) {
    failures.push(`ddg: ${String((e as Error)?.message || e).slice(0, 60)}`)
  }

  console.warn('[ai-backends] web search failed everywhere:', failures.join(' | '))
  return []
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
    const res = await pollinationsChat({ messages: [{ role: 'user', content: prompt }], max_tokens: 400 }, timeoutMs)
    const content = contentOf(res)
    if (content) return content
    failures.push('pollinations: empty')
  } catch (e) {
    failures.push(`pollinations: ${String((e as Error)?.message || e).slice(0, 60)}`)
  }

  console.warn('[ai-backends] text LLM failed everywhere:', failures.join(' | '))
  return null
}

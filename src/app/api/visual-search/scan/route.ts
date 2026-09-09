import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
// Prefer ZAI (chat.z.ai's underlying API) when configured. Fall back to
// Gemini, then to nothing (no VLM).
// Set ZAI_BASE_URL + ZAI_API_KEY on Vercel to use ZAI.
// Set GEMINI_API_KEY on Vercel to use Gemini as a fallback.
import { visionChatComplete as zaiVisionChat, chatComplete as zaiChat } from '@/lib/zai'
import { visionChatComplete as geminiVisionChat, chatComplete as geminiChat, isGeminiConfigured } from '@/lib/gemini'

// Wrap the providers so we can pick at runtime. ZAI is preferred (matches
// chat.z.ai's underlying API). If ZAI isn't configured, fall back to Gemini.
async function visionChatComplete(messages: any, options: any = {}): Promise<string> {
  try {
    return await zaiVisionChat(messages, options)
  } catch (e: any) {
    // If ZAI fails AND Gemini is configured, try Gemini.
    if (isGeminiConfigured()) {
      console.warn('[scan] ZAI vision failed, falling back to Gemini:', e?.message)
      return await geminiVisionChat(messages, options)
    }
    throw e
  }
}

async function chatComplete(messages: any, options: any = {}): Promise<string> {
  try {
    return await zaiChat(messages, options)
  } catch (e: any) {
    if (isGeminiConfigured()) {
      console.warn('[scan] ZAI chat failed, falling back to Gemini:', e?.message)
      return await geminiChat(messages, options)
    }
    throw e
  }
}

function vlmProviderName(): string {
  // For display in the scan response — shows which provider was actually used.
  // ZAI is preferred when its env vars are set; otherwise Gemini if GEMINI_API_KEY
  // is set; otherwise 'none'.
  if (process.env.ZAI_BASE_URL && process.env.ZAI_API_KEY) return 'zai'
  if (isGeminiConfigured()) return 'gemini'
  // Local dev sandbox falls back to ZAI via /etc/.z-ai-config
  return 'zai'
}

// Real-time camera scan — DB-first, AI-last pricing.
//
// FLOW (per the user's request):
//   1. SCAN     — VLM looks at the frame and identifies every purchasable
//                 product + bounding box. NO pricing from the VLM here.
//   2. SEARCH   — For each detected product, search the local price posts
//                 in the database, biased toward the user's location
//                 (same city > same country > anywhere).
//   3. AI PRICE — Only if no DB match exists, ask the VLM for a typical
//                 market price estimate in the user's location + currency.
//                 Clearly labeled as 'est.' vs 'local' in the UI.
//
// The endpoint accepts an optional location from the client:
//   - country (string) — e.g. "Ethiopia"
//   - city (string) — e.g. "Addis Ababa"
//   - currency (string) — e.g. "USD", "ETB", "KES"
// If location is not provided, we fall back to IP geolocation via the
// request's x-forwarded-for header (Vercel auto-provides this).

interface DetectedItem {
  label: string
  category: string
  box: { x: number; y: number; w: number; h: number }
  parent?: string | null
  isWholeProduct?: boolean
  // CCTV-style person segmentation: every detected item can be grouped
  // under the person it belongs to. A "person" item has personId set + a
  // "isPerson" flag; clothing/accessories the person is wearing get the
  // same personId so the UI can visually group them (e.g. draw a single
  // box around the person with their outfit's total price, plus boxes
  // for each item).
  personId?: number | null
  isPerson?: boolean
}

interface UserLocation {
  country?: string | null
  city?: string | null
  currency?: string | null
  source: 'client' | 'ip' | 'none'
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n))
}

function safeParseItems(raw: string): DetectedItem[] {
  try {
    const cleaned = raw.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(cleaned)
    const arr = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.items) ? parsed.items : []
    return arr
      .map((it: any): DetectedItem | null => {
        const label = String(it.label || it.name || '').trim().slice(0, 60)
        if (!label) return null
        const b = it.box || it.bbox || it.bounding_box || {}
        return {
          label,
          category: String(it.category || 'Other').trim().slice(0, 40),
          box: {
            x: clamp01(Number(b.x ?? b.left ?? 0)),
            y: clamp01(Number(b.y ?? b.top ?? 0)),
            w: clamp01(Number(b.w ?? b.width ?? 0.2)),
            h: clamp01(Number(b.h ?? b.height ?? 0.2)),
          },
          parent: it.parent ? String(it.parent).trim().slice(0, 60) : null,
          isWholeProduct: it.isWholeProduct === true || it.whole === true,
          personId: it.personId != null ? Number(it.personId) : null,
          isPerson: it.isPerson === true,
        }
      })
      .filter((x: DetectedItem | null): x is DetectedItem => !!x)
      .slice(0, 20)
  } catch {
    return []
  }
}

// Country → currency mapping (covers most countries; falls back to USD)
const COUNTRY_CURRENCY: Record<string, string> = {
  ethiopia: 'ETB', kenya: 'KES', uganda: 'UGX', tanzania: 'TZS', rwanda: 'RWF',
  ghana: 'GHS', nigeria: 'NGN', egypt: 'EGP', morocco: 'MAD', 'south africa': 'ZAR',
  malaysia: 'MYR', indonesia: 'IDR', thailand: 'THB', vietnam: 'VND',
  philippines: 'PHP', india: 'INR', pakistan: 'PKR', bangladesh: 'BDT',
  china: 'CNY', japan: 'JPY', 'south korea': 'KRW', taiwan: 'TWD',
  'united states': 'USD', usa: 'USD', 'united kingdom': 'GBP', uk: 'GBP',
  canada: 'CAD', australia: 'AUD', 'new zealand': 'NZD',
  germany: 'EUR', france: 'EUR', italy: 'EUR', spain: 'EUR', netherlands: 'EUR',
  belgium: 'EUR', austria: 'EUR', ireland: 'EUR', portugal: 'EUR', greece: 'EUR',
  finland: 'EUR', sweden: 'SEK', norway: 'NOK', denmark: 'DKK', switzerland: 'CHF',
  turkey: 'TRY', 'saudi arabia': 'SAR', uae: 'AED', 'united arab emirates': 'AED',
  qatar: 'QAR', kuwait: 'KWD', israel: 'ILS', iran: 'IRR', iraq: 'IQD',
  brazil: 'BRL', argentina: 'ARS', mexico: 'MXN', colombia: 'COP', chile: 'CLP',
  peru: 'PEN', venezuela: 'VES',
}

function currencyForCountry(country: string | null): string {
  if (!country) return 'USD'
  const c = country.toLowerCase().trim()
  return COUNTRY_CURRENCY[c] || 'USD'
}

// IP geolocation using a free public API (no auth, ~10k req/day per IP).
async function locateByIp(ip: string): Promise<UserLocation | null> {
  try {
    const res = await fetch(`https://ipapi.co/${ip}/json/`, {
      signal: AbortSignal.timeout(3000),
    })
    if (!res.ok) return null
    const data = await res.json()
    if (data?.error) return null
    const country = data.country_name || null
    const city = data.city || null
    if (!country) return null
    return { country, city, currency: currencyForCountry(country), source: 'ip' }
  } catch {
    return null
  }
}

async function resolveLocation(formData: FormData, req: NextRequest): Promise<UserLocation> {
  // Priority 1: client-provided location (most accurate — the user chose it)
  const clientCountry = (formData.get('country') as string | null)?.trim()
  const clientCity = (formData.get('city') as string | null)?.trim()
  const clientCurrency = (formData.get('currency') as string | null)?.trim()
  if (clientCountry) {
    return {
      country: clientCountry,
      city: clientCity || null,
      currency: clientCurrency || currencyForCountry(clientCountry),
      source: 'client',
    }
  }

  // Priority 2: IP geolocation (auto-detected)
  const forwardedFor = req.headers.get('x-forwarded-for') || ''
  const ip = forwardedFor.split(',')[0].trim()
  if (ip && !ip.startsWith('127.') && !ip.startsWith('10.') && !ip.startsWith('192.168.') && ip !== '::1') {
    const loc = await locateByIp(ip)
    if (loc) return loc
  }

  // Fallback: no location
  return { country: null, city: null, currency: 'USD', source: 'none' }
}

// ---- Label matching helpers ----
// We want a detection like "blue denim shirt" to match a LocalPricePost named
// "denim shirt" or in the "Clothing" category. Strategy:
//   - full label match (highest weight)
//   - last word match ("shirt")
//   - any word >3 chars match ("denim")
// Plus a small synonyms map so "shades" matches "sunglasses", etc.
const SYNONYMS: Record<string, string[]> = {
  sunglasses: ['shades', 'sunglasses', 'eyewear', 'glasses'],
  shirt: ['shirt', 'tshirt', 't-shirt', 'top', 'blouse'],
  shoes: ['shoes', 'sneakers', 'boots', 'sandals', 'footwear'],
  phone: ['phone', 'smartphone', 'iphone', 'android'],
  bottle: ['bottle', 'flask', 'container'],
  banana: ['banana', 'bananas'],
  coffee: ['coffee', 'espresso', 'latte'],
  water: ['water', 'h2o'],
}

function expandLabel(label: string): string[] {
  const lower = label.toLowerCase()
  const words = lower.split(/\s+/).filter(Boolean)
  const expansions = new Set<string>([lower, ...words])
  // Add synonyms for any word that has them
  for (const word of words) {
    for (const [canonical, syns] of Object.entries(SYNONYMS)) {
      if (syns.includes(word) || word === canonical) {
        for (const s of syns) expansions.add(s)
      }
    }
  }
  return Array.from(expansions)
}

function matches(a: string, b: string): boolean {
  const na = a.toLowerCase()
  const nb = b.toLowerCase()
  if (na.includes(nb) || nb.includes(na)) return true
  // Any word >3 chars from a that's in b
  return na.split(' ').some((w) => w.length > 3 && nb.includes(w))
}

function lastWord(s: string): string {
  return s.trim().split(/\s+/).slice(-1)[0] || s
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No frame provided' }, { status: 400 })
    if (file.size > 6 * 1024 * 1024) return NextResponse.json({ error: 'Frame too large.' }, { status: 400 })

    // Resolve the user's location for location-aware pricing.
    const location = await resolveLocation(formData, req)

    const buffer = Buffer.from(await file.arrayBuffer())
    const dataUrl = `data:${file.type || 'image/jpeg'};base64,${buffer.toString('base64')}`

    // ----------------------------------------------------------------
    // STEP 1 — SCAN (VLM identifies products + bounding boxes only)
    // ----------------------------------------------------------------
    let items: DetectedItem[] = []
    let aiUsed = false
    let aiError: string | null = null

    try {
      // CCTV-style detection prompt:
      //   - If people are visible, segment each person AND segment every
      //     purchasable item they're wearing or carrying, all grouped by
      //     a shared personId. The UI will draw one box per person + one
      //     box per item they're wearing, so the user can see "Person 1
      //     is wearing: shirt ($30), pants ($40), shoes ($50)" as a group.
      //   - If only products are visible (no people), segment them as
      //     standalone items with personId=null (e.g. a bottle on a shelf).
      //
      // We also still detect sub-parts of products (bottle + bottle cap).
      const visionPrompt =
        'You are a CCTV-style shopping camera. Look at the frame and detect every person, plus every distinct purchasable product or item that someone could buy, including but not limited to:\n' +
        '  - People (segment each person as a whole — isPerson=true, personId=N)\n' +
        '  - Clothing & wearables: shirt, pants, shoes, jacket, hat, sunglasses, watch, jewelry, bag, backpack\n' +
        '  - Food & drink: fruits, vegetables, bread, packaged snacks, bottles, cans, coffee, tea, prepared dishes\n' +
        '  - Household: cleaning supplies, kitchenware, furniture, decor, tools, appliances\n' +
        '  - Electronics: phones, laptops, headphones, chargers, accessories\n' +
        '  - Personal care: shampoo, soap, cosmetics, toiletries\n' +
        '  - Market/stall items: anything on a shelf, in a basket, or on display for sale\n' +
        '  - Services visible in frame: a sign advertising a haircut, taxi ride, etc.\n' +
        '\n' +
        'GROUPING RULES (CCTV-style):\n' +
        '  - If a person is visible, give them a personId (1, 2, 3, ...) and isPerson=true.\n' +
        '  - Every item the person is WEARING or CARRYING (shirt, pants, shoes, hat, glasses, watch, bag, etc.) must have the SAME personId and isPerson=false.\n' +
        '  - Items on a shelf, table, or in the background (not worn/carried by a person) have personId=null.\n' +
        '  - If no people are visible, all items have personId=null.\n' +
        '\n' +
        'For EVERY product (whether on a person or standalone), detect in separate entries:\n' +
        '  1. The WHOLE product (isWholeProduct=true, parent=null)\n' +
        '  2. Each major purchasable PART or component (isWholeProduct=false, parent=<the whole product label>)\n' +
        '\n' +
        'Use a SPECIFIC label for each item — include brand, color, material, type when visible. Examples:\n' +
        '  - "red plastic water bottle" instead of just "bottle"\n' +
        '  - "yellow banana" instead of just "banana"\n' +
        '  - "leather brown belt" instead of just "belt"\n' +
        '  - "person" (just the word "person" for the whole-person entry, since we add personId)\n' +
        '\n' +
        'For each detected item, output a tight bounding box around JUST that item, normalized 0-1 with (x,y) as the top-left corner, (w,h) as width/height fractions of the full frame.\n' +
        '\n' +
        'DO NOT include any price information. Just identify what products + people are in the frame.\n' +
        '\n' +
        'Respond with ONLY a JSON array, no prose, no markdown fences. Schema:\n' +
        '[{"label":"person","category":"Person","isPerson":true,"personId":1,"isWholeProduct":false,"parent":null,"box":{"x":0.1,"y":0.05,"w":0.4,"h":0.9}},\n' +
        ' {"label":"blue denim shirt","category":"Clothing","isPerson":false,"personId":1,"isWholeProduct":true,"parent":null,"box":{"x":0.15,"y":0.15,"w":0.3,"h":0.4}},\n' +
        ' {"label":"black sneakers","category":"Shoes","isPerson":false,"personId":1,"isWholeProduct":true,"parent":null,"box":{"x":0.2,"y":0.75,"w":0.25,"h":0.15}},\n' +
        ' {"label":"red plastic water bottle","category":"Bottles","isPerson":false,"personId":null,"isWholeProduct":true,"parent":null,"box":{"x":0.7,"y":0.5,"w":0.15,"h":0.3}}]\n' +
        '\n' +
        'If nothing purchasable AND no people are visible, respond with []. Max 20 items.'

      const raw = await visionChatComplete(
        [
          {
            role: 'user',
            content: [
              { type: 'text', text: visionPrompt },
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
          },
        ],
        { thinking: 'disabled' }
      )
      items = safeParseItems(raw)
      aiUsed = true
    } catch (e: any) {
      aiError = e?.message || String(e)
      console.error('[scan] vision call failed:', aiError)
      items = []
    }

    if (items.length === 0) {
    return NextResponse.json({ items: [], aiUsed, aiError, location, vlmProvider: vlmProviderName() })
    }

    // ----------------------------------------------------------------
    // STEP 2 — SEARCH (DB-first, location-aware)
    //
    // Build a broad OR clause that matches every detected label against
    // every relevant text field in LocalPricePost, then sort the results
    // so same-city > same-country > any-country posts bubble to the top.
    // ----------------------------------------------------------------
    const labelExpansions = items.flatMap((it) => expandLabel(it.label))
    const orClauses = labelExpansions.flatMap((l) => [
      { productName: { contains: l } },
      { productName: { contains: lastWord(l) } },
      { category: { contains: l } },
      { category: { contains: lastWord(l) } },
    ])

    const allPosts = await db.localPricePost.findMany({
      where: { OR: orClauses },
      select: {
        productName: true, category: true, currency: true,
        priceMin: true, priceMax: true, recommendedPrice: true,
        city: true, country: true,
      },
      take: 200,
      orderBy: { createdAt: 'desc' },
    })

    // Sort posts: same country + same city first, then same country, then any.
    function postScore(p: { country: string; city: string | null }) {
      if (location.country && p.country.toLowerCase() === location.country.toLowerCase()) {
        if (location.city && p.city && p.city.toLowerCase() === location.city.toLowerCase()) return 3
        return 2
      }
      return 1
    }
    const posts = [...allPosts].sort((a, b) => postScore(b) - postScore(a))

    // ----------------------------------------------------------------
    // STEP 3 — PRICE every detected item (DB first, AI last)
    //
    // For each detected item:
    //   - If we found matching local posts → use those (source: 'internal')
    //   - If no DB match → ask the VLM for an estimate in the user's
    //     location (source: 'external')
    //
    // Batch the VLM call so we make at most ONE extra request per scan
    // for all the unmatched items combined.
    // ----------------------------------------------------------------
    const matchedItemIndices = new Set(
      items.map((it, i) =>
        posts.some((p) => matches(p.productName, it.label) || matches(p.category, it.label)) ? i : -1
      ).filter((i) => i >= 0)
    )

    const unmatchedLabels = items
      .map((it, i) => ({ label: it.label, index: i, isPerson: it.isPerson }))
      .filter(({ index, isPerson }) => !matchedItemIndices.has(index) && !isPerson)
      .map(({ label }) => label)

    let estimates: Record<string, { min: number; max: number }> = {}
    if (unmatchedLabels.length > 0 && aiUsed) {
      try {
        const locationPhrase = location.country
          ? `in ${location.city ? location.city + ', ' : ''}${location.country}`
          : 'globally (use international average market price)'
        const currencyCode = location.currency || 'USD'

        const raw = await chatComplete(
          [
            {
              role: 'user',
              content:
                `Give a realistic typical retail market price range in ${currencyCode} for each of these items, ` +
                `priced as they would sell ${locationPhrase} (use local market/street prices, not tourist prices). ` +
                `Items: ${unmatchedLabels.map((l) => `"${l}"`).join(', ')}. ` +
                `Respond with ONLY JSON, no prose: {"item label": {"min": number, "max": number}, ...}. ` +
                `Prices must reflect what a local would actually pay at a market or shop in ${location.country || 'a typical city'}.`,
            },
          ],
          { thinking: 'disabled' }
        )
        const cleaned = raw.replace(/```json|```/g, '').trim()
        const parsed = JSON.parse(cleaned)
        if (parsed && typeof parsed === 'object') {
          for (const [k, v] of Object.entries<any>(parsed)) {
            if (v && typeof v.min === 'number' && typeof v.max === 'number') {
              estimates[k] = { min: v.min, max: v.max }
            }
          }
        }
      } catch (e) {
        // leave estimates empty — item will just show "no price found"
      }
    }

    const results = items.map((it) => {
      // Person entries have no price — they're just visual grouping boxes.
      // Their outfit total is computed client-side from the items they own.
      if (it.isPerson) {
        return { ...it, price: null }
      }
      const matchingPosts = posts.filter((p) => matches(p.productName, it.label) || matches(p.category, it.label))
      if (matchingPosts.length > 0) {
        // Pick the highest-scoring posts (same city/country first).
        const topScore = postScore(matchingPosts[0])
        const localPosts = matchingPosts.filter((p) => postScore(p) === topScore)
        const mins = localPosts.map((p) => p.priceMin)
        const maxs = localPosts.map((p) => p.priceMax)
        const currencyUsed = localPosts[0].currency
        return {
          ...it,
          price: {
            source: 'internal' as const,
            currency: currencyUsed,
            min: Math.min(...mins),
            max: Math.max(...maxs),
            sampleCount: localPosts.length,
            city: localPosts[0].city,
            country: localPosts[0].country,
          },
        }
      }
      const est = estimates[it.label]
      if (est) {
        return {
          ...it,
          price: {
            source: 'external' as const,
            currency: location.currency || 'USD',
            min: est.min,
            max: est.max,
            sampleCount: 0,
            city: location.city,
            country: location.country,
          },
        }
      }
      return { ...it, price: null }
    })

    return NextResponse.json({ items: results, aiUsed, aiError, location, vlmProvider: vlmProviderName() })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Scan failed.' }, { status: 500 })
  }
}

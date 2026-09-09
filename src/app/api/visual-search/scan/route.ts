import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { visionChatComplete, chatComplete } from '@/lib/zai'

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
        }
      })
      .filter((x: DetectedItem | null): x is DetectedItem => !!x)
      .slice(0, 12)
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
      // Detection-only prompt. The VLM is asked to identify products and
      // parts WITHOUT pricing them — pricing is a separate step that only
      // fires when the DB has no match for that product.
      const visionPrompt =
        'You are a real-time shopping camera. Look at this frame and detect every distinct purchasable product or item that someone could buy, including but not limited to:\n' +
        '  - Clothing & wearables: shirt, pants, shoes, jacket, hat, sunglasses, watch, jewelry, bag, backpack\n' +
        '  - Food & drink: fruits, vegetables, bread, packaged snacks, bottles, cans, coffee, tea, prepared dishes\n' +
        '  - Household: cleaning supplies, kitchenware, furniture, decor, tools, appliances\n' +
        '  - Electronics: phones, laptops, headphones, chargers, accessories\n' +
        '  - Personal care: shampoo, soap, cosmetics, toiletries\n' +
        '  - Market/stall items: anything on a shelf, in a basket, or on display for sale\n' +
        '  - Services visible in frame: a sign advertising a haircut, taxi ride, etc.\n' +
        '\n' +
        'For EVERY product, detect in separate entries:\n' +
        '  1. The WHOLE product (isWholeProduct=true, parent=null)\n' +
        '  2. Each major purchasable PART or component (isWholeProduct=false, parent=<the whole product label>)\n' +
        '\n' +
        'Use a SPECIFIC label for each item — include brand, color, material, type when visible. Examples:\n' +
        '  - "red plastic water bottle" instead of just "bottle"\n' +
        '  - "yellow banana" instead of just "banana"\n' +
        '  - "leather brown belt" instead of just "belt"\n' +
        '\n' +
        'For each detected item, output a tight bounding box around JUST that item, normalized 0-1 with (x,y) as the top-left corner, (w,h) as width/height fractions of the full frame.\n' +
        '\n' +
        'DO NOT include any price information. Just identify what the products are.\n' +
        '\n' +
        'Respond with ONLY a JSON array, no prose, no markdown fences. Schema:\n' +
        '[{"label":"red plastic water bottle","category":"Bottles","isWholeProduct":true,"parent":null,"box":{"x":0.22,"y":0.15,"w":0.18,"h":0.5}},\n' +
        ' {"label":"bottle cap","category":"Bottle Caps","isWholeProduct":false,"parent":"red plastic water bottle","box":{"x":0.22,"y":0.10,"w":0.18,"h":0.08}}]\n' +
        '\n' +
        'If nothing purchasable is visible, respond with []. Max 12 items.'

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
      return NextResponse.json({ items: [], aiUsed, aiError, location })
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
      .map((it, i) => ({ label: it.label, index: i }))
      .filter(({ index }) => !matchedItemIndices.has(index))
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

    return NextResponse.json({ items: results, aiUsed, aiError, location })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Scan failed.' }, { status: 500 })
  }
}

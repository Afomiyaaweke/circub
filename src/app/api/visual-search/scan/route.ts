import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// Real-time camera scan: given one video frame, detect every wearable/product
// item in view (shirt, pants, shoes, bag, watch, etc), return a normalized
// bounding box per item, then price each item from two sources:
//   1. INTERNAL  — matching posts already in the Local Price Feed (real
//      prices contributed by locals/travelers), aggregated into a range.
//   2. EXTERNAL  — when there's no internal match, ask the vision model for
//      a typical street/retail market price estimate, clearly labeled as an
//      estimate rather than a verified local price.
//
// This is polled every couple of seconds by the client while the camera is
// open, so it needs to stay fast: one VLM call per frame, one DB query
// (batched OR clause) covering every detected item.

interface DetectedItem {
  label: string
  category: string
  box: { x: number; y: number; w: number; h: number } // normalized 0-1, top-left origin
  parent?: string | null // when this item is a part/component of another (e.g. "bottle cap" is part of "bottle")
  isWholeProduct?: boolean // true for the whole product, false for sub-parts
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

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const currency = (formData.get('currency') as string) || 'USD'
    if (!file) return NextResponse.json({ error: 'No frame provided' }, { status: 400 })
    if (file.size > 6 * 1024 * 1024) return NextResponse.json({ error: 'Frame too large.' }, { status: 400 })

    const buffer = Buffer.from(await file.arrayBuffer())
    const dataUrl = `data:${file.type || 'image/jpeg'};base64,${buffer.toString('base64')}`

    let items: DetectedItem[] = []
    let aiUsed = false

    try {
      const ZAI = (await import('z-ai-web-dev-sdk')).default
      const zai = await ZAI.create()

      // Pass 1: granular object detection with bounding boxes.
      // For each product in frame, we ask the model to detect BOTH the whole
      // product AND its major purchasable parts/components separately, so the
      // user sees the price of the whole item AND the price of each component.
      //
      // Examples:
      //   - A bottle → "plastic bottle" (whole) + "bottle cap/lid" (part)
      //   - A pair of shoes → "leather sneaker" (whole) + "shoe laces" + "rubber sole"
      //   - A backpack → "canvas backpack" (whole) + "zipper pull" + "shoulder strap"
      //   - A watch → "wristwatch" (whole) + "leather watch strap" + "watch face"
      //   - Sunglasses → "sunglasses" (whole) + "sunglasses frame" + "sunglasses lenses"
      //
      // Each item gets its own bounding box. The user can pick the whole product
      // to see its full price, or pick a part to see just the part price (useful
      // for replacements, repairs, or understanding what's included).
      const detectRes = await zai.chat.completions.createVision({
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text:
                  'You are a real-time shopping camera with granular part segmentation. ' +
                  'Look at this frame and detect every distinct purchasable product you can see ' +
                  '(clothing, accessories, shoes, bags, bottles, electronics, food packaging, household items, etc.). ' +
                  '\n\n' +
                  'For EVERY product, you MUST detect TWO things in separate entries:\n' +
                  '  1. The WHOLE product (isWholeProduct=true, parent=null)\n' +
                  '  2. Each major purchasable PART or component of that product (isWholeProduct=false, parent=<the whole product label>)\n' +
                  '\n' +
                  'Examples of parts to detect:\n' +
                  '  - Bottle → whole bottle + bottle cap/lid + bottle label (if separable)\n' +
                  '  - Shoes → whole shoe + shoe laces + rubber sole + insole\n' +
                  '  - Backpack → whole backpack + shoulder straps + zipper + front pocket\n' +
                  '  - Watch → whole watch + watch strap/band + watch face/dial\n' +
                  '  - Sunglasses → whole sunglasses + frame + lenses\n' +
                  '  - Shirt → whole shirt + buttons + collar\n' +
                  '  - Phone → whole phone + phone case + screen protector\n' +
                  '\n' +
                  'For each detected item (whole OR part), output a tight bounding box around JUST that item, ' +
                  'normalized 0-1 with (x,y) as the top-left corner, (w,h) as width/height fractions of the full frame.\n' +
                  '\n' +
                  'Respond with ONLY a JSON array, no prose, no markdown fences. Schema:\n' +
                  '[{"label":"plastic water bottle","category":"Bottles","isWholeProduct":true,"parent":null,"box":{"x":0.22,"y":0.15,"w":0.18,"h":0.5}},\n' +
                  ' {"label":"bottle cap","category":"Bottle Caps","isWholeProduct":false,"parent":"plastic water bottle","box":{"x":0.22,"y":0.10,"w":0.18,"h":0.08}}]\n' +
                  '\n' +
                  'If nothing purchasable is visible, respond with []. Max 12 items.',
              },
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
          },
        ],
        thinking: { type: 'disabled' },
      })
      const raw = detectRes.choices?.[0]?.message?.content || '[]'
      items = safeParseItems(raw)
      aiUsed = true
    } catch {
      items = []
    }

    if (items.length === 0) {
      return NextResponse.json({ items: [], aiUsed })
    }

    function lastWord(s: string) {
      return s.trim().split(/\s+/).slice(-1)[0] || s
    }

    function matches(a: string, b: string) {
      const na = a.toLowerCase()
      const nb = b.toLowerCase()
      return na.includes(nb) || nb.includes(na) || na.split(' ').some((w) => w.length > 3 && nb.includes(w))
    }

    // INTERNAL SOURCE — pull matching local price posts for all detected labels in one query.
    // We match on the full label ("blue denim shirt") AND its last word ("shirt") against
    // both productName and category, so a specific detection still hits a broader post.
    const labels = items.map((it) => it.label)
    const orClauses = labels.flatMap((l) => [
      { productName: { contains: l } },
      { productName: { contains: lastWord(l) } },
      { category: { contains: lastWord(l) } },
    ])
    const posts = await db.localPricePost.findMany({
      where: { OR: orClauses },
      select: { productName: true, category: true, currency: true, priceMin: true, priceMax: true, recommendedPrice: true, city: true, country: true },
      take: 200,
      orderBy: { createdAt: 'desc' },
    })

    // EXTERNAL SOURCE fallback — ask the model for a typical market price estimate
    // for items with no internal match yet, in a single batched call.
    const unmatchedLabels = items
      .filter((it) => !posts.some((p) => matches(p.productName, it.label) || matches(p.category, it.label)))
      .map((it) => it.label)

    let estimates: Record<string, { min: number; max: number }> = {}
    if (unmatchedLabels.length > 0 && aiUsed) {
      try {
        const ZAI = (await import('z-ai-web-dev-sdk')).default
        const zai = await ZAI.create()
        const estRes = await zai.chat.completions.create({
          messages: [
            {
              role: 'user',
              content:
                `Give a realistic typical retail market price range in ${currency} for each of these clothing/accessory items: ${unmatchedLabels
                  .map((l) => `"${l}"`)
                  .join(', ')}. ` +
                'Respond with ONLY JSON, no prose: {"item label": {"min": number, "max": number}, ...}',
            },
          ],
          thinking: { type: 'disabled' },
        })
        const raw = estRes.choices?.[0]?.message?.content || '{}'
        const cleaned = raw.replace(/```json|```/g, '').trim()
        const parsed = JSON.parse(cleaned)
        if (parsed && typeof parsed === 'object') {
          for (const [k, v] of Object.entries<any>(parsed)) {
            if (v && typeof v.min === 'number' && typeof v.max === 'number') estimates[k] = { min: v.min, max: v.max }
          }
        }
      } catch {
        // leave estimates empty — item will just show "no price found"
      }
    }

    const results = items.map((it) => {
      const matchingPosts = posts.filter((p) => matches(p.productName, it.label) || matches(p.category, it.label))
      if (matchingPosts.length > 0) {
        const mins = matchingPosts.map((p) => p.priceMin)
        const maxs = matchingPosts.map((p) => p.priceMax)
        const currencyUsed = matchingPosts[0].currency
        return {
          ...it,
          price: {
            source: 'internal' as const,
            currency: currencyUsed,
            min: Math.min(...mins),
            max: Math.max(...maxs),
            sampleCount: matchingPosts.length,
            city: matchingPosts[0].city,
            country: matchingPosts[0].country,
          },
        }
      }
      const est = estimates[it.label]
      if (est) {
        return {
          ...it,
          price: { source: 'external' as const, currency, min: est.min, max: est.max, sampleCount: 0 },
        }
      }
      return { ...it, price: null }
    })

    return NextResponse.json({ items: results, aiUsed })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Scan failed.' }, { status: 500 })
  }
}

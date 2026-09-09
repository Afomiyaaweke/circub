import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// Visual search — works like chat.z.ai's image understanding:
//   1. Send the image to Z.ai's GLM vision model (the same API that
//      powers chat.z.ai) and ask it to identify the product, describe
//      it, and estimate a typical market price.
//   2. Search the local price posts DB for matching products — real
//      prices posted by locals.
//   3. Return BOTH so the UI can show:
//        - AI identification + description + price estimate
//        - Matching local posts with real prices from locals
//
// The UI (camera-capture-button + local-feed-tab) uses the AI keywords
// to fill the search box AND shows a results panel with both sources.

interface LocalMatch {
  id: string
  productName: string
  category: string
  currency: string
  priceMin: number
  priceMax: number
  recommendedPrice: number | null
  city: string | null
  country: string
  helpfulCount: number
  author: {
    id: string
    name: string
    avatarColor: string
    isLocal: boolean
    verifiedLocal: boolean
  }
}

function matches(a: string, b: string): boolean {
  const na = a.toLowerCase()
  const nb = b.toLowerCase()
  return na.includes(nb) || nb.includes(na) || na.split(' ').some((w) => w.length > 3 && nb.includes(w))
}

function lastWord(s: string): string {
  return s.trim().split(/\s+/).slice(-1)[0] || s
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    const allowedTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
    if (!allowedTypes.includes(file.type)) return NextResponse.json({ error: 'Invalid file type.' }, { status: 400 })
    if (file.size > 5 * 1024 * 1024) return NextResponse.json({ error: 'Image too large. Max 5 MB.' }, { status: 400 })
    const buffer = Buffer.from(await file.arrayBuffer())
    const base64 = buffer.toString('base64')
    const dataUrl = `data:${file.type};base64,${base64}`

    let keywords = ''
    let aiDescription = ''
    let aiPriceEstimate: { min: number; max: number; currency: string } | null = null
    let aiUsed = false

    // ---- STEP 1: Ask Z.ai's VLM (same API as chat.z.ai) ----
    // The prompt asks for identification + description + price estimate
    // in a structured JSON format — like how chat.z.ai would respond if
    // you uploaded an image and asked "what is this and how much does it
    // cost?"
    try {
      const ZAI = (await import('z-ai-web-dev-sdk')).default
      const zai = await ZAI.create()
      const response = await zai.chat.completions.createVision({
        messages: [{ role: 'user', content: [
          { type: 'text', text:
            'You are a shopping assistant. Look at this image and identify the main product or item.\n' +
            'Respond with ONLY a JSON object (no markdown, no prose):\n' +
            '{"keywords":"2-3 short search keywords separated by commas","description":"one sentence describing what you see","productName":"the most specific name for the main product","estimatedPrice":{"min":number,"max":number,"currency":"USD"}}\n' +
            'For the estimatedPrice, give a realistic typical retail/market price range in USD. If you cannot identify a purchasable product, set estimatedPrice to null and description to "Could not identify a product in this image."'
          },
          { type: 'image_url', image_url: { url: dataUrl } },
        ]}], thinking: { type: 'disabled' },
      })
      const raw = (response.choices?.[0]?.message?.content || '').trim()
      const cleaned = raw.replace(/```json|```/g, '').trim()
      const parsed = JSON.parse(cleaned)
      keywords = (parsed.keywords || '').trim()
      aiDescription = (parsed.description || '').trim()
      if (parsed.estimatedPrice && typeof parsed.estimatedPrice.min === 'number' && typeof parsed.estimatedPrice.max === 'number') {
        aiPriceEstimate = {
          min: parsed.estimatedPrice.min,
          max: parsed.estimatedPrice.max,
          currency: parsed.estimatedPrice.currency || 'USD',
        }
      }
      aiUsed = true
    } catch {
      // Fallback: use the filename as keywords
      const basename = file.name.replace(/\.(png|jpg|jpeg|webp|gif)$/i, '').replace(/[-_]/g, ' ').replace(/\d+/g, ' ').trim()
      keywords = basename || 'product'
      aiDescription = 'AI analysis unavailable. Using filename as search keyword.'
    }

    // ---- STEP 2: Search the local price posts DB ----
    // Use the AI-identified keywords + product name to find matching
    // local price posts — real prices posted by locals in the user's
    // area.
    let localMatches: LocalMatch[] = []
    if (keywords || aiDescription) {
      const searchTerms = [keywords, ...keywords.split(',').map((s) => s.trim())].filter(Boolean)
      const orClauses = searchTerms.flatMap((term) => [
        { productName: { contains: term } },
        { productName: { contains: lastWord(term) } },
        { category: { contains: term } },
        { category: { contains: lastWord(term) } },
      ])
      if (orClauses.length > 0) {
        const posts = await db.localPricePost.findMany({
          where: { OR: orClauses },
          select: {
            id: true, productName: true, category: true, currency: true,
            priceMin: true, priceMax: true, recommendedPrice: true,
            city: true, country: true, helpfulCount: true,
            author: {
              select: {
                id: true, name: true, avatarColor: true,
                isLocal: true, verifiedLocal: true,
              },
            },
          },
          take: 12,
          orderBy: { helpfulCount: 'desc' },
        })
        // Filter to only posts that actually match one of the search terms
        localMatches = posts.filter((p) =>
          searchTerms.some((term) => matches(p.productName, term) || matches(p.category, term))
        )
      }
    }

    return NextResponse.json({
      keywords,
      aiDescription,
      aiPriceEstimate,
      aiUsed,
      localMatches,
      raw: keywords,
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Visual search failed.' }, { status: 500 })
  }
}

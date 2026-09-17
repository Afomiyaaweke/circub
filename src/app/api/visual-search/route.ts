import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { identifyItem, llmText } from '@/lib/ai-backends'
import { currencyForCountry } from '@/lib/location'
import { caseInsensitiveWhere } from '@/lib/search'

export const runtime = 'nodejs'
export const maxDuration = 60

// ============================================================================
// VISUAL SEARCH ("Camera search" from the Local Price Feed)
//   1. Identify the product in the image via the SAME multi-provider vision
//      chain the PriceLens scanner uses (@/lib/ai-backends -> Gemini /
//      OpenAI-compatible / ZAI / keyless fallbacks). The old version called
//      the raw ZAI SDK directly, which is unreachable from Vercel - every
//      camera search in production silently degraded to filename keywords
//      and the feed search "stopped working".
//   2. Estimate a price range with a text LLM IN THE USER'S LOCAL CURRENCY
//      so it can be compared 1:1 against local price posts.
//   3. Search the local price posts DB and RANK matches by the user's
//      location (same city > same country > elsewhere) and compute a
//      location-based comparison summary (AI estimate vs prices near you).
//
//   TWO MODES:
//   - image mode: FormData 'file' - full AI vision identification.
//   - text mode:  FormData 'query' (no file) - "search first before
//     uploading a product pic": the user types the product name and gets
//     the SAME location-ranked local price comparison without any photo.
// ============================================================================

interface SearchLocation {
  city?: string | null
  country?: string | null
  countryCode?: string | null
}

type LocMatch = 'city' | 'country' | 'world'

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
  locMatch: LocMatch
  author: {
    id: string
    name: string
    avatarColor: string
    isLocal: boolean
    verifiedLocal: boolean
  }
}

interface LocationCompare {
  scope: 'city' | 'country'
  place: string
  count: number
  min: number
  max: number
  currency: string
}

function matches(a: string, b: string): boolean {
  const na = a.toLowerCase()
  const nb = b.toLowerCase()
  return na.includes(nb) || nb.includes(na) || na.split(' ').some((w) => w.length > 3 && nb.includes(w))
}

// Significant words of a phrase: lowercase, punctuation/parenthesised specs
// stripped, numbers and 1-2 char tokens dropped ("500g" stays, "15" goes).
function significantWords(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !/^\d+$/.test(w))
}

function placeName(location: SearchLocation | null): string {
  if (!location) return 'worldwide'
  if (location.city) return `${location.city}${location.country ? ', ' + location.country : ''}`
  return location.country || 'worldwide'
}

// Parse "45-120" / "45 to 120" / "45-120" out of an LLM answer.
function parseRange(content: string): { min: number; max: number } | null {
  const m = content.match(/([\d][\d,\.]*)\s*(?:-|-|-|to|~)\s*\$?\s*([\d][\d,\.]*)/i)
  if (!m) return null
  const low = Number(m[1].replace(/[,\s]/g, ''))
  const high = Number(m[2].replace(/[,\s]/g, ''))
  if (!Number.isFinite(low) || !Number.isFinite(high)) return null
  if (low <= 0 || high < low || high > 50_000_000) return null
  return { min: low, max: high }
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    // Text mode - "search first before uploading product pic": a typed
    // product name instead of an image. Both modes share the whole
    // location-ranked search pipeline below.
    const rawQuery = formData.get('query')
    const textQuery = typeof rawQuery === 'string' ? rawQuery.trim().slice(0, 120) : ''
    if (!file && !textQuery) return NextResponse.json({ error: 'No file or query provided' }, { status: 400 })
    if (file) {
      const allowedTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
      if (!allowedTypes.includes(file.type)) return NextResponse.json({ error: 'Invalid file type.' }, { status: 400 })
      if (file.size > 5 * 1024 * 1024) return NextResponse.json({ error: 'Image too large. Max 5 MB.' }, { status: 400 })
    }

    // Optional client location (JSON string) - used to rank local matches
    // and to convert the AI estimate into the user's local currency.
    let location: SearchLocation | null = null
    const rawLocation = formData.get('location')
    if (typeof rawLocation === 'string' && rawLocation.trim()) {
      try {
        const parsed = JSON.parse(rawLocation)
        if (parsed && typeof parsed === 'object') {
          location = {
            city: typeof parsed.city === 'string' ? parsed.city : null,
            country: typeof parsed.country === 'string' ? parsed.country : null,
            countryCode: typeof parsed.countryCode === 'string' ? parsed.countryCode : null,
          }
        }
      } catch { /* ignore malformed location - search continues worldwide */ }
    }

    // ---- STEP 1: Identify the product ----
    let name = ''
    let brand: string | null = null
    let category: string | null = null
    let aiDescription = ''
    let searchQuery = ''
    let aiUsed = false
    let identified = false
    const mode: 'image' | 'text' = file ? 'image' : 'text'

    if (file) {
      const buffer = Buffer.from(await file.arrayBuffer())
      const base64 = buffer.toString('base64')
      const dataUrl = `data:${file.type};base64,${base64}`

      try {
        const ident = await identifyItem(dataUrl)
        name = ident.name || ''
        brand = ident.brand ?? null
        category = ident.category ?? null
        aiDescription = ident.description || ''
        searchQuery = ident.searchQuery || ''
        aiUsed = true
        identified = !!name && name.toLowerCase() !== 'unknown item'
      } catch {
        // All AI providers failed - degrade to filename keywords (same honest
        // behaviour as before, but now only when EVERY provider is down).
      }

      if (!identified) {
        if (aiUsed) {
          // The AI answered but found no purchasable product - do NOT fall
          // back to filename noise (that made the feed search look broken).
          return NextResponse.json({
            keywords: '',
            searchTerm: '',
            aiDescription: 'Could not identify a product in this image.',
            aiPriceEstimate: null,
            aiUsed: true,
            identified: false,
            localMatches: [],
            locationCompare: null,
            location,
            mode,
          })
        }
        // ALL AI providers failed - degrade to filename keywords (honest last
        // resort, same behaviour as before but only when everything is down).
        name = file.name.replace(/\.(png|jpg|jpeg|webp|gif)$/i, '').replace(/[-_]/g, ' ').replace(/\d+/g, ' ').trim()
        aiDescription = 'AI analysis unavailable. Using filename as search keyword.'
      }
    } else {
      // TEXT MODE - the product name is typed by the user; no vision needed.
      name = textQuery
      searchQuery = textQuery
      identified = true
    }

    const keywords = [name, brand, category].filter(Boolean).join(', ')

    // No usable identification at all AND no filename hints - tell the client.
    if (!name.trim()) {
      return NextResponse.json({
        keywords: '',
        searchTerm: '',
        aiDescription: 'Could not identify a product in this image.',
        aiPriceEstimate: null,
        aiUsed,
        identified: false,
        localMatches: [],
        locationCompare: null,
        location,
        mode,
      })
    }

    // ---- STEP 2: Candidate search terms + local price posts (location-ranked) ----
    const nameWords = significantWords(name)
    const queryWords = significantWords(searchQuery)
    const brandWords = significantWords(brand || '')
    const allWords = Array.from(new Set([...nameWords, ...queryWords, ...brandWords, ...(category ? [category.toLowerCase()] : [])]))
      .filter((w) => w.length > 2)
      .slice(0, 12)

    // Candidates for the feed search box - longest/most specific first. The
    // one that actually matches the most local posts wins (checked below).
    const termCandidates = Array.from(new Set([
      nameWords.slice(0, 3).join(' '),
      nameWords.slice(0, 2).join(' '),
      queryWords.slice(0, 3).join(' '),
      queryWords.slice(0, 2).join(' '),
      category ? category.toLowerCase() : '',
    ]).values()).filter(Boolean)

    const orClauses = [
      ...termCandidates.map((t) => ({ productName: { contains: t } })),
      ...allWords.flatMap((w) => [{ productName: { contains: w } }, { category: { contains: w } }]),
    ]

    let localMatches: LocalMatch[] = []
    let searchTerm = termCandidates[0] || name
    if (orClauses.length > 0) {
      const posts = await db.localPricePost.findMany({
        // caseInsensitiveWhere: production Postgres `contains` is CASE-SENSITIVE
        // (searching "dax" missed posts named "DAX" - "not found but it's there").
        where: caseInsensitiveWhere({ OR: orClauses }),
        select: {
          id: true, productName: true, category: true, currency: true,
          priceMin: true, priceMax: true, recommendedPrice: true,
          city: true, country: true, helpfulCount: true,
          author: { select: { id: true, name: true, avatarColor: true, isLocal: true, verifiedLocal: true } },
        },
        take: 40,
        orderBy: { helpfulCount: 'desc' },
      })

      // Keep only posts that genuinely match one of the terms/words.
      const filtered = posts.filter((p) =>
        [...termCandidates, ...allWords].some((term) => matches(p.productName, term) || matches(p.category, term))
      )

      // Location scoring - same city beats same country beats everywhere else.
      const locCountry = (location?.country || '').toLowerCase()
      const locCity = (location?.city || '').toLowerCase()
      const scored = filtered.map((p) => {
        let score = 1
        let locMatch: LocMatch = 'world'
        const pc = (p.country || '').toLowerCase()
        const pcity = (p.city || '').toLowerCase()
        if (locCountry && pc && (pc === locCountry || pc.includes(locCountry) || locCountry.includes(pc))) {
          score = 2
          locMatch = 'country'
        }
        if (locCity && pcity && (pcity === locCity || pcity.includes(locCity) || locCity.includes(pcity))) {
          score = 3
          locMatch = 'city'
        }
        return { p, score, locMatch }
      }).sort((a, b) => b.score - a.score || b.p.helpfulCount - a.p.helpfulCount)

      localMatches = scored.slice(0, 12).map(({ p, locMatch }) => ({
        id: p.id,
        productName: p.productName,
        category: p.category,
        currency: p.currency,
        priceMin: p.priceMin,
        priceMax: p.priceMax,
        recommendedPrice: p.recommendedPrice,
        city: p.city,
        country: p.country,
        helpfulCount: p.helpfulCount,
        locMatch,
        author: p.author,
      }))

      // Pick the search term that matches the most local posts (ties go to
      // the longer, more specific candidate listed first).
      let bestCount = -1
      for (const t of termCandidates) {
        const c = localMatches.filter((p) => matches(p.productName, t) || matches(p.category, t)).length
        if (c > bestCount) { bestCount = c; searchTerm = t }
      }
    }

    // ---- STEP 3: Location-based comparison summary ----
    // "Prices near you" = best available scope (city, else country).
    const near = localMatches.filter((m) => m.locMatch === 'city')
    const inCountry = localMatches.filter((m) => m.locMatch === 'country')
    const scopeGroup = near.length > 0 ? near : inCountry
    let locationCompare: LocationCompare | null = null
    if (scopeGroup.length > 0) {
      locationCompare = {
        scope: near.length > 0 ? 'city' : 'country',
        place: placeName(location),
        count: scopeGroup.length,
        min: Math.min(...scopeGroup.map((m) => m.priceMin)),
        max: Math.max(...scopeGroup.map((m) => m.priceMax)),
        currency: scopeGroup[0].currency,
      }
    }

    // ---- STEP 4: AI price estimate IN THE USER'S LOCAL CURRENCY ----
    // Same currency as the local posts whenever the mapping is known, so the
    // client can compare them directly. Skipped entirely when local prices
    // already cover the user's city (the real prices are the better answer
    // and this saves seconds).
    let aiPriceEstimate: { min: number; max: number; currency: string } | null = null
    const localCurrency = currencyForCountry(location?.countryCode)
    if (!locationCompare && localCurrency) {
      try {
        const content = await llmText(
          `What does "${name}" typically cost in ${placeName(location)}? Answer in ${localCurrency} only.\n` +
          `Reply with ONLY a range in the exact form LOW-HIGH (example: 45-120). No words, no currency symbol.`,
          15_000
        )
        if (content) {
          const range = parseRange(content)
          if (range) aiPriceEstimate = { ...range, currency: localCurrency }
        }
      } catch { /* estimate is optional - local matches are the primary result */ }
    }

    return NextResponse.json({
      keywords,
      searchTerm,
      aiDescription,
      aiPriceEstimate,
      aiUsed,
      identified,
      localMatches,
      locationCompare,
      location,
      mode,
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Visual search failed.' }, { status: 500 })
  }
}

// AI guide + location recommender.
//
// POST /api/guides/recommend { question, lat?, lng? }
//
// The user asks anything ("Where can I see rock churches? Who can take me
// around Lalibela?") - or clicks a question pulled from the community feed -
// and we return:
//   guides:    ranked registered guides with a one-line "why" reason
//   locations: recommended places/attractions matching the question
//
// Tiered so the response ALWAYS has recommendations when any guide exists
// (same philosophy as the never-"price not found" estimate fix):
//   1. LLM full match  - structured JSON {summary, guides[], locations[]}
//   2. LLM narrow      - "reply ONLY guide ids, comma separated"
//   3. Keyword scoring - server-side overlap scoring, zero external calls
// Locations fall back to a curated attraction bucket table.
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { llmText, parseLooseJson } from '@/lib/ai-backends'
import { guideDistanceKm } from '@/lib/geo'

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'if', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been', 'am',
  'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he', 'she', 'it', 'they',
  'them', 'this', 'that', 'these', 'those', 'can', 'could', 'would', 'should',
  'will', 'do', 'does', 'did', 'have', 'has', 'had', 'want', 'need', 'like',
  'where', 'what', 'when', 'who', 'whom', 'which', 'how', 'why', 'any', 'some',
  'please', 'help', 'find', 'get', 'show', 'tell', 'about', 'around', 'near',
  'visit', 'see', 'good', 'best', 'great', 'nice', 'there', 'here', 'also',
  'recommend', 'looking', 'someone', 'anyone', 'guide', 'guides', 'tour',
  'tours', 'trip', 'travel', 'going', 'go', 'city', 'place', 'places',
])

function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z][a-z'-]{2,}/g) || [])
    .filter((w) => !STOP_WORDS.has(w))
}

function overlapScore(tokens: string[], haystack: string): number {
  if (!tokens.length || !haystack) return 0
  const h = haystack.toLowerCase()
  let score = 0
  for (const t of tokens) {
    if (h.includes(t)) score += t.length >= 5 ? 2 : 1
  }
  return score
}

// ---------------------------------------------------------------------------
// Curated attraction buckets - fallback for location recommendations.
// keywords are matched against the question; each place lists why + a tip.
// ---------------------------------------------------------------------------
const ATTRACTION_BUCKETS: Array<{
  name: string; area: string; why: string; tip: string; keywords: string[]
}> = [
  {
    name: 'Rock-Hewn Churches of Lalibela', area: 'Lalibela, Amhara',
    why: 'Eleven medieval churches carved straight down into rock - the top historical sight in Ethiopia.',
    tip: 'Go at dawn for Genna Christmas in January to see white-robed pilgrims.',
    keywords: ['lalibela', 'rock', 'church', 'churches', 'history', 'historical', 'unesco', 'medieval', 'religion', 'religious', 'christian'],
  },
  {
    name: 'Simien Mountains National Park', area: 'Debark, Amhara',
    why: 'Dramatic escarpments, gelada monkeys and Ethiopia\'s best multi-day trekking.',
    tip: 'Sankaber-Geech valley walk is the best first-day route.',
    keywords: ['simien', 'mountain', 'mountains', 'hiking', 'trek', 'trekking', 'nature', 'wildlife', 'gelada', 'park', 'landscape', 'adventure'],
  },
  {
    name: 'Danakil Depression & Erta Ale', area: 'Afar region',
    why: 'Salt flats, acid pools and one of Earth\'s few permanent lava lakes.',
    tip: 'Only visit with an organized convoy - heat is extreme.',
    keywords: ['danakil', 'erta', 'ale', 'volcano', 'lava', 'salt', 'desert', 'depression', 'afar', 'dallol', 'extreme', 'surreal'],
  },
  {
    name: 'Omo Valley cultures', area: 'Jinka / Turmi, SNNPR',
    why: 'Meet Hamer, Mursi and Karo communities - the deepest cultural immersion in the country.',
    tip: 'Time your trip around Key Afer or Dimeka market days.',
    keywords: ['omo', 'tribe', 'tribes', 'culture', 'cultural', 'mursi', 'hamer', 'karo', 'jinka', 'turmi', 'market', 'community', 'indigenous'],
  },
  {
    name: 'Fasil Ghebbi & Gondar castles', area: 'Gondar, Amhara',
    why: 'Seventeenth-century imperial compound - "the Camelot of Africa".',
    tip: 'Pair with Debre Berhan Selassie\'s famous angel-ceiling murals.',
    keywords: ['gondar', 'castle', 'castles', 'fasil', 'palace', 'imperial', 'empire', 'architecture', 'heritage'],
  },
  {
    name: 'Lake Tana monasteries & Blue Nile Falls', area: 'Bahir Dar, Amhara',
    why: 'Island monasteries with 14th-century murals plus the "smoking water" falls.',
    tip: 'Tis Abay falls is fullest between late June and early September.',
    keywords: ['lake', 'tana', 'monastery', 'monasteries', 'nile', 'falls', 'waterfall', 'bahir', 'boat', 'island', 'papyrus'],
  },
  {
    name: 'National Museum & Lucy', area: 'Addis Ababa',
    why: 'Home of "Lucy" (Dinknesh), the 3.2-million-year-old Australopithecus.',
    tip: 'Combine with Holy Trinity Cathedral a short taxi ride away.',
    keywords: ['museum', 'lucy', 'addis', 'ababa', 'paleontology', 'archaeology', 'fossil', 'dinknesh'],
  },
  {
    name: 'Merkato & Entoto Hills', area: 'Addis Ababa',
    why: 'Africa\'s largest open-air market, plus panoramic city views from Entoto.',
    tip: 'Recycled-goods section (Minalesh Tera) is the most fascinating zone.',
    keywords: ['market', 'merkato', 'shopping', 'souvenir', 'coffee', 'entoto', 'view', 'bargain', 'craft', 'spice'],
  },
  {
    name: 'Harar Jugol walled city', area: 'Harar',
    why: '82 mosques, colorful alleyways and the famous hyena-feeding ritual.',
    tip: 'Feed the hyenas after dusk just outside Fallana gate.',
    keywords: ['harar', 'hyena', 'walled', 'jugol', 'islamic', 'mosque', 'walls', 'alley'],
  },
  {
    name: 'Bale Mountains & Sanetti Plateau', area: 'Bale, Oromia',
    why: 'Ethiopian wolves, Afro-alpine moorland and the second-highest road in Africa.',
    tip: 'Dawn on Sanetti gives the best wolf-spotting odds.',
    keywords: ['bale', 'wolf', 'wolves', 'sanetti', 'plateau', 'harenna', 'forest', 'bird', 'birds', 'wildlife', 'ethiopian wolf'],
  },
  {
    name: 'Coffee ceremony & café culture', area: 'Nationwide',
    why: 'Coffee is born here - full buna ceremony with roasting, incense and three rounds.',
    tip: 'Try Yirgacheffe or Sidamo single-origin pour-overs in Addis cafés.',
    keywords: ['coffee', 'buna', 'cafe', 'ceremony', 'yirgacheffe', 'sidamo', 'jebena', 'drink', 'food', 'eat', 'injera', 'cuisine', 'restaurant', 'restaurants', 'dining'],
  },
  {
    name: 'Axum obelisks & St Mary of Zion', area: 'Axum, Tigray',
    why: 'Ancient stelae of the Aksumite empire and, tradition says, the Ark of the Covenant.',
    tip: 'Northern Stelae Field at golden hour is the best light for photos.',
    keywords: ['axum', 'aksum', 'obelisk', 'stelae', 'ark', 'zion', 'tigray', 'ancient', 'empire', 'ruins'],
  },
  {
    name: 'Tiya stelae fields', area: 'Soddo, SNNPR',
    why: 'Enigmatic carved stelae - a compact UNESCO day-trip from Addis.',
    tip: 'Easy half-day pairing with Melka Kunture and Adadi Mariam.',
    keywords: ['tiya', 'daytrip', 'unesco', 'carving', 'soddo', 'adadi'],
  },
  {
    name: 'Rift Valley lakes', area: 'Bishoftu / Hawassa / Ziway',
    why: 'Flamingos, hippos and lakeside resorts under two hours from the capital.',
    tip: 'Lake Ziway boats reach Tulu Gudo island monastery.',
    keywords: ['rift', 'valley', 'flamingo', 'hippo', 'relax', 'resort', 'weekend', 'swim', 'hawassa', 'ziway', 'langano'],
  },
]

function fallbackLocations(question: string) {
  const tokens = tokenize(question)
  const scored = ATTRACTION_BUCKETS.map((b) => ({
    bucket: b,
    score: b.keywords.reduce((s, k) => s + overlapScore(tokens, k), 0),
  }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map((x) => ({
      name: x.bucket.name,
      area: x.bucket.area,
      why: x.bucket.why,
      tip: x.bucket.tip,
    }))
  if (scored.length > 0) return scored
  // No keyword hit: give the evergreen highlights so the answer is never empty.
  return ATTRACTION_BUCKETS.slice(0, 4).map((b) => ({
    name: b.name, area: b.area, why: b.why, tip: b.tip,
  }))
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const question = String(body.question || '').trim().slice(0, 600)
    if (!question) {
      return NextResponse.json({ error: 'question required' }, { status: 400 })
    }
    const lat = Number(body.lat)
    const lng = Number(body.lng)
    const hasCoords = Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0)

    const guides = await db.user.findMany({
      where: { isGuide: true },
      orderBy: { rating: 'desc' },
      take: 40,
      select: {
        id: true, name: true, location: true, rating: true,
        guideLanguages: true, guideSpecialties: true, guideBio: true,
        guideLicense: true, guideAvailable: true, verifiedLocal: true,
        guideHourlyRate: true, guideCurrency: true, profilePicture: true,
        avatarColor: true, headline: true,
      },
    })

    if (guides.length === 0) {
      return NextResponse.json({
        summary: 'No guides are registered yet - be the first!',
        guides: [],
        locations: fallbackLocations(question),
        tier: 'none',
      })
    }

    const guideLines = guides.map((g, i) => {
      const langs = (g.guideLanguages || '').split(',').filter(Boolean).join('/')
      const specs = (g.guideSpecialties || '').split(',').filter(Boolean).join('/')
      const near = hasCoords
        ? ` dist:${guideDistanceKm({ lat, lng }, g.location) ?? '?'}km`
        : ''
      return `[${i}] ${(g.name || '').slice(0, 40)} | ${(g.location || 'unknown').slice(0, 40)}${near} | ${specs || 'no specialty'} | ${langs || 'no lang'} | rating ${g.rating?.toFixed(1) || '0'}${g.guideAvailable ? '' : ' (offline)'}${g.guideBio ? ` | ${(g.guideBio || '').slice(0, 90)}` : ''}`
    }).join('\n')

    const baseMeta = `Traveler question: "${question}"\n${hasCoords ? `Traveler GPS: ${lat.toFixed(3)},${lng.toFixed(3)}\n` : ''}Registered guides:\n${guideLines}`

    // ---- Tier 1: full structured match --------------------------------
    const tier1Prompt = `You match tourists with local tour guides. ${baseMeta}
Pick up to 5 best guides for this question (skip truly irrelevant ones). Rank best first.
Also recommend 3-4 specific places/attractions (prefer ones relevant to the question; Ethiopia first if the question is about Ethiopia).
Reply ONLY minified JSON, no markdown:
{"summary":"one sentence overall answer","guides":[{"i":<guide index>,"why":"max 14 words why this guide fits"}],"locations":[{"name":"","area":"","why":"max 14 words","tip":"max 12 words"}]}`

    const parsed = await (async () => {
      try {
        const raw = await llmText(tier1Prompt, 22_000)
        if (!raw) return null
        return parseLooseJson(raw)
      } catch { return null }
    })()

    if (parsed && Array.isArray((parsed as any).guides) && (parsed as any).guides.length > 0) {
      const j = parsed as any
      const idxs: number[] = j.guides
        .map((x: any) => Math.round(Number(x?.i)))
        .filter((n: number) => Number.isInteger(n) && n >= 0 && n < guides.length)
      const uniqueIdx = Array.from(new Set<number>(idxs)).slice(0, 5)
      if (uniqueIdx.length > 0) {
        const reasons = new Map<number, string>()
        for (const g of j.guides) {
          const n = Math.round(Number(g?.i))
          if (Number.isInteger(n) && n >= 0 && n < guides.length && !reasons.has(n)) {
            reasons.set(n, String(g?.why || '').slice(0, 120) || 'Recommended for your question')
          }
        }
        const locs = Array.isArray(j.locations)
          ? j.locations.slice(0, 4).map((l: any) => ({
              name: String(l?.name || '').slice(0, 80),
              area: String(l?.area || '').slice(0, 60),
              why: String(l?.why || '').slice(0, 140),
              tip: String(l?.tip || '').slice(0, 100),
            })).filter((l: any) => l.name)
          : []
        const picked = uniqueIdx.map((n) => {
          const g = guides[n]
          return {
            ...g,
            guideLanguages: (g.guideLanguages || '').split(',').filter(Boolean),
            guideSpecialties: (g.guideSpecialties || '').split(',').filter(Boolean),
            ratingCount: 0,
            distanceKm: hasCoords ? guideDistanceKm({ lat, lng }, g.location) : null,
            reason: reasons.get(n) || 'Good match for your question',
          }
        })
        return NextResponse.json({
          summary: String(j.summary || '').slice(0, 200) || 'Top guide matches for your question.',
          guides: picked,
          locations: locs.length > 0 ? locs : fallbackLocations(question),
          tier: 'ai',
        })
      }
    }

    // ---- Tier 2: narrow "indexes only" prompt -------------------------
    try {
      const narrow = await llmText(`You match tourists with local tour guides. ${baseMeta}
Reply ONLY with a comma-separated list of the guide index numbers [0]...[${guides.length - 1}] that best fit, best first. Max 5. Nothing else.`,
        16_000)
      if (narrow) {
        const idxs = Array.from(new Set(
          (narrow.match(/\d+/g) || [])
            .map(Number)
            .filter((n) => n >= 0 && n < guides.length)
        )).slice(0, 5)
        if (idxs.length > 0) {
          const picked = idxs.map((n) => {
            const g = guides[n]
            return {
              ...g,
              guideLanguages: (g.guideLanguages || '').split(',').filter(Boolean),
              guideSpecialties: (g.guideSpecialties || '').split(',').filter(Boolean),
              ratingCount: 0,
              distanceKm: hasCoords ? guideDistanceKm({ lat, lng }, g.location) : null,
              reason: 'Matches your question (AI shortlist)',
            }
          })
          return NextResponse.json({
            summary: 'Top guide matches for your question.',
            guides: picked,
            locations: fallbackLocations(question),
            tier: 'ai-narrow',
          })
        }
      }
    } catch { /* fall through */ }

    // ---- Tier 3: keyword scoring (always works, zero AI) --------------
    const tokens = tokenize(question)
    const scored = guides.map((g, i) => {
      let s =
        overlapScore(tokens, g.guideSpecialties || '') * 3 +
        overlapScore(tokens, g.guideBio || '') * 2 +
        overlapScore(tokens, g.location || '') * 3 +
        overlapScore(tokens, g.guideLanguages || '') +
        overlapScore(tokens, g.headline || '') +
        (g.rating || 0) * 0.4
      if (g.guideAvailable) s += 0.5
      if (hasCoords) {
        const d = guideDistanceKm({ lat, lng }, g.location)
        if (d != null) s += Math.max(0, 6 - d / 100)
      }
      return { i, s }
    })
      .sort((a, b) => b.s - a.s)
      .slice(0, 5)
      .filter((x) => x.s > 0.4)

    const finalIdx = scored.length > 0
      ? scored.map((x) => x.i)
      : guides.slice(0, 3).map((_, i) => i) // top-rated pad - never empty

    const picked = finalIdx.map((n) => {
      const g = guides[n]
      const hit = tokens.find((t) =>
        (g.guideSpecialties || '').toLowerCase().includes(t) ||
        (g.location || '').toLowerCase().includes(t) ||
        (g.guideBio || '').toLowerCase().includes(t))
      return {
        ...g,
        guideLanguages: (g.guideLanguages || '').split(',').filter(Boolean),
        guideSpecialties: (g.guideSpecialties || '').split(',').filter(Boolean),
        ratingCount: 0,
        distanceKm: hasCoords ? guideDistanceKm({ lat, lng }, g.location) : null,
        reason: hit
          ? `Specializes in "${hit}" - fits your question`
          : 'Top-rated guide for your area',
      }
    })

    return NextResponse.json({
      summary: 'Matches based on specialties and locations in your question.',
      guides: picked,
      locations: fallbackLocations(question),
      tier: 'keyword',
    })
  } catch (error) {
    console.error('guide recommend failed:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

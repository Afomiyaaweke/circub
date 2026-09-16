// Guides API: list registered tour guides with filters
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { guideDistanceKm } from '@/lib/geo'
import { caseInsensitiveWhere } from '@/lib/search'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const search = searchParams.get('search')?.trim() || ''
    const language = searchParams.get('language')?.trim() || ''
    const specialty = searchParams.get('specialty')?.trim() || ''
    const country = searchParams.get('country')?.trim() || ''
    const availableOnly = searchParams.get('available') === 'true'
    // "Near me": client sends its lat/lng; we compute km per guide from the
    // guide's free-text location via the city table and sort nearest-first.
    const lat = Number(searchParams.get('lat'))
    const lng = Number(searchParams.get('lng'))
    const nearMe = Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0)

    const where: any = { isGuide: true }
    if (availableOnly) where.guideAvailable = true
    if (country) where.location = { contains: country }
    // Comma-separated search: "Addis, English, Hiking" — each term matches
    // ANY field (name, bio, languages, specialties, location) and the terms
    // themselves are AND-ed together.
    const termOr = (t: string) => ([
      { name: { contains: t } },
      { guideBio: { contains: t } },
      { guideSpecialties: { contains: t } },
      { guideLanguages: { contains: t } },
      { location: { contains: t } },
    ])
    const terms = search.split(',').map((t) => t.trim()).filter(Boolean)
    if (terms.length === 1) where.OR = termOr(terms[0])
    else if (terms.length > 1) where.AND = terms.map((t) => ({ OR: termOr(t) }))
    if (language) where.guideLanguages = { contains: language }
    if (specialty) where.guideSpecialties = { contains: specialty }

    const guides = await db.user.findMany({
      where: caseInsensitiveWhere(where),
      orderBy: { rating: 'desc' },
      select: {
        id: true, name: true, avatarColor: true, profilePicture: true,
        bio: true, headline: true, location: true, rating: true,
        isGuide: true, guideLicense: true, guideLanguages: true,
        guideSpecialties: true, guideHourlyRate: true, guideCurrency: true,
        guideBio: true, guideAvailable: true, verifiedLocal: true,
        helpfulVotes: true, localPostCount: true,
      },
      take: 50,
    })

    const result = guides.map((g) => ({
      ...g,
      guideLanguages: g.guideLanguages ? g.guideLanguages.split(',').filter(Boolean) : [],
      guideSpecialties: g.guideSpecialties ? g.guideSpecialties.split(',').filter(Boolean) : [],
    }))

    // Enrich with star-review count + distance (both cheap, post-query).
    const counts = await db.guideRating.groupBy({
      by: ['guideId'],
      where: { guideId: { in: guides.map((g) => g.id) } },
      _count: { guideId: true },
    })
    const countMap = new Map(counts.map((c) => [c.guideId, c._count.guideId]))
    const enriched = result.map((g) => ({
      ...g,
      ratingCount: countMap.get(g.id) || 0,
      distanceKm: nearMe ? guideDistanceKm({ lat, lng }, g.location) : null,
    }))

    if (nearMe) {
      // Nearest first; guides without resolvable location sink to the end.
      enriched.sort((a, b) => {
        const da = a.distanceKm ?? Number.POSITIVE_INFINITY
        const db = b.distanceKm ?? Number.POSITIVE_INFINITY
        if (da !== db) return da - db
        return (b.rating || 0) - (a.rating || 0)
      })
    }

    return NextResponse.json({ guides: enriched })
  } catch (error) {
    console.error('Failed to fetch guides:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

// Register as a guide (update own profile with guide fields)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { getCurrentUser } = await import('@/lib/session')
    const me = await getCurrentUser()
    if (!me) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const updated = await db.user.update({
      where: { id: me.id },
      data: {
        isGuide: true,
        guideLicense: body.guideLicense?.trim() || null,
        guideLanguages: body.guideLanguages?.trim() || null,
        guideSpecialties: body.guideSpecialties?.trim() || null,
        guideHourlyRate: body.guideHourlyRate ? Number(body.guideHourlyRate) : null,
        guideCurrency: body.guideCurrency?.trim() || null,
        guideBio: body.guideBio?.trim() || null,
        guideAvailable: body.guideAvailable !== false,
      },
      select: {
        id: true, name: true, isGuide: true, guideLicense: true,
        guideLanguages: true, guideSpecialties: true, guideHourlyRate: true,
        guideCurrency: true, guideBio: true, guideAvailable: true,
      },
    })

    return NextResponse.json({ guide: updated }, { status: 201 })
  } catch (error) {
    console.error('Failed to register as guide:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

// Guides API: list registered tour guides with filters
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { guideDistanceKm } from '@/lib/geo'
import { caseInsensitiveWhere } from '@/lib/search'
import { parseVideoUrl, splitVideoUrls, MAX_GUIDE_VIDEOS } from '@/lib/video'

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
    // Comma-separated search: "Addis, English, Hiking" - each term matches
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
        id: true, name: true, username: true, avatarColor: true, profilePicture: true,
        bio: true, headline: true, location: true, rating: true,
        isGuide: true, guideLicense: true, guideLanguages: true,
        guideSpecialties: true, guideHourlyRate: true, guideCurrency: true,
        guideBio: true, guideAvailable: true, verifiedLocal: true,
        idVerified: true,
        guideIdDocType: true, guideIdDocUrl: true,
        guideVideoUrls: true,
        helpfulVotes: true, localPostCount: true,
      },
      take: 50,
    })

    const result = guides.map((g) => ({
      ...g,
      guideLanguages: g.guideLanguages ? g.guideLanguages.split(',').filter(Boolean) : [],
      guideSpecialties: g.guideSpecialties ? g.guideSpecialties.split(',').filter(Boolean) : [],
      // Tour videos: stored comma-separated, returned as an array of raw urls
      // (the client derives embed players via src/lib/video.ts).
      guideVideoUrls: splitVideoUrls(g.guideVideoUrls),
      // Privacy: the document itself (guideIdDocUrl) is NEVER exposed -
      // other users only learn that a verifiable ID/passport is on file.
      idVerified: !!g.guideIdDocUrl || g.idVerified,
      guideIdDocUrl: undefined,
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

    // Document validation: type must be ID or PASSPORT; a document is REQUIRED
    // when first registering as a guide (existing guides keep their file and
    // can add/replace it any time). The image itself arrives as a data URL
    // from /api/upload (max 4 MB, compressed client-side).
    const docType = typeof body.guideIdDocType === 'string' ? body.guideIdDocType.trim().toUpperCase() : ''
    if (docType && docType !== 'ID' && docType !== 'PASSPORT') {
      return NextResponse.json({ error: 'Document type must be ID or PASSPORT' }, { status: 400 })
    }
    const docUrl = typeof body.guideIdDocUrl === 'string' && body.guideIdDocUrl.trim() ? body.guideIdDocUrl.trim() : null
    if (docUrl && docUrl.length > 6_000_000) {
      return NextResponse.json({ error: 'Document image too large. Retake the photo and try again.' }, { status: 413 })
    }
    if (!me.isGuide && !me.guideIdDocUrl && !docUrl) {
      return NextResponse.json({ error: 'Upload your ID or passport to register as a guide' }, { status: 400 })
    }

    // Tour videos: array (or comma string) of YouTube / Instagram links.
    // Max 3, each must parse; stored comma-separated as the original urls.
    let videoUrls: string[] = []
    if (Array.isArray(body.guideVideoUrls)) {
      videoUrls = body.guideVideoUrls.map((v: unknown) => String(v || '').trim()).filter(Boolean)
    } else if (typeof body.guideVideoUrls === 'string') {
      videoUrls = splitVideoUrls(body.guideVideoUrls)
    }
    if (videoUrls.length > MAX_GUIDE_VIDEOS) {
      return NextResponse.json({ error: `Up to ${MAX_GUIDE_VIDEOS} videos allowed` }, { status: 400 })
    }
    for (const v of videoUrls) {
      if (!parseVideoUrl(v)) {
        return NextResponse.json(
          { error: 'Each video must be a YouTube or Instagram link' },
          { status: 400 }
        )
      }
    }

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
        guideVideoUrls: videoUrls.length > 0 ? videoUrls.join(',') : null,
        // Document is only written when a new upload is provided - never cleared
        // by a plain profile save.
        ...(docUrl ? { guideIdDocUrl: docUrl, guideIdDocType: docType || null } : {}),
      },
      select: {
        id: true, name: true, isGuide: true, guideLicense: true,
        guideLanguages: true, guideSpecialties: true, guideHourlyRate: true,
        guideCurrency: true, guideBio: true, guideAvailable: true,
        guideVideoUrls: true,
        guideIdDocType: true,
      },
    })

    return NextResponse.json({ guide: updated }, { status: 201 })
  } catch (error) {
    console.error('Failed to register as guide:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

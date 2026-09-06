// Guides API: list registered tour guides with filters
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const search = searchParams.get('search')?.trim() || ''
    const language = searchParams.get('language')?.trim() || ''
    const specialty = searchParams.get('specialty')?.trim() || ''
    const country = searchParams.get('country')?.trim() || ''
    const availableOnly = searchParams.get('available') === 'true'

    const where: any = { isGuide: true }
    if (availableOnly) where.guideAvailable = true
    if (country) where.location = { contains: country }
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { guideBio: { contains: search } },
        { guideSpecialties: { contains: search } },
        { location: { contains: search } },
      ]
    }
    if (language) where.guideLanguages = { contains: language }
    if (specialty) where.guideSpecialties = { contains: specialty }

    const guides = await db.user.findMany({
      where,
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

    return NextResponse.json({ guides: result })
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

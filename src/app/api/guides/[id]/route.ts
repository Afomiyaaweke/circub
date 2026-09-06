// Get a specific guide's profile + toggle availability
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/session'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const guide = await db.user.findUnique({
      where: { id },
      select: {
        id: true, name: true, avatarColor: true, profilePicture: true,
        bio: true, headline: true, location: true, rating: true,
        isGuide: true, guideLicense: true, guideLanguages: true,
        guideSpecialties: true, guideHourlyRate: true, guideCurrency: true,
        guideBio: true, guideAvailable: true, verifiedLocal: true,
        helpfulVotes: true, localPostCount: true,
      },
    })
    if (!guide) return NextResponse.json({ error: 'Guide not found' }, { status: 404 })

    return NextResponse.json({
      guide: {
        ...guide,
        guideLanguages: guide.guideLanguages ? guide.guideLanguages.split(',').filter(Boolean) : [],
        guideSpecialties: guide.guideSpecialties ? guide.guideSpecialties.split(',').filter(Boolean) : [],
      },
    })
  } catch (error) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

// Toggle guide availability (online/offline)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const me = await getCurrentUser()
    if (!me) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    if (me.id !== id) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

    const body = await req.json()
    const updated = await db.user.update({
      where: { id: me.id },
      data: { guideAvailable: body.guideAvailable !== false },
      select: { guideAvailable: true },
    })

    return NextResponse.json({ guideAvailable: updated.guideAvailable })
  } catch (error) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

// Guide ratings: GET (list ratings for a guide) + POST (rate a guide)
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/session'

// GET /api/guides/[id]/ratings — list all ratings for a guide
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const ratings = await db.guideRating.findMany({
      where: { guideId: id },
      orderBy: { createdAt: 'desc' },
      include: {
        rater: {
          select: { id: true, name: true, avatarColor: true, profilePicture: true },
        },
      },
    })

    const avgRating =
      ratings.length > 0
        ? ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length
        : 0

    return NextResponse.json({
      ratings: ratings.map((r) => ({
        ...r,
        raterName: r.rater.name,
        raterPicture: r.rater.profilePicture,
      })),
      average: Math.round(avgRating * 10) / 10,
      count: ratings.length,
    })
  } catch (error) {
    console.error('Failed to fetch guide ratings:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

// POST /api/guides/[id]/ratings — rate a guide (1-5 stars + optional comment)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: guideId } = await params
    const me = await getCurrentUser()
    if (!me) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    if (me.id === guideId) {
      return NextResponse.json({ error: 'Cannot rate yourself' }, { status: 400 })
    }

    const body = await req.json()
    const rating = Math.round(Number(body.rating))
    if (!rating || rating < 1 || rating > 5) {
      return NextResponse.json({ error: 'Rating must be 1-5' }, { status: 400 })
    }

    const guide = await db.user.findUnique({ where: { id: guideId } })
    if (!guide || !guide.isGuide) {
      return NextResponse.json({ error: 'Guide not found' }, { status: 404 })
    }

    // Check if already rated
    const existing = await db.guideRating.findUnique({
      where: { raterId_guideId: { raterId: me.id, guideId } },
    })

    if (existing) {
      // Update existing rating
      const updated = await db.guideRating.update({
        where: { id: existing.id },
        data: { rating, comment: body.comment?.trim() || null },
      })
      // Recalculate guide's average rating
      const allRatings = await db.guideRating.findMany({ where: { guideId } })
      const avg = allRatings.length > 0 ? allRatings.reduce((s, r) => s + r.rating, 0) / allRatings.length : 0
      await db.user.update({ where: { id: guideId }, data: { rating: Math.round(avg * 10) / 10 } })
      return NextResponse.json({ rating: updated })
    }

    // Create new rating
    const newRating = await db.guideRating.create({
      data: {
        raterId: me.id,
        guideId,
        rating,
        comment: body.comment?.trim() || null,
      },
    })

    // Recalculate guide's average rating
    const allRatings = await db.guideRating.findMany({ where: { guideId } })
    const avg = allRatings.length > 0 ? allRatings.reduce((s, r) => s + r.rating, 0) / allRatings.length : 0
    await db.user.update({ where: { id: guideId }, data: { rating: Math.round(avg * 10) / 10 } })

    return NextResponse.json({ rating: newRating }, { status: 201 })
  } catch (error) {
    console.error('Failed to rate guide:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

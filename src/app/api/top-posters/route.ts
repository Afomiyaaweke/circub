// v137: the "Score" board (was "top posters"). Top-5 by lifetime post
// count - the post count IS the poster's score on the board. The earlier
// plan to also return rating/helpfulVotes was pulled back by the user:
// the section shows WHO the top posters are, not star ratings from others,
// so the API stays lean and matches exactly what the card renders.
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  try {
    const users = await db.user.findMany({
      where: { postsCount: { gt: 0 } },
      orderBy: { postsCount: 'desc' },
      take: 5,
      select: {
        id: true,
        name: true,
        avatarColor: true,
        postsCount: true,
      },
    })

    return NextResponse.json(
      { posters: users },
      { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' } }
    )
  } catch (error) {
    console.error('Failed to fetch top posters:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

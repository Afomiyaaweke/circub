// v137: the poster Score board (was "top posters"). Same top-5 by lifetime
// post count, but every row now carries the poster's honest score - their
// review rating and their lifetime helpful votes (the same two signals the
// v135 profile chip shows) - so the feed section named "Score" can display
// them. Ranking itself stays untouched (nothing invented).
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
        rating: true,
        helpfulVotes: true,
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

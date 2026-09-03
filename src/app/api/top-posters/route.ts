// Top posters leaderboard - by product count
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

    return NextResponse.json({ posters: users })
  } catch (error) {
    console.error('Failed to fetch top posters:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

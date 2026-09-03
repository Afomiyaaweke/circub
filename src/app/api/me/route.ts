// Get current user (MA) with full stats
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  try {
    const user = await db.user.findUnique({
      where: { email: 'ma@socialcircle.app' },
      include: {
        products: {
          orderBy: { createdAt: 'desc' },
        },
        followsFrom: true,
      },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    return NextResponse.json({
      id: user.id,
      name: user.name,
      email: user.email,
      avatarColor: user.avatarColor,
      bio: user.bio,
      postsCount: user.products.length,
      followersCount: user.followersCount,
      followingCount: user.followsFrom.length,
      likesCount: user.likesCount,
    })
  } catch (error) {
    console.error('Failed to fetch current user:', error)
    return NextResponse.json(
      { error: 'Failed to fetch user' },
      { status: 500 }
    )
  }
}

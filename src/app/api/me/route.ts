// Get current user (MA) with full stats — including connections count and incoming invitations
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  try {
    const user = await db.user.findUnique({
      where: { email: 'ma@socialcircle.app' },
      include: {
        products: { select: { id: true } },
        connRequested: true,
        connReceived: true,
      },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Incoming PENDING invitations to me
    const incomingPending = user.connReceived.filter(
      (c) => c.status === 'PENDING'
    ).length

    return NextResponse.json({
      id: user.id,
      name: user.name,
      email: user.email,
      avatarColor: user.avatarColor,
      bio: user.bio,
      headline: user.headline,
      location: user.location,
      postsCount: user.products.length,
      followersCount: user.followersCount,
      likesCount: user.likesCount,
      connectionsCount: user.connectionsCount,
      incomingInvitationsCount: incomingPending,
    })
  } catch (error) {
    console.error('Failed to fetch current user:', error)
    return NextResponse.json(
      { error: 'Failed to fetch user' },
      { status: 500 }
    )
  }
}

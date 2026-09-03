// Get current authenticated user (replaces the old hardcoded /api/me)
import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/session'
import { db } from '@/lib/db'

export async function GET() {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // Fetch fresh user data with all stats
    const me = await db.user.findUnique({
      where: { id: user.id },
      include: {
        products: { select: { id: true } },
        connRequested: true,
        connReceived: true,
      },
    })

    if (!me) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const incomingPending = me.connReceived.filter(
      (c) => c.status === 'PENDING'
    ).length

    return NextResponse.json({
      id: me.id,
      name: me.name,
      email: me.email,
      avatarColor: me.avatarColor,
      bio: me.bio,
      headline: me.headline,
      location: me.location,
      accountType: me.accountType,
      companyName: me.companyName,
      companyWebsite: me.companyWebsite,
      companySize: me.companySize,
      companyIndustry: me.companyIndustry,
      postsCount: me.products.length,
      followersCount: me.followersCount,
      likesCount: me.likesCount,
      connectionsCount: me.connectionsCount,
      incomingInvitationsCount: incomingPending,
      isLocal: me.isLocal,
      verifiedLocal: me.verifiedLocal,
    })
  } catch (error) {
    console.error('Failed to fetch current user:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

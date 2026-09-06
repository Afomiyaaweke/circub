import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const user = await db.user.findUnique({ where: { id }, select: { id: true, name: true, avatarColor: true, profilePicture: true, bio: true, headline: true, location: true, isLocal: true, verifiedLocal: true, rating: true, expertiseTags: true, helpfulVotes: true, localPostCount: true, createdAt: true } })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })
    const posts = await db.localPricePost.findMany({ where: { authorId: id }, orderBy: { createdAt: 'desc' }, take: 50, select: { id: true, productName: true, postType: true, country: true, city: true, neighborhood: true, market: true, currency: true, priceMin: true, priceMax: true, recommendedPrice: true, category: true, imageUrl: true, helpfulCount: true, notAccurateCount: true, createdAt: true } })
    return NextResponse.json({ profile: { ...user, expertiseTags: user.expertiseTags ? user.expertiseTags.split(',').filter(Boolean) : [] }, posts })
  } catch { return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}

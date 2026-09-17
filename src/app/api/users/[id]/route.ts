// GET /api/users/[id] — public author profile for the "tap a name on a post"
// profile modal. Public fields only — never email, never any document URL.
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const user = await db.user.findUnique({
      where: { id },
      select: {
        id: true, name: true, username: true, avatarColor: true, profilePicture: true,
        bio: true, headline: true, location: true, accountType: true, companyName: true,
        companyIndustry: true, isLocal: true, verifiedLocal: true, idVerified: true,
        isGuide: true, expertiseTags: true, createdAt: true,
        followersCount: true, likesCount: true, connectionsCount: true, postsCount: true,
        localPostCount: true,
      },
    })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const [posts, pricePosts] = await Promise.all([
      db.post.findMany({
        where: { authorId: id },
        orderBy: { createdAt: 'desc' },
        take: 6,
        select: { id: true, content: true, imageUrl: true, createdAt: true, _count: { select: { likes: true, comments: true } } },
      }),
      db.localPricePost.findMany({
        where: { authorId: id },
        orderBy: { createdAt: 'desc' },
        take: 4,
        select: { id: true, productName: true, currency: true, priceMin: true, priceMax: true, country: true, city: true, createdAt: true },
      }),
    ])

    return NextResponse.json({
      profile: {
        ...user,
        expertiseTags: user.expertiseTags ? user.expertiseTags.split(',').filter(Boolean) : [],
      },
      posts: posts.map((p) => ({ id: p.id, content: p.content, imageUrl: p.imageUrl, createdAt: p.createdAt, likes: p._count.likes, comments: p._count.comments })),
      pricePosts,
    })
  } catch {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

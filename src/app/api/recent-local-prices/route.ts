// Recent local price posts (for right sidebar "What locals are saying" widget)
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  try {
    const posts = await db.localPricePost.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: {
        author: {
          select: {
            id: true,
            name: true,
            avatarColor: true,
            isLocal: true,
            verifiedLocal: true,
            rating: true,
            location: true,
          },
        },
      },
    })

    const result = posts.map((p) => ({
      id: p.id,
      productName: p.productName,
      postType: p.postType,
      country: p.country,
      city: p.city,
      currency: p.currency,
      priceMin: p.priceMin,
      priceMax: p.priceMax,
      category: p.category,
      imageUrl: p.imageUrl,
      helpfulCount: p.helpfulCount,
      author: p.author,
      createdAt: p.createdAt,
    }))

    return NextResponse.json({ posts: result })
  } catch (error) {
    console.error('Failed to fetch recent local prices:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

// Posts: list (with author, likes, comments) + create
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser, sanitizeInput } from '@/lib/session'
import { caseInsensitiveWhere } from '@/lib/search'
import { guideDistanceKm } from '@/lib/geo'
import { parseVideoUrl } from '@/lib/video'

// GET /api/posts?authorId=...&search=...&limit=20&lat=9.03&lng=38.74
// With lat/lng the feed becomes location-aware: posts from authors whose
// profile location resolves near the viewer (same city area, <=50 km) are
// grouped FIRST, then everything else - newest first inside each group.
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const authorId = searchParams.get('authorId')
    const search = searchParams.get('search')?.trim() || ''
    const limit = parseInt(searchParams.get('limit') || '50', 10)
    const lat = Number(searchParams.get('lat'))
    const lng = Number(searchParams.get('lng'))
    const nearMe = Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0)

    const where: any = {}
    if (authorId) where.authorId = authorId
    if (search) {
      where.OR = [
        { content: { contains: search } },
      ]
    }

    const posts = await db.post.findMany({
      where: caseInsensitiveWhere(where),
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        author: {
          select: {
            id: true, name: true, username: true, avatarColor: true, profilePicture: true,
            headline: true, location: true, idVerified: true,
          },
        },
        likes: true,
        reposts: true,
        comments: {
          include: {
            author: {
              select: {
                id: true, name: true, username: true, avatarColor: true, profilePicture: true,
                headline: true, idVerified: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    })

    if (nearMe) {
      const NEAR_YOU_KM = 50
      const enriched = posts.map((p) => {
        const km = guideDistanceKm({ lat, lng }, p.author.location)
        return { ...p, distanceKm: km, nearYou: km != null && km <= NEAR_YOU_KM }
      })
      // Near-you block first (keeps its newest-first order), then the rest.
      const near = enriched.filter((p) => p.nearYou)
      const rest = enriched.filter((p) => !p.nearYou)
      return NextResponse.json({ posts: [...near, ...rest], sortedBy: 'near' })
    }

    return NextResponse.json({ posts })
  } catch (error) {
    console.error('Failed to fetch posts:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

// POST /api/posts { content, imageUrl?, videoUrl? }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    if (!body.content || !body.content.trim()) {
      return NextResponse.json({ error: 'Content required' }, { status: 400 })
    }

    const me = await getCurrentUser()
    if (!me) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    // Attached video link (YouTube / Instagram): validated, stored as the
    // original url. A non-empty link that does not parse is a 400 so the
    // composer can tell the user exactly what went wrong.
    const rawVideo = typeof body.videoUrl === 'string' ? body.videoUrl.trim() : ''
    if (rawVideo && !parseVideoUrl(rawVideo)) {
      return NextResponse.json(
        { error: 'Video link must be a YouTube or Instagram link' },
        { status: 400 }
      )
    }

    const post = await db.post.create({
      data: {
        content: sanitizeInput(body.content, 10000),
        imageUrl: body.imageUrl || null,
        videoUrl: rawVideo || null,
        authorId: me.id,
      },
      include: {
        author: {
          select: {
            id: true, name: true, username: true, avatarColor: true, profilePicture: true,
            headline: true, location: true, idVerified: true,
          },
        },
        likes: true,
        reposts: true,
        comments: {
          include: {
            author: {
              select: { id: true, name: true, username: true, avatarColor: true, profilePicture: true, headline: true },
            },
          },
        },
      },
    })

    return NextResponse.json({ post }, { status: 201 })
  } catch (error) {
    console.error('Failed to create post:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

// Posts: list (with author, likes, comments) + create
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser, sanitizeInput } from '@/lib/session'
import { caseInsensitiveWhere } from '@/lib/search'
import { guideDistanceKm } from '@/lib/geo'
import { parseVideoUrl } from '@/lib/video'
import { slimAuthor } from '@/lib/media-url'
import { withDbRetry } from '@/lib/db-retry'

// GET /api/posts?authorId=...&search=...&limit=10&offset=0&lat=9.03&lng=38.74&saved=1
// With lat/lng the feed becomes location-aware: posts from authors whose
// profile location resolves near the viewer (same city area, <=50 km) are
// grouped FIRST, then everything else - newest first inside each group.
// With saved=1 the feed returns ONLY the current user's saved (bookmarked)
// posts - the community feed tab's "Saved" filter reads this.
// v251: small first, load more - the default page dropped from 50 to 10
// rows and offset paginates the rest in. 50 full post rows (author + every
// comment + every like, all hydrated) was a multi-hundred-KB first paint on
// phones; 10 paints fast and the sentinel fetches the next page.
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const authorId = searchParams.get('authorId')
    const search = searchParams.get('search')?.trim() || ''
    const limitRaw = parseInt(searchParams.get('limit') || '10', 10)
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 60) : 10
    const offsetRaw = parseInt(searchParams.get('offset') || '', 10)
    const offset = Number.isFinite(offsetRaw) && offsetRaw > 0 ? offsetRaw : 0
    const lat = Number(searchParams.get('lat'))
    const lng = Number(searchParams.get('lng'))
    const nearMe = Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0)
    const savedOnly = searchParams.get('saved') === '1'

    const where: any = {}
    if (authorId) where.authorId = authorId
    if (savedOnly) {
      const me = await getCurrentUser()
      if (!me) return NextResponse.json({ posts: [], savedOnly: true })
      where.saves = { some: { userId: me.id } }
    }
    if (search) {
      where.OR = [
        { content: { contains: search } },
      ]
    }

    // v242: under withDbRetry - transient DB blips used to 500 the
    // community feed while the client silently kept stale posts.
    // v251: take limit+1 so hasMore is exact without a second count query.
    const fetched = await withDbRetry(() => db.post.findMany({
      where: caseInsensitiveWhere(where),
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit + 1,
      include: {
        author: {
          select: {
            id: true, name: true, username: true, avatarColor: true, profilePicture: true,
            headline: true, location: true, idVerified: true,
            // v208: the sticker-strip counters - the post card derives the
            // author's earned stickers from these two (no extra endpoint).
            helpfulVotes: true, localPostCount: true,
          },
        },
        likes: true,
        reposts: true,
        // v225: per-user saved state so the feed can render the bookmark
        // button as filled/empty without a second round-trip.
        saves: true,
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
    }))

    const hasMore = fetched.length > limit
    const posts = fetched.slice(0, limit)

    // v239 PERF: avatars travel as cacheable /api/users/<id>/image URLs -
    // the base64 data: URLs made every feed fetch ship megabytes of JSON.
    // (post.imageUrl stays inline: community posts can carry VIDEOS, which
    // the image route cannot serve.)
    const slimmed = posts.map((p) => ({
      ...p,
      author: slimAuthor(p.author),
      comments: p.comments.map((c) => ({ ...c, author: slimAuthor(c.author) })),
    }))

    if (nearMe) {
      const NEAR_YOU_KM = 50
      const enriched = slimmed.map((p) => {
        const km = guideDistanceKm({ lat, lng }, p.author.location)
        return { ...p, distanceKm: km, nearYou: km != null && km <= NEAR_YOU_KM }
      })
      // Near-you block first (keeps its newest-first order), then the rest.
      const near = enriched.filter((p) => p.nearYou)
      const rest = enriched.filter((p) => !p.nearYou)
      return NextResponse.json({ posts: [...near, ...rest], sortedBy: 'near', hasMore, nextOffset: offset + posts.length })
    }

    return NextResponse.json({ posts: slimmed, hasMore, nextOffset: offset + posts.length })
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
            // v208: the sticker-strip counters - the post card derives the
            // author's earned stickers from these two (no extra endpoint).
            helpfulVotes: true, localPostCount: true,
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

    return NextResponse.json({ post: { ...post, author: slimAuthor(post.author), comments: post.comments.map((c) => ({ ...c, author: slimAuthor(c.author) })) } }, { status: 201 })
  } catch (error) {
    console.error('Failed to create post:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

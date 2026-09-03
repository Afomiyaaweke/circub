// Posts: list (with author, likes, comments) and create
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/posts?authorId=...&limit=20
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const authorId = searchParams.get('authorId')
    const limit = parseInt(searchParams.get('limit') || '50', 10)

    const where: any = {}
    if (authorId) where.authorId = authorId

    const posts = await db.post.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        author: {
          select: {
            id: true,
            name: true,
            avatarColor: true,
            headline: true,
            location: true,
          },
        },
        likes: true,
        comments: {
          include: {
            author: {
              select: {
                id: true,
                name: true,
                avatarColor: true,
                headline: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    })

    return NextResponse.json({ posts })
  } catch (error) {
    console.error('Failed to fetch posts:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

// POST /api/posts { content, imageUrl? }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    if (!body.content || !body.content.trim()) {
      return NextResponse.json({ error: 'Content required' }, { status: 400 })
    }

    const me = await db.user.findUnique({
      where: { email: 'ma@socialcircle.app' },
    })
    if (!me) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const post = await db.post.create({
      data: {
        content: body.content.trim(),
        imageUrl: body.imageUrl || null,
        authorId: me.id,
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            avatarColor: true,
            headline: true,
            location: true,
          },
        },
        likes: true,
        comments: {
          include: {
            author: {
              select: { id: true, name: true, avatarColor: true, headline: true },
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

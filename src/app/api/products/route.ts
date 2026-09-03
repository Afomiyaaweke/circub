// Products API: list (with filters) + create
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/products?search=...&category=...&authorId=...
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const search = searchParams.get('search')?.trim() || ''
    const category = searchParams.get('category')?.trim() || ''
    const authorId = searchParams.get('authorId')?.trim() || ''

    const where: any = {}
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { country: { contains: search } },
        { description: { contains: search } },
      ]
    }
    if (category && category !== 'All categories') {
      where.category = category
    }
    if (authorId) {
      where.authorId = authorId
    }

    const products = await db.product.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            avatarColor: true,
          },
        },
        likes: true,
      },
    })

    return NextResponse.json({ products })
  } catch (error) {
    console.error('Failed to fetch products:', error)
    return NextResponse.json(
      { error: 'Failed to fetch products' },
      { status: 500 }
    )
  }
}

// POST /api/products  - create new product (assigned to current user MA)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    // Required fields
    if (!body.name || !body.country || !body.currency || body.price == null) {
      return NextResponse.json(
        { error: 'Missing required fields: name, country, currency, price' },
        { status: 400 }
      )
    }

    const user = await db.user.findUnique({
      where: { email: 'ma@socialcircle.app' },
    })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const product = await db.product.create({
      data: {
        name: body.name.trim(),
        quantity: body.quantity?.trim() || '',
        country: body.country.trim(),
        currency: body.currency.trim(),
        price: Number(body.price),
        unit: body.unit?.trim() || null,
        gender: body.gender?.trim() || null,
        description: body.description?.trim() || null,
        imageUrl: body.imageUrl?.trim() || null,
        category: body.category?.trim() || 'Other',
        authorId: user.id,
      },
      include: {
        author: {
          select: { id: true, name: true, avatarColor: true },
        },
      },
    })

    // Increment posts count
    await db.user.update({
      where: { id: user.id },
      data: { postsCount: { increment: 1 } },
    })

    return NextResponse.json({ product }, { status: 201 })
  } catch (error) {
    console.error('Failed to create product:', error)
    return NextResponse.json(
      { error: 'Failed to create product' },
      { status: 500 }
    )
  }
}

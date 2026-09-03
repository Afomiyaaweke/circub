// Like / unlike a product
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/session'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const product = await db.product.findUnique({ where: { id } })
    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    // Check if already liked
    const existing = await db.like.findUnique({
      where: {
        userId_productId: { userId: user.id, productId: id },
      },
    })

    if (existing) {
      // Unlike
      await db.like.delete({ where: { id: existing.id } })
      return NextResponse.json({ liked: false })
    } else {
      // Like
      await db.like.create({
        data: { userId: user.id, productId: id },
      })
      return NextResponse.json({ liked: true })
    }
  } catch (error) {
    console.error('Failed to toggle like:', error)
    return NextResponse.json(
      { error: 'Failed to toggle like' },
      { status: 500 }
    )
  }
}

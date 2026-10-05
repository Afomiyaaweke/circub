// Single product: GET, DELETE
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/session'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const product = await db.product.findUnique({
      where: { id },
      include: {
        author: {
          select: { id: true, name: true, avatarColor: true },
        },
        likes: true,
      },
    })
    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }
    return NextResponse.json({ product })
  } catch (error) {
    console.error('Failed to fetch product:', error)
    return NextResponse.json(
      { error: 'Failed to fetch product' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Get current user (MA)
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const product = await db.product.findUnique({ where: { id } })
    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }
    if (product.authorId !== user.id) {
      return NextResponse.json(
        { error: 'Unauthorized: you can only delete your own products' },
        { status: 403 }
      )
    }

    // v122: products created from the unified price composer are twins of a
    // LocalPricePost (Product.localPricePostId). One thing, one delete: the
    // twin price post (with its votes/story/link rows via cascade) goes too.
    // Best-effort: the product itself always goes away even if this fails.
    try {
      if (product.localPricePostId) {
        const twin = await db.localPricePost.findUnique({ where: { id: product.localPricePostId } })
        if (twin && twin.authorId === user.id) {
          await db.localPricePost.delete({ where: { id: twin.id } })
          await db.user.update({ where: { id: user.id }, data: { localPostCount: { decrement: 1 } } })
        }
      }
    } catch (error) {
      console.error('Twin price post cleanup failed (product still deleted):', error)
    }

    await db.product.delete({ where: { id } })

    // Decrement posts count
    await db.user.update({
      where: { id: user.id },
      data: { postsCount: { decrement: 1 } },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete product:', error)
    return NextResponse.json(
      { error: 'Failed to delete product' },
      { status: 500 }
    )
  }
}

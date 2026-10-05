import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/session'
import { isValidGps } from '@/lib/location'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const post = await db.localPricePost.findUnique({ where: { id }, include: { author: { select: { id: true, name: true, avatarColor: true, profilePicture: true, isLocal: true, verifiedLocal: true, idVerified: true, rating: true, helpfulVotes: true, localPostCount: true, headline: true, location: true, expertiseTags: true } }, votes: true } })
    if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    let me: any = null
    try { const s = await getCurrentUser(); if (s) me = await db.user.findUnique({ where: { id: s.id }, include: { localPriceVotes: true } }) } catch {}
    const myVote = me ? (post.votes.find((v) => v.userId === me.id)?.voteType as any) || null : null
    return NextResponse.json({ post: { ...post, author: { ...post.author, expertiseTags: post.author.expertiseTags ? post.author.expertiseTags.split(',').filter(Boolean) : [] }, myVote } })
  } catch { return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const me = await getCurrentUser()
    if (!me) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    const post = await db.localPricePost.findUnique({ where: { id } })
    if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    if (post.authorId !== me.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    const body = await req.json()
    const updates: any = {}
    if (typeof body.productName === 'string') updates.productName = body.productName.trim()
    if (typeof body.description === 'string') updates.description = body.description.trim() || null
    if (typeof body.country === 'string') updates.country = body.country.trim()
    if (typeof body.city === 'string') updates.city = body.city.trim() || null
    if (typeof body.neighborhood === 'string') updates.neighborhood = body.neighborhood.trim() || null
    if (typeof body.market === 'string') updates.market = body.market.trim() || null
    // Optional GPS pin (explicit null clears it, valid pair sets it, invalid is ignored)
    if (body.latitude !== undefined || body.longitude !== undefined) {
      const lat = body.latitude != null ? Number(body.latitude) : null
      const lng = body.longitude != null ? Number(body.longitude) : null
      if (lat != null && lng != null && isValidGps(lat, lng)) {
        updates.latitude = Math.round(lat * 1e6) / 1e6
        updates.longitude = Math.round(lng * 1e6) / 1e6
      } else {
        updates.latitude = null
        updates.longitude = null
      }
    }
    if (typeof body.currency === 'string') updates.currency = body.currency.trim()
    if (body.priceMin != null) updates.priceMin = Number(body.priceMin)
    if (body.priceMax != null) updates.priceMax = Number(body.priceMax)
    if (body.recommendedPrice != null) updates.recommendedPrice = Number(body.recommendedPrice)
    if (body.touristPrice != null) updates.touristPrice = Number(body.touristPrice)
    if (typeof body.localTip === 'string') updates.localTip = body.localTip.trim() || null
    if (typeof body.contactPhone === 'string') updates.contactPhone = body.contactPhone.trim() || null
    if (typeof body.contactEmail === 'string') updates.contactEmail = body.contactEmail.trim() || null
    if (typeof body.contactWhatsApp === 'string') updates.contactWhatsApp = body.contactWhatsApp.trim() || null
    if (body.ownsShop !== undefined) updates.ownsShop = body.ownsShop === true || body.ownsShop === 'true'
    if (typeof body.category === 'string') updates.category = body.category
    if (typeof body.imageUrl === 'string') updates.imageUrl = body.imageUrl || null
    // v122: marketplace details editable after publishing too.
    if (typeof body.unit === 'string') updates.unit = body.unit.trim() || null
    if (typeof body.quantity === 'string') updates.quantity = body.quantity.trim() || null
    if (Object.keys(updates).length === 0) return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    const updated = await db.localPricePost.update({ where: { id }, data: updates })
    // v122: keep the auto-created Product twin in sync - the price post is
    // the source of truth for the pair, the product is its marketplace face.
    // Best-effort: a sync failure never fails the edit itself.
    try {
      const twin = await db.product.findUnique({ where: { localPricePostId: id } })
      if (twin) {
        const twinData: any = {}
        if (updates.productName !== undefined) twinData.name = updates.productName
        if (updates.description !== undefined) twinData.description = updates.description
        if (updates.category !== undefined) twinData.category = updates.category
        if (updates.imageUrl !== undefined) twinData.imageUrl = updates.imageUrl
        if (updates.country !== undefined) twinData.country = updates.country
        if (updates.currency !== undefined) twinData.currency = updates.currency
        if (updates.unit !== undefined) twinData.unit = updates.unit
        if (updates.quantity !== undefined) twinData.quantity = updates.quantity
        if (updates.priceMin != null || updates.priceMax != null) {
          const min = updates.priceMin != null ? Number(updates.priceMin) : Number(updated.priceMin)
          const max = updates.priceMax != null ? Number(updates.priceMax) : Number(updated.priceMax)
          twinData.price = Math.round(((min + max) / 2) * 100) / 100
        }
        if (Object.keys(twinData).length > 0) {
          await db.product.update({ where: { id: twin.id }, data: twinData })
        }
      }
    } catch (e) { console.error('Twin product sync failed (post updated):', e) }
    return NextResponse.json({ post: updated })
  } catch (error) { console.error('Edit failed:', error); return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const me = await getCurrentUser()
    if (!me) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    const post = await db.localPricePost.findUnique({ where: { id } })
    if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    if (post.authorId !== me.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    // v122: deleting the price post deletes its auto-created Product twin
    // with it (one post = one product, one delete). Best-effort: the post
    // itself always goes away even if the twin cleanup hits an error.
    try {
      const twin = await db.product.findUnique({ where: { localPricePostId: id } })
      if (twin) {
        await db.product.delete({ where: { id: twin.id } })
        await db.user.update({ where: { id: me.id }, data: { postsCount: { decrement: 1 } } })
      }
    } catch (e) { console.error('Twin product cleanup failed (post still deleted):', e) }
    await db.localPricePost.delete({ where: { id } })
    await db.user.update({ where: { id: me.id }, data: { localPostCount: { decrement: 1 } } })
    return NextResponse.json({ success: true })
  } catch { return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}

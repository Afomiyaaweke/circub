// Symmetric links between price posts ("same item posted elsewhere").
// One row per pair, ids normalized so a duplicate link is impossible from
// either direction. Managed from the price detail modal: link another post,
// remove a link, count shown on the card.
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/session'

// Everything the linked-posts list needs on the OTHER post.
const OTHER_POST_SELECT = {
  id: true,
  productName: true,
  category: true,
  currency: true,
  priceMin: true,
  priceMax: true,
  city: true,
  country: true,
  imageUrl: true,
  createdAt: true,
  author: { select: { id: true, name: true, username: true, avatarColor: true, profilePicture: true, verifiedLocal: true, isLocal: true, idVerified: true } },
}

async function linksFor(postId: string, meId: string | null) {
  const rows = await db.pricePostLink.findMany({
    where: { OR: [{ postAId: postId }, { postBId: postId }] },
    orderBy: { createdAt: 'desc' },
    include: { postA: { select: { authorId: true } }, postB: { select: { authorId: true } } },
  })
  // Summary for the other side only (keeps the payload small).
  const out: Array<object> = []
  for (const r of rows) {
    const otherId = r.postAId === postId ? r.postBId : r.postAId
    const other = await db.localPricePost.findUnique({ where: { id: otherId }, select: OTHER_POST_SELECT })
    if (!other) continue
    const canRemove = !!meId && (r.createdBy === meId || r.postA.authorId === meId || r.postB.authorId === meId)
    out.push({ linkId: r.id, createdBy: r.createdBy, createdAt: r.createdAt, canRemove, post: other })
  }
  return out
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    let meId: string | null = null
    try { const s = await getCurrentUser(); if (s) meId = s.id } catch {}
    const links = await linksFor(id, meId)
    return NextResponse.json({ links, count: links.length })
  } catch { return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}

// POST { linkedId } - link this post to another one. The link is mutual: it
// shows up on both posts. Auth required; the creator is recorded so links
// stay manageable ("remove" allowed for the link creator and both owners).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const me = await getCurrentUser()
    if (!me || me.id === 'guest') return NextResponse.json({ error: 'Sign up to link price posts' }, { status: 401 })
    const body = await req.json()
    const linkedId = typeof body.linkedId === 'string' ? body.linkedId.trim() : ''
    if (!linkedId) return NextResponse.json({ error: 'Missing linkedId' }, { status: 400 })
    if (linkedId === id) return NextResponse.json({ error: 'A post cannot link to itself' }, { status: 400 })
    const [a, b] = await Promise.all([
      db.localPricePost.findUnique({ where: { id } }),
      db.localPricePost.findUnique({ where: { id: linkedId } }),
    ])
    if (!a || !b) return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    // Normalize the pair (postAId < postBId) so the unique constraint blocks
    // duplicates regardless of which side the link was created from.
    const [postAId, postBId] = [id, linkedId].sort()
    try {
      await db.pricePostLink.create({ data: { postAId, postBId, createdBy: me.id } })
    } catch (e: any) {
      if (e?.code === 'P2002') return NextResponse.json({ error: 'These posts are already linked' }, { status: 409 })
      throw e
    }
    const links = await linksFor(id, me.id)
    return NextResponse.json({ links, count: links.length }, { status: 201 })
  } catch { return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}

// DELETE { linkedId } - remove the link between this post and another one.
// Allowed for the link creator and the owners of either linked post.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const me = await getCurrentUser()
    if (!me) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    const body = await req.json().catch(() => ({}))
    const linkedId = typeof body.linkedId === 'string' ? body.linkedId.trim() : ''
    if (!linkedId) return NextResponse.json({ error: 'Missing linkedId' }, { status: 400 })
    const [postAId, postBId] = [id, linkedId].sort()
    const row = await db.pricePostLink.findUnique({ where: { postAId_postBId: { postAId, postBId } }, include: { postA: { select: { authorId: true } }, postB: { select: { authorId: true } } } })
    if (!row) return NextResponse.json({ error: 'Link not found' }, { status: 404 })
    const allowed = row.createdBy === me.id || row.postA.authorId === me.id || row.postB.authorId === me.id
    if (!allowed) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    await db.pricePostLink.delete({ where: { id: row.id } })
    const links = await linksFor(id, me.id)
    return NextResponse.json({ success: true, links, count: links.length })
  } catch { return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}

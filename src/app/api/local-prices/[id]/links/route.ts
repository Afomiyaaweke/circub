// Symmetric links between price posts ("same item posted elsewhere").
// One row per pair, ids normalized so a duplicate link is impossible from
// either direction. Managed from the price detail modal: link another post,
// remove a link, count shown on the card.
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/session'
import { productMatchKey } from '@/lib/product-name'

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
  // v158: votes ride on every row - the compare ranks linked businesses by
  // their helpful votes, so the counts must travel with the payload.
  helpfulCount: true,
  notAccurateCount: true,
  author: { select: { id: true, name: true, username: true, avatarColor: true, profilePicture: true, verifiedLocal: true, isLocal: true, idVerified: true } },
}

async function linksFor(postId: string, meId: string | null) {
  const self = await db.localPricePost.findUnique({
    where: { id: postId },
    select: { authorId: true, productName: true },
  })
  if (!self) return []
  // v158: a link attaches to the BUSINESS, not the single post. The same-
  // product posts of the same author (siblings) carry the same comparison
  // set: opening any of them resolves the links of every sibling, deduped,
  // so the linked businesses follow the business wherever the product is
  // posted - and both sides of a link see it on all their product posts.
  const siblings = await db.localPricePost.findMany({
    where: { authorId: self.authorId, id: { not: postId } },
    select: { id: true, productName: true },
  })
  const selfKey = productMatchKey(self.productName || '')
  const siblingIds = (selfKey
    ? siblings.filter((s) => productMatchKey(s.productName || '') === selfKey)
    : []
  ).map((s) => s.id)
  const anchors = [postId, ...siblingIds]
  const rows = await db.pricePostLink.findMany({
    where: { OR: [{ postAId: { in: anchors } }, { postBId: { in: anchors } }] },
    orderBy: { createdAt: 'desc' },
    include: { postA: { select: { authorId: true } }, postB: { select: { authorId: true } } },
  })
  // Summary for the other side only (keeps the payload small). Direct
  // links win over business-carried duplicates; the opened post itself and
  // the author's own posts never appear (own posts are the history table).
  const seen = new Set<string>()
  const picked: Array<{ linkId: string; createdBy: string; createdAt: Date; canRemove: boolean; via: 'direct' | 'business'; otherId: string }> = []
  for (const directPass of [true, false]) {
    for (const r of rows) {
      const direct = r.postAId === postId || r.postBId === postId
      if (direct !== directPass) continue
      // The "other" post is whichever side is NOT one of this business's
      // anchors; a link between two of the business's own posts is a
      // self-link and never surfaces as a comparison row.
      let otherId: string
      if (anchors.includes(r.postAId) && !anchors.includes(r.postBId)) otherId = r.postBId
      else if (anchors.includes(r.postBId) && !anchors.includes(r.postAId)) otherId = r.postAId
      else continue
      if (otherId === postId || seen.has(otherId)) continue
      const other = await db.localPricePost.findUnique({ where: { id: otherId }, select: { authorId: true } })
      if (!other || other.authorId === self.authorId) continue
      seen.add(otherId)
      const canRemove = !!meId && (r.createdBy === meId || r.postA.authorId === meId || r.postB.authorId === meId)
      picked.push({ linkId: r.id, createdBy: r.createdBy, createdAt: r.createdAt, canRemove, via: direct ? 'direct' : 'business', otherId })
    }
  }
  const otherPosts = await db.localPricePost.findMany({
    where: { id: { in: picked.map((p) => p.otherId) } },
    select: OTHER_POST_SELECT,
  })
  const postById = new Map(otherPosts.map((p) => [p.id, p]))
  // v158: a business's votes = its helpful votes summed across ALL its
  // posts - the "business with more votes" metric the compare ranks by.
  const authorIds = [...new Set(otherPosts.map((p) => p.author?.id).filter((x): x is string => !!x))]
  const votesByAuthor = new Map<string, number>()
  if (authorIds.length > 0) {
    const agg = await db.localPricePost.groupBy({
      by: ['authorId'],
      _sum: { helpfulCount: true },
      where: { authorId: { in: authorIds } },
    })
    for (const v of agg) votesByAuthor.set(v.authorId, v._sum.helpfulCount ?? 0)
  }
  const out: Array<object> = []
  for (const p of picked) {
    const other = postById.get(p.otherId)
    if (!other) continue
    out.push({
      linkId: p.linkId,
      createdBy: p.createdBy,
      createdAt: p.createdAt,
      canRemove: p.canRemove,
      via: p.via,
      authorVotes: votesByAuthor.get(other.author?.id ?? '') ?? other.helpfulCount ?? 0,
      post: other,
    })
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

// ============================================================
// DEMO CONTENT SEEDER — one URL to fill, one URL to wipe
// ============================================================
// GET|POST /api/seed?code=<SECRET>&mode=seed      -> create demo users + ~100 posts
// GET|POST /api/seed?code=<SECRET>&mode=cleanup   -> remove ALL demo content (cascades)
// GET|POST /api/seed?code=<SECRET>&mode=status    -> how much demo content exists
//
// Safety model:
//  - The secret code is required for every action (403 otherwise).
//  - Demo accounts use the reserved email domain @seed.circub.test;
//    the register endpoint refuses that domain so real users can
//    never collide with the cleanup blast radius.
//  - Every User relation in the schema has onDelete: Cascade, so
//    deleting the demo users removes their posts, likes, comments,
//    local price posts, votes and connections in one deleteMany.
//  - seed() is idempotent: if demo content already exists it does
//    nothing unless &force=1 is passed (wipe + reseed).
//
// PERFORMANCE (learned the hard way on prod): Prisma interactive
// transactions default to a 5s timeout, and per-row nested creates
// mean ~650 round trips over the network to Postgres. So this
// version: (1) raises the transaction timeout, (2) declares
// maxDuration = 60 for Vercel, (3) bulk-inserts every like /
// comment / vote / connection with createMany (~650 statements
// collapse to ~125).
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import type { User } from '@prisma/client'
import { db } from '@/lib/db'
import {
  DEMO_USERS,
  DEMO_POSTS,
  DEMO_COMMENTS,
  DEMO_CONNECTION_PAIRS,
  LIKE_PATTERN,
} from '@/lib/demo-seed-data'
import { DEMO_LOCAL_POSTS } from '@/lib/demo-seed-local'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const SEED_CODE = 'circub-demo-x7k9f2'
const SEED_DOMAIN = '@seed.circub.test'
// Nobody logs into these accounts; the hash is just to satisfy the schema.
const SEED_PASSWORD = 'seed-account-no-login-2026'

const demoWhere = { email: { endsWith: SEED_DOMAIN } }

function daysAgo(minDays: number, maxDays: number): Date {
  const d = minDays + Math.random() * (maxDays - minDays)
  const h = Math.random() * 14 // spread through the waking day
  return new Date(Date.now() - d * 86_400_000 - h * 3_600_000)
}

function hoursAfter(base: Date, minH: number, maxH: number): Date {
  return new Date(base.getTime() + (minH + Math.random() * (maxH - minH)) * 3_600_000)
}

async function countDemo() {
  const [users, posts, localPosts] = await Promise.all([
    db.user.count({ where: demoWhere }),
    db.post.count({ where: { author: demoWhere } }),
    db.localPricePost.count({ where: { author: demoWhere } }),
  ])
  return { users, posts, localPosts }
}

async function wipeDemo() {
  const deleted = await db.user.deleteMany({ where: demoWhere })
  return deleted.count
}

async function seedDemo() {
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10)

  // Per-author content counts + connection degrees, computed up front so the
  // denormalized profile stats are correct the moment the users are created
  // (no follow-up updates needed).
  const feedCount = new Map<string, number>()
  for (const p of DEMO_POSTS) feedCount.set(p.u, (feedCount.get(p.u) || 0) + 1)
  const localCount = new Map<string, number>()
  for (const p of DEMO_LOCAL_POSTS) localCount.set(p.u, (localCount.get(p.u) || 0) + 1)
  const connDegree = new Map<string, number>()
  for (const [a, b] of DEMO_CONNECTION_PAIRS) {
    connDegree.set(DEMO_USERS[a].username, (connDegree.get(DEMO_USERS[a].username) || 0) + 1)
    connDegree.set(DEMO_USERS[b].username, (connDegree.get(DEMO_USERS[b].username) || 0) + 1)
  }

  return db.$transaction(
    async (tx) => {
      // 1) Users (18 creates)
      const users: User[] = []
      for (const u of DEMO_USERS) {
        const created = await tx.user.create({
          data: {
            email: u.username + SEED_DOMAIN,
            password: passwordHash,
            username: u.username,
            name: u.name,
            avatarColor: u.avatarColor,
            headline: u.headline,
            bio: u.bio,
            location: u.location,
            accountType: u.accountType,
            companyName: u.companyName || null,
            companyIndustry: u.companyIndustry || null,
            isLocal: !!u.isLocal,
            verifiedLocal: !!u.verifiedLocal,
            idVerified: !!u.idVerified,
            verifiedAt: u.idVerified ? daysAgo(15, 40) : null,
            followersCount: u.followers,
            likesCount: u.likes,
            expertiseTags: u.expertiseTags || null,
            postsCount: feedCount.get(u.username) || 0,
            localPostCount: localCount.get(u.username) || 0,
            connectionsCount: connDegree.get(u.username) || 0,
            createdAt: daysAgo(25, 60),
          },
        })
        users.push(created)
      }
      const byUsername = new Map(users.map((u) => [u.username, u]))
      const N = users.length

      // 2) Feed posts (55 creates) — engagement collected for bulk insert
      const likeRows: { postId: string; userId: string; createdAt: Date }[] = []
      const commentRows: { postId: string; authorId: string; content: string; createdAt: Date }[] = []
      const postIds: string[] = []
      for (let i = 0; i < DEMO_POSTS.length; i++) {
        const p = DEMO_POSTS[i]
        const author = byUsername.get(p.u)
        if (!author) continue
        const createdAt = daysAgo(0, 20)

        const post = await tx.post.create({
          data: { content: p.c, authorId: author.id, createdAt, updatedAt: createdAt },
        })
        postIds.push(post.id)

        // Likes: walk a rotating user list, skip the author -> unique per post
        const k = LIKE_PATTERN[i % LIKE_PATTERN.length]
        const likers: string[] = []
        for (let s = 0; s < N * 2 && likers.length < k; s++) {
          const cand = users[(i * 5 + s * 3) % N]
          if (cand.id !== author.id && !likers.includes(cand.id)) likers.push(cand.id)
        }
        likers.forEach((uid, li) => {
          likeRows.push({ postId: post.id, userId: uid, createdAt: hoursAfter(createdAt, li * 0.4, 1 + li * 0.4) })
        })

        // Comments: every 2nd post gets one, every 3rd gets a second
        let want = 0
        if (i % 2 === 0) want = 1
        if (i % 3 === 0) want = 2
        if (want > 0) {
          const commentAuthors: string[] = []
          for (let s = 0; s < N * 2 && commentAuthors.length < want; s++) {
            const cand = users[(i * 11 + s * 7) % N]
            if (cand.id !== author.id && !commentAuthors.includes(cand.id)) commentAuthors.push(cand.id)
          }
          commentAuthors.forEach((uid, ci) => {
            const src = DEMO_COMMENTS[(i * 3 + ci * 7) % DEMO_COMMENTS.length]
            commentRows.push({ postId: post.id, authorId: uid, content: src.c, createdAt: hoursAfter(createdAt, 0.5, 9) })
          })
        }
      }

      // 3) Local price posts (46 creates) — votes collected for bulk insert
      const voteRows: { postId: string; userId: string; voteType: string; createdAt: Date }[] = []
      for (let j = 0; j < DEMO_LOCAL_POSTS.length; j++) {
        const p = DEMO_LOCAL_POSTS[j]
        const author = byUsername.get(p.u)
        if (!author) continue
        const createdAt = daysAgo(0, 25)

        const lp = await tx.localPricePost.create({
          data: {
            postType: p.postType,
            productName: p.productName,
            description: p.description || null,
            country: p.country || 'Ethiopia',
            city: p.city || null,
            neighborhood: p.neighborhood || null,
            market: p.market || null,
            currency: p.currency || 'ETB',
            priceMin: p.min,
            priceMax: p.max,
            recommendedPrice: p.rec || null,
            localTip: p.tip || null,
            category: p.category,
            authorId: author.id,
            helpfulCount: 2 + (j % 5) + ((j * 7) % 19),
            notAccurateCount: j % 4 === 0 ? 1 : 0,
            createdAt,
            updatedAt: createdAt,
          },
        })

        const v = 2 + (j % 5)
        const voters: string[] = []
        for (let s = 0; s < N * 2 && voters.length < v; s++) {
          const cand = users[(j * 7 + s * 5) % N]
          if (cand.id !== author.id && !voters.includes(cand.id)) voters.push(cand.id)
        }
        voters.forEach((uid, vi) => {
          voteRows.push({ postId: lp.id, userId: uid, voteType: 'HELPFUL', createdAt: hoursAfter(createdAt, vi * 0.5, 2 + vi * 0.5) })
        })
      }

      // 4) Bulk engagement inserts (4 statements instead of ~500)
      await tx.postLike.createMany({ data: likeRows })
      await tx.comment.createMany({ data: commentRows })
      await tx.localPriceVote.createMany({ data: voteRows })
      await tx.connection.createMany({
        data: DEMO_CONNECTION_PAIRS.map(([a, b]) => ({
          requesterId: users[a].id,
          receiverId: users[b].id,
          status: 'ACCEPTED',
          createdAt: daysAgo(10, 50),
        })),
      })

      return {
        users: users.length,
        posts: postIds.length,
        postLikes: likeRows.length,
        postComments: commentRows.length,
        localPosts: DEMO_LOCAL_POSTS.length,
        localVotes: voteRows.length,
        connections: DEMO_CONNECTION_PAIRS.length,
      }
    },
    // Prod Postgres over the network needs far more than the 5s default
    { timeout: 60_000, maxWait: 15_000 }
  )
}

async function handle(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const mode = searchParams.get('mode') || 'seed'
  const force = searchParams.get('force') === '1'

  if (code !== SEED_CODE) {
    return NextResponse.json({ error: 'Invalid code' }, { status: 403 })
  }

  try {
    if (mode === 'status') {
      return NextResponse.json({ ok: true, mode, existing: await countDemo() })
    }

    if (mode === 'cleanup') {
      const existing = await countDemo()
      const deletedUsers = await wipeDemo()
      return NextResponse.json({
        ok: true,
        mode,
        deletedUsers,
        removedContent: existing,
        note: 'All demo users, posts, likes, comments, local price posts, votes and connections were removed.',
      })
    }

    if (mode === 'seed') {
      const existing = await countDemo()
      if ((existing.users > 0 || existing.posts > 0) && !force) {
        return NextResponse.json({ ok: true, mode, alreadySeeded: true, existing })
      }
      if (force && existing.users > 0) await wipeDemo()
      const created = await seedDemo()
      return NextResponse.json({ ok: true, mode, seeded: true, created })
    }

    return NextResponse.json({ error: 'Unknown mode — use seed | cleanup | status' }, { status: 400 })
  } catch (error) {
    console.error('Seed endpoint failed:', error)
    return NextResponse.json({ error: 'Seed operation failed' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  return handle(req)
}

export async function POST(req: NextRequest) {
  return handle(req)
}

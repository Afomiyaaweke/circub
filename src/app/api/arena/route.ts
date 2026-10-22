// v200: PRICE ARENA - the feed is a game between price posters and the
// best-voted item wins. ONE GET endpoint answers the whole weekly battle:
//
//   leaderboard  top 5 posters of THIS WEEK by XP earned from votes their
//                week-old-or-newer prices collected (vote=100 XP, post=50).
//                Each row carries the poster's LIFETIME level (LVL chip in
//                the UI) next to their weekly score.
//   duel         the head-to-head between the 2 best-voted items of the
//                week - vote split %, both authors, myVote per side so the
//                UI can render VOTE buttons that work exactly like the
//                card's (same /api/local-prices/[id]/vote endpoint).
//   resetsAt     when the weekly battle resets (next Monday 00:00 UTC) -
//                computed HERE so the client never invents a deadline.
//
// No new tables: everything aggregates LocalPricePost/LocalPriceVote rows
// the app already writes. The window is small (a week of posts), so the
// aggregation happens in-process instead of a groupBy query - simpler and
// fast at this scale.
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/session'
import { levelOf, posterXp, nextWeeklyReset, weekWindowStart } from '@/lib/arena'

const AUTHOR_SELECT = {
  id: true, name: true, username: true, avatarColor: true, profilePicture: true,
  helpfulVotes: true, localPostCount: true,
} as const

const POST_SELECT = {
  id: true, productName: true, postType: true, category: true,
  currency: true, priceMin: true, priceMax: true, imageUrl: true,
  city: true, country: true, helpfulCount: true, notAccurateCount: true,
  createdAt: true, authorId: true,
  author: { select: AUTHOR_SELECT },
} as const

type ArenaPost = {
  id: string; productName: string; postType: string; category: string
  currency: string; priceMin: number; priceMax: number; imageUrl: string | null
  city: string | null; country: string; helpfulCount: number; notAccurateCount: number
  createdAt: Date; authorId: string
  author: { id: string; name: string; username: string | null; avatarColor: string; profilePicture: string | null; helpfulVotes: number; localPostCount: number }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    // ?cb= is a cache-buster the UI never sends - probes and refreshes use
    // it to miss the CDN edge and read fresh data.
    void searchParams
    const since = weekWindowStart()
    const weekPosts: ArenaPost[] = await db.localPricePost.findMany({
      where: { createdAt: { gte: since } },
      select: POST_SELECT,
      orderBy: { createdAt: 'desc' },
      take: 500,
    })

    // Leaderboard: one row per author with a post this week.
    const byAuthor = new Map<string, { author: ArenaPost['author']; posts: number; votes: number; xp: number }>()
    for (const p of weekPosts) {
      const row = byAuthor.get(p.authorId) || { author: p.author, posts: 0, votes: 0, xp: 0 }
      row.posts += 1
      row.votes += Math.max(0, p.helpfulCount || 0)
      row.xp = row.votes * 100 + row.posts * 50
      byAuthor.set(p.authorId, row)
    }
    const leaderboard = Array.from(byAuthor.values())
      .sort((a, b) => b.xp - a.xp || b.votes - a.votes || b.posts - a.posts)
      .slice(0, 5)
      .map((row, idx) => ({
        rank: idx + 1,
        authorId: row.author.id,
        name: row.author.name,
        username: row.author.username,
        avatarColor: row.author.avatarColor,
        profilePicture: row.author.profilePicture,
        weeklyXp: row.xp,
        weeklyPosts: row.posts,
        weeklyVotes: row.votes,
        level: levelOf(posterXp(row.author)),
        xp: posterXp(row.author),
      }))

    // Duel: the two best-voted items of the week (tiebreak = newer).
    const rankedItems = [...weekPosts].sort((a, b) => b.helpfulCount - a.helpfulCount || b.createdAt.getTime() - a.createdAt.getTime())
    const top = rankedItems.filter((p) => p.helpfulCount > 0).slice(0, 2)
    const duel = top.length === 2 ? top : (top.length === 1 ? [top[0]] : [])
    const totalVotes = duel.reduce((s, p) => s + p.helpfulCount, 0)
    const withPct = duel.map((p, idx) => ({
      ...p,
      createdAt: p.createdAt.toISOString(),
      side: idx === 0 ? 'a' : 'b',
      pct: totalVotes > 0 ? Math.round((p.helpfulCount / totalVotes) * 100) : (duel.length === 2 ? 50 : 100),
      author: { ...p.author, level: levelOf(posterXp(p.author)), xp: posterXp(p.author) },
    }))

    // myVote for the duel items so the VOTE buttons start in the right state.
    let myVotes: Record<string, string | null> = {}
    try {
      const session = await getCurrentUser()
      if (session && duel.length > 0) {
        const rows = await db.localPriceVote.findMany({ where: { userId: session.id, postId: { in: duel.map((p) => p.id) } }, select: { postId: true, voteType: true } })
        myVotes = Object.fromEntries(rows.map((r) => [r.postId, r.voteType]))
        for (const p of duel) if (!(p.id in myVotes)) myVotes[p.id] = null
      } else if (duel.length > 0) {
        for (const p of duel) myVotes[p.id] = null
      }
    } catch { myVotes = {} }

    return NextResponse.json(
      {
        week: { posts: weekPosts.length, votes: weekPosts.reduce((s, p) => s + Math.max(0, p.helpfulCount || 0), 0) },
        resetsAt: nextWeeklyReset().toISOString(),
        leaderboard,
        duel: withPct,
        myVotes,
      },
      {
        // Short edge cache: the battle should feel live. 30s is invisible to
        // players and still collapses bursts; ?cb= bypasses it entirely.
        headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' },
      }
    )
  } catch (error) {
    console.error('Arena failed:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

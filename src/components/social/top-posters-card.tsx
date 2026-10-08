'use client'

// v137: the poster Score board - ONE component, TWO homes.
// v136 made this leaderboard a section in the Local Price Feed (visible on
// every screen size) and kept the desktop sidebar on the same shared card.
// v137 renames the section to "Score" and swaps the per-row "N posts" count
// for the poster's actual score - the same two honest signals the v135
// profile chip shows next to the Saved button:
//   - rating: the poster's average review score (guides get theirs from
//     /api/guides/[id]/ratings; 0 = no reviews yet),
//   - helpful votes: how many HELPFUL votes the poster's price posts earned
//     (every HELPFUL vote on /api/local-prices/[id]/vote increments
//     User.helpfulVotes; lifetime counter).
// Rows keep their #1-#5 rank by lifetime post count (the API's ordering is
// untouched - nothing invented), each poster keeps their OWN avatarColor,
// and a poster with no reviews and no votes yet scores as plain "New".

import { useState, useEffect } from 'react'
import { Star, Trophy } from 'lucide-react'
import { Card } from '@/components/ui/card'
import type { User } from '@/lib/types'

// Same avatar palette as the public share profile (/u/<username>) - each
// poster keeps their own color everywhere in the app.
const AVATAR_COLORS: Record<string, string> = {
  teal: 'bg-teal-600', blue: 'bg-blue-600', green: 'bg-green-600', red: 'bg-red-600',
  purple: 'bg-purple-600', orange: 'bg-orange-600', pink: 'bg-pink-600', amber: 'bg-amber-600',
}

// Medal colors for the first three ranks; everyone else stays muted.
const RANK_COLORS = ['text-orange-600', 'text-slate-600', 'text-orange-500']

interface TopPostersCardProps {
  // Bump to re-fetch: the sidebar passes its refreshSignal so the board
  // updates after network actions; the feed section mounts once and lets
  // the API's 60s edge cache do its job.
  refreshSignal?: number
}

export function TopPostersCard({ refreshSignal = 0 }: TopPostersCardProps) {
  const [posters, setPosters] = useState<User[]>([])

  useEffect(() => {
    let alive = true
    fetch('/api/top-posters')
      .then((r) => r.json())
      .then((d) => {
        if (alive) setPosters(d.posters || [])
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [refreshSignal])

  // Same display matrix as the v135 profile chip, spelled out for a row:
  //   rated + voted -> "4.5 · 12 helpful"   rated only -> "4.5"
  //   voted only    -> "12 helpful"         neither    -> "New"
  const scoreOf = (p: User): { text: string; rated: boolean; title: string } => {
    const rating = typeof p.rating === 'number' && p.rating > 0 ? p.rating : 0
    const votes = typeof p.helpfulVotes === 'number' && p.helpfulVotes > 0 ? p.helpfulVotes : 0
    if (rating > 0 && votes > 0) {
      return {
        text: `${rating.toFixed(1)} · ${votes} helpful`,
        rated: true,
        title: `Rating ${rating.toFixed(1)} from reviews, ${votes} helpful votes on their price posts`,
      }
    }
    if (rating > 0) {
      return { text: rating.toFixed(1), rated: true, title: `Rating ${rating.toFixed(1)} from reviews` }
    }
    if (votes > 0) {
      return { text: `${votes} helpful`, rated: false, title: `${votes} helpful votes on their price posts` }
    }
    return { text: 'New', rated: false, title: 'No reviews or helpful votes yet' }
  }

  return (
    <Card data-testid="top-posters-section" className="p-4 shadow-sm">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground mb-3">
        <Trophy className="w-4 h-4 text-primary" />
        Score
      </h3>
      <div className="space-y-2.5">
        {posters.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-3">
            No posts yet.
          </p>
        ) : (
          posters.map((p, idx) => {
            const score = scoreOf(p)
            return (
              <div
                key={p.id}
                data-testid="top-posters-row"
                className="flex items-center justify-between gap-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`text-xs font-bold w-5 shrink-0 ${RANK_COLORS[idx] || 'text-muted-foreground'}`}
                  >
                    #{idx + 1}
                  </span>
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0 ${AVATAR_COLORS[p.avatarColor] || 'bg-primary'}`}
                  >
                    {p.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-sm text-foreground font-medium truncate">
                    {p.name}
                  </span>
                </div>
                <span
                  data-testid="top-posters-score"
                  title={score.title}
                  className={`text-xs font-medium shrink-0 inline-flex items-center gap-1 ${score.rated ? 'text-amber-600' : 'text-muted-foreground'}`}
                >
                  {score.rated && (
                    <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                  )}
                  {score.text}
                </span>
              </div>
            )
          })
        )}
      </div>
    </Card>
  )
}

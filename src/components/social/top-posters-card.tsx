'use client'

// v137: the "Score" section - ONE component, TWO homes.
// v136 made this leaderboard a section in the Local Price Feed (visible on
// every screen size) and kept the desktop sidebar on the same shared card;
// v137 renamed the section to "Score". The content is deliberately the top
// POSTERS board: rows ranked #1-#5 by lifetime post count with the amber
// 'N posts' count on the right - that count IS the poster's score here.
// NOT a star rating given by others: the user explicitly pulled the review
// stars / helpful-votes display back out ("who is the top poster, not the
// star given by the others"). Each poster keeps their OWN avatarColor.

import { useState, useEffect } from 'react'
import { Trophy } from 'lucide-react'
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
          posters.map((p, idx) => (
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
              <span className="text-xs text-amber-600 font-medium shrink-0">
                {p.postsCount} posts
              </span>
            </div>
          ))
        )}
      </div>
    </Card>
  )
}

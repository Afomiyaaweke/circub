'use client'

// v136: shared "Top posters" leaderboard card - ONE component, TWO homes.
// It lived only in the desktop right sidebar (hidden below lg), which made
// it invisible to every phone user - the majority of circub traffic. It
// now also renders as its own section in the Local Price Feed, and the
// sidebar renders this same component so the two can never drift.
// Design per the user's mockup: trophy header, rank numbers in medal
// colors, each poster's OWN avatarColor filling the avatar circle, and
// the lifetime post count on the right.

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
        Top posters
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

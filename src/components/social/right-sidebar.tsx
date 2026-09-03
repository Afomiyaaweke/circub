'use client'

import { useState, useEffect } from 'react'
import { UserPlus, Flame, Trophy, TrendingUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import type { User, Trend } from '@/lib/types'

interface RightSidebarProps {
  refreshSignal: number
}

export function RightSidebar({ refreshSignal }: RightSidebarProps) {
  const [suggestions, setSuggestions] = useState<User[]>([])
  const [trends, setTrends] = useState<Trend[]>([])
  const [posters, setPosters] = useState<User[]>([])
  const [followLoading, setFollowLoading] = useState<string | null>(null)
  const { toast } = useToast()

  useEffect(() => {
    Promise.all([
      fetch('/api/suggested').then((r) => r.json()),
      fetch('/api/trending').then((r) => r.json()),
      fetch('/api/top-posters').then((r) => r.json()),
    ])
      .then(([s, t, p]) => {
        setSuggestions(s.suggestions || [])
        setTrends(t.trends || [])
        setPosters(p.posters || [])
      })
      .catch(() => {})
  }, [refreshSignal])

  const handleFollow = async (id: string, name: string) => {
    setFollowLoading(id)
    try {
      const res = await fetch(`/api/users/${id}/follow`, { method: 'POST' })
      const data = await res.json()
      if (data.following) {
        toast({ title: `You are now following ${name}` })
      } else {
        toast({ title: `Unfollowed ${name}` })
      }
      // Refresh suggestions
      const s = await fetch('/api/suggested').then((r) => r.json())
      setSuggestions(s.suggestions || [])
      const p = await fetch('/api/top-posters').then((r) => r.json())
      setPosters(p.posters || [])
    } catch {
      toast({ title: 'Action failed', variant: 'destructive' })
    } finally {
      setFollowLoading(null)
    }
  }

  return (
    <aside className="w-full lg:w-72 shrink-0 space-y-4">
      {/* Suggested for You */}
      <Card className="p-4 shadow-sm">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground mb-3">
          <UserPlus className="w-4 h-4 text-primary" />
          Suggested for you
        </h3>
        {suggestions.length === 0 ? (
          <p className="text-xs text-muted-foreground py-4 text-center">
            You&apos;re following everyone we know!
          </p>
        ) : (
          <div className="space-y-3">
            {suggestions.slice(0, 4).map((u) => (
              <div
                key={u.id}
                className="flex items-center justify-between gap-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-primary/15 text-primary flex items-center justify-center font-semibold shrink-0">
                    {u.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {u.name}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {u.followersCount} followers
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleFollow(u.id, u.name)}
                  disabled={followLoading === u.id}
                  className="h-7 px-3 text-xs border-primary text-primary hover:bg-primary hover:text-primary-foreground"
                >
                  {followLoading === u.id ? '...' : 'Follow'}
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Trending Now */}
      <Card className="p-4 shadow-sm">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground mb-3">
          <Flame className="w-4 h-4 text-primary" />
          Trending now
        </h3>
        <div className="space-y-2">
          {trends.slice(0, 6).map((t, idx) => (
            <div
              key={`${t.label}-${idx}`}
              className="flex items-center justify-between gap-2 text-sm hover:bg-accent/40 -mx-2 px-2 py-1.5 rounded-md cursor-default transition-colors"
            >
              <div className="flex items-center gap-2 min-w-0">
                <TrendingUp className="w-3.5 h-3.5 text-primary shrink-0" />
                <span className="text-foreground truncate">{t.label}</span>
              </div>
              <span className="text-xs text-muted-foreground shrink-0">
                {t.count} posts
              </span>
            </div>
          ))}
        </div>
      </Card>

      {/* Top Posters */}
      <Card className="p-4 shadow-sm">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground mb-3">
          <Trophy className="w-4 h-4 text-primary" />
          Top posters
        </h3>
        <div className="space-y-3">
          {posters.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-3">
              No posts yet.
            </p>
          ) : (
            posters.map((p, idx) => {
              const medal =
                idx === 0
                  ? 'text-amber-500'
                  : idx === 1
                  ? 'text-slate-400'
                  : idx === 2
                  ? 'text-orange-400'
                  : 'text-muted-foreground'
              return (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`text-xs font-bold ${medal} w-4 shrink-0`}>
                      #{idx + 1}
                    </span>
                    <div className="w-8 h-8 rounded-full bg-primary/15 text-primary flex items-center justify-center text-xs font-semibold shrink-0">
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
              )
            })
          )}
        </div>
      </Card>
    </aside>
  )
}

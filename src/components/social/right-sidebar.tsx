'use client'

import { useState, useEffect } from 'react'
import {
  UserPlus,
  Flame,
  Trophy,
  TrendingUp,
  Mail,
  MapPin,
  MessageSquareText,
  Star,
  BadgeCheck,
  ThumbsUp,
} from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import type { User, Trend, LocalPricePost } from '@/lib/types'

interface RightSidebarProps {
  refreshSignal: number
  onMessage: (userId: string) => void
  onOpenMessages: () => void
  incomingInvitationsCount: number
  onOpenLocalPrice: (postId: string) => void
  onOpenLocalProfile: (userId: string) => void
  onGoToFeed: () => void
}

export function RightSidebar({
  refreshSignal,
  onOpenMessages,
  incomingInvitationsCount,
  onOpenLocalPrice,
  onOpenLocalProfile,
  onGoToFeed,
}: RightSidebarProps) {
  const [suggestions, setSuggestions] = useState<User[]>([])
  const [trends, setTrends] = useState<Trend[]>([])
  const [posters, setPosters] = useState<User[]>([])
  const [recentPrices, setRecentPrices] = useState<LocalPricePost[]>([])
  const [connecting, setConnecting] = useState<string | null>(null)
  const { toast } = useToast()

  useEffect(() => {
    Promise.all([
      fetch('/api/suggested').then((r) => r.json()),
      fetch('/api/trending').then((r) => r.json()),
      fetch('/api/top-posters').then((r) => r.json()),
      fetch('/api/recent-local-prices').then((r) => r.json()),
    ])
      .then(([s, t, p, r]) => {
        setSuggestions(s.suggestions || [])
        setTrends(t.trends || [])
        setPosters(p.posters || [])
        setRecentPrices(r.posts || [])
      })
      .catch(() => {})
  }, [refreshSignal])

  const handleConnect = async (id: string, name: string) => {
    setConnecting(id)
    try {
      const res = await fetch('/api/connections/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiverId: id }),
      })
      const data = await res.json()
      if (data.status === 'ACCEPTED') {
        toast({ title: `Connected with ${name}` })
      } else if (data.status === 'PENDING') {
        toast({ title: `Connection request sent to ${name}` })
      } else if (data.error === 'Already connected') {
        toast({ title: `Already connected with ${name}` })
      } else if (data.error === 'Request already pending') {
        toast({ title: `Request to ${name} is already pending` })
      } else {
        toast({ title: `Connection request sent to ${name}` })
      }
      // Refresh suggestions
      const s = await fetch('/api/suggested').then((r) => r.json())
      setSuggestions(s.suggestions || [])
    } catch {
      toast({ title: 'Failed to connect', variant: 'destructive' })
    } finally {
      setConnecting(null)
    }
  }

  const formatPrice = (value: number, currency: string) => {
    if (value >= 1000) return `${currency} ${value.toLocaleString()}`
    return `${currency} ${value}`
  }

  return (
    <aside className="w-full lg:w-72 shrink-0 space-y-4">
      {/* Messages shortcut card */}
      <Card className="p-4 shadow-sm">
        <button
          onClick={onOpenMessages}
          className="w-full flex items-center justify-between gap-2"
        >
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Mail className="w-4 h-4 text-primary" />
            Messages
          </h3>
          {incomingInvitationsCount > 0 && (
            <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[10px] font-semibold bg-primary text-primary-foreground rounded-full">
              {incomingInvitationsCount}
            </span>
          )}
        </button>
      </Card>

      {/* What locals are saying — NEW widget */}
      <Card className="p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <MessageSquareText className="w-4 h-4 text-primary" />
            What locals are saying
          </h3>
          <button
            onClick={onGoToFeed}
            className="text-[10px] text-primary font-medium hover:underline"
          >
            View all
          </button>
        </div>
        {recentPrices.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-3">
            No local price posts yet.
          </p>
        ) : (
          <div className="space-y-2.5">
            {recentPrices.slice(0, 4).map((p) => (
              <button
                key={p.id}
                onClick={() => onOpenLocalPrice(p.id)}
                className="w-full text-left hover:bg-accent/40 -mx-2 px-2 py-1.5 rounded-md transition-colors"
              >
                <p className="text-sm font-medium text-foreground truncate">
                  {p.productName}
                </p>
                <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                  <MapPin className="w-3 h-3" />
                  <span className="truncate">
                    {[p.city, p.country].filter(Boolean).join(', ')}
                  </span>
                </p>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-primary">
                    {formatPrice(p.priceMin, p.currency)} – {formatPrice(p.priceMax, p.currency)}
                  </p>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-0.5">
                      <ThumbsUp className="w-3 h-3 text-primary" />
                      {p.helpfulCount}
                    </span>
                    {p.author.verifiedLocal && (
                      <BadgeCheck className="w-3 h-3 text-primary" />
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
        <button
          onClick={onGoToFeed}
          className="w-full mt-3 px-3 py-1.5 text-xs font-medium text-primary hover:bg-accent rounded-md transition-colors border border-primary/20"
        >
          Browse Local Price Feed →
        </button>
      </Card>

      {/* Suggested for You */}
      <Card className="p-4 shadow-sm">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground mb-3">
          <UserPlus className="w-4 h-4 text-primary" />
          Add to your network
        </h3>
        {suggestions.length === 0 ? (
          <p className="text-xs text-muted-foreground py-4 text-center">
            You&apos;ve connected with everyone we know!
          </p>
        ) : (
          <div className="space-y-3">
            {suggestions.slice(0, 4).map((u) => (
              <div
                key={u.id}
                className="flex items-center justify-between gap-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Avatar className="w-9 h-9 border border-accent">
                    <AvatarFallback className="bg-primary/15 text-primary font-semibold text-sm">
                      {u.name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {u.name}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {u.headline || `${u.followersCount} followers`}
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleConnect(u.id, u.name)}
                  disabled={connecting === u.id}
                  className="h-7 px-3 text-xs border-primary text-primary hover:bg-primary hover:text-primary-foreground gap-1.5"
                >
                  {connecting === u.id ? (
                    '...'
                  ) : (
                    <>
                      <UserPlus className="w-3 h-3" />
                      Connect
                    </>
                  )}
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
                    <Avatar className="w-7 h-7 border border-accent">
                      <AvatarFallback className="bg-primary/15 text-primary text-xs font-semibold">
                        {p.name.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
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

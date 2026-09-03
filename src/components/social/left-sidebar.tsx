'use client'

import { Newspaper, Users, Heart, Link2, MapPin, Briefcase, Mail } from 'lucide-react'
import { Card } from '@/components/ui/card'
import type { User } from '@/lib/types'

interface LeftSidebarProps {
  user: User | null
  loading: boolean
  onMessage: () => void
  onManageNetwork: () => void
}

export function LeftSidebar({ user, loading, onMessage, onManageNetwork }: LeftSidebarProps) {
  const stats = [
    { label: 'Posts', value: user?.postsCount ?? 0, icon: Newspaper },
    { label: 'Connections', value: user?.connectionsCount ?? 0, icon: Users },
    { label: 'Likes', value: user?.likesCount ?? 0, icon: Heart },
  ]

  return (
    <aside className="w-full lg:w-64 shrink-0">
      <Card className="overflow-hidden p-0 shadow-sm">
        {/* Cover banner */}
        <div className="h-20 bg-gradient-to-br from-primary to-emerald-400" />

        {/* Avatar + name */}
        <div className="px-4 pb-4 -mt-9 flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-full bg-white border-4 border-white shadow-md flex items-center justify-center text-primary font-bold text-2xl">
            {loading ? '...' : (user?.name ?? 'M').charAt(0).toUpperCase()}
          </div>
          <h2 className="mt-2 font-bold text-foreground text-lg">
            {user?.name ?? '...'}
          </h2>
          {user?.headline && (
            <p className="mt-1 text-xs text-muted-foreground flex items-center gap-1 line-clamp-2">
              <Briefcase className="w-3 h-3 shrink-0" />
              {user.headline}
            </p>
          )}
          {user?.location && (
            <p className="mt-1 text-[11px] text-muted-foreground flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              {user.location}
            </p>
          )}
          {user?.bio && (
            <p className="mt-2 text-xs text-muted-foreground line-clamp-3">
              {user.bio}
            </p>
          )}

          {/* Stats row */}
          <div className="mt-4 grid grid-cols-3 gap-1 w-full">
            {stats.map((stat) => {
              const Icon = stat.icon
              return (
                <div
                  key={stat.label}
                  className="flex flex-col items-center text-center gap-1 py-2 rounded-lg hover:bg-accent/60 transition-colors cursor-default"
                >
                  <Icon className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-semibold text-foreground">
                    {stat.value}
                  </span>
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {stat.label}
                  </span>
                </div>
              )
            })}
          </div>

          {/* Action buttons */}
          <button
            onClick={onManageNetwork}
            className="mt-3 w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-primary hover:bg-accent/40 transition-colors border border-primary/20"
          >
            <Link2 className="w-3.5 h-3.5" />
            Manage network
          </button>
          <button
            onClick={onMessage}
            className="mt-2 w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-muted-foreground hover:bg-accent/40 transition-colors"
          >
            <Mail className="w-3.5 h-3.5" />
            Messages
          </button>
        </div>
      </Card>
    </aside>
  )
}

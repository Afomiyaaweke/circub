'use client'

import { Newspaper, Users, Heart } from 'lucide-react'
import { Card } from '@/components/ui/card'
import type { User } from '@/lib/types'

interface LeftSidebarProps {
  user: User | null
  loading: boolean
}

export function LeftSidebar({ user, loading }: LeftSidebarProps) {
  const stats = [
    { label: 'Posts', value: user?.postsCount ?? 0, icon: Newspaper },
    { label: 'Followers', value: user?.followersCount ?? 0, icon: Users },
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
          {user?.bio && (
            <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
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
        </div>
      </Card>

      {/* Network activity card */}
      <Card className="mt-4 p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-foreground mb-3">
          Your Network
        </h3>
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Following</span>
            <span className="font-medium text-foreground">
              {user?.followingCount ?? 0}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Reach</span>
            <span className="font-medium text-foreground">
              {(user?.followersCount ?? 0) + (user?.likesCount ?? 0)}{' '}
              <span className="text-xs text-muted-foreground">people</span>
            </span>
          </div>
        </div>
      </Card>
    </aside>
  )
}

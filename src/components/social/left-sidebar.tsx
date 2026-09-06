'use client'

import { useState } from 'react'
import { Newspaper, Users, Heart, Link2, MapPin, Briefcase, Mail, UserCircle, Camera, ChevronUp, ChevronDown } from 'lucide-react'
import { Card } from '@/components/ui/card'
import type { User } from '@/lib/types'

interface LeftSidebarProps {
  user: User | null
  loading: boolean
  onMessage: () => void
  onManageNetwork: () => void
  onEditProfile: () => void
  editProfileOpen?: boolean
}

export function LeftSidebar({ user, loading, onMessage, onManageNetwork, onEditProfile, editProfileOpen = false }: LeftSidebarProps) {
  const [expanded, setExpanded] = useState(true)
  const stats = [
    { label: 'Posts', value: user?.postsCount ?? 0, icon: Newspaper },
    { label: 'Connections', value: user?.connectionsCount ?? 0, icon: Users },
    { label: 'Likes', value: user?.likesCount ?? 0, icon: Heart },
  ]

  return (
    <aside className="w-full lg:w-64 shrink-0">
      <Card className="overflow-hidden p-0 shadow-sm">
        {/* Cover banner */}
        <div className="h-16 sm:h-20 bg-gradient-to-br from-primary to-emerald-400" />

        {/* Profile section */}
        <div className="px-4 pb-4 -mt-8 sm:-mt-9 flex flex-col items-center text-center">
          {/* Profile picture — tap toggles all info */}
          <button
            onClick={() => setExpanded(!expanded)}
            className="group relative rounded-full transition-transform active:scale-90 mb-1"
            aria-label={expanded ? 'Collapse profile info' : 'Expand profile info'}
          >
            {user?.profilePicture ? (
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-white border-4 border-white shadow-md overflow-hidden">
                <img src={user.profilePicture} alt={user?.name || 'Profile'} className="w-full h-full object-cover" />
              </div>
            ) : (
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-white border-4 border-white shadow-md flex items-center justify-center text-primary font-bold text-xl sm:text-2xl">
                {loading ? '...' : (user?.name ?? 'M').charAt(0).toUpperCase()}
              </div>
            )}
          </button>

          {/* Name — always visible */}
          <h2 className="mt-1 font-bold text-foreground text-base sm:text-lg">
            {user?.name ?? '...'}
          </h2>

          {/* Toggle indicator */}
          <button
            onClick={() => setExpanded(!expanded)}
            className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary transition-colors"
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded ? (
              <><ChevronUp className="w-3 h-3" /><span>Tap to hide</span></>
            ) : (
              <><ChevronDown className="w-3 h-3" /><span>Tap to show info</span></>
            )}
          </button>

          {/* Expandable profile info */}
          {expanded && (
            <div className="w-full mt-3 space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
              {user?.headline && (
                <p className="text-xs text-muted-foreground flex items-center gap-1 line-clamp-2 px-2 justify-center">
                  <Briefcase className="w-3 h-3 shrink-0" />
                  {user.headline}
                </p>
              )}
              {user?.location && (
                <p className="text-[11px] text-muted-foreground flex items-center gap-1 justify-center">
                  <MapPin className="w-3 h-3" />
                  {user.location}
                </p>
              )}
              {user?.bio && (
                <p className="text-xs text-muted-foreground line-clamp-3 px-2">{user.bio}</p>
              )}

              {/* Stats row */}
              <div className="grid grid-cols-3 gap-1 w-full">
                {stats.map((stat) => {
                  const Icon = stat.icon
                  return (
                    <div key={stat.label} className="flex flex-col items-center text-center gap-0.5 py-2 rounded-lg hover:bg-accent/60 transition-colors cursor-default">
                      <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-sm font-semibold text-foreground">{stat.value}</span>
                      <span className="text-[9px] uppercase tracking-wide text-muted-foreground">{stat.label}</span>
                    </div>
                  )
                })}
              </div>

              {/* Action buttons */}
              <div className="flex flex-col gap-2">
                <button
                  onClick={onEditProfile}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium text-primary hover:bg-accent/40 transition-colors border border-primary/20"
                >
                  <UserCircle className="w-3.5 h-3.5" />
                  Edit profile
                </button>
                <div className="flex gap-2">
                  <button onClick={onManageNetwork} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium text-primary hover:bg-accent/40 transition-colors border border-primary/20">
                    <Link2 className="w-3.5 h-3.5" />
                    Network
                  </button>
                  <button onClick={onMessage} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium text-muted-foreground hover:bg-accent/40 transition-colors">
                    <Mail className="w-3.5 h-3.5" />
                    Messages
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </Card>
    </aside>
  )
}

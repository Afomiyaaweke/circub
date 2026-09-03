'use client'

import { Newspaper, Compass, Users, Bookmark, MessageSquare } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TabKey } from '@/lib/types'

interface HeaderProps {
  activeTab: TabKey
  onTabChange: (tab: TabKey) => void
  onOpenMessages: () => void
  incomingInvitationsCount: number
}

const TABS: { key: TabKey; label: string; icon: typeof Newspaper }[] = [
  { key: 'feed', label: 'Feed', icon: Newspaper },
  { key: 'discover', label: 'Discover', icon: Compass },
  { key: 'network', label: 'Network', icon: Users },
  { key: 'bookmark', label: 'Bookmark', icon: Bookmark },
]

export function Header({
  activeTab,
  onTabChange,
  onOpenMessages,
  incomingInvitationsCount,
}: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-border">
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
        {/* Logo + brand */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center justify-center w-9 h-9 rounded-full bg-primary shrink-0 shadow-sm">
            <svg viewBox="0 0 24 24" className="w-5 h-5 text-white" fill="currentColor">
              <circle cx="12" cy="6" r="2.5" />
              <circle cx="5" cy="16" r="2.5" />
              <circle cx="19" cy="16" r="2.5" />
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M12 8.5L5.5 14M12 8.5L18.5 14"
                stroke="currentColor"
                strokeWidth="1.5"
                fill="none"
              />
            </svg>
          </div>
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-bold text-foreground truncate">
              Social Circle
            </h1>
            <p className="hidden sm:block text-xs text-muted-foreground italic truncate">
              Connect, share, and grow your personalized network
            </p>
          </div>
        </div>

        {/* Nav tabs */}
        <nav className="flex items-center gap-1 sm:gap-2">
          {TABS.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.key
            return (
              <button
                key={tab.key}
                onClick={() => onTabChange(tab.key)}
                className={cn(
                  'flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-full text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )}
                aria-current={isActive ? 'page' : undefined}
              >
                <Icon className="w-4 h-4" />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            )
          })}

          {/* Messages button with badge */}
          <button
            onClick={onOpenMessages}
            className="relative flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-full text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            aria-label="Messages"
          >
            <MessageSquare className="w-4 h-4" />
            <span className="hidden sm:inline">Messages</span>
            {incomingInvitationsCount > 0 && (
              <span className="absolute -top-1 -right-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-semibold bg-primary text-primary-foreground rounded-full">
                {incomingInvitationsCount}
              </span>
            )}
          </button>
        </nav>
      </div>
    </header>
  )
}

'use client'

import { useState, useRef, useEffect } from 'react'
import { MapPin, Users, MessageSquare, Sparkles, Building2, LogOut, ChevronDown, UserCircle, Compass, Mail, Shield, FileText, UserX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import type { TabKey, User } from '@/lib/types'

interface HeaderProps {
  activeTab: TabKey
  onTabChange: (tab: TabKey) => void
  onOpenMessages: () => void
  incomingInvitationsCount: number
  user: User | null
  onSignUp: () => void
  onLogin: () => void
  onLogout: () => void
  onEditProfile: () => void
  onOpenNetwork: () => void
  onDeactivateAccount: () => void
}

// Bookmark and Network live inside the Profile tab now (Instagram-style) -
// the top nav keeps the four top-level destinations.
const TABS: { key: TabKey; label: string; icon: typeof MapPin }[] = [
  { key: 'feed', label: 'Feed', icon: Sparkles },
  { key: 'local', label: 'Local', icon: MapPin },
  { key: 'guides', label: 'Guides', icon: Compass },
  { key: 'profile', label: 'Profile', icon: UserCircle },
]

export function Header({
  activeTab,
  onTabChange,
  onOpenMessages,
  incomingInvitationsCount,
  user,
  onSignUp,
  onLogin,
  onLogout,
  onEditProfile,
  onOpenNetwork,
  onDeactivateAccount,
}: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const isCompany = user?.accountType === 'COMPANY'

  return (
    <>
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-border">
      <div className="mx-auto max-w-[1400px] px-2 sm:px-6 py-0.5 sm:py-3 flex items-center justify-between gap-1.5 sm:gap-4">
        {/* Logo */}
        <div className="flex items-center gap-2 shrink-0 min-w-0">
          <img
            src="/logo-mark.png"
            alt="circub"
            className="w-7 h-7 sm:w-9 sm:h-9 shrink-0 rounded-md object-contain"
          />
          <div className="min-w-0 hidden md:block">
            <p className="text-xs text-muted-foreground italic truncate">
              {isCompany ? `${user?.companyName || 'Company'} · Business account` : 'Local price intelligence for travelers'}
            </p>
          </div>
        </div>

        {/* Nav tabs · desktop only - phones get the bottom tab bar below */}
        {user && (
          <nav className="hidden md:flex items-center gap-2 overflow-x-auto scrollbar-thin flex-1 min-w-0 justify-start">
            {TABS.map((tab) => {
              const Icon = tab.icon
              const isActive = activeTab === tab.key
              return (
                <button
                  key={tab.key}
                  onClick={() => onTabChange(tab.key)}
                  className={cn(
                    'flex items-center gap-1.5 px-1.5 py-2 sm:px-4 rounded-full text-sm font-medium transition-colors shrink-0',
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  )}
                  aria-current={isActive ? 'page' : undefined}
                  aria-label={tab.label}
                >
                  <Icon className="w-4 h-4" />
                  <span className="hidden md:inline">{tab.label}</span>
                </button>
              )
            })}

            {/* Messages button with badge */}
            <button
              onClick={onOpenMessages}
              className="relative flex items-center gap-1.5 px-1.5 py-2 sm:px-4 rounded-full text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors shrink-0"
              aria-label="Messages"
            >
              <MessageSquare className="w-4 h-4" />
              <span className="hidden md:inline">Messages</span>
              {incomingInvitationsCount > 0 && (
                <span className="absolute -top-1 -right-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-semibold bg-primary text-primary-foreground rounded-full">
                  {incomingInvitationsCount}
                </span>
              )}
            </button>
          </nav>
        )}

        {/* Auth actions */}
        {!user ? (
          <div className="flex items-center gap-1.5 sm:gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={onLogin}
              className="text-muted-foreground hover:text-foreground"
            >
              Sign in
            </Button>
            <Button
              onClick={onSignUp}
              size="sm"
              className="bg-primary hover:bg-primary/90"
            >
              Sign up free
            </Button>
          </div>
        ) : (
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="flex items-center gap-1.5 px-1.5 py-0.5 sm:gap-2 sm:px-2 sm:py-1.5 rounded-full hover:bg-accent transition-colors"
              aria-label="User menu"
            >
              <Avatar className="w-7 h-7 sm:w-8 sm:h-8 border border-accent">
                <AvatarFallback className="bg-primary/15 text-primary font-semibold text-xs">
                  {user.name.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="hidden sm:block text-left">
                <p className="text-xs font-semibold text-foreground leading-tight">
                  {isCompany ? user.companyName : user.name}
                </p>
                <p className="text-[10px] text-muted-foreground leading-tight flex items-center gap-0.5">
                  {isCompany ? (
                    <>
                      <Building2 className="w-2.5 h-2.5" /> Company
                    </>
                  ) : (
                    <>Personal</>
                  )}
                </p>
              </div>
              <ChevronDown className="hidden w-3.5 h-3.5 text-muted-foreground sm:block" />
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-10 sm:top-12 z-50 bg-card border border-border rounded-lg shadow-lg py-1 min-w-[220px]">
                <button
                  onClick={() => {
                    setMenuOpen(false)
                    onEditProfile()
                  }}
                  className="w-full text-left px-4 py-2 text-sm hover:bg-accent text-foreground flex items-center gap-2"
                >
                  <UserCircle className="w-4 h-4 text-muted-foreground" />
                  Edit profile
                </button>
                <button
                  onClick={() => {
                    setMenuOpen(false)
                    onOpenNetwork()
                  }}
                  className="w-full text-left px-4 py-2 text-sm hover:bg-accent text-foreground flex items-center gap-2"
                >
                  <Users className="w-4 h-4 text-muted-foreground" />
                  My network
                </button>
                <button
                  onClick={() => {
                    setMenuOpen(false)
                    onOpenMessages()
                  }}
                  className="w-full text-left px-4 py-2 text-sm hover:bg-accent text-foreground flex items-center gap-2"
                >
                  <MessageSquare className="w-4 h-4 text-muted-foreground" />
                  Messages
                </button>
                <a
                  href="/contact"
                  onClick={() => setMenuOpen(false)}
                  className="w-full text-left px-4 py-2 text-sm hover:bg-accent text-foreground flex items-center gap-2"
                >
                  <Mail className="w-4 h-4 text-muted-foreground" />
                  Contact us
                </a>
                <a
                  href="/privacy"
                  onClick={() => setMenuOpen(false)}
                  className="w-full text-left px-4 py-2 text-sm hover:bg-accent text-foreground flex items-center gap-2"
                >
                  <Shield className="w-4 h-4 text-muted-foreground" />
                  Privacy
                </a>
                <a
                  href="/terms"
                  onClick={() => setMenuOpen(false)}
                  className="w-full text-left px-4 py-2 text-sm hover:bg-accent text-foreground flex items-center gap-2"
                >
                  <FileText className="w-4 h-4 text-muted-foreground" />
                  Terms
                </a>
                <div className="border-t border-border my-1" />
                <button
                  onClick={() => {
                    setMenuOpen(false)
                    onDeactivateAccount()
                  }}
                  className="w-full text-left px-4 py-2 text-sm hover:bg-accent text-destructive flex items-center gap-2"
                >
                  <UserX className="w-4 h-4" />
                  Deactivate account
                </button>
                <button
                  onClick={() => {
                    setMenuOpen(false)
                    onLogout()
                  }}
                  className="w-full text-left px-4 py-2 text-sm hover:bg-accent text-destructive flex items-center gap-2"
                >
                  <LogOut className="w-4 h-4" />
                  Sign out
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>

    {/* Mobile bottom tab bar - the same tabs, docked to the bottom on phones.
        Fixed + safe-area padding so it clears the home indicator. */}
    {user && (
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-sm border-t border-border pb-[env(safe-area-inset-bottom)]"
        aria-label="Primary"
      >
        <div className="grid grid-cols-5">
          {TABS.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.key
            return (
              <button
                key={tab.key}
                onClick={() => onTabChange(tab.key)}
                className={cn(
                  'relative flex flex-col items-center justify-center gap-0.5 py-1 text-[10px] leading-tight font-medium transition-colors',
                  isActive ? 'text-primary' : 'text-muted-foreground'
                )}
                aria-current={isActive ? 'page' : undefined}
                aria-label={tab.label}
              >
                {isActive && <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-primary" />}
                <Icon className="w-[18px] h-[18px]" />
                <span>{tab.label}</span>
              </button>
            )
          })}

          {/* Messages with badge */}
          <button
            onClick={onOpenMessages}
            className="relative flex flex-col items-center justify-center gap-0.5 py-1 text-[10px] leading-tight font-medium text-muted-foreground transition-colors"
            aria-label="Messages"
          >
            <span className="relative">
              <MessageSquare className="w-[18px] h-[18px]" />
              {incomingInvitationsCount > 0 && (
                <span className="absolute -top-1.5 -right-2 inline-flex items-center justify-center min-w-[16px] h-4 px-1 text-[9px] font-semibold bg-primary text-primary-foreground rounded-full">
                  {incomingInvitationsCount > 9 ? '9+' : incomingInvitationsCount}
                </span>
              )}
            </span>
            <span>Messages</span>
          </button>
        </div>
      </nav>
    )}
    </>
  )
}

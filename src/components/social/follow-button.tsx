'use client'

// FollowButton - the one-way "Follow" network link, reusable everywhere a
// person is named: the price detail "Posted by" card, the local profile
// modal and the author profile modal. States:
//  - guest (not signed up)        -> renders, clicking opens the Register modal
//  - your own profile             -> renders nothing (API refuses self-follow)
//  - not following                -> green outline "Follow"
//  - following                    -> soft "Following" (click again to unfollow)
// The followers count is reported back through onChange so host sections can
// keep their stats live without a refetch.

import { useEffect, useState } from 'react'
import { UserPlus, UserCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { dispatchAuthExpired } from '@/lib/auth-fetch'

interface FollowButtonProps {
  targetUserId: string
  currentUserId?: string | null
  className?: string
  onChange?: (following: boolean, followersCount: number) => void
}

export function FollowButton({ targetUserId, currentUserId, className, onChange }: FollowButtonProps) {
  const [authed, setAuthed] = useState<boolean | null>(null) // null = still loading
  const [following, setFollowing] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (!targetUserId || currentUserId === targetUserId) return
    const load = async () => {
      try {
        const r = await fetch(`/api/users/${targetUserId}/follow`, { cache: 'no-store' })
        const d = await r.json()
        if (cancelled) return
        setAuthed(!!d.auth)
        setFollowing(!!d.following)
      } catch {
        if (!cancelled) setAuthed(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [targetUserId, currentUserId])

  // Your own profile: following yourself makes no sense - render nothing.
  if (!targetUserId || currentUserId === targetUserId) return null

  const toggle = async () => {
    if (!authed) {
      // Guests get the register prompt instead of a 401 error.
      dispatchAuthExpired('guest-follow')
      return
    }
    if (busy) return
    setBusy(true)
    const next = !following
    try {
      const r = await fetch(`/api/users/${targetUserId}/follow`, {
        method: next ? 'POST' : 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Failed')
      setFollowing(!!d.following)
      onChange?.(!!d.following, d.followersCount ?? 0)
    } catch {
      // Keep the previous state on failure - silent, the button just stays.
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={(e) => { e.stopPropagation(); toggle() }}
      disabled={busy}
      data-testid={following ? 'follow-btn-following' : 'follow-btn-follow'}
      aria-pressed={following}
      className={
        following
          ? 'bg-primary/10 border-primary/40 text-primary hover:bg-primary/20 shrink-0 gap-1.5'
          : 'border-primary text-primary hover:bg-primary hover:text-primary-foreground shrink-0 gap-1.5'
      }
    >
      {following ? <UserCheck className="w-3.5 h-3.5" /> : <UserPlus className="w-3.5 h-3.5" />}
      {following ? 'Following' : 'Follow'}
    </Button>
  )
}

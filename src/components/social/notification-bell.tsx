'use client'

// v179: the notifications bell - the header lives next to the theme toggle
// and the account menu. Polls /api/notifications every 30s while signed in
// (messages/invitations badge uses the same rhythm), shows the unread count
// as a badge, and the panel lists the newest 30 events. Opening the panel
// marks everything read; tapping a row opens the post involved in the price
// detail modal. Business link / unlink events come from the links API.
import { useState, useRef, useEffect, useCallback } from 'react'
import { Bell, Link2, Link2Off, CheckCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/lib/i18n'
import type { User } from '@/lib/types'

interface NotifItem {
  id: string
  type: string // 'business_link' | 'business_unlink'
  message: string
  postName?: string | null
  postId?: string | null
  otherPostId?: string | null
  read: boolean
  createdAt: string
  actor: { id: string; name: string; username?: string | null; avatarColor: string; profilePicture?: string | null; accountType?: string; companyName?: string | null }
}

const AVATAR_COLORS: Record<string, string> = {
  teal: 'bg-teal-600', blue: 'bg-blue-600', green: 'bg-emerald-600', red: 'bg-red-600',
  purple: 'bg-purple-600', orange: 'bg-orange-600', pink: 'bg-pink-600', amber: 'bg-amber-600',
}

// Compact relative time - the panel rows stay one line tall on phones.
function relTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const m = Math.floor(ms / 60000)
  if (m < 1) return 'now'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

export function NotificationBell({ me, onOpenPost }: { me: User | null; onOpenPost?: (postId: string) => void }) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<NotifItem[]>([])
  const [unread, setUnread] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const signedIn = !!me && me.id !== 'guest'

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/notifications?_cb=${Date.now()}`, { credentials: 'include' })
      if (!r.ok) return
      const d = await r.json()
      setItems(Array.isArray(d.notifications) ? d.notifications : [])
      setUnread(typeof d.unreadCount === 'number' ? d.unreadCount : 0)
      setLoaded(true)
    } catch {}
  }, [])

  // Poll while signed in: immediately, then every 30s. Silent - a failed
  // poll never surfaces as an error toast; the bell just keeps the old data.
  useEffect(() => {
    if (!signedIn) { setItems([]); setUnread(0); setLoaded(false); return }
    load()
    const iv = window.setInterval(load, 30000)
    return () => window.clearInterval(iv)
  }, [signedIn, load])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const toggle = () => {
    const next = !open
    setOpen(next)
    if (next) {
      load()
      // Opening the panel clears the badge - everything delivered is seen.
      if (unread > 0) {
        setUnread(0)
        fetch('/api/notifications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({}),
        }).catch(() => {})
      }
    }
  }

  const tapItem = (n: NotifItem) => {
    if (!n.read) {
      fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ids: [n.id] }),
      }).catch(() => {})
    }
    setOpen(false)
    const target = n.otherPostId || n.postId
    if (target && onOpenPost) onOpenPost(target)
  }

  const markAllRead = () => {
    setItems((prev) => prev.map((x) => ({ ...x, read: true })))
    setUnread(0)
    fetch('/api/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({}),
    }).catch(() => {})
  }

  if (!signedIn) return null

  return (
    <div className="relative" ref={ref}>
      <button
        data-testid="notif-bell"
        onClick={toggle}
        aria-label={t('nav.notifications')}
        aria-expanded={open}
        className={cn(
          'relative flex items-center justify-center w-9 h-9 rounded-full text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors',
          open && 'bg-accent text-accent-foreground'
        )}
      >
        <Bell className="w-4 h-4" />
        {unread > 0 && (
          <span
            data-testid="notif-badge"
            className="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center min-w-[17px] h-[17px] px-1 text-[10px] font-semibold bg-destructive text-white rounded-full"
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          data-testid="notif-panel"
          role="dialog"
          aria-label={t('nav.notifications')}
          className="absolute right-0 top-11 z-50 bg-card border border-border rounded-lg shadow-lg w-[300px] sm:w-[340px] overflow-hidden"
        >
          <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border bg-accent/30">
            <p className="text-xs font-semibold text-foreground">{t('nav.notifications')}</p>
            {items.length > 0 && (
              <button
                data-testid="notif-mark-read"
                onClick={markAllRead}
                className="flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                {t('notif.markAllRead')}
              </button>
            )}
          </div>

          <div className="max-h-[360px] overflow-y-auto">
            {!loaded ? (
              <div className="px-3 py-6 text-center text-xs text-muted-foreground">…</div>
            ) : items.length === 0 ? (
              <div data-testid="notif-empty" className="px-4 py-8 text-center">
                <Bell className="w-6 h-6 mx-auto text-muted-foreground/50 mb-2" />
                <p className="text-xs text-muted-foreground">{t('notif.empty')}</p>
              </div>
            ) : (
              items.map((n, i) => {
                const isLink = n.type === 'business_link'
                const TypeIcon = isLink ? Link2 : Link2Off
                const displayName = n.actor?.accountType === 'COMPANY' && n.actor?.companyName ? n.actor.companyName : n.actor?.name || 'Someone'
                return (
                  <button
                    key={n.id}
                    data-testid={`notif-item-${i}`}
                    onClick={() => tapItem(n)}
                    className={cn(
                      'w-full text-left flex items-start gap-2.5 px-3 py-2.5 border-b border-border/60 last:border-0 hover:bg-accent/50 transition-colors',
                      !n.read && 'bg-primary/5'
                    )}
                  >
                    <span className={cn('w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0', AVATAR_COLORS[n.actor?.avatarColor] || 'bg-primary')}>
                      {displayName.charAt(0).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <TypeIcon className={cn('w-3.5 h-3.5 shrink-0', isLink ? 'text-primary' : 'text-muted-foreground')} />
                        <span className="text-xs font-semibold text-foreground truncate">{displayName}</span>
                        <span className="text-[10px] text-muted-foreground ml-auto shrink-0">{relTime(n.createdAt)}</span>
                      </span>
                      <span className="block text-xs text-muted-foreground leading-snug mt-0.5">
                        {isLink ? t('notif.linked') : n.type === 'business_unlink' ? t('notif.unlinked') : n.message}
                      </span>
                      {n.postName && (
                        <span className="block text-[11px] text-primary/80 font-medium truncate mt-0.5">{n.postName}</span>
                      )}
                    </span>
                    {!n.read && <span className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1.5" aria-hidden />}
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}

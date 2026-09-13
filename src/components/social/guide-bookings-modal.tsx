'use client'

// My bookings dialog: two lists in one place.
//  - Incoming (I am the guide): accept / decline / complete, with reply note.
//  - My requests (I am the tourist): cancel, see guide's reply.
import { useState, useEffect, useCallback } from 'react'
import { CalendarDays, Clock, Users, Loader2, Inbox, Send, MapPin, MessageSquare } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

export interface BookingRow {
  id: string
  status: string // PENDING | ACCEPTED | DECLINED | COMPLETED | CANCELLED
  date?: string | null
  days?: number | null
  people?: number | null
  message?: string | null
  reply?: string | null
  direction: 'incoming' | 'outgoing'
  createdAt: string
  tourist?: { id: string; name: string; profilePicture?: string | null; headline?: string | null }
  guide?: { id: string; name: string; profilePicture?: string | null; location?: string | null; rating?: number | null; guideHourlyRate?: number | null; guideCurrency?: string | null }
}

interface GuideBookingsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  isGuide: boolean
  meId: string
  onMessage?: (userId: string) => void
  onChanged?: () => void
}

const STATUS_STYLE: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-700',
  ACCEPTED: 'bg-emerald-100 text-emerald-700',
  DECLINED: 'bg-red-100 text-red-600',
  COMPLETED: 'bg-blue-100 text-blue-700',
  CANCELLED: 'bg-muted text-muted-foreground',
}

function BookingCard({ b, me, onMessage, refresh }: {
  b: BookingRow
  me: string
  onMessage?: (userId: string) => void
  refresh: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [reply, setReply] = useState('')
  const [replyOpen, setReplyOpen] = useState(false)
  const { toast } = useToast()
  const other = b.direction === 'incoming' ? b.tourist : b.guide
  const isIncoming = b.direction === 'incoming'

  const act = async (status: string, withReply?: string) => {
    setBusy(true)
    try {
      const res = await fetch(`/api/bookings/${b.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, reply: withReply || undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Update failed')
      toast({ title: `Booking ${status.toLowerCase()}` })
      setReplyOpen(false)
      setReply('')
      await refresh()
    } catch (e) {
      toast({ title: 'Action failed', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  const person = b.direction === 'incoming' ? b.tourist : b.guide

  return (
    <div className="rounded-lg border border-border p-3 space-y-2">
      <div className="flex items-center gap-2.5">
        <Avatar className="w-9 h-9 overflow-hidden shrink-0 border border-accent">
          {person?.profilePicture ? (
            <img src={person.profilePicture} alt={person.name} className="w-full h-full object-cover" />
          ) : (
            <AvatarFallback className="bg-primary/15 text-primary text-xs font-semibold">
              {person?.name?.charAt(0).toUpperCase() || '?'}
            </AvatarFallback>
          )}
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-semibold text-foreground truncate">{person?.name || 'Unknown'}</span>
            <Badge variant="secondary" className={cn('text-[9px]', STATUS_STYLE[b.status] || 'bg-muted')}>
              {b.status}
            </Badge>
            {b.direction === 'incoming' ? (
              <span className="text-[10px] text-muted-foreground flex items-center gap-0.5"><Inbox className="w-2.5 h-2.5" />incoming</span>
            ) : (
              <span className="text-[10px] text-muted-foreground flex items-center gap-0.5"><Send className="w-2.5 h-2.5" />my request</span>
            )}
          </div>
          <div className="flex items-center gap-2.5 mt-0.5 flex-wrap text-[11px] text-muted-foreground">
            {b.date && <span className="flex items-center gap-0.5"><CalendarDays className="w-2.5 h-2.5" />{new Date(b.date).toLocaleDateString()}</span>}
            {b.days != null && <span className="flex items-center gap-0.5"><Clock className="w-2.5 h-2.5" />{b.days}d</span>}
            {b.people != null && <span className="flex items-center gap-0.5"><Users className="w-2.5 h-2.5" />{b.people}p</span>}
            {b.guide?.location && isIncoming && <span className="flex items-center gap-0.5"><MapPin className="w-2.5 h-2.5" />{b.guide.location}</span>}
          </div>
        </div>
      </div>

      {b.message && <p className="text-xs text-muted-foreground bg-accent/60 rounded p-2 break-words">&ldquo;{b.message}&rdquo;</p>}
      {b.reply && (
        <p className={cn('text-xs rounded p-2 break-words', b.status === 'ACCEPTED' ? 'bg-emerald-50 text-emerald-800' : 'bg-accent/60 text-muted-foreground')}>
          Guide replied: &ldquo;{b.reply}&rdquo;
        </p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {isIncoming && b.status === 'PENDING' && (
          <>
            <Button size="sm" disabled={busy} onClick={() => act('ACCEPTED', replyOpen && reply.trim() ? reply.trim() : undefined)} className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1">
              {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : null}Accept
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => act('DECLINED')} className="border-red-300 text-red-600 hover:bg-red-50 text-xs">
              Decline
            </Button>
            <button onClick={() => setReplyOpen(!replyOpen)} className="text-[11px] text-muted-foreground hover:text-foreground">
              {replyOpen ? 'hide note' : '+ add note'}
            </button>
          </>
        )}
        {isIncoming && b.status === 'ACCEPTED' && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => act('COMPLETED')} className="border-blue-300 text-blue-700 hover:bg-blue-50 text-xs">
            Mark completed
          </Button>
        )}
        {!isIncoming && (b.status === 'PENDING' || b.status === 'ACCEPTED') && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => act('CANCELLED')} className="border-muted text-muted-foreground hover:bg-accent text-xs">
            Cancel request
          </Button>
        )}
        {onMessage && other && other.id !== me && (
          <Button size="sm" variant="outline" onClick={() => onMessage(other.id)} className="border-primary text-primary hover:bg-primary hover:text-primary-foreground text-xs gap-1">
            <MessageSquare className="w-3 h-3" />Chat
          </Button>
        )}
      </div>

      {replyOpen && b.status === 'PENDING' && (
        <Textarea
          placeholder="Optional note with your acceptance (meeting point, price, what to bring...)"
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          className="min-h-[52px] text-xs"
        />
      )}
    </div>
  )
}

export function GuideBookingsModal({ open, onOpenChange, isGuide, meId, onMessage, onChanged }: GuideBookingsModalProps) {
  const [bookings, setBookings] = useState<BookingRow[]>([])
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState<'incoming' | 'outgoing'>('incoming')
  const { toast } = useToast()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/bookings')
      const data = await res.json()
      setBookings(data.bookings || [])
    } catch {
      setBookings([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) load()
  }, [open, load])

  const incoming = bookings.filter((b) => b.direction === 'incoming')
  const outgoing = bookings.filter((b) => b.direction === 'outgoing')
  const shown = tab === 'incoming' ? incoming : outgoing
  const incomingPending = incoming.filter((b) => b.status === 'PENDING').length

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[82vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base font-bold text-foreground">My bookings</DialogTitle>
          <DialogDescription>
            {isGuide ? 'Requests tourists sent you, and tours you requested.' : 'Tours you requested, and any incoming requests.'}
          </DialogDescription>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex items-center gap-2 mb-3">
          <button
            onClick={() => setTab('incoming')}
            className={cn(
              'px-3 py-1.5 rounded-full text-xs font-medium transition-colors relative',
              tab === 'incoming' ? 'bg-primary text-primary-foreground' : 'bg-accent text-muted-foreground'
            )}
          >
            Incoming ({incoming.length})
            {incomingPending > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] flex items-center justify-center">{incomingPending}</span>
            )}
          </button>
          <button
            onClick={() => setTab('outgoing')}
            className={cn(
              'px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
              tab === 'outgoing' ? 'bg-primary text-primary-foreground' : 'bg-accent text-muted-foreground'
            )}
          >
            My requests ({outgoing.length})
          </button>
        </div>

        {loading ? (
          <div className="space-y-2">{[1, 2].map((i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
        ) : shown.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            {tab === 'incoming'
              ? (isGuide ? 'No booking requests yet. Keep your guide profile sharp and stay Available!' : 'Tourists haven\'t booked you yet.')
              : 'You haven\'t requested any tours yet — tap Book on any guide card.'}
          </p>
        ) : (
          <div className="space-y-3 pr-1">
            {shown.map((b) => (
              <BookingCard
                key={b.id}
                b={b}
                me={meId}
                onMessage={onMessage}
                refresh={async () => { await load(); onChanged?.() }}
              />
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

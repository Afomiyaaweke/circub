'use client'

// Booking modal: tourist requests a tour with a guide.
// Shows the guide's visible star rating + review count at the top, and the
// guide's hourly rate so the estimated cost is clear before requesting.
import { useState, useEffect } from 'react'
import { CalendarDays, Clock, Users, MessageSquare, Loader2, Star, MapPin, CheckCircle2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { GuideStars } from './guide-reviews-modal'

export interface BookingGuideInfo {
  id: string
  name: string
  profilePicture?: string | null
  location?: string | null
  rating?: number | null
  ratingCount?: number | null
  guideHourlyRate?: number | null
  guideCurrency?: string | null
  guideAvailable?: boolean
}

interface GuideBookingModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  guide: BookingGuideInfo | null
  onBooked?: () => void
  onMessage?: (userId: string) => void
}

export function GuideBookingModal({ open, onOpenChange, guide, onBooked, onMessage }: GuideBookingModalProps) {
  const [date, setDate] = useState('')
  const [days, setDays] = useState('1')
  const [people, setPeople] = useState('2')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    if (open) {
      setDate('')
      setDays('1')
      setPeople('2')
      setMessage('')
      setDone(false)
    }
  }, [open])

  if (!guide) return null

  const minDate = new Date().toISOString().slice(0, 10)
  const rate = guide.guideHourlyRate
  const currency = guide.guideCurrency || 'USD'
  const dNum = Math.max(1, parseInt(days || '1', 10) || 1)
  // Rough estimate: 8h tour days x hourly rate (if the guide lists one).
  const estimate = rate != null ? Math.round(rate * 8 * dNum) : null

  const handleSubmit = async () => {
    setSubmitting(true)
    try {
      const res = await fetch(`/api/guides/${guide.id}/bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: date || undefined,
          days: dNum,
          people: Math.max(1, parseInt(people || '1', 10) || 1),
          message: message.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Booking failed')
      setDone(true)
      toast({ title: 'Booking request sent!', description: `${guide.name} will get back to you.` })
      onBooked?.()
    } catch (e) {
      toast({ title: 'Booking failed', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-6 gap-0">
        <DialogHeader className="mb-3">
          <DialogTitle className="text-lg font-bold text-foreground">
            {done ? 'Request sent' : `Book ${guide.name}`}
          </DialogTitle>
          <DialogDescription>
            {done ? 'The guide has been notified and will reply soon.' : 'Request a tour - the guide confirms before anything is final.'}
          </DialogDescription>
        </DialogHeader>

        {done ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 border border-emerald-200">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <p className="text-sm text-emerald-800">
                Your request {date ? `for ${date} ` : ''}is waiting for {guide.name}&apos;s confirmation.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2">
              {onMessage && (
                <Button size="sm" variant="outline" className="border-primary text-primary hover:bg-primary hover:text-primary-foreground gap-1.5" onClick={() => { onOpenChange(false); onMessage(guide.id) }}>
                  <MessageSquare className="w-3.5 h-3.5" />
                  Message guide
                </Button>
              )}
              <Button size="sm" onClick={() => onOpenChange(false)} className="bg-primary hover:bg-primary/90">Done</Button>
            </div>
          </div>
        ) : (
          <>
            {/* Guide summary with VISIBLE rating */}
            <div className="flex items-center gap-3 p-3 rounded-lg bg-accent/60 mb-4">
              <Avatar className="w-11 h-11 border-2 border-accent overflow-hidden shrink-0">
                {guide.profilePicture ? (
                  <img src={guide.profilePicture} alt={guide.name} className="w-full h-full object-cover" />
                ) : (
                  <AvatarFallback className="bg-primary/15 text-primary font-semibold">{guide.name?.charAt(0).toUpperCase()}</AvatarFallback>
                )}
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-semibold text-foreground text-sm truncate">{guide.name}</span>
                  <span className="flex items-center gap-1 text-xs font-medium text-amber-600">
                    <GuideStars value={guide.rating || 0} />
                    {guide.rating && guide.rating > 0 ? guide.rating.toFixed(1) : 'New'}
                    <span className="text-muted-foreground">({guide.ratingCount || 0})</span>
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  {guide.location && (
                    <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <MapPin className="w-2.5 h-2.5" />{guide.location}
                    </span>
                  )}
                  {rate != null && (
                    <Badge variant="secondary" className="bg-primary/10 text-primary text-[10px] gap-0.5">
                      <Star className="w-2 h-2 mr-0.5" />
                      {currency} {rate}/hr
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
                    <CalendarDays className="w-3.5 h-3.5" />Tour date
                  </label>
                  <Input type="date" min={minDate} value={date} onChange={(e) => setDate(e.target.value)} className="bg-card" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />Days
                  </label>
                  <Input type="number" min={1} max={60} value={days} onChange={(e) => setDays(e.target.value)} className="bg-card" />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" />People
                </label>
                <Input type="number" min={1} max={50} value={people} onChange={(e) => setPeople(e.target.value)} className="bg-card" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5" />Message to the guide
                </label>
                <Textarea
                  placeholder="Tell the guide what you want to see, your pace, interests..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="min-h-[64px] resize-y bg-card"
                />
              </div>
              {estimate != null && (
                <p className="text-xs text-muted-foreground">
                  Estimated cost: <span className="font-semibold text-foreground">{currency} {estimate}</span> ({dNum} day{dNum !== 1 ? 's' : ''} × 8h × {currency} {rate}/hr) - negotiate the final price in chat.
                </p>
              )}
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
              <Button size="sm" onClick={handleSubmit} disabled={submitting} className="bg-primary hover:bg-primary/90 gap-1.5">
                {submitting ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Sending...</> : <><CalendarDays className="w-3.5 h-3.5" />Send booking request</>}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

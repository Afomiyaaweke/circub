'use client'

import { useState, useEffect } from 'react'
import { Star, X, Send, Loader2, Sparkles } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

interface RatingModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  guide: {
    id: string
    name: string
    profilePicture?: string | null
  } | null
  onRated: () => void
}

export function GuideRatingModal({ open, onOpenChange, guide, onRated }: RatingModalProps) {
  const [rating, setRating] = useState(0)
  const [hoverRating, setHoverRating] = useState(0)
  const [comment, setComment] = useState('')
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    if (open) {
      setRating(0)
      setHoverRating(0)
      setComment('')
    }
  }, [open])

  const handleSubmit = async () => {
    if (!guide || rating === 0) {
      toast({ title: 'Select a star rating first', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/guides/${guide.id}/ratings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating, comment: comment.trim() || undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to rate')
      toast({ title: 'Rating submitted!', description: `You rated ${guide.name} ${rating} star${rating !== 1 ? 's' : ''}.` })
      onOpenChange(false)
      onRated()
    } catch (e) {
      toast({ title: 'Rating failed', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const displayRating = hoverRating || rating

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm p-6 sm:p-8 gap-0">
        <DialogHeader className="mb-4 text-center">
          <div className="flex justify-center mb-3">
            <Avatar className="w-16 h-16 border-2 border-accent overflow-hidden">
              {guide?.profilePicture ? (
                <img src={guide.profilePicture} alt={guide?.name || 'Guide'} className="w-full h-full object-cover" />
              ) : (
                <AvatarFallback className="bg-primary/15 text-primary font-bold text-xl">
                  {guide?.name?.charAt(0).toUpperCase() || '?'}
                </AvatarFallback>
              )}
            </Avatar>
          </div>
          <DialogTitle className="text-lg font-bold text-foreground">Rate {guide?.name}</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            How was your experience with this guide?
          </DialogDescription>
        </DialogHeader>

        {/* Star rating */}
        <div className="flex justify-center gap-1 mb-4">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              onClick={() => setRating(star)}
              onMouseEnter={() => setHoverRating(star)}
              onMouseLeave={() => setHoverRating(0)}
              className="transition-transform active:scale-90"
              aria-label={`${star} star${star !== 1 ? 's' : ''}`}
            >
              <Star
                className={cn(
                  'w-10 h-10 transition-colors',
                  star <= displayRating
                    ? 'fill-amber-400 text-amber-400'
                    : 'fill-transparent text-muted-foreground/30'
                )}
              />
            </button>
          ))}
        </div>

        {/* Rating labels */}
        <p className="text-center text-sm text-muted-foreground mb-4">
          {displayRating === 0 && 'Tap a star to rate'}
          {displayRating === 1 && 'Poor'}
          {displayRating === 2 && 'Fair'}
          {displayRating === 3 && 'Good'}
          {displayRating === 4 && 'Very good'}
          {displayRating === 5 && 'Excellent'}
        </p>

        {/* Comment */}
        <div className="space-y-1.5 mb-4">
          <label className="text-xs text-muted-foreground font-medium">Comment (optional)</label>
          <Textarea
            placeholder="Share your experience with this guide..."
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className="min-h-[60px] resize-y"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>
            <X className="w-4 h-4 mr-1" />
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={saving || rating === 0}
            className="bg-primary hover:bg-primary/90 gap-1.5"
          >
            {saving ? (
              <><Loader2 className="w-4 h-4 animate-spin" />Submitting...</>
            ) : (
              <><Send className="w-3.5 h-3.5" />Submit rating</>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

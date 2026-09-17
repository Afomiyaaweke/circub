'use client'

// Guide reviews dialog: all tourist star-ratings + comments for one guide.
import { useState, useEffect, useCallback } from 'react'
import { Star, Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

interface GuideReviewsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  guide: { id: string; name: string } | null
}

interface ReviewItem {
  id: string
  rating: number
  comment: string | null
  createdAt: string
  raterName: string
  raterPicture?: string | null
}

function Stars({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-0.5', className)}>
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          className={cn(
            'w-3.5 h-3.5',
            s <= Math.round(value) ? 'fill-amber-400 text-amber-400' : 'fill-transparent text-muted-foreground/30'
          )}
        />
      ))}
    </span>
  )
}

export function GuideReviewsModal({ open, onOpenChange, guide }: GuideReviewsModalProps) {
  const [reviews, setReviews] = useState<ReviewItem[]>([])
  const [average, setAverage] = useState(0)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!guide) return
    setLoading(true)
    try {
      const res = await fetch(`/api/guides/${guide.id}/ratings`)
      const data = await res.json()
      setReviews(data.ratings || [])
      setAverage(data.average || 0)
    } catch {
      setReviews([])
    } finally {
      setLoading(false)
    }
  }, [guide])

  useEffect(() => {
    if (open) load()
  }, [open, load])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base font-bold text-foreground">
            Reviews · {guide?.name}
          </DialogTitle>
          {!loading && reviews.length > 0 && (
            <DialogDescription className="flex items-center gap-1.5">
              <Stars value={average} />
              <span className="font-semibold text-foreground">{average.toFixed(1)}</span>
              <span className="text-muted-foreground">· {reviews.length} tourist review{reviews.length !== 1 && 's'}</span>
            </DialogDescription>
          )}
          {!loading && reviews.length === 0 && (
            <DialogDescription>No reviews yet - be the first to rate this guide.</DialogDescription>
          )}
        </DialogHeader>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="w-9 h-9 rounded-full shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-3 w-full" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-4 pr-1">
            {reviews.map((r) => (
              <div key={r.id} className="flex gap-3">
                <Avatar className="w-9 h-9 shrink-0 overflow-hidden">
                  {r.raterPicture ? (
                    <img src={r.raterPicture} alt={r.raterName} className="w-full h-full object-cover" />
                  ) : (
                    <AvatarFallback className="bg-primary/15 text-primary text-xs font-semibold">
                      {r.raterName?.charAt(0).toUpperCase() || '?'}
                    </AvatarFallback>
                  )}
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-foreground">{r.raterName}</span>
                    <Stars value={r.rating} />
                    <span className="text-[10px] text-muted-foreground ml-auto">
                      {new Date(r.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  {r.comment && (
                    <p className="text-sm text-muted-foreground mt-0.5 break-words">{r.comment}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

export { Stars as GuideStars }

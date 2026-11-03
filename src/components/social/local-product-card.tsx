'use client'

// v226: Dantty-style marketplace product card for the Local tab's
// "Local Products" grid. Compact square-photo card:
//   square image (top) -> name -> "City, Country" -> price range
//   -> heart bookmark (localStorage saved-items, the same store the
//      price cards use) -> one full-width green "Compare Sellers"
//      button that opens the price detail modal (compare + vote live
//      there).
// Authors also get tiny Edit / Delete icons over their own photo
// (top-left corner) so replacing the old price card list with this grid
// does not take the author tools away.

import { useEffect, useState } from 'react'
import { Heart, MapPin, Pencil, Trash2, Loader2, ThumbsUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { toggleSaved, isSaved } from '@/lib/saved-items'
import { formatUnitSuffix, cn } from '@/lib/utils'
import type { LocalPricePost } from '@/lib/types'

interface LocalProductCardProps {
  post: LocalPricePost
  onOpen: (id: string) => void
  // v232: EVERY price post gets a vote - the feed's handleVote posts to
  // /api/local-prices/[id]/vote (guests get the register toast there).
  onVote?: (postId: string, voteType: 'HELPFUL' | 'NOT_ACCURATE') => void
  // Author-only tools - same gate the old price card used
  // (!!currentUserId && post.authorId === currentUserId).
  onEdit?: (post: LocalPricePost) => void
  onDelete?: (postId: string) => void
  canEdit?: boolean
  canDelete?: boolean
  deleting?: boolean
}

export function LocalProductCard({ post, onOpen, onVote, onEdit, onDelete, canEdit, canDelete, deleting }: LocalProductCardProps) {
  const [saved, setSaved] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    setSaved(isSaved(post.id))
  }, [post.id])

  const handleToggleSave = () => {
    const isNowSaved = toggleSaved({
      id: post.id,
      type: 'localPrice',
      title: post.productName,
      subtitle: `${post.city ? post.city + ', ' : ''}${post.country}`,
      priceLabel: `${post.currency} ${post.priceMin}${post.priceMin !== post.priceMax ? '-' + post.priceMax : ''}${formatUnitSuffix(post.unit)}`,
      imageUrl: post.imageUrl,
      href: null,
    })
    setSaved(isNowSaved)
    toast({ title: isNowSaved ? 'Saved to bookmarks' : 'Removed from bookmarks' })
  }

  const place = [post.city, post.country].filter(Boolean).join(', ')
  const priceLabel =
    `${post.currency} ${post.priceMin.toLocaleString('en-US')}` +
    (post.priceMin !== post.priceMax ? `-${post.priceMax.toLocaleString('en-US')}` : '') +
    formatUnitSuffix(post.unit)
  const showAuthorTools = !!(canEdit || canDelete)

  return (
    <div
      className="group rounded-xl border border-border bg-card overflow-hidden shadow-sm hover:shadow-md transition-shadow"
      data-testid={`product-card-${post.id}`}
    >
      {/* Square image on top - the whole photo opens the detail modal,
          with the heart (save) and the author tools floating over it. */}
      <div className="relative w-full aspect-square bg-accent overflow-hidden">
        <button
          type="button"
          onClick={() => onOpen(post.id)}
          className="absolute inset-0 w-full h-full"
          aria-label={`Open ${post.productName}`}
          data-testid="product-photo-btn"
        >
          {post.imageUrl ? (
            <img
              src={post.imageUrl}
              alt={post.productName}
              loading="lazy"
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <span className="absolute inset-0 flex items-center justify-center text-2xl font-bold text-primary/60">
              {post.productName.charAt(0).toUpperCase()}
            </span>
          )}
        </button>

        {/* Heart bookmark - top-right over the photo */}
        <button
          type="button"
          onClick={handleToggleSave}
          data-testid="product-save-btn"
          aria-label={saved ? 'Remove from saved' : 'Save product'}
          title={saved ? 'Remove from saved' : 'Save product'}
          className={cn(
            'absolute top-1.5 right-1.5 z-10 flex items-center justify-center w-7 h-7 rounded-full bg-background/85 backdrop-blur border border-border shadow-sm transition-colors',
            saved ? 'text-rose-500' : 'text-muted-foreground hover:text-rose-500'
          )}
        >
          <Heart className={cn('w-3.5 h-3.5', saved && 'fill-current')} />
        </button>

        {/* Author-only Edit / Delete - top-left over the photo */}
        {showAuthorTools && (
          <div className="absolute top-1.5 left-1.5 z-10 flex items-center gap-1">
            {canEdit && onEdit && (
              <button
                type="button"
                onClick={() => onEdit(post)}
                data-testid="product-edit-btn"
                aria-label="Edit post"
                title="Edit post"
                className="flex items-center justify-center w-7 h-7 rounded-full bg-background/85 backdrop-blur border border-border shadow-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            )}
            {canDelete && onDelete && (
              <button
                type="button"
                onClick={() => onDelete(post.id)}
                disabled={deleting}
                data-testid="product-delete-btn"
                aria-label="Delete post"
                title="Delete post"
                className="flex items-center justify-center w-7 h-7 rounded-full bg-background/85 backdrop-blur border border-border shadow-sm text-muted-foreground hover:text-red-600 transition-colors disabled:opacity-50"
              >
                {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Name, place, price */}
      <div className="px-2.5 pt-2 pb-2 space-y-0.5 min-w-0">
        <p className="text-[13px] font-semibold text-foreground leading-tight line-clamp-1" title={post.productName}>
          {post.productName}
        </p>
        <p className="text-[11px] text-muted-foreground flex items-center gap-0.5 min-w-0">
          <MapPin className="w-3 h-3 shrink-0" />
          <span className="truncate">{place || 'Local'}</span>
        </p>
        <p className="text-[13px] font-bold text-foreground">{priceLabel}</p>
      </div>

      {/* v232 vote + compare row - the user: "have vote for all the price
          post". Every card carries a Helpful vote (count + filled state
          come from the post's live vote fields; the detail modal still has
          the not-accurate flag) beside the green Compare Sellers. */}
      <div className="px-2.5 pb-2.5 flex items-center gap-1.5">
        <Button
          size="sm"
          variant="outline"
          onClick={() => onVote?.(post.id, 'HELPFUL')}
          data-testid="product-vote-btn"
          aria-pressed={post.myVote === 'HELPFUL'}
          title={post.myVote === 'HELPFUL' ? 'You marked this helpful - tap to undo' : 'Was this price helpful?'}
          className={cn(
            'shrink-0 h-8 px-2.5 text-xs gap-1',
            post.myVote === 'HELPFUL'
              ? 'border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700 hover:text-white'
              : 'text-emerald-700 dark:text-emerald-400 border-emerald-600/40 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
          )}
        >
          <ThumbsUp className={cn('w-3.5 h-3.5', post.myVote === 'HELPFUL' && 'fill-current')} />
          <span data-testid="product-vote-count">{post.helpfulCount ?? 0}</span>
          <span className="hidden sm:inline">Helpful</span>
        </Button>
        <Button
          size="sm"
          onClick={() => onOpen(post.id)}
          className="flex-1 min-w-0 bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-8 px-2"
          data-testid="product-compare-btn"
        >
          Compare Sellers
        </Button>
      </div>
    </div>
  )
}

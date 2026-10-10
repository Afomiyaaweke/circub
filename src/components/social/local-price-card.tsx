'use client'

import { useState, useEffect, useRef } from 'react'
import { MapPin, Star, BadgeCheck, ThumbsUp, ThumbsDown, Lightbulb, Eye, MoreHorizontal, Trash2, Pencil, Phone, Mail, MessageCircle, Share2, Bookmark, Clock, Navigation, Store, Link2 } from 'lucide-react'
import { mapsDirectionsUrl, formatGps } from '@/lib/location'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn, formatUnitSuffix } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { toggleSaved, isSaved as checkSaved } from '@/lib/saved-items'
import { timeAgoLabel, freshnessLevel, freshnessTitle, freshnessClasses } from '@/lib/freshness'
import { SharePosterModal } from './share-poster-modal'
import type { LocalPricePost } from '@/lib/types'

interface LocalPriceCardProps {
  post: LocalPricePost
  onOpen?: (postId: string) => void
  onVote?: (postId: string, voteType: 'HELPFUL' | 'NOT_ACCURATE') => void
  onAuthorClick?: (authorId: string) => void
  onMessage?: (authorId: string) => void
  onDelete?: (postId: string) => void
  onEdit?: (post: LocalPricePost) => void
  canDelete?: boolean
  canEdit?: boolean
  compact?: boolean
  // v148: "be seen on each post" - one-line price-by-location compare
  // strip (this post first, then the viewer's own posts as "You", then
  // the rest cheapest-first) + a "You" badge on the viewer's own cards.
  // Computed by the feed from the posts it ALREADY loaded - no requests.
  // v149: `compare.kind` - 'product' (exact/near same-product matches,
  // near ones marked ~) or 'category' (the fallback when the product
  // stands alone: same-category prices by location).
  isOwnPost?: boolean
  // v154: the viewer's id - lets the fetched compare rows (strip + poster)
  // carry the same "You" chips the feed-computed strip has.
  currentUserId?: string | null
  compare?: {
    kind: 'product' | 'category'
    entries: Array<{ id: string; place: string; min: number; max: number; you: boolean; self: boolean; near: boolean }>
    extra: number
  } | null
}

function formatPrice(value: number, currency: string) {
  if (value >= 1000) return `${currency} ${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
  return `${currency} ${value}`
}

// Compact template - the old card stacked a full-width photo (up to ~200px),
// a big gradient price box, a separate tourist-price box, a tip, a contact
// panel, a share row, an author row and a vote row: ~700px per card on a
// phone. Everything kept, but tightened: photo is a side thumbnail, price is
// one line with the fair price inline, share lives in the footer icon group.
// v117: photo and price strip are tappable (open the detail modal), the
// tourist price section is gone, and Share points at the post's own deep
// link so link previews show the post's photo.
export function LocalPriceCard({ post, onOpen, onVote, onAuthorClick, onMessage, onDelete, onEdit, canDelete = false, canEdit = false, compact = false, isOwnPost = false, currentUserId = null, compare = null }: LocalPriceCardProps) {
  const [showMenu, setShowMenu] = useState(false)
  const [saved, setSaved] = useState(false)
  // Share-to-social poster - the Share2 button opens the poster modal.
  const [shareOpen, setShareOpen] = useState(false)
  // v153: "still the same" / v154: "the detail is not change yet" - the
  // feed-computed compare only sees the posts ALREADY loaded, so a card
  // without a strip showed NO comparison anywhere on it even when the detail
  // modal (which asks the API) had one. Strip-less cards now fetch the
  // modal-grade /similar data ONCE ON MOUNT and render the SAME compare
  // strip (the share poster reuses the same unified source, so all three
  // surfaces - card, modal, poster - agree). compareHold keeps the poster
  // modal on its spinner if Share is tapped while the fetch is in flight.
  const [fetchedCompare, setFetchedCompare] = useState<{ kind: 'product' | 'category'; entries: Array<{ id: string; place: string; min: number; max: number; you: boolean; self: boolean; near: boolean }>; extra: number } | null>(null)
  const [compareHold, setCompareHold] = useState(false)
  const compareKeyRef = useRef('')
  // v117: the share link is ALWAYS the post's own deep link (/?post=<id>).
  // That page renders per-post Open Graph tags (post photo, name, price
  // range via /api/local-prices/<id>/image) so WhatsApp / X / Telegram /
  // Facebook previews show THE POST'S IMAGE - and on circub it auto-opens
  // the price detail modal for the recipient.
  const shareLink = typeof window === 'undefined'
    ? 'https://circub.vercel.app'
    : `${window.location.origin}/?post=${post.id}`
  const { toast } = useToast()

  useEffect(() => {
    setSaved(checkSaved(post.id))
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
  const detailedLocation = [post.market, post.neighborhood, post.city, post.country].filter(Boolean).join(' · ')

  // Opens the share poster modal (native share / copy link live inside it).
  // v154: the compare fetch happens on mount (below), so Share just opens -
  // if the fetch is still in flight, holdBuild keeps the spinner up.
  const handleShare = () => {
    setShareOpen(true)
  }

  // v154: modal-grade compare for strip-less cards. Same endpoint the detail
  // modal uses (/similar): product matches first (exact then near, same
  // currency), else the same-category city grid aggregated per city. Built
  // into the SAME shape as the feed-computed prop so the strip renderer and
  // the poster share one source of truth.
  const hasStripProp = !!compare && compare.entries.length > 1
  useEffect(() => {
    if (hasStripProp) return
    const sig = `${post.id}:${post.priceMin}:${post.priceMax}`
    if (compareKeyRef.current === sig) return
    compareKeyRef.current = sig
    let cancelled = false
    setCompareHold(true)
    ;(async () => {
      try {
        const res = await fetch(`/api/local-prices/${post.id}/similar`, { cache: 'no-store' })
        const data = await res.json()
        if (cancelled) return
        const selfPlace = (post.city && post.city.trim()) || (post.country && post.country.trim()) || 'Unknown'
        const selfEntry = { id: post.id, place: selfPlace, min: post.priceMin, max: post.priceMax, you: isOwnPost, self: true, near: false }
        const rows = (Array.isArray(data.similar) ? data.similar : []).filter((r: any) => r.currency === post.currency)
        if (rows.length > 0) {
          setFetchedCompare({
            kind: 'product',
            entries: [
              selfEntry,
              ...rows.slice(0, 2).map((r: any) => ({
                id: r.id as string,
                place: (r.city && r.city.trim()) || (r.country && r.country.trim()) || 'Unknown',
                min: r.priceMin,
                max: r.priceMax,
                you: !!currentUserId && r.author?.id === currentUserId,
                self: false,
                near: !!r.near,
              })),
            ],
            extra: Math.max(0, rows.length - 2),
          })
        } else {
          const byCity = new Map<string, { min: number; max: number; count: number }>()
          for (const c of Array.isArray(data.categoryPoints) ? data.categoryPoints : []) {
            const cur = byCity.get(c.city)
            if (cur) {
              cur.min = Math.min(cur.min, c.min)
              cur.max = Math.max(cur.max, c.max)
              cur.count += c.authorIds?.length || 1
            } else {
              byCity.set(c.city, { min: c.min, max: c.max, count: c.authorIds?.length || 1 })
            }
          }
          const cities = [...byCity.entries()].sort((a, b) =>
            (a[0] === selfPlace ? 0 : 1) - (b[0] === selfPlace ? 0 : 1) || b[1].count - a[1].count)
          if (cities.length > 0) {
            setFetchedCompare({
              kind: 'category',
              entries: [
                selfEntry,
                ...cities.slice(0, 2).map(([place, v]) => ({ id: `cat-${place}`, place, min: v.min, max: v.max, you: false, self: false, near: false })),
              ],
              extra: Math.max(0, cities.length - 2),
            })
          }
        }
      } catch {
        compareKeyRef.current = '' // allow a retry when the card re-mounts
      } finally {
        if (!cancelled) setCompareHold(false)
      }
    })()
    return () => { cancelled = true }
  }, [hasStripProp, post.id, post.priceMin, post.priceMax, post.city, post.country, post.currency, currentUserId, isOwnPost])

  // v154: ONE compare source for the strip AND the poster - the feed-computed
  // prop wins; strip-less cards fall back to the fetched modal-grade data so
  // the card, the detail modal and the poster all carry the same comparison.
  const effectiveCompare = hasStripProp ? compare : fetchedCompare

  return (
    <Card data-testid="price-card" className={cn('overflow-hidden shadow-sm hover:shadow-md transition-shadow border-border', compact ? 'p-3' : 'p-3')}>
      {/* Row 1: type badge + category left, edit/delete menu right */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <Badge variant="secondary" className={cn('text-[9px] font-medium uppercase tracking-wide px-1.5 shrink-0', post.postType === 'SERVICE' ? 'bg-purple-100 text-purple-700' : 'bg-emerald-100 text-emerald-700')}>
            {post.postType === 'SERVICE' ? 'Service' : 'Product'}
          </Badge>
          {/* First-party price: the poster declared they own this shop/business.
              amber-100/amber-700 is retint-safe in both themes (dark bg gets a
              dark amber surface + light amber text via globals.css). */}
          {post.ownsShop && (
            <Badge variant="secondary" className="text-[9px] font-medium uppercase tracking-wide px-1.5 shrink-0 gap-0.5 bg-amber-100 text-amber-700" data-testid="shop-owner-badge" title="Posted by the shop owner - first-hand price">
              <Store className="w-2.5 h-2.5" />
              Shop owner
            </Badge>
          )}
          <span className="text-[10px] text-muted-foreground truncate">{post.category}</span>
          {/* Freshness - how old this price is (amber warning once outside the history's Current window) */}
          <span className={cn('ml-auto flex items-center gap-0.5 shrink-0 text-[10px] px-1 rounded', freshnessClasses[freshnessLevel(post.createdAt)])} title={freshnessTitle(post.createdAt)}>
            <Clock className="w-2.5 h-2.5" />
            {timeAgoLabel(post.createdAt)}
          </span>
        </div>
        {/* v151: the 3-dot menu is on EVERY card now - Share lives inside it
            (was a standalone footer icon button), Edit/Delete stay owner-only. */}
        <div className="relative shrink-0">
          <button onClick={() => setShowMenu(!showMenu)} data-testid="price-more" className="p-1 rounded-full hover:bg-accent text-muted-foreground transition-colors" aria-label="More options">
            <MoreHorizontal className="w-3.5 h-3.5" />
          </button>
          {showMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
              <div className="absolute right-0 top-7 z-20 bg-card border border-border rounded-lg shadow-lg py-1 min-w-[160px]">
                <button onClick={() => { setShowMenu(false); handleShare() }} data-testid="price-share" className="w-full text-left px-4 py-2 text-sm hover:bg-accent text-foreground flex items-center gap-2">
                  <Share2 className="w-3.5 h-3.5" />
                  Share
                </button>
                {canEdit && (
                  <button onClick={() => { setShowMenu(false); onEdit?.(post) }} className="w-full text-left px-4 py-2 text-sm hover:bg-accent text-foreground flex items-center gap-2">
                    <Pencil className="w-3.5 h-3.5" />
                    Edit post
                  </button>
                )}
                {canDelete && (
                  <button onClick={() => { setShowMenu(false); onDelete?.(post.id) }} className="w-full text-left px-4 py-2 text-sm hover:bg-accent text-destructive flex items-center gap-2">
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete post
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Row 2: name + location; in compact lists the photo stays a small side thumbnail */}
      <div className="mt-1.5 flex items-start gap-2.5">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-foreground text-sm sm:text-base leading-snug">{post.productName}</h3>
          <p className="mt-0.5 text-[11px] text-muted-foreground flex items-center gap-1 min-w-0">
            <MapPin className="w-3 h-3 text-primary shrink-0" />
            <span className="truncate">{detailedLocation}</span>
          </p>
          {/* GPS pin: one-tap turn-by-turn directions for tourists */}
          {post.latitude != null && post.longitude != null && (
            <a
              data-testid="card-directions"
              href={mapsDirectionsUrl(post.latitude, post.longitude)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="mt-1 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary transition-colors hover:bg-primary/20"
            >
              <Navigation className="w-3 h-3" aria-hidden="true" />
              Directions · GPS {formatGps(post.latitude, post.longitude)}
            </a>
          )}
        </div>
        {post.imageUrl && compact && (
          <button
            type="button"
            data-testid="price-card-image"
            onClick={() => onOpen?.(post.id)}
            aria-label={`Open details for ${post.productName}`}
            className="shrink-0 rounded-lg overflow-hidden border border-border bg-accent/30 cursor-pointer transition-opacity hover:opacity-85"
          >
            <img loading="lazy" decoding="async" src={post.imageUrl} alt={post.productName} className="w-14 h-14 sm:w-16 sm:h-16 object-cover" />
          </button>
        )}
      </div>

      {/* Row 2.5: photo banner - price posts that carry a photo show it big.
          v117: tapping the photo opens the price details. */}
      {post.imageUrl && !compact && (
        <button
          type="button"
          data-testid="price-card-image"
          onClick={() => onOpen?.(post.id)}
          aria-label={`Open details for ${post.productName}`}
          className="mt-2 block w-full rounded-xl overflow-hidden border border-border bg-accent/30 cursor-pointer transition-opacity hover:opacity-90"
        >
          <img loading="lazy" decoding="async" src={post.imageUrl} alt={post.productName} className="w-full h-40 sm:h-48 object-cover" />
        </button>
      )}

      {/* Row 3: one-line price strip - fair price inline. v117: the whole
          strip is tappable and opens the price details; the tourist price
          section was removed (fair/local price only). */}
      <button
        type="button"
        data-testid="price-card-price"
        onClick={() => onOpen?.(post.id)}
        aria-label={`Open price details for ${post.productName}`}
        className="mt-2 w-full text-left px-2.5 py-2 rounded-lg bg-gradient-to-br from-primary/10 to-emerald-50 border border-primary/20 cursor-pointer transition-colors hover:border-primary/40"
      >
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Typical local price</span>
          <span className="text-sm sm:text-base font-bold text-foreground">
            {formatPrice(post.priceMin, post.currency)} · {formatPrice(post.priceMax, post.currency)}{formatUnitSuffix(post.unit)}
          </span>
        </div>
        {post.recommendedPrice != null && (
          <div className="mt-1 flex items-center gap-x-3 gap-y-0.5 flex-wrap text-[11px]">
            <span className="text-primary font-medium flex items-center gap-1">
              <BadgeCheck className="w-3 h-3" />
              Fair: {formatPrice(post.recommendedPrice, post.currency)}
            </span>
          </div>
        )}
      </button>

      {/* v148/v149: the compare SEEN ON EACH POST - a one-line
          "price by location" strip: this place first ("(You)" on your
          own card), your other posts as "You", then the other
          businesses cheapest-first (near-name matches marked "~");
          when the product stands alone the same-CATEGORY strip shows
          instead. Tapping opens the detail modal with the full
          month x location table. Zero extra requests for the prop path.
          v154: cards the feed-computed map left WITHOUT a strip now fetch
          the modal-grade data on mount and show the same strip. */}
      {effectiveCompare && effectiveCompare.entries.length > 1 && (
        <button
          type="button"
          data-testid="card-compare"
          data-kind={effectiveCompare.kind}
          onClick={() => onOpen?.(post.id)}
          title={effectiveCompare.kind === 'product'
            ? `${post.productName} price by location (${post.currency}) - tap for the full price table`
            : `${post.category || 'Similar'} prices by location (${post.currency}) - no exact match posted yet, tap for the category table`}
          className="mt-1.5 w-full text-left px-2.5 py-1.5 rounded-lg border border-dashed border-primary/30 bg-primary/5 cursor-pointer transition-colors hover:border-primary/50"
        >
          <span className="block text-[9px] uppercase tracking-wide text-muted-foreground font-semibold">
            {effectiveCompare.kind === 'product'
              ? `${post.productName} price by location (${post.currency})`
              : `${post.category || 'Similar'} prices by location (${post.currency})`}
          </span>
          <span className="mt-0.5 flex items-center gap-x-2.5 gap-y-0.5 flex-wrap text-[10px]">
            {effectiveCompare.entries.map((e) => (
              <span
                key={e.id}
                data-testid="card-compare-place"
                data-near={e.near ? 'true' : undefined}
                className={cn('font-medium', e.you ? 'text-primary' : 'text-foreground/80')}
              >
                {e.you && !e.self ? 'You' : e.near ? `~${e.place}` : e.place}
                {e.you && e.self ? ' (You)' : ''} {e.min === e.max ? e.min : `${e.min}-${e.max}`}
              </span>
            ))}
            {effectiveCompare.extra > 0 && (
              <span data-testid="card-compare-more" className="text-muted-foreground">
                +{effectiveCompare.extra} more
              </span>
            )}
          </span>
        </button>
      )}

      {post.localTip && !compact && (
        <div className="mt-2 flex gap-1.5">
          <Lightbulb className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-xs text-foreground italic leading-snug flex-1 line-clamp-2">&ldquo;{post.localTip}&rdquo;</p>
        </div>
      )}

      {/* Contact info - compact chip row */}
      {!compact && (post.contactPhone || post.contactEmail || post.contactWhatsApp) && (
        <div className="mt-2 p-2 rounded-md bg-blue-50 border border-blue-200">
          <p className="text-[10px] font-semibold text-blue-900 mb-1">Contact the local</p>
          <div className="flex flex-wrap gap-1.5">
            {post.contactPhone && (
              <a href={`tel:${post.contactPhone}`} className="flex items-center gap-1 px-2 py-1 rounded-md bg-card border border-blue-200 text-[11px] text-foreground hover:bg-blue-50 transition-colors">
                <Phone className="w-3 h-3 text-blue-600" />
                {post.contactPhone}
              </a>
            )}
            {post.contactEmail && (
              <a href={`mailto:${post.contactEmail}`} className="flex items-center gap-1 px-2 py-1 rounded-md bg-card border border-blue-200 text-[11px] text-foreground hover:bg-blue-50 transition-colors">
                <Mail className="w-3 h-3 text-blue-600" />
                {post.contactEmail}
              </a>
            )}
            {post.contactWhatsApp && (
              <a href={post.contactWhatsApp.startsWith('http') ? post.contactWhatsApp : `https://wa.me/${post.contactWhatsApp.replace(/[^0-9]/g, '')}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 px-2 py-1 rounded-md bg-card border border-blue-200 text-[11px] text-foreground hover:bg-blue-50 transition-colors">
                <MessageCircle className="w-3 h-3 text-green-600" />
                WhatsApp
              </a>
            )}
          </div>
        </div>
      )}

      {/* Message the poster - full-width row under the post itself, always
          labeled (the old footer button was an unlabeled icon on phones).
          Hidden on your own posts and in compact mode. */}
      {onMessage && !canEdit && !canDelete && !compact && (
        <Button
          variant="outline"
          onClick={() => onMessage(post.author.id)}
          className="mt-2 w-full border-primary text-primary hover:bg-primary hover:text-primary-foreground text-xs gap-1.5 h-8"
          title={`Message ${post.author.name}`}
        >
          <MessageCircle className="w-3.5 h-3.5" />
          Message the poster
        </Button>
      )}

      {/* Footer: author left - Details / Save right (v151: Share moved into
          the header 3-dot menu on every card) */}
      <div className="mt-2.5 pt-2 border-t border-border flex items-center justify-between gap-2">
        <button onClick={() => onAuthorClick?.(post.author.id)} className="flex items-center gap-1.5 min-w-0 text-left hover:opacity-80 transition-opacity">
          <Avatar className="w-7 h-7 border border-accent shrink-0 overflow-hidden">
            {post.author.profilePicture ? (
              <img src={post.author.profilePicture} alt={post.author.name} className="w-full h-full object-cover" />
            ) : (
              <AvatarFallback className="bg-primary/15 text-primary text-[10px] font-semibold">{post.author.name.charAt(0).toUpperCase()}</AvatarFallback>
            )}
          </Avatar>
          <div className="min-w-0">
            <p className="text-xs font-medium text-foreground truncate flex items-center gap-1">
              {post.author.name}
              {isOwnPost && (
                <span
                  data-testid="card-you-badge"
                  className="shrink-0 text-[9px] font-bold uppercase tracking-wide text-primary bg-primary/10 rounded-full px-1.5 py-px"
                >
                  You
                </span>
              )}
              {post.author.verifiedLocal && <BadgeCheck className="w-3 h-3 text-primary shrink-0" />}
              {post.author.idVerified && <BadgeCheck className="w-3 h-3 text-blue-500 shrink-0" aria-label="Verified with ID or passport" />}
            </p>
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              {post.author.verifiedLocal && <span className="text-primary font-medium">Verified Local</span>}
              {post.author.rating != null && post.author.rating > 0 && (
                <span className="flex items-center gap-0.5"><Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />{post.author.rating.toFixed(1)}</span>
              )}
            </div>
          </div>
        </button>
        {!compact && (
          <div className="flex items-center gap-1 shrink-0">
            <Button size="sm" variant="outline" onClick={() => onOpen?.(post.id)} className="border-primary text-primary hover:bg-primary hover:text-primary-foreground text-xs gap-1 h-7 px-2 shrink-0">
              <Eye className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Details</span>
            </Button>
            <Button size="sm" variant="outline" onClick={handleToggleSave} className={cn('shrink-0 h-7 w-7 p-0', saved ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:text-primary')} title={saved ? 'Remove from bookmarks' : 'Save to bookmarks'}>
              <Bookmark className={cn('w-3.5 h-3.5', saved && 'fill-current')} />
            </Button>
          </div>
        )}
      </div>

      {!compact && (
        <div className="mt-2 flex items-center gap-1.5 flex-wrap">
          {/* Links count - symmetric links to other posts for the same item
              elsewhere; tapping opens the detail modal where links are
              managed (add / remove). Only rendered when links exist. */}
          {(post.linksCount ?? 0) > 0 && (
            <Button size="sm" variant="outline" onClick={() => onOpen?.(post.id)} data-testid="price-link-count" className="h-7 px-2.5 text-xs gap-1.5 text-muted-foreground hover:text-primary" title="Linked price posts - the same item posted elsewhere">
              <Link2 className="w-3.5 h-3.5" />
              <span>{post.linksCount} link{(post.linksCount ?? 0) !== 1 ? 's' : ''}</span>
            </Button>
          )}
          <Button size="sm" variant={post.myVote === 'HELPFUL' ? 'default' : 'outline'} onClick={() => onVote?.(post.id, 'HELPFUL')} className={cn('h-7 px-2.5 text-xs gap-1.5', post.myVote === 'HELPFUL' ? 'bg-primary hover:bg-primary/90 text-primary-foreground' : 'text-muted-foreground hover:text-primary')}>
            <ThumbsUp className="w-3.5 h-3.5" /><span>{post.helpfulCount}</span><span className="hidden sm:inline">Helpful</span>
          </Button>
          <Button size="sm" variant={post.myVote === 'NOT_ACCURATE' ? 'default' : 'outline'} onClick={() => onVote?.(post.id, 'NOT_ACCURATE')} className={cn('h-7 px-2.5 text-xs gap-1.5', post.myVote === 'NOT_ACCURATE' ? 'bg-orange-500 hover:bg-orange-600 text-white border-orange-500' : 'text-muted-foreground hover:text-orange-500 border-border')}>
            <ThumbsDown className="w-3.5 h-3.5" /><span>{post.notAccurateCount}</span>
          </Button>
        </div>
      )}

      {/* Share poster modal (Task 77; v117 shares the post deep link and
          includes the post's photo on the poster canvas) */}
      <SharePosterModal
        open={shareOpen}
        onOpenChange={setShareOpen}
        target={{
          kind: 'price',
          productName: post.productName,
          category: post.category,
          currency: post.currency,
          priceMin: post.priceMin,
          priceMax: post.priceMax,
          unit: post.unit,
          city: post.city,
          country: post.country,
          imageUrl: post.imageUrl,
          authorName: post.author?.name ?? null,
          authorUsername: post.author?.username ?? null,
          date: new Date(post.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
          // v152/v153/v154: the compare travels with the share - ONE unified
          // source (effectiveCompare: feed-computed prop, or the fetched
          // modal-grade data for strip-less cards), formatted exactly like
          // the card's one-liner.
          compareTitle: effectiveCompare
            ? (effectiveCompare.kind === 'product'
                ? `${post.productName} price by location (${post.currency})`
                : `${post.category || 'Similar'} prices by location (${post.currency})`)
            : null,
          compareLabel: effectiveCompare
            ? [
                ...effectiveCompare.entries.map((e) =>
                  `${e.you && !e.self ? 'You' : e.near ? `~${e.place}` : e.place}${e.you && e.self ? ' (You)' : ''} ${e.min === e.max ? e.min : `${e.min}-${e.max}`}`),
                ...(effectiveCompare.extra > 0 ? [`+${effectiveCompare.extra} more`] : []),
              ].join(' · ')
            : null,
        }}
        linkUrl={shareLink}
        holdBuild={compareHold}
      />
    </Card>
  )
}

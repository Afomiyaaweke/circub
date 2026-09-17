'use client'

import { useState, useEffect } from 'react'
import { MapPin, Star, BadgeCheck, ThumbsUp, ThumbsDown, Lightbulb, Eye, MoreHorizontal, Trash2, Pencil, Phone, Mail, MessageCircle, Share2, Bookmark, Clock } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { toggleSaved, isSaved as checkSaved } from '@/lib/saved-items'
import { timeAgoLabel, freshnessLevel, freshnessTitle, freshnessClasses } from '@/lib/freshness'
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
}

function formatPrice(value: number, currency: string) {
  if (value >= 1000) return `${currency} ${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
  return `${currency} ${value}`
}

// Compact template — the old card stacked a full-width photo (up to ~200px),
// a big gradient price box, a separate tourist-price box, a tip, a contact
// panel, a share row, an author row and a vote row: ~700px per card on a
// phone. Everything kept, but tightened: photo is a side thumbnail, price is
// one line with fair/tourist inline, share lives in the footer icon group.
export function LocalPriceCard({ post, onOpen, onVote, onAuthorClick, onMessage, onDelete, onEdit, canDelete = false, canEdit = false, compact = false }: LocalPriceCardProps) {
  const [showMenu, setShowMenu] = useState(false)
  const [saved, setSaved] = useState(false)
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
      priceLabel: `${post.currency} ${post.priceMin}${post.priceMin !== post.priceMax ? '-' + post.priceMax : ''}`,
      imageUrl: post.imageUrl,
      href: null,
    })
    setSaved(isNowSaved)
    toast({ title: isNowSaved ? 'Saved to bookmarks' : 'Removed from bookmarks' })
  }
  const detailedLocation = [post.market, post.neighborhood, post.city, post.country].filter(Boolean).join(' · ')

  const handleShare = async () => {
    const url = `${window.location.origin}/?post=${post.id}`
    const shareData = {
      title: `${post.productName} — circub`,
      text: `Check this price on circub: ${post.productName} in ${post.country} — ${post.currency} ${post.priceMin}-${post.priceMax}`,
      url,
    }
    try {
      if (navigator.share) {
        await navigator.share(shareData)
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(url)
        toast({ title: 'Link copied!', description: 'Share it anywhere.' })
      } else {
        // Fallback: open in a text prompt
        window.prompt('Copy this link:', url)
      }
    } catch (e) {
      // User cancelled share or clipboard failed — try fallback
      if (e instanceof Error && e.name !== 'AbortError') {
        try {
          await navigator.clipboard.writeText(url)
          toast({ title: 'Link copied!', description: 'Share it anywhere.' })
        } catch {
          window.prompt('Copy this link:', url)
        }
      }
    }
  }

  return (
    <Card className={cn('overflow-hidden shadow-sm hover:shadow-md transition-shadow border-border', compact ? 'p-3' : 'p-3')}>
      {/* Row 1: type badge + category left, edit/delete menu right */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <Badge variant="secondary" className={cn('text-[9px] font-medium uppercase tracking-wide px-1.5 shrink-0', post.postType === 'SERVICE' ? 'bg-purple-100 text-purple-700' : 'bg-emerald-100 text-emerald-700')}>
            {post.postType === 'SERVICE' ? 'Service' : 'Product'}
          </Badge>
          <span className="text-[10px] text-muted-foreground truncate">{post.category}</span>
          {/* Freshness — how old this price is (amber warning once outside the history's Current window) */}
          <span className={cn('ml-auto flex items-center gap-0.5 shrink-0 text-[10px] px-1 rounded', freshnessClasses[freshnessLevel(post.createdAt)])} title={freshnessTitle(post.createdAt)}>
            <Clock className="w-2.5 h-2.5" />
            {timeAgoLabel(post.createdAt)}
          </span>
        </div>
        {(canDelete || canEdit) && (
          <div className="relative shrink-0">
            <button onClick={() => setShowMenu(!showMenu)} className="p-1 rounded-full hover:bg-accent text-muted-foreground transition-colors" aria-label="More options">
              <MoreHorizontal className="w-3.5 h-3.5" />
            </button>
            {showMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
                <div className="absolute right-0 top-7 z-20 bg-card border border-border rounded-lg shadow-lg py-1 min-w-[160px]">
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
        )}
      </div>

      {/* Row 2: name + location, with the photo as a small side thumbnail */}
      <div className="mt-1.5 flex items-start gap-2.5">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-foreground text-sm sm:text-base leading-snug">{post.productName}</h3>
          <p className="mt-0.5 text-[11px] text-muted-foreground flex items-center gap-1 min-w-0">
            <MapPin className="w-3 h-3 text-primary shrink-0" />
            <span className="truncate">{detailedLocation}</span>
          </p>
        </div>
        {post.imageUrl && !compact && (
          <img loading="lazy" decoding="async" src={post.imageUrl} alt={post.productName} className="w-14 h-14 sm:w-16 sm:h-16 rounded-lg object-cover border border-border bg-accent/30 shrink-0" />
        )}
      </div>

      {/* Row 3: one-line price strip — fair price and tourist price inline */}
      <div className="mt-2 px-2.5 py-2 rounded-lg bg-gradient-to-br from-primary/10 to-emerald-50 border border-primary/20">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Typical local price</span>
          <span className="text-sm sm:text-base font-bold text-foreground">
            {formatPrice(post.priceMin, post.currency)} · {formatPrice(post.priceMax, post.currency)}
          </span>
        </div>
        {(post.recommendedPrice != null || (post.touristPrice != null && !compact)) && (
          <div className="mt-1 flex items-center gap-x-3 gap-y-0.5 flex-wrap text-[11px]">
            {post.recommendedPrice != null && (
              <span className="text-primary font-medium flex items-center gap-1">
                <BadgeCheck className="w-3 h-3" />
                Fair: {formatPrice(post.recommendedPrice, post.currency)}
              </span>
            )}
            {post.touristPrice != null && !compact && (
              <span className="text-orange-700 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-orange-400 shrink-0" />
                Tourists: {formatPrice(post.touristPrice, post.currency)}
              </span>
            )}
          </div>
        )}
      </div>

      {post.localTip && !compact && (
        <div className="mt-2 flex gap-1.5">
          <Lightbulb className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-xs text-foreground italic leading-snug flex-1 line-clamp-2">&ldquo;{post.localTip}&rdquo;</p>
        </div>
      )}

      {/* Contact info — compact chip row */}
      {!compact && (post.contactPhone || post.contactEmail || post.contactWhatsApp) && (
        <div className="mt-2 p-2 rounded-md bg-blue-50 border border-blue-200">
          <p className="text-[10px] font-semibold text-blue-900 mb-1">Contact the local</p>
          <div className="flex flex-wrap gap-1.5">
            {post.contactPhone && (
              <a href={`tel:${post.contactPhone}`} className="flex items-center gap-1 px-2 py-1 rounded-md bg-white border border-blue-200 text-[11px] text-foreground hover:bg-blue-50 transition-colors">
                <Phone className="w-3 h-3 text-blue-600" />
                {post.contactPhone}
              </a>
            )}
            {post.contactEmail && (
              <a href={`mailto:${post.contactEmail}`} className="flex items-center gap-1 px-2 py-1 rounded-md bg-white border border-blue-200 text-[11px] text-foreground hover:bg-blue-50 transition-colors">
                <Mail className="w-3 h-3 text-blue-600" />
                {post.contactEmail}
              </a>
            )}
            {post.contactWhatsApp && (
              <a href={post.contactWhatsApp.startsWith('http') ? post.contactWhatsApp : `https://wa.me/${post.contactWhatsApp.replace(/[^0-9]/g, '')}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 px-2 py-1 rounded-md bg-white border border-blue-200 text-[11px] text-foreground hover:bg-blue-50 transition-colors">
                <MessageCircle className="w-3 h-3 text-green-600" />
                WhatsApp
              </a>
            )}
          </div>
        </div>
      )}

      {/* Message the poster — full-width row under the post itself, always
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

      {/* Footer: author left — Details / Save / Share right (share was its own row before) */}
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
            <Button size="sm" variant="ghost" onClick={() => void handleShare()} className="shrink-0 h-7 w-7 p-0 text-muted-foreground hover:text-primary" title="Share this price">
              <Share2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        )}
      </div>

      {!compact && (
        <div className="mt-2 flex items-center gap-1.5">
          <Button size="sm" variant={post.myVote === 'HELPFUL' ? 'default' : 'outline'} onClick={() => onVote?.(post.id, 'HELPFUL')} className={cn('h-7 px-2.5 text-xs gap-1.5', post.myVote === 'HELPFUL' ? 'bg-primary hover:bg-primary/90 text-primary-foreground' : 'text-muted-foreground hover:text-primary')}>
            <ThumbsUp className="w-3.5 h-3.5" /><span>{post.helpfulCount}</span><span className="hidden sm:inline">Helpful</span>
          </Button>
          <Button size="sm" variant={post.myVote === 'NOT_ACCURATE' ? 'default' : 'outline'} onClick={() => onVote?.(post.id, 'NOT_ACCURATE')} className={cn('h-7 px-2.5 text-xs gap-1.5', post.myVote === 'NOT_ACCURATE' ? 'bg-orange-500 hover:bg-orange-600 text-white border-orange-500' : 'text-muted-foreground hover:text-orange-500 border-border')}>
            <ThumbsDown className="w-3.5 h-3.5" /><span>{post.notAccurateCount}</span>
          </Button>
        </div>
      )}
    </Card>
  )
}

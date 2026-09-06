'use client'

import { useState } from 'react'
import { MapPin, Star, BadgeCheck, ThumbsUp, ThumbsDown, Lightbulb, Eye, MoreHorizontal, Trash2, Pencil, Phone, Mail, MessageCircle, Share2 } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import type { LocalPricePost } from '@/lib/types'

interface LocalPriceCardProps {
  post: LocalPricePost
  onOpen?: (postId: string) => void
  onVote?: (postId: string, voteType: 'HELPFUL' | 'NOT_ACCURATE') => void
  onAuthorClick?: (authorId: string) => void
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

export function LocalPriceCard({ post, onOpen, onVote, onAuthorClick, onDelete, onEdit, canDelete = false, canEdit = false, compact = false }: LocalPriceCardProps) {
  const [showMenu, setShowMenu] = useState(false)
  const detailedLocation = [post.market, post.neighborhood, post.city, post.country].filter(Boolean).join(' · ')

  return (
    <Card className={cn('overflow-hidden shadow-sm hover:shadow-md transition-shadow border-border', compact ? 'p-3' : 'p-4')}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <Badge variant="secondary" className={cn('text-[10px] font-medium uppercase tracking-wide', post.postType === 'SERVICE' ? 'bg-purple-100 text-purple-700' : 'bg-emerald-100 text-emerald-700')}>
          {post.postType === 'SERVICE' ? 'Service' : 'Product'}
        </Badge>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">{post.category}</span>
          {(canDelete || canEdit) && (
            <div className="relative">
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
      </div>

      <h3 className="font-semibold text-foreground text-base sm:text-lg leading-tight">{post.productName}</h3>
      <p className="mt-1 text-xs text-muted-foreground flex items-center gap-1.5">
        <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
        <span className="truncate">{detailedLocation}</span>
      </p>

      {post.imageUrl && !compact && (
        <div className="mt-3 rounded-lg overflow-hidden border border-border bg-accent/30">
          <img src={post.imageUrl} alt={post.productName} className="w-full max-h-48 object-cover" />
        </div>
      )}

      <div className="mt-3 p-3 rounded-lg bg-gradient-to-br from-primary/10 to-emerald-50 border border-primary/20">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Typical local price</p>
        <p className="text-lg sm:text-xl font-bold text-foreground mt-0.5">
          {formatPrice(post.priceMin, post.currency)} · {formatPrice(post.priceMax, post.currency)}
        </p>
        {post.recommendedPrice != null && (
          <p className="text-xs text-primary font-medium mt-1.5 flex items-center gap-1">
            <BadgeCheck className="w-3.5 h-3.5" />
            Fair price: {formatPrice(post.recommendedPrice, post.currency)}
          </p>
        )}
      </div>

      {post.touristPrice != null && !compact && (
        <div className="mt-2 p-2.5 rounded-md bg-orange-50 border border-orange-200">
          <p className="text-xs text-orange-800">
            <span className="font-medium">Tourists may be charged: </span>
            <span className="font-semibold">{formatPrice(post.touristPrice, post.currency)}</span>
          </p>
        </div>
      )}

      {post.localTip && !compact && (
        <div className="mt-3 flex gap-2">
          <Lightbulb className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-sm text-foreground italic leading-relaxed flex-1">&ldquo;{post.localTip}&rdquo;</p>
        </div>
      )}

      {/* Contact info */}
      {!compact && (post.contactPhone || post.contactEmail || post.contactWhatsApp) && (
        <div className="mt-3 p-3 rounded-lg bg-blue-50 border border-blue-200">
          <p className="text-[11px] font-semibold text-blue-900 mb-2">Contact the local</p>
          <div className="flex flex-wrap gap-2">
            {post.contactPhone && (
              <a href={`tel:${post.contactPhone}`} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-white border border-blue-200 text-xs text-foreground hover:bg-blue-50 transition-colors">
                <Phone className="w-3.5 h-3.5 text-blue-600" />
                {post.contactPhone}
              </a>
            )}
            {post.contactEmail && (
              <a href={`mailto:${post.contactEmail}`} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-white border border-blue-200 text-xs text-foreground hover:bg-blue-50 transition-colors">
                <Mail className="w-3.5 h-3.5 text-blue-600" />
                {post.contactEmail}
              </a>
            )}
            {post.contactWhatsApp && (
              <a href={post.contactWhatsApp.startsWith('http') ? post.contactWhatsApp : `https://wa.me/${post.contactWhatsApp.replace(/[^0-9]/g, '')}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-white border border-blue-200 text-xs text-foreground hover:bg-blue-50 transition-colors">
                <MessageCircle className="w-3.5 h-3.5 text-green-600" />
                WhatsApp
              </a>
            )}
          </div>
        </div>
      )}

      {/* Share button */}
      {!compact && (
        <div className="mt-2 flex justify-end">
          <button
            onClick={() => {
              const url = typeof window !== 'undefined' ? `${window.location.origin}/?post=${post.id}` : ''
              if (navigator.share) {
                navigator.share({ title: post.productName, text: `Check this price on circub: ${post.productName} in ${post.country}`, url })
              } else {
                navigator.clipboard.writeText(url)
                // toast would be nice but we don't have access here without prop drilling
              }
            }}
            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary transition-colors"
          >
            <Share2 className="w-3 h-3" />
            Share
          </button>
        </div>
      )}

      <div className="mt-4 pt-3 border-t border-border flex items-center justify-between gap-2">
        <button onClick={() => onAuthorClick?.(post.author.id)} className="flex items-center gap-2 min-w-0 text-left hover:opacity-80 transition-opacity">
          <Avatar className="w-9 h-9 border border-accent shrink-0 overflow-hidden">
            {post.author.profilePicture ? (
              <img src={post.author.profilePicture} alt={post.author.name} className="w-full h-full object-cover" />
            ) : (
              <AvatarFallback className="bg-primary/15 text-primary text-xs font-semibold">{post.author.name.charAt(0).toUpperCase()}</AvatarFallback>
            )}
          </Avatar>
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground truncate flex items-center gap-1">
              {post.author.name}
              {post.author.verifiedLocal && <BadgeCheck className="w-3.5 h-3.5 text-primary shrink-0" />}
            </p>
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              {post.author.verifiedLocal && <span className="text-primary font-medium">Verified Local</span>}
              {post.author.rating != null && post.author.rating > 0 && (
                <span className="flex items-center gap-0.5"><Star className="w-3 h-3 fill-amber-400 text-amber-400" />{post.author.rating.toFixed(1)}</span>
              )}
            </div>
          </div>
        </button>
        {!compact && (
          <Button size="sm" variant="outline" onClick={() => onOpen?.(post.id)} className="border-primary text-primary hover:bg-primary hover:text-primary-foreground text-xs gap-1.5 shrink-0">
            <Eye className="w-3.5 h-3.5" />
            Details
          </Button>
        )}
      </div>

      {!compact && (
        <div className="mt-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant={post.myVote === 'HELPFUL' ? 'default' : 'outline'} onClick={() => onVote?.(post.id, 'HELPFUL')} className={cn('h-7 px-2.5 text-xs gap-1.5', post.myVote === 'HELPFUL' ? 'bg-primary hover:bg-primary/90 text-primary-foreground' : 'text-muted-foreground hover:text-primary')}>
              <ThumbsUp className="w-3.5 h-3.5" /><span>{post.helpfulCount}</span><span className="hidden sm:inline">Helpful</span>
            </Button>
            <Button size="sm" variant={post.myVote === 'NOT_ACCURATE' ? 'default' : 'outline'} onClick={() => onVote?.(post.id, 'NOT_ACCURATE')} className={cn('h-7 px-2.5 text-xs gap-1.5', post.myVote === 'NOT_ACCURATE' ? 'bg-orange-500 hover:bg-orange-600 text-white border-orange-500' : 'text-muted-foreground hover:text-orange-500 border-border')}>
              <ThumbsDown className="w-3.5 h-3.5" /><span>{post.notAccurateCount}</span>
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}

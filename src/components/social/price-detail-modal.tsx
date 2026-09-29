'use client'

import { useEffect, useState } from 'react'
import {
  X,
  MapPin,
  Star,
  BadgeCheck,
  ThumbsUp,
  ThumbsDown,
  Lightbulb,
  TrendingUp,
  AlertTriangle,
  Flag,
  Users,
  ArrowUpRight,
  ArrowDownRight,
  History,
  Eye,
  MessageCircle,
  Clock,
  Navigation,
  Store,
  Link2,
  Plus,
  Search,
  Loader2,
} from 'lucide-react'
import { mapsDirectionsUrl, formatGps } from '@/lib/location'
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { timeAgoLabel, freshnessLevel, freshnessTitle, freshnessClasses } from '@/lib/freshness'
import { useToast } from '@/hooks/use-toast'
import type {
  LocalPricePost,
  LocalPriceConsensus,
  LocalPriceHistory,
  PriceHistoryPoint,
} from '@/lib/types'

interface PriceDetailModalProps {
  postId: string | null
  onClose: () => void
  onAuthorClick: (authorId: string) => void
  onMessage?: (authorId: string) => void
  currentUserId?: string | null
  // Opens another price post in this modal (from the linked-prices list).
  onOpenPost?: (postId: string) => void
}

// One row of the linked-prices list (the OTHER post of a symmetric link).
interface LinkedPostRow {
  linkId: string
  createdBy: string
  createdAt: string
  canRemove: boolean
  post: {
    id: string
    productName: string
    category: string
    currency: string
    priceMin: number
    priceMax: number
    city?: string | null
    country?: string | null
    imageUrl?: string | null
    createdAt: string
    author?: { id: string; name: string; verifiedLocal?: boolean; idVerified?: boolean }
  }
}

const REPORT_OPTIONS = [
  { value: 'INCORRECT_PRICE', label: 'Incorrect price' },
  { value: 'OUTDATED', label: 'Outdated information' },
  { value: 'FAKE_POST', label: 'Fake post' },
  { value: 'WRONG_LOCATION', label: 'Wrong location' },
  { value: 'SELLER_PROMOTION', label: 'Seller promotion' },
  { value: 'SPAM', label: 'Spam' },
]

function formatPrice(value: number | null | undefined, currency: string) {
  if (value == null) return '-'
  if (value >= 1000) return `${currency} ${value.toLocaleString()}`
  return `${currency} ${value}`
}

export function PriceDetailModal({ postId, onClose, onAuthorClick, onMessage, currentUserId, onOpenPost }: PriceDetailModalProps) {
  const [post, setPost] = useState<LocalPricePost | null>(null)
  const [consensus, setConsensus] = useState<LocalPriceConsensus | null>(null)
  const [history, setHistory] = useState<LocalPriceHistory | null>(null)
  const [loading, setLoading] = useState(false)
  const [showReport, setShowReport] = useState(false)
  const [reportType, setReportType] = useState<string>('')
  const [reportNote, setReportNote] = useState('')
  const [submittingReport, setSubmittingReport] = useState(false)
  // Linked prices (same item posted elsewhere): list + add/remove picker.
  const [links, setLinks] = useState<LinkedPostRow[]>([])
  const [showLinkPicker, setShowLinkPicker] = useState(false)
  const [linkSearch, setLinkSearch] = useState('')
  const [linkResults, setLinkResults] = useState<any[]>([])
  const [linkSearching, setLinkSearching] = useState(false)
  const [linkBusyId, setLinkBusyId] = useState<string | null>(null)
  const { toast } = useToast()

  useEffect(() => {
    let cancelled = false
    if (!postId) {
      return
    }

    const loadData = async () => {
      setLoading(true)
      // Reset the linked-prices panel - it belongs to the post being opened.
      setLinks([])
      setShowLinkPicker(false)
      setLinkSearch('')
      setLinkResults([])
      try {
        const postDataRes = await fetch(`/api/local-prices/${postId}`, { cache: 'no-store' })
        const postData = await postDataRes.json()
        const p = postData.post
        if (!p || cancelled) return
        setPost(p)

        // Linked price posts (same item posted elsewhere) - count + rows
        // for the manage list.
        try {
          const lRes = await fetch(`/api/local-prices/${postId}/links`, { cache: 'no-store' })
          const lData = await lRes.json()
          if (!cancelled) setLinks(Array.isArray(lData.links) ? lData.links : [])
        } catch { if (!cancelled) setLinks([]) }

        // Fetch consensus using the post's productName + country + city, excluding this post
        const cParams = new URLSearchParams()
        cParams.set('productName', p.productName)
        cParams.set('country', p.country)
        if (p.city) cParams.set('city', p.city)
        cParams.set('postId', p.id) // exclude current
        const cRes = await fetch(`/api/local-prices/consensus?${cParams.toString()}`)
        const cData = await cRes.json()
        if (!cancelled) setConsensus(cData.consensus || null)

        // Fetch history
        const hParams = new URLSearchParams()
        hParams.set('productName', p.productName)
        hParams.set('country', p.country)
        if (p.city) hParams.set('city', p.city)
        const hRes = await fetch(`/api/local-prices/history?${hParams.toString()}`)
        const hData = await hRes.json()
        if (!cancelled) setHistory(hData.history || null)
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    loadData()

    return () => {
      cancelled = true
    }
  }, [postId])

  const handleVote = async (voteType: 'HELPFUL' | 'NOT_ACCURATE') => {
    if (!post) return
    try {
      const res = await fetch(`/api/local-prices/${post.id}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voteType }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')

      setPost((prev) => {
        if (!prev) return prev
        const wasHelpful = prev.myVote === 'HELPFUL'
        const wasNotAcc = prev.myVote === 'NOT_ACCURATE'
        const newVote = data.vote
        let helpful = prev.helpfulCount
        let notAcc = prev.notAccurateCount
        if (newVote === null) {
          if (wasHelpful) helpful = Math.max(0, helpful - 1)
          if (wasNotAcc) notAcc = Math.max(0, notAcc - 1)
        } else if (newVote === 'HELPFUL') {
          if (!wasHelpful) helpful += 1
          if (wasNotAcc) notAcc = Math.max(0, notAcc - 1)
        } else if (newVote === 'NOT_ACCURATE') {
          if (!wasNotAcc) notAcc += 1
          if (wasHelpful) helpful = Math.max(0, helpful - 1)
        }
        return {
          ...prev,
          myVote: newVote,
          helpfulCount: helpful,
          notAccurateCount: notAcc,
        }
      })

      if (data.vote === 'HELPFUL') {
        toast({ title: 'Marked as helpful' })
      } else if (data.vote === 'NOT_ACCURATE') {
        toast({ title: 'Flagged as not accurate' })
      } else {
        toast({ title: 'Vote removed' })
      }
    } catch (e) {
      toast({
        title: 'Vote failed',
        description: (e as Error).message,
        variant: 'destructive',
      })
    }
  }

  // ---------------------------------------------------------------- links
  // Candidates for the link picker: feed search results minus this post
  // and everything already linked.
  const linkCandidates = linkResults.filter(
    (c) => post && c.id !== post.id && !links.some((l) => l.post.id === c.id)
  )

  const handleAddLink = async (otherId: string) => {
    if (!post) return
    setLinkBusyId(otherId)
    try {
      const res = await fetch(`/api/local-prices/${post.id}/links`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ linkedId: otherId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to link')
      setLinks(Array.isArray(data.links) ? data.links : [])
      // The feed re-counts the "N links" chips without a reload.
      try { window.dispatchEvent(new Event('circub:feed-changed')) } catch {}
      toast({ title: 'Posts linked', description: 'The link shows on both price posts.' })
      setShowLinkPicker(false)
      setLinkSearch('')
      setLinkResults([])
    } catch (e) {
      toast({ title: 'Link failed', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setLinkBusyId(null)
    }
  }

  const handleRemoveLink = async (otherId: string) => {
    if (!post) return
    setLinkBusyId(otherId)
    try {
      const res = await fetch(`/api/local-prices/${post.id}/links`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ linkedId: otherId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to remove')
      setLinks(Array.isArray(data.links) ? data.links : [])
      // The feed re-counts the "N links" chips without a reload.
      try { window.dispatchEvent(new Event('circub:feed-changed')) } catch {}
      toast({ title: 'Link removed' })
    } catch (e) {
      toast({ title: 'Remove failed', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setLinkBusyId(null)
    }
  }

  // Debounced feed search for the link picker (min 2 chars).
  useEffect(() => {
    if (!showLinkPicker) return
    const q = linkSearch.trim()
    if (q.length < 2) {
      setLinkResults([])
      setLinkSearching(false)
      return
    }
    let dead = false
    const t = setTimeout(async () => {
      setLinkSearching(true)
      try {
        const res = await fetch(`/api/local-prices?search=${encodeURIComponent(q)}`, { cache: 'no-store' })
        const data = await res.json()
        if (!dead) setLinkResults(Array.isArray(data.posts) ? data.posts : [])
      } catch {
        if (!dead) setLinkResults([])
      } finally {
        if (!dead) setLinkSearching(false)
      }
    }, 300)
    return () => {
      dead = true
      clearTimeout(t)
    }
  }, [linkSearch, showLinkPicker])

  const handleReport = async () => {
    if (!post || !reportType) return
    setSubmittingReport(true)
    try {
      const res = await fetch(`/api/local-prices/${post.id}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportType, note: reportNote || undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      toast({
        title: 'Report submitted',
        description: 'Thanks · our team will review this post.',
      })
      setShowReport(false)
      setReportType('')
      setReportNote('')
    } catch (e) {
      toast({
        title: 'Report failed',
        description: (e as Error).message,
        variant: 'destructive',
      })
    } finally {
      setSubmittingReport(false)
    }
  }

  const detailedLocation = post
    ? [post.market, post.neighborhood, post.city, post.country].filter(Boolean).join(' • ')
    : ''

  return (
    <Dialog open={!!postId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto scrollbar-thin p-0 gap-0">
        <DialogTitle className="sr-only">Price Details</DialogTitle>

        {loading ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            Loading price details...
          </div>
        ) : !post ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            Post not found.
          </div>
        ) : (
          <div>
            {/* Header */}
            <div className="p-5 sm:p-6 border-b border-border bg-gradient-to-br from-primary/10 to-emerald-50">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Badge
                      variant="secondary"
                      className={cn(
                        'text-[10px] font-medium uppercase tracking-wide',
                        post.postType === 'SERVICE'
                          ? 'bg-purple-100 text-purple-700'
                          : 'bg-emerald-100 text-emerald-700'
                      )}
                    >
                      {post.postType === 'SERVICE' ? 'Service' : 'Product'}
                    </Badge>
                    {/* First-party price: poster owns this shop/business */}
                    {post.ownsShop && (
                      <Badge variant="secondary" className="text-[10px] font-medium uppercase tracking-wide gap-1 bg-amber-100 text-amber-700" data-testid="detail-shop-owner-badge" title="Posted by the shop owner - first-hand price">
                        <Store className="w-3 h-3" />
                        Shop owner
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-[10px]">
                      {post.category}
                    </Badge>
                    {/* Freshness - how old this price is (amber warning once outside the history's Current window) */}
                    <span
                      className={cn(
                        'flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded shrink-0',
                        freshnessClasses[freshnessLevel(post.createdAt)]
                      )}
                      title={freshnessTitle(post.createdAt)}
                    >
                      <Clock className="w-2.5 h-2.5" />
                      {timeAgoLabel(post.createdAt)}
                    </span>
                  </div>
                  <h2 className="text-xl sm:text-2xl font-bold text-foreground leading-tight">
                    {post.productName}
                  </h2>
                  <p className="mt-1.5 text-sm text-muted-foreground flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-primary" />
                    {detailedLocation}
                  </p>
                  {/* GPS pin: one-tap turn-by-turn directions for tourists */}
                  {post.latitude != null && post.longitude != null && (
                    <a
                      data-testid="detail-directions"
                      href={mapsDirectionsUrl(post.latitude, post.longitude)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
                    >
                      <Navigation className="w-3.5 h-3.5" aria-hidden="true" />
                      Get directions · GPS {formatGps(post.latitude, post.longitude)}
                    </a>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">
                    Posted on{' '}
                    {new Date(post.createdAt).toLocaleDateString(undefined, {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                    {freshnessLevel(post.createdAt) === 'stale' && (
                      <span className="text-amber-700 font-medium"> · may be outdated</span>
                    )}
                  </p>
                </div>
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-md hover:bg-accent text-muted-foreground shrink-0"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Price block */}
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-lg bg-card border border-primary/20 p-3">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                    Typical local price
                  </p>
                  <p className="text-base font-bold text-foreground mt-1">
                    {formatPrice(post.priceMin, post.currency)} - {formatPrice(post.priceMax, post.currency)}
                  </p>
                </div>
                {post.recommendedPrice != null && (
                  <div className="rounded-lg bg-card border border-emerald-300 p-3">
                    <p className="text-[10px] uppercase tracking-wide text-emerald-700 font-medium flex items-center gap-1">
                      <BadgeCheck className="w-3 h-3" />
                      Recommended fair price
                    </p>
                    <p className="text-base font-bold text-emerald-700 mt-1">
                      {formatPrice(post.recommendedPrice, post.currency)}
                    </p>
                  </div>
                )}
                {post.touristPrice != null && (
                  <div className="rounded-lg bg-orange-50 border border-orange-200 p-3">
                    <p className="text-[10px] uppercase tracking-wide text-orange-700 font-medium">
                      Tourists may be charged
                    </p>
                    <p className="text-base font-bold text-orange-700 mt-1">
                      {formatPrice(post.touristPrice, post.currency)}+
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Body */}
            <div className="p-5 sm:p-6 space-y-5">
              {/* Description */}
              {post.description && (
                <div>
                  <h3 className="text-sm font-semibold text-foreground mb-1.5">About this {post.postType.toLowerCase()}</h3>
                  <p className="text-sm text-foreground/90 leading-relaxed">{post.description}</p>
                </div>
              )}

              {/* Local tip */}
              {post.localTip && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 p-4">
                  <h3 className="text-sm font-semibold text-amber-900 flex items-center gap-1.5 mb-2">
                    <Lightbulb className="w-4 h-4 text-amber-500" />
                    Local tip
                  </h3>
                  <p className="text-sm text-amber-900 italic leading-relaxed">
                    &ldquo;{post.localTip}&rdquo;
                  </p>
                </div>
              )}

              {/* Image */}
              {post.imageUrl && (
                <div className="rounded-lg overflow-hidden border border-border">
                  <img
                    src={post.imageUrl}
                    alt={post.productName}
                    className="w-full max-h-80 object-cover"
                  />
                </div>
              )}

              {/* Consensus section */}
              <div className="rounded-xl bg-emerald-50/50 border border-emerald-200 p-4">
                <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-primary" />
                  Local consensus
                </h3>
                {!consensus ? (
                  <p className="text-sm text-muted-foreground">
                    No other local reports yet for this product in this area.
                    Be the first to confirm or challenge this price · or wait for more locals to weigh in.
                  </p>
                ) : (
                  <div>
                    <div className="flex items-baseline gap-3 flex-wrap">
                      <p className="text-2xl font-bold text-foreground">
                        {formatPrice(consensus.avgPriceMin, consensus.currency)} - {formatPrice(consensus.avgPriceMax, consensus.currency)}
                      </p>
                      {consensus.verdict === 'fair' && (
                        <Badge className="bg-emerald-500 text-white">🟢 Fair price</Badge>
                      )}
                      {consensus.verdict === 'expensive' && (
                        <Badge className="bg-orange-500 text-white">🟠 Tourists pay more</Badge>
                      )}
                      {consensus.verdict === 'cheap' && (
                        <Badge className="bg-emerald-500 text-white">🟢 Below market</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1.5 italic">
                      Based on <span className="font-semibold text-foreground">{consensus.reportCount}</span> community-reported prices.
                    </p>

                    {/* Contributing posts */}
                    {consensus.contributingPosts.length > 0 && (
                      <div className="mt-3 space-y-1.5">
                        {consensus.contributingPosts.slice(0, 5).map((cp) => (
                          <div
                            key={cp.id}
                            className="flex items-center justify-between gap-2 text-xs bg-card border border-border/50 rounded-md px-3 py-1.5"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <Avatar className="w-5 h-5">
                                <AvatarFallback className="bg-primary/15 text-primary text-[10px] font-semibold">
                                  {cp.author.name.charAt(0).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              <span className="font-medium text-foreground truncate">{cp.author.name}</span>
                              {cp.author.verifiedLocal && (
                                <BadgeCheck className="w-3 h-3 text-primary shrink-0" />
                              )}
                              {cp.author.idVerified && (
                                <BadgeCheck className="w-3 h-3 text-blue-500 shrink-0" aria-label="Verified with ID or passport" />
                              )}
                            </div>
                            <span className="text-muted-foreground shrink-0">
                              {formatPrice(cp.priceMin, consensus.currency)} - {formatPrice(cp.priceMax, consensus.currency)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Linked prices - symmetric links to other posts for the
                  same item elsewhere: add via the picker, remove with the
                  x, count in the header. Every link shows on BOTH posts. */}
              <div className="rounded-xl border border-border p-4" data-testid="detail-links-section">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                    <Link2 className="w-4 h-4 text-primary" />
                    Linked prices
                    <span
                      data-testid="detail-links-count"
                      className="text-[10px] font-semibold text-primary bg-primary/10 rounded-full px-1.5 py-0.5"
                    >
                      {links.length}
                    </span>
                  </h3>
                  {currentUserId && (
                    <Button
                      size="sm"
                      variant="outline"
                      data-testid="detail-link-picker-toggle"
                      onClick={() => setShowLinkPicker((v) => !v)}
                      className="h-7 px-2 text-xs gap-1 border-primary text-primary hover:bg-primary hover:text-primary-foreground"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Link a price post
                    </Button>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground mb-2.5">
                  The same item posted elsewhere - every link shows on both posts.
                </p>

                {showLinkPicker && currentUserId && (
                  <div className="mb-3 rounded-lg border border-border bg-accent/30 p-2.5 space-y-2" data-testid="detail-link-picker">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                      <Input
                        data-testid="detail-link-search"
                        value={linkSearch}
                        onChange={(e) => setLinkSearch(e.target.value)}
                        placeholder="Search the item to link..."
                        className="pl-8 h-8 text-xs bg-card"
                      />
                    </div>
                    {linkSearching && (
                      <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                        <Loader2 className="w-3 h-3 animate-spin" /> Searching the feed...
                      </p>
                    )}
                    {!linkSearching && linkSearch.trim().length >= 2 && linkCandidates.length === 0 && (
                      <p className="text-[11px] text-muted-foreground">{`No other price post matches "${linkSearch.trim()}".`}</p>
                    )}
                    {linkSearch.trim().length < 2 && (
                      <p className="text-[11px] text-muted-foreground">Type at least 2 letters to search the whole feed for the item to link.</p>
                    )}
                    <div className="space-y-1.5 max-h-44 overflow-y-auto scrollbar-thin">
                      {linkCandidates.slice(0, 6).map((c) => (
                        <div key={c.id} data-testid="detail-link-cand" className="flex items-center justify-between gap-2 bg-card border border-border rounded-md px-2.5 py-1.5">
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-foreground truncate">{c.productName}</p>
                            <p className="text-[10px] text-muted-foreground truncate">
                              {[c.city, c.country].filter(Boolean).join(', ')} · {c.currency} {c.priceMin}{c.priceMin !== c.priceMax ? `-${c.priceMax}` : ''}
                            </p>
                          </div>
                          <Button
                            size="sm"
                            data-testid="detail-link-add"
                            disabled={linkBusyId === c.id}
                            onClick={() => void handleAddLink(c.id)}
                            className="h-6 px-2 text-[11px] bg-primary hover:bg-primary/90 text-primary-foreground shrink-0 gap-1"
                          >
                            {linkBusyId === c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Link2 className="w-3 h-3" />}
                            Link
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {links.length === 0 ? (
                  <p className="text-xs text-muted-foreground" data-testid="detail-links-empty">
                    {currentUserId
                      ? 'No linked price posts yet - search above and link the same item elsewhere.'
                      : 'No linked price posts yet.'}
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {links.map((l) => (
                      <div
                        key={l.linkId}
                        data-testid="detail-link-row"
                        className="flex items-center justify-between gap-2 bg-card border border-border rounded-md px-2.5 py-1.5"
                      >
                        <button
                          className="flex items-center gap-2 min-w-0 text-left flex-1 hover:opacity-80"
                          onClick={() => onOpenPost?.(l.post.id)}
                          title="Open this linked price post"
                          data-testid="detail-link-open"
                        >
                          {l.post.imageUrl && (
                            <img src={l.post.imageUrl} alt="" className="w-7 h-7 rounded object-cover border border-border shrink-0" />
                          )}
                          <span className="min-w-0">
                            <span className="block text-xs font-medium text-foreground truncate">{l.post.productName}</span>
                            <span className="block text-[10px] text-muted-foreground truncate">
                              {[l.post.city, l.post.country].filter(Boolean).join(', ')}
                            </span>
                          </span>
                        </button>
                        <span className="text-xs font-bold text-emerald-700 shrink-0">
                          {l.post.currency} {l.post.priceMin}{l.post.priceMin !== l.post.priceMax ? `-${l.post.priceMax}` : ''}
                        </span>
                        {l.canRemove && (
                          <button
                            data-testid="detail-link-remove"
                            onClick={() => void handleRemoveLink(l.post.id)}
                            disabled={linkBusyId === l.post.id}
                            className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-destructive shrink-0 disabled:opacity-50"
                            aria-label="Remove this link"
                            title="Remove this link"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Price history */}
              {history && history.history.length > 0 && (
                <div className="rounded-xl border border-border p-4">
                  <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-1.5">
                    <History className="w-4 h-4 text-primary" />
                    Price history
                  </h3>
                  <div className="space-y-2">
                    {history.history.map((h: PriceHistoryPoint, idx: number) => {
                      const prev = idx > 0 ? history.history[idx - 1] : null
                      const change = prev
                        ? ((h.priceMax - prev.priceMax) / prev.priceMax) * 100
                        : 0
                      return (
                        <div
                          key={h.label}
                          className="flex items-center justify-between gap-2 text-sm py-1.5 border-b border-border/40 last:border-0"
                        >
                          <span className="text-muted-foreground w-28 shrink-0">{h.label}</span>
                          <span className="font-medium text-foreground">
                            {formatPrice(h.priceMin, history.currency)} - {formatPrice(h.priceMax, history.currency)}
                          </span>
                          <span className="text-xs text-muted-foreground w-20 text-right shrink-0">
                            {h.sampleCount} report{h.sampleCount !== 1 ? 's' : ''}
                          </span>
                          {idx > 0 && (
                            <span
                              className={cn(
                                'flex items-center gap-0.5 text-xs w-16 justify-end shrink-0',
                                change > 0 ? 'text-orange-600' : change < 0 ? 'text-emerald-600' : 'text-muted-foreground'
                              )}
                            >
                              {change > 0 ? (
                                <ArrowUpRight className="w-3 h-3" />
                              ) : change < 0 ? (
                                <ArrowDownRight className="w-3 h-3" />
                              ) : (
                                <TrendingUp className="w-3 h-3" />
                              )}
                              {Math.abs(change).toFixed(1)}%
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                  <p className="text-[11px] text-muted-foreground/80 italic mt-2">
                    Based on community-reported prices over time.
                  </p>
                </div>
              )}

              {/* Author */}
              <div className="rounded-xl border border-border p-4">
                <h3 className="text-sm font-semibold text-foreground mb-3">Posted by</h3>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => onAuthorClick?.(post.author.id)}
                    className="flex items-center gap-3 flex-1 min-w-0 text-left hover:opacity-80 transition-opacity"
                  >
                  <Avatar className="w-12 h-12 border-2 border-accent">
                    <AvatarFallback className="bg-primary/15 text-primary font-semibold">
                      {post.author.name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground flex items-center gap-1.5">
                      {post.author.name}
                      {post.author.verifiedLocal && (
                        <BadgeCheck className="w-4 h-4 text-primary" />
                      )}
                      {post.author.idVerified && (
                        <BadgeCheck className="w-4 h-4 text-blue-500" aria-label="Verified with ID or passport" />
                      )}
                    </p>
                    {post.author.verifiedLocal && (
                      <p className="text-xs text-primary font-medium">Verified Local</p>
                    )}
                    {post.author.location && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {post.author.location}
                      </p>
                    )}
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                      {post.author.rating != null && post.author.rating > 0 && (
                        <span className="flex items-center gap-0.5">
                          <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                          {post.author.rating.toFixed(1)}
                        </span>
                      )}
                      <span>{post.author.localPostCount ?? 0} posts</span>
                      <span>{post.author.helpfulVotes ?? 0} helpful votes</span>
                    </div>
                  </div>
                  </button>
                  <div className="flex items-center gap-2 shrink-0">
                    {onMessage && post.author.id !== currentUserId && (
                      <Button
                        size="sm"
                        onClick={() => onMessage(post.author.id)}
                        className="bg-primary hover:bg-primary/90 text-primary-foreground shrink-0"
                      >
                        <MessageCircle className="w-3.5 h-3.5 mr-1" />
                        Message
                      </Button>
                    )}
                    <Button size="sm" variant="outline" className="border-primary text-primary shrink-0" onClick={(e) => { e.stopPropagation(); onAuthorClick?.(post.author.id) }}>
                      <Eye className="w-3.5 h-3.5 mr-1" />
                      Profile
                    </Button>
                  </div>
                </div>
              </div>

              {/* Vote row */}
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  variant={post.myVote === 'HELPFUL' ? 'default' : 'outline'}
                  onClick={() => handleVote('HELPFUL')}
                  className={cn(
                    'gap-1.5',
                    post.myVote === 'HELPFUL'
                      ? 'bg-primary hover:bg-primary/90'
                      : 'border-primary text-primary hover:bg-primary hover:text-primary-foreground'
                  )}
                >
                  <ThumbsUp className="w-4 h-4" />
                  Helpful ({post.helpfulCount})
                </Button>
                <Button
                  variant={post.myVote === 'NOT_ACCURATE' ? 'default' : 'outline'}
                  onClick={() => handleVote('NOT_ACCURATE')}
                  className={cn(
                    'gap-1.5',
                    post.myVote === 'NOT_ACCURATE'
                      ? 'bg-orange-500 hover:bg-orange-600 text-white border-orange-500'
                      : 'border-orange-300 text-orange-600 hover:bg-orange-500 hover:text-white'
                  )}
                >
                  <ThumbsDown className="w-4 h-4" />
                  Not accurate ({post.notAccurateCount})
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowReport(!showReport)}
                  className="text-muted-foreground hover:text-destructive gap-1.5 ml-auto"
                >
                  <Flag className="w-3.5 h-3.5" />
                  Report
                </Button>
              </div>

              {/* Report panel */}
              {showReport && (
                <Card className="p-4 border-destructive/30 bg-red-50/50">
                  <h4 className="text-sm font-semibold text-destructive mb-2 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4" />
                    Report this post
                  </h4>
                  <Select value={reportType} onValueChange={setReportType}>
                    <SelectTrigger className="w-full mb-2 bg-card">
                      <SelectValue placeholder="Select a reason" />
                    </SelectTrigger>
                    <SelectContent>
                      {REPORT_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Textarea
                    placeholder="Add details (optional)..."
                    value={reportNote}
                    onChange={(e) => setReportNote(e.target.value)}
                    className="bg-card min-h-[60px] resize-y text-sm"
                  />
                  <div className="mt-2 flex items-center justify-end gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setShowReport(false)}>
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleReport}
                      disabled={!reportType || submittingReport}
                      className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                    >
                      {submittingReport ? 'Submitting...' : 'Submit report'}
                    </Button>
                  </div>
                </Card>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

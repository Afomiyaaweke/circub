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
} from 'lucide-react'
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
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
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
  if (value == null) return '—'
  if (value >= 1000) return `${currency} ${value.toLocaleString()}`
  return `${currency} ${value}`
}

export function PriceDetailModal({ postId, onClose, onAuthorClick }: PriceDetailModalProps) {
  const [post, setPost] = useState<LocalPricePost | null>(null)
  const [consensus, setConsensus] = useState<LocalPriceConsensus | null>(null)
  const [history, setHistory] = useState<LocalPriceHistory | null>(null)
  const [loading, setLoading] = useState(false)
  const [showReport, setShowReport] = useState(false)
  const [reportType, setReportType] = useState<string>('')
  const [reportNote, setReportNote] = useState('')
  const [submittingReport, setSubmittingReport] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    let cancelled = false
    if (!postId) {
      return
    }

    const loadData = async () => {
      setLoading(true)
      try {
        const postDataRes = await fetch(`/api/local-prices/${postId}`)
        const postData = await postDataRes.json()
        const p = postData.post
        if (!p || cancelled) return
        setPost(p)

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
        description: 'Thanks — our team will review this post.',
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
                    <Badge variant="outline" className="text-[10px]">
                      {post.category}
                    </Badge>
                  </div>
                  <h2 className="text-xl sm:text-2xl font-bold text-foreground leading-tight">
                    {post.productName}
                  </h2>
                  <p className="mt-1.5 text-sm text-muted-foreground flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-primary" />
                    {detailedLocation}
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
                <div className="rounded-lg bg-white border border-primary/20 p-3">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                    Typical local price
                  </p>
                  <p className="text-base font-bold text-foreground mt-1">
                    {formatPrice(post.priceMin, post.currency)} – {formatPrice(post.priceMax, post.currency)}
                  </p>
                </div>
                {post.recommendedPrice != null && (
                  <div className="rounded-lg bg-white border border-emerald-300 p-3">
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
                    Be the first to confirm or challenge this price — or wait for more locals to weigh in.
                  </p>
                ) : (
                  <div>
                    <div className="flex items-baseline gap-3 flex-wrap">
                      <p className="text-2xl font-bold text-foreground">
                        {formatPrice(consensus.avgPriceMin, consensus.currency)} – {formatPrice(consensus.avgPriceMax, consensus.currency)}
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
                            className="flex items-center justify-between gap-2 text-xs bg-white border border-border/50 rounded-md px-3 py-1.5"
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
                            </div>
                            <span className="text-muted-foreground shrink-0">
                              {formatPrice(cp.priceMin, consensus.currency)} – {formatPrice(cp.priceMax, consensus.currency)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
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
                            {formatPrice(h.priceMin, history.currency)} – {formatPrice(h.priceMax, history.currency)}
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
                <button
                  onClick={() => onAuthorClick?.(post.author.id)}
                  className="flex items-center gap-3 w-full text-left hover:opacity-80 transition-opacity"
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
                  <Button size="sm" variant="outline" className="border-primary text-primary shrink-0">
                    <Eye className="w-3.5 h-3.5 mr-1" />
                    Profile
                  </Button>
                </button>
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
                    <SelectTrigger className="w-full mb-2 bg-white">
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
                    className="bg-white min-h-[60px] resize-y text-sm"
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

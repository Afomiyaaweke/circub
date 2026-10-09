'use client'

import { useEffect, useRef, useState } from 'react'
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
  MessageCircle,
  Clock,
  Navigation,
  Scale,
  Store,
  Link2,
  Plus,
  Search,
  Loader2,
} from 'lucide-react'
import { mapsDirectionsUrl, formatGps } from '@/lib/location'
import { dispatchAuthExpired } from '@/lib/auth-fetch'
import { FollowButton } from '@/components/social/follow-button'
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
import { cn, formatUnitSuffix } from '@/lib/utils'
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

// v144: a business selling the SAME product anywhere (auto-compare source,
// independent of manual links).
interface SimilarPost {
  id: string
  productName: string
  currency: string
  priceMin: number
  priceMax: number
  city?: string | null
  country?: string | null
  imageUrl?: string | null
  createdAt: string
  author?: { id: string; name?: string | null }
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
  // v144: businesses selling the SAME product anywhere (auto-compare rows).
  const [similar, setSimilar] = useState<SimilarPost[]>([])
  const [showLinkPicker, setShowLinkPicker] = useState(false)
  const [linkSearch, setLinkSearch] = useState('')
  const [linkResults, setLinkResults] = useState<any[]>([])
  const [linkSearching, setLinkSearching] = useState(false)
  const [linkBusyId, setLinkBusyId] = useState<string | null>(null)
  // v145: when the post compares NOTHING (zero manual links + zero same-name
  // businesses), the Compare block offers other businesses' posts as one-tap
  // link suggestions instead of a dead-end sentence - linking one converts
  // the row into a real compare row instantly.
  const [suggest, setSuggest] = useState<any[]>([])
  const [suggestLoading, setSuggestLoading] = useState(false)
  const suggestForRef = useRef<string | null>(null)
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
      setSimilar([])
      setShowLinkPicker(false)
      setLinkSearch('')
      setLinkResults([])
      setSuggest([])
      setSuggestLoading(false)
      suggestForRef.current = null
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

        // v144: businesses selling the SAME product - ANY city, ANY country.
        // These render as the automatic compare rows even with zero links.
        try {
          const sRes = await fetch(`/api/local-prices/${postId}/similar`, { cache: 'no-store' })
          const sData = await sRes.json()
          if (!cancelled) setSimilar(Array.isArray(sData.similar) ? sData.similar : [])
        } catch { if (!cancelled) setSimilar([]) }

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

  // v145: one-tap link suggestions - only fetched while the post compares
  // nothing (no manual links, no same-name auto rows). Nearest matches
  // first (same currency, then same country, then same category); the
  // moment any compare row exists the suggestions clear out.
  // v146 FIX: keyed on the PRIMITIVE post.id (or null) instead of the
  // [post, links, similar] object identities. On production latency the
  // setLinks/setSimilar empty-array updates land in separate renders, so an
  // identity-keyed effect cancelled its in-flight fetch and the ref guard
  // then blocked every re-run - suggestions hung on "Looking for..." forever
  // (the exact "still the same" symptom). A primitive key cannot churn: the
  // fetch runs once per post, and only a REAL change (a link/similar row
  // appearing, or an unlink) re-triggers it.
  const suggestKey =
    post && links.length === 0 && similar.length === 0 ? post.id : null
  useEffect(() => {
    if (!suggestKey || !currentUserId || currentUserId === 'guest') {
      setSuggest([])
      setSuggestLoading(false)
      suggestForRef.current = null
      return
    }
    if (suggestForRef.current === suggestKey) return // already loaded for this post
    suggestForRef.current = suggestKey
    let dead = false
    setSuggestLoading(true)
    ;(async () => {
      try {
        const res = await fetch('/api/local-prices?limit=40', { cache: 'no-store' })
        const data = await res.json()
        const posts = Array.isArray(data.posts) ? data.posts : []
        if (!dead && post) {
          // `post` here is the closure from the render whose post.id IS
          // suggestKey (the effect only runs on that key), so the self row
          // is authoritative even when the post is older than the recent-40
          // feed window.
          const self = post
          const pool = posts.filter(
            (c: any) =>
              c && self && c.id !== self.id && c.author && c.author.id !== self.author.id
          )
          const score = (c: any) =>
            (c.currency === self.currency ? 0 : 2) +
            (c.country === self.country ? 0 : 1) +
            (c.category === self.category ? 0 : 1)
          pool.sort((a: any, b: any) => score(a) - score(b))
          setSuggest(pool.slice(0, 3))
        }
      } catch {
        if (!dead) setSuggest([])
      } finally {
        if (!dead) setSuggestLoading(false)
      }
    })()
    return () => {
      dead = true
    }
  }, [suggestKey, currentUserId])

  const handleVote = async (voteType: 'HELPFUL' | 'NOT_ACCURATE') => {
    if (!post) return
    // Demo mode has zero write access: a vote attempt brings up the
    // registration form via the auth-expired event (page.tsx opens the
    // Register modal for id 'guest' / null users). No API call, no noise.
    if (!currentUserId || currentUserId === 'guest') {
      dispatchAuthExpired('guest-vote')
      return
    }
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

  // ---------------------------------------------------------------- compare
  // v141: the detail section now COMPARES the linked businesses instead of
  // just listing them. The post you opened is pinned first ("your business
  // on the front"); deltas vs this post's headline price (priceMax - the
  // same number the price-history block uses) are only computed when the
  // currencies match - a percentage across two currencies would be fiction.
  // Same-currency rows sort cheapest-first so the comparison reads at a
  // glance, and the row with the lowest price earns the Cheapest badge.
  const isOwnPost = !!currentUserId && !!post && post.author.id === currentUserId
  const selfPrice = post ? post.priceMax : 0
  const sameCurLinks = links.filter((l) => post && l.post.currency === post.currency)
  const sortedLinks = [...links].sort((a, b) => {
    const aSame = post && a.post.currency === post.currency ? 0 : 1
    const bSame = post && b.post.currency === post.currency ? 0 : 1
    if (aSame !== bSame) return aSame - bSame
    if (aSame === 0) return a.post.priceMax - b.post.priceMax
    return 0
  })
  // v144: AUTO-compare - businesses selling the SAME product ANYWHERE
  // (exact name match, case-insensitive, other authors only) from the
  // /similar endpoint - not just the same city like the consensus panel.
  // Manual links always win: a post that is linked drops out here, so no
  // business is ever counted twice.
  // v148: the VIEWER's own same-name posts sort FIRST among the
  // same-currency rows (then cheapest-first), so the user is always seen
  // on other businesses' compares - never cut by the 5-row cap.
  const autoRows = (() => {
    if (!post) return []
    const selfName = post.productName.trim().toLowerCase()
    const linkedIds = new Set(links.map((l) => l.post.id))
    const seen = new Set<string>()
    const rows = similar.filter((c) => {
      if (!c || c.id === post.id || linkedIds.has(c.id) || seen.has(c.id)) return false
      if (c.author && c.author.id === post.author.id) return false
      if (c.productName.trim().toLowerCase() !== selfName) return false
      seen.add(c.id)
      return true
    })
    const youRank = (r: SimilarPost) => (currentUserId && r.author?.id === currentUserId ? 0 : 1)
    const same = rows
      .filter((r) => r.currency === post.currency)
      .sort((a, b) => {
        const ay = youRank(a)
        const by = youRank(b)
        if (ay !== by) return ay - by
        return a.priceMax - b.priceMax
      })
    const rest = rows.filter((r) => r.currency !== post.currency)
    return [...same, ...rest].slice(0, 5)
  })()
  // v148: THIS business's own earlier posts of the same item (other
  // months). v147 excluded same-author rows everywhere, which kept a
  // business's month-by-month price history out of its own table - the
  // "by date" dimension the user drew never filled for the most common
  // case. They stay OUT of the compare rows/counts (those are "other
  // businesses"), they only feed the table grid below.
  const authorHistory = (() => {
    if (!post) return []
    const selfName = post.productName.trim().toLowerCase()
    const linkedIds = new Set(links.map((l) => l.post.id))
    const seen = new Set<string>()
    return similar
      .filter((c) => {
        if (!c || c.id === post.id || linkedIds.has(c.id) || seen.has(c.id)) return false
        if (!c.author || c.author.id !== post.author.id) return false
        if (c.productName.trim().toLowerCase() !== selfName) return false
        seen.add(c.id)
        return true
      })
      .slice(0, 5)
  })()
  // Cheapest / average now run across BOTH sources: manually linked
  // businesses plus the automatic same-product rows. This post is the
  // cheapest when it undercuts (or ties) every same-currency one; ties
  // keep the badge on the front row.
  const autoSameCurPrices = autoRows
    .filter((a) => post && a.currency === post.currency)
    .map((a) => a.priceMax)
  const allSameCurPrices = [...sameCurLinks.map((l) => l.post.priceMax), ...autoSameCurPrices]
  const cheapestSelf = allSameCurPrices.length > 0 && allSameCurPrices.every((p) => selfPrice <= p)
  const cheapestPrice =
    allSameCurPrices.length > 0 ? Math.min(selfPrice, ...allSameCurPrices) : 0
  const avgPrice =
    allSameCurPrices.length > 0
      ? (selfPrice + allSameCurPrices.reduce((s, p) => s + p, 0)) / (allSameCurPrices.length + 1)
      : 0
  const totalCompare = links.length + autoRows.length
  const deltaPct = (other: number) => (selfPrice > 0 ? ((other - selfPrice) / selfPrice) * 100 : 0)

  // ---------------------------------------------------------------- table
  // v147: the compare OUTPUT in the exact shape the user drew - "{product}
  // price by location and date ({currency})", months as rows, locations as
  // columns. One currency per table (this post's): mixing currencies inside
  // one grid would be fiction. Sources: this post + every same-name business
  // (linked + automatic). The self post always fills the first column, so
  // the table renders even when nothing compares yet - and every additional
  // business / older post of the same item grows the grid into a real
  // price history across places.
  const priceTable = (() => {
    if (!post) return null
    const cityName = (p: { city?: string | null; country?: string | null }) =>
      (p.city && p.city.trim()) || (p.country && p.country.trim()) || 'Unknown'
    const monthKeyOf = (iso: string) => {
      const t = new Date(iso)
      return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`
    }
    const monthLabelOf = (key: string) => {
      const [y, m] = key.split('-').map(Number)
      return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
    }
    type TablePt = { city: string; key: string; min: number; max: number; you: boolean }
    const pts: TablePt[] = []
    // v148: "you" = the VIEWER contributed this data point (their own post,
    // or their own earlier posts). You-columns get a chip in the header so
    // the user is literally SEEN in the table on every post.
    const youOf = (p: { authorId?: string; author?: { id?: string } | null }) =>
      !!currentUserId && (p.authorId ?? p.author?.id) === currentUserId
    const push = (p: { city?: string | null; country?: string | null; createdAt: string; priceMin: number; priceMax: number; authorId?: string; author?: { id?: string } | null }, currency: string) => {
      if (!post || currency !== post.currency) return
      const key = monthKeyOf(p.createdAt)
      if (Number.isNaN(new Date(p.createdAt).getTime()) || Number.isNaN(new Date(`${key}-01T00:00:00`).getTime())) return
      pts.push({ city: cityName(p), key, min: p.priceMin, max: p.priceMax, you: youOf(p) })
    }
    push(post, post.currency)
    links.forEach((l) => push(l.post, l.post.currency))
    autoRows.forEach((a) => push(a, a.currency))
    authorHistory.forEach((h) => push(h, h.currency))
    if (pts.length === 0) return null
    // Columns: this business FIRST, then the VIEWER's own places (so the
    // user is always seen), then the rest by most data points (name order
    // as tie-break), capped at 4 so the grid stays readable.
    const counts = new Map<string, number>()
    pts.forEach((p) => counts.set(p.city, (counts.get(p.city) || 0) + 1))
    const youCities = new Set(pts.filter((p) => p.you).map((p) => p.city))
    const selfCity = cityName(post)
    const cities = [...new Set(pts.map((p) => p.city))]
      .sort((x, y) => {
        if (x === selfCity) return -1
        if (y === selfCity) return 1
        const xy = youCities.has(x) ? 0 : 1
        const yy = youCities.has(y) ? 0 : 1
        if (xy !== yy) return xy - yy
        const dc = (counts.get(y) || 0) - (counts.get(x) || 0)
        return dc !== 0 ? dc : x.localeCompare(y)
      })
      .slice(0, 4)
    // Rows: months oldest -> newest like a history table, most recent 6.
    const monthRows = [...new Set(pts.map((p) => p.key))]
      .sort()
      .slice(-6)
      .map((key) => ({ key, label: monthLabelOf(key) }))
    // One cell per month x location; several same-place same-month posts
    // merge into the spanning range (min of mins - max of maxes).
    const cellOf = (key: string, city: string) => {
      const inCell = pts.filter((p) => p.key === key && p.city === city)
      if (inCell.length === 0) return null
      return {
        min: Math.min(...inCell.map((p) => p.min)),
        max: Math.max(...inCell.map((p) => p.max)),
      }
    }
    return { cities, monthRows, cellOf, selfCity, youCities }
  })()

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
      <DialogContent showCloseButton={false} className="max-w-3xl max-h-[92vh] overflow-y-auto scrollbar-thin p-0 gap-0">
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
                  className="p-2 -m-1 rounded-full bg-card/80 hover:bg-card text-muted-foreground shrink-0"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Price block - v117: typical + fair price (tourist price removed) */}
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-lg bg-card border border-primary/20 p-3">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                    Typical local price
                  </p>
                  <p className="text-base font-bold text-foreground mt-1">
                    {formatPrice(post.priceMin, post.currency)} - {formatPrice(post.priceMax, post.currency)}{formatUnitSuffix(post.unit)}
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
              </div>
            </div>

            {/* Body */}
            <div className="p-5 sm:p-6 space-y-5">
              {/* Compare businesses - v141 upgrade of the v99 linked-prices
                  list: the post you opened is pinned FIRST ("your business
                  on the front"), same-currency rows sort cheapest-first and
                  carry a +% / -% delta vs this price, the lowest row gets
                  the Cheapest badge, and tapping a business opens its post.
                  Every link shows on BOTH posts. v143: businesses selling
                  the SAME product also compare automatically ("Other
                  businesses on circub") - no manual link needed, and manual
                  links never double-count a business. */}
              <div className="rounded-xl border border-border p-4" data-testid="detail-links-section">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                    <Scale className="w-4 h-4 text-primary" />
                    Compare
                    <span
                      data-testid="detail-links-count"
                      className="text-[10px] font-semibold text-primary bg-primary/10 rounded-full px-1.5 py-0.5"
                    >
                      {totalCompare}
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
                      Link a business
                    </Button>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground mb-2.5">
                  Same item at other businesses - this one is first. Tap a business to open its price post.
                </p>

                {/* v147: the compare output as a price table - months as
                    rows, locations as columns. Always present (this post
                    fills the first column), grows as other businesses post
                    the same item in other places or earlier months. */}
                {priceTable && (
                  <div className="mb-3 rounded-lg border border-border bg-card overflow-hidden" data-testid="detail-price-table">
                    <p className="text-xs font-semibold text-foreground px-3 pt-2.5" data-testid="detail-price-table-title">
                      {`${post.productName} price by location and date (${post.currency})`}
                    </p>
                    <p className="text-[10px] text-muted-foreground px-3 pb-1.5">
                      {`Price (${post.currency}) by Date - the same item at every business posting it on circub`}
                    </p>
                    <div className="overflow-x-auto scrollbar-thin">
                      <table className="w-full text-xs border-collapse">
                        <thead>
                          <tr className="border-y border-border bg-accent/40">
                            <th className="text-left font-medium text-muted-foreground px-3 py-1.5 whitespace-nowrap">Date</th>
                            {priceTable.cities.map((c) => (
                              <th
                                key={c}
                                data-testid="detail-price-table-city"
                                className={cn(
                                  'text-right font-semibold px-3 py-1.5 whitespace-nowrap',
                                  c === priceTable.selfCity ? 'text-primary' : 'text-foreground'
                                )}
                              >
                                {c}
                                {priceTable.youCities.has(c) && (
                                  <span
                                    data-testid="detail-price-table-you"
                                    className="ml-1 align-middle text-[9px] font-bold uppercase tracking-wide text-primary bg-primary/10 rounded-full px-1 py-px"
                                  >
                                    You
                                  </span>
                                )}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {priceTable.monthRows.map((row) => {
                            const cells = priceTable.cities.map((c) => priceTable.cellOf(row.key, c))
                            const filled = cells.filter((v) => v !== null) as Array<{ min: number; max: number }>
                            const rowMin = filled.length > 0 ? Math.min(...filled.map((v) => v.max)) : Infinity
                            return (
                              <tr key={row.key} className="border-b border-border/40 last:border-0">
                                <td data-testid="detail-price-table-month" className="px-3 py-1.5 text-muted-foreground whitespace-nowrap">
                                  {row.label}
                                </td>
                                {cells.map((v, i) =>
                                  v === null ? (
                                    <td key={priceTable.cities[i]} className="px-3 py-1.5 text-right text-muted-foreground/40">-</td>
                                  ) : (
                                    <td
                                      key={priceTable.cities[i]}
                                      data-testid="detail-price-table-cell"
                                      data-cheapest={filled.length > 1 && v.max === rowMin ? 'true' : undefined}
                                      className={cn(
                                        'px-3 py-1.5 text-right whitespace-nowrap',
                                        filled.length > 1 && v.max === rowMin ? 'text-emerald-700 font-semibold' : 'text-foreground font-medium'
                                      )}
                                    >
                                      {v.min === v.max ? `${v.min}` : `${v.min}-${v.max}`}
                                    </td>
                                  )
                                )}
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

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

                {links.length === 0 && autoRows.length === 0 ? (
                  <div data-testid="detail-links-empty" className="space-y-2">
                    {currentUserId ? (
                      <>
                        <p className="text-xs text-muted-foreground">
                          {`No other business sells "${post.productName}" here yet. Link one and the prices compare instantly:`}
                        </p>
                        {suggestLoading && (
                          <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                            <Loader2 className="w-3 h-3 animate-spin" /> Looking for businesses to link...
                          </p>
                        )}
                        {!suggestLoading && suggest.length === 0 && (
                          <p className="text-[11px] text-muted-foreground">
                            Nothing to link yet - when another business posts this item it compares here automatically.
                          </p>
                        )}
                        {suggest.map((c) => (
                          <div
                            key={c.id}
                            data-testid="detail-link-suggest"
                            className="flex items-center justify-between gap-2 bg-accent/30 border border-dashed border-primary/40 rounded-md px-2.5 py-1.5"
                          >
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-foreground truncate">{c.productName}</p>
                              <p className="text-[10px] text-muted-foreground truncate">
                                {c.author?.name ? `${c.author.name} · ` : ''}
                                {[c.city, c.country].filter(Boolean).join(', ')} · {c.currency} {c.priceMin}
                                {c.priceMin !== c.priceMax ? `-${c.priceMax}` : ''}
                              </p>
                            </div>
                            <Button
                              size="sm"
                              data-testid="detail-link-suggest-add"
                              disabled={linkBusyId === c.id}
                              onClick={() => void handleAddLink(c.id)}
                              className="h-6 px-2 text-[11px] bg-primary hover:bg-primary/90 text-primary-foreground shrink-0 gap-1"
                            >
                              {linkBusyId === c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Link2 className="w-3 h-3" />}
                              Link
                            </Button>
                          </div>
                        ))}
                      </>
                    ) : (
                      <p className="text-xs text-muted-foreground">No linked businesses to compare yet.</p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {/* the post you opened - pinned in FRONT of every linked
                        business, highlighted, and wearing the Cheapest badge
                        when it undercuts (or ties) them all */}
                    <div
                      data-testid="detail-compare-self"
                      className={cn(
                        'flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5',
                        cheapestSelf ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-primary/40 bg-primary/5'
                      )}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {post?.imageUrl && (
                          <img src={post.imageUrl} alt="" className="w-7 h-7 rounded object-cover border border-border shrink-0" />
                        )}
                        <span className="min-w-0">
                          <span className="block text-xs font-semibold text-foreground truncate">
                            {isOwnPost ? 'Your business' : 'This business'}
                          </span>
                          <span className="block text-[10px] text-muted-foreground truncate">
                            {[post?.city, post?.country].filter(Boolean).join(', ')}
                          </span>
                        </span>
                      </div>
                      {cheapestSelf && (
                        <span
                          data-testid="detail-compare-cheapest"
                          className="text-[9px] font-bold uppercase tracking-wide text-emerald-700 bg-emerald-100 rounded-full px-1.5 py-0.5 shrink-0"
                        >
                          Cheapest
                        </span>
                      )}
                      <span className="text-xs font-bold text-emerald-700 shrink-0">
                        {post?.currency} {post?.priceMin}
                        {post && post.priceMin !== post.priceMax ? `-${post.priceMax}` : ''}
                      </span>
                    </div>
                    {sortedLinks.map((l) => {
                      const sameCur = post && l.post.currency === post.currency
                      const delta = sameCur ? deltaPct(l.post.priceMax) : 0
                      return (
                        <div
                          key={l.linkId}
                          data-testid="detail-link-row"
                          className="flex items-center justify-between gap-2 bg-card border border-border rounded-md px-2.5 py-1.5"
                        >
                          <button
                            className="flex items-center gap-2 min-w-0 text-left flex-1 hover:opacity-80"
                            onClick={() => onOpenPost?.(l.post.id)}
                            title="Open this business's price post"
                            data-testid="detail-link-open"
                          >
                            {l.post.imageUrl && (
                              <img src={l.post.imageUrl} alt="" className="w-7 h-7 rounded object-cover border border-border shrink-0" />
                            )}
                            <span className="min-w-0">
                              <span className="block text-xs font-medium text-foreground truncate">{l.post.productName}</span>
                              <span className="block text-[10px] text-muted-foreground truncate">
                                {l.post.author?.name ? `${l.post.author.name} · ` : ''}
                                {[l.post.city, l.post.country].filter(Boolean).join(', ')}
                              </span>
                            </span>
                          </button>
                          {sameCur && selfPrice > 0 && (
                            <span
                              data-testid="detail-compare-delta"
                              className={cn(
                                'text-[10px] font-semibold shrink-0 text-right w-14',
                                delta > 0 ? 'text-orange-600' : delta < 0 ? 'text-emerald-600' : 'text-muted-foreground'
                              )}
                            >
                              {delta > 0 ? `+${delta.toFixed(1)}%` : delta < 0 ? `${delta.toFixed(1)}%` : 'same'}
                            </span>
                          )}
                          {!sameCur && (
                            <span
                              data-testid="detail-compare-currency"
                              className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground bg-accent rounded-full px-1.5 py-0.5 shrink-0"
                            >
                              {l.post.currency}
                            </span>
                          )}
                          {sameCur && !cheapestSelf && l.post.priceMax === cheapestPrice && (
                            <span
                              data-testid="detail-compare-cheapest"
                              className="text-[9px] font-bold uppercase tracking-wide text-emerald-700 bg-emerald-100 rounded-full px-1.5 py-0.5 shrink-0"
                            >
                              Cheapest
                            </span>
                          )}
                          <span className="text-xs font-bold text-emerald-700 shrink-0">
                            {l.post.currency} {l.post.priceMin}
                            {l.post.priceMin !== l.post.priceMax ? `-${l.post.priceMax}` : ''}
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
                      )
                    })}
                    {/* v143: businesses selling the same product compare
                        automatically - dashed rows, no link needed. */}
                    {autoRows.length > 0 && (
                      <div className="pt-1.5">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground pb-1">
                          Other businesses on circub
                        </p>
                        {autoRows.map((a) => {
                          const sameCur = post && a.currency === post.currency
                          const delta = sameCur ? deltaPct(a.priceMax) : 0
                          return (
                            <div
                              key={a.id}
                              data-testid="detail-compare-auto"
                              className="flex items-center justify-between gap-2 border border-dashed border-border bg-accent/20 rounded-md px-2.5 py-1.5"
                            >
                              <button
                                className="flex items-center gap-2 min-w-0 text-left flex-1 hover:opacity-80"
                                onClick={() => onOpenPost?.(a.id)}
                                title="Open this business's price post"
                                data-testid="detail-auto-open"
                              >
                                {a.imageUrl && (
                                  <img src={a.imageUrl} alt="" className="w-7 h-7 rounded object-cover border border-border shrink-0" />
                                )}
                                <span className="min-w-0">
                                  <span className="block text-xs font-medium text-foreground truncate items-center gap-1">
                                    {currentUserId && a.author?.id === currentUserId && (
                                      <span
                                        data-testid="detail-compare-you"
                                        className="mr-1 inline-block align-middle text-[9px] font-bold uppercase tracking-wide text-primary bg-primary/10 rounded-full px-1 py-px"
                                      >
                                        You
                                      </span>
                                    )}
                                    {a.productName}
                                  </span>
                                  <span className="block text-[10px] text-muted-foreground truncate">
                                    {a.author?.name && a.author.id !== currentUserId ? `${a.author.name} · ` : ''}
                                    {[a.city, a.country].filter(Boolean).join(', ')}
                                  </span>
                                </span>
                              </button>
                              {sameCur && selfPrice > 0 && (
                                <span
                                  data-testid="detail-compare-delta"
                                  className={cn(
                                    'text-[10px] font-semibold shrink-0 text-right w-14',
                                    delta > 0 ? 'text-orange-600' : delta < 0 ? 'text-emerald-600' : 'text-muted-foreground'
                                  )}
                                >
                                  {delta > 0 ? `+${delta.toFixed(1)}%` : delta < 0 ? `${delta.toFixed(1)}%` : 'same'}
                                </span>
                              )}
                              {!sameCur && (
                                <span
                                  data-testid="detail-compare-currency"
                                  className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground bg-accent rounded-full px-1.5 py-0.5 shrink-0"
                                >
                                  {a.currency}
                                </span>
                              )}
                              {sameCur && !cheapestSelf && a.priceMax === cheapestPrice && (
                                <span
                                  data-testid="detail-compare-cheapest"
                                  className="text-[9px] font-bold uppercase tracking-wide text-emerald-700 bg-emerald-100 rounded-full px-1.5 py-0.5 shrink-0"
                                >
                                  Cheapest
                                </span>
                              )}
                              <span className="text-xs font-bold text-emerald-700 shrink-0">
                                {a.currency} {a.priceMin}
                                {a.priceMin !== a.priceMax ? `-${a.priceMax}` : ''}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    )}
                    {/* the count the user asked for, spelled out in words */}
                    <p data-testid="detail-compare-summary" className="text-[11px] text-muted-foreground pt-1">
                      {`Comparing ${totalCompare} ${totalCompare === 1 ? 'business' : 'businesses'}${links.length > 0 ? ` (${links.length} linked)` : ''}`}
                      {allSameCurPrices.length > 0
                        ? ` · cheapest ${formatPrice(cheapestPrice, post.currency)} · average ${formatPrice(Math.round(avgPrice), post.currency)}`
                        : ''}
                    </p>
                  </div>
                )}
              </div>

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
                        <Badge className="bg-orange-500 text-white">🟠 Above local average</Badge>
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
                    type="button"
                    onClick={() => onAuthorClick?.(post.author.id)}
                    title="View profile"
                    className="flex items-center gap-3 flex-1 min-w-0 text-left cursor-pointer hover:opacity-80 transition-opacity"
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
                    <FollowButton targetUserId={post.author.id} currentUserId={currentUserId} />
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

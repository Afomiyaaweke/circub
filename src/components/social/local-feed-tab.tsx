'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { MapPin, Plus, Search, Sparkles, PackageOpen, Camera, X, Loader2, BadgeCheck, BarChart3, PenLine } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { LocalPriceCard } from './local-price-card'
import { PriceStoriesStrip } from './price-stories-strip'
import { CreatePricePostModal } from './create-price-post-modal'
import { CATEGORIES, ALL_CATEGORIES, categoryFilterOptions, matchCategoryLoose } from '@/lib/categories'
import { EditPricePostModal } from './edit-price-post-modal'
import { PriceDetailModal } from './price-detail-modal'
import { LocalProfileModal } from './local-profile-modal'
import { MarketGraphPanel } from '@/components/scanner/market-graph'
import { CompassPriceTools } from './compass-price-tools'
import { useToast } from '@/hooks/use-toast'
import { useLanguage } from '@/lib/i18n'
import { authFetch } from '@/lib/auth-fetch'
import { resolveCurrentLocation, type ResolvedLocation } from '@/lib/location'
import { compressImage } from '@/lib/image-compress'
import type { CreatePricePostPrefill } from './create-price-post-modal'
import type { LocalPricePost } from '@/lib/types'

// Camera scan + camera search are LIVE - clicking either entry point opens the
// camera/search flow (AI identifies the item, then compares the AI price
// estimate against real local price posts). Flip to true to hold them behind
// a "Soon" badge again (e.g. while the AI backend is unavailable).
const SCAN_COMING_SOON = false

// v147 step-by-step feed loading - how many price posts one request fetches.
// The reader scrolls, the bottom sentinel asks for the next 10; the server
// never answers a take-100 query from the feed again.
const FEED_STEP = 10

interface LocalFeedTabProps {
  onRefreshUser: () => void
  onMessage?: (userId: string) => void
  // Called when a guest tries to open the price composer - bubbles up to
  // page.tsx so the Register modal opens. Guests can browse everything but
  // must NOT be able to post (Task 76).
  onRequireSignUp?: () => void
}

export function LocalFeedTab({ onRefreshUser, onMessage, onRequireSignUp }: LocalFeedTabProps) {
  const { t } = useLanguage()
  const [posts, setPosts] = useState<LocalPricePost[]>([])
  const [loading, setLoading] = useState(true)
  // v147 step-by-step loading: the feed fetches a SMALL window (10 posts) per
  // request and appends the next step only when the reader reaches the bottom
  // - the server never answers one giant take-100 query again, the first
  // paint carries a fraction of the payload, and every extra step costs the
  // server (and the phone) one tiny 10-row read.
  const [serverHasMore, setServerHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const postsCountRef = useRef(0)
  const loadingMoreRef = useRef(false)
  const postsSentinelRef = useRef<HTMLDivElement | null>(null)
  const [search, setSearch] = useState('')
  // The search box accepts "item, location" (comma-separated): the part
  // before the comma filters the item, the part after it resolves to a
  // city or country filter when it matches a known feed location.
  const [searchRaw, setSearchRaw] = useState('')
  const [searchLocHint, setSearchLocHint] = useState<string | null>(null)
  const searchLocAppliedRef = useRef('')
  const [country, setCountry] = useState('All countries')
  const [city, setCity] = useState('All cities')
  const [category, setCategory] = useState(ALL_CATEGORIES)
  const [modalOpen, setModalOpen] = useState(false)
  const [marketOpen, setMarketOpen] = useState(false)
  const [detailPostId, setDetailPostId] = useState<string | null>(null)
  const [profileUserId, setProfileUserId] = useState<string | null>(null)
  const [editPost, setEditPost] = useState<LocalPricePost | null>(null)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  // Tracks whether the /api/auth/me probe finished - distinguishes a real
  // guest (probe done, no user id) from a logged-in user during the first
  // paint, so the composer gate never misfires on slow connections.
  const [meLoaded, setMeLoaded] = useState(false)
  const [searchImage, setSearchImage] = useState<string | null>(null)
  const [searchingByImage, setSearchingByImage] = useState(false)
  // User location for the camera-search price comparison - resolved once
  // (device GPS with IP fallback) and reused for every subsequent search.
  const [userLocation, setUserLocation] = useState<ResolvedLocation | null>(null)
  const locationPromiseRef = useRef<Promise<ResolvedLocation | null> | null>(null)
  // Custom compare places for the camera-search results panel (badges +
  // per-place summary lines). The pickers that filled this list used to sit
  // in the market graph's compare section - removed in v97 - so it stays
  // empty unless a future flow fills it again.
  const [customLocations, setCustomLocations] = useState<Array<{ city: string | null; country: string | null; countryCode?: string | null; place: string }>>([])
  // When set, the results panel's match cards are filtered to one location
  // group from the "Compare by location" breakdown (key: city|country|currency).
  const [locFilter, setLocFilter] = useState<string | null>(null)
  // "Post this product" - pre-fills the create-post modal from the current
  // camera-search results (identified name, category, price range, photo).
  const [postPrefill, setPostPrefill] = useState<CreatePricePostPrefill | null>(null)
  const [prefillingPost, setPrefillingPost] = useState(false)
  // The original captured File behind searchResults.imageUrl - kept so the
  // photo can be uploaded (compressed) when the user chooses to post it.
  const searchFileRef = useRef<File | null>(null)
  // AI search results - shown in a panel above the feed after a camera
  // capture or image upload. Contains the AI identification + price
  // estimate + matching local posts ranked by the user's location.
  const [searchResults, setSearchResults] = useState<{
    aiDescription: string
    aiPriceEstimate: { min: number; max: number; currency: string } | null
    localMatches: Array<any & { locMatch?: 'city' | 'country' | 'world' }>
    keywords: string
    imageUrl: string
    locationCompare: { scope: 'city' | 'country'; place: string; count: number; min: number; max: number; currency: string } | null
    location: { city?: string | null; country?: string | null } | null
  } | null>(null)
  const [filterValues, setFilterValues] = useState<{ countries: string[]; cities: string[]; categories: string[] }>({ countries: [], cities: [], categories: [] })
  const { toast } = useToast()

  useEffect(() => {
    fetch('/api/auth/me').then((r) => (r.ok ? r.json() : null)).then((d) => { if (d?.id) setCurrentUserId(d.id) }).catch(() => {}).finally(() => setMeLoaded(true))
  }, [])

  useEffect(() => {
    fetch('/api/local-prices/filters').then((r) => r.json()).then((data) => setFilterValues({ countries: data.countries || [], cities: data.cities || [], categories: data.categories || [] })).catch(() => {})
  }, [])

  // Background refreshes keep the current list mounted: replacing the whole
  // feed with skeletons the moment a post publishes made the app flash and
  // snapped the scroll back to the top (the "glitch on new post").
  // Skeletons only for the first load, or when the previous load came back
  // empty - after that the old cards stay on screen until the new data lands.
  const hasPostsRef = useRef(false)
  const fetchPosts = useCallback(async (opts?: { fresh?: boolean }) => {
    if (!hasPostsRef.current) setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (country && country !== 'All countries') params.set('country', country)
      if (city && city !== 'All cities') params.set('city', city)
      if (category && category !== ALL_CATEGORIES) params.set('category', category)
      // Posts default to most recent (API default) - no sort dropdown in the UI.
      // cache:'no-store' keeps the BROWSER from caching, but the API also sets
      // a CDN edge cache (s-maxage=30 + stale-while-revalidate=60) - a normal
      // refetch after publishing could serve the pre-publish list for up to
      // ~90s, so the fresh post seemed to vanish. Mutating refetches pass
      // fresh:true which adds a unique query variant that misses the edge and
      // hits the origin; ordinary filter loads keep using the edge cache.
      if (opts?.fresh) params.set('_', String(Date.now()))
      // Step-by-step: an ordinary (filter) load fetches ONE window of posts;
      // a fresh refresh (publish / link events) re-fetches everything
      // currently on screen so no visible card can ever disappear.
      params.set('limit', String(opts?.fresh ? Math.max(FEED_STEP, postsCountRef.current) : FEED_STEP))
      params.set('offset', '0')
      const res = await fetch(`/api/local-prices?${params.toString()}`, { cache: 'no-store' })
      const data = await res.json()
      const next = data.posts || []
      setPosts(next)
      setServerHasMore(!!data.hasMore)
      hasPostsRef.current = next.length > 0
    } catch { setPosts([]); hasPostsRef.current = false; setServerHasMore(false) } finally { setLoading(false) }
  }, [search, country, city, category])

  useEffect(() => {
    const t = setTimeout(fetchPosts, 250)
    return () => clearTimeout(t)
  }, [fetchPosts])

  // The next step: fetch the following FEED_STEP posts with the CURRENT
  // filters and append them. De-duped by id so a fresh refresh racing in
  // between cannot double a row; a failed step keeps the current list.
  const loadMorePosts = useCallback(async () => {
    if (loadingMoreRef.current) return
    loadingMoreRef.current = true
    setLoadingMore(true)
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (country && country !== 'All countries') params.set('country', country)
      if (city && city !== 'All cities') params.set('city', city)
      if (category && category !== ALL_CATEGORIES) params.set('category', category)
      params.set('limit', String(FEED_STEP))
      params.set('offset', String(postsCountRef.current))
      const res = await fetch(`/api/local-prices?${params.toString()}`, { cache: 'no-store' })
      const data = await res.json()
      const next: LocalPricePost[] = data.posts || []
      setPosts((prev) => {
        const seen = new Set(prev.map((p) => p.id))
        return [...prev, ...next.filter((p) => !seen.has(p.id))]
      })
      setServerHasMore(!!data.hasMore)
    } catch { /* keep the current list on a failed step */ } finally {
      loadingMoreRef.current = false
      setLoadingMore(false)
    }
  }, [search, country, city, category])

  // Single source of truth for the offset of the next step.
  useEffect(() => {
    postsCountRef.current = posts.length
  }, [posts])

  // Bottom sentinel - loads the next step when it scrolls into view. The
  // observer re-creates whenever a gate flips, so a sentinel still on screen
  // immediately chains the following step until the viewport is full.
  useEffect(() => {
    const el = postsSentinelRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    if (!serverHasMore || loading) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loadingMoreRef.current) void loadMorePosts()
      },
      { rootMargin: '600px 0px' }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [serverHasMore, loading, loadMorePosts])

  // Link management inside the detail modal dispatches 'circub:feed-changed'
  // - the feed refetches so the "N links" chip on every card stays true
  // without a manual reload.
  useEffect(() => {
    const onFeedChanged = () => fetchPosts({ fresh: true })
    window.addEventListener('circub:feed-changed', onFeedChanged)
    return () => window.removeEventListener('circub:feed-changed', onFeedChanged)
  }, [fetchPosts])

  // v148: "be seen on each post" - group the ALREADY-LOADED posts by exact
  // product name (trim + lowercase, same rule the detail modal uses) so
  // every card can show a one-line "price by location" compare strip with
  // the viewer's own posts labeled "You". Zero extra requests: it reuses
  // the posts the step-by-step feed already fetched, so the server load
  // stays exactly what v147 made it (one small window per step).
  const postsByName = useMemo(() => {
    const m = new Map<string, LocalPricePost[]>()
    for (const p of posts) {
      const k = p.productName.trim().toLowerCase()
      if (!k) continue
      const arr = m.get(k)
      if (arr) arr.push(p)
      else m.set(k, [p])
    }
    return m
  }, [posts])

  // Compare entries for ONE card: this post first ("(You)" when it is the
  // viewer's), then the viewer's own other same-name same-currency posts
  // ("You"), then the rest cheapest-first. Capped at 3 entries; the card
  // gets the overflow count separately. Empty when nothing compares.
  const cardCompare = useCallback(
    (self: LocalPricePost): { entries: Array<{ id: string; place: string; min: number; max: number; you: boolean; self: boolean }>; extra: number } | null => {
      const group = postsByName.get(self.productName.trim().toLowerCase())
      if (!group || group.length < 2) return null
      const placeOf = (p: LocalPricePost) => (p.city && p.city.trim()) || (p.country && p.country.trim()) || 'Unknown'
      const isYou = (p: LocalPricePost) => !!currentUserId && p.authorId === currentUserId
      const others = group.filter((p) => p.id !== self.id && p.currency === self.currency)
      if (others.length === 0) return null
      const youOthers = others.filter(isYou)
      const rest = others.filter((p) => !isYou(p)).sort((a, b) => a.priceMax - b.priceMax)
      const ordered = [...youOthers, ...rest]
      return {
        entries: [
          { id: self.id, place: placeOf(self), min: self.priceMin, max: self.priceMax, you: isYou(self), self: true },
          ...ordered.slice(0, 2).map((p) => ({ id: p.id, place: placeOf(p), min: p.priceMin, max: p.priceMax, you: isYou(p), self: false })),
        ],
        extra: Math.max(0, ordered.length - 2),
      }
    },
    [postsByName, currentUserId]
  )

  // "item, location" comma parsing - the location part after the comma
  // resolves against the feed's known cities/countries (whole text first,
  // then each comma fragment last-first, so "Addis Ababa, Ethiopia" hits
  // the city). Resolved -> the matching select updates and the other one
  // resets (they must never AND into zero results). Unresolved -> honest
  // hint + back to all locations. The applied-ref keeps the parser from
  // fighting manual edits of the selects.
  const searchCommaIdx = searchRaw.indexOf(',')
  const searchLocPart = searchCommaIdx === -1 ? '' : searchRaw.slice(searchCommaIdx + 1).trim()
  useEffect(() => {
    const loc = searchLocPart
    if (!loc) {
      searchLocAppliedRef.current = ''
      setSearchLocHint(null)
      return
    }
    if (searchLocAppliedRef.current === loc) return
    searchLocAppliedRef.current = loc
    const cands = [loc, ...loc.split(',').map((s) => s.trim()).filter(Boolean).reverse()]
    const eq = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()
    const cityHit = cands.find((c) => filterValues.cities.some((x) => eq(x, c)))
    const countryHit = cands.find((c) => filterValues.countries.some((x) => eq(x, c)))
    if (cityHit) {
      setCity(cityHit)
      setCountry('All countries')
      setSearchLocHint(null)
    } else if (countryHit) {
      setCountry(countryHit)
      setCity('All cities')
      setSearchLocHint(null)
    } else {
      setCity('All cities')
      setCountry('All countries')
      setSearchLocHint(loc)
    }
  }, [searchLocPart, filterValues])

  // On publish: refetch WITHOUT the skeleton flash, then glide up to the top
  // so the fresh post is the first thing on screen instead of the user
  // wondering where it went.
  const handleCreated = async () => { await fetchPosts({ fresh: true }); onRefreshUser(); try { document.scrollingElement?.scrollTo({ top: 0, behavior: 'smooth' }) } catch { document.scrollingElement?.scrollTo(0, 0) } }

  // Guests can browse everything but cannot post: opening the price
  // composer as a guest bounces to the Register modal instead. Logged-in
  // users get the composer exactly as before.
  const isGuest = meLoaded && !currentUserId
  const openComposer = (prefill: CreatePricePostPrefill | null) => {
    if (isGuest) {
      if (onRequireSignUp) onRequireSignUp()
      toast({ title: 'Sign up to post', description: 'Create a free account to post local prices. It takes 10 seconds.' })
      return
    }
    setPostPrefill(prefill)
    setModalOpen(true)
  }

  const handleEditPost = (post: LocalPricePost) => {
    setEditPost(post)
    setEditModalOpen(true)
  }

  const handleDelete = async (postId: string) => {
    if (!confirm('Delete this price post? This cannot be undone.')) return
    try {
      const res = await fetch(`/api/local-prices/${postId}`, { method: 'DELETE' })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Failed to delete') }
      setPosts((prev) => prev.filter((p) => p.id !== postId))
      toast({ title: 'Post deleted' })
      onRefreshUser()
    } catch (e) {
      toast({ title: 'Delete failed', description: (e as Error).message, variant: 'destructive' })
    }
  }

  // The location a search should compare prices in: the user's explicit
  // "Compare by location" pick wins over the auto-detected location.
  const locationForSearch = async (): Promise<{ city: string | null; country: string | null; countryCode: string | null } | null> => {
    if (customLocations.length) {
      const l = customLocations[0]
      return { city: l.city, country: l.country, countryCode: l.countryCode ?? null }
    }
    // Wait for the auto-detected location briefly (kickLocation starts it on
    // the click; IP fallback resolves in ~1-2s, GPS may need longer - don't
    // block the search on it).
    let loc = userLocation
    if (!loc && locationPromiseRef.current) {
      loc = await Promise.race([
        locationPromiseRef.current,
        new Promise<null>((r) => setTimeout(() => r(null), 4000)),
      ])
      if (loc) setUserLocation(loc)
    }
    return loc ? { city: loc.city, country: loc.country, countryCode: loc.countryCode } : null
  }

  const handleImageSearch = async (file: File) => {
    setSearchingByImage(true)
    try {
      const loc = await locationForSearch()
      const formData = new FormData()
      formData.append('file', file)
      if (loc) formData.append('location', JSON.stringify({ city: loc.city, country: loc.country, countryCode: loc.countryCode }))
      searchFileRef.current = file
      const vlmRes = await fetch('/api/visual-search', { method: 'POST', body: formData })
      if (!vlmRes.ok) { const e = await vlmRes.json(); throw new Error(e.error || 'Visual search failed') }
      const vlmData = await vlmRes.json()
      const keywords: string = (vlmData.keywords || '').trim()
      const imageUrl = URL.createObjectURL(file)
      // The AI chain answered but found no purchasable product (or every
      // provider is down AND the filename has no hints) - say so clearly
      // instead of silently filling the search box with garbage.
      if (vlmData.identified === false && !keywords) {
        setSearchImage(imageUrl)
        setSearchResults({
          aiDescription: vlmData.aiDescription || 'Could not identify a product in this image.',
          aiPriceEstimate: null,
          localMatches: [],
          keywords: '',
          imageUrl,
          locationCompare: null,
          location: vlmData.location || null,
        })
        toast({ title: 'No product identified', description: 'Try moving closer to the item or using a clearer photo.', variant: 'destructive' })
        return
      }
      // searchTerm is chosen server-side as the candidate that matches the
      // most local posts - far better feed results than the raw first keyword.
      const firstKeyword: string = (vlmData.searchTerm || keywords.split(',')[0] || '').trim()
      setSearch(firstKeyword)
      setSearchRaw(firstKeyword)
      setLocFilter(null)
      setSearchImage(imageUrl)
      // Store the full results so we can show the AI description + price
      // estimate + matching local posts in a panel above the feed.
      setSearchResults({
        aiDescription: vlmData.aiDescription || '',
        aiPriceEstimate: vlmData.aiPriceEstimate || null,
        localMatches: Array.isArray(vlmData.localMatches) ? vlmData.localMatches : [],
        keywords,
        imageUrl,
        locationCompare: vlmData.locationCompare || null,
        location: vlmData.location || null,
      })
      const localCount = Array.isArray(vlmData.localMatches) ? vlmData.localMatches.length : 0
      const nearCount = (vlmData.locationCompare?.count as number) || 0
      toast({
        title: 'AI identified: ' + firstKeyword,
        description: vlmData.aiUsed
          ? `${vlmData.aiDescription || ''}${localCount > 0 ? ` · ${nearCount > 0 ? `${nearCount} near ${vlmData.locationCompare.place}` : `${localCount} local price${localCount !== 1 ? 's' : ''} found`}` : ' · no local prices yet'}`
          : 'AI analysis unavailable, using filename',
      })
    } catch (e) {
      toast({ title: 'Visual search failed', description: (e as Error).message, variant: 'destructive' })
    } finally { setSearchingByImage(false) }
  }

  // Kick off location resolution on the FIRST user gesture (camera-search
  // click) - browsers only allow the geolocation prompt from a gesture, and
  // by the time the user has picked/captured a photo it has usually resolved.
  const kickLocation = () => {
    if (!locationPromiseRef.current) {
      locationPromiseRef.current = resolveCurrentLocation()
        .then((loc) => { if (loc) setUserLocation(loc); return loc })
        .catch(() => null)
    }
    return locationPromiseRef.current
  }

  const handleClearSearch = () => {
    setSearch('')
    setSearchRaw('')
    setSearchLocHint(null)
    searchLocAppliedRef.current = ''
    setSearchImage(null)
    setSearchResults(null)
    setLocFilter(null)
    searchFileRef.current = null
  }

  // Market graph (shared by the desktop labeled button and the compact
  // phone icon inside the search bar) - v97: the graph's content IS the
  // Know-the-price-before-you-go compass card; everything else that used
  // to sit on it is gone.
  const openMarket = () => {
    setMarketOpen(true)
    kickLocation()
  }

  // "Post this product" - turn the camera-search result into a price post.
  // Pre-fills the create modal with the identified product (name, category,
  // the compared price range, the searched location) and uploads the captured
  // photo as the post image. The new post then feeds back into the same
  // location comparison for everyone else.
  // Pass a `group` (a place card from the "Compare by location" breakdown)
  // to add the product IN THAT PLACE with that place's price range.
  const handlePostProduct = async (group?: { key: string; place: string; currency: string; min: number; max: number }) => {
    const r = searchResults
    if (!r) return
    let imageUrl = ''
    if (searchFileRef.current) {
      setPrefillingPost(true)
      try {
        const compressed = await compressImage(searchFileRef.current)
        const fd = new FormData()
        fd.append('file', compressed)
        const res = await fetch('/api/upload', { method: 'POST', body: fd })
        if (res.ok) imageUrl = (await res.json()).url || ''
      } catch { /* photo is optional - the post can still go out without it */ } finally { setPrefillingPost(false) }
    }
    const keywords = r.keywords || ''
    const firstName = keywords.split(',')[0]?.trim() || ''
    // Match the AI keywords against the post categories ("Coffee Beans, Coffee"
    // -> Coffee). Falls back to Other - the user can always change it.
    const kw = keywords.toLowerCase()
    const category = matchCategoryLoose(kw)
    // The place being added: an explicit location-group pick wins, then the
    // active "Compare by location" filter, then the searched location.
    const activeGroup = locFilter ? groupMatchesByLocation(r.localMatches).find((g) => g.key === locFilter) : undefined
    const place = group ?? activeGroup
    const [gCity, gCountry] = place ? place.key.split('|') : ['', '']
    const priceSrc = place ?? r.locationCompare ?? r.aiPriceEstimate
    openComposer({
      productName: firstName || search || undefined,
      description: r.aiDescription || undefined,
      category,
      currency: priceSrc?.currency,
      priceMin: priceSrc ? priceSrc.min : undefined,
      priceMax: priceSrc ? priceSrc.max : undefined,
      country: gCountry || r.location?.country || undefined,
      city: gCity || r.location?.city || undefined,
      imageUrl: imageUrl || undefined,
    })
  }

  const handleVote = async (postId: string, voteType: 'HELPFUL' | 'NOT_ACCURATE') => {
    // Demo mode has zero write access: a vote attempt brings up the
    // registration form - no API call, no failed-vote noise.
    if (isGuest) {
      if (onRequireSignUp) onRequireSignUp()
      toast({ title: 'Register to vote', description: 'The demo cannot vote. Create a free account to mark prices helpful or not accurate.' })
      return
    }
    try {
      const res = await authFetch(`/api/local-prices/${postId}/vote`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ voteType }) })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Failed') }
      const data = await res.json()
      setPosts((prev) => prev.map((p) => {
        if (p.id !== postId) return p
        const wasHelpful = p.myVote === 'HELPFUL'; const wasNotAcc = p.myVote === 'NOT_ACCURATE'; const newVote = data.vote
        let helpful = p.helpfulCount; let notAcc = p.notAccurateCount
        if (newVote === null) { if (wasHelpful) helpful = Math.max(0, helpful - 1); if (wasNotAcc) notAcc = Math.max(0, notAcc - 1) }
        else if (newVote === 'HELPFUL') { if (!wasHelpful) helpful += 1; if (wasNotAcc) notAcc = Math.max(0, notAcc - 1) }
        else if (newVote === 'NOT_ACCURATE') { if (!wasNotAcc) notAcc += 1; if (wasHelpful) helpful = Math.max(0, helpful - 1) }
        return { ...p, myVote: newVote, helpfulCount: helpful, notAccurateCount: notAcc }
      }))
      if (data.vote === 'HELPFUL') toast({ title: 'Marked as helpful' })
      else if (data.vote === 'NOT_ACCURATE') toast({ title: 'Flagged as not accurate' })
    } catch (e) {
      toast({ title: 'Vote failed', description: (e as Error).message, variant: 'destructive' })
    }
  }

  return (
    <div className="space-y-4">
      <Card className="p-4 sm:p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary shrink-0" />
              <h2 className="text-base sm:text-lg font-bold text-foreground truncate">Local Price Feed</h2>
            </div>
            <p className="text-xs text-muted-foreground mt-1 hidden sm:block">Real prices from verified locals. Find what travelers actually pay · and what locals actually charge.</p>
          </div>
          <Button onClick={() => openComposer(null)} className="bg-primary hover:bg-primary/90 gap-1.5 shadow-sm shrink-0 h-9 sm:h-10 px-3 sm:px-4">
            <Plus className="w-4 h-4" /> <span className="text-xs sm:text-sm">Post Price</span>
          </Button>
        </div>
      </Card>

      {/* Price stories - every newly posted price is shared as a 24h story
          banner here (the composer creates it on publish). Hidden entirely
          while nothing is live. */}
      <PriceStoriesStrip onOpenPost={setDetailPostId} />

      <div className="flex items-center gap-2 flex-wrap">
        {/* Unified search bar - the country/city/category filters live INSIDE
            the search field as segmented sections of one pill. Desktop: a
            single row (input | country | city | category). Phone: the pill
            wraps - search on top, filters on a second row inside the bar. */}
        <div className="flex items-center flex-1 basis-full sm:basis-auto min-w-[150px] flex-wrap rounded-lg border border-input bg-card shadow-xs">
          <div className="flex items-center flex-1 basis-full sm:basis-auto sm:min-w-[150px] min-w-0">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <Input placeholder="Search item, location" data-testid="local-search-input" value={searchRaw} onChange={(e) => { const v = e.target.value; setSearchRaw(v); const ci = v.indexOf(','); setSearch((ci === -1 ? v : v.slice(0, ci)).trim()) }} className="pl-9 bg-transparent h-9 text-sm border-0 rounded-none shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-transparent" />
            </div>
            {/* Phone: Camera search + Scan collapse into compact icon buttons
                INSIDE the search bar - saves a whole row, and the camera menu
                drops from the pill's right edge so it always fits the screen. */}
            <PhotoSearchButton compact className="sm:hidden ml-1 shrink-0" onImage={handleImageSearch} loading={searchingByImage} onInitiate={kickLocation} />
            <Button type="button" variant="ghost" size="icon" onClick={openMarket} disabled={searchingByImage} className="sm:hidden ml-0.5 shrink-0 w-9 h-9 rounded-tr-lg rounded-br-lg hover:bg-accent" title="Market graph - prices by item and location" data-testid="market-open-compact">
              <BarChart3 className="w-4 h-4 text-emerald-600" />
            </Button>
          </div>
          <div className="hidden sm:block w-px h-5 bg-border shrink-0" />
          <Select value={country} onValueChange={setCountry}>
            <SelectTrigger
              className={
                'flex-1 basis-1/3 sm:basis-auto sm:flex-none sm:w-[150px] h-9 px-2 sm:px-3 text-xs sm:text-sm gap-1 sm:gap-2 border-0 border-t border-input sm:border-t-0 rounded-none shadow-none bg-transparent focus-visible:ring-0 focus-visible:border-transparent ' +
                (country !== 'All countries' ? 'text-emerald-700 dark:text-emerald-400 font-medium' : '')
              }
            >
              <MapPin className="w-3.5 h-3.5 text-muted-foreground shrink-0 hidden sm:block" /><SelectValue placeholder="All countries" />
            </SelectTrigger>
            <SelectContent><SelectItem value="All countries">{t('filter.allCountries')}</SelectItem>{filterValues.countries.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
          <div className="hidden sm:block w-px h-5 bg-border shrink-0" />
          <Select value={city} onValueChange={setCity}>
            <SelectTrigger
              data-testid="city-filter"
              className={
                'flex-1 basis-1/3 sm:basis-auto sm:flex-none sm:w-[112px] h-9 px-2 sm:px-3 text-xs sm:text-sm gap-1 sm:gap-2 border-0 border-t border-input sm:border-t-0 rounded-none shadow-none bg-transparent focus-visible:ring-0 focus-visible:border-transparent ' +
                (city !== 'All cities' ? 'text-emerald-700 dark:text-emerald-400 font-medium' : '')
              }
            >
              <SelectValue placeholder="All cities" />
            </SelectTrigger>
            <SelectContent><SelectItem value="All cities">{t('filter.allCities')}</SelectItem>{filterValues.cities.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
          <div className="hidden sm:block w-px h-5 bg-border shrink-0" />
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger
              data-testid="category-filter"
              className={
                'flex-1 basis-1/3 sm:basis-auto sm:flex-none sm:w-[132px] h-9 px-2 sm:px-3 text-xs sm:text-sm gap-1 sm:gap-2 border-0 border-t border-input sm:border-t-0 rounded-none shadow-none bg-transparent focus-visible:ring-0 focus-visible:border-transparent ' +
                (category !== ALL_CATEGORIES ? 'text-emerald-700 dark:text-emerald-400 font-medium' : '')
              }
            >
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent><SelectItem value={ALL_CATEGORIES}>{t("filter.allCategories")}</SelectItem>{categoryFilterOptions(filterValues.categories).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <PhotoSearchButton
          className="hidden sm:block"
          onImage={handleImageSearch}
          loading={searchingByImage}
          onInitiate={kickLocation}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={openMarket}
          disabled={searchingByImage}
          className="hidden sm:inline-flex bg-card border-emerald-500/40 gap-1.5 h-9 px-3 text-xs shrink-0 hover:bg-emerald-50"
          title="Open the market graph - what things cost by item and place, from real price posts"
          data-testid="market-open"
        >
          <BarChart3 className="w-3.5 h-3.5 text-emerald-600" />
          <span>Market graph</span>
        </Button>
        {searchImage && (
          <div className="relative inline-flex items-center gap-2 px-2 py-1.5 rounded-md border border-primary/40 bg-primary/5">
            <img src={searchImage} alt="Search by image" className="w-6 h-6 rounded object-cover" />
            <span className="text-xs text-foreground truncate max-w-[120px]">{search}</span>
            <button onClick={handleClearSearch} className="p-0.5 rounded hover:bg-accent text-muted-foreground" aria-label="Clear image search"><X className="w-3.5 h-3.5" /></button>
          </div>
        )}
        {customLocations.length > 0 && (
          <div className="inline-flex items-center gap-1.5 px-2 py-1.5 rounded-md border border-emerald-500/40 bg-emerald-50">
            <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span className="text-xs text-emerald-800 truncate max-w-[220px]">
              Comparing in: {customLocations.slice(0, 2).map((p) => p.place).join(' · ')}{customLocations.length > 2 ? ` +${customLocations.length - 2} more` : ''}
            </span>
            <button onClick={() => setCustomLocations([])} className="p-0.5 rounded hover:bg-emerald-100 text-emerald-700" aria-label="Back to my location"><X className="w-3.5 h-3.5" /></button>
          </div>
        )}

        {/* Comma-location hint - honest feedback when the text after the
            comma is not a city or country the feed knows about. */}
        {searchLocHint && (
          <p data-testid="local-search-loc-hint" className="basis-full text-xs text-muted-foreground -mt-1">
            {`No city or country named "${searchLocHint}" in the feed yet - showing ${search ? `"${search}"` : 'everything'} from all locations.`}
          </p>
        )}

        {/* Market graph - v97: the Know-the-price-before-you-go compass
            card (research / compare by location / plan my budget - all
            written by the user) IS the market graph's content. Everything
            that used to sit on the graph - the old chart content and the
            camera-search compare + budget panels (both removed in v95)
            - is gone. /api/market-graph still serves the chart data for
            API consumers; one commit reverts if any of it is wanted. */}
        {marketOpen && (
          <MarketGraphPanel onClose={() => setMarketOpen(false)}>
            <div className="w-full min-w-0" data-testid="market-compass-host">
              <CompassPriceTools />
            </div>
          </MarketGraphPanel>
        )}

        {/* AI search results panel - shows after a camera capture or image
            upload. Contains the AI identification + price estimate (in the
            user's local currency) + matching local posts ranked by location,
            so the user can compare AI vs real local prices near them. */}
        {searchResults && (
          <Card className="w-full p-4 shadow-sm border-primary/20 space-y-3">
            <div className="flex items-start gap-3">
              {searchResults.imageUrl ? (
                <img src={searchResults.imageUrl} alt="Captured" className="w-16 h-16 rounded-lg object-cover shrink-0 border border-border" />
              ) : (
                <div className="w-16 h-16 rounded-lg shrink-0 border border-border bg-accent flex items-center justify-center">
                  <PenLine className="w-6 h-6 text-primary" />
                </div>
              )}
              <div className="flex-1 min-w-0 space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold bg-primary/10 text-primary px-2 py-0.5 rounded-full">{searchResults.imageUrl ? 'AI identified' : 'Searched by name'}</span>
                  <span className="text-xs text-muted-foreground truncate">{searchResults.keywords || 'No product recognized'}</span>
                </div>
                {searchResults.aiDescription && (
                  <p className="text-sm text-foreground leading-relaxed">{searchResults.aiDescription}</p>
                )}
                {searchResults.aiPriceEstimate && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                      ✨ AI est: {searchResults.aiPriceEstimate.currency} {searchResults.aiPriceEstimate.min}-{searchResults.aiPriceEstimate.max}
                    </span>
                  </div>
                )}
              </div>
              <button onClick={handleClearSearch} className="p-1 rounded hover:bg-accent text-muted-foreground shrink-0" aria-label="Close results">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Location-based price comparison - AI estimate vs real local
                prices from the user's city / country. */}
            {searchResults.locationCompare && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 space-y-1">
                <p className="text-xs font-semibold text-emerald-800 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 shrink-0" />
                  Compare near {searchResults.locationCompare.place}
                </p>
                <p className="text-sm text-emerald-900">
                  <span className="font-bold">{searchResults.locationCompare.currency} {searchResults.locationCompare.min}-{searchResults.locationCompare.max}</span>
                  {' '}· {searchResults.locationCompare.count} local price{searchResults.locationCompare.count !== 1 && 's'}
                  {' '}{searchResults.locationCompare.scope === 'city' ? 'in your city' : 'in your country'}
                  {compareSummaryText(searchResults.locationCompare, searchResults.aiPriceEstimate)}
                </p>
              </div>
            )}
            {/* Multi-location compare - one price line per additional picked
                place (the first pick already has the "Compare near" box
                above), aggregated from the grouped matches. */}
            {customLocations.length > 1 && (() => {
              const groups = groupMatchesByLocation(searchResults.localMatches)
              const lines = customLocations.slice(1, 5).map((p) => {
                const ms = groups.filter((g) => groupMatchesPick(g, p))
                if (ms.length === 0) return { place: p.place, empty: true, currency: '', min: 0, max: 0, count: 0 }
                return {
                  place: p.place, empty: false,
                  currency: ms[0].currency,
                  min: Math.min(...ms.map((g) => g.min)),
                  max: Math.max(...ms.map((g) => g.max)),
                  count: ms.reduce((s, g) => s + g.count, 0),
                }
              })
              return (
                <div className="space-y-1">
                  {lines.map((l) => (
                    <p key={l.place} className="text-xs text-emerald-900 flex items-center gap-1.5 flex-wrap">
                      <MapPin className="w-3 h-3 shrink-0 text-emerald-600" />
                      <span className="font-semibold">{l.place}:</span>
                      {l.empty
                        ? <span className="text-muted-foreground">no local prices yet</span>
                        : <span><span className="font-bold">{l.currency} {l.min}-{l.max}</span> · {l.count} price{l.count !== 1 ? 's' : ''}</span>}
                    </p>
                  ))}
                </div>
              )
            })()}

            {!searchResults.locationCompare && searchResults.localMatches.length === 0 && searchResults.location && (
              <div className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
                <span className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 shrink-0" />
                  No local prices near {searchResults.location.city || searchResults.location.country} yet - be the first!
                </span>
                <button
                  onClick={() => void handlePostProduct()}
                  className="inline-flex items-center gap-0.5 rounded-full border border-emerald-300 bg-card px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 transition-colors hover:border-emerald-600 hover:bg-emerald-600 hover:text-white"
                  title="Add this product as a price post - pre-filled with the searched location"
                >
                  <Plus className="w-3 h-3" /> Add it
                </button>
              </div>
            )}

            {/* Compare by location - every location that has a matching
                price, side by side (range + count per place). Click a place
                to filter the match cards below to it. */}
            {(() => {
              const groups = groupMatchesByLocation(searchResults.localMatches)
                .map((g) => ({ ...g, picked: customLocations.some((p) => groupMatchesPick(g, p)) }))
                .sort((a, b) => Number(b.picked) - Number(a.picked) || Number(b.near) - Number(a.near) || b.count - a.count || a.place.localeCompare(b.place))
              if (groups.length < 2) return null
              return (
                <div className="space-y-1.5 pt-2 border-t border-border">
                  <p className="text-xs font-semibold text-emerald-700 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 shrink-0" />
                    Compare by location
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {groups.map((g) => (
                      <div
                        key={g.key}
                        onClick={() => setLocFilter(locFilter === g.key ? null : g.key)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setLocFilter(locFilter === g.key ? null : g.key) }}
                        className={`text-left px-2.5 py-2 rounded-lg border transition-colors space-y-0.5 cursor-pointer ${locFilter === g.key ? 'border-emerald-500 bg-emerald-100/70' : g.picked ? 'border-emerald-400 bg-emerald-50/70 hover:bg-emerald-50' : g.near ? 'border-emerald-200 bg-emerald-50/50 hover:bg-emerald-50' : 'border-border bg-card hover:bg-accent/50'}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium text-foreground truncate flex items-center gap-1">
                            <MapPin className="w-3 h-3 shrink-0 text-muted-foreground" />{g.place}
                          </span>
                          {g.picked && <span className="text-[9px] font-semibold uppercase tracking-wide text-white bg-emerald-600 px-1.5 py-0.5 rounded-full shrink-0">Your pick</span>}
                          {g.near && <span className="text-[9px] font-semibold uppercase tracking-wide text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded-full shrink-0">Near you</span>}
                        </div>
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="font-bold text-emerald-700">{g.currency} {g.min}-{g.max}</span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="text-muted-foreground">{g.count} price{g.count !== 1 ? 's' : ''}</span>
                            <button
                              onClick={(e) => { e.stopPropagation(); void handlePostProduct(g) }}
                              className="inline-flex items-center gap-0.5 rounded-full border border-emerald-300 bg-card px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 transition-colors hover:border-emerald-600 hover:bg-emerald-600 hover:text-white"
                              title={`Add this product as a price post in ${g.place} - pre-filled with the ${g.currency} ${g.min}-${g.max} range posted there`}
                            >
                              <Plus className="w-3 h-3" /> Add here
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })()}

            {/* Local price matches - real prices from locals, grouped by how
                close they are to the user's location (or filtered to one
                location when the user picked a place above). */}
            {searchResults.localMatches.length > 0 && (() => {
              const filtered = locFilter
                ? searchResults.localMatches.filter((m: any) => matchLocationKey(m) === locFilter)
                : searchResults.localMatches
              const near = filtered.filter((m: any) => m.locMatch === 'city' || m.locMatch === 'country')
              const elsewhere = filtered.filter((m: any) => m.locMatch !== 'city' && m.locMatch !== 'country')
              const activeGroup = locFilter ? groupMatchesByLocation(searchResults.localMatches).find((g) => g.key === locFilter) : undefined
              return (
                <div className="space-y-2 pt-2 border-t border-border">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-emerald-700 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      {locFilter && activeGroup
                        ? `${activeGroup.place} - ${filtered.length} local price${filtered.length !== 1 ? 's' : ''}`
                        : `${filtered.length} local price${filtered.length !== 1 ? 's' : ''} found`}
                    </p>
                    {locFilter && (
                      <button onClick={() => setLocFilter(null)} className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-0.5">
                        <X className="w-3 h-3" /> show all
                      </button>
                    )}
                  </div>
                  {filtered.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No matches in this place.</p>
                  ) : (
                    <>
                      {near.length > 0 && (
                        <div className="space-y-1.5">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600">
                            Near you{searchResults.location?.city ? ` · ${searchResults.location.city}${searchResults.location.country ? ', ' + searchResults.location.country : ''}` : ''}
                          </p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {near.slice(0, 4).map((post: any) => <LocalMatchCard key={post.id} post={post} onOpen={setDetailPostId} />)}
                          </div>
                        </div>
                      )}
                      {elsewhere.length > 0 && (
                        <div className="space-y-1.5">
                          {near.length > 0 && <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Other locations</p>}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {elsewhere.slice(0, near.length > 0 ? 2 : 6).map((post: any) => <LocalMatchCard key={post.id} post={post} onOpen={setDetailPostId} />)}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )
            })()}

            {/* Post this product - add the identified item as a price post
                with the captured photo, pre-filled from this search. The new
                post then shows up in everyone's location comparison. */}
            <div className="pt-2 border-t border-border flex items-center gap-2.5 flex-wrap">
              <Button
                size="sm"
                onClick={() => void handlePostProduct()}
                disabled={prefillingPost}
                className="bg-emerald-600 hover:bg-emerald-700 gap-1.5 shrink-0"
                title="Add this product as a price post - pre-filled with the identified name, photo and compared price range"
              >
                {prefillingPost ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {prefillingPost ? 'Preparing photo...' : 'Post this product'}
              </Button>
              <p className="text-[11px] text-muted-foreground min-w-0 flex-1">
                {(() => {
                  const ag = locFilter ? groupMatchesByLocation(searchResults.localMatches).find((g) => g.key === locFilter) : undefined
                  return ag
                    ? `Add it in ${ag.place} - pre-filled with the ${ag.currency} ${ag.min}-${ag.max} range posted there${searchFileRef.current ? ' and your photo' : ''}.`
                    : `Add it with your price - pre-filled from this search${searchFileRef.current ? ' and photo' : ''}.`
                })()}
              </p>
            </div>
          </Card>
        )}
      </div>

      {/* v136-v137: the top-posters board lived here as a section; v138
          MOVED it to the profile page ("Top score", above the content
          tabs). The desktop right sidebar still renders the shared card. */}

      {loading && posts.length === 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((i) => <Card key={i} className="p-3 space-y-2"><Skeleton className="h-3 w-20" /><Skeleton className="h-5 w-3/4" /><Skeleton className="h-10 w-full" /><Skeleton className="h-3 w-full" /></Card>)}
        </div>
      ) : posts.length === 0 ? (
        <Card className="p-6 sm:p-10 text-center shadow-sm">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-accent mb-3"><PackageOpen className="w-6 h-6 text-primary" /></div>
          <h3 className="font-semibold text-foreground">No local price posts found</h3>
          <p className="mt-1 text-sm text-muted-foreground max-w-md mx-auto">
            {searchResults && searchResults.localMatches.length > 0
              ? `The camera search found ${searchResults.localMatches.length} matching price${searchResults.localMatches.length !== 1 ? 's' : ''} - see the results panel above. Or adjust your filters below.`
              : 'No posts match your filters. Try adjusting search or filters · or be the first to post a local price!'}
          </p>
          <Button onClick={() => openComposer(null)} className="mt-5 bg-primary hover:bg-primary/90 gap-1.5"><Plus className="w-4 h-4" /> Post a Local Price</Button>
        </Card>
      ) : (
        <>
          <p className="text-xs text-muted-foreground px-1">{posts.length} local price post{posts.length !== 1 && 's'} found</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {posts.map((p) => {
              const cmp = cardCompare(p)
              return (
                <LocalPriceCard
                  key={p.id}
                  post={p}
                  onOpen={setDetailPostId}
                  onVote={handleVote}
                  onAuthorClick={setProfileUserId}
                  onMessage={onMessage}
                  onDelete={handleDelete}
                  canDelete={!!currentUserId && p.authorId === currentUserId}
                  onEdit={handleEditPost}
                  canEdit={!!currentUserId && p.authorId === currentUserId}
                  isOwnPost={!!currentUserId && p.authorId === currentUserId}
                  compareEntries={cmp?.entries ?? null}
                  compareExtra={cmp?.extra ?? 0}
                />
              )
            })}
          </div>
          <div ref={postsSentinelRef} />
          {loadingMore && (
            <p data-testid="feed-loading-more" className="text-center text-xs text-muted-foreground py-2 flex items-center justify-center gap-1.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading more prices…
            </p>
          )}
        </>
      )}

      <CreatePricePostModal open={modalOpen} onOpenChange={setModalOpen} onCreated={() => { setPostPrefill(null); handleCreated() }} prefill={postPrefill} />
      <EditPricePostModal open={editModalOpen} onOpenChange={setEditModalOpen} post={editPost} onSaved={() => { fetchPosts(); onRefreshUser() }} />
      <PriceDetailModal postId={detailPostId} onClose={() => setDetailPostId(null)} onAuthorClick={setProfileUserId} onMessage={onMessage} currentUserId={currentUserId} onOpenPost={setDetailPostId} />
      <LocalProfileModal userId={profileUserId} onClose={() => setProfileUserId(null)} onOpenPost={setDetailPostId} onMessage={onMessage} currentUserId={currentUserId} />
    </div>
  )
}

// v95: the camera search is ONLY the camera search - tapping it goes
// straight to the photo capture/upload. The Compare-by-location and
// Plan-my-budget actions moved ONTO the market graph panel, so the old
// dropdown menu is gone.
function PhotoSearchButton({ onImage, loading, onInitiate, compact, className }: { onImage: (file: File) => void; loading: boolean; onInitiate?: () => void; compact?: boolean; className?: string }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()
  return (
    <>
      <input type="file" accept="image/*" ref={inputRef} onChange={(e) => { const f = e.target.files?.[0]; if (f) onImage(f); if (inputRef.current) inputRef.current.value = '' }} className="hidden" />
      <div className={`relative shrink-0 ${className || ''}`}>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            if (SCAN_COMING_SOON) {
              toast({ title: 'Camera search is coming soon', description: 'Camera search will be available in a future update.' })
              return
            }
            // Start resolving the user's location NOW (user gesture - required
            // for the geolocation permission prompt) so it is ready by the time
            // the photo is chosen, enabling the location-based price compare.
            onInitiate?.()
            inputRef.current?.click()
          }}
          disabled={loading}
          className={compact
            ? 'bg-card border-primary/30 h-9 w-9 px-0 justify-center'
            : 'bg-card border-primary/30 gap-1.5 h-9 px-3 text-xs'}
          title="Search by photo - AI identifies the product and compares real local prices"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" /> : <Camera className="w-3.5 h-3.5 text-primary" />}
          {!compact && <><span className="hidden sm:inline">Camera search</span><span className="sm:hidden">Search</span></>}
          {!compact && SCAN_COMING_SOON && <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700">Soon</span>}
        </Button>
      </div>
    </>
  )
}

// One matching local price card inside the camera-search results panel.
function LocalMatchCard({ post, onOpen }: { post: any; onOpen: (id: string) => void }) {
  return (
    <button
      onClick={() => onOpen(post.id)}
      className="text-left p-2.5 rounded-lg border border-emerald-200 bg-emerald-50/50 hover:bg-emerald-50 transition-colors space-y-1"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-foreground truncate">{post.productName}</span>
        <span className="text-sm font-bold text-emerald-700 shrink-0">
          {post.currency} {post.priceMin}{post.priceMin !== post.priceMax ? `-${post.priceMax}` : ''}
        </span>
      </div>
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <MapPin className="w-3 h-3 shrink-0" />
        <span className="truncate">{[post.city, post.country].filter(Boolean).join(', ')}</span>
        {post.author?.verifiedLocal && <BadgeCheck className="w-3 h-3 text-emerald-500 shrink-0" />}
        {post.author?.idVerified && <BadgeCheck className="w-3 h-3 text-blue-500 shrink-0" aria-label="Verified with ID or passport" />}
        <span className="truncate">{post.author?.name}</span>
      </div>
    </button>
  )
}

// Location key for a match - used by the "Compare by location" breakdown
// and the match-card filter (city|country|currency so cross-currency posts
// are never merged into one misleading range).
function matchLocationKey(m: { city?: string | null; country?: string | null; currency?: string }): string {
  return `${m.city || ''}|${m.country || ''}|${m.currency || ''}`
}

// Does a location group (from the breakdown) belong to one of the user's
// picked compare places? A pick with a city compares THAT city only (the
// country fallback must not sweep in every other group from the same
// country); a country-only pick matches any group in that country.
function groupMatchesPick(g: { key: string }, p: { city: string | null; country: string | null }): boolean {
  const [gCity, gCountry] = g.key.split('|')
  const norm = (s: string | null | undefined) => (s || '').trim().toLowerCase()
  if (p.city) return norm(gCity) === norm(p.city)
  if (p.country) return norm(gCountry) === norm(p.country)
  return false
}

// Group local matches by place with a per-place price range, so the user
// can compare the same product across locations at a glance. Near-you
// groups sort first, then by match count.
function groupMatchesByLocation(matches: Array<any>): Array<{
  key: string; place: string; currency: string; min: number; max: number; count: number; near: boolean
}> {
  const map = new Map<string, { key: string; place: string; currency: string; min: number; max: number; count: number; near: boolean }>()
  for (const m of matches) {
    const key = matchLocationKey(m)
    const place = [m.city, m.country].filter(Boolean).join(', ') || 'Unknown location'
    const g = map.get(key) ?? {
      key, place, currency: m.currency || '',
      min: m.priceMin, max: m.priceMax, count: 0,
      near: m.locMatch === 'city' || m.locMatch === 'country',
    }
    g.min = Math.min(g.min, m.priceMin)
    g.max = Math.max(g.max, m.priceMax)
    g.count += 1
    if (m.locMatch === 'city' || m.locMatch === 'country') g.near = true
    map.set(key, g)
  }
  return Array.from(map.values()).sort((a, b) => Number(b.near) - Number(a.near) || b.count - a.count || a.place.localeCompare(b.place))
}

// One-line comparison between the local price range near the user and the
// AI estimate - only when both exist in the SAME currency (honest: no FX
// guessing). Returns a trailing sentence like " · ~35% below the AI estimate".
function compareSummaryText(
  cmp: { min: number; max: number; currency: string; count: number },
  aiEst: { min: number; max: number; currency: string } | null
): string {
  if (!aiEst || aiEst.currency !== cmp.currency || cmp.count === 0) return ''
  const aiMid = (aiEst.min + aiEst.max) / 2
  const localMid = (cmp.min + cmp.max) / 2
  if (aiMid <= 0) return ''
  const diffPct = Math.round(((localMid - aiMid) / aiMid) * 100)
  if (diffPct <= -25) return ` - a great local deal, ~${-diffPct}% below the AI estimate`
  if (diffPct < 15) return ' - in line with the AI estimate'
  return ` - ~${diffPct}% above the AI estimate, haggle or look around`
}

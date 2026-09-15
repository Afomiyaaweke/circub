'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { MapPin, Plus, Search, Sparkles, PackageOpen, Camera, X, Loader2, BadgeCheck, ScanLine, PenLine, Navigation } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { LocalPriceCard } from './local-price-card'
import { CreatePricePostModal, CATEGORIES } from './create-price-post-modal'
import { EditPricePostModal } from './edit-price-post-modal'
import { PriceDetailModal } from './price-detail-modal'
import { LocalProfileModal } from './local-profile-modal'
import { PriceLensModal } from './pricelens-modal'
import { useToast } from '@/hooks/use-toast'
import { authFetch } from '@/lib/auth-fetch'
import { resolveCurrentLocation, type ResolvedLocation } from '@/lib/location'
import { compressImage } from '@/lib/image-compress'
import type { CreatePricePostPrefill } from './create-price-post-modal'
import type { LocalPricePost } from '@/lib/types'

// Camera scan + camera search are LIVE — clicking either entry point opens the
// camera/search flow (AI identifies the item, then compares the AI price
// estimate against real local price posts). Flip to true to hold them behind
// a "Soon" badge again (e.g. while the AI backend is unavailable).
const SCAN_COMING_SOON = false

interface LocalFeedTabProps {
  onRefreshUser: () => void
}


export function LocalFeedTab({ onRefreshUser }: LocalFeedTabProps) {
  const [posts, setPosts] = useState<LocalPricePost[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [country, setCountry] = useState('All countries')
  const [city, setCity] = useState('All cities')
  const [category, setCategory] = useState('All categories')
  const [modalOpen, setModalOpen] = useState(false)
  const [pricelensOpen, setPricelensOpen] = useState(false)
  const [detailPostId, setDetailPostId] = useState<string | null>(null)
  const [profileUserId, setProfileUserId] = useState<string | null>(null)
  const [editPost, setEditPost] = useState<LocalPricePost | null>(null)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [searchImage, setSearchImage] = useState<string | null>(null)
  const [searchingByImage, setSearchingByImage] = useState(false)
  // User location for the camera-search price comparison — resolved once
  // (device GPS with IP fallback) and reused for every subsequent search.
  const [userLocation, setUserLocation] = useState<ResolvedLocation | null>(null)
  const locationPromiseRef = useRef<Promise<ResolvedLocation | null> | null>(null)
  // Camera-search option panels + custom compare location. "Search by name
  // first" lets the user search prices WITHOUT a photo; "Compare by
  // location" lets them pick WHERE to compare prices (defaults to the
  // auto-detected current location).
  const [camMenuOpen, setCamMenuOpen] = useState(false)
  const [nameSearchOpen, setNameSearchOpen] = useState(false)
  const [nameQuery, setNameQuery] = useState('')
  const [locPickOpen, setLocPickOpen] = useState(false)
  const [pickCountry, setPickCountry] = useState('')
  const [pickCity, setPickCity] = useState('')
  // One or MORE places the user picked for the price compare — "add two or
  // more locations". `place` is the display label; the FIRST pick is the
  // primary location sent to the search API, the rest are matched client-side
  // (badges + per-place summary lines in the results panel).
  const [customLocations, setCustomLocations] = useState<Array<{ city: string | null; country: string | null; countryCode?: string | null; place: string }>>([])
  // When set, the results panel's match cards are filtered to one location
  // group from the "Compare by location" breakdown (key: city|country|currency).
  const [locFilter, setLocFilter] = useState<string | null>(null)
  // "Post this product" — pre-fills the create-post modal from the current
  // camera-search results (identified name, category, price range, photo).
  const [postPrefill, setPostPrefill] = useState<CreatePricePostPrefill | null>(null)
  const [prefillingPost, setPrefillingPost] = useState(false)
  // The original captured File behind searchResults.imageUrl — kept so the
  // photo can be uploaded (compressed) when the user chooses to post it.
  const searchFileRef = useRef<File | null>(null)
  // AI search results — shown in a panel above the feed after a camera
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
    fetch('/api/auth/me').then((r) => (r.ok ? r.json() : null)).then((d) => { if (d?.id) setCurrentUserId(d.id) }).catch(() => {})
  }, [])

  useEffect(() => {
    fetch('/api/local-prices/filters').then((r) => r.json()).then((data) => setFilterValues({ countries: data.countries || [], cities: data.cities || [], categories: data.categories || [] })).catch(() => {})
  }, [])

  const fetchPosts = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (country && country !== 'All countries') params.set('country', country)
      if (city && city !== 'All cities') params.set('city', city)
      if (category && category !== 'All categories') params.set('category', category)
      // Posts default to most recent (API default) — no sort dropdown in the UI.
      const res = await fetch(`/api/local-prices?${params.toString()}`)
      const data = await res.json()
      setPosts(data.posts || [])
    } catch { setPosts([]) } finally { setLoading(false) }
  }, [search, country, city, category])

  useEffect(() => {
    const t = setTimeout(fetchPosts, 250)
    return () => clearTimeout(t)
  }, [fetchPosts])

  const handleCreated = () => { fetchPosts(); onRefreshUser() }

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
    // the click; IP fallback resolves in ~1-2s, GPS may need longer — don't
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
      // provider is down AND the filename has no hints) — say so clearly
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
      // most local posts — far better feed results than the raw first keyword.
      const firstKeyword: string = (vlmData.searchTerm || keywords.split(',')[0] || '').trim()
      setSearch(firstKeyword)
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

  // "Search by name first" — same location-ranked price comparison as the
  // camera search, but the product name is TYPED instead of photographed.
  const handleTextSearch = async (query: string) => {
    const q = query.trim()
    if (!q) return
    setSearchingByImage(true)
    try {
      const loc = await locationForSearch()
      const formData = new FormData()
      formData.append('query', q)
      if (loc) formData.append('location', JSON.stringify(loc))
      const res = await fetch('/api/visual-search', { method: 'POST', body: formData })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Search failed') }
      searchFileRef.current = null
      const data = await res.json()
      const term: string = (data.searchTerm || q).trim()
      const localMatches = Array.isArray(data.localMatches) ? data.localMatches : []
      setSearch(term)
      setSearchImage(null)
      setLocFilter(null)
      setSearchResults({
        aiDescription: data.aiDescription || '',
        aiPriceEstimate: data.aiPriceEstimate || null,
        localMatches,
        keywords: term,
        imageUrl: '',
        locationCompare: data.locationCompare || null,
        location: data.location || null,
      })
      const nearCount = (data.locationCompare?.count as number) || 0
      toast({
        title: localMatches.length > 0 ? `Found ${localMatches.length} local price${localMatches.length !== 1 ? 's' : ''} for "${term}"` : `No local prices for "${term}" yet`,
        description: localMatches.length > 0
          ? nearCount > 0
            ? `${data.locationCompare.currency} ${data.locationCompare.min}–${data.locationCompare.max} · ${nearCount} near ${data.locationCompare.place}`
            : 'See the results panel — grouped by location'
          : 'Try "Compare by location" for another city, or post the first price.',
      })
    } catch (e) {
      toast({ title: 'Search failed', description: (e as Error).message, variant: 'destructive' })
    } finally { setSearchingByImage(false) }
  }

  // Kick off location resolution on the FIRST user gesture (camera-search
  // click) — browsers only allow the geolocation prompt from a gesture, and
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
    setSearchImage(null)
    setSearchResults(null)
    setLocFilter(null)
    searchFileRef.current = null
  }

  // Add the currently typed place to the multi-location compare list.
  const addPlace = () => {
    const city = pickCity.trim() || null
    const country = pickCountry || city
    const place = [city, pickCountry].filter(Boolean).join(', ')
    if (!place) return
    if (customLocations.some((p) => p.place.toLowerCase() === place.toLowerCase())) {
      toast({ title: 'Already added', description: `${place} is already in your compare list.` })
      return
    }
    setCustomLocations([...customLocations, { city, country, countryCode: null, place }])
    setPickCity('')
    toast({ title: `${place} added`, description: 'Add another place to compare side by side, or close and run a search.' })
  }

  // "Post this product" — turn the camera-search result into a price post.
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
      } catch { /* photo is optional — the post can still go out without it */ } finally { setPrefillingPost(false) }
    }
    const keywords = r.keywords || ''
    const firstName = keywords.split(',')[0]?.trim() || ''
    // Match the AI keywords against the post categories ("Coffee Beans, Coffee"
    // -> Coffee). Falls back to Other — the user can always change it.
    const kw = keywords.toLowerCase()
    const category = CATEGORIES.find((c) => kw.includes(c.toLowerCase())) || 'Other'
    // The place being added: an explicit location-group pick wins, then the
    // active "Compare by location" filter, then the searched location.
    const activeGroup = locFilter ? groupMatchesByLocation(r.localMatches).find((g) => g.key === locFilter) : undefined
    const place = group ?? activeGroup
    const [gCity, gCountry] = place ? place.key.split('|') : ['', '']
    const priceSrc = place ?? r.locationCompare ?? r.aiPriceEstimate
    setPostPrefill({
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
    setModalOpen(true)
  }

  const handleVote = async (postId: string, voteType: 'HELPFUL' | 'NOT_ACCURATE') => {
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
          <Button onClick={() => { setPostPrefill(null); setModalOpen(true) }} className="bg-primary hover:bg-primary/90 gap-1.5 shadow-sm shrink-0 h-9 sm:h-10 px-3 sm:px-4">
            <Plus className="w-4 h-4" /> <span className="text-xs sm:text-sm">Post Price</span>
          </Button>
        </div>
      </Card>

      <div className="flex items-center gap-2 flex-wrap">
        {/* Unified search bar — the country/city/category filters live INSIDE
            the search field as segmented sections of one pill. Desktop: a
            single row (input | country | city | category). Phone: the pill
            wraps — search on top, filters on a second row inside the bar. */}
        <div className="flex items-center flex-1 basis-full sm:basis-auto min-w-[150px] flex-wrap rounded-lg border border-input bg-card shadow-xs overflow-hidden">
          <div className="relative flex-1 basis-full sm:basis-auto sm:min-w-[150px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 bg-transparent h-9 text-sm border-0 rounded-none shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-transparent" />
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
            <SelectContent><SelectItem value="All countries">All countries</SelectItem>{filterValues.countries.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
          <div className="hidden sm:block w-px h-5 bg-border shrink-0" />
          <Select value={city} onValueChange={setCity}>
            <SelectTrigger
              className={
                'flex-1 basis-1/3 sm:basis-auto sm:flex-none sm:w-[112px] h-9 px-2 sm:px-3 text-xs sm:text-sm gap-1 sm:gap-2 border-0 border-t border-input sm:border-t-0 rounded-none shadow-none bg-transparent focus-visible:ring-0 focus-visible:border-transparent ' +
                (city !== 'All cities' ? 'text-emerald-700 dark:text-emerald-400 font-medium' : '')
              }
            >
              <SelectValue placeholder="All cities" />
            </SelectTrigger>
            <SelectContent><SelectItem value="All cities">All cities</SelectItem>{filterValues.cities.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
          <div className="hidden sm:block w-px h-5 bg-border shrink-0" />
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger
              className={
                'flex-1 basis-1/3 sm:basis-auto sm:flex-none sm:w-[132px] h-9 px-2 sm:px-3 text-xs sm:text-sm gap-1 sm:gap-2 border-0 border-t border-input sm:border-t-0 rounded-none shadow-none bg-transparent focus-visible:ring-0 focus-visible:border-transparent ' +
                (category !== 'All categories' ? 'text-emerald-700 dark:text-emerald-400 font-medium' : '')
              }
            >
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent><SelectItem value="All categories">All categories</SelectItem>{filterValues.categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <PhotoSearchButton
          onImage={handleImageSearch}
          loading={searchingByImage}
          onInitiate={kickLocation}
          onMenuAction={(action) => {
            if (action === 'name') { setNameSearchOpen(true); setLocPickOpen(false) }
            else if (action === 'location') { setLocPickOpen(true); setNameSearchOpen(false) }
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            if (SCAN_COMING_SOON) {
              toast({ title: 'Scan is coming soon', description: 'Camera scanning will be available in a future update.' })
              return
            }
            setPricelensOpen(true)
          }}
          disabled={searchingByImage}
          className="bg-card border-emerald-500/40 gap-1.5 h-9 px-3 text-xs shrink-0 hover:bg-emerald-50"
          title="Open PriceLens — point your camera at a product, AI identifies it and finds live local prices"
        >
          <ScanLine className="w-3.5 h-3.5 text-emerald-600" />
          <span className="hidden sm:inline">Scan with camera</span>
          <span className="sm:hidden">Scan</span>
          {SCAN_COMING_SOON && <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700">Soon</span>}
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

        {/* "Search by name first" — type the product name instead of
            uploading a product pic; same location-ranked price compare. */}
        {nameSearchOpen && (
          <Card className="w-full p-3 shadow-sm border-primary/30 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-foreground flex items-center gap-1.5"><PenLine className="w-4 h-4 text-primary" /> Search by name first</p>
              <button onClick={() => setNameSearchOpen(false)} className="p-1 rounded hover:bg-accent text-muted-foreground" aria-label="Close name search"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-xs text-muted-foreground">No photo needed — type the product name (e.g. "coffee beans", "power bank"). Can&apos;t find it? Use the camera instead.</p>
            <form
              onSubmit={(e) => { e.preventDefault(); handleTextSearch(nameQuery) }}
              className="flex items-center gap-2"
            >
              <Input value={nameQuery} onChange={(e) => setNameQuery(e.target.value)} placeholder="Product name..." className="flex-1 h-9 bg-card text-sm" />
              <Button type="submit" size="sm" disabled={searchingByImage || !nameQuery.trim()} className="bg-primary hover:bg-primary/90 gap-1.5 h-9 shrink-0">
                {searchingByImage ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />} Search
              </Button>
            </form>
          </Card>
        )}

        {/* "Compare by location" — pick WHERE to compare prices (defaults
            to the auto-detected current location). Applies to the next
            camera search or name search. */}
        {locPickOpen && (
          <Card className="w-full p-3 shadow-sm border-emerald-500/40 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-foreground flex items-center gap-1.5"><MapPin className="w-4 h-4 text-emerald-600" /> Compare prices by location</p>
              <button onClick={() => setLocPickOpen(false)} className="p-1 rounded hover:bg-accent text-muted-foreground" aria-label="Close location picker"><X className="w-4 h-4" /></button>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                type="button"
                size="sm"
                variant={customLocations.length ? 'outline' : 'default'}
                onClick={() => { setCustomLocations([]); setPickCountry(''); setPickCity(''); kickLocation() }}
                className="gap-1.5 h-9 shrink-0"
              >
                <Navigation className="w-3.5 h-3.5" /> My location
              </Button>
              <Select value={pickCountry || 'any'} onValueChange={(v) => setPickCountry(v === 'any' ? '' : v)}>
                <SelectTrigger className="w-[160px] bg-card h-9 text-sm"><SelectValue placeholder="Any country" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any country</SelectItem>
                  {filterValues.countries.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input value={pickCity} onChange={(e) => setPickCity(e.target.value)} placeholder="City (optional)" className="w-[150px] h-9 bg-card text-sm" />
              <Button
                type="button"
                size="sm"
                disabled={searchingByImage || (!pickCountry && !pickCity.trim())}
                onClick={addPlace}
                className="bg-emerald-600 hover:bg-emerald-700 h-9 shrink-0 gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" /> Add place
              </Button>
              {customLocations.length > 0 && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setLocPickOpen(false)}
                  className="h-9 shrink-0"
                >
                  Done
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={searchingByImage || (!pickCountry && !pickCity.trim())}
                onClick={() => {
                  const city = pickCity.trim() || null
                  const country = pickCountry || city
                  const place = [city, pickCountry].filter(Boolean).join(', ')
                  // Keep the place for later compares too — without duping it.
                  if (place) {
                    setCustomLocations((prev) => prev.some((p) => p.place.toLowerCase() === place.toLowerCase()) ? prev : [...prev, { city, country, countryCode: null, place }])
                  }
                  setLocPickOpen(false)
                  // Jump straight to adding a product in the picked place —
                  // location pre-filled (country only from a real country
                  // pick, never the city fallback), the user types the rest.
                  setPostPrefill({ country: pickCountry || undefined, city: city || undefined })
                  setModalOpen(true)
                }}
                className="gap-1.5 h-9 shrink-0 border-emerald-500/50 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
                title="Add a product price in the picked place — opens the post form with the location pre-filled"
              >
                <Plus className="w-3.5 h-3.5" /> Add product
              </Button>
            </div>
            {customLocations.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                {customLocations.map((p, i) => (
                  <span key={`${p.place}-${i}`} className="inline-flex items-center gap-1 pl-2 pr-1 py-1 rounded-full border border-emerald-300 bg-emerald-50 text-xs text-emerald-800">
                    <MapPin className="w-3 h-3 text-emerald-600 shrink-0" />
                    {p.place}
                    <button onClick={() => setCustomLocations(customLocations.filter((_, j) => j !== i))} className="p-0.5 rounded-full hover:bg-emerald-100 text-emerald-700" aria-label={`Remove ${p.place}`}><X className="w-3 h-3" /></button>
                  </span>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">Add two or more places to compare them side by side — the first place ranks the matches, and every place gets its own price line in the results. Or skip the search and add a product directly.</p>
          </Card>
        )}

        {/* AI search results panel — shows after a camera capture or image
            upload. Contains the AI identification + price estimate (in the
            user's local currency) + matching local posts ranked by location,
            so the user can compare AI vs real local prices near them. */}
        {searchResults && (
          <Card className="p-4 shadow-sm border-primary/20 space-y-3">
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
                      ✨ AI est: {searchResults.aiPriceEstimate.currency} {searchResults.aiPriceEstimate.min}–{searchResults.aiPriceEstimate.max}
                    </span>
                  </div>
                )}
              </div>
              <button onClick={handleClearSearch} className="p-1 rounded hover:bg-accent text-muted-foreground shrink-0" aria-label="Close results">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Location-based price comparison — AI estimate vs real local
                prices from the user's city / country. */}
            {searchResults.locationCompare && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 space-y-1">
                <p className="text-xs font-semibold text-emerald-800 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 shrink-0" />
                  Compare near {searchResults.locationCompare.place}
                </p>
                <p className="text-sm text-emerald-900">
                  <span className="font-bold">{searchResults.locationCompare.currency} {searchResults.locationCompare.min}–{searchResults.locationCompare.max}</span>
                  {' '}· {searchResults.locationCompare.count} local price{searchResults.locationCompare.count !== 1 && 's'}
                  {' '}{searchResults.locationCompare.scope === 'city' ? 'in your city' : 'in your country'}
                  {compareSummaryText(searchResults.locationCompare, searchResults.aiPriceEstimate)}
                </p>
              </div>
            )}
            {/* Multi-location compare — one price line per additional picked
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
                        : <span><span className="font-bold">{l.currency} {l.min}–{l.max}</span> · {l.count} price{l.count !== 1 ? 's' : ''}</span>}
                    </p>
                  ))}
                </div>
              )
            })()}

            {!searchResults.locationCompare && searchResults.localMatches.length === 0 && searchResults.location && (
              <div className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
                <span className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 shrink-0" />
                  No local prices near {searchResults.location.city || searchResults.location.country} yet — be the first!
                </span>
                <button
                  onClick={() => void handlePostProduct()}
                  className="inline-flex items-center gap-0.5 rounded-full border border-emerald-300 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 transition-colors hover:border-emerald-600 hover:bg-emerald-600 hover:text-white"
                  title="Add this product as a price post — pre-filled with the searched location"
                >
                  <Plus className="w-3 h-3" /> Add it
                </button>
              </div>
            )}

            {/* Compare by location — every location that has a matching
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
                          <span className="font-bold text-emerald-700">{g.currency} {g.min}–{g.max}</span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="text-muted-foreground">{g.count} price{g.count !== 1 ? 's' : ''}</span>
                            <button
                              onClick={(e) => { e.stopPropagation(); void handlePostProduct(g) }}
                              className="inline-flex items-center gap-0.5 rounded-full border border-emerald-300 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 transition-colors hover:border-emerald-600 hover:bg-emerald-600 hover:text-white"
                              title={`Add this product as a price post in ${g.place} — pre-filled with the ${g.currency} ${g.min}–${g.max} range posted there`}
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

            {/* Local price matches — real prices from locals, grouped by how
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
                        ? `${activeGroup.place} — ${filtered.length} local price${filtered.length !== 1 ? 's' : ''}`
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

            {/* Post this product — add the identified item as a price post
                with the captured photo, pre-filled from this search. The new
                post then shows up in everyone's location comparison. */}
            <div className="pt-2 border-t border-border flex items-center gap-2.5 flex-wrap">
              <Button
                size="sm"
                onClick={() => void handlePostProduct()}
                disabled={prefillingPost}
                className="bg-emerald-600 hover:bg-emerald-700 gap-1.5 shrink-0"
                title="Add this product as a price post — pre-filled with the identified name, photo and compared price range"
              >
                {prefillingPost ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {prefillingPost ? 'Preparing photo...' : 'Post this product'}
              </Button>
              <p className="text-[11px] text-muted-foreground min-w-0 flex-1">
                {(() => {
                  const ag = locFilter ? groupMatchesByLocation(searchResults.localMatches).find((g) => g.key === locFilter) : undefined
                  return ag
                    ? `Add it in ${ag.place} — pre-filled with the ${ag.currency} ${ag.min}–${ag.max} range posted there${searchFileRef.current ? ' and your photo' : ''}.`
                    : `Add it with your price — pre-filled from this search${searchFileRef.current ? ' and photo' : ''}.`
                })()}
              </p>
            </div>
          </Card>
        )}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => <Card key={i} className="p-4 space-y-3"><Skeleton className="h-3 w-20" /><Skeleton className="h-5 w-3/4" /><Skeleton className="h-3 w-1/2" /><Skeleton className="h-16 w-full" /><Skeleton className="h-3 w-full" /></Card>)}
        </div>
      ) : posts.length === 0 ? (
        <Card className="p-6 sm:p-10 text-center shadow-sm">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-accent mb-3"><PackageOpen className="w-6 h-6 text-primary" /></div>
          <h3 className="font-semibold text-foreground">No local price posts found</h3>
          <p className="mt-1 text-sm text-muted-foreground max-w-md mx-auto">
            {searchResults && searchResults.localMatches.length > 0
              ? `The camera search found ${searchResults.localMatches.length} matching price${searchResults.localMatches.length !== 1 ? 's' : ''} — see the results panel above. Or adjust your filters below.`
              : 'No posts match your filters. Try adjusting search or filters · or be the first to post a local price!'}
          </p>
          <Button onClick={() => { setPostPrefill(null); setModalOpen(true) }} className="mt-5 bg-primary hover:bg-primary/90 gap-1.5"><Plus className="w-4 h-4" /> Post a Local Price</Button>
        </Card>
      ) : (
        <>
          <p className="text-xs text-muted-foreground px-1">{posts.length} local price post{posts.length !== 1 && 's'} found</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {posts.map((p) => (
              <LocalPriceCard key={p.id} post={p} onOpen={setDetailPostId} onVote={handleVote} onAuthorClick={setProfileUserId} onDelete={handleDelete} canDelete={!!currentUserId && p.authorId === currentUserId} onEdit={handleEditPost} canEdit={!!currentUserId && p.authorId === currentUserId} />
            ))}
          </div>
        </>
      )}

      <CreatePricePostModal open={modalOpen} onOpenChange={setModalOpen} onCreated={() => { setPostPrefill(null); handleCreated() }} prefill={postPrefill} />
      <EditPricePostModal open={editModalOpen} onOpenChange={setEditModalOpen} post={editPost} onSaved={() => { fetchPosts(); onRefreshUser() }} />
      <PriceDetailModal postId={detailPostId} onClose={() => setDetailPostId(null)} onAuthorClick={setProfileUserId} />
      <LocalProfileModal userId={profileUserId} onClose={() => setProfileUserId(null)} onOpenPost={setDetailPostId} />
      <PriceLensModal
        open={pricelensOpen}
        onOpenChange={setPricelensOpen}
        onPickItem={(label) => {
          setSearch(label)
          setSearchResults(null)
          setSearchImage(null)
        }}
      />
    </div>
  )
}

function PhotoSearchButton({ onImage, loading, onInitiate, onMenuAction }: { onImage: (file: File) => void; loading: boolean; onInitiate?: () => void; onMenuAction?: (action: 'name' | 'location') => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()
  const [menuOpen, setMenuOpen] = useState(false)
  return (
    <>
      <input type="file" accept="image/*" ref={inputRef} onChange={(e) => { const f = e.target.files?.[0]; if (f) onImage(f); if (inputRef.current) inputRef.current.value = '' }} className="hidden" />
      <div className="relative shrink-0">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            if (SCAN_COMING_SOON) {
              toast({ title: 'Camera search is coming soon', description: 'Camera search will be available in a future update.' })
              return
            }
            // Start resolving the user's location NOW (user gesture — required
            // for the geolocation permission prompt) so it is ready by the time
            // the photo is chosen, enabling the location-based price compare.
            onInitiate?.()
            setMenuOpen((o) => !o)
          }}
          disabled={loading}
          className="bg-card border-primary/30 gap-1.5 h-9 px-3 text-xs"
          title="Search by photo, by name, or compare prices in another location"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" /> : <Camera className="w-3.5 h-3.5 text-primary" />}
          <span className="hidden sm:inline">Camera search</span><span className="sm:hidden">Search</span>
          {SCAN_COMING_SOON && <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700">Soon</span>}
        </Button>
        {/* Options menu — take a photo, search by name first (no photo
            needed), or compare prices in a chosen location. */}
        {menuOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} aria-hidden="true" />
            <div className="absolute right-0 top-full mt-1.5 z-50 w-64 rounded-xl border border-border bg-card shadow-lg p-1.5 space-y-0.5">
              <button
                onClick={() => { setMenuOpen(false); inputRef.current?.click() }}
                className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-accent transition-colors space-y-0.5"
              >
                <p className="text-sm font-medium text-foreground flex items-center gap-2"><Camera className="w-4 h-4 text-primary shrink-0" />Take photo or upload</p>
                <p className="text-[11px] text-muted-foreground">AI identifies the product from a picture</p>
              </button>
              <button
                onClick={() => { setMenuOpen(false); onMenuAction?.('name') }}
                className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-accent transition-colors space-y-0.5"
              >
                <p className="text-sm font-medium text-foreground flex items-center gap-2"><PenLine className="w-4 h-4 text-primary shrink-0" />Search by name first</p>
                <p className="text-[11px] text-muted-foreground">Type the product name — no photo needed</p>
              </button>
              <button
                onClick={() => { setMenuOpen(false); onMenuAction?.('location') }}
                className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-accent transition-colors space-y-0.5"
              >
                <p className="text-sm font-medium text-foreground flex items-center gap-2"><MapPin className="w-4 h-4 text-emerald-600 shrink-0" />Compare by location</p>
                <p className="text-[11px] text-muted-foreground">Pick the city or country to compare prices in</p>
              </button>
            </div>
          </>
        )}
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
          {post.currency} {post.priceMin}{post.priceMin !== post.priceMax ? `–${post.priceMax}` : ''}
        </span>
      </div>
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <MapPin className="w-3 h-3 shrink-0" />
        <span className="truncate">{[post.city, post.country].filter(Boolean).join(', ')}</span>
        {post.author?.verifiedLocal && <BadgeCheck className="w-3 h-3 text-emerald-500 shrink-0" />}
        <span className="truncate">{post.author?.name}</span>
      </div>
    </button>
  )
}

// Location key for a match — used by the "Compare by location" breakdown
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
// AI estimate — only when both exist in the SAME currency (honest: no FX
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
  if (diffPct <= -25) return ` — a great local deal, ~${-diffPct}% below the AI estimate`
  if (diffPct < 15) return ' — in line with the AI estimate'
  return ` — ~${diffPct}% above the AI estimate, haggle or look around`
}

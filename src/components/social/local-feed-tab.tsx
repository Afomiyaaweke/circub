'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { MapPin, Plus, Search, SlidersHorizontal, Sparkles, PackageOpen, Camera, X, Loader2, BadgeCheck, ScanLine } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { LocalPriceCard } from './local-price-card'
import { CreatePricePostModal } from './create-price-post-modal'
import { EditPricePostModal } from './edit-price-post-modal'
import { PriceDetailModal } from './price-detail-modal'
import { LocalProfileModal } from './local-profile-modal'
import { PriceLensModal } from './pricelens-modal'
import { useToast } from '@/hooks/use-toast'
import { authFetch } from '@/lib/auth-fetch'
import { resolveCurrentLocation, type ResolvedLocation } from '@/lib/location'
import type { LocalPricePost } from '@/lib/types'

// Camera scan + camera search are LIVE — clicking either entry point opens the
// camera/search flow (AI identifies the item, then compares the AI price
// estimate against real local price posts). Flip to true to hold them behind
// a "Soon" badge again (e.g. while the AI backend is unavailable).
const SCAN_COMING_SOON = false

interface LocalFeedTabProps {
  onRefreshUser: () => void
}

type SortKey = 'recent' | 'popular'

export function LocalFeedTab({ onRefreshUser }: LocalFeedTabProps) {
  const [posts, setPosts] = useState<LocalPricePost[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [country, setCountry] = useState('All countries')
  const [city, setCity] = useState('All cities')
  const [category, setCategory] = useState('All categories')
  const [sort, setSort] = useState<SortKey>('recent')
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
      params.set('sort', sort)
      const res = await fetch(`/api/local-prices?${params.toString()}`)
      const data = await res.json()
      setPosts(data.posts || [])
    } catch { setPosts([]) } finally { setLoading(false) }
  }, [search, country, city, category, sort])

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

  const handleImageSearch = async (file: File) => {
    setSearchingByImage(true)
    try {
      // Location for the price comparison — the click already kicked off the
      // resolve (kickLocation); wait for it briefly (IP fallback resolves in
      // ~1-2s, GPS may need longer — don't block the search on it).
      let loc = userLocation
      if (!loc && locationPromiseRef.current) {
        loc = await Promise.race([
          locationPromiseRef.current,
          new Promise<null>((r) => setTimeout(() => r(null), 4000)),
        ])
        if (loc) setUserLocation(loc)
      }
      const formData = new FormData()
      formData.append('file', file)
      if (loc) formData.append('location', JSON.stringify({ city: loc.city, country: loc.country, countryCode: loc.countryCode }))
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
          <Button onClick={() => setModalOpen(true)} className="bg-primary hover:bg-primary/90 gap-1.5 shadow-sm shrink-0 h-9 sm:h-10 px-3 sm:px-4">
            <Plus className="w-4 h-4" /> <span className="text-xs sm:text-sm">Post Price</span>
          </Button>
        </div>
      </Card>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[140px] sm:min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 bg-card h-9 sm:h-10 text-sm" />
        </div>
        <PhotoSearchButton onImage={handleImageSearch} loading={searchingByImage} onInitiate={kickLocation} />
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

        {/* AI search results panel — shows after a camera capture or image
            upload. Contains the AI identification + price estimate (in the
            user's local currency) + matching local posts ranked by location,
            so the user can compare AI vs real local prices near them. */}
        {searchResults && (
          <Card className="p-4 shadow-sm border-primary/20 space-y-3">
            <div className="flex items-start gap-3">
              <img src={searchResults.imageUrl} alt="Captured" className="w-16 h-16 rounded-lg object-cover shrink-0 border border-border" />
              <div className="flex-1 min-w-0 space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold bg-primary/10 text-primary px-2 py-0.5 rounded-full">AI identified</span>
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
            {!searchResults.locationCompare && searchResults.localMatches.length === 0 && searchResults.location && (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 shrink-0" />
                No local prices near {searchResults.location.city || searchResults.location.country} yet — be the first to post one!
              </p>
            )}

            {/* Local price matches — real prices from locals, grouped by how
                close they are to the user's location. */}
            {searchResults.localMatches.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-border">
                <p className="text-xs font-semibold text-emerald-700 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  {searchResults.localMatches.length} local price{searchResults.localMatches.length !== 1 && 's'} found
                </p>
                {(() => {
                  const near = searchResults.localMatches.filter((m) => m.locMatch === 'city' || m.locMatch === 'country')
                  const elsewhere = searchResults.localMatches.filter((m) => m.locMatch !== 'city' && m.locMatch !== 'country')
                  return (
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
                  )
                })()}
              </div>
            )}
          </Card>
        )}
        <Select value={country} onValueChange={setCountry}>
          <SelectTrigger className="w-full sm:w-[160px] bg-card h-9 sm:h-10 text-sm"><MapPin className="w-3.5 h-3.5 mr-1.5 text-muted-foreground shrink-0" /><SelectValue placeholder="All countries" /></SelectTrigger>
          <SelectContent><SelectItem value="All countries">All countries</SelectItem>{filterValues.countries.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={city} onValueChange={setCity}>
          <SelectTrigger className="w-full sm:w-[150px] bg-card h-9 sm:h-10 text-sm"><SelectValue placeholder="All cities" /></SelectTrigger>
          <SelectContent><SelectItem value="All cities">All cities</SelectItem>{filterValues.cities.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-full sm:w-[160px] bg-card h-9 sm:h-10 text-sm"><SelectValue placeholder="All categories" /></SelectTrigger>
          <SelectContent><SelectItem value="All categories">All categories</SelectItem>{filterValues.categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
          <SelectTrigger className="w-full sm:w-[140px] bg-card h-9 sm:h-10 text-sm"><SlidersHorizontal className="w-3.5 h-3.5 mr-1.5 text-muted-foreground shrink-0" /><SelectValue placeholder="Sort" /></SelectTrigger>
          <SelectContent><SelectItem value="recent">Most recent</SelectItem><SelectItem value="popular">Most helpful</SelectItem></SelectContent>
        </Select>
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
          <Button onClick={() => setModalOpen(true)} className="mt-5 bg-primary hover:bg-primary/90 gap-1.5"><Plus className="w-4 h-4" /> Post a Local Price</Button>
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

      <CreatePricePostModal open={modalOpen} onOpenChange={setModalOpen} onCreated={handleCreated} />
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

function PhotoSearchButton({ onImage, loading, onInitiate }: { onImage: (file: File) => void; loading: boolean; onInitiate?: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()
  return (
    <>
      <input type="file" accept="image/*" ref={inputRef} onChange={(e) => { const f = e.target.files?.[0]; if (f) onImage(f); if (inputRef.current) inputRef.current.value = '' }} className="hidden" />
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
          inputRef.current?.click()
        }}
        disabled={loading}
        className="bg-card border-primary/30 gap-1.5 h-9 px-3 text-xs shrink-0"
        title="Search by taking a photo or uploading an image. AI will analyze it, then compare prices near you."
      >
        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" /> : <Camera className="w-3.5 h-3.5 text-primary" />}
        <span className="hidden sm:inline">Camera search</span><span className="sm:hidden">Search</span>
        {SCAN_COMING_SOON && <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700">Soon</span>}
      </Button>
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

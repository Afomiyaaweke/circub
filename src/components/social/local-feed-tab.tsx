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
import type { LocalPricePost } from '@/lib/types'

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
  // AI search results — shown in a panel above the feed after a camera
  // capture or image upload. Contains the AI identification + price
  // estimate + matching local posts.
  const [searchResults, setSearchResults] = useState<{
    aiDescription: string
    aiPriceEstimate: { min: number; max: number; currency: string } | null
    localMatches: any[]
    keywords: string
    imageUrl: string
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
      const formData = new FormData()
      formData.append('file', file)
      const vlmRes = await fetch('/api/visual-search', { method: 'POST', body: formData })
      if (!vlmRes.ok) { const e = await vlmRes.json(); throw new Error(e.error || 'Visual search failed') }
      const vlmData = await vlmRes.json()
      const keywords: string = (vlmData.keywords || '').trim()
      const imageUrl = URL.createObjectURL(file)
      if (!keywords) { toast({ title: 'No keywords detected', description: 'Could not identify any search terms from the image.', variant: 'destructive' }); return }
      const firstKeyword = keywords.split(',')[0].trim()
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
      })
      const localCount = Array.isArray(vlmData.localMatches) ? vlmData.localMatches.length : 0
      toast({
        title: 'AI identified: ' + firstKeyword,
        description: vlmData.aiUsed
          ? `${vlmData.aiDescription || ''}${localCount > 0 ? ` · ${localCount} local price${localCount !== 1 ? 's' : ''} found` : ' · no local prices yet'}`
          : 'AI analysis unavailable, using filename',
      })
    } catch (e) {
      toast({ title: 'Visual search failed', description: (e as Error).message, variant: 'destructive' })
    } finally { setSearchingByImage(false) }
  }

  const handleClearSearch = () => {
    setSearch('')
    setSearchImage(null)
    setSearchResults(null)
  }

  const handleVote = async (postId: string, voteType: 'HELPFUL' | 'NOT_ACCURATE') => {
    try {
      const res = await fetch(`/api/local-prices/${postId}/vote`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ voteType }) })
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
        <PhotoSearchButton onImage={handleImageSearch} loading={searchingByImage} />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setPricelensOpen(true)}
          disabled={searchingByImage}
          className="bg-card border-emerald-500/40 gap-1.5 h-9 px-3 text-xs shrink-0 hover:bg-emerald-50"
          title="Open PriceLens — point your camera at a product, AI identifies it and finds live local prices"
        >
          <ScanLine className="w-3.5 h-3.5 text-emerald-600" />
          <span className="hidden sm:inline">Scan with camera</span>
          <span className="sm:hidden">Scan</span>
        </Button>
        {searchImage && (
          <div className="relative inline-flex items-center gap-2 px-2 py-1.5 rounded-md border border-primary/40 bg-primary/5">
            <img src={searchImage} alt="Search by image" className="w-6 h-6 rounded object-cover" />
            <span className="text-xs text-foreground truncate max-w-[120px]">{search}</span>
            <button onClick={handleClearSearch} className="p-0.5 rounded hover:bg-accent text-muted-foreground" aria-label="Clear image search"><X className="w-3.5 h-3.5" /></button>
          </div>
        )}

        {/* AI search results panel — shows after a camera capture or image
            upload. Contains the AI identification + price estimate + matching
            local posts, so the user can see both sources at a glance. */}
        {searchResults && (
          <Card className="p-4 shadow-sm border-primary/20 space-y-3">
            <div className="flex items-start gap-3">
              <img src={searchResults.imageUrl} alt="Captured" className="w-16 h-16 rounded-lg object-cover shrink-0 border border-border" />
              <div className="flex-1 min-w-0 space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold bg-primary/10 text-primary px-2 py-0.5 rounded-full">AI identified</span>
                  <span className="text-xs text-muted-foreground truncate">{searchResults.keywords}</span>
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

            {/* Local price matches — real prices from locals in the DB */}
            {searchResults.localMatches.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-border">
                <p className="text-xs font-semibold text-emerald-700 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  {searchResults.localMatches.length} local price{searchResults.localMatches.length !== 1 && 's'} found
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {searchResults.localMatches.slice(0, 6).map((post: any) => (
                    <button
                      key={post.id}
                      onClick={() => setDetailPostId(post.id)}
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
                  ))}
                </div>
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
          <p className="mt-1 text-sm text-muted-foreground max-w-md mx-auto">No posts match your filters. Try adjusting search or filters · or be the first to post a local price!</p>
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

function PhotoSearchButton({ onImage, loading }: { onImage: (file: File) => void; loading: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <>
      <input type="file" accept="image/*" ref={inputRef} onChange={(e) => { const f = e.target.files?.[0]; if (f) onImage(f); if (inputRef.current) inputRef.current.value = '' }} className="hidden" />
      <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={loading} className="bg-card border-primary/30 gap-1.5 h-9 px-3 text-xs shrink-0" title="Search by taking a photo or uploading an image. AI will analyze it and recommend matching prices.">
        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" /> : <Camera className="w-3.5 h-3.5 text-primary" />}
        <span className="hidden sm:inline">Camera search</span><span className="sm:hidden">Search</span>
      </Button>
    </>
  )
}

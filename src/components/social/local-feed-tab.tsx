'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { MapPin, Plus, Search, SlidersHorizontal, Sparkles, PackageOpen, Camera, X, Loader2 } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { LocalPriceCard } from './local-price-card'
import { CreatePricePostModal } from './create-price-post-modal'
import { PriceDetailModal } from './price-detail-modal'
import { LocalProfileModal } from './local-profile-modal'
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
  const [detailPostId, setDetailPostId] = useState<string | null>(null)
  const [profileUserId, setProfileUserId] = useState<string | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [searchImage, setSearchImage] = useState<string | null>(null)
  const [searchingByImage, setSearchingByImage] = useState(false)
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
      if (!keywords) { toast({ title: 'No keywords detected', description: 'Could not identify any search terms from the image.', variant: 'destructive' }); return }
      const firstKeyword = keywords.split(',')[0].trim()
      setSearch(firstKeyword)
      setSearchImage(URL.createObjectURL(file))
      toast({ title: 'AI recommends: ' + firstKeyword, description: vlmData.aiUsed ? 'AI identified: ' + keywords : 'Search keywords: ' + keywords + ' (AI analysis unavailable, using filename)' })
    } catch (e) {
      toast({ title: 'Visual search failed', description: (e as Error).message, variant: 'destructive' })
    } finally { setSearchingByImage(false) }
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
      <Card className="p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary shrink-0" />
              <h2 className="text-lg font-bold text-foreground truncate">Local Price Feed</h2>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Real prices from verified locals. Find what travelers actually pay · and what locals actually charge.</p>
          </div>
          <Button onClick={() => setModalOpen(true)} className="bg-primary hover:bg-primary/90 gap-1.5 shadow-sm">
            <Plus className="w-4 h-4" /> Post a Local Price
          </Button>
        </div>
      </Card>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input placeholder="Search products, services, places..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 bg-card" />
        </div>
        <PhotoSearchButton onImage={handleImageSearch} loading={searchingByImage} />
        {searchImage && (
          <div className="relative inline-flex items-center gap-2 px-2 py-1.5 rounded-md border border-primary/40 bg-primary/5">
            <img src={searchImage} alt="Search by image" className="w-6 h-6 rounded object-cover" />
            <span className="text-xs text-foreground truncate max-w-[120px]">{search}</span>
            <button onClick={() => { setSearch(''); setSearchImage(null) }} className="p-0.5 rounded hover:bg-accent text-muted-foreground" aria-label="Clear image search"><X className="w-3.5 h-3.5" /></button>
          </div>
        )}
        <Select value={country} onValueChange={setCountry}>
          <SelectTrigger className="w-[140px] sm:w-[160px] bg-card"><MapPin className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" /><SelectValue placeholder="All countries" /></SelectTrigger>
          <SelectContent><SelectItem value="All countries">All countries</SelectItem>{filterValues.countries.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={city} onValueChange={setCity}>
          <SelectTrigger className="w-[130px] sm:w-[150px] bg-card"><SelectValue placeholder="All cities" /></SelectTrigger>
          <SelectContent><SelectItem value="All cities">All cities</SelectItem>{filterValues.cities.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-[140px] sm:w-[160px] bg-card"><SelectValue placeholder="All categories" /></SelectTrigger>
          <SelectContent><SelectItem value="All categories">All categories</SelectItem>{filterValues.categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
          <SelectTrigger className="w-[120px] sm:w-[140px] bg-card"><SlidersHorizontal className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" /><SelectValue placeholder="Sort" /></SelectTrigger>
          <SelectContent><SelectItem value="recent">Most recent</SelectItem><SelectItem value="popular">Most helpful</SelectItem></SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => <Card key={i} className="p-4 space-y-3"><Skeleton className="h-3 w-20" /><Skeleton className="h-5 w-3/4" /><Skeleton className="h-3 w-1/2" /><Skeleton className="h-16 w-full" /><Skeleton className="h-3 w-full" /></Card>)}
        </div>
      ) : posts.length === 0 ? (
        <Card className="p-10 text-center shadow-sm">
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
              <LocalPriceCard key={p.id} post={p} onOpen={setDetailPostId} onVote={handleVote} onAuthorClick={setProfileUserId} onDelete={handleDelete} canDelete={!!currentUserId && p.authorId === currentUserId} />
            ))}
          </div>
        </>
      )}

      <CreatePricePostModal open={modalOpen} onOpenChange={setModalOpen} onCreated={handleCreated} />
      <PriceDetailModal postId={detailPostId} onClose={() => setDetailPostId(null)} onAuthorClick={setProfileUserId} />
      <LocalProfileModal userId={profileUserId} onClose={() => setProfileUserId(null)} onOpenPost={setDetailPostId} />
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

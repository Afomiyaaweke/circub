'use client'

import Link from 'next/link'
// Live Zone - registered tour guides.
// New in this version:
//  - AI Guide Match: ask any travel question (or pick one straight from the
//    community feed) and get recommended guides + locations with reasons.
//  - "Near me": GPS-based distance sort (haversine via the city table).
//  - Tourist star ratings are visible on every card with review count;
//    tapping them opens the full reviews dialog.
import { useState, useEffect, useCallback } from 'react'
import {
  Search, Compass, MapPin, Languages, Award, DollarSign, Star, BadgeCheck,
  MessageSquare, Radio, Share2, Sparkles, Navigation, Loader2, ChevronDown,
  ChevronUp, Lightbulb, Users, CalendarCheck, CalendarDays, ShieldCheck,
  Play, Video,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { getCoordinates } from '@/lib/location'
import { splitVideoUrls } from '@/lib/video'
import { guideRolesOrLegacy, ROLE_META, roleListLabel } from '@/lib/roles'
import { VideoEmbed } from './video-embed'
import { useProgressiveList } from '@/lib/use-progressive-list'
import { GuideRatingModal } from './guide-rating-modal'
import { GuideReviewsModal, GuideStars } from './guide-reviews-modal'
import { GuideBookingModal, BookingGuideInfo } from './guide-booking-modal'
import { GuideBookingsModal } from './guide-bookings-modal'
import type { User } from '@/lib/types'

interface LiveZoneTabProps {
  me: User | null
  onMessage: (userId: string) => void
  onBecomeGuide: () => void
  onToggleAvailability: () => void
}

interface AiGuideResult {
  id: string
  name: string
  username?: string | null
  location?: string | null
  profilePicture?: string | null
  avatarColor?: string
  rating?: number
  ratingCount?: number
  distanceKm?: number | null
  verifiedLocal?: boolean
  guideLicense?: string | null
  guideLanguages: string[]
  guideSpecialties: string[]
  guideHourlyRate?: number | null
  guideCurrency?: string | null
  guideAvailable?: boolean
  reason?: string
}

interface AiMatchResult {
  summary: string
  guides: AiGuideResult[]
  locations: Array<{ name: string; area: string; why: string; tip: string }>
  tier?: string
}

const EXAMPLE_QUESTIONS = [
  'Where should I eat injera in Addis?',
  'Who can show me the rock churches of Lalibela?',
  'Best trekking guide for the Simien Mountains?',
]

// Feed posts that read like travel questions become one-tap match chips.
const QUESTION_RE = /\?|^(what|where|when|who|how|which|can|should|is|are|any|looking|recommend|help|need)\b/i

const TIER_LABEL: Record<string, string> = {
  ai: 'AI match',
  'ai-narrow': 'AI shortlist',
  keyword: 'Keyword match',
  none: 'No guides yet',
}

export function LiveZoneTab({ me, onMessage, onBecomeGuide, onToggleAvailability }: LiveZoneTabProps) {
  const [guides, setGuides] = useState<any[]>([])
  // Load part by part: render a small batch first, append more on scroll
  const { visible: visibleGuides, hasMore: guidesHasMore, sentinelRef: guidesSentinelRef } = useProgressiveList(guides, 6, 6)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [language, setLanguage] = useState('')
  const [specialty, setSpecialty] = useState('')
  const [availableOnly, setAvailableOnly] = useState(false)

  // Near-me (GPS distance sort)
  const [nearMe, setNearMe] = useState(false)
  const [myCoords, setMyCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [locating, setLocating] = useState(false)

  // AI guide match
  const [aiQuestion, setAiQuestion] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiResult, setAiResult] = useState<AiMatchResult | null>(null)
  const [aiError, setAiError] = useState<string | null>(null)
  const [aiUseLocation, setAiUseLocation] = useState(true)
  const [feedQs, setFeedQs] = useState<string[]>([])
  const [feedQsLoading, setFeedQsLoading] = useState(false)
  const [showFeedQs, setShowFeedQs] = useState(false)
  // AI Guide Match form collapsed to a small button by default - expands on tap.
  const [aiOpen, setAiOpen] = useState(false)

  // Modals
  const [ratingGuide, setRatingGuide] = useState<{ id: string; name: string; profilePicture?: string | null } | null>(null)
  const [ratingModalOpen, setRatingModalOpen] = useState(false)
  const [reviewsGuide, setReviewsGuide] = useState<{ id: string; name: string } | null>(null)
  const [reviewsOpen, setReviewsOpen] = useState(false)
  const [bookingGuide, setBookingGuide] = useState<BookingGuideInfo | null>(null)
  const [bookingOpen, setBookingOpen] = useState(false)
  const [bookingsOpen, setBookingsOpen] = useState(false)
  const [pendingBookings, setPendingBookings] = useState(0)
  // Per-card collapsible "Tour videos" strip (guide videos from links)
  const [openVideoCards, setOpenVideoCards] = useState<Record<string, boolean>>({})
  const { toast } = useToast()

  // Refetch when the member's own registration changes (isGuide / roles) so
  // a just-saved registration shows its new role badges instantly - no
  // manual refresh, no tab flit required.
  const meRolesKey = `${me?.isGuide ? 1 : 0}:${JSON.stringify((me as any)?.guideRoles ?? null)}`

  const fetchGuides = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (language) params.set('language', language)
      if (specialty) params.set('specialty', specialty)
      if (availableOnly) params.set('available', 'true')
      if (nearMe && myCoords) {
        params.set('lat', String(myCoords.lat))
        params.set('lng', String(myCoords.lng))
      }
      const res = await fetch(`/api/guides?${params.toString()}`)
      const data = await res.json()
      setGuides(data.guides || [])
    } catch { setGuides([]) } finally { setLoading(false) }
  }, [search, language, specialty, availableOnly, nearMe, myCoords, meRolesKey])

  useEffect(() => {
    const t = setTimeout(fetchGuides, 250)
    return () => clearTimeout(t)
  }, [fetchGuides])

  const handleNearMe = async () => {
    if (nearMe) { setNearMe(false); return } // toggle back to rating sort
    setLocating(true)
    try {
      const { coords, error } = await getCoordinates()
      if (!coords) {
        toast({ title: 'Could not get your location', description: error || 'Enable GPS and try again.', variant: 'destructive' })
        return
      }
      setMyCoords({ lat: coords.lat, lng: coords.lng })
      setNearMe(true)
      toast({ title: 'Sorted by distance', description: 'Guides nearest to you are shown first.' })
    } finally {
      setLocating(false)
    }
  }

  const loadFeedQuestions = useCallback(async () => {
    setFeedQsLoading(true)
    try {
      const res = await fetch('/api/posts?limit=40')
      const data = await res.json()
      const qs: string[] = ((data.posts || []) as Array<{ content?: string }>)
        .map((p) => String(p.content || '').replace(/\s+/g, ' ').trim())
        .filter((c: string) => c.length >= 15 && c.length <= 160 && QUESTION_RE.test(c))
      setFeedQs(Array.from(new Set<string>(qs)).slice(0, 5))
    } catch { setFeedQs([]) } finally { setFeedQsLoading(false) }
  }, [])

  useEffect(() => { loadFeedQuestions() }, [loadFeedQuestions])

  // Pending incoming booking count for the header badge.
  const loadBookingCount = useCallback(async () => {
    try {
      const res = await fetch('/api/bookings')
      if (!res.ok) return
      const data = await res.json()
      setPendingBookings(data.pendingCount || 0)
    } catch { /* badge is best-effort */ }
  }, [])

  useEffect(() => { loadBookingCount() }, [loadBookingCount])

  const runAiMatch = async (q: string) => {
    const question = q.trim()
    if (!question || aiLoading) return
    setAiQuestion(question)
    setAiLoading(true)
    setAiResult(null)
    setAiError(null)
    try {
      const body: Record<string, unknown> = { question }
      if (aiUseLocation && myCoords) {
        body.lat = myCoords.lat
        body.lng = myCoords.lng
      }
      const res = await fetch('/api/guides/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Recommendation failed')
      setAiResult(data)
      // Tuck the form away once a match is ready - the result stays visible
      // under the slim header, keeping the Guides page clean.
      setAiOpen(false)
    } catch (e) {
      setAiError((e as Error).message || 'Something went wrong')
    } finally {
      setAiLoading(false)
    }
  }

  const openReviews = (g: { id: string; name: string }) => {
    setReviewsGuide(g)
    setReviewsOpen(true)
  }

  const openRating = (g: { id: string; name: string; profilePicture?: string | null }) => {
    setRatingGuide(g)
    setRatingModalOpen(true)
  }

  const openBooking = (g: { id: string; name: string; profilePicture?: string | null; location?: string | null; rating?: number | null; ratingCount?: number | null; guideHourlyRate?: number | null; guideCurrency?: string | null; guideAvailable?: boolean }) => {
    if (!me) {
      toast({ title: 'Log in to book', description: 'Create an account or log in to request a tour.', variant: 'destructive' })
      return
    }
    setBookingGuide({
      id: g.id, name: g.name, profilePicture: g.profilePicture, location: g.location,
      rating: g.rating, ratingCount: g.ratingCount, guideHourlyRate: g.guideHourlyRate,
      guideCurrency: g.guideCurrency, guideAvailable: g.guideAvailable,
    })
    setBookingOpen(true)
  }

  const isGuide = me?.isGuide
  const isAvailable = (me as any)?.guideAvailable

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card className="p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Compass className="w-5 h-5 text-primary shrink-0" />
              <h2 className="text-lg font-bold text-foreground truncate">Live Zone</h2>
              {guides.length > 0 && (
                <Badge variant="secondary" className="bg-primary/10 text-primary text-[10px]">
                  {guides.length} member{guides.length !== 1 && 's'}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Find registered guides, vloggers, locals and volunteers from the community. Message them directly.
            </p>
          </div>
          {!isGuide ? (
            <Button onClick={onBecomeGuide} className="bg-primary hover:bg-primary/90 gap-1.5 shrink-0">
              <Compass className="w-4 h-4" />
              Join as a local
            </Button>
          ) : (
            <div className="flex items-center gap-2 shrink-0">
              <Button
                onClick={onBecomeGuide}
                variant="outline"
                className="gap-1.5 shrink-0"
                title="Edit your guide profile or replace your ID/passport document"
              >
                <ShieldCheck className="w-4 h-4" />
                <span className="hidden sm:inline">Guide profile</span>
              </Button>
              <Button
                onClick={onToggleAvailability}
                variant="outline"
                className={cn(
                  'gap-1.5 shrink-0',
                  isAvailable
                    ? 'border-emerald-500 text-emerald-600 bg-emerald-50 hover:bg-emerald-100'
                    : 'border-muted text-muted-foreground'
                )}
              >
                <Radio className={cn('w-4 h-4', isAvailable && 'animate-pulse')} />
                {isAvailable ? 'Available' : 'Offline'}
              </Button>
            </div>
          )}
          <Button
            onClick={() => setBookingsOpen(true)}
            variant="outline"
            className="gap-1.5 shrink-0 relative"
          >
            <CalendarCheck className="w-4 h-4" />
            Bookings
            {pendingBookings > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-semibold flex items-center justify-center">
                {pendingBookings > 9 ? '9+' : pendingBookings}
              </span>
            )}
          </Button>
        </div>
      </Card>

      {/* Search bar - one unified pill (mirrors the Local Price feed). The
          search accepts comma-separated terms ("Addis, English, Hiking"):
          each term matches name, bio, languages, specialties or location and
          the terms are AND-ed. The standalone "City or country" input is
          gone - locations are simply search terms now. */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center flex-1 basis-full sm:basis-auto min-w-[200px] flex-wrap rounded-lg border border-input bg-card shadow-xs overflow-hidden">
          <div className="relative flex-1 basis-full sm:basis-auto sm:min-w-[180px] min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search guides - e.g. Addis, English, Hiking"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 text-sm bg-transparent border-0 rounded-none shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-transparent"
            />
          </div>
          <div className="hidden sm:block w-px h-5 bg-border shrink-0" />
        {/* Language filter - world-class list */}
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          className={
            'h-9 pl-2.5 pr-3 text-xs sm:text-sm basis-1/2 sm:basis-auto sm:flex-none sm:w-[150px] min-w-0 bg-transparent rounded-none shadow-none border-0 border-t border-input sm:border-t-0 focus:outline-none focus:ring-0 cursor-pointer ' +
            (language ? 'text-emerald-700 dark:text-emerald-400 font-medium' : 'text-foreground')
          }
        >
          <option value="">All languages</option>
          <optgroup label="Africa">
            <option value="Amharic">Amharic</option>
            <option value="Swahili">Swahili</option>
            <option value="Arabic">Arabic</option>
            <option value="Oromo">Oromo</option>
            <option value="Tigrinya">Tigrinya</option>
            <option value="Yoruba">Yoruba</option>
            <option value="Igbo">Igbo</option>
            <option value="Hausa">Hausa</option>
            <option value="Zulu">Zulu</option>
            <option value="Xhosa">Xhosa</option>
            <option value="Somali">Somali</option>
            <option value="Shona">Shona</option>
            <option value="Kinyarwanda">Kinyarwanda</option>
            <option value="Lingala">Lingala</option>
            <option value="Wolof">Wolof</option>
            <option value="Malagasy">Malagasy</option>
            <option value="Twi">Twi</option>
          </optgroup>
          <optgroup label="Europe">
            <option value="English">English</option>
            <option value="French">French</option>
            <option value="Spanish">Spanish</option>
            <option value="Portuguese">Portuguese</option>
            <option value="German">German</option>
            <option value="Italian">Italian</option>
            <option value="Dutch">Dutch</option>
            <option value="Russian">Russian</option>
            <option value="Polish">Polish</option>
            <option value="Swedish">Swedish</option>
            <option value="Norwegian">Norwegian</option>
            <option value="Danish">Danish</option>
            <option value="Finnish">Finnish</option>
            <option value="Greek">Greek</option>
            <option value="Turkish">Turkish</option>
            <option value="Czech">Czech</option>
            <option value="Romanian">Romanian</option>
            <option value="Hungarian">Hungarian</option>
            <option value="Ukrainian">Ukrainian</option>
            <option value="Catalan">Catalan</option>
          </optgroup>
          <optgroup label="Asia">
            <option value="Mandarin">Mandarin</option>
            <option value="Cantonese">Cantonese</option>
            <option value="Japanese">Japanese</option>
            <option value="Korean">Korean</option>
            <option value="Hindi">Hindi</option>
            <option value="Bengali">Bengali</option>
            <option value="Tamil">Tamil</option>
            <option value="Telugu">Telugu</option>
            <option value="Urdu">Urdu</option>
            <option value="Persian">Persian</option>
            <option value="Thai">Thai</option>
            <option value="Vietnamese">Vietnamese</option>
            <option value="Indonesian">Indonesian</option>
            <option value="Malay">Malay</option>
            <option value="Tagalog">Tagalog</option>
            <option value="Khmer">Khmer</option>
            <option value="Burmese">Burmese</option>
            <option value="Nepali">Nepali</option>
            <option value="Sinhala">Sinhala</option>
            <option value="Kazakh">Kazakh</option>
          </optgroup>
          <optgroup label="Middle East">
            <option value="Hebrew">Hebrew</option>
            <option value="Kurdish">Kurdish</option>
            <option value="Pashto">Pashto</option>
            <option value="Dari">Dari</option>
          </optgroup>
          <optgroup label="Americas">
            <option value="Quechua">Quechua</option>
            <option value="Guarani">Guarani</option>
            <option value="Haitian Creole">Haitian Creole</option>
          </optgroup>
          <optgroup label="Sign Language">
            <option value="Sign Language (ASL)">Sign Language (ASL)</option>
            <option value="Sign Language (BSL)">Sign Language (BSL)</option>
          </optgroup>
        </select>
        {/* Specialty filter - expanded list */}
        <select
          value={specialty}
          onChange={(e) => setSpecialty(e.target.value)}
          className={
            'h-9 pl-2.5 pr-3 text-xs sm:text-sm basis-1/2 sm:basis-auto sm:flex-none sm:w-[150px] min-w-0 bg-transparent rounded-none shadow-none border-0 border-t border-input sm:border-t-0 sm:border-l focus:outline-none focus:ring-0 cursor-pointer ' +
            (specialty ? 'text-emerald-700 dark:text-emerald-400 font-medium' : 'text-foreground')
          }
        >
          <option value="">All specialties</option>
          <option value="Historical">Historical</option>
          <option value="Food">Food & Culinary</option>
          <option value="Adventure">Adventure</option>
          <option value="Cultural">Cultural</option>
          <option value="Nature">Nature & Wildlife</option>
          <option value="Photography">Photography</option>
          <option value="Shopping">Shopping</option>
          <option value="Nightlife">Nightlife</option>
          <option value="Religious">Religious</option>
          <option value="Architecture">Architecture</option>
          <option value="Beach">Beach & Islands</option>
          <option value="Hiking">Hiking & Trekking</option>
          <option value="Safari">Safari</option>
          <option value="Diving">Diving & Snorkeling</option>
          <option value="Wine">Wine & Spirits</option>
          <option value="Art">Art & Museums</option>
          <option value="Markets">Local Markets</option>
          <option value="Festivals">Festivals</option>
          <option value="Wellness">Wellness & Spa</option>
          <option value="Family">Family Friendly</option>
        </select>
        {/* AI Guide Match - lives inside the search pill now. Tap to open the
            ask form in the panel below; a finished match keeps the button lit. */}
        <button
          type="button"
          onClick={() => setAiOpen(!aiOpen)}
          aria-expanded={aiOpen}
          title="AI Guide Match - ask anything · get matched guides + places"
          className={
            'flex items-center gap-1.5 h-9 pl-2.5 pr-3 basis-full sm:basis-auto sm:flex-none min-w-0 text-xs sm:text-sm font-medium border-0 border-t border-input sm:border-t-0 sm:border-l rounded-none transition-colors cursor-pointer ' +
            (aiOpen || aiResult ? 'bg-primary/10 text-primary' : 'bg-transparent text-muted-foreground hover:text-primary')
          }
        >
          <Sparkles className="w-4 h-4 shrink-0" />
          <span className="sm:hidden font-semibold shrink-0">AI Guide Match</span>
          <span className="hidden sm:inline shrink-0">AI Match</span>
          <span className="sm:hidden flex-1 min-w-0 truncate text-[11px] font-normal opacity-80">Ask anything · get matched guides + places</span>
          {aiResult && !aiOpen && (
            <span className="text-[10px] font-semibold text-primary bg-primary/10 rounded-full px-1.5 py-0.5 shrink-0">Match ready</span>
          )}
          {aiOpen ? <ChevronUp className="w-3.5 h-3.5 shrink-0 ml-auto sm:ml-0" /> : <ChevronDown className="w-3.5 h-3.5 shrink-0 ml-auto sm:ml-0" />}
        </button>
        </div>
        <button
          onClick={() => setAvailableOnly(!availableOnly)}
          className={cn(
            'flex items-center gap-1 h-9 px-2.5 rounded-md text-xs font-medium border transition-colors shrink-0',
            availableOnly
              ? 'bg-primary/10 text-primary border-primary/30'
              : 'bg-card text-muted-foreground border-border'
          )}
        >
          <Radio className={cn('w-3.5 h-3.5', availableOnly && 'animate-pulse')} />
          Available
        </button>
        {/* Near me - GPS distance sort */}
        <button
          onClick={handleNearMe}
          disabled={locating}
          className={cn(
            'flex items-center gap-1 h-9 px-2.5 rounded-md text-xs font-medium border transition-colors disabled:opacity-60 shrink-0',
            nearMe
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-card text-muted-foreground border-border hover:border-primary/40'
          )}
        >
          {locating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Navigation className={cn('w-3.5 h-3.5', nearMe && 'animate-pulse')} />}
          {nearMe ? 'Nearest' : 'Near me'}
        </button>
      </div>

      {/* AI Guide Match panel - opens from the AI button inside the search
          pill. The ask form tucks away after a match; the result stays. */}
      {(aiOpen || aiResult) && (
      <Card className="p-3 sm:p-5 shadow-sm border-primary/20">
        {aiOpen ? (
        <>
        <div className="flex items-center gap-2.5">
          <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 shrink-0">
            <Sparkles className="w-4 h-4 text-primary" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-foreground">AI Guide Match</span>
            <span className="block text-[11px] text-muted-foreground truncate">Ask anything · get matched guides + places</span>
          </span>
          <button
            type="button"
            onClick={() => setAiOpen(false)}
            aria-label="Hide the AI form"
            className="shrink-0 text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <ChevronUp className="w-4 h-4" />
          </button>
        </div>

        <Textarea
          placeholder='e.g. "I have 3 days in Ethiopia - who can take me to Lalibela and where should I eat?"'
          value={aiQuestion}
          onChange={(e) => setAiQuestion(e.target.value)}
          className="mt-3 min-h-[56px] resize-y bg-card text-sm"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              runAiMatch(aiQuestion)
            }
          }}
        />

        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <Button
            size="sm"
            onClick={() => runAiMatch(aiQuestion)}
            disabled={aiLoading || !aiQuestion.trim()}
            className="bg-primary hover:bg-primary/90 gap-1.5"
          >
            {aiLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {aiLoading ? 'Matching...' : 'Recommend guides'}
          </Button>
          <button
            onClick={() => setAiUseLocation(!aiUseLocation)}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium border transition-colors',
              aiUseLocation && myCoords
                ? 'bg-primary/10 text-primary border-primary/30'
                : 'bg-card text-muted-foreground border-border'
            )}
          >
            <Navigation className="w-3 h-3" />
            {myCoords ? (aiUseLocation ? 'Using my location' : 'Ignore my location') : 'Get GPS for context'}
          </button>
          {myCoords == null && (
            <Button size="sm" variant="outline" onClick={handleNearMe} disabled={locating} className="text-xs gap-1.5">
              {locating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Navigation className="w-3 h-3" />}
              Get GPS
            </Button>
          )}
        </div>

        {/* Question chips: feed questions first, then examples */}
        <div className="mt-3">
          <button
            onClick={() => setShowFeedQs(!showFeedQs)}
            className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
          >
            <Users className="w-3 h-3" />
            Questions from the feed
            {showFeedQs ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
          {showFeedQs && (
            <div className="mt-2 flex items-center gap-1.5 flex-wrap">
              {feedQsLoading ? (
                <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" /> Loading feed questions...
                </span>
              ) : feedQs.length === 0 ? (
                <span className="text-[11px] text-muted-foreground">No questions in the feed yet - ask one in the Feed tab!</span>
              ) : (
                feedQs.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => runAiMatch(q)}
                    className="max-w-full truncate text-left text-[11px] px-2.5 py-1.5 rounded-full bg-accent text-foreground hover:bg-primary/10 hover:text-primary transition-colors"
                    title={q}
                  >
                    {q}
                  </button>
                ))
              )}
            </div>
          )}
          <div className="mt-2 flex items-center gap-1.5 flex-wrap">
            {EXAMPLE_QUESTIONS.map((q) => (
              <button
                key={q}
                onClick={() => runAiMatch(q)}
                className="text-[11px] px-2.5 py-1.5 rounded-full border border-dashed border-border text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
        </>
        ) : (
        <button
          type="button"
          onClick={() => setAiOpen(true)}
          className="w-full flex items-center gap-2.5 text-left cursor-pointer"
        >
          <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 shrink-0">
            <Sparkles className="w-4 h-4 text-primary" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-foreground">AI Guide Match</span>
            <span className="block text-[11px] text-muted-foreground truncate">Ask anything · get matched guides + places</span>
          </span>
          <span className="text-[10px] font-semibold text-primary bg-primary/10 rounded-full px-2 py-1 shrink-0">Match ready</span>
          <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
        </button>
        )}

        {/* AI result - stays visible even with the form collapsed */}
        {aiError && aiOpen && (
          <p className="mt-3 text-xs text-destructive">{aiError} - showing keyword matches instead is not possible right now, try again.</p>
        )}
        {aiLoading && aiOpen && (
          <div className="mt-3 space-y-2">
            {[1, 2].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        )}
        {aiResult && (
          <div className="mt-4 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="secondary" className="bg-primary/10 text-primary text-[10px]">
                {TIER_LABEL[aiResult.tier || 'ai'] || 'Match'}
              </Badge>
              <p className="text-sm text-foreground font-medium flex-1 min-w-[200px]">{aiResult.summary}</p>
            </div>

            {/* Recommended guides */}
            {aiResult.guides.length > 0 ? (
              <div className="space-y-2">
                {aiResult.guides.map((g) => (
                  <div key={g.id} className="rounded-lg border border-border p-3 hover:border-primary/30 transition-colors">
                    <div className="flex items-center gap-2.5">
                      <Avatar className="w-9 h-9 border border-accent overflow-hidden shrink-0">
                        {g.profilePicture ? (
                          <img src={g.profilePicture} alt={g.name} className="w-full h-full object-cover" />
                        ) : (
                          <AvatarFallback className="bg-primary/15 text-primary text-xs font-semibold">
                            {g.name?.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        )}
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1 flex-wrap">
                          {g.username ? (
                            <Link href={`/g/${g.username}`} data-testid="guide-recommend-name-link" className="text-sm font-semibold text-foreground truncate hover:text-primary hover:underline underline-offset-2 transition-colors" title={`Open ${g.name}'s guide page`}>{g.name}</Link>
                          ) : (
                            <span className="text-sm font-semibold text-foreground truncate">{g.name}</span>
                          )}
                          {g.verifiedLocal && <BadgeCheck className="w-3.5 h-3.5 text-primary shrink-0" />}
                          {(g as any).idVerified && (
                            <span className="inline-flex items-center gap-0.5 text-[9px] font-medium text-emerald-700 bg-emerald-100 rounded px-1 py-0.5 shrink-0" title="ID or passport verified">
                              <ShieldCheck className="w-2.5 h-2.5" />
                              ID
                            </span>
                          )}
                          <GuideStars value={g.rating || 0} />
                        </div>
                        <p className="text-[11px] text-muted-foreground truncate">
                          {g.location || 'Location not set'}
                          {g.distanceKm != null ? ` · ${g.distanceKm} km away` : ''}
                          {g.guideAvailable ? '' : ' · offline'}
                        </p>
                      </div>
                      {me?.id !== g.id && (
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Button size="sm" onClick={() => openBooking(g)} className="bg-primary hover:bg-primary/90 text-xs gap-1">
                            <CalendarCheck className="w-3 h-3" />
                            Book
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => onMessage(g.id)} className="border-primary text-primary hover:bg-primary hover:text-primary-foreground text-xs gap-1">
                            <MessageSquare className="w-3 h-3" />
                            Message
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => openRating({ id: g.id, name: g.name, profilePicture: g.profilePicture })} className="border-amber-400/60 text-amber-600 hover:bg-amber-50 text-xs gap-1">
                            <Star className="w-3 h-3" />
                            Rate
                          </Button>
                        </div>
                      )}
                    </div>
                    {g.reason && (
                      <p className="mt-2 text-xs text-primary/90 flex items-start gap-1.5">
                        <Sparkles className="w-3 h-3 mt-0.5 shrink-0" />
                        {g.reason}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No registered guides yet - the place recommendations below still stand.</p>
            )}

            {/* Recommended locations */}
            {aiResult.locations.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {aiResult.locations.map((l, i) => (
                  <div key={i} className="rounded-lg bg-accent/60 p-3">
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
                      <span className="text-sm font-semibold text-foreground truncate">{l.name}</span>
                    </div>
                    {l.area && <p className="text-[10px] text-muted-foreground mt-0.5">{l.area}</p>}
                    <p className="text-xs text-muted-foreground mt-1.5">{l.why}</p>
                    {l.tip && (
                      <p className="text-[11px] text-amber-700 mt-1.5 flex items-start gap-1.5">
                        <Lightbulb className="w-3 h-3 mt-0.5 shrink-0" />
                        {l.tip}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>
      )}

      {/* Guide cards */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="p-4 space-y-3">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-16 w-full" />
            </Card>
          ))}
        </div>
      ) : guides.length === 0 ? (
        <Card className="p-10 text-center shadow-sm">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-accent mb-3">
            <Compass className="w-6 h-6 text-primary" />
          </div>
          <h3 className="font-semibold text-foreground">No locals found</h3>
          <p className="mt-1 text-sm text-muted-foreground max-w-md mx-auto">
            No one matches your filters. Try adjusting search, or be the first to join as a guide, vlogger, local or volunteer!
          </p>
          {!isGuide && (
            <Button onClick={onBecomeGuide} className="mt-5 bg-primary hover:bg-primary/90 gap-1.5">
              <Compass className="w-4 h-4" />
              Join as a local
            </Button>
          )}
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {visibleGuides.map((g) => {
            const isOwn = me?.id === g.id
            // Shared action buttons - reused by the mobile grid and the desktop row
            const bookMessageRateBtns = (
              <>
                <Button
                  size="sm"
                  onClick={() => openBooking(g)}
                  className="bg-primary hover:bg-primary/90 text-xs gap-1.5"
                >
                  <CalendarCheck className="w-3.5 h-3.5" />
                  Book
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onMessage(g.id)}
                  className="border-primary text-primary hover:bg-primary hover:text-primary-foreground text-xs gap-1.5"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  Message
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => openRating({ id: g.id, name: g.name, profilePicture: g.profilePicture })}
                  className="border-amber-400/60 text-amber-600 hover:bg-amber-50 text-xs gap-1.5"
                >
                  <Star className="w-3.5 h-3.5" />
                  Rate
                </Button>
              </>
            )
            const shareGuideBtn = (
              <Button
                size="sm"
                variant="outline"
                data-testid="guide-share-btn"
                onClick={async () => {
                  // The guide link: a real shareable page that works logged
                  // out - /g/<username>. Members without a username keep the
                  // legacy in-app deep link. Share copy reads their roles.
                  const url = g.username
                    ? `${window.location.origin}/g/${g.username}`
                    : `${window.location.origin}/?guide=${g.id}`
                  const rls = guideRolesOrLegacy((g as any).guideRoles)
                  const shareTitle = `${g.name} - ${roleListLabel(rls)} on circub`
                  const shareText = `Check out ${g.name}, a ${ROLE_META[rls[0]].label.toLowerCase()} on circub`
                  try {
                    if (navigator.share) {
                      await navigator.share({ title: shareTitle, text: shareText, url })
                    } else if (navigator.clipboard) {
                      await navigator.clipboard.writeText(url)
                      toast({ title: 'Guide link copied!', description: url.replace(/^https?:\/\//, '') })
                    } else {
                      window.prompt('Copy this guide link:', url)
                    }
                  } catch (e) {
                    if (e instanceof Error && e.name !== 'AbortError') {
                      try {
                        await navigator.clipboard.writeText(url)
                        toast({ title: 'Guide link copied!' })
                      } catch {
                        window.prompt('Copy this guide link:', url)
                      }
                    }
                  }
                }}
                className="border-muted text-muted-foreground hover:bg-accent text-xs gap-1.5"
              >
                <Share2 className="w-3.5 h-3.5" />
              </Button>
            )
            return (
              <Card key={g.id} className="p-4 shadow-sm hover:shadow-md transition-shadow">
                {/* Top row: availability + star rating (tap = reviews) */}
                <div className="flex items-center justify-between mb-3 gap-2">
                  <div className="flex items-center gap-1.5">
                    {g.guideAvailable ? (
                      <span className="flex items-center gap-1 text-xs font-medium text-emerald-600">
                        <Radio className="w-3 h-3 animate-pulse" />
                        Available now
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Radio className="w-3 h-3" />
                        Offline
                      </span>
                    )}
                    {g.distanceKm != null && (
                      <span className="flex items-center gap-1 text-xs font-medium text-primary">
                        <Navigation className="w-3 h-3" />
                        {g.distanceKm} km away
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => openReviews({ id: g.id, name: g.name })}
                    className="flex items-center gap-1 text-xs font-medium text-amber-600 hover:text-amber-700"
                    title="See all reviews"
                  >
                    <GuideStars value={g.rating || 0} />
                    {g.rating > 0 ? g.rating.toFixed(1) : 'New'}
                    <span className="text-muted-foreground">({g.ratingCount || 0})</span>
                  </button>
                </div>

                {/* Avatar + name + location */}
                <div className="flex items-start gap-3">
                  <Avatar className="w-12 h-12 border-2 border-accent overflow-hidden shrink-0">
                    {g.profilePicture ? (
                      <img src={g.profilePicture} alt={g.name} className="w-full h-full object-cover" />
                    ) : (
                      <AvatarFallback className="bg-primary/15 text-primary font-semibold">{g.name.charAt(0).toUpperCase()}</AvatarFallback>
                    )}
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      {/* The guide name IS the guide link - tap it to open /g/<username> */}
                      {g.username ? (
                        <Link href={`/g/${g.username}`} data-testid="guide-name-link" className="font-semibold text-foreground truncate hover:text-primary hover:underline underline-offset-2 transition-colors" title={`Open ${g.name}'s guide page`}>{g.name}</Link>
                      ) : (
                        <h3 className="font-semibold text-foreground truncate">{g.name}</h3>
                      )}
                      {g.verifiedLocal && <BadgeCheck className="w-4 h-4 text-primary shrink-0" />}
                      {(g as any).idVerified && <BadgeCheck className="w-4 h-4 text-blue-500 shrink-0" aria-label="Verified with ID or passport" />}
                      {/* Live Zone roles: Guide / Vlogger / Local / Volunteer */}
                      {guideRolesOrLegacy((g as any).guideRoles).map((r) => (
                        <Badge key={r} variant="secondary" data-testid={`guide-role-${r}`}
                          className="bg-primary/10 text-primary text-[9px] shrink-0">
                          {ROLE_META[r].label}
                        </Badge>
                      ))}
                      {g.guideLicense && (
                        <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 text-[9px] shrink-0">
                          <Award className="w-2.5 h-2.5 mr-0.5" />
                          Licensed
                        </Badge>
                      )}
                      {(g as any).idVerified && (
                        <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 text-[9px] shrink-0" title="ID or passport verified">
                          <ShieldCheck className="w-2.5 h-2.5 mr-0.5" />
                          ID
                        </Badge>
                      )}
                    </div>
                    {g.location && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <MapPin className="w-3 h-3" />
                        {g.location}
                      </p>
                    )}
                  </div>
                </div>

                {/* Bio */}
                {g.guideBio && (
                  <p className="mt-3 text-sm text-muted-foreground line-clamp-2">{g.guideBio}</p>
                )}

                {/* Languages */}
                {g.guideLanguages.length > 0 && (
                  <div className="mt-3 flex items-center gap-1.5 flex-wrap">
                    <Languages className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    {g.guideLanguages.map((lang: string) => (
                      <Badge key={lang} variant="secondary" className="bg-accent text-foreground text-[10px]">{lang}</Badge>
                    ))}
                  </div>
                )}

                {/* Specialties */}
                {g.guideSpecialties.length > 0 && (
                  <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                    {g.guideSpecialties.map((spec: string) => (
                      <Badge key={spec} variant="secondary" className="bg-primary/10 text-primary text-[10px]">{spec}</Badge>
                    ))}
                  </div>
                )}

                {/* Tour videos (YouTube / Instagram links) - collapsible strip */}
                {(() => {
                  const raw = (g as any).guideVideoUrls
                  const vids: string[] = Array.isArray(raw) ? raw.filter(Boolean) : splitVideoUrls(raw)
                  if (vids.length === 0) return null
                  const open = !!openVideoCards[g.id]
                  return (
                    <div className="mt-3" data-testid="guide-card-videos">
                      <button
                        type="button"
                        onClick={() => setOpenVideoCards((prev) => ({ ...prev, [g.id]: !prev[g.id] }))}
                        className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
                      >
                        {open ? <Video className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                        {open ? 'Hide videos' : `Watch videos (${vids.length})`}
                      </button>
                      {open && (
                        <div className="mt-2 space-y-2">
                          {vids.map((v, i) => (
                            <VideoEmbed key={i} url={v} title={`${g.name} tour video ${i + 1}`} />
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })()}

                {/* Rate + actions - stacks to two rows on phones, single row on sm+ */}
                <div className="mt-4 pt-3 border-t border-border">
                  <div className="flex items-center justify-between gap-2 min-w-0">
                    {g.guideHourlyRate != null && g.guideCurrency ? (
                      <div className="flex items-center gap-1 text-sm min-w-0">
                        <DollarSign className="w-3.5 h-3.5 text-primary shrink-0" />
                        <span className="font-semibold text-foreground whitespace-nowrap">{g.guideCurrency} {g.guideHourlyRate}</span>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">/hr</span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">Rate on request</span>
                    )}
                    {isOwn ? (
                      <Badge variant="secondary" className="bg-primary/10 text-primary text-[10px] shrink-0">You</Badge>
                    ) : (
                      <div className="sm:hidden shrink-0">{shareGuideBtn}</div>
                    )}
                  </div>
                  {!isOwn && (
                    <div className="mt-2.5 grid grid-cols-3 gap-1.5 sm:hidden">
                      {bookMessageRateBtns}
                    </div>
                  )}
                  {!isOwn && (
                    <div className="hidden sm:flex items-center gap-1.5">
                      {bookMessageRateBtns}
                      {shareGuideBtn}
                    </div>
                  )}
                </div>
              </Card>
            )
          })}
          <div ref={guidesSentinelRef} />
          {guidesHasMore && (
            <p className="text-center text-xs text-muted-foreground py-2 col-span-full">Loading more guides…</p>
          )}
        </div>
      )}

      {/* Guide rating modal */}
      <GuideRatingModal
        open={ratingModalOpen}
        onOpenChange={setRatingModalOpen}
        guide={ratingGuide}
        onRated={() => fetchGuides()}
      />

      {/* Guide reviews modal */}
      <GuideReviewsModal
        open={reviewsOpen}
        onOpenChange={setReviewsOpen}
        guide={reviewsGuide}
      />

      {/* Guide booking modal (tourist requests a tour) */}
      <GuideBookingModal
        open={bookingOpen}
        onOpenChange={setBookingOpen}
        guide={bookingGuide}
        onBooked={() => loadBookingCount()}
        onMessage={onMessage}
      />

      {/* My bookings modal (incoming + outgoing) */}
      <GuideBookingsModal
        open={bookingsOpen}
        onOpenChange={setBookingsOpen}
        isGuide={Boolean(isGuide)}
        meId={me?.id || ''}
        onMessage={onMessage}
        onChanged={() => loadBookingCount()}
      />
    </div>
  )
}

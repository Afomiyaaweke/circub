'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
// Live Zone - registered tour guides.
// New in this version:
//  - AI Guide Match: ask any travel question (or pick one straight from the
//    community feed) and get recommended guides + locations with reasons.
//  - "Near me": GPS-based distance sort (haversine via the city table).
//  - Tourist star ratings are visible on every card with review count;
//    tapping them opens the full reviews dialog.
import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Search, Compass, MapPin, Languages, Star, BadgeCheck,
  MessageSquare, Radio, Share2, Sparkles, Navigation, Loader2, ChevronDown,
  ChevronUp, Lightbulb, Users, CalendarCheck, ShieldCheck, Plus,
  Play, Video, Zap, ArrowRight, Clock, Tag, CheckCircle2, Send,
  Pencil, Trash2, UserX, X, Plane,
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
import { guideRolesOrLegacy, roleListLabel, roleNoun } from '@/lib/roles'
import { VideoEmbed } from './video-embed'
import { useProgressiveList } from '@/lib/use-progressive-list'
import { GuideRatingModal } from './guide-rating-modal'
import { GuideReviewsModal, GuideStars } from './guide-reviews-modal'
import { GuideBookingModal, BookingGuideInfo } from './guide-booking-modal'
import { GuideBookingsModal } from './guide-bookings-modal'
import type { User } from '@/lib/types'
import { avatarSrc } from '@/lib/fighters'
import { RoleStickerTile } from './role-sticker-reveal'

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

// v214 Live Hustle Zone, trimmed in v217 ("remove those all vloger things"),
// v218 ("remove redundant filters") and v222 ("remove this section all and
// make it only in one line" + "have agent bage also to register as travel
// agent and get booked"): FOUR slim lane pills on ONE line map 1:1 onto the
// community roles (guide / local / sales / agent) and are the ONLY role
// slicers - the old role chips row under the search bar is gone (it
// duplicated the lanes) and the tall escrow band is gone with it. Price
// ranges are the platform's public rate guidance (lg+ screens only - the
// pills must stay one line on phones); the live counter comes from the REAL
// directory counts, and tapping a lane applies that role filter.
const HUSTLE_LANES: Array<{
  role: 'guide' | 'local' | 'sales' | 'agent'
  label: string
  short: string
  price: string
  desc: string
  icon: typeof Compass
  hot?: boolean
}> = [
  {
    role: 'guide',
    label: 'Local Scout & Guide',
    short: 'Scout',
    price: '$24-45 / HR',
    desc: 'Lead in-person or live-streamed walks, audit local shops, and accept verified street scouting commissions.',
    icon: Compass,
  },
  {
    role: 'local',
    label: 'Remote Helper',
    short: 'Helper',
    price: '$15-30 / GIG',
    desc: 'Translate buyer calls, verify invoices over chat, and broker wholesale terms for international buyers.',
    icon: Languages,
  },
  {
    role: 'sales',
    label: 'Price Hunter',
    short: 'Hunter',
    price: '$5-20 / DEAL',
    desc: 'Audit real street store receipts, alert the community of flash liquidations, and earn automated escrow rewards.',
    icon: Tag,
    hot: true,
  },
  {
    role: 'agent',
    label: 'Travel Agent',
    short: 'Agent',
    price: '$40-120 / TRIP',
    desc: 'Plan full itineraries, book hotels and transport, and get booked directly by travelers - no middlemen.',
    icon: Plane,
  },
]

type QuestRow = {
  id: string
  title: string
  details: string | null
  location: string
  deadlineText: string
  bountyUsd: number
  posterName: string
  claimed: boolean
  // v219 privacy: the claimer's name/contact are never sent to the client -
  // the board only knows the two session-scoped flags below. Applicant
  // details for posters live in Profile > Bounties (via /api/quests/mine).
  isMine: boolean
  myClaim: boolean
  createdAt: string
}


export function LiveZoneTab({ me, onMessage, onBecomeGuide, onToggleAvailability }: LiveZoneTabProps) {
  const router = useRouter()
  const [guides, setGuides] = useState<any[]>([])
  // Load part by part: render a small batch first, append more on scroll
  const { visible: visibleGuides, hasMore: guidesHasMore, sentinelRef: guidesSentinelRef } = useProgressiveList(guides, 6, 6)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  // v218: standalone language/specialty dropdown filters removed as redundant
  // - the search box matches languages, specialties and locations already.
  // Role filter (v161): '' = all roles, otherwise a circubawd_ROLES slug wired
  // to the hustle lanes (tap a lane) and the /api/guides `role` param.
  const [role, setRole] = useState('')
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

  // Same no-flash rule as the other feeds: refetches (rating a guide, role
  // changes, filter edits) keep the current cards mounted - skeletons only
  // for the first load / an empty previous load. Swapping the whole directory
  // to skeleton cards on every refetch read as a glitch.
  const hasGuidesRef = useRef(false)
  const fetchGuides = useCallback(async () => {
    if (!hasGuidesRef.current) setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (role) params.set('role', role)
      if (availableOnly) params.set('available', 'true')
      if (nearMe && myCoords) {
        params.set('lat', String(myCoords.lat))
        params.set('lng', String(myCoords.lng))
      }
      const res = await fetch(`/api/guides?${params.toString()}`)
      const data = await res.json()
      const next = data.guides || []
      setGuides(next)
      hasGuidesRef.current = next.length > 0
    } catch { setGuides([]); hasGuidesRef.current = false } finally { setLoading(false) }
  }, [search, role, availableOnly, nearMe, myCoords, meRolesKey])

  useEffect(() => {
    const t = setTimeout(fetchGuides, 250)
    return () => clearTimeout(t)
  }, [fetchGuides])

  // v215: live instant bounty quests - fed by /api/quests. v217: the board is
  // FULLY INLINE on this page (user: "make this on the same page as the link
  // and don't take it on the new landing page") - posting + claiming happen
  // right here with zero navigation. The Help Board (/help) hosts the same
  // experience through its quest tab; both surfaces share one API.
  const [quests, setQuests] = useState<QuestRow[] | null>(null)

  // --- Inline quest board state (v217) ---
  const [showQuestForm, setShowQuestForm] = useState(false)
  const [qTitle, setQTitle] = useState('')
  const [qDetails, setQDetails] = useState('')
  const [qLocation, setQLocation] = useState('')
  const [qDeadline, setQDeadline] = useState('')
  const [qBounty, setQBounty] = useState('')
  const [qContact, setQContact] = useState('')
  const [qName, setQName] = useState('')
  const [qPosting, setQPosting] = useState(false)
  const [qPostErr, setQPostErr] = useState('')
  const [qPostOk, setQPostOk] = useState('')
  const [claimFor, setClaimFor] = useState<string | null>(null)
  const [claimName, setClaimName] = useState('')
  const [claimContact, setClaimContact] = useState('')
  const [claiming, setClaiming] = useState(false)
  const [claimErrs, setClaimErrs] = useState<Record<string, string>>({})
  const [revealed, setRevealed] = useState<Record<string, string>>({})
  const [locallyClaimed, setLocallyClaimed] = useState<Record<string, boolean>>({})
  const [showAllQuests, setShowAllQuests] = useState(false)
  // v219 poster/claimer management: inline Edit (reuses the post form),
  // Delete, Drop claim and Remove claimer. questBusy marks the quest whose
  // action is in flight so only that card's buttons spin.
  const [editingQuest, setEditingQuest] = useState<string | null>(null)
  const [questBusy, setQuestBusy] = useState<string>('')

  // Claim form: prefill the member's own name (visitors type theirs).
  const meName = me?.name
  useEffect(() => {
    if (meName) setClaimName((p) => (p ? p : meName))
  }, [meName])

  async function reloadQuests() {
    try {
      const r = await fetch('/api/quests', { cache: 'no-store' })
      const d = await r.json()
      setQuests(Array.isArray(d?.quests) ? d.quests : null)
    } catch { /* keep the current list */ }
  }

  async function postQuestHere(e: React.FormEvent) {
    e.preventDefault()
    setQPostErr('')
    setQPostOk('')
    if (qTitle.trim().length < 5) {
      setQPostErr('Please describe the help you need (at least 5 characters).')
      return
    }
    if (!qLocation.trim() || !qDeadline.trim()) {
      setQPostErr('Location and deadline are required.')
      return
    }
    const bounty = Number(qBounty)
    if (!Number.isFinite(bounty) || bounty < 0.5) {
      setQPostErr('Bounty must be at least $0.50.')
      return
    }
    if (!me && !editingQuest && !qName.trim()) {
      setQPostErr('Your name is required.')
      return
    }
    // Edit mode: the stored contact stays unless the poster types a new one
    // (the API never sends the poster's contact back to the client).
    if (!editingQuest && !qContact.trim()) {
      setQPostErr('A contact (phone / WhatsApp / Telegram) is required so guides can reach you.')
      return
    }
    setQPosting(true)
    try {
      if (editingQuest) {
        const res = await fetch(`/api/quests/${editingQuest}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: qTitle,
            details: qDetails,
            location: qLocation,
            deadlineText: qDeadline,
            bountyUsd: bounty,
            ...(qContact.trim() ? { contact: qContact } : {}),
          }),
        })
        if (res.ok) {
          setQTitle(''); setQDetails(''); setQLocation(''); setQDeadline('')
          setQBounty(''); setQContact('')
          setShowQuestForm(false)
          setEditingQuest(null)
          setQPostOk('Quest updated - the board now shows the new terms.')
          await reloadQuests()
        } else {
          const d = await res.json().catch(() => ({}))
          setQPostErr(d.error || 'Failed to update your quest.')
          if (res.status === 409) {
            // Claimed while editing (or terms locked) - drop back to a clean form.
            setEditingQuest(null)
          }
        }
        return
      }
      const res = await fetch('/api/quests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          me
            ? { title: qTitle, details: qDetails, location: qLocation, deadlineText: qDeadline, bountyUsd: bounty, contact: qContact }
            : { title: qTitle, details: qDetails, location: qLocation, deadlineText: qDeadline, bountyUsd: bounty, posterName: qName, contact: qContact }
        ),
      })
      if (res.ok) {
        setQTitle(''); setQDetails(''); setQLocation(''); setQDeadline('')
        setQBounty(''); setQName(''); setQContact('')
        setShowQuestForm(false)
        setQPostOk('Quest is live - local guides can claim it now. You will be contacted on the channel you left.')
        await reloadQuests()
      } else {
        const d = await res.json().catch(() => ({}))
        setQPostErr(d.error || 'Failed to post your quest.')
      }
    } catch {
      setQPostErr('Failed to post your quest.')
    } finally {
      setQPosting(false)
    }
  }

  // v219: open the post form pre-filled for an in-place edit of my quest.
  // The stored contact is never sent to the client, so the contact field
  // starts empty and only overwrites when the poster types a new one.
  function startEditQuest(q: QuestRow) {
    setEditingQuest(q.id)
    setQTitle(q.title)
    setQDetails(q.details || '')
    setQLocation(q.location)
    setQDeadline(q.deadlineText)
    setQBounty(String(q.bountyUsd))
    setQContact('')
    setQPostErr('')
    setQPostOk('')
    setShowQuestForm(true)
    try { document.getElementById('bounty-board-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' }) } catch { /* noop */ }
  }

  // v219: claimer drops their own claim ("Drop claim") or the poster removes
  // the applicant ("Remove claimer") - same endpoint, quest reopens for the
  // next taker either way.
  async function dropClaimHere(qid: string) {
    setQuestBusy(qid)
    try {
      const res = await fetch(`/api/quests/${qid}/claim`, { method: 'DELETE' })
      if (res.ok) {
        setRevealed((m) => { const n = { ...m }; delete n[qid]; return n })
        setLocallyClaimed((m) => { const n = { ...m }; delete n[qid]; return n })
        setClaimFor((f) => (f === qid ? null : f))
        await reloadQuests()
      } else {
        const d = await res.json().catch(() => ({}))
        toast({ title: d.error || 'Could not remove the claim', variant: 'destructive' })
      }
    } catch {
      toast({ title: 'Could not remove the claim', variant: 'destructive' })
    } finally {
      setQuestBusy('')
    }
  }

  async function deleteQuestHere(qid: string) {
    if (!window.confirm('Delete this bounty quest? This cannot be undone.')) return
    setQuestBusy(qid)
    try {
      const res = await fetch(`/api/quests/${qid}`, { method: 'DELETE' })
      if (res.ok) {
        if (editingQuest === qid) { setEditingQuest(null); setShowQuestForm(false) }
        await reloadQuests()
      } else {
        const d = await res.json().catch(() => ({}))
        toast({ title: d.error || 'Could not delete the quest', variant: 'destructive' })
      }
    } catch {
      toast({ title: 'Could not delete the quest', variant: 'destructive' })
    } finally {
      setQuestBusy('')
    }
  }

  async function claimQuestHere(qid: string) {
    setClaimErrs((m) => ({ ...m, [qid]: '' }))
    if (!claimName.trim() || !claimContact.trim()) {
      setClaimErrs((m) => ({ ...m, [qid]: 'Your name and a contact are required to claim.' }))
      return
    }
    setClaiming(true)
    try {
      const res = await fetch(`/api/quests/${qid}/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claimerName: claimName, claimerContact: claimContact }),
      })
      const d = await res.json().catch(() => ({}))
      if (res.ok && d.ok) {
        // Instant contact: the poster's channel opens right here, no page change.
        setRevealed((m) => ({ ...m, [qid]: d.posterContact || '' }))
        setLocallyClaimed((m) => ({ ...m, [qid]: true }))
        setClaimFor(null)
        setClaimContact('')
        await reloadQuests()
      } else {
        setClaimErrs((m) => ({ ...m, [qid]: d.error || 'Failed to claim.' }))
        if (res.status === 409) await reloadQuests()
      }
    } catch {
      setClaimErrs((m) => ({ ...m, [qid]: 'Failed to claim.' }))
    } finally {
      setClaiming(false)
    }
  }
  useEffect(() => {
    let alive = true
    fetch('/api/quests', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive) setQuests(Array.isArray(d?.quests) ? d.quests : null)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

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
      {/* v214 HustleHub header: live status strip + big hero title. All the
          legacy actions stay (bookings modal, guide profile edit, availability
          toggle) - just relabeled into the hustle vocabulary. */}
      <div className="space-y-2" data-testid="hustle-hero">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 h-6 text-[11px] font-bold text-primary" title="Members whose availability toggle is ON right now">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              {guides.filter((g) => (g as any).guideAvailable).length} hustlers online
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
              <ShieldCheck className="w-3.5 h-3.5 text-primary" />
              Escrow Active
            </span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {!isGuide && (
              <Button onClick={onBecomeGuide} size="sm" className="bg-primary hover:bg-primary/90 gap-1.5 shrink-0">
                <Compass className="w-4 h-4" />
                Join as a local
              </Button>
            )}
            {isGuide && (
              <>
                <Button onClick={onBecomeGuide} size="sm" variant="outline" className="gap-1.5 shrink-0" title="Edit your guide profile or replace your ID/passport document">
                  <ShieldCheck className="w-4 h-4" />
                  <span className="hidden sm:inline">Guide profile</span>
                </Button>
                <Button
                  onClick={onToggleAvailability}
                  size="sm"
                  variant="outline"
                  className={cn(
                    'gap-1.5 shrink-0',
                    isAvailable
                      ? 'border-emerald-500 text-emerald-600 bg-emerald-50 hover:bg-emerald-100'
                      : 'border-muted text-muted-foreground'
                  )}
                >
                  <Radio className={cn('w-4 h-4', isAvailable && 'animate-pulse')} />
                  {isAvailable ? 'Go Live' : 'Start Earning'}
                </Button>
              </>
            )}
            <Button onClick={() => setBookingsOpen(true)} size="sm" variant="outline" className="gap-1.5 shrink-0 relative">
              <CalendarCheck className="w-4 h-4" />
              <span className="hidden sm:inline">My Payouts & Escrow</span>
              <span className="sm:hidden">Bookings</span>
              {pendingBookings > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-semibold flex items-center justify-center">
                  {pendingBookings > 9 ? '9+' : pendingBookings}
                </span>
              )}
            </Button>
          </div>
        </div>
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-foreground">Live Hustle Zone</h1>
          <p className="mt-0.5 text-xs sm:text-sm text-muted-foreground max-w-2xl">
            Turn local knowledge, your phone, or language skills into cash — payouts land straight in your wallet.
          </p>
        </div>
      </div>

      {/* v220: the DEALS come first - this board sits right under the hero,
          above the lanes and the talent directory (user: "make the deals
          first then the ppl next and the button on top"), with the
          "+ Post an Instant Quest" button as the FIRST element of the
          board header. v217: the FULL board, INLINE on this
          page (user: "make this on the same page as the link and don't take
          it on the new landing page"). Posting and claiming happen right
          here with zero navigation: "+ Post an Instant Quest" opens the
          upload form in place, "Claim Bounty" opens the claim form in place
          and instantly reveals the poster's contact. Fed by /api/quests;
          the Help Board (/help) hosts the same experience via its quest tab. */}
      <div className="pt-2" data-testid="bounty-board">
        <div className="space-y-2.5">
          <div className="flex items-center gap-3 flex-wrap">
            <button
              type="button"
              onClick={() => {
                // Opening the form fresh always means a NEW post - cancel any
                // in-flight edit so stale pre-filled values don't leak in.
                setShowQuestForm((v) => {
                  if (!v) { setEditingQuest(null); setQTitle(''); setQDetails(''); setQLocation(''); setQDeadline(''); setQBounty(''); setQContact('') }
                  return !v
                })
                setQPostErr('')
              }}
              data-testid="bounty-post-link"
              aria-expanded={showQuestForm}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-primary text-primary-foreground text-xs font-bold tracking-wide shadow-sm hover:bg-primary/90 active:scale-[0.98] transition-all shrink-0"
            >
              <Plus className="w-4 h-4 shrink-0" />
              {editingQuest ? 'Editing quest - cancel' : 'Post an Instant Quest'}
            </button>
            {quests && quests.length > 3 && (
              <button
                type="button"
                onClick={() => setShowAllQuests((v) => !v)}
                data-testid="bounty-view-all"
                className="text-xs font-semibold text-primary hover:underline"
              >
                {showAllQuests ? 'Show top bounties' : 'View all open bounties →'}
              </button>
            )}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <Zap className="w-4 h-4 text-primary" />
              <h2 className="text-lg font-bold text-foreground">Instant Side-Hustle Bounties</h2>
              <span className="rounded-full bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400 px-2 py-0.5 text-[10px] font-bold">1-Click Claim</span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">Travelers post real quests, funds escrowed by the poster. Post and claim right here - the poster&apos;s contact opens instantly, paid on completion.</p>
          </div>
        </div>

        {qPostOk && (
          <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300" data-testid="quest-post-ok">
            {qPostOk}
          </p>
        )}

        {showQuestForm && (
          <form
            onSubmit={postQuestHere}
            className="mt-3 bg-card rounded-2xl border border-border p-4 sm:p-5 shadow-sm space-y-3"
            data-testid="quest-post-form"
            id="bounty-board-form"
          >
            <p className="text-sm font-bold text-foreground">
              {editingQuest ? 'Edit your quest - update the terms, then save' : 'Upload an instant quest - ask for help, offer a bounty'}
            </p>
            <input
              value={qTitle}
              onChange={(e) => setQTitle(e.target.value)}
              placeholder="What do you need? e.g. I need help around Merkato - carry bags & bargain"
              maxLength={200}
              className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              data-testid="quest-input-title"
            />
            <textarea
              value={qDetails}
              onChange={(e) => setQDetails(e.target.value)}
              placeholder="Details (optional) - what exactly should the helper do, where to meet, how you pay"
              rows={2}
              maxLength={1000}
              className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              data-testid="quest-input-details"
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                value={qLocation}
                onChange={(e) => setQLocation(e.target.value)}
                placeholder="Location - e.g. Merkato, Addis"
                maxLength={120}
                className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                data-testid="quest-input-location"
              />
              <input
                value={qDeadline}
                onChange={(e) => setQDeadline(e.target.value)}
                placeholder="Deadline - e.g. Today by 5 PM"
                maxLength={120}
                className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                data-testid="quest-input-deadline"
              />
              <input
                value={qBounty}
                onChange={(e) => setQBounty(e.target.value)}
                placeholder="Bounty in USD - e.g. 15"
                type="number"
                min="0.5"
                step="0.5"
                className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                data-testid="quest-input-bounty"
              />
              <input
                value={qContact}
                onChange={(e) => setQContact(e.target.value)}
                placeholder={editingQuest ? 'New contact - leave blank to keep the current one' : 'Your contact - phone / WhatsApp / Telegram'}
                maxLength={200}
                className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                data-testid="quest-input-contact"
              />
              {!me && (
                <input
                  value={qName}
                  onChange={(e) => setQName(e.target.value)}
                  placeholder="Your name"
                  maxLength={100}
                  className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                  data-testid="quest-input-name"
                />
              )}
            </div>
            {qPostErr && (
              <p className="text-sm text-red-600 dark:text-red-400" data-testid="quest-post-error">
                {qPostErr}
              </p>
            )}
            <button
              type="submit"
              disabled={qPosting}
              className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-60"
              data-testid="quest-post-submit"
            >
              <Send className="h-4 w-4" />
              {qPosting ? 'Saving...' : editingQuest ? 'Save changes' : 'Post quest'}
            </button>
          </form>
        )}

        {!quests ? (
          <p className="mt-3 text-sm text-muted-foreground" data-testid="bounty-loading">Loading bounties...</p>
        ) : quests.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground" data-testid="bounty-empty">No open bounties yet - post the first instant quest.</p>
        ) : (
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {(showAllQuests ? quests : quests.slice(0, 3)).map((q) => {
              const isClaimed = q.claimed || locallyClaimed[q.id]
              return (
                <Card key={q.id} data-testid="bounty-card" className="p-4 shadow-sm flex flex-col">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1 rounded-md bg-accent px-2 py-0.5 text-[10px] font-semibold text-foreground">
                      <MapPin className="w-3 h-3" />
                      {q.location}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-orange-600">
                      <Clock className="w-3 h-3" />
                      {q.deadlineText}
                    </span>
                  </div>
                  <h3 className="mt-2 font-bold text-foreground leading-snug">{q.title}</h3>
                  {q.details && (
                    <p className="mt-1 text-xs text-muted-foreground leading-relaxed flex-1">{q.details}</p>
                  )}
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Posted by <span className="font-semibold text-foreground">{q.posterName}</span>
                  </p>
                  {/* v219: poster-only manage row - other visitors never see it. */}
                  {q.isMine && !isClaimed && (
                    <div className="mt-1.5 flex items-center gap-2 flex-wrap" data-testid="quest-manage-row">
                      <button
                        type="button"
                        onClick={() => startEditQuest(q)}
                        disabled={questBusy === q.id}
                        className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-0.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
                        data-testid="quest-edit-btn"
                      >
                        <Pencil className="w-3 h-3" />
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteQuestHere(q.id)}
                        disabled={questBusy === q.id}
                        className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-0.5 text-[11px] font-semibold text-muted-foreground hover:text-red-600 hover:border-red-300 transition-colors"
                        data-testid="quest-delete-btn"
                      >
                        <Trash2 className="w-3 h-3" />
                        Delete
                      </button>
                      <span className="text-[10px] font-semibold text-muted-foreground/70">Your post</span>
                    </div>
                  )}
                  <div className="mt-3">
                    <p className="text-[9px] font-bold tracking-wider text-muted-foreground uppercase">Escrow reward</p>
                    <p className="text-lg font-extrabold text-foreground" data-testid="bounty-reward">${q.bountyUsd.toFixed(2)}</p>
                  </div>
                  {isClaimed ? (
                    <div
                      className="mt-1 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 dark:border-emerald-500/30 dark:bg-emerald-500/10"
                      data-testid="bounty-claimed"
                    >
                      {/* v219: no claimer name is shown to the public - only
                          the two session-scoped views below know more. */}
                      <p className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {q.myClaim || locallyClaimed[q.id] ? 'You claimed this - payout on completion' : 'Claimed - payout on completion'}
                      </p>
                      {revealed[q.id] && (
                        <p className="mt-1 text-xs text-emerald-800 dark:text-emerald-200" data-testid="quest-contact-reveal">
                          Contact the poster now: <span className="font-bold">{revealed[q.id]}</span>
                        </p>
                      )}
                      {(q.myClaim || locallyClaimed[q.id]) && (
                        <button
                          type="button"
                          onClick={() => dropClaimHere(q.id)}
                          disabled={questBusy === q.id}
                          className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-800 dark:text-emerald-300 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                          data-testid="quest-drop-claim"
                        >
                          <X className="w-3 h-3" />
                          {questBusy === q.id ? 'Removing...' : 'Drop claim'}
                        </button>
                      )}
                      {q.isMine && !locallyClaimed[q.id] && (
                        <button
                          type="button"
                          onClick={() => dropClaimHere(q.id)}
                          disabled={questBusy === q.id}
                          className={"mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-800 dark:text-emerald-300 hover:text-red-600 dark:hover:text-red-400 transition-colors" + ((q.myClaim || locallyClaimed[q.id]) ? ' sm:ml-3' : '')}
                          data-testid="quest-remove-claimer"
                        >
                          <UserX className="w-3 h-3" />
                          {questBusy === q.id ? 'Removing...' : 'Remove claimer'}
                        </button>
                      )}
                    </div>
                  ) : claimFor === q.id ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault()
                        claimQuestHere(q.id)
                      }}
                      className="mt-1 space-y-2"
                      data-testid="quest-claim-form"
                    >
                      <input
                        value={claimName}
                        onChange={(e) => setClaimName(e.target.value)}
                        placeholder="Your name"
                        maxLength={100}
                        className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                        data-testid="quest-claim-name"
                      />
                      <input
                        value={claimContact}
                        onChange={(e) => setClaimContact(e.target.value)}
                        placeholder="Your contact - phone / WhatsApp / Telegram"
                        maxLength={200}
                        className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                        data-testid="quest-claim-contact"
                      />
                      {claimErrs[q.id] && (
                        <p className="text-xs text-red-600 dark:text-red-400">{claimErrs[q.id]}</p>
                      )}
                      <div className="flex items-center gap-2">
                        <button
                          type="submit"
                          disabled={claiming}
                          className="flex-1 rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-60"
                          data-testid="quest-claim-submit"
                        >
                          {claiming ? 'Claiming...' : 'Claim & get contact'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setClaimFor(null)}
                          className="rounded-full border border-border px-3 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="mt-1">
                      <Button
                        size="sm"
                        data-testid="bounty-claim"
                        onClick={() => setClaimFor(q.id)}
                        className="bg-primary hover:bg-primary/90 gap-1"
                      >
                        Claim Bounty
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  )}
                </Card>
              )
            })}
          </div>
        )}
      </div>

      {/* v222: the tall escrow guarantee band was REMOVED (user: "remove
          this section all and make it only in one line") - the escrow story
          survives in the compact hero badge above and the payouts modal. */}

      {/* v222: the four hustle lanes as ONE LINE of compact pills - tap one
          to slice the directory by that role (guide / local / sales / agent).
          Counter = real members in the directory; the first lane keeps the
          platform's signature dark-green fill; descriptions and price ranges
          moved into the title tooltip so the row stays a single line on
          phones (grid-cols-4 at every breakpoint). */}
      <div className="grid grid-cols-4 gap-1.5 sm:gap-2" data-testid="hustle-lanes">
        {HUSTLE_LANES.map((lane, i) => {
          const laneCount = guides.filter((g) => guideRolesOrLegacy((g as any).guideRoles).includes(lane.role)).length
          const laneActive = role === lane.role
          const LaneIcon = lane.icon
          const isLead = i === 0
          return (
            <button
              key={lane.role}
              type="button"
              data-testid="hustle-service-card"
              data-role={lane.role}
              onClick={() => setRole(laneActive ? '' : lane.role)}
              title={`${lane.label} - ${lane.desc} (${lane.price})`}
              className={cn(
                'flex items-center justify-center gap-1 sm:gap-1.5 text-left rounded-xl border px-1 sm:px-2 h-10 min-w-0 transition-all cursor-pointer',
                isLead
                  ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                  : 'bg-card border-border hover:border-primary/40 hover:shadow-sm',
                laneActive && 'ring-2 ring-primary/40'
              )}
            >
              <LaneIcon className={cn('w-4 h-4 shrink-0', isLead ? 'text-white' : 'text-primary')} />
              <span className={cn('min-w-0 truncate text-[11px] sm:text-xs font-bold', isLead ? 'text-white' : 'text-foreground')}>
                {lane.short}
              </span>
              <span
                className={cn(
                  'hidden lg:inline rounded-full px-1.5 py-0.5 text-[9px] font-bold tracking-wide whitespace-nowrap shrink-0',
                  isLead
                    ? 'bg-white/15 text-white'
                    : lane.hot
                      ? 'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400'
                      : 'bg-accent text-muted-foreground'
                )}
              >
                {lane.price}
              </span>
              <span
                className={cn(
                  'shrink-0 rounded-full px-1 min-w-[1.1rem] text-center text-[9px] font-bold leading-4',
                  isLead ? 'bg-white/15 text-white' : 'bg-primary/10 text-primary'
                )}
                title={`${laneCount} active now`}
              >
                {laneCount}
              </span>
            </button>
          )
        })}
      </div>

      {/* Search bar - one unified pill (mirrors the Local Price feed). The
          search accepts comma-separated terms ("Addis, English, Hiking"):
          each term matches name, bio, languages, specialties or location and
          the terms are AND-ed - v218 removed the standalone language and
          specialty dropdowns as redundant with this search. The whole filter
          row is ONE line even on phones: AI Match goes icon-only, Available /
          Near me hide their labels under sm. */}
      <div className="flex items-center gap-2">
        <div className="flex items-center flex-1 min-w-0 rounded-lg border border-input bg-card shadow-xs overflow-hidden">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search by skill (e.g. English, Merkato Sourcing, Driver)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 text-sm bg-transparent border-0 rounded-none shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-transparent"
            />
          </div>
        {/* AI Guide Match - lives inside the search pill. Tap to open the ask
            form in the panel below; a finished match keeps the button lit. */}
        <button
          type="button"
          onClick={() => setAiOpen(!aiOpen)}
          aria-expanded={aiOpen}
          title="AI Guide Match - ask anything · get matched guides + places"
          className={
            'flex items-center gap-1.5 h-9 px-2.5 sm:pr-3 shrink-0 text-xs sm:text-sm font-medium border-0 border-l border-input rounded-none transition-colors cursor-pointer ' +
            (aiOpen || aiResult ? 'bg-primary/10 text-primary' : 'bg-transparent text-muted-foreground hover:text-primary')
          }
        >
          <Sparkles className="w-4 h-4 shrink-0" />
          <span className="hidden sm:inline shrink-0">AI Match</span>
          {aiResult && !aiOpen && (
            <span className="text-[10px] font-semibold text-primary bg-primary/10 rounded-full px-1.5 py-0.5 shrink-0 hidden sm:inline">Match ready</span>
          )}
          {aiOpen ? <ChevronUp className="w-3.5 h-3.5 shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 shrink-0" />}
        </button>
        </div>
        <button
          onClick={() => setAvailableOnly(!availableOnly)}
          title="Show only hustlers whose availability toggle is ON"
          className={cn(
            'flex items-center gap-1 h-9 px-2.5 rounded-md text-xs font-medium border transition-colors shrink-0',
            availableOnly
              ? 'bg-primary/10 text-primary border-primary/30'
              : 'bg-card text-muted-foreground border-border'
          )}
        >
          <Radio className={cn('w-3.5 h-3.5', availableOnly && 'animate-pulse')} />
          <span className="hidden sm:inline">Available</span>
        </button>
        {/* Near me - GPS distance sort */}
        <button
          onClick={handleNearMe}
          disabled={locating}
          title="Sort guides by distance from you"
          className={cn(
            'flex items-center gap-1 h-9 px-2.5 rounded-md text-xs font-medium border transition-colors disabled:opacity-60 shrink-0',
            nearMe
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-card text-muted-foreground border-border hover:border-primary/40'
          )}
        >
          {locating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Navigation className={cn('w-3.5 h-3.5', nearMe && 'animate-pulse')} />}
          <span className="hidden sm:inline">{nearMe ? 'Nearest' : 'Near me'}</span>
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
                          <img src={avatarSrc(g.profilePicture)} alt={g.name} className="w-full h-full object-cover" />
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

      {/* v214: talent section header (reference: "Available Talent On Call" +
          "UPDATED" label on the right). */}
      <div className="flex items-end justify-between gap-2 flex-wrap pt-1" data-testid="talent-section">
        <div>
          <h2 className="text-lg font-bold text-foreground">Available Talent On Call</h2>
          <p className="text-xs text-muted-foreground">Hire directly, review past gig earnings, or tap to stream instantly.</p>
        </div>
        <span className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">Updated just now</span>
      </div>

      {/* Guide cards */}
      {loading && guides.length === 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
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
            No one matches your filters. Try adjusting search, or be the first to join as a guide, local, volunteer or seller!
          </p>
          {!isGuide && (
            <Button onClick={onBecomeGuide} className="mt-5 bg-primary hover:bg-primary/90 gap-1.5">
              <Compass className="w-4 h-4" />
              Join as a local
            </Button>
          )}
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
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
                  Book Now
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onMessage(g.id)}
                  className="border-border text-muted-foreground hover:bg-accent hover:text-foreground text-xs gap-1.5"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  Chat
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
                  const shareTitle = `${g.name} - ${roleListLabel(rls)} on circubAwd`
                  const shareText = `Check out ${g.name}, a ${roleNoun(rls[0])} on circubAwd`
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
              <Card key={g.id} data-testid="talent-card" className="relative overflow-hidden p-4 shadow-sm hover:shadow-md transition-shadow">
                {/* v214 green top strip (reference talent cards) */}
                <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-primary via-emerald-400 to-primary" aria-hidden="true" />
                {/* v214 identity row: avatar tile + name/ID + role line +
                    status line; rating block on the right (tap = reviews) */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-3 min-w-0">
                    <Avatar className="w-11 h-11 rounded-xl border border-accent overflow-hidden shrink-0">
                      {g.profilePicture ? (
                        <img src={avatarSrc(g.profilePicture)} alt={g.name} className="w-full h-full object-cover" />
                      ) : (
                        <AvatarFallback className="bg-emerald-100 dark:bg-primary/20 text-primary font-bold">{g.name.charAt(0).toUpperCase()}</AvatarFallback>
                      )}
                    </Avatar>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1">
                        {/* The guide name IS the guide link - tap it to open /g/<username> */}
                        {g.username ? (
                          <Link href={`/g/${g.username}`} data-testid="guide-name-link" className="font-bold text-foreground truncate hover:text-primary hover:underline underline-offset-2 transition-colors" title={`Open ${g.name}'s guide page`}>{g.name}</Link>
                        ) : (
                          <h3 className="font-bold text-foreground truncate">{g.name}</h3>
                        )}
                        {g.verifiedLocal && <BadgeCheck className="w-4 h-4 text-primary shrink-0" />}
                        {(g as any).idVerified && <BadgeCheck className="w-4 h-4 text-blue-500 shrink-0" aria-label="Verified with ID or passport" />}
                        {(g as any).idVerified && (
                          <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400 text-[9px] shrink-0" title="ID or passport verified">
                            <ShieldCheck className="w-2.5 h-2.5 mr-0.5" />
                            ID
                          </Badge>
                        )}
                        {/* v208: roles hide under the mystery sticker - touch
                            to take the full screen. No open role badges. */}
                        <RoleStickerTile
                          name={g.name}
                          roles={(g as any).guideRoles}
                          posts={(g as any).localPostCount}
                          rating={g.rating || 0}
                          ratingCount={(g as any).ratingCount || 0}
                          votes={(g as any).helpfulVotes}
                          profilePicture={g.profilePicture}
                          location={g.location}
                        />
                      </div>
                      <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                        {roleNoun(guideRolesOrLegacy((g as any).guideRoles)[0] || 'guide')}
                        {g.guideLicense ? ' · Licensed guide' : ''}
                        {g.location ? ` · ${g.location}` : ''}
                      </p>
                      <p className={cn('text-[11px] font-medium flex items-center gap-1 mt-0.5', g.guideAvailable ? 'text-primary' : 'text-muted-foreground')}>
                        <Radio className={cn('w-3 h-3', g.guideAvailable && 'animate-pulse')} />
                        {g.guideAvailable ? 'Accepting gigs right now' : 'Offline'}
                        {g.distanceKm != null && ` · ${g.distanceKm} km away`}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => openReviews({ id: g.id, name: g.name })}
                    className="text-right shrink-0"
                    title="See all reviews"
                  >
                    <span className="flex items-center gap-1 text-sm font-extrabold text-amber-600 justify-end">
                      <Star className="w-4 h-4 fill-current" />
                      {g.rating > 0 ? g.rating.toFixed(1) : 'New'}
                    </span>
                    <span className="block text-[10px] text-muted-foreground">{(g as any).ratingCount || 0} reviews</span>
                  </button>
                </div>

                {/* v214 stats tile: completed gigs + total earnings. Both derive
                    from REAL data: gigs = the member's posted price count,
                    earnings = gigs x their own listed hourly rate. */}
                <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg bg-accent/70 p-3" data-testid="talent-stats">
                  <div>
                    <p className="text-[9px] font-bold tracking-wider text-muted-foreground uppercase">Completed gigs</p>
                    <p className="text-sm font-extrabold text-foreground">
                      <span data-testid="talent-gigs">{(g as any).localPostCount ?? 0}</span> Jobs
                    </p>
                  </div>
                  <div>
                    <p className="text-[9px] font-bold tracking-wider text-muted-foreground uppercase">Total earnings</p>
                    <p className="text-sm font-extrabold text-primary" data-testid="talent-earnings">
                      {g.guideCurrency || '$'}{(((g as any).localPostCount ?? 0) * (g.guideHourlyRate ?? 15)).toLocaleString()}
                    </p>
                  </div>
                </div>

                {/* v214 featured gig quote box */}
                {(g.guideBio || (g as any).bio || (g as any).headline) && (
                  <div className="mt-3 rounded-lg border border-primary/20 bg-primary/5 p-2.5">
                    <p className="flex items-center gap-1 text-[9px] font-bold tracking-wider text-primary uppercase">
                      <Zap className="w-3 h-3" />
                      Featured gig
                    </p>
                    <p className="mt-1 text-xs italic text-muted-foreground line-clamp-2">
                      &ldquo;{g.guideBio || (g as any).bio || (g as any).headline}&rdquo;
                    </p>
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

                {/* v214 skill chips: specialties + languages on one row */}
                {(g.guideSpecialties.length > 0 || g.guideLanguages.length > 0) && (
                  <div className="mt-3 flex items-center gap-1.5 flex-wrap">
                    {g.guideSpecialties.map((spec: string) => (
                      <Badge key={spec} variant="secondary" className="bg-primary/10 text-primary text-[10px] rounded-md">{spec}</Badge>
                    ))}
                    {g.guideLanguages.map((lang: string) => (
                      <Badge key={lang} variant="secondary" className="bg-accent text-foreground text-[10px] rounded-md">{lang}</Badge>
                    ))}
                  </div>
                )}

                {/* v214 bottom: Starting Rate + Book Now / Chat (reference row) */}
                <div className="mt-4 pt-3 border-t border-border">
                  <div className="flex items-end justify-between gap-2 flex-wrap">
                    <div className="min-w-0">
                      <p className="text-[10px] text-muted-foreground">Starting Rate</p>
                      {g.guideHourlyRate != null && g.guideCurrency ? (
                        <p className="font-extrabold text-foreground leading-tight">
                          {g.guideCurrency} {g.guideHourlyRate}
                          <span className="text-xs font-normal text-muted-foreground"> /hr</span>
                        </p>
                      ) : (
                        <p className="text-sm font-semibold text-muted-foreground">Rate on request</p>
                      )}
                    </div>
                    {isOwn ? (
                      <Badge variant="secondary" className="bg-primary/10 text-primary text-[10px] shrink-0">You</Badge>
                    ) : (
                      <div className="flex items-center gap-1.5 flex-wrap justify-end">
                        {bookMessageRateBtns}
                        {shareGuideBtn}
                      </div>
                    )}
                  </div>
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

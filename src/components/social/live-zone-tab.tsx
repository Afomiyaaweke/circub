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
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  Search, Compass, MapPin, Languages, Star, BadgeCheck,
  MessageSquare, Radio, Share2, Sparkles, Navigation, Loader2, ChevronDown,
  ChevronUp, Lightbulb, Users, CalendarCheck, ShieldCheck, Plus,
  Play, Video, Zap, ArrowRight, ArrowLeft, Clock, Tag, CheckCircle2, Send,
  Pencil, Trash2, UserX, X, Plane, Bookmark, RefreshCw,
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
import { guideRolesOrLegacy, roleNoun } from '@/lib/roles'
import { VideoEmbed } from './video-embed'
import { useProgressiveList } from '@/lib/use-progressive-list'
import { GuideRatingModal } from './guide-rating-modal'
import { GuideReviewsModal, GuideStars } from './guide-reviews-modal'
import { GuideBookingModal, BookingGuideInfo } from './guide-booking-modal'
import { GuideBookingsModal } from './guide-bookings-modal'
import type { User } from '@/lib/types'
import { avatarSrc } from '@/lib/fighters'
import { toggleSaved, isSaved as checkSaved } from '@/lib/saved-items'
import { RoleStickerTile } from './role-sticker-reveal'

interface LiveZoneTabProps {
  me: User | null
  onMessage: (userId: string) => void
  onBecomeGuide: () => void
  // v230: the Link tab is a full-screen reel view - the app header, sidebar
  // and dock are all hidden, so the parent hands us a way back to the tab
  // the user came from. The availability toggle button lives in the user's
  // own profile now (the v229 hero row is gone).
  onToggleAvailability?: () => void
  // v227: shared bounties land on /?quest=<id> - the swipe deck scrolls to
  // and flashes that bounty, then the parent clears the highlight.
  highlightQuestId?: string | null
  onHighlightDone?: () => void
  onBack?: () => void
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
// make it only in one line"). v231 ("remove this and put it all in one
// search bar only"): the four lane pill TABS are GONE from the screen - the
// rows below keep this catalog as the one source of truth for what each lane
// means and what it pays. Role slicing now happens INSIDE the search bar:
// typing scout / helper / hunter / agent (plural allowed) applies that lane's
// role filter, exactly like tapping a pill used to. Price ranges stay as
// tooltips on the lane chip; the live counters live on the feed switcher.
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

// v231 one-search-bar role slicer. Maps the typed lane keywords onto the
// SAME role slugs the old lane tabs filtered by (guide / local / sales /
// agent). Only the lane SHORT names match - generic words from the labels
// ("local", "travel", "price") are deliberately NOT keywords so ordinary
// skill searches like "local food" or "price of coffee" keep working.
// Returns the role slug plus the search text with the keyword stripped
// (that remainder still narrows by skill/bio/location as before).
export function parseLaneSearch(text: string): { role: 'guide' | 'local' | 'sales' | 'agent'; short: string; cleaned: string } | null {
  const t = text.toLowerCase()
  for (const lane of HUSTLE_LANES) {
    const w = lane.short.toLowerCase()
    const re = new RegExp(`\\b${w}s?\\b`)
    if (re.test(t)) {
      return {
        role: lane.role,
        short: lane.short,
        cleaned: text.replace(new RegExp(`\\b${w}s?\\b`, 'i'), ' ')
          .replace(/\s+/g, ' ')
          .replace(/^[,\s]+|[,\s]+$/g, ''),
      }
    }
  }
  return null
}

// v229 mockup accent glows - one soft blurred circle per swipe card,
// rotated by index (emerald / sky / amber / rose), theme-safe opacities.
const DECK_GLOWS = ['bg-emerald-500/15', 'bg-sky-500/15', 'bg-amber-500/15', 'bg-rose-500/15']

type QuestRow = {
  id: string
  title: string
  details: string | null
  location: string
  deadlineText: string
  bountyUsd: number
  posterName: string
  // v229: member posters carry their public username (guest posters are
  // null) so the action rail's Chat button can open their profile page.
  posterUsername?: string | null
  claimed: boolean
  // v219 privacy: the claimer's name/contact are never sent to the client -
  // the board only knows the two session-scoped flags below. Applicant
  // details for posters live in Profile > Bounties (via /api/quests/mine).
  isMine: boolean
  myClaim: boolean
  createdAt: string
}


export function LiveZoneTab({ me, onMessage, onBecomeGuide, highlightQuestId, onHighlightDone, onBack }: LiveZoneTabProps) {
  const router = useRouter()
  const [guides, setGuides] = useState<any[]>([])
  // Load part by part: render a small batch first, append more on scroll
  const { visible: visibleGuides, hasMore: guidesHasMore, sentinelRef: guidesSentinelRef } = useProgressiveList(guides, 6, 6)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  // v218: standalone language/specialty dropdown filters removed as redundant
  // - the search box matches languages, specialties and locations already.
  // v231: the lane role filter (v161) is DERIVED from the same search text -
  // typing "scout", "helper", "hunter" or "agent" slices the directory by
  // that lane's role; no separate role state, no tabs, one search bar.
  const laneHit = useMemo(() => parseLaneSearch(search), [search])
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
      const q = laneHit ? laneHit.cleaned : search
      if (q) params.set('search', q)
      if (laneHit) params.set('role', laneHit.role)
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
  }, [search, laneHit, availableOnly, nearMe, myCoords, meRolesKey])

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
  // v219 poster/claimer management: inline Edit (reuses the post form),
  // Delete, Drop claim and Remove claimer. questBusy marks the quest whose
  // action is in flight so only that card's buttons spin.
  const [editingQuest, setEditingQuest] = useState<string | null>(null)
  const [questBusy, setQuestBusy] = useState<string>('')

  // v227 TikTok-style swipe deck: the bounty board renders as a full-height
  // vertical snap feed (one bounty per screen, swipe up for the next) with
  // the Instant-Bounties furniture: tier pills on top, the poster identity
  // row, the green GUARANTEED ESCROW REWARD banner and the right-side
  // action rail (save / claim bolt / share). Tier pills slice by the
  // platform's own lane rate cards (Hunter $5-20, Helper $15-30, Scout
  // $24-45) - no new fields, just honest filters on bountyUsd.
  const [bountyTier, setBountyTier] = useState<'all' | 'scout' | 'helper' | 'hunter'>('all')
  const [savedQuests, setSavedQuests] = useState<Record<string, boolean>>({})
  const [questFlash, setQuestFlash] = useState<string | null>(null)
  const deckRef = useRef<HTMLDivElement | null>(null)

  // v229 TikTok feed mode - the mockup's top switcher: 'Instant Bounties'
  // vs 'Talent On Call'. Deals stay the default (v220 deals-first contract).
  const [feed, setFeed] = useState<'bounties' | 'talents'>('bounties')
  // v229 talent rail: per-guide saved flags from the localStorage saved-items
  // store (type 'guide'), mirroring the bounty rail.
  const [savedGuides, setSavedGuides] = useState<Record<string, boolean>>({})

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

  // v227: seed the per-quest saved flags from the localStorage saved-items
  // store whenever the quest list lands (the rail's Save toggles live here).
  useEffect(() => {
    if (!quests) return
    setSavedQuests(() => {
      const next: Record<string, boolean> = {}
      quests.forEach((q) => { next[q.id] = checkSaved(q.id) })
      return next
    })
  }, [quests])

  // v227 deep link: /?quest=<id> opens this tab with the target bounty
  // flashed - switch to the bounties feed, scroll the snap deck to the card,
  // ring it for ~2.5s, report back.
  useEffect(() => {
    if (highlightQuestId) setFeed('bounties')
  }, [highlightQuestId])
  useEffect(() => {
    if (!highlightQuestId || feed !== 'bounties' || !quests || quests.length === 0) return
    const deck = deckRef.current
    const card = deck?.querySelector<HTMLElement>(`[data-quest-id="${highlightQuestId}"]`)
    if (deck && card) {
      deck.scrollTo({ top: card.offsetTop, behavior: 'smooth' })
      setQuestFlash(highlightQuestId)
      const t = setTimeout(() => { setQuestFlash(null); onHighlightDone?.() }, 2600)
      return () => clearTimeout(t)
    }
  }, [highlightQuestId, feed, quests, onHighlightDone])

  // v230: Escape leaves the reel too (desktop nicety) - UNLESS a modal dialog
  // just handled the keystroke. Radix flushes the dialog close synchronously
  // during the same Escape event, so a "is a dialog open" check in the bubble
  // phase is already too late; instead we remember the last time a dialog was
  // seen in the DOM and stay put for a short grace window after that.
  const dialogSeenAtRef = useRef(0)
  useEffect(() => {
    if (!onBack) return
    const scan = () => {
      if (document.querySelector('[role="dialog"]')) dialogSeenAtRef.current = Date.now()
    }
    scan()
    const mo = new MutationObserver(scan)
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-state'] })
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      scan()
      if (Date.now() - dialogSeenAtRef.current < 600) return
      onBack()
    }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey); mo.disconnect() }
  }, [onBack])

  const handleQuestSave = (q: QuestRow) => {
    const now = toggleSaved({
      id: q.id,
      type: 'quest',
      title: q.title,
      subtitle: q.location,
      priceLabel: `$${q.bountyUsd.toFixed(2)}`,
      imageUrl: null,
      href: null,
    })
    setSavedQuests((prev) => ({ ...prev, [q.id]: now }))
    toast({ title: now ? 'Bounty saved' : 'Removed from saved' })
  }

  const shareQuest = async (q: QuestRow) => {
    const url = typeof window === 'undefined'
      ? 'https://circubawd.vercel.app'
      : `${window.location.origin}/?quest=${q.id}`
    const text = `Bounty: ${q.title} - $${q.bountyUsd.toFixed(2)} in ${q.location}`
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ title: 'circubAwd bounty', text, url })
        return
      }
      await navigator.clipboard.writeText(`${text} ${url}`)
      toast({ title: 'Link copied', description: 'Paste it anywhere to send someone this bounty.' })
    } catch { /* user cancelled the share sheet */ }
  }

  // v229 bounty rail Chat action: member posters open their public profile;
  // guest posters (no account) get an honest explanation instead of a dead
  // link - their contact unlocks through the claim flow.
  const chatWithPoster = (q: QuestRow) => {
    if (q.posterUsername) {
      router.push(`/u/${q.posterUsername}`)
      return
    }
    toast({ title: 'This poster is a guest', description: 'They posted without an account. Claim the bounty to get their contact instantly.' })
  }

  // v229 talent rail: seed per-guide saved flags whenever the directory
  // lands (the rail's Save toggles live here, same as the bounty rail).
  useEffect(() => {
    if (!guides.length) return
    setSavedGuides(() => {
      const next: Record<string, boolean> = {}
      guides.forEach((g) => { next[g.id] = checkSaved(g.id) })
      return next
    })
  }, [guides])

  const handleGuideSave = (g: any) => {
    const now = toggleSaved({
      id: g.id,
      type: 'guide',
      title: g.name,
      subtitle: g.location || null,
      priceLabel: g.guideHourlyRate != null && g.guideCurrency ? `${g.guideCurrency} ${g.guideHourlyRate}/hr` : 'Rate on request',
      imageUrl: g.profilePicture ? avatarSrc(g.profilePicture) : null,
      href: g.username ? `/g/${g.username}` : null,
    })
    setSavedGuides((prev) => ({ ...prev, [g.id]: now }))
    toast({ title: now ? 'Talent saved' : 'Removed from saved' })
  }

  const shareGuide = async (g: any) => {
    const url = typeof window === 'undefined'
      ? 'https://circubawd.vercel.app'
      : g.username
        ? `${window.location.origin}/g/${g.username}`
        : `${window.location.origin}/?guide=${g.id}`
    const rls = guideRolesOrLegacy((g as any).guideRoles)
    const text = `${g.name} - ${roleNoun(rls[0] || 'local')} on circubAwd`
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ title: 'circubAwd talent', text, url })
        return
      }
      await navigator.clipboard.writeText(`${text} ${url}`)
      toast({ title: 'Link copied', description: url.replace(/^https?:\/\//, '') })
    } catch { /* user cancelled the share sheet */ }
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

  // v227 swipe deck: tier pills slice the bounty deck by the platform's own
  // lane rate cards - Hunter ($5-20) under $15, Helper ($15-30) in the
  // middle, Scout ($24-45) at $30+. No new fields, just honest filters.
  const BOUNTY_TIERS: Array<{ key: 'all' | 'scout' | 'helper' | 'hunter'; label: string }> = [
    { key: 'all', label: 'All bounties' },
    { key: 'hunter', label: 'Hunter · under $15' },
    { key: 'helper', label: 'Helper · $15-30' },
    { key: 'scout', label: 'Scout · $30+' },
  ]
  const tierOf = (bountyUsd: number): 'scout' | 'helper' | 'hunter' =>
    bountyUsd >= 30 ? 'scout' : bountyUsd >= 15 ? 'helper' : 'hunter'
  const filteredQuests = quests
    ? (bountyTier === 'all' ? quests : quests.filter((q) => tierOf(q.bountyUsd) === bountyTier))
    : []
  const initialsOf = (name: string) =>
    name.trim().split(/\s+/).slice(0, 2).map((w) => w.charAt(0).toUpperCase()).join('') || '?'
  const posterCount = (name: string) => (quests || []).filter((x) => x.posterName === name).length

  return (
    /* v230 FULL-SCREEN REEL SHELL - the user: "remove all the header from the
       link session and only keep the toggle and my escrow and make the
       swiping full screen like reel have back also". The Link tab now covers
       the whole viewport (fixed inset-0, above the app header z-30 and the
       mobile dock z-40; radix dialogs portal above at z-50). The ONLY header
       is one slim bar: back (to the tab the user came from) + the feed
       toggle + My Payouts & Escrow. The old hero row (hustlers online,
       escrow badge, join/guide/go-live) is gone. */
    <div className="fixed inset-0 z-50 bg-background flex flex-col" data-testid="link-reel-root">
      {/* v230 TOP BAR - the only header kept: back + toggle + payouts. */}
      <div className="shrink-0 flex items-center gap-2 pl-2 pr-2.5 pt-[max(env(safe-area-inset-top),0.5rem)] pb-2 bg-background/95 backdrop-blur border-b border-border" data-testid="link-topbar">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            data-testid="link-back"
            aria-label="Back"
            title="Back"
            className="w-9 h-9 rounded-full bg-accent hover:bg-accent/60 flex items-center justify-center shrink-0 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}

        {/* v229 FEED MODE SWITCHER - the mockup's TikTok mode pills, fed with
            REAL counts (open bounties / registered talent). Bounties stay the
            default feed (v220 deals-first contract). */}
        <div className="flex items-center flex-1 min-w-0 p-0.5 rounded-full bg-accent/70 border border-border" role="tablist" aria-label="Link tab feed" data-testid="feed-switcher">
          <button
            type="button"
            role="tab"
            aria-selected={feed === 'bounties'}
            data-testid="feed-tab-bounties"
            onClick={() => setFeed('bounties')}
            className={cn(
              'flex-1 h-8 px-2 rounded-full text-xs font-bold transition-all inline-flex items-center justify-center gap-1 min-w-0',
              feed === 'bounties'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Zap className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Instant Bounties</span>
            <span className={cn('text-[9px] px-1.5 py-0.5 rounded-full font-semibold shrink-0', feed === 'bounties' ? 'bg-white/20 text-white' : 'bg-card text-muted-foreground')}>
              {quests?.length ?? 0}
            </span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={feed === 'talents'}
            data-testid="feed-tab-talents"
            onClick={() => setFeed('talents')}
            className={cn(
              'flex-1 h-8 px-2 rounded-full text-xs font-bold transition-all inline-flex items-center justify-center gap-1 min-w-0',
              feed === 'talents'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Users className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Talent On Call</span>
            <span className={cn('text-[9px] px-1.5 py-0.5 rounded-full font-semibold shrink-0', feed === 'talents' ? 'bg-white/20 text-white' : 'bg-card text-muted-foreground')}>
              {guides.length}
            </span>
          </button>
        </div>

        {/* My Payouts & Escrow - the one action the user asked to keep in the
            header ("only keep the toggle and my escrow"). Icon-only on
            phones, full label from md up. */}
        <button
          type="button"
          onClick={() => setBookingsOpen(true)}
          data-testid="payouts-escrow-btn"
          aria-label="My payouts and escrow"
          className="relative w-9 h-9 md:w-auto md:h-9 md:px-3 rounded-full md:rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground inline-flex items-center justify-center gap-1.5 shrink-0 transition-colors cursor-pointer"
        >
          <CalendarCheck className="w-4 h-4" />
          <span className="hidden md:inline text-xs font-semibold whitespace-nowrap">My Payouts &amp; Escrow</span>
          {pendingBookings > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-semibold flex items-center justify-center">
              {pendingBookings > 9 ? '9+' : pendingBookings}
            </span>
          )}
        </button>
      </div>

      {/* ============ v230 BOUNTIES FEED (Instant Bounties) ============ */}
      <div className={cn('flex-1 min-h-0 flex flex-col', feed !== 'bounties' && 'hidden')} data-testid="bounty-board">
        {qPostOk && (
          <p className="shrink-0 mx-2.5 mt-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300" data-testid="quest-post-ok">
            {qPostOk}
          </p>
        )}

        {showQuestForm && (
          <form
            onSubmit={postQuestHere}
            className="shrink-0 mx-2.5 mt-1.5 bg-card rounded-2xl border border-border p-4 sm:p-5 shadow-sm space-y-3 max-h-[46dvh] overflow-y-auto scrollbar-thin"
            data-testid="quest-post-form"
            id="bounty-board-form"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-bold text-foreground">
                {editingQuest ? 'Edit your quest - update the terms, then save' : 'Upload an instant quest - ask for help, offer a bounty'}
              </p>
              <button
                type="button"
                onClick={() => setShowQuestForm(false)}
                data-testid="quest-form-close"
                aria-label="Close the quest form"
                className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-muted-foreground hover:text-foreground shrink-0 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
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
          <p className="px-3 py-2 text-sm text-muted-foreground shrink-0" data-testid="bounty-loading">Loading bounties...</p>
        ) : quests.length === 0 ? (
          <p className="px-3 py-2 text-sm text-muted-foreground shrink-0" data-testid="bounty-empty">No open bounties yet - post the first instant quest.</p>
        ) : (
          <>
            {/* v227 tier pills - the mockup's "Quick category filter pills".
                Named after the platform's own hustle lanes; slices the deck
                by bounty size: Hunter < $15, Helper $15-30, Scout $30+.
                v230: the Post pill lives at the right end of this row (the
                dedicated button row above the deck is gone). */}
            <div className="shrink-0 flex items-center gap-1.5 overflow-x-auto scrollbar-thin px-2.5 py-1.5" data-testid="bounty-tiers">
              {BOUNTY_TIERS.map((tier) => {
                const count = tier.key === 'all' ? quests.length : quests.filter((q) => tierOf(q.bountyUsd) === tier.key).length
                return (
                  <button
                    key={tier.key}
                    type="button"
                    onClick={() => setBountyTier(tier.key)}
                    data-testid={`bounty-tier-${tier.key}`}
                    className={cn(
                      'shrink-0 h-8 px-3 rounded-full text-xs font-bold transition-colors',
                      bountyTier === tier.key
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'bg-accent text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {tier.label} · {count}
                  </button>
                )
              })}
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
                className="ml-auto shrink-0 inline-flex items-center gap-1 h-8 px-3 rounded-full bg-primary text-primary-foreground text-xs font-bold shadow-sm hover:bg-primary/90 active:scale-[0.98] transition-all"
              >
                <Plus className="w-3.5 h-3.5 shrink-0" />
                {editingQuest ? 'Cancel edit' : 'Post'}
              </button>
            </div>

            {/* v230 the deck itself: FULL SCREEN - the reel fills everything
                under the slim top bar, one bounty per snap screen. A centered
                560px column on desktop, edge-to-edge on phones. */}
            <div
              ref={deckRef}
              data-testid="bounty-swipe"
              className="relative flex-1 min-h-0 w-full overflow-y-auto overscroll-contain snap-y snap-mandatory scroll-smooth scrollbar-thin bg-background"
            >
              {filteredQuests.map((q, idx) => {
                const isClaimed = q.claimed || locallyClaimed[q.id]
                const isLast = idx === filteredQuests.length - 1
                const qCount = posterCount(q.posterName)
                return (
                  /* v230 full-bleed reel slide: the slide fills the viewport
                     width; the card content lives in a centered 560px column
                     on desktop (TikTok-web style) and goes edge-to-edge on
                     phones. Content below is one level shallower than it
                     looks - the wrapper exists purely for the desktop gutters. */
                  <div
                    key={q.id}
                    data-quest-id={q.id}
                    data-testid="bounty-card"
                    className="relative h-full w-full snap-start snap-always flex bg-background"
                  >
                    <div className={cn(
                      'relative h-full w-full max-w-[560px] mx-auto flex flex-col bg-card shadow-md p-4 sm:p-5 overflow-hidden border-border sm:border-x',
                      questFlash === q.id && 'ring-2 ring-primary ring-inset'
                    )}>
                    {/* mockup accent glow - rotated per card */}
                    <div className={cn('absolute -right-12 -top-12 w-44 h-44 rounded-full blur-2xl pointer-events-none', DECK_GLOWS[idx % DECK_GLOWS.length])} aria-hidden="true" />

                    {/* chips row - where + when, straight off the real post */}
                    <div className="relative flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 border border-emerald-200 text-emerald-800 dark:bg-emerald-500/10 dark:border-emerald-500/30 dark:text-emerald-300 min-w-0">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                        <span className="truncate">{q.location}</span>
                      </span>
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-amber-400 shrink-0 max-w-[45%]">
                        <Clock className="w-3 h-3 shrink-0" />
                        <span className="truncate">{q.deadlineText}</span>
                      </span>
                    </div>

                    <h3 className="relative mt-2.5 text-lg font-black text-foreground leading-snug tracking-tight">{q.title}</h3>
                    {q.details && (
                      <p className="relative mt-1.5 text-xs text-muted-foreground leading-relaxed line-clamp-3">{q.details}</p>
                    )}

                    {/* poster info chip (the ppl) - avatar initials, who
                        posted, how many tasks they have live */}
                    <div className="relative mt-3 flex items-center gap-2 p-2 rounded-xl bg-emerald-50/70 border border-emerald-100 dark:bg-primary/10 dark:border-primary/20 min-w-0" data-testid="bounty-poster-row">
                      <span className="w-8 h-8 rounded-full bg-slate-900 dark:bg-primary text-white flex items-center justify-center font-black text-xs shrink-0">
                        {initialsOf(q.posterName)}
                      </span>
                      <div className="text-[11px] leading-tight min-w-0">
                        <p className="text-[10px] text-muted-foreground">Posted by {q.isMine ? 'you' : 'local hustler'}</p>
                        <p className="font-bold text-foreground truncate">
                          {q.posterName} <span className="text-emerald-700 dark:text-emerald-400 font-semibold">• {qCount} task{qCount !== 1 ? 's' : ''} posted</span>
                        </p>
                      </div>
                      {q.isMine && !isClaimed && (
                        <div className="ml-auto flex items-center gap-1 shrink-0" data-testid="quest-manage-row">
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
                        </div>
                      )}
                    </div>

                    {/* GUARANTEED ESCROW REWARD banner - the green strip */}
                    <div className="relative mt-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-3.5 py-3 text-white shadow-sm flex items-center justify-between gap-2" data-testid="bounty-reward-banner">
                      <div className="min-w-0">
                        <p className="text-[10px] uppercase font-bold tracking-wider opacity-90">Guaranteed escrow reward</p>
                        <p className="text-2xl font-black tracking-tight leading-none" data-testid="bounty-reward">${q.bountyUsd.toFixed(2)}</p>
                      </div>
                      <span className="shrink-0 bg-white/20 text-[10px] px-2 py-1 rounded-full font-bold">
                        {isClaimed ? 'In Escrow' : 'Instant Auto-Release'}
                      </span>
                    </div>

                    {/* claim area - same states and testids as before, now
                        inside the swipe card */}
                    <div className="relative mt-2.5 flex-1 min-h-0 overflow-y-auto scrollbar-thin">
                      {isClaimed ? (
                        <div
                          className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 dark:border-emerald-500/30 dark:bg-emerald-500/10"
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
                          className="space-y-2"
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
                        <div className="flex items-center gap-2 flex-wrap">
                          <Button
                            size="sm"
                            data-testid="bounty-claim"
                            onClick={() => setClaimFor(q.id)}
                            className="bg-primary hover:bg-primary/90 gap-1"
                          >
                            Claim Bounty
                            <ArrowRight className="w-3.5 h-3.5" />
                          </Button>
                          <p className="text-[11px] text-muted-foreground">1-click claim - the poster&apos;s contact opens instantly</p>
                        </div>
                      )}
                    </div>

                    {/* swipe hint - bottom center of every card */}
                    <div className="relative pt-2 flex items-center justify-center gap-1 text-[10px] font-semibold text-muted-foreground" data-testid="bounty-swipe-hint">
                      {isLast ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
                          You reached the last bounty
                        </>
                      ) : (
                        <>
                          <ChevronDown className="w-3.5 h-3.5 animate-bounce" />
                          Swipe up for next bounty
                        </>
                      )}
                    </div>

                    {/* v229 action rail - the mockup's TikTok stack: round
                        buttons with labels, honest actions only. Chat opens a
                        member poster's profile; guest posters get an honest
                        toast pointing at the claim flow. */}
                    <div className="absolute right-2.5 bottom-4 z-10 flex flex-col items-center gap-2.5" data-testid="bounty-action-rail">
                      <div className="flex flex-col items-center">
                        <button
                          type="button"
                          onClick={() => handleQuestSave(q)}
                          data-testid="bounty-save"
                          aria-label={savedQuests[q.id] ? 'Remove from saved' : 'Save bounty'}
                          className="w-11 h-11 rounded-full bg-card/95 border border-border shadow-sm flex items-center justify-center hover:scale-105 active:scale-95 transition-all"
                        >
                          <Bookmark className={cn('w-5 h-5', savedQuests[q.id] ? 'fill-primary text-primary' : 'text-muted-foreground')} />
                        </button>
                        <span className="text-[9px] font-bold text-muted-foreground mt-0.5">{savedQuests[q.id] ? 'Saved' : 'Save'}</span>
                      </div>
                      {!isClaimed && (
                        <div className="flex flex-col items-center">
                          <button
                            type="button"
                            onClick={() => setClaimFor(q.id)}
                            data-testid="bounty-claim-bolt"
                            aria-label="Claim bounty"
                            className="w-11 h-11 rounded-full bg-primary text-primary-foreground shadow-md shadow-primary/30 flex items-center justify-center hover:scale-105 active:scale-95 transition-all"
                          >
                            <Zap className="w-5 h-5 fill-current" />
                          </button>
                          <span className="text-[9px] font-bold text-primary mt-0.5">Claim</span>
                        </div>
                      )}
                      {/* v229 the mockup's add sign, right next to Claim:
                          opens the same inline post form as the top button
                          ("add the add sign next to the claim to add post"). */}
                      <div className="flex flex-col items-center">
                        <button
                          type="button"
                          onClick={() => {
                            setShowQuestForm((v) => {
                              if (!v) { setEditingQuest(null); setQTitle(''); setQDetails(''); setQLocation(''); setQDeadline(''); setQBounty(''); setQContact('') }
                              return true
                            })
                            setQPostErr('')
                            try { document.getElementById('bounty-board-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' }) } catch { /* noop */ }
                          }}
                          data-testid="bounty-post-rail"
                          aria-label="Post an instant quest"
                          className="w-11 h-11 rounded-full bg-primary text-primary-foreground shadow-md shadow-primary/30 flex items-center justify-center hover:scale-105 active:scale-95 transition-all"
                        >
                          <Plus className="w-5 h-5" />
                        </button>
                        <span className="text-[9px] font-bold text-primary mt-0.5">Post</span>
                      </div>
                      <div className="flex flex-col items-center">
                        <button
                          type="button"
                          onClick={() => void shareQuest(q)}
                          data-testid="bounty-share"
                          aria-label="Share bounty"
                          className="w-11 h-11 rounded-full bg-card/95 border border-border shadow-sm flex items-center justify-center hover:scale-105 active:scale-95 transition-all"
                        >
                          <Share2 className="w-5 h-5 text-muted-foreground" />
                        </button>
                        <span className="text-[9px] font-bold text-muted-foreground mt-0.5">Share</span>
                      </div>
                      <div className="flex flex-col items-center">
                        <button
                          type="button"
                          onClick={() => chatWithPoster(q)}
                          data-testid="bounty-chat"
                          aria-label="Open the poster's profile"
                          className="w-11 h-11 rounded-full bg-card/95 border border-border shadow-sm flex items-center justify-center hover:scale-105 active:scale-95 transition-all"
                        >
                          <MessageSquare className="w-5 h-5 text-muted-foreground" />
                        </button>
                        <span className="text-[9px] font-bold text-muted-foreground mt-0.5">Chat</span>
                      </div>
                    </div>
                    </div>
                  </div>
                )
              })}

              {/* end card - honest stopping point, one tap to refresh */}
              <div className="h-full w-full max-w-[560px] mx-auto snap-start snap-always flex flex-col items-center justify-center gap-3 p-6 text-center bg-card border-border sm:border-x" data-testid="bounty-deck-end">
                <span className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <CheckCircle2 className="w-6 h-6 text-primary" />
                </span>
                <p className="text-sm font-bold text-foreground">All bounties viewed</p>
                <Button size="sm" variant="outline" onClick={() => void reloadQuests()} className="gap-1.5" data-testid="bounty-refresh">
                  <RefreshCw className="w-3.5 h-3.5" />
                  Refresh for new drops
                </Button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* v222: the tall escrow guarantee band was REMOVED (user: "remove
          this section all and make it only in one line") - the escrow story
          survives in the compact hero badge above and the payouts modal. */}

      {/* ============ v230 TALENT FEED (Talent On Call) ============ */}
      <div className={cn('flex-1 min-h-0 flex flex-col', feed !== 'talents' && 'hidden')} data-testid="talent-feed">
      {/* v231 ONE SEARCH BAR - the user: "remove this and put it all in one
          search bar only". The four lane tabs are gone; this single pill is
          the ONLY filter surface for the talent feed and it keeps the results
          in the SAME swipe deck below (no new page). Inside, left to right:
          the input (matches name/bio/languages/specialties/location AND the
          lane keywords scout/helper/hunter/agent), the active-lane chip,
          then AI Match / Available / Near me as icon toggles. */}
      <div className="shrink-0 px-2.5 pt-1.5" data-testid="talent-search-bar">
        {/* Desktop: the pill rides the same centered 560px column as the
            swipe cards instead of stretching across the viewport. */}
        <div className="flex items-center gap-0.5 rounded-full border border-input bg-card shadow-xs overflow-hidden pl-1 pr-1 mx-auto w-full max-w-[560px]">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              data-testid="talent-search-input"
              placeholder="Search talent or type Scout / Helper / Hunter / Agent..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 pr-1 h-9 text-sm bg-transparent border-0 rounded-none shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-transparent"
            />
          </div>
          {/* Active lane chip - shows which lane keyword matched; tap the x
              to strip the keyword from the input. */}
          {laneHit && (
            <button
              type="button"
              data-testid="lane-chip"
              onClick={() => setSearch(laneHit.cleaned)}
              title="Lane filter active - tap to clear"
              className="shrink-0 inline-flex items-center gap-0.5 h-7 px-2 rounded-full bg-primary/10 text-primary text-[10px] font-bold cursor-pointer hover:bg-primary/20 transition-colors"
            >
              {laneHit.short}
              <X className="w-3 h-3" />
            </button>
          )}
          {/* AI Guide Match - tap to open the ask form in the panel below;
              a finished match keeps the button lit. */}
          <button
            type="button"
            data-testid="ai-match-toggle"
            onClick={() => setAiOpen(!aiOpen)}
            aria-expanded={aiOpen}
            title="AI Guide Match - ask anything · get matched guides + places"
            className={
              'flex items-center gap-1 h-9 px-2 shrink-0 text-xs font-medium rounded-full transition-colors cursor-pointer ' +
              (aiOpen || aiResult ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-primary')
            }
          >
            <Sparkles className="w-4 h-4 shrink-0" />
            <span className="hidden md:inline shrink-0">AI Match</span>
            {aiOpen ? <ChevronUp className="w-3 h-3 shrink-0" /> : <ChevronDown className="w-3 h-3 shrink-0" />}
          </button>
          {/* Available - only talent whose availability toggle is ON */}
          <button
            type="button"
            data-testid="available-toggle"
            onClick={() => setAvailableOnly(!availableOnly)}
            title="Show only talent whose availability toggle is ON"
            aria-pressed={availableOnly}
            className={cn(
              'flex items-center justify-center h-9 w-9 shrink-0 rounded-full transition-colors cursor-pointer',
              availableOnly ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-primary'
            )}
          >
            <Radio className={cn('w-4 h-4', availableOnly && 'animate-pulse')} />
          </button>
          {/* Near me - GPS distance sort */}
          <button
            type="button"
            data-testid="nearme-toggle"
            onClick={handleNearMe}
            disabled={locating}
            title="Sort talent by distance from you"
            aria-pressed={nearMe}
            className={cn(
              'flex items-center justify-center h-9 w-9 shrink-0 rounded-full transition-colors cursor-pointer disabled:opacity-60',
              nearMe ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-primary'
            )}
          >
            {locating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Navigation className={cn('w-4 h-4', nearMe && 'animate-pulse')} />}
          </button>
        </div>
      </div>

      {/* AI Guide Match panel - opens from the AI button inside the search
          pill. The ask form tucks away after a match; the result stays. */}
      {(aiOpen || aiResult) && (
      <Card className="shrink-0 mx-2.5 mt-1.5 max-h-[46dvh] overflow-y-auto scrollbar-thin p-3 sm:p-5 shadow-sm border-primary/20">
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

        {/* v229 talent snap deck - the mockup's Talent On Call feed: one
            profile per screen, same rail furniture as the bounty cards.
            v231: the ONE search bar above (lane keywords + AI Match +
            Available + Near me) slices this directory (contracts kept). */}
        {loading && guides.length === 0 ? (
          <div className="shrink-0 mx-2.5 mt-1.5 grid grid-cols-1 gap-3">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="p-4 space-y-3">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-16 w-full" />
              </Card>
            ))}
          </div>
        ) : guides.length === 0 ? (
          <Card className="shrink-0 mx-2.5 mt-1.5 p-10 text-center shadow-sm">
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
          <div
            data-testid="talent-swipe"
            className="relative flex-1 min-h-0 w-full overflow-y-auto overscroll-contain snap-y snap-mandatory scroll-smooth scrollbar-thin bg-background"
          >
            {visibleGuides.map((g, idx) => {
              const isOwn = me?.id === g.id
              const isLastTalent = idx === visibleGuides.length - 1 && !guidesHasMore
              return (
                /* v230 full-bleed reel slide - same shell as the bounty
                   slides: edge-to-edge on phones, centered 560px column with
                   side borders on desktop. */
                <div key={g.id} data-testid="talent-card" className="relative h-full w-full snap-start snap-always flex bg-background">
                  <div className="relative h-full w-full max-w-[560px] mx-auto flex flex-col bg-card shadow-md p-4 sm:p-5 overflow-hidden border-border sm:border-x">
                  <div className={cn('absolute -left-12 -top-12 w-44 h-44 rounded-full blur-2xl pointer-events-none', DECK_GLOWS[(idx + 1) % DECK_GLOWS.length])} aria-hidden="true" />
                  <div className="relative flex-1 min-h-0 flex flex-col">
                    {/* profile header: avatar tile + name/ID + role line +
                        status line; rating block on the right (tap = reviews) */}
                    <div className="flex items-start gap-3">
                      <Avatar className="w-12 h-12 rounded-2xl border border-accent overflow-hidden shrink-0">
                        {g.profilePicture ? (
                          <img src={avatarSrc(g.profilePicture)} alt={g.name} className="w-full h-full object-cover" />
                        ) : (
                          <AvatarFallback className="bg-slate-900 dark:bg-primary/20 text-white font-black">{g.name.charAt(0).toUpperCase()}</AvatarFallback>
                        )}
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1 flex-wrap">
                          {g.username ? (
                            <Link href={`/g/${g.username}`} data-testid="guide-name-link" className="text-base font-black text-foreground truncate hover:text-primary hover:underline underline-offset-2 transition-colors" title={`Open ${g.name}'s guide page`}>{g.name}</Link>
                          ) : (
                            <h3 className="text-base font-black text-foreground truncate">{g.name}</h3>
                          )}
                          {g.verifiedLocal && <BadgeCheck className="w-4 h-4 text-primary shrink-0" />}
                          {(g as any).idVerified && <BadgeCheck className="w-4 h-4 text-blue-500 shrink-0" aria-label="Verified with ID or passport" />}
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
                        <span className={cn('mt-1 inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded border max-w-full', g.guideAvailable ? 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-500/10 dark:border-emerald-500/30' : 'text-muted-foreground bg-accent border-border')}>
                          <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', g.guideAvailable ? 'bg-emerald-500 animate-pulse' : 'bg-muted-foreground/50')} />
                          <span className="truncate">
                            {g.guideAvailable ? 'Accepting gigs right now' : 'Offline'}
                            {g.distanceKm != null && ` · ${g.distanceKm} km away`}
                          </span>
                        </span>
                      </div>
                      <button
                        onClick={() => openReviews({ id: g.id, name: g.name })}
                        className="text-right shrink-0"
                        title="See all reviews"
                      >
                        <span className="flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-amber-400 px-2 py-0.5 rounded-full justify-end">
                          <Star className="w-3 h-3 fill-current" />
                          {g.rating > 0 ? g.rating.toFixed(1) : 'New'}
                        </span>
                        <span className="block text-[9px] text-muted-foreground mt-0.5">{(g as any).ratingCount || 0} reviews</span>
                      </button>
                    </div>

                    {/* stats tile: completed gigs + total earnings - both
                        derive from REAL data (same formulas as the v214 grid) */}
                    <div className="relative mt-3 grid grid-cols-2 gap-2 bg-accent/70 p-2.5 rounded-2xl border border-border" data-testid="talent-stats">
                      <div>
                        <p className="text-[9px] font-bold tracking-wider text-muted-foreground uppercase">Completed gigs</p>
                        <p className="text-base font-black text-foreground leading-tight">
                          <span data-testid="talent-gigs">{(g as any).localPostCount ?? 0}</span> Jobs
                        </p>
                      </div>
                      <div>
                        <p className="text-[9px] font-bold tracking-wider text-muted-foreground uppercase">Total earnings</p>
                        <p className="text-base font-black text-emerald-700 dark:text-emerald-400 leading-tight" data-testid="talent-earnings">
                          {g.guideCurrency || '$'}{(((g as any).localPostCount ?? 0) * (g.guideHourlyRate ?? 15)).toLocaleString()}
                        </p>
                      </div>
                    </div>

                    {/* featured gig quote box */}
                    {(g.guideBio || (g as any).bio || (g as any).headline) && (
                      <div className="relative mt-3 rounded-xl border border-primary/20 bg-primary/5 p-2.5">
                        <p className="text-[9px] font-bold uppercase tracking-wider text-primary">Featured skill</p>
                        <p className="mt-0.5 text-xs italic text-foreground font-medium leading-relaxed line-clamp-2">
                          &ldquo;{g.guideBio || (g as any).bio || (g as any).headline}&rdquo;
                        </p>
                      </div>
                    )}

                    {/* tour videos (YouTube / Instagram links) - collapsible */}
                    {(() => {
                      const raw = (g as any).guideVideoUrls
                      const vids: string[] = Array.isArray(raw) ? raw.filter(Boolean) : splitVideoUrls(raw)
                      if (vids.length === 0) return null
                      const open = !!openVideoCards[g.id]
                      return (
                        <div className="relative mt-3" data-testid="guide-card-videos">
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

                    {/* skill chips: specialties + languages on one row */}
                    {(g.guideSpecialties.length > 0 || g.guideLanguages.length > 0) && (
                      <div className="relative mt-3 flex items-center gap-1.5 flex-wrap">
                        {g.guideSpecialties.map((spec: string) => (
                          <Badge key={spec} variant="secondary" className="bg-emerald-100 text-emerald-900 dark:bg-primary/15 dark:text-emerald-300 text-[10px] font-bold rounded-md">{spec}</Badge>
                        ))}
                        {g.guideLanguages.map((lang: string) => (
                          <Badge key={lang} variant="secondary" className="bg-card border border-border text-muted-foreground text-[10px] font-semibold rounded-md">{lang}</Badge>
                        ))}
                      </div>
                    )}

                    {/* starting rate + swipe hint pinned to the bottom */}
                    <div className="relative mt-auto pt-3">
                      <p className="text-[11px] text-muted-foreground">
                        Starting rate:{' '}
                        {g.guideHourlyRate != null && g.guideCurrency ? (
                          <span className="font-extrabold text-foreground">
                            {g.guideCurrency} {g.guideHourlyRate}
                            <span className="text-xs font-normal text-muted-foreground"> /hr</span>
                          </span>
                        ) : (
                          <span className="font-extrabold text-foreground">Rate on request</span>
                        )}
                      </p>
                      <div className="mt-2 flex items-center justify-center gap-1 text-[10px] font-semibold text-muted-foreground" data-testid="talent-swipe-hint">
                        {isLastTalent ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
                            You reached the last talent
                          </>
                        ) : (
                          <>
                            <ChevronDown className="w-3.5 h-3.5 animate-bounce" />
                            Swipe up for next talent
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* v229 talent action rail - Save / Book / Share / Chat
                      (Chat = the in-app message thread with that talent). */}
                  <div className="absolute right-2.5 bottom-4 z-10 flex flex-col items-center gap-2.5" data-testid="talent-action-rail">
                    {isOwn ? (
                      <span className="w-11 h-11 rounded-full bg-card/95 border border-border shadow-sm flex items-center justify-center text-[10px] font-bold text-primary">You</span>
                    ) : (
                      <>
                        <div className="flex flex-col items-center">
                          <button
                            type="button"
                            onClick={() => handleGuideSave(g)}
                            data-testid="talent-save"
                            aria-label={savedGuides[g.id] ? 'Remove from saved' : 'Save talent'}
                            className="w-11 h-11 rounded-full bg-card/95 border border-border shadow-sm flex items-center justify-center hover:scale-105 active:scale-95 transition-all"
                          >
                            <Bookmark className={cn('w-5 h-5', savedGuides[g.id] ? 'fill-primary text-primary' : 'text-muted-foreground')} />
                          </button>
                          <span className="text-[9px] font-bold text-muted-foreground mt-0.5">{savedGuides[g.id] ? 'Saved' : 'Save'}</span>
                        </div>
                        <div className="flex flex-col items-center">
                          <button
                            type="button"
                            onClick={() => openBooking(g)}
                            data-testid="talent-book"
                            aria-label="Book this talent"
                            className="w-11 h-11 rounded-full bg-primary text-primary-foreground shadow-md shadow-primary/30 flex items-center justify-center hover:scale-105 active:scale-95 transition-all"
                          >
                            <CalendarCheck className="w-5 h-5" />
                          </button>
                          <span className="text-[9px] font-bold text-primary mt-0.5">Book</span>
                        </div>
                        <div className="flex flex-col items-center">
                          <button
                            type="button"
                            onClick={() => void shareGuide(g)}
                            data-testid="guide-share-btn"
                            aria-label="Share this talent"
                            className="w-11 h-11 rounded-full bg-card/95 border border-border shadow-sm flex items-center justify-center hover:scale-105 active:scale-95 transition-all"
                          >
                            <Share2 className="w-5 h-5 text-muted-foreground" />
                          </button>
                          <span className="text-[9px] font-bold text-muted-foreground mt-0.5">Share</span>
                        </div>
                        <div className="flex flex-col items-center">
                          <button
                            type="button"
                            onClick={() => onMessage(g.id)}
                            data-testid="talent-chat"
                            aria-label="Chat with this talent"
                            className="w-11 h-11 rounded-full bg-card/95 border border-border shadow-sm flex items-center justify-center hover:scale-105 active:scale-95 transition-all"
                          >
                            <MessageSquare className="w-5 h-5 text-muted-foreground" />
                          </button>
                          <span className="text-[9px] font-bold text-muted-foreground mt-0.5">Chat</span>
                        </div>
                      </>
                    )}
                  </div>
                  </div>
                </div>
              )
            })}

            {/* talent end card - honest stopping point, one tap to refresh */}
            <div className="h-full w-full max-w-[560px] mx-auto snap-start snap-always flex flex-col items-center justify-center gap-3 p-6 text-center bg-card border-border sm:border-x" data-testid="talent-deck-end">
              <span className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Users className="w-6 h-6 text-primary" />
              </span>
              <p className="text-sm font-bold text-foreground">
                {guides.filter((g) => (g as any).guideAvailable).length} verified talents online
              </p>
              <Button size="sm" variant="outline" onClick={() => fetchGuides()} className="gap-1.5" data-testid="talent-refresh">
                <RefreshCw className="w-3.5 h-3.5" />
                Refresh talent
              </Button>
            </div>
            <div ref={guidesSentinelRef} />
            {guidesHasMore && (
              <p className="text-center text-xs text-muted-foreground py-2">Loading more talent…</p>
            )}
          </div>
        )}
      </div>

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

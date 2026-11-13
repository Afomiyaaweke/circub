'use client'

/**
 * circubAwd Compass - the proforma behind the brand.
 *
 * v249 - AI-ONLY (user: "remove this" + screenshot of the bare "YOUR
 * SHOPPING LIST" editor: the visiting date pickers, the add-item box and
 * the Find / Compare / Plan tab bar). All of that bare tool UI is GONE.
 * The proforma is now ONLY the AI conversation (v246-v248): four questions
 * - WHERE / WHAT / WHEN / BUDGET - each answered from a LIST of real
 * answers or typed freehand. When the conversation completes, the answers
 * turn into one RESULTS card: the four answers themselves (each with an
 * Edit button that re-opens exactly that question) followed by the real
 * numbers the old tabs used to show - list totals, the month trend, the
 * safe amount, the budget locator and the other places worth checking.
 * No list editor, no date pickers, no tabs anywhere.
 *
 * v250 - MORE THAN ONE LOCATION + THE POSTERS (user: "show the posters
 * on the proforma too ... make the location to take more than one
 * location"): the WHERE step now takes SEVERAL places - the community
 * chips toggle and the typed input ADDS one place at a time ("Add place
 * too"). The first chosen place stays the PRIMARY stop (the headline
 * stats, the trend and the safe line stay priced there); every other
 * chosen place gets its own compared row ("Your N locations, compared").
 * And the results card now shows the POSTERS: the real posts behind
 * these numbers, each with the poster's name, avatar initials, place
 * and helpful votes - your own chosen stops first.
 *
 * Everything is still priced from the REAL price posts on circubAwd (the
 * public /api/local-prices feed - the same posts the Local tab shows; no
 * synthetic numbers anywhere):
 *
 *   - a post's price = recommendedPrice when set, else the midpoint of its
 *     priceMin..priceMax range
 *   - locations group by "city, country"; currencies never mix - the tools
 *     run on the dominant currency the community posts
 *   - a typed place the community has posted snaps onto its canonical key
 *     so its real stats light up; anything else is kept as typed and stays
 *     honest (no prices there -> an honest line, never invented numbers)
 *   - sparse data renders honestly (n=1 rows render; missing item/place
 *     combos say "no prices posted yet", never invented)
 *
 * v263 - SUBSCRIPTION + DAILY FREE QUOTA (user: "make the proforma
 * subscription based like monthly and have 3 free question every day"):
 * one completed proforma run costs ONE question. Everyone gets 3 free
 * questions every day (UTC midnight reset, enforced server-side by
 * /api/proforma/ask - the client can never grant itself an extra one);
 * the monthly Pro subscription ($4.99, simulated demo checkout in this
 * build) removes the cap while its 30-day period is active and can be
 * cancelled any time from the panel. Guests browse the conversation but
 * are asked to sign in when they complete it. Editing answers inside the
 * same sitting never re-charges (one consume per mounted session) - the
 * server still caps the day across reloads. A mailer outage or a quota
 * route failure fails OPEN: the tool keeps working, never traps a list.
 *
 * Design follows the compass/ prototype (repo root) adapted to the app
 * theme: theme tokens only (dark + light safe), wrapping chips and a
 * horizontally scrollable layout on phones.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRightLeft, CalendarDays, Check, Compass, CreditCard, Crown, Lightbulb,
  Loader2, Lock, MapPin, Pencil, Sparkles, ThumbsUp, TrendingDown, TrendingUp,
  Users, Wallet, X,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

// v263 - the exact shape GET /api/proforma/quota returns.
interface ProformaQuota {
  signedIn: boolean
  plan: 'FREE' | 'PRO'
  pro: boolean
  used: number
  limit: number | null
  remaining: number | null
  unlimited: boolean
  periodEnd: string | null
  priceLabel: string
  resetDay: string
}

interface ToolAuthor {
  name: string
  localPostCount?: number | null
}

interface ToolPost {
  id: string
  productName: string
  priceMin: number
  priceMax: number
  recommendedPrice?: number | null
  currency: string
  city?: string | null
  country: string
  createdAt: string
  helpfulCount?: number | null
  author: ToolAuthor
}

interface ItemStats {
  lo: number
  hi: number
  av: number
  n: number
}

interface PlaceGroup {
  key: string
  short: string
  count: number
}

const LIST_CHIP_LIMIT = 8 // suggested-item choices (most-posted products)
const MAX_CUSTOM_ITEMS = 12 // typed items cap - keeps the results walkable
const BUDGET_ROWS = 6 // budget-locator place rows before the cut
const SAFE_ROUND_TO = 50 // safe budget rounds UP to a walkable number
const POSTER_ROWS = 6 // v250 poster rows shown behind the numbers
const MAX_PLACES = 6 // v250 chosen locations cap - keeps the recap walkable

// Quantities are not part of the AI conversation - every item counts as 1.
// (The totals math still takes a quantities map; this keeps it honest.)
const NO_QTY: Record<string, number> = {}

// v246 answer LIST for the AI "When are you visiting?" question - every
// chip turns into a real from/to date pair out of today (isoDay below).
const ASK_WHEN: { label: string; fromDays: number; toDays: number }[] = [
  { label: 'Today', fromDays: 0, toDays: 0 },
  { label: 'This week', fromDays: 0, toDays: 6 },
  { label: 'Next week', fromDays: 7, toDays: 13 },
  { label: 'This month', fromDays: 0, toDays: 29 },
]

function money(n: number, cur: string): string {
  return `${Math.round(n).toLocaleString('en-US')} ${cur}`
}

function shortOf(placeKey: string): string {
  return placeKey.split(',')[0]
}

// v250: avatar initials for a poster name (falls back to ?).
function initialsOf(name: string): string {
  const ini = (name || '')
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
  return ini || '?'
}

// Local yyyy-mm-dd of a Date - native date inputs speak THIS zone, not UTC.
function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// "Sep 28" out of a yyyy-mm-dd string; '' when it is not a complete date.
function prettyDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return ''
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

// Inclusive day count of a from..to span; 0 when an end is missing or invalid.
function spanDays(fromIso: string, toIso: string): number {
  if (!fromIso || !toIso) return 0
  const a = new Date(`${fromIso}T00:00:00`)
  const b = new Date(`${toIso}T00:00:00`)
  if (isNaN(a.getTime()) || isNaN(b.getTime())) return 0
  return Math.max(1, Math.round((b.getTime() - a.getTime()) / 86400000) + 1)
}

export function CompassPriceTools() {
  const [posts, setPosts] = useState<ToolPost[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [currency, setCurrency] = useState('')
  const [visitFrom, setVisitFrom] = useState('')
  const [visitTo, setVisitTo] = useState('')
  const [onItems, setOnItems] = useState<Record<string, boolean>>({})
  const [customItems, setCustomItems] = useState<string[]>([])
  // v250 (user: "make the location to take more than one location"): the
  // shopping proforma takes SEVERAL places - the WHERE chips toggle and
  // the typed input adds one place at a time. The FIRST chosen place is
  // the primary stop (the headline stats and the safe line are priced
  // there); every other chosen place gets its own compared row.
  const [myPlaces, setMyPlaces] = useState<string[]>([])
  const myPlace = myPlaces[0] || ''
  const togglePlace = (key: string) =>
    setMyPlaces((prev) =>
      prev.some((p) => p.toLowerCase() === key.toLowerCase())
        ? prev.filter((p) => p.toLowerCase() !== key.toLowerCase())
        : prev.length >= MAX_PLACES
          ? prev
          : [...prev, key],
    )
  const choosePrimary = (key: string) =>
    setMyPlaces((prev) => [key, ...prev.filter((p) => p.toLowerCase() !== key.toLowerCase())])
  const [budget, setBudget] = useState('')
  // v246 AI-ASKING SETUP (user: "make the proforma like AI asking location
  // items date and budget with list"): the panel OPENS as a guided
  // conversation - four one-tap questions (Where / What / When / Budget) -
  // and v249 the conversation IS the whole proforma: askStep 0 = between
  // questions, 1..4 = the four questions; askDone = the results card.
  const [askStep, setAskStep] = useState<0 | 1 | 2 | 3 | 4>(1)
  const [askDone, setAskDone] = useState(false)
  const [askItems, setAskItems] = useState<string[]>([])
  const [askNewItem, setAskNewItem] = useState('')
  // v248 (user: "make input for location"): the WHERE step takes a TYPED
  // place, not just the suggestion chips. Committed on Enter or the
  // Use-this-place button, with the same snap-to-known-place contract as
  // the chips: a case-insensitive match with a place the community has
  // posted lights its real stats up, anything else is kept as typed.
  const [askPlace, setAskPlace] = useState('')

  // ---- v263 subscription + daily free quota -------------------------------
  // Server is the source of truth (GET /api/proforma/quota, POST .../ask);
  // the client only renders what it is told. `gate` swaps the conversation
  // and the results card for one of the plan panels without destroying the
  // in-progress answers - "Back" returns to exactly where the user was.
  const [quota, setQuota] = useState<ProformaQuota | null>(null)
  const [gate, setGate] = useState<'none' | 'auth' | 'paywall' | 'checkout' | 'subscribed' | 'manage' | 'cancelled'>('none')
  const [subBusy, setSubBusy] = useState(false)
  const [subError, setSubError] = useState<string | null>(null)
  const [demoCard, setDemoCard] = useState({ number: '', exp: '', cvc: '' })
  // One successful consume per mounted session: editing answers and
  // re-finishing the SAME sitting never re-charges. A page reload starts a
  // new sitting and the server still caps the whole day.
  const countedRef = useRef(false)
  const completingRef = useRef(false)

  const loadQuota = async (): Promise<ProformaQuota | null> => {
    try {
      const r = await fetch('/api/proforma/quota', { cache: 'no-store' })
      if (!r.ok) return null
      const d = (await r.json()) as ProformaQuota
      setQuota(d)
      return d
    } catch {
      return null
    }
  }
  useEffect(() => {
    void loadQuota()
  }, [])

  // Is anything on the list? (community chips + typed items that are ON).
  const anyListed = Object.values(onItems).some(Boolean)

  // The single gate every charging completion runs through. Free day used
  // up -> 402 -> paywall (the conversation state is kept behind it). Guest
  // -> sign-in gate. Server/network errors fail OPEN - the tool never traps a
  // finished list because its own metering endpoint hiccupped.
  const completeProforma = async () => {
    if (completingRef.current) return
    completingRef.current = true
    try {
      // Nothing on the list = nothing was priced = free, no question asked.
      if (!anyListed) {
        finishCompletion()
        return
      }
      let q = quota ?? (await loadQuota())
      if (!q) {
        // Quota endpoint unreachable: fail open rather than trap the user.
        finishCompletion()
        return
      }
      if (!q.signedIn) {
        setGate('auth')
        return
      }
      if (q.pro || countedRef.current) {
        // Pro members are unlimited (the ask route still tracks their usage);
        // an already-charged sitting re-finishes free.
        if (q.pro && !countedRef.current) {
          try {
            const r = await fetch('/api/proforma/ask', { method: 'POST' })
            if (r.ok) {
              const d = await r.json()
              setQuota((prev) =>
                prev ? { ...prev, used: d.used ?? prev.used, unlimited: true, pro: true } : prev,
              )
            }
          } catch {
            /* tracking only - never block Pro on it */
          }
          countedRef.current = true
        }
        finishCompletion()
        return
      }
      try {
        const r = await fetch('/api/proforma/ask', { method: 'POST' })
        if (r.status === 402) {
          setGate('paywall')
          return
        }
        if (r.status === 401) {
          setQuota((prev) => (prev ? { ...prev, signedIn: false, pro: false } : prev))
          setGate('auth')
          return
        }
        if (r.ok) {
          const d = await r.json()
          countedRef.current = true
          setQuota((prev) =>
            prev
              ? {
                  ...prev,
                  used: d.used ?? prev.used + 1,
                  remaining: d.remaining ?? Math.max(0, (prev.limit || 3) - (prev.used + 1)),
                }
              : prev,
          )
          finishCompletion()
          return
        }
        // Any other status: fail open.
        finishCompletion()
      } catch {
        finishCompletion()
      }
    } finally {
      completingRef.current = false
    }
  }

  const finishCompletion = () => {
    setGate('none')
    setAskDone(true)
    setAskStep(0)
  }

  useEffect(() => {
    let alive = true
    // v251: small first - the tools panel models medians/ranges, which 24
    // fresh rows answer just as well as the old default 100-row burst.
    fetch('/api/local-prices?limit=24', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => {
        if (alive) setPosts(Array.isArray(d.posts) ? (d.posts as ToolPost[]) : [])
      })
      .catch(() => {
        if (alive) setFailed(true)
      })
    return () => {
      alive = false
    }
  }, [])

  // ---- aggregated model over the real posts -------------------------------
  const model = useMemo(() => {
    if (!posts) return null
    const now = Date.now()

    const priceOf = (p: ToolPost) =>
      p.recommendedPrice != null && p.recommendedPrice > 0
        ? p.recommendedPrice
        : Math.round((p.priceMin + p.priceMax) / 2)

    const placeOf = (p: ToolPost) =>
      [p.city?.trim(), p.country?.trim()].filter(Boolean).join(', ') || 'Unknown'

    // Currencies never mix - dominant first; the community's own numbers
    // always stay on screen and no exchange rate is ever invented.
    const curCount: Record<string, number> = {}
    posts.forEach((p) => {
      curCount[p.currency] = (curCount[p.currency] || 0) + 1
    })
    const currencies = Object.entries(curCount)
      .sort((a, b) => b[1] - a[1])
      .map(([c]) => c)
    const cur = currency && currencies.includes(currency) ? currency : currencies[0] || ''
    const inCur = cur ? posts.filter((p) => p.currency === cur) : []

    // Places, busiest first.
    const placePosts: Record<string, ToolPost[]> = {}
    inCur.forEach((p) => {
      const k = placeOf(p)
      ;(placePosts[k] ||= []).push(p)
    })
    const places: PlaceGroup[] = Object.entries(placePosts)
      .map(([key, ps]) => ({ key, short: shortOf(key), count: ps.length }))
      .sort((a, b) => b.count - a.count)

    // Products, most-posted first (trimmed exact names - distinct products
    // like "Coffee beans 500g" vs "Arabica coffee beans 1kg" stay separate).
    const itemPosts: Record<string, ToolPost[]> = {}
    inCur.forEach((p) => {
      const k = p.productName.trim()
      if (k) (itemPosts[k] ||= []).push(p)
    })
    const items = Object.entries(itemPosts)
      .map(([name, ps]) => ({ name, count: ps.length }))
      .sort((a, b) => b.count - a.count)
      .slice(0, LIST_CHIP_LIMIT)
    // The FULL set of community product names in the currency - the capped
    // `items` above is a DISPLAY choice only. The typed-name snap and the
    // chosen-list totals must keep working for every product the community
    // has posted, even when the feed grows past the 8 chip slots.
    const itemNames = Object.keys(itemPosts)

    // Typical-price stats for one item at one place.
    const per = (item: string, place: string): ItemStats | null => {
      const ps = (itemPosts[item] || []).filter((p) => placeOf(p) === place)
      if (!ps.length) return null
      const prices = ps.map(priceOf)
      return {
        lo: Math.min(...prices),
        hi: Math.max(...prices),
        av: prices.reduce((a, b) => a + b, 0) / prices.length,
        n: prices.length,
      }
    }

    // Whole-list totals for one place (quantities included).
    const totals = (
      place: string,
      chosen: string[],
      quantities: Record<string, number>,
    ): ItemStats | null => {
      let lo = 0
      let hi = 0
      let av = 0
      let n = 0
      chosen.forEach((name) => {
        const s = per(name, place)
        if (!s) return
        const q = Math.max(0, quantities[name] ?? 1)
        lo += s.lo * q
        hi += s.hi * q
        av += s.av * q
        n += s.n
      })
      return n > 0 ? { lo, hi, av, n } : null
    }

    // Community endorsement: the sum of HELPFUL votes across the real posts
    // that stand behind one place's price for the chosen list. A place with
    // zero votes shows an honest 0 - never invented.
    const helpful = (place: string, chosen: string[]): number =>
      inCur
        .filter(
          (p) =>
            chosen.includes(p.productName.trim()) &&
            placeOf(p) === place &&
            p.helpfulCount,
        )
        .reduce((a, p) => a + (p.helpfulCount || 0), 0)

    // Month trend (last 30 days vs the 30 before) for a list at a place.
    const trendOf = (chosen: string[], place: string): number | null => {
      const mine = inCur.filter(
        (p) => chosen.includes(p.productName.trim()) && placeOf(p) === place,
      )
      const recent: number[] = []
      const prior: number[] = []
      mine.forEach((p) => {
        const age = now - new Date(p.createdAt).getTime()
        if (age <= 30 * 864e5) recent.push(priceOf(p))
        else if (age <= 60 * 864e5) prior.push(priceOf(p))
      })
      if (recent.length < 2 || prior.length < 2) return null
      const ra = recent.reduce((a, b) => a + b, 0) / recent.length
      const pa = prior.reduce((a, b) => a + b, 0) / prior.length
      if (pa <= 0) return null
      return Math.round(((ra - pa) / pa) * 100)
    }

    return {
      cur,
      currencies,
      places,
      items,
      itemNames,
      countOf: (item: string) => (itemPosts[item] || []).length,
      per,
      totals,
      helpful,
      trendOf,
      priceOf,
      placeOf,
      inCur,
    }
  }, [posts, currency])

  // The visit span defaults to today once mounted - client only, so SSR
  // never renders a date and hydration stays clean. (The AI WHEN step
  // overwrites it with a real from/to pair.)
  useEffect(() => {
    const t = isoDay(new Date())
    setVisitFrom(t)
    setVisitTo(t)
  }, [])

  // First data -> defaults: the dominant currency and the busiest place as
  // the shopping location. The LIST stays empty - everything on it is
  // answered in the conversation.
  useEffect(() => {
    if (!model) return
    if (!currency && model.currencies.length) setCurrency(model.currencies[0])
    setMyPlaces((prev) => (prev.length ? prev : model.places[0]?.key ? [model.places[0].key] : []))
  }, [model, currency])

  // Remove an item from the RESULTS recap (the x on a recap chip). Typed
  // items are dropped entirely; a snapped feed item is toggled back off.
  const toggleItem = (name: string) => {
    setOnItems((prev) => ({ ...prev, [name]: !prev[name] }))
  }

  const removeCustomItem = (name: string) => {
    setCustomItems((prev) => prev.filter((n) => n !== name))
    setOnItems((prev) => {
      const next = { ...prev }
      delete next[name]
      return next
    })
  }

  const removeListedItem = (name: string) => {
    if (customItems.includes(name)) removeCustomItem(name)
    else toggleItem(name)
  }

  // ---- v246 AI-asking helpers ---------------------------------------------
  // Toggle one suggested item on the answer list (community name or typed).
  const toggleAskItem = (name: string) => {
    setAskItems((prev) =>
      prev.some((n) => n.toLowerCase() === name.toLowerCase())
        ? prev.filter((n) => n.toLowerCase() !== name.toLowerCase())
        : [...prev, name],
    )
  }

  // Type an extra item into the answer list (Enter or the + button).
  const addAskTyped = () => {
    const name = askNewItem.trim().replace(/\s+/g, ' ').slice(0, 60)
    if (!name) return
    setAskItems((prev) =>
      prev.some((n) => n.toLowerCase() === name.toLowerCase()) ? prev : [...prev, name],
    )
    setAskNewItem('')
  }

  // v248 typed location input - v250 it ADDS one place at a time so the
  // proforma can take several locations (the conversation moves on with
  // the Continue button). Same snap contract as the chips: a
  // case-insensitive match with a place the community has posted snaps
  // onto that canonical key so its real stats light up; anything else is
  // kept as typed and the tools stay honest.
  const applyAskPlace = () => {
    const raw = askPlace.trim().replace(/\s+/g, ' ').slice(0, 80)
    if (!raw) return
    const known = model?.places.find((p) => p.key.toLowerCase() === raw.toLowerCase())
    const key = known ? known.key : raw
    setMyPlaces((prev) =>
      prev.some((p) => p.toLowerCase() === key.toLowerCase()) || prev.length >= MAX_PLACES
        ? prev
        : [...prev, key],
    )
    setAskPlace('')
  }

  // Commit the answered list into the state the results card prices: community
  // names snap onto their canonical product, typed ones become custom items
  // (same cap). Nothing is mocked - the results price exactly this list from
  // real posts.
  const applyAskItems = () => {
    if (!model) return
    askItems.forEach((raw) => {
      const name = raw.trim().replace(/\s+/g, ' ').slice(0, 60)
      if (!name) return
      const feedMatch = model.itemNames.find((n) => n.toLowerCase() === name.toLowerCase())
      if (feedMatch) {
        setOnItems((prev) => ({ ...prev, [feedMatch]: true }))
        return
      }
      setCustomItems((prev) =>
        prev.some((n) => n.toLowerCase() === name.toLowerCase()) || prev.length >= MAX_CUSTOM_ITEMS
          ? prev
          : [...prev, name],
      )
      setOnItems((prev) => ({ ...prev, [name]: true }))
    })
    setAskItems([])
  }

  // Budget answered: the conversation ends and the results card takes over -
  // with the budget applied when it is a positive number. v263: this is the
  // charging moment - completing the conversation costs ONE question (the
  // gate in completeProforma decides: guest -> sign-in, free day used up ->
  // paywall, Pro / already-charged sitting -> straight through).
  const askApplyBudget = () => {
    void completeProforma()
  }
  const askSkipBudget = () => {
    setBudget('')
    void completeProforma()
  }

  // v263 - simulated monthly checkout (demo: no gateway keys wired in this
  // build). The server flips the plan for real: PRO + a 30-day period, and
  // the branded receipt goes out best-effort from the route's after() hook.
  const subscribePro = async () => {
    setSubBusy(true)
    setSubError(null)
    try {
      const r = await fetch('/api/proforma/subscribe', { method: 'POST' })
      if (r.status === 401) {
        setGate('auth')
        return
      }
      if (!r.ok) {
        setSubError('Could not start Pro right now - please try again.')
        return
      }
      const d = await r.json()
      countedRef.current = true
      setQuota((prev) =>
        prev
          ? { ...prev, plan: 'PRO', pro: true, unlimited: true, remaining: null, limit: null, periodEnd: d.periodEnd ?? prev.periodEnd }
          : prev,
      )
      setGate('subscribed')
    } catch {
      setSubError('Network hiccup - please try again.')
    } finally {
      setSubBusy(false)
    }
  }

  // Cancel = honest and immediate: back to FREE, today's used counter keeps
  // counting, the 3 daily questions return at the next UTC midnight.
  const cancelPro = async () => {
    setSubBusy(true)
    setSubError(null)
    try {
      const r = await fetch('/api/proforma/subscribe', { method: 'DELETE' })
      if (!r.ok) {
        setSubError('Could not cancel right now - please try again.')
        return
      }
      setQuota((prev) =>
        prev ? { ...prev, plan: 'FREE', pro: false, unlimited: false, remaining: Math.max(0, (prev.limit ?? 3) - prev.used), limit: 3 } : prev,
      )
      setGate('cancelled')
    } catch {
      setSubError('Network hiccup - please try again.')
    } finally {
      setSubBusy(false)
    }
  }

  // v249: re-open ONE question of the conversation from the results card.
  // The results hide while the conversation runs, and finishing it (or the
  // X) brings the refreshed results straight back.
  const reopenAt = (step: 1 | 2 | 3 | 4) => {
    setAskDone(false)
    setAskStep(step)
  }

  const chosenKey = model
    ? [
        ...model.itemNames.filter((n) => onItems[n]),
        ...customItems.filter((n) => onItems[n]),
      ].join('|')
    : ''
  const chosenNames = useMemo(
    () => (chosenKey ? chosenKey.split('|') : []),
    [chosenKey],
  )

  // ---- render-body derivations (cheap, over the already-filtered posts) ---
  const cur = model?.cur || ''
  const loading = !model
  const noPosts = !!model && model.inCur.length === 0
  const emptyList = chosenNames.length === 0
  const myShort = myPlace ? shortOf(myPlace) : 'your area'

  // List totals at my place + month trend + top mover tip.
  const myTotals = model && !emptyList ? model.totals(myPlace, chosenNames, NO_QTY) : null
  const trend = model && !emptyList && myPlace ? model.trendOf(chosenNames, myPlace) : null
  let mover: { name: string; ch: number } | null = null
  if (model && !emptyList) {
    for (const name of chosenNames) {
      const ch = model.trendOf([name], myPlace)
      if (ch != null && (!mover || ch > mover.ch)) mover = { name, ch }
    }
  }
  const rangePct =
    myTotals && myTotals.hi > myTotals.lo
      ? Math.min(98, Math.max(2, ((myTotals.av - myTotals.lo) / (myTotals.hi - myTotals.lo)) * 100))
      : 50

  // Visiting span -> one phrase reused by the recap and the safe line:
  // "on Sep 28" for a single day, "from Sep 28 to Oct 3 (6 days)" for a
  // span, and nothing while the dates are unset.
  const vDays = spanDays(visitFrom, visitTo)
  const fromShort = prettyDate(visitFrom)
  const toShort = prettyDate(visitTo)
  const visitSpan =
    fromShort && toShort
      ? visitFrom === visitTo
        ? `on ${fromShort}`
        : `from ${fromShort} to ${toShort} (${vDays} day${vDays === 1 ? '' : 's'})`
      : ''

  // Budget: safe estimate = typical + half the gap to the worst case.
  const safe =
    myTotals
      ? Math.ceil((myTotals.av + (myTotals.hi - myTotals.av) / 2) / SAFE_ROUND_TO) * SAFE_ROUND_TO
      : null
  // Written by hand - tolerate "5,000"-style thousands separators.
  const budgetNum = parseFloat(budget.replace(/,/g, ''))
  const verdict =
    myTotals && safe != null && budgetNum > 0
      ? budgetNum >= safe
        ? `Your ${money(budgetNum, cur)} covers the safe estimate for ${myShort} with ${money(budgetNum - safe, cur)} to spare.`
        : budgetNum >= myTotals.av
          ? `Your ${money(budgetNum, cur)} covers the typical price in ${myShort} but may run short if you meet high prices. Add ${money(safe - budgetNum, cur)} to be safe.`
          : `Your ${money(budgetNum, cur)} is ${money(myTotals.av - budgetNum, cur)} below the typical total in ${myShort}. Cut quantities or add money.`
      : null
  const others =
    model && !emptyList && myTotals
      ? model.places
          .filter((p) => !myPlaces.some((mp) => mp.toLowerCase() === p.key.toLowerCase()))
          .map((p) => ({ ...p, total: model.totals(p.key, chosenNames, NO_QTY)?.av ?? null }))
          .filter((o) => o.total != null)
          .sort((a, b) => (a.total as number) - (b.total as number))
          .slice(0, 3)
      : []

  // v250 YOUR LOCATIONS compared: every chosen place priced for the list,
  // so a multi-stop trip shows which of YOUR stops is cheapest. The
  // headline stats stay priced at the primary (first) stop.
  const myPlaceRows =
    model && myPlaces.length > 1
      ? myPlaces.map((key) => ({
          key,
          short: shortOf(key),
          t: model.totals(key, chosenNames, NO_QTY),
        }))
      : []
  const pricedMine = myPlaceRows.filter((r) => r.t != null)
  const cheapestMineKey =
    pricedMine.length > 1
      ? pricedMine.reduce((a, b) => (b.t!.av < a.t!.av ? b : a)).key
      : null

  // v250 THE POSTERS: the real posts behind the numbers - each with its
  // poster (name + avatar initials + how many local posts they have).
  // The user's own chosen stops come first, then most-endorsed, then
  // newest. Honest scope: only posts that price an item on the list, in
  // the proforma's currency - no invented rows.
  const posterPosts =
    model && !emptyList
      ? model.inCur
          .filter((p) => chosenNames.includes(p.productName.trim()))
          .map((p) => ({
            post: p,
            place: model.placeOf(p),
            mine: myPlaces.some((mp) => mp.toLowerCase() === model.placeOf(p).toLowerCase()),
          }))
          .sort(
            (a, b) =>
              Number(b.mine) - Number(a.mine) ||
              (b.post.helpfulCount || 0) - (a.post.helpfulCount || 0) ||
              new Date(b.post.createdAt).getTime() - new Date(a.post.createdAt).getTime(),
          )
          .slice(0, POSTER_ROWS)
      : []

  // Budget locator: once a budget is written, locate WHERE the best
  // price for this list is - every place the community has posted, cheapest
  // typical total first - and which of them fit INSIDE the typed budget.
  // Nothing is invented: places without real prices for the list are
  // skipped, and when nothing fits the cheapest real total is shown with
  // the honest gap instead.
  const budgetPlaces =
    model && !emptyList && budgetNum > 0
      ? model.places
          .map((p) => ({
            key: p.key,
            short: p.short,
            total: model.totals(p.key, chosenNames, NO_QTY)?.av ?? null,
            nPosts: model.totals(p.key, chosenNames, NO_QTY)?.n ?? 0,
            likes: model.helpful(p.key, chosenNames),
            // How many of the list items this place actually prices - a
            // sparse row that covers only part of the list says so.
            covered: chosenNames.filter((n) => model.per(n, p.key)).length,
          }))
          .filter(
            (p): p is {
              key: string
              short: string
              total: number
              nPosts: number
              likes: number
              covered: number
            } => p.total != null,
          )
          // Full-list places lead: a total that prices EVERY item on the
          // list is the only one that can honestly match the budget for all
          // the items - so those rows rank first. Partial rows follow: most
          // coverage first, then cheapest, then most liked.
          .sort(
            (a, b) =>
              b.covered - a.covered || a.total - b.total || b.likes - a.likes,
          )
          .slice(0, BUDGET_ROWS)
      : []
  const budgetMaxLikes = budgetPlaces.reduce((m, p) => Math.max(m, p.likes), 0)
  // The budget MATCH is only claimed by a place that prices the WHOLE list -
  // a partial row cannot honestly "fit the budget" for all the items.
  // bestFullAny = cheapest full-list total (even when over budget);
  // budgetClosest = the most-covering row when nobody prices everything yet.
  const budgetBest =
    budgetNum > 0
      ? budgetPlaces.find(
          (p) => p.covered === chosenNames.length && p.total <= budgetNum,
        ) ?? null
      : null
  const bestFullAny =
    budgetNum > 0
      ? budgetPlaces.find((p) => p.covered === chosenNames.length) ?? null
      : null
  const budgetClosest = budgetPlaces[0] ?? null
  const givenFits = myTotals && budgetNum > 0 ? myTotals.av <= budgetNum : null

  const chipBase =
    'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer'
  const chipOff = 'bg-transparent text-muted-foreground border-border hover:text-foreground hover:border-primary/40'
  const chipOn = 'bg-primary text-primary-foreground border-primary font-semibold'

  return (
    <Card className="p-4 sm:p-5 shadow-sm" data-testid="compass-tools">
      {/* Header - v263 the plan rides here: a FREE counter, a Pro chip
          (tap to manage) or a guest sign-in chip, wrapping under the title
          on narrow phones instead of squeezing it. */}
      <div className="flex flex-wrap items-start gap-3">
        <span className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-primary/10 shrink-0">
          <Compass className="w-4 h-4 text-primary" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-foreground">Your proforma</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Four quick questions - then I price your list from real community posts. One finished
            proforma = one question: 3 free every day, unlimited with Pro.
          </p>
        </div>
        {quota && !quota.signedIn && (
          <button
            type="button"
            data-testid="proforma-guest-chip"
            onClick={() => setGate('auth')}
            className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-border bg-accent px-3 py-1.5 text-[11px] font-semibold text-foreground hover:border-primary/40 cursor-pointer"
          >
            <Sparkles className="w-3 h-3 text-primary" />
            3 free questions a day
          </button>
        )}
        {quota?.signedIn && !quota.pro && (
          <span
            data-testid="proforma-quota-chip"
            title="One finished proforma = one question. Resets at midnight UTC."
            className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-border bg-accent px-3 py-1.5 text-[11px] font-semibold text-foreground"
          >
            <Sparkles className="w-3 h-3 text-primary" />
            {quota.remaining ?? 0} of {quota.limit ?? 3} free questions left today
          </span>
        )}
        {quota?.pro && (
          <button
            type="button"
            data-testid="proforma-pro-chip"
            onClick={() => setGate('manage')}
            title="Pro is active - tap to manage your subscription"
            className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-emerald-500/50 bg-emerald-500/10 px-3 py-1.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-400 hover:border-emerald-500 cursor-pointer"
          >
            <Crown className="w-3 h-3" />
            Pro · unlimited
          </button>
        )}
      </div>

      {loading && (
        <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground" data-testid="compass-loading">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading real prices from the community…
        </p>
      )}

      {failed && (
        <p className="mt-4 text-sm text-muted-foreground" data-testid="compass-error">
          Couldn&apos;t load the community price posts. Please try again later.
        </p>
      )}

      {noPosts && (
        <p className="mt-4 text-sm text-muted-foreground">
          No price posts in {cur || 'any currency'} yet - post a price and the Compass tools wake up.
        </p>
      )}

      {/* v263 plan panels - each gate swaps in here and the conversation /
          results stay mounted behind it untouched, so "Back" returns to
          exactly where the user was. Mobile-first: single column, big tap
          targets, the actions stack on phones and row up from sm. */}
      {model && !noPosts && gate !== 'none' && (
        <div className="mt-3 rounded-xl border border-primary/25 bg-primary/5 p-3.5 space-y-3" data-testid="proforma-gate">
          {gate === 'auth' && (
            <div className="space-y-2.5" data-testid="proforma-auth-gate">
              <p className="text-sm font-bold text-foreground">Sign in to ask</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                The proforma prices your list from real community posts - one finished proforma is
                one question, and every account gets <b className="text-foreground">3 free questions every day</b>.
              </p>
              <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                <button
                  type="button"
                  data-testid="proforma-auth-signin"
                  onClick={() => window.dispatchEvent(new CustomEvent('circub:auth-expired', { detail: { reason: 'Sign in to use your free proforma questions' } }))}
                  className="inline-flex items-center justify-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-sm hover:bg-primary/90 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Sign in - it&apos;s free
                </button>
                <button
                  type="button"
                  data-testid="proforma-auth-back"
                  onClick={() => setGate('none')}
                  className="text-xs font-semibold text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  Back to the proforma
                </button>
              </div>
            </div>
          )}

          {gate === 'paywall' && (
            <div className="space-y-2.5" data-testid="proforma-paywall">
              <p className="text-sm font-bold text-foreground">You&apos;ve used all 3 free questions today</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Your next 3 come back at midnight UTC ({quota?.resetDay || 'tomorrow'}). Or go Pro
                now and keep asking - one finished proforma per question, unlimited.
              </p>
              <div className="rounded-lg border border-emerald-500/40 bg-card p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Crown className="w-4 h-4 text-emerald-600 shrink-0" />
                  <p className="text-sm font-bold text-foreground">
                    circubAwd Pro - {quota?.priceLabel || '$4.99'}<span className="font-medium text-muted-foreground">/month</span>
                  </p>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Unlimited proforma questions, every day. Cancel any time from this panel - no
                  questions asked.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                <button
                  type="button"
                  data-testid="proforma-paywall-subscribe"
                  onClick={() => { setSubError(null); setGate('checkout') }}
                  className="inline-flex items-center justify-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-sm hover:bg-primary/90 cursor-pointer"
                >
                  <Crown className="w-3.5 h-3.5" />
                  Subscribe monthly - {quota?.priceLabel || '$4.99'}
                </button>
                <button
                  type="button"
                  data-testid="proforma-paywall-back"
                  onClick={() => setGate('none')}
                  className="text-xs font-semibold text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  Back to the proforma
                </button>
              </div>
            </div>
          )}

          {gate === 'checkout' && (
            <div className="space-y-2.5" data-testid="proforma-checkout">
              <p className="text-sm font-bold text-foreground">Start Pro - {quota?.priceLabel || '$4.99'}/month</p>
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-2.5 flex items-start gap-2">
                <Lock className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Demo checkout - no card is charged in this build. Subscribing activates Pro for
                  30 days immediately; cancel any time from the Pro chip.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-2">
                <Input
                  type="text"
                  inputMode="numeric"
                  autoComplete="cc-number"
                  maxLength={19}
                  placeholder="Card number - e.g. 4242 4242 4242 4242"
                  value={demoCard.number}
                  onChange={(e) => setDemoCard((c) => ({ ...c, number: e.target.value.replace(/[^\d ]/g, '').slice(0, 19) }))}
                  data-testid="proforma-card-number"
                  aria-label="Card number"
                  className="h-9 text-sm bg-card"
                />
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="text"
                    inputMode="numeric"
                    autoComplete="cc-exp"
                    maxLength={5}
                    placeholder="MM/YY"
                    value={demoCard.exp}
                    onChange={(e) => setDemoCard((c) => ({ ...c, exp: e.target.value.replace(/[^\d]/g, '').replace(/(\d{2})(\d)/, '$1/$2').slice(0, 5) }))}
                    data-testid="proforma-card-exp"
                    aria-label="Expiry month and year"
                    className="h-9 text-sm bg-card"
                  />
                  <Input
                    type="text"
                    inputMode="numeric"
                    autoComplete="cc-csc"
                    maxLength={4}
                    placeholder="CVC"
                    value={demoCard.cvc}
                    onChange={(e) => setDemoCard((c) => ({ ...c, cvc: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
                    data-testid="proforma-card-cvc"
                    aria-label="Security code"
                    className="h-9 text-sm bg-card"
                  />
                </div>
              </div>
              {subError && <p className="text-xs font-semibold text-destructive">{subError}</p>}
              <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                <button
                  type="button"
                  data-testid="proforma-checkout-pay"
                  onClick={() => void subscribePro()}
                  disabled={subBusy || demoCard.number.replace(/\D/g, '').length < 12 || demoCard.exp.length < 4 || demoCard.cvc.length < 3}
                  className="inline-flex items-center justify-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-sm hover:bg-primary/90 transition-opacity disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                >
                  {subBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CreditCard className="w-3.5 h-3.5" />}
                  Pay {quota?.priceLabel || '$4.99'} &amp; start Pro
                </button>
                <button
                  type="button"
                  data-testid="proforma-checkout-back"
                  onClick={() => { setSubError(null); setGate('paywall') }}
                  className="text-xs font-semibold text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  Back
                </button>
              </div>
            </div>
          )}

          {gate === 'subscribed' && (
            <div className="space-y-2.5" data-testid="proforma-subscribed">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-emerald-500/15 shrink-0">
                  <Check className="w-4 h-4 text-emerald-600" />
                </span>
                <p className="text-sm font-bold text-foreground">Pro is active</p>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Unlimited proforma questions
                {quota?.periodEnd ? ` until ${quota.periodEnd.slice(0, 10)}` : ''}. Manage or cancel
                any time from the Pro chip up top.
              </p>
              <button
                type="button"
                data-testid="proforma-subscribed-continue"
                onClick={finishCompletion}
                className="inline-flex items-center justify-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-sm hover:bg-primary/90 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Continue to my proforma
              </button>
            </div>
          )}

          {gate === 'manage' && (
            <div className="space-y-2.5" data-testid="proforma-manage">
              <div className="flex items-center gap-2">
                <Crown className="w-4 h-4 text-emerald-600 shrink-0" />
                <p className="text-sm font-bold text-foreground">Pro subscription</p>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Active{quota?.periodEnd ? ` until ${quota.periodEnd.slice(0, 10)}` : ''} - unlimited
                proforma questions. Cancelling ends Pro immediately and returns you to the 3 free
                daily questions.
              </p>
              {subError && <p className="text-xs font-semibold text-destructive">{subError}</p>}
              <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                <button
                  type="button"
                  data-testid="proforma-manage-cancel"
                  onClick={() => void cancelPro()}
                  disabled={subBusy}
                  className="inline-flex items-center justify-center rounded-full border border-destructive/40 px-4 py-2 text-xs font-bold text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                >
                  {subBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Cancel subscription'}
                </button>
                <button
                  type="button"
                  data-testid="proforma-manage-back"
                  onClick={() => { setSubError(null); setGate('none') }}
                  className="text-xs font-semibold text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  Back to the proforma
                </button>
              </div>
            </div>
          )}

          {gate === 'cancelled' && (
            <div className="space-y-2.5" data-testid="proforma-cancelled">
              <p className="text-sm font-bold text-foreground">Pro cancelled</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                You&apos;re back on the free plan - {quota?.remaining ?? 0} of 3 questions left
                today, the full 3 return at midnight UTC ({quota?.resetDay || 'tomorrow'}).
              </p>
              <button
                type="button"
                data-testid="proforma-cancelled-back"
                onClick={() => setGate('none')}
                className="text-xs font-semibold text-primary hover:underline cursor-pointer"
              >
                Back to the proforma
              </button>
            </div>
          )}
        </div>
      )}

      {model && !noPosts && (
        <>
          {/* ============ v246 AI-ASKING CONVERSATION ============ */}
          {/* The proforma opens like an assistant asking YOU: four
              one-tap questions - WHERE, WHAT (the list), WHEN and BUDGET -
              each with a LIST of real answers taken from the community
              data (busiest places, most-posted products, dates out of
              today, your own totals). Nothing is mocked: every answer
              lands in the same state the v249 results card prices. */}
          {gate === 'none' && !askDone && askStep > 0 && (
            <div
              className="mt-3 rounded-xl border border-primary/25 bg-primary/5 p-3.5 space-y-2.5"
              data-testid="proforma-ask"
            >
              <div className="flex items-start gap-2.5">
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground shrink-0 shadow-sm">
                  <Sparkles className="w-4 h-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-foreground">Let&apos;s build your proforma</p>
                  <p className="text-[11px] text-muted-foreground">Four quick questions - I&apos;ll price your list from real posts.</p>
                </div>
                <div className="flex items-center gap-1 shrink-0 pt-1">
                  {[1, 2, 3, 4].map((s) => (
                    <span
                      key={s}
                      aria-hidden
                      className={cn('w-1.5 h-1.5 rounded-full', askStep === s ? 'bg-primary' : askStep > s ? 'bg-primary/50' : 'bg-border')}
                    />
                  ))}
                  <button
                    type="button"
                    onClick={() => { setAskStep(0); setAskDone(true) }}
                    aria-label="Skip the guided setup"
                    title="Skip the guided setup"
                    data-testid="ask-dismiss"
                    className="ml-1 text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* ---- 1 WHERE (v250: takes MORE THAN ONE location) ---- */}
              {askStep === 1 && (
                <div className="space-y-2" data-testid="ask-step-where">
                  <p className="text-sm text-foreground">
                    <span className="font-bold">Where</span> are you shopping? Pick one place - or as many as you like.
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {model.places.slice(0, 6).map((pl) => {
                      const on = myPlaces.some((p) => p.toLowerCase() === pl.key.toLowerCase())
                      return (
                        <button
                          type="button"
                          key={pl.key}
                          data-testid="ask-where-chip"
                          aria-pressed={on}
                          onClick={() => togglePlace(pl.key)}
                          className={cn(chipBase, on ? chipOn : chipOff)}
                        >
                          <MapPin className="w-3 h-3 mr-1 inline shrink-0" />
                          {pl.short}
                        </button>
                      )
                    })}
                  </div>
                  {/* v248 typed input, v250 multi: each committed place JOINS
                      the chosen set (a known community place snaps onto its
                      real prices, anything else stays typed and honest) and
                      the input clears so the next place can be typed. */}
                  <div className="flex items-center gap-1.5">
                    <Input
                      type="text"
                      maxLength={80}
                      placeholder="Or type your place (e.g. Hawassa, Bahir Dar)"
                      value={askPlace}
                      onChange={(e) => setAskPlace(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyAskPlace() } }}
                      data-testid="ask-where-input"
                      aria-label="Type a shopping location"
                      className="h-8 min-w-[10rem] flex-1 text-sm bg-card"
                    />
                    <button
                      type="button"
                      data-testid="ask-where-apply"
                      onClick={applyAskPlace}
                      disabled={!askPlace.trim()}
                      className="h-8 shrink-0 rounded-full border border-primary/40 px-3 text-xs font-semibold text-primary transition-opacity cursor-pointer disabled:opacity-50"
                    >
                      {myPlaces.length ? 'Add place too' : 'Use this place'}
                    </button>
                  </div>
                  {myPlaces.length > 0 && (
                    <p className="text-[11px] text-muted-foreground" data-testid="ask-where-count">
                      {myPlaces.length} location{myPlaces.length === 1 ? '' : 's'} chosen - the first one is the main stop.
                    </p>
                  )}
                  <button
                    type="button"
                    data-testid="ask-where-next"
                    onClick={() => {
                      if (!myPlaces.length && model.places[0]) setMyPlaces([model.places[0].key])
                      setAskStep(2)
                    }}
                    className="text-xs font-semibold text-primary hover:underline cursor-pointer"
                  >
                    {myPlaces.length > 1
                      ? `Continue with ${myPlaces.length} locations →`
                      : 'Next: what is on the list? →'}
                  </button>
                </div>
              )}

              {/* ---- 2 WHAT (the list) ---- */}
              {askStep === 2 && (
                <div className="space-y-2" data-testid="ask-step-items">
                  <p className="text-sm text-foreground">
                    <span className="font-bold">What</span> is on your list? Tap everything you need.
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {model.items.map((it) => {
                      const on = askItems.some((n) => n.toLowerCase() === it.name.toLowerCase())
                      return (
                        <button
                          type="button"
                          key={it.name}
                          data-testid="ask-item-chip"
                          aria-pressed={on}
                          onClick={() => toggleAskItem(it.name)}
                          className={cn(chipBase, on ? chipOn : chipOff)}
                        >
                          {it.name}
                        </button>
                      )
                    })}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Input
                      type="text"
                      maxLength={60}
                      placeholder="Or type your own item (e.g. morning bus fare)"
                      value={askNewItem}
                      onChange={(e) => setAskNewItem(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addAskTyped() } }}
                      data-testid="ask-item-input"
                      aria-label="Add your own item to the list"
                      className="h-8 min-w-[10rem] flex-1 text-sm bg-card"
                    />
                    <button
                      type="button"
                      data-testid="ask-item-add"
                      onClick={addAskTyped}
                      disabled={!askNewItem.trim()}
                      className="h-8 shrink-0 rounded-full border border-primary/40 px-3 text-xs font-semibold text-primary transition-opacity cursor-pointer disabled:opacity-50"
                    >
                      + Add
                    </button>
                  </div>
                  <button
                    type="button"
                    data-testid="ask-items-next"
                    onClick={() => { applyAskItems(); setAskStep(3) }}
                    className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-1.5 text-xs font-bold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 cursor-pointer"
                  >
                    Next: when →
                  </button>
                </div>
              )}

              {/* ---- 3 WHEN ---- */}
              {askStep === 3 && (
                <div className="space-y-2" data-testid="ask-step-when">
                  <p className="text-sm text-foreground"><span className="font-bold">When</span> are you visiting?</p>
                  <div className="flex flex-wrap gap-1.5">
                    {ASK_WHEN.map((w) => (
                      <button
                        type="button"
                        key={w.label}
                        data-testid="ask-when-chip"
                        onClick={() => {
                          setVisitFrom(isoDay(new Date(Date.now() + w.fromDays * 86400000)))
                          setVisitTo(isoDay(new Date(Date.now() + w.toDays * 86400000)))
                          setAskStep(4)
                        }}
                        className={cn(chipBase, chipOff)}
                      >
                        <CalendarDays className="w-3 h-3 mr-1 inline shrink-0" />
                        {w.label}
                      </button>
                    ))}
                    <button
                      type="button"
                      data-testid="ask-when-skip"
                      onClick={() => { setVisitFrom(''); setVisitTo(''); setAskStep(4) }}
                      className={cn(chipBase, chipOff)}
                    >
                      Just researching
                    </button>
                  </div>
                </div>
              )}

              {/* ---- 4 BUDGET ---- */}
              {askStep === 4 && (
                <div className="space-y-2" data-testid="ask-step-budget">
                  <p className="text-sm text-foreground">
                    Last one - your <span className="font-bold">budget</span> for the list?
                  </p>
                  {myTotals && safe != null && (
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        data-testid="ask-budget-typical"
                        onClick={() => setBudget(String(Math.round(myTotals!.av)))}
                        className={cn(chipBase, chipOff)}
                      >
                        Typical · {money(myTotals!.av, cur)}
                      </button>
                      <button
                        type="button"
                        data-testid="ask-budget-safe"
                        onClick={() => setBudget(String(safe!))}
                        className={cn(chipBase, chipOff)}
                      >
                        Safe · {money(safe!, cur)}
                      </button>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Input
                      type="number"
                      min="0"
                      step="1"
                      placeholder={`Amount in ${cur || 'your currency'}`}
                      value={budget}
                      onChange={(e) => setBudget(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); askApplyBudget() } }}
                      data-testid="ask-budget-input"
                      aria-label="Your budget for the list"
                      className="h-8 min-w-[9rem] flex-1 text-sm bg-card"
                    />
                    <button
                      type="button"
                      data-testid="ask-budget-apply"
                      onClick={askApplyBudget}
                      className="h-8 shrink-0 rounded-full bg-primary px-4 text-xs font-bold text-primary-foreground shadow-sm transition-opacity hover:bg-primary/90 cursor-pointer"
                    >
                      Set up my proforma
                    </button>
                    <button
                      type="button"
                      data-testid="ask-budget-skip"
                      onClick={askSkipBudget}
                      className="h-8 shrink-0 rounded-full border border-border px-3 text-xs font-semibold text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      Skip
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ============ v249 AI-ONLY RESULTS ============ */}
          {/* User: "remove this" (screenshot of the bare "YOUR SHOPPING
              LIST" editor with the Find / Compare / Plan tabs). The list
              editor, the visiting date pickers and the tab bar are GONE -
              when the conversation completes, its answers BECOME the
              results: each answer restated with an Edit button that
              re-opens exactly that question, followed by the real numbers
              the tabs used to show. Same honest data, no bare form. */}
          {gate === 'none' && askDone && (
            emptyList ? (
              <button
                type="button"
                data-testid="proforma-reopen"
                onClick={() => reopenAt(1)}
                className="mt-3 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-sm transition-opacity hover:bg-primary/90 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Plan my shopping with AI
              </button>
            ) : (
              <div
                className="mt-3 rounded-xl border border-border bg-card/40 p-3.5 space-y-3"
                data-testid="proforma-results"
              >
                {/* ---- the four answers, each re-openable ---- */}
                <div className="flex items-center gap-2 flex-wrap text-sm text-foreground">
                  <span className="inline-flex items-center gap-1.5 min-w-0 flex-wrap">
                    <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
                    {myPlaces.length > 1 ? (
                      <span className="flex gap-1 flex-wrap items-center">
                        {myPlaces.map((p, i) => (
                          <span
                            key={p}
                            data-testid="proforma-where-chip"
                            title={i === 0 ? 'Main stop' : 'Extra stop'}
                            className={cn(
                              'rounded-full px-2 py-0.5 text-xs font-bold',
                              i === 0
                                ? 'bg-primary/10 text-primary border border-primary/30'
                                : 'bg-accent text-foreground border border-border',
                            )}
                          >
                            {shortOf(p)}
                          </span>
                        ))}
                      </span>
                    ) : (
                      <b className="truncate max-w-[14rem]">{myShort}</b>
                    )}
                  </span>
                  <button
                    type="button"
                    data-testid="proforma-edit-where"
                    aria-label="Edit the location"
                    onClick={() => reopenAt(1)}
                    className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline cursor-pointer"
                  >
                    <Pencil className="w-3 h-3" /> Edit
                  </button>
                </div>
                <div className="flex items-start gap-2 flex-wrap">
                  <span className="text-xs font-semibold text-muted-foreground pt-1.5 shrink-0">List</span>
                  <div className="flex gap-1.5 flex-wrap flex-1 min-w-0">
                    {chosenNames.map((name) => (
                      <span
                        key={name}
                        data-testid="compass-list-chip"
                        title={
                          customItems.includes(name)
                            ? 'Typed by you - priced once the community posts it'
                            : 'Added by you - the community posts prices for this'
                        }
                        className={cn(chipBase, 'inline-flex items-center gap-1.5', chipOn)}
                      >
                        {name}
                        <button
                          type="button"
                          data-testid="compass-list-remove"
                          aria-label={`Remove ${name} from the list`}
                          onClick={() => removeListedItem(name)}
                          className="cursor-pointer opacity-70 hover:opacity-100"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                  <button
                    type="button"
                    data-testid="proforma-edit-items"
                    aria-label="Edit the list"
                    onClick={() => reopenAt(2)}
                    className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline cursor-pointer shrink-0"
                  >
                    <Pencil className="w-3 h-3" /> Edit
                  </button>
                </div>
                <div className="flex items-center gap-2 flex-wrap text-sm text-foreground">
                  <span className="inline-flex items-center gap-1.5 min-w-0">
                    <CalendarDays className="w-3.5 h-3.5 text-primary shrink-0" />
                    {visitSpan || 'Just researching'}
                  </span>
                  <button
                    type="button"
                    data-testid="proforma-edit-when"
                    aria-label="Edit the dates"
                    onClick={() => reopenAt(3)}
                    className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline cursor-pointer"
                  >
                    <Pencil className="w-3 h-3" /> Edit
                  </button>
                </div>
                <div className="flex items-center gap-2 flex-wrap text-sm text-foreground">
                  <span className="inline-flex items-center gap-1.5 min-w-0">
                    <Wallet className="w-3.5 h-3.5 text-primary shrink-0" />
                    {budgetNum > 0 ? (
                      <>Budget <b>{money(budgetNum, cur)}</b></>
                    ) : (
                      'No budget yet'
                    )}
                  </span>
                  <button
                    type="button"
                    data-testid="proforma-edit-budget"
                    aria-label="Edit the budget"
                    onClick={() => reopenAt(4)}
                    className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline cursor-pointer"
                  >
                    <Pencil className="w-3 h-3" /> Edit
                  </button>
                </div>

                {/* ---- the real numbers - what the tabs used to show ---- */}
                {myTotals ? (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="border-l-4 border-emerald-500 pl-3" data-testid="compass-stat-avg">
                        <b className="block text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                          {money(myTotals.av, cur)}
                        </b>
                        <span className="text-xs text-muted-foreground">Average for the list</span>
                      </div>
                      <div className="border-l-4 border-emerald-400 pl-3" data-testid="compass-stat-low">
                        <b className="block text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                          {money(myTotals.lo, cur)}
                        </b>
                        <span className="text-xs text-muted-foreground">Lowest for the list</span>
                      </div>
                      <div className="border-l-4 border-amber-500 pl-3" data-testid="compass-stat-high">
                        <b className="block text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                          {money(myTotals.hi, cur)}
                        </b>
                        <span className="text-xs text-muted-foreground">Highest for the list</span>
                      </div>
                    </div>
                    {/* Range bar only when the list actually spans a range -
                        single-post lists have lo == hi and a bar would be noise. */}
                    {myTotals.hi > myTotals.lo && (
                      <div>
                        <div
                          className="relative h-2.5 rounded-full bg-gradient-to-r from-emerald-500 via-amber-400 to-amber-500"
                          data-testid="compass-range"
                        >
                          <span
                            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-1.5 h-5 rounded bg-foreground"
                            style={{ left: `${rangePct}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-[11px] text-muted-foreground mt-1.5">
                          <span>{money(myTotals.lo, cur)}</span>
                          <span>{money(myTotals.hi, cur)}</span>
                        </div>
                      </div>
                    )}
                    <div
                      className="pt-3 border-t border-dashed border-border flex items-center gap-2.5 flex-wrap text-sm text-muted-foreground"
                      data-testid="compass-trend"
                    >
                      {trend == null ? (
                        <span>No month-over-month trend yet - more posts are needed.</span>
                      ) : (
                        <>
                          <span
                            className={cn(
                              'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold',
                              trend > 0
                                ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                                : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
                            )}
                          >
                            {trend > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                            {trend > 0 ? '+' : ''}
                            {trend}%
                          </span>
                          <span>
                            Prices {trend > 0 ? 'rose' : trend < 0 ? 'fell' : 'held'}{' '}
                            {Math.abs(trend)}% this month at {myShort}.
                          </span>
                        </>
                      )}
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground" data-testid="ai-results-nodata">
                    None of your list items have prices at {myShort} yet - post one from the composer
                    and the numbers appear here. Nothing is invented.
                  </p>
                )}

                {/* v250 YOUR LOCATIONS compared - every chosen stop priced
                    for the list, cheapest of yours badged; tap Shop here to
                    make a stop the primary one (the headline stats follow). */}
                {myPlaceRows.length > 1 && (
                  <div
                    className="rounded-xl border border-border bg-primary/5 p-3.5"
                    data-testid="compass-my-places"
                  >
                    <h5 className="flex items-center gap-1.5 text-sm font-bold text-foreground">
                      <ArrowRightLeft className="w-3.5 h-3.5 text-primary shrink-0" />
                      Your {myPlaces.length} locations, compared
                    </h5>
                    <div className="mt-2 divide-y divide-border" data-testid="compass-my-place-list">
                      {myPlaceRows.map((r) => {
                        const isPrimary = r.key === myPlace
                        const isCheapest = r.key === cheapestMineKey
                        return (
                          <div
                            key={r.key}
                            className="py-2 flex items-center gap-2.5 min-w-0"
                            data-testid="compass-my-place-row"
                          >
                            <MapPin className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-foreground truncate flex items-center gap-1.5">
                                <span className="truncate">{r.short}</span>
                                {isPrimary && (
                                  <span className="shrink-0 rounded-full bg-primary/10 border border-primary/30 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                                    Main stop
                                  </span>
                                )}
                                {isCheapest && (
                                  <span className="shrink-0 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-1.5 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                                    Cheapest of yours
                                  </span>
                                )}
                              </p>
                              <p className="text-[11px] text-muted-foreground">
                                {r.t
                                  ? `Typical ${money(r.t.av, cur)} · low ${money(r.t.lo, cur)} - high ${money(r.t.hi, cur)}`
                                  : 'No prices for this list here yet'}
                              </p>
                            </div>
                            {!isPrimary && r.t && (
                              <button
                                type="button"
                                onClick={() => choosePrimary(r.key)}
                                className="shrink-0 rounded-full border border-border px-2.5 py-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                              >
                                Shop here
                              </button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* v250 THE POSTERS on the proforma (user: "show the posters
                    on the proforma too"): the real posts behind these
                    numbers, each with its poster - avatar initials, name,
                    local post count, place and helpful votes. Nothing is
                    invented: rows render only when real posts back the
                    list, your own chosen stops first. */}
                {posterPosts.length > 0 && (
                  <div
                    className="rounded-xl border border-border bg-card/60 p-3.5"
                    data-testid="compass-posters"
                  >
                    <h5 className="flex items-center gap-1.5 text-sm font-bold text-foreground">
                      <Users className="w-3.5 h-3.5 text-primary shrink-0" />
                      The posters behind these prices
                    </h5>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Real people who posted the prices your proforma uses.
                    </p>
                    <div className="mt-1 divide-y divide-border" data-testid="compass-poster-list">
                      {posterPosts.map(({ post: pp, place, mine }) => (
                        <div
                          key={pp.id}
                          className="py-2 flex items-center gap-2.5 min-w-0"
                          data-testid="compass-poster-row"
                        >
                          <span className="w-7 h-7 rounded-full bg-slate-900 dark:bg-primary text-white flex items-center justify-center font-black text-[10px] shrink-0">
                            {initialsOf(pp.author.name)}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-foreground truncate flex items-center gap-1.5">
                              <span className="truncate" data-testid="compass-poster-name">
                                {pp.author.name || 'Local hustler'}
                              </span>
                            </p>
                            <p className="text-[11px] text-muted-foreground truncate flex items-center gap-1 flex-wrap">
                              {pp.author.localPostCount ? (
                                <span className="shrink-0 font-semibold text-emerald-700 dark:text-emerald-400">
                                  {pp.author.localPostCount} post{pp.author.localPostCount === 1 ? '' : 's'}
                                </span>
                              ) : null}
                              {mine && (
                                <span className="shrink-0 inline-flex items-center gap-0.5 rounded-full bg-primary/10 border border-primary/30 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                                  <MapPin className="w-2.5 h-2.5" />
                                  your stop
                                </span>
                              )}
                              <span className="truncate">
                                {pp.productName} · {shortOf(place)}
                                {pp.helpfulCount ? ` · ${pp.helpfulCount} helpful` : ''}
                              </span>
                            </p>
                          </div>
                          <span className="shrink-0 text-sm font-bold text-foreground">
                            {money(model.priceOf(pp), cur)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {myTotals && mover && (
                  <div className="rounded-xl bg-emerald-500/10 border border-border p-3.5 flex items-start gap-2">
                    <Lightbulb className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                    <p className="text-xs sm:text-sm text-foreground">
                      {mover.ch >= 5
                        ? `${mover.name} is up ${mover.ch}% this month. Budget toward the higher end and compare a few stalls.`
                        : 'Prices on your list are steady. Aim near the lowest price and haggle from there.'}
                    </p>
                  </div>
                )}

                {/* Safe amount + the verdict on the budget that was answered */}
                {myTotals && safe != null && (
                  <div>
                    <div className="rounded-xl bg-emerald-500/10 border border-border p-3.5 flex items-start gap-2">
                      <Wallet className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                      <p className="text-xs sm:text-sm text-foreground">
                        To shop in {myPlace}
                        {visitSpan ? ` ${visitSpan}` : ''}, bring at least{' '}
                        <b data-testid="compass-safe-budget">{money(safe, cur)}</b>. That is the typical
                        total plus half the gap to the highest prices.
                        {vDays > 1 && (
                          <>
                            {' '}
                            Spread over {vDays} days that works out to about{' '}
                            <b data-testid="compass-per-day">{money(Math.ceil(safe / vDays), cur)} per day</b>.
                          </>
                        )}
                      </p>
                    </div>
                    {verdict && (
                      <p className="mt-2.5 text-sm text-foreground" data-testid="compass-budget-verdict">
                        {verdict}
                      </p>
                    )}
                  </div>
                )}

                {/* Budget locator: where the budget goes furthest.
                    Rendered whenever a budget was answered - even when the
                    given location itself has no prices, because the point is
                    to LOCATE the best real price for this list. */}
                {budgetNum > 0 && budgetPlaces.length > 0 && (
                  <div
                    className="rounded-xl border border-border bg-primary/5 p-3.5"
                    data-testid="compass-budget-locate"
                  >
                    <h5 className="flex items-center gap-1.5 text-sm font-bold text-foreground">
                      <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
                      Where your budget goes furthest
                    </h5>
                    {budgetBest ? (
                      <p
                        className="mt-1.5 text-sm text-foreground"
                        data-testid="compass-budget-locate-best"
                      >
                        <span className="inline-block rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white mr-1">
                          Best result
                        </span>{' '}
                        Within your {money(budgetNum, cur)} budget the best price is{' '}
                        <b>{budgetBest.short}</b> - the typical total there is{' '}
                        <b className="text-emerald-600 dark:text-emerald-400">
                          {money(budgetBest.total, cur)}
                        </b>
                        , {money(budgetNum - budgetBest.total, cur)} under budget - and that
                        total covers every item on your list.
                        {budgetBest.key === myPlace
                          ? ' That is the location you gave.'
                          : myTotals
                            ? ` From ${myShort} that saves ${money(myTotals.av - budgetBest.total, cur)}.`
                            : ''}
                      </p>
                    ) : bestFullAny ? (
                      <p
                        className="mt-1.5 text-sm text-foreground"
                        data-testid="compass-budget-locate-none"
                      >
                        No location prices your whole list inside your{' '}
                        {money(budgetNum, cur)} budget yet. The cheapest full-list total is{' '}
                        {bestFullAny.short} at <b>{money(bestFullAny.total, cur)}</b> -{' '}
                        {money(bestFullAny.total - budgetNum, cur)} over.
                      </p>
                    ) : (
                      budgetClosest && (
                        <p
                          className="mt-1.5 text-sm text-foreground"
                          data-testid="compass-budget-locate-partial"
                        >
                          No single location prices your whole list yet.{' '}
                          <b>{budgetClosest.short}</b> comes closest - it prices{' '}
                          {budgetClosest.covered} of {chosenNames.length}{' '}
                          {chosenNames.length === 1 ? 'item' : 'items'} at{' '}
                          <b>{money(budgetClosest.total, cur)}</b> typical for those. Post the
                          missing prices and the locator will match the full list.
                        </p>
                      )
                    )}
                    {myTotals && (
                      <p
                        className="mt-1.5 text-xs text-muted-foreground"
                        data-testid="compass-budget-locate-given"
                      >
                        At the location you gave ({myShort}) this list comes to{' '}
                        {money(myTotals.av, cur)} typical -{' '}
                        {givenFits
                          ? `${money(budgetNum - myTotals.av, cur)} inside your budget`
                          : `${money(myTotals.av - budgetNum, cur)} over your budget`}
                        .
                      </p>
                    )}
                    {/* Ranked place list: every place with a real price for
                        this list renders, cheapest full-list first, each row
                        carrying the community's HELPFUL votes - the
                        most-endorsed place wears a Most liked badge. */}
                    {budgetPlaces.length > 0 && (
                      <div
                        className="mt-2.5 rounded-lg border border-border bg-card divide-y divide-border overflow-hidden"
                        data-testid="compass-budget-place-list"
                      >
                        {budgetPlaces.map((p, i) => {
                          const full = p.covered === chosenNames.length
                          const fits = p.total <= budgetNum
                          // Exactly one badge: the first row that holds the
                          // highest helpful count (ties keep it on the
                          // higher-ranked = cheaper row).
                          const mostLiked =
                            p.likes > 0 &&
                            p.likes === budgetMaxLikes &&
                            budgetPlaces.findIndex((x) => x.likes === budgetMaxLikes) === i
                          return (
                            <div
                              key={p.key}
                              className="px-3 py-2.5 flex items-center gap-2.5"
                              data-testid="compass-budget-place-row"
                            >
                              <span className="text-[11px] font-bold text-muted-foreground w-4 shrink-0">
                                {i + 1}
                              </span>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-foreground truncate flex items-center gap-1.5">
                                  <span className="truncate">{p.short}</span>
                                  {mostLiked && (
                                    <span
                                      className="shrink-0 inline-flex items-center gap-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-1.5 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400"
                                      data-testid="compass-budget-most-liked"
                                    >
                                      <ThumbsUp className="w-2.5 h-2.5" />
                                      Most liked
                                    </span>
                                  )}
                                </p>
                                <p
                                  className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5"
                                  data-testid="compass-budget-place-likes"
                                >
                                  <ThumbsUp className="w-3 h-3 shrink-0" />
                                  {p.likes} helpful
                                  {p.nPosts > 0 ? ` · ${p.nPosts} post${p.nPosts === 1 ? '' : 's'}` : ''}
                                </p>
                              </div>
                              <div className="text-right shrink-0" data-testid="compass-budget-place-fit">
                                <b
                                  className={cn(
                                    'block text-sm font-bold tracking-tight',
                                    full
                                      ? fits
                                        ? 'text-emerald-600 dark:text-emerald-400'
                                        : 'text-amber-600 dark:text-amber-400'
                                      : 'text-foreground',
                                  )}
                                >
                                  {money(p.total, cur)}
                                </b>
                                <span className="block text-[10px] text-muted-foreground">
                                  {full
                                    ? fits
                                      ? 'fits your budget'
                                      : `${money(p.total - budgetNum, cur)} over`
                                    : `${p.covered} of ${chosenNames.length} items only`}
                                </span>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                    {budgetBest && budgetBest.key !== myPlace && (
                      <button
                        type="button"
                        data-testid="compass-budget-locate-switch"
                        onClick={() => choosePrimary(budgetBest.key)}
                        className="mt-2 rounded-full border border-emerald-500/40 px-3 py-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 transition-colors cursor-pointer"
                      >
                        Shop at {budgetBest.short} instead
                      </button>
                    )}
                  </div>
                )}
                {budgetNum > 0 && budgetPlaces.length === 0 && (
                  <p
                    className="text-sm text-muted-foreground"
                    data-testid="compass-budget-locate-empty"
                  >
                    No community prices for this list ({chosenNames.slice(0, 3).join(', ')}
                    {chosenNames.length > 3 ? ` +${chosenNames.length - 3} more` : ''}) in{' '}
                    {cur || 'any currency'} yet - post a price and the budget locator will find
                    where your budget goes furthest.
                  </p>
                )}

                {/* Same list, other locations - cheapest first, one tap
                    moves the shopping there. */}
                <div>
                  <h4 className="text-sm font-bold text-foreground flex items-center gap-1.5">
                    <ArrowRightLeft className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    Same list, other locations
                  </h4>
                  {others.length ? (
                    <div className="mt-1 divide-y divide-border">
                      {others.map((o) => {
                        const diff = (o.total as number) - (myTotals ? myTotals.av : 0)
                        return (
                          <div key={o.key} className="py-2.5 flex items-center gap-3" data-testid="compass-alt-row">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-foreground truncate">{o.short}</p>
                              <p className="text-xs text-muted-foreground">
                                Typical total {money(o.total as number, cur)}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => choosePrimary(o.key)}
                              className={cn(
                                'shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer',
                                diff < 0
                                  ? 'border-emerald-500/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10'
                                  : 'border-border text-muted-foreground hover:text-foreground',
                              )}
                            >
                              {diff < 0 ? `${money(-diff, cur)} less` : `${money(diff, cur)} more`} &middot; switch
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-muted-foreground">
                      No other locations to compare yet - more posts will fill this in.
                    </p>
                  )}
                </div>
              </div>
            )
          )}
        </>
      )}
    </Card>
  )
}

'use client'

/**
 * Circub Compass - the price tools behind the brand.
 *
 * Three views over the REAL price posts on circub (the public
 * /api/local-prices feed - the same posts the Local tab shows; no synthetic
 * numbers anywhere):
 *
 *   Research            - what the shopping list costs at "my" place: the
 *                         average / lowest / highest totals, the price range,
 *                         the month trend and the people who posted.
 *   Compare by location - type any locations and see item and whole-list
 *                         typical prices side by side, cheapest highlighted,
 *                         tap a header to adopt that place. A typed name
 *                         the community has posted (the full "City,
 *                         Country" key or just its city part, any case)
 *                         snaps onto that place so its real prices light
 *                         up; anything else gets an honest empty column
 *                         until a real post prices it there.
 *   Plan my budget      - set quantities, see best / typical / worst totals,
 *                         the safe amount to set aside, a verdict on a budget
 *                         amount AND currency both written by hand (two text
 *                         inputs side by side) and cheaper alternatives
 *                         elsewhere. Write a budget and the card also
 *                         LOCATES where the best price for the list is:
 *                         every place the community has posted, cheapest
 *                         typical total first, checked against that budget -
 *                         the location the user gave is shown against the
 *                         same budget and one tap moves the shopping there.
 *                         The ranked place list (v107) also carries the
 *                         community's HELPFUL votes: every row shows how
 *                         many thumbs-up the posts behind that place's
 *                         prices earned, the most-endorsed place gets a
 *                         Most liked badge, and ties on price break by
 *                         votes - lower price AND many likes, together.
 *                         The
 *                         shopping location is WRITTEN into a text input or
 *                         taken from the device (geolocation + reverse
 *                         geocode) - a place without community posts stays
 *                         honest and empty, never invented.
 *
 *   The shopping list is not a preset picker: NOTHING is offered as an
 *   option - the user writes every item themselves (Enter or the Add
 *   button). A typed name that matches a community product snaps onto it
 *   so its real prices light up; anything else rides along honestly -
 *   "no prices posted yet" rows / blank compare cells until a real post
 *   prices it, and numbers are never invented.
 *
 * Data honesty rules (same as the market graph panel):
 *   - a post's price = recommendedPrice when set, else the midpoint of its
 *     priceMin..priceMax range
 *   - locations group by "city, country"; currencies never mix - the tools
 *     run on the dominant currency or a currency the user typed; a code the
 *     community has posted snaps in case-insensitively, anything else stays
 *     honest (the real dominant numbers stay on screen, no exchange rate is
 *     ever invented)
 *   - sparse data renders honestly (n=1 rows render; missing item/place
 *     combos stay blank in the table, never invented)
 *
 * Design follows the compass/ prototype (repo root) adapted to the app
 * theme: theme tokens only (dark + light safe), wrapping chips and a
 * horizontally scrollable table on phones.
 */

import { useEffect, useMemo, useState } from 'react'
import {
  ArrowRightLeft, CalendarDays, Compass, Lightbulb, Loader2, MapPin, Scale,
  SearchCheck, ThumbsUp, TrendingDown, TrendingUp, Wallet, X,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

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

type TabKey = 'research' | 'compare' | 'budget'

const TABS: { key: TabKey; label: string; icon: typeof SearchCheck }[] = [
  { key: 'research', label: 'Research', icon: SearchCheck },
  { key: 'compare', label: 'Compare by location', icon: Scale },
  { key: 'budget', label: 'Plan my budget', icon: Wallet },
]

const LIST_CHIP_LIMIT = 8 // shopping-list choices (most-posted products)
const MAX_CUSTOM_ITEMS = 12 // typed items cap - keeps the tables walkable
const MAX_CMP_PLACES = 4 // typed compare columns cap - keeps the table walkable
const RESEARCH_ROWS = 6 // post rows before "Show all"
const BUDGET_ROWS = 6 // budget-locator place rows before the cut
const SAFE_ROUND_TO = 50 // safe budget rounds UP to a walkable number
const TRUSTED_POSTS = 15 // authors with more posts than this show "Trusted"

function money(n: number, cur: string): string {
  return `${Math.round(n).toLocaleString('en-US')} ${cur}`
}

function agoDays(days: number): string {
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  return `${days} days ago`
}

function shortOf(placeKey: string): string {
  return placeKey.split(',')[0]
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

// Cheapest-cell highlight shared by the compare table cells.
function cheapClass(cheap: boolean): string {
  return cheap
    ? 'text-emerald-600 dark:text-emerald-400 font-bold'
    : 'text-foreground'
}

export function CompassPriceTools() {
  const [posts, setPosts] = useState<ToolPost[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [currency, setCurrency] = useState('')
  const [tab, setTab] = useState<TabKey>('research')
  const [visitFrom, setVisitFrom] = useState('')
  const [visitTo, setVisitTo] = useState('')
  const [onItems, setOnItems] = useState<Record<string, boolean>>({})
  const [customItems, setCustomItems] = useState<string[]>([])
  const [newItem, setNewItem] = useState('')
  const [qty, setQty] = useState<Record<string, number>>({})
  const [myPlace, setMyPlace] = useState('')
  // Compare columns are TYPED by the user (v96) - nothing is preset. Each
  // entry is the canonical place key when the community posts there, or
  // the text as typed for a column that stays honest and empty.
  const [cmpList, setCmpList] = useState<string[]>([])
  const [cmpDraft, setCmpDraft] = useState('')
  const [itemFilter, setItemFilter] = useState('all')
  const [showAll, setShowAll] = useState(false)
  const [budget, setBudget] = useState('')
  // Location input: null = the input shows the applied place; a string =
  // the user is typing. Committed on Enter, the Set button, or blur.
  const [placeDraft, setPlaceDraft] = useState<string | null>(null)
  // Currency input: same contract - null shows the applied currency, a
  // string is the user typing. Committed on Enter, the Set button, or blur.
  const [currencyDraft, setCurrencyDraft] = useState<string | null>(null)
  const [locating, setLocating] = useState(false)
  const [locError, setLocError] = useState('')

  useEffect(() => {
    let alive = true
    fetch('/api/local-prices', { cache: 'no-store' })
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

    // Currencies never mix - dominant first; a currency the user typed
    // switches the view only when the community actually posts in it.
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
    // v113: the FULL set of community product names in the currency - the
    // capped `items` above is a DISPLAY choice only. The typed-name snap
    // and the chosen-list totals must keep working for every product the
    // community has posted, even when the feed grows past the 8 chip
    // slots (test probes and debris included).
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

    // Community endorsement (v107): the sum of HELPFUL votes across the
    // real posts that stand behind one place's price for the chosen list.
    // A place with zero votes shows an honest 0 - never invented.
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
  // never renders a date and hydration stays clean.
  useEffect(() => {
    const t = isoDay(new Date())
    setVisitFrom(t)
    setVisitTo(t)
  }, [])

  // First data -> defaults: the dominant currency and the busiest place as
  // the shopping location. The LIST and the COMPARE COLUMNS stay empty -
  // everything on them is written by the user.
  useEffect(() => {
    if (!model) return
    if (!currency && model.currencies.length) setCurrency(model.currencies[0])
    setMyPlace((prev) => prev || model.places[0]?.key || '')
  }, [model, currency])

  const toggleItem = (name: string) => {
    setOnItems((prev) => ({ ...prev, [name]: !prev[name] }))
    if (itemFilter === name) setItemFilter('all')
  }

  // Add a typed item to the list. A case-insensitive match with a feed item
  // (or an already-typed one) just turns that chip on instead of duplicating.
  const addTypedItem = () => {
    const name = newItem.trim().replace(/\s+/g, ' ').slice(0, 60)
    if (!name) return
    // v113: snap against ALL community product names in the currency -
    // not the capped display list - so a typed name that matches ANY real
    // product snaps onto it, no matter how far down the feed it sits.
    const feedMatch = model?.itemNames.find((n) => n.toLowerCase() === name.toLowerCase())
    const dup = customItems.find((n) => n.toLowerCase() === name.toLowerCase())
    const hit = feedMatch ?? dup
    if (hit) {
      setOnItems((prev) => ({ ...prev, [hit]: true }))
      setNewItem('')
      return
    }
    if (customItems.length >= MAX_CUSTOM_ITEMS) return
    setCustomItems((prev) => [...prev, name])
    setOnItems((prev) => ({ ...prev, [name]: true }))
    setNewItem('')
  }

  const removeCustomItem = (name: string) => {
    setCustomItems((prev) => prev.filter((n) => n !== name))
    setOnItems((prev) => {
      const next = { ...prev }
      delete next[name]
      return next
    })
    if (itemFilter === name) setItemFilter('all')
  }

  // Remove an item from the list (the x on any list chip). Typed items are
  // dropped entirely; a snapped feed item is toggled back off.
  const removeListedItem = (name: string) => {
    if (customItems.includes(name)) removeCustomItem(name)
    else toggleItem(name)
  }

  // Add a typed location to the compare. A case-insensitive match with a
  // place the community has posted (the full "City, Country" key or just
  // its city part) snaps onto that canonical key so its real prices light
  // up; anything else is kept as typed and its column stays honest and
  // empty until a real post prices it there - never invented.
  const addCmpPlace = () => {
    const raw = cmpDraft.trim().replace(/\s+/g, ' ').slice(0, 80)
    if (!raw || cmpList.length >= MAX_CMP_PLACES) return
    const known = model?.places.find(
      (p) =>
        p.key.toLowerCase() === raw.toLowerCase() ||
        p.short.toLowerCase() === raw.toLowerCase(),
    )
    const key = known ? known.key : raw
    setCmpList((prev) =>
      prev.some((k) => k.toLowerCase() === key.toLowerCase()) ? prev : [...prev, key],
    )
    setCmpDraft('')
  }

  const removeCmpPlace = (key: string) => {
    setCmpList((prev) => prev.filter((k) => k !== key))
  }

  // Apply the typed location. A case-insensitive match with a place the
  // community has posted snaps onto that canonical key so its stats light
  // up; anything else is kept as typed and the tools stay honest (no
  // prices there -> "no prices posted yet", never invented numbers).
  const applyPlace = () => {
    if (placeDraft == null) return
    const raw = placeDraft.trim().replace(/\s+/g, ' ').slice(0, 80)
    setPlaceDraft(null)
    setLocError('')
    if (!raw) return
    const known = model?.places.find((p) => p.key.toLowerCase() === raw.toLowerCase())
    setMyPlace(known ? known.key : raw)
  }

  // Apply the typed currency. A case-insensitive match with a currency the
  // community has posted snaps onto that canonical code so its real prices
  // light up; anything else is kept as typed and stays honest - the tools
  // keep the community's real numbers and NEVER invent an exchange rate.
  const applyCurrency = () => {
    if (currencyDraft == null) return
    const raw = currencyDraft.trim().replace(/\s+/g, ' ').slice(0, 8).toUpperCase()
    setCurrencyDraft(null)
    if (!raw) return
    const known = model?.currencies.find((c) => c.toLowerCase() === raw.toLowerCase())
    setCurrency(known || raw)
  }

  // Device location -> reverse geocode to "City, Country" via Nominatim
  // (free OpenStreetMap service; CSP connect-src already allows https:).
  // Every failure path stays honest and points back to typing the place.
  const useDeviceLocation = () => {
    if (locating) return
    setLocError('')
    if (!navigator.geolocation) {
      setLocError("This browser can't share your location - type the location instead.")
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords
        fetch(
          `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&zoom=10&addressdetails=1`,
          { headers: { Accept: 'application/json' } },
        )
          .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
          .then((d) => {
            const a = (d && d.address) || {}
            const city = a.city || a.town || a.village || a.county || a.state || ''
            const country = a.country || ''
            const name = [city, country].filter(Boolean).join(', ')
            if (!name) throw new Error('no place name')
            const known = model?.places.find((p) => p.key.toLowerCase() === name.toLowerCase())
            setMyPlace(known ? known.key : name)
            setPlaceDraft(null)
          })
          .catch(() => {
            setLocError("Couldn't read a place name from your device location - type it instead.")
          })
          .finally(() => setLocating(false))
      },
      () => {
        setLocating(false)
        setLocError('Location permission was denied - type the location instead.')
      },
      { timeout: 10000, maximumAge: 600000 },
    )
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

  // ---- Research rows: the list's posts at MY place, cheapest first --------
  const researchRows = useMemo(() => {
    if (!model || !chosenNames.length) return []
    const want = itemFilter === 'all' ? chosenNames : [itemFilter]
    const rows = model.inCur
      .filter(
        (p) => want.includes(p.productName.trim()) && model.placeOf(p) === myPlace,
      )
      .map((p) => ({
        post: p,
        price: model.priceOf(p),
        place: model.placeOf(p),
        days: Math.floor((Date.now() - new Date(p.createdAt).getTime()) / 864e5),
      }))
    const min = rows.length ? Math.min(...rows.map((r) => r.price)) : 0
    return rows
      .map((r) => ({ ...r, lowest: rows.length > 1 && r.price === min }))
      .sort((a, b) => a.price - b.price)
  }, [model, chosenNames, itemFilter, myPlace])

  // ---- render-body derivations (cheap, over the already-filtered posts) ---
  const cur = model?.cur || ''
  const loading = !model
  const noPosts = !!model && model.inCur.length === 0
  const emptyList = chosenNames.length === 0
  const myShort = myPlace ? shortOf(myPlace) : 'your area'

  // Research: list totals at my place + month trend + top mover tip.
  const myTotals = model && !emptyList ? model.totals(myPlace, chosenNames, qty) : null
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

  // Compare: the TYPED columns, per-item cells, totals row, cheapest
  // insight. A typed name the community posts maps onto its real
  // PlaceGroup; a name they don't post (yet) rides along as an honest
  // zero-data column.
  const cmpSel = model
    ? cmpList.map(
        (key) => model.places.find((p) => p.key === key) || { key, short: shortOf(key), count: 0 },
      )
    : []
  const cmpRows =
    model && !emptyList
      ? chosenNames.map((name) => {
          const cells = cmpSel.map((pl) => model.per(name, pl.key))
          const defined = cells.filter(Boolean) as ItemStats[]
          const minAv = defined.length ? Math.min(...defined.map((c) => c.av)) : null
          const count = model.countOf(name)
          return { name, count, cells, minAv }
        })
      : []
  const cmpTotals = model && !emptyList ? cmpSel.map((pl) => model.totals(pl.key, chosenNames, qty)) : []
  const definedTotals = cmpTotals.filter(Boolean) as ItemStats[]
  const minTotal = definedTotals.length ? Math.min(...definedTotals.map((t) => t.av)) : null
  const bestIdx = minTotal != null ? cmpTotals.findIndex((t) => t && t.av === minTotal) : -1
  const bestPlace = bestIdx >= 0 ? cmpSel[bestIdx] : null
  const savings = myTotals && minTotal != null ? myTotals.av - minTotal : 0

  // Visiting span -> one phrase reused by the research intro and the budget
  // line: "on Sep 28" for a single day, "from Sep 28 to Oct 3 (6 days)" for a
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
          .filter((p) => p.key !== myPlace)
          .map((p) => ({ ...p, total: model.totals(p.key, chosenNames, qty)?.av ?? null }))
          .filter((o) => o.total != null)
          .sort((a, b) => (a.total as number) - (b.total as number))
          .slice(0, 3)
      : []

  // Budget locator (v98): once a budget is written, locate WHERE the best
  // price for this list is - every place the community has posted, cheapest
  // typical total first - and which of them fit INSIDE the typed budget.
  // The location the user gave is measured against the same budget, and one
  // tap moves the shopping there. Nothing is invented: places without real
  // prices for the list are skipped, and when nothing fits the cheapest
  // real total is shown with the honest gap instead.
  const budgetPlaces =
    model && !emptyList && budgetNum > 0
      ? model.places
          .map((p) => ({
            key: p.key,
            short: p.short,
            total: model.totals(p.key, chosenNames, qty)?.av ?? null,
            nPosts: model.totals(p.key, chosenNames, qty)?.n ?? 0,
            likes: model.helpful(p.key, chosenNames),
            // How many of the list items this place actually prices - a
            // sparse row that covers only part of the list says so (v110).
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
          // Full-list places lead (v111): a total that prices EVERY item
          // on the list is the only one that can honestly match the budget
          // for all the items - so those rows rank first. Partial rows
          // follow: most coverage first, then cheapest, then most liked.
          .sort(
            (a, b) =>
              b.covered - a.covered || a.total - b.total || b.likes - a.likes,
          )
          .slice(0, BUDGET_ROWS)
      : []
  const budgetMaxLikes = budgetPlaces.reduce((m, p) => Math.max(m, p.likes), 0)
  // v111: the budget MATCH is only claimed by a place that prices the
  // WHOLE list - a partial row cannot honestly "fit the budget" for all
  // the items. bestFullAny = cheapest full-list total (even when over
  // budget); budgetClosest = the most-covering row when nobody prices
  // everything yet. Nothing invented - every fallback says what it is.
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
      {/* Header */}
      <div className="flex items-start gap-3">
        <span className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-primary/10 shrink-0">
          <Compass className="w-4 h-4 text-primary" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-foreground">Know the price before you go</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Research what people paid, compare locations and plan the budget for your next market
            trip - from real posts on circub.
          </p>
        </div>
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

      {model && !noPosts && (
        <>
          {/* Shopping list + visit span (calendar, from day to day) */}
          <div className="mt-3 flex items-center justify-between gap-2 flex-wrap">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Your shopping list
            </p>
            <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground flex-wrap">
              <CalendarDays className="w-3 h-3 shrink-0" />
              Visiting
              <input
                type="date"
                value={visitFrom}
                max={visitTo || undefined}
                onChange={(e) => setVisitFrom(e.target.value)}
                data-testid="compass-visit-from"
                aria-label="Visiting from"
                className="h-7 rounded-md border border-input bg-card px-1.5 text-[11px] text-foreground"
              />
              <span className="shrink-0">to</span>
              <input
                type="date"
                value={visitTo}
                min={visitFrom || undefined}
                onChange={(e) => setVisitTo(e.target.value)}
                data-testid="compass-visit-to"
                aria-label="Visiting to"
                className="h-7 rounded-md border border-input bg-card px-1.5 text-[11px] text-foreground"
              />
            </label>
          </div>
          {/* The list itself - ONLY what the user wrote. A typed name that
              matched a community product snapped onto it, so every chip here
              was added by the user and every chip has an x. */}
          <div className="mt-1.5 flex gap-1.5 flex-wrap">
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

          {/* Type your own item - Enter or the Add button */}
          <div className="mt-2 flex items-center gap-1.5 flex-wrap">
            <Input
              type="text"
              maxLength={60}
              placeholder="Add your own item (e.g. morning bus fare)"
              value={newItem}
              data-testid="compass-custom-item-input"
              aria-label="Add your own item"
              onChange={(e) => setNewItem(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addTypedItem()
                }
              }}
              className="h-8 min-w-[10rem] flex-1 text-sm"
            />
            <button
              type="button"
              data-testid="compass-add-item"
              onClick={addTypedItem}
              disabled={!newItem.trim() || customItems.length >= MAX_CUSTOM_ITEMS}
              className="h-8 shrink-0 rounded-full bg-primary px-3.5 text-xs font-semibold text-primary-foreground transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              + Add
            </button>
          </div>

          {/* Tabs */}
          <div
            className="mt-4 flex gap-1 border-b border-border overflow-x-auto"
            role="tablist"
            data-testid="compass-tool-tabs"
          >
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={tab === t.key}
                data-testid={`compass-tab-${t.key}`}
                onClick={() => setTab(t.key)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm whitespace-nowrap border-b-2 -mb-px transition-colors cursor-pointer',
                  tab === t.key
                    ? 'border-primary text-primary font-semibold'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                <t.icon className="w-3.5 h-3.5 shrink-0" />
                {t.label}
              </button>
            ))}
          </div>

          {emptyList && (
            <p className="mt-4 text-sm text-muted-foreground">
              Your list is empty - write what you buy into the box above (press Enter or + Add) and
              the tools price it from real posts where the community has them.
            </p>
          )}

          {/* ============================= RESEARCH ============================= */}
          {tab === 'research' && !emptyList && (
            <div className="mt-4">
              <p className="text-xs text-muted-foreground">
                You are planning to visit {myShort}
                {visitSpan ? ` ${visitSpan}` : ''}.
              </p>
              {myTotals ? (
                <>
                  <p className="text-base sm:text-lg font-semibold text-foreground mt-1">
                    Here are {researchRows.length} prices posted recently for the {chosenNames.length}{' '}product{chosenNames.length !== 1 ? 's' : ''} on your list.
                  </p>
                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                    <div className="mt-5">
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
                    className="mt-4 pt-3 border-t border-dashed border-border flex items-center gap-2.5 flex-wrap text-sm text-muted-foreground"
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
                <p className="mt-3 text-sm text-muted-foreground">
                  None of your list items have prices at {myShort} yet - try another location below.
                </p>
              )}

              {/* People who posted these prices */}
              {researchRows.length > 0 && (
                <div className="mt-4">
                  <div className="flex gap-1.5 flex-wrap mb-1">
                    <button
                      type="button"
                      onClick={() => setItemFilter('all')}
                      aria-pressed={itemFilter === 'all'}
                      className={cn(chipBase, itemFilter === 'all' ? chipOn : chipOff)}
                    >
                      All items
                    </button>
                    {chosenNames.map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setItemFilter(n)}
                        aria-pressed={itemFilter === n}
                        className={cn(chipBase, itemFilter === n ? chipOn : chipOff)}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                  <div className="divide-y divide-border">
                    {(showAll ? researchRows : researchRows.slice(0, RESEARCH_ROWS)).map((r) => {
                      const trusted = (r.post.author?.localPostCount ?? 0) > TRUSTED_POSTS
                      return (
                        <div
                          key={r.post.id}
                          className="py-2.5 flex items-center gap-3 min-w-0"
                          data-testid="compass-post-row"
                        >
                          <div className="w-9 h-9 rounded-full bg-primary/10 text-primary grid place-items-center font-bold shrink-0">
                            {(r.post.author?.name || '?').charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-foreground truncate flex items-center gap-1.5">
                              <span className="truncate">{r.post.author?.name || 'Community member'}</span>
                              {trusted && (
                                <span className="shrink-0 text-[10px] font-semibold text-primary">Trusted</span>
                              )}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {r.post.productName} at {r.place.split(',')[0]} &middot; {agoDays(r.days)} &middot;{' '}
                              {r.post.author?.localPostCount ?? 1} posts
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm font-bold text-foreground">{money(r.price, cur)}</p>
                            {r.lowest && (
                              <span className="inline-block mt-0.5 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 px-1.5 text-[10px] font-semibold">
                                Lowest
                              </span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  {researchRows.length > RESEARCH_ROWS && (
                    <button
                      type="button"
                      onClick={() => setShowAll(!showAll)}
                      className="mt-2 w-full rounded-lg border border-border py-2 text-xs font-semibold text-primary hover:bg-primary/10 transition-colors cursor-pointer"
                    >
                      {showAll ? 'Show fewer' : `Show all ${researchRows.length} posts`}
                    </button>
                  )}
                </div>
              )}

              <div className="mt-4 rounded-xl bg-emerald-500/10 border border-border p-3.5 flex items-start gap-2">
                <Lightbulb className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <p className="text-xs sm:text-sm text-foreground">
                  {mover && mover.ch >= 5
                    ? `${mover.name} is up ${mover.ch}% this month. Budget toward the higher end and compare a few stalls.`
                    : 'Prices on your list are steady. Aim near the lowest price and haggle from there.'}
                </p>
              </div>
            </div>
          )}

          {/* ======================= COMPARE BY LOCATION ======================= */}
          {tab === 'compare' && !emptyList && (
            <div className="mt-4">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                Type the locations to compare - places the community posted snap in, anything
                else gets an honest empty column.
              </p>
              {/* Type your own compare location - Enter or the + Compare
                  button. Nothing is offered as an option: every column in
                  the table below was written by the user. */}
              <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                <Input
                  type="text"
                  maxLength={80}
                  placeholder="Type a location to compare (e.g. Bole, Addis Ababa)"
                  value={cmpDraft}
                  data-testid="compass-cmp-input"
                  aria-label="Location to compare"
                  onChange={(e) => setCmpDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addCmpPlace()
                    }
                  }}
                  className="h-8 min-w-[10rem] flex-1 text-sm"
                />
                <button
                  type="button"
                  data-testid="compass-cmp-add"
                  onClick={addCmpPlace}
                  disabled={!cmpDraft.trim() || cmpList.length >= MAX_CMP_PLACES}
                  className="h-8 shrink-0 rounded-full bg-primary px-3.5 text-xs font-semibold text-primary-foreground transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  + Compare
                </button>
              </div>
              {cmpList.length >= MAX_CMP_PLACES && (
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  Up to {MAX_CMP_PLACES} locations at once keeps the table walkable - remove one
                  to add another.
                </p>
              )}
              {/* The typed compare columns - ONLY what the user wrote. A
                  typed name that matched a community place snapped onto it,
                  so a chip either carries real prices or stays honest. */}
              {cmpList.length > 0 && (
                <div className="mt-1.5 flex gap-1.5 flex-wrap">
                  {cmpList.map((key) => {
                    const known = model?.places.find((p) => p.key === key)
                    return (
                      <span
                        key={key}
                        data-testid="compass-cmp-chip"
                        title={
                          known
                            ? `${known.count} price post${known.count !== 1 ? 's' : ''}`
                            : 'Typed by you - its column stays empty until the community posts prices there'
                        }
                        className={cn(chipBase, 'inline-flex items-center gap-1.5', chipOn)}
                      >
                        {shortOf(key)}
                        <button
                          type="button"
                          data-testid="compass-cmp-chip-remove"
                          aria-label={`Remove ${shortOf(key)} from the comparison`}
                          onClick={() => removeCmpPlace(key)}
                          className="cursor-pointer opacity-70 hover:opacity-100"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    )
                  })}
                </div>
              )}

              {cmpSel.length < 2 ? (
                <p className="mt-4 text-sm text-muted-foreground">
                  Type at least two locations above to see them side by side.
                </p>
              ) : (
                <>
                  <div className="mt-3 overflow-x-auto" data-testid="compass-compare-table">
                    <table className="w-full min-w-[520px] border-collapse text-sm">
                      <thead>
                        <tr>
                          <th className="text-left font-medium text-[11px] uppercase tracking-wide text-muted-foreground py-2 pr-2">
                            Item
                          </th>
                          {cmpSel.map((pl) => (
                            <th key={pl.key} className="py-2 px-2 text-right">
                              <button
                                type="button"
                                data-testid="compass-place-head"
                                data-sel={pl.key === myPlace}
                                title={
                                  pl.count > 0
                                    ? 'Use as my location'
                                    : 'Use as my location - no community prices posted here yet'
                                }
                                onClick={() => setMyPlace(pl.key)}
                                className={cn(
                                  'text-xs cursor-pointer hover:underline underline-offset-2',
                                  pl.key === myPlace
                                    ? 'text-primary font-bold'
                                    : 'text-muted-foreground font-medium hover:text-foreground',
                                )}
                              >
                                {pl.short}
                              </button>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {cmpRows.map((r) => (
                          <tr key={r.name} className="border-t border-border">
                            <td className="py-2.5 pr-2 text-left">
                              <span className="font-medium text-foreground">{r.name}</span>
                              <span className="text-[11px] text-muted-foreground ml-1.5">
                                {r.count} post{r.count !== 1 ? 's' : ''}
                              </span>
                            </td>
                            {r.cells.map((c, i) => {
                              const cheap = c != null && r.minAv != null && c.av === r.minAv
                              return (
                                <td
                                  key={i}
                                  data-testid="compass-compare-cell"
                                  data-cheap={cheap ? 'true' : undefined}
                                  className={cn('py-2.5 px-2 text-right whitespace-nowrap', cheapClass(cheap))}
                                >
                                  {c ? money(c.av, cur) : '-'}
                                </td>
                              )
                            })}
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-border">
                          <td className="py-2.5 pr-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                            Your list (with quantities)
                          </td>
                          {cmpTotals.map((t, i) => {
                            const cheap = t != null && minTotal != null && t.av === minTotal
                            return (
                              <td
                                key={i}
                                data-testid="compass-compare-total"
                                data-cheap={cheap ? 'true' : undefined}
                                className={cn('py-2.5 px-2 text-right whitespace-nowrap', cheapClass(cheap))}
                              >
                                {t ? money(t.av, cur) : '-'}
                              </td>
                            )
                          })}
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Tap a location name to make it your shopping location.
                  </p>
                  <div className="mt-3 rounded-xl bg-emerald-500/10 border border-border p-3.5 flex items-start gap-2">
                    <Lightbulb className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                    <p className="text-xs sm:text-sm text-foreground">
                      {bestPlace && bestPlace.key === myPlace ? (
                        <>
                          <b>{bestPlace.short}</b> is the cheapest of the locations you picked.
                        </>
                      ) : bestPlace && savings > 0 ? (
                        <>
                          Among these locations your list is cheapest in <b>{bestPlace.short}</b>, about{' '}
                          <b>{money(savings, cur)}</b> less than {myShort}.
                        </>
                      ) : (
                        <>Compare more items or locations to find the cheapest run.</>
                      )}
                    </p>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ========================== PLAN MY BUDGET ========================= */}
          {tab === 'budget' && !emptyList && (
            <div className="mt-4">
              <div>
                <span className="block text-xs font-medium text-muted-foreground mb-1.5">
                  Where will you buy?
                </span>
                <div className="flex items-stretch gap-2 flex-wrap">
                  <Input
                    type="text"
                    maxLength={80}
                    placeholder="Type a location (e.g. Bole, Addis Ababa)"
                    value={placeDraft ?? myPlace}
                    data-testid="compass-place-input"
                    aria-label="Your shopping location"
                    onChange={(e) => {
                      setPlaceDraft(e.target.value)
                      setLocError('')
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        applyPlace()
                      }
                    }}
                    onBlur={applyPlace}
                    className="h-10 flex-1 min-w-[10rem]"
                  />
                  <button
                    type="button"
                    data-testid="compass-place-set"
                    onClick={applyPlace}
                    disabled={placeDraft == null || !placeDraft.trim()}
                    className="h-10 shrink-0 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Set
                  </button>
                  <button
                    type="button"
                    data-testid="compass-use-device"
                    onClick={useDeviceLocation}
                    disabled={locating}
                    className="h-10 shrink-0 rounded-lg border border-input bg-card px-3.5 text-sm font-medium text-foreground transition-colors hover:border-primary/40 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
                  >
                    {locating ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <MapPin className="w-3.5 h-3.5" />
                    )}
                    {locating ? 'Locating…' : 'Use my location'}
                  </button>
                </div>
                {locError && (
                  <p
                    className="mt-1.5 text-xs text-amber-600 dark:text-amber-400"
                    data-testid="compass-loc-error"
                  >
                    {locError}
                  </p>
                )}
                {model && myPlace && !model.places.some((p) => p.key === myPlace) && (
                  <p
                    className="mt-1.5 text-xs text-muted-foreground"
                    data-testid="compass-place-unknown"
                  >
                    No community prices for {myShort} yet - the tools stay honest (no invented
                    numbers) until someone posts there. Known places snap in automatically when
                    the name matches.
                  </p>
                )}
              </div>

              <div className="mt-3 divide-y divide-border rounded-xl border border-border">
                {chosenNames.map((name) => {
                  const s = model!.per(name, myPlace)
                  return (
                    <div key={name} className="p-3 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">{name}</p>
                        <p className="text-xs text-muted-foreground">
                          {s
                            ? `typical ${money(s.av, cur)} in ${myShort}`
                            : 'no prices posted here yet'}
                        </p>
                      </div>
                      <label className="text-right shrink-0">
                        <span className="block text-[10px] text-muted-foreground mb-0.5">Quantity</span>
                        <Input
                          type="number"
                          min={0}
                          max={99}
                          value={qty[name] ?? 1}
                          data-testid="compass-qty"
                          aria-label={`Quantity of ${name}`}
                          onChange={(e) =>
                            setQty((q) => ({ ...q, [name]: Math.max(0, parseInt(e.target.value) || 0) }))
                          }
                          className="h-9 w-20 text-right"
                        />
                      </label>
                    </div>
                  )
                })}
              </div>

              {/* v112: the budget input is the user's entry point to Plan my
                  budget - it renders as long as the list is non-empty, even
                  when the given location has no prices for it (myTotals
                  null). Hiding the INPUT behind price data made the tool
                  unusable exactly where community data is sparse: no input,
                  no locator, nothing to fill. The planning NUMBERS still
                  need real prices; the input never disappears. */}
              <div className="mt-5">
                <span className="block text-xs font-medium text-muted-foreground mb-1.5">
                  Your budget
                </span>
                <div className="flex items-stretch gap-2 flex-wrap">
                  <Input
                    type="text"
                    inputMode="decimal"
                    placeholder={`Your budget for ${myShort}, written by hand (optional)`}
                    value={budget}
                    data-testid="compass-budget-input"
                    onChange={(e) => setBudget(e.target.value)}
                    className="h-10 flex-1 min-w-[10rem]"
                  />
                  {/* The currency is WRITTEN too - no preset options. A code
                      the community has posted snaps in case-insensitively;
                      anything unknown keeps the real numbers on screen. */}
                  <Input
                    type="text"
                    maxLength={8}
                    placeholder="Currency (e.g. ETB)"
                    value={currencyDraft ?? (currency || cur)}
                    data-testid="compass-currency-input"
                    aria-label="Currency type"
                    onChange={(e) => setCurrencyDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        applyCurrency()
                      }
                    }}
                    onBlur={applyCurrency}
                    className="h-10 w-28 shrink-0 uppercase"
                  />
                  <button
                    type="button"
                    data-testid="compass-currency-set"
                    onClick={applyCurrency}
                    disabled={currencyDraft == null || !currencyDraft.trim()}
                    className="h-10 shrink-0 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Set
                  </button>
                </div>
                {model && currency && !model.currencies.includes(currency) && (
                  <p
                    className="mt-1.5 text-xs text-amber-600 dark:text-amber-400"
                    data-testid="compass-currency-unknown"
                  >
                    No community prices in {currency} yet - the tools keep showing real prices in{' '}
                    {cur || 'the community currency'} and never invent exchange rates. A known
                    code snaps in automatically when the name matches.
                  </p>
                )}
              </div>
              {myTotals && safe != null ? (
                <>
                  <h4 className="mt-5 text-sm font-bold text-foreground">
                    What to set aside for {myShort}
                  </h4>
                  <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="border-l-4 border-emerald-400 pl-3" data-testid="compass-budget-best">
                      <b className="block text-lg sm:text-xl font-bold tracking-tight text-foreground">
                        {money(myTotals.lo, cur)}
                      </b>
                      <span className="text-xs text-muted-foreground">Best case</span>
                    </div>
                    <div className="border-l-4 border-emerald-500 pl-3" data-testid="compass-budget-typical">
                      <b className="block text-lg sm:text-xl font-bold tracking-tight text-foreground">
                        {money(myTotals.av, cur)}
                      </b>
                      <span className="text-xs text-muted-foreground">Typical</span>
                    </div>
                    <div className="border-l-4 border-amber-500 pl-3" data-testid="compass-budget-worst">
                      <b className="block text-lg sm:text-xl font-bold tracking-tight text-foreground">
                        {money(myTotals.hi, cur)}
                      </b>
                      <span className="text-xs text-muted-foreground">Worst case</span>
                    </div>
                  </div>
                  <div className="mt-3 rounded-xl bg-emerald-500/10 border border-border p-3.5 flex items-start gap-2">
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
                </>
              ) : (
                <p
                  className="mt-3 text-sm text-muted-foreground"
                  data-testid="compass-budget-nodata"
                >
                  None of your list items have prices at {myShort} yet. Write your budget above -
                  the locator below still searches every community place for real prices for this
                  list, and the numbers here appear the moment prices are posted.
                </p>
              )}

              {/* Budget locator (v98): where the budget goes furthest.
                  Rendered whenever a budget is written - even when the
                  given location itself has no prices, because the point is
                  to LOCATE the best real price for this list. */}
              {budgetNum > 0 && budgetPlaces.length > 0 && (
                <div
                  className="mt-3 rounded-xl border border-border bg-primary/5 p-3.5"
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
                      Best price within your {money(budgetNum, cur)} budget:{' '}
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
                  {/* Ranked place list (v107, visible from one place v110):
                      every place with a real price for this list renders,
                      cheapest first, each row carrying the community's
                      HELPFUL votes - the user asked for lower price AND
                      many likes, so both live on every row and the
                      most-endorsed place wears a Most liked badge. The old
                      2+ gate hid the whole ranking behind sparse prod data
                      (one priced place), making v107 invisible there. */}
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
                      onClick={() => setMyPlace(budgetBest.key)}
                      className="mt-2 rounded-full border border-emerald-500/40 px-3 py-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 transition-colors cursor-pointer"
                    >
                      Shop at {budgetBest.short} instead
                    </button>
                  )}
                </div>
              )}
              {budgetNum > 0 && budgetPlaces.length === 0 && (
                <p
                  className="mt-3 text-sm text-muted-foreground"
                  data-testid="compass-budget-locate-empty"
                >
                  No community prices for this list ({chosenNames.slice(0, 3).join(', ')}
                  {chosenNames.length > 3 ? ` +${chosenNames.length - 3} more` : ''}) in{' '}
                  {cur || 'any currency'} yet - post a price and the budget locator will find
                  where your budget goes furthest.
                </p>
              )}

              <h4 className="mt-5 text-sm font-bold text-foreground flex items-center gap-1.5">
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
                          onClick={() => setMyPlace(o.key)}
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
          )}
        </>
      )}
    </Card>
  )
}

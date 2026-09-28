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
 *   Compare by location - pick any locations and see item and whole-list
 *                         typical prices side by side, cheapest highlighted,
 *                         tap a header to adopt that place.
 *   Plan my budget      - set quantities, see best / typical / worst totals,
 *                         the safe amount to set aside, a verdict on a
 *                         budget and cheaper alternatives elsewhere.
 *
 * Data honesty rules (same as the market graph panel):
 *   - a post's price = recommendedPrice when set, else the midpoint of its
 *     priceMin..priceMax range
 *   - locations group by "city, country"; currencies never mix - the tools
 *     run on the dominant currency and a chip switches when others exist
 *   - sparse data renders honestly (n=1 rows render; missing item/place
 *     combos stay blank in the table, never invented)
 *
 * Design follows the compass/ prototype (repo root) adapted to the app
 * theme: theme tokens only (dark + light safe), wrapping chips and a
 * horizontally scrollable table on phones.
 */

import { useEffect, useMemo, useState } from 'react'
import {
  ArrowRightLeft, Coins, Compass, Lightbulb, Loader2, MapPin, Scale,
  SearchCheck, TrendingDown, TrendingUp, Wallet,
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

const VISIT_DAYS = ['Tomorrow', 'This weekend', 'Next week']

const LIST_CHIP_LIMIT = 8 // shopping-list choices (most-posted products)
const RESEARCH_ROWS = 6 // post rows before "Show all"
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
  const [visitDay, setVisitDay] = useState(VISIT_DAYS[0])
  const [onItems, setOnItems] = useState<Record<string, boolean>>({})
  const [qty, setQty] = useState<Record<string, number>>({})
  const [myPlace, setMyPlace] = useState('')
  const [cmpPlaces, setCmpPlaces] = useState<Record<string, boolean>>({})
  const [itemFilter, setItemFilter] = useState('all')
  const [showAll, setShowAll] = useState(false)
  const [budget, setBudget] = useState('')

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

    // Currencies never mix - dominant first, chip-switchable.
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
      per,
      totals,
      trendOf,
      priceOf,
      placeOf,
      inCur,
    }
  }, [posts, currency])

  // First data -> default picks: busiest place, top items on, top-3 compare.
  useEffect(() => {
    if (!model) return
    if (!currency && model.currencies.length) setCurrency(model.currencies[0])
    const top = model.items.slice(0, 4).map((i) => i.name)
    setOnItems((prev) => {
      const next = { ...prev }
      top.forEach((n) => {
        if (!(n in next)) next[n] = true
      })
      return next
    })
    setQty((prev) => {
      const next = { ...prev }
      top.forEach((n) => {
        if (!(n in next)) next[n] = 1
      })
      return next
    })
    setMyPlace((prev) => prev || model.places[0]?.key || '')
    setCmpPlaces((prev) => {
      if (Object.keys(prev).length) return prev
      const next: Record<string, boolean> = {}
      model.places.slice(0, 3).forEach((p) => {
        next[p.key] = true
      })
      return next
    })
  }, [model, currency])

  const toggleItem = (name: string) => {
    setOnItems((prev) => ({ ...prev, [name]: !prev[name] }))
    if (itemFilter === name) setItemFilter('all')
  }

  const toggleCmp = (key: string) => {
    setCmpPlaces((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const chosenKey = model
    ? model.items
        .filter((i) => onItems[i.name])
        .map((i) => i.name)
        .join('|')
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

  // Compare: selected places, per-item cells, totals row, cheapest insight.
  const cmpSel = model ? model.places.filter((p) => cmpPlaces[p.key]) : []
  const cmpRows =
    model && !emptyList
      ? chosenNames.map((name) => {
          const cells = cmpSel.map((pl) => model.per(name, pl.key))
          const defined = cells.filter(Boolean) as ItemStats[]
          const minAv = defined.length ? Math.min(...defined.map((c) => c.av)) : null
          const count = model.items.find((i) => i.name === name)?.count ?? 0
          return { name, count, cells, minAv }
        })
      : []
  const cmpTotals = model && !emptyList ? cmpSel.map((pl) => model.totals(pl.key, chosenNames, qty)) : []
  const definedTotals = cmpTotals.filter(Boolean) as ItemStats[]
  const minTotal = definedTotals.length ? Math.min(...definedTotals.map((t) => t.av)) : null
  const bestIdx = minTotal != null ? cmpTotals.findIndex((t) => t && t.av === minTotal) : -1
  const bestPlace = bestIdx >= 0 ? cmpSel[bestIdx] : null
  const savings = myTotals && minTotal != null ? myTotals.av - minTotal : 0

  // Budget: safe estimate = typical + half the gap to the worst case.
  const safe =
    myTotals
      ? Math.ceil((myTotals.av + (myTotals.hi - myTotals.av) / 2) / SAFE_ROUND_TO) * SAFE_ROUND_TO
      : null
  const budgetNum = parseFloat(budget)
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
          {/* Currency switch (only when posts mix currencies) */}
          {model.currencies.length > 1 && (
            <div className="mt-3 flex items-center gap-1.5 flex-wrap" data-testid="compass-currencies">
              <Coins className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              {model.currencies.slice(0, 6).map((c) => (
                <button
                  key={c}
                  type="button"
                  data-testid="compass-currency"
                  aria-pressed={c === cur}
                  onClick={() => setCurrency(c)}
                  className={cn(chipBase, c === cur ? chipOn : chipOff)}
                >
                  {c}
                </button>
              ))}
            </div>
          )}

          {/* Shopping list + visit day */}
          <div className="mt-3 flex items-center justify-between gap-2 flex-wrap">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Your shopping list
            </p>
            <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <MapPin className="w-3 h-3 shrink-0" />
              Visiting
              <select
                value={visitDay}
                onChange={(e) => setVisitDay(e.target.value)}
                data-testid="compass-visit-day"
                className="h-7 rounded-md border border-input bg-card px-1.5 text-[11px] text-foreground"
              >
                {VISIT_DAYS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="mt-1.5 flex gap-1.5 flex-wrap">
            {model.items.map((i) => (
              <button
                key={i.name}
                type="button"
                data-testid="compass-chip"
                aria-pressed={!!onItems[i.name]}
                title={`${i.count} price post${i.count !== 1 ? 's' : ''}`}
                onClick={() => toggleItem(i.name)}
                className={cn(chipBase, onItems[i.name] ? chipOn : chipOff)}
              >
                {i.name}
              </button>
            ))}
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
            <p className="mt-4 text-sm text-muted-foreground">Pick at least one item from your list.</p>
          )}

          {/* ============================= RESEARCH ============================= */}
          {tab === 'research' && !emptyList && (
            <div className="mt-4">
              <p className="text-xs text-muted-foreground">
                You are planning to visit {myShort} {visitDay.toLowerCase()}.
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
                Choose the locations to compare.
              </p>
              <div className="mt-2 flex gap-1.5 flex-wrap">
                {model!.places.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    data-testid="compass-place-chip"
                    aria-pressed={!!cmpPlaces[p.key]}
                    title={`${p.count} price post${p.count !== 1 ? 's' : ''}`}
                    onClick={() => toggleCmp(p.key)}
                    className={cn(chipBase, cmpPlaces[p.key] ? chipOn : chipOff)}
                  >
                    {p.short}
                  </button>
                ))}
              </div>

              {cmpSel.length < 2 ? (
                <p className="mt-4 text-sm text-muted-foreground">
                  Select at least two locations to see them side by side.
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
                                title="Use as my location"
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
              <label className="block">
                <span className="block text-xs font-medium text-muted-foreground mb-1.5">
                  Where will you buy?
                </span>
                <select
                  value={myPlace}
                  onChange={(e) => setMyPlace(e.target.value)}
                  data-testid="compass-place-select"
                  className="h-9 w-full sm:w-80 rounded-lg border border-input bg-card px-3 text-sm text-foreground"
                >
                  {model!.places.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.key}
                    </option>
                  ))}
                </select>
              </label>

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

              <h4 className="mt-5 text-sm font-bold text-foreground">
                What to set aside for {myShort}
              </h4>
              {myTotals && safe != null ? (
                <>
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
                      To shop in {myPlace} {visitDay.toLowerCase()}, bring at least{' '}
                      <b data-testid="compass-safe-budget">{money(safe, cur)}</b>. That is the typical
                      total plus half the gap to the highest prices.
                    </p>
                  </div>
                  <div className="mt-3">
                    <Input
                      type="number"
                      min={0}
                      placeholder={`Your budget for ${myShort} in ${cur} (optional)`}
                      value={budget}
                      data-testid="compass-budget-input"
                      onChange={(e) => setBudget(e.target.value)}
                      className="h-10"
                    />
                    {verdict && (
                      <p className="mt-2.5 text-sm text-foreground" data-testid="compass-budget-verdict">
                        {verdict}
                      </p>
                    )}
                  </div>
                </>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">
                  None of your list items have prices at {myShort} yet - pick another place above.
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

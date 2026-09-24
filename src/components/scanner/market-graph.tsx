'use client'

import { useEffect, useRef, useState } from 'react'
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { BarChart3, Loader2, MapPin, Navigation, Search, X } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { ResolvedLocation } from '@/lib/location'

// ============================================================================
// MARKET GRAPH PANEL - the scan experience, completely graph-based.
// Two charts, both built ONLY from real price posts on circub:
//   1. Prices by item   - what things cost at the picked place (typical price
//                         per product, labeled with its currency)
//   2. Places view      - with an item typed: what that item costs in each
//                         place; without one: where the market is busiest
// Location comes from the auto-detected GPS/IP location by default and can
// be overridden with the country/city controls, so a tourist can look at
// any market before they go.
// ============================================================================

interface MarketItem {
  name: string
  currency: string
  count: number
  min: number
  typical: number
  max: number
}

interface MarketPlace {
  label: string
  city: string | null
  country: string
  currency: string | null
  count: number
  min: number | null
  typical: number | null
  max: number | null
  topItem?: string
}

interface MarketGraphData {
  place: { city: string | null; country: string; label: string } | null
  query: string | null
  items: MarketItem[]
  places: MarketPlace[]
}

interface MarketGraphPanelProps {
  userLocation: ResolvedLocation | null
  countries: string[]
  onKickLocation: () => void
  onClose: () => void
}

// Axis labels get tight - shorten, keep the full name in the tooltip.
function shortName(name: string, max = 13): string {
  return name.length > max ? name.slice(0, max - 1).trimEnd() + '\u2026' : name
}

function fmtNum(n: number): string {
  return n.toLocaleString('en-US')
}

// recharts LabelList `content` prop shape - x/y/width/height + index.
interface LabelProps {
  x?: number | string
  y?: number | string
  width?: number | string
  height?: number | string
  index?: number
}

export function MarketGraphPanel({ userLocation, countries, onKickLocation, onClose }: MarketGraphPanelProps) {
  const [city, setCity] = useState('')
  const [country, setCountry] = useState('')
  const [q, setQ] = useState('')
  const [data, setData] = useState<MarketGraphData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Auto-load once on mount with the best-known location; when the GPS/IP
  // location resolves a moment later, adopt it too (unless the user already
  // picked a place manually).
  const autoRanRef = useRef(false)
  const manualPickRef = useRef(false)
  const lastFetchRef = useRef('')

  const effectiveLocation = (): { country: string; city: string } => {
    if (manualPickRef.current || country || city.trim()) {
      return { country, city: city.trim() }
    }
    if (userLocation?.country) {
      return { country: userLocation.country, city: userLocation.city || '' }
    }
    return { country: '', city: '' }
  }

  async function fetchGraph(loc: { country: string; city: string }, query: string) {
    const key = JSON.stringify([loc.country, loc.city, query.trim()])
    if (key === lastFetchRef.current && data) return
    lastFetchRef.current = key
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (loc.country) params.set('country', loc.country)
      if (loc.city) params.set('city', loc.city)
      if (query.trim()) params.set('q', query.trim())
      const res = await fetch(`/api/market-graph?${params.toString()}`, { signal: AbortSignal.timeout(20_000) })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || `Market graph failed (${res.status})`)
      setData(json as MarketGraphData)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not build the market graph. Try again.')
    } finally {
      setLoading(false)
    }
  }

  // First paint: run immediately with whatever we know (auto location or
  // worldwide) so the panel is never empty while GPS resolves.
  useEffect(() => {
    if (autoRanRef.current) return
    autoRanRef.current = true
    void fetchGraph(effectiveLocation(), q)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The auto location resolving AFTER first paint: adopt it once.
  useEffect(() => {
    if (!manualPickRef.current && userLocation?.country && !lastFetchRef.current.startsWith(JSON.stringify([userLocation.country, userLocation.city || '']))) {
      void fetchGraph({ country: userLocation.country, city: userLocation.city || '' }, '')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userLocation?.country, userLocation?.city])

  const runSearch = () => {
    // Keep the place the graph is ALREADY showing (auto-detected or picked)
    // when only the item changes - typing "coffee beans" must not silently
    // jump the market to worldwide. Place inputs win when the user typed one.
    const pickedPlace = !!country || !!city.trim()
    const loc = pickedPlace
      ? { country, city: city.trim() }
      : data?.place
        ? { country: data.place.country, city: data.place.city || '' }
        : effectiveLocation()
    if (pickedPlace) manualPickRef.current = true
    void fetchGraph(loc, q)
  }

  const useMyLocation = () => {
    manualPickRef.current = false
    setCity('')
    setCountry('')
    onKickLocation()
    const loc = userLocation?.country ? { country: userLocation.country, city: userLocation.city || '' } : { country: '', city: '' }
    void fetchGraph(loc, q)
  }

  const clearItem = () => {
    setQ('')
    void fetchGraph(effectiveLocation(), '')
  }

  const items = data?.items ?? []
  const places = data?.places ?? []
  const hasQuery = !!data?.query
  const placeLabel = data?.place ? data.place.label : 'the worldwide market'

  // Cheapest highlight: with an item query the best place wins; without one
  // the best-priced item at this place does.
  const cheapestPlace = hasQuery
    ? places.filter((p) => p.typical !== null).sort((a, b) => (a.typical || 0) - (b.typical || 0))[0] ?? null
    : null
  const cheapestItem = !hasQuery
    ? items.slice().sort((a, b) => a.typical - b.typical)[0] ?? null
    : null

  // Bar-end label renderers. recharts LabelList passes the datum through
  // `content`, so the label can use the PER-BAR currency (never a shared
  // axis currency - the posts speak for themselves).
  const renderItemLabel = (props: LabelProps) => {
    const it = items[props.index ?? 0]
    if (!it) return null
    const x = Number(props.x ?? 0) + Number(props.width ?? 0) + 6
    const y = Number(props.y ?? 0) + Number(props.height ?? 0) / 2
    return (
      <text x={x} y={y} dy={3.5} fontSize={10} fill="#065f46" fontWeight={600}>
        {it.currency} {fmtNum(it.typical)}
      </text>
    )
  }
  renderItemLabel.displayName = 'MarketItemLabel'

  const renderPlaceLabel = (props: LabelProps) => {
    const p = places[props.index ?? 0]
    if (!p) return null
    const x = Number(props.x ?? 0) + Number(props.width ?? 0) + 6
    const y = Number(props.y ?? 0) + Number(props.height ?? 0) / 2
    const text = hasQuery && p.typical !== null && p.currency
      ? `${p.currency} ${fmtNum(p.typical)}`
      : `${p.count} post${p.count !== 1 ? 's' : ''}`
    return (
      <text x={x} y={y} dy={3.5} fontSize={10} fill="#134e4a" fontWeight={600}>
        {text}
      </text>
    )
  }
  renderPlaceLabel.displayName = 'MarketPlaceLabel'

  return (
    <Card className="w-full p-3 sm:p-4 shadow-sm border-emerald-500/40 space-y-3" data-testid="market-panel">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
          <BarChart3 className="w-4 h-4 text-emerald-600" /> Market graph
        </p>
        <button onClick={onClose} className="p-1 rounded hover:bg-accent text-muted-foreground" aria-label="Close market graph" data-testid="market-close">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Location + item controls - same pattern as the budget panel */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={useMyLocation}
          className="gap-1.5 h-9 shrink-0"
          title="Graph the market at the auto-detected current location"
          data-testid="market-my-location"
        >
          <Navigation className="w-3.5 h-3.5" /> My location
        </Button>
        <Select
          value={country || 'any'}
          onValueChange={(v) => { setCountry(v === 'any' ? '' : v); manualPickRef.current = true }}
        >
          <SelectTrigger className="w-[150px] sm:w-[160px] bg-card h-9 text-sm" data-testid="market-country">
            <SelectValue placeholder="Any country" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any country</SelectItem>
            {countries.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input
          value={city}
          onChange={(e) => setCity(e.target.value)}
          placeholder="City (optional)"
          className="w-[130px] sm:w-[150px] h-9 bg-card text-sm"
          data-testid="market-city"
        />
        <form
          onSubmit={(e) => { e.preventDefault(); runSearch() }}
          className="flex items-center gap-2 flex-1 min-w-[200px]"
        >
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Item to graph (e.g. coffee beans)..."
            className="flex-1 min-w-[140px] h-9 bg-card text-sm"
            data-testid="market-item-input"
          />
          <Button type="submit" size="sm" disabled={loading} className="bg-emerald-600 hover:bg-emerald-700 gap-1.5 h-9 shrink-0" data-testid="market-graph-go" title="Draw the market graph for this item and place">
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />} Graph it
          </Button>
        </form>
      </div>

      <p className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap" data-testid="market-place-label">
        <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
        Market: <span className="font-medium text-emerald-700">{placeLabel}</span>
        {hasQuery && (
          <>
            <span aria-hidden="true">&middot;</span>
            item: <span className="font-medium text-emerald-700">{data?.query}</span>
            <button onClick={clearItem} className="text-muted-foreground hover:text-emerald-700 underline-offset-2 hover:underline" aria-label="Clear item">clear</button>
          </>
        )}
      </p>

      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}

      {loading && !data && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground" data-testid="market-loading">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-600" /> Graphing the market&hellip;
        </p>
      )}

      {data && (
        <>
          {/* Chart 1 - prices by item at the picked place */}
          <div className="space-y-1" data-testid="market-chart-items">
            <p className="text-[10px] font-medium uppercase tracking-wider text-emerald-700/80">Prices by item &middot; typical price</p>
            {items.length === 0 ? (
              <p className="text-xs text-muted-foreground py-3">No price posts here yet{hasQuery ? ' for this item' : ''} - be the first to post one and the graph starts.</p>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(90, items.length * 34 + 24)}>
                <BarChart data={items} layout="vertical" margin={{ top: 4, right: 92, bottom: 0, left: 0 }}>
                  <CartesianGrid horizontal={false} stroke="#e5e7eb" strokeDasharray="3 3" />
                  <XAxis type="number" tick={{ fontSize: 10, fill: '#71717a' }} axisLine={false} tickLine={false} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={104}
                    tick={{ fontSize: 10, fill: '#3f3f46' }}
                    tickFormatter={(v: string) => shortName(v)}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: 'rgba(5, 150, 105, 0.06)' }}
                    formatter={(value: unknown, _name: unknown, entry: { payload?: MarketItem }) => {
                      const p = entry?.payload
                      if (!p) return ['', '']
                      return [`${p.currency} ${fmtNum(p.min)} - ${fmtNum(p.max)} (${p.count} post${p.count !== 1 ? 's' : ''})`, p.name]
                    }}
                    labelFormatter={(_label: unknown, payload: Array<{ payload?: MarketItem }>) => payload?.[0]?.payload?.name ?? ''}
                  />
                  <Bar dataKey="typical" fill="#059669" radius={[0, 4, 4, 0]} barSize={16}>
                    <LabelList content={renderItemLabel} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Chart 2 - the item across places, or where the market is busiest */}
          <div className="space-y-1" data-testid="market-chart-places">
            <p className="text-[10px] font-medium uppercase tracking-wider text-emerald-700/80">
              {hasQuery ? `${data?.query} across places · all markets` : 'Where the market is busiest · all markets'}
            </p>
            {places.length === 0 ? (
              <p className="text-xs text-muted-foreground py-3">No places to chart yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(90, places.length * 34 + 24)}>
                <BarChart data={places} layout="vertical" margin={{ top: 4, right: 92, bottom: 0, left: 0 }}>
                  <CartesianGrid horizontal={false} stroke="#e5e7eb" strokeDasharray="3 3" />
                  <XAxis type="number" tick={{ fontSize: 10, fill: '#71717a' }} axisLine={false} tickLine={false} />
                  <YAxis
                    type="category"
                    dataKey="label"
                    width={104}
                    tick={{ fontSize: 10, fill: '#3f3f46' }}
                    tickFormatter={(v: string) => shortName(v, 14)}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: 'rgba(5, 150, 105, 0.06)' }}
                    formatter={(value: unknown, _name: unknown, entry: { payload?: MarketPlace }) => {
                      const p = entry?.payload
                      if (!p) return ['', '']
                      if (hasQuery && p.typical !== null && p.currency) {
                        return [`${p.currency} ${fmtNum(p.min || 0)} - ${fmtNum(p.max || 0)} (${p.count} post${p.count !== 1 ? 's' : ''})`, data?.query || '']
                      }
                      return [`${p.count} post${p.count !== 1 ? 's' : ''}${p.topItem ? ` - most: ${p.topItem}` : ''}`, p.label]
                    }}
                    labelFormatter={(_label: unknown, payload: Array<{ payload?: MarketPlace }>) => payload?.[0]?.payload?.label ?? ''}
                  />
                  <Bar dataKey={hasQuery ? 'typical' : 'count'} fill="#0d9488" radius={[0, 4, 4, 0]} barSize={16}>
                    <LabelList content={renderPlaceLabel} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Cheapest highlight - the actionable line the graphs build to */}
          {(cheapestPlace || cheapestItem) && (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-900" data-testid="market-cheapest">
              {cheapestPlace
                ? <>Cheapest right now: <span className="font-semibold">{cheapestPlace.label}</span> at {cheapestPlace.currency} {fmtNum(cheapestPlace.min || 0)} - {fmtNum(cheapestPlace.max || 0)}</>
                : cheapestItem
                  ? <>Best price posted here: <span className="font-semibold">{cheapestItem.name}</span> at {cheapestItem.currency} {fmtNum(cheapestItem.min)}</>
                  : null}
            </p>
          )}

          <p className="text-[11px] text-muted-foreground">Every bar is real price posts on circub, typical = the middle price posted. The lower chart spans all markets on purpose - that is how you know before you go. Post a price and the graph grows.</p>
        </>
      )}
    </Card>
  )
}

'use client'

import { useState } from 'react'
import { MapPin, Loader2, RefreshCw, Globe, Wifi, Crosshair, Pencil, X, Check, Search } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { ResolvedLocation } from '@/lib/location'
import { cn } from '@/lib/utils'

interface LocationBarProps {
  location: ResolvedLocation | null
  detecting: boolean
  onRefresh: () => void
  /** Called when the user manually sets/edits the location. */
  onManualSet?: (loc: ResolvedLocation) => void
}

export function LocationBar({ location, detecting, onRefresh, onManualSet }: LocationBarProps) {
  const [editing, setEditing] = useState(false)
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)

  const label = location?.city
    ? `${location.city}${location.country ? ', ' + location.country : ''}`
    : location?.country
    ? location.country
    : null

  const isIp = location?.source === 'ip'
  const isGeo = location?.source === 'geolocation'
  const isManual = location?.source === 'manual'
  const hasCoords = location && location.lat !== 0 && location.lng !== 0

  const startEditing = () => {
    setEditing(true)
    setQuery(label || '')
    setSearchError(null)
  }
  const cancelEditing = () => {
    setEditing(false)
    setQuery('')
    setSearchError(null)
  }

  // Use OpenStreetMap Nominatim to geocode the typed query (free, no API key).
  const submitSearch = async () => {
    const q = query.trim()
    if (!q) {
      setSearchError('Type a city or country name.')
      return
    }
    setSearching(true)
    setSearchError(null)
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=en&q=${encodeURIComponent(q)}`
      const res = await fetch(url, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(8000),
      })
      if (!res.ok) throw new Error(`Search failed (${res.status})`)
      const data = (await res.json()) as Array<{
        lat: string; lon: string; name?: string
        address?: {
          city?: string; town?: string; village?: string; hamlet?: string
          state?: string; region?: string; country?: string; country_code?: string
        }
      }>
      if (!Array.isArray(data) || data.length === 0) {
        setSearchError(`No place called "${q}" was found. Try a city or country name.`)
        return
      }
      const hit = data[0]
      const a = hit.address || {}
      const city = a.city || a.town || a.village || a.hamlet || hit.name || null
      const resolved: ResolvedLocation = {
        city,
        region: a.state || a.region || null,
        country: a.country || null,
        countryCode: a.country_code ? a.country_code.toUpperCase() : null,
        lat: Number(hit.lat),
        lng: Number(hit.lon),
        source: 'manual',
      }
      onManualSet?.(resolved)
      setEditing(false)
      setQuery('')
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Search failed. Try again.')
    } finally {
      setSearching(false)
    }
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
      <AnimatePresence mode="wait" initial={false}>
        {editing ? (
          <motion.div
            key="editor"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="space-y-2"
          >
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                Set pricing location
              </p>
              <button
                onClick={cancelEditing}
                aria-label="Cancel"
                className="flex h-6 w-6 items-center justify-center rounded-md text-zinc-400 transition hover:bg-zinc-200 hover:text-zinc-700"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
                <Input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') void submitSearch(); if (e.key === 'Escape') cancelEditing() }}
                  placeholder="e.g. Addis Ababa, Tokyo, Paris…"
                  className="h-9 border-zinc-200 bg-white pl-8 pr-2 text-sm"
                  disabled={searching}
                />
              </div>
              <Button
                size="sm"
                onClick={() => void submitSearch()}
                disabled={searching}
                className="h-9 gap-1.5 bg-emerald-500 text-white hover:bg-emerald-400"
              >
                {searching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                {searching ? 'Searching' : 'Set'}
              </Button>
            </div>
            {searchError && (
              <p className="text-[11px] text-rose-500">{searchError}</p>
            )}
            <p className="text-[10px] leading-relaxed text-zinc-400">
              Type any city, town, or country. Prices will be scoped to that
              place. Powered by OpenStreetMap.
            </p>
          </motion.div>
        ) : (
          <motion.div
            key="display"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center justify-between gap-3"
          >
            <div className="flex min-w-0 items-center gap-3">
              <div
                className={cn(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border',
                  label ? 'border-emerald-500/30 bg-emerald-50 text-emerald-600' : 'border-zinc-200 bg-white text-zinc-400'
                )}
              >
                {detecting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : isGeo ? (
                  <Crosshair className="h-4 w-4" />
                ) : isManual ? (
                  <Pencil className="h-4 w-4" />
                ) : label ? (
                  <MapPin className="h-4 w-4" />
                ) : (
                  <Globe className="h-4 w-4" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">Pricing location</p>
                {detecting ? (
                  <motion.p key="detecting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="truncate text-sm text-zinc-600">
                    Detecting your location…
                  </motion.p>
                ) : label ? (
                  <motion.div key={label} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-medium text-zinc-900">{label}</span>
                    {isGeo && (
                      <span className="inline-flex items-center gap-0.5 shrink-0 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-medium text-emerald-700" title="Location detected via device GPS">
                        <Crosshair className="h-2.5 w-2.5" /> GPS
                      </span>
                    )}
                    {isIp && (
                      <span className="inline-flex items-center gap-0.5 shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-medium text-amber-700" title="Location detected via IP address (approximate). Click refresh for GPS, or tap the pencil to set manually.">
                        <Wifi className="h-2.5 w-2.5" /> IP
                      </span>
                    )}
                    {isManual && (
                      <span className="inline-flex items-center gap-0.5 shrink-0 rounded-full bg-purple-100 px-1.5 py-0.5 text-[9px] font-medium text-purple-700" title="You set this location manually">
                        <Pencil className="h-2.5 w-2.5" /> Manual
                      </span>
                    )}
                    {hasCoords && isGeo && (
                      <span className="hidden sm:inline text-[10px] text-zinc-400" title="GPS coordinates">
                        {location!.lat.toFixed(3)}°, {location!.lng.toFixed(3)}°
                      </span>
                    )}
                  </motion.div>
                ) : (
                  <p className="truncate text-sm text-zinc-500">Not set — prices will be worldwide</p>
                )}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {onManualSet && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={startEditing}
                  disabled={detecting}
                  className="h-7 px-2 text-zinc-400 hover:bg-zinc-100 hover:text-emerald-600"
                  title="Edit location manually"
                  aria-label="Edit location"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={onRefresh}
                disabled={detecting}
                className="h-7 px-2 text-zinc-400 hover:bg-zinc-100 hover:text-emerald-600"
                title="Detect location via GPS / IP"
                aria-label="Detect location"
              >
                <RefreshCw className={cn('h-3.5 w-3.5', detecting && 'animate-spin')} />
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

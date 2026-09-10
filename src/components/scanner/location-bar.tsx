'use client'

import { MapPin, Loader2, RefreshCw, Globe, Wifi, Crosshair, Edit2, Check, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import type { ResolvedLocation } from '@/lib/location'
import { cn } from '@/lib/utils'
import { useState, useCallback } from 'react'

interface LocationBarProps {
  location: ResolvedLocation | null
  detecting: boolean
  onRefresh: () => void
  /** Called when the user manually enters a location. */
  onManualLocation?: (city: string | null, country: string | null) => void
}

export function LocationBar({ location, detecting, onRefresh, onManualLocation }: LocationBarProps) {
  const [editing, setEditing] = useState(false)
  const [cityInput, setCityInput] = useState('')
  const [countryInput, setCountryInput] = useState('')

  const label = location?.city
    ? `${location.city}${location.country ? ', ' + location.country : ''}`
    : location?.country
    ? location.country
    : null

  const isIp = location?.source === 'ip'
  const isGeo = location?.source === 'geolocation'
  const isManual = location?.source === 'manual'
  const hasCoords = location && location.lat !== 0 && location.lng !== 0

  const handleSave = useCallback(() => {
    const city = cityInput.trim() || null
    const country = countryInput.trim() || null
    if (onManualLocation) {
      onManualLocation(city, country)
    }
    setEditing(false)
  }, [cityInput, countryInput, onManualLocation])

  const handleEdit = useCallback(() => {
    setCityInput(location?.city || '')
    setCountryInput(location?.country || '')
    setEditing(true)
  }, [location])

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
      <div className="flex min-w-0 items-center gap-3 flex-1">
        <div
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border',
            label ? 'border-emerald-500/30 bg-emerald-50 text-emerald-600' : 'border-zinc-200 bg-white text-zinc-400'
          )}
        >
          {detecting ? <Loader2 className="h-4 w-4 animate-spin" /> : isGeo ? <Crosshair className="h-4 w-4" /> : label ? <MapPin className="h-4 w-4" /> : <Globe className="h-4 w-4" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">Pricing location</p>
          <AnimatePresence mode="wait">
            {editing ? (
              <motion.div key="editing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-1.5 mt-0.5">
                <input
                  type="text"
                  value={cityInput}
                  onChange={(e) => setCityInput(e.target.value)}
                  placeholder="City"
                  className="w-24 text-xs rounded border border-zinc-200 px-2 py-1 focus:outline-none focus:border-emerald-400"
                />
                <input
                  type="text"
                  value={countryInput}
                  onChange={(e) => setCountryInput(e.target.value)}
                  placeholder="Country"
                  className="w-24 text-xs rounded border border-zinc-200 px-2 py-1 focus:outline-none focus:border-emerald-400"
                />
                <button onClick={handleSave} className="flex h-7 w-7 items-center justify-center rounded bg-emerald-500 text-white hover:bg-emerald-400" aria-label="Save location">
                  <Check className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => setEditing(false)} className="flex h-7 w-7 items-center justify-center rounded bg-zinc-200 text-zinc-600 hover:bg-zinc-300" aria-label="Cancel">
                  <X className="h-3.5 w-3.5" />
                </button>
              </motion.div>
            ) : detecting ? (
              <motion.p key="detecting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="truncate text-sm text-zinc-600">
                Detecting your location…
              </motion.p>
            ) : label ? (
              <motion.div key={label} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex items-center gap-1.5">
                <span className="truncate text-sm font-medium text-zinc-900">{label}</span>
                {isGeo && (
                  <span className="inline-flex items-center gap-0.5 shrink-0 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-medium text-emerald-700" title="GPS">
                    <Crosshair className="h-2.5 w-2.5" /> GPS
                  </span>
                )}
                {isIp && (
                  <span className="inline-flex items-center gap-0.5 shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-medium text-amber-700" title="IP (approximate)">
                    <Wifi className="h-2.5 w-2.5" /> IP
                  </span>
                )}
                {isManual && (
                  <span className="inline-flex items-center gap-0.5 shrink-0 rounded-full bg-blue-100 px-1.5 py-0.5 text-[9px] font-medium text-blue-700" title="Manual entry">
                    <Edit2 className="h-2.5 w-2.5" /> Manual
                  </span>
                )}
                {hasCoords && isGeo && (
                  <span className="hidden sm:inline text-[10px] text-zinc-400" title="GPS coordinates">
                    {location!.lat.toFixed(3)}°, {location!.lng.toFixed(3)}°
                  </span>
                )}
              </motion.div>
            ) : (
              <motion.p key="none" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="truncate text-sm text-zinc-500">
                Not set — prices will be worldwide
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {onManualLocation && !editing && (
          <Button variant="ghost" size="sm" onClick={handleEdit} disabled={detecting} className="text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700" title="Set location manually">
            <Edit2 className="h-4 w-4" />
            <span className="sr-only">Edit location manually</span>
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={onRefresh} disabled={detecting} className="text-zinc-400 hover:bg-zinc-100 hover:text-emerald-600" title="Auto-detect location">
          <RefreshCw className={cn('h-4 w-4', detecting && 'animate-spin')} />
          <span className="sr-only">Refresh location</span>
        </Button>
      </div>
    </div>
  )
}

'use client'

import { MapPin, Loader2, RefreshCw, Globe, Wifi } from 'lucide-react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import type { ResolvedLocation } from '@/lib/location'
import { cn } from '@/lib/utils'

interface LocationBarProps {
  location: ResolvedLocation | null
  detecting: boolean
  onRefresh: () => void
}

export function LocationBar({ location, detecting, onRefresh }: LocationBarProps) {
  const label = location?.city
    ? `${location.city}${location.country ? ', ' + location.country : ''}`
    : location?.country
    ? location.country
    : null

  const isIp = location?.source === 'ip'
  const isGeo = location?.source === 'geolocation'

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <div
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border',
            label ? 'border-emerald-500/30 bg-emerald-50 text-emerald-600' : 'border-zinc-200 bg-white text-zinc-400'
          )}
        >
          {detecting ? <Loader2 className="h-4 w-4 animate-spin" /> : label ? <MapPin className="h-4 w-4" /> : <Globe className="h-4 w-4" />}
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
              {isIp && (
                <span className="inline-flex items-center gap-0.5 shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-medium text-amber-700" title="Location detected via IP address (approximate). Click refresh and allow location permission for precise results.">
                  <Wifi className="h-2.5 w-2.5" /> IP
                </span>
              )}
              {isGeo && (
                <span className="inline-flex items-center gap-0.5 shrink-0 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-medium text-emerald-700" title="Location detected via GPS">
                  <MapPin className="h-2.5 w-2.5" /> GPS
                </span>
              )}
            </motion.div>
          ) : (
            <p className="truncate text-sm text-zinc-500">Not set — prices will be worldwide</p>
          )}
        </div>
      </div>
      <Button variant="ghost" size="sm" onClick={onRefresh} disabled={detecting} className="shrink-0 text-zinc-400 hover:bg-zinc-100 hover:text-emerald-600">
        <RefreshCw className={cn('h-4 w-4', detecting && 'animate-spin')} />
        <span className="sr-only">Refresh location</span>
      </Button>
    </div>
  )
}

'use client'

import { MapPin, Loader2, RefreshCw, Globe } from 'lucide-react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import type { ResolvedLocation } from '@/lib/location'
import { cn } from '@/lib/utils'

interface LocationBarProps {
  location: ResolvedLocation | null
  detecting: boolean
  onRefresh: () => void
}

export function LocationBar({
  location,
  detecting,
  onRefresh,
}: LocationBarProps) {
  const label = location?.city
    ? `${location.city}${location.country ? ', ' + location.country : ''}`
    : location?.country
    ? location.country
    : null

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3 backdrop-blur">
      <div className="flex min-w-0 items-center gap-3">
        <div
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border',
            label
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
              : 'border-zinc-700 bg-zinc-800/50 text-zinc-500'
          )}
        >
          {detecting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : label ? (
            <MapPin className="h-4 w-4" />
          ) : (
            <Globe className="h-4 w-4" />
          )}
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
            Pricing location
          </p>
          {detecting ? (
            <motion.p
              key="detecting"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="truncate text-sm text-zinc-300"
            >
              Detecting your location…
            </motion.p>
          ) : label ? (
            <motion.p
              key={label}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="truncate text-sm font-medium text-white"
            >
              {label}
            </motion.p>
          ) : (
            <p className="truncate text-sm text-zinc-400">
              Not set — prices will be worldwide
            </p>
          )}
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={onRefresh}
        disabled={detecting}
        className="shrink-0 text-zinc-400 hover:bg-zinc-800 hover:text-emerald-300"
      >
        <RefreshCw className={cn('h-4 w-4', detecting && 'animate-spin')} />
        <span className="sr-only">Refresh location</span>
      </Button>
    </div>
  )
}

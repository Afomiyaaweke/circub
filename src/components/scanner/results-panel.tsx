'use client'

import {
  ExternalLink,
  Package,
  Sparkles,
  Tag,
  AlertCircle,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import type { ScanResult } from '@/lib/types'
import { formatPriceRange } from '@/lib/location'
import { useState } from 'react'

interface ResultsPanelProps {
  result: ScanResult | null
  loading: boolean
  error: string | null
}

export function ResultsPanel({ result, loading, error }: ResultsPanelProps) {
  return (
    <Card className="border-emerald-500/15 bg-zinc-900/60 backdrop-blur">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base text-white">
          <Sparkles className="h-4 w-4 text-emerald-400" />
          Scan result
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <AnimatePresence mode="wait">
          {loading ? (
            <LoadingState key="loading" />
          ) : error ? (
            <ErrorState key="error" message={error} />
          ) : result ? (
            <ResultBody key="result" result={result} />
          ) : (
            <EmptyState key="empty" />
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  )
}

function LoadingState() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="space-y-3"
    >
      <div className="h-5 w-2/3 animate-pulse rounded bg-zinc-700/70" />
      <div className="h-4 w-1/3 animate-pulse rounded bg-zinc-700/50" />
      <div className="h-20 w-full animate-pulse rounded-lg bg-zinc-700/40" />
      <div className="h-3 w-full animate-pulse rounded bg-zinc-700/40" />
      <div className="h-3 w-5/6 animate-pulse rounded bg-zinc-700/40" />
    </motion.div>
  )
}

function ErrorState({ message }: { message: string }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex flex-col items-center gap-2 py-6 text-center"
    >
      <AlertCircle className="h-8 w-8 text-rose-400" />
      <p className="text-sm font-medium text-white">Scan failed</p>
      <p className="max-w-xs text-xs text-zinc-400">{message}</p>
    </motion.div>
  )
}

function EmptyState() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex flex-col items-center gap-2 py-8 text-center"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full border border-emerald-500/20 bg-emerald-500/5">
        <Package className="h-5 w-5 text-emerald-400/70" />
      </div>
      <p className="text-sm font-medium text-zinc-300">No item scanned yet</p>
      <p className="max-w-xs text-xs text-zinc-500">
        Point your camera at any product and tap <span className="text-emerald-300">Scan</span> to
        identify it and see live local prices.
      </p>
    </motion.div>
  )
}

function ResultBody({ result }: { result: ScanResult }) {
  const { item, price, sources, location } = result
  const priceRange = price
    ? formatPriceRange(price.estimatedLow, price.estimatedHigh, price.currency)
    : 'Price unavailable'

  const hasPrice =
    price &&
    (price.estimatedLow !== null || price.estimatedHigh !== null)

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.25 }}
      className="space-y-4"
    >
      {/* Item identity */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          {item.brand && (
            <Badge
              variant="secondary"
              className="bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/15"
            >
              <Tag className="mr-1 h-3 w-3" />
              {item.brand}
            </Badge>
          )}
          {item.category && (
            <Badge
              variant="outline"
              className="border-zinc-700 text-zinc-300"
            >
              {item.category}
            </Badge>
          )}
        </div>
        <h3 className="text-lg font-semibold leading-snug text-white">
          {item.name}
        </h3>
        {item.description && (
          <p className="text-sm leading-relaxed text-zinc-400">
            {item.description}
          </p>
        )}
      </div>

      {/* Price block */}
      <div className="rounded-xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 to-transparent p-4">
        <p className="text-[11px] font-medium uppercase tracking-wider text-emerald-300/80">
          Estimated price
          {location?.city
            ? ` near ${location.city}${
                location.country ? ', ' + location.country : ''
              }`
            : location?.country
            ? ` in ${location.country}`
            : ' · worldwide'}
        </p>
        <p
          className={`mt-1 text-2xl font-bold tracking-tight ${
            hasPrice ? 'text-white' : 'text-zinc-400'
          }`}
        >
          {priceRange}
        </p>
        {price?.summary && (
          <p className="mt-2 text-xs leading-relaxed text-zinc-400">
            {price.summary}
          </p>
        )}
      </div>

      {/* Sources */}
      {sources.length > 0 && (
        <SourcesList sources={sources} />
      )}
    </motion.div>
  )
}

function SourcesList({
  sources,
}: {
  sources: ScanResult['sources']
}) {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? sources : sources.slice(0, 3)

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
        Sources
      </p>
      <ul className="space-y-1.5">
        {visible.map((s, i) => (
          <li key={i}>
            <a
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-start gap-2 rounded-lg border border-transparent px-2 py-1.5 transition hover:border-zinc-700 hover:bg-zinc-800/50"
            >
              <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-500 transition group-hover:text-emerald-300" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-zinc-200 group-hover:text-white">
                  {s.title}
                </p>
                <p className="truncate text-[11px] text-zinc-500">
                  {s.host}
                </p>
              </div>
            </a>
          </li>
        ))}
      </ul>
      {sources.length > 3 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setExpanded((v) => !v)}
          className="h-7 w-full justify-center text-xs text-zinc-400 hover:text-emerald-300"
        >
          {expanded
            ? 'Show less'
            : `Show ${sources.length - 3} more sources`}
        </Button>
      )}
    </div>
  )
}

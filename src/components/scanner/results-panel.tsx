'use client'

import { ExternalLink, Package, Sparkles, Tag, AlertCircle, BadgeCheck } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
    <Card className="border-emerald-500/20 bg-white shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base text-zinc-900">
          <Sparkles className="h-4 w-4 text-emerald-500" />
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
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
      <div className="h-5 w-2/3 animate-pulse rounded bg-zinc-200" />
      <div className="h-4 w-1/3 animate-pulse rounded bg-zinc-200" />
      <div className="h-20 w-full animate-pulse rounded-lg bg-zinc-200" />
      <div className="h-3 w-full animate-pulse rounded bg-zinc-100" />
      <div className="h-3 w-5/6 animate-pulse rounded bg-zinc-100" />
    </motion.div>
  )
}

function ErrorState({ message }: { message: string }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center gap-2 py-6 text-center">
      <AlertCircle className="h-8 w-8 text-rose-500" />
      <p className="text-sm font-medium text-zinc-900">Scan failed</p>
      <p className="max-w-xs text-xs text-zinc-500">{message}</p>
    </motion.div>
  )
}

function EmptyState() {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center gap-2 py-8 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full border border-emerald-500/20 bg-emerald-50">
        <Package className="h-5 w-5 text-emerald-500" />
      </div>
      <p className="text-sm font-medium text-zinc-700">No item scanned yet</p>
      <p className="max-w-xs text-xs text-zinc-500">
        Point your camera at any product and tap <span className="text-emerald-600">Scan</span> to identify it and see live local prices.
      </p>
    </motion.div>
  )
}

function ResultBody({ result }: { result: ScanResult }) {
  const { item, price, sources, location } = result
  const priceRange = price ? formatPriceRange(price.estimatedLow, price.estimatedHigh, price.currency) : 'Price unavailable'
  const hasPrice = price && (price.estimatedLow !== null || price.estimatedHigh !== null)

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }} className="space-y-4">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          {item.brand && (
            <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 hover:bg-emerald-100">
              <Tag className="mr-1 h-3 w-3" />
              {item.brand}
            </Badge>
          )}
          {item.category && (
            <Badge variant="outline" className="border-zinc-200 text-zinc-600">
              {item.category}
            </Badge>
          )}
        </div>
        <h3 className="text-lg font-semibold leading-snug text-zinc-900">{item.name}</h3>
        {item.description && <p className="text-sm leading-relaxed text-zinc-600">{item.description}</p>}
      </div>

      <div className="rounded-xl border border-emerald-500/20 bg-gradient-to-br from-emerald-50 to-transparent p-4">
        <p className="text-[11px] font-medium uppercase tracking-wider text-emerald-700/80">
          Estimated price
          {location?.city ? ` near ${location.city}${location.country ? ', ' + location.country : ''}` : location?.country ? ` in ${location.country}` : ' · worldwide'}
        </p>
        <p className={`mt-1 text-2xl font-bold tracking-tight ${hasPrice ? 'text-zinc-900' : 'text-zinc-400'}`}>{priceRange}</p>
        {price?.summary && <p className="mt-2 text-xs leading-relaxed text-zinc-500">{price.summary}</p>}
      </div>

      {sources.length > 0 && <SourcesList sources={sources} />}

      {/* Local price posts from the circub DB — real prices from locals */}
      {result.localPrices && result.localPrices.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-wider text-emerald-600">
            Local prices ({result.localPrices.length})
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {result.localPrices.map((post, i) => (
              <div key={i} className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-2.5 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-zinc-900 truncate">{post.productName}</span>
                  <span className="text-sm font-bold text-emerald-700 shrink-0">
                    {post.currency} {post.priceMin}{post.priceMin !== post.priceMax ? `–${post.priceMax}` : ''}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-zinc-500">
                  <span className="truncate">{post.city ? post.city + ', ' : ''}{post.country}</span>
                  {post.authorVerifiedLocal && <BadgeCheck className="h-3 w-3 text-emerald-500 shrink-0" />}
                  <span className="truncate">· {post.authorName}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  )
}

function SourcesList({ sources }: { sources: ScanResult['sources'] }) {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? sources : sources.slice(0, 3)

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">Sources</p>
      <ul className="space-y-1.5">
        {visible.map((s, i) => (
          <li key={i}>
            <a
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-start gap-2 rounded-lg border border-transparent px-2 py-1.5 transition hover:border-zinc-200 hover:bg-zinc-50"
            >
              <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-400 transition group-hover:text-emerald-500" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-zinc-700 group-hover:text-zinc-900">{s.title}</p>
                <p className="truncate text-[11px] text-zinc-400">{s.host}</p>
              </div>
            </a>
          </li>
        ))}
      </ul>
      {sources.length > 3 && (
        <Button variant="ghost" size="sm" onClick={() => setExpanded((v) => !v)} className="h-7 w-full justify-center text-xs text-zinc-500 hover:text-emerald-600">
          {expanded ? 'Show less' : `Show ${sources.length - 3} more sources`}
        </Button>
      )}
    </div>
  )
}

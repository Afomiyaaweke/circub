'use client'

/**
 * Compact inline "similar posts" comparison shown inside the add-product /
 * post-price forms right after a photo is attached.
 *
 * - While identifying: pulsing "looking for similar prices" row
 * - On result: AI-identified chip + location price range + the closest
 *   matching posts (name, place, price range), so the user can price
 *   their product against the feed BEFORE publishing.
 */

import { Sparkles, MapPin, TrendingUp, PackageSearch, BadgeCheck } from 'lucide-react'
import type { IdentifyCompareResult } from '@/lib/photo-identify'

function fmt(n: number): string {
  return n >= 1000 ? n.toLocaleString('en-US') : String(n)
}

export function ComparePreview({
  result,
  identifying,
}: {
  result: IdentifyCompareResult | null
  identifying?: boolean
}) {
  if (identifying) {
    return (
      <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 flex items-center gap-2.5">
        <Sparkles className="w-4 h-4 text-primary animate-pulse shrink-0" />
        <p className="text-sm text-foreground">
          Identifying product<span className="animate-pulse">…</span>{' '}
          <span className="text-muted-foreground">looking for similar prices from the posts</span>
        </p>
      </div>
    )
  }
  if (!result) return null

  const matches = result.localMatches
  const lc = result.locationCompare

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Identified header */}
      <div className="px-4 py-3 flex items-start gap-2.5 border-b border-border bg-accent/30">
        <Sparkles className="w-4 h-4 text-primary mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          {result.identified && result.searchTerm ? (
            <p className="text-sm text-foreground truncate">
              AI identified: <span className="font-semibold">{result.searchTerm}</span>
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Couldn&apos;t identify this product confidently — no comparison found.
            </p>
          )}
          {/* Location compare strip */}
          {lc && (
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1 flex-wrap">
              <TrendingUp className="w-3.5 h-3.5 text-primary" />
              <span className="font-semibold text-foreground">
                {lc.currency} {fmt(lc.min)}–{fmt(lc.max)}
              </span>
              <span>
                · {lc.count} price{lc.count !== 1 ? 's' : ''} posted in{' '}
                {lc.place || (lc.scope === 'city' ? 'your city' : 'your country')}
              </span>
            </p>
          )}
        </div>
      </div>

      {/* Similar posts */}
      {matches.length > 0 && (
        <ul className="divide-y divide-border">
          {matches.slice(0, 4).map((m) => (
            <li key={m.id} className="px-4 py-2.5 flex items-center gap-3 min-w-0">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground truncate flex items-center gap-1.5">
                  <span className="truncate">{m.productName}</span>
                  {m.locMatch === 'city' && (
                    <span className="inline-flex items-center gap-0.5 shrink-0 text-[10px] font-semibold text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
                      <BadgeCheck className="w-3 h-3" />
                      In your city
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {[m.city, m.country].filter(Boolean).join(', ') || 'Unknown location'}
                </p>
              </div>
              <p className="text-sm font-semibold text-primary shrink-0">
                {m.currency} {fmt(m.priceMin)}–{fmt(m.priceMax)}
              </p>
            </li>
          ))}
        </ul>
      )}

      {/* AI estimate fallback when no posts match */}
      {matches.length === 0 && result.aiPriceEstimate && (
        <p className="px-4 py-3 text-xs text-muted-foreground flex items-center gap-1.5">
          <TrendingUp className="w-3.5 h-3.5 text-primary" />
          AI estimate: {result.aiPriceEstimate.currency} {fmt(result.aiPriceEstimate.min)}–
          {fmt(result.aiPriceEstimate.max)} · no similar posts yet — yours will be the first
        </p>
      )}
      {matches.length === 0 && !result.aiPriceEstimate && result.identified && (
        <p className="px-4 py-3 text-xs text-muted-foreground flex items-center gap-1.5">
          <PackageSearch className="w-3.5 h-3.5" />
          No similar posts found — your price will be the first reference for this product.
        </p>
      )}
    </div>
  )
}

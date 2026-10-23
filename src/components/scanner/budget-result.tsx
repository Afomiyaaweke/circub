'use client'

import { MapPin, Sparkles, TriangleAlert, Users } from 'lucide-react'
import { formatPrice, formatPriceRange } from '@/lib/location'
import type { BudgetResponse } from '@/lib/types'

// Shared renderer for a computed /api/budget result. Used by BOTH budget
// surfaces - the PriceLens scan-result planner and the "Plan my budget"
// panel on the Local tab - so they always show the exact same answer.

export const BUDGET_SOURCE_META: Record<BudgetResponse['source'], { label: string; icon: typeof Sparkles }> = {
  local: { label: 'Local prices', icon: Users },
  ai: { label: 'AI estimate', icon: Sparkles },
  rough: { label: 'Rough guess', icon: TriangleAlert },
}

export function BudgetResultView({ result }: { result: BudgetResponse }) {
  const SourceIcon = BUDGET_SOURCE_META[result.source].icon
  return (
    <div className="space-y-3" data-testid="budget-result">
      <div className="rounded-lg border border-emerald-200 bg-gradient-to-br from-emerald-50 to-card p-3">
        <p className="text-[10px] font-medium uppercase tracking-wider text-emerald-700/80">
          Safe budget · {result.quantity === 1 ? '1 item' : `${result.quantity} items`}
        </p>
        <p className="mt-0.5 text-2xl font-bold tracking-tight text-zinc-900" data-testid="budget-recommended">
          {formatPrice(result.total.recommended, result.currency)}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-medium text-emerald-700">Best case {formatPrice(result.total.low, result.currency)}</span>
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 font-medium text-zinc-600">Typical {formatPrice(result.total.typical, result.currency)}</span>
          <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-700">Priciest {formatPrice(result.total.high, result.currency)}</span>
        </div>
      </div>

      {result.verdict && (
        <p
          className={`rounded-lg px-3 py-2 text-xs font-medium leading-relaxed ${
            result.verdict.state === 'ok'
              ? 'bg-emerald-100 text-emerald-800'
              : result.verdict.state === 'tight'
                ? 'bg-amber-100 text-amber-800'
                : 'bg-rose-100 text-rose-800'
          }`}
          data-testid="budget-verdict"
        >
          {result.verdict.message}
        </p>
      )}

      <div className="space-y-1.5">
        {result.breakdown.map((line, i) => (
          <div key={i} className="flex items-center justify-between gap-2 text-xs">
            <span className="min-w-0 flex-1 truncate text-zinc-600">{line.label}</span>
            <span className="shrink-0 font-semibold text-zinc-900">{formatPrice(line.amount, result.currency)}</span>
          </div>
        ))}
      </div>

      {result.cheapest && (
        <p className="flex items-start gap-1.5 text-xs leading-relaxed text-zinc-500">
          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
          <span>
            Lowest local price: {formatPriceRange(result.cheapest.priceMin, result.cheapest.priceMax, result.cheapest.currency)}
            {' '}· {result.cheapest.productName} · {result.cheapest.city ? `${result.cheapest.city}, ` : ''}{result.cheapest.country}
          </span>
        </p>
      )}

      <p className="flex items-center gap-1.5 text-[11px] text-zinc-400">
        <SourceIcon className="h-3 w-3 shrink-0" />
        <span className="inline-flex items-center rounded-full bg-zinc-100 px-1.5 py-0.5 font-medium text-zinc-500">
          {BUDGET_SOURCE_META[result.source].label}
        </span>
        <span className="truncate">{result.note}</span>
      </p>
    </div>
  )
}

'use client'

/**
 * Market graph panel - since v95 this is the ONE place the price tools
 * live: everything the camera search used to carry (Compare by location +
 * Plan my budget) renders ON the market graph, and the old chart content
 * (item bars, place bars, the before-vs-now line, the query controls) is
 * gone. The /api/market-graph endpoint still serves the chart data for API
 * consumers - the panel itself is the tools hub, and one commit reverts if
 * the graphs are wanted back.
 */
import { BarChart3, X } from 'lucide-react'
import { Card } from '@/components/ui/card'
import type { ReactNode } from 'react'

export function MarketGraphPanel({ onClose, children }: { onClose: () => void; children?: ReactNode }) {
  return (
    <Card className="w-full p-3 sm:p-4 shadow-sm border-emerald-500/40 space-y-3" data-testid="market-panel">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
          <BarChart3 className="w-4 h-4 text-emerald-600" /> Market graph
          <span className="relative flex h-2 w-2" title="Live from real price posts" data-testid="market-live-dot">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
        </p>
        <button onClick={onClose} className="p-1 rounded hover:bg-accent text-muted-foreground" aria-label="Close market graph" data-testid="market-close">
          <X className="w-4 h-4" />
        </button>
      </div>
      {children}
    </Card>
  )
}

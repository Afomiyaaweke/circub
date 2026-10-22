'use client'

/**
 * Proforma panel - since v95 this is the ONE place the price tools live;
 * v171 names it for what it is: the PROFORMA - the whole concept summed up
 * (find what things cost, compare place by place, get the best result).
 * The /api/market-graph endpoint still serves chart data for API consumers;
 * the panel itself is the proforma hub.
 */
import { ClipboardList, X } from 'lucide-react'
import { Card } from '@/components/ui/card'
import type { ReactNode } from 'react'

export function MarketGraphPanel({ onClose, children }: { onClose: () => void; children?: ReactNode }) {
  return (
    <Card className="w-full p-3 sm:p-4 shadow-sm border-violet-500/40 space-y-3" data-testid="market-panel">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
            <ClipboardList className="w-4 h-4 text-violet-600" /> Proforma
            <span className="relative flex h-2 w-2" title="Live from real price posts" data-testid="market-live-dot">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-60"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-violet-500"></span>
            </span>
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Find. Compare. Get the best result.</p>
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-accent text-muted-foreground" aria-label="Close proforma" data-testid="market-close">
          <X className="w-4 h-4" />
        </button>
      </div>
      {children}
    </Card>
  )
}

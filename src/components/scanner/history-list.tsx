'use client'

import { History, Trash2, Clock } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { ScanHistoryEntry } from '@/lib/types'
import { formatPriceRange } from '@/lib/location'

interface HistoryListProps {
  history: ScanHistoryEntry[]
  onSelect: (entry: ScanHistoryEntry) => void
  onClear: () => void
  activeId?: string | null
}

export function HistoryList({ history, onSelect, onClear, activeId }: HistoryListProps) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-zinc-400" />
          <h3 className="text-sm font-medium text-zinc-900">Recent scans</h3>
          {history.length > 0 && (
            <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500">{history.length}</span>
          )}
        </div>
        {history.length > 0 && (
          <Button variant="ghost" size="sm" onClick={onClear} className="h-7 text-xs text-zinc-400 hover:text-rose-500">
            <Trash2 className="mr-1 h-3 w-3" /> Clear
          </Button>
        )}
      </div>
      {history.length === 0 ? (
        <div className="flex flex-col items-center gap-1 px-4 pb-6 pt-2 text-center">
          <Clock className="h-5 w-5 text-zinc-300" />
          <p className="text-xs text-zinc-400">Your scanned items will appear here.</p>
        </div>
      ) : (
        <ScrollArea className="max-h-72">
          <ul className="space-y-1 px-2 pb-2">
            <AnimatePresence initial={false}>
              {history.map((entry) => (
                <motion.li key={entry.id} layout initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.18 }}>
                  <button
                    onClick={() => onSelect(entry)}
                    className={`flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition ${
                      activeId === entry.id ? 'bg-emerald-50 ring-1 ring-emerald-500/30' : 'hover:bg-zinc-50'
                    }`}
                  >
                    {entry.thumbnail ? (
                      <img src={entry.thumbnail} alt="" className="h-11 w-11 shrink-0 rounded-md object-cover" />
                    ) : (
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-zinc-100 text-zinc-400">
                        <History className="h-4 w-4" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-zinc-800">{entry.result.item.name}</p>
                      <p className="truncate text-[11px] text-zinc-400">
                        {entry.result.price
                          ? formatPriceRange(entry.result.price.estimatedLow, entry.result.price.estimatedHigh, entry.result.price.currency)
                          : 'No price found'}
                      </p>
                    </div>
                    <span className="shrink-0 text-[10px] text-zinc-400">{timeAgo(entry.timestamp)}</span>
                  </button>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </ScrollArea>
      )}
    </div>
  )
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts
  const s = Math.floor(diff / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

'use client'

// PriceLensModal — wraps the PriceLens scanner (live camera + AI identification
// + web-search pricing + history + location) into a modal that fits inside
// circub's Local Price Feed tab.
//
// When the user taps "Scan with camera" on the Local Feed toolbar, this modal
// opens, the camera starts, and they can scan products to see AI-identified
// names + estimated local prices + matching local price posts in the DB.
//
// The PriceLens code is the user's source verbatim — we just wrapped it in a
// Dialog so it appears as a modal instead of a full page.

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { ScanLine, Zap, ZapOff, ShieldCheck, X } from 'lucide-react'
import { useCamera } from '@/hooks/use-camera'
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog'
import { Viewfinder } from '@/components/scanner/viewfinder'
import { ResultsPanel } from '@/components/scanner/results-panel'
import { LocationBar } from '@/components/scanner/location-bar'
import { HistoryList } from '@/components/scanner/history-list'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import type { ScanResult, ScanHistoryEntry } from '@/lib/types'
import {
  resolveCurrentLocation,
  type ResolvedLocation,
} from '@/lib/location'

const AUTO_SCAN_INTERVAL = 8000

interface PriceLensModalProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  /** Optional callback fired when a scan identifies a product — passes the
   *  product name so the parent (e.g. local-feed-tab) can fill its search box
   *  and show matching local price posts from the DB. */
  onPickItem?: (label: string) => void
}

export function PriceLensModal({ open, onOpenChange, onPickItem }: PriceLensModalProps) {
  const {
    videoRef,
    status,
    error: cameraError,
    start,
    switchCamera,
    captureFrame,
  } = useCamera({ facingMode: 'environment' })

  const [result, setResult] = useState<ScanResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)
  const [history, setHistory] = useState<ScanHistoryEntry[]>([])
  const [activeHistoryId, setActiveHistoryId] = useState<string | null>(null)
  const [location, setLocation] = useState<ResolvedLocation | null>(null)
  const [detectingLocation, setDetectingLocation] = useState(false)
  const [autoScan, setAutoScan] = useState(false)
  const { toast } = useToast()
  const scanInFlight = useRef(false)

  // When the modal opens, auto-start the camera + detect location. When it
  // closes, the camera is stopped by the useCamera cleanup effect.
  useEffect(() => {
    if (open) {
      // Give the Dialog a moment to mount the video element before starting.
      const t = setTimeout(() => void start('environment'), 50)
      return () => clearTimeout(t)
    }
  }, [open, start])

  const detectLocation = useCallback(async () => {
    setDetectingLocation(true)
    try {
      const loc = await resolveCurrentLocation()
      if (loc) {
        setLocation(loc)
      } else {
        toast({
          title: 'Location unavailable',
          description:
            'Could not detect your location. Prices will be shown worldwide.',
          variant: 'default',
        })
      }
    } finally {
      setDetectingLocation(false)
    }
  }, [toast])

  // Try to detect location once on mount (best-effort).
  useEffect(() => {
    if (open) void detectLocation()
  }, [open, detectLocation])

  const runScan = useCallback(async () => {
    if (scanInFlight.current) return
    const frame = captureFrame(0.82)
    if (!frame) {
      setScanError('Camera is not ready. Start the camera first.')
      return
    }
    scanInFlight.current = true
    setLoading(true)
    setScanError(null)
    setActiveHistoryId(null)
    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: frame,
          location: location
            ? {
                city: location.city,
                country: location.country,
                countryCode: location.countryCode,
                region: location.region,
              }
            : null,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error || `Request failed (${res.status})`)
      }
      const data = (await res.json()) as ScanResult
      setResult(data)
      const entry: ScanHistoryEntry = {
        id:
          typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : String(Date.now() + Math.random()),
        timestamp: Date.now(),
        thumbnail: frame,
        result: data,
      }
      setHistory((h) => [entry, ...h].slice(0, 20))

      // Also search the local price posts DB for matching products and
      // surface them as a toast + fill the search box on the parent. The
      // parent (local-feed-tab) passes an onPickItem callback so we can
      // hand off the search keyword + close this modal.
      const itemName = data.item.name || ''
      const searchQuery = data.rawQuery || itemName
      if (searchQuery) {
        onPickItem(searchQuery.split(' ').slice(0, 3).join(' '))
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Scan failed.'
      setScanError(msg)
      toast({
        title: 'Scan failed',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
      scanInFlight.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [captureFrame, location, toast])

  // Auto-scan loop — runs every 8 seconds when enabled.
  useEffect(() => {
    if (!open) return
    if (!autoScan) return
    if (status !== 'live') return
    const id = setInterval(() => {
      void runScan()
    }, AUTO_SCAN_INTERVAL)
    // Also kick off an immediate scan when enabling.
    void runScan()
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoScan, status, open])

  const handleStart = useCallback(() => {
    void start('environment')
  }, [start])

  const handleSwitch = useCallback(() => {
    void switchCamera()
  }, [switchCamera])

  const handleSelectHistory = useCallback((entry: ScanHistoryEntry) => {
    setResult(entry.result)
    setActiveHistoryId(entry.id)
  }, [])

  const canScan = status === 'live' && !loading

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[95vh] overflow-y-auto scrollbar-thin p-4 sm:p-6 gap-0 bg-zinc-950 text-zinc-100 border-zinc-800">
        <DialogTitle className="sr-only">PriceLens — scan a product with your camera</DialogTitle>

        {/* Inline header (matches the original PriceLens UI but compact) */}
        <div className="flex items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500 text-emerald-950 shadow-lg shadow-emerald-500/20">
              <ScanLine className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold leading-none text-white">
                PriceLens
              </h2>
              <p className="mt-0.5 text-[11px] text-zinc-500">
                AI camera price scanner
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/60 px-3 py-1 text-[11px] text-zinc-400 sm:flex">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
              Frames analyzed once &amp; not stored
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full text-zinc-400 hover:bg-zinc-800 hover:text-white"
              onClick={() => onOpenChange(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Main grid: camera on left, results on right (desktop) / stacked (mobile) */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.05fr_1fr]">
          {/* Left: camera + controls */}
          <div className="space-y-4">
            <Viewfinder
              videoRef={videoRef}
              status={status}
              error={cameraError}
              scanning={loading}
              onStart={handleStart}
              onSwitch={handleSwitch}
            />

            {/* Scan controls */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button
                size="lg"
                onClick={() => void runScan()}
                disabled={!canScan}
                className={cn(
                  'flex-1 gap-2 rounded-xl text-base font-semibold transition',
                  canScan
                    ? 'bg-emerald-500 text-emerald-950 hover:bg-emerald-400 shadow-lg shadow-emerald-500/25'
                    : 'bg-zinc-800 text-zinc-500'
                )}
              >
                <ScanLine className="h-5 w-5" />
                {loading ? 'Scanning…' : 'Scan item'}
              </Button>

              <div className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-2.5 sm:px-4">
                <div className="flex items-center gap-2.5">
                  {autoScan ? (
                    <Zap className="h-4 w-4 text-emerald-400" />
                  ) : (
                    <ZapOff className="h-4 w-4 text-zinc-500" />
                  )}
                  <div className="leading-tight">
                    <p className="text-sm font-medium text-zinc-200">Auto-scan</p>
                    <p className="text-[10px] text-zinc-500">
                      every {AUTO_SCAN_INTERVAL / 1000}s
                    </p>
                  </div>
                </div>
                <Switch
                  checked={autoScan}
                  onCheckedChange={setAutoScan}
                  disabled={status !== 'live'}
                  aria-label="Toggle auto-scan"
                />
              </div>
            </div>

            <LocationBar
              location={location}
              detecting={detectingLocation}
              onRefresh={() => void detectLocation()}
            />

            {/* Mobile: show history under camera */}
            <div className="lg:hidden">
              <HistoryList
                history={history}
                onSelect={handleSelectHistory}
                onClear={() => setHistory([])}
                activeId={activeHistoryId}
              />
            </div>
          </div>

          {/* Right: results + history (desktop) */}
          <div className="space-y-4">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <ResultsPanel
                result={result}
                loading={loading}
                error={scanError}
              />
            </motion.div>

            <div className="hidden lg:block">
              <HistoryList
                history={history}
                onSelect={handleSelectHistory}
                onClear={() => setHistory([])}
                activeId={activeHistoryId}
              />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

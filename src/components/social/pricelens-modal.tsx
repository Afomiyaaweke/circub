'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { ScanLine, Zap, ZapOff, ShieldCheck, ArrowLeft } from 'lucide-react'
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
  /** Fired when a scan identifies a product — passes the product name so
   *  the parent can fill the search box and show matching local posts. */
  onPickItem?: (label: string) => void
}

// Simple string hash for picking a color per category
function hashString(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0
  return h
}

// Downscale a data:image URL to maxDimension pixels (max width OR height).
// This reduces the payload size by 5-10x for slow internet connections.
// e.g. a 1280x720 frame at quality 0.4 (~300KB) → 640x360 at 0.4 (~60KB)
async function downscaleImage(dataUrl: string, maxDimension: number): Promise<string> {
  return new Promise((resolve) => {
    try {
      const img = new Image()
      img.onload = () => {
        let { width, height } = img
        if (width <= maxDimension && height <= maxDimension) {
          resolve(dataUrl) // already small enough
          return
        }
        const scale = Math.min(maxDimension / width, maxDimension / height)
        width = Math.round(width * scale)
        height = Math.round(height * scale)
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) { resolve(dataUrl); return }
        ctx.drawImage(img, 0, 0, width, height)
        resolve(canvas.toDataURL('image/jpeg', 0.4))
      }
      img.onerror = () => resolve(dataUrl) // fallback to original on error
      img.src = dataUrl
    } catch {
      resolve(dataUrl) // fallback to original
    }
  })
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

  // Bounding boxes for detected items — shown as colored rectangles
  // on the video feed, like the screenshot the user provided.
  const [boxes, setBoxes] = useState<Array<{
    label: string
    x: number; y: number; w: number; h: number
    color: string
  }>>([])

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

  // Auto-start camera when modal opens
  useEffect(() => {
    if (open) {
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
        if (loc.source === 'ip') {
          toast({
            title: 'Using approximate location',
            description: `Detected ${loc.city ? loc.city + ', ' : ''}${loc.country} via IP. Tap the refresh button (↻) and allow location permission for precise GPS results.`,
          })
        } else if (loc.source === 'geolocation') {
          toast({
            title: 'Location detected',
            description: `${loc.city ? loc.city + ', ' : ''}${loc.country} via device GPS.`,
          })
        }
      } else {
        toast({
          title: 'Location unavailable',
          description: 'Could not detect your location. Prices will be shown worldwide.',
        })
      }
    } finally {
      setDetectingLocation(false)
    }
  }, [toast])

  useEffect(() => {
    if (open) void detectLocation()
  }, [open, detectLocation])

  const runScan = useCallback(async () => {
    if (scanInFlight.current) return
    // Even lower quality + resize for slow connections — downscale
    // the frame to 640px max dimension before sending.
    const rawFrame = captureFrame(0.4)
    if (!rawFrame) {
      setScanError('Camera is not ready. Start the camera first.')
      return
    }

    // Downscale the image to reduce payload size (critical for slow
    // internet). The full-res frame can be 500KB-1MB; downscaled to
    // 640px it's ~50-100KB — 5-10x smaller upload.
    const downscaledFrame = await downscaleImage(rawFrame, 640)

    scanInFlight.current = true
    setLoading(true)
    setScanError(null)
    setActiveHistoryId(null)
    setResult(null)
    setBoxes([])

    // INSTANT FEEDBACK: show the captured frame immediately
    setHistory((h) => [{
      id: 'pending-' + Date.now(),
      timestamp: Date.now(),
      thumbnail: downscaledFrame,
      result: { item: { name: 'Searching…', brand: null, category: null, description: '' }, price: null, sources: [], location: null, rawQuery: '', localPrices: [] },
    }, ...h].slice(0, 20))

    try {
      const controller = new AbortController()
      // 30s timeout — if the server takes too long (slow internet or
      // VLM is slow), abort and show a friendly error instead of
      // making the user wait forever.
      const timeoutId = setTimeout(() => controller.abort(), 30000)

      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: downscaledFrame,
          location: location
            ? { city: location.city, country: location.country, countryCode: location.countryCode, region: location.region }
            : null,
        }),
        signal: controller.signal,
      })
      clearTimeout(timeoutId)

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        const errorMsg = err?.error || `Request failed (${res.status})`
        // Don't throw for 429/503 — show as a retryable error
        if (res.status === 429 || res.status === 503) {
          setScanError(errorMsg)
          setHistory((h) => h.filter((e) => e.result.item.name !== 'Searching…'))
          toast({ title: 'Scanner busy', description: errorMsg, variant: 'destructive' })
          return
        }
        throw new Error(errorMsg)
      }
      const data = (await res.json()) as ScanResult
      setResult(data)

      // Replace the "Searching…" placeholder in history with the real result
      setHistory((h) => {
        const updated = h.map((entry) =>
          entry.result.item.name === 'Searching…'
            ? { ...entry, result: data }
            : entry
        )
        return updated
      })

      // Bounding box for detected item
      if (data.item && data.item.name && data.item.name !== 'Unknown item') {
        const colors = ['#FF00FF', '#00FF00', '#00FFFF', '#FFA500', '#FF6B6B', '#4ECDC4']
        const colorIndex = Math.abs(hashString(data.item.category || data.item.name)) % colors.length
        setBoxes([{
          label: `${data.item.name}${data.price?.estimatedLow != null ? ` · ${data.price.currency || 'USD'} ${data.price.estimatedLow}${data.price.estimatedHigh != null && data.price.estimatedHigh !== data.price.estimatedLow ? '-' + data.price.estimatedHigh : ''}` : ''}`,
          x: 0.1, y: 0.1, w: 0.8, h: 0.8,
          color: colors[colorIndex],
        }])
      } else {
        setBoxes([])
      }

      // Hand off the identified product to the parent
      if (onPickItem) {
        const itemName = data.item.name || ''
        const searchQuery = data.rawQuery || itemName
        if (searchQuery) onPickItem(searchQuery.split(' ').slice(0, 3).join(' '))
      }
    } catch (err) {
      const msg = err instanceof Error
        ? (err.name === 'AbortError' ? 'Scan timed out — check your internet connection and try again.' : err.message)
        : 'Scan failed.'
      setScanError(msg)
      // Remove the "Searching…" placeholder from history on failure
      setHistory((h) => h.filter((e) => e.result.item.name !== 'Searching…'))
      toast({ title: 'Scan failed', description: msg, variant: 'destructive' })
    } finally {
      setLoading(false)
      scanInFlight.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [captureFrame, location, toast, onPickItem])

  useEffect(() => {
    if (!open) return
    if (!autoScan) return
    if (status !== 'live') return
    const id = setInterval(() => void runScan(), AUTO_SCAN_INTERVAL)
    void runScan()
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoScan, status, open])

  const handleStart = useCallback(() => {
    void start('environment')
    void detectLocation()
  }, [start, detectLocation])
  const handleSwitch = useCallback(() => void switchCamera(), [switchCamera])
  const handleSelectHistory = useCallback((entry: ScanHistoryEntry) => {
    setResult(entry.result)
    setActiveHistoryId(entry.id)
  }, [])

  // QR code detection — when a QR is scanned, show it as a toast + use
  // the QR data as the search term (e.g. a product URL or name encoded
  // in the QR).
  const handleQRDetected = useCallback((data: string) => {
    toast({
      title: 'QR code detected',
      description: data.length > 80 ? data.slice(0, 80) + '…' : data,
    })
    // If the QR contains a URL, we could open it or search with it.
    // For now, use the QR data as a scan result.
    if (onPickItem) {
      onPickItem(data.slice(0, 60))
    }
  }, [toast, onPickItem])

  // Manual location entry
  const handleManualLocation = useCallback((city: string | null, country: string | null) => {
    if (!city && !country) return
    setLocation({
      city,
      country,
      countryCode: null,
      region: null,
      lat: 0,
      lng: 0,
      source: 'manual',
    })
    toast({
      title: 'Location set manually',
      description: `${city ? city + ', ' : ''}${country || ''}`,
    })
  }, [toast])

  const canScan = status === 'live' && !loading

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[95vh] w-[95vw] sm:w-auto overflow-y-auto scrollbar-thin p-0 gap-0 bg-white text-zinc-900 border-zinc-200">
        <DialogTitle className="sr-only">PriceLens — scan a product with your camera</DialogTitle>

        {/* Header with Go Back button */}
        <div className="sticky top-0 z-20 flex items-center justify-between gap-2 border-b border-zinc-100 bg-white/95 px-3 py-2.5 backdrop-blur sm:px-5 sm:py-3 sm:gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => onOpenChange(false)}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900"
              title="Go back to circub"
              aria-label="Go back"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500 text-white shadow-sm">
              <ScanLine className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold leading-none text-zinc-900">PriceLens</h2>
              <p className="mt-0.5 text-[10px] text-zinc-500">AI camera price scanner</p>
            </div>
          </div>
          <div className="hidden items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-[10px] text-zinc-500 sm:flex">
            <ShieldCheck className="h-3 w-3 text-emerald-500" />
            Not stored
          </div>
        </div>

        {/* Body */}
        <div className="p-3 sm:p-5">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Left: camera + controls */}
            <div className="space-y-3">
              <Viewfinder
                videoRef={videoRef}
                status={status}
                error={cameraError}
                scanning={loading}
                onStart={handleStart}
                onSwitch={handleSwitch}
                onQRDetected={handleQRDetected}
                boxes={boxes}
              />

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Button
                  onClick={() => void runScan()}
                  disabled={!canScan}
                  className={cn(
                    'flex-1 gap-2 rounded-xl text-sm font-semibold transition h-11',
                    canScan
                      ? 'bg-emerald-500 text-white hover:bg-emerald-400 shadow-lg shadow-emerald-500/25'
                      : 'bg-zinc-100 text-zinc-400'
                  )}
                >
                  <ScanLine className="h-4 w-4" />
                  {loading ? 'Searching…' : 'Scan'}
                </Button>

                <div className="flex items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
                  <div className="flex items-center gap-2">
                    {autoScan ? <Zap className="h-3.5 w-3.5 text-emerald-500" /> : <ZapOff className="h-3.5 w-3.5 text-zinc-400" />}
                    <div className="leading-tight">
                      <p className="text-xs font-medium text-zinc-800">Auto-scan</p>
                      <p className="text-[9px] text-zinc-500">every {AUTO_SCAN_INTERVAL / 1000}s</p>
                    </div>
                  </div>
                  <Switch checked={autoScan} onCheckedChange={setAutoScan} disabled={status !== 'live'} aria-label="Toggle auto-scan" />
                </div>
              </div>

              <LocationBar location={location} detecting={detectingLocation} onRefresh={() => void detectLocation()} onManualLocation={handleManualLocation} />

              <div className="lg:hidden">
                <HistoryList history={history} onSelect={handleSelectHistory} onClear={() => setHistory([])} activeId={activeHistoryId} />
              </div>
            </div>

            {/* Right: results + history */}
            <div className="space-y-3">
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
                <ResultsPanel
                  result={result}
                  loading={loading}
                  error={scanError}
                  onRetry={() => void runScan()}
                  onAskGuide={(itemName, loc) => {
                    // Close the PriceLens modal and navigate to the Guides tab
                    // with the scanned item info so the user can find a guide.
                    onOpenChange(false)
                    // Dispatch a custom event that page.tsx can listen for
                    // to switch to the Guides tab + pre-fill a message
                    window.dispatchEvent(new CustomEvent('circub:ask-guide', {
                      detail: { itemName, location: loc }
                    }))
                  }}
                />
              </motion.div>

              <div className="hidden lg:block">
                <HistoryList history={history} onSelect={handleSelectHistory} onClear={() => setHistory([])} activeId={activeHistoryId} />
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

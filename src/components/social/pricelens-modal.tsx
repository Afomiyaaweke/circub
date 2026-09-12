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

// Auto-scan cadence (ms). Lower = faster scanning. 2.5s is safe because
// scanInFlight prevents overlapping scans — if the AI is still busy the
// tick is skipped and the next scan fires as soon as the server responds.
const AUTO_SCAN_INTERVAL = 2500
// Mean-brightness delta (0-255 scale) below which the scene counts as
// "unchanged" and auto-scan sends NOTHING to the server. Keeps the scanner
// quiet (and the backend unloaded) when the camera is pointed at the same
// item, while still scanning within ~2.5s of any real change.
const SCENE_CHANGE_THRESHOLD = 6
// Lower max dimension = smaller payload = faster upload + faster AI response.
// 384px is enough for product/label identification while keeping payload <100KB.
const CAPTURE_MAX_DIM = 384
const CAPTURE_QUALITY = 0.45

interface PriceLensModalProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  /** Fired when a scan identifies a product — passes the product name so
   *  the parent can fill the search box and show matching local posts. */
  onPickItem?: (label: string) => void
}

// Downscale image to reduce payload for slow connections + Vercel proxy
async function downscaleImage(dataUrl: string, maxDim: number): Promise<string> {
  return new Promise((resolve) => {
    try {
      const img = new Image()
      img.onload = () => {
        let { width, height } = img
        if (width <= maxDim && height <= maxDim) { resolve(dataUrl); return }
        const scale = Math.min(maxDim / width, maxDim / height)
        width = Math.round(width * scale)
        height = Math.round(height * scale)
        const canvas = document.createElement('canvas')
        canvas.width = width; canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) { resolve(dataUrl); return }
        ctx.drawImage(img, 0, 0, width, height)
        resolve(canvas.toDataURL('image/jpeg', 0.4))
      }
      img.onerror = () => resolve(dataUrl)
      img.src = dataUrl
    } catch { resolve(dataUrl) }
  })
}

// Wait until the video element is actually delivering frames (readyState >= 2
// and non-zero dimensions). Polls every 25ms instead of a blind fixed delay,
// so scanning starts the instant the camera is ready.
async function waitForVideoFrame(video: HTMLVideoElement | null, timeoutMs = 800): Promise<boolean> {
  if (!video) return false
  const t0 = Date.now()
  while (video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
    if (Date.now() - t0 > timeoutMs) return video.videoWidth > 0
    await new Promise((r) => setTimeout(r, 25))
  }
  return true
}

// Cheap 8x8 brightness signature of the current camera frame. Used to detect
// whether the scene changed since the last scan so auto-scan doesn't spam
// the backend with near-identical requests ("less busy" for many users).
function quickSignature(video: HTMLVideoElement | null): number[] | null {
  if (!video || !video.videoWidth || !video.videoHeight) return null
  try {
    const c = document.createElement('canvas')
    c.width = 8
    c.height = 8
    const ctx = c.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(video, 0, 0, 8, 8)
    const { data } = ctx.getImageData(0, 0, 8, 8)
    const sig: number[] = []
    for (let i = 0; i < data.length; i += 4) {
      sig.push((data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000)
    }
    return sig
  } catch {
    return null
  }
}

function signatureDistance(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length)
  if (n === 0) return 255
  let d = 0
  for (let i = 0; i < n; i++) d += Math.abs(a[i] - b[i])
  return d / n
}

export function PriceLensModal({ open, onOpenChange, onPickItem }: PriceLensModalProps) {
  const {
    videoRef,
    status,
    error: cameraError,
    start,
    stop,
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
  const [paused, setPaused] = useState(false)
  const { toast } = useToast()
  const scanInFlight = useRef(false)
  // Brightness signature of the last SUCCESSFULLY scanned scene (auto-scan
  // skips when the new frame is near-identical to this).
  const lastSigRef = useRef<number[] | null>(null)

  // Camera lifecycle: the camera starts on the first user tap ("Scan item"
  // or "Start camera") and then STAYS LIVE between scans so repeated scans
  // are instant (no restart + permission renegotiation per scan). The
  // Pause button halts the auto-scan loop but keeps the preview warm.
  // Closing the modal fully releases the camera (privacy + battery).

  // Stop the camera whenever the modal closes (privacy + battery).
  useEffect(() => {
    if (!open) {
      stop()
      setAutoScan(false)
      setPaused(false)
    }
  }, [open, stop])

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
    // Start camera if not already live — when it is already live (the normal
    // case now) this is skipped entirely and capture is instant.
    if (status !== 'live') {
      await start('environment')
      const ready = await waitForVideoFrame(videoRef.current)
      if (!ready) {
        setScanError('Camera is not ready. Try again.')
        return
      }
    }
    // Lower quality + downscale for faster upload (critical for Vercel proxy)
    const rawFrame = captureFrame(CAPTURE_QUALITY)
    if (!rawFrame) {
      setScanError('Camera is not ready. Try again.')
      return
    }
    // --- "Less busy" scene-change guard (auto-scan only) ---
    // If the scene is essentially the same as the last successful scan,
    // skip this tick silently: zero requests, zero overlay flashing.
    const sceneSig = quickSignature(videoRef.current)
    if (autoScan && sceneSig && lastSigRef.current &&
        signatureDistance(sceneSig, lastSigRef.current) < SCENE_CHANGE_THRESHOLD) {
      return
    }
    // Downscale to CAPTURE_MAX_DIM px max — smaller payload = faster proxy response
    const frame = await downscaleImage(rawFrame, CAPTURE_MAX_DIM)
    if (!frame) {
      setScanError('Camera is not ready. Try again.')
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
            ? { city: location.city, country: location.country, countryCode: location.countryCode, region: location.region }
            : null,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        if (res.status === 429) {
          // Server is protecting itself (rate limit / queue full) — back off
          // politely: stop auto-scanning and show the paused state instead
          // of hammering a busy backend.
          setAutoScan(false)
          setPaused(true)
          throw new Error(err?.error || 'Scanner is busy. Auto-scan paused — try again in a few seconds.')
        }
        throw new Error(err?.error || `Request failed (${res.status})`)
      }
      const data = (await res.json()) as ScanResult
      setResult(data)
      lastSigRef.current = sceneSig
      const entry: ScanHistoryEntry = {
        id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Date.now() + Math.random()),
        timestamp: Date.now(),
        thumbnail: frame,
        result: data,
      }
      setHistory((h) => [entry, ...h].slice(0, 20))
      if (onPickItem) {
        const itemName = data.item.name || ''
        const searchQuery = data.rawQuery || itemName
        if (searchQuery) onPickItem(searchQuery.split(' ').slice(0, 3).join(' '))
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Scan failed.'
      setScanError(msg)
      toast({ title: 'Scan failed', description: msg, variant: 'destructive' })
    } finally {
      setLoading(false)
      scanInFlight.current = false
      // Camera stays LIVE after the scan so the next scan is instant.
      // Use Pause to halt the auto-scan loop, or close the modal to
      // fully release the camera (privacy + battery).
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [captureFrame, location, toast, onPickItem, status, start, videoRef, autoScan])

  useEffect(() => {
    if (!open) return
    if (!autoScan) return
    if (paused) return
    if (status !== 'live') return
    const id = setInterval(() => void runScan(), AUTO_SCAN_INTERVAL)
    void runScan()
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoScan, paused, status, open])

  const handleStart = useCallback(() => {
    void start('environment')
    // Also trigger location detection on this user gesture — some
    // browsers (iOS Safari) require a user gesture before geolocation
    // will prompt for permission.
    void detectLocation()
  }, [start, detectLocation])
  const handleSwitch = useCallback(() => void switchCamera(), [switchCamera])
  // Pause keeps the camera + preview alive and only halts the scan loop,
  // so resuming (or the next manual "Scan item") is instant.
  const handleTogglePause = useCallback(() => setPaused((p) => !p), [])
  const handleScanNow = useCallback(() => {
    if (paused) setPaused(false)
    void runScan()
  }, [paused, runScan])
  const handleSelectHistory = useCallback((entry: ScanHistoryEntry) => {
    setResult(entry.result)
    setActiveHistoryId(entry.id)
  }, [])

  const canScan = status === 'live' && !loading

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto scrollbar-thin p-0 gap-0 bg-white text-zinc-900 border-zinc-200">
        <DialogTitle className="sr-only">PriceLens — scan a product with your camera</DialogTitle>

        {/* Header with Go Back button */}
        <div className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-zinc-100 bg-white/95 px-4 py-3 backdrop-blur sm:px-6">
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
        <div className="p-4 sm:p-6">
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {/* Left: camera + controls */}
            <div className="space-y-3">
              <Viewfinder
                videoRef={videoRef}
                status={status}
                error={cameraError}
                scanning={loading}
                paused={paused}
                onStart={handleStart}
                onSwitch={handleSwitch}
                onTogglePause={handleTogglePause}
              />

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Button
                  size="lg"
                  onClick={handleScanNow}
                  disabled={!canScan}
                  className={cn(
                    'flex-1 gap-2 rounded-xl text-sm font-semibold transition',
                    canScan
                      ? 'bg-emerald-500 text-white hover:bg-emerald-400 shadow-lg shadow-emerald-500/25'
                      : 'bg-zinc-100 text-zinc-400'
                  )}
                >
                  <ScanLine className="h-4 w-4" />
                  {loading ? 'Scanning…' : 'Scan item'}
                </Button>

                <div className="flex items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
                  <div className="flex items-center gap-2">
                    {autoScan ? <Zap className="h-3.5 w-3.5 text-emerald-500" /> : <ZapOff className="h-3.5 w-3.5 text-zinc-400" />}
                    <div className="leading-tight">
                      <p className="text-xs font-medium text-zinc-800">Auto-scan</p>
                      <p className="text-[9px] text-zinc-500">
                        {paused ? 'paused — tap ▶ to resume' : `every ${AUTO_SCAN_INTERVAL / 1000}s`}
                      </p>
                    </div>
                  </div>
                  <Switch checked={autoScan} onCheckedChange={setAutoScan} disabled={status !== 'live'} aria-label="Toggle auto-scan" />
                </div>
              </div>

              <LocationBar location={location} detecting={detectingLocation} onRefresh={() => void detectLocation()} />

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
                  onAskGuide={(itemName, loc) => {
                    onOpenChange(false)
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

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { ScanLine, Zap, ZapOff, ShieldCheck } from 'lucide-react'
import { useCamera } from '@/hooks/use-camera'
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

export default function ScanPage() {
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

  const detectLocation = useCallback(async () => {
    setDetectingLocation(true)
    try {
      const loc = await resolveCurrentLocation()
      if (loc) {
        setLocation(loc)
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
    void detectLocation()
  }, [detectLocation])

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
            ? { city: location.city, country: location.country, countryCode: location.countryCode, region: location.region }
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
        id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Date.now() + Math.random()),
        timestamp: Date.now(),
        thumbnail: frame,
        result: data,
      }
      setHistory((h) => [entry, ...h].slice(0, 20))
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Scan failed.'
      setScanError(msg)
      toast({ title: 'Scan failed', description: msg, variant: 'destructive' })
    } finally {
      setLoading(false)
      scanInFlight.current = false
    }
  }, [captureFrame, location, toast])

  useEffect(() => {
    if (!autoScan) return
    if (status !== 'live') return
    const id = setInterval(() => void runScan(), AUTO_SCAN_INTERVAL)
    void runScan()
    return () => clearInterval(id)
  }, [autoScan, status])

  const handleStart = useCallback(() => void start('environment'), [start])
  const handleSwitch = useCallback(() => void switchCamera(), [switchCamera])
  const handleSelectHistory = useCallback((entry: ScanHistoryEntry) => {
    setResult(entry.result)
    setActiveHistoryId(entry.id)
  }, [])

  const canScan = status === 'live' && !loading

  return (
    <div className="min-h-screen bg-white text-zinc-900">
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 opacity-60" style={{ background: 'radial-gradient(60% 50% at 20% 0%, rgba(16,185,129,0.08), transparent 60%), radial-gradient(50% 40% at 90% 10%, rgba(16,185,129,0.05), transparent 60%)' }} />

      <header className="border-b border-zinc-100 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500 text-white shadow-lg shadow-emerald-500/20">
              <ScanLine className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-base font-semibold leading-none text-zinc-900">PriceLens</h1>
              <p className="mt-0.5 text-[11px] text-zinc-500">AI camera price scanner</p>
            </div>
          </div>
          <div className="hidden items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-[11px] text-zinc-500 sm:flex">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
            Frames are analyzed once &amp; not stored
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.05fr_1fr]">
          <div className="space-y-4">
            <Viewfinder videoRef={videoRef} status={status} error={cameraError} scanning={loading} onStart={handleStart} onSwitch={handleSwitch} />
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button size="lg" onClick={() => void runScan()} disabled={!canScan} className={cn('flex-1 gap-2 rounded-xl text-base font-semibold transition', canScan ? 'bg-emerald-500 text-white hover:bg-emerald-400 shadow-lg shadow-emerald-500/25' : 'bg-zinc-100 text-zinc-400')}>
                <ScanLine className="h-5 w-5" />
                {loading ? 'Scanning…' : 'Scan item'}
              </Button>
              <div className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5">
                <div className="flex items-center gap-2.5">
                  {autoScan ? <Zap className="h-4 w-4 text-emerald-500" /> : <ZapOff className="h-4 w-4 text-zinc-400" />}
                  <div className="leading-tight">
                    <p className="text-sm font-medium text-zinc-800">Auto-scan</p>
                    <p className="text-[10px] text-zinc-500">every {AUTO_SCAN_INTERVAL / 1000}s</p>
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
          <div className="space-y-4">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
              <ResultsPanel result={result} loading={loading} error={scanError} />
            </motion.div>
            <div className="hidden lg:block">
              <HistoryList history={history} onSelect={handleSelectHistory} onClear={() => setHistory([])} activeId={activeHistoryId} />
            </div>
          </div>
        </div>

        <section className="mt-10">
          <h2 className="mb-3 text-sm font-medium text-zinc-400">How it works</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <HowItWorksCard step="01" title="Point your camera" body="Allow camera access and aim at any product — a snack, a gadget, a bottle, anything." />
            <HowItWorksCard step="02" title="AI identifies it" body="A vision model recognises the product, brand and variant from a single frame." />
            <HowItWorksCard step="03" title="Live local pricing" body="We web-search for the item near your location and summarise a realistic price range." />
          </div>
        </section>
      </main>

      <footer className="mt-auto border-t border-zinc-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-4 text-center sm:flex-row sm:px-6 sm:text-left">
          <p className="text-xs text-zinc-500">PriceLens — AI-powered live camera price scanner. Prices are estimates from public web sources. No images stored</p>
        </div>
      </footer>
    </div>
  )
}

function HowItWorksCard({ step, title, body }: { step: string; title: string; body: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
      <p className="mb-2 text-xs font-bold tracking-wider text-emerald-500">{step}</p>
      <h3 className="mb-1 text-sm font-semibold text-zinc-900">{title}</h3>
      <p className="text-xs leading-relaxed text-zinc-500">{body}</p>
    </div>
  )
}

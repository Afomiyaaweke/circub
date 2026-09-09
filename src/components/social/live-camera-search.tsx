'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Camera, X, Loader2, ScanLine, AlertTriangle } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface PriceInfo {
  source: 'internal' | 'external'
  currency: string
  min: number
  max: number
  sampleCount: number
  city?: string | null
  country?: string | null
}

interface DetectedItem {
  label: string
  category: string
  box: { x: number; y: number; w: number; h: number }
  price: PriceInfo | null
  parent?: string | null
  isWholeProduct?: boolean
}

const SCAN_INTERVAL_MS = 2500

function formatPrice(p: PriceInfo) {
  const range = p.min === p.max ? `${p.min}` : `${p.min}–${p.max}`
  return `${p.currency} ${range}`
}

export function LiveCameraSearchButton({ onPickItem }: { onPickItem: (label: string) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="bg-card border-primary/30 gap-1.5 h-9 px-3 text-xs shrink-0"
        title="Point your camera at an outfit or product and see live prices for each item detected."
      >
        <ScanLine className="w-3.5 h-3.5 text-primary" />
        <span className="hidden sm:inline">Live scan</span>
        <span className="sm:hidden">Scan</span>
      </Button>
      <LiveCameraSearchModal open={open} onOpenChange={setOpen} onPickItem={onPickItem} />
    </>
  )
}

function LiveCameraSearchModal({
  open,
  onOpenChange,
  onPickItem,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onPickItem: (label: string) => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const captureCanvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const inFlightRef = useRef(false)

  const [items, setItems] = useState<DetectedItem[]>([])
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  // Bump this to force the camera init effect to re-run (e.g. after the user
  // clicks Retry on a permission error).
  const [retryNonce, setRetryNonce] = useState(0)

  const stopCamera = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    intervalRef.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setReady(false)
    setItems([])
  }, [])

  const captureAndScan = useCallback(async () => {
    if (inFlightRef.current) return
    const video = videoRef.current
    const canvas = captureCanvasRef.current
    if (!video || !canvas || video.readyState < 2) return
    inFlightRef.current = true
    setScanning(true)
    try {
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8))
      if (!blob) return
      const formData = new FormData()
      formData.append('file', blob, 'frame.jpg')
      formData.append('currency', 'USD')
      const res = await fetch('/api/visual-search/scan', { method: 'POST', body: formData })
      if (!res.ok) return
      const data = await res.json()
      setItems(Array.isArray(data.items) ? data.items : [])
      setError(null)
    } catch {
      // Silently skip a failed frame — the next interval tick will retry.
    } finally {
      inFlightRef.current = false
      setScanning(false)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    let cancelled = false

    async function startCamera() {
      // Safety: getUserMedia requires a secure context (HTTPS or localhost).
      // Vercel is HTTPS, but if a user opens via http://<lan-ip>:3000 on their phone,
      // the browser will block camera access — show a specific message.
      if (typeof window !== 'undefined' && window.isSecureContext === false) {
        setError(
          'Camera needs HTTPS. Open https://circub.vercel.app on your phone (not the local IP address) — browsers block camera access on plain HTTP.'
        )
        return
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Your browser does not support camera access. Try the latest Chrome, Safari, or Firefox.')
        return
      }
      try {
        // iOS Safari requires the user to have interacted with the page recently
        // before getUserMedia will work. The click that opened the modal counts,
        // but we add a no-op user-gesture check here just to be safe.
        // Try back camera first; if it fails, fall back to any camera.
        let stream: MediaStream
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { exact: 'environment' } },
            audio: false,
          })
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment' },
            audio: false,
          })
        }
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play().catch(() => {
            // play() can reject if the tab lost focus; the next interval will retry.
          })
        }
        setReady(true)
        setError(null)
        // First scan almost immediately, then on a steady interval — this is what
        // makes the price tags feel "live" as the camera moves over new items.
        captureAndScan()
        intervalRef.current = setInterval(captureAndScan, SCAN_INTERVAL_MS)
      } catch (e: any) {
        // Diagnose the specific failure so the message is actionable.
        const name = e?.name || ''
        const msg = e?.message || ''
        let friendly: string
        if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
          friendly =
            'Camera permission was blocked. Tap the lock icon (🔒 or ⓘ) in your browser address bar → Site settings → allow Camera, then click Retry below.'
        } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
          friendly = 'No camera found on this device. Connect a webcam or try a different device.'
        } else if (name === 'NotReadableError' || name === 'TrackStartError') {
          friendly =
            'Camera is in use by another app (Zoom, Meet, another browser tab). Close that app, then click Retry below.'
        } else if (name === 'OverconstrainedError') {
          friendly = 'The back camera is not available. Click Retry to try the front camera.'
        } else if (name === 'SecurityError') {
          friendly = 'Camera blocked for security reasons. Make sure you are on HTTPS, not a raw IP address.'
        } else {
          friendly = `Camera failed to start: ${msg || name || 'unknown error'}. Click Retry below.`
        }
        setError(friendly)
      }
    }
    ;(async () => {
      await startCamera()
    })()
    return () => {
      cancelled = true
      stopCamera()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, retryNonce, stopCamera, captureAndScan])

  // Retry button handler — bump retryNonce to force the camera init effect to re-run.
  const handleRetry = useCallback(() => {
    stopCamera()
    setError(null)
    setReady(false)
    setItems([])
    setRetryNonce((n) => n + 1)
  }, [stopCamera])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden bg-black border-none">
        <DialogTitle className="sr-only">Live camera price scan</DialogTitle>
        <div className="relative w-full aspect-[3/4] sm:aspect-video bg-black">
          <video ref={videoRef} muted playsInline className="absolute inset-0 w-full h-full object-cover" />
          <canvas ref={captureCanvasRef} className="hidden" />

          {/* Bounding-box + price overlay, positioned in the same normalized coordinate
              space the video is rendered in, so boxes track detected items as they move.

              Whole products get a solid primary border + large badge. Sub-parts get a
              dashed border + smaller badge with a "part of <parent>" tooltip so users
              can tell the difference between "the whole bottle" and "the bottle cap". */}
          <div className="absolute inset-0 pointer-events-none">
            {items.map((it, i) => {
              const isPart = it.isWholeProduct === false && it.parent
              return (
                <div
                  key={i}
                  className={`absolute rounded-md transition-all duration-300 ${
                    isPart
                      ? 'border border-dashed border-primary/70 shadow-[0_0_0_1px_rgba(0,0,0,0.4)]'
                      : 'border-2 border-primary shadow-[0_0_0_1px_rgba(0,0,0,0.4)]'
                  }`}
                  style={{
                    left: `${it.box.x * 100}%`,
                    top: `${it.box.y * 100}%`,
                    width: `${it.box.w * 100}%`,
                    height: `${it.box.h * 100}%`,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => onPickItem(it.label)}
                    title={isPart ? `Part of: ${it.parent}` : 'Whole product'}
                    className="pointer-events-auto absolute -top-7 left-0 flex items-center gap-1.5 max-w-[240px]"
                  >
                    <Badge
                      className={`shadow-sm whitespace-nowrap gap-1 ${
                        isPart
                          ? 'bg-primary/70 text-primary-foreground text-[10px] px-1.5 py-0.5'
                          : 'bg-primary text-primary-foreground text-[11px] px-1.5 py-0.5'
                      }`}
                    >
                      {isPart && <span className="opacity-70 text-[9px]">part:</span>}
                      <span className="truncate max-w-[100px]">{it.label}</span>
                      {it.price ? (
                        <span className="font-bold">{formatPrice(it.price)}</span>
                      ) : (
                        <span className="opacity-70">no price</span>
                      )}
                    </Badge>
                    {it.price?.source === 'internal' && (
                      <span className="text-[9px] bg-emerald-500 text-white rounded px-1 py-0.5 shadow-sm">local</span>
                    )}
                    {it.price?.source === 'external' && (
                      <span className="text-[9px] bg-amber-500 text-white rounded px-1 py-0.5 shadow-sm">est.</span>
                    )}
                  </button>
                </div>
              )
            })}
          </div>

          {/* Status bar */}
          <div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-2 pointer-events-none">
            <div className="flex items-center gap-1.5 bg-black/60 text-white text-xs rounded-full px-2.5 py-1">
              <span className={`w-1.5 h-1.5 rounded-full ${ready ? 'bg-emerald-400 animate-pulse' : 'bg-muted-foreground'}`} />
              {ready ? (scanning ? 'Scanning…' : 'Live') : 'Starting camera…'}
            </div>
            <Button
              type="button"
              size="icon"
              variant="secondary"
              className="pointer-events-auto rounded-full w-8 h-8 bg-black/60 hover:bg-black/80 text-white border-none"
              onClick={() => onOpenChange(false)}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>

          {!ready && !error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white">
              <Loader2 className="w-6 h-6 animate-spin" />
              <p className="text-sm">Requesting camera access…</p>
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-start gap-3 text-white px-4 sm:px-6 text-center overflow-y-auto py-6 pt-12">
              <AlertTriangle className="w-6 h-6 text-amber-400 shrink-0" />
              <p className="text-sm leading-relaxed max-w-md">{error}</p>

              <div className="flex flex-wrap items-center justify-center gap-2 mt-1">
                <Button
                  type="button"
                  variant="secondary"
                  className="bg-white text-black hover:bg-white/90 gap-1.5 h-9 px-4 shrink-0"
                  onClick={handleRetry}
                >
                  <Camera className="w-4 h-4" /> Retry camera
                </Button>
                <a
                  href="/test-camera"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-white/10 hover:bg-white/20 border border-white/30 text-white text-sm font-medium"
                >
                  <Camera className="w-4 h-4" /> Test camera (new tab)
                </a>
              </div>

              <div className="text-[11px] text-white/70 max-w-md text-left w-full bg-black/30 rounded-lg p-3 mt-1 space-y-3">
                <p className="text-white/90 font-medium">🔴 Why Retry isn't working:</p>
                <p>
                  Your browser <strong>remembered</strong> that you previously denied camera access for this site.
                  Clicking Retry just calls the camera API again — the browser auto-denies without re-asking.
                  You must <strong>manually clear the denial</strong> in browser settings first.
                </p>
                <p className="text-white/90 font-medium pt-2">📋 Step-by-step fix:</p>
                <ol className="space-y-2 text-white/70 list-decimal pl-4">
                  <li>
                    <strong>Desktop Chrome / Edge:</strong>
                    <br />1. Click the camera icon 📷 in the address bar (top-left of URL)
                    <br />2. Or visit <code className="bg-black/40 px-1 rounded">chrome://settings/content/camera</code>
                    <br />3. Find <em>{typeof window !== 'undefined' ? window.location.hostname : 'this site'}</em> → click → Remove
                    <br />4. <strong>Reload this page</strong> (Ctrl/Cmd+R) — the camera prompt will reappear
                  </li>
                  <li>
                    <strong>Desktop Firefox:</strong>
                    <br />1. Click the padlock 🔒 in the address bar
                    <br />2. Clear permissions for this site
                    <br />3. <strong>Reload this page</strong> (Ctrl/Cmd+R)
                  </li>
                  <li>
                    <strong>Desktop Safari:</strong>
                    <br />1. Safari → Settings → Websites → Camera
                    <br />2. Find this site → set to "Ask" or "Allow"
                    <br />3. <strong>Reload this page</strong> (Cmd+R)
                  </li>
                  <li>
                    <strong>iPhone (Safari):</strong>
                    <br />1. iOS Settings → Safari → Camera & Microphone Access → Allow
                    <br />2. Also check iOS Settings → Privacy & Security → Camera → Safari = ON
                    <br />3. Reload the page
                  </li>
                  <li>
                    <strong>Android (Chrome):</strong>
                    <br />1. Tap the lock 🔒 icon next to the URL → Permissions → Camera → Allow
                    <br />2. Or: Settings → Site settings → Camera → find this site → Allow
                    <br />3. Reload the page
                  </li>
                </ol>
                <p className="text-white/90 font-medium pt-2">⚠️ Other common causes:</p>
                <ul className="space-y-1 text-white/70 list-disc pl-4">
                  <li>Camera in use by another app (Zoom, Meet, Teams, another browser tab) → close it</li>
                  <li>Camera needs HTTPS — URL must start with <code className="bg-black/40 px-1 rounded">https://</code> (not http://)</li>
                  <li>No webcam connected → check Device Manager / System Settings</li>
                  <li>Browser blocking camera via extension or policy → try incognito/private window</li>
                </ul>
              </div>
            </div>
          )}
          {ready && items.length === 0 && !scanning && (
            <div className="absolute bottom-3 left-3 right-3 flex items-center justify-center pointer-events-none">
              <div className="flex items-center gap-1.5 bg-black/60 text-white text-xs rounded-full px-3 py-1.5">
                <Camera className="w-3.5 h-3.5" />
                Point the camera at any product · bottle, shoes, outfit, accessory
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

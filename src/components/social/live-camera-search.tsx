'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Camera, X, Loader2, ScanLine, AlertTriangle, RefreshCw, ExternalLink, MapPin } from 'lucide-react'
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

interface ScanLocation {
  country?: string | null
  city?: string | null
  currency?: string | null
  source?: 'client' | 'ip' | 'none'
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
  const [errorName, setErrorName] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  // Location returned by the scan endpoint — used to display "Pricing for:
  // <city>, <country>" in the status bar so the user knows the prices are
  // localized to their area.
  const [scanLocation, setScanLocation] = useState<ScanLocation | null>(null)
  // User-editable location override. When set, this is sent with each scan
  // request so the prices reflect this specific place instead of the
  // auto-detected IP location.
  const [manualLocation, setManualLocation] = useState<string>('')
  const [showLocationEditor, setShowLocationEditor] = useState(false)
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
    // Strict checks: video must have data AND non-zero dimensions before we
    // can capture a frame. Right after play() resolves, readyState can be 2
    // but videoWidth is still 0 on some browsers — the canvas would be 0x0
    // and toBlob would return null. Wait for a real frame.
    if (!video || !canvas) return
    if (video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
      // Try again on the next animation frame instead of waiting for the
      // 2.5s interval — this makes the first scan feel instant.
      requestAnimationFrame(() => setTimeout(captureAndScan, 100))
      return
    }
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

      // Send the user's manual location override (if set) so the backend
      // uses it for location-aware pricing. The user can type any city +
      // country combo (e.g. "Addis Ababa, Ethiopia" or "Tokyo, Japan")
      // and we parse it into country + city client-side.
      if (manualLocation.trim()) {
        const parts = manualLocation.split(',').map((s) => s.trim()).filter(Boolean)
        if (parts.length >= 2) {
          formData.append('city', parts[0])
          formData.append('country', parts[1])
        } else if (parts.length === 1) {
          formData.append('country', parts[0])
        }
      }

      const res = await fetch('/api/visual-search/scan', { method: 'POST', body: formData })
      if (!res.ok) {
        console.warn('[scan] endpoint returned', res.status)
        return
      }
      const data = await res.json()
      const newItems = Array.isArray(data.items) ? data.items : []
      console.log(`[scan] got ${newItems.length} items${newItems.length > 0 ? ': ' + newItems.map(i => i.label).join(', ') : ''}`)
      setItems(newItems)
      if (data.location) setScanLocation(data.location)
      setError(null)
    } catch (e) {
      console.warn('[scan] failed:', e)
      // Silently skip a failed frame — the next interval tick will retry.
    } finally {
      inFlightRef.current = false
      setScanning(false)
    }
  }, [manualLocation])

  useEffect(() => {
    if (!open) return
    let cancelled = false

    async function startCamera() {
      setError(null)
      setErrorName(null)

      // Safety: getUserMedia requires a secure context (HTTPS or localhost).
      if (typeof window !== 'undefined' && window.isSecureContext === false) {
        setError('Camera needs HTTPS. Open https://circub.vercel.app on your phone (not the local IP) — browsers block camera access on plain HTTP.')
        setErrorName('InsecureContext')
        return
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Your browser does not support camera access. Try the latest Chrome, Safari, or Firefox.')
        setErrorName('NoGetUserMedia')
        return
      }

      // Try a sequence of camera constraint variations. Some browsers
      // (mobile Chrome, Safari) re-prompt the user when the constraint
      // shape changes — so even after a previous denial, a fresh attempt
      // with a different constraint can sometimes trigger a new permission
      // prompt.
      const constraintVariants: Array<{ label: string; constraints: MediaStreamConstraints }> = [
        { label: 'back camera (exact)', constraints: { video: { facingMode: { exact: 'environment' } }, audio: false } },
        { label: 'back camera (ideal)', constraints: { video: { facingMode: { ideal: 'environment' } }, audio: false } },
        { label: 'back camera (string)', constraints: { video: { facingMode: 'environment' }, audio: false } },
        { label: 'front camera (ideal)', constraints: { video: { facingMode: { ideal: 'user' } }, audio: false } },
        { label: 'any camera (true)', constraints: { video: true, audio: false } },
      ]

      let stream: MediaStream | null = null
      let lastError: any = null
      for (const variant of constraintVariants) {
        if (cancelled) return
        try {
          stream = await navigator.mediaDevices.getUserMedia(variant.constraints)
          break
        } catch (e: any) {
          lastError = e
          if (e?.name === 'NotAllowedError' || e?.name === 'PermissionDeniedError') {
            // Hard denial — the browser will reject all other variants too.
            break
          }
          // For other errors (OverconstrainedError, NotFoundError), try the next variant.
        }
      }

      if (cancelled && stream) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }
      if (cancelled) return

      if (stream) {
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play().catch(() => {})
        }
        setReady(true)
        setError(null)
        setErrorName(null)
        captureAndScan()
        intervalRef.current = setInterval(captureAndScan, SCAN_INTERVAL_MS)
        return
      }

      // All attempts failed — diagnose.
      const name = lastError?.name || ''
      const msg = lastError?.message || ''
      setErrorName(name)
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setError('Camera permission was blocked. Click "Retry" below — it will reload the page so your browser re-prompts for permission.')
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        setError('No camera found on this device. Connect a webcam or try a different device.')
      } else if (name === 'NotReadableError' || name === 'TrackStartError') {
        setError('Camera is in use by another app (Zoom, Meet, another browser tab). Close that app, then click Retry.')
      } else if (name === 'OverconstrainedError') {
        setError('No camera matched the requested constraints. Click Retry to try a different camera.')
      } else if (name === 'SecurityError') {
        setError('Camera blocked for security reasons. Make sure you are on HTTPS, not a raw IP address.')
      } else {
        setError(`Camera failed to start: ${msg || name || 'unknown error'}. Click Retry below.`)
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

  // RETRY: when permission is denied, just calling getUserMedia again won't
  // work — browsers remember the denial and auto-reject without re-prompting.
  // The most reliable cross-browser way to make Retry actually work is to
  // reload the page. After the user fixes permission in another tab (or clears
  // the denial via the lock icon), a reload re-evaluates the permission state
  // and the camera init effect re-runs fresh.
  //
  // When the user clicks Retry:
  //   - If the permission is still 'denied', we reload the page so they see
  //     the lock-icon instructions on the fresh page and can fix it.
  //   - If the permission state has changed to 'granted' or 'prompt' (e.g.
  //     they cleared the denial in another tab), we just retry the camera
  //     init without a reload.
  const handleRetry = useCallback(async () => {
    stopCamera()
    setError(null)
    setErrorName(null)
    setReady(false)
    setItems([])

    // Check the current permission state via the Permissions API.
    // If it's 'denied', the only way to make retry work is to reload the
    // page after the user clears the denial in browser settings.
    try {
      if (navigator.permissions?.query) {
        const perm = await navigator.permissions.query({ name: 'camera' as PermissionName })
        if (perm.state === 'denied') {
          // Reload — after the user fixes permission in another tab/window,
          // this fresh page will re-prompt properly when they click Live scan again.
          window.location.reload()
          return
        }
      }
    } catch {
      // permissions.query not supported — fall through to retry
    }

    // Permission is 'granted' or 'prompt' — retry the camera init.
    setRetryNonce((n) => n + 1)
  }, [stopCamera])

  // While the modal is open, listen for permission state changes. If the
  // user fixes the permission in another tab (e.g. clears the denial via
  // chrome://settings/content/camera), the change event fires and we can
  // auto-retry without requiring the user to click Retry manually.
  useEffect(() => {
    if (!open) return
    let perm: any = null
    try {
      if (navigator.permissions?.query) {
        navigator.permissions.query({ name: 'camera' as PermissionName }).then((p) => {
          perm = p
          p.onchange = () => {
            if (p.state === 'granted' && !ready && !streamRef.current) {
              // User just granted permission — retry the camera init.
              setRetryNonce((n) => n + 1)
            }
          }
        })
      }
    } catch {}
    return () => {
      if (perm) perm.onchange = null
    }
  }, [open, ready])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden bg-black border-none">
        <DialogTitle className="sr-only">Live camera price scan</DialogTitle>
        <div className="relative w-full aspect-[3/4] sm:aspect-video bg-black">
          <video ref={videoRef} muted playsInline className="absolute inset-0 w-full h-full object-cover" />
          <canvas ref={captureCanvasRef} className="hidden" />

          {/* Bounding-box + price overlay.
              The video uses object-cover, which crops the captured frame to
              fill the container. So a normalized box at (x=0.2, y=0.3, w=0.4, h=0.5)
              on the captured frame does NOT map to the same position on the
              displayed video — there's an offset and scale difference.

              We compute the cover transform: the captured frame is scaled
              up until it fills the container, then centered. The overlay
              lives in the SAME coordinate space as the displayed video, so
              boxes need to be transformed by the inverse of the cover.

              In practice: we measure the container size with a ResizeObserver
              and compute the cover transform on every render. */}
          <BoundingBoxOverlay
            items={items}
            videoRef={videoRef}
            onPickItem={onPickItem}
          />

          {/* Status bar */}
          <div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-2 pointer-events-none">
            <div className="flex items-center gap-2 pointer-events-auto">
              <div className="flex items-center gap-1.5 bg-black/60 text-white text-xs rounded-full px-2.5 py-1">
                <span className={`w-1.5 h-1.5 rounded-full ${ready ? 'bg-emerald-400 animate-pulse' : 'bg-muted-foreground'}`} />
                {ready ? (scanning ? 'Scanning…' : 'Live') : 'Starting camera…'}
              </div>
              {/* Location indicator — shows the user where the prices are localized to.
                  Click to open the location editor and override. */}
              {ready && (
                <button
                  type="button"
                  onClick={() => setShowLocationEditor((v) => !v)}
                  className="flex items-center gap-1 bg-black/60 text-white text-xs rounded-full px-2.5 py-1 hover:bg-black/80 transition-colors"
                  title="Click to change the location used for pricing"
                >
                  <MapPin className="w-3 h-3" />
                  <span className="truncate max-w-[140px] sm:max-w-[200px]">
                    {manualLocation.trim()
                      ? manualLocation
                      : scanLocation?.city && scanLocation?.country
                        ? `${scanLocation.city}, ${scanLocation.country}`
                        : scanLocation?.country
                          ? scanLocation.country
                          : scanLocation?.source === 'ip'
                            ? 'Auto-detected location'
                            : 'Set location'}
                  </span>
                </button>
              )}
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

          {/* Location editor panel — opens when the user taps the location badge */}
          {ready && showLocationEditor && (
            <div className="absolute top-14 left-3 right-3 sm:right-auto sm:w-80 bg-black/85 backdrop-blur-md border border-white/20 rounded-lg p-3 z-10 pointer-events-auto">
              <p className="text-xs text-white/80 mb-2 font-medium">Set pricing location</p>
              <input
                type="text"
                value={manualLocation}
                onChange={(e) => setManualLocation(e.target.value)}
                placeholder="City, Country (e.g. Addis Ababa, Ethiopia)"
                className="w-full bg-black/60 border border-white/30 rounded px-2 py-1.5 text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-primary"
              />
              <div className="flex items-center gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => {
                    setManualLocation('')
                    setShowLocationEditor(false)
                  }}
                  className="text-xs text-white/70 hover:text-white px-2 py-1"
                >
                  Use auto-detected
                </button>
                <button
                  type="button"
                  onClick={() => setShowLocationEditor(false)}
                  className="ml-auto text-xs bg-white text-black px-3 py-1 rounded hover:bg-white/90 font-medium"
                >
                  Done
                </button>
              </div>
              <p className="text-[10px] text-white/50 mt-2 leading-relaxed">
                Prices will reflect local market rates in this location. Format: "City, Country" or just "Country".
                Examples: "Tokyo, Japan" · "Nairobi, Kenya" · "United States"
              </p>
            </div>
          )}

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
                  <RefreshCw className="w-4 h-4" /> Retry
                </Button>
              </div>

              {/* Inline quick-fix panel — only shown when permission is denied.
                  This is intentionally compact because the Retry button now
                  handles the reload-for-you case. */}
              {errorName === 'NotAllowedError' || errorName === 'PermissionDeniedError' ? (
                <div className="text-[11px] text-white/70 max-w-md text-left w-full bg-black/30 rounded-lg p-3 mt-1 space-y-2">
                  <p className="text-white/90 font-medium">📋 If Retry still fails, fix it in your browser:</p>
                  <ul className="space-y-1.5 text-white/70 list-disc pl-4">
                    <li>
                      <strong>Chrome / Edge:</strong> Open{' '}
                      <code className="bg-black/40 px-1 rounded">chrome://settings/content/camera</code> in a new tab →
                      remove <code className="bg-black/40 px-1 rounded">{typeof window !== 'undefined' ? window.location.hostname : 'this site'}</code> → come back and click Retry
                    </li>
                    <li>
                      <strong>Firefox:</strong> Click the 🔒 padlock → Clear permissions for this site → click Retry
                    </li>
                    <li>
                      <strong>Safari (Mac):</strong> Safari → Settings → Websites → Camera → set this site to Allow → click Retry
                    </li>
                    <li>
                      <strong>iPhone (Safari):</strong> iOS Settings → Safari → Camera access → Allow → reload this page
                    </li>
                    <li>
                      <strong>Android (Chrome):</strong> Tap the 🔒 lock → Permissions → Camera → Allow → reload this page
                    </li>
                  </ul>
                  <p className="text-white/60 text-xs pt-2 border-t border-white/10 mt-2">
                    💡 Tip: open this page in an <strong>Incognito / Private window</strong> to confirm the camera works — those windows don't remember denials.
                  </p>
                </div>
              ) : null}
            </div>
          )}
          {/* Always show a hint at the bottom when no items have been detected
              yet, even while scanning. This is the user's clearest signal that
              the scanner is actively looking — without it, the camera just
              shows a black feed with no feedback. */}
          {ready && items.length === 0 && (
            <div className="absolute bottom-3 left-3 right-3 flex items-center justify-center pointer-events-none">
              <div className="flex items-center gap-2 bg-black/70 text-white text-xs rounded-full px-3 py-1.5">
                {scanning ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Scanning for products…</span>
                  </>
                ) : (
                  <>
                    <Camera className="w-3.5 h-3.5" />
                    <span>Point the camera at any product · bottle, shoes, outfit, fruit, electronics</span>
                  </>
                )}
              </div>
            </div>
          )}
          {/* When items ARE detected, show a small "live count" badge in the
              bottom-right so the user can see the scanner is still working
              (every 2.5s a fresh scan runs). */}
          {ready && items.length > 0 && (
            <div className="absolute bottom-3 right-3 flex items-center gap-1.5 bg-black/60 text-white text-xs rounded-full px-2.5 py-1 pointer-events-none">
              {scanning ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              )}
              <span>{items.length} item{items.length !== 1 && 's'} · {scanning ? 'scanning' : 'live'}</span>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// BoundingBoxOverlay — renders bounding boxes over the video, correctly
// aligned even when the video uses `object-cover` (which crops the captured
// frame to fill the container).
//
// How it works:
//   1. We measure the displayed video element's size with a ResizeObserver
//   2. We read the video's intrinsic frame size (videoWidth, videoHeight)
//   3. We compute the cover scale: max(containerW/frameW, containerH/frameH)
//   4. The cover offset centers the scaled-up frame in the container
//   5. Each normalized box (0-1) is then transformed: multiply by frame size
//      to get pixel coords in the frame, apply scale + offset to get
//      pixel coords in the container, divide by container size to get
//      normalized coords in the overlay.
//
// Without this transform, boxes drawn at normalized 0-1 positions on the
// overlay would not line up with the actual items in the cropped video.
function BoundingBoxOverlay({
  items,
  videoRef,
  onPickItem,
}: {
  items: DetectedItem[]
  videoRef: React.RefObject<HTMLVideoElement>
  onPickItem: (label: string) => void
}) {
  // Force a re-render whenever the video element's display size changes
  // (e.g. window resize, modal open/close, mobile orientation change).
  const [, setRenderNonce] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const video = videoRef.current
    const container = containerRef.current
    if (!video || !container) return

    const update = () => setRenderNonce((n) => n + 1)
    const ro = new ResizeObserver(update)
    ro.observe(container)
    // Also re-render when the video metadata loads (videoWidth becomes available)
    video.addEventListener('loadedmetadata', update)
    return () => {
      ro.disconnect()
      video.removeEventListener('loadedmetadata', update)
    }
  }, [videoRef])

  // Compute the cover transform.
  const video = videoRef.current
  const container = containerRef.current
  let scaleX = 1, scaleY = 1, offsetX = 0, offsetY = 0
  if (video && container && video.videoWidth > 0 && video.videoHeight > 0) {
    const cw = container.clientWidth
    const ch = container.clientHeight
    const vw = video.videoWidth
    const vh = video.videoHeight
    // object-cover: scale = max(cw/vw, ch/vh)
    const scale = Math.max(cw / vw, ch / vh)
    scaleX = scaleY = scale
    offsetX = (cw - vw * scale) / 2
    offsetY = (ch - vh * scale) / 2
  }

  // Transform a normalized box (0-1 in the captured frame) to its position
  // in the displayed container (also normalized 0-1).
  const transform = (box: { x: number; y: number; w: number; h: number }) => {
    const containerW = container?.clientWidth || 1
    const containerH = container?.clientHeight || 1
    // Convert normalized coords to frame pixel coords, then to container
    // pixel coords via the cover transform, then back to normalized 0-1
    // in the container (which is what the CSS % values expect).
    const px = (box.x * video!.videoWidth * scaleX + offsetX) / containerW
    const py = (box.y * video!.videoHeight * scaleY + offsetY) / containerH
    const pw = (box.w * video!.videoWidth * scaleX) / containerW
    const ph = (box.h * video!.videoHeight * scaleY) / containerH
    return { px, py, pw, ph }
  }

  return (
    <div ref={containerRef} className="absolute inset-0 pointer-events-none">
      {items.map((it, i) => {
        const isPart = it.isWholeProduct === false && it.parent
        // If we don't have video dimensions yet, fall back to raw normalized
        // coords (boxes will be slightly off but still visible).
        const hasVideoDims = video && video.videoWidth > 0 && video.videoHeight > 0
        const left = hasVideoDims ? `${transform(it.box).px * 100}%` : `${it.box.x * 100}%`
        const top = hasVideoDims ? `${transform(it.box).py * 100}%` : `${it.box.y * 100}%`
        const width = hasVideoDims ? `${transform(it.box).pw * 100}%` : `${it.box.w * 100}%`
        const height = hasVideoDims ? `${transform(it.box).ph * 100}%` : `${it.box.h * 100}%`
        return (
          <div
            key={i}
            className={`absolute rounded-md transition-all duration-300 ${
              isPart
                ? 'border border-dashed border-primary/70 shadow-[0_0_0_1px_rgba(0,0,0,0.4)]'
                : 'border-2 border-primary shadow-[0_0_0_1px_rgba(0,0,0,0.4)]'
            }`}
            style={{ left, top, width, height }}
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
  )
}

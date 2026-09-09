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
    ;(async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
        }
        setReady(true)
        setError(null)
        // First scan almost immediately, then on a steady interval — this is what
        // makes the price tags feel "live" as the camera moves over new items.
        captureAndScan()
        intervalRef.current = setInterval(captureAndScan, SCAN_INTERVAL_MS)
      } catch (e) {
        setError('Camera access denied or unavailable. Check your browser permissions.')
      }
    })()
    return () => {
      cancelled = true
      stopCamera()
    }
  }, [open, stopCamera, captureAndScan])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden bg-black border-none">
        <DialogTitle className="sr-only">Live camera price scan</DialogTitle>
        <div className="relative w-full aspect-[3/4] sm:aspect-video bg-black">
          <video ref={videoRef} muted playsInline className="absolute inset-0 w-full h-full object-cover" />
          <canvas ref={captureCanvasRef} className="hidden" />

          {/* Bounding-box + price overlay, positioned in the same normalized coordinate
              space the video is rendered in, so boxes track detected items as they move. */}
          <div className="absolute inset-0 pointer-events-none">
            {items.map((it, i) => (
              <div
                key={i}
                className="absolute border-2 border-primary rounded-md shadow-[0_0_0_1px_rgba(0,0,0,0.4)] transition-all duration-300"
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
                  className="pointer-events-auto absolute -top-7 left-0 flex items-center gap-1.5 max-w-[220px]"
                >
                  <Badge className="bg-primary text-primary-foreground shadow-sm whitespace-nowrap text-[11px] px-1.5 py-0.5 gap-1">
                    <span className="truncate max-w-[100px]">{it.label}</span>
                    {it.price ? (
                      <span className="font-bold">{formatPrice(it.price)}</span>
                    ) : (
                      <span className="opacity-70">no price yet</span>
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
            ))}
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
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white px-6 text-center">
              <AlertTriangle className="w-6 h-6 text-amber-400" />
              <p className="text-sm">{error}</p>
            </div>
          )}
          {ready && items.length === 0 && !scanning && (
            <div className="absolute bottom-3 left-3 right-3 flex items-center justify-center pointer-events-none">
              <div className="flex items-center gap-1.5 bg-black/60 text-white text-xs rounded-full px-3 py-1.5">
                <Camera className="w-3.5 h-3.5" />
                Point the camera at an outfit, shoes, or accessories
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

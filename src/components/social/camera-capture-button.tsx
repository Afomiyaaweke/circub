'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Camera, X, Loader2, RefreshCw, Check } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

// CameraCaptureButton — opens the device camera, lets the user snap a
// photo, and passes the captured File to the parent for image search.
// Uses the existing /api/visual-search endpoint (which uses Z.ai's API,
// the same one that powers chat.z.ai) to extract search keywords from
// the captured frame.
//
// This is intentionally a simple "snap one photo and search" flow — NOT
// the live-scanning bounding-box overlay we removed earlier. The user
// takes a single photo and we extract search keywords from it, then
// filter the Local Price Feed by those keywords.
export function CameraCaptureButton({ onCapture, loading }: { onCapture: (file: File) => void; loading: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={loading}
        className="bg-card border-primary/30 gap-1.5 h-9 px-3 text-xs shrink-0"
        title="Open the camera, snap a photo of a product, and search the Local Price Feed by what's in the picture."
      >
        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" /> : <Camera className="w-3.5 h-3.5 text-primary" />}
        <span className="hidden sm:inline">Use camera</span>
        <span className="sm:hidden">Camera</span>
      </Button>
      <CameraCaptureModal open={open} onOpenChange={setOpen} onCapture={onCapture} />
    </>
  )
}

function CameraCaptureModal({
  open,
  onOpenChange,
  onCapture,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onCapture: (file: File) => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [errorName, setErrorName] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [retryNonce, setRetryNonce] = useState(0)
  const [capturing, setCapturing] = useState(false)

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setReady(false)
  }, [])

  useEffect(() => {
    if (!open) return
    let cancelled = false

    async function startCamera() {
      setError(null)
      setErrorName(null)

      if (typeof window !== 'undefined' && window.isSecureContext === false) {
        setError('Camera needs HTTPS. Open https://circub.vercel.app on your phone (not the local IP address) — browsers block camera access on plain HTTP.')
        setErrorName('InsecureContext')
        return
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Your browser does not support camera access. Try the latest Chrome, Safari, or Firefox.')
        setErrorName('NoGetUserMedia')
        return
      }

      // Try back camera first, fall back to any camera
      let stream: MediaStream
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { exact: 'environment' } },
          audio: false,
        })
      } catch {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment' },
            audio: false,
          })
        } catch (e2: any) {
          throw e2
        }
      }
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play().catch(() => {})
      }
      setReady(true)
      setError(null)
      setErrorName(null)
    }

    startCamera().catch((e: any) => {
      const name = e?.name || ''
      setErrorName(name)
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setError('Camera permission was blocked. Tap the lock icon in your browser address bar → Site settings → allow Camera, then click Retry.')
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        setError('No camera found on this device. Connect a webcam or try a different device.')
      } else if (name === 'NotReadableError' || name === 'TrackStartError') {
        setError('Camera is in use by another app (Zoom, Meet, another browser tab). Close that app, then click Retry.')
      } else if (name === 'OverconstrainedError') {
        setError('The back camera is not available. Click Retry to try the front camera.')
      } else if (name === 'SecurityError') {
        setError('Camera blocked for security reasons. Make sure you are on HTTPS, not a raw IP address.')
      } else {
        setError(`Camera failed to start: ${e?.message || name || 'unknown error'}. Click Retry below.`)
      }
    })

    return () => {
      cancelled = true
      stopCamera()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, retryNonce, stopCamera])

  const handleRetry = useCallback(async () => {
    stopCamera()
    setError(null)
    setErrorName(null)
    setReady(false)
    try {
      if (navigator.permissions?.query) {
        const perm = await navigator.permissions.query({ name: 'camera' as PermissionName })
        if (perm.state === 'denied') {
          window.location.reload()
          return
        }
      }
    } catch {}
    setRetryNonce((n) => n + 1)
  }, [stopCamera])

  // Capture a single frame from the video stream as a JPEG File, then
  // pass it to the parent's onCapture handler (which calls /api/visual-search
  // to extract search keywords).
  const handleCapture = useCallback(async () => {
    const video = videoRef.current
    if (!video || !ready || video.videoWidth === 0) return
    setCapturing(true)
    try {
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85))
      if (!blob) return
      const file = new File([blob], `camera-capture-${Date.now()}.jpg`, { type: 'image/jpeg' })
      // Close the camera modal first, then pass the file to the parent
      // so the parent can show the loading state on the button.
      stopCamera()
      setOpen(false)
      onCapture(file)
    } catch (e) {
      console.error('[camera] capture failed', e)
    } finally {
      setCapturing(false)
    }
  }, [ready, onCapture, stopCamera])

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) stopCamera(); onOpenChange(v) }}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden bg-black border-none">
        <DialogTitle className="sr-only">Take a photo to search prices</DialogTitle>
        <div className="relative w-full aspect-[3/4] sm:aspect-video bg-black">
          <video ref={videoRef} muted playsInline className="absolute inset-0 w-full h-full object-cover" />

          {/* Status bar */}
          <div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-2 pointer-events-none">
            <div className="flex items-center gap-1.5 bg-black/60 text-white text-xs rounded-full px-2.5 py-1">
              <span className={`w-1.5 h-1.5 rounded-full ${ready ? 'bg-emerald-400 animate-pulse' : 'bg-muted-foreground'}`} />
              {ready ? 'Ready' : 'Starting camera…'}
            </div>
            <Button
              type="button"
              size="icon"
              variant="secondary"
              className="pointer-events-auto rounded-full w-8 h-8 bg-black/60 hover:bg-black/80 text-white border-none"
              onClick={() => { stopCamera(); onOpenChange(false) }}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>

          {/* Loading */}
          {!ready && !error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white">
              <Loader2 className="w-6 h-6 animate-spin" />
              <p className="text-sm">Requesting camera access…</p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white px-4 sm:px-6 text-center overflow-y-auto py-6 pt-12">
              <p className="text-sm leading-relaxed max-w-md">{error}</p>
              <Button
                type="button"
                variant="secondary"
                className="bg-white text-black hover:bg-white/90 gap-1.5 h-9 px-4 shrink-0"
                onClick={handleRetry}
              >
                <RefreshCw className="w-4 h-4" /> Retry
              </Button>
              <p className="text-[11px] text-white/60 max-w-md mt-1">
                Tip: open this page in an Incognito/Private window to confirm the camera works —
                those windows don't remember previous permission denials.
              </p>
            </div>
          )}

          {/* Ready hint + capture button */}
          {ready && (
            <>
              <div className="absolute bottom-3 left-3 right-3 flex items-center justify-center pointer-events-none">
                <div className="flex items-center gap-1.5 bg-black/60 text-white text-xs rounded-full px-3 py-1.5">
                  <Camera className="w-3.5 h-3.5" />
                  Point the camera at a product, then tap Capture
                </div>
              </div>
              <div className="absolute bottom-14 left-1/2 -translate-x-1/2 pointer-events-auto">
                <Button
                  type="button"
                  onClick={handleCapture}
                  disabled={capturing}
                  className="bg-white text-black hover:bg-white/90 gap-2 h-12 px-6 rounded-full font-medium shadow-lg"
                >
                  {capturing ? (
                    <><Loader2 className="w-5 h-5 animate-spin" /> Capturing…</>
                  ) : (
                    <><Check className="w-5 h-5" /> Capture & search</>
                  )}
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

'use client'

import { Camera, CameraOff, Loader2, RefreshCw, ScanLine, QrCode, Package } from 'lucide-react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import type { CameraStatus } from '@/hooks/use-camera'
import { cn } from '@/lib/utils'
import { useEffect, useRef, useCallback, useState } from 'react'
import jsQR from 'jsqr'

interface BBox {
  label: string
  x: number // normalized 0-1
  y: number
  w: number
  h: number
  color: string
}

interface ViewfinderProps {
  videoRef: React.RefObject<HTMLVideoElement | null>
  status: CameraStatus
  error: string | null
  scanning: boolean
  onStart: () => void
  onSwitch: () => void
  onQRDetected?: (data: string) => void
  /** Bounding boxes to overlay on the video — used for item detection results */
  boxes?: BBox[]
}

export function Viewfinder({ videoRef, status, error, scanning, onStart, onSwitch, onQRDetected, boxes }: ViewfinderProps) {
  const isLive = status === 'live'
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const qrIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastQRRef = useRef<string | null>(null)
  const [qrFlash, setQrFlash] = useState(false)

  const scanForQR = useCallback(() => {
    const video = videoRef.current
    if (!video || video.readyState < 2 || video.videoWidth === 0) return
    const canvas = qrCanvasRef.current
    if (!canvas) return
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'dontInvert' })
    if (code && code.data && onQRDetected) {
      if (lastQRRef.current !== code.data) {
        lastQRRef.current = code.data
        setQrFlash(true)
        setTimeout(() => setQrFlash(false), 600)
        onQRDetected(code.data)
      }
    }
  }, [videoRef, onQRDetected])

  useEffect(() => {
    if (isLive && onQRDetected) {
      qrIntervalRef.current = setInterval(scanForQR, 500)
      return () => {
        if (qrIntervalRef.current) clearInterval(qrIntervalRef.current)
        qrIntervalRef.current = null
      }
    }
  }, [isLive, onQRDetected, scanForQR])

  useEffect(() => {
    if (!isLive) lastQRRef.current = null
  }, [isLive])

  return (
    <div className={cn(
      'relative w-full aspect-[4/3] sm:aspect-square overflow-hidden rounded-2xl border bg-black shadow-xl transition-colors',
      qrFlash ? 'border-emerald-400 ring-4 ring-emerald-400/30' : 'border-emerald-500/20',
      'shadow-emerald-500/10'
    )}>
      <video
        ref={videoRef}
        className={cn('h-full w-full object-cover transition-opacity duration-500', isLive ? 'opacity-100' : 'opacity-0')}
        playsInline
        muted
        autoPlay
      />
      <canvas ref={qrCanvasRef} className="hidden" />

      {/* QR flash overlay */}
      {qrFlash && (
        <div className="absolute inset-0 bg-emerald-400/20 animate-pulse pointer-events-none z-30" />
      )}

      {/* Corner brackets */}
      {isLive && (
        <>
          <Bracket className="left-3 top-3 border-l-2 border-t-2 rounded-tl-lg" />
          <Bracket className="right-3 top-3 border-r-2 border-t-2 rounded-tr-lg" />
          <Bracket className="left-3 bottom-3 border-l-2 border-b-2 rounded-bl-lg" />
          <Bracket className="right-3 bottom-3 border-r-2 border-b-2 rounded-br-lg" />
        </>
      )}

      {/* Animated scan line */}
      {isLive && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <motion.div
            className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_18px_4px_rgba(16,185,129,0.55)]"
            initial={{ top: '8%' }}
            animate={scanning ? { top: ['8%', '92%', '8%'] } : { top: '50%', opacity: 0.35 }}
            transition={scanning ? { duration: 1.6, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.4 }}
          />
        </div>
      )}

      {/* Grid overlay */}
      {isLive && (
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: 'linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)',
            backgroundSize: '33.33% 33.33%',
          }}
        />
      )}

      {/* Bounding boxes — like the screenshot the user provided.
          Colored rectangles with labels above each box, matching the
          computer-vision detection visualization style. */}
      {isLive && boxes && boxes.length > 0 && (
        <div className="absolute inset-0 pointer-events-none z-20">
          {boxes.map((box, i) => {
            // Account for object-cover cropping — the video fills the
            // container, so normalized 0-1 coords map directly to the
            // container's percentage dimensions.
            return (
              <div
                key={i}
                className="absolute"
                style={{
                  left: `${box.x * 100}%`,
                  top: `${box.y * 100}%`,
                  width: `${box.w * 100}%`,
                  height: `${box.h * 100}%`,
                }}
              >
                {/* Box border */}
                <div
                  className="absolute inset-0 rounded-md"
                  style={{ border: `2px solid ${box.color}` }}
                />
                {/* Label above the box */}
                <div
                  className="absolute -top-6 left-0 flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold text-white whitespace-nowrap"
                  style={{ backgroundColor: box.color }}
                >
                  {box.label}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Center reticle */}
      {isLive && !scanning && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <ScanLine className="h-8 w-8 text-emerald-400/40" />
        </div>
      )}

      {/* QR badge */}
      {isLive && (
        <div className="absolute right-12 top-3 flex items-center gap-1.5 rounded-full border border-white/15 bg-black/50 px-2.5 py-1 text-[10px] font-medium text-white backdrop-blur z-20">
          <QrCode className="h-3 w-3 text-emerald-400" />
          QR + Items
        </div>
      )}

      {/* Scanning overlay */}
      {scanning && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/45 backdrop-blur-[2px] z-30">
          <div className="relative flex h-16 w-16 items-center justify-center">
            <motion.div
              className="absolute inset-0 rounded-full border-2 border-emerald-400/30"
              animate={{ scale: [1, 1.35, 1], opacity: [0.6, 0, 0.6] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'easeOut' }}
            />
            <div className="flex h-14 w-14 items-center justify-center rounded-full border border-emerald-400/50 bg-emerald-500/10">
              <Loader2 className="h-6 w-6 animate-spin text-emerald-300" />
            </div>
          </div>
          <p className="text-sm font-medium text-emerald-50">Analyzing item…</p>
        </div>
      )}

      {/* Permission / start overlay */}
      {!isLive && !scanning && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-gradient-to-b from-zinc-100 to-zinc-200 p-6 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/10">
            {status === 'denied' || status === 'error' ? (
              <CameraOff className="h-7 w-7 text-rose-400" />
            ) : (
              <Camera className="h-7 w-7 text-emerald-500" />
            )}
          </div>
          <div className="space-y-1">
            <p className="text-base font-semibold text-zinc-900">
              {status === 'denied' ? 'Camera access blocked' : status === 'error' ? 'Camera unavailable' : status === 'unsupported' ? 'Camera not supported' : 'Point. Scan. Price it.'}
            </p>
            <p className="mx-auto max-w-xs text-sm text-zinc-500">
              {status === 'denied' ? 'Allow camera permission in your browser, then retry.'
                : status === 'error' || status === 'unsupported' ? error || 'We could not access a camera on this device.'
                : 'Allow camera access to scan products, QR codes, or items for live local prices.'}
            </p>
          </div>
          <Button onClick={onStart} className="bg-emerald-500 text-white hover:bg-emerald-400">
            {status === 'requesting' ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Requesting…</>
            ) : status === 'denied' || status === 'error' ? (
              <><RefreshCw className="h-4 w-4" /> Retry</>
            ) : (
              <><Camera className="h-4 w-4" /> Start camera</>
            )}
          </Button>
        </div>
      )}

      {/* Switch camera */}
      {isLive && !scanning && (
        <button
          onClick={onSwitch}
          aria-label="Switch camera"
          className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-black/50 text-white backdrop-blur transition hover:bg-black/70 z-20"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      )}

      {/* LIVE badge */}
      {isLive && (
        <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full border border-white/15 bg-black/50 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur z-20">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
          </span>
          LIVE
        </div>
      )}
    </div>
  )
}

function Bracket({ className }: { className: string }) {
  return <div className={cn('pointer-events-none absolute h-7 w-7 border-emerald-400/80', className)} />
}

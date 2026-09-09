'use client'

import { Camera, CameraOff, Loader2, RefreshCw, ScanLine } from 'lucide-react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import type { CameraStatus } from '@/hooks/use-camera'
import { cn } from '@/lib/utils'

interface ViewfinderProps {
  videoRef: React.RefObject<HTMLVideoElement | null>
  status: CameraStatus
  error: string | null
  scanning: boolean
  onStart: () => void
  onSwitch: () => void
}

export function Viewfinder({
  videoRef,
  status,
  error,
  scanning,
  onStart,
  onSwitch,
}: ViewfinderProps) {
  const isLive = status === 'live'

  return (
    <div className="relative w-full aspect-[4/3] sm:aspect-square overflow-hidden rounded-2xl border border-emerald-500/20 bg-black shadow-2xl shadow-emerald-950/40">
      {/* Video element always mounted so the ref is stable. */}
      <video
        ref={videoRef}
        className={cn(
          'h-full w-full object-cover transition-opacity duration-500',
          isLive ? 'opacity-100' : 'opacity-0'
        )}
        playsInline
        muted
        autoPlay
      />

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
            animate={
              scanning
                ? { top: ['8%', '92%', '8%'] }
                : { top: '50%', opacity: 0.35 }
            }
            transition={
              scanning
                ? { duration: 1.6, repeat: Infinity, ease: 'easeInOut' }
                : { duration: 0.4 }
            }
          />
        </div>
      )}

      {/* Grid overlay (subtle) */}
      {isLive && (
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)',
            backgroundSize: '33.33% 33.33%',
          }}
        />
      )}

      {/* Center reticle when idle (live but not scanning) */}
      {isLive && !scanning && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <ScanLine className="h-8 w-8 text-emerald-400/40" />
        </div>
      )}

      {/* Scanning overlay */}
      {scanning && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/45 backdrop-blur-[2px]">
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
          <p className="text-sm font-medium text-emerald-50">
            Analyzing item…
          </p>
        </div>
      )}

      {/* Permission / start overlay */}
      {!isLive && !scanning && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-gradient-to-b from-zinc-900 to-black p-6 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/10">
            {status === 'denied' || status === 'error' ? (
              <CameraOff className="h-7 w-7 text-rose-300" />
            ) : (
              <Camera className="h-7 w-7 text-emerald-300" />
            )}
          </div>
          <div className="space-y-1">
            <p className="text-base font-semibold text-white">
              {status === 'denied'
                ? 'Camera access blocked'
                : status === 'error'
                ? 'Camera unavailable'
                : status === 'unsupported'
                ? 'Camera not supported'
                : 'Point. Scan. Price it.'}
            </p>
            <p className="mx-auto max-w-xs text-sm text-zinc-400">
              {status === 'denied'
                ? 'Allow camera permission in your browser, then retry.'
                : status === 'error' || status === 'unsupported'
                ? error || 'We could not access a camera on this device.'
                : 'Allow camera access to start scanning items for live local prices.'}
            </p>
          </div>
          <Button
            onClick={onStart}
            className="bg-emerald-500 text-emerald-950 hover:bg-emerald-400"
          >
            {status === 'requesting' ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Requesting…
              </>
            ) : status === 'denied' || status === 'error' ? (
              <>
                <RefreshCw className="h-4 w-4" /> Retry
              </>
            ) : (
              <>
                <Camera className="h-4 w-4" /> Start camera
              </>
            )}
          </Button>
        </div>
      )}

      {/* Top-right switch camera */}
      {isLive && !scanning && (
        <button
          onClick={onSwitch}
          aria-label="Switch camera"
          className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-black/50 text-white backdrop-blur transition hover:bg-black/70"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      )}

      {/* Live badge */}
      {isLive && (
        <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full border border-white/15 bg-black/50 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur">
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
  return (
    <div
      className={cn(
        'pointer-events-none absolute h-7 w-7 border-emerald-400/80',
        className
      )}
    />
  )
}

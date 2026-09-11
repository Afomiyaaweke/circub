'use client'

import { useState } from 'react'
import { HelpCircle, X, Camera, ScanLine, Lightbulb, Image as ImageIcon, Crosshair, Clock } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'

interface ScannerGuideProps {
  /** Optional className for the trigger button. */
  className?: string
}

/**
 * A compact "How to scan" guide button + popover that teaches the user how
 * to get the most accurate scan results. Designed to be embedded inside the
 * PriceLens modal.
 */
export function ScannerGuide({ className }: ScannerGuideProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className={className}
        aria-label="How to scan"
      >
        <HelpCircle className="h-3.5 w-3.5 text-emerald-500" />
        <span className="text-xs">Guide</span>
      </Button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
          >
            <motion.div
              className="relative w-full max-w-md overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl"
              initial={{ opacity: 0, y: 20, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.96 }}
              transition={{ duration: 0.2 }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between gap-3 border-b border-zinc-100 bg-gradient-to-br from-emerald-50 to-white px-5 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500 text-white shadow-sm">
                    <ScanLine className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold leading-none text-zinc-900">Scanning guide</h3>
                    <p className="mt-0.5 text-[11px] text-zinc-500">Get accurate prices in one shot</p>
                  </div>
                </div>
                <button
                  onClick={() => setOpen(false)}
                  aria-label="Close guide"
                  className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Body — tips list */}
              <div className="max-h-[60vh] overflow-y-auto px-5 py-4">
                <ol className="space-y-3">
                  <Tip
                    icon={<Camera className="h-4 w-4 text-emerald-500" />}
                    title="Fill the frame"
                    text="Hold the camera 15–30 cm from the product so the label or packaging fills most of the viewfinder. Avoid empty space around the item."
                  />
                  <Tip
                    icon={<Crosshair className="h-4 w-4 text-emerald-500" />}
                    title="Hold steady"
                    text="Keep your hand still for half a second before tapping Scan — motion blur is the #1 cause of wrong identifications."
                  />
                  <Tip
                    icon={<Lightbulb className="h-4 w-4 text-emerald-500" />}
                    title="Use good light"
                    text="Daylight or a well-lit room works best. Avoid heavy shadows, glare, or backlight from windows behind the item."
                  />
                  <Tip
                    icon={<ImageIcon className="h-4 w-4 text-emerald-500" />}
                    title="Capture the label"
                    text="Aim at the part with the brand, product name, or barcode. A plain front-of-pack shot is usually enough."
                  />
                  <Tip
                    icon={<Clock className="h-4 w-4 text-emerald-500" />}
                    title="Auto-scan for batches"
                    text="Turn on Auto-scan to capture multiple items in a row without tapping — perfect for shelves and market stalls."
                  />
                </ol>

                <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3">
                  <p className="text-[11px] leading-relaxed text-emerald-800">
                    <strong>Privacy:</strong> scans are processed once and not
                    stored. The camera turns off automatically when scanning
                    stops, so nothing is recorded between scans.
                  </p>
                </div>
              </div>

              {/* Footer */}
              <div className="border-t border-zinc-100 px-5 py-3">
                <Button
                  onClick={() => setOpen(false)}
                  className="w-full bg-emerald-500 text-white hover:bg-emerald-400"
                >
                  Got it
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

function Tip({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <li className="flex gap-3">
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-zinc-900">{title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-zinc-600">{text}</p>
      </div>
    </li>
  )
}

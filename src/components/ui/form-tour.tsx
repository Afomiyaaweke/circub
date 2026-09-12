'use client'

import { useCallback, useEffect, useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft, ChevronRight, X, Volume2, Square, Compass } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTts } from '@/hooks/use-tts'
import { cn } from '@/lib/utils'

export interface TourStep {
  /** CSS selector for the field this step highlights. */
  selector: string
  /** Headline shown in the tooltip. */
  title: string
  /** Body text shown in the tooltip. */
  body: string
  /** Optional spoken narration (defaults to `${title}. ${body}`). */
  speak?: string
  /** Optional language tag for the spoken narration. */
  speakLang?: string
  /** Where to place the tooltip relative to the highlighted element. */
  placement?: 'auto' | 'top' | 'bottom' | 'left' | 'right'
}

interface FormTourProps {
  open: boolean
  steps: TourStep[]
  onClose: () => void
  onComplete?: () => void
}

interface Rect { top: number; left: number; width: number; height: number }

/**
 * A guided walkthrough for filling out forms. Highlights one field at a time,
 * shows a tooltip explaining what to enter, and lets the user navigate
 * Next / Previous. Each step can also be read aloud via TTS — the "tour
 * specialist" speaks the user through the form.
 *
 * Each target element is identified by a CSS selector. Form fields should
 * carry a `data-tour="<id>"` attribute and the steps should reference
 * `[data-tour="<id>"]` in their `selector`.
 */
export function FormTour({ open, steps, onClose, onComplete }: FormTourProps) {
  const [index, setIndex] = useState(0)
  const [rect, setRect] = useState<Rect | null>(null)
  const [autoSpeak, setAutoSpeak] = useState(false)
  const { speak, stop, speaking, supported: ttsSupported } = useTts({ lang: steps[index]?.speakLang || 'en-US' })
  const scrollRef = useRef<HTMLDivElement | null>(null)

  const step = steps[index]
  const isFirst = index === 0
  const isLast = index === steps.length - 1

  // Measure + scroll the target element into view whenever the step changes.
  useEffect(() => {
    if (!open || !step) return
    let raf = 0
    let cancelled = false

    const measure = () => {
      const el = document.querySelector(step.selector) as HTMLElement | null
      if (!el) {
        setRect(null)
        return
      }
      // Scroll the element into a comfortable position in the viewport.
      el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })
      // Re-measure after the smooth-scroll settles (~250ms).
      setTimeout(() => {
        if (cancelled) return
        const r = el.getBoundingClientRect()
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
        // Focus the field so keyboard users can start typing.
        try { (el as HTMLElement).focus({ preventScroll: true }) } catch {}
      }, 280)
    }
    raf = window.requestAnimationFrame(measure)
    return () => { cancelled = true; window.cancelAnimationFrame(raf) }
  }, [open, step])

  // Recompute the highlight rect on window resize / scroll.
  useEffect(() => {
    if (!open || !step) return
    const recompute = () => {
      const el = document.querySelector(step.selector) as HTMLElement | null
      if (!el) return
      const r = el.getBoundingClientRect()
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
    }
    window.addEventListener('resize', recompute)
    window.addEventListener('scroll', recompute, true)
    return () => {
      window.removeEventListener('resize', recompute)
      window.removeEventListener('scroll', recompute, true)
    }
  }, [open, step])

  // Auto-speak the narration when the step changes (if enabled).
  useEffect(() => {
    if (!open || !step || !autoSpeak) return
    const narration = step.speak ?? `${step.title}. ${step.body}`
    // Small delay so the TTS doesn't fire before the previous utterance is cancelled.
    const id = window.setTimeout(() => speak(narration), 60)
    return () => { window.clearTimeout(id); stop() }
  }, [open, step, autoSpeak, speak, stop])

  // Stop speaking if the tour closes.
  useEffect(() => {
    if (!open) stop()
  }, [open, stop])

  // Esc closes the tour.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight' && !isLast) setIndex((i) => i + 1)
      else if (e.key === 'ArrowLeft' && !isFirst) setIndex((i) => i - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose, isFirst, isLast])

  const next = useCallback(() => {
    if (isLast) {
      onComplete?.()
      onClose()
      return
    }
    setIndex((i) => i + 1)
  }, [isLast, onClose, onComplete])

  const prev = useCallback(() => {
    if (isFirst) return
    setIndex((i) => i - 1)
  }, [isFirst])

  const toggleSpeak = useCallback(() => {
    if (speaking) {
      stop()
      setAutoSpeak(false)
    } else {
      setAutoSpeak(true)
      const narration = step?.speak ?? (step ? `${step.title}. ${step.body}` : '')
      speak(narration)
    }
  }, [speaking, speak, stop, step])

  if (!open || !step) return null

  // Choose tooltip placement based on the target rect.
  const placement = step.placement ?? 'auto'
  let tooltipStyle: React.CSSProperties = {}
  if (rect) {
    const margin = 12
    const vw = window.innerWidth
    const vh = window.innerHeight
    const placementResolved =
      placement === 'auto'
        ? rect.top < vh * 0.4
          ? 'bottom'
          : 'top'
        : placement
    if (placementResolved === 'bottom') {
      tooltipStyle = { top: rect.top + rect.height + margin, left: Math.max(12, Math.min(rect.left, vw - 320 - 12)) }
    } else if (placementResolved === 'top') {
      tooltipStyle = { top: Math.max(12, rect.top - 200), left: Math.max(12, Math.min(rect.left, vw - 320 - 12)) }
    } else if (placementResolved === 'left') {
      tooltipStyle = { top: rect.top, left: Math.max(12, rect.left - 320 - margin) }
    } else {
      tooltipStyle = { top: rect.top, left: Math.min(vw - 320 - 12, rect.left + rect.width + margin) }
    }
  } else {
    tooltipStyle = { top: window.innerHeight / 2 - 100, left: Math.max(12, (window.innerWidth - 320) / 2) }
  }

  return createPortal(
    <div className="fixed inset-0 z-[120]" aria-modal role="dialog" aria-label="Guided form tour">
      {/* Dark backdrop with a cut-out for the highlighted element */}
      {rect ? (
        <div
          className="absolute inset-0 bg-black/55 transition-all duration-200"
          style={{
            // Cut a hole using 4 surrounding rects (so the highlighted field shows through).
            // box-shadow trick: huge spread on a transparent box punched out via clip-path.
            clipPath: `polygon(0 0, 0 100%, ${rect.left}px 100%, ${rect.left}px ${rect.top}px, ${rect.left + rect.width}px ${rect.top}px, ${rect.left + rect.width}px ${rect.top + rect.height}px, ${rect.left}px ${rect.top + rect.height}px, ${rect.left}px 100%, 100% 100%, 100% 0)`,
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-black/55" />
      )}

      {/* Highlight ring around the target */}
      {rect && (
        <div
          className="absolute pointer-events-none rounded-md border-2 border-emerald-400 shadow-[0_0_0_4px_rgba(16,185,129,0.25)] transition-all duration-200"
          style={{ top: rect.top - 4, left: rect.left - 4, width: rect.width + 8, height: rect.height + 8 }}
        />
      )}

      {/* Tooltip */}
      <AnimatePresence>
        <motion.div
          ref={scrollRef}
          key={index}
          initial={{ opacity: 0, y: 8, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.96 }}
          transition={{ duration: 0.18 }}
          className={cn('absolute w-[320px] max-w-[calc(100vw-24px)] rounded-xl border border-zinc-200 bg-white shadow-2xl')}
          style={tooltipStyle}
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-2 border-b border-zinc-100 bg-gradient-to-br from-emerald-50 to-white px-4 py-2.5">
            <div className="flex items-center gap-2 min-w-0">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-emerald-500 text-white">
                <Compass className="h-3.5 w-3.5" />
              </div>
              <p className="truncate text-xs font-semibold text-zinc-900">
                {step.title}
              </p>
            </div>
            <button
              onClick={onClose}
              aria-label="Close tour"
              className="flex h-6 w-6 items-center justify-center rounded-md text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Body */}
          <div className="px-4 py-3">
            <p className="text-xs leading-relaxed text-zinc-600">{step.body}</p>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between gap-2 border-t border-zinc-100 px-4 py-2.5">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-medium text-zinc-400">
                Step {index + 1} of {steps.length}
              </span>
              {ttsSupported && (
                <button
                  type="button"
                  onClick={toggleSpeak}
                  aria-label={speaking ? 'Stop narration' : 'Read this step aloud'}
                  title={speaking ? 'Stop narration' : 'Read aloud'}
                  className={cn(
                    'flex h-6 w-6 items-center justify-center rounded-md border transition',
                    speaking
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-600'
                      : 'border-zinc-200 bg-white text-zinc-500 hover:bg-emerald-50 hover:text-emerald-600',
                  )}
                >
                  {speaking ? <Square className="h-3 w-3 fill-current" /> : <Volume2 className="h-3 w-3" />}
                </button>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                variant="ghost"
                onClick={prev}
                disabled={isFirst}
                className="h-7 px-2 text-xs text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Back
              </Button>
              <Button
                size="sm"
                onClick={next}
                className="h-7 gap-1 px-3 text-xs bg-emerald-500 text-white hover:bg-emerald-400"
              >
                {isLast ? 'Finish' : 'Next'}
                {!isLast && <ChevronRight className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>,
    document.body,
  )
}

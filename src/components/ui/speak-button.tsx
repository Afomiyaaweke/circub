'use client'

import { Volume2, Square } from 'lucide-react'
import { useTts } from '@/hooks/use-tts'
import { cn } from '@/lib/utils'

interface SpeakButtonProps {
  /** Text to read aloud. */
  text: string
  /** Language to speak in (human name like "Amharic" or BCP-47 like "am-ET"). */
  lang?: string
  /** Optional label override; defaults to "Listen" / "Stop". */
  label?: string
  /** Visual variant. */
  variant?: 'solid' | 'ghost' | 'compact'
  className?: string
}

/**
 * A small button that reads its `text` prop aloud using the Web Speech API.
 * Tapping it again while speaking stops playback. Falls back silently to
 * no-op (button hidden) when TTS is unsupported (SSR / very old browsers).
 */
export function SpeakButton({ text, lang = 'en-US', label, variant = 'ghost', className }: SpeakButtonProps) {
  const { speak, stop, speaking, supported } = useTts({ lang })

  if (!supported) return null

  const handleClick = () => {
    if (speaking) {
      stop()
    } else {
      speak(text)
    }
  }

  const text_label = label ?? (speaking ? 'Stop' : 'Listen')

  if (variant === 'compact') {
    return (
      <button
        type="button"
        onClick={handleClick}
        aria-label={speaking ? 'Stop speaking' : 'Read aloud'}
        title={speaking ? 'Stop' : 'Read aloud'}
        className={cn(
          'inline-flex h-7 w-7 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-600 transition hover:bg-emerald-50 hover:text-emerald-600',
          speaking && 'border-emerald-300 bg-emerald-50 text-emerald-600',
          className,
        )}
      >
        {speaking ? <Square className="h-3 w-3 fill-current" /> : <Volume2 className="h-3.5 w-3.5" />}
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition',
        variant === 'solid'
          ? speaking
            ? 'bg-emerald-600 text-white hover:bg-emerald-700'
            : 'bg-emerald-500 text-white hover:bg-emerald-600'
          : speaking
            ? 'border border-emerald-300 bg-emerald-50 text-emerald-700'
            : 'border border-zinc-200 bg-white text-zinc-600 hover:bg-emerald-50 hover:text-emerald-600',
        className,
      )}
    >
      {speaking ? <Square className="h-3.5 w-3.5 fill-current" /> : <Volume2 className="h-3.5 w-3.5" />}
      {text_label}
    </button>
  )
}

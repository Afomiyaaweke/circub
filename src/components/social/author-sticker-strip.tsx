'use client'

// v208: THE STICKER STRIP - a person's earned stickers, shown under their
// profile and under every post they make. The rules the user asked for:
//   - tiles APPEAR based on the person's rank: one tile per sticker their
//     lifetime posts + Helpful votes have earned (rank up, more tiles);
//   - the tiles stay MYSTERY until touched: a neutral sticker glyph gives
//     nothing away - tapping flips the tile to the real gradient and spells
//     out what the sticker does; tapping again hides it;
//   - no stickers earned -> nothing shows (rank zero, zero tiles).
// Pure client math over the author counters the payloads already carry.

import { useState } from 'react'
import { Sticker as StickerGlyph, Zap, Heart, Gem, Award } from 'lucide-react'
import { stickerStates, type StickerDef } from '@/lib/arena'
import { cn } from '@/lib/utils'

/** The real glyph per sticker (only shown AFTER the reveal). */
function stickerIcon(def: StickerDef) {
  const props = { className: 'w-3.5 h-3.5' }
  if (def.metric === 'posts') return <Zap {...props} />
  if (def.id === 'hype-magnet') return <Heart {...props} />
  if (def.id === 'viral-overlord') return <Gem {...props} />
  return <Award {...props} />
}

interface AuthorStickerStripProps {
  lifetimePosts: number
  lifetimeVotes: number
  // testid prefix so every surface can assert its own strip
  prefix: string
  className?: string
}

export function AuthorStickerStrip({ lifetimePosts, lifetimeVotes, prefix, className }: AuthorStickerStripProps) {
  const [revealed, setRevealed] = useState<string | null>(null)
  const posts = Math.max(0, Number(lifetimePosts) || 0)
  const votes = Math.max(0, Number(lifetimeVotes) || 0)
  const earned = stickerStates(posts, votes).filter((s) => s.unlocked)
  // Rank zero: no stickers -> the strip does not exist on this surface.
  if (earned.length === 0) return null
  const revealedState = earned.find((s) => s.def.id === revealed) ?? null

  return (
    <div className={cn('min-w-0', className)} data-testid={`${prefix}-sticker-strip`}>
      <div className="flex items-center gap-1.5 flex-wrap">
        {earned.map((s) => {
          const isRevealed = revealed === s.def.id
          return (
            <button
              key={s.def.id}
              type="button"
              data-testid={`${prefix}-sticker-tile-${s.def.id}`}
              data-revealed={isRevealed ? 'true' : 'false'}
              aria-expanded={isRevealed}
              aria-label={isRevealed ? `${s.def.name} sticker - tap to hide` : 'Mystery sticker - tap to reveal'}
              title={isRevealed ? `${s.def.name} - tap to hide` : 'Tap to reveal this sticker'}
              onClick={() => setRevealed(isRevealed ? null : s.def.id)}
              className={cn(
                'w-6 h-6 rounded-md inline-flex items-center justify-center shrink-0 transition-all active:scale-90 focus-visible:ring-2 focus-visible:ring-primary/50 outline-none',
                isRevealed
                  ? cn('bg-gradient-to-br text-white shadow-sm', s.def.gradient)
                  : 'bg-muted text-muted-foreground/70 border border-border hover:border-primary/40 hover:text-primary'
              )}
            >
              {isRevealed ? stickerIcon(s.def) : <StickerGlyph className="w-3.5 h-3.5" />}
            </button>
          )
        })}
      </div>
      {revealedState && (
        <p
          data-testid={`${prefix}-sticker-info`}
          className="mt-1 text-[10px] leading-snug text-muted-foreground flex items-center gap-1 flex-wrap"
        >
          <span className="font-bold text-foreground">{revealedState.def.name}</span>
          <span aria-hidden>·</span>
          <span>{revealedState.def.tier}</span>
          <span aria-hidden>·</span>
          <span className="font-semibold text-primary">{revealedState.def.effect}</span>
          <span aria-hidden>·</span>
          <span>earned at {revealedState.def.requirement}</span>
        </p>
      )}
    </div>
  )
}

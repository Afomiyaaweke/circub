'use client'

// Price stories strip (v99): every newly posted price is shared as a 24h
// story - a banner the whole feed sees at the top of the Local tab, like a
// post shared out to everyone. Photo stories (from the profile tab) appear
// here too. Tapping a ring opens the story viewer; price stories offer a
// one-tap jump into the full price post.
import { useCallback, useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Clock, X } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import type { PriceStory } from '@/lib/types'

const SEEN_KEY = 'circub-seen-stories'
const ADVANCE_MS = 6000

function loadSeen(): string[] {
  try {
    const raw = localStorage.getItem(SEEN_KEY)
    const arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string').slice(0, 300) : []
  } catch { return [] }
}

function saveSeen(ids: string[]) {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify(ids.slice(0, 300))) } catch {}
}

function timeLeftLabel(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now()
  if (ms <= 0) return 'expired'
  const m = Math.floor(ms / 60000)
  if (m < 60) return `${Math.max(1, m)}m left`
  return `${Math.floor(ms / 3600000)}h left`
}

// Short price label for a story ring / banner ("ETB 40" or "ETB 40-50").
function priceBit(s: PriceStory): string {
  const pp = s.pricePost
  if (!pp) return ''
  return `${pp.currency} ${pp.priceMin}${pp.priceMin !== pp.priceMax ? '-' + pp.priceMax : ''}`
}

export function PriceStoriesStrip({ onOpenPost }: { onOpenPost: (postId: string) => void }) {
  const [stories, setStories] = useState<PriceStory[]>([])
  const [loaded, setLoaded] = useState(false)
  const [viewerIndex, setViewerIndex] = useState(-1)
  const [seen, setSeen] = useState<string[]>([])

  const fetchStories = useCallback(() => {
    fetch('/api/stories', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { stories: [] }))
      .then((d) => {
        const now = Date.now()
        const list: PriceStory[] = (Array.isArray(d?.stories) ? d.stories : [])
          .filter((s: PriceStory) => new Date(s.expiresAt).getTime() > now)
        // Newest ring first (the API lists oldest-first).
        setStories(list.slice().reverse())
      })
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [])

  useEffect(() => {
    setSeen(loadSeen())
    fetchStories()
    // The composer dispatches this after publishing a price with its story -
    // the new ring appears without a reload.
    const onChanged = () => fetchStories()
    window.addEventListener('circub:stories-changed', onChanged)
    return () => window.removeEventListener('circub:stories-changed', onChanged)
  }, [fetchStories])

  // Auto-advance the viewer every 6 seconds (Instagram-style), then close.
  useEffect(() => {
    if (viewerIndex < 0) return
    const t = setTimeout(() => {
      setViewerIndex((i) => (i + 1 >= stories.length ? -1 : i + 1))
    }, ADVANCE_MS)
    return () => clearTimeout(t)
  }, [viewerIndex, stories.length])

  const markSeen = (id: string) => {
    setSeen((prev) => {
      if (prev.includes(id)) return prev
      const next = [...prev, id]
      saveSeen(next)
      return next
    })
  }

  const openAt = (i: number) => {
    setViewerIndex(i)
    markSeen(stories[i].id)
  }

  // Nothing live yet -> the strip stays out of the way entirely.
  if (!loaded || stories.length === 0) return null
  const current = viewerIndex >= 0 ? stories[viewerIndex] : null

  return (
    <>
      <div data-testid="stories-strip" className="rounded-xl border border-border bg-card p-3 shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <Clock className="w-3.5 h-3.5 text-primary" />
            Price stories
          </span>
          <span data-testid="stories-strip-count" className="text-[10px] font-semibold text-primary bg-primary/10 rounded-full px-1.5 py-0.5">{stories.length}</span>
          <span className="text-[10px] text-muted-foreground">fresh prices, live for 24h · tap to view</span>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-thin">
          {stories.map((s, i) => {
            const isSeen = seen.includes(s.id)
            const pp = s.pricePost
            return (
              <button
                key={s.id}
                data-testid="story-ring"
                onClick={() => openAt(i)}
                className="shrink-0 flex flex-col items-center gap-1 w-16 focus:outline-none group"
                title={pp ? `${pp.productName} · ${priceBit(s)}` : s.caption || 'Story'}
              >
                <span className={cn('rounded-full p-[2.5px] transition-transform group-hover:scale-105', isSeen ? 'bg-muted-foreground/30' : 'bg-gradient-to-tr from-amber-400 via-pink-500 to-purple-600')}>
                  <span className="block rounded-full bg-card p-[2px] w-13 h-13">
                    {s.imageUrl ? (
                      <img src={s.imageUrl} alt="" className="w-full h-full rounded-full object-cover" loading="lazy" />
                    ) : (
                      <span className="w-full h-full rounded-full bg-gradient-to-br from-primary/25 to-emerald-100 dark:to-emerald-950 flex items-center justify-center text-[8px] font-bold text-primary leading-none text-center px-0.5">
                        {priceBit(s).replace(/^(\S+)\s*/, '')}
                      </span>
                    )}
                  </span>
                </span>
                <span className="text-[9px] text-muted-foreground truncate w-full text-center">{s.author?.name || 'Story'}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Story viewer - the shared banner, full-screen card style */}
      <Dialog open={!!current} onOpenChange={(o) => { if (!o) setViewerIndex(-1) }}>
        <DialogContent className="max-w-sm p-0 gap-0 overflow-hidden bg-black border-none [&>button]:hidden">
          <DialogTitle className="sr-only">Story</DialogTitle>
          {current && (
            <div className="relative" data-testid="story-viewer">
              {/* Progress segments */}
              <div className="absolute top-2 left-2 right-2 z-10 flex gap-1">
                {stories.map((s, i) => (
                  <span key={s.id} className="h-0.5 flex-1 rounded-full bg-white/30 overflow-hidden">
                    <span className={cn('block h-full bg-white transition-all', i < viewerIndex ? 'w-full' : i === viewerIndex ? 'w-full duration-[6000ms] ease-linear story-progress' : 'w-0')} />
                  </span>
                ))}
              </div>
              {/* Header: author + time left */}
              <div className="absolute top-5 left-3 right-3 z-10 flex items-center gap-2">
                <Avatar className="w-7 h-7 border border-white/40">
                  {current.author?.profilePicture ? (
                    <img src={current.author.profilePicture} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <AvatarFallback className="bg-primary/40 text-white text-[10px] font-semibold">{(current.author?.name || '?').charAt(0).toUpperCase()}</AvatarFallback>
                  )}
                </Avatar>
                <span className="text-xs font-semibold text-white drop-shadow truncate">{current.author?.name || 'Circub'}</span>
                <span className="text-[10px] text-white/80 drop-shadow flex items-center gap-1 shrink-0"><Clock className="w-3 h-3" />{timeLeftLabel(current.expiresAt)}</span>
                <button onClick={() => setViewerIndex(-1)} className="ml-auto p-1 rounded-full bg-black/40 text-white hover:bg-black/60" aria-label="Close story">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Body: photo story shows the image; price story shows the
                  shared banner (photo if the post has one, price banner
                  otherwise). */}
              {current.imageUrl ? (
                <img src={current.imageUrl} alt="" className="w-full aspect-[3/4] object-cover" data-testid="story-viewer-image" />
              ) : (
                <div data-testid="story-viewer-banner" className="w-full aspect-[3/4] bg-gradient-to-br from-emerald-600 via-primary to-emerald-900 flex flex-col items-center justify-center text-center px-6 gap-3">
                  {(() => {
                    const pp = current.pricePost
                    if (!pp) return (
                      <p className="text-white/90 text-sm">{current.caption || 'Story'}</p>
                    )
                    return (
                      <>
                        <span className="text-[10px] font-semibold uppercase tracking-widest text-white/70">{pp.category || 'Local price'}</span>
                        <span className="text-3xl sm:text-4xl font-black text-white drop-shadow leading-tight">{priceBit(current)}</span>
                        <span className="text-base font-semibold text-white/95 drop-shadow">{pp.productName}</span>
                        <span className="text-xs text-white/80 drop-shadow">{[pp.city, pp.country].filter(Boolean).join(', ')}</span>
                      </>
                    )
                  })()}
                  <span className="text-[9px] uppercase tracking-widest text-white/60 mt-2">circub · shared as a story</span>
                </div>
              )}
              {current.caption && current.imageUrl && (
                <p className="absolute bottom-16 left-4 right-4 text-center">
                  <span className="inline-block px-3 py-1.5 rounded-lg bg-black/50 backdrop-blur text-white text-sm">{current.caption}</span>
                </p>
              )}

              {/* Footer: open the price post behind a price story */}
              {current.pricePostId && (
                <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/70 to-transparent">
                  <Button
                    size="sm"
                    data-testid="story-viewer-open-post"
                    onClick={() => { const pid = current.pricePostId!; setViewerIndex(-1); onOpenPost(pid) }}
                    className="w-full bg-white text-black hover:bg-white/90 text-xs font-semibold gap-1.5"
                  >
                    View the price post
                  </Button>
                </div>
              )}

              {/* Prev / next */}
              {viewerIndex > 0 && (
                <button
                  onClick={() => openAt(viewerIndex - 1)}
                  className="absolute left-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/40 text-white hover:bg-black/60"
                  aria-label="Previous story"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
              )}
              {viewerIndex < stories.length - 1 && (
                <button
                  onClick={() => openAt(viewerIndex + 1)}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/40 text-white hover:bg-black/60"
                  aria-label="Next story"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

'use client'

// Progressive list rendering - shows a small batch first, then appends more
// automatically as the user scrolls (IntersectionObserver sentinel).
// Keeps the initial render light on phones: fewer DOM nodes + fewer images
// decode up front; the rest streams in part by part.
import { useEffect, useRef, useState } from 'react'

export function useProgressiveList<T>(items: T[], step = 6, initial = 6) {
  const [visibleCount, setVisibleCount] = useState(initial)
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  // Reset to the first batch when the underlying data set structurally changes
  // (new search/filter/refetch) - but NOT on in-place updates like a like/vote,
  // which keep length + first/last ids unchanged.
  // A pure head-prepend (a just-published post landing on top, tail unchanged)
  // must also NOT reset: collapsing the visible batch flashed the feed back
  // down to `initial` for a frame and snapped the viewport - grow the window
  // by the delta instead so every already-visible post stays visible.
  const first = items[0] as { id?: unknown } | undefined
  const last = items[items.length - 1] as { id?: unknown } | undefined
  const sig = `${items.length}:${first?.id ?? ''}:${last?.id ?? ''}`
  const prevSig = useRef(sig)
  useEffect(() => {
    if (prevSig.current === sig) return
    const prevParts = prevSig.current.split(':')
    const nextParts = sig.split(':')
    const prevLen = Number(prevParts[0]) || 0
    const nextLen = Number(nextParts[0]) || 0
    const tailUnchanged = prevLen > 0 && prevParts.length >= 3
      && nextParts.length >= 3 && prevParts[prevParts.length - 1] === nextParts[nextParts.length - 1]
    const delta = nextLen - prevLen
    prevSig.current = sig
    if (tailUnchanged && delta > 0) {
      setVisibleCount((v) => Math.min(v + delta, nextLen))
    } else {
      setVisibleCount(initial)
    }
  }, [sig, initial])

  // Sentinel observer - appends the next batch when it scrolls into view
  useEffect(() => {
    const el = sentinelRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount((v) => (v < items.length ? v + step : v))
        }
      },
      { rootMargin: '600px 0px' }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [items.length, step])

  return {
    visible: items.slice(0, visibleCount),
    hasMore: visibleCount < items.length,
    sentinelRef,
  }
}

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
  const first = items[0] as { id?: unknown } | undefined
  const last = items[items.length - 1] as { id?: unknown } | undefined
  const sig = `${items.length}:${first?.id ?? ''}:${last?.id ?? ''}`
  const prevSig = useRef(sig)
  useEffect(() => {
    if (prevSig.current !== sig) {
      prevSig.current = sig
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

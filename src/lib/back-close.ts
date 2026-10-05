'use client'

// Device back (Android hardware button / gesture, browser back) should close
// the topmost open overlay - modal, full-tab editor, story viewer - and
// reveal the position underneath, the way native apps behave. Without this,
// one back press while an overlay is open exits the whole page (PWA: the
// app closes) instead of stepping back to where the user was.
//
// One coordinator owns the interplay between our overlays and the history
// stack:
// - an overlay that OPENS pushes one same-document history entry and joins
//   the module stack (last opened = top);
// - a popstate (device back) closes ONLY the top overlay; that overlay's own
//   close logic runs and its cleanup sees it was popstate-closed, so it does
//   NOT call history.back() again (no loop);
// - an overlay closed by the UI (X, Done, back arrow) consumes its own entry
//   with history.back(), so the next device back never needs two presses;
// - deep nesting unwinds in reverse order (profile modal -> price modal ->
//   register: three entries, three backs).
//
// Usage (client components only):
//   useBackClose(editing, () => setEditing(false))
// `active` is the overlay's open flag; `onClose` is its close handler. The
// hook re-reads the latest onClose on every render, so inline closures are
// safe, and `active` is the only dependency - an overlay that closes itself
// for other reasons (e.g. completed flow) is covered by the same cleanup.

import { useEffect, useLayoutEffect, useRef } from 'react'

type CloseFn = () => void

const stack: symbol[] = []
const closeFns = new Map<symbol, CloseFn>()
// Overlays whose close was ALREADY triggered by a popstate - their cleanup
// must not consume another history entry (the device back did that).
const popstateClosed = new Set<symbol>()
// UI-initiated history.back() calls whose popstate echo must be swallowed.
// Counted, so several overlays closing in one commit each consume their own
// echo instead of the count leaking onto a real device back.
let pendingConsumes = 0
let bound = false

function ensureBound() {
  if (bound || typeof window === 'undefined') return
  bound = true
  window.addEventListener('popstate', () => {
    if (pendingConsumes > 0) {
      pendingConsumes -= 1
      return
    }
    const top = stack[stack.length - 1]
    if (top === undefined) return // nothing of ours open - native nav proceeds
    stack.pop()
    popstateClosed.add(top)
    closeFns.get(top)?.()
  })
}

export function useBackClose(active: boolean, onClose: CloseFn) {
  const closeRef = useRef(onClose)
  useLayoutEffect(() => {
    closeRef.current = onClose
  })

  useEffect(() => {
    if (!active) return
    ensureBound()
    const key = Symbol('back-close')
    let pushed = false
    try {
      window.history.pushState({ circubOverlay: stack.length + 1 }, '')
      pushed = true
    } catch {
      /* pushState unavailable (rare sandboxed contexts) - degrade to no-op */
    }
    stack.push(key)
    closeFns.set(key, () => closeRef.current())

    return () => {
      closeFns.delete(key)
      const i = stack.indexOf(key)
      if (i >= 0) stack.splice(i, 1)
      if (!pushed) return
      if (popstateClosed.has(key)) {
        // Device back already consumed this entry - nothing to unwind.
        popstateClosed.delete(key)
        return
      }
      // Closed by the UI: consume our entry so the next device back acts on
      // whatever is actually on screen.
      pendingConsumes += 1
      try {
        window.history.back()
      } catch {
        pendingConsumes -= 1
      }
    }
  }, [active])
}

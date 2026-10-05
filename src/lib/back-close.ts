'use client'

// Device back (Android hardware button / gesture, browser back) should close
// the topmost open overlay - modal, full-tab editor, story viewer - and
// reveal the position underneath, the way native apps behave. Without this,
// one back press while an overlay is open exits the whole page (PWA: the
// app closes) instead of stepping back to where the user was.
//
// One coordinator owns the interplay between our overlays and the history
// stack. Every open overlay pushes ONE same-document entry carrying a
// circubOverlay marker; a popstate closes the TOP registered overlay (last
// opened = top, so nesting unwinds in reverse order). An overlay closed by
// the UI (X, Done, back arrow) TOMBSTONES its entry (replaceState with a
// circubDead marker) instead of calling history.back() - a programmatic
// back() at close time races with the Next.js App Router's own history
// patching and behaves differently between dev and prod builds, while a
// tombstone is just a state swap on the entry we are already on. Device
// backs that land on a tombstoned (or otherwise stale marker) entry skip it
// with a chained history.back(), so a UI close never leaves a dead press.
//
// Known benign quirk: when an overlay opens during the very first hydration
// (the /?post=<id> deep link), Next.js' boot replaceState can merge the
// overlay marker onto the BASE entry as well. That stale marker is
// de-polluted lazily (before the next push, or on the first back that lands
// on it) and costs at most one no-op back press, once.
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
// Overlays whose close was ALREADY triggered by a popstate (device back) -
// their cleanup must not tombstone anything (the entry is already consumed).
const popstateClosed = new Set<symbol>()
let bound = false

type HistoryState = {
  circubOverlay?: number
  circubDead?: number
  [k: string]: unknown
}

function currentState(): HistoryState | null {
  try {
    return (window.history.state as HistoryState) ?? null
  } catch {
    return null
  }
}

// Remove a stale circubOverlay marker from the CURRENT entry (the Next.js
// boot-merge quirk). structuredClone drops `undefined` values, so the key
// disappears from the stored state.
function depolluteCurrent() {
  const st = currentState()
  if (st && st.circubOverlay !== undefined && st.circubDead === undefined) {
    try {
      window.history.replaceState({ ...st, circubOverlay: undefined }, '')
    } catch {
      /* state write refused - the stale marker is harmless */
    }
  }
}

// Mark the CURRENT entry as consumed-by-UI. Tombstoned entries are skipped
// (chained history.back()) by the next device backs that land on them.
function tombstoneCurrent() {
  const st = currentState()
  if (st && st.circubOverlay !== undefined && st.circubDead === undefined) {
    try {
      window.history.replaceState({ ...st, circubOverlay: undefined, circubDead: 1 }, '')
    } catch {
      /* state write refused - worst case one dead back press remains */
    }
  }
}

function ensureBound() {
  if (bound || typeof window === 'undefined') return
  bound = true
  window.addEventListener('popstate', (event) => {
    if (stack.length > 0) {
      // The entry we are LEAVING belongs to the top overlay - close it.
      // The destination may itself be a tombstoned/stale entry; that is
      // handled by whichever press lands there next.
      const top = stack.pop()!
      popstateClosed.add(top)
      closeFns.get(top)?.()
      return
    }
    // Nothing of ours is open - only clean up markers our overlays left.
    const st = (event.state as HistoryState) ?? currentState()
    if (st && st.circubDead !== undefined) {
      // Tombstoned entry: consume it and keep going (chains if several).
      try {
        window.history.back()
      } catch {
        /* traversal refused - nothing else to do */
      }
    } else if (st && st.circubOverlay !== undefined) {
      // Stale marker merged onto a base entry by Next.js' boot replaceState:
      // scrub it so later flows start clean. The press is eaten (rare).
      depolluteCurrent()
    }
    // Otherwise: not ours - native navigation proceeds.
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
    // A stale marker on the current entry (boot-merge quirk) would otherwise
    // double-count - scrub it before stacking our own entry on top.
    depolluteCurrent()
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
        // Device back already consumed this entry - nothing to mark.
        popstateClosed.delete(key)
        return
      }
      // Closed by the UI: tombstone the entry we are sitting on so the next
      // device back skips it instead of needing a dead press.
      tombstoneCurrent()
    }
  }, [active])
}

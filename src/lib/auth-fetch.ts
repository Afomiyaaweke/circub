// Client-side fetch wrapper that handles 401 (session expired) gracefully.
// On 401, dispatches a global 'auth-expired' event that page.tsx listens for
// to bounce the user back to the login modal with a clear toast.
//
// Usage in client components:
//   import { authFetch } from '@/lib/auth-fetch'
//   const res = await authFetch('/api/posts', { method: 'POST', ... })
//
// The returned Response is exactly what fetch() returns — no behavior change
// for non-401 responses. For 401, the event is dispatched BEFORE the response
// is returned, so the caller can still read the body if needed.

const AUTH_EXPIRED_EVENT = 'circub:auth-expired'

export function dispatchAuthExpired(reason?: string) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT, { detail: { reason } }))
}

export async function authFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, init)
  if (res.status === 401) {
    dispatchAuthExpired('session-expired')
  }
  return res
}

export { AUTH_EXPIRED_EVENT }

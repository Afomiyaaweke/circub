'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export type CameraStatus =
  | 'idle'
  | 'requesting'
  | 'live'
  | 'denied'
  | 'unsupported'
  | 'error'

interface UseCameraOptions {
  facingMode?: 'environment' | 'user'
}

export function useCamera({ facingMode = 'environment' }: UseCameraOptions = {}) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [status, setStatus] = useState<CameraStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [activeFacing, setActiveFacing] = useState(facingMode)

  const stop = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    // Reflect the stopped state in the UI (e.g. viewfinder placeholder,
    // "Scan item" button enablement) instead of leaving status stuck on 'live'.
    setStatus('idle')
  }, [])

  const start = useCallback(
    async (mode: 'environment' | 'user' = activeFacing) => {
      if (
        typeof navigator === 'undefined' ||
        !navigator.mediaDevices ||
        !navigator.mediaDevices.getUserMedia
      ) {
        setStatus('unsupported')
        setError('Camera API is not available in this browser.')
        return
      }
      setStatus('requesting')
      setError(null)
      // Stop any existing stream first.
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
        streamRef.current = null
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: mode },
            width: { ideal: 1280 },
            height: { ideal: 1280 },
          },
          audio: false,
        })
        streamRef.current = stream
        setActiveFacing(mode)
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          // Required for iOS inline playback.
          videoRef.current.setAttribute('playsinline', 'true')
          videoRef.current.muted = true
          await videoRef.current.play().catch(() => {
            /* autoplay can be blocked; the user tap will resume */
          })
        }
        setStatus('live')
      } catch (err) {
        const e = err as DOMException
        if (
          e?.name === 'NotAllowedError' ||
          e?.name === 'SecurityError'
        ) {
          setStatus('denied')
          setError('Camera permission was denied. Please allow camera access.')
        } else if (e?.name === 'NotFoundError') {
          setStatus('error')
          setError('No camera device was found on this machine.')
        } else {
          setStatus('error')
          setError(e?.message || 'Could not start the camera.')
        }
      }
    },
    [activeFacing]
  )

  const switchCamera = useCallback(() => {
    const next = activeFacing === 'environment' ? 'user' : 'environment'
    return start(next)
  }, [activeFacing, start])

  /** Capture the current video frame as a JPEG data URL. Returns null if not live. */
  const captureFrame = useCallback(
    (quality = 0.82): string | null => {
      const video = videoRef.current
      if (!video || status !== 'live') return null
      const w = video.videoWidth
      const h = video.videoHeight
      if (!w || !h) return null
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) return null
      ctx.drawImage(video, 0, 0, w, h)
      try {
        return canvas.toDataURL('image/jpeg', quality)
      } catch {
        return null
      }
    },
    [status]
  )

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
        streamRef.current = null
      }
    }
  }, [])

  return {
    videoRef,
    status,
    error,
    activeFacing,
    start,
    stop,
    switchCamera,
    captureFrame,
  }
}

'use client'

// Standalone camera diagnostic page — bypasses the modal entirely.
// Visit /test-camera on any device to see the raw getUserMedia result
// and the exact error if it fails. This helps diagnose whether the
// problem is in our modal code or in the browser/camera itself.
//
// URL: https://circub.vercel.app/test-camera  (production)
//      http://localhost:3000/test-camera    (local dev)

import { useState, useRef, useEffect, useCallback } from 'react'

export default function TestCameraPage() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [status, setStatus] = useState<string>('Idle — click "Start camera" below')
  const [error, setError] = useState<string | null>(null)
  const [errorName, setErrorName] = useState<string | null>(null)
  const [logs, setLogs] = useState<string[]>([])
  const [facingMode, setFacingMode] = useState<'environment' | 'user' | 'any'>('environment')

  const log = useCallback((msg: string) => {
    const ts = new Date().toLocaleTimeString()
    setLogs((prev) => [...prev, `[${ts}] ${msg}`])
    console.log('[test-camera]', msg)
  }, [])

  const stop = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setStatus('Stopped')
  }, [])

  const start = useCallback(async () => {
    setError(null)
    setErrorName(null)
    setLogs([])
    log('=== Starting camera test ===')

    // Check 1: secure context
    log(`window.isSecureContext = ${window.isSecureContext}`)
    log(`window.location.protocol = ${window.location.protocol}`)
    log(`window.location.hostname = ${window.location.hostname}`)
    if (window.isSecureContext === false) {
      const msg = 'FAIL: Not a secure context. Camera requires HTTPS or localhost.'
      setError(msg)
      setErrorName('InsecureContext')
      setStatus(msg)
      log(msg)
      return
    }

    // Check 2: API support
    log(`navigator.mediaDevices = ${navigator.mediaDevices ? 'available' : 'MISSING'}`)
    log(`navigator.mediaDevices.getUserMedia = ${navigator.mediaDevices?.getUserMedia ? 'function' : 'MISSING'}`)
    if (!navigator.mediaDevices?.getUserMedia) {
      const msg = 'FAIL: navigator.mediaDevices.getUserMedia is not available in this browser.'
      setError(msg)
      setErrorName('NoGetUserMedia')
      setStatus(msg)
      log(msg)
      return
    }

    // Check 3: enumerate devices (sometimes blocked before permission)
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      const videoDevices = devices.filter((d) => d.kind === 'videoinput')
      log(`Found ${videoDevices.length} video input device(s)`)
      if (videoDevices.length === 0) {
        const msg = 'FAIL: No video input devices found.'
        setError(msg)
        setErrorName('NoVideoDevices')
        setStatus(msg)
        log(msg)
        return
      }
      videoDevices.forEach((d, i) => log(`  video device ${i}: label="${d.label}" (deviceId hidden)`))
    } catch (e: any) {
      log(`enumerateDevices failed (not fatal): ${e?.name}: ${e?.message}`)
    }

    // Check 4: actually request camera
    setStatus('Requesting camera...')
    log(`Calling getUserMedia with facingMode=${facingMode}...`)
    const constraints: MediaStreamConstraints = {
      video:
        facingMode === 'any'
          ? true
          : { facingMode: { ideal: facingMode } },
      audio: false,
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      streamRef.current = stream
      log(`SUCCESS: got stream with ${stream.getTracks().length} track(s)`)
      stream.getTracks().forEach((t, i) => {
        log(`  track ${i}: kind=${t.kind} label="${t.label}" enabled=${t.enabled} readyState=${t.readyState}`)
      })

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        log('Attaching stream to <video> element...')
        try {
          await videoRef.current.play()
          log('Video is playing.')
          setStatus('Camera is LIVE ✅ — the stream is working.')
        } catch (e: any) {
          log(`play() failed: ${e?.name}: ${e?.message}`)
          setStatus(`Stream attached but play() failed: ${e?.message}`)
        }
      }
    } catch (e: any) {
      const name = e?.name || 'unknown'
      const msg = e?.message || 'unknown error'
      setErrorName(name)
      setError(`getUserMedia FAILED: ${name}: ${msg}`)
      setStatus(`FAILED: ${name}`)
      log(`FAILED: ${name}: ${msg}`)
      log(`Original error object:`, e)
    }
  }, [facingMode, log])

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
      }
    }
  }, [])

  return (
    <div className="min-h-screen bg-black text-white p-4 sm:p-6">
      <div className="max-w-2xl mx-auto space-y-4">
        <header className="space-y-1">
          <h1 className="text-xl sm:text-2xl font-bold">📷 Camera Diagnostic</h1>
          <p className="text-sm text-white/70">
            This page tests your browser's camera access directly. Visit this on the device
            where the camera isn't working to see the exact failure.
          </p>
        </header>

        <div className="rounded-lg border border-white/20 bg-white/5 p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-white/60">Camera:</span>
            <select
              value={facingMode}
              onChange={(e) => setFacingMode(e.target.value as any)}
              className="bg-black border border-white/30 rounded px-2 py-1 text-sm"
            >
              <option value="environment">Back camera</option>
              <option value="user">Front camera</option>
              <option value="any">Any camera</option>
            </select>
          </div>

          <div className="flex gap-2 flex-wrap">
            <button
              onClick={start}
              className="bg-white text-black font-medium px-4 py-2 rounded-lg hover:bg-white/90"
            >
              Start camera
            </button>
            <button
              onClick={stop}
              className="bg-white/10 text-white border border-white/30 font-medium px-4 py-2 rounded-lg hover:bg-white/20"
            >
              Stop
            </button>
          </div>

          <div className="text-sm">
            <p className="text-white/60">Status:</p>
            <p className={`font-mono ${error ? 'text-red-400' : 'text-emerald-400'}`}>{status}</p>
            {errorName && (
              <p className="text-amber-400 mt-1">
                Error type: <span className="font-mono">{errorName}</span>
              </p>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-white/20 bg-white/5 p-4">
          <video
            ref={videoRef}
            muted
            playsInline
            autoPlay
            className="w-full aspect-video bg-black rounded-md"
          />
          {!streamRef.current && (
            <div className="text-center text-white/50 text-sm py-12 -mt-12 pointer-events-none">
              No camera stream yet
            </div>
          )}
        </div>

        {error && (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-4 space-y-3 text-sm">
            <p className="font-semibold text-red-400">❌ {error}</p>

            {/* Browser detection so we show the right fix instructions */}
            {(() => {
              const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
              const isChrome = /Chrome\//.test(ua) && !/Edg\//.test(ua) && !/OPR\//.test(ua)
              const isEdge = /Edg\//.test(ua)
              const isFirefox = /Firefox\//.test(ua)
              const isSafari = /Safari\//.test(ua) && !/Chrome\//.test(ua)
              const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
              const isAndroid = /Android/.test(ua)
              const isMobile = isIOS || isAndroid
              const browserName = isIOS
                ? 'iOS Safari'
                : isAndroid
                  ? isChrome
                    ? 'Android Chrome'
                    : 'Android browser'
                  : isEdge
                    ? 'Desktop Edge'
                    : isChrome
                      ? 'Desktop Chrome'
                      : isFirefox
                        ? 'Desktop Firefox'
                        : isSafari
                          ? 'Desktop Safari'
                          : 'Unknown browser'

              return (
                <div className="space-y-2 text-white/80">
                  <p className="text-white font-medium">
                    🌐 Detected browser: <span className="text-amber-300">{browserName}</span>
                  </p>
                  <p>
                    <strong>Why this happens:</strong> Your browser remembers that you previously denied
                    camera access for this site, so it auto-rejects every <code className="bg-black/40 px-1 rounded">getUserMedia</code>{' '}
                    call without re-prompting you. The fix is to <strong>manually clear that remembered denial</strong>{' '}
                    in your browser's site-permissions settings, then reload this page.
                  </p>

                  {errorName === 'NotAllowedError' && (
                    <ol className="space-y-3 list-decimal pl-5 mt-2">
                      {isIOS && (
                        <li>
                          <strong>iPhone / iPad (Safari):</strong>
                          <ol className="mt-1 space-y-1 list-disc pl-4 text-white/70">
                            <li>iOS Settings → <strong>Safari</strong> → Camera & Microphone Access → <strong>Allow</strong></li>
                            <li>iOS Settings → Privacy & Security → Camera → make sure <strong>Safari</strong> is ON</li>
                            <li>Reload this page in Safari (pull-to-refresh or tap the URL → Go)</li>
                            <li>Tap "Start camera" again — you should now see the iOS permission prompt</li>
                          </ol>
                        </li>
                      )}
                      {isAndroid && (
                        <li>
                          <strong>Android (Chrome):</strong>
                          <ol className="mt-1 space-y-1 list-disc pl-4 text-white/70">
                            <li>Tap the 🔒 lock icon in the URL bar → Permissions → Camera → <strong>Allow</strong></li>
                            <li>Or: Chrome menu ⋮ → Settings → Site settings → Camera → find circub.vercel.app → <strong>Allow</strong></li>
                            <li>Reload this page (⤴ or pull-to-refresh)</li>
                            <li>Tap "Start camera" again — you should see the Android permission prompt</li>
                          </ol>
                        </li>
                      )}
                      {(isChrome || isEdge) && !isMobile && (
                        <li>
                          <strong>{browserName}:</strong>
                          <ol className="mt-1 space-y-1 list-disc pl-4 text-white/70">
                            <li>
                              Copy & paste this into a new tab:{' '}
                              <code className="bg-black/40 px-1.5 py-0.5 rounded break-all">
                                {isEdge ? 'edge://settings/content/camera' : 'chrome://settings/content/camera'}
                              </code>
                            </li>
                            <li>Scroll to "Not allowed to use your camera" (or "Block" list)</li>
                            <li>Find <code className="bg-black/40 px-1 rounded">https://circub.vercel.app</code> → click ⋯ → <strong>Remove</strong></li>
                            <li>Come back to this tab and reload (Ctrl+R / Cmd+R)</li>
                            <li>Tap "Start camera" again — the permission prompt should reappear</li>
                          </ol>
                          <p className="mt-2 text-white/70 text-xs">
                            ⚡ Quick test: open this page in an <strong>Incognito window</strong> (Ctrl+Shift+N)
                            — incognito sessions don't remember denials, so you can confirm the camera works.
                          </p>
                        </li>
                      )}
                      {isFirefox && !isMobile && (
                        <li>
                          <strong>Desktop Firefox:</strong>
                          <ol className="mt-1 space-y-1 list-disc pl-4 text-white/70">
                            <li>Click the 🔒 padlock icon in the address bar</li>
                            <li>Click "Clear permissions for this site"</li>
                            <li>Reload this page (Ctrl+R)</li>
                            <li>Tap "Start camera" — Firefox will re-prompt</li>
                          </ol>
                          <p className="mt-2 text-white/70 text-xs">
                            ⚡ Quick test: open this page in a <strong>Private Window</strong> (Ctrl+Shift+P)
                            — private windows don't remember denials.
                          </p>
                        </li>
                      )}
                      {isSafari && !isMobile && (
                        <li>
                          <strong>Desktop Safari:</strong>
                          <ol className="mt-1 space-y-1 list-disc pl-4 text-white/70">
                            <li>Safari menu → Settings → Websites → Camera</li>
                            <li>Find <code className="bg-black/40 px-1 rounded">circub.vercel.app</code> in the list</li>
                            <li>Change to <strong>Allow</strong> or <strong>Ask</strong></li>
                            <li>Reload this page (Cmd+R)</li>
                            <li>Tap "Start camera" — Safari will re-prompt</li>
                          </ol>
                        </li>
                      )}
                      {!isChrome && !isEdge && !isFirefox && !isSafari && !isMobile && (
                        <li>
                          <strong>Unknown browser:</strong> Look in your browser settings for "Site permissions"
                          or "Camera permissions" and clear the denial for <code className="bg-black/40 px-1 rounded">circub.vercel.app</code>.
                          Or try a different browser.
                        </li>
                      )}
                    </ol>
                  )}

                  <p className="text-white/60 text-xs pt-2 border-t border-white/10 mt-2">
                    💡 After clearing the denial, you MUST reload this page before clicking "Start camera" —
                    browsers only re-evaluate permissions on page load.
                  </p>
                </div>
              )
            })()}
          </div>
        )}

        <div className="rounded-lg border border-white/20 bg-white/5 p-4">
          <p className="text-sm font-semibold mb-2">Diagnostic log:</p>
          <pre className="text-xs font-mono text-emerald-400 whitespace-pre-wrap overflow-x-auto">
            {logs.length === 0 ? '(no logs yet — click "Start camera")' : logs.join('\n')}
          </pre>
        </div>

        <div className="text-xs text-white/50 space-y-1">
          <p>
            <strong>URL:</strong> {typeof window !== 'undefined' ? window.location.href : ''}
          </p>
          <p>
            <strong>HTTPS:</strong> {typeof window !== 'undefined' ? (window.isSecureContext ? 'Yes ✅' : 'No ❌') : ''}
          </p>
          <p className="break-all">
            <strong>User agent:</strong> {typeof navigator !== 'undefined' ? navigator.userAgent : ''}
          </p>
          <p>
            <strong>Platform:</strong> {typeof navigator !== 'undefined' ? navigator.platform : ''}
          </p>
        </div>
      </div>
    </div>
  )
}

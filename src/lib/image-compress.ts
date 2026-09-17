// Client-side media compression before upload.
//
// Images: downscales to fit within `maxDim` px and re-encodes as JPEG. Phone
// photos land around 100-300 KB instead of 2-5 MB, keeping uploads fast and
// DB payloads small. HEIC/HEIF (iPhone) is attempted too — Safari 17+ can
// decode it via createImageBitmap; on browsers that can't, the file simply
// passes through unchanged.
//
// Videos: `compressVideo` re-encodes clips larger than ~3 MB in the browser
// (canvas + MediaRecorder) so the stored data URL keeps the follow-up JSON
// post under the ~4.5 MB serverless request limit.

const DECODABLE_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif']

// Keep compressed media at or under this so base64 (× 4/3) + payload fits
// within platform request limits on every host.
export const MAX_MEDIA_BYTES = 3 * 1024 * 1024

export async function compressImage(file: File, maxDim = 1280, quality = 0.78): Promise<File> {
  // Only compress what the canvas can decode; anything unusual passes through.
  if (!DECODABLE_IMAGE_TYPES.includes(file.type)) return file
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height))
    if (scale >= 1 && file.size <= 400 * 1024) {
      // Already small enough — pass through untouched.
      bitmap.close?.()
      return file
    }
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close?.()
    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/jpeg', quality)
    )
    if (!blob || blob.size >= file.size) return file
    return new File([blob], file.name.replace(/\.(png|webp|heic|heif)$/i, '') + '.jpg', { type: 'image/jpeg' })
  } catch {
    return file
  }
}

// ---------------------------------------------------------------------------
// Video re-encode. Plays the clip into a canvas (capped at 720p) and records
// it with MediaRecorder at a bitrate sized to land under `maxBytes`. Audio is
// kept via an AudioContext graph that is NOT connected to the speakers, so
// processing stays silent. Browsers without MediaRecorder fall back to a
// clear error for oversized clips (small ones pass straight through).
// ---------------------------------------------------------------------------

function pickRecorderMime(): string {
  if (typeof MediaRecorder === 'undefined') return ''
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=h264,opus',
    'video/webm',
    'video/mp4',
  ]
  return candidates.find((c) => MediaRecorder.isTypeSupported(c)) || ''
}

export async function compressVideo(file: File, maxBytes = MAX_MEDIA_BYTES): Promise<File> {
  if (!file.type.startsWith('video/')) return file
  if (file.size <= maxBytes) return file

  const mime = pickRecorderMime()
  if (!mime) {
    throw new Error('Video is too large to upload — please pick a clip under 3 MB.')
  }

  const video = document.createElement('video')
  const objectUrl = URL.createObjectURL(file)
  video.src = objectUrl
  video.playsInline = true
  video.preload = 'auto'

  try {
    // Load metadata (resolve duration + dimensions).
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout')), 15000)
      video.onloadedmetadata = () => { clearTimeout(timer); resolve() }
      video.onerror = () => { clearTimeout(timer); reject(new Error('decode')) }
    })

    // Some webm sources report Infinity — force duration computation.
    if (!isFinite(video.duration)) {
      await new Promise<void>((resolve) => {
        video.currentTime = 1e7
        video.onseeked = () => resolve()
        setTimeout(resolve, 3000)
      })
    }
    const duration = isFinite(video.duration) && video.duration > 0 ? Math.min(video.duration, 180) : 30

    const scale = Math.min(1, 720 / Math.max(video.videoWidth || 720, video.videoHeight || 720))
    const w = Math.max(2, Math.round((video.videoWidth || 720) * scale / 2) * 2)
    const h = Math.max(2, Math.round((video.videoHeight || 720) * scale / 2) * 2)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas')

    // Audio graph: element -> destination (captured) but NOT to speakers.
    let audioCtx: AudioContext | null = null
    let audioTrack: MediaStreamTrack | null = null
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      audioCtx = new AC()
      const srcNode = audioCtx.createMediaElementSource(video)
      const dstNode = audioCtx.createMediaStreamDestination()
      srcNode.connect(dstNode)
      audioTrack = dstNode.stream.getAudioTracks()[0] || null
    } catch {
      audioCtx = null
      audioTrack = null
    }

    const canvasStream = canvas.captureStream(30)
    const stream = new MediaStream([...canvasStream.getVideoTracks(), ...(audioTrack ? [audioTrack] : [])])

    // Bitrate budget: leave room for the 96 kbps audio track + container overhead.
    const videoBitsPerSecond = Math.max(250_000, Math.min(2_500_000, Math.floor((maxBytes * 8) / duration) - 140_000))
    const recorder = new MediaRecorder(stream, {
      mimeType: mime,
      videoBitsPerSecond,
      audioBitsPerSecond: 96_000,
    })
    const chunks: Blob[] = []
    recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data) }
    const stopped = new Promise<void>((resolve) => { recorder.onstop = () => resolve() })

    // Playback must start for frames to flow. Try unmuted first (keeps the
    // audio track alive in the graph); autoplay policies may force a mute.
    try { await video.play() } catch { video.muted = true; await video.play().catch(() => {}) }

    recorder.start(250)
    let stoppedDrawing = false
    const draw = () => {
      if (stoppedDrawing) return
      ctx.drawImage(video, 0, 0, w, h)
      requestAnimationFrame(draw)
    }
    draw()

    await new Promise<void>((resolve) => {
      const finish = () => { stoppedDrawing = true; resolve() }
      video.onended = finish
      setTimeout(finish, (duration + 6) * 1000)
    })
    if (recorder.state !== 'inactive') recorder.stop()
    await stopped

    video.pause()
    canvasStream.getTracks().forEach((t) => t.stop())
    if (audioCtx) await audioCtx.close().catch(() => {})

    const blob = new Blob(chunks, { type: mime.split(';')[0] })
    if (!blob.size) throw new Error('empty')
    if (blob.size > maxBytes * 1.05) {
      throw new Error('This video is still too long to upload — please pick a clip under a minute or trim it first.')
    }
    if (blob.size >= file.size) {
      // Re-encoding didn't shrink it — the original can't fit the request
      // limits either, so failing loudly beats a silent oversized upload.
      throw new Error('This video is too long to upload — please pick a clip under a minute or trim it first.')
    }
    const name = file.name.replace(/\.[^.]+$/, '') + '.webm'
    return new File([blob], name, { type: mime.split(';')[0] })
  } catch (err) {
    // Re-encode impossible/failed — surface an actionable message for clips
    // that can't fit; small-enough edge cases (rare here due to the size
    // guard above) still go through untouched.
    if (err instanceof Error && /too long|too large/.test(err.message)) throw err
    throw new Error('This video could not be processed for upload — please pick a shorter clip (under 3 MB if possible).')
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

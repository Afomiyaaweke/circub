// Client-side image compression before upload — downscales to fit within
// `maxDim` px and re-encodes as JPEG. Phone photos land around 100-300 KB
// instead of 2-5 MB, keeping uploads fast and DB payloads small.

export async function compressImage(file: File, maxDim = 1280, quality = 0.78): Promise<File> {
  // Only compress what the canvas can decode; anything unusual passes through.
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) return file
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
    return new File([blob], file.name.replace(/\.(png|webp)$/i, '') + '.jpg', { type: 'image/jpeg' })
  } catch {
    return file
  }
}

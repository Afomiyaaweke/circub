'use client'

import QRCode from 'qrcode'
import { formatUnitSuffix } from '@/lib/utils'

/**
 * Light minimal share poster (Task 77, reskinned v181).
 *
 * Draws a social-media-ready 1080x1350 PNG poster for a feed post or a
 * local price post: soft white-to-mint background, one thin green hairline
 * frame, circubAwd logo + wordmark, the shared content big in the middle,
 * and a QR code + link at the bottom so anyone who sees it on
 * WhatsApp / X / Telegram / printed flyers can land on circubAwd.
 *
 * v181 ('make this template less dark, more light and simple'): the old
 * dark-neon skin (near-black green gradient, neon glows, scan lines,
 * perspective grid, glowing double frame, corner accents) is replaced by
 * a clean light theme - brand green stays as the single accent color.
 *
 * Pure canvas (no DOM) so it can run inside a modal on demand; logo and QR
 * are loaded asynchronously, everything else is drawn synchronously.
 */

export type SharePosterTarget =
  | {
      kind: 'post'
      authorName: string
      authorUsername?: string | null
      content: string
      date: string
    }
  | {
      kind: 'price'
      productName: string
      category?: string | null
      currency: string
      priceMin: number
      priceMax: number
      // v122: measuring unit from the unified composer ("50 / kg" on posters)
      unit?: string | null
      city?: string | null
      country?: string | null
      imageUrl?: string | null // v117: the post's photo is drawn onto the poster
      authorName?: string | null
      authorUsername?: string | null
      date: string
      // v152: the price-by-location compare strip (the same data the feed
      // card shows) drawn onto the poster - pre-formatted by the caller as a
      // title + one label line so the canvas code stays dumb.
      compareTitle?: string | null
      compareLabel?: string | null
    }

/**
 * The author's public shop profile URL (/u/<username>) - the QR code and
 * every share route point HERE when the author has a username, so anyone
 * scanning the poster lands on the poster's shop (their listings, products
 * and posts) instead of the generic home page. Falls back to null when the
 * author has no username; callers then keep their previous deep links.
 */
export function posterProfileUrl(target: SharePosterTarget, origin: string): string | null {
  const username = target.authorUsername?.trim()
  if (!username) return null
  return `${origin.replace(/\/$/, '')}/u/${encodeURIComponent(username)}`
}

export function posterShareText(target: SharePosterTarget, url: string): string {
  const handle = target.authorUsername?.trim() ? ` @${target.authorUsername.trim()}` : ''
  if (target.kind === 'price') {
    const place = [target.city, target.country].filter(Boolean).join(', ')
    const range = target.priceMin === target.priceMax
      ? `${target.currency} ${target.priceMin.toLocaleString('en-US')}${formatUnitSuffix(target.unit)}`
      : `${target.currency} ${target.priceMin.toLocaleString('en-US')}-${target.priceMax.toLocaleString('en-US')}${formatUnitSuffix(target.unit)}`
    return `Check this price on circub: ${target.productName}${place ? ` in ${place}` : ''} - ${range}${handle ? ` by${handle}` : ''}`
  }
  const trimmed = target.content.length > 140 ? target.content.slice(0, 140) + '…' : target.content
  if (handle) return `${trimmed} —${handle} on circubAwd`
  return `${trimmed} — ${target.authorName} on circubAwd`
}

export function posterFileName(target: SharePosterTarget): string {
  return `circubAwd-${target.kind}-poster.png`
}

const W = 1080
const H = 1350
const INSET = 40

const FONT = (size: number, weight = 'bold'): string =>
  `${weight} ${size}px -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const attempt = current ? `${current} ${word}` : word
    if (ctx.measureText(attempt).width <= maxWidth || !current) {
      current = attempt
    } else {
      lines.push(current)
      current = word
      if (lines.length === maxLines) break
    }
  }
  if (lines.length < maxLines && current) lines.push(current)
  if (lines.length === maxLines && current && words.join(' ') !== lines.join(' ')) {
    let last = lines[maxLines - 1]
    while (ctx.measureText(last + '…').width > maxWidth && last.length > 1) last = last.slice(0, -1)
    lines[maxLines - 1] = last.replace(/[\s,.;:]+$/, '') + '…'
  }
  return lines
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, startSize: number, minSize: number, weight = 'bold'): number {
  let size = startSize
  while (size > minSize && ctx.measureText(text).width > maxWidth) {
    size -= 4
    ctx.font = FONT(size, weight)
  }
  return size
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

function drawPin(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  // Simple map-pin path (no emoji fonts needed on headless browsers).
  ctx.save()
  ctx.fillStyle = '#16a34a'
  ctx.beginPath()
  ctx.arc(x, y - s * 0.9, s * 0.72, Math.PI * 0.95, Math.PI * 0.05)
  ctx.lineTo(x, y)
  ctx.closePath()
  ctx.fill()
  ctx.beginPath()
  ctx.arc(x, y - s * 0.95, s * 0.28, 0, Math.PI * 2)
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  ctx.restore()
}

async function drawBackground(ctx: CanvasRenderingContext2D) {
  // v181: light minimal backdrop - a soft white-to-mint gradient. The old
  // dark skin's neon glows, scan lines and perspective grid are gone.
  const grad = ctx.createLinearGradient(0, 0, W, H)
  grad.addColorStop(0, '#ffffff')
  grad.addColorStop(0.55, '#f5fbf7')
  grad.addColorStop(1, '#ecf7f0')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, W, H)

  // One whisper-soft mint wash top-left so the white isn't sterile
  const wash = ctx.createRadialGradient(180, 160, 0, 180, 160, 640)
  wash.addColorStop(0, 'rgba(34,197,94,0.07)')
  wash.addColorStop(1, 'rgba(34,197,94,0)')
  ctx.fillStyle = wash
  ctx.fillRect(0, 0, W, H)
}

function drawFrame(ctx: CanvasRenderingContext2D) {
  // v181: one thin soft-green hairline - the glow, the double border and
  // the corner accents are gone (light + simple).
  ctx.strokeStyle = '#bbf7d0'
  ctx.lineWidth = 2
  roundRect(ctx, INSET, INSET, W - INSET * 2, H - INSET * 2, 34)
  ctx.stroke()
}

async function drawBrand(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const logo = await loadImage('/logo.png')
  const logoSize = 92
  if (logo) {
    ctx.drawImage(logo, x, y - logoSize + 8, logoSize, logoSize)
  }
  ctx.textAlign = 'left'
  ctx.fillStyle = '#052e16'
  ctx.font = FONT(58)
  ctx.fillText('circubAwd', x + logoSize + 22, y - 6)
  ctx.font = FONT(26, '600')
  ctx.fillStyle = '#16a34a'
  ctx.fillText('REAL LOCAL PRICES', x + logoSize + 24, y + 34)
}

function drawChip(ctx: CanvasRenderingContext2D, text: string, x: number, y: number): number {
  ctx.font = FONT(30, '600')
  const padX = 26
  const w = ctx.measureText(text).width + padX * 2
  const h = 56
  ctx.save()
  ctx.strokeStyle = 'rgba(22,163,74,0.35)'
  ctx.lineWidth = 2
  ctx.fillStyle = '#ecfdf5'
  roundRect(ctx, x, y, w, h, h / 2)
  ctx.fill()
  ctx.stroke()
  ctx.restore()
  ctx.fillStyle = '#15803d'
  ctx.textAlign = 'left'
  ctx.font = FONT(30, '600')
  ctx.fillText(text, x + padX, y + 38)
  return w
}

// v152: the compare strip ON THE POSTER - "also on the poster". Two
// placements: a white chip pinned to the photo's bottom edge (photo layout)
// or a title+label pair between the identity rows and the footer
// (text-only layout). Mirrors the feed card's one-line strip.
function drawCompareOnPhoto(ctx: CanvasRenderingContext2D, title: string, label: string, x: number, y: number, w: number) {
  ctx.save()
  ctx.fillStyle = 'rgba(255, 255, 255, 0.93)'
  roundRect(ctx, x, y, w, 92, 20)
  ctx.fill()
  ctx.restore()
  ctx.textAlign = 'left'
  ctx.font = FONT(fitText(ctx, title, w - 48, 22, 14, '600'), '600')
  ctx.fillStyle = '#16a34a'
  ctx.fillText(title, x + 24, y + 34)
  ctx.font = FONT(fitText(ctx, label, w - 48, 26, 14))
  ctx.fillStyle = '#052e16'
  ctx.fillText(label, x + 24, y + 70)
}

function drawCompareText(ctx: CanvasRenderingContext2D, title: string, label: string, x: number, y: number, w: number) {
  ctx.textAlign = 'left'
  ctx.font = FONT(fitText(ctx, title, w, 24, 14, '600'), '600')
  ctx.fillStyle = '#16a34a'
  ctx.fillText(title, x, y)
  ctx.font = FONT(fitText(ctx, label, w, 30, 14))
  ctx.fillStyle = '#1f2937'
  ctx.fillText(label, x, y + 42)
}

async function drawQr(ctx: CanvasRenderingContext2D, url: string, x: number, y: number, size: number) {
  try {
    const dataUrl = await QRCode.toDataURL(url, { margin: 1, width: 480, color: { dark: '#0b3b1e', light: '#ffffff' } })
    const img = await loadImage(dataUrl)
    if (!img) return
    ctx.save()
    ctx.fillStyle = '#ffffff'
    roundRect(ctx, x, y, size, size, 18)
    ctx.fill()
    ctx.strokeStyle = '#d3f1df'
    ctx.lineWidth = 2
    ctx.stroke()
    const pad = 8
    ctx.drawImage(img, x + pad, y + pad, size - pad * 2, size - pad * 2)
    ctx.restore()
  } catch {
    /* QR is decorative - poster still renders without it */
  }
}

export async function buildSharePoster(target: SharePosterTarget, linkUrl: string): Promise<Blob | null> {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  await drawBackground(ctx)
  drawFrame(ctx)
  await drawBrand(ctx, 76, 200)

  const contentX = 92
  const contentW = W - contentX * 2

  // v117: price posters include the post's own photo (uploads are data: URLs
  // and seed photos are same-origin paths - both draw cleanly; a remote image
  // that fails CORS simply falls back to the text-only layout). With a photo
  // the footer compresses slightly so the image gets room to breathe.
  const photo = target.kind === 'price' && target.imageUrl ? await loadImage(target.imageUrl) : null
  const footerTop = photo ? H - 200 : H - 250
  const qrSize = photo ? 160 : 190
  const rowCta = photo ? 56 : 66
  const rowLink = photo ? 100 : 120
  const rowTag = photo ? 140 : 164

  // Divider above the footer
  const div = ctx.createLinearGradient(contentX, 0, W - contentX, 0)
  div.addColorStop(0, 'rgba(22,163,74,0)')
  div.addColorStop(0.5, 'rgba(22,163,74,0.35)')
  div.addColorStop(1, 'rgba(22,163,74,0)')
  ctx.fillStyle = div
  ctx.fillRect(contentX, footerTop - 44, contentW, 2)

  ctx.textAlign = 'left'

  if (target.kind === 'price') {
    ctx.font = FONT(34, '600')
    ctx.fillStyle = '#16a34a'
    ctx.fillText('PRICE CHECK', contentX, 336)
    ctx.font = FONT(34, '600')
    const chipText = (target.category || 'Local price').toUpperCase()
    drawChip(ctx, chipText, contentX + ctx.measureText('PRICE CHECK').width + 24, 336 - 42)

    if (photo) {
      // ---------- v117 PHOTO LAYOUT: the post's image is the hero ----------
      // Product name - up to 2 lines above the photo
      ctx.font = FONT(56)
      ctx.fillStyle = '#052e16'
      const nameLines = wrapLines(ctx, target.productName, contentW, 2)
      let py = 402
      for (const line of nameLines) {
        ctx.fillText(line, contentX, py)
        py += 66
      }

      // Location row
      const place = [target.city, target.country].filter(Boolean).join(', ')
      if (place) {
        drawPin(ctx, contentX + 14, py - 10, 26)
        ctx.font = FONT(30, '600')
        ctx.fillStyle = '#15803d'
        ctx.fillText(place, contentX + 44, py)
        py += 50
      }

      // Photo - PROPORTIONAL card (v165: "make the shared poster also
      // proportional image that show properly"). The old layout forced every
      // photo into a fixed 896x400 strip, so portrait phone photos were
      // cover-cropped down to a thin middle band - most of the image never
      // showed. Now the card takes the photo's OWN aspect ratio: landscape
      // photos stay full width with a natural height, portrait photos shrink
      // the card's WIDTH (centered) so the whole image fits the vertical
      // budget, and the cover-crop only trims rounding-level slivers because
      // the card aspect matches the photo aspect. The height clamp keeps the
      // price row + footer divider clear (priceY <= 1090 < divider 1106).
      const aspect = photo.width / photo.height
      const phY = py + 6
      let phW = contentW
      let phH = Math.round(contentW / aspect)
      const maxH = Math.max(300, Math.min(480, 1090 - 84 - phY))
      if (phH > maxH) {
        phH = maxH
        phW = Math.min(contentW, Math.round(maxH * aspect))
      }
      if (phH < 220) {
        // extreme panorama: give the card a sane height, cover-crop trims it
        phH = 220
        phW = contentW
      }
      const phX = contentX + (contentW - phW) / 2
      ctx.save()
      roundRect(ctx, phX, phY, phW, phH, 28)
      ctx.clip()
      const scale = Math.max(phW / photo.width, phH / photo.height)
      const sw = phW / scale
      const sh = phH / scale
      ctx.drawImage(photo, (photo.width - sw) / 2, (photo.height - sh) / 2, sw, sh, phX, phY, phW, phH)
      ctx.restore()
      ctx.strokeStyle = 'rgba(22,163,74,0.4)'
      ctx.lineWidth = 2
      roundRect(ctx, phX, phY, phW, phH, 28)
      ctx.stroke()

      // Who posted it - a readable chip pinned to the photo's top-left
      if (target.authorName) {
        const byLine = `by ${target.authorName}`
        const handleText = target.authorUsername?.trim() ? ` · @${target.authorUsername.trim()}` : ''
        ctx.font = FONT(28)
        const chipW = ctx.measureText(byLine + handleText).width + 36
        ctx.save()
        ctx.fillStyle = 'rgba(255, 255, 255, 0.92)'
        roundRect(ctx, phX + 18, phY + 18, chipW, 46, 23)
        ctx.fill()
        ctx.restore()
        ctx.fillStyle = '#052e16'
        ctx.fillText(byLine, phX + 36, phY + 49)
        if (handleText) {
          ctx.fillStyle = '#16a34a'
          ctx.fillText(handleText, phX + 36 + ctx.measureText(byLine).width, phY + 49)
        }
      }

      // Price range - the hero number right under the photo
      const range = target.priceMin === target.priceMax
        ? `${target.currency} ${target.priceMin.toLocaleString('en-US')}${formatUnitSuffix(target.unit)}`
        : `${target.currency} ${target.priceMin.toLocaleString('en-US')} - ${target.priceMax.toLocaleString('en-US')}${formatUnitSuffix(target.unit)}`
      const priceY = Math.max(phY + phH + 84, 1040)
      const psize = fitText(ctx, range, contentW, 76, 48)
      ctx.font = FONT(psize)
      ctx.fillStyle = '#16a34a'
      ctx.fillText(range, contentX, priceY)

      // v152: compare strip pinned to the photo's bottom edge
      if (target.compareTitle && target.compareLabel) {
        drawCompareOnPhoto(ctx, target.compareTitle, target.compareLabel, phX + 18, phY + phH - 112, phW - 36)
      }
    } else {
      // ---------- TEXT-ONLY LAYOUT (no photo / photo failed to load) ----------
      // Product name
      ctx.font = FONT(72)
      ctx.fillStyle = '#052e16'
      const nameLines = wrapLines(ctx, target.productName, contentW, 3)
      let y = 440
      for (const line of nameLines) {
        ctx.fillText(line, contentX, y)
        y += 88
      }

      // Location row
      const place = [target.city, target.country].filter(Boolean).join(', ')
      if (place) {
        drawPin(ctx, contentX + 16, y + 6, 30)
        ctx.font = FONT(40, '600')
        ctx.fillStyle = '#15803d'
        ctx.fillText(place, contentX + 52, y + 16)
        y += 72
      }

      // Price range - the hero element
      const range = target.priceMin === target.priceMax
        ? `${target.currency} ${target.priceMin.toLocaleString('en-US')}`
        : `${target.currency} ${target.priceMin.toLocaleString('en-US')} - ${target.priceMax.toLocaleString('en-US')}`
      ctx.font = FONT(128)
      const size = fitText(ctx, range, contentW, 128, 56)
      ctx.font = FONT(size)
      ctx.fillStyle = '#16a34a'
      ctx.fillText(range, contentX, Math.max(y + 120, 780))
      ctx.font = FONT(34, '600')
      ctx.fillStyle = '#6b7280'
      ctx.fillText('typical local price range', contentX, Math.max(y + 120, 780) + 56)
      if (target.authorName) {
        // Shop identity rows - who posted this, their @handle and the date.
        // The @handle is the poster's shop link (same /u/<username> the QR
        // points to), so the poster doubles as a showcase for their shop.
        const priceY = Math.max(y + 120, 780)
        const uname = target.authorUsername?.trim()
        const byLine = `by ${target.authorName}`
        const handleText = uname ? ` · @${uname}` : ''
        ctx.font = FONT(34)
        const combined = byLine + handleText
        const idSize = fitText(ctx, combined, contentW, 34, 24)
        ctx.font = FONT(idSize)
        ctx.fillStyle = '#111827'
        ctx.fillText(byLine, contentX, priceY + 108)
        if (uname) {
          ctx.font = FONT(idSize, '600')
          ctx.fillStyle = '#16a34a'
          ctx.fillText(handleText, contentX + ctx.measureText(byLine).width, priceY + 108)
        }
        ctx.font = FONT(28, '600')
        ctx.fillStyle = '#6b7280'
        ctx.fillText(target.date, contentX, priceY + 156)
      }

      // v152: compare strip between the identity rows and the footer
      if (target.compareTitle && target.compareLabel) {
        drawCompareText(ctx, target.compareTitle, target.compareLabel, contentX, footerTop - 112, contentW)
      }
    }
  } else {
    ctx.font = FONT(34, '600')
    ctx.fillStyle = '#16a34a'
    ctx.fillText('COMMUNITY POST', contentX, 336)

    // Author chip
    ctx.beginPath()
    ctx.arc(contentX + 34, 428, 34, 0, Math.PI * 2)
    ctx.fillStyle = '#dcfce7'
    ctx.fill()
    ctx.strokeStyle = '#bbf7d0'
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.fillStyle = '#15803d'
    ctx.font = FONT(36)
    ctx.textAlign = 'center'
    ctx.fillText(target.authorName.charAt(0).toUpperCase(), contentX + 34, 441)
    ctx.textAlign = 'left'
    ctx.font = FONT(44, '600')
    ctx.fillStyle = '#052e16'
    ctx.fillText(target.authorName, contentX + 92, 418)
    ctx.font = FONT(28, '600')
    ctx.fillStyle = '#6b7280'
    const postHandle = target.authorUsername?.trim()
    ctx.fillText(postHandle ? `@${postHandle} · ${target.date}` : target.date, contentX + 92, 456)

    // Content
    ctx.font = FONT(46)
    ctx.fillStyle = '#1f2937'
    const lines = wrapLines(ctx, target.content, contentW, 9)
    let y = 560
    for (const line of lines) {
      ctx.fillText(line, contentX, y)
      y += 66
    }
  }

  // Footer: QR + call to action + link. v117: price-post shares point at the
  // post's own deep link (/?post=<id>), so the QR opens that exact price
  // detail on circubAwd - spell that out on the CTA.
  await drawQr(ctx, linkUrl, W - contentX - qrSize, footerTop, qrSize)
  const qrTextW = contentW - (qrSize + 30)
  const footerHandle = target.authorUsername?.trim()
  let cta = footerHandle ? `Scan to see @${footerHandle}'s shop` : 'Scan for real local prices'
  try {
    const lu = new URL(linkUrl, window.location.origin)
    if (lu.searchParams.has('post')) cta = 'Scan to open this price on circubAwd'
  } catch {
    /* keep the default CTA */
  }
  const ctaSize = fitText(ctx, cta, qrTextW, 44, 28, '600')
  ctx.font = FONT(ctaSize, '600')
  ctx.fillStyle = '#052e16'
  ctx.fillText(cta, contentX, footerTop + rowCta)
  try {
    const u = new URL(linkUrl, window.location.origin)
    const linkText = `${u.host}${u.pathname !== '/' ? u.pathname : ''}` || 'circubAwd.app'
    ctx.font = FONT(fitText(ctx, linkText, qrTextW, 32, 20, '600'), '600')
    ctx.fillStyle = '#16a34a'
    ctx.fillText(linkText, contentX, footerTop + rowLink)
  } catch {
    ctx.font = FONT(32, '600')
    ctx.fillStyle = '#16a34a'
    ctx.fillText('circubAwd.app', contentX, footerTop + rowLink)
  }
  ctx.font = FONT(26, '600')
  ctx.fillStyle = '#6b7280'
  ctx.fillText('Know what things actually cost · before you travel', contentX, footerTop + rowTag)

  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'))
}

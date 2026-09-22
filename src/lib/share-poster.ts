'use client'

import QRCode from 'qrcode'

/**
 * Green futuristic share poster (Task 77).
 *
 * Draws a social-media-ready 1080x1350 PNG poster for a feed post or a
 * local price post: dark futuristic background, neon-green glows and grid,
 * glowing frame, circub logo + wordmark, the shared content big in the
 * middle, and a QR code + link at the bottom so anyone who sees it on
 * WhatsApp / X / Telegram / printed flyers can land on circub.
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
      city?: string | null
      country?: string | null
      authorName?: string | null
      authorUsername?: string | null
      date: string
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
      ? `${target.currency} ${target.priceMin.toLocaleString('en-US')}`
      : `${target.currency} ${target.priceMin.toLocaleString('en-US')}-${target.priceMax.toLocaleString('en-US')}`
    return `Check this price on circub: ${target.productName}${place ? ` in ${place}` : ''} - ${range}${handle ? ` by${handle}` : ''}`
  }
  const trimmed = target.content.length > 140 ? target.content.slice(0, 140) + '…' : target.content
  if (handle) return `${trimmed} —${handle} on circub`
  return `${trimmed} — ${target.authorName} on circub`
}

export function posterFileName(target: SharePosterTarget): string {
  return `circub-${target.kind}-poster.png`
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
  ctx.fillStyle = '#4ade80'
  ctx.beginPath()
  ctx.arc(x, y - s * 0.9, s * 0.72, Math.PI * 0.95, Math.PI * 0.05)
  ctx.lineTo(x, y)
  ctx.closePath()
  ctx.fill()
  ctx.beginPath()
  ctx.arc(x, y - s * 0.95, s * 0.28, 0, Math.PI * 2)
  ctx.fillStyle = '#052e16'
  ctx.fill()
  ctx.restore()
}

async function drawBackground(ctx: CanvasRenderingContext2D) {
  const grad = ctx.createLinearGradient(0, 0, W, H)
  grad.addColorStop(0, '#071510')
  grad.addColorStop(0.5, '#0a241a')
  grad.addColorStop(1, '#061209')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, W, H)

  // Neon glows
  const glow1 = ctx.createRadialGradient(140, 180, 0, 140, 180, 520)
  glow1.addColorStop(0, 'rgba(34,197,94,0.28)')
  glow1.addColorStop(1, 'rgba(34,197,94,0)')
  ctx.fillStyle = glow1
  ctx.fillRect(0, 0, W, H)
  const glow2 = ctx.createRadialGradient(950, 1180, 0, 950, 1180, 560)
  glow2.addColorStop(0, 'rgba(74,222,128,0.20)')
  glow2.addColorStop(1, 'rgba(74,222,128,0)')
  ctx.fillStyle = glow2
  ctx.fillRect(0, 0, W, H)

  // Futuristic horizontal scan lines
  ctx.strokeStyle = 'rgba(134,239,172,0.05)'
  ctx.lineWidth = 1
  for (let y = 80; y < H; y += 56) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(W, y)
    ctx.stroke()
  }
  // Faint perspective grid on the lower third
  ctx.strokeStyle = 'rgba(74,222,128,0.07)'
  for (let i = -6; i <= 6; i++) {
    ctx.beginPath()
    ctx.moveTo(W / 2 + i * 70, H * 0.72)
    ctx.lineTo(W / 2 + i * 260, H)
    ctx.stroke()
  }
}

function drawFrame(ctx: CanvasRenderingContext2D) {
  ctx.save()
  ctx.shadowColor = 'rgba(34,197,94,0.8)'
  ctx.shadowBlur = 26
  ctx.strokeStyle = '#22c55e'
  ctx.lineWidth = 3
  roundRect(ctx, INSET, INSET, W - INSET * 2, H - INSET * 2, 34)
  ctx.stroke()
  ctx.shadowBlur = 0
  ctx.strokeStyle = 'rgba(134,239,172,0.18)'
  ctx.lineWidth = 1
  roundRect(ctx, INSET + 14, INSET + 14, W - (INSET + 14) * 2, H - (INSET + 14) * 2, 26)
  ctx.stroke()
  ctx.restore()
  // Corner accents
  ctx.strokeStyle = '#4ade80'
  ctx.lineWidth = 5
  const c = 56
  const corners: Array<[number, number, number, number]> = [
    [INSET + 6, INSET + 6 + c, INSET + 6, INSET + 6],
    [INSET + 6, INSET + 6, INSET + 6 + c, INSET + 6],
    [W - INSET - 6 - c, H - INSET - 6, W - INSET - 6, H - INSET - 6],
    [W - INSET - 6, H - INSET - 6, W - INSET - 6, H - INSET - 6 - c],
  ]
  for (const [x1, y1, x2, y2] of corners) {
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()
  }
}

async function drawBrand(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const logo = await loadImage('/logo.png')
  const logoSize = 92
  if (logo) {
    ctx.save()
    ctx.shadowColor = 'rgba(34,197,94,0.7)'
    ctx.shadowBlur = 22
    ctx.drawImage(logo, x, y - logoSize + 8, logoSize, logoSize)
    ctx.restore()
  }
  ctx.textAlign = 'left'
  ctx.fillStyle = '#f0fdf4'
  ctx.font = FONT(58)
  ctx.fillText('circub', x + logoSize + 22, y - 6)
  ctx.font = FONT(26, '600')
  ctx.fillStyle = '#4ade80'
  ctx.fillText('REAL LOCAL PRICES', x + logoSize + 24, y + 34)
}

function drawChip(ctx: CanvasRenderingContext2D, text: string, x: number, y: number): number {
  ctx.font = FONT(30, '600')
  const padX = 26
  const w = ctx.measureText(text).width + padX * 2
  const h = 56
  ctx.save()
  ctx.strokeStyle = 'rgba(74,222,128,0.65)'
  ctx.lineWidth = 2
  ctx.fillStyle = 'rgba(34,197,94,0.12)'
  roundRect(ctx, x, y, w, h, h / 2)
  ctx.fill()
  ctx.stroke()
  ctx.restore()
  ctx.fillStyle = '#86efac'
  ctx.textAlign = 'left'
  ctx.font = FONT(30, '600')
  ctx.fillText(text, x + padX, y + 38)
  return w
}

async function drawQr(ctx: CanvasRenderingContext2D, url: string, x: number, y: number, size: number) {
  try {
    const dataUrl = await QRCode.toDataURL(url, { margin: 1, width: 480, color: { dark: '#04150c', light: '#e8fff2' } })
    const img = await loadImage(dataUrl)
    if (!img) return
    ctx.save()
    ctx.shadowColor = 'rgba(34,197,94,0.55)'
    ctx.shadowBlur = 18
    ctx.fillStyle = '#e8fff2'
    roundRect(ctx, x, y, size, size, 18)
    ctx.fill()
    ctx.shadowBlur = 0
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
  const footerTop = H - 250

  // Divider above the footer
  const div = ctx.createLinearGradient(contentX, 0, W - contentX, 0)
  div.addColorStop(0, 'rgba(74,222,128,0)')
  div.addColorStop(0.5, 'rgba(74,222,128,0.8)')
  div.addColorStop(1, 'rgba(74,222,128,0)')
  ctx.fillStyle = div
  ctx.fillRect(contentX, footerTop - 44, contentW, 3)

  ctx.textAlign = 'left'

  if (target.kind === 'price') {
    ctx.font = FONT(34, '600')
    ctx.fillStyle = '#4ade80'
    ctx.fillText('PRICE CHECK', contentX, 336)
    ctx.font = FONT(34, '600')
    const chipText = (target.category || 'Local price').toUpperCase()
    drawChip(ctx, chipText, contentX + ctx.measureText('PRICE CHECK').width + 24, 336 - 42)

    // Product name
    ctx.font = FONT(72)
    ctx.fillStyle = '#f0fdf4'
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
      ctx.fillStyle = '#bbf7d0'
      ctx.fillText(place, contentX + 52, y + 16)
      y += 72
    }

    // Price range - the hero element, glowing
    const range = target.priceMin === target.priceMax
      ? `${target.currency} ${target.priceMin.toLocaleString('en-US')}`
      : `${target.currency} ${target.priceMin.toLocaleString('en-US')} - ${target.priceMax.toLocaleString('en-US')}`
    ctx.font = FONT(128)
    const size = fitText(ctx, range, contentW, 128, 56)
    ctx.font = FONT(size)
    ctx.save()
    ctx.shadowColor = 'rgba(74,222,128,0.9)'
    ctx.shadowBlur = 34
    ctx.fillStyle = '#4ade80'
    ctx.fillText(range, contentX, Math.max(y + 120, 780))
    ctx.restore()
    ctx.font = FONT(34, '600')
    ctx.fillStyle = 'rgba(187,247,208,0.85)'
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
      ctx.fillStyle = '#f0fdf4'
      ctx.fillText(byLine, contentX, priceY + 108)
      if (uname) {
        ctx.font = FONT(idSize, '600')
        ctx.fillStyle = '#4ade80'
        ctx.fillText(handleText, contentX + ctx.measureText(byLine).width, priceY + 108)
      }
      ctx.font = FONT(28, '600')
      ctx.fillStyle = 'rgba(187,247,208,0.7)'
      ctx.fillText(target.date, contentX, priceY + 156)
    }
  } else {
    ctx.font = FONT(34, '600')
    ctx.fillStyle = '#4ade80'
    ctx.fillText('COMMUNITY POST', contentX, 336)

    // Author chip
    ctx.beginPath()
    ctx.arc(contentX + 34, 428, 34, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(34,197,94,0.25)'
    ctx.fill()
    ctx.strokeStyle = '#4ade80'
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.fillStyle = '#4ade80'
    ctx.font = FONT(36)
    ctx.textAlign = 'center'
    ctx.fillText(target.authorName.charAt(0).toUpperCase(), contentX + 34, 441)
    ctx.textAlign = 'left'
    ctx.font = FONT(44, '600')
    ctx.fillStyle = '#f0fdf4'
    ctx.fillText(target.authorName, contentX + 92, 418)
    ctx.font = FONT(28, '600')
    ctx.fillStyle = 'rgba(187,247,208,0.7)'
    const postHandle = target.authorUsername?.trim()
    ctx.fillText(postHandle ? `@${postHandle} · ${target.date}` : target.date, contentX + 92, 456)

    // Content
    ctx.font = FONT(46)
    ctx.fillStyle = '#dcfce7'
    const lines = wrapLines(ctx, target.content, contentW, 9)
    let y = 560
    for (const line of lines) {
      ctx.fillText(line, contentX, y)
      y += 66
    }
  }

  // Footer: QR + call to action + link. When the author has a shop profile
  // the QR lands on /u/<username> - spell that out so scanners know what
  // they get: the poster's full shop (listings, products, posts).
  await drawQr(ctx, linkUrl, W - contentX - 190, footerTop, 190)
  const qrTextW = contentW - 220
  const footerHandle = target.authorUsername?.trim()
  const cta = footerHandle ? `Scan to see @${footerHandle}'s shop` : 'Scan for real local prices'
  const ctaSize = fitText(ctx, cta, qrTextW, 44, 28, '600')
  ctx.font = FONT(ctaSize, '600')
  ctx.fillStyle = '#f0fdf4'
  ctx.fillText(cta, contentX, footerTop + 66)
  try {
    const u = new URL(linkUrl, window.location.origin)
    const linkText = `${u.host}${u.pathname !== '/' ? u.pathname : ''}` || 'circub.app'
    ctx.font = FONT(fitText(ctx, linkText, qrTextW, 32, 20, '600'), '600')
    ctx.fillStyle = '#4ade80'
    ctx.fillText(linkText, contentX, footerTop + 120)
  } catch {
    ctx.font = FONT(32, '600')
    ctx.fillStyle = '#4ade80'
    ctx.fillText('circub.app', contentX, footerTop + 120)
  }
  ctx.font = FONT(26, '600')
  ctx.fillStyle = 'rgba(187,247,208,0.6)'
  ctx.fillText('Know what things actually cost · before you travel', contentX, footerTop + 164)

  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'))
}

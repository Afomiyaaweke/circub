import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser, sanitizeInput } from '@/lib/session'
import { isValidGps } from '@/lib/location'

// BULK POST (v173): paste a whole spreadsheet of prices and publish every row
// as its own local price post - each row carries its own product, price,
// location, contact and (optionally) an image URL, with sheet-level defaults
// for everything a column leaves empty.
//
// POST /api/local-prices/bulk
// {
//   rows: [{
//     productName, price | priceMin+priceMax, city?, country?, contactPhone?,
//     contactEmail?, contactWhatsApp?, imageUrl?, description?
//   }, ...],
//   defaults: { currency, category?, postType?, country?, city?, alsoStory?,
//               ownsShop?, shopOwnerName? }
// v183: the batch can declare WHO sells the items - ownsShop marks every row
// as a first-party shop-owner post (amber badge) and shopOwnerName is the
// shop/business name rendered on the card + detail modal beside the badge.
// }
// - Hard cap 50 rows per call (one paste = one batch).
// - Per-row validation: a bad row never blocks the good ones - the response
//   reports exactly which row failed and why, and the good rows publish.
// - Every successful row counts toward localPostCount (one aggregated user
//   update) and flips isLocal, exactly like the single-post composer does.
// - PRODUCT rows get their auto Product twin (marketplace listing), also
//   per-row best-effort: a twin failure never blocks the price post.
// - Stories are OFF for bulk by default - a 50-row paste must not flood the
//   stories strip; callers can opt in per batch via defaults.alsoStory.

const MAX_ROWS = 50

interface BulkRow {
  productName?: unknown
  price?: unknown
  priceMin?: unknown
  priceMax?: unknown
  currency?: unknown
  city?: unknown
  country?: unknown
  contactPhone?: unknown
  contactEmail?: unknown
  contactWhatsApp?: unknown
  imageUrl?: unknown
  description?: unknown
  latitude?: unknown
  longitude?: unknown
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim())

// A row price may arrive as "120", "120-150" or two separate columns. Returns
// null when nothing numeric can be extracted - that row is then reported.
function parseRange(row: BulkRow): { min: number; max: number } | null {
  const lo = str(row.priceMin)
  const hi = str(row.priceMax)
  if (lo || hi) {
    const min = Number(lo || hi)
    const max = Number(hi || lo)
    if (Number.isFinite(min) && Number.isFinite(max) && min >= 0 && max >= min) return { min, max }
    return null
  }
  const raw = str(row.price).replace(/[^0-9.\-]/g, '')
  if (!raw) return null
  const dash = raw.indexOf('-')
  if (dash > 0) {
    const min = Number(raw.slice(0, dash))
    const max = Number(raw.slice(dash + 1))
    if (Number.isFinite(min) && Number.isFinite(max) && min >= 0 && max >= min) return { min, max }
    return null
  }
  const single = Number(raw)
  if (Number.isFinite(single) && single >= 0) return { min: single, max: single }
  return null
}

export async function POST(req: NextRequest) {
  try {
    const me = await getCurrentUser()
    if (!me) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const body = await req.json().catch(() => null)
    const rows: BulkRow[] = Array.isArray(body?.rows) ? body.rows : []
    if (!rows.length) return NextResponse.json({ error: 'No rows to post' }, { status: 400 })
    if (rows.length > MAX_ROWS)
      return NextResponse.json({ error: `Too many rows - post up to ${MAX_ROWS} at a time` }, { status: 400 })

    const d = body?.defaults || {}
    const defCurrency = str(d.currency) || 'USD'
    const defCountry = str(d.country)
    const defCity = str(d.city)
    const defCategory = str(d.category) || 'Other'
    const defPostType = str(d.postType) === 'SERVICE' ? 'SERVICE' : 'PRODUCT'
    const defPhone = str(d.contactPhone)
    const defEmail = str(d.contactEmail)
    const defWhatsApp = str(d.contactWhatsApp)
    const alsoStory = d.alsoStory === true
    // v183: batch-level shop ownership. Strict boolean like the single-post
    // route (no string leakage); the name is trimmed + capped at 100 chars.
    const defOwnsShop = d.ownsShop === true || d.ownsShop === 'true'
    const defShopOwnerName = sanitizeInput(str(d.shopOwnerName), 100)

    const created: { id: string; productName: string }[] = []
    const failed: { row: number; error: string }[] = []
    let successCount = 0
    let becameLocal = false

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      try {
        const productName = sanitizeInput(str(row.productName), 200)
        if (!productName) {
          failed.push({ row: i + 1, error: 'Product name is required' })
          continue
        }
        const range = parseRange(row)
        if (!range) {
          failed.push({ row: i + 1, error: 'Price must be a number (or a min-max range)' })
          continue
        }
        const country = sanitizeInput(str(row.country) || defCountry, 100)
        const city = sanitizeInput(str(row.city) || defCity, 100) || null
        if (!country) {
          failed.push({ row: i + 1, error: 'Country is required (row or default)' })
          continue
        }
        const currency = sanitizeInput(str(row.currency) || defCurrency, 10)
        const phone = sanitizeInput(str(row.contactPhone) || defPhone, 50) || null
        const email = sanitizeInput(str(row.contactEmail) || defEmail, 200) || null
        const whatsapp = sanitizeInput(str(row.contactWhatsApp) || defWhatsApp, 200) || null
        // v178: a row image can now be an UPLOADED PHOTO - a base64 data URL
        // from /api/upload (the per-row Photo picker compresses to ~900px so
        // a batch stays under the request limit). Data URLs get a 2 MB cap;
        // pasted http(s) links keep the old 2000-char trim.
        const rawImage = str(row.imageUrl)
        const imageUrl = (rawImage.startsWith('data:image/') ? rawImage.slice(0, 2_000_000) : rawImage.slice(0, 2000)) || null
        const gpsLat = row.latitude != null ? Number(row.latitude) : null
        const gpsLng = row.longitude != null ? Number(row.longitude) : null
        const hasGps = gpsLat != null && gpsLng != null && isValidGps(gpsLat, gpsLng)

        const post = await db.localPricePost.create({
          data: {
            postType: defPostType,
            productName,
            description: sanitizeInput(str(row.description), 2000) || null,
            country,
            city,
            currency,
            priceMin: range.min,
            priceMax: range.max,
            contactPhone: phone,
            contactEmail: email,
            contactWhatsApp: whatsapp,
            category: defCategory,
            ownsShop: defOwnsShop,
            shopOwnerName: defShopOwnerName || null,
            imageUrl,
            latitude: hasGps ? Math.round(gpsLat * 1e6) / 1e6 : null,
            longitude: hasGps ? Math.round(gpsLng * 1e6) / 1e6 : null,
            authorId: me.id,
          },
          include: { author: { select: { id: true, name: true, username: true, avatarColor: true, profilePicture: true, isLocal: true, verifiedLocal: true, idVerified: true, rating: true, helpfulVotes: true, localPostCount: true, headline: true, location: true, expertiseTags: true } } },
        })
        created.push({ id: post.id, productName: post.productName })
        successCount++
        if (!me.isLocal) becameLocal = true

        // Marketplace twin - same rule as the single composer: every PRODUCT
        // price post also appears as a product listing. Best-effort.
        if (defPostType !== 'SERVICE') {
          try {
            const mid = Math.round(((range.min + range.max) / 2) * 100) / 100
            await db.product.create({
              data: {
                name: post.productName,
                quantity: '',
                country: post.country,
                currency: post.currency,
                price: mid,
                description: post.description,
                imageUrl: post.imageUrl,
                category: post.category,
                authorId: me.id,
                localPricePostId: post.id,
              },
            })
            await db.user.update({ where: { id: me.id }, data: { postsCount: { increment: 1 } } })
          } catch (e) { console.error('Bulk twin product failed (post kept):', e) }
        }

        // Opt-in 24h story per posted row (default OFF for bulk).
        if (alsoStory) {
          try {
            const now = new Date()
            const priceBit = `${post.currency} ${post.priceMin}${post.priceMin !== post.priceMax ? '-' + post.priceMax : ''}`
            await db.story.create({
              data: {
                imageUrl: post.imageUrl,
                caption: `${post.productName} · ${priceBit}`.slice(0, 300),
                authorId: me.id,
                pricePostId: post.id,
                createdAt: now,
                expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
              },
            })
          } catch { /* story is additive */ }
        }
      } catch (e: any) {
        console.error(`Bulk row ${i + 1} failed:`, e)
        failed.push({ row: i + 1, error: e?.message ? String(e.message).slice(0, 200) : 'Failed to save' })
      }
    }

    // One aggregated counter update for the whole batch (isLocal flips once).
    if (successCount > 0) {
      const updates: any = { localPostCount: { increment: successCount } }
      if (becameLocal) updates.isLocal = true
      await db.user.update({ where: { id: me.id }, data: updates }).catch(() => {})
    }

    return NextResponse.json(
      { created, failed, count: created.length, failedCount: failed.length },
      { status: created.length ? 201 : 400 }
    )
  } catch (error) {
    console.error('Bulk post failed:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

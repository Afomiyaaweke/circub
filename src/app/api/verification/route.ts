// ============================================================================
// ACCOUNT VERIFICATION (ID / passport) - any signed-in user can upload a
// photo of their ID or passport and immediately get the verified badge.
//
// PRIVACY CONTRACT (enforced here, the only place the document is readable):
// - GET    → owner only (session required). Returns the document image and
//            metadata to ITS OWNER and nobody else. There is no public or
//            per-user endpoint that exposes userIdDocUrl.
// - POST   → validates + stores the document, sets idVerified = true.
// - DELETE → clears the document and the badge (owner request).
// Other users only ever receive the boolean `idVerified` in author selects,
// which they see as a blue BadgeCheck tag - never the document itself.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/session'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

const DOC_URL_RE = /^(data:image\/|https?:\/\/)/
// A compressed ID/passport photo is ~100-400 KB (~1.4 MB as base64 data URL);
// anything beyond ~5 MB encoded is rejected to keep DB rows and requests sane.
const MAX_DOC_URL_CHARS = 7_000_000

// GET - owner-only view of their own verification state + document.
export async function GET() {
  try {
    const me = await getCurrentUser()
    if (!me) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const user = await db.user.findUnique({
      where: { id: me.id },
      select: {
        idVerified: true,
        userIdDocType: true,
        userIdDocUrl: true, // owner-only - never selected anywhere else
        verifiedAt: true,
        guideIdDocUrl: true, // guides verified with their registration document
      },
    })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    return NextResponse.json({
      idVerified: user.idVerified || !!user.guideIdDocUrl,
      docType: user.userIdDocType,
      docUrl: user.userIdDocUrl || null,
      verifiedAt: user.verifiedAt,
      guideDocOnFile: !!user.guideIdDocUrl,
    })
  } catch (error) {
    console.error('Failed to load verification state:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

// POST - submit an ID/passport photo and get verified right away.
export async function POST(req: NextRequest) {
  try {
    const me = await getCurrentUser()
    if (!me) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    if (me.id === 'guest') {
      return NextResponse.json({ error: 'Sign up to get verified' }, { status: 401 })
    }

    const body = await req.json().catch(() => ({}))
    const docType = typeof body.docType === 'string' ? body.docType.trim().toUpperCase() : ''
    const docUrl = typeof body.docUrl === 'string' ? body.docUrl.trim() : ''

    if (docType !== 'ID' && docType !== 'PASSPORT') {
      return NextResponse.json({ error: 'Choose a document type: ID card or passport.' }, { status: 400 })
    }
    if (!docUrl || !DOC_URL_RE.test(docUrl)) {
      return NextResponse.json({ error: 'Upload a photo of your document first.' }, { status: 400 })
    }
    if (docUrl.length > MAX_DOC_URL_CHARS) {
      return NextResponse.json({ error: 'Document image too large - please retake it.' }, { status: 413 })
    }

    const updated = await db.user.update({
      where: { id: me.id },
      data: {
        idVerified: true,
        userIdDocType: docType,
        userIdDocUrl: docUrl,
        verifiedAt: new Date(),
      },
      select: { idVerified: true, userIdDocType: true, verifiedAt: true },
    })

    return NextResponse.json({
      idVerified: updated.idVerified,
      docType: updated.userIdDocType,
      verifiedAt: updated.verifiedAt,
      // NOTE: the document URL is intentionally NOT echoed back here -
      // the owner can view it any time via GET /api/verification.
    })
  } catch (error) {
    console.error('Failed to submit verification:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

// DELETE - remove the document and the verified badge (owner request).
export async function DELETE() {
  try {
    const me = await getCurrentUser()
    if (!me) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    if (me.id === 'guest') {
      return NextResponse.json({ error: 'Sign up first' }, { status: 401 })
    }

    await db.user.update({
      where: { id: me.id },
      data: { idVerified: false, userIdDocType: null, userIdDocUrl: null, verifiedAt: null },
    })

    return NextResponse.json({ idVerified: false })
  } catch (error) {
    console.error('Failed to remove verification:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

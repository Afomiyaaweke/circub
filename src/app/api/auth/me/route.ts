// Get current authenticated user (replaces the old hardcoded /api/me)
import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/session'
import { db } from '@/lib/db'

// GET: full profile for the logged-in user (stats, guide fields, ...).

export async function GET() {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // Fetch fresh user data with all stats
    const me = await db.user.findUnique({
      where: { id: user.id },
      include: {
        products: { select: { id: true } },
        connRequested: true,
        connReceived: true,
      },
    })

    if (!me) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const incomingPending = me.connReceived.filter(
      (c) => c.status === 'PENDING'
    ).length

    return NextResponse.json({
      id: me.id,
      name: me.name,
      email: me.email,
      avatarColor: me.avatarColor,
      profilePicture: me.profilePicture,
      bio: me.bio,
      headline: me.headline,
      location: me.location,
      phone: me.phone,
      whatsapp: me.whatsapp,
      accountType: me.accountType,
      companyName: me.companyName,
      companyWebsite: me.companyWebsite,
      companySize: me.companySize,
      companyIndustry: me.companyIndustry,
      postsCount: me.products.length,
      followersCount: me.followersCount,
      likesCount: me.likesCount,
      connectionsCount: me.connectionsCount,
      incomingInvitationsCount: incomingPending,
      isLocal: me.isLocal,
      verifiedLocal: me.verifiedLocal,
      isGuide: me.isGuide,
      rating: me.rating,
      guideLicense: me.guideLicense,
      guideLanguages: me.guideLanguages ? me.guideLanguages.split(',').filter(Boolean) : [],
      guideSpecialties: me.guideSpecialties ? me.guideSpecialties.split(',').filter(Boolean) : [],
      guideHourlyRate: me.guideHourlyRate,
      guideCurrency: me.guideCurrency,
      guideBio: me.guideBio,
      guideAvailable: me.guideAvailable,
      // Verification document: expose only the type + whether it's on file —
      // NEVER the image itself (a multi-MB data URL would bloat every load).
      guideIdDocType: me.guideIdDocType,
      hasIdDoc: !!me.guideIdDocUrl,
      // Account verification (ID/passport upload): the badge flag + document
      // type only. The image is fetched separately by its owner via
      // GET /api/verification — never shipped through /me.
      idVerified: me.idVerified || !!me.guideIdDocUrl,
      userIdDocType: me.userIdDocType,
      hasUserIdDoc: !!me.userIdDocUrl,
      verifiedAt: me.verifiedAt,
    })
  } catch (error) {
    console.error('Failed to fetch current user:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

// PATCH /api/auth/me — update own profile.
// Fixes the old 405: the edit-profile modal has always called this, but the
// handler never existed. Accepts base profile fields + all guide fields so
// guides can fix their guide profile here too (same shape the guide-register
// modal uses).
export async function PATCH(req: Request) {
  try {
    const me = await getCurrentUser()
    if (!me) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const data: Record<string, unknown> = {}

    // --- base profile fields ---
    if (typeof body.name === 'string' && body.name.trim()) data.name = body.name.trim().slice(0, 80)
    if (typeof body.headline === 'string') data.headline = body.headline.trim().slice(0, 120) || null
    if (typeof body.location === 'string') data.location = body.location.trim().slice(0, 120) || null
    if (typeof body.bio === 'string') data.bio = body.bio.trim().slice(0, 2000) || null
    if (typeof body.profilePicture === 'string') data.profilePicture = body.profilePicture.trim() || null
    if (typeof body.expertiseTags === 'string') data.expertiseTags = body.expertiseTags.trim().slice(0, 300) || null
    // Contact channels (same as local price posts: phone / email / WhatsApp)
    if (typeof body.phone === 'string') data.phone = body.phone.trim().slice(0, 40) || null
    if (typeof body.whatsapp === 'string') data.whatsapp = body.whatsapp.trim().slice(0, 200) || null

    // --- guide profile fields (only meaningful for guides) ---
    if (me.isGuide) {
      if (typeof body.guideBio === 'string') data.guideBio = body.guideBio.trim().slice(0, 2000) || null
      if (typeof body.guideSpecialties === 'string') data.guideSpecialties = body.guideSpecialties.trim().slice(0, 300) || null
      if (typeof body.guideLanguages === 'string') data.guideLanguages = body.guideLanguages.trim().slice(0, 300) || null
      if (typeof body.guideLicense === 'string') data.guideLicense = body.guideLicense.trim().slice(0, 120) || null
      if (body.guideHourlyRate !== undefined) {
        const rate = Number(body.guideHourlyRate)
        data.guideHourlyRate = Number.isFinite(rate) && rate >= 0 ? rate : null
      }
      if (typeof body.guideCurrency === 'string') data.guideCurrency = body.guideCurrency.trim().slice(0, 8) || null
      if (body.guideAvailable !== undefined) data.guideAvailable = body.guideAvailable !== false
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
    }

    const updated = await db.user.update({
      where: { id: me.id },
      data,
      select: {
        id: true, name: true, headline: true, location: true, bio: true,
        profilePicture: true, expertiseTags: true, phone: true, whatsapp: true,
        isGuide: true, guideLicense: true, guideLanguages: true,
        guideSpecialties: true, guideHourlyRate: true, guideCurrency: true,
        guideBio: true, guideAvailable: true,
      },
    })

    return NextResponse.json({
      user: {
        ...updated,
        guideLanguages: updated.guideLanguages ? updated.guideLanguages.split(',').filter(Boolean) : [],
        guideSpecialties: updated.guideSpecialties ? updated.guideSpecialties.split(',').filter(Boolean) : [],
      },
    })
  } catch (error) {
    console.error('Failed to update profile:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

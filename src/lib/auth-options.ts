import { NextAuthOptions } from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import { db } from '@/lib/db'
import { isPastRetention } from '@/lib/deactivation'

// Shared NextAuth options - imported by BOTH:
//   1. the [...nextauth] route handler (encrypts the session JWT), and
//   2. every getServerSession() call (decrypts it).
//
// getServerSession() called WITHOUT options (or with a different secret) can
// never decode the session cookie: it falls back to NEXTAUTH_SECRET/AUTH_SECRET
// only and would silently return null - Google users would complete the OAuth
// dance and still appear signed out. Passing these exact options everywhere
// keeps the secret and provider config identical on both sides.
//
// Dynamic NextAuth URL - works on Vercel production + preview + localhost.
//
// CRITICAL for Google OAuth: the redirect_uri we send to Google MUST match
// what's in Google Cloud Console → Authorized redirect URIs.
//
// Resolution order:
//   1. NEXTAUTH_URL env var IF it's not a localhost URL on Vercel production
//      (catches the common mistake of accidentally setting
//       NEXTAUTH_URL=http://localhost:3000 in Vercel env vars)
//   2. VERCEL_URL env var (auto-set by Vercel for every deployment)
//   3. NODE_ENV=development → http://localhost:3000 (local dev fallback)
//   4. undefined (let NextAuth infer from the request host)
//
// IMPORTANT - the matching redirect URI must exist in Google Console:
//   - For production: https://circub.vercel.app/api/auth/callback/google
//   - For each preview URL you want to test: https://<preview>.vercel.app/api/auth/callback/google
//   - For local dev: http://localhost:3000/api/auth/callback/google
//
// To get a STABLE redirect_uri that doesn't change per deploy, set
// NEXTAUTH_URL=https://circub.vercel.app in Vercel env vars (Production only).
function getAuthUrl(): string | undefined {
  const isProd = process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production'

  if (process.env.NEXTAUTH_URL) {
    // On Vercel production, ignore NEXTAUTH_URL=http://localhost:* - it's almost
    // always a leaked local-dev value that breaks OAuth.
    if (isProd && process.env.NEXTAUTH_URL.startsWith('http://localhost')) {
      console.warn(
        `[nextauth] NEXTAUTH_URL is set to ${process.env.NEXTAUTH_URL} on production - ignoring and falling back to VERCEL_URL. To use a custom domain, set NEXTAUTH_URL=https://yourdomain.com (NOT localhost).`
      )
    } else {
      return process.env.NEXTAUTH_URL
    }
  }

  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  if (process.env.NODE_ENV !== 'production') return 'http://localhost:3000'
  return undefined
}

// `url` is consumed by NextAuth's core at runtime (base url for redirects)
// but is missing from the published NextAuthOptions type - intersect it in.
export const nextAuthOptions: NextAuthOptions & { url?: string } = {
  providers: [
    GoogleProvider({
      clientId:
        process.env.GOOGLE_CLIENT_ID ||
        '349861539680-usdnfntjka3jkm5n2violbmqdq986jik.apps.googleusercontent.com',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    }),
  ],
  callbacks: {
    // v134: a deactivated account signs back in with the same credentials -
    // Google sign-in included, no email verification. A successful OAuth
    // sign-in on a deactivated row IS the reactivation (the password-login
    // path does the same in /api/auth/login). Past the 6-month retention
    // window the row is purged here, and getCurrentUser()'s first-sign-in
    // auto-create then builds a brand-new account for the returning user.
    async signIn({ user, account }) {
      if (user?.email && account?.provider === 'google') {
        try {
          const row = await db.user.findUnique({
            where: { email: user.email.toLowerCase() },
            select: { id: true, deactivatedAt: true },
          })
          if (row?.deactivatedAt) {
            if (isPastRetention(row.deactivatedAt)) {
              await db.user.delete({ where: { id: row.id } })
            } else {
              await db.user.update({
                where: { id: row.id },
                data: { deactivatedAt: null, deactivationReason: null },
              })
            }
          }
        } catch (e) {
          // Never block sign-in because the deactivation check failed.
          console.error('[nextauth] deactivation reactivation check failed:', e)
        }
      }
      return true
    },
    async jwt({ token, user, account }) {
      if (user) {
        token.email = user.email
        token.name = user.name
        token.image = user.image
      }
      if (account?.provider) {
        token.provider = account.provider
      }
      return token
    },
    async session({ session, token }) {
      ;(session as any).provider = token.provider
      return session
    },
  },
  pages: {
    signIn: '/',
  },
  session: {
    strategy: 'jwt',
  },
  secret: process.env.SESSION_SECRET || process.env.NEXTAUTH_SECRET || 'circub-fallback-secret',
  url: getAuthUrl(),
  cookies: {
    sessionToken: {
      name: 'next-auth.session-token',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production',
      },
    },
    callbackUrl: {
      name: 'next-auth.callback-url',
      options: {
        sameSite: 'lax',
        path: '/',
        secure: process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production',
      },
    },
    csrfToken: {
      name: 'next-auth.csrf-token',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production',
      },
    },
  },
}

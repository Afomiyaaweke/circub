import NextAuth from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'

// Dynamic NextAuth URL — works on Vercel preview/prod URLs + localhost + network IPs.
//
// Resolution order (with safety checks at each step):
//   1. NEXTAUTH_URL env var IF it's not a localhost URL on Vercel production
//      (catches the common mistake of accidentally setting NEXTAUTH_URL=http://localhost:3000
//       in Vercel env vars, which breaks Google OAuth because NextAuth sends redirect_uri
//       = http://localhost:3000/api/auth/callback/google to Google, who rejects it)
//   2. VERCEL_URL env var (auto-set by Vercel for every deployment — works for previews)
//   3. NODE_ENV=development → http://localhost:3000 (local dev fallback)
//   4. undefined (let NextAuth infer from the request host)
//
// On Vercel production (NODE_ENV=production, VERCEL_ENV=production):
//   - If NEXTAUTH_URL starts with localhost → ignore it, use VERCEL_URL instead
//   - Otherwise use NEXTAUTH_URL (custom domain)
//
// This defensive check prevents the most common Vercel OAuth failure mode.
function getAuthUrl(): string | undefined {
  const isProd = process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production'

  if (process.env.NEXTAUTH_URL) {
    // On Vercel production, ignore NEXTAUTH_URL=http://localhost:* — it's almost
    // always a leaked local-dev value that breaks OAuth.
    if (isProd && process.env.NEXTAUTH_URL.startsWith('http://localhost')) {
      console.warn(
        `[nextauth] NEXTAUTH_URL is set to ${process.env.NEXTAUTH_URL} on production — ignoring and falling back to VERCEL_URL. To use a custom domain, set NEXTAUTH_URL=https://yourdomain.com (NOT localhost).`
      )
    } else {
      return process.env.NEXTAUTH_URL
    }
  }

  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  if (process.env.NODE_ENV !== 'production') return 'http://localhost:3000'
  return undefined
}

const handler = NextAuth({
  providers: [
    GoogleProvider({
      // Hardcoded client ID is fine (public, like an API key for read-only OAuth).
      // The client secret MUST come from env (GOOGLE_CLIENT_SECRET) — never commit it.
      clientId:
        process.env.GOOGLE_CLIENT_ID ||
        '349861539680-usdnfntjka3jkm5n2violbmqdq986jik.apps.googleusercontent.com',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    }),
  ],
  callbacks: {
    async signIn() {
      // Allow sign in — user is auto-created in getCurrentUser() on first /api/auth/me call.
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
    // Use lax sameSite so the OAuth callback redirect works on Vercel HTTPS
    // (cross-site redirect from accounts.google.com back to your app).
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
})

export { handler as GET, handler as POST }

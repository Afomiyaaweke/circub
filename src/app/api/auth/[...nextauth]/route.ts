import NextAuth from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'

// Dynamic NextAuth URL — works on Vercel preview/prod URLs + localhost + network IPs.
//
// Resolution order:
//   1. NEXTAUTH_URL env var (explicit, always wins — use for custom domains on Vercel)
//   2. VERCEL_URL env var (auto-set by Vercel for every deployment — works for previews)
//   3. NODE_ENV=development → http://localhost:3000 (local dev fallback)
//   4. undefined (let NextAuth infer from the request host)
//
// On Vercel:
//   - For production deployments at circub.vercel.app: VERCEL_URL is set to that host
//   - For preview deployments at circub-xyz.vercel.app: VERCEL_URL is the preview host
//   - If you want a custom domain, set NEXTAUTH_URL=https://yourdomain.com in Vercel env vars
//
// IMPORTANT: Google OAuth only allows redirect URIs that are registered in the
// Google Cloud Console. For each environment (production URL, preview URL, localhost)
// you must add the corresponding /api/auth/callback/google URI. Google does not
// support wildcards, so preview URLs each need to be added individually OR you
// set NEXTAUTH_URL=https://circub.vercel.app in Vercel so previews also use the
// production URL (recommended for OAuth).
function getAuthUrl(): string | undefined {
  if (process.env.NEXTAUTH_URL) return process.env.NEXTAUTH_URL
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

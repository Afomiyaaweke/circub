import NextAuth from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'

// Dynamic NextAuth URL — works on Vercel preview/prod URLs + localhost.
// Without this, NextAuth uses the request URL which can mismatch the
// Google OAuth authorized redirect URIs, causing sign-in to fail.
function getAuthUrl(): string | undefined {
  if (process.env.NEXTAUTH_URL) return process.env.NEXTAUTH_URL
  // On Vercel, the deployment URL is in VERCEL_URL (includes the
  // <project>.vercel.app hostname for the current deployment).
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  // Local dev fallback
  if (process.env.NODE_ENV !== 'production') return 'http://localhost:3000'
  return undefined
}

const handler = NextAuth({
  providers: [
    GoogleProvider({
      // Hardcoded client ID is fine (public), but the secret MUST come from env.
      clientId:
        process.env.GOOGLE_CLIENT_ID ||
        '349861539680-usdnfntjka3jkm5n2violbmqdq986jik.apps.googleusercontent.com',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    }),
  ],
  callbacks: {
    async signIn() {
      // Allow sign in — user is auto-created in getCurrentUser() on first /api/auth/me call
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
  // Explicit URL fixes OAuth redirect mismatches on Vercel preview deployments.
  url: getAuthUrl(),
  cookies: {
    // Use lax sameSite so the OAuth callback redirect works on Vercel HTTPS.
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

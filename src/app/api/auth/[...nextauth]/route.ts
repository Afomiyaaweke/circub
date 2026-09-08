import NextAuth from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'

// Dynamic NextAuth URL — works on Vercel preview/prod URLs + localhost.
//
// NOTE: Google OAuth only allows `localhost` or public domains as redirect
// URIs — raw IP addresses like 21.0.9.225 are rejected by Google. So if
// you're accessing the dev server via a network IP, Google sign-in won't
// work. Use http://localhost:3000 in your browser instead. Email/password
// auth works regardless of hostname.
function getAuthUrl(): string | undefined {
  if (process.env.NEXTAUTH_URL) return process.env.NEXTAUTH_URL
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  if (process.env.NODE_ENV !== 'production') return 'http://localhost:3000'
  return undefined
}

const handler = NextAuth({
  providers: [
    GoogleProvider({
      clientId:
        process.env.GOOGLE_CLIENT_ID ||
        '349861539680-usdnfntjka3jkm5n2violbmqdq986jik.apps.googleusercontent.com',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    }),
  ],
  callbacks: {
    async signIn() {
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
})

export { handler as GET, handler as POST }

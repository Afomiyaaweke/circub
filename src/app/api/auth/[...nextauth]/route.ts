import NextAuth from 'next-auth'
import { nextAuthOptions } from '@/lib/auth-options'

// Dynamic NextAuth URL - works on Vercel production + preview + localhost.
//
// CRITICAL for Google OAuth: the redirect_uri we send to Google MUST match
// what's in Google Cloud Console → Authorized redirect URIs.
//
// The full option set (providers, secret, url, cookies, callbacks) lives in
// src/lib/auth-options.ts and is SHARED with every getServerSession() call -
// see the note there for why this is required for Google sign-in to work.
//
//   - For production: https://circub.vercel.app/api/auth/callback/google
//   - For each preview URL you want to test: https://<preview>.vercel.app/api/auth/callback/google
//   - For local dev: http://localhost:3000/api/auth/callback/google
const handler = NextAuth(nextAuthOptions)

export { handler as GET, handler as POST }

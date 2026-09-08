# Deploying circub to Vercel (5,000 concurrent users target)

This guide walks through deploying the app to Vercel with a managed Postgres database so sign-in, registration, and publishing all work correctly at scale.

## Why Vercel was failing

The app used **SQLite** (a file on disk). Vercel's serverless functions have a **read-only filesystem** — every invocation starts in a fresh container, so the SQLite file doesn't persist and writes silently fail. That's why registration returned 500 errors and Google sign-in bounced back with `?error=google` (the database couldn't store the new user row).

The fix: migrate to **Postgres** (Vercel Postgres, Neon, Supabase, or Railway) and set the right environment variables.

## Step 1 — Create a Postgres database

Pick one (all have free tiers that handle 5,000 concurrent users with caching):

### Neon (recommended)
1. Go to https://neon.tech → Sign up
2. Create a project → copy the **pooled connection string** (ends with `?sslmode=require`)
3. Add `&pgbouncer=true&connection_limit=10` to the URL
4. Final URL looks like:
   ```
   postgresql://user:pass@ep-xxx-pooler.region.aws.neon.tech/dbname?sslmode=require&pgbouncer=true&connection_limit=10
   ```

### Vercel Postgres (easiest if you're already on Vercel)
1. Vercel dashboard → Storage → Create Database → Postgres
2. Copy the **pooled connection string** (port 6543)

### Supabase
1. https://supabase.com → New project
2. Settings → Database → Connection string (Pooler / Transaction mode, port 6543)

## Step 2 — Push the schema to Postgres

```bash
# Set DATABASE_URL to your Postgres connection string first
export DATABASE_URL="postgresql://user:pass@ep-xxx-pooler.../dbname?pgbouncer=true&connection_limit=10"

# Push the schema (creates all tables + indexes)
bun run db:push:pg
```

This runs `prisma db push --schema prisma/schema.postgres.prisma` which uses the Postgres-compatible schema with all indexes (composite indexes on every hot query path, unique constraints, etc.).

## Step 3 — Set Vercel environment variables

In your Vercel project → Settings → Environment Variables, add these for **Production** AND **Preview** environments:

| Name | Value | Required? |
|------|-------|-----------|
| `DATABASE_URL` | Your Postgres pooled connection string | ✅ required |
| `SESSION_SECRET` | `openssl rand -hex 32` output | ✅ required |
| `NEXTAUTH_SECRET` | Same value as SESSION_SECRET | ✅ required |
| `GOOGLE_CLIENT_ID` | Your Google OAuth client ID | Optional (for Google sign-in) |
| `GOOGLE_CLIENT_SECRET` | Your Google OAuth client secret | Optional (for Google sign-in) |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob store token | Optional (for production uploads) |

**Important**: `NEXTAUTH_URL` is **not required** — NextAuth auto-detects it from `VERCEL_URL` on Vercel.

## Step 4 — Configure Google OAuth (if used)

If you want "Continue with Google" to work:

### 4a. Add redirect URIs in Google Cloud Console

1. Go to https://console.cloud.google.com → APIs & Services → Credentials
2. Click the OAuth 2.0 Client ID (the one ending in `.apps.googleusercontent.com`)
3. Under **Authorized redirect URIs**, add these one per line:
   - `https://circub.vercel.app/api/auth/callback/google` ← your production URL
   - `https://circub-b7jdcufxc-tenet1.vercel.app/api/auth/callback/google` ← your preview URL (from Vercel logs)
   - `http://localhost:3000/api/auth/callback/google` ← for local dev
4. Click **Save** at the bottom (this is easy to miss — the URIs don't save until you click)

Google does NOT support wildcards, so each unique preview URL must be added manually. For most projects, you only need the production URL + localhost.

### 4b. Set GOOGLE_CLIENT_SECRET on Vercel

1. In Google Cloud Console → same OAuth 2.0 Client ID → **Client secret** section → copy the value starting with `GOCSPX-`
2. Vercel dashboard → your project → Settings → Environment Variables
3. Add `GOOGLE_CLIENT_SECRET` = `GOCSPX-...` for Production AND Preview environments

### 4c. Do NOT set NEXTAUTH_URL on Vercel

The code auto-detects the deployment URL via `VERCEL_URL`. Setting `NEXTAUTH_URL` to anything (especially `http://localhost:3000`) on Vercel will break Google sign-in because NextAuth will use that URL instead of the real one.

If you have a custom domain (e.g. `circub.com`), then set:
- `NEXTAUTH_URL=https://circub.com` (Production env only)
- Also add `https://circub.com/api/auth/callback/google` to Google OAuth redirect URIs

### 4d. Test

After deploying, visit your Vercel URL → click "Continue with Google" → should redirect to accounts.google.com → after picking an account, redirect back to your app → land on the dashboard.

If Google sign-in fails:
- **`?error=google` in URL**: NextAuth couldn't start the OAuth flow → `GOOGLE_CLIENT_SECRET` not set on Vercel
- **Google error page "redirect_uri_mismatch"**: the Vercel URL is not in Google's authorized redirect URIs
- **`?error=OAuthCallback`**: Google returned an error during the callback → check Vercel function logs for the specific message
- **`?error=Configuration`**: NextAuth config error → check `SESSION_SECRET` / `NEXTAUTH_SECRET` is set on Vercel

## Step 5 — Deploy

```bash
git push origin main
```

Vercel will:
1. Run `node scripts/prisma-build.mjs && next build` (from `package.json`)
2. The prisma-build script auto-detects whether `DATABASE_URL` is SQLite or Postgres
   and picks the right schema (`schema.prisma` for SQLite, `schema.postgres.prisma`
   for Postgres). On Vercel with a Postgres `DATABASE_URL`, it uses the Postgres schema.
3. If `VERCEL=1` and DATABASE_URL is Postgres, prisma-build also runs `prisma db push`
   to make sure all tables exist (idempotent — does nothing if they already exist).
4. Deploy to a production URL like `https://circub.vercel.app`
5. Subsequent pushes auto-deploy

### If you see "the URL must start with the protocol file:" errors on Vercel

This means the Prisma client was built with the SQLite schema but the runtime
DATABASE_URL is Postgres (or vice versa). To fix:

1. Verify `DATABASE_URL` is set in Vercel env vars (Settings → Environment Variables)
2. Verify the value starts with `postgres://` or `postgresql://`
3. Trigger a redeploy (Deployments → click ⋯ → Redeploy)
4. Check the build logs — you should see `[prisma-build] Using schema: schema.postgres.prisma`

## Step 6 — Verify

After deployment:
1. Visit your Vercel URL
2. Click **Sign up** → use email + password (not Google initially)
3. Confirm you're logged in and can see the dashboard
4. Go to Local tab → "Post a Local Price" → publish → confirm it appears in the list
5. If Google sign-in is configured, test it in a fresh private window

## What's been done to scale to 5,000 concurrent users

### Database
- ✅ Postgres schema with composite indexes on every hot query path (feed filters, votes, by author, by city, by category)
- ✅ Connection pooling via `?pgbouncer=true&connection_limit=10` (prevents connection exhaustion)
- ✅ Unique constraints enforced at DB level (race-safe upserts)

### Caching
- ✅ `Cache-Control: public, s-maxage=30, stale-while-revalidate=60` on `/api/local-prices` (the main feed)
- ✅ `Cache-Control: public, s-maxage=60, stale-while-revalidate=120` on sidebar widgets
- ✅ `Cache-Control: public, s-maxage=120, stale-while-revalidate=300` on filter lists and trending
- This collapses thousands of repeated identical reads into a single DB hit per cache window.

### Auth
- ✅ NextAuth URL auto-detected from `VERCEL_URL` (works for preview + production deployments)
- ✅ Cookie `secure` flag set based on `VERCEL_ENV` (HTTPS on Vercel, HTTP on localhost)
- ✅ Cookie `sameSite=lax` so Google OAuth redirects work
- ✅ Session secret required on Vercel (set the same value for Preview + Production)

### Uploads
- ✅ `/api/upload` auto-uses Vercel Blob when `BLOB_READ_WRITE_TOKEN` is set (CDN-backed URLs)
- ✅ Falls back to base64 for local dev (no extra setup)
- ✅ Larger file limits when using Blob (10 MB images, 50 MB videos)

### Vercel plan recommendations

| Plan | Concurrent users comfortably | Why |
|------|------------------------------|-----|
| Hobby | ~100 | Function invocations capped at 100 |
| **Pro** ($20/mo) | **~5,000** | 1,000-second function duration, more bandwidth, faster builds |
| Enterprise | 10,000+ | Custom limits, DDoS protection, SSO |

For the **5,000 concurrent users target** you specified, you need **Vercel Pro** + Neon Postgres (Pro tier ~$19/mo for higher connection limits).

## Troubleshooting

### "Registration failed" still happening
Check Vercel function logs: `vercel logs <deployment-url>` or Vercel dashboard → Deployments → click deployment → Logs. The most likely cause is `DATABASE_URL` not set or pointing to the wrong DB.

### Google sign-in shows "Google sign-in unavailable" toast
That's intentional — it means `GOOGLE_CLIENT_SECRET` isn't set on Vercel. Set it and redeploy.

### Posts publish but don't appear in the feed
Wait 30 seconds — that's the CDN cache window (`s-maxage=30`). Hard refresh (Ctrl/Cmd+Shift+R) to bypass.

### Database connection errors at high load
- Confirm your `DATABASE_URL` uses the **pooled** endpoint (port 6543, with `?pgbouncer=true`)
- Reduce `connection_limit=10` to `connection_limit=5` if your Postgres plan has a low connection cap
- On Neon free tier (100 connections max), upgrade to Pro for autoscaling

### Rate limit (429) errors
The in-memory rate limiter is per-instance on Vercel — with 5,000 users you might see rare false positives. To fix properly, add Upstash Redis:
```bash
bun add @upstash/ratelimit @upstash/redis
```
Then update `src/lib/session.ts` `checkRateLimit` to use Redis. (Left as a TODO — not critical for the typical user pattern of browse-then-publish.)

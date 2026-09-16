// Build-time Prisma schema selector.
//
// Picks the right Prisma schema file based on DATABASE_URL:
//   - SQLite (file:...)         -> prisma/schema.prisma          (provider = sqlite)
//   - Postgres (postgresql:...) -> prisma/schema.postgres.prisma (provider = postgresql)
//
// Used by package.json `build` script so Vercel automatically picks
// Postgres when DATABASE_URL is a Postgres URL, and local dev keeps
// using SQLite without any changes.
//
// This script is idempotent and safe to run in any environment.

import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'

const dbUrl = process.env.DATABASE_URL || ''
const isPostgres = dbUrl.startsWith('postgres://') || dbUrl.startsWith('postgresql://')

const schemaFlag = isPostgres ? '--schema prisma/schema.postgres.prisma' : '--schema prisma/schema.prisma'

console.log(`[prisma-build] DATABASE_URL scheme: ${dbUrl.split(':')[0] || '(unset)'}`)
console.log(`[prisma-build] Using schema: ${isPostgres ? 'schema.postgres.prisma' : 'schema.prisma'}`)

if (isPostgres && !existsSync('prisma/schema.postgres.prisma')) {
  console.error('[prisma-build] ERROR: DATABASE_URL is Postgres but prisma/schema.postgres.prisma is missing.')
  console.error('[prisma-build] Run `git pull` to get the latest, or check the file exists.')
  process.exit(1)
}

// Generate the Prisma client with the right schema.
// Use the locally-installed prisma binary (not the global one) so this works
// the same on Vercel build containers as on local dev.
const prismaBin = existsSync('node_modules/.bin/prisma') ? './node_modules/.bin/prisma' : 'prisma'
execSync(`${prismaBin} generate ${schemaFlag}`, { stdio: 'inherit' })

// If DATABASE_URL is set AND it's Postgres, also push the schema to the DB
// so tables exist (idempotent — does nothing if tables already exist).
// This makes the first deploy just work without needing a manual db push.
if (isPostgres && process.env.VERCEL === '1') {
  console.log('[prisma-build] Vercel environment detected. Pushing schema to Postgres (idempotent)...')
  // The push MUST succeed or every User query 500s at runtime (missing
  // columns -> P2022 -> login/register/profile save all break, while the
  // deploy itself looks green). Retry once before giving up.
  let pushed = false
  for (let attempt = 1; attempt <= 2 && !pushed; attempt++) {
    try {
      execSync(`${prismaBin} db push --accept-data-loss ${schemaFlag}`, { stdio: 'inherit' })
      pushed = true
    } catch (e) {
      console.warn(`[prisma-build] db push attempt ${attempt} failed:`, e.message)
      if (attempt === 1) {
        console.warn('[prisma-build] Retrying in 5s (transient DB connection issues are common on cold builds)...')
        execSync('sleep 5')
      }
    }
  }
  if (!pushed) {
    // Don't fail the build — the deploy may still be wanted — but make the
    // failure impossible to miss in the Vercel build log.
    console.error('[prisma-build] WARNING: db push FAILED after retries. If the schema changed, the live site WILL 500 on auth/profile routes until a successful deploy.')
  }
}

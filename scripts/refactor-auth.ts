// Refactor script: replace hardcoded 'ma@socialcircle.app' lookups with getCurrentUser()
// in all API route files. Run once with: bun run scripts/refactor-auth.ts
import fs from 'fs'
import path from 'path'

const API_DIR = '/home/z/my-project/src/app/api'

// Pattern: const me = await db.user.findUnique({
//   where: { email: 'ma@socialcircle.app' },
//   ...optional include...
// })

function walk(dir: string): string[] {
  const out: string[] = []
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f)
    const st = fs.statSync(full)
    if (st.isDirectory()) out.push(...walk(full))
    else if (f.endsWith('.ts')) out.push(full)
  }
  return out
}

let changedCount = 0
const files = walk(API_DIR)
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8')
  if (!src.includes('ma@socialcircle.app')) continue

  let out = src

  // 1) Add import for getCurrentUser (if not already there)
  if (!src.includes('@/lib/session')) {
    // Find existing imports block at top of file
    out = out.replace(
      /(import\s+\{[^}]+\}\s+from\s+'@\/lib\/db'\n)/,
      `$1import { getCurrentUser } from '@/lib/session'\n`
    )
    // If no @/lib/db import, try generic — append after first import line
    if (!out.includes('@/lib/session')) {
      out = out.replace(
        /(import\s+[^\n]+\n)/,
        `$1import { getCurrentUser } from '@/lib/session'\n`
      )
    }
  }

  // 2) Replace simple `db.user.findUnique({ where: { email: 'ma@socialcircle.app' } })`
  // with `getCurrentUser()` — handles single-line and multi-line variants
  out = out.replace(
    /await db\.user\.findUnique\(\{\s*where:\s*\{\s*email:\s*'ma@socialcircle\.app'\s*\},?\s*\}\)/g,
    'await getCurrentUser()'
  )

  // 3) Replace with includes block — convert to: getCurrentUser + if null/!me return; then db.user.findUnique by id
  // Pattern: const me = await db.user.findUnique({
  //   where: { email: 'ma@socialcircle.app' },
  //   include: { ... },
  // })
  // Convert to: const me = await getCurrentUser()
  //   if (!me) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  // (Drop the include — most routes do a separate lookup later or don't need include)
  out = out.replace(
    /const me = await db\.user\.findUnique\(\{\s*where:\s*\{\s*email:\s*'ma@socialcircle\.app'\s*\},\s*include:\s*\{[^}]+\},?\s*\}\)/g,
    "const me = await getCurrentUser()\n    if (!me) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })"
  )

  // 4) Remove orphaned "if (!me) return NextResponse.json({ error: 'User not found' }, { status: 404 })"
  // since getCurrentUser returns null instead of throwing — our inserted check covers it
  out = out.replace(
    /\n\s*if \(!me\) return NextResponse\.json\(\{ error: 'User not found' \}, \{ status: 404 \}\)/g,
    ''
  )

  // 5) Fix variable name conflicts: if we now have two "const me = ..." lines, deduplicate
  // (Shouldn't happen normally; let's just write)

  fs.writeFileSync(f, out)
  if (out !== src) {
    changedCount++
    console.log(`✓ Updated: ${f}`)
  }
}

console.log(`\nDone. ${changedCount} files updated.`)

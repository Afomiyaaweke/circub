// Database reset script: clears all demo/false data and starts the app on a clean slate.
// Run with: bun run scripts/seed.ts
// No demo users, posts, prices, messages, or connections are created.
import { db } from '../src/lib/db'

async function reset() {
  console.log('🧹 Wiping all data from database...')

  await db.localPriceReport.deleteMany()
  await db.localPriceVote.deleteMany()
  await db.localPricePost.deleteMany()
  await db.message.deleteMany()
  await db.comment.deleteMany()
  await db.postLike.deleteMany()
  await db.post.deleteMany()
  await db.like.deleteMany()
  await db.product.deleteMany()
  await db.connection.deleteMany()
  await db.user.deleteMany()

  const counts = await Promise.all([
    db.user.count(),
    db.product.count(),
    db.post.count(),
    db.connection.count(),
    db.message.count(),
    db.localPricePost.count(),
    db.localPriceVote.count(),
    db.localPriceReport.count(),
  ])

  console.log('✅ Database is now empty:')
  console.log(`   Users:           ${counts[0]}`)
  console.log(`   Products:        ${counts[1]}`)
  console.log(`   Posts:            ${counts[2]}`)
  console.log(`   Connections:     ${counts[3]}`)
  console.log(`   Messages:        ${counts[4]}`)
  console.log(`   Local prices:    ${counts[5]}`)
  console.log(`   Local votes:     ${counts[6]}`)
  console.log(`   Local reports:  ${counts[7]}`)
  console.log('✓ Database reset complete. Sign up to create your first real account.')
}

reset()
  .catch((e) => {
    console.error('Reset error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })

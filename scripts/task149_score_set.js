// Task 149 visual check helper: temporarily set the seed posters' scores so
// the "rated" display paths of the Score section can be screenshotted on the
// local dev DB (SQLite). NOT for prod. Run with: node scripts/task149_score_set.js <revert>
const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()
const revert = process.argv[2] === 'revert'

async function main() {
  const dawit = await db.user.findFirst({ where: { name: 'Dawit Tesfaye' } })
  const meron = await db.user.findFirst({ where: { name: 'Meron Tadesse' } })
  if (!dawit || !meron) { console.error('seed posters not found'); process.exit(1) }
  const data = revert
    ? { helpfulVotes: 0 }
    : { helpfulVotes: 7 }
  const dataM = revert
    ? { rating: 0 }
    : { rating: 4.5 }
  await db.user.update({ where: { id: dawit.id }, data })
  await db.user.update({ where: { id: meron.id }, data: dataM })
  console.log(revert ? 'reverted: Dawit helpfulVotes=0, Meron rating=0' : 'set: Dawit helpfulVotes=7, Meron rating=4.5')
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => db.$disconnect())

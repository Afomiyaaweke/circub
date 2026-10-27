// Task 226 sweep - remove probe rows (t226probe_*), keep the 4 t226_ fixtures.
const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()
async function main() {
  const users = await db.user.findMany({ where: { username: { startsWith: 't226probe_' } }, select: { id: true } })
  const ids = users.map((u) => u.id)
  if (!ids.length) { console.log('nothing to sweep'); return }
  const c1 = await db.questClaim.deleteMany({ where: { OR: [{ quest: { userId: { in: ids } } }, { userId: { in: ids } }] } })
  const q = await db.quest.deleteMany({ where: { userId: { in: ids } } })
  const u = await db.user.deleteMany({ where: { id: { in: ids } } })
  console.log(`swept: claims=${c1.count} quests=${q.count} users=${u.count}`)
}
main().catch((e) => { console.error(e); process.exit(1) }).finally(() => db.$disconnect())

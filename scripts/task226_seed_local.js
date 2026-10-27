// Task 226 local seed - 4 member seeds + 3 guide-directory members with roles
// (incl. one travel agent) + 2 open quests. Safe to re-run: wipes seeded
// prefixes first. Run: node scripts/task226_seed_local.js  (from /home/z/circub)
const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()

const PREFIX = 't226_'

async function main() {
  // sweep previous runs of this task's fixtures
  const oldUsers = await db.user.findMany({ where: { username: { startsWith: PREFIX } }, select: { id: true } })
  const oldIds = oldUsers.map((u) => u.id)
  if (oldIds.length) {
    await db.questClaim.deleteMany({ where: { OR: [{ quest: { userId: { in: oldIds } } }, { userId: { in: oldIds } }] } })
    await db.quest.deleteMany({ where: { userId: { in: oldIds } } })
    await db.user.deleteMany({ where: { id: { in: oldIds } } })
  }
  // legacy task223/224-era leftovers just in case
  for (const p of ['t223_', 't224_', 't225_']) {
    const us = await db.user.findMany({ where: { username: { startsWith: p } }, select: { id: true } })
    const ids = us.map((u) => u.id)
    if (ids.length) {
      await db.questClaim.deleteMany({ where: { OR: [{ quest: { userId: { in: ids } } }, { userId: { in: ids } }] } })
      await db.quest.deleteMany({ where: { userId: { in: ids } } })
      await db.user.deleteMany({ where: { id: { in: ids } } })
    }
  }

  const mk = (username, name, extra = {}) =>
    db.user.create({ data: { username, name, password: '$2a$10$abcdefghijklmnopqrstuv', email: `${username}@seed.local`, avatarColor: 'teal', ...extra } })

  // 4 core seeds (member fixtures)
  const a = await mk(`${PREFIX}member_a`, 'T226 Member A')
  const b = await mk(`${PREFIX}member_b`, 'T226 Member B')
  const g = await mk(`${PREFIX}guide_s`, 'T226 Scout Selam', { isGuide: true, guideRoles: 'guide', guideAvailable: true, guideHourlyRate: 30, guideCurrency: 'USD', guideLanguages: 'English,Amharic', guideSpecialties: 'City tours,Merkato' })
  const ag = await mk(`${PREFIX}agent_t`, 'T226 Agent Tariku', { isGuide: true, guideRoles: 'agent', guideAvailable: true, guideHourlyRate: 80, guideCurrency: 'USD', guideLanguages: 'English,Amharic', guideSpecialties: 'Trip planning,Hotels' })

  await db.quest.createMany({
    data: [
      { posterName: 'T226 Member A', userId: a.id, title: 'Verify this Merkato wholesaler before I transfer', details: 'Need a photo of the shop + today invoice.', location: 'Merkato, Addis Ababa', deadlineText: '2 days', bountyUsd: 18, contact: 't226A@example.com' },
      { posterName: 'T226 Member B', userId: b.id, title: 'Translate a 3-minute call with a Bole supplier', details: 'Amharic-English live translate.', location: 'Bole, Addis Ababa', deadlineText: 'today', bountyUsd: 12, contact: 't226B@example.com' },
    ],
  })

  console.log('seeded:', { a: a.id, b: b.id, guide: g.id, agent: ag.id })
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => db.$disconnect())

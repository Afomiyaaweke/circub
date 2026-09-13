// Smoke-test seed: 3 guides with different cities/specialties + 2 ratings + 1 feed question post.
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const guides = [
    { email: 'g1@test.et', name: 'Abebe Lalibela', location: 'Lalibela, Amhara', specialties: 'Historical,Religious', langs: 'Amharic,English', bio: 'Born in Lalibela, I know every rock church and the best injera spots.' },
    { email: 'g2@test.et', name: 'Sara Addis', location: 'Addis Ababa', specialties: 'Food,Markets', langs: 'Amharic,English,French', bio: 'Street-food hunter. Merkato walks and coffee ceremony host.' },
    { email: 'g3@test.et', name: 'Dawit Simien', location: 'Gondar, Amhara', specialties: 'Hiking,Adventure,Nature', langs: 'Amharic,English', bio: 'Licensed Simien Mountains trek leader, 8 years.' },
  ]
  for (const g of guides) {
    await prisma.user.upsert({
      where: { email: g.email },
      update: { isGuide: true, guideAvailable: true, rating: 4.5, guideSpecialties: g.specialties, guideLanguages: g.langs, guideBio: g.bio, guideHourlyRate: 30, guideCurrency: 'USD', location: g.location, verifiedLocal: true },
      create: { email: g.email, name: g.name, password: 'x', isGuide: true, guideAvailable: true, rating: 4.5, guideSpecialties: g.specialties, guideLanguages: g.langs, guideBio: g.bio, guideHourlyRate: 30, guideCurrency: 'USD', location: g.location, verifiedLocal: true },
    })
  }
  const rater = await prisma.user.upsert({
    where: { email: 'tourist@test.et' },
    update: {},
    create: { email: 'tourist@test.et', name: 'Tourist Tom', password: 'x' },
  })
  const g1 = await prisma.user.findUnique({ where: { email: 'g1@test.et' } })
  const existing = await prisma.guideRating.findUnique({ where: { raterId_guideId: { raterId: rater.id, guideId: g1.id } } })
  if (!existing) {
    await prisma.guideRating.create({ data: { raterId: rater.id, guideId: g1.id, rating: 5, comment: 'Unforgettable trip to the rock churches!' } })
    await prisma.user.update({ where: { id: g1.id }, data: { rating: 5.0 } })
  }
  await prisma.post.create({ data: { content: 'Where can I find the best trekking guide for the Simien Mountains next month?', authorId: rater.id } })
  console.log('seeded:', guides.length, 'guides + 1 rating + 1 feed question')
}

main().finally(() => prisma.$disconnect())

// Seed script - populate initial users and demo data
import { db } from '../src/lib/db'

async function seed() {
  console.log('🌱 Seeding database...')

  // Create current user "MA"
  const currentUser = await db.user.upsert({
    where: { email: 'ma@socialcircle.app' },
    update: {},
    create: {
      name: 'MA',
      email: 'ma@socialcircle.app',
      avatarColor: 'teal',
      bio: 'Connecting the world, one product at a time.',
    },
  })

  // Create suggested users
  const ron = await db.user.upsert({
    where: { email: 'ron@socialcircle.app' },
    update: {},
    create: {
      name: 'Ron',
      email: 'ron@socialcircle.app',
      avatarColor: 'teal',
      bio: 'Coffee trader from Ethiopia.',
      postsCount: 23,
      followersCount: 142,
      likesCount: 387,
    },
  })

  const theodore = await db.user.upsert({
    where: { email: 'theodore@socialcircle.app' },
    update: {},
    create: {
      name: 'Theodore',
      email: 'theodore@socialcircle.app',
      avatarColor: 'teal',
      bio: 'Spice merchant based in Madagascar.',
      postsCount: 18,
      followersCount: 91,
      likesCount: 254,
    },
  })

  const amelia = await db.user.upsert({
    where: { email: 'amelia@socialcircle.app' },
    update: {},
    create: {
      name: 'Amelia',
      email: 'amelia@socialcircle.app',
      avatarColor: 'teal',
      bio: 'Tea exporter from Sri Lanka.',
      postsCount: 14,
      followersCount: 73,
      likesCount: 198,
    },
  })

  const kai = await db.user.upsert({
    where: { email: 'kai@socialcircle.app' },
    update: {},
    create: {
      name: 'Kai',
      email: 'kai@socialcircle.app',
      avatarColor: 'teal',
      bio: 'Seafood distributor in Okinawa.',
      postsCount: 9,
      followersCount: 47,
      likesCount: 121,
    },
  })

  // Create one demo product for current user
  await db.product.create({
    data: {
      name: 'Ethiopian Arabica Coffee Beans',
      quantity: '1 kg',
      country: 'Ethiopia',
      currency: 'USD',
      price: 12.5,
      unit: 'per kg',
      gender: 'Any',
      description:
        'Single-origin Arabica beans from the Yirgacheffe region. Light roast, floral notes with citrus acidity. Vacuum-sealed packaging, minimum order 10 kg.',
      category: 'Beverages',
      authorId: currentUser.id,
    },
  })

  // Update current user posts count
  await db.user.update({
    where: { id: currentUser.id },
    data: { postsCount: 1 },
  })

  console.log('✅ Database seeded successfully!')
  console.log(`   Users: 5 (MA, Ron, Theodore, Amelia, Kai)`)
  console.log(`   Products: 1 (Ethiopian Arabica)`)
  console.log('✓ Done.')
}

seed()
  .catch((e) => {
    console.error('Seeding error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })

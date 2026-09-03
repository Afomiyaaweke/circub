// Seed script - populate LinkedIn-style demo data
import { db } from '../src/lib/db'

async function seed() {
  console.log('🌱 Seeding LinkedIn-style demo data...')

  // Cleanup: wipe old data
  await db.message.deleteMany()
  await db.comment.deleteMany()
  await db.postLike.deleteMany()
  await db.post.deleteMany()
  await db.like.deleteMany()
  await db.product.deleteMany()
  await db.connection.deleteMany()
  await db.user.deleteMany()

  // --- Users ---
  const ma = await db.user.create({
    data: {
      name: 'MA',
      email: 'ma@socialcircle.app',
      avatarColor: 'teal',
      bio: 'Connecting the world, one product at a time.',
      headline: 'Founder @ Social Circle • Global trade enthusiast',
      location: 'Kuala Lumpur, Malaysia',
    },
  })

  const ron = await db.user.create({
    data: {
      name: 'Ron Kebede',
      email: 'ron@socialcircle.app',
      avatarColor: 'teal',
      bio: 'Coffee trader from Ethiopia.',
      headline: 'Coffee Exporter at Yirgacheffe Co-op',
      location: 'Addis Ababa, Ethiopia',
      postsCount: 23,
      followersCount: 142,
      likesCount: 387,
    },
  })

  const theodore = await db.user.create({
    data: {
      name: 'Theodore Razafy',
      email: 'theodore@socialcircle.app',
      avatarColor: 'teal',
      bio: 'Spice merchant based in Madagascar.',
      headline: 'Spice Merchant • Vanilla & Cloves exporter',
      location: 'Antananarivo, Madagascar',
      postsCount: 18,
      followersCount: 91,
      likesCount: 254,
    },
  })

  const amelia = await db.user.create({
    data: {
      name: 'Amelia Perera',
      email: 'amelia@socialcircle.app',
      avatarColor: 'teal',
      bio: 'Tea exporter from Sri Lanka.',
      headline: 'Founder @ Ceylon Leaf • Tea exporter',
      location: 'Colombo, Sri Lanka',
      postsCount: 14,
      followersCount: 73,
      likesCount: 198,
    },
  })

  const kai = await db.user.create({
    data: {
      name: 'Kai Tanaka',
      email: 'kai@socialcircle.app',
      avatarColor: 'teal',
      bio: 'Seafood distributor in Okinawa.',
      headline: 'Seafood Distributor • Okinawa Fresh Co.',
      location: 'Okinawa, Japan',
      postsCount: 9,
      followersCount: 47,
      likesCount: 121,
    },
  })

  const sara = await db.user.create({
    data: {
      name: 'Sara Okonkwo',
      email: 'sara@socialcircle.app',
      avatarColor: 'teal',
      bio: 'Cocoa exporter from Nigeria.',
      headline: 'Cocoa Bean Exporter at Lagos Trade',
      location: 'Lagos, Nigeria',
      postsCount: 11,
      followersCount: 64,
      likesCount: 156,
    },
  })

  // --- Connections (LinkedIn mutual) ---
  // MA is already connected to Theodore (ACCEPTED)
  await db.connection.create({
    data: {
      requesterId: theodore.id,
      receiverId: ma.id,
      status: 'ACCEPTED',
      note: 'Hi MA, would love to connect and discuss spice trade!',
    },
  })
  // Theodore's connection count +1, MA's +1
  await db.user.update({
    where: { id: ma.id },
    data: { connectionsCount: { increment: 1 } },
  })
  await db.user.update({
    where: { id: theodore.id },
    data: { connectionsCount: { increment: 1 } },
  })

  // MA is already connected to Amelia (ACCEPTED)
  await db.connection.create({
    data: {
      requesterId: ma.id,
      receiverId: amelia.id,
      status: 'ACCEPTED',
    },
  })
  await db.user.update({
    where: { id: ma.id },
    data: { connectionsCount: { increment: 1 } },
  })
  await db.user.update({
    where: { id: amelia.id },
    data: { connectionsCount: { increment: 1 } },
  })

  // Pending invitation to MA from Ron (incoming, MA needs to accept)
  await db.connection.create({
    data: {
      requesterId: ron.id,
      receiverId: ma.id,
      status: 'PENDING',
      note: 'Hi MA, I noticed your coffee listing — would love to connect!',
    },
  })

  // Pending invitation to MA from Sara (incoming)
  await db.connection.create({
    data: {
      requesterId: sara.id,
      receiverId: ma.id,
      status: 'PENDING',
      note: "Let's connect — I think we can collaborate on African trade routes.",
    },
  })

  // --- Posts (LinkedIn feed) ---
  const post1 = await db.post.create({
    data: {
      content:
        "Just shipped a fresh batch of single-origin Yirgacheffe beans! ☕ Floral notes with citrus acidity. Looking for distribution partners in Southeast Asia — DM me if you'd like samples.",
      authorId: ron.id,
    },
  })

  const post2 = await db.post.create({
    data: {
      content:
        "Proud to announce our new vanilla export partnership with two cooperatives in Madagascar. Sustainable farming, fair prices for growers, premium quality for buyers worldwide. 🌱",
      authorId: theodore.id,
    },
  })

  const post3 = await db.post.create({
    data: {
      content:
        "Tea harvest season is wrapping up here in Colombo. We're seeing exceptional quality this year — single-estate BOP grade available for export. Open to chat with serious buyers.",
      authorId: amelia.id,
    },
  })

  // MA's own post
  const post4 = await db.post.create({
    data: {
      content:
        "Excited to share that Social Circle has crossed 1,000 verified product listings across 42 countries! 🌍 Thank you to every trader, exporter, and connector who made this possible. Together we're building a more transparent global trade network.",
      authorId: ma.id,
    },
  })

  // Kai's post about seafood
  const post5 = await db.post.create({
    data: {
      content:
        "Fresh catch of the day from Okinawa waters — premium tuna and yellowtail, packed and ready for international shipping. Quality you can taste. 🐟",
      authorId: kai.id,
    },
  })

  // --- Comments on posts ---
  await db.comment.create({
    data: {
      content: 'Congrats MA! This platform is exactly what global trade needed. 🎉',
      postId: post4.id,
      authorId: theodore.id,
    },
  })
  await db.comment.create({
    data: {
      content: 'Would love to discuss Southeast Asia distribution — sending you a message!',
      postId: post1.id,
      authorId: amelia.id,
    },
  })
  await db.comment.create({
    data: {
      content: 'The Yirgacheffe co-op produces some of the best coffee I have ever tasted.',
      postId: post1.id,
      authorId: ma.id,
    },
  })

  // --- Post likes ---
  await db.postLike.create({ data: { userId: ma.id, postId: post1.id } })
  await db.postLike.create({ data: { userId: ma.id, postId: post2.id } })
  await db.postLike.create({ data: { userId: theodore.id, postId: post4.id } })
  await db.postLike.create({ data: { userId: amelia.id, postId: post4.id } })
  await db.postLike.create({ data: { userId: ron.id, postId: post4.id } })
  await db.postLike.create({ data: { userId: kai.id, postId: post4.id } })
  await db.postLike.create({ data: { userId: ma.id, postId: post5.id } })

  // --- Messages (DM between MA and Theodore) ---
  await db.message.create({
    data: {
      senderId: theodore.id,
      receiverId: ma.id,
      content:
        "Hi MA! Thanks for accepting my connection request. I'm exploring ways to expand my spice export business in Asia — would you have 15 minutes next week for a quick chat?",
    },
  })
  await db.message.create({
    data: {
      senderId: ma.id,
      receiverId: theodore.id,
      content:
        "Hi Theodore! Absolutely, I'd be happy to chat. Tuesday or Thursday afternoon works for me — let me know what suits you. Also, your vanilla looks incredible in the photo you shared!",
    },
  })
  await db.message.create({
    data: {
      senderId: theodore.id,
      receiverId: ma.id,
      content:
        "Perfect, let's aim for Tuesday 3pm your time. I'll send a calendar invite. And thanks re: the vanilla — it's our flagship product.",
    },
  })

  // --- Products (one for MA as before) ---
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
      authorId: ma.id,
    },
  })
  await db.user.update({
    where: { id: ma.id },
    data: { postsCount: 1 },
  })

  console.log('✅ Database seeded:')
  console.log('   Users: 6 (MA, Ron, Theodore, Amelia, Kai, Sara)')
  console.log('   Connections: 2 ACCEPTED, 2 PENDING incoming')
  console.log('   Posts: 5 with comments and likes')
  console.log('   Messages: 3 (DM with Theodore)')
  console.log('   Products: 1')
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

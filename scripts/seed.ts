// Seed script - LinkedIn-style + Local Price Posts demo data
import { db } from '../src/lib/db'

async function seed() {
  console.log('🌱 Seeding LinkedIn + Local Price Posts demo data...')

  // Cleanup: wipe old data
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

  // =====================================================
  // USERS
  // =====================================================

  // Current user (MA)
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

  // Existing LinkedIn-style users
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

  // =====================================================
  // LOCAL CONTRIBUTORS (verified locals who post prices)
  // =====================================================

  const abebe = await db.user.create({
    data: {
      name: 'Abebe M.',
      email: 'abebe@socialcircle.app',
      avatarColor: 'teal',
      bio: 'Born and raised in Addis Ababa. I know every corner of Mercato market. Helping travelers avoid tourist traps since 2018.',
      headline: 'Verified Local • Addis Ababa, Ethiopia',
      location: 'Addis Ababa, Ethiopia',
      isLocal: true,
      verifiedLocal: true,
      rating: 4.9,
      expertiseTags: 'Coffee,Markets,Handicrafts,Clothing',
      helpfulVotes: 1240,
      localPostCount: 156,
    },
  })

  const wanjiru = await db.user.create({
    data: {
      name: 'Wanjiru K.',
      email: 'wanjiru@socialcircle.app',
      avatarColor: 'teal',
      bio: 'Nairobi-based market expert. I grew up next to Maasai Market. Specializing in handicrafts and traditional goods.',
      headline: 'Verified Local • Nairobi, Kenya',
      location: 'Nairobi, Kenya',
      isLocal: true,
      verifiedLocal: true,
      rating: 4.8,
      expertiseTags: 'Markets,Handicrafts,Textiles',
      helpfulVotes: 856,
      localPostCount: 92,
    },
  })

  const aisha = await db.user.create({
    data: {
      name: 'Aisha N.',
      email: 'aisha@socialcircle.app',
      avatarColor: 'teal',
      bio: 'Kampala local and crafts enthusiast. I weave baskets with my grandmother every weekend at Owino Market.',
      headline: 'Verified Local • Kampala, Uganda',
      location: 'Kampala, Uganda',
      isLocal: true,
      verifiedLocal: true,
      rating: 4.7,
      expertiseTags: 'Handicrafts,Markets,Food',
      helpfulVotes: 612,
      localPostCount: 78,
    },
  })

  // Bonus: a 2nd local for Addis Ababa to enable consensus demo
  const selam = await db.user.create({
    data: {
      name: 'Selam T.',
      email: 'selam@socialcircle.app',
      avatarColor: 'teal',
      bio: 'Coffee shop owner in Addis. I know the wholesale bean market inside out.',
      headline: 'Verified Local • Addis Ababa, Ethiopia',
      location: 'Addis Ababa, Ethiopia',
      isLocal: true,
      verifiedLocal: true,
      rating: 4.8,
      expertiseTags: 'Coffee,Food',
      helpfulVotes: 487,
      localPostCount: 64,
    },
  })

  // =====================================================
  // CONNECTIONS (LinkedIn mutual)
  // =====================================================
  const conn1 = await db.connection.create({
    data: {
      requesterId: theodore.id,
      receiverId: ma.id,
      status: 'ACCEPTED',
      note: 'Hi MA, would love to connect and discuss spice trade!',
    },
  })
  void conn1
  await db.user.update({ where: { id: ma.id }, data: { connectionsCount: { increment: 1 } } })
  await db.user.update({ where: { id: theodore.id }, data: { connectionsCount: { increment: 1 } } })

  await db.connection.create({
    data: { requesterId: ma.id, receiverId: amelia.id, status: 'ACCEPTED' },
  })
  await db.user.update({ where: { id: ma.id }, data: { connectionsCount: { increment: 1 } } })
  await db.user.update({ where: { id: amelia.id }, data: { connectionsCount: { increment: 1 } } })

  // Pending invitations to MA
  await db.connection.create({
    data: {
      requesterId: ron.id,
      receiverId: ma.id,
      status: 'PENDING',
      note: 'Hi MA, I noticed your coffee listing — would love to connect!',
    },
  })
  await db.connection.create({
    data: {
      requesterId: sara.id,
      receiverId: ma.id,
      status: 'PENDING',
      note: "Let's connect — I think we can collaborate on African trade routes.",
    },
  })

  // =====================================================
  // POSTS (LinkedIn feed)
  // =====================================================
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
  const post4 = await db.post.create({
    data: {
      content:
        "Excited to share that Social Circle has crossed 1,000 verified product listings across 42 countries! 🌍 Thank you to every trader, exporter, and connector who made this possible. Together we're building a more transparent global trade network.",
      authorId: ma.id,
    },
  })
  const post5 = await db.post.create({
    data: {
      content:
        "Fresh catch of the day from Okinawa waters — premium tuna and yellowtail, packed and ready for international shipping. Quality you can taste. 🐟",
      authorId: kai.id,
    },
  })

  // Comments + likes on posts
  await db.comment.create({
    data: { content: 'Congrats MA! This platform is exactly what global trade needed. 🎉', postId: post4.id, authorId: theodore.id },
  })
  await db.comment.create({
    data: { content: 'Would love to discuss Southeast Asia distribution — sending you a message!', postId: post1.id, authorId: amelia.id },
  })
  await db.comment.create({
    data: { content: 'The Yirgacheffe co-op produces some of the best coffee I have ever tasted.', postId: post1.id, authorId: ma.id },
  })

  await db.postLike.create({ data: { userId: ma.id, postId: post1.id } })
  await db.postLike.create({ data: { userId: ma.id, postId: post2.id } })
  await db.postLike.create({ data: { userId: theodore.id, postId: post4.id } })
  await db.postLike.create({ data: { userId: amelia.id, postId: post4.id } })
  await db.postLike.create({ data: { userId: ron.id, postId: post4.id } })
  await db.postLike.create({ data: { userId: kai.id, postId: post4.id } })
  await db.postLike.create({ data: { userId: ma.id, postId: post5.id } })

  // DM between MA and Theodore
  await db.message.create({
    data: {
      senderId: theodore.id,
      receiverId: ma.id,
      content: "Hi MA! Thanks for accepting my connection request. I'm exploring ways to expand my spice export business in Asia — would you have 15 minutes next week for a quick chat?",
    },
  })
  await db.message.create({
    data: {
      senderId: ma.id,
      receiverId: theodore.id,
      content: "Hi Theodore! Absolutely, I'd be happy to chat. Tuesday or Thursday afternoon works for me — let me know what suits you. Also, your vanilla looks incredible in the photo you shared!",
    },
  })
  await db.message.create({
    data: {
      senderId: theodore.id,
      receiverId: ma.id,
      content: "Perfect, let's aim for Tuesday 3pm your time. I'll send a calendar invite. And thanks re: the vanilla — it's our flagship product.",
    },
  })

  // Original product (for Discover/Bookmark product feature)
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
  await db.user.update({ where: { id: ma.id }, data: { postsCount: 1 } })

  // =====================================================
  // LOCAL PRICE POSTS — community price intelligence
  // =====================================================

  const now = new Date()
  const threeMonthsAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
  const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000)

  // Helper to create a local price post
  const createLPP = async (data: any) => {
    const post = await db.localPricePost.create({ data })
    return post
  }

  // --- Addis Ababa, Ethiopia posts ---
  const ethCoffee1 = await createLPP({
    postType: 'PRODUCT',
    productName: 'Ethiopian Coffee Set',
    description: 'Traditional Jebena coffee set with cups and small charcoal stove.',
    country: 'Ethiopia',
    city: 'Addis Ababa',
    neighborhood: 'Mercato',
    market: 'Mercato Market',
    currency: 'ETB',
    priceMin: 1500,
    priceMax: 2200,
    recommendedPrice: 1800,
    touristPrice: 3000,
    personalPrice: 1800,
    localTip: "Handmade sets can cost more. Check the quality and negotiate around ETB 2,000.",
    category: 'Coffee',
    authorId: abebe.id,
  })

  const ethCoffee2 = await createLPP({
    postType: 'PRODUCT',
    productName: 'Ethiopian Coffee Set',
    description: 'Coffee set with ceramic cups — slightly different quality available in Piazza area.',
    country: 'Ethiopia',
    city: 'Addis Ababa',
    neighborhood: 'Piazza',
    market: 'Piazza Souks',
    currency: 'ETB',
    priceMin: 1800,
    priceMax: 2300,
    recommendedPrice: 2000,
    touristPrice: 3500,
    localTip: 'Better quality ceramic sets are slightly pricier. The ones from Piazza last longer than Mercato ones.',
    category: 'Coffee',
    authorId: selam.id,
  })

  // Backdated posts for price history demo (3 months ago)
  const ethCoffee3 = await createLPP({
    postType: 'PRODUCT',
    productName: 'Ethiopian Coffee Set',
    description: 'Older pricing for reference — Mercato area, 3 months ago.',
    country: 'Ethiopia',
    city: 'Addis Ababa',
    neighborhood: 'Mercato',
    market: 'Mercato Market',
    currency: 'ETB',
    priceMin: 1500,
    priceMax: 2000,
    recommendedPrice: 1700,
    touristPrice: 2800,
    localTip: 'Prices have crept up due to inflation. Coffee sets that were 1,700 last quarter now cost around 1,800.',
    category: 'Coffee',
    authorId: abebe.id,
    createdAt: threeMonthsAgo,
  })

  // Backdated 6 months ago
  const ethCoffee4 = await createLPP({
    postType: 'PRODUCT',
    productName: 'Ethiopian Coffee Set',
    country: 'Ethiopia',
    city: 'Addis Ababa',
    neighborhood: 'Mercato',
    currency: 'ETB',
    priceMin: 1400,
    priceMax: 1900,
    recommendedPrice: 1600,
    touristPrice: 2600,
    localTip: 'Historical pricing from 6 months ago for reference.',
    category: 'Coffee',
    authorId: selam.id,
    createdAt: sixMonthsAgo,
  })

  const basket1 = await createLPP({
    postType: 'PRODUCT',
    productName: 'Traditional Basket',
    description: 'Handwoven grass basket with colorful patterns. Used for serving injera or as decoration.',
    country: 'Ethiopia',
    city: 'Addis Ababa',
    market: 'Mercato Market',
    currency: 'ETB',
    priceMin: 400,
    priceMax: 700,
    recommendedPrice: 550,
    touristPrice: 1200,
    personalPrice: 500,
    localTip: "Don't buy the first one you see. Similar baskets are available for around ETB 500 if you walk deeper into the market.",
    category: 'Handicrafts',
    authorId: abebe.id,
  })

  const leatherBag1 = await createLPP({
    postType: 'PRODUCT',
    productName: 'Leather Bag',
    description: 'Handmade leather shoulder bag from local tanneries.',
    country: 'Ethiopia',
    city: 'Addis Ababa',
    neighborhood: 'Shiro Meda',
    currency: 'ETB',
    priceMin: 1200,
    priceMax: 2000,
    recommendedPrice: 1500,
    touristPrice: 3500,
    localTip: 'Shiro Meda is famous for leather. Ask for "shibeba" quality — that\'s the top grade. Avoid "kuda" (lower grade) bags at tourist shops.',
    category: 'Clothing',
    authorId: abebe.id,
  })

  // --- Nairobi, Kenya posts ---
  const maasai1 = await createLPP({
    postType: 'PRODUCT',
    productName: 'Maasai Beaded Necklace',
    description: 'Colorful hand-beaded necklace made by Maasai artisans.',
    country: 'Kenya',
    city: 'Nairobi',
    neighborhood: 'City Centre',
    market: 'Maasai Market',
    currency: 'KES',
    priceMin: 2000,
    priceMax: 4500,
    recommendedPrice: 3000,
    touristPrice: 7000,
    personalPrice: 2800,
    localTip: "Maasai Market moves locations each day of the week. Tuesday = Kijabe Street, Thursday = Capital Hill. Don't be afraid to walk away — they'll lower the price.",
    category: 'Handicrafts',
    authorId: wanjiru.id,
  })

  const kanga1 = await createLPP({
    postType: 'PRODUCT',
    productName: 'Kanga Cloth',
    description: 'Traditional printed cotton fabric, pair of two pieces.',
    country: 'Kenya',
    city: 'Nairobi',
    market: 'Gikomba Market',
    currency: 'KES',
    priceMin: 500,
    priceMax: 1200,
    recommendedPrice: 800,
    touristPrice: 2500,
    localTip: 'Gikomba is the place for genuine kangas. Expect mud and crowds. Bring cash — no card payments.',
    category: 'Textiles',
    authorId: wanjiru.id,
  })

  // --- Kampala, Uganda posts ---
  const ugBasket1 = await createLPP({
    postType: 'PRODUCT',
    productName: 'Handmade Basket',
    description: 'Ugandan woven basket from banana leaf fibers.',
    country: 'Uganda',
    city: 'Kampala',
    neighborhood: 'Downtown',
    market: 'Owino Market',
    currency: 'UGX',
    priceMin: 30000,
    priceMax: 60000,
    recommendedPrice: 45000,
    touristPrice: 100000,
    localTip: 'Look for tight weaving and clean edges. Loose fibers mean lower quality — bargain hard.',
    category: 'Handicrafts',
    authorId: aisha.id,
  })

  const rolex1 = await createLPP({
    postType: 'SERVICE',
    productName: 'Rolex (chapati wrap)',
    description: 'Famous Ugandan street food — chapati wrapped with eggs and vegetables.',
    country: 'Uganda',
    city: 'Kampala',
    neighborhood: 'Wandegeya',
    currency: 'UGX',
    priceMin: 3000,
    priceMax: 6000,
    recommendedPrice: 4500,
    touristPrice: 10000,
    personalPrice: 4000,
    localTip: 'The "double eggs" rolex near Makerere University gate is the best in town. Pay UGX 4,500 — locals pay 4,000.',
    category: 'Food',
    authorId: aisha.id,
  })

  // =====================================================
  // VOTES & REPORTS on local price posts
  // =====================================================

  // Helpful votes on ethCoffee1
  const helpfulVoters = [theodore, amelia, kai, sara, wanjiru, aisha]
  for (const v of helpfulVoters) {
    await db.localPriceVote.create({
      data: { userId: v.id, postId: ethCoffee1.id, voteType: 'HELPFUL' },
    })
  }
  await db.localPricePost.update({
    where: { id: ethCoffee1.id },
    data: { helpfulCount: 42 }, // override for demo (set higher)
  })
  await db.user.update({
    where: { id: abebe.id },
    data: { helpfulVotes: 1240 },
  })

  // 5 helpful votes on ethCoffee2
  for (const v of [abebe, theodore, amelia, kai, sara]) {
    await db.localPriceVote.create({
      data: { userId: v.id, postId: ethCoffee2.id, voteType: 'HELPFUL' },
    })
  }
  await db.localPricePost.update({
    where: { id: ethCoffee2.id },
    data: { helpfulCount: 36 },
  })

  // Helpful votes on basket1
  for (const v of [selam, amelia, kai]) {
    await db.localPriceVote.create({
      data: { userId: v.id, postId: basket1.id, voteType: 'HELPFUL' },
    })
  }
  await db.localPricePost.update({
    where: { id: basket1.id },
    data: { helpfulCount: 28 },
  })

  // Helpful votes on leatherBag1
  for (const v of [theodore, amelia]) {
    await db.localPriceVote.create({
      data: { userId: v.id, postId: leatherBag1.id, voteType: 'HELPFUL' },
    })
  }
  await db.localPricePost.update({
    where: { id: leatherBag1.id },
    data: { helpfulCount: 19 },
  })

  // Helpful votes on Maasai Necklace
  for (const v of [abebe, theodore, amelia, kai, sara, aisha, selam]) {
    await db.localPriceVote.create({
      data: { userId: v.id, postId: maasai1.id, voteType: 'HELPFUL' },
    })
  }
  await db.localPricePost.update({
    where: { id: maasai1.id },
    data: { helpfulCount: 51 },
  })

  // Helpful votes on Kanga
  for (const v of [abebe, amelia, kai]) {
    await db.localPriceVote.create({
      data: { userId: v.id, postId: kanga1.id, voteType: 'HELPFUL' },
    })
  }
  await db.localPricePost.update({
    where: { id: kanga1.id },
    data: { helpfulCount: 22 },
  })

  // Helpful votes on UG basket
  for (const v of [abebe, wanjiru, theodore, kai]) {
    await db.localPriceVote.create({
      data: { userId: v.id, postId: ugBasket1.id, voteType: 'HELPFUL' },
    })
  }
  await db.localPricePost.update({
    where: { id: ugBasket1.id },
    data: { helpfulCount: 33 },
  })

  // Helpful votes on Rolex
  for (const v of [abebe, wanjiru, kai]) {
    await db.localPriceVote.create({
      data: { userId: v.id, postId: rolex1.id, voteType: 'HELPFUL' },
    })
  }
  await db.localPricePost.update({
    where: { id: rolex1.id },
    data: { helpfulCount: 47 },
  })

  console.log('✅ Database seeded:')
  console.log('   Users: 10 (MA, Ron, Theodore, Amelia, Kai, Sara + 4 verified locals: Abebe, Wanjiru, Aisha, Selam)')
  console.log('   LinkedIn connections: 2 ACCEPTED, 2 PENDING incoming')
  console.log('   LinkedIn posts: 5 with comments and likes')
  console.log('   LinkedIn messages: 3 DM with Theodore')
  console.log('   Local Price Posts: 9 (4 Addis Ababa, 2 Nairobi, 2 Kampala, + backdated history)')
  console.log('   Local Price Votes: 30+ helpful votes')
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

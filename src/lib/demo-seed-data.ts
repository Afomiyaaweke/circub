// ============================================================
// DEMO SEED DATA — "random people" content for the feed
// ============================================================
// Purpose: make the app feel alive for the first real visitors.
// Every demo account uses a reserved email domain
// (@seed.circub.test) so ALL of this content can be wiped with
// ONE call to /api/seed?code=...&mode=cleanup once real users
// have joined. Real accounts can never collide with it because
// the register endpoint refuses that domain.
//
// 18 local accounts + 8 international accounts · 73 feed posts ·
// 58 local price posts (in demo-seed-local.ts) ≈ 130+ content items.
// ============================================================

export interface DemoUser {
  username: string
  name: string
  avatarColor: string
  headline: string
  bio: string
  location: string
  accountType: 'PERSONAL' | 'COMPANY'
  companyName?: string
  companyIndustry?: string
  isLocal?: boolean
  verifiedLocal?: boolean
  idVerified?: boolean
  followers: number
  likes: number
  expertiseTags?: string
}

export interface DemoPost {
  u: string // author username
  c: string // content
}

export const DEMO_USERS: DemoUser[] = [
  { username: 'selam_bekele', name: 'Selam Bekele', avatarColor: 'teal', headline: 'Home barista & coffee ceremony enthusiast', bio: 'I brew, I roast small batches, and I post way too many coffee photos. Bole based.', location: 'Bole, Addis Ababa', accountType: 'PERSONAL', isLocal: true, idVerified: true, followers: 1840, likes: 640, expertiseTags: 'Coffee,Food' },
  { username: 'dawit_tesfaye', name: 'Dawit Tesfaye', avatarColor: 'green', headline: 'Travel writer · wandering Ethiopia one town at a time', bio: 'Guidebook author. 60+ towns crossed. Ask me about routes, buses and hidden viewpoints.', location: 'Kazanchis, Addis Ababa', accountType: 'PERSONAL', isLocal: true, verifiedLocal: true, idVerified: true, followers: 2310, likes: 880, expertiseTags: 'Transportation,Accommodation' },
  { username: 'hanna_girma', name: 'Hanna Girma', avatarColor: 'pink', headline: 'Fashion designer · habesha threads, modern cuts', bio: 'Handwoven cotton, modern silhouettes. Habesha kemis reimagined for the city.', location: 'Piassa, Addis Ababa', accountType: 'PERSONAL', followers: 1520, likes: 720 },
  { username: 'yonas_ab', name: 'Yonas Abebe', avatarColor: 'purple', headline: 'Software developer · fintech', bio: 'Building payment tools for small merchants. Coffee powered, deadline driven.', location: 'Bole, Addis Ababa', accountType: 'PERSONAL', followers: 940, likes: 310 },
  { username: 'meron_tadesse', name: 'Meron Tadesse', avatarColor: 'amber', headline: 'Food blogger — Taste of Addis', bio: 'Eating my way through the city so you do not have to guess. New spot every Friday.', location: 'Kazanchis, Addis Ababa', accountType: 'PERSONAL', isLocal: true, verifiedLocal: true, followers: 2650, likes: 1130, expertiseTags: 'Restaurants,Food,Markets' },
  { username: 'samuel_k', name: 'Samuel Kebede', avatarColor: 'blue', headline: 'Photographer · streets & light', bio: 'Street photography around Merkato and Piassa. Prints available on request.', location: 'Entoto, Addis Ababa', accountType: 'PERSONAL', followers: 1290, likes: 540 },
  { username: 'beti_alemu', name: 'Bethlehem Alemu', avatarColor: 'orange', headline: 'AAU student · campus life & budget hacks', bio: 'Management student. Street food, shared rides, and stretching every birr.', location: 'Sidist Kilo, Addis Ababa', accountType: 'PERSONAL', followers: 460, likes: 190 },
  { username: 'robel_a', name: 'Robel Assefa', avatarColor: 'red', headline: 'Fitness coach · morning bootcamps', bio: 'Bootcamps at Friendship park. Your body carries you far — train it well.', location: 'Gerji, Addis Ababa', accountType: 'PERSONAL', followers: 780, likes: 260 },
  { username: 'tigist_n', name: 'Tigist Negash', avatarColor: 'purple', headline: 'Tailor & small business owner', bio: 'Custom dresses, uniforms, repairs. Merkato Dubai Tera, inside lane 4.', location: 'Merkato, Addis Ababa', accountType: 'PERSONAL', isLocal: true, followers: 640, likes: 380, expertiseTags: 'Clothing,Textiles,Services' },
  { username: 'abenezer_h', name: 'Abenezer Haile', avatarColor: 'green', headline: 'Rideshare & delivery driver', bio: 'On the road 12 hours a day — I know every shortcut and every pothole.', location: 'Saris, Addis Ababa', accountType: 'PERSONAL', isLocal: true, followers: 350, likes: 140, expertiseTags: 'Transportation' },
  { username: 'liya_m', name: 'Liya Mengistu', avatarColor: 'teal', headline: 'Product designer · simple things for hard problems', bio: 'Designing mobile-first products. Old Airport side, occasionally mentoring juniors.', location: 'Old Airport, Addis Ababa', accountType: 'PERSONAL', idVerified: true, followers: 1100, likes: 420 },
  { username: 'sheba_coffee', name: 'Sheba Coffee Traders', avatarColor: 'blue', headline: 'Specialty Ethiopian coffee, exported with care since 2012', bio: 'Working directly with Guji and Yirgacheffe washing stations. Samples for roasters.', location: 'Bole, Addis Ababa', accountType: 'COMPANY', companyName: 'Sheba Coffee Traders', companyIndustry: 'Agriculture & Export', followers: 1980, likes: 300 },
  { username: 'rahel_s', name: 'Rahel Solomon', avatarColor: 'pink', headline: 'Resident doctor · health tips in plain language', bio: 'Long shifts, short coffee breaks. Busting health myths one post at a time.', location: 'Kirkos, Addis Ababa', accountType: 'PERSONAL', idVerified: true, followers: 1740, likes: 690 },
  { username: 'bereket_d', name: 'Bereket Desta', avatarColor: 'amber', headline: 'Musician · masinko meets synth', bio: 'Weekend gigs around Megenagna. New single dropping soon.', location: 'Megenagna, Addis Ababa', accountType: 'PERSONAL', followers: 830, likes: 350 },
  { username: 'mahi_worku', name: 'Mahlet Worku', avatarColor: 'red', headline: 'Makeup artist · bridal & events', bio: 'Soft glam for weddings and photo days. Bookings open a month ahead.', location: 'Bole Medhanialem, Addis Ababa', accountType: 'PERSONAL', followers: 1360, likes: 610 },
  { username: 'nati_t', name: 'Nati Tsegaye', avatarColor: 'blue', headline: 'Streetwear & hooper', bio: 'Sneaker resell, game-day threads, and honest court reviews around the city.', location: 'Ayat, Addis Ababa', accountType: 'PERSONAL', followers: 520, likes: 210 },
  { username: 'kidist_fikru', name: 'Kidist Fikru', avatarColor: 'amber', headline: 'Baker at Honey & Dough', bio: 'Small batch cakes, cookies and honey bread. CMC pickup or delivery.', location: 'CMC, Addis Ababa', accountType: 'PERSONAL', isLocal: true, verifiedLocal: true, followers: 990, likes: 470, expertiseTags: 'Food,Restaurants' },
  { username: 'addis_fresh', name: 'Addis Fresh Market', avatarColor: 'green', headline: 'Fresh produce delivered to your door', bio: 'Fruits, vegetables and dairy from the cooperative to your kitchen. Same-day delivery.', location: 'Merkato, Addis Ababa', accountType: 'COMPANY', companyName: 'Addis Fresh Market', companyIndustry: 'Grocery & Delivery', followers: 1210, likes: 280 },
  // ---------- International voices (visitors + remote pros) ----------
  { username: 'sarah_mitchell', name: 'Sarah Mitchell', avatarColor: 'purple', headline: 'Digital nomad · product designer, currently Addis', bio: 'Working from a different city every few months. Currently obsessed with Ethiopian coffee and the wifi at Bole co-working spots.', location: 'Portland, USA · now Addis Ababa', accountType: 'PERSONAL', idVerified: true, followers: 2140, likes: 920, expertiseTags: 'Design,Remote Work' },
  { username: 'james_carter', name: 'James Carter', avatarColor: 'blue', headline: 'Travel blogger · The Long Route', bio: '42 countries and counting. Writing honest guides for slow travelers. Ethiopia leg: 3 weeks in.', location: 'London, UK', accountType: 'PERSONAL', isLocal: true, idVerified: true, followers: 1890, likes: 780, expertiseTags: 'Travel,Transportation' },
  { username: 'lena_fischer', name: 'Lena Fischer', avatarColor: 'teal', headline: 'Documentary photographer · Berlin', bio: 'Chasing light and stories. Currently shooting a series on Ethiopian craft markets.', location: 'Berlin, Germany', accountType: 'PERSONAL', followers: 1450, likes: 660, expertiseTags: 'Photography,Art' },
  { username: 'marco_rossi', name: 'Marco Rossi', avatarColor: 'red', headline: 'Chef · exploring East African kitchens', bio: 'Ten years in Italian kitchens, now studying spice routes and injera. Food is the best passport.', location: 'Bologna, Italy', accountType: 'PERSONAL', followers: 1120, likes: 540, expertiseTags: 'Restaurants,Food' },
  { username: 'aisha_khan', name: 'Aisha Khan', avatarColor: 'amber', headline: 'Commodity trader · Dubai ↔ Addis', bio: 'Moving coffee, spices and textiles between the Gulf and East Africa. Trade is about trust.', location: 'Dubai, UAE', accountType: 'PERSONAL', isLocal: true, idVerified: true, followers: 1670, likes: 610, expertiseTags: 'Business,Import & Export' },
  { username: 'kenji_tanaka', name: 'Kenji Tanaka', avatarColor: 'green', headline: 'Backpacker · 6 months across Africa', bio: 'Overlanding Cairo to Cape Town with a 12kg bag. Ethiopia week 2: the highlands stole my heart.', location: 'Osaka, Japan', accountType: 'PERSONAL', followers: 860, likes: 390 },
  { username: 'chloe_dubois', name: 'Chloe Dubois', avatarColor: 'pink', headline: 'NGO volunteer · education programs', bio: 'Volunteering with a girls education initiative. Learning Amharic one mispronounced word at a time.', location: 'Lyon, France', accountType: 'PERSONAL', followers: 640, likes: 280 },
  { username: 'carlos_mendes', name: 'Carlos Mendes', avatarColor: 'orange', headline: 'Football coach · youth academies', bio: 'Coaching clinics around East Africa. The talent here is real — the passion is on another level.', location: 'São Paulo, Brazil', accountType: 'PERSONAL', followers: 980, likes: 420 },
]

export const DEMO_POSTS: DemoPost[] = [
  { u: 'selam_bekele', c: 'Roasted my first batch of Yirgacheffe on the skillet this morning. Chocolate and citrus notes — the whole house smells like a cafe. Next batch I am trying Sidama.' },
  { u: 'meron_tadesse', c: 'New review: the shiro at that little spot behind Kadisco Hospital is unreal. 120 birr, comes with fresh injera and sides. Go before 1pm, it fills up fast.' },
  { u: 'selam_bekele', c: 'Coffee ceremony at my place this Sunday, 3pm. Roasting on the pan, popcorn on the side, everyone welcome — bring a friend.' },
  { u: 'meron_tadesse', c: 'PSA: the fresh juice guys near Bole Medhanialem now do avocado-sprite mixes for 90 birr. Dangerous levels of good.' },
  { u: 'kidist_fikru', c: 'Honey bread is out of the oven. CMC pickup until 6pm, delivery for orders above 800 birr.' },
  { u: 'abenezer_h', c: 'Fuel stations around Saris have shorter queues early morning. After 8am expect 20+ minutes. Plan your day.' },
  { u: 'dawit_tesfaye', c: 'Took the 6am bus to Bahir Dar. Smooth road, stopped at Debre Markos for lunch, arrived by 4. 1,800 birr. Way better than the night buses if you like scenery.' },
  { u: 'dawit_tesfaye', c: 'Hidden gem: Zengena Lake near Injibara. No resorts, no noise, just a perfect round crater lake and fish tibs at the village. Weekend trip from Addis is doable.' },
  { u: 'yonas_ab', c: 'Our team is hiring two junior React developers. Remote-friendly, Addis office twice a week. Junior means junior — attitude over CV. DM me.' },
  { u: 'sheba_coffee', c: 'Harvest update: Guji lots are tasting exceptional this year. Washed process, 1,950 masl. Samples available for roasters — message us.' },
  { u: 'samuel_k', c: 'Merkato at 7am hits different. Light coming through the fabric stalls, everyone bargaining before breakfast. Shot a full roll.' },
  { u: 'hanna_girma', c: 'Finished a full habesha kemis in mint green with modern shoulders. The tilet weave took three weeks but worth every day. Ready for pickup Monday.' },
  { u: 'rahel_s', c: 'Reminder: malaria is still a thing in the lowlands. If you are heading to Gambella or Omo, take your prophylaxis and sleep under a net. Free advice from someone who sees the alternative.' },
  { u: 'beti_alemu', c: 'Student budget hack: four shared feris from Sidist Kilo to Piassa cost less than one delivery fee. Walk 10 minutes, save 60 birr, get your steps in.' },
  { u: 'robel_a', c: 'Bootcamp at Friendship park, Saturday 6:30am. Bring water and a mat. First session free — bring that friend who keeps postponing.' },
  { u: 'liya_m', c: 'Redesigning our onboarding and I keep coming back to one rule: if your aunt cannot use it on a small phone with 3G, it is not done.' },
  { u: 'bereket_d', c: 'Playing at Fendisha Friday night, 9pm. Masinko meets the synth pad. Come early, it gets packed.' },
  { u: 'tigist_n', c: 'Merkato price check: white cotton tilet per meter is up 15% since last month. Buy what you need early before the holidays push it higher.' },
  { u: 'mahi_worku', c: 'Soft glam for a garden wedding tomorrow. The trick with our weather: set everything with a mist — humidity is the real enemy.' },
  { u: 'nati_t', c: 'Court review: the Ayat 45 meter public court got a new surface. Free before 9am, 50 birr per person after. Sneaker meetup there Sunday.' },
  { u: 'kidist_fikru', c: 'Testing a cardamom-spiced honey cake for the holiday season. Honest opinions needed — two tasting slots left this week.' },
  { u: 'addis_fresh', c: "Today's market basket: avocados 25 birr each, papaya 60/kg, fresh milk 95/liter. Order by 9pm for morning delivery." },
  { u: 'dawit_tesfaye', c: 'Simien mountains in October = clear skies, baby geladas, and cold nights. Pack a real jacket, not a hoodie. The ridges past Sona are worth the detour.' },
  { u: 'meron_tadesse', c: 'Controversial: the best tibs in Addis is NOT in a restaurant. It is the late-night roadside grill near Megenagna 26. Charcoal, rosemary, no menu. 400 birr.' },
  { u: 'selam_bekele', c: 'The imported beans trend is cool but can we talk about how our own Guji naturals beat most of them? Drink local, friends.' },
  { u: 'yonas_ab', c: 'Power was out in Bole for 6 hours today. My laptop survived on the power bank and I finished the sprint. Small wins.' },
  { u: 'hanna_girma', c: 'Looking for an embroidery machine operator, 2 years experience preferred. Piassa workshop, fair pay, tea included. Message me.' },
  { u: 'rahel_s', c: "Water reminder this season: if your building's tank looks questionable, boil for real — a rolling boil, not just warm. Typhoid cases are climbing." },
  { u: 'samuel_k', c: 'Golden hour at Entoto is 6:10pm sharp this week. The eucalyptus backlights like gold thread. Free location tip for the photographers out there.' },
  { u: 'beti_alemu', c: 'Library hack: the main library opens 8am and the reading room fills by 8:20 during exams. Set two alarms.' },
  { u: 'abenezer_h', c: 'Riders: avoid Ring Road eastbound near Gotera after 5pm — a morning accident has traffic crawling. Take the underpass route.' },
  { u: 'liya_m', c: 'Mentorship offer: 4 slots for junior designers building portfolios. We review one project per week, honest feedback only. Comment or DM.' },
  { u: 'sheba_coffee', c: 'Cupping open day at our Bole lab this Saturday, 10am. Free for cafe owners and home roasters. Taste 12 single origins side by side.' },
  { u: 'tigist_n', c: 'Wedding season is coming. Book your fittings NOW — last minute orders pay rush fees and stress fees.' },
  { u: 'nati_t', c: 'Anyone else think the new sports complex membership is worth 2,500/month? Courts, gym, pool. Genuinely asking before I commit.' },
  { u: 'mahi_worku', c: "Before/after from Saturday's bridal session. Skin prep is 80% of the job — moisturize, people!" },
  { u: 'robel_a', c: "Rest day is not laziness, it is training. Your muscles grow on the couch, not in the gym. Two rest days minimum, coach's orders." },
  { u: 'meron_tadesse', c: 'The food street near the stadium is now open till midnight on weekends. The late-night grills are elite budget food. Bring small notes.' },
  { u: 'dawit_tesfaye', c: 'Bus tip: buy Harar tickets at the station a day ahead, not the same morning. The 11am deluxe fills by 9. 2,200 birr, worth the AC.' },
  { u: 'bereket_d', c: 'Studio night. New track blends azmari rhythm with a slow synth build. Ethiopian sound does not need permission from anyone.' },
  { u: 'addis_fresh', c: 'New stock: Sidama honey, 700ml jars, 1,450 birr. From the woreda cooperative straight to your table. Limited this week.' },
  { u: 'rahel_s', c: 'Shift change thoughts: walking between Kirkos and the hospital in the rain at 11pm is not a health system, it is cardio.' },
  { u: 'kidist_fikru', c: "Recipe tip for home bakers: our tap water's chlorine kills yeast. Filter it or let it sit overnight and your dough will finally rise." },
  { u: 'samuel_k', c: 'Print sale: 20x30 street series prints, framed, 2,800 birr until Sunday. Piassa studio, come see them in person.' },
  { u: 'liya_m', c: 'Traffic app idea nobody will build: crowdsourced feris queue lengths. I would use it every single morning.' },
  { u: 'beti_alemu', c: 'A group of us split a ride to Bishoftu for the weekend, 900 each round trip. Crater lakes and hot springs for the price of two shishas.' },
  { u: 'yonas_ab', c: 'Fintech folks: local payment gateways just opened sandbox access. Weekend hackathon material right there.' },
  { u: 'tigist_n', c: 'Repair day at the shop — 12 items and counting. Fix your clothes, people, not everything deserves the bin.' },
  { u: 'hanna_girma', c: 'The netela restock arrived. Pure shema cotton, hand-fringed, four colors. 1,200 birr each and they disappear fast.' },
  { u: 'nati_t', c: 'Premier league derby watch party at the court Saturday. Projector, popcorn, small entry fee for the generator. Kickoff 4pm.' },
  { u: 'selam_bekele', c: "Grind size PSA for the moka pot users: if your coffee tastes bitter and angry, go coarser. You are extracting your patience, not flavor." },
  { u: 'abenezer_h', c: 'Delivery riders, respect the rain rules: plastic cover for the phone bag, spare mask, and never brake hard on painted lines. They are ice when wet.' },
  { u: 'mahi_worku', c: 'Booking December weddings already. The good makeup artists will be gone by November — plan accordingly.' },
  { u: 'meron_tadesse', c: 'The local version of fast food is 1,000x better: a clean gemuten at 250 birr with homemade awaze beats any burger chain. Fight me.' },
  { u: 'dawit_tesfaye', c: 'Five years writing about this country and I still find new viewpoints. This week: the rock church nobody talks about outside Adadi Mariam. Go on a weekday and have it to yourself.' },
  // ---------- International voices ----------
  { u: 'sarah_mitchell', c: 'Week 3 working from Addis: morning buna ceremony with my landlord, then three hours of deep work from a cafe in Bole. The internet is better than Bali, the coffee is not even a competition.' },
  { u: 'james_carter', c: 'Honest guide update: the Addis-Bahir Dar bus is genuinely one of the best value rides in Africa. 1,800 birr for 11 hours of Blue Nile gorge views. Read the full route guide on my blog tonight.' },
  { u: 'lena_fischer', c: 'Spent the morning in Merkato weaving alley. Three generations at one loom, thread flying at a speed my camera could barely catch. The craft here deserves a museum — and better export prices.' },
  { u: 'marco_rossi', c: 'Kitchen revelation: berbere and nduja have the same fermented-chili depth. Tonight I am folding mitmita into a ragù. Ethiopian-Italian fusion is not a trend, it is history on a plate.' },
  { u: 'aisha_khan', c: 'Dubai buyers keep asking about Guji naturals. To my Ethiopian partners: the specialty premium is real this season, keep your lots separated by washing station. Details pay.' },
  { u: 'kenji_tanaka', c: 'Overland day 38: crossed into Ethiopia from Kenya. Within one week I have seen geladas, eaten more injera than I can count, and been invited to two coffee ceremonies by strangers. Generosity level: maximum.' },
  { u: 'chloe_dubois', c: 'The girls in my class taught me five new Amharic words today and laughed at all five pronunciations. Worth it. Also: if anyone has beginner teaching materials in Amharic, I need them!' },
  { u: 'carlos_mendes', c: 'Ran a clinic in Addis this week — 40 kids, one ball, two hours of pure joy. If any local clubs want to partner on a youth tournament next month, my inbox is open.' },
  { u: 'sarah_mitchell', c: 'Nomad cost breakdown for Addis (monthly): cozy apartment 25,000 birr, food 8,000, transport 2,000, coworking 6,000. Roughly a third of my Portland burn rate, double the hospitality.' },
  { u: 'james_carter', c: 'Tourist trap check: the "castle tours" near Piassa quoted me 10x the local price. Walk two streets over and ask at the family-run guesthouse instead. Same castle, honest fare, better stories.' },
  { u: 'kenji_tanaka', c: 'The minibus taxi system terrified me on day one. Today I hand exact change and yell my destination like a local. Small victories. Also learned the hard way: rush hour is a contact sport.' },
  { u: 'lena_fischer', c: 'Photo dump coming this weekend: Entoto at dawn, the Merkato spice quarter, and a weaver named Almaz who posed like she had done this her whole life. Because she has.' },
  { u: 'marco_rossi', c: 'Asked Meron where she eats and she said "somewhere you cannot pronounce." She was right and it was the best kitfo of my life. Follow the locals, not the reviews.' },
  { u: 'aisha_khan', c: 'Shipping note for small exporters: consolidated air freight from ADD to DXB is 30% cheaper if you book before the 25th. Two pallet spaces left in my consignment — message me.' },
  { u: 'chloe_dubois', c: 'Rainy season lesson from the volunteers who came before me: waterproof shoes, not cute shoes. The streets of Sidist Kilo do not care about your aesthetic.' },
  { u: 'carlos_mendes', c: 'Watched the local premier league derby today. The noise, the drums, the passion — reminds me of Estádio do Maracanã in the 90s. Football language is universal.' },
  { u: 'sarah_mitchell', c: 'Design critique nobody asked for: the new ride-hailing apps here are cleaner than most European ones. Ethiopia builds brilliant things quietly.' },
  { u: 'james_carter', c: 'Three weeks into Ethiopia and my notes app has 47 drafts. Simien mountains booked for next week — any tips for the Sona ridge route, send them my way.' },
]

// Short realistic replies cycled across seeded posts
export const DEMO_COMMENTS: { u: string; c: string }[] = [
  { u: 'beti_alemu', c: 'Location? Need this in my life.' },
  { u: 'yonas_ab', c: 'Tried it last week — can confirm.' },
  { u: 'mahi_worku', c: 'Thanks for sharing, saving this.' },
  { u: 'samuel_k', c: 'DMed you about the details.' },
  { u: 'robel_a', c: 'This is the content I am here for.' },
  { u: 'liya_m', c: 'Adding it to my weekend list.' },
  { u: 'tigist_n', c: 'Facts. Been saying this for months.' },
  { u: 'nati_t', c: 'Wait really? Gotta try it.' },
  { u: 'rahel_s', c: 'Great tip, thank you.' },
  { u: 'addis_fresh', c: 'We are going this weekend then.' },
  { u: 'hanna_girma', c: 'Been there twice, no regrets.' },
  { u: 'abenezer_h', c: 'Heads up, the price went up slightly.' },
  { u: 'kidist_fikru', c: 'Screenshot taken. Booking soon.' },
  { u: 'meron_tadesse', c: 'Solid advice as always.' },
  { u: 'dawit_tesfaye', c: 'The last line is too true.' },
  { u: 'selam_bekele', c: 'Count me in for the next one.' },
  { u: 'bereket_d', c: 'Needed this today, thank you.' },
  { u: 'sheba_coffee', c: 'Sharing with the group chat.' },
  { u: 'rahel_s', c: 'Bookmarked for the holidays.' },
  { u: 'beti_alemu', c: 'Who else saw this late like me?' },
  { u: 'samuel_k', c: 'The photos you take there are unreal.' },
  { u: 'yonas_ab', c: 'Legend behavior, as usual.' },
  { u: 'mahi_worku', c: 'Can confirm, worth every birr.' },
  { u: 'robel_a', c: 'Bring the whole crew next time.' },
  { u: 'sarah_mitchell', c: 'As a visitor — this is exactly the kind of tip I needed, thank you!' },
  { u: 'james_carter', c: 'Adding this to my route notes immediately.' },
  { u: 'kenji_tanaka', c: 'Experienced this today. Can confirm it is true.' },
  { u: 'marco_rossi', c: 'This is why I follow locals, not guidebooks.' },
  { u: 'lena_fischer', c: 'Beautiful. Saving this one.' },
]

// Accepted connections between demo accounts (indices into DEMO_USERS).
// 0-17 are the local Addis accounts, 18-25 the international voices.
export const DEMO_CONNECTION_PAIRS: [number, number][] = [
  [0, 4], [1, 9], [2, 17], [3, 10], [4, 17], [5, 12], [6, 15], [7, 13],
  [8, 9], [11, 16], [1, 5], [2, 13], [3, 7], [14, 16],
  [1, 19], [0, 22], [4, 21], [5, 20], [10, 18], [2, 24], [7, 25],
  [11, 23], [9, 22], [17, 25], [18, 19], [20, 23],
]

// Likes per post (cycled): how many demo users liked post i
export const LIKE_PATTERN = [3, 8, 5, 12, 2, 9, 6, 14, 4, 10, 7, 1, 11, 5, 13, 8, 3, 9, 6, 12, 4, 7, 2, 10, 8, 5, 9, 13, 3, 6, 11, 1, 7, 12, 4, 9, 5, 10, 2, 8, 6, 14, 3, 7, 4, 11, 9, 5, 8, 12, 6, 3, 10, 7, 9]

// ============================================================
// DEMO LOCAL PRICE POSTS — community price intelligence seeds
// ============================================================
// 45 posts across PRODUCT + SERVICE, realistic Addis Ababa /
// regional prices in ETB. Owned by the same @seed.circub.test
// demo accounts, so the cleanup call removes every trace.
// ============================================================

export interface DemoLocalPost {
  u: string // author username
  postType: 'PRODUCT' | 'SERVICE'
  productName: string
  description?: string
  city?: string
  neighborhood?: string
  market?: string
  min: number
  max: number
  rec?: number
  tip?: string
  category: string
}

const A = 'Addis Ababa'

export const DEMO_LOCAL_POSTS: DemoLocalPost[] = [
  // ---------- PRODUCT ----------
  { u: 'selam_bekele', postType: 'PRODUCT', productName: 'Yirgacheffe coffee beans (roasted, per kg)', description: '1kg roasted from neighborhood roasters. Chocolate and citrus notes.', city: A, neighborhood: 'Bole', min: 850, max: 1200, rec: 950, tip: 'Ask for the roast date — anything older than two weeks loses the fruit notes.', category: 'Coffee' },
  { u: 'selam_bekele', postType: 'PRODUCT', productName: 'Coffee ceremony (full setup, per person)', description: 'Buna, popcorn and himbasha, traditional three rounds.', city: A, neighborhood: 'Bole', min: 150, max: 350, rec: 200, tip: 'Home ceremonies cost less and taste better than hotel ones. Ask a neighbor.', category: 'Coffee' },
  { u: 'selam_bekele', postType: 'PRODUCT', productName: 'Single-origin beans (Guji natural, 250g)', description: 'Light roast, dried on raised beds.', city: A, min: 450, max: 700, rec: 550, category: 'Coffee' },
  { u: 'addis_fresh', postType: 'PRODUCT', productName: 'Avocado (per piece)', description: 'Medium size, ready to eat in 2 days.', city: A, market: 'Merkato', neighborhood: 'Dubai Tera', min: 20, max: 40, rec: 25, tip: 'Morning prices run about 20% lower than evening.', category: 'Food' },
  { u: 'addis_fresh', postType: 'PRODUCT', productName: 'Papaya (per kg)', city: A, market: 'Shola', min: 50, max: 90, rec: 65, category: 'Food' },
  { u: 'addis_fresh', postType: 'PRODUCT', productName: 'Fresh cow milk (per liter)', city: A, market: 'Kera', min: 90, max: 120, rec: 100, tip: 'Boil before drinking even if the seller swears it is pasteurized.', category: 'Food' },
  { u: 'addis_fresh', postType: 'PRODUCT', productName: 'Local honey (Sidama, 700ml jar)', description: 'From the woreda cooperative, unprocessed.', city: A, min: 1300, max: 1600, rec: 1450, category: 'Food' },
  { u: 'addis_fresh', postType: 'PRODUCT', productName: 'Injera (per 10 pieces)', city: A, min: 250, max: 400, rec: 300, tip: 'Pure teff injera costs more than the mixed blend — ask which is which, the color difference is subtle.', category: 'Food' },
  { u: 'addis_fresh', postType: 'PRODUCT', productName: 'Eggs (per dozen)', city: A, market: 'Shola', min: 140, max: 220, rec: 170, category: 'Food' },
  { u: 'addis_fresh', postType: 'PRODUCT', productName: 'Onions (per kg)', city: A, market: 'Merkato', min: 60, max: 110, rec: 80, tip: 'Prices swing weekly with the season — midweek buys are cheaper.', category: 'Food' },
  { u: 'tigist_n', postType: 'PRODUCT', productName: 'Habesha kemis (machine woven, fabric only)', description: 'Basic weave, sold per full set of fabric.', city: A, market: 'Merkato', neighborhood: 'Dubai Tera', min: 3500, max: 6000, rec: 4500, tip: 'Hand-woven tilet costs double but lasts years longer. Check the fringe work.', category: 'Textiles' },
  { u: 'tigist_n', postType: 'PRODUCT', productName: 'Netela (cotton shawl)', description: 'Light shema cotton, hand-fringed ends.', city: A, market: 'Merkato', min: 1000, max: 1400, rec: 1200, category: 'Textiles' },
  { u: 'tigist_n', postType: 'PRODUCT', productName: "Men's suit fabric (imported, per suit)", city: A, market: 'Merkato', min: 4500, max: 9000, rec: 5500, category: 'Clothing' },
  { u: 'tigist_n', postType: 'PRODUCT', productName: 'School uniform (full set)', description: 'Shirt, trousers/skirt, sweater.', city: A, market: 'Merkato', min: 900, max: 1800, rec: 1200, category: 'Clothing' },
  { u: 'hanna_girma', postType: 'PRODUCT', productName: 'Modern habesha dress (designed, full outfit)', description: 'Designer cut with matching netela.', city: A, neighborhood: 'Piassa', min: 6500, max: 12000, rec: 8000, tip: 'Designers in Piassa charge less than Bole salons for the same quality.', category: 'Clothing' },
  { u: 'hanna_girma', postType: 'PRODUCT', productName: 'Hand-embroidered tilet panel', description: 'Traditional patterns, custom colors.', city: A, neighborhood: 'Piassa', min: 800, max: 2000, rec: 1200, category: 'Handicrafts' },
  { u: 'kidist_fikru', postType: 'PRODUCT', productName: 'Birthday cake (8 inch, custom)', description: 'Buttercream or fresh cream, message of your choice.', city: A, neighborhood: 'CMC', min: 1200, max: 2500, rec: 1600, tip: 'Order 3 days ahead — weekend slots go first.', category: 'Food' },
  { u: 'kidist_fikru', postType: 'PRODUCT', productName: 'Honey bread (per loaf)', city: A, neighborhood: 'CMC', min: 180, max: 280, rec: 220, category: 'Food' },
  { u: 'meron_tadesse', postType: 'PRODUCT', productName: 'Shiro (restaurant portion)', city: A, neighborhood: 'Kazanchis', min: 100, max: 250, rec: 150, category: 'Restaurants' },
  { u: 'meron_tadesse', postType: 'PRODUCT', productName: 'Tibs special (per person)', city: A, min: 350, max: 700, rec: 450, tip: 'Late-night charcoal grills beat fancy restaurants on flavor and price.', category: 'Restaurants' },
  { u: 'meron_tadesse', postType: 'PRODUCT', productName: 'Kitfo (per person)', description: 'With ayib and gomen.', city: A, market: 'George', min: 400, max: 900, rec: 550, category: 'Restaurants' },
  { u: 'meron_tadesse', postType: 'PRODUCT', productName: 'Gemuten (clean local spot)', city: A, min: 200, max: 350, rec: 250, category: 'Restaurants' },
  { u: 'beti_alemu', postType: 'PRODUCT', productName: 'Kolo (street pack)', description: 'Roasted barley with peanuts.', city: A, neighborhood: 'Sidist Kilo', min: 30, max: 80, rec: 50, category: 'Food' },
  { u: 'beti_alemu', postType: 'PRODUCT', productName: 'Buna (coffee cup, local cafe)', city: A, min: 25, max: 80, rec: 40, tip: 'Neighborhood buna bets near campuses are half the price of Bole lounges.', category: 'Coffee' },
  { u: 'nati_t', postType: 'PRODUCT', productName: 'Sneakers (original, resell)', description: 'Depends on model and size availability.', city: A, neighborhood: 'Ayat', min: 4500, max: 14000, rec: 6500, tip: 'Check stitching and the box label — fakes often get the font weight wrong.', category: 'Clothing' },
  { u: 'nati_t', postType: 'PRODUCT', productName: 'Bluetooth speaker (decent brand)', city: A, min: 2500, max: 6000, rec: 3200, category: 'Electronics' },
  { u: 'liya_m', postType: 'PRODUCT', productName: 'Power bank (20,000mAh)', description: 'Known brands with real capacity.', city: A, min: 1800, max: 3500, rec: 2200, tip: 'Buy from shops that give a 6-month warranty, not just a receipt.', category: 'Electronics' },
  { u: 'yonas_ab', postType: 'PRODUCT', productName: 'Wireless earbuds (name brand)', city: A, min: 3500, max: 9000, rec: 4500, category: 'Electronics' },
  { u: 'samuel_k', postType: 'PRODUCT', productName: 'Photo print 20x30, framed', description: 'Street series, limited prints.', city: A, neighborhood: 'Piassa', min: 2200, max: 3200, rec: 2800, category: 'Handicrafts' },
  { u: 'samuel_k', postType: 'PRODUCT', productName: 'Wooden mesob (decor size)', city: A, market: 'Merkato', min: 900, max: 2500, rec: 1400, category: 'Handicrafts' },
  // ---------- SERVICE ----------
  { u: 'abenezer_h', postType: 'SERVICE', productName: 'Minibus taxi (one hop)', description: 'Any route inside the city.', city: A, min: 10, max: 25, rec: 12, tip: 'Exact change avoids the "no change" drama. Do not pay rush hour extras — they are not a thing.', category: 'Transportation' },
  { u: 'abenezer_h', postType: 'SERVICE', productName: 'Ride-hailing trip (city center to Bole)', city: A, min: 250, max: 500, rec: 300, category: 'Transportation' },
  { u: 'abenezer_h', postType: 'SERVICE', productName: 'Bajaj ride (short hop)', city: A, neighborhood: 'Saris', min: 50, max: 150, rec: 70, category: 'Transportation' },
  { u: 'dawit_tesfaye', postType: 'SERVICE', productName: 'Addis to Bahir Dar (deluxe bus, one way)', city: A, min: 1600, max: 2200, rec: 1800, tip: 'Buy the ticket a day early at the station. The 6am departure has the best scenery.', category: 'Transportation' },
  { u: 'dawit_tesfaye', postType: 'SERVICE', productName: 'Addis to Harar (deluxe bus, one way)', city: A, min: 1800, max: 2400, rec: 2200, category: 'Transportation' },
  { u: 'dawit_tesfaye', postType: 'SERVICE', productName: 'Airport taxi (official, one way)', city: A, min: 800, max: 1500, rec: 1000, tip: 'Meter taxis outside the terminal charge half the hotel shuttle price. Agree BEFORE you sit.', category: 'Transportation' },
  { u: 'dawit_tesfaye', postType: 'SERVICE', productName: 'Budget hotel room (per night)', description: 'Clean room with private bath, outside the center.', city: 'Bahir Dar', min: 1200, max: 3000, rec: 1500, category: 'Accommodation' },
  { u: 'dawit_tesfaye', postType: 'SERVICE', productName: 'Mid-range lodge (per night)', description: 'Lake view, breakfast included.', city: 'Bahir Dar', min: 3500, max: 8000, rec: 5000, category: 'Accommodation' },
  { u: 'tigist_n', postType: 'SERVICE', productName: 'Dress tailoring (custom fit)', description: 'Bring your own fabric.', city: A, market: 'Merkato', min: 800, max: 2500, rec: 1200, tip: 'Bringing your own fabric avoids the 30% shop markup.', category: 'Services' },
  { u: 'mahi_worku', postType: 'SERVICE', productName: 'Bridal makeup (full session)', description: 'Trial session included.', city: A, neighborhood: 'Bole Medhanialem', min: 3000, max: 8000, rec: 4500, category: 'Services' },
  { u: 'mahi_worku', postType: 'SERVICE', productName: 'Soft glam makeup (event)', city: A, min: 1500, max: 3500, rec: 2000, category: 'Services' },
  { u: 'robel_a', postType: 'SERVICE', productName: 'Personal training (per session)', city: A, neighborhood: 'Gerji', min: 500, max: 1200, rec: 700, tip: 'Group bootcamps cost a quarter of one-on-one rates and the motivation is real.', category: 'Services' },
  { u: 'robel_a', postType: 'SERVICE', productName: 'Gym membership (monthly, mid-range)', city: A, min: 2000, max: 3500, rec: 2500, category: 'Services' },
  { u: 'hanna_girma', postType: 'SERVICE', productName: 'Hair salon (wash + style)', city: A, neighborhood: 'Piassa', min: 300, max: 900, rec: 450, category: 'Services' },
  { u: 'beti_alemu', postType: 'SERVICE', productName: 'Laundry service (per 5kg)', city: A, neighborhood: 'Sidist Kilo', min: 250, max: 500, rec: 350, category: 'Services' },
  { u: 'rahel_s', postType: 'SERVICE', productName: 'Private clinic consultation', description: 'General practitioner, walk-in.', city: A, neighborhood: 'Kirkos', min: 400, max: 1200, rec: 600, tip: 'Polyclinics in Kirkos are cheaper than the big hospitals for the same labs.', category: 'Services' },
]

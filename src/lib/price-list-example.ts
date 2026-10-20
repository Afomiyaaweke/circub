// v190: the canonical price-list example. The user pasted their real
// Benol pharmaceutical WhatsApp post and asked for it AS the placeholder
// ("change this place holder") in the price-list paste boxes, so both the
// single composer's "Price list text" section and the bulk poster's
// "Paste the price list text" tab show this exact post. Every line shape
// in it is parsed by src/lib/price-list-parser.ts: emoji bullets (👉),
// dotted price separators (..950 / ...1250), a company header line
// (Benol pharmaceutical plc), banner lines (ignored, never dropped into
// data) and bare phone lines (-> shared contacts).
export const PRICE_LIST_EXAMPLE = `✨✨Benol pharmaceutical plc
Big discount for
📞 Wholesales
📞 Clinics and Hospitals

👉 Vicryl 2 round ..950
👉 Vicryl 2/0 round ..950
👉 Vicryl 3 round..950
👉 Vicryl 3/0 cutting..950
👉 Vicryl 5/0 cutting...1250
👉 Vicryl 6/0 round..1250
👉 Prolene 2/0 round..3400
👉 Prolene 3/0 round..3400
👉 Prolene 4/0 round..3400
👉 Prolene 5/0 round..3400
👉 Prolene 6/0 round..3400
👉 Nylon 9/0...6200
👉 Nylon 10/0..6200
👉 Silk 0 round..620
👉 Silk 1 cutting..550

With fast delivery 🚚🚚🚚
Contact
📞 0911967478
📞 0973555577
📞 0999111110`

// v195: the bulk poster's example becomes ONE plain line - the user asked
// to drop the long Benol placeholder from the bulk post ("remove the place
// holder from the bulk post and make it '2 liter water 60 addis ababa'")
// and to remove the company header from the bulk side ("remove the header
// not from the price post"). Both the text-tab placeholder and the Load
// sample button show this line; the composer keeps the full Benol example
// with its header (PRICE_LIST_EXAMPLE above, untouched).
// "2 liter water 60 addis ababa" exercises the v195 parser city-tail rule:
// name "2 liter water", price 60, city "addis ababa" -> Ethiopia hint.
export const PRICE_LIST_SAMPLE_SIMPLE = '2 liter water 60 addis ababa'

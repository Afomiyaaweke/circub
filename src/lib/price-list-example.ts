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

// v194: the bulk poster's "Load sample" button loads this ONE-DEVICE
// variant ("change the sample for the bulk to be loaded make it one
// device only"). Same real Benol post - header, discount banner, fast
// delivery trailer and the full three-phone contact block - but exactly
// ONE device row (the first one, Vicryl 2 round ..950), so loading the
// sample demos a single drop instead of pouring the whole 15-item list
// into the batch. The full PRICE_LIST_EXAMPLE stays the grey placeholder
// in both the composer and the bulk text tab; only the LOADED sample
// shrinks. All three phones stay so the one-device sample still shows
// how a multi-contact parse fills the joined contact cell.
export const PRICE_LIST_SAMPLE_ONE_DEVICE = `✨✨Benol pharmaceutical plc
Big discount for
📞 Wholesales
📞 Clinics and Hospitals

👉 Vicryl 2 round ..950

With fast delivery 🚚🚚🚚
Contact
📞 0911967478
📞 0973555577
📞 0999111110`

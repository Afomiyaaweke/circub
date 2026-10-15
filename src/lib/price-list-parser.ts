// PRICE LIST PARSER (v174): turn messy free-form price lists into structured
// rows for the bulk poster. Real-world price lists arrive as WhatsApp posts,
// Word documents, PDFs or Excel sheets with emoji bullets, dotted price
// separators ("Vicryl 2 round ..950"), bare phone-number lines and a company
// header somewhere on top. This parser is line-based and language-agnostic:
//
//   - a line that ends in a number (with any decorative separators) is a
//     PRODUCT row:  "👉 Vicryl 2/0 round ..950"  ->  { productName: "Vicryl 2/0 round", price: "950" }
//   - a line that is mostly a phone number (or says contact/call/whatsapp
//     next to one) becomes a shared CONTACT for the whole list
//   - the first line that names an organization (plc / ltd / pharmaceutical /
//     trading / company ...) becomes the list's COMPANY
//   - everything else (banners like "Big discount for", "With fast delivery")
//     is counted as ignored - never silently dropped into the data
//
// The output feeds the bulk grid so the user reviews and edits every row
// BEFORE anything is posted.

export interface ParsedPriceRow {
  productName: string
  price: string
}

export interface ParsedPriceList {
  company: string
  contacts: string[]
  rows: ParsedPriceRow[]
  currencyHint: string
  countryHint: string
  ignored: number
  totalLines: number
}

// v175: infer the country from the phone numbers. A price list whose
// contacts are Ethiopian mobile numbers (09/07 + 8 digits, or +251) is
// Ethiopian - the phones are the ONE signal always present in real price
// lists (the words "birr" or "ETB" usually are not), and every bulk row
// needs a country before the Post button turns on.
function phoneCountry(raw: string): string {
  const d = raw.replace(/\D/g, '')
  if (!d) return ''
  // Ethiopia: +251 followed by 9 digits, or the local 10-digit 09/07 form
  if (/^(251[79]\d{8}|0?[79]\d{8})$/.test(d)) return 'Ethiopia'
  if (d.startsWith('254')) return 'Kenya'
  if (d.startsWith('255')) return 'Tanzania'
  if (d.startsWith('256')) return 'Uganda'
  if (d.startsWith('250')) return 'Rwanda'
  if (d.startsWith('233')) return 'Ghana'
  if (d.startsWith('234')) return 'Nigeria'
  if (d.startsWith('27')) return 'South Africa'
  if (d.startsWith('971')) return 'United Arab Emirates'
  return ''
}

// Emoji + symbol bullets (👉 ✨ 📞 🚚 ...) - Unicode property escape runs on
// Node >= 18 and all evergreen browsers; this parser is used server-side.
const EMOJI_RE = /\p{Extended_Pictographic}/gu

// An organization-ish line: company suffix or sector word. Tighter than
// "any noise line" so banners like "Big discount for" never become the name.
const COMPANY_RE =
  /\b(plc|ltd|llc|inc|gmbh|co\.?|company|pharmaceutical|pharmacies?|pharma|trading|enterprises?|enterprise|importers?|exporters?|distributors?|suppliers?|general business|group)\b/i

// Contact keywords - a line saying "call"/"contact"/"whatsapp" next to a
// number is a contact line, not a product called "Call".
const CONTACT_WORD_RE =
  /\b(call|contact|phone|tel|telephone|whatsapp|hotline|sms|order\s+now|inbox)\b/i

// A phone-looking run: +251..., 0911967478, 0911 967 478, (091) 967-478.
const PHONE_RUN_RE = /\+?\d[\d\s\-().]{5,}\d/g

// Product + price: a name, then any decorative gap (dots, colons, dashes,
// commas, pipes, spaces), then a number or min-max range at end of line,
// with an optional trailing currency word.
//   "Vicryl 2 round ..950"        name="Vicryl 2 round"  price="950"
//   "Nylon 9/0...6200"            name="Nylon 9/0"       price="6200"
//   "Handwoven basket, 1,200"     name="Handwoven basket" price="1200"
//   "Coffee beans 12-15 birr"     name="Coffee beans"    price="12-15"
const PRICE_LINE_RE =
  /^(.+?)[\s.·•:;,|\-–—=~]*(\d[\d,]*(?:\s*[-–—]\s*\d[\d,]*)?)[\s]*(birr|br\b|etb|usd|eur|gbp|\$|€|£)?[\s]*$/i

function stripDecor(line: string): string {
  return line
    .replace(EMOJI_RE, ' ')
    .replace(/[\uFE0E\uFE0F\u200D]/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function digitsOf(s: string): string {
  return s.replace(/\D/g, '')
}

// A line whose non-digit part is just punctuation/plus signs is a bare phone
// line ("0911967478", "+251 911 967 478").
function barePhoneRun(line: string): string | null {
  if (!/^[\d\s\-().+]+$/.test(line)) return null
  const digits = digitsOf(line)
  if (digits.length < 7 || digits.length > 15) return null
  return line
}

function normalizePrice(raw: string): string {
  // Strip thousand separators, keep an explicit single '-' for ranges.
  let p = raw.replace(/,/g, '')
  p = p.replace(/[\u2013\u2014]/g, '-')
  p = p.replace(/\s*-\s*/g, '-')
  return p
}

function cleanName(name: string): string {
  return name
    // trailing separator characters glued to the name by lazy matching
    .replace(/[\s.·•:;,|\-–—=~]+$/g, '')
    .trim()
}

export function parsePriceListText(text: string): ParsedPriceList {
  const lines = text
    .split(/\r?\n/)
    .map((l) => stripDecor(l))
    .filter(Boolean)

  const contacts: string[] = []
  const rows: ParsedPriceRow[] = []
  let company = ''
  let currencyHint = ''
  let countryHint = ''
  let ignored = 0

  const addContact = (v: string) => {
    const c = v.trim().replace(/\s+/g, ' ')
    if (c && !contacts.some((x) => x.replace(/\D/g, '') === c.replace(/\D/g, ''))) contacts.push(c)
  }

  for (const line of lines) {
    if (rows.length >= 50) break

    // 1) Bare phone line -> contact.
    const bare = barePhoneRun(line)
    if (bare) {
      addContact(bare)
      continue
    }

    // 2) "Contact / call / whatsapp ..." line -> pull every phone run out.
    if (CONTACT_WORD_RE.test(line)) {
      const runs = line.match(PHONE_RUN_RE)
      let found = false
      for (const r of runs || []) {
        if (digitsOf(r).length >= 7) {
          addContact(r)
          found = true
        }
      }
      if (found || !/\d/.test(line)) {
        if (!found) ignored++
        continue
      }
      // falls through: a "contact"-sounding line WITH other digits but no
      // phone-shaped run is parsed as a product below (rare, honest fallback)
    }

    // 3) Product + price line.
    const m = PRICE_LINE_RE.exec(line)
    if (m) {
      const name = cleanName(m[1] || '')
      const price = normalizePrice(m[2] || '')
      const cur = (m[3] || '').trim()
      // A "name" that is really another sentence around a phone number
      // ("Call 0911967478") is a contact, not a product.
      const phoneInName = name.match(PHONE_RUN_RE)
      if (phoneInName && digitsOf(phoneInName[0]).length >= 7 && !/\s[a-z]{2,}/i.test(name.replace(phoneInName[0], ''))) {
        addContact(phoneInName[0])
        continue
      }
      if (name.replace(/[^\p{L}\p{N}/]/gu, '').length >= 1 && price) {
        rows.push({ productName: name.slice(0, 200), price })
        if (!currencyHint) {
          if (/^(birr|br|etb)$/i.test(cur) || /\birr\b/i.test(line)) currencyHint = 'ETB'
          else if (/^(usd|\$)$/i.test(cur)) currencyHint = 'USD'
          else if (/^(eur|€)$/i.test(cur)) currencyHint = 'EUR'
          else if (/^(gbp|£)$/i.test(cur)) currencyHint = 'GBP'
        }
        continue
      }
    }

    // 4) Organization name (first one only), e.g. "Benol pharmaceutical plc".
    if (!company && COMPANY_RE.test(line) && !/\d/.test(line) && line.length <= 80 && /[\p{L}]{3,}/u.test(line)) {
      company = line
      continue
    }

    // 5) Anything else (banners, audience labels) is counted, not dropped silently.
    ignored++
  }

  // Text-level currency hint: "prices in birr" / "USD" anywhere.
  if (!currencyHint) {
    if (/\bbirr\b|\betb\b/i.test(text)) currencyHint = 'ETB'
    else if (/\$|\busd\b/i.test(text)) currencyHint = 'USD'
  }

  // Country hint from the contact numbers (Ethiopia first - the market this
  // flow is built for). A currency hint can also name the country.
  for (const c of contacts) {
    const co = phoneCountry(c)
    if (co) { countryHint = co; break }
  }
  if (!countryHint) {
    if (currencyHint === 'ETB') countryHint = 'Ethiopia'
    else if (currencyHint === 'KES') countryHint = 'Kenya'
    else if (currencyHint === 'UGX') countryHint = 'Uganda'
    else if (currencyHint === 'TZS') countryHint = 'Tanzania'
    else if (currencyHint === 'RWF') countryHint = 'Rwanda'
    else if (currencyHint === 'GHS') countryHint = 'Ghana'
    else if (currencyHint === 'NGN') countryHint = 'Nigeria'
  }

  return {
    company,
    contacts,
    rows: rows.slice(0, 50),
    currencyHint,
    countryHint,
    ignored,
    totalLines: lines.length,
  }
}

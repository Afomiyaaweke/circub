// v149: product-name matching that survives REAL-WORLD listing titles.
//
// The exact trim+lowercase rule left 65 of 67 production posts with no
// compare at all: qualifiers ("Personal training (per session)" vs
// "Personal training"), word order, and - the big one for circub -
// Amharic spelling variants that are the SAME word colloquially
// ("አበሻ ቀሚስ" vs "ሀበሻ ቀሚስ" - both "habesha kemis"). This matcher folds
// all of that into a canonical key and returns a tiered verdict:
//   'exact' - same product after normalization (compare rows + table
//             columns, full trust)
//   'near'  - similar enough to compare honestly WITH a "similar" mark
//             (one name contains the other, or token subset)
//   null    - do not compare
//
// The Amharic fold collapses the 7 vowel orders of each fidel family to
// its base consonant (pure normalization - ሃ is just ሀ + 'u'), and merges
// the consonant families modern Amharic merged in speech: ሀ/ሐ/ኀ (ha) and
// አ/ዐ (a) all land on አ. Applied ONLY for matching keys, never display.

// Fidel base consonants are 8 codepoints apart (ä u i a e ~ o).
function foldAmharic(s: string): string {
  let out = ''
  for (const ch of s) {
    const cp = ch.codePointAt(0) as number
    if (cp >= 0x1200 && cp <= 0x136f) {
      const base = cp - ((cp - 0x1200) % 8)
      // consonant families spoken identically in modern Amharic:
      // ሀ(0x1200) ሐ(0x1210) ኀ(0x1280) -> አ(0x12a0); ዐ(0x12d0) -> አ
      if (base === 0x1200 || base === 0x1210 || base === 0x1280 || base === 0x12d0) {
        out += 'አ'
      } else {
        out += String.fromCodePoint(base)
      }
    } else {
      out += ch
    }
  }
  return out
}

// Canonical MATCHING key - never rendered: lowercase, drop parenthetical
// qualifiers, strip punctuation, fold Amharic, collapse spaces.
export function productMatchKey(raw: string): string {
  const base = (raw || '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ') // "(per session)", "(imported, per suit)"
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return foldAmharic(base)
}

function tokensOf(key: string): string[] {
  return key.split(' ').filter((t) => t.length > 0)
}

export type ProductMatch = 'exact' | 'near' | null

// Tiered verdict for two product (or category) names.
export function productNamesMatch(a: string, b: string): ProductMatch {
  const ka = productMatchKey(a)
  const kb = productMatchKey(b)
  if (!ka || !kb) return null
  if (ka === kb) return 'exact'
  // containment: the shorter title is the longer one plus a qualifier.
  // Guard the short side (>= 5 chars) so "tea" does not swallow names.
  const short = ka.length < kb.length ? ka : kb
  const long = ka.length < kb.length ? kb : ka
  if (short.length >= 5 && long.includes(short)) return 'near'
  // token subset: every token of the smaller title appears in the other
  // ("defin meser" vs "meser", "coffee" vs "coffee ceremony"). Single-token
  // matches only when the extra part stays small (<= 2 tokens).
  const ts = tokensOf(short)
  const tl = new Set(tokensOf(long))
  if (ts.length === 0 || ts.length > tl.size) return null
  if (!ts.every((t) => tl.has(t))) return null
  if (ts.length >= 2 || tl.size - ts.length <= 2) return 'near'
  return null
}

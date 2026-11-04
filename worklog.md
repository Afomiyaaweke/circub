# circubAwd worklog

## v230 — Link tab becomes a full-screen reel: header removed, back button added (2026-11-03)
User: "remove all the header from the link session and only keep the toggle and my escoret and
make the swiping full screen like reel have back also".

- REEL SHELL (`live-zone-tab.tsx`): the Link tab now renders `fixed inset-0 z-50` above the app
  header (z-30) and the mobile dock (z-40); radix dialogs still portal above. The ONLY header is
  one slim bar: back arrow (returns to the tab the user came from, `lastNonLinkTabRef` in
  home-client) + the Instant Bounties / Talent On Call toggle + My Payouts & Escrow (icon-only on
  phones). The v229 hero row (hustlers online, escrow badge, join/guide/go-live) is GONE; the
  availability toggle lives in Profile.
- FULL-SCREEN DECKS: bounty + talent decks swapped `h-[78vh] max-w-480` cards for `flex-1`
  full-height snap decks — edge-to-edge on phones, centered 560px column with side borders on
  desktop (TikTok-web). Rails moved up to bottom-4 (no dock underneath). Tier pills stay as a
  slim overlay row with the Post pill at its right end; the inline quest form collapses to a
  `max-h-46dvh` sheet with a close X; lanes + search stay as slim rows on the talent feed and the
  AI panel is height-capped. Old `bounty-view-all`/`bounty-swipe-root` furniture removed.
- ESCAPE GUARD: Escape leaves the reel, but a MutationObserver remembers the last time a
  `[role=dialog]` was seen and stays put for 600ms — Radix flushes the dialog close during the
  same Escape event, so a plain "dialog open" check already ran too late.
- `home-client.tsx`: while the reel is open the app Header, RightSidebar, dock and page paddings
  are not rendered at all (`reelMode` branch); LiveZoneTab gets `onBack`.
- Verify: tsc 20 baseline (0 new), build clean, runtime probe task230_reel_probe.py 39/39
  (header+dock unmounted, reel=viewport, deck 88% viewport full-bleed, claim end-to-end, back to
  feed, talents full height, Escape closes dialog not the reel, desktop 560px column, no console
  errors). Screenshots confirmed mobile + desktop.

## v229 — Link tab becomes the mockup's two-feed TikTok tab + escrow in Profile + SW/hydration fixes (2026-11-03)
User: "it's does looks like this make it looks like this" (Instant-Bounties two-feed mockup) +
"remove the footer icons form the web views" + follow-up: "remove all the like [counts], add the
add sign next to the claim to add post, put my escrow in the profile session". Scopes confirmed
per Q&A: Link tab only; dock hidden on desktop only; talent becomes the second swipe feed;
4+1 action buttons with Chat -> profile, zero fabricated counts.

- LINK TAB (`live-zone-tab.tsx` rebuilt): compact live banner (hustlers online + escrow badge +
  payouts/join actions, `hustle-hero` kept) replaces the tall hero; NEW feed mode switcher
  (`feed-switcher`, `feed-tab-bounties` / `feed-tab-talents`) with REAL counts; bounties feed
  (default, v220 deals-first kept) and talent feed swap in place.
- BOUNTY CARDS match the mockup: white rounded-3xl card with rotated accent glow, location chip +
  deadline chip on top, title, line-clamped brief, poster chip (dark initials avatar, "N tasks
  posted" from real posts), green GUARANTEED ESCROW REWARD gradient with In Escrow /
  Instant Auto-Release chip, swipe hint, right action rail = Save / Claim bolt / **+ Post
  (opens the inline quest form, `bounty-post-rail`)** / Share / Chat. No like-counts anywhere
  (no fabricated numbers). All v219/v220/v221/v227 testids + claim/privacy logic preserved
  verbatim (manage row, claim form, contact reveal, drop/remove claim).
- TALENT ON CALL: the directory is now the second snap feed (`talent-swipe`) - profile header
  (avatar, verified badges, rating chip -> reviews, roles sticker), real stats tile
  (`talent-stats`/`talent-gigs`/`talent-earnings`), featured skill quote, videos strip, skill
  chips, starting rate; rail = Save (new `guide` saved-items type) / Book / Share / Chat
  (in-app message). Hustle lanes + search + AI Match moved INTO the talent feed (contracts
  intact, one line at every breakpoint).
- DECK OFF WEB VIEW ON DESKTOP: bottom nav dock gets `lg:hidden` ("remove the footer icons
  from the web views") - desktop navigates with the header pills (`nav-pill-*`), phones,
  tablets and the installed PWA keep the dock.
- PROFILE > ESCROW (new tab, `profile-tab-escrow`): Open pledge / In escrow / Pending payout
  tiles + per-bounty lists, derived from the same owner-scoped /api/quests/mine payload -
  no new endpoint, no invented numbers.
- API: GET /api/quests now carries `posterUsername` (member posters only) so the rail's Chat
  opens /u/<username>; guest posters get an honest toast pointing at the claim flow.
- INFRA FIX 1 - SW forced-reload bug ("claim then surprise reload"): the v228 activate ping
  fired ~100ms into a page load, BEFORE React hydration registered the effect-based PONG
  listener, so the 6s timeout force-navigated a fresh page. PONG now answers at MODULE scope
  (pre-hydration) in `pwa-register.tsx`, the worker double-pings (4s) and only navigates at 9s,
  and the GET_VERSION handshake retries once. Verified: claim now survives the whole SW
  activate window (probe M7b).
- INFRA FIX 2 - React #418 on every returning visit: the server always renders the landing
  (page.tsx is session-blind) while the client seeded `me` from the localStorage cache and
  hydrated dashboard HTML into landing HTML. `home-client.tsx` now applies the cache in a
  post-hydration effect - still no spinners, no mismatch (probe M8 is clean).
- Verify: `task229_two_feed_probe.py` 31/31 on a production server (two feeds, mockup card
  furniture, 5-button rail, tier slicing, claim e2e + SW-activate survival, talent cards,
  deep link + flash, Chat -> /u/<username>, escrow numbers, dock hidden on desktop, deck
  centered in its column, zero console/page errors). tsc 20 pre-existing baseline (zero new),
  `next build` clean (exit 0). Note: an orphaned `next-server` on :3100 served stale chunks
  (500s -> inert pages) mid-session and cost the day several phantom failures - always
  `pkill -f next-server` after rebuilds.

## v228 — self-healing service-worker update pipeline ("still the same nothing changed" fix) (2026-11-03)
Pushed to main, live (sw.js `circub-v228`). No UI changes - this version exists because the
browser kept showing an OLD build after v227 deployed: the SW update flow had three traps.

- Root causes found in `pwa-register.tsx` + `public/sw.js`:
  1. the auto-reload guard was a ONE-SHOT flag (`circub-sw-reloaded=1` in sessionStorage) -
     after the first update ever reloaded a tab, every later deploy was silently swallowed
     for as long as the tab lived (mobile PWA tabs live for days);
  2. no update check on tab resume / while open - a PWA that just resumes never re-checks
     sw.js, so it could run an old build indefinitely;
  3. no `updateViaCache:'none'`, so the worker update check itself could be HTTP-cached.
- `pwa-register.tsx` rewritten: registers with `updateViaCache:'none'`; re-checks the worker
  on every page load, on `visibilitychange` (PWA resume) and every 30 min; the guard now
  stores the adopted worker VERSION (`circub-sw-version`) and reloads ONCE PER NEW VERSION
  (same version = no-op, so no reload loops); answers the worker's `CIRCUB_PING` with
  `CIRCUB_PONG` + `APP_VERSION`; asks the controlling worker its version via a
  MessageChannel `GET_VERSION` handshake (`skipWaiting -> controllerchange` unchanged).
- `public/sw.js`: on activate it now pings every open tab (`CIRCUB_PING`); tabs running the
  current register answer and keep working, tabs running an OLDER build never answer and are
  force-navigated once (`client.navigate(client.url)`, guarded) - self-healing for tabs that
  never reload; answers `GET_VERSION`; old caches still wiped on activate.
- `app-version.ts` -> v228 (lockstep with sw.js).
- Verify: `task228_sw_pipeline_probe.py` 11/11 on a production server - SW active + claim,
  GET_VERSION handshake lands (`circub-sw-version=circub-v228`), cache `circub-v228` created,
  **simulated deploy (v228b) auto-reloads the page into the new worker with no loop**, landing
  renders after the pipeline, zero page errors. tsc 20 pre-existing errors (baseline, zero new),
  `next build` clean.

## v227 — Link tab bounties become a TikTok-style swipe deck (2026-11-03)
Commit 48bfac0, pushed to main, live on https://circubawd.vercel.app (sw.js `circub-v227`).

User ask: "make the hustle like tiktok swiping, put the ppl with like the second image" (Instant
Bounties screenshot), scoped per user answer: **Link tab only**, all 5 nav icons stay.

- `live-zone-tab.tsx`: the Instant Side-Hustle Bounties grid is now a full-height snap-scrolling
  deck (`bounty-swipe`, 78vh, one bounty per screen, "Swipe up for next bounty" hints, end card
  with refresh). Every card carries the screenshot's furniture:
  - poster identity row (`bounty-poster-row`): initials avatar, "Posted by local hustler", name · N tasks posted
  - green `GUARANTEED ESCROW REWARD` gradient banner with the amount + Instant Auto-Release / In Escrow chip
  - right action rail (`bounty-action-rail`): Save (localStorage, new `quest` type), Claim bolt,
    Share (deep link) — no fabricated counts
  - tier pills above the deck (`bounty-tier-*`): All / Hunter under $15 / Helper $15-30 / Scout $30+,
    sliced off real `bountyUsd` values (no schema change)
- All v219 claim/privacy logic and testids preserved verbatim: claim form, contact reveal,
  drop claim, remove claimer, poster edit/delete (`quest-claim-*`, `bounty-claimed`, `quest-edit-btn`, ...).
- New deep link `/?quest=<id>`: opens the Link tab, scrolls the deck to that bounty and flashes it
  (mirrors `?community=`); wired in `home-client.tsx` + `LiveZoneTab(highlightQuestId, onHighlightDone)`.
- `saved-items.ts`: `SavedItem.type` union extended with `'quest'`; profile Saved view shows a
  Quest badge + Zap icon.
- Verify: tsc 20 pre-existing errors (baseline, zero new), `next build` clean, local + production
  probe: deck/snap/pills/save/claim/deep-link all green. Transient 500 on cold /api/quests during
  deploy was serverless noise, not v227 (no server-side changes in this version).

## v226 — feed header removed, seeds humanized, Dantty product grid (2026-11-03)
Commit f47d8d5, pushed to main, live (sw.js `circub-v226`).

- `community-feed-tab.tsx`: removed the redundant tab header block ("Community feed" title,
  subtitle, Recent/Top/Saved pills); the composer is now the first thing on screen; sort is
  always 'recent'. Seed posts rewritten as ordinary members (Amina Yusuf – Kampala, Kwame
  Boateng – Accra, Sara Okello – Nairobi) with no "circubAwd Guides" brand, no TIP badge, no
  emerald tint; seeds still display-only (no save/share/edit).
- Local tab: new `local-product-card.tsx` (Dantty-style square-photo card: name, city+country,
  price range, heart save, full-width green "Compare Sellers" → detail modal; author-only
  edit/delete icons on own photos). `local-feed-tab.tsx` renders posts in a
  `Local Products` section (2 cols on phones, 3 sm, 4 lg) with a "See All" chip that clears
  filters; skeletons match the grid.
- Verify: tsc baseline clean, build clean, runtime probe: post→save flows, localStorage save,
  detail modal, all testids intact.

## v231 - Talent feed: one search bar, no lane tabs

User: "remove this and put it all in on search bar only and make the page like all don't creat
new page keep showing like the feed" (screenshot = the Link tab's Talent On Call filter block:
Scout/Helper/Hunter/Agent lane tabs + skill search + AI Match / Available / Near me).

- `live-zone-tab.tsx`: the four hustle-lane TABS are gone from the screen (HUSTLE_LANES stays
  as the one catalog of lane meanings/rates). The whole filter surface is now ONE pill:
  input + active-lane chip + AI Match / Available / Near me as icon toggles, all inside the
  bar (`talent-search-bar` / `talent-search-input` / `lane-chip` / `ai-match-toggle` /
  `available-toggle` / `nearme-toggle`). Role slicing moved INTO the search text: typing
  scout / helper / hunter / agent (plurals ok) applies the same role slug the tabs used
  (`parseLaneSearch`, generic label words deliberately NOT keywords so "local food" stays a
  skill search); the chip shows/clears the active lane. Results keep rendering in the SAME
  swipe deck - zero navigation, no new page. Desktop: the pill rides the centered 560px card
  column (max-w-[560px] mx-auto) instead of stretching. Derived `laneHit` replaces the old
  role state; AI panel/empty states untouched. Probe 35/35; tsc 20 baseline; build exit 0.

## v232 - Local Price Feed: one-line filters + vote on every post

User: "keep them in one line and have vote for all the price post" (screenshot = the Local
Price Feed header with the search bar, All locations / All categories pickers and the
All posts / Shop owner / Shared price tabs wrapping onto several lines).

- `local-feed-tab.tsx`: the filter block is ONE line at every breakpoint now (`local-filter-row`):
  search pill (Proforma shortcut inside) | location picker | category picker | poster-type
  segments | Proforma button. On phones the two pickers go ICON-ONLY (active filter tints the
  icon emerald, full labels from sm up) and the segments show short labels (All / Shop /
  Shared). The conditional chips (image search, compare locations, comma hint) and the
  Proforma / AI result panels moved OUT of the row into a stacked block below, so the row can
  never wrap again.
- `local-product-card.tsx`: EVERY price post now carries a Helpful vote button beside
  Compare Sellers (thumbs-up + live count, filled emerald when myVote=HELPFUL, tap again to
  undo) wired to the feed's existing /api/local-prices/[id]/vote handler; guests still get
  the register-to-vote toast. The not-accurate flag stays in the detail modal.
- Probe 23/23 (one-line geometry on 390px + 1440px, icon-only forms, vote/un-vote end-to-end,
  search from the narrow input); tsc 20 baseline; build exit 0.

## v233 - Local feed: header card gone, only Post Price + Proforma stay

User: "keep the header for the link remove the local header and only keep the
post price and proforma" (screenshots = the global nav header and the Local
Price Feed page with its big title card).

- `local-feed-tab.tsx`: the "Local Price Feed" header CARD is gone - the
  Sparkles title, the subtitle and the "Bulk post" button go with it. What
  remains of the header is ONE slim right-aligned row (`local-actions-row`)
  with exactly the two kept actions: Proforma (outline, opens the market
  panel) + Post Price (primary, opens the composer). The Proforma entries
  that used to ride inside the phone search pill and at the end of the v232
  filter row are removed, so each action has exactly ONE entry point.
  Bulk post wiring (openBulk / bulkOpen / BulkPostModal import + render)
  removed along with its last trigger. The v232 one-line filter row and the
  per-post Helpful vote buttons are untouched.
- The LINK tab header is untouched: the reel still opens on its slim bar
  (back + Instant Bounties / Talent On Call switcher).
- Probe 35/35 (header card + bulk gone at 390px & 1440px, one Proforma + one
  Post Price, slim action row above the filter row, v232 one-line filter
  intact, votes intact, Proforma panel + composer open/close, Link reel
  header kept, reel back returns to Local); tsc 20 baseline; build exit 0.

## v234 - Local feed: the filter bar is gone, same-page feed stays

User: "remove this bar and keep the nav bar on the link don't take it to new
page keep it in the same page" (screenshot = the v232 one-line filter bar:
Search item, location + All locations + All categories + All posts /
Shop owner / Shared price).

- `local-feed-tab.tsx`: the whole `local-filter-row` is gone - the search
  pill, the location + category pickers and the All/Shop/Shared segments no
  longer render (-96 lines). The price feed now shows DIRECTLY under the
  slim v233 action row (Proforma + Post Price), on the SAME page with zero
  navigation - no new page, no route change. The conditional state chips
  (image search / compare places / comma hint) and the Proforma + AI panels
  keep their conditional rendering; the filter state itself stays at its
  defaults so the fetch logic is untouched. Unused imports dropped
  (Search icon, Input, Select family, Tag); MapPin/X stay (chips use them).
- The LINK tab nav bar is untouched: reel still opens on its slim bar
  (back + Instant Bounties / Talent On Call) and back returns to the Local
  tab on the same page.
- Probe 41/41 (bar fully gone at 390px & 1440px incl. placeholder text,
  action row is the only bar, grid populated below it, URL constant
  throughout incl. Proforma/composer/reel-back, votes intact, Link nav bar
  kept); tsc 20 baseline; build exit 0.

## v236 - Link tab back in the page flow + talent registration inside Edit profile (covers v235)

User: "make the guide registration in side the edit profile and make the name 'guide' to 'talent'".

- LINK TAB (v235, `live-zone-tab.tsx` + `home-client.tsx`): the v230 fixed-reel
  shell is gone - the tab renders in the NORMAL page flow again (header,
  sidebar and dock always mount, no `fixed inset-0`, no back button). The slim
  in-page switcher (Instant Bounties / Talent On Call + My Payouts & Escrow)
  stays at the top of the tab; the full-screen one-bounty-per-screen swipe
  decks stay.
- TALENT IN EDIT PROFILE (v236, `profile-tab.tsx`): a new talent section for
  everyone - RolePicker, ID/passport doc switch + camera upload, languages and
  specialties TagInputs, hourly rate + free-text currency (uppercase, max 5),
  bio, up to 3 YouTube/Instagram video links with live parse feedback, and its
  own Save button. `saveTalent()` POSTs /api/guides (first registration
  requires the document; later saves keep guideAvailable intact); success
  toasts "Talent profile saved" / "You are in!". Registered talent also gets
  "Leave the talent program" (stop-guide AlertDialog, renamed copy). The old
  guide-register modal is DELETED; Live Zone's "Become a talent" now opens
  Edit profile via `onJoinTalent` (guests go through promptRegister first).
- RENAME: every user-visible "Guide/Guides" is now "Talent(s)" - ROLE_META,
  i18n `roles.guide` in all 6 languages (EN Talent / AM / SW / AR / ZH),
  landing copy, demo banner, booking + rating modals, empty states. Internal
  API slugs (guideRoles, /api/guides, guideBio...) are untouched.
- Verify: tsc 20 baseline; build exit 0; probes 25/25 (v235) + 28/28 (v236);
  sw.js circub-v236.

## v237 - Bounty + talent cards: icons never overlap text, mobile-first, one full-screen slide per swipe

User: "dont over lap icons with the text and make it mobile responsev and make
it swiping not sliding one task full screen like tiktok short" (screenshot =
bounty card with the right-side icon stack sitting on the copy).

- NO-OVERLAP RAIL (`live-zone-tab.tsx`): on BOTH swipe decks the action rail
  (Save / Claim / Post / Share / Chat and Save / Book / Share / Chat) is no
  longer `absolute right-2.5 bottom-4 z-10` stacked over the card - it is now
  a real flex SIBLING column (w-[52px] phone / w-16 desktop, buttons
  40px phone / 44px desktop, pinned bottom-right TikTok-style). Text lives in
  a `flex-1 min-w-0` content column beside it, so an icon can never cover a
  word at any width; long lines truncate instead of colliding.
- MOBILE-FIRST: phone padding drops to p-3.5 (sm:p-5), buttons and gaps
  shrink one notch under sm; the card is `overflow-hidden` so nothing bleeds.
- TRUE SWIPE, NOT SLIDE: both decks drop `scroll-smooth` (programmatic
  deep-link scroll keeps its explicit smooth), the claim area gets
  `overscroll-contain`, and the decks keep `snap-y snap-mandatory` +
  `snap-start snap-always` - one gesture lands exactly one full-screen card.
- Probe `scripts/task237_rail_probe.py` 21/21: zero text-under-rail box
  overlaps (bounty + talent, 390x844 + 1440x900), card height == deck height
  (603px full screen), scroll-snap-type y mandatory, snap-stop always,
  wheel swipe lands exactly on slide 2, rail button 40/44px, 560px column
  centered in its container, sw.js circub-v237, zero console errors.
  Screenshots: download/task237_{bounty,talent}_mobile.png, task237_bounty_desktop.png.
- tsc 20 baseline (0 new); build exit 0.

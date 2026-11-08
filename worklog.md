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

## v240 (2026-11-05) - "still the same sign in is not working" follow-up

User reported sign-in STILL broken after v239. Diagnosis (prod probes + API
error-code probes against the real account):
- GitHub HAD v239 (715da9e) - the "[ahead 1]" seen in the session was only a
  stale local remote-tracking ref (one-time-URL pushes do not update it).
  Vercel was serving circub-v239, task239_prod_verify.py 23/23, and a curl
  probe of POST /api/auth/login with username "afomiya" answered
  WRONG_PASSWORD (account exists, HAS a password) - the API resolves
  username AND display-name correctly. So the web auth chain is healthy.
- Real remaining traps fixed in v240:
  1. THE ANDROID SHELL POINTED AT THE 301-REDIRECT ALIAS:
     capacitor.config.ts server.url + allowNavigation, apk/MainActivity.java
     APP_ORIGIN/APP_HOST and the manifest intent-filter all said
     circub.vercel.app. Every app start paid an extra redirect hop (the
     "app is laggy" report) and handleUrl() bounced any navigation to the
     redirect target OUT to the system browser. All three now use the
     canonical circubawd.vercel.app; the legacy host stays accepted in the
     manifest intent-filter + handleUrl so old shared links still open the
     app. ANDROID-APP.md updated. NOTE: the already-installed APK / the
     public/circub.apk download still carries the OLD origin - a rebuild is
     needed for the fix to reach phones.
  2. COLD-DB 500s READ AS "BROKEN SIGN-IN": login/register now wrap their
     user lookups (and create) in src/lib/db-retry.ts withDbRetry (3
     attempts, 250/500ms) for transient Prisma P1001/P1002/P2024/P2034 +
     connection/timeout errors; the 500 catch-alls now answer code TEMPORARY
     with "temporarily unavailable - the database is waking up" instead of a
     bare "Login failed"/"Registration failed". A register P2002 race
     answers 409 like the pre-check.
  3. RATE-LIMIT KEY: x-forwarded-for is a comma chain on Vercel - both
     routes now key the limiter on the FIRST (client) entry.
  4. WRONG_PASSWORD message now says: tap "Forgot password?" below to reset
     it by email (the link was under the button; nobody noticed).
- STALE PRERENDER LESSON: the first :3100 probe run showed the v239 landing
  badge - the previous session's .next survived the recycle and Turbopack
  reused the stale static landing page. rm -rf .next + rebuild fixed it;
  also `pkill -f "next start"` does NOT match the renamed `next-server`
  process - kill by PID.
- Probe task239_probe.py (markers bumped to v240): 30/30 on the clean build;
  local register 201 / wrong-pw 401 with the new hint / right-pw 200.
  tsc 20 baseline, zero new; build exit 0; sw.js circub-v240.
- STILL BLOCKED OUTSIDE CODE: password-reset EMAILS cannot be delivered on
  prod - RESEND_API_KEY is not set in the Vercel environment (forgot answers
  delivery=unavailable). The owner must add RESEND_API_KEY (+ optionally
  RESEND_FROM) in Vercel -> Settings -> Environment Variables for the
  forgot-password flow to actually send mail; no code can bypass that
  securely.

v240 DELIVERY: commit 677ba5d pushed 715da9e..677ba5d -> origin/main with the
user PAT (tracking ref synced via fetch). Vercel deployed circub-v240 (sw.js
poll, try 7, ~70s). Prod verify task239_prod_verify.py (markers bumped v240):
23/23. NEW task240_prod_signin_e2e.py - REAL browser journey on prod (390x844):
register 201 -> landing-signin-mobile -> modal -> wrong password shows the
"Forgot password?" hint -> correct password shows the "Welcome back" toast ->
zero page errors: 9/9. Sign-in with email+password VERIFIED WORKING on
production. Remaining outside code: RESEND_API_KEY must be added on Vercel for
reset emails; installed APKs need a rebuild to pick up the canonical origin.

## v241 (2026-11-05) - search bar back on the Local feed (user: "have search bar on local post site")

Session note: sandbox recycled a 5th time (/home/z/circub wiped). Re-cloned -
origin HEAD was 571e850 = v240 worklog commit, so v240 was fully pushed; no
re-work needed.

- src/components/social/local-feed-tab.tsx:
  - ONE slim search pill under the Proforma + Post Price action row (testids
    local-search-bar / local-search-input / local-search-clear, Search icon
    left, X clear right, placeholder 'Search prices... try "coffee, Addis
    Ababa"'). The v234 declutter STANDS for everything else: no location/
    category pickers, no All/Shop/Shared segments.
  - the v232 comma contract is unchanged and still driven by the surviving
    state machine: text before the comma filters the item, text after it
    resolves to a city/country pick (parser effect), honest hint when the
    location is unknown.
  - re-added the debounce effect v234 had removed: searchRaw -> 350ms ->
    setSearch (the fetch effects' dependency), so results update live
    without one request per keystroke; Enter searches immediately; X calls
    handleClearSearch (search + chips + AI panels).
- Probe task234_no_filter_bar_probe.py updated to the v241 contract (search
  input present exactly once + new placeholder, all other filter pieces still
  gone, D2 link-back assertion fixed to the v235+ in-page flow) + functional
  checks: garbage search empties the feed, X restores it - mobile + desktop.
  Result 49/49. task239_probe.py (markers -> v241): 30/30. tsc 20 baseline,
  zero new; build exit 0; sw.js circub-v241.
- Screenshots download/task241_search_{mobile,desktop}.png ('coffee' ->
  10 of 20 posts, See All appears).

## v249 (2026-11-09) - the proforma is AI-ONLY: the bare "YOUR SHOPPING LIST" editor and the Find/Compare/Plan tabs are gone
User: "remove this" (+ screenshot of the bare tool: the "YOUR SHOPPING LIST"
title, the Visiting from/to date pickers, the "Add your own item" box with
+ Add, and the Find / Compare / Plan tab bar with the empty-list hint).

- REMOVED (compass-price-tools.tsx): the whole bare tool UI is GONE - the
  shopping-list title row + visiting date pickers, the recap chips row +
  custom-item input, the Find / Compare / Plan tab bar, the empty-list
  hint, and all three tab panels (Research post rows, the Compare table
  with its typed columns, the Plan quantities/budget/currency form). The
  dead code went with them: tab state + TABS, the list editor helpers, the
  compare-column state, itemFilter/showAll, placeDraft/applyPlace, the
  GPS "Use my location" block, currencyDraft/applyCurrency, qty inputs
  (items count as 1), agoDays/cheapClass and their consts.
- THE CONVERSATION IS THE WHOLE PROFORMA: the panel is now the v246-v248
  AI conversation and nothing else. When the conversation completes (or is
  X-dismissed), its answers BECOME the results: a v249 results card that
  restates the four answers (WHERE / List / WHEN / BUDGET, each with an
  Edit button that re-opens EXACTLY that question via reopenAt) followed
  by the real numbers the tabs used to show - the totals trio + range bar
  + month trend, the mover tip, the safe amount + per-day + budget
  verdict, the budget locator with the ranked Most-liked place list and
  the "Shop at X instead" switch, and "Same list, other locations". An
  empty list (last recap chip removed, or dismissed before answering)
  collapses to one "Plan my shopping with AI" pill that restarts the
  conversation. testids: proforma-results, proforma-reopen,
  proforma-edit-where/items/when/budget, ai-results-nodata; compass-list-
  chip/-remove live on as the recap chips; all stat/locator/trend testids
  survive. Every number still comes from real /api/local-prices posts.
- VERIFY: tsc 20 baseline (zero new); clean build (rm -rf .next) exit 0;
  :3100 - new task249_proforma_only_probe 23/23 (editor/tabs absent during
  AND after the conversation, recap from..to span, Edit re-opens WHEN,
  last-chip remove -> reopen pill, dismiss -> pill), task246 rewritten
  section 2 46/46, task248_ui 19/19, task245 17/17, task247 22/22,
  task239 30/30 (markers -> v249); task249_shots screenshots confirm the
  results card on a 390px phone. sw.js circub-v249.

## v248 (2026-11-08) - bounties claimed by MANY users, all takers visible in the poster's escort desk, proforma WHERE gets a location input
User: "make the bounty to be clamed by many users and show that to the poster on the my escort
place and make the proform like this and make input for location" (+ screenshot of the
"Let's build your proforma" WHERE card).

- MANY TAKERS (`prisma/schema.prisma` + `schema.postgres.prisma`, `QuestClaim`): the
  single-winner `@@unique([questId])` is replaced by `@@unique([questId, userId])` +
  `@@index([questId])` - a bounty can be claimed by MANY users (one row per taker; a member may
  claim the same quest only once, DB-enforced across serverless concurrency; guests are guarded
  app-side by name+contact echo).
- CLAIM API (`api/quests/[id]/claim`): POST allows unlimited distinct takers and returns
  `claimCount`; duplicate member/guest claims get 409. DELETE removes ONE claim: the poster
  removes a specific applicant by `claimId` (no claimId -> oldest, back-compat), the claimer
  drops their own, guests echo name+contact - other takers are never touched.
- LIST + MINE (`api/quests`, `api/quests/mine`): the public list adds `claimCount` (never names
  or contacts); `mine` returns EVERY taker in full (`claims[]`, legacy `claim` = first) - the
  poster-only applicant inbox.
- BOARD (`live-zone-tab.tsx`): claiming STAYS OPEN - the Claim Bounty button and rail bolt remain
  for anyone who has not claimed; the claimed block reads "N hustlers claimed this" (your own
  claim still says "You claimed this"), the escrow badge reads "N takers . In Escrow", posters get
  "see every taker with their contact in Profile -> Bounties" (the board's per-card Remove
  claimer moved to the profile inbox).
- MY ESCORT PLACE (`profile-tab.tsx`): Profile > Bounties lists EVERY claimant with name,
  contact, @username and when - each with its own Remove applicant button (one taker out, the
  rest stay); the row badge shows the taker count ("2 takers" / "Open"); an "escort desk"
  subtitle explains the inbox; edit stays locked while takers exist.
- PROFORMA LOCATION INPUT (`compass-price-tools.tsx`): the WHERE step keeps the suggestion chips
  + "Somewhere else - keep going ->" from the screenshot and adds a real input (ask-where-input +
  Use-this-place button): known community places snap onto their canonical key so real stats
  light up, anything else is kept as typed - the tools never invent numbers.
- VERIFY: tsc baseline 20 (zero new); clean build exit 0; :3100 - task239 30/30, task246 37/37,
  new task248_multi_claim_probe 15/15 (2 distinct takers, claimCount, no PII leak, dup 409,
  per-claim drop), new task248_ui_probe 19/19 (typed location advances the conversation, board
  taker wording, escort desk inbox + remove). sw.js circub-v248.

## v247 (2026-11-08) - composer becomes ONLY the AI proforma, category only, unit while entering price
User: "remove this" (Coffee Set / Habesha Dress / Airport Ride / Meal / More chip row) + "remove this
make it catagory only and add unit while entering price and make the profoma like only the ai and
make the locaion input remove the rest".

- COMPOSER = AI CONVERSATION (`create-price-post-modal.tsx`): the form wall is gone. The posting
  flow is now one chat transcript with a Sparkles avatar asking ONE question at a time:
  1 WHERE (one plain "City, Country" input) -> 2 WHAT (item name + product/service + category) ->
  3 PRICE (paid price, with "+ Edit ask" for the initial asking price) -> 4 review card with the
  photo, story toggle, optional details (description, price list paste, pack/unit, tip, shop
  owner, contacts) and the Drop button. Each answered question stays in the transcript with an
  Edit button that reopens that question; camera-search prefill lands directly on the review card
  (or the first unanswered question); a restored draft lands on the first gap. All testids from
  the old flow survive (composer-back, composer-location-input, photo-drop, currency-*, price-list-*
  , owns-shop-*, also-story-*, composer-publish...); new ai-proforma / ai-ask-{where,what,price} /
  ai-answer-{where,what,price} / ai-review testids carry the probes.
- REMOVE (user: "remove this" x2): the QUICK_CHIPS row (Coffee Set / Habesha Dress / Airport Ride /
  Meal / More) is deleted together with its showAllCats state; the GpsCapture block and the GPS
  badge are gone from the flow; the neighborhood/market inputs are gone (the API columns still
  ride the payload, empty). The "make it category only" ask is the next line.
- CATEGORY ONLY (`category-select.tsx`): the v246 creative section (7 icon tiles over subcategory
  chips) is replaced by ONE flat wrap of all 31 canonical categories as chips (selected = filled
  pill). Stored values, legacy aliases and the compare tables are untouched; historic testids
  survive (category-section, category-select), chips carry category-chip. All four modals that
  render the picker get the same flat list.
- UNIT WHILE ENTERING PRICE: the paid-price input now shows the currency unit right beside the
  number, live (composer-price-unit pill, ETB by default); the ETB/USD/... segmented switch still
  swaps the unit, and the full 23-currency select stays behind the ... pill.
- DATE NOTE: LocalPricePost has no user-facing date column, so the composer conversation asks
  where / what / price only - dates stay where they really exist: bounty deadlines (optional
  since v245) and the Compass proforma visit dates (v246). Nothing is fabricated into free text.
- Probes: new task247_composer_ai_probe.py 22/22 (conversation end-to-end incl. a REAL publish on
  :3100 + API cleanup + zero page errors); task246_proforma_search_probe.py section 3 rewritten
  for the composer (37/37); task245_bounty_ui_probe.py sections 1-2 updated to the v246 icon-only
  search contract (17/17); task239_probe.py 30/30 (markers -> v247). tsc 20 baseline, zero new;
  clean build exit 0; sw.js circub-v247.

## v246 (2026-11-08) - creative category section, proforma asks like AI, icon-only search everywhere
User: "have creative catagory sessesion and have unit forfor the make the proforma like ai asking
location items date and budget with list and make all the search only icon not a bar everywhere"
(+ screenshot of the Services / Other category dropdowns).

- CREATIVE CATEGORY SECTION (`lib/categories.ts` + `category-select.tsx`):
  CATEGORY_GROUP_ICONS (one emoji per main: Food / Drug & Health /
  Materials / Wearables / Property / Electronics / Services) and the two
  stacked dropdowns are GONE. The picker is now a section: 7 emoji icon TILES
  (tap to switch main, `category-main-tile`) over a wrap of SUB CHIPS
  (`category-sub-chip`). Stored value, aliases, filters and compare tables
  unchanged (canonical sub string); historic testids survive
  (category-select-main / category-select). All four call sites get the new
  look for free: create/edit price post modals, add product, bulk post.
- PROFORMA ASKS LIKE AI (`compass-price-tools.tsx`): the panel OPENS as a
  guided conversation instead of a bare three-tab tool. Four one-tap
  questions, each answered from a LIST of REAL data: (1) WHERE - chips of
  the busiest community places; (2) WHAT - chips of the most-posted
  products + a typed "own item" box; (3) WHEN - Today / This week /
  Next week / This month / Just researching, each chip writes a real
  visit from/to date pair; (4) BUDGET - Typical and Safe chips derived
  from the user's own list totals + a free amount box. Answers land in
  the SAME state the Find / Compare / Plan tabs read (myPlace, onItems /
  customItems, visitFrom/To, budget); finishing with a budget drops you
  on the Plan tab, without on Find. Step dots + X dismiss; nothing is
  mocked. testids: proforma-ask, ask-step-where/items/when/budget,
  ask-where-chip, ask-item-chip/-input/-add/-items-next, ask-when-chip,
  ask-when-skip, ask-budget-typical/-safe/-input/-apply/-skip,
  ask-dismiss.
- ICON-ONLY SEARCH EVERYWHERE (user: "make all the search only icon not a
  bar everywhere"): every live search surface collapses to ONE round icon
  that expands the field in the normal page flow (never covers the nav
  bars); the icon turns into the X that collapses it, and a set filter
  keeps a small dot on the icon so it is never invisible.
  - local-feed-tab: icon joins the slim action row
    (local-search-toggle), field expands under it (local-search-bar /
    local-search-input / local-search-clear testids kept, Enter +
    "item, city" comma contract unchanged).
  - live-zone-tab bounties: pill collapses to bounty-search-toggle,
    expands to bounty-search-pill (bounty-search-input + bounty-tier-chip
    inside); the Post pill keeps its seat on the row.
  - live-zone-tab talents: pill collapses to talent-search-toggle beside
    the AI Match / Available / Near me toggles (they are not search, they
    stay visible); expanded pill keeps talent-search-input + lane-chip.
  - network-tab (Profile > Network): network-search-toggle expands to
    network-search-bar (network-search-input).
  - main-content.tsx also has a search input but the component is dead
    code (imported nowhere) - left untouched.
- PROBE (scripts/task246_proforma_search_probe.py, new): real-browser run
  on :3100 - local icon expand/filter/collapse, proforma 4-question flow
  end-to-end (typed item lands on the shopping list, Plan tab opens,
  visit date set), category tiles 7 + Services 7 chips -> Food 4 chips,
  bounty icon expand + hunter tier chip + collapse, talent icon expand +
  scout lane chip, network icon expand: 33/33, zero page errors.
- Gates: npx tsc --noEmit 20 baseline, zero new; clean rebuild (rm -rf
  .next) exit 0; task239_probe.py 30/30 (markers v245 -> v246); mobile
  screenshots of ask unit, category section and expanded search look
  clean; sw.js circub-v246.

## v245 (2026-11-08) - Link tab: tier pills moved into a bounty search bar, full-size quest form, deadline optional
User: "remove this form the link and while posting bounties make the form to take more full
space and have a back button but don't cover the nav bars and don't make the deadline madatory
put those on the search part and" (+ screenshot of the All bounties / Hunter / Helper / Scout /
+ Post pill row).

- TIER PILL ROW GONE -> ONE SEARCH BAR (live-zone-tab.tsx): the v227 pill row
  (All bounties / Hunter / Helper / Scout + Post) is REPLACED by a bounty
  search bar, the same v231 one-search-bar pattern as the talent feed. The
  input matches title / details / location AND the tier keywords hunter /
  helper / scout ("all" resets); the active tier shows as a removable chip
  inside the pill. Tier state is now DERIVED from the search text
  (parseBountyTierSearch; bountyTier useState removed). The bar sits ABOVE
  the loading/empty checks so the Post pill stays reachable even on an
  empty board (the card-rail + only exists on real cards). testids:
  bounty-search-bar / bounty-search-input / bounty-tier-chip;
  bounty-post-link keeps its seat at the right end of the pill.
- QUEST FORM TAKES THE FULL BOARD: was a slim max-h-[46dvh] sheet squeezed
  above the deck. While it is open the deck hides and the form becomes
  flex-1 min-h-0 inside the tab's normal page flow - it fills everything
  between the Link topbar and the mobile dock, and NEVER covers the nav
  bars (in-page, not fixed). Details textarea 2 -> 4 rows. A labeled
  "Back" pill (ArrowLeft + Back, testid quest-form-close kept) replaces
  the bare X close.
- DEADLINE OPTIONAL: client validation only requires location now
  ("Location is required so helpers know where to go"); placeholder says
  "optional". POST /api/quests no longer 400s on empty deadlineText (stored
  as '', schema column stays non-nullable); PATCH allows clearing it. The
  card's amber deadline chip renders only when deadlineText is non-empty.
- PROBE (scripts/task245_bounty_ui_probe.py, new): real-browser run on
  :3100 - pill row gone, search bar + tier chip + deck slicing, form
  height > 55dvh + Back + dock visible + form bottom above dock top,
  guest-account post with EMPTY deadline succeeds, card shows no deadline
  chip, delete cleans up, zero page errors: 17/17.
- Gates: npx tsc --noEmit 20 baseline, zero new; clean rebuild (rm -rf
  .next) exit 0; task239_probe.py 30/30 (markers v244 -> v245); API
  round-trip verified empty-deadline store + delete; sw.js circub-v245.

## v244 (2026-11-07) - mobile loading speed pass: cached-first opens, no wasted round trips
User: "the loading is lagging fix it to be fast specialy on the phone".

- SW NAVIGATIONS -> STALE-WHILE-REVALIDATE (public/sw.js): was NETWORK-FIRST,
  so EVERY PWA / Android-WebView open waited a full serverless round trip
  (RTT + possible cold start) before the first pixel - the #1 repeat-open lag
  source. A cached page now paints INSTANTLY and the network response
  refreshes the cache in the background (event.waitUntil). First visit is
  unchanged (no cache -> network; offline -> cached shell). Build skew stays
  self-healing: pwa-register reloads once when a new worker claims the tab
  (controllerchange -> GET_VERSION handshake), and refreshStaleClients()
  still force-navigates tabs too old to answer pings.
- COLD-START HTML: src/app/page.tsx lazy-imports @/lib/db INSIDE
  generateMetadata (only when ?post=<id> is present). The top-level import
  instantiated PrismaClient and spawned its query engine on EVERY cold start
  of `/` even though plain visits run zero queries; now only share-link
  crawls pay for the DB, plain opens skip Prisma entirely.
- LOCAL FEED (local-feed-tab.tsx): (1) dropped its duplicate /api/auth/me
  round trip - the viewer id now comes synchronously from the
  'circubAwd.me.v1' localStorage cache home-client already revalidates every
  load; network fallback only when the cache is empty (first visit / guest).
  (2) The first posts window is painted from localStorage
  ('circubAwd.localfeed.v1:<filters>') BEFORE the network answers - real
  posts in ~0ms on repeat opens, fresh window revalidates in background.
  Fresh loads (publish / poster-tap) skip the read; empty/error bodies are
  never cached; a failed revalidate no longer wipes an already-painted list.
- RIGHT SIDEBAR (right-sidebar.tsx): the aside is hidden lg:block - on
  phones it was INVISIBLE yet still fired /api/suggested + /api/trending +
  /api/recent-local-prices on every open. The three fetches now wait for
  the lg breakpoint (matchMedia listener) and only fire when the sidebar
  can actually be seen.
- Net effect per phone open: HTML paints from cache instead of waiting the
  serverless RTT; 2 fewer API round trips before feed paint (auth/me dup +
  3 sidebar calls); feed shows real posts from the paint cache instantly.
- Gates: npx tsc --noEmit 20 baseline, zero new; clean rebuild (rm -rf
  .next) exit 0; task239_probe.py 30/30 on :3100 (probe's landing-version
  assertion updated v243 -> v244); sw.js circub-v244.

## v242 (2026-11-05) - feed APIs get the same transient-DB resilience as auth (v241 follow-up)

The v241 prod search check exposed it: GET /api/local-prices answered
{"error":"Failed"} 500 five times in a row on prod (while register with its
v240 withDbRetry succeeded) - a transient serverless-DB blip on the endpoint
the client silently papers over by keeping stale posts. The auth routes got
withDbRetry in v240; the FEED endpoints had not:
- GET /api/local-prices: main findMany under withDbRetry (the Local feed -
  the exact page the user is working in).
- GET /api/posts: community feed findMany under withDbRetry.
- GET /api/landing-stats: the three counts under withDbRetry (fallback
  zeros stay).
- sw.js circub-v242; app-version v242; tsc 20 baseline; build exit 0;
  task239_probe.py 30/30; task234_no_filter_bar_probe.py 49/49.
Prod gate: task239_prod_verify.py 23/23 + task241_prod_search_check.py
(with one reload-retry across documented DB flips).

## v243 (2026-11-05) - serverless Postgres connection cap (the recurring "DB flip" window, root-cause mitigation)

During the v242 prod gates the DB entered ANOTHER sustained 500 window
(register 500 x8 - even WITH its v240 withDbRetry). Pattern matches
connection exhaustion: every warm Vercel instance holds its own Prisma pool
and db.ts never capped it. v243: PrismaClient now builds its datasource URL
through withServerlessPool() - Postgres URLs get connection_limit=5 +
pool_timeout=20 appended (unless already present); SQLite untouched. With 20
warm instances the worst case is 100 connections instead of unbounded. THE
REAL fix remains a Vercel env change: point DATABASE_URL at the provider's
POOLED endpoint (Neon -pooler host / port 6543). tsc 20 baseline; build exit
0; task239_probe.py 30/30; sw.js circub-v243.

v242+v243 DELIVERY: f48ff7b + (v243 commit) pushed through GitHub-side hiccups
(Internal Server Error rejections; empty-commit retrigger needed once before
the v242 deploy fired). Prod gates on v243: task239_prod_verify.py 23/23 +
task241_prod_search_check.py 9/9 (one documented DB flip crossed via the
journey-redo; the withDbRetry + connection cap kept the app usable
throughout). The Local feed search bar is LIVE on production.

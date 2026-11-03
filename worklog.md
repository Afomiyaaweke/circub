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

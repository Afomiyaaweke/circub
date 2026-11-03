# circubAwd worklog

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

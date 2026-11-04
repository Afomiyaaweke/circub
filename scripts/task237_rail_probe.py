#!/usr/bin/env python3
"""Task 237 local E2E: bounty/talent cards - icons never overlap text,
mobile-first layout, one task per full screen with true snap swiping (v237).

Checks (mobile 390x844 + desktop 1440x900):
 A. Link tab -> bounty deck renders; snap-y mandatory; slides snap-stop always
 B. every slide is exactly one deck-screen tall (full-screen card)
 C. NO text element intersects the action rail (flex sibling, never overlay)
 D. rail buttons 40px on phones / 44px on desktop; card is a flex ROW
    (rail sibling of the content column, not absolutely stacked)
 E. mouse-wheel swipe advances exactly ONE slide (snap mandatory, no glide)
 F. talent feed: same no-overlap + full-screen checks
 G. sw.js serves circub-v237; zero console errors
"""
import json
import time
import urllib.request

from playwright.sync_api import sync_playwright

BASE = "http://localhost:3100"
SHOTS = "/home/z/my-project/download"
PASSWORD = "probe237pass"
results = []


def check(name, cond, extra=""):
    results.append((name, bool(cond), extra))
    print(("PASS" if cond else "FAIL") + f" - {name}" + (f" ({extra})" if extra else ""))


NO_OVERLAP_JS = """
(x) => {
  const rail = document.querySelector(x.railSel);
  const card = rail ? rail.closest(x.cardSel) : null;
  if (!rail || !card) return { ok: false, why: 'rail or card missing' };
  const rr = rail.getBoundingClientRect();
  const bad = [];
  for (const el of card.querySelectorAll('*')) {
    if (rail.contains(el)) continue;
    const hasText = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    if (!hasText) continue;
    const r = el.getBoundingClientRect();
    const ox = Math.min(r.right, rr.right) - Math.max(r.left, rr.left);
    const oy = Math.min(r.bottom, rr.bottom) - Math.max(r.top, rr.top);
    if (ox > 2 && oy > 2) bad.push(el.textContent.trim().slice(0, 40));
  }
  const inner = rail.parentElement;
  const content = rail.previousElementSibling;
  return {
    ok: bad.length === 0,
    bad: bad.slice(0, 4),
    flexRow: getComputedStyle(inner).display === 'flex',
    contentRight: content ? Math.round(content.getBoundingClientRect().right) : null,
    railLeft: Math.round(rr.left),
    railBtnW: rail.querySelector('button') ? rail.querySelector('button').getBoundingClientRect().width : null,
  };
}
"""

FULLSCREEN_JS = """
(x) => {
  const deck = document.querySelector(x.deckSel);
  if (!deck) return { ok: false, why: 'deck missing' };
  const card = deck.querySelector(x.cardSel);
  if (!card) return { ok: false, why: 'card missing' };
  const cs = getComputedStyle(deck);
  const slide = getComputedStyle(card);
  const dr = deck.getBoundingClientRect();
  const cr = card.getBoundingClientRect();
  return {
    ok: Math.abs(cr.height - dr.height) <= 2,
    deckH: Math.round(dr.height),
    cardH: Math.round(cr.height),
    snapType: cs.scrollSnapType,
    snapStop: slide.scrollSnapStop,
    vh: window.innerHeight,
  };
}
"""


def api_register(email):
    uname = "p237" + str(int(time.time()))[-8:]
    req = urllib.request.Request(
        BASE + "/api/auth/register",
        data=json.dumps({"accountType": "PERSONAL", "name": "Probe 237", "username": uname,
                         "email": email, "password": PASSWORD,
                         "acceptedTerms": True}).encode(),
        headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status
    except urllib.error.HTTPError as e:
        print("register body:", e.read().decode()[:200])
        return e.code


def ui_login(page, email):
    # mobile landing: the visible entry is "Already have an account? Sign in"
    # (the header landing-signin button is desktop-only and hidden on phones)
    cand = [
        'button:has-text("Already have an account? Sign in")',
        '[data-testid="landing-signin"]',
        'button:has-text("Sign in")',
    ]
    clicked = False
    for sel in cand:
        loc = page.locator(sel)
        for i in range(loc.count()):
            if loc.nth(i).is_visible():
                loc.nth(i).click()
                clicked = True
                break
        if clicked:
            break
    if not clicked:
        page.evaluate("[...document.querySelectorAll('button')].find(b => /sign in/i.test(b.textContent))?.click()")
    page.wait_for_timeout(1500)
    dlg = page.locator("[role=dialog]").last
    # the login modal email field is type=text (no type=email) - fill the
    # first non-password input with the email, the password one with the pwd
    email_input = dlg.locator('input:not([type="password"])').first
    email_input.fill(email)
    dlg.locator('input[type="password"]').first.fill(PASSWORD)
    page.wait_for_timeout(400)
    dlg.locator('button:has-text("Sign in")').last.click()
    page.wait_for_timeout(5000)


def open_link_tab(page):
    try:
        page.click('[data-testid="nav-tab-guides"]', timeout=4000)
    except Exception:
        page.click('[data-testid="nav-pill-guides"]', timeout=4000)
    page.wait_for_timeout(2500)


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()

        # ---------------- MOBILE 390x844 ----------------
        ctx = browser.new_context(viewport={"width": 390, "height": 844},
                                  has_touch=True, device_scale_factor=1)
        page = ctx.new_page()
        errors = []
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.goto(BASE, wait_until="domcontentloaded")
        page.wait_for_timeout(4500)
        page.evaluate("document.querySelectorAll('nextjs-portal').forEach(e => e.remove())")

        # fresh account (deterministic login), then open the Link tab
        email = f"probe237_{int(time.time())}@probe.circub.test"
        st = api_register(email)
        check("A0 register fresh probe user", st in (200, 201), f"status={st}")
        ui_login(page, email)
        open_link_tab(page)

        deck = page.locator('[data-testid="bounty-swipe"]')
        check("A1 bounty deck visible", deck.count() > 0 and deck.is_visible())

        # sw version served
        sw = page.request.get(BASE + "/sw.js").text()
        check("G1 sw.js circub-v237", "circub-v237" in sw)

        fs = page.evaluate(FULLSCREEN_JS, {"deckSel": '[data-testid="bounty-swipe"]', "cardSel": '[data-testid="bounty-card"]'})
        check("B1 card = full deck screen", fs.get("ok"), f"deckH={fs.get('deckH')} cardH={fs.get('cardH')}")
        check("B2 deck fills most of viewport", fs.get("deckH", 0) >= 0.6 * fs.get("vh", 1),
              f"deckH={fs.get('deckH')} vh={fs.get('vh')}")
        check("A2 snap-y mandatory", "mandatory" in (fs.get("snapType") or ""), fs.get("snapType"))
        check("A3 snap-stop always (one per swipe)", fs.get("snapStop") == "always", str(fs.get("snapStop")))

        no = page.evaluate(NO_OVERLAP_JS, {"railSel": '[data-testid="bounty-action-rail"]', "cardSel": '[data-testid="bounty-card"]'})
        check("C1 bounty: zero text under rail", no.get("ok"), f"bad={no.get('bad')}")
        check("D1 bounty: rail is flex sibling row", no.get("flexRow") is True)
        check("D2 bounty: rail right of content column",
              no.get("railLeft", 0) >= (no.get("contentRight") or 9e9) - 1,
              f"contentRight={no.get('contentRight')} railLeft={no.get('railLeft')}")
        check("D3 bounty: rail button 40px on phone",
              abs((no.get("railBtnW") or 0) - 40) <= 1, f"w={no.get('railBtnW')}")

        # wheel swipe -> exactly one slide
        top0 = page.evaluate("document.querySelector('[data-testid=\"bounty-swipe\"]').scrollTop")
        page.locator('[data-testid="bounty-swipe-hint"]').first.hover()
        page.mouse.wheel(0, 900)
        page.wait_for_timeout(1300)
        swipe = page.evaluate("""() => {
          const d = document.querySelector('[data-testid="bounty-swipe"]');
          const cards = d.querySelectorAll('[data-testid="bounty-card"]');
          const second = cards[1] ? cards[1].offsetTop : null;
          return { top: d.scrollTop, second, h: d.clientHeight };
        }""")
        landed_on_two = swipe["second"] is not None and abs(swipe["top"] - swipe["second"]) <= 60
        check("E1 wheel swipe lands exactly on slide 2", landed_on_two,
              f"top={swipe['top']} second={swipe['second']} h={swipe['h']} start={top0}")
        page.screenshot(path=f"{SHOTS}/task237_bounty_mobile.png")

        # ---------------- TALENT FEED ----------------
        page.click('[data-testid="feed-tab-talents"]')
        page.wait_for_timeout(1200)
        try:
            page.wait_for_selector('[data-testid="talent-swipe"]', timeout=12000)
        except Exception:
            pass
        page.wait_for_timeout(1500)
        tfs = page.evaluate(FULLSCREEN_JS, {"deckSel": '[data-testid="talent-swipe"]', "cardSel": '[data-testid="talent-card"]'})
        check("F1 talent card = full deck screen", tfs.get("ok"),
              f"deckH={tfs.get('deckH')} cardH={tfs.get('cardH')}")
        tno = page.evaluate(NO_OVERLAP_JS, {"railSel": '[data-testid="talent-action-rail"]', "cardSel": '[data-testid="talent-card"]'})
        check("F2 talent: zero text under rail", tno.get("ok"), f"bad={tno.get('bad')}")
        check("F3 talent: rail right of content column",
              tno.get("railLeft", 0) >= (tno.get("contentRight") or 9e9) - 1,
              f"contentRight={tno.get('contentRight')} railLeft={tno.get('railLeft')}")
        check("F4 talent: rail button 40px on phone",
              abs((tno.get("railBtnW") or 0) - 40) <= 1, f"w={tno.get('railBtnW')}")
        page.screenshot(path=f"{SHOTS}/task237_talent_mobile.png")
        ctx.close()

        # ---------------- DESKTOP 1440x900 ----------------
        ctx2 = browser.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=1)
        page2 = ctx2.new_page()
        page2.goto(BASE, wait_until="domcontentloaded")
        page2.wait_for_timeout(4000)
        page2.evaluate("document.querySelectorAll('nextjs-portal').forEach(e => e.remove())")
        email2 = f"probe237d_{int(time.time())}@probe.circub.test"
        st2 = api_register(email2)
        check("D0 register desktop probe user", st2 in (200, 201), f"status={st2}")
        ui_login(page2, email2)
        page2.wait_for_timeout(1500)
        try:
            page2.click('[data-testid="nav-pill-guides"]', timeout=5000)
        except Exception:
            page2.click('[data-testid="nav-tab-guides"]', timeout=5000)
        page2.wait_for_timeout(2500)
        dno = page2.evaluate(NO_OVERLAP_JS, {"railSel": '[data-testid="bounty-action-rail"]', "cardSel": '[data-testid="bounty-card"]'})
        check("D4 desktop: zero text under rail", dno.get("ok"), f"bad={dno.get('bad')}")
        check("D5 desktop: rail button 44px",
              abs((dno.get("railBtnW") or 0) - 44) <= 1, f"w={dno.get('railBtnW')}")
        dbox = page2.evaluate("""() => {
          const rail = document.querySelector('[data-testid="bounty-action-rail"]');
          const col = rail.parentElement;            // centered max-w-560 column
          const slide = col.parentElement;           // full-width deck slide
          const cr = col.getBoundingClientRect();
          const sr = slide.getBoundingClientRect();
          return { w: Math.round(cr.width),
                   off: Math.abs((cr.left + cr.width/2) - (sr.left + sr.width/2)) };
        }""")
        check("D6 desktop: centered 560px column in its container",
              dbox["w"] <= 562 and dbox["off"] <= 2, str(dbox))
        page2.screenshot(path=f"{SHOTS}/task237_bounty_desktop.png")
        ctx2.close()

        real_errors = [e for e in errors
                       if "favicon" not in e and "manifest" not in e
                       and "_vercel/insights" not in e
                       and "401" not in e and "Failed to load resource" not in e]
        check("G2 zero console errors", len(real_errors) == 0, f"n={len(real_errors)} {real_errors[:2]}")

        browser.close()

    total = len(results)
    passed = sum(1 for _, ok, _ in results if ok)
    print(f"\nRESULT: {passed}/{total} checks passed")
    if passed != total:
        for name, ok, extra in results:
            if not ok:
                print(f"  FAILED: {name} {extra}")
    raise SystemExit(0 if passed == total else 1)


if __name__ == "__main__":
    main()

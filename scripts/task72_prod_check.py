#!/usr/bin/env python3
"""Task 72 prod E2E: 'Plan my budget' as a direct camera-search entry (v55).

A: /api/budget sanity
U: camera menu -> Plan my budget -> typed item + picked place -> budget
   rendered WITHOUT any scan; qty + verdict branches; scan-result planner
   still auto-opens (v54 regression check); dark; mobile 375x812
"""
import json
import subprocess
import sys
import urllib.request

from playwright.sync_api import sync_playwright

BASE = "https://circub.vercel.app"
EMAIL = "sarah_mitchell@seed.circub.test"
PASSWORD = "seed-account-no-login-2026"
SHOTS = "/home/z/my-project/download"
Y4M = "/home/z/my-project/task70_fake_cam.y4m"

results = []


def check(name, cond, extra=""):
    results.append((name, bool(cond), extra))
    print(("PASS" if cond else "FAIL") + f" - {name}" + (f" ({extra})" if extra else ""))


def api_post(path, payload, timeout=90):
    req = urllib.request.Request(
        BASE + path,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, dict(r.headers), json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), json.loads(e.read().decode() or "{}")


def fmt_like_app(n, cur):
    locale = "en-ET" if cur == "ETB" else "en-US"
    out = subprocess.run(
        ["node", "-e",
         f"console.log(new Intl.NumberFormat('{locale}',{{style:'currency',currency:'{cur}',maximumFractionDigits:2}}).format({n}))"],
        capture_output=True, text=True,
    )
    return out.stdout.strip()


def login(page):
    page.goto(BASE, wait_until="domcontentloaded")
    page.wait_for_timeout(4000)
    page.evaluate("document.querySelectorAll('nextjs-portal').forEach(e => e.remove())")
    page.click('button:has-text("Sign in")')
    page.wait_for_timeout(1500)
    dlg = page.locator("[role=dialog]").last
    dlg.locator('input[type="email"], input[name="email"], #email').first.fill(EMAIL)
    dlg.locator('input[type="password"], input[name="password"], #password').first.fill(PASSWORD)
    native = dlg.locator('input[type="checkbox"]')
    for i in range(native.count()):
        cb = native.nth(i)
        if not cb.is_checked():
            try:
                cb.check(force=True)
            except Exception:
                cb.dispatch_event("click")
            page.wait_for_timeout(200)
    page.wait_for_timeout(500)
    dlg.locator('button:has-text("Sign in")').last.click()
    page.wait_for_timeout(5000)


LOC = {"city": "Addis Ababa", "country": "Ethiopia", "countryCode": "ET"}


def budget_payload(item, qty, have, hint=None):
    return {
        "itemName": item,
        "location": LOC,
        "quantity": qty,
        "availableBudget": have,
        "aiHint": hint,
    }


def open_budget_panel(page, label):
    """Open the camera menu and click 'Plan my budget'."""
    menu_btn = page.locator('button[title^="Search by photo"]:visible').first
    menu_btn.scroll_into_view_if_needed()
    menu_btn.click()
    page.wait_for_timeout(700)
    item = page.locator('[data-testid="menu-plan-budget"]').first
    check(f"{label}: menu shows 'Plan my budget'", item.is_visible())
    item.click()
    page.wait_for_selector('[data-testid="budget-panel"]', timeout=15000)
    check(f"{label}: budget panel opens", True)


def main():
    # A: API sanity (standalone, no scan hint)
    st, _, d = api_post("/api/budget", budget_payload("wireless headphones", 1, None))
    check("A1: standalone /api/budget 200 + recommended > 0", st == 200 and d.get("total", {}).get("recommended", 0) > 0, f"source={d.get('source')} currency={d.get('currency')}")

    with sync_playwright() as p:
        browser = p.chromium.launch(args=[
            "--no-sandbox",
            "--use-fake-ui-for-media-stream",
            "--use-fake-device-for-media-stream",
            f"--use-file-for-fake-video-capture={Y4M}",
        ])
        ctx = browser.new_context(viewport={"width": 1280, "height": 900})
        page = ctx.new_page()
        page.set_default_timeout(60000)
        login(page)

        # U1: camera menu -> Plan my budget -> typed item -> budget, NO SCAN
        open_budget_panel(page, "U1")
        page.locator('[data-testid="budget-panel-item"]').fill("wireless headphones")
        # pick the place: country via Select (tolerant), city typed (typed wins)
        try:
            page.locator('[data-testid="budget-panel"]').locator("button[role='combobox']").first.click()
            page.wait_for_timeout(500)
            opt = page.locator("[role='option']", has_text="Ethiopia").first
            if opt.count() > 0:
                opt.click()
                page.wait_for_timeout(300)
            else:
                page.keyboard.press("Escape")
        except Exception:
            pass
        page.locator('[data-testid="budget-panel-city"]').fill("Addis Ababa")
        place = page.locator('[data-testid="budget-panel-place"]').inner_text()
        check("U1: place label shows Addis Ababa", "Addis Ababa" in place, place)
        page.locator('[data-testid="budget-panel-calc"]').click()
        page.wait_for_selector('[data-testid="budget-recommended"]', timeout=90000)
        check("U1: budget rendered WITHOUT any scan", True)
        page.screenshot(path=f"{SHOTS}/task72-prod-panel-budget.png")

        st, _, data = api_post("/api/budget", budget_payload("wireless headphones", 1, None))
        expected = fmt_like_app(data["total"]["recommended"], data["currency"])
        shown = page.locator('[data-testid="budget-recommended"]').inner_text()
        check(f"U1: qty=1 matches API ({expected})", expected.split(".")[0] in shown or expected in shown, shown.strip())

        # U2: qty stepper -> 2, recalc matches API
        page.get_by_label("Increase quantity").first.click()
        page.wait_for_timeout(300)
        qty_txt = page.locator('[data-testid="budget-panel-qty"]').inner_text()
        check("U2: qty = 2", qty_txt.strip() == "2", qty_txt)
        page.locator('[data-testid="budget-panel-calc"]').click()
        page.wait_for_timeout(4000)
        st2, _, data2 = api_post("/api/budget", budget_payload("wireless headphones", 2, None))
        exp2 = fmt_like_app(data2["total"]["recommended"], data2["currency"])
        shown2 = page.locator('[data-testid="budget-recommended"]').inner_text()
        check(f"U2: qty=2 matches API ({exp2})", exp2.split(".")[0] in shown2, shown2.strip())

        # U3: verdict branch - little money -> short
        page.locator('[data-testid="budget-panel-have"]').fill("10")
        page.locator('[data-testid="budget-panel-calc"]').click()
        page.wait_for_selector('[data-testid="budget-verdict"]', timeout=30000)
        stv, _, datav = api_post("/api/budget", budget_payload("wireless headphones", 2, 10))
        v = page.locator('[data-testid="budget-verdict"]').inner_text()
        check("U3: short verdict matches API", datav["verdict"]["state"] == "short" and datav["verdict"]["message"] in v, v.strip()[:60])
        page.screenshot(path=f"{SHOTS}/task72-prod-panel-verdict.png")

        # close the panel
        page.locator('button[aria-label="Close budget planner"]').click()
        page.wait_for_timeout(400)

        # U4: regression - scan-result planner still auto-opens (v54 behavior)
        page.route(
            "**/api/scan",
            lambda route: route.fulfill(status=200, content_type="application/json", body=json.dumps({
                "item": {"name": "Wireless headphones", "brand": "Sonic", "category": "Electronics", "description": "test"},
                "price": {"estimatedLow": 100, "estimatedHigh": 200, "currency": "ETB", "summary": "Test estimate."},
                "sources": [],
                "location": LOC,
                "rawQuery": "wireless headphones price in Addis Ababa Ethiopia",
                "localPrices": [{
                    "id": "t1", "productName": "Wireless headphones", "category": "Electronics",
                    "currency": "ETB", "priceMin": 120, "priceMax": 150,
                    "city": "Addis Ababa", "country": "Ethiopia",
                    "helpfulCount": 3, "authorName": "Local One", "authorVerifiedLocal": True,
                }],
            })),
        )
        scan_btn = page.locator('button[title^="Open PriceLens"]').first
        scan_btn.scroll_into_view_if_needed()
        scan_btn.click()
        page.wait_for_timeout(2500)
        start_btn = page.locator('button:has-text("Start camera")').first
        if start_btn.count() > 0 and start_btn.is_visible():
            start_btn.click()
        page.wait_for_selector("text=Estimated price", timeout=45000)
        planner = page.locator('[data-testid="budget-planner"]').first
        auto_open = planner.locator('[data-testid="budget-calc"]').is_visible()
        page.wait_for_selector('[data-testid="budget-recommended"]', timeout=60000)
        check("U4: scan planner still auto-opens + auto-calcs (v54 intact)", auto_open)
        # close modal: Go back then Escape
        goback = page.locator('button[aria-label="Go back"]').first
        if goback.count() > 0 and goback.is_visible():
            goback.click()
            page.wait_for_timeout(1500)
        page.keyboard.press("Escape")
        page.wait_for_timeout(1000)
        for _ in range(5):
            if page.locator('[data-slot="dialog-overlay"][data-state="open"]').count() == 0:
                break
            page.keyboard.press("Escape")
            page.wait_for_timeout(800)

        # U5: dark mode - panel + shared result render
        toggle = page.locator('button[aria-label="Switch to dark mode"]').first
        if toggle.count() > 0:
            toggle.click()
            page.wait_for_timeout(900)
            is_dark = page.evaluate("document.documentElement.classList.contains('dark')")
            check("U5: dark mode on", is_dark)
            open_budget_panel(page, "U5")
            page.locator('[data-testid="budget-panel-item"]').fill("wireless headphones")
            page.locator('[data-testid="budget-panel-city"]').fill("Addis Ababa")
            page.locator('[data-testid="budget-panel-calc"]').click()
            page.wait_for_selector('[data-testid="budget-recommended"]', timeout=90000)
            check("U5: budget renders in dark", True)
            page.screenshot(path=f"{SHOTS}/task72-prod-dark-budget.png")
            back = page.locator('button[aria-label="Switch to light mode"]').first
            if back.count() > 0:
                back.click(force=True)
                page.wait_for_timeout(600)
        page.close()

        # U6: mobile 375x812 - compact camera menu -> Plan my budget
        ctx_m = browser.new_context(viewport={"width": 375, "height": 812})
        page_m = ctx_m.new_page()
        page_m.set_default_timeout(60000)
        login(page_m)
        open_budget_panel(page_m, "U6")
        page_m.locator('[data-testid="budget-panel-item"]').fill("wireless headphones")
        try:
            page_m.locator('[data-testid="budget-panel"]').locator("button[role='combobox']").first.click()
            page_m.wait_for_timeout(700)
            opt = page_m.locator("[role='option']", has_text="Ethiopia").first
            if opt.count() > 0:
                opt.click()
                page_m.wait_for_timeout(300)
            else:
                page_m.keyboard.press("Escape")
        except Exception:
            pass
        page_m.locator('[data-testid="budget-panel-city"]').fill("Addis Ababa")
        page_m.locator('[data-testid="budget-panel-calc"]').click()
        page_m.wait_for_selector('[data-testid="budget-recommended"]', timeout=90000)
        check("U6: zero-scan budget works on 375x812", True)
        page_m.screenshot(path=f"{SHOTS}/task72-prod-mobile-budget.png")
        page_m.close()
        browser.close()

    print("\n=== SUMMARY ===")
    fails = [r for r in results if not r[1]]
    print(f"{len(results) - len(fails)}/{len(results)} passed")
    for name, ok, extra in fails:
        print(f"FAILED: {name} {extra}")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()

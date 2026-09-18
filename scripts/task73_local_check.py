#!/usr/bin/env python3
"""Task 73 local E2E: currency picker + multi-item list + place suggestions.

A: /api/budget - legacy single-item compat, items[] list, currency override,
   cache, validation
U: camera menu -> Plan my budget -> TWO items + currency switch -> combined
   budget + per-item lines + 'Where to find these' places; verdict; scan
   planner regression; dark; mobile 375x812
"""
import json
import subprocess
import sys
import urllib.request

from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"
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


def fmt(n, cur):
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
ITEMS = [{"name": "wireless headphones", "quantity": 2}, {"name": "coffee beans", "quantity": 1}]


def open_budget_panel(page, label):
    menu_btn = page.locator('button[title^="Search by photo"]:visible').first
    menu_btn.scroll_into_view_if_needed()
    menu_btn.click()
    page.wait_for_timeout(700)
    item = page.locator('[data-testid="menu-plan-budget"]').first
    check(f"{label}: menu shows 'Plan my budget'", item.is_visible())
    item.click()
    page.wait_for_selector('[data-testid="budget-panel"]', timeout=15000)


def pick_place(page, label):
    # combobox 0 = currency picker (inside the form), combobox 1 = country
    try:
        page.locator('[data-testid="budget-panel"]').locator("button[role='combobox']").nth(1).click()
        page.wait_for_timeout(600)
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
    check(f"{label}: place = Addis Ababa", "Addis Ababa" in place, place)


def main():
    # ---- A: API -------------------------------------------------------------
    st, _, d1 = api_post("/api/budget", {
        "itemName": "wireless headphones", "location": LOC, "quantity": 1,
        "availableBudget": None, "aiHint": None,
    })
    check("A1: legacy single-item shape kept", st == 200 and d1.get("currency") == "ETB" and d1.get("total", {}).get("recommended", 0) > 0 and "lineItems" not in d1, f"source={d1.get('source')}")

    st, _, dl = api_post("/api/budget", {"items": ITEMS, "location": LOC})
    lines = dl.get("lineItems") or []
    check("A2: multi-item returns lineItems x2", st == 200 and len(lines) == 2, f"currency={dl.get('currency')}")
    check("A2: combined >= each line", dl["total"]["recommended"] >= max(li["total"]["recommended"] for li in lines), json.dumps(dl.get("total")))
    etb_rec = dl["total"]["recommended"]

    stv, _, dv = api_post("/api/budget", {"items": ITEMS, "location": LOC, "availableBudget": 100})
    check("A3: list verdict short", dv["verdict"]["state"] == "short", dv["verdict"]["message"][:60])

    stc, _, dc = api_post("/api/budget", {"items": ITEMS, "location": LOC, "currency": "USD"})
    approx = etb_rec / 125
    check("A4: USD override converts", stc == 200 and dc["currency"] == "USD" and dc.get("requestedCurrency") == "USD" and "Converted to USD" in dc["note"], f"{dc['total']['recommended']} vs ~{round(approx)}")
    check("A4: conversion within tolerance (rounding granularity)", abs(dc["total"]["recommended"] - approx) < approx * 0.12, f"{dc['total']['recommended']} vs {approx:.1f}")

    st2, h2, _ = api_post("/api/budget", {"items": ITEMS, "location": LOC, "currency": "USD"})
    check("A5: repeat served from cache", (h2.get("X-Cache") or h2.get("x-cache")) == "hit", str(h2.get("X-Cache") or h2.get("x-cache")))

    stb, _, _ = api_post("/api/budget", {"items": [{"name": "   ", "quantity": 1}], "location": LOC})
    check("A6: blank-only items rejected 400", stb == 400, str(stb))

    # ---- U: UI ---------------------------------------------------------------
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

        open_budget_panel(page, "U1")
        page.locator('[data-testid="budget-panel-item"]').fill("wireless headphones")
        page.get_by_label("Increase quantity 1").first.click()
        page.wait_for_timeout(250)
        qty1 = page.locator('[data-testid="budget-panel-qty"]').inner_text()
        check("U1: item1 qty = 2", qty1.strip() == "2", qty1)
        page.locator('[data-testid="budget-panel-add"]').click()
        page.wait_for_timeout(400)
        rows = page.locator('[data-testid="budget-panel"] input[placeholder*="Another item"]')
        check("U1: second item row appears", rows.count() == 1, f"rows={rows.count()}")
        rows.first.fill("coffee beans")
        pick_place(page, "U1")
        page.locator('[data-testid="budget-panel-calc"]').click()
        page.wait_for_selector('[data-testid="budget-recommended"]', timeout=90000)
        check("U1: combined budget rendered", True)
        line_count = page.locator('[data-testid="budget-line-item"]').count()
        check("U1: per-item lines shown (2)", line_count == 2, f"{line_count}")
        place_count = page.locator('[data-testid="budget-place-item"]').count()
        check("U1: 'Where to find these' places shown", place_count >= 1, f"{place_count}")
        page.screenshot(path=f"{SHOTS}/task73-local-list-etb.png")

        stq, _, dq = api_post("/api/budget", {"items": ITEMS, "location": LOC})
        expected = fmt(dq["total"]["recommended"], dq["currency"])
        shown = page.locator('[data-testid="budget-recommended"]').inner_text()
        check(f"U1: combined matches API ({expected})", expected.split(".")[0] in shown or expected in shown, shown.strip())

        # U2: switch to USD and recalc (combobox 0 = currency picker)
        page.locator('[data-testid="budget-panel"]').locator("button[role='combobox']").nth(0).click()
        page.wait_for_timeout(600)
        usd = page.locator("[role='option']", has_text="US Dollar (USD)").first
        if usd.count() > 0:
            usd.click()
            page.wait_for_timeout(300)
        page.locator('[data-testid="budget-panel-calc"]').click()
        page.wait_for_timeout(4000)
        stu, _, du = api_post("/api/budget", {"items": ITEMS, "location": LOC, "currency": "USD"})
        exp_usd = fmt(du["total"]["recommended"], "USD")
        shown_usd = page.locator('[data-testid="budget-recommended"]').inner_text()
        check(f"U2: USD budget matches API ({exp_usd})", exp_usd.split(".")[0] in shown_usd or exp_usd in shown_usd, shown_usd.strip())
        page.screenshot(path=f"{SHOTS}/task73-local-list-usd.png")

        # U3: short verdict with little money
        page.locator('[data-testid="budget-panel-have"]').fill("10")
        page.locator('[data-testid="budget-panel-calc"]').click()
        page.wait_for_selector('[data-testid="budget-verdict"]', timeout=30000)
        check("U3: short verdict rendered", page.locator('[data-testid="budget-verdict"]').inner_text().strip() != "")
        page.locator('[data-testid="budget-panel-have"]').fill("")
        page.wait_for_timeout(300)

        # U4: scan-result planner regression (v54 behavior intact)
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
        page.wait_for_selector('[data-testid="budget-recommended"]', timeout=60000)
        check("U4: scan planner still auto-opens + auto-calcs", planner.locator('[data-testid="budget-calc"]').is_visible())
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

        # U5: dark mode render of the panel
        toggle = page.locator('button[aria-label="Switch to dark mode"]').first
        if toggle.count() > 0:
            toggle.click()
            page.wait_for_timeout(900)
            check("U5: dark mode on", page.evaluate("document.documentElement.classList.contains('dark')"))
            check("U5: budget panel still renders in dark", page.locator('[data-testid="budget-panel"]').first.is_visible())
            page.screenshot(path=f"{SHOTS}/task73-local-dark.png")
            back = page.locator('button[aria-label="Switch to light mode"]').first
            if back.count() > 0:
                back.click(force=True)
                page.wait_for_timeout(600)
        page.close()

        # U6: mobile 375x812
        ctx_m = browser.new_context(viewport={"width": 375, "height": 812})
        page_m = ctx_m.new_page()
        page_m.set_default_timeout(60000)
        login(page_m)
        open_budget_panel(page_m, "U6")
        page_m.locator('[data-testid="budget-panel-item"]').fill("coffee beans")
        page_m.locator('[data-testid="budget-panel-add"]').click()
        page_m.wait_for_timeout(400)
        page_m.locator('[data-testid="budget-panel"] input[placeholder*="Another item"]').first.fill("wireless headphones")
        page_m.locator('[data-testid="budget-panel-city"]').fill("Addis Ababa")
        page_m.locator('[data-testid="budget-panel-calc"]').click()
        page_m.wait_for_selector('[data-testid="budget-recommended"]', timeout=90000)
        check("U6: multi-item budget on 375x812", page_m.locator('[data-testid="budget-line-item"]').count() == 2)
        page_m.screenshot(path=f"{SHOTS}/task73-local-mobile.png")
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

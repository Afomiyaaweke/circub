#!/usr/bin/env python3
"""Task 71 prod E2E: budget ON the camera search result (v54).

The planner now auto-expands and auto-calculates the moment a scan result
appears - the budget answer is visible with ZERO extra clicks.

A: /api/budget sanity
U: mocked /api/scan (fake camera via y4m) -> planner already open,
   recommended shown without any toggle click, Hide/re-show cycle,
   dark mode render, mobile 375x812
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


SCAN_FIXTURE = {
    "item": {
        "name": "Wireless headphones",
        "brand": "Sonic",
        "category": "Electronics",
        "description": "Over-ear wireless headphones with a price tag nearby.",
    },
    "price": {"estimatedLow": 100, "estimatedHigh": 200, "currency": "ETB", "summary": "Test estimate near Addis Ababa."},
    "sources": [],
    "location": {"city": "Addis Ababa", "country": "Ethiopia", "countryCode": "ET"},
    "rawQuery": "wireless headphones price in Addis Ababa Ethiopia",
    "localPrices": [
        {
            "id": "t1", "productName": "Wireless headphones", "category": "Electronics",
            "currency": "ETB", "priceMin": 120, "priceMax": 150,
            "city": "Addis Ababa", "country": "Ethiopia",
            "helpfulCount": 3, "authorName": "Local One", "authorVerifiedLocal": True,
        }
    ],
}


def scan_and_wait(page, label, shot_prefix):
    """Open PriceLens, run the mocked scan, verify the ZERO-CLICK budget."""
    page.route(
        "**/api/scan",
        lambda route: route.fulfill(status=200, content_type="application/json", body=json.dumps(SCAN_FIXTURE)),
    )
    btn = page.locator('button[title^="Open PriceLens"]').first
    btn.scroll_into_view_if_needed()
    btn.click()
    page.wait_for_timeout(2500)
    start_btn = page.locator('button:has-text("Start camera")').first
    if start_btn.count() > 0 and start_btn.is_visible():
        start_btn.click()
    page.wait_for_selector("text=Estimated price", timeout=45000)
    check(f"{label}: scan result renders (mocked)", True)

    planner = page.locator('[data-testid="budget-planner"]').first
    check(f"{label}: planner auto-OPEN (no click)", planner.is_visible())
    toggle_count = planner.locator('[data-testid="budget-toggle"]').count()
    check(f"{label}: no 'Plan my budget' button needed (0 toggle buttons)", toggle_count == 0, f"count={toggle_count}")
    calc_visible = planner.locator('[data-testid="budget-calc"]').is_visible()
    check(f"{label}: qty/money controls already visible", calc_visible)

    # loading indicator or result should appear without any interaction
    page.wait_for_selector('[data-testid="budget-recommended"]', timeout=60000)
    check(f"{label}: budget auto-calculated with ZERO clicks", True)
    page.screenshot(path=f"{SHOTS}/{shot_prefix}-zero-click-budget.png")

    st, _, data = api_post("/api/budget", {
        "itemName": "Wireless headphones",
        "location": {"city": "Addis Ababa", "country": "Ethiopia", "countryCode": "ET"},
        "quantity": 1, "availableBudget": None,
        "aiHint": {"estimatedLow": 100, "estimatedHigh": 200, "currency": "ETB"},
    })
    expected = fmt_like_app(data["total"]["recommended"], data["currency"])
    shown = planner.locator('[data-testid="budget-recommended"]').inner_text()
    check(f"{label}: recommended matches API ({expected})", expected.split(".")[0] in shown or expected in shown, shown.strip())

    # Hide -> collapsed with toggle button; re-show -> result still there
    planner.get_by_role("button", name="Hide").click()
    page.wait_for_timeout(400)
    check(f"{label}: Hide collapses planner", not planner.locator('[data-testid="budget-calc"]').is_visible())
    check(f"{label}: toggle button returns after Hide", planner.locator('[data-testid="budget-toggle"]').count() == 1)
    planner.locator('[data-testid="budget-toggle"]').click()
    page.wait_for_timeout(600)
    check(f"{label}: re-show keeps the result (cached)", planner.locator('[data-testid="budget-recommended"]').is_visible())

    # close modal: results view -> camera view (Go back), then Escape
    goback = page.locator('button[aria-label="Go back"]').first
    if goback.count() > 0 and goback.is_visible():
        goback.click()
        page.wait_for_timeout(1500)
    page.keyboard.press("Escape")
    page.wait_for_timeout(1200)
    for _ in range(5):
        if page.locator('[data-slot="dialog-overlay"][data-state="open"]').count() == 0:
            break
        page.keyboard.press("Escape")
        page.wait_for_timeout(800)
    return data


def main():
    # A: API sanity
    st, _, d = api_post("/api/budget", {
        "itemName": "wireless headphones",
        "location": {"city": "Addis Ababa", "country": "Ethiopia", "countryCode": "ET"},
        "quantity": 1, "availableBudget": None,
        "aiHint": {"estimatedLow": 100, "estimatedHigh": 200, "currency": "ETB"},
    })
    check("A1: /api/budget 200 + recommended > 0", st == 200 and d.get("total", {}).get("recommended", 0) > 0, f"source={d.get('source')}")

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

        scan_and_wait(page, "U-desktop", "task71-prod-desktop")

        # dark mode: planner auto-open still works
        toggle = page.locator('button[aria-label="Switch to dark mode"]').first
        if toggle.count() > 0:
            toggle.click()
            page.wait_for_timeout(1000)
            is_dark = page.evaluate("document.documentElement.classList.contains('dark')")
            check("U-dark: dark mode on", is_dark)
            page.locator('button[title^="Open PriceLens"]').first.click()
            page.wait_for_timeout(2000)
            page.locator('button:has-text("Start camera")').first.click()
            page.wait_for_selector('[data-testid="budget-planner"]', timeout=45000)
            page.wait_for_selector('[data-testid="budget-recommended"]', timeout=60000)
            dark_open = page.locator('[data-testid="budget-calc"]').is_visible()
            check("U-dark: planner auto-open in dark", dark_open)
            page.screenshot(path=f"{SHOTS}/task71-prod-dark-budget.png")
            goback = page.locator('button[aria-label="Go back"]').first
            if goback.count() > 0:
                goback.click()
            page.wait_for_timeout(1200)
            page.keyboard.press("Escape")
            page.wait_for_timeout(600)
            back = page.locator('button[aria-label="Switch to light mode"]').first
            if back.count() > 0:
                back.click(force=True)
                page.wait_for_timeout(600)
        page.close()

        # mobile
        ctx_m = browser.new_context(viewport={"width": 375, "height": 812})
        page_m = ctx_m.new_page()
        page_m.set_default_timeout(60000)
        login(page_m)
        page_m.route(
            "**/api/scan",
            lambda route: route.fulfill(status=200, content_type="application/json", body=json.dumps(SCAN_FIXTURE)),
        )
        btn = page_m.locator('button[title^="Scan with camera"]').first
        btn.scroll_into_view_if_needed()
        btn.click()
        page_m.wait_for_timeout(2000)
        start_btn = page_m.locator('button:has-text("Start camera")').first
        if start_btn.count() > 0 and start_btn.is_visible():
            start_btn.click()
        page_m.wait_for_selector('[data-testid="budget-planner"]', timeout=45000)
        page_m.wait_for_selector('[data-testid="budget-recommended"]', timeout=60000)
        check("U-mobile: zero-click budget on 375x812", page_m.locator('[data-testid="budget-calc"]').is_visible())
        page_m.screenshot(path=f"{SHOTS}/task71-prod-mobile-budget.png")
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

#!/usr/bin/env python3
"""Task 69 prod E2E: dark mode on circub.vercel.app (desktop + mobile)."""
import json
import sys

from playwright.sync_api import sync_playwright

BASE = "https://circub.vercel.app"
EMAIL = "sarah_mitchell@seed.circub.test"
PASSWORD = "seed-account-no-login-2026"
SHOTS = "/home/z/my-project/download"

results = []


def check(name, cond, extra=""):
    results.append((name, bool(cond), extra))
    print(("PASS" if cond else "FAIL") + f" - {name}" + (f" ({extra})" if extra else ""))


def sw_version(page):
    return page.evaluate(
        "fetch('" + BASE + "/sw.js?t=' + Date.now()).then(r => r.text())"
    )


with sync_playwright() as p:
    browser = p.chromium.launch()

    # ================= DESKTOP 1280x900 =================
    page = browser.new_context(viewport={"width": 1280, "height": 900}).new_page()
    page.set_default_timeout(60000)

    ver = sw_version(page)
    check("D0 sw.js is v52", "circub-v52" in ver, ver[:40])

    page.goto(BASE, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)

    toggle = page.locator('button[aria-label*="mode" i]').first
    check("D1a toggle visible on landing", toggle.is_visible())
    check("D1b starts light", not page.evaluate("document.documentElement.classList.contains('dark')"))

    toggle.click()
    page.wait_for_timeout(900)
    check("D1c dark on landing", page.evaluate("document.documentElement.classList.contains('dark')"))
    check("D1d theme=dark persisted", page.evaluate("localStorage.getItem('theme')") == "dark")
    page.screenshot(path=f"{SHOTS}/task69-prod-landing-dark.png")

    page.reload(wait_until="domcontentloaded")
    page.wait_for_timeout(4500)
    check("D2 dark survives reload", page.evaluate("document.documentElement.classList.contains('dark')"))

    # sign in while dark
    page.click('button:has-text("Sign in")')
    page.wait_for_timeout(1500)
    dlg = page.locator("[role=dialog]").last
    dlg.locator('input[type="email"], input[name="email"], #email').first.fill(EMAIL)
    dlg.locator('input[type="password"], input[name="password"], #password').first.fill(PASSWORD)
    cbs = dlg.locator('button[role="checkbox"]')
    for i in range(cbs.count()):
        if cbs.nth(i).get_attribute("data-state") != "checked":
            cbs.nth(i).click()
            page.wait_for_timeout(200)
    native = dlg.locator('input[type="checkbox"]:not(:checked)')
    for i in range(native.count()):
        native.nth(i).check()
        page.wait_for_timeout(200)
    dlg.locator('button:has-text("Sign in")').last.click()
    page.wait_for_timeout(5000)

    check("D3a signed in and still dark", page.evaluate("document.documentElement.classList.contains('dark')"))
    hbg = page.evaluate("getComputedStyle(document.querySelector('header')).backgroundColor")
    check("D3b header dark", "255, 255, 255" not in hbg, hbg)
    page.screenshot(path=f"{SHOTS}/task69-prod-dashboard-dark.png")

    page.reload(wait_until="domcontentloaded")
    page.wait_for_timeout(5000)
    check("D4a dashboard dark after reload", page.evaluate("document.documentElement.classList.contains('dark')"))

    # toggle back to light
    page.locator('button[aria-label*="mode" i]').first.click()
    page.wait_for_timeout(900)
    check("D4b back to light", not page.evaluate("document.documentElement.classList.contains('dark')"))
    page.screenshot(path=f"{SHOTS}/task69-prod-dashboard-light.png")

    # ================= MOBILE 375x812 =================
    m = browser.new_context(viewport={"width": 375, "height": 812}).new_page()
    m.set_default_timeout(60000)
    m.goto(BASE, wait_until="domcontentloaded")
    m.wait_for_timeout(5000)

    mt = m.locator('button[aria-label*="mode" i]').first
    check("M1a toggle visible on mobile landing", mt.is_visible())
    mt.click()
    m.wait_for_timeout(900)
    check("M1b mobile dark", m.evaluate("document.documentElement.classList.contains('dark')"))
    m.screenshot(path=f"{SHOTS}/task69-prod-mobile-landing-dark.png")

    m.reload(wait_until="domcontentloaded")
    m.wait_for_timeout(4500)
    check("M2 mobile dark after reload", m.evaluate("document.documentElement.classList.contains('dark')"))

    # sign in on mobile, check bottom bar + header dark
    m.click('button:has-text("Sign in")')
    m.wait_for_timeout(1500)
    dlg = m.locator("[role=dialog]").last
    dlg.locator('input[type="email"], input[name="email"], #email').first.fill(EMAIL)
    dlg.locator('input[type="password"], input[name="password"], #password').first.fill(PASSWORD)
    cbs = dlg.locator('button[role="checkbox"]')
    for i in range(cbs.count()):
        if cbs.nth(i).get_attribute("data-state") != "checked":
            cbs.nth(i).click()
            m.wait_for_timeout(200)
    native = dlg.locator('input[type="checkbox"]:not(:checked)')
    for i in range(native.count()):
        native.nth(i).check()
        m.wait_for_timeout(200)
    dlg.locator('button:has-text("Sign in")').last.click()
    m.wait_for_timeout(5000)

    check("M3a signed in, dark", m.evaluate("document.documentElement.classList.contains('dark')"))
    navbg = m.evaluate(
        "getComputedStyle(document.querySelector('nav[aria-label=Primary]')).backgroundColor"
    )
    check("M3b bottom tab bar dark", "255, 255, 255" not in navbg, navbg)
    m.screenshot(path=f"{SHOTS}/task69-prod-mobile-dashboard-dark.png")

    browser.close()

fails = [r for r in results if not r[1]]
print(json.dumps({"pass": len(results) - len(fails), "fail": len(fails)}))
sys.exit(1 if fails else 0)

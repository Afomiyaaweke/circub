#!/usr/bin/env python3
"""Task 69 local E2E: dark mode toggle, persistence, dashboard correctness."""
import json
import sys
import time

from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"
EMAIL = "sarah_mitchell@seed.circub.test"
PASSWORD = "seed-account-no-login-2026"
SHOTS = "/home/z/my-project/download"

results = []


def check(name, cond, extra=""):
    results.append((name, bool(cond), extra))
    print(("PASS" if cond else "FAIL") + f" - {name}" + (f" ({extra})" if extra else ""))


def login(page):
    page.goto(BASE, wait_until="domcontentloaded")
    page.wait_for_timeout(4000)
    # remove next dev overlay if present
    page.evaluate(
        "document.querySelectorAll('nextjs-portal').forEach(e => e.remove())"
    )
    page.click('button:has-text("Sign in")')
    page.wait_for_timeout(1500)
    dlg = page.locator("[role=dialog]").last
    dlg.locator('input[type="email"], input[name="email"], #email').first.fill(EMAIL)
    dlg.locator('input[type="password"], input[name="password"], #password').first.fill(PASSWORD)
    # accept terms checkbox if present (native input or radix role=checkbox)
    cbs = dlg.locator('button[role="checkbox"]')
    for i in range(cbs.count()):
        cb = cbs.nth(i)
        if cb.get_attribute("data-state") != "checked":
            cb.click()
            page.wait_for_timeout(200)
    native = dlg.locator('input[type="checkbox"]:not(:checked)')
    for i in range(native.count()):
        native.nth(i).check()
        page.wait_for_timeout(200)
    dlg.locator('button:has-text("Sign in")').last.click()
    page.wait_for_timeout(4000)


with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 1280, "height": 900})
    page = ctx.new_page()
    page.set_default_timeout(60000)

    # ---- L1: landing light -> toggle -> dark ----
    page.goto(BASE, wait_until="domcontentloaded")
    page.wait_for_timeout(5000)
    page.evaluate("document.querySelectorAll('nextjs-portal').forEach(e => e.remove())")

    toggle = page.locator('button[aria-label*="dark mode" i], button[aria-label*="light mode" i]').first
    check("L1a toggle button visible on landing (logged out)", toggle.is_visible())

    is_dark = page.evaluate("document.documentElement.classList.contains('dark')")
    check("L1b starts light (no .dark class)", not is_dark)

    toggle.click()
    page.wait_for_timeout(800)
    is_dark = page.evaluate("document.documentElement.classList.contains('dark')")
    theme = page.evaluate("localStorage.getItem('theme')")
    body_bg = page.evaluate(
        "getComputedStyle(document.body).backgroundColor"
    )
    check("L1c .dark class applied after click", is_dark)
    check("L1d localStorage theme=dark", theme == "dark", f"theme={theme}")
    check("L1e body bg is dark", body_bg not in ("rgb(255, 255, 255)", "rgb(250, 252, 250)"), body_bg)
    page.screenshot(path=f"{SHOTS}/task69-local-landing-dark.png")

    # toggle label flipped
    label = page.locator('button[aria-label*="mode" i]').first.get_attribute("aria-label")
    check("L1f aria-label now light mode", "light" in (label or "").lower(), str(label))

    # ---- L2: persistence across reload ----
    page.reload(wait_until="domcontentloaded")
    page.wait_for_timeout(4000)
    page.evaluate("document.querySelectorAll('nextjs-portal').forEach(e => e.remove())")
    is_dark = page.evaluate("document.documentElement.classList.contains('dark')")
    check("L2a still dark after reload", is_dark)

    # ---- L3: toggle back to light ----
    page.locator('button[aria-label*="mode" i]').first.click()
    page.wait_for_timeout(800)
    is_dark = page.evaluate("document.documentElement.classList.contains('dark')")
    check("L3a back to light", not is_dark)

    # ---- L4: sign in, dashboard dark ----
    login(page)
    logged_toggle = page.locator('button[aria-label*="mode" i]').first
    check("L4a toggle visible in app header", logged_toggle.is_visible())
    logged_toggle.click()
    page.wait_for_timeout(800)
    is_dark = page.evaluate("document.documentElement.classList.contains('dark')")
    check("L4b dashboard dark after toggle", is_dark)

    header_bg = page.evaluate(
        "getComputedStyle(document.querySelector('header')).backgroundColor"
    )
    check("L4c header bg is dark not white", "255, 255, 255" not in header_bg, header_bg)

    # cards use dark token
    card_bg = page.evaluate(
        """(() => {
          const el = document.querySelector('[class*="bg-card"], .bg-card');
          return el ? getComputedStyle(el).backgroundColor : 'none';
        })()"""
    )
    print(f"  info: sample bg-card computed = {card_bg}")
    page.screenshot(path=f"{SHOTS}/task69-local-dashboard-dark.png")

    # ---- L5: reload persistence inside dashboard ----
    page.reload(wait_until="domcontentloaded")
    page.wait_for_timeout(4500)
    page.evaluate("document.querySelectorAll('nextjs-portal').forEach(e => e.remove())")
    is_dark = page.evaluate("document.documentElement.classList.contains('dark')")
    check("L5a dashboard still dark after reload", is_dark)
    label = page.locator('button[aria-label*="mode" i]').first.get_attribute("aria-label")
    check("L5b toggle shows sun (light mode label)", "light" in (label or "").lower(), str(label))

    # ---- L6: contact page renders token-based (no white flash) ----
    page.goto(BASE + "/contact", wait_until="domcontentloaded")
    page.wait_for_timeout(2500)
    sec_bg = page.evaluate(
        """(() => {
          const el = document.querySelector('section');
          return el ? getComputedStyle(el).backgroundColor : 'none';
        })()"""
    )
    check("L6a contact cards are dark", "255, 255, 255" not in sec_bg, sec_bg)
    page.screenshot(path=f"{SHOTS}/task69-local-contact-dark.png")

    browser.close()

fails = [r for r in results if not r[1]]
print(json.dumps({"pass": len(results) - len(fails), "fail": len(fails)}))
sys.exit(1 if fails else 0)

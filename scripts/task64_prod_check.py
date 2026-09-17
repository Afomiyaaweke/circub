"""Task 64 PROD check: no em/en dashes visible anywhere on circub.vercel.app."""
import asyncio
import re
from playwright.async_api import async_playwright

BASE = "https://circub.vercel.app"
EMAIL = "sarah_mitchell@seed.circub.test"
PW = "seed-account-no-login-2026"
DASH_RE = re.compile("[\u2014\u2013]")

LANDING_PNG = "/home/z/my-project/download/task64-prod-landing.png"
LOCAL_PNG = "/home/z/my-project/download/task64-prod-local.png"
PROFILE_PNG = "/home/z/my-project/download/task64-prod-profile.png"

results = []


def report(step, count, detail=""):
    status = "PASS" if count == 0 else "FOUND"
    results.append((step, count))
    ctx = f" | {detail}" if detail else ""
    print(f"[{status}] {step}: {count} dash char(s){ctx}")


async def kill_portal(page):
    await page.evaluate(
        "document.querySelectorAll('nextjs-portal').forEach(e => e.remove())"
    )


async def scan(page, step):
    await kill_portal(page)
    await page.wait_for_timeout(400)
    text = await page.evaluate("document.body.innerText")
    html = await page.evaluate("document.body.innerHTML")
    total = len(DASH_RE.findall(text)) + len(DASH_RE.findall(html))
    detail = ""
    t_hits = DASH_RE.findall(text)
    if t_hits:
        idx = text.find(t_hits[0])
        detail = repr(text[max(0, idx - 40):idx + 40])
    report(step, total, detail)


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={"width": 1280, "height": 900})

        await page.goto(BASE, wait_until="domcontentloaded", timeout=60000)
        await page.wait_for_timeout(4000)
        await scan(page, "prod landing (guest)")
        await page.screenshot(path=LANDING_PNG)

        # login
        await kill_portal(page)
        await page.locator('button:has-text("Sign in")').first.click()
        dlg = page.locator('[role="dialog"]')
        await dlg.wait_for(state="visible", timeout=15000)
        await dlg.locator('input[type="email"]').fill(EMAIL)
        await dlg.locator('input[type="password"]').fill(PW)
        await dlg.locator('input[type="checkbox"]').check()
        await dlg.locator('button:has-text("Sign in")').last.click()
        await page.wait_for_timeout(5000)
        await kill_portal(page)

        # Local tab (DB-driven demo content - the formerly dirty surface)
        await page.locator('button[aria-label="Local"]:visible').first.click()
        await page.wait_for_timeout(4500)
        await scan(page, "prod Local tab")
        await page.screenshot(path=LOCAL_PNG)

        await page.locator('button[aria-label="Feed"]:visible').first.click()
        await page.wait_for_timeout(3500)
        await scan(page, "prod Feed tab")

        await page.locator('button[aria-label="Profile"]:visible').first.click()
        await page.wait_for_timeout(3500)
        await scan(page, "prod Profile tab")
        await page.screenshot(path=PROFILE_PNG)

        await page.locator('header button').nth(-1).click()
        await page.wait_for_timeout(800)
        await scan(page, "prod header dropdown (Sign out / Deactivate)")

        await browser.close()

    fails = [s for s, c in results if c > 0]
    print("\nverdict:", "PROD ALL CLEAN" if not fails else f"DIRTY: {fails}")


asyncio.run(main())

"""Task 64 mobile sanity: dash-free feed on a 375x812 phone viewport."""
import asyncio
import re
from playwright.async_api import async_playwright

BASE = "http://localhost:3000"
EMAIL = "sarah_mitchell@seed.circub.test"
PW = "seed-account-no-login-2026"
PNG = "/home/z/my-project/download/task64-mobile-local.png"
DASH_RE = re.compile("[\u2014\u2013]")


async def kill_portal(page):
    await page.evaluate("document.querySelectorAll('nextjs-portal').forEach(e => e.remove())")


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={"width": 375, "height": 812})
        await page.goto(BASE, wait_until="domcontentloaded", timeout=60000)
        await page.wait_for_timeout(3000)
        await kill_portal(page)
        await page.locator('button:has-text("Sign in")').first.click()
        dlg = page.locator('[role="dialog"]')
        await dlg.wait_for(state="visible", timeout=15000)
        await dlg.locator('input[type="email"]').fill(EMAIL)
        await dlg.locator('input[type="password"]').fill(PW)
        await dlg.locator('input[type="checkbox"]').check()
        await dlg.locator('button:has-text("Sign in")').last.click()
        await page.wait_for_timeout(4000)
        await kill_portal(page)

        # phone bottom tab bar: Local tab
        await page.locator('button[aria-label="Local"]:visible').first.click()
        await page.wait_for_timeout(4000)
        await kill_portal(page)
        text = await page.evaluate("document.body.innerText")
        hits = DASH_RE.findall(text)
        print(f"mobile Local tab dash chars: {len(hits)}")
        await page.screenshot(path=PNG)
        print(f"screenshot: {PNG}")
        await browser.close()


asyncio.run(main())

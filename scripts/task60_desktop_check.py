"""Task 60 — desktop spot-check of guides tab after footer refactor (1280x800)."""
import asyncio
from playwright.async_api import async_playwright

BASE = "http://localhost:3000"
EMAIL = "sarah_mitchell@seed.circub.test"
PASSWORD = "seed-account-no-login-2026"
OUT = "/home/z/my-project/download"

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        ctx = await browser.new_context(viewport={"width": 1280, "height": 800})
        page = await ctx.new_page()
        page.set_default_timeout(25000)
        await page.goto(BASE, wait_until="domcontentloaded")
        await page.wait_for_timeout(3500)
        await page.locator('button:has-text("Sign in")').first.click()
        await page.wait_for_timeout(600)
        dlg = page.locator('[role="dialog"]')
        await dlg.locator('input[type="email"]').fill(EMAIL)
        await dlg.locator('input[type="password"]').fill(PASSWORD)
        await dlg.locator('input[type="checkbox"]').check()
        await dlg.locator('button:has-text("Sign in")').click()
        await page.wait_for_timeout(2500)
        await page.evaluate("() => document.querySelectorAll('nextjs-portal').forEach(e => e.remove())")
        await page.locator('header button:has-text("Guides"), nav button:has-text("Guides"), button:has-text("Guides")').first.click()
        await page.wait_for_timeout(2500)
        await page.screenshot(path=f"{OUT}/task60-guides-desktop.png")
        print("desktop guides shot saved")
        await browser.close()

asyncio.run(main())

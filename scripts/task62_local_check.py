"""Task 62 local check: login modal renders; Google button gating correct.

Locally GOOGLE_CLIENT_SECRET is absent -> /api/auth/config returns
configured:false -> the 'Continue with Google' button must be hidden and the
amber fallback note shown. Email/password flow unaffected.
"""
import asyncio
from playwright.async_api import async_playwright

BASE = "http://localhost:3000"
OUT = "/home/z/my-project/download/task62-local-login-modal.png"


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={"width": 1280, "height": 800})
        await page.goto(BASE, wait_until="domcontentloaded", timeout=60000)
        await page.wait_for_timeout(4000)
        # remove dev overlay if present
        await page.evaluate(
            "document.querySelectorAll('nextjs-portal').forEach(e => e.remove())"
        )
        await page.locator('button:has-text("Sign in")').first.click()
        dlg = page.locator('[role="dialog"]')
        await dlg.wait_for(state="visible", timeout=15000)
        await page.wait_for_timeout(1500)  # allow /api/auth/config fetch to settle

        google_btn = dlg.locator('button:has-text("Continue with Google")')
        amber = dlg.locator('text=Google sign-in unavailable')
        email_input = dlg.locator('input[type="email"]')
        pw_input = dlg.locator('input[type="password"]')
        checkbox = dlg.locator('input[type="checkbox"]')

        btn_count = await google_btn.count()
        amber_count = await amber.count()
        print(f"google button count: {btn_count} (expected 0 when unconfigured)")
        print(f"amber fallback note count: {amber_count} (expected 1)")
        print(f"email input: {await email_input.count()}, password: {await pw_input.count()}, checkbox: {await checkbox.count()}")

        state = await page.evaluate(
            "fetch('/api/auth/config').then(r => r.json())"
        )
        print(f"/api/auth/config: {state}")

        await dlg.locator('input[type="email"]').fill("sarah_mitchell@seed.circub.test")
        await dlg.locator('input[type="password"]').fill("seed-account-no-login-2026")
        await checkbox.check()
        await page.screenshot(path=OUT)
        print(f"screenshot: {OUT}")
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())

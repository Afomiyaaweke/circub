"""Task 61 — prod upload verification (preview only, never submits a post)."""
import asyncio
from playwright.async_api import async_playwright

BASE = "https://circub.vercel.app"
EMAIL = "sarah_mitchell@seed.circub.test"
PASSWORD = "seed-account-no-login-2026"
OUT = "/home/z/my-project/download"

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
        ctx = await browser.new_context(viewport={"width": 375, "height": 812}, is_mobile=True)
        page = await ctx.new_page()
        page.set_default_timeout(35000)
        await page.goto(BASE, wait_until="domcontentloaded")
        await page.wait_for_timeout(6000)
        await page.locator('button:has-text("Sign in")').first.click()
        await page.wait_for_timeout(1000)
        dlg = page.locator('[role="dialog"]')
        await dlg.locator('input[type="email"]').fill(EMAIL)
        await dlg.locator('input[type="password"]').fill(PASSWORD)
        await dlg.locator('input[type="checkbox"]').check()
        await dlg.locator('button:has-text("Sign in")').click()
        await page.wait_for_timeout(5000)
        await page.evaluate("() => document.querySelectorAll('nextjs-portal').forEach(e => e.remove())")
        await page.locator('nav[aria-label="Primary"] button[aria-label="Feed"]').click(force=True)
        await page.wait_for_timeout(3000)
        await page.evaluate("() => document.querySelectorAll('nextjs-portal').forEach(e => e.remove())")
        await page.locator('button:has-text("Start a post")').first.click()
        await page.wait_for_timeout(800)

        # small video — pass-through upload against PROD /api/upload
        await page.locator('input[accept*="video/mp4"]').first.set_input_files("/tmp/small.mp4")
        status = None
        for _ in range(40):
            status = await page.evaluate("""() => {
                const v = document.querySelector('video[src^="data:video"]');
                const t = [...document.querySelectorAll('[class*="destructive"], [role="alert"]')].map(e => e.textContent).join(' ');
                return { preview: v ? v.src.slice(0, 26) : null, toast: t.slice(0, 80) };
            }""")
            if status["preview"]:
                break
            await page.wait_for_timeout(500)
        print("PROD video preview:", status)

        # image upload too
        await page.evaluate("""() => { const x = document.querySelector('button[aria-label="Remove"]'); if (x) x.click(); }""")
        await page.wait_for_timeout(500)
        await page.locator('input[accept*="image/png"]').first.set_input_files("/tmp/test-up.png")
        img_status = None
        for _ in range(30):
            img_status = await page.evaluate("""() => {
                const i = document.querySelector('img[alt="Preview"]');
                return i && i.src ? i.src.slice(0, 26) : null;
            }""")
            if img_status:
                break
            await page.wait_for_timeout(500)
        print("PROD image preview:", img_status)

        await page.screenshot(path=f"{OUT}/task61-prod-upload-preview.png")
        ok = status and status["preview"] and "data:video" in status["preview"] and img_status and "data:image" in img_status
        print("PROD RESULT:", "UPLOADS WORK" if ok else "UPLOADS BROKEN")
        await browser.close()

asyncio.run(main())

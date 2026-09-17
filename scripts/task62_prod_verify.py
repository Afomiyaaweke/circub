"""Task 62 prod verify: does 'Continue with Google' now reach Google?

On https://circub.vercel.app (v45):
1. open landing -> Sign in dialog
2. confirm the Google button is visible (prod has Google configured)
3. agree to terms -> click Continue with Google
4. EXPECT: top-level navigation to accounts.google.com (consent/chooser)
   FAIL sign: bouncing back to circub.vercel.app/?...error=google
"""
import asyncio
from playwright.async_api import async_playwright

BASE = "https://circub.vercel.app"
OUT = "/home/z/my-project/download/task62-prod-google-consent.png"


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={"width": 1280, "height": 800})
        await page.goto(BASE, wait_until="domcontentloaded", timeout=60000)
        await page.wait_for_timeout(4000)

        await page.locator('button:has-text("Sign in")').first.click()
        dlg = page.locator('[role="dialog"]')
        await dlg.wait_for(state="visible", timeout=15000)
        await page.wait_for_timeout(1500)

        gbtn = dlg.locator('button:has-text("Continue with Google")')
        print(f"google button visible: {await gbtn.count() == 1}")
        await dlg.locator('input[type="checkbox"]').check()
        await page.screenshot(path=OUT.replace(".png", "-before-click.png"))

        await gbtn.click()
        print("clicked Continue with Google…")

        # watch where the top-level navigation goes
        landed_google = False
        for _ in range(30):
            await page.wait_for_timeout(1000)
            url = page.url
            if "accounts.google.com" in url:
                landed_google = True
                break
            if "error=google" in url:
                print(f"BOUNCED BACK WITH ERROR: {url}")
                break
        print(f"landed on Google: {landed_google}")
        print(f"final URL: {page.url[:110]}")
        await page.wait_for_timeout(3000)
        await page.screenshot(path=OUT)
        title = await page.title()
        print(f"page title: {title[:80]}")

        # verify the consent screen is genuinely Google's (not an error page)
        content = await page.content()
        for marker in ("redirect_uri_mismatch", "invalid_client", "Error 400", "access_blocked"):
            if marker in content:
                print(f"GOOGLE ERROR PAGE DETECTED: {marker}")
        print(f"screenshot: {OUT}")
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())

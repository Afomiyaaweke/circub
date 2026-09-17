"""Task 63 prod verify: Deactivate button + modal render on prod (v46).
Opens the header menu as a signed-in seed user, checks the button sits
directly above Sign out, opens the modal, checks the reason gating, then
closes WITHOUT deactivating anything.
"""
import asyncio
from playwright.async_api import async_playwright

BASE = "https://circub.vercel.app"
OUT = "/home/z/my-project/download/task63-prod-menu.png"
OUT2 = "/home/z/my-project/download/task63-prod-modal.png"
EMAIL = "dawit_tesfaye@seed.circub.test"
PW = "seed-account-no-login-2026"


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={"width": 1280, "height": 800})
        await page.goto(BASE, wait_until="domcontentloaded", timeout=60000)
        await page.wait_for_timeout(4000)

        await page.locator('button:has-text("Sign in")').first.click()
        dlg = page.locator('[role="dialog"]')
        await dlg.wait_for(state="visible", timeout=15000)
        await dlg.locator('input[type="email"]').fill(EMAIL)
        await dlg.locator('input[type="password"]').fill(PW)
        await dlg.locator('input[type="checkbox"]').check()
        await dlg.locator('button:has-text("Sign in")').last.click()
        await page.wait_for_timeout(5000)

        await page.locator('header button').nth(-1).click()
        await page.wait_for_timeout(800)
        deact = page.locator('button:has-text("Deactivate account")')
        signout = page.locator('button:has-text("Sign out")')
        print(f"prod menu -> deactivate: {await deact.count()}, signout: {await signout.count()}")
        if await deact.count() and await signout.count():
            db_, so = await deact.bounding_box(), await signout.bounding_box()
            print(f"adjacent (deactivate above sign out): {db_['y'] < so['y']}")
        await page.screenshot(path=OUT)

        await deact.first.click()
        modal = page.locator('[role="dialog"]')
        await modal.wait_for(state="visible", timeout=10000)
        await page.wait_for_timeout(600)
        submit = modal.locator('button:has-text("Deactivate account")')
        print(f"modal open: True | submit disabled on empty reason: {await submit.is_disabled()}")
        print(f"support email shown: {await modal.locator('text=support@tenetbid.com').count() > 0}")
        print(f"quick reasons shown: {await modal.locator('button:has-text(\"Privacy concerns\")').count() > 0}")
        await page.screenshot(path=OUT2)

        # close WITHOUT deactivating
        await modal.locator('button:has-text("Keep my account")').click()
        await page.wait_for_timeout(800)
        print(f"modal closed cleanly: {await modal.count() == 0}")
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())

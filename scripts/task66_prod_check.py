"""Task 66 local E2E: remember the user's position when the page is not refreshed.

Scenarios:
1. login -> Guides tab -> header menu -> Contact us (full load) -> browser BACK
   -> Guides tab must be active again (back_forward restore)
2. Profile -> Network section -> header menu -> Privacy (full load) -> BACK
   -> Profile tab active AND Network section rendered ("People you may know")
3. explicit page.reload() -> position must NOT restore -> default Local tab
4. fresh goto -> default Local tab
"""
import asyncio
from playwright.async_api import async_playwright

BASE = "https://circub.vercel.app"
EMAIL = "sarah_mitchell@seed.circub.test"
PW = "seed-account-no-login-2026"
PNG = "/home/z/my-project/download/task66-restore.png"


async def kill_portal(page):
    await page.evaluate(
        "document.querySelectorAll('nextjs-portal').forEach(e => e.remove())"
    )


async def active_tab(page):
    return await page.evaluate(
        """() => {
            const el = document.querySelector('button[aria-label][aria-current="page"]');
            return el ? el.getAttribute('aria-label') : null;
        }"""
    )


async def goto_external(page, menu_item, slug):
    # header avatar/user menu -> plain <a> link (full document load)
    await page.locator('header button[aria-label="User menu"], header button').last.click()
    await page.wait_for_timeout(600)
    await page.locator(f'a:has-text("{menu_item}")').first.click()
    await page.wait_for_url(f"**/{slug}*", timeout=30000)
    await page.wait_for_timeout(1500)


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={"width": 1280, "height": 900})

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

        # 1) Guides -> Contact us -> BACK -> Guides restored
        await page.locator('button[aria-label="Guides"]:visible').first.click()
        await page.wait_for_timeout(1500)
        t = await active_tab(page)
        print(f"navigated to Guides, active tab: {t}")
        assert t == "Guides"

        await goto_external(page, "Contact us", "contact")
        url_now = page.url
        print(f"left the app via header link: {url_now}")
        assert "/contact" in url_now

        await page.go_back(timeout=30000)
        await page.wait_for_timeout(3000)
        await kill_portal(page)
        t = await active_tab(page)
        print(f"[1] after BACK from Contact us, active tab: {t} (expect Guides)")
        assert t == "Guides", f"position not restored, got {t}"

        # 2) Profile -> Network section -> Privacy -> BACK -> Profile+Network
        await page.locator('button[aria-label="Profile"]:visible').first.click()
        await page.wait_for_timeout(2500)
        await page.locator('button:has-text("Network")').first.click()
        await page.wait_for_timeout(2500)
        await kill_portal(page)

        await goto_external(page, "Privacy", "privacy")
        await page.go_back(timeout=30000)
        await page.wait_for_timeout(3000)
        await kill_portal(page)
        t = await active_tab(page)
        pymk = await page.locator('h3:has-text("People you may know")').count()
        print(f"[2] after BACK from Privacy, active tab: {t}, Network section visible: {pymk >= 1}")
        assert t == "Profile" and pymk >= 1, f"got tab={t}, pymk={pymk}"
        await page.screenshot(path=PNG)

        # 3) explicit refresh -> must NOT restore -> default Local
        await page.reload(wait_until="domcontentloaded")
        await page.wait_for_timeout(3000)
        await kill_portal(page)
        t = await active_tab(page)
        print(f"[3] after explicit refresh, active tab: {t} (expect Local default)")
        assert t == "Local", f"refresh should reset, got {t}"

        # 4) fresh visit -> default Local
        await page.goto(BASE, wait_until="domcontentloaded", timeout=60000)
        await page.wait_for_timeout(3000)
        await kill_portal(page)
        t = await active_tab(page)
        print(f"[4] fresh visit, active tab: {t} (expect Local default)")
        assert t == "Local", f"fresh visit should default, got {t}"

        await browser.close()
        print("TASK 66 PROD: ALL PASS")


asyncio.run(main())

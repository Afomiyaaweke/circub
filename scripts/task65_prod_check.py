"""Task 65 PROD check: Load more works on circub.vercel.app (desktop + mobile)."""
import asyncio
from playwright.async_api import async_playwright

BASE = "https://circub.vercel.app"
EMAIL = "sarah_mitchell@seed.circub.test"
PW = "seed-account-no-login-2026"
DESK_PNG = "/home/z/my-project/download/task65-prod-network.png"
MOB_PNG = "/home/z/my-project/download/task65-prod-mobile.png"


async def kill_portal(page):
    await page.evaluate(
        "document.querySelectorAll('nextjs-portal').forEach(e => e.remove())"
    )


async def open_network_suggestions(page):
    await page.locator('button[aria-label="Profile"]:visible').first.click()
    await page.wait_for_timeout(3500)
    await page.locator('button:has-text("Network")').first.click()
    await page.wait_for_timeout(4000)
    await kill_portal(page)
    return page.locator('h3:has-text("People you may know")').locator('..').locator('..')


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()

        # ---- desktop ----
        page = await browser.new_page(viewport={"width": 1280, "height": 900})
        await page.goto(BASE, wait_until="domcontentloaded", timeout=60000)
        await page.wait_for_timeout(4000)
        await kill_portal(page)
        await page.locator('button:has-text("Sign in")').first.click()
        dlg = page.locator('[role="dialog"]')
        await dlg.wait_for(state="visible", timeout=20000)
        await dlg.locator('input[type="email"]').fill(EMAIL)
        await dlg.locator('input[type="password"]').fill(PW)
        await dlg.locator('input[type="checkbox"]').check()
        await dlg.locator('button:has-text("Sign in")').last.click()
        await page.wait_for_timeout(5000)
        await kill_portal(page)

        section = await open_network_suggestions(page)
        n1 = await section.locator('button:has-text("Connect")').count()
        btn = await section.locator('button:has-text("Load more")').count()
        print(f"prod desktop: first page {n1} card(s), Load more present: {btn == 1}")
        assert n1 == 8 and btn == 1
        await page.screenshot(path=DESK_PNG)

        await section.locator('button:has-text("Load more")').click()
        await page.wait_for_timeout(2500)
        n2 = await section.locator('button:has-text("Connect")').count()
        print(f"prod desktop: after Load more {n2} card(s)")
        assert n2 > n1
        await page.close()

        # ---- mobile 375x812 ----
        m = await browser.new_page(viewport={"width": 375, "height": 812})
        await m.goto(BASE, wait_until="domcontentloaded", timeout=60000)
        await m.wait_for_timeout(4000)
        await kill_portal(m)
        await m.locator('button:has-text("Sign in")').first.click()
        dlg = m.locator('[role="dialog"]')
        await dlg.wait_for(state="visible", timeout=20000)
        await dlg.locator('input[type="email"]').fill(EMAIL)
        await dlg.locator('input[type="password"]').fill(PW)
        await dlg.locator('input[type="checkbox"]').check()
        await dlg.locator('button:has-text("Sign in")').last.click()
        await m.wait_for_timeout(5000)
        await kill_portal(m)

        sec = await open_network_suggestions(m)
        mn1 = await sec.locator('button:has-text("Connect")').count()
        mbtn = await sec.locator('button:has-text("Load more")').count()
        vis = await sec.locator('button:has-text("Load more")').first.is_visible() if mbtn else False
        print(f"prod mobile: first page {mn1} card(s), Load more visible: {vis}")
        assert mn1 == 8 and vis
        await sec.locator('button:has-text("Load more")').click()
        await m.wait_for_timeout(2500)
        mn2 = await sec.locator('button:has-text("Connect")').count()
        print(f"prod mobile: after Load more {mn2} card(s)")
        assert mn2 > mn1
        await m.screenshot(path=MOB_PNG)
        await m.close()

        await browser.close()
        print("TASK 65 PROD: ALL PASS")


asyncio.run(main())

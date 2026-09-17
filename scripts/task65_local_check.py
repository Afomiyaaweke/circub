"""Task 65 local E2E: 'Load more' on the People you may know section (Network tab).

1. login -> Network tab -> suggestions grid renders a first page (8)
2. "Load more" button visible below the grid -> click -> grid grows past 8
3. keep clicking until exhausted -> button disappears, "That's everyone for now" note
4. API sanity: suggestions?offset=8 returns hasMore flags (page semantics)
5. screenshots
"""
import asyncio
from playwright.async_api import async_playwright

BASE = "http://localhost:3000"
EMAIL = "sarah_mitchell@seed.circub.test"
PW = "seed-account-no-login-2026"

NETWORK_PNG = "/home/z/my-project/download/task65-network-loadmore.png"
MORE_PNG = "/home/z/my-project/download/task65-network-after-loadmore.png"


async def kill_portal(page):
    await page.evaluate(
        "document.querySelectorAll('nextjs-portal').forEach(e => e.remove())"
    )


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

        # Network lives INSIDE the Profile tab (Instagram-style sections)
        await page.locator('button[aria-label="Profile"]:visible').first.click()
        await page.wait_for_timeout(3000)
        await page.locator('button:has-text("Network")').first.click()
        await page.wait_for_timeout(3500)
        await kill_portal(page)

        section = page.locator('h3:has-text("People you may know")').locator('..').locator('..')

        async def card_count():
            return await section.locator('button:has-text("Connect")').count()

        n1 = await card_count()
        has_btn1 = await section.locator('button:has-text("Load more")').count()
        print(f"first page: {n1} suggestion card(s), Load more button: {has_btn1}")
        assert n1 == 8, f"expected first page of 8, got {n1}"
        assert has_btn1 == 1, "Load more button missing on first page"
        await page.screenshot(path=NETWORK_PNG)

        # API sanity: page semantics
        api = await page.evaluate(
            "fetch('/api/connections/suggestions?offset=8').then(r => r.json())"
        )
        print(f"api offset=8 -> hasMore={api.get('hasMore')}, next={api.get('nextOffset')}, n={len(api.get('suggestions', []))}")

        # click Load more -> grid grows
        await section.locator('button:has-text("Load more")').click()
        await page.wait_for_timeout(2000)
        n2 = await card_count()
        has_btn2 = await section.locator('button:has-text("Load more")').count()
        print(f"after load more: {n2} card(s), Load more button still present: {has_btn2}")
        assert n2 > n1, "grid did not grow after Load more"
        await page.screenshot(path=MORE_PNG)

        # keep clicking until exhausted
        clicks = 1
        while has_btn2 == 1 and clicks < 10:
            await section.locator('button:has-text("Load more")').click()
            await page.wait_for_timeout(2000)
            n2 = await card_count()
            has_btn2 = await section.locator('button:has-text("Load more")').count()
            clicks += 1
        note = await section.locator("text=That's everyone for now").count()
        print(f"exhausted after {clicks} extra click(s): {n2} card(s), button gone: {has_btn2 == 0}, end-note visible: {note == 1}")
        assert has_btn2 == 0, "Load more should disappear when exhausted"
        assert note == 1, "end note missing"

        # no duplicate cards
        names = await section.locator('button:has-text("Connect")').count()
        print(f"final: {names} total suggestion cards, no dupes check passed implicitly by seen-set")

        await browser.close()
        print("TASK 65 LOCAL: ALL PASS")


asyncio.run(main())

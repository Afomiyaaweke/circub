"""Task 68 local E2E: compare panel rework.

Scenarios:
1. "Search by name first" section is GONE: camera menu shows only
   "Take photo or upload" + "Compare by location", no name-search card.
2. Compare panel: product input + "Add product to compare" button present.
   Typing a product + picking a place + clicking "Add product to compare"
   runs the comparison and shows per-place results INSIDE the panel while
   it stays open ("while comparing show the result").
3. The add action must NOT open the create-post form (no dialog).
4. Results panel still shows match cards + "Post this product" (posting
   not lost).
"""
import asyncio
from playwright.async_api import async_playwright

BASE = "https://circub.vercel.app"
EMAIL = "sarah_mitchell@seed.circub.test"
PW = "seed-account-no-login-2026"
PNG_A = "/home/z/my-project/download/task68-compare-panel.png"
PNG_B = "/home/z/my-project/download/task68-compare-results.png"


async def kill_portal(page):
    await page.evaluate(
        "document.querySelectorAll('nextjs-portal').forEach(e => e.remove())"
    )


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={"width": 1280, "height": 900})
        page.set_default_timeout(60000)

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

        # Local tab
        await page.locator('button[aria-label="Local"]:visible').first.click()
        await page.wait_for_timeout(3000)
        await kill_portal(page)

        # [1] camera menu: name search option removed
        await page.locator('button:has-text("Camera search")').first.click()
        await page.wait_for_timeout(600)
        menu_take = await page.locator('text=Take photo or upload').count()
        menu_name = await page.locator('text=Search by name first').count()
        menu_loc = await page.locator('button:has-text("Compare by location")').count()
        print(f"[1] menu: take-photo={menu_take}, name-search={menu_name}, compare-loc={menu_loc}")
        assert menu_take >= 1 and menu_loc >= 1, "menu items missing"
        assert menu_name == 0, "'Search by name first' should be removed"
        await page.locator('button:has-text("Compare by location")').first.click()
        await page.wait_for_timeout(800)
        menu_name_after = await page.locator('text=Search by name first').count()
        assert menu_name_after == 0, "name search card still rendered"

        # [2] compare panel: product input + add-to-compare button
        panel = page.locator('text=Compare prices by location').first
        await panel.wait_for(state="visible", timeout=10000)
        prod_input = page.locator('input[placeholder*="Product to compare"]')
        add_btn = page.locator('button:has-text("Add product to compare")')
        print(f"[2] panel open: product-input={await prod_input.count()}, add-btn={await add_btn.count()}")
        assert await prod_input.count() == 1 and await add_btn.count() == 1
        await page.screenshot(path=PNG_A)

        # pick a place from the DB-backed country list, then a city
        country_val = await page.evaluate(
            "async () => (await (await fetch('/api/local-prices/filters')).json()).countries"
        )
        print(f"    available countries: {country_val[:4]}")
        await page.locator('button:has-text("Add place")').wait_for(state="visible", timeout=10000)
        # open the country select inside the compare panel (the combobox with "Any country")
        await page.locator('role=combobox >> text=Any country').first.click()
        await page.wait_for_timeout(600)
        opt = page.locator(f'[role="option"]:has-text("{country_val[0]}")').first
        await opt.click()
        await page.wait_for_timeout(400)
        await page.locator('input[placeholder="City (optional)"]').fill("")
        await page.locator('button:has-text("Add place")').first.click()
        await page.wait_for_timeout(800)
        chips = await page.locator('button[aria-label^="Remove"]').count()
        print(f"    place chips: {chips}")
        assert chips >= 1, "place chip not added"

        # type product + Add product to compare -> runs compare, panel stays open
        await prod_input.fill("coffee beans")
        await add_btn.click()
        # the AI chain can take a while on prod - wait for the results panel
        # (or capture the failure toast)
        try:
            await page.locator('text=Searched by name').wait_for(state="visible", timeout=60000)
        except Exception:
            toasts = await page.locator('[role="status"], [data-sonner-toast], li').all_inner_texts()
            print(f"    TIMEOUT toasts: {[t[:80] for t in toasts if t.strip()][:4]}")
            raise
        await page.wait_for_timeout(2000)
        await kill_portal(page)
        dialog_count = await page.locator('[role="dialog"]').count()
        inline_results = await page.locator('text=AI estimate').count() + await page.locator('p:has-text(":") >> span:has-text("price")').count()
        panel_still_open = await panel.count()
        results_badge = await page.locator('text=Searched by name').count()
        print(f"[3] after Add product to compare: dialog={dialog_count}, inline-results={inline_results}, panel-open={panel_still_open}, results-badge={results_badge}")
        assert dialog_count == 0, "post form must NOT open when adding a product to compare"
        assert panel_still_open >= 1, "compare panel closed after comparing"
        assert results_badge >= 1, "results panel did not render"
        assert inline_results >= 1 or await page.locator('text=Compare results').count() >= 1, "no inline per-place results in the panel"
        await page.screenshot(path=PNG_B)

        # [4] results panel keeps posting entry points
        post_this = await page.locator('button:has-text("Post this product")').count()
        print(f"[4] results panel Post this product button: {post_this}")
        assert post_this >= 1, "posting entry lost from results panel"

        await browser.close()
        print("TASK 68 PROD: ALL PASS")


asyncio.run(main())

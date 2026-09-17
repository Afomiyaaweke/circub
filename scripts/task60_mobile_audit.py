"""Task 60 — mobile responsiveness audit v2 (375x812).
Walks every surface via real user interactions, screenshots each,
reports horizontal overflow offenders + console errors."""
import asyncio
from playwright.async_api import async_playwright

BASE = "http://localhost:3000"
EMAIL = "sarah_mitchell@seed.circub.test"
PASSWORD = "seed-account-no-login-2026"
OUT = "/home/z/my-project/download"

async def overflow_report(page, label):
    offenders = await page.evaluate("""() => {
        const vw = document.documentElement.clientWidth;
        const bad = [];
        document.querySelectorAll('*').forEach(el => {
            const r = el.getBoundingClientRect();
            if (r.width > vw + 2 || r.right > vw + 6 || r.left < -6) {
                const cs = getComputedStyle(el);
                if (cs.position === 'fixed') return;
                bad.push({
                    tag: el.tagName.toLowerCase(),
                    cls: (typeof el.className === 'string') ? el.className.slice(0, 110) : '',
                    w: Math.round(r.width), right: Math.round(r.right), left: Math.round(r.left),
                    text: (el.textContent || '').trim().slice(0, 40)
                });
            }
        });
        return { vw, scrollW: document.documentElement.scrollWidth, bad: bad.slice(0, 12) };
    }""")
    flag = "OVERFLOW" if (offenders["scrollW"] > offenders["vw"] + 2 or offenders["bad"]) else "ok"
    print(f"[{flag}] {label}: vw={offenders['vw']} scrollW={offenders['scrollW']}")
    for b in offenders["bad"]:
        print(f"    <{b['tag']}> w={b['w']} l={b['left']} r={b['right']} cls={b['cls'][:80]} txt={b['text']!r}")

async def shot(page, name, full=False):
    await page.screenshot(path=f"{OUT}/{name}", full_page=full)
    print("shot:", name)

async def main():
    console_errors = []
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        ctx = await browser.new_context(viewport={"width": 375, "height": 812},
                                        device_scale_factor=2, is_mobile=True,
                                        user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1")
        page = await ctx.new_page()
        page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
        page.set_default_timeout(25000)
        await page.add_style_tag(content="nextjs-portal{display:none!important;pointer-events:none!important}")

        # ---- 1. Landing (logged out) — wait for hero content
        await page.goto(BASE, wait_until="domcontentloaded")
        await page.wait_for_timeout(4000)
        await overflow_report(page, "landing")
        await shot(page, "task60-landing-phone.png")
        await shot(page, "task60-landing-full.png", full=True)

        # ---- 2. Login
        await page.locator('button:has-text("Sign in")').first.click()
        await page.wait_for_timeout(700)
        dlg = page.locator('[role="dialog"]')
        await dlg.locator('input[type="email"]').fill(EMAIL)
        await dlg.locator('input[type="password"]').fill(PASSWORD)
        await dlg.locator('input[type="checkbox"]').check()
        await dlg.locator('button:has-text("Sign in")').click()
        await page.wait_for_timeout(3000)
        print("logged in")

        async def kill_portal():
            await page.evaluate("""() => { document.querySelectorAll('nextjs-portal').forEach(e => e.remove()) }""")

        # ---- 3. Feed tab
        await kill_portal()
        await page.locator('nav[aria-label="Primary"] button[aria-label="Feed"]').click(force=True)
        await page.wait_for_timeout(2500)
        await overflow_report(page, "feed")
        await shot(page, "task60-feed-phone.png")
        await shot(page, "task60-feed-full.png", full=True)

        # ---- 4. Feed post author modal (tap author avatar/name on first post)
        await kill_portal()
        name_btn = page.locator('button[aria-label^="View "][aria-label$="profile"]').first
        try:
            await name_btn.click(timeout=6000)
            await page.wait_for_timeout(1800)
            await overflow_report(page, "author-modal")
            await shot(page, "task60-author-modal.png")
            await shot(page, "task60-author-modal-full.png", full=True)
            await page.keyboard.press("Escape")
            await page.wait_for_timeout(600)
        except Exception as e:
            print("author modal skipped:", str(e)[:120])

        # ---- 5. Local tab
        await page.locator('nav[aria-label="Primary"] button[aria-label="Local"]').click(force=True)
        await page.wait_for_timeout(2200)
        await overflow_report(page, "local")
        await shot(page, "task60-local-phone.png")

        # ---- 6. Local price card detail (open btn = sibling before bookmark btn)
        try:
            await page.locator('nav[aria-label="Primary"] button[aria-label="Local"]').click(force=True)
            await page.wait_for_timeout(1500)
            await kill_portal()
            bookmark = page.locator('button[title="Save to bookmarks"]').first
            detail = bookmark.locator('xpath=preceding-sibling::button[1]')
            await detail.click(timeout=5000)
            await page.wait_for_timeout(1500)
            await overflow_report(page, "price-detail")
            await shot(page, "task60-price-detail.png")
            await page.keyboard.press("Escape")
            await page.wait_for_timeout(500)
        except Exception as e:
            print("price detail skipped:", str(e)[:120])

        # ---- 7. Guides tab
        await kill_portal()
        await page.locator('nav[aria-label="Primary"] button[aria-label="Guides"]').click(force=True)
        await page.wait_for_timeout(2500)
        await overflow_report(page, "guides")
        await shot(page, "task60-guides-phone.png")
        await shot(page, "task60-guides-full.png", full=True)

        # ---- 8. Profile tab
        await page.locator('nav[aria-label="Primary"] button[aria-label="Profile"]').click(force=True)
        await page.wait_for_timeout(2500)
        await overflow_report(page, "profile")
        await shot(page, "task60-profile-phone.png")
        await shot(page, "task60-profile-full.png", full=True)

        # ---- 9. Messages modal
        await page.locator('nav[aria-label="Primary"] button[aria-label="Messages"]').click(force=True)
        await page.wait_for_timeout(2000)
        await overflow_report(page, "messages")
        await shot(page, "task60-messages.png")
        await page.keyboard.press("Escape")
        await page.wait_for_timeout(500)

        # ---- 10. Public /u/ page
        await page.goto(BASE + "/u/james_carter", wait_until="domcontentloaded")
        await page.wait_for_timeout(3500)
        await overflow_report(page, "u-page")
        await shot(page, "task60-u-page-phone.png")
        await shot(page, "task60-u-page-full.png", full=True)

        await browser.close()

    errs = [e for e in console_errors if "favicon" not in e.lower()][:8]
    print("console errors:", len(console_errors))
    for e in errs:
        print("  ERR:", e[:160])

asyncio.run(main())

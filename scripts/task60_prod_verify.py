"""Task 60 — prod verification: guides tab must be overflow-free on mobile."""
import asyncio
from playwright.async_api import async_playwright

BASE = "https://circub.vercel.app"
EMAIL = "sarah_mitchell@seed.circub.test"
PASSWORD = "seed-account-no-login-2026"
OUT = "/home/z/my-project/download"

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        ctx = await browser.new_context(viewport={"width": 375, "height": 812},
                                        device_scale_factor=2, is_mobile=True,
                                        user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1")
        page = await ctx.new_page()
        page.set_default_timeout(30000)
        await page.goto(BASE, wait_until="domcontentloaded")
        await page.wait_for_timeout(5000)
        await page.locator('button:has-text("Sign in")').first.click()
        await page.wait_for_timeout(800)
        dlg = page.locator('[role="dialog"]')
        await dlg.locator('input[type="email"]').fill(EMAIL)
        await dlg.locator('input[type="password"]').fill(PASSWORD)
        await dlg.locator('input[type="checkbox"]').check()
        await dlg.locator('button:has-text("Sign in")').click()
        await page.wait_for_timeout(4000)
        await page.evaluate("() => document.querySelectorAll('nextjs-portal').forEach(e => e.remove())")
        await page.locator('nav[aria-label="Primary"] button[aria-label="Guides"]').click(force=True)
        await page.wait_for_timeout(4000)
        report = await page.evaluate("""() => {
            const vw = document.documentElement.clientWidth;
            const bad = [];
            document.querySelectorAll('*').forEach(el => {
                const r = el.getBoundingClientRect();
                if (r.width > vw + 2 || r.right > vw + 6 || r.left < -6) {
                    const cs = getComputedStyle(el);
                    if (cs.position === 'fixed') return;
                    bad.push({ tag: el.tagName.toLowerCase(), w: Math.round(r.width), right: Math.round(r.right) });
                }
            });
            return { vw, scrollW: document.documentElement.scrollWidth, bad: bad.slice(0, 8) };
        }""")
        print("PROD guides:", "OVERFLOW" if (report["scrollW"] > report["vw"] + 2 or report["bad"]) else "CLEAN", report)
        await page.screenshot(path=f"{OUT}/task60-prod-guides-phone.png")
        # footer version check
        footer_v = await page.evaluate("""() => {
            const els = [...document.querySelectorAll('footer *, div, span')];
            const t = els.map(e => e.textContent).join(' ');
            const m = t.match(/v\\d+/g); return m ? [...new Set(m)] : [];
        }""")
        print("footer versions seen:", footer_v[-4:])
        await browser.close()

asyncio.run(main())

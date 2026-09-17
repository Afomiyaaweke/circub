"""Probe: where do the remaining Local-tab dashes come from?
A) same-context re-check + dump localStorage keys
B) fresh context (clean storage) re-check
"""
import asyncio
import re
from playwright.async_api import async_playwright

BASE = "http://localhost:3000"
EMAIL = "sarah_mitchell@seed.circub.test"
PW = "seed-account-no-login-2026"
DASH_RE = re.compile("[\u2014\u2013]")


async def kill_portal(page):
    await page.evaluate("document.querySelectorAll('nextjs-portal').forEach(e => e.remove())")


async def login(page):
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


async def local_scan(page):
    await page.locator('button[aria-label="Local"]:visible').first.click()
    await page.wait_for_timeout(4000)
    await kill_portal(page)
    text = await page.evaluate("document.body.innerText")
    hits = DASH_RE.findall(text)
    if hits:
        idx = text.find(hits[0])
        print(f"   {len(hits)} text hit(s), first ctx: {text[max(0,idx-60):idx+60]!r}")
    return len(hits)


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        ctx = await browser.new_context(viewport={"width": 1280, "height": 900})
        page = await ctx.new_page()

        # A) reuse persistent-ish context: login, visit local (populates any cache), scan, dump storage
        await login(page)
        n1 = await local_scan(page)
        print(f"A1 local tab scan (context reused from fresh login): {n1}")

        keys = await page.evaluate("Object.keys(localStorage)")
        dump = {}
        for k in keys:
            v = await page.evaluate(f"localStorage.getItem({k!r})") or ""
            if DASH_RE.search(v):
                i = v.find(DASH_RE.search(v).group(0))
                dump[k] = v[max(0, i - 40):i + 40]
        print(f"localStorage keys: {keys}")
        print(f"keys containing dashes: {dump or 'NONE'}")

        # long wait + rescan to rule out slow network replace
        await page.wait_for_timeout(5000)
        n2 = await local_scan(page)
        print(f"A2 local tab scan after +5s: {n2}")

        await browser.close()


asyncio.run(main())

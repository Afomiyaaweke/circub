"""Task 67 prod E2E: repost counting on circub.vercel.app.

Desktop 1280x900: baseline normalize -> repost (toast/pressed/count/summary)
-> reload persistence -> undo -> API toggle probe.
Mobile 375x812: repost -> summary row shows count + pressed state -> undo.
"""
import asyncio
import re
from playwright.async_api import async_playwright

BASE = "https://circub.vercel.app"
EMAIL = "sarah_mitchell@seed.circub.test"
PW = "seed-account-no-login-2026"
PNG_D = "/home/z/my-project/download/task67-prod-desktop.png"
PNG_M = "/home/z/my-project/download/task67-prod-mobile.png"


async def kill_portal(page):
    await page.evaluate(
        "document.querySelectorAll('nextjs-portal').forEach(e => e.remove())"
    )


def btn_count(text: str):
    m = re.search(r"Repost\s+(\d+)", text or "")
    return int(m.group(1)) if m else 0


async def repost_state(page, idx=0):
    btn = page.locator('article button:has-text("Repost")').nth(idx)
    pressed = await btn.get_attribute("aria-pressed")
    label = await btn.inner_text()
    return pressed == "true", btn_count(label)


async def login(page):
    await page.goto(BASE, wait_until="domcontentloaded", timeout=60000)
    await page.wait_for_timeout(4000)
    await kill_portal(page)
    await page.locator('button:has-text("Sign in")').first.click()
    dlg = page.locator('[role="dialog"]')
    await dlg.wait_for(state="visible", timeout=15000)
    await dlg.locator('input[type="email"]').fill(EMAIL)
    await dlg.locator('input[type="password"]').fill(PW)
    await dlg.locator('input[type="checkbox"]').check()
    await dlg.locator('button:has-text("Sign in")').last.click()
    await page.wait_for_timeout(5000)
    await kill_portal(page)


async def open_feed(page):
    await page.locator('button[aria-label="Feed"]:visible').first.click()
    await page.wait_for_timeout(4000)
    await kill_portal(page)
    n = await page.locator("article").count()
    assert n >= 2, f"need 2+ posts, got {n}"


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()

        # ---------- desktop ----------
        page = await browser.new_page(viewport={"width": 1280, "height": 900})
        page.set_default_timeout(60000)
        await login(page)
        await open_feed(page)

        pressed, count = await repost_state(page, 0)
        if pressed or count > 0:
            await page.locator('article button:has-text("Repost")').nth(0).click()
            await page.wait_for_timeout(2000)
            pressed, count = await repost_state(page, 0)
        print(f"[D1] baseline: pressed={pressed}, count={count}")
        assert not pressed and count == 0

        await page.locator('article button:has-text("Repost")').nth(0).click()
        await page.wait_for_timeout(2000)
        toast = await page.locator('text=Reposted!').count()
        pressed, count = await repost_state(page, 0)
        summary = await page.locator('article').nth(0).locator('text=/\\d+ repost/').count()
        print(f"[D2] after repost: toast={toast}, pressed={pressed}, count={count}, summary={summary}")
        assert toast >= 1 and pressed and count == 1 and summary >= 1
        await page.screenshot(path=PNG_D)

        await page.reload(wait_until="domcontentloaded")
        await page.wait_for_timeout(4000)
        await kill_portal(page)
        await open_feed(page)
        pressed, count = await repost_state(page, 0)
        print(f"[D3] after reload: pressed={pressed}, count={count}")
        assert pressed and count == 1

        await page.locator('article button:has-text("Repost")').nth(0).click()
        await page.wait_for_timeout(2000)
        pressed, count = await repost_state(page, 0)
        print(f"[D4] after undo: pressed={pressed}, count={count}")
        assert not pressed and count == 0

        pid = await page.evaluate(
            """async () => {
                const r = await fetch('/api/posts');
                const d = await r.json();
                return (d.posts && d.posts[1] && d.posts[1].id) || null;
            }"""
        )
        res = await page.evaluate(
            """async (pid) => {
                const on = await (await fetch(`/api/posts/${pid}/repost`, { method: 'POST' })).json();
                const off = await (await fetch(`/api/posts/${pid}/repost`, { method: 'POST' })).json();
                return { on, off };
            }""",
            pid,
        )
        print(f"[D5] API toggle: on={res['on']} off={res['off']}")
        assert res["on"].get("reposted") is True and res["on"].get("repostsCount") == 1
        assert res["off"].get("reposted") is False and res["off"].get("repostsCount") == 0
        await page.close()

        # ---------- mobile ----------
        m = await browser.new_page(viewport={"width": 375, "height": 812})
        m.set_default_timeout(60000)
        await login(m)
        await open_feed(m)
        pressed, count = await repost_state(m, 0)
        if pressed or count > 0:
            await m.locator('article button:has-text("Repost")').nth(0).click()
            await m.wait_for_timeout(2000)
            pressed, count = await repost_state(m, 0)
        print(f"[M1] mobile baseline: pressed={pressed}")
        assert not pressed

        await m.locator('article button:has-text("Repost")').nth(0).click()
        await m.wait_for_timeout(2000)
        pressed = await m.locator('article button:has-text("Repost")').nth(0).get_attribute("aria-pressed")
        summary = await m.locator('article').nth(0).locator('text=/\\d+ repost/').count()
        print(f"[M2] mobile after repost: pressed={pressed}, summary={summary}")
        assert pressed == "true" and summary >= 1
        await m.screenshot(path=PNG_M)

        await m.locator('article button:has-text("Repost")').nth(0).click()
        await m.wait_for_timeout(2000)
        pressed = await m.locator('article button:has-text("Repost")').nth(0).get_attribute("aria-pressed")
        print(f"[M3] mobile after undo: pressed={pressed}")
        assert pressed == "false"
        await m.close()

        await browser.close()
        print("TASK 67 PROD: ALL PASS")


asyncio.run(main())

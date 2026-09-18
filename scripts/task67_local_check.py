"""Task 67 local E2E: repost interactions are counted and displayed.

Scenarios:
1. login -> Feed -> first post Repost button starts unpressed (count 0)
2. click Repost -> toast "Reposted!", button aria-pressed=true,
   summary row shows "1 repost", button label shows the count
3. reload -> state persisted from DB (still pressed, count still 1)
4. click Repost again -> undo (aria-pressed=false, count back to 0)
5. API probe on the 2nd post: toggle on -> {reposted:true, repostsCount:1},
   toggle off -> {reposted:false, repostsCount:0}
"""
import asyncio
import re
import sys
from playwright.async_api import async_playwright

BASE = "http://localhost:3000"
EMAIL = "sarah_mitchell@seed.circub.test"
PW = "seed-account-no-login-2026"
PNG_A = "/home/z/my-project/download/task67-repost-active.png"
PNG_B = "/home/z/my-project/download/task67-repost-undo.png"


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

        # Feed tab
        await page.locator('button[aria-label="Feed"]:visible').first.click()
        await page.wait_for_timeout(3500)
        await kill_portal(page)
        n_articles = await page.locator("article").count()
        print(f"feed articles: {n_articles}")
        assert n_articles >= 2, "need at least 2 posts"

        # [1] normalize any leftover state, then assert clean baseline
        pressed, count = await repost_state(page, 0)
        if pressed or count > 0:
            print(f"[1] normalizing leftover state: pressed={pressed}, count={count}")
            await page.locator('article button:has-text("Repost")').nth(0).click()
            await page.wait_for_timeout(1500)
            pressed, count = await repost_state(page, 0)
        print(f"[1] baseline repost state: pressed={pressed}, count={count}")
        assert not pressed and count == 0, f"expected clean baseline, got pressed={pressed} count={count}"

        # [2] click -> reposted, count 1, toast, summary row
        await page.locator('article button:has-text("Repost")').nth(0).click()
        await page.wait_for_timeout(1500)
        toast = await page.locator('text=Reposted!').count()
        pressed, count = await repost_state(page, 0)
        summary = await page.locator('article').nth(0).locator('text=/\\d+ repost/').count()
        print(f"[2] after click: toast={toast}, pressed={pressed}, count={count}, summary-row={summary}")
        assert toast >= 1, "Reposted! toast missing"
        assert pressed and count == 1, f"expected pressed with count 1, got pressed={pressed} count={count}"
        assert summary >= 1, "summary row does not show the repost count"
        await page.screenshot(path=PNG_A)

        # [3] reload -> persisted (reload lands on default Local tab, so re-enter Feed)
        await page.reload(wait_until="domcontentloaded")
        await page.wait_for_timeout(3500)
        await kill_portal(page)
        await page.locator('button[aria-label="Feed"]:visible').first.click()
        await page.wait_for_timeout(3000)
        pressed, count = await repost_state(page, 0)
        print(f"[3] after reload: pressed={pressed}, count={count} (expect persisted true/1)")
        assert pressed and count == 1, f"state not persisted: pressed={pressed} count={count}"

        # [4] undo
        await page.locator('article button:has-text("Repost")').nth(0).click()
        await page.wait_for_timeout(1500)
        pressed, count = await repost_state(page, 0)
        print(f"[4] after undo: pressed={pressed}, count={count} (expect false/0)")
        assert not pressed and count == 0, f"undo failed: pressed={pressed} count={count}"
        await page.screenshot(path=PNG_B)

        # [5] API probe on the 2nd post
        pid = await page.evaluate(
            """async () => {
                const r = await fetch('/api/posts');
                const d = await r.json();
                return (d.posts && d.posts[1] && d.posts[1].id) || null;
            }"""
        )
        assert pid, "no second post for API probe"
        res = await page.evaluate(
            """async (pid) => {
                const on = await (await fetch(`/api/posts/${pid}/repost`, { method: 'POST' })).json();
                const off = await (await fetch(`/api/posts/${pid}/repost`, { method: 'POST' })).json();
                return { on, off };
            }""",
            pid,
        )
        print(f"[5] API toggle on: {res['on']}  off: {res['off']}")
        assert res["on"].get("reposted") is True and res["on"].get("repostsCount") == 1
        assert res["off"].get("reposted") is False and res["off"].get("repostsCount") == 0

        await browser.close()
        print("TASK 67 LOCAL: ALL PASS")


asyncio.run(main())

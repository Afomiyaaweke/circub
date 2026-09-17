"""Task 61 — E2E upload verification v2.
Photo + small video (pass-through) + big video (>3MB, MediaRecorder re-encode)
+ avatar. Uses exact selectors, resets composer state between steps, then
verifies posts via /api/posts as ground truth."""
import asyncio, json, urllib.request
from playwright.async_api import async_playwright

BASE = "http://localhost:3000"
EMAIL = "sarah_mitchell@seed.circub.test"
PASSWORD = "seed-account-no-login-2026"
OUT = "/home/z/my-project/download"

async def remove_preview_if_any(page):
    await page.evaluate("""() => {
        const x = document.querySelector('button[aria-label="Remove"]');
        if (x) x.click();
    }""")
    await page.wait_for_timeout(400)

async def upload_and_wait(page, file_path, kind, prev_len, timeout=70000):
    """kind: 'image' | 'video'. Waits until the preview src length changes from prev_len."""
    sel = 'input[accept*="video/mp4"]' if kind == 'video' else 'input[accept*="image/png"]'
    await page.locator(sel).first.set_input_files(file_path)
    async def cur():
        return await page.evaluate(f"""() => {{
            const v = document.querySelector('video[src^="data:{kind}"]');
            const i = document.querySelector('img[alt="Preview"]');
            const el = v || i;
            return el && el.src ? {{ p: el.src.slice(0, 22), len: el.src.length }} : null;
        }}""")
    for _ in range(timeout // 500):
        st = await cur()
        if st and st["len"] != prev_len:
            return st
        await page.wait_for_timeout(500)
    return None

async def main():
    fails = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
        ctx = await browser.new_context(viewport={"width": 375, "height": 812}, is_mobile=True)
        page = await ctx.new_page()
        page.set_default_timeout(30000)
        await page.goto(BASE, wait_until="domcontentloaded")
        await page.wait_for_timeout(3500)
        await page.locator('button:has-text("Sign in")').first.click()
        await page.wait_for_timeout(700)
        dlg = page.locator('[role="dialog"]')
        await dlg.locator('input[type="email"]').fill(EMAIL)
        await dlg.locator('input[type="password"]').fill(PASSWORD)
        await dlg.locator('input[type="checkbox"]').check()
        await dlg.locator('button:has-text("Sign in")').click()
        await page.wait_for_timeout(3000)
        await page.evaluate("() => document.querySelectorAll('nextjs-portal').forEach(e => e.remove())")
        await page.locator('nav[aria-label="Primary"] button[aria-label="Feed"]').click(force=True)
        await page.wait_for_timeout(2200)

        async def open_composer():
            await page.evaluate("() => document.querySelectorAll('nextjs-portal').forEach(e => e.remove())")
            await page.locator('button:has-text("Start a post")').first.click()
            await page.wait_for_timeout(600)
            await remove_preview_if_any(page)

        async def submit(text):
            await page.fill('textarea[placeholder^="Share an update"]', text)
            btn = page.get_by_role("button", name="Post", exact=True)
            await btn.click()
            await page.wait_for_timeout(2800)

        # ---- 1. photo
        print("1. photo upload")
        await open_composer()
        st = await upload_and_wait(page, "/tmp/test-up.png", "image", 0)
        print("   preview:", st)
        if not st or "data:image" not in st["p"]: fails.append("photo preview missing")
        await submit("Testing photo upload v44")
        if await page.locator("text=Upload failed").count(): fails.append("photo toast")

        # ---- 2. small video (pass-through)
        print("2. small video (21KB pass-through)")
        await open_composer()
        st = await upload_and_wait(page, "/tmp/small.mp4", "video", 0)
        print("   preview:", st)
        if not st or "data:video" not in st["p"]: fails.append("small video preview missing")
        else: small_len = st["len"]
        await submit("Testing small video upload v44")
        if await page.locator("text=Upload failed").count(): fails.append("small video toast")

        # ---- 3. big video (re-encode path)
        print("3. big video 3.9MB (MediaRecorder re-encode)")
        await open_composer()
        st = await upload_and_wait(page, "/tmp/big11.mp4", "video", small_len, timeout=90000)
        print("   preview:", st)
        if not st or "data:video" not in st["p"]: fails.append("big video preview missing")
        await submit("Testing big video re-encode v44")
        toast = await page.locator("text=Upload failed").count()
        if toast: fails.append("big video toast")

        # ---- 4. avatar
        print("4. avatar upload")
        await page.locator('nav[aria-label="Primary"] button[aria-label="Profile"]').click(force=True)
        await page.wait_for_timeout(2000)
        await page.evaluate("() => document.querySelectorAll('nextjs-portal').forEach(e => e.remove())")
        await page.locator('button:has-text("Edit profile")').first.click()
        await page.wait_for_timeout(1200)
        await page.locator('input[accept*="image/png"]').first.set_input_files("/tmp/test-up.png")
        await page.wait_for_timeout(2500)
        if await page.locator("text=Upload failed").count(): fails.append("avatar toast")
        else: print("   avatar ok")

        await page.screenshot(path=f"{OUT}/task61-feed-videos.png")
        await browser.close()

    # ---- ground truth via API
    req = urllib.request.Request(BASE + "/api/posts?limit=40")
    posts = json.load(urllib.request.urlopen(req))
    if isinstance(posts, dict): posts = posts.get("posts", [])
    mine = [p for p in posts if "v44" in p.get("content", "")]
    print("\nposts created with v44 media:", len(mine))
    for p in mine:
        img = p.get("imageUrl") or ""
        print("  -", p["content"][:44], "| media:", img[:26] + "..." if img else "none", "| dataURL len:", len(img))
    if len(mine) < 3: fails.append(f"expected 3 v44 posts, found {len(mine)}")
    if len(mine) >= 3 and not (mine[2].get("imageUrl") or "").startswith("data:video"): fails.append("3rd post media is not video")

    print("\nRESULT:", "FAIL: " + "; ".join(fails) if fails else "ALL UPLOAD PATHS PASS")

asyncio.run(main())

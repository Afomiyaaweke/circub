"""Task 63 local E2E: Deactivate account button next to Sign out.

Flow on localhost:3000 with a disposable seed account:
1. login -> header menu shows "Deactivate account" directly above "Sign out"
2. open modal -> empty reason must keep the submit button disabled
3. quick-reason chip fills the textarea -> submit -> confirmation screen with
   a pre-filled mailto to support@tenetbid.com containing the reason
4. Done -> signed out (landing page)
5. log back in with the same account -> blocked with the deactivation message
6. ground truth: User.deactivatedAt set + ContactMessage row created
"""
import asyncio
import sqlite3
from playwright.async_api import async_playwright

BASE = "http://localhost:3000"
EMAIL = "selam_bekele@seed.circub.test"
PW = "seed-account-no-login-2026"
DB = "/home/z/my-project/db/custom.db"
REASON = "Too many notifications"

MENU_PNG = "/home/z/my-project/download/task63-menu.png"
MODAL_PNG = "/home/z/my-project/download/task63-modal.png"
DONE_PNG = "/home/z/my-project/download/task63-done.png"


async def kill_portal(page):
    await page.evaluate(
        "document.querySelectorAll('nextjs-portal').forEach(e => e.remove())"
    )


async def login(page):
    await page.goto(BASE, wait_until="domcontentloaded", timeout=60000)
    await page.wait_for_timeout(3000)
    kill_portal(page)
    await page.locator('button:has-text("Sign in")').first.click()
    dlg = page.locator('[role="dialog"]')
    await dlg.wait_for(state="visible", timeout=15000)
    await dlg.locator('input[type="email"]').fill(EMAIL)
    await dlg.locator('input[type="password"]').fill(PW)
    await dlg.locator('input[type="checkbox"]').check()
    await dlg.locator('button:has-text("Sign in")').last.click()
    await page.wait_for_timeout(4000)
    kill_portal(page)


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={"width": 1280, "height": 800})

        # 1) login
        await login(page)
        avatar_btn = page.locator('header button').filter(has=page.locator('img, svg')).last
        # open the profile dropdown (chevron next to avatar) — click the last header button
        await page.locator('header button').nth(-1).click()
        await page.wait_for_timeout(800)
        menu = page.locator('div', has=page.locator('text=Deactivate account'))
        deact = page.locator('button:has-text("Deactivate account")')
        signout = page.locator('button:has-text("Sign out")')
        print(f"menu buttons -> deactivate: {await deact.count()}, signout: {await signout.count()}")
        order_ok = False
        if await deact.count() and await signout.count():
            db_box = await deact.bounding_box()
            so_box = await signout.bounding_box()
            order_ok = db_box and so_box and db_box["y"] < so_box["y"]
            print(f"deactivate directly above sign out: {order_ok} (y {db_box['y']:.0f} < {so_box['y']:.0f})")
        await page.screenshot(path=MENU_PNG)

        # 2) open modal, check empty-reason gating
        await deact.first.click()
        modal = page.locator('[role="dialog"]')
        await modal.wait_for(state="visible", timeout=10000)
        await page.wait_for_timeout(500)
        submit_btn = modal.locator('button:has-text("Deactivate account")')
        done_dialog = page.locator('[role="dialog"]').filter(has=page.locator('text=Account deactivated'))
        print(f"modal open: True, submit disabled when empty reason: {await submit_btn.is_disabled()}")
        await page.screenshot(path=MODAL_PNG)

        # 3) quick-reason chip -> submit
        await modal.locator(f'button:has-text("{REASON}")').click()
        await page.wait_for_timeout(300)
        ta = modal.locator("textarea")
        print(f"chip filled textarea: {(await ta.input_value()) == REASON}")
        print(f"submit enabled after reason: {not await submit_btn.is_disabled()}")
        await submit_btn.click()
        await page.wait_for_timeout(2500)

        # done screen + mailto check
        mail_link = done_dialog.locator('a:has-text("Also open the email in my mail app")')
        done_shown = await done_dialog.count() > 0
        print(f"done screen shown: {done_shown}")
        if not done_shown:
            errs = await modal.locator('[role="alert"], .text-destructive, [data-sonner-toast]').all_inner_texts()
            print(f"modal still in form state; visible errors: {errs[:3]}")
        if await mail_link.count():
            href = await mail_link.get_attribute("href")
            print(f"mailto -> support: {'support@tenetbid.com' in href}, reason included: {REASON in href}")
        await page.screenshot(path=DONE_PNG)

        # 4) Done -> signed out
        await done_dialog.locator('button:has-text("Done")').click()
        await page.wait_for_timeout(3500)
        body = await page.inner_text("body")
        print(f"signed out (landing visible): {'Sign in' in body or 'Sign up' in body}")

        # 5) try to log back in -> blocked
        await page.locator('button:has-text("Sign in")').first.click()
        dlg = page.locator('[role="dialog"]')
        await dlg.wait_for(state="visible", timeout=15000)
        await dlg.locator('input[type="email"]').fill(EMAIL)
        await dlg.locator('input[type="password"]').fill(PW)
        await dlg.locator('input[type="checkbox"]').check()
        await dlg.locator('button:has-text("Sign in")').last.click()
        await page.wait_for_timeout(2500)
        blocked = await dlg.locator('text=This account has been deactivated').count()
        print(f"login blocked with deactivation message: {blocked > 0}")
        await browser.close()

    # 6) DB ground truth
    db = sqlite3.connect(DB)
    u = db.execute("SELECT name, deactivatedAt, deactivationReason FROM User WHERE email=?", (EMAIL,)).fetchone()
    print(f"user row: name={u[0]}, deactivatedAt={u[1]}, reason={u[2]!r}")
    cm = db.execute(
        "SELECT name, email, subject, message FROM ContactMessage WHERE email=? AND subject='Account deactivation request' ORDER BY id DESC LIMIT 1",
        (EMAIL,),
    ).fetchone()
    if cm:
        print(f"contact inbox row: {cm[0]} <{cm[1]}> subject={cm[2]!r}")
        print(f"  message contains reason: {REASON in cm[3]}, contains email: {EMAIL in cm[3]}")
    else:
        print("!! NO ContactMessage row for deactivation")


if __name__ == "__main__":
    asyncio.run(main())

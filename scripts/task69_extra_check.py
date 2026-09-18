#!/usr/bin/env python3
"""Task 69 extra: dark landing full page + contact header fix verification."""
from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"
SHOTS = "/home/z/my-project/download"

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_context(viewport={"width": 1280, "height": 900}).new_page()
    page.set_default_timeout(60000)
    page.goto(BASE, wait_until="domcontentloaded")
    page.wait_for_timeout(4500)
    page.evaluate("document.querySelectorAll('nextjs-portal').forEach(e => e.remove())")
    page.locator('button[aria-label*="mode" i]').first.click()
    page.wait_for_timeout(800)
    # full landing page in dark (hero + social proof + CTA + footer)
    page.screenshot(path=f"{SHOTS}/task69-local-landing-dark-full.png", full_page=True)
    # footer bg should be light (background token in dark) with dark text
    fb = page.evaluate("getComputedStyle(document.querySelector('footer')).backgroundColor")
    print("footer bg (dark mode):", fb)

    # contact header stays dark navy
    page.goto(BASE + "/contact", wait_until="domcontentloaded")
    page.wait_for_timeout(2500)
    hb = page.evaluate("getComputedStyle(document.querySelector('header')).backgroundColor")
    hcolor = page.evaluate("getComputedStyle(document.querySelector('header h1')).color")
    print("contact header bg:", hb, "| h1 color:", hcolor)
    page.screenshot(path=f"{SHOTS}/task69-local-contact-dark-fixed.png")
    browser.close()

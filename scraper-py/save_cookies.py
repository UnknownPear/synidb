# save_cookies.py
from playwright.sync_api import sync_playwright

URL = "https://www.ebay.com/sch/i.html?_nkw=iphone+13"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=False)   # show a window so you can pass any challenge
    ctx = browser.new_context()                    # <-- FIX: context from browser
    page = ctx.new_page()
    page.goto(URL, wait_until="domcontentloaded")
    # Give it time to finish the JS challenge and load results
    page.wait_for_timeout(6000)
    # Optional: wait for at least one result link to confirm we're past the splash
    try:
        page.wait_for_selector(".s-item__link, li.s-item a", timeout=10000)
    except Exception:
        pass
    ctx.storage_state(path="storage_state.json")
    browser.close()

print("Saved cookies to storage_state.json")

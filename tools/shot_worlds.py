"""Quick screenshot harness: capture any world's hero (and optionally a
scrolled state + click state) in real headless Chromium for visual iteration."""
import os
import sys
import os as _os
_pw = _os.path.abspath(_os.path.join(_os.path.dirname(__file__), "..", "..", ".pw-browsers"))
if _os.path.isdir(_pw):
    _os.environ["PLAYWRIGHT_BROWSERS_PATH"] = _pw
from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:5189/"
OUT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "research"))
os.makedirs(OUT, exist_ok=True)

WORLDS = sys.argv[1].split(",") if len(sys.argv) > 1 else ["spatial-architecture", "luxury-alcove"]

errors = []
with sync_playwright() as p:
    browser = p.chromium.launch(args=["--ignore-gpu-blocklist", "--use-gl=angle"])
    ctx = browser.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=1)
    page = ctx.new_page()
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(f"PAGEERROR: {e}"))
    page.goto(URL, wait_until="load", timeout=45000)
    page.wait_for_selector("body.is-loaded", timeout=20000)
    page.wait_for_timeout(1200)
    for world in WORLDS:
        page.evaluate("(w) => window.scrollTo(0, 0) || document.querySelector(`[data-set-world='${w}']`)?.click()", world)
        page.wait_for_timeout(2800)
        page.mouse.move(820, 420)
        page.wait_for_timeout(400)
        tag = world.split("-")[0]
        page.screenshot(path=os.path.join(OUT, f"shot_{tag}.png"))
        # scrolled state
        page.evaluate("window.scrollTo({ top: window.innerHeight * 1.1, behavior: 'instant' })")
        page.wait_for_timeout(900)
        page.screenshot(path=os.path.join(OUT, f"shot_{tag}_scrolled.png"))
        page.evaluate("window.scrollTo(0, 0)")
        page.wait_for_timeout(400)
    ctx.close()
    browser.close()

print("console errors:", [e for e in errors if "GPU stall" not in e][:6] or "none")
print("saved to", OUT)

"""Render the live demo in real headless Chromium and screenshot the cutout
regions, to confirm transparent PNGs composite cleanly (no checkerboard) in a
real browser as opposed to the Glass IDE preview."""
import os
import os as _os
_pw = _os.path.abspath(_os.path.join(_os.path.dirname(__file__), "..", "..", ".pw-browsers"))
if _os.path.isdir(_pw):
    _os.environ["PLAYWRIGHT_BROWSERS_PATH"] = _pw
from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:8137/"
OUT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "assets"))


def shot(page, world_idx, selector, name):
    btns = page.query_selector_all('nav[aria-label="Style world switcher"] button')
    btns[world_idx].click()
    page.wait_for_timeout(1400)
    el = page.query_selector(selector)
    el.scroll_into_view_if_needed()
    page.wait_for_timeout(600)
    el.screenshot(path=os.path.join(OUT, name))
    print(f"  {name} <- world {world_idx} {selector}", flush=True)


with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1500, "height": 950}, device_scale_factor=1)
    pg.goto(URL, wait_until="networkidle")
    pg.wait_for_timeout(800)
    shot(pg, 1, ".ed-spread", "_verify_ed_spread.png")
    shot(pg, 2, ".rc-hero", "_verify_rc_hero.png")
    shot(pg, 3, ".lx-product", "_verify_lx_product.png")
    shot(pg, 3, ".lx-room", "_verify_lx_room.png")
    b.close()
    print("verify done", flush=True)

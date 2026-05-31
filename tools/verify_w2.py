"""Deep-check World 02 Editorial: loupe lens, contents TOC count-up, drop cap."""
import os
from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:5189/"
OUT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "research"))


def run():
    errors = []
    with sync_playwright() as p:
        b = p.chromium.launch(args=["--ignore-gpu-blocklist", "--use-gl=angle", "--use-angle=d3d11"])
        pg = b.new_page()
        pg.set_viewport_size({"width": 1440, "height": 900})
        pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        pg.on("pageerror", lambda e: errors.append(f"PAGEERROR: {e}"))
        pg.goto(URL, wait_until="load", timeout=45000)
        pg.wait_for_timeout(1800)
        pg.evaluate("()=>{const el=document.querySelector(\"button[data-set-world='editorial-interference']\"); if(el) el.click();}")
        pg.wait_for_timeout(800)
        pg.mouse.move(700, 420); pg.mouse.move(720, 440)  # park lens over hero
        pg.wait_for_timeout(500)
        pg.screenshot(path=os.path.join(OUT, "w2_hero_lens.png"))

        # contents TOC + count-up
        pg.evaluate("()=>window.scrollTo(0, document.querySelector('.ed-contents').offsetTop - 120)")
        pg.wait_for_timeout(1700)
        pages = pg.evaluate("()=>Array.from(document.querySelectorAll('.ed-toc-page b')).map(b=>b.textContent)")
        print("TOC pages:", pages, flush=True)
        pg.screenshot(path=os.path.join(OUT, "w2_contents.png"))

        # drop cap present
        cap = pg.evaluate("()=>{const el=document.querySelector('.ed-dropcap'); return el?getComputedStyle(el,'::first-letter').color:null;}")
        print("dropcap color:", cap, flush=True)
        b.close()
    print("CONSOLE ERRORS:", errors[:10] if errors else "none", flush=True)


if __name__ == "__main__":
    run()

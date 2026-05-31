"""Deep-check World 03 Ritual: checklist persistence, stamp + confetti + counter."""
import os
import sys
from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:5189/"
OUT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "research"))


def run():
    errors = []
    failures = []
    with sync_playwright() as p:
        b = p.chromium.launch(args=["--ignore-gpu-blocklist", "--use-gl=angle", "--use-angle=d3d11"])
        pg = b.new_page()
        pg.set_viewport_size({"width": 1440, "height": 900})
        pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        pg.on("pageerror", lambda e: errors.append(f"PAGEERROR: {e}"))
        pg.goto(URL, wait_until="load", timeout=45000)
        pg.wait_for_timeout(1600)
        # clear any prior stamps first
        pg.evaluate("()=>{try{localStorage.removeItem('coollanding-stamps');localStorage.removeItem('coollanding-rituals');}catch(e){} document.querySelectorAll('.rc-stamp,.rc-confetti').forEach(n=>n.remove());}")
        pg.evaluate("()=>{if(typeof setWorld==='function') setWorld('ritual-craft',{skipScroll:true}); else {const el=document.querySelector(\"button[data-set-world='ritual-craft']\"); if(el) el.click();}}")
        pg.wait_for_timeout(800)

        # click two stickers to stamp
        stickers = pg.query_selector_all(".rc-sticker")
        if len(stickers) >= 2:
            stickers[0].click(force=True); pg.wait_for_timeout(250)
            stickers[1].click(force=True); pg.wait_for_timeout(250)
        stampCount = pg.evaluate("()=>{const e=document.querySelector('[data-stamp-count]'); return e?e.textContent:null;}")
        stampNodes = pg.evaluate("()=>document.querySelectorAll('.rc-stamp').length")
        stampScope = pg.evaluate("""()=>({
            total: document.querySelectorAll('.rc-stamp').length,
            inWorld: document.querySelectorAll('#ritual-craft .rc-stamp').length,
            bodyDirect: [...document.body.children].filter(n=>n.classList && n.classList.contains('rc-stamp')).length,
        })""")
        print(f"stamps placed: count={stampCount} dom={stampNodes}", flush=True)
        print("stamp scope:", stampScope, flush=True)
        if stampCount != "2" or stampNodes != 2:
            failures.append(f"expected 2 stamps, got count={stampCount} dom={stampNodes}")
        if stampScope["total"] != stampScope["inWorld"] or stampScope["bodyDirect"] != 0:
            failures.append(f"stamps leaked outside ritual world: {stampScope}")
        pg.screenshot(path=os.path.join(OUT, "w3_stamps.png"))

        # Switch away: stamps must not remain visible in other worlds.
        pg.evaluate("()=>{if(typeof setWorld==='function') setWorld('editorial-interference',{skipScroll:true}); else document.querySelector(\"button[data-set-world='editorial-interference']\")?.click();}")
        pg.wait_for_timeout(500)
        leak = pg.evaluate("""()=>({
            world: document.body.getAttribute('data-world'),
            visibleStamps: [...document.querySelectorAll('.rc-stamp')].filter(n => n.getClientRects().length > 0).length,
            visibleConfetti: [...document.querySelectorAll('.rc-confetti')].filter(n => n.getClientRects().length > 0).length,
        })""")
        print("after switching away:", leak, flush=True)
        if leak["visibleStamps"] or leak["visibleConfetti"]:
            failures.append(f"ritual stickers visible outside World 03: {leak}")
        pg.evaluate("()=>{if(typeof setWorld==='function') setWorld('ritual-craft',{skipScroll:true}); else document.querySelector(\"button[data-set-world='ritual-craft']\")?.click();}")
        pg.wait_for_timeout(500)

        # tick checklist items
        pg.evaluate("()=>window.scrollTo(0, document.querySelector('.rc-checklist-section').offsetTop - 150)")
        pg.wait_for_timeout(500)
        items = pg.query_selector_all(".rc-check")
        if len(items) >= 2:
            items[0].click(); pg.wait_for_timeout(200)
            items[1].click(); pg.wait_for_timeout(200)
        done = pg.evaluate("()=>{const e=document.querySelector('[data-ritual-done]'); return e?e.textContent:null;}")
        print(f"checklist done: {done}", flush=True)
        pg.screenshot(path=os.path.join(OUT, "w3_checklist.png"))

        # reload -> persistence check
        pg.reload(wait_until="load"); pg.wait_for_timeout(1500)
        pg.evaluate("()=>{if(typeof setWorld==='function') setWorld('ritual-craft',{skipScroll:true}); else {const el=document.querySelector(\"button[data-set-world='ritual-craft']\"); if(el) el.click();}}")
        pg.wait_for_timeout(700)
        persisted = pg.evaluate("()=>{const s=document.querySelector('[data-stamp-count]'); const d=document.querySelector('[data-ritual-done]'); return {stamps:s?s.textContent:null, done:d?d.textContent:null};}")
        print("after reload:", persisted, flush=True)
        if persisted.get("stamps") != "2" or persisted.get("done") != "2":
            failures.append(f"persistence mismatch: {persisted}")
        b.close()
    print("CONSOLE ERRORS:", errors[:10] if errors else "none", flush=True)
    if errors or failures:
        print("VERDICT: NEEDS REVIEW", failures, flush=True)
        return 1
    print("VERDICT: PASS", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(run())

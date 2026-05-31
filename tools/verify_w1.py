"""Deep-check World 01 Cinematic: hero, scroll-reactive shader, new sections."""
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
        pg.wait_for_timeout(2000)
        # ensure cinematic
        pg.evaluate("()=>{const el=document.querySelector(\"button[data-set-world='cinematic-dark']\"); if(el) el.click();}")
        pg.wait_for_timeout(800)
        pg.mouse.move(700, 400); pg.mouse.move(950, 520)
        pg.wait_for_timeout(400)
        pg.screenshot(path=os.path.join(OUT, "w1_hero.png"))

        # scroll to chapter 02 (orbit readout) and check bars move
        pg.evaluate("()=>window.scrollTo(0, document.querySelector('.cn-orbit').offsetTop - 80)")
        pg.wait_for_timeout(900)
        orbit = pg.evaluate("""()=>{
            const bar=document.querySelector('[data-orbit-bar=\"orbit\"]');
            const camz=document.querySelector('[data-orbit-camz]');
            const part=document.querySelector('[data-orbit-particles]');
            return {orbitW: bar?bar.style.width:null, camz: camz?camz.textContent:null, particles: part?part.textContent:null};
        }""")
        print("orbit readout:", orbit, flush=True)
        pg.screenshot(path=os.path.join(OUT, "w1_orbit.png"))

        # scroll to stat band, check count-up ran
        pg.evaluate("()=>window.scrollTo(0, document.querySelector('.cn-stats').offsetTop - 200)")
        pg.wait_for_timeout(1700)
        stats = pg.evaluate("()=>Array.from(document.querySelectorAll('.cn-stat b')).map(b=>b.textContent)")
        print("stats:", stats, flush=True)
        pg.screenshot(path=os.path.join(OUT, "w1_stats.png"))

        # pipeline ladder
        pg.evaluate("()=>window.scrollTo(0, document.querySelector('.cn-pipeline').offsetTop - 120)")
        pg.wait_for_timeout(800)
        pg.screenshot(path=os.path.join(OUT, "w1_pipeline.png"))

        # is WebGL2 active (not 2D fallback)?
        gl = pg.evaluate("""()=>{const c=document.querySelector('#signal-field'); try{return !!c.getContext('webgl2')||'has-ctx';}catch(e){return 'err';}}""")
        print("signal-field webgl2:", gl, flush=True)
        b.close()
    print("CONSOLE ERRORS:", errors[:10] if errors else "none", flush=True)


if __name__ == "__main__":
    run()

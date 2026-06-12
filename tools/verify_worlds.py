"""Sanity-check that all eight worlds boot + render + react after the build."""
import os
import sys
import os as _os
_pw = _os.path.abspath(_os.path.join(_os.path.dirname(__file__), "..", "..", ".pw-browsers"))
if _os.path.isdir(_pw):
    _os.environ["PLAYWRIGHT_BROWSERS_PATH"] = _pw
from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:5189/"
OUT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "research"))
WORLDS = [
    "cinematic-dark", "editorial-interference", "ritual-craft", "luxury-alcove",
    "spatial-architecture", "festival-kinetic", "papercraft-tactile", "generative-system",
]


def set_world(page, world):
    page.evaluate(
        """(world)=>{
            if (typeof setWorld === "function") {
              setWorld(world, { skipScroll: true });
            } else {
              const el = document.querySelector(`button[data-set-world="${world}"]`);
              if (el) el.click();
            }
            document.documentElement.style.scrollBehavior = "auto";
            document.body.style.scrollBehavior = "auto";
            window.scrollTo({top: 0, left: 0, behavior: "instant"});
            window.dispatchEvent(new Event("scroll"));
        }""",
        world,
    )


def primitive_state(page, world):
    return page.evaluate(
        """(w)=>{
            const root = document.getElementById(w);
            if (!root) return {count:0, cards:0, visible:false, title:null, inViewport:false};
            const blocks = root.querySelectorAll("[data-skill-primitives]");
            const block = blocks[0];
            if (!block) return {count:0, cards:0, visible:false, title:null, inViewport:false};
            const r = block.getBoundingClientRect();
            const cs = getComputedStyle(block);
            const cardRects = [...block.querySelectorAll("article")].map((el) => {
              const cr = el.getBoundingClientRect();
              return {left: cr.left, right: cr.right, width: cr.width, height: cr.height};
            });
            return {
              count: blocks.length,
              cards: cardRects.length,
              visible: cs.display !== "none" && cs.visibility !== "hidden" && r.width > 0 && r.height > 0,
              inViewport: r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth,
              horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
              rect: {top: r.top, left: r.left, right: r.right, width: r.width, height: r.height},
              cardRects,
              title: block.querySelector("h2")?.textContent.trim() || null,
              kicker: block.querySelector(".skill-kicker")?.textContent.trim() || null
            };
        }""",
        world,
    )


def scroll_to_primitives(page, world):
    page.evaluate(
        """(w)=>{
            const block = document.getElementById(w)?.querySelector("[data-skill-primitives]");
            if (!block) return;
            const y = block.getBoundingClientRect().top + scrollY - 88;
            window.scrollTo({top: Math.max(0, y), left: 0, behavior: "instant"});
            window.dispatchEvent(new Event("scroll"));
        }""",
        world,
    )


def run():
    os.makedirs(OUT, exist_ok=True)
    errors = []
    failures = []
    with sync_playwright() as p:
        b = p.chromium.launch(args=["--ignore-gpu-blocklist", "--use-gl=angle", "--use-angle=d3d11"])
        pg = b.new_page()
        pg.set_viewport_size({"width": 1440, "height": 900})
        pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        pg.on("pageerror", lambda e: errors.append(f"PAGEERROR: {e}"))
        pg.goto(URL, wait_until="load", timeout=45000)
        pg.wait_for_timeout(2200)

        for w in WORLDS:
            set_world(pg, w)
            pg.wait_for_timeout(700)
            pg.mouse.move(720, 420)
            pg.mouse.move(900, 540)
            pg.wait_for_timeout(400)
            dw = pg.evaluate("()=>document.body.getAttribute('data-world')")
            vis = pg.evaluate(
                "(w)=>{const s=document.getElementById(w); if(!s) return 'no-section'; return getComputedStyle(s).display;}", w)
            primitives = primitive_state(pg, w)
            pg.screenshot(path=os.path.join(OUT, f"world_{w}.png"))
            scroll_to_primitives(pg, w)
            pg.wait_for_timeout(250)
            primitives_view = primitive_state(pg, w)
            pg.screenshot(path=os.path.join(OUT, f"world_{w}_primitives.png"))
            print(f"[{w}] data-world={dw} section.display={vis} primitives={primitives}", flush=True)
            if dw != w or vis != "block":
                failures.append({w: {"dataWorld": dw, "display": vis}})
            if primitives["count"] != 1 or primitives["cards"] < 3 or not primitives["visible"]:
                failures.append({w: {"primitives": primitives}})
            if not primitives_view["inViewport"] or primitives_view["horizontalOverflow"]:
                failures.append({w: {"primitiveLayout": primitives_view}})

        pg.set_viewport_size({"width": 390, "height": 844})
        for w in WORLDS:
            set_world(pg, w)
            pg.wait_for_timeout(450)
            scroll_to_primitives(pg, w)
            pg.wait_for_timeout(250)
            mobile = primitive_state(pg, w)
            pg.screenshot(path=os.path.join(OUT, f"world_{w}_mobile_primitives.png"))
            print(f"[mobile:{w}] primitives={mobile}", flush=True)
            if mobile["count"] != 1 or mobile["cards"] < 3 or not mobile["visible"] or not mobile["inViewport"] or mobile["horizontalOverflow"]:
                failures.append({f"mobile:{w}": {"primitives": mobile}})

        pg.set_viewport_size({"width": 1440, "height": 900})

        # generative checks
        set_world(pg, "generative-system")
        pg.wait_for_timeout(900)
        gen = pg.evaluate("""()=>{
            const c=document.querySelector('[data-gen-count]');
            const seed=document.querySelector('[data-gen-seed]');
            return {count: c?c.textContent:null, seed: seed?seed.textContent:null, url: location.search};
        }""")
        print("generative:", gen, flush=True)
        # shuffle changes seed
        pre = gen.get("seed")
        pg.evaluate("()=>{const el=document.querySelector('[data-gen-shuffle]'); if(el) el.click();}")
        pg.wait_for_timeout(500)
        post = pg.evaluate("()=>{const s=document.querySelector('[data-gen-seed]'); return s?s.textContent:null;}")
        print(f"shuffle: {pre} -> {post} (changed={pre!=post})", flush=True)

        # papercraft path: scroll the section and confirm traveler moves
        set_world(pg, "papercraft-tactile")
        pg.wait_for_timeout(700)
        sec = pg.evaluate("()=>{const s=document.querySelector('[data-paper-path]'); return s?s.offsetTop:0;}")
        pg.evaluate("(y)=>window.scrollTo(0,y)", sec + 700)
        pg.wait_for_timeout(500)
        trav = pg.evaluate("""()=>{
            const t=document.querySelector('[data-paper-traveler]');
            const sticky=document.querySelector('.pc-path-sticky');
            if(!t) return null;
            const r=t.getBoundingClientRect();
            const sr=sticky?sticky.getBoundingClientRect():null;
            return {
              left:t.style.left, top:t.style.top,
              rect:{top:r.top,bottom:r.bottom,left:r.left,right:r.right,width:r.width,height:r.height},
              stickyTop: sr ? sr.top : null,
              visible: r.bottom>0 && r.top<innerHeight && r.right>0 && r.left<innerWidth
            };
        }""")
        on = pg.evaluate("()=>document.querySelectorAll('.pc-step.is-on').length")
        print(f"papercraft traveler: {trav} steps-on={on}", flush=True)
        pg.screenshot(path=os.path.join(OUT, "world_papercraft-tactile_path.png"))

        b.close()
    print("CONSOLE ERRORS:", errors[:12] if errors else "none", flush=True)
    if errors or failures:
        print("VERDICT: NEEDS REVIEW", failures, flush=True)
        return 1
    print("VERDICT: PASS", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(run())

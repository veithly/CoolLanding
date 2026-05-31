"""Motion parity checks for the CoolLanding multi-world demo.

This is intentionally stricter than a static screenshot pass. It proves each
world has at least one live pointer channel, one scroll/local-state channel, or
one renderer pixel delta that moves in real Chromium.
"""
import math
import os
import sys
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright


URL = "http://127.0.0.1:5189/"
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "research" / "motion"
OUT.mkdir(parents=True, exist_ok=True)


def image_delta(a_path, b_path):
    a = Image.open(a_path).convert("RGB")
    b = Image.open(b_path).convert("RGB")
    if a.size != b.size:
        b = b.resize(a.size)
    px_a = a.load()
    px_b = b.load()
    w, h = a.size
    total = 0
    changed = 0
    samples = 0
    for y in range(0, h, 6):
        for x in range(0, w, 6):
            da = px_a[x, y]
            db = px_b[x, y]
            d = abs(da[0] - db[0]) + abs(da[1] - db[1]) + abs(da[2] - db[2])
            total += d
            changed += 1 if d > 18 else 0
            samples += 1
    return {
        "mean": round(total / max(1, samples) / 3, 3),
        "changed_frac": round(changed / max(1, samples), 4),
    }


def click_world(page, world):
    page.evaluate(
        """(world) => {
            if (typeof setWorld === "function") {
              setWorld(world, { skipScroll: true });
            } else {
              const btn = document.querySelector(`[data-set-world="${world}"]`);
              if (!btn) throw new Error(`Missing switcher for ${world}`);
              btn.click();
            }
            document.documentElement.style.scrollBehavior = "auto";
            document.body.style.scrollBehavior = "auto";
            window.scrollTo({ top: 0, left: 0, behavior: "instant" });
            window.dispatchEvent(new Event("scroll"));
        }""",
        world,
    )
    page.wait_for_timeout(900)


def scroll_doc(page, ratio):
    page.evaluate(
        """(ratio) => {
            const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
            window.scrollTo({ top: max * ratio, left: 0, behavior: "instant" });
            window.dispatchEvent(new Event("scroll"));
        }""",
        ratio,
    )
    page.wait_for_timeout(520)


def scroll_section_progress(page, selector, ratio):
    page.evaluate(
        """([selector, ratio]) => {
            const el = document.querySelector(selector);
            if (!el) throw new Error(`Missing selector ${selector}`);
            const top = el.getBoundingClientRect().top + scrollY;
            const travel = Math.max(1, el.offsetHeight - innerHeight);
            window.scrollTo({ top: top + travel * ratio, left: 0, behavior: "instant" });
            window.dispatchEvent(new Event("scroll"));
        }""",
        [selector, ratio],
    )
    page.wait_for_timeout(520)


def scroll_into(page, selector, extra=0):
    page.evaluate(
        """([selector, extra]) => {
            const el = document.querySelector(selector);
            if (!el) throw new Error(`Missing selector ${selector}`);
            const y = el.getBoundingClientRect().top + scrollY + extra;
            window.scrollTo({ top: y, left: 0, behavior: "instant" });
            window.dispatchEvent(new Event("scroll"));
        }""",
        [selector, extra],
    )
    page.wait_for_timeout(520)


def scroll_center(page, selector, viewport_ratio=0.35):
    page.evaluate(
        """([selector, viewportRatio]) => {
            const el = document.querySelector(selector);
            if (!el) throw new Error(`Missing selector ${selector}`);
            const y = el.getBoundingClientRect().top + scrollY - innerHeight * viewportRatio;
            window.scrollTo({ top: Math.max(0, y), left: 0, behavior: "instant" });
            window.dispatchEvent(new Event("scroll"));
        }""",
        [selector, viewport_ratio],
    )
    page.wait_for_timeout(520)


def sample(page, world):
    return page.evaluate(
        """(world) => {
            const root = document.getElementById(world);
            const css = root ? getComputedStyle(root) : null;
            const val = (el, prop) => el ? getComputedStyle(el)[prop] : null;
            const style = (el, prop) => el ? el.style.getPropertyValue(prop) : null;
            const q = (sel) => root ? root.querySelector(sel) : document.querySelector(sel);
            const count = (sel) => root ? root.querySelectorAll(sel).length : document.querySelectorAll(sel).length;
            const rect = (el) => {
              if (!el) return null;
              const r = el.getBoundingClientRect();
              return { top: r.top, left: r.left, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
            };
            const traveler = q("[data-paper-traveler]");
            const sticky = q(".pc-path-sticky");
            return {
              dataWorld: document.body.getAttribute("data-world"),
              scrollY,
              worldP: css ? css.getPropertyValue("--world-p").trim() : "",
              mx: css ? css.getPropertyValue("--mx").trim() : "",
              my: css ? css.getPropertyValue("--my").trim() : "",
              entering: !!(root && root.classList.contains("is-entering")),
              edPortrait: val(q(".ed-portrait"), "transform"),
              edP: css ? css.getPropertyValue("--ed-p").trim() : "",
              edCurrent: count(".ed-toc-row.is-current"),
              rcTrackP: css ? css.getPropertyValue("--rc-track-p").trim() : "",
              rcTrackTransform: q("[data-ritual-track]") ? q("[data-ritual-track]").style.transform : "",
              rcActive: count(".rc-panel.is-active"),
              lxOrnament: val(q(".lx-ornament-wrap"), "transform"),
              lxActive: count(".lx-room.is-active,.lx-step.is-active"),
              spP: q(".sp-stage") ? q(".sp-stage").style.getPropertyValue("--sp-p").trim() : "",
              spWater: q("[data-spatial-waterline]") ? q("[data-spatial-waterline]").style.getPropertyValue("--sp-water-shift").trim() : "",
              spCurrent: count(".sp-stratum.is-current"),
              fkActive: count(".fk-index a.is-active"),
              fkCardsOn: count(".fk-card.is-on"),
              pcP: q(".pc-path-sticky") ? style(q(".pc-path-sticky"), "--pc-p") : "",
              pcDash: q(".pc-path-svg") ? style(q(".pc-path-svg"), "--pc-dash") : "",
              pcTraveler: traveler ? {
                left: traveler.style.left,
                top: traveler.style.top,
                transform: traveler.style.transform
              } : null,
              pcTravelerRect: rect(traveler),
              pcStickyRect: rect(sticky),
              pcTravelerVisible: traveler ? (() => {
                const r = traveler.getBoundingClientRect();
                const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
                return r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth && !!hit;
              })() : false,
              pcStepsOn: count(".pc-step.is-on"),
              gsControls: val(q(".gs-controls"), "transform"),
              gsP: css ? css.getPropertyValue("--gs-p").trim() : "",
              gsFps: q("[data-gen-fps]") ? q("[data-gen-fps]").textContent : "",
            };
        }""",
        world,
    )


def number(value):
    try:
        return float(str(value).replace("px", "").strip())
    except Exception:
        return math.nan


def require(checks, label, ok, detail):
    checks.append((label, ok, detail))


def run():
    errors = []
    checks = []
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--ignore-gpu-blocklist", "--use-gl=angle", "--use-angle=d3d11"])
        page = browser.new_page(viewport={"width": 1440, "height": 900}, device_scale_factor=1)
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(f"PAGEERROR: {e}"))
        page.goto(URL, wait_until="load", timeout=45000)
        page.wait_for_timeout(1600)

        # Cinematic dark: WebGL pixel field reacts to pointer + click.
        click_world(page, "cinematic-dark")
        c0 = OUT / "cinematic_before.png"
        c1 = OUT / "cinematic_after_click.png"
        page.screenshot(path=str(c0))
        page.mouse.move(420, 330)
        page.wait_for_timeout(160)
        page.mouse.move(980, 520)
        page.mouse.click(980, 520)
        page.wait_for_timeout(760)
        page.screenshot(path=str(c1))
        d = image_delta(c0, c1)
        require(checks, "cinematic WebGL pointer/click pixel delta", d["mean"] > 2.0 and d["changed_frac"] > 0.03, d)

        # Editorial: pointer parallax + scroll-driven contents row.
        click_world(page, "editorial-interference")
        e0 = sample(page, "editorial-interference")
        page.mouse.move(120, 180)
        page.wait_for_timeout(120)
        page.mouse.move(1220, 700)
        page.wait_for_timeout(220)
        e1 = sample(page, "editorial-interference")
        scroll_doc(page, 0.82)
        e2 = sample(page, "editorial-interference")
        require(checks, "editorial pointer transform changes", e0["edPortrait"] != e1["edPortrait"], {"before": e0["edPortrait"], "after": e1["edPortrait"]})
        require(checks, "editorial scroll activates contents", e2["edCurrent"] == 1 and number(e2["edP"]) > 0.2, e2)

        # Ritual: pinned horizontal track and active panel.
        click_world(page, "ritual-craft")
        scroll_section_progress(page, ".rc-track-section", 0.56)
        r = sample(page, "ritual-craft")
        require(checks, "ritual horizontal scroll state", number(r["rcTrackP"]) > 0.15 and "translate3d" in r["rcTrackTransform"], r)
        require(checks, "ritual active panel", r["rcActive"] == 1, r)

        # Luxury: pointer drift and active room/step state.
        click_world(page, "luxury-alcove")
        l0 = sample(page, "luxury-alcove")
        page.mouse.move(200, 240)
        page.wait_for_timeout(120)
        page.mouse.move(1180, 620)
        page.wait_for_timeout(220)
        l1 = sample(page, "luxury-alcove")
        scroll_center(page, ".lx-room", 0.34)
        l2 = sample(page, "luxury-alcove")
        require(checks, "luxury pointer ornament drift", l0["lxOrnament"] != l1["lxOrnament"], {"before": l0["lxOrnament"], "after": l1["lxOrnament"]})
        require(checks, "luxury room state activates", l2["lxActive"] >= 1, l2)

        # Spatial: waterline and stratum emphasis respond to scroll.
        click_world(page, "spatial-architecture")
        scroll_doc(page, 0.45)
        s1 = sample(page, "spatial-architecture")
        scroll_into(page, ".sp-stratum", -240)
        s2 = sample(page, "spatial-architecture")
        require(checks, "spatial scroll variables update", number(s1["spWater"]) > 8 or number(s1["spP"]) > 0.05, s1)
        require(checks, "spatial stratum state activates", s2["spCurrent"] >= 1, s2)

        # Festival: live chapter index and staged cards.
        click_world(page, "festival-kinetic")
        scroll_into(page, ".fk-grid", -260)
        f = sample(page, "festival-kinetic")
        require(checks, "festival chapter index active", f["fkActive"] == 1, f)
        require(checks, "festival cards assemble on scroll", f["fkCardsOn"] >= 2, f)

        # Papercraft: SVG path traveler moves and path draw var updates.
        click_world(page, "papercraft-tactile")
        p0 = sample(page, "papercraft-tactile")
        scroll_into(page, "[data-paper-path]", 700)
        p1 = sample(page, "papercraft-tactile")
        require(checks, "papercraft path progress", number(p1["pcP"]) > 0.15 and p1["pcDash"], p1)
        require(checks, "papercraft traveler moves", p0["pcTraveler"] != p1["pcTraveler"] and p1["pcStepsOn"] == 1, {"before": p0, "after": p1})
        require(checks, "papercraft traveler visible in sticky stage",
                p1["pcTravelerVisible"] and p1["pcTravelerRect"]["top"] > 80 and p1["pcTravelerRect"]["bottom"] < 780
                and abs(p1["pcStickyRect"]["top"]) < 2,
                p1)

        # Generative: renderer pixel field changes with pointer/click and readout runs.
        click_world(page, "generative-system")
        g0 = OUT / "generative_before.png"
        g1 = OUT / "generative_after_pointer.png"
        page.screenshot(path=str(g0))
        page.mouse.move(300, 420)
        page.wait_for_timeout(180)
        page.mouse.move(1040, 500)
        page.mouse.click(1040, 500)
        page.wait_for_timeout(900)
        page.screenshot(path=str(g1))
        gd = image_delta(g0, g1)
        g = sample(page, "generative-system")
        require(checks, "generative pointer/click pixel delta", gd["mean"] > 1.5 and gd["changed_frac"] > 0.025, gd)
        require(checks, "generative live readout", number(g["gsFps"]) > 0, g)

        browser.close()

    failed = [(label, detail) for (label, ok, detail) in checks if not ok]
    for label, ok, detail in checks:
        print(f"{'PASS' if ok else 'FAIL'} {label}: {detail}", flush=True)
    print("CONSOLE ERRORS:", errors[:12] if errors else "none", flush=True)
    if errors or failed:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(run())

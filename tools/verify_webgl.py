"""Verify the rebuilt Cinematic-Dark WebGL hero in real headless Chromium:
- no shader/program/framebuffer console errors,
- the WebGL2 pipeline path is active (not the 2D fallback),
- the canvas renders non-blank, colourful output,
- it reacts to pointer move + click (shock impulse).
Saves before/after screenshots for visual inspection.
"""
import os
from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:5189/"
OUT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "research"))
os.makedirs(OUT, exist_ok=True)

PROBE = """() => {
  const c = document.querySelector('#signal-field');
  if (!c) return { found: false };
  // if a 2D context can still be acquired, the WebGL2 path did NOT take over
  let twoD = false; try { twoD = !!c.getContext('2d'); } catch (e) {}
  return { found: true, w: c.width, h: c.height, is2dFallback: twoD,
           world: document.body.getAttribute('data-world') };
}"""


def analyze(path):
    from PIL import Image
    im = Image.open(path).convert("RGB")
    w, h = im.size
    px = im.load()
    # sample the hero band (top 70% of screen)
    n, dark, bright, hot, lum_sum, mn, mx = 0, 0, 0, 0, 0.0, 255, 0
    rs = gs = bs = 0
    for y in range(0, int(h * 0.7), 7):
        for x in range(0, w, 7):
            r, g, b = px[x, y]
            l = 0.2126 * r + 0.7152 * g + 0.0722 * b
            lum_sum += l; n += 1
            rs += r; gs += g; bs += b
            if l < 18:
                dark += 1
            if l > 40:
                bright += 1
            if l > 210:
                hot += 1
            mn = min(mn, int(l)); mx = max(mx, int(l))
    return {"mean_lum": round(lum_sum / max(n, 1), 1), "dark_frac": round(dark / max(n, 1), 3),
            "bright_frac": round(bright / max(n, 1), 3), "hot_frac": round(hot / max(n, 1), 3),
            "min": mn, "max": mx, "avg_rgb": (rs // max(n, 1), gs // max(n, 1), bs // max(n, 1))}


def delta(a_path, b_path):
    from PIL import Image
    a = Image.open(a_path).convert("RGB")
    b = Image.open(b_path).convert("RGB")
    if a.size != b.size:
        b = b.resize(a.size)
    px_a, px_b = a.load(), b.load()
    w, h = a.size
    total = changed = samples = 0
    for y in range(0, int(h * 0.7), 7):
        for x in range(0, w, 7):
            aa, bb = px_a[x, y], px_b[x, y]
            d = abs(aa[0] - bb[0]) + abs(aa[1] - bb[1]) + abs(aa[2] - bb[2])
            total += d
            changed += 1 if d > 18 else 0
            samples += 1
    return {"mean": round(total / max(samples, 1) / 3, 3), "changed_frac": round(changed / max(samples, 1), 4)}


def run():
    errors, warns = [], []
    with sync_playwright() as p:
        browser = p.chromium.launch(args=[
            "--ignore-gpu-blocklist", "--use-gl=angle", "--use-angle=d3d11",
        ])
        ctx = browser.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=1)
        page = ctx.new_page()
        page.on("console", lambda m: (errors if m.type == "error" else warns).append(m.text))
        page.on("pageerror", lambda e: errors.append(f"PAGEERROR: {e}"))
        page.goto(URL, wait_until="load", timeout=45000)
        page.wait_for_timeout(2600)            # let loader finish + a few sim frames

        probe1 = page.evaluate(PROBE)
        page.screenshot(path=os.path.join(OUT, "webgl_hero.png"))

        # exercise interaction: sweep the pointer, then click for a shock
        for x in (500, 760, 1000, 720):
            page.mouse.move(x, 430)
            page.wait_for_timeout(160)
        page.mouse.click(720, 430)
        page.wait_for_timeout(900)
        page.screenshot(path=os.path.join(OUT, "webgl_after_click.png"))

        ctx.close()
        browser.close()

    a1 = analyze(os.path.join(OUT, "webgl_hero.png"))
    a2 = analyze(os.path.join(OUT, "webgl_after_click.png"))
    d12 = delta(os.path.join(OUT, "webgl_hero.png"), os.path.join(OUT, "webgl_after_click.png"))
    gl_errors = [e for e in errors if any(k in e.lower() for k in
                 ("shader", "program", "framebuffer", "webgl", "gl_"))]
    fellback = any("WebGL shader fallback" in w for w in warns) or probe1.get("is2dFallback")
    print("PROBE:", probe1, flush=True)
    print("HERO :", a1, flush=True)
    print("CLICK:", a2, flush=True)
    print("DELTA:", d12, flush=True)
    print("WebGL2 pipeline active:", (not fellback), flush=True)
    print("warns:", [w for w in warns if "fallback" in w.lower() or "webgl" in w.lower()][:5] or "none", flush=True)
    print("shader/gl errors:", gl_errors if gl_errors else "none", flush=True)
    print("other console errors:", [e for e in errors if e not in gl_errors][:5] or "none", flush=True)
    # Guard both ends: nonblank and reactive, but still a black-stage hero rather
    # than a washed-out fog layer.
    verdict = (probe1.get("found") and not fellback and not gl_errors
               and 0.04 < a1["bright_frac"] < 0.32 and a1["dark_frac"] > 0.42
               and 18 <= a1["mean_lum"] <= 70 and a1["hot_frac"] < 0.16
               and a1["max"] > 120 and d12["mean"] > 1.2 and d12["changed_frac"] > 0.02)
    print("VERDICT:", "PASS" if verdict else "NEEDS REVIEW", flush=True)


if __name__ == "__main__":
    run()

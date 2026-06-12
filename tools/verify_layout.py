"""Layout regression checks for viewport-specific visual bugs."""
import os
import sys
from pathlib import Path

import os as _os
_pw = _os.path.abspath(_os.path.join(_os.path.dirname(__file__), "..", "..", ".pw-browsers"))
if _os.path.isdir(_pw):
    _os.environ["PLAYWRIGHT_BROWSERS_PATH"] = _pw
from playwright.sync_api import sync_playwright


URL = "http://127.0.0.1:5189/"
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "research"
OUT.mkdir(parents=True, exist_ok=True)


def run():
    failures = []
    errors = []
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--ignore-gpu-blocklist", "--use-gl=angle", "--use-angle=d3d11"])
        page = browser.new_page(viewport={"width": 1280, "height": 640}, device_scale_factor=1)
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(f"PAGEERROR: {e}"))
        page.goto(URL, wait_until="load", timeout=45000)
        page.evaluate(
            """() => {
                if (typeof setWorld === "function") setWorld("editorial-interference", { skipScroll: true });
                document.documentElement.style.scrollBehavior = "auto";
                document.body.style.scrollBehavior = "auto";
                window.scrollTo({ top: 0, left: 0, behavior: "instant" });
                window.dispatchEvent(new Event("scroll"));
            }"""
        )
        page.wait_for_timeout(900)
        page.mouse.move(160, 220)
        page.wait_for_timeout(250)
        data = page.evaluate(
            """() => {
                const rect = (selector) => {
                  const el = document.querySelector(selector);
                  if (!el) return null;
                  const r = el.getBoundingClientRect();
                  return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
                };
                return {
                  innerWidth,
                  scrollWidth: document.documentElement.scrollWidth,
                  headline: rect(".ed-headline"),
                  headlineWrap: rect(".ed-headline-wrap"),
                  portrait: rect(".ed-portrait"),
                  topbar: rect(".topbar"),
                  text: document.querySelector(".ed-headline")?.innerText || "",
                };
            }"""
        )
        page.screenshot(path=str(OUT / "editorial_layout_1280.png"))
        browser.close()

    if errors:
        failures.append({"consoleErrors": errors[:8]})
    if data["scrollWidth"] > data["innerWidth"] + 1:
        failures.append({"horizontalOverflow": data})
    for key in ("headline", "headlineWrap", "topbar"):
        box = data.get(key)
        if not box:
            failures.append({key: "missing"})
        elif box["x"] < -1 or box["right"] > data["innerWidth"] + 1:
            failures.append({key: box})
    if data.get("headline") and data["headline"]["height"] > 430:
        failures.append({"headlineTooTall": data["headline"]})
    if "White space is the layout." not in data.get("text", ""):
        failures.append({"headlineText": data.get("text", "")})

    print("EDITORIAL_LAYOUT_1280:", data, flush=True)
    print("CONSOLE ERRORS:", errors[:8] if errors else "none", flush=True)
    if failures:
        print("VERDICT: NEEDS REVIEW", failures, flush=True)
        return 1
    print("VERDICT: PASS", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(run())

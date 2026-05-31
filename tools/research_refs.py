"""Download + analyze the reference sites' real front-end.

For each site: load it in headless Chromium, save every JS/CSS response to disk,
detect which libraries are live on `window`, scan the bundles for GLSL shader code
and technique keywords (bloom, render targets, curl noise, scroll engines), and
screenshot. Output lands in research/refs/<site>/ with _libs.json + _scan.json.
"""
import os, re, json, hashlib
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright

OUT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "research", "refs"))

SITES = {
    "sidewave": "https://sidewave.it/#origin",
    "activetheory": "https://activetheory.net/",
    "blitstudio": "https://blit.studio/",
    "remoterituals": "https://remote-rituals.framer.website/",
    "aircenter":         "https://aircenter.space/",
    "razorpay-sprint26": "https://razorpay.com/sprint/26/",
    "aimees-papercraft": "https://aimees-papercraft-world.com/",
    "cartier-ww":        "https://www.cartier.com/en-fr/watchesandwonders",
    "active-theory":     "https://activetheory.net/",
}

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")

GLSL = re.compile(r"gl_FragColor|gl_Position|void\s+main\s*\(\s*\)|texture2D\(|"
                  r"varying\s+(?:high|med|low)p|uniform\s+(?:float|vec[234]|sampler|mat[234])")
KEYS = ["THREE", "WebGLRenderTarget", "EffectComposer", "UnrealBloomPass", "ShaderPass",
        "curlNoise", "curl(", "snoise", "simplex", "fbm", "raymarch", "rayMarch",
        "gpgpu", "GPUComputation", "FBO", "pingpong", "ping-pong",
        "gsap", "ScrollTrigger", "Lenis", "lenis", "LocomotiveScroll", "locomotive",
        "PIXI", "ogl", "p5.", "barba", "Howler", "Howl", "AudioContext",
        "RawShaderMaterial", "ShaderMaterial", "InstancedMesh", "Points(",
        "RenderTarget", "DataTexture", "draco", "DRACO", "GLTFLoader", "Reflector",
        "createShader", "useFrame", "drei", "@react-three", "framer-motion"]

WINDOW_PROBE = """() => {
  const w = window, f = {};
  ['THREE','gsap','ScrollTrigger','Lenis','lenis','PIXI','ogl','p5','barba',
   'LocomotiveScroll','Stats','dat','Howl','Howler','SplitType','imagesLoaded'
  ].forEach(k => { try { if (w[k] !== undefined) f[k] = typeof w[k]; } catch(e){} });
  const cv = [...document.querySelectorAll('canvas')].map(c => {
    let ctx = 'none';
    try { if (c.getContext('webgl2')) ctx='webgl2'; else if (c.getContext('webgl')) ctx='webgl'; } catch(e){}
    return { w: c.width, h: c.height, cls: (c.className||'').slice(0,60), ctx };
  });
  return { libs: f, canvases: cv,
           scripts: [...document.querySelectorAll('script[src]')].map(s => s.src).slice(0,80) };
}"""


def fname(url):
    p = urlparse(url)
    base = os.path.basename(p.path) or "index"
    base = re.sub(r"[^A-Za-z0-9_.-]", "_", base)[-60:]
    h = hashlib.md5(url.encode()).hexdigest()[:8]
    if not base.endswith((".js", ".mjs", ".css")):
        base += ".js"
    return f"{h}_{base}"


def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--ignore-gpu-blocklist", "--use-gl=swiftshader"])
        for name, url in SITES.items():
            d = os.path.join(OUT, name)
            os.makedirs(d, exist_ok=True)
            ctx = browser.new_context(user_agent=UA, viewport={"width": 1440, "height": 900},
                                      ignore_https_errors=True, locale="en-US")
            page = ctx.new_page()
            saved = []

            def on_response(resp):
                try:
                    u = resp.url
                    ct = resp.headers.get("content-type", "")
                    is_code = (u.split("?")[0].endswith((".js", ".mjs", ".css"))
                               or "javascript" in ct or "text/css" in ct)
                    if not is_code:
                        return
                    body = resp.body()
                    if len(body) > 12_000_000:
                        return
                    with open(os.path.join(d, fname(u)), "wb") as fh:
                        fh.write(body)
                    saved.append((u, len(body)))
                except Exception:
                    pass

            page.on("response", on_response)
            status = "ok"
            try:
                page.goto(url, wait_until="domcontentloaded", timeout=45000)
                try:
                    page.wait_for_load_state("networkidle", timeout=25000)
                except Exception:
                    pass
                page.mouse.move(720, 450)
                for y in (600, 1400, 2600, 4200):
                    page.evaluate(f"window.scrollTo(0,{y})")
                    page.wait_for_timeout(700)
                page.wait_for_timeout(2500)
            except Exception as e:
                status = f"goto-fail: {e}"

            try:
                probe = page.evaluate(WINDOW_PROBE)
            except Exception as e:
                probe = {"error": str(e)}
            try:
                with open(os.path.join(d, "_page.html"), "w", encoding="utf-8") as fh:
                    fh.write(page.content())
            except Exception:
                pass
            try:
                page.screenshot(path=os.path.join(d, "_shot.png"))
            except Exception:
                pass

            # scan saved bundles for GLSL + technique keywords
            report = {}
            for fn in os.listdir(d):
                if not fn.endswith((".js", ".mjs", ".css")):
                    continue
                try:
                    txt = open(os.path.join(d, fn), "r", encoding="utf-8", errors="ignore").read()
                except Exception:
                    continue
                hits = sorted({k for k in KEYS if k in txt})
                glsl = bool(GLSL.search(txt))
                if hits or glsl:
                    report[fn] = {"size": len(txt), "glsl": glsl, "hits": hits}
            probe["_status"] = status
            probe["_assets_saved"] = len(saved)
            with open(os.path.join(d, "_libs.json"), "w", encoding="utf-8") as fh:
                json.dump(probe, fh, indent=2)
            with open(os.path.join(d, "_scan.json"), "w", encoding="utf-8") as fh:
                json.dump(report, fh, indent=2)
            libs = probe.get("libs", {})
            print(f"[{name}] status={status} assets={len(saved)} libs={list(libs)} "
                  f"canvases={len(probe.get('canvases', []))} code_files_flagged={len(report)}", flush=True)
            ctx.close()
        browser.close()
    print("research done", flush=True)


if __name__ == "__main__":
    run()

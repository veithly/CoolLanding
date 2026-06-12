"""Find a Chromium launch config that exposes WebGL2 + EXT_color_buffer_float
(needed to render to FLOAT/HALF_FLOAT targets) so we can validate the real
particle+bloom pipeline rather than the 2D fallback."""
import os as _os
_pw = _os.path.abspath(_os.path.join(_os.path.dirname(__file__), "..", "..", ".pw-browsers"))
if _os.path.isdir(_pw):
    _os.environ["PLAYWRIGHT_BROWSERS_PATH"] = _pw
from playwright.sync_api import sync_playwright

PAGE = "data:text/html,<canvas id=c></canvas>"
PROBE = """() => {
  const c = document.getElementById('c');
  const gl = c.getContext('webgl2');
  if (!gl) return { webgl2: false };
  const cbf = gl.getExtension('EXT_color_buffer_float');
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'n/a';
  // actually try to make a HALF_FLOAT RGBA16F render target complete
  let rtOk = false;
  try {
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA16F,8,8,0,gl.RGBA,gl.HALF_FLOAT,null);
    const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER,f);
    gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,t,0);
    rtOk = gl.checkFramebufferStatus(gl.FRAMEBUFFER)===gl.FRAMEBUFFER_COMPLETE;
  } catch(e) {}
  return { webgl2: true, color_buffer_float: !!cbf, rt16f_complete: rtOk, renderer };
}"""

CONFIGS = [
    ("headless default", True, []),
    ("headless angle d3d11", True, ["--use-gl=angle", "--use-angle=d3d11"]),
    ("headless angle gl", True, ["--use-gl=angle", "--use-angle=gl"]),
    ("headless egl", True, ["--use-gl=egl"]),
    ("headed default", False, []),
    ("headed angle d3d11", False, ["--use-gl=angle", "--use-angle=d3d11"]),
]


def run():
    with sync_playwright() as p:
        for name, headless, args in CONFIGS:
            try:
                b = p.chromium.launch(headless=headless, args=args + ["--ignore-gpu-blocklist"])
                pg = b.new_page()
                pg.goto(PAGE)
                r = pg.evaluate(PROBE)
                b.close()
                print(f"[{name}] {r}", flush=True)
            except Exception as e:
                print(f"[{name}] ERROR {e}", flush=True)


if __name__ == "__main__":
    run()

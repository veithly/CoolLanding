"""Pull GLSL shader snippets out of the (minified) reference bundles so we can
actually read how they light/animate things. We look for shader signatures and
dump a readable window around each, un-escaping \\n, into _shaders.txt per site."""
import os, re, json

REFS = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "research", "refs"))
SIG = re.compile(r"void\s+main\s*\(|gl_FragColor|gl_Position|precision\s+(?:high|medi|low)p|"
                 r"curlNoise|snoise|fbm\(|texture2D\(|UnrealBloom|EffectComposer|new\s+Reflector")
TECH = ["UnrealBloomPass", "EffectComposer", "Reflector", "curlNoise", "GPUComputationRenderer",
        "WebGLRenderTarget", "setRenderTarget", "Lenis", "LocomotiveScroll", "barba",
        "ScrollTrigger", "OffscreenCanvas", "createImageBitmap", "DRACOLoader"]


def windows(txt, idx, pre=240, post=900):
    a = max(0, idx - pre); b = min(len(txt), idx + post)
    s = txt[a:b].replace("\\n", "\n").replace("\\t", "  ")
    return s


def run():
    for site in sorted(os.listdir(REFS)):
        d = os.path.join(REFS, site)
        if not os.path.isdir(d):
            continue
        out, seen, tech_counts = [], set(), {}
        for fn in sorted(os.listdir(d)):
            if not fn.endswith((".js", ".mjs", ".css")):
                continue
            try:
                txt = open(os.path.join(d, fn), "r", encoding="utf-8", errors="ignore").read()
            except Exception:
                continue
            for t in TECH:
                c = txt.count(t)
                if c:
                    tech_counts[t] = tech_counts.get(t, 0) + c
            # skip dumping GLSL from the three.js/ogl library files themselves (too noisy);
            # keep them only for tech counts. Heuristic: library files are huge + named.
            libish = any(k in fn for k in ("three.module", "GLTFLoader", "draco", "rive.min",
                                           "DRACOLoader", "BufferGeometryUtils", "ScrollTrigger",
                                           "gsap.min", "vendor.module"))
            if libish:
                continue
            for m in SIG.finditer(txt):
                w = windows(txt, m.start())
                key = w[:60]
                if key in seen:
                    continue
                seen.add(key)
                out.append(f"\n--- [{fn}] @{m.start()} ({m.group(0).strip()}) ---\n{w}\n")
                if len(out) > 60:
                    break
        with open(os.path.join(d, "_shaders.txt"), "w", encoding="utf-8") as fh:
            fh.write(f"# tech counts: {json.dumps(tech_counts, indent=2)}\n")
            fh.write("".join(out))
        print(f"[{site}] tech={tech_counts} snippets={len(out)}", flush=True)
    print("extract done", flush=True)


if __name__ == "__main__":
    run()

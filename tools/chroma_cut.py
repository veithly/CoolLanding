"""Chroma-key isolation for CoolLanding demo assets.

Why this exists
---------------
Matting a subject out of a busy *generated* scene (rembg on a full studio shot)
leaves halos and eats into the subject (误伤). The reliable, industry-standard
fix is to (re)generate each asset on a single uniform high-contrast backdrop and
then key that *known* color out with a soft color-distance matte + despill.

Pipeline per asset
------------------
1. Euclidean color-distance matte against the known backdrop color.
   alpha = smoothstep(distance, t_low, t_high)  ->  near backdrop = transparent.
2. Despill: remove backdrop color that bled onto subject edges
   (green-key vs magenta/violet-key handled generically by channel dominance).
3. Optional 1px erode (MinFilter) to bite off the last hard fringe pixel.
4. Light feather (gaussian) on the alpha so edges composite smoothly.
5. Autocrop to the opaque bounding box (+pad) and save <name>-cut.png.

Originals are never overwritten; outputs are <name>-cut.png next to them.
"""
import os
import numpy as np
from PIL import Image, ImageFilter

ASSETS = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "assets"))

# backdrop colors used when regenerating (must match the prompt!)
GREEN = (0, 177, 64)      # #00B140 chroma green
MAGENTA = (229, 0, 126)   # #E5007E  (use when subject contains green, e.g. emerald)
VIOLET = (122, 31, 162)   # #7A1FA2  (sticker pack: avoids all sticker hues)

# name -> dict(backdrop, t_low, t_high, erode, feather, pad, bottom_trim)
CONFIG = {
    "luxury-watch-macro.png":        dict(bg=GREEN,   t_low=70,  t_high=135, erode=1, feather=0.7, pad=12),
    "luxury-jewelry-tray.png":       dict(bg=MAGENTA, t_low=80,  t_high=150, erode=1, feather=0.7, pad=12),
    "luxury-ceremony.png":           dict(bg=GREEN,   t_low=72,  t_high=140, erode=1, feather=0.8, pad=12),
    "luxury-score.png":              dict(bg=GREEN,   t_low=70,  t_high=135, erode=1, feather=0.7, pad=10),
    "editorial-portrait-halftone.png": dict(bg=GREEN, t_low=65,  t_high=130, erode=1, feather=0.7, pad=10),
    "editorial-still-life.png":      dict(bg=GREEN,   t_low=65,  t_high=130, erode=1, feather=0.7, pad=10),
    "editorial-marks.png":           dict(bg=GREEN,   t_low=60,  t_high=120, erode=0, feather=0.5, pad=8),
    "ritual-doodles.png":            dict(bg=GREEN,   t_low=60,  t_high=120, erode=0, feather=0.5, pad=8),
    "ritual-stickers.png":           dict(bg=VIOLET,  t_low=85,  t_high=150, erode=1, feather=0.6, pad=10),
}


def smoothstep(x, lo, hi):
    t = np.clip((x - lo) / max(hi - lo, 1e-6), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def despill(rgb, bg, alpha):
    """Generic backdrop despill, GATED to the soft edge ring only.

    Spill (backdrop color bleeding onto the subject) lives where the subject
    mixes with the backdrop, i.e. partially-transparent edge pixels. We weight
    the correction by (1-alpha) so fully-opaque interior pixels are never
    touched -- otherwise a genuinely pink/red subject gets desaturated (误伤).
    """
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    br, bg_, bb = bg
    w = np.clip(1.0 - alpha, 0.0, 1.0)      # edge ring = 1, interior = 0
    out = rgb.copy()
    if bg_ >= br and bg_ >= bb:            # GREEN-dominant key
        cap = np.maximum(r, b)
        out[..., 1] = g + (np.minimum(g, cap) - g) * w
    else:                                   # MAGENTA / VIOLET key (R&B high, G low)
        excess = np.clip(0.5 * (r + b) - g, 0, None)
        out[..., 0] = r - excess * 0.9 * w
        out[..., 2] = b - excess * 0.9 * w
    return np.clip(out, 0, 255)


def autocrop(img, pad, alpha_thresh=8):
    a = np.array(img)[..., 3]
    ys, xs = np.where(a > alpha_thresh)
    if len(xs) == 0:
        return img
    l, r = max(xs.min() - pad, 0), min(xs.max() + pad + 1, img.width)
    t, b = max(ys.min() - pad, 0), min(ys.max() + pad + 1, img.height)
    return img.crop((l, t, r, b))


def cut(name, cfg):
    path = os.path.join(ASSETS, name)
    if not os.path.exists(path):
        print(f"  -- skip (missing): {name}", flush=True)
        return
    img = Image.open(path).convert("RGB")
    arr = np.asarray(img).astype(np.float32)
    bg = np.array(cfg["bg"], dtype=np.float32)

    dist = np.sqrt(((arr - bg) ** 2).sum(axis=-1))
    alpha = smoothstep(dist, cfg["t_low"], cfg["t_high"])  # 0 bg .. 1 subject

    rgb = despill(arr, cfg["bg"], alpha)

    a_img = Image.fromarray((alpha * 255).astype(np.uint8), "L")
    if cfg.get("erode", 0):
        for _ in range(cfg["erode"]):
            a_img = a_img.filter(ImageFilter.MinFilter(3))
    if cfg.get("feather", 0):
        a_img = a_img.filter(ImageFilter.GaussianBlur(cfg["feather"]))

    out = Image.fromarray(rgb.astype(np.uint8), "RGB").convert("RGBA")
    out.putalpha(a_img)
    out = autocrop(out, cfg.get("pad", 10))

    out_name = name.replace(".png", "-cut.png")
    out.save(os.path.join(ASSETS, out_name))
    cov = (np.array(a_img) > 16).mean() * 100
    print(f"  ok {out_name:42s} subject~{cov:4.1f}%  ({out.width}x{out.height})", flush=True)


if __name__ == "__main__":
    import sys
    only = set(sys.argv[1:])
    print("Chroma-keying assets...", flush=True)
    for name, cfg in CONFIG.items():
        if only and name not in only:
            continue
        try:
            cut(name, cfg)
        except Exception as e:
            print(f"  !! {name} failed: {e}", flush=True)
    print("done.", flush=True)

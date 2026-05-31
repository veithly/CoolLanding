"""Composite each -cut.png over its world background into one contact sheet so we
can eyeball edge quality (halo / spill / holes) the way the live page shows them."""
import os
from PIL import Image

A = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "assets"))

GROUPS = [
    ("luxury",  (14, 11, 13), [
        "luxury-watch-macro-cut.png", "luxury-jewelry-tray-cut.png",
        "luxury-ceremony-cut.png", "luxury-score-cut.png"]),
    ("editorial", (243, 240, 232), [
        "editorial-portrait-halftone-cut.png", "editorial-still-life-cut.png",
        "editorial-marks-cut.png"]),
    ("ritual",  (212, 180, 140), [
        "ritual-stickers-cut.png", "ritual-doodles-cut.png"]),
]

CELL = 360
PAD = 18


def fit(im, box):
    im = im.copy()
    im.thumbnail((box, box), Image.LANCZOS)
    return im


for gname, bg, names in GROUPS:
    cols = len(names)
    sheet = Image.new("RGB", (cols * (CELL + PAD) + PAD, CELL + 2 * PAD), bg)
    x = PAD
    for n in names:
        p = os.path.join(A, n)
        if not os.path.exists(p):
            x += CELL + PAD
            continue
        im = Image.open(p).convert("RGBA")
        im = fit(im, CELL)
        oy = PAD + (CELL - im.height) // 2
        ox = x + (CELL - im.width) // 2
        sheet.paste(im, (ox, oy), im)
        x += CELL + PAD
    out = os.path.join(A, f"_preview_{gname}.png")
    sheet.save(out)
    print("wrote", out, flush=True)
print("preview done", flush=True)

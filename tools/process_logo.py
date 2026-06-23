"""
Remove the near-black background from the CUVA logo and emit transparent PNGs
+ favicons. The logo is a bright red mark on a near-black field, so we key out
the background using the max RGB channel (which is high for red, ~0 for black)
with a soft threshold ramp to keep clean anti-aliased edges.
"""
from PIL import Image, ImageFilter
import os

SRC = "logo.jpg"
OUT = "assets/img"
os.makedirs(OUT, exist_ok=True)

img = Image.open(SRC).convert("RGB")
px = img.load()
w, h = img.size

# --- Build alpha from "redness/brightness" ---------------------------------
# maxc = max(r,g,b): ~0 for black bg, high for the red mark (even in shaded
# 3D areas the red channel stays well above the background).
LO, HI = 16, 46  # soft ramp: < LO -> transparent, > HI -> opaque
out = Image.new("RGBA", (w, h))
opx = out.load()
for y in range(h):
    for x in range(w):
        r, g, b = px[x, y]
        maxc = max(r, g, b)
        if maxc <= LO:
            a = 0
        elif maxc >= HI:
            a = 255
        else:
            a = int((maxc - LO) / (HI - LO) * 255)
        # Boost saturation slightly so the cutout reads as vivid crimson
        opx[x, y] = (r, g, b, a)

# --- Trim to content bounding box, add small padding -----------------------
bbox = out.getbbox()
if bbox:
    pad = int(0.04 * max(w, h))
    l, t, rr, bb = bbox
    l = max(0, l - pad); t = max(0, t - pad)
    rr = min(w, rr + pad); bb = min(h, bb + pad)
    out = out.crop((l, t, rr, bb))

# Make it square (center on transparent canvas) for clean favicon scaling
cw, ch = out.size
side = max(cw, ch)
square = Image.new("RGBA", (side, side), (0, 0, 0, 0))
square.paste(out, ((side - cw) // 2, (side - ch) // 2), out)

# --- Master logo (high res) ------------------------------------------------
master = square.resize((512, 512), Image.LANCZOS)
master.save(f"{OUT}/logo.png")

# A version with a soft red glow halo for hero usage
glow = Image.new("RGBA", (640, 640), (0, 0, 0, 0))
halo = square.resize((512, 512), Image.LANCZOS)
# build glow: red-tinted blurred silhouette
sil = Image.new("RGBA", halo.size, (0, 0, 0, 0))
sp = sil.load(); hp = halo.load()
for y in range(halo.size[1]):
    for x in range(halo.size[0]):
        a = hp[x, y][3]
        if a > 30:
            sp[x, y] = (255, 30, 35, a)
sil = sil.filter(ImageFilter.GaussianBlur(26))
glow.paste(sil, (64, 64), sil)
glow.paste(halo, (64, 64), halo)
glow.save(f"{OUT}/logo-glow.png")

# --- Favicons / touch icons ------------------------------------------------
for size in (16, 32, 48, 180, 192, 512):
    square.resize((size, size), Image.LANCZOS).save(f"{OUT}/favicon-{size}.png")

# Multi-resolution .ico
ico_sizes = [(16, 16), (32, 32), (48, 48)]
square.resize((64, 64), Image.LANCZOS).save(
    f"{OUT}/favicon.ico", sizes=ico_sizes
)

print("Logo processed. Output size of master:", master.size)
print("Files written to", OUT)

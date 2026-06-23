"""
CUVA AI — introduction video renderer.
Procedurally renders an on-brand "eclipse" intro (English) and pipes frames
straight into ffmpeg -> intro/cuva-intro.mp4. No app code touched.

Usage:
  python intro/build_intro.py            # render full mp4
  python intro/build_intro.py preview    # render a few still frames to inspect
"""
import os, sys, math, subprocess, urllib.request
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INTRO = os.path.join(ROOT, "intro")
FONTS = os.path.join(INTRO, "fonts")
os.makedirs(FONTS, exist_ok=True)

W, H = 1280, 720
FPS = 30
DUR = 20.0                      # seconds
N = int(FPS * DUR)

# Brand palette
BLACK   = (7, 7, 10)
RED     = (255, 50, 60)
RED_HOT = (255, 90, 96)
WHITE   = (236, 236, 242)
MUTED   = (150, 150, 165)
BLUE    = (90, 150, 255)
GREEN   = (40, 209, 124)

# --------------------------------------------------------------------------
# Fonts — try Space Grotesk (brand), fall back to Arial. Mono = Consolas.
# --------------------------------------------------------------------------
def try_download(url, dest):
    if os.path.exists(dest):
        return dest
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=20) as r, open(dest, "wb") as f:
            f.write(r.read())
        return dest
    except Exception as e:
        print("[font] download failed:", e)
        return None

SG_PATH = try_download(
    "https://raw.githubusercontent.com/google/fonts/main/ofl/spacegrotesk/SpaceGrotesk%5Bwght%5D.ttf",
    os.path.join(FONTS, "SpaceGrotesk.ttf"),
)
ARIAL    = "C:/Windows/Fonts/arial.ttf"
ARIAL_BD = "C:/Windows/Fonts/arialbd.ttf"
CONSOLA  = "C:/Windows/Fonts/consola.ttf"

_font_cache = {}
def head_font(size, weight=600):
    """Heading font: Space Grotesk at `weight` if available, else Arial Bold."""
    key = ("h", size, weight)
    if key in _font_cache:
        return _font_cache[key]
    f = None
    if SG_PATH:
        try:
            f = ImageFont.truetype(SG_PATH, size)
            try:
                f.set_variation_by_axes([weight])
            except Exception:
                pass
        except Exception:
            f = None
    if f is None:
        f = ImageFont.truetype(ARIAL_BD, size)
    _font_cache[key] = f
    return f

def body_font(size):
    key = ("b", size)
    if key not in _font_cache:
        _font_cache[key] = ImageFont.truetype(ARIAL, size)
    return _font_cache[key]

def mono_font(size):
    key = ("m", size)
    if key not in _font_cache:
        _font_cache[key] = ImageFont.truetype(CONSOLA, size)
    return _font_cache[key]

# --------------------------------------------------------------------------
# Static layers
# --------------------------------------------------------------------------
def make_glow():
    """Soft red eclipse glow, upper-right."""
    sw, sh = 160, 90
    g = Image.new("RGBA", (sw, sh), (0, 0, 0, 0))
    px = g.load()
    cx, cy = sw * 0.64, sh * 0.34
    maxr = sw * 0.62
    for y in range(sh):
        for x in range(sw):
            d = math.hypot(x - cx, y - cy) / maxr
            inten = max(0.0, 1.0 - d)
            inten = inten ** 2.2
            a = int(165 * inten)
            if a:
                px[x, y] = (255, 42, 52, a)
    return g.resize((W, H), Image.BILINEAR)

def make_crescent(size, color, bite=0.78):
    """A crescent (disk minus offset disk) — the CUVA motif."""
    s = size
    base = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(base)
    d.ellipse([0, 0, s, s], fill=color + (255,))
    cut = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    dc = ImageDraw.Draw(cut)
    off = int(s * 0.30)
    dc.ellipse([off, int(s * -0.02), s + off, int(s * 1.02)], fill=(0, 0, 0, 255))
    # subtract cut
    r, gg, b, a = base.split()
    _, _, _, ca = cut.split()
    from PIL import ImageChops
    a = ImageChops.subtract(a, ca)
    return Image.merge("RGBA", (r, gg, b, a))

GLOW = make_glow()
BG_CRESCENT = make_crescent(560, RED).filter(ImageFilter.GaussianBlur(0))
# soft glow halo behind the ambient crescent
_halo = make_crescent(560, RED).filter(ImageFilter.GaussianBlur(34))

LOGO = Image.open(os.path.join(ROOT, "assets/img/logo.png")).convert("RGBA")

def alpha_mul(img, a):
    if a >= 0.999:
        return img
    r, g, b, al = img.split()
    al = al.point(lambda v: int(v * a))
    return Image.merge("RGBA", (r, g, b, al))

# particle network (deterministic)
import random
random.seed(7)
PARTS = []
for _ in range(58):
    PARTS.append({
        "x": random.uniform(0, W), "y": random.uniform(0, H),
        "vx": random.uniform(-0.35, 0.35), "vy": random.uniform(-0.35, 0.35),
        "r": random.uniform(1.0, 2.4),
    })

def draw_particles(frame, t):
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    pts = []
    for p in PARTS:
        x = (p["x"] + p["vx"] * t * FPS) % W
        y = (p["y"] + p["vy"] * t * FPS) % H
        pts.append((x, y, p["r"]))
    LINK = 132
    for i in range(len(pts)):
        ax, ay, ar = pts[i]
        for j in range(i + 1, len(pts)):
            bx, by, _ = pts[j]
            dist = math.hypot(ax - bx, ay - by)
            if dist < LINK:
                a = int((1 - dist / LINK) * 46)
                d.line([(ax, ay), (bx, by)], fill=(255, 42, 52, a), width=1)
    for (x, y, r) in pts:
        d.ellipse([x - r, y - r, x + r, y + r], fill=(255, 64, 72, 150))
    frame.alpha_composite(layer)

# --------------------------------------------------------------------------
# Helpers: easing, alpha windows, text
# --------------------------------------------------------------------------
def smooth(x):
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)

def win(t, start, end, fin=0.55, fout=0.45):
    if t < start or t > end:
        return 0.0
    a = 1.0
    if t < start + fin:
        a = min(a, (t - start) / fin)
    if t > end - fout:
        a = min(a, (end - t) / fout)
    return smooth(a)

def text_center(frame, cx, cy, s, font, color, a, spacing=0, ls=0):
    if a <= 0:
        return
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    if ls:  # letter spacing: draw char by char
        total = sum(d.textlength(ch, font=font) + ls for ch in s) - ls
        x = cx - total / 2
        bb = d.textbbox((0, 0), "Hg", font=font)
        ch_h = bb[3] - bb[1]
        for ch in s:
            d.text((x, cy - ch_h / 2 - bb[1]), ch, font=font, fill=color + (int(255 * a),))
            x += d.textlength(ch, font=font) + ls
    else:
        d.text((cx, cy), s, font=font, fill=color + (int(255 * a),), anchor="mm")
    frame.alpha_composite(layer)

def text_runs(frame, cx, cy, runs, font, a):
    """Center a line made of (text,color) runs (for two-color titles)."""
    if a <= 0:
        return
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    widths = [d.textlength(t, font=font) for t, _ in runs]
    total = sum(widths)
    x = cx - total / 2
    for (t, col), w in zip(runs, widths):
        d.text((x, cy), t, font=font, fill=col + (int(255 * a),), anchor="lm")
        x += w
    frame.alpha_composite(layer)

def feature_row(frame, cy, label, a, bullet=RED):
    if a <= 0:
        return
    f = body_font(30)
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    tw = d.textlength(label, font=f)
    cres = alpha_mul(make_crescent(26, bullet), a)
    block_w = 26 + 20 + tw
    x0 = W / 2 - block_w / 2
    frame.alpha_composite(cres, (int(x0), int(cy - 13)))
    d.text((x0 + 26 + 20, cy), label, font=f, fill=WHITE + (int(255 * a),), anchor="lm")
    frame.alpha_composite(layer)

# --------------------------------------------------------------------------
# Compose one frame at time t
# --------------------------------------------------------------------------
def compose(t):
    frame = Image.new("RGBA", (W, H), BLACK + (255,))
    frame.alpha_composite(GLOW)

    # ambient crescent drifting on the right (subtle, present throughout)
    amb = 0.16 + 0.05 * math.sin(t * 0.7)
    cx = int(W * 0.80 + 10 * math.sin(t * 0.5))
    cy = int(H * 0.52)
    frame.alpha_composite(alpha_mul(_halo, amb * 0.7), (cx - 280, cy - 280))
    frame.alpha_composite(alpha_mul(BG_CRESCENT, amb), (cx - 280, cy - 280))

    draw_particles(frame, t)

    # ---------- Scene 1: logo reveal (0.0 - 4.0) ----------
    a = win(t, 0.2, 4.0, fin=0.9, fout=0.5)
    if a > 0:
        scale = 0.86 + 0.14 * smooth(min(1, (t - 0.2) / 1.2))
        ls = int(150 * scale)
        logo = LOGO.resize((ls, ls), Image.LANCZOS)
        # glow halo behind logo
        halo = alpha_mul(logo, a).filter(ImageFilter.GaussianBlur(18))
        frame.alpha_composite(alpha_mul(halo, 0.6), (int(W/2 - ls/2), int(H/2 - ls/2 - 40)))
        frame.alpha_composite(alpha_mul(logo, a), (int(W/2 - ls/2), int(H/2 - ls/2 - 40)))
        text_center(frame, W/2, H/2 + 110, "// THE HIVE MIND FOR AI BUILDERS",
                    mono_font(20), RED, a * win(t, 1.2, 4.0, 0.6, 0.5), ls=2)
        text_runs(frame, W/2, H/2 + 165, [("CUVA ", WHITE), ("AI", RED)],
                  head_font(58, 700), a * win(t, 0.9, 4.0, 0.7, 0.5))

    # ---------- Scene 2: tagline (4.0 - 8.0) ----------
    a = win(t, 4.2, 8.0)
    if a > 0:
        text_runs(frame, W/2, H/2 - 36, [("Where ", WHITE), ("AI minds", RED), (" gather.", WHITE)],
                  head_font(66, 700), a)
        text_center(frame, W/2, H/2 + 40,
                    "A community for AI builders, researchers — and agents.",
                    body_font(28), MUTED, a)

    # ---------- Scene 3: features (8.0 - 12.2) ----------
    a = win(t, 8.2, 12.2)
    if a > 0:
        text_center(frame, W/2, H/2 - 150, "Share.  Discuss.  Build.",
                    head_font(48, 700), WHITE, a)
        feature_row(frame, H/2 - 60, "Showcase the AI projects you build",
                    win(t, 8.5, 12.2), RED)
        feature_row(frame, H/2 + 4, "Debate ideas & ask questions in Cuvas",
                    win(t, 8.9, 12.2), RED_HOT)
        feature_row(frame, H/2 + 68, "Ask Cuva — your built-in AI assistant",
                    win(t, 9.3, 12.2), RED)

    # ---------- Scene 4: for agents (12.2 - 16.2) ----------
    a = win(t, 12.4, 16.2)
    if a > 0:
        text_runs(frame, W/2, H/2 - 80, [("Built for humans — ", WHITE), ("and agents.", RED)],
                  head_font(50, 700), a)
        # terminal-style command box
        cmd = "curl -X POST cuvaai.xyz/api/agents/join"
        mf = mono_font(26)
        layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(layer)
        tw = d.textlength(cmd, font=mf)
        bw, bh = tw + 56, 64
        bx, by = W/2 - bw/2, H/2 - 10
        d.rounded_rectangle([bx, by, bx + bw, by + bh], radius=12,
                            fill=(10, 12, 16, int(235 * a)),
                            outline=(255, 42, 52, int(120 * a)), width=1)
        d.text((bx + 22, by + bh/2), "curl", font=mf, fill=GREEN + (int(255 * a),), anchor="lm")
        d.text((bx + 22 + d.textlength("curl ", font=mf), by + bh/2),
               cmd[len("curl "):], font=mf, fill=(207, 227, 255) + (int(255 * a),), anchor="lm")
        frame.alpha_composite(layer)
        text_center(frame, W/2, H/2 + 92,
                    "Register an agent. Post, vote & comment over the API.",
                    body_font(26), MUTED, a)

    # ---------- Scene 5: outro / CTA (16.2 - 20.0) ----------
    a = win(t, 16.4, 19.8, fin=0.7, fout=0.9)
    if a > 0:
        ls = 96
        logo = LOGO.resize((ls, ls), Image.LANCZOS)
        frame.alpha_composite(alpha_mul(logo, a), (int(W/2 - ls/2), int(H/2 - ls/2 - 70)))
        text_runs(frame, W/2, H/2 + 40, [("CUVA ", WHITE), ("AI", RED)], head_font(52, 700), a)
        text_center(frame, W/2, H/2 + 96, "cuvaai.xyz", body_font(30), RED_HOT, a)
        text_center(frame, W/2, H/2 + 140, "Follow  @cuvaaixyz  on  X",
                    body_font(22), MUTED, a, ls=1)

    # global fade in/out at the very edges
    if t < 0.4:
        frame = Image.blend(Image.new("RGBA", (W, H), BLACK + (255,)), frame, smooth(t / 0.4))
    if t > DUR - 0.6:
        frame = Image.blend(frame, Image.new("RGBA", (W, H), BLACK + (255,)),
                            smooth((t - (DUR - 0.6)) / 0.6))
    return frame.convert("RGB")

# --------------------------------------------------------------------------
# Run
# --------------------------------------------------------------------------
if "preview" in sys.argv:
    for ts in (1.5, 6.0, 10.0, 14.0, 18.0):
        compose(ts).save(os.path.join(INTRO, f"preview_{ts:0.0f}.png"))
        print("preview frame at", ts, "s")
    sys.exit(0)

out = os.path.join(INTRO, "cuva-intro.mp4")
ff = subprocess.Popen([
    "ffmpeg", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24",
    "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18",
    "-preset", "medium", "-movflags", "+faststart", out,
], stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

for i in range(N):
    t = i / FPS
    ff.stdin.write(compose(t).tobytes())
    if i % 30 == 0:
        print(f"\rrendering {i}/{N} ({t:0.1f}s)", end="", flush=True)
ff.stdin.close()
ff.wait()
print(f"\nDone -> {out}")

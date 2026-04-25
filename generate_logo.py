#!/usr/bin/env python3
"""
Madrid Film Calendar logo generator.
Tweak the CONFIG section at the top to adjust colors, sizes, fonts, etc.
"""
from PIL import Image, ImageDraw, ImageFont

# ── CONFIG ─────────────────────────────────────────────────────────────────────
OUTPUT = "logo.png"
PAD    = 30              # transparent padding around the whole logo (px)

# Colors (from site CSS variables)
ORANGE      = (193, 87, 40)     # orange tiles background
TILE_BG     = (42, 38, 30)      # dark tile background
TILE_BORDER = (72, 64, 50)      # dark tile outline
CREAM       = (218, 196, 148)   # tile letters + numbers
MADRID_COL  = (166, 156, 135)   # #a69c87 — site's --text-dim
ORANGE_TEXT = (232, 121, 74)    # #e8794a — site's --accent

# Per-letter stroke: maps tile content → (stroke_width, stroke_color)
# Set stroke_width to 0 to disable for a letter.
LETTER_STROKE = {
    "M": (1.2, CREAM),
    "F": (1.2, CREAM),
    "C": (1.2, CREAM),
}

# Wordmark strokes: (stroke_width, stroke_color)
MADRID_STROKE    = (1, MADRID_COL)
FILM_CAL_STROKE  = (1, ORANGE_TEXT)

# Grid
TILE_SIZE     = 92
TILE_GAP      = 9
TILE_PADDING  = 2        # cream padding around each tile (px)

# Font sizes
LETTER_SIZE   = 44
NUMBER_SIZE   = 28
MADRID_SIZE   = 40
MADRID_KERN   = 11          # letter-spacing so MADRID width == "Film Calendar"
FILM_CAL_SIZE = 38

# Fonts
FONT_INTER   = "fonts/Inter-Regular.ttf"
FONT_ITALIC  = "fonts/Newsreader-Italic.ttf"
FONT_BOLD    = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_REG     = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
SVG_CLAPPER  = "assets/clapperboard.svg"
CLAPPER_SIZE  = 65         # rendered px inside the tile
CLAPPER_ANGLE = 15        # rotation in degrees (negative = counter-clockwise)

# Grid config: (style, content)
# style: 'orange' | 'dark'
# content: 'M' | 'F' | 'C' | '1' | '31' | 'clapper' | 'play' | ''
GRID_3x3 = [
    [("dark", "1"),       ("orange", "M"),       ("dark", "")    ],
    [("orange", "F"),     ("dark",   "clapper"),  ("orange", "C") ],
    [("dark", ""),        ("orange", "play"),     ("dark", "31")  ],
]

# 2×2 simplified grid: all orange tiles with cream content
GRID_2x2 = [
    [("orange", "M"),     ("orange", "clapper")],
    [("orange", "F"),     ("orange", "C")      ],
]

GRID = GRID_3x3  # default
# ── END CONFIG ─────────────────────────────────────────────────────────────────

GRID_SPAN = 3 * TILE_SIZE + 2 * TILE_GAP


def load_font(path, size):
    try:
        return ImageFont.truetype(path, size)
    except Exception:
        return ImageFont.load_default()


def draw_rounded_rect(draw, x1, y1, x2, y2, radius, fill, outline=None, width=2):
    draw.rounded_rectangle([x1, y1, x2, y2], radius=radius, fill=fill,
                            outline=outline, width=width)


def centered_text(draw, cx, cy, text, font, color, stroke_width=0, stroke_fill=None):
    bbox = draw.textbbox((0, 0), text, font=font, stroke_width=stroke_width)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.text((cx - tw // 2, cy - th // 2 - bbox[1]), text, fill=color, font=font,
              stroke_width=stroke_width, stroke_fill=stroke_fill or color)


def draw_spaced_text(draw, cx, y, text, font, color, kern, stroke_width=0, stroke_fill=None):
    chars = list(text)
    widths = [draw.textbbox((0, 0), ch, font=font)[2] - draw.textbbox((0, 0), ch, font=font)[0]
              for ch in chars]
    total = sum(widths) + kern * (len(chars) - 1)
    x = cx - total // 2
    for ch, w in zip(chars, widths):
        bb = draw.textbbox((0, 0), ch, font=font)
        draw.text((x, y - bb[1]), ch, fill=color, font=font,
                  stroke_width=stroke_width, stroke_fill=stroke_fill or color)
        x += w + kern


def paste_svg_icon(img, svg_path, tx, ty, tile_size, icon_size, tint_color, angle=0):
    """Render an SVG, recolour it to tint_color, optionally rotate, and paste centered in tile."""
    import cairosvg, io
    # Render larger so rotation doesn't clip corners
    render_size = int(icon_size * 1.5) if angle else icon_size
    png_bytes = cairosvg.svg2png(url=svg_path, output_width=render_size, output_height=render_size)
    icon = Image.open(io.BytesIO(png_bytes)).convert("RGBA")
    _, _, _, a = icon.split()
    tinted = Image.new("RGBA", icon.size, tint_color + (255,))
    tinted.putalpha(a)
    if angle:
        tinted = tinted.rotate(angle, resample=Image.BICUBIC, expand=True)
    # Scale back to icon_size (expand=True may have grown the canvas)
    tinted = tinted.resize((icon_size, icon_size), Image.BICUBIC)
    ox = tx + (tile_size - icon_size) // 2
    oy = ty + (tile_size - icon_size) // 2
    img.paste(tinted, (ox, oy), tinted)


def draw_tile(img, draw, tx, ty, size, style, content):
    pad = TILE_PADDING

    # Cream padding background (full tile size)
    draw.rounded_rectangle(
        [tx, ty, tx + size, ty + size], radius=7,
        fill=CREAM + (255,),
    )

    # Actual tile content (inset by padding)
    color  = ORANGE if style == "orange" else TILE_BG
    border = TILE_BORDER if style == "dark" else None
    draw_rounded_rect(draw, tx + pad, ty + pad, tx + size - pad, ty + size - pad, 5,
                      fill=color + (255,), outline=(border + (255,)) if border else None, width=2)

    if content == "clapper":
        paste_svg_icon(img, SVG_CLAPPER, tx, ty, size, CLAPPER_SIZE, CREAM, CLAPPER_ANGLE)

    elif content == "play":
        font = load_font(FONT_BOLD, LETTER_SIZE + 4)
        centered_text(draw, tx + size // 2, ty + size // 2, "▶", font, CREAM)

    elif content in ("1", "31"):
        font = load_font(FONT_BOLD, NUMBER_SIZE)
        centered_text(draw, tx + size // 2, ty + size // 2, content, font, CREAM)

    elif content == "M":
        font = load_font(FONT_INTER, LETTER_SIZE)
        sw, sf = LETTER_STROKE.get("M", (0, CREAM))
        centered_text(draw, tx + size // 2, ty + size // 2, content, font, CREAM, sw, sf)

    elif content in ("F", "C"):
        font = load_font(FONT_ITALIC, LETTER_SIZE)
        sw, sf = LETTER_STROKE.get(content, (0, CREAM))
        centered_text(draw, tx + size // 2, ty + size // 2, content, font, CREAM, sw, sf)


FAVICON_DIR = "web/public"


def render_grid(grid=None, scale=1) -> Image.Image:
    """Render a grid at the given pixel scale. Returns an RGBA image."""
    if grid is None:
        grid = GRID
    size  = TILE_SIZE * scale
    gap   = TILE_GAP  * scale
    cols  = len(grid[0]) if grid else 3
    rows  = len(grid) if grid else 3
    span_w = cols * size + (cols - 1) * gap
    span_h = rows * size + (rows - 1) * gap
    pad   = PAD * scale
    W = span_w + 2 * pad
    H = span_h + 2 * pad

    img  = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    for row, cells in enumerate(grid):
        for col, (style, content) in enumerate(cells):
            tx = pad + col * (size + gap)
            ty = pad + row * (size + gap)
            _draw_tile_scaled(img, draw, tx, ty, size, gap, style, content, scale)

    return img


def _draw_tile_scaled(img, draw, tx, ty, size, gap, style, content, scale):
    pad = int(TILE_PADDING * scale)

    # Cream padding background (full tile size)
    draw.rounded_rectangle(
        [tx, ty, tx + size, ty + size], radius=max(1, 7 * scale),
        fill=CREAM + (255,),
    )

    # Actual tile content (inset by padding)
    color  = ORANGE if style == "orange" else TILE_BG
    border = TILE_BORDER if style == "dark" else None
    radius = max(1, 5 * scale)
    draw.rounded_rectangle(
        [tx + pad, ty + pad, tx + size - pad, ty + size - pad], radius=radius,
        fill=color + (255,),
        outline=(border + (255,)) if border else None,
        width=max(1, 2 * scale),
    )
    # Center content within the inset tile (accounting for padding)
    cx = tx + size // 2
    cy = ty + size // 2

    if content == "clapper":
        icon_size = int(CLAPPER_SIZE * scale)
        paste_svg_icon(img, SVG_CLAPPER, tx + pad, ty + pad, size - 2 * pad, icon_size, CREAM, CLAPPER_ANGLE)
    elif content == "play":
        font = load_font(FONT_BOLD, int((LETTER_SIZE + 4) * scale))
        centered_text(draw, cx, cy, "▶", font, CREAM)
    elif content in ("1", "31"):
        font = load_font(FONT_BOLD, int(NUMBER_SIZE * scale))
        centered_text(draw, cx, cy, content, font, CREAM)
    elif content == "M":
        font = load_font(FONT_INTER, int(LETTER_SIZE * scale))
        sw, sf = LETTER_STROKE.get("M", (0, CREAM))
        centered_text(draw, cx, cy, content, font, CREAM, int(sw * scale), sf)
    elif content in ("F", "C"):
        font = load_font(FONT_ITALIC, int(LETTER_SIZE * scale))
        sw, sf = LETTER_STROKE.get(content, (0, CREAM))
        centered_text(draw, cx, cy, content, font, CREAM, int(sw * scale), sf)


def render_full() -> Image.Image:
    """Render grid + wordmark. Returns an RGBA image."""
    madrid_font = load_font(FONT_INTER, MADRID_SIZE)
    film_font   = load_font(FONT_ITALIC, FILM_CAL_SIZE)

    wordmark_gap = 28
    line_gap     = 10
    W = GRID_SPAN + 2 * PAD
    H = PAD + GRID_SPAN + wordmark_gap + MADRID_SIZE + line_gap + FILM_CAL_SIZE + PAD

    img  = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    gx, gy, cx = PAD, PAD, W // 2

    for row, cells in enumerate(GRID_3x3):
        for col, (style, content) in enumerate(cells):
            tx = gx + col * (TILE_SIZE + TILE_GAP)
            ty = gy + row * (TILE_SIZE + TILE_GAP)
            draw_tile(img, draw, tx, ty, TILE_SIZE, style, content)

    madrid_y = gy + GRID_SPAN + wordmark_gap
    draw_spaced_text(draw, cx, madrid_y, "MADRID", madrid_font, MADRID_COL, MADRID_KERN,
                     *MADRID_STROKE)

    film_bb = draw.textbbox((0, 0), "Film Calendar", font=film_font)
    film_h  = film_bb[3] - film_bb[1]
    film_y  = madrid_y + MADRID_SIZE + line_gap
    centered_text(draw, cx, film_y + film_h // 2, "Film Calendar", film_font, ORANGE_TEXT,
                  *FILM_CAL_STROKE)

    return img


def render_clapperboard(size_px: int, tint_color) -> Image.Image:
    """Render just the clapperboard SVG at the given size, tinted to color."""
    import cairosvg, io
    png_bytes = cairosvg.svg2png(url=SVG_CLAPPER, output_width=size_px, output_height=size_px)
    icon = Image.open(io.BytesIO(png_bytes)).convert("RGBA")
    _, _, _, a = icon.split()
    tinted = Image.new("RGBA", icon.size, tint_color + (255,))
    tinted.putalpha(a)
    return tinted


def make_favicons(img: Image.Image):
    """Derive favicon assets from a hi-res image and write to FAVICON_DIR."""
    import os
    os.makedirs(FAVICON_DIR, exist_ok=True)

    def resized(size):
        return img.resize((size, size), Image.LANCZOS)

    resized(16).save(f"{FAVICON_DIR}/favicon-16.png")
    resized(32).save(f"{FAVICON_DIR}/favicon-32.png")
    resized(180).save(f"{FAVICON_DIR}/apple-touch-icon.png")

    # ICO embeds multiple sizes
    ico_img = resized(256)
    ico_img.save(f"{FAVICON_DIR}/favicon.ico",
                 format="ICO", sizes=[(16,16), (32,32), (48,48), (256,256)])
    print(f"  favicon.ico  favicon-16.png  favicon-32.png  apple-touch-icon.png → {FAVICON_DIR}/")


def main():
    # ── 3×3 grid (original) ──
    grid_3x3_hi = render_grid(GRID_3x3, scale=4)
    grid_3x3_1x = render_grid(GRID_3x3, scale=1)

    grid_3x3_1x.save("logo-grid.png")
    print(f"Saved → logo-grid.png  ({grid_3x3_1x.width}×{grid_3x3_1x.height} px)")

    # ── 2×2 grid (simplified, all orange) ──
    grid_2x2_hi = render_grid(GRID_2x2, scale=4)
    grid_2x2_1x = render_grid(GRID_2x2, scale=1)

    grid_2x2_1x.save("logo-grid-2x2.png")
    print(f"Saved → logo-grid-2x2.png  ({grid_2x2_1x.width}×{grid_2x2_1x.height} px)")

    # ── full logo with wordmark (uses 3×3 grid) ──
    full = render_full()
    full.save("logo-full.png")
    print(f"Saved → logo-full.png  ({full.width}×{full.height} px)")

    # ── favicons (orange clapperboard only) ──
    clapper_hi = render_clapperboard(512, ORANGE_TEXT)  # use site accent orange
    make_favicons(clapper_hi)

    # keep legacy OUTPUT pointing at the full logo for convenience
    full.save(OUTPUT)


if __name__ == "__main__":
    main()

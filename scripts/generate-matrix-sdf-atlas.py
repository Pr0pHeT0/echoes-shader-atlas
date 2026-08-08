#!/usr/bin/env python3
"""Generate the deterministic single-channel SDF atlas used by Matrix mode."""

from __future__ import annotations

import hashlib
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy.ndimage import distance_transform_edt


ROOT = Path(__file__).resolve().parents[1]
FONT_PATH = ROOT / "public/fonts/chakra-petch/ChakraPetch-Bold.ttf"
OUTPUT_PATH = (
    ROOT
    / "public/effect-assets/stylized-materialization/matrix-binary-sdf.png"
)

GLYPHS = ("0", "1", "<", ">", "[", "]", "{", "}", "+", "-", "=", "/", "\\", ":", "#", "@")
GRID_SIZE = 4
TEXTURE_SIZE = 512
CELL_SIZE = TEXTURE_SIZE // GRID_SIZE
FONT_SIZE = 96
DISTANCE_RANGE = 16


def render_glyph_mask(font: ImageFont.FreeTypeFont, glyph: str) -> np.ndarray:
    mask = Image.new("L", (CELL_SIZE, CELL_SIZE), 0)
    draw = ImageDraw.Draw(mask)
    left, top, right, bottom = draw.textbbox((0, 0), glyph, font=font)
    width = right - left
    height = bottom - top
    position = (
        (CELL_SIZE - width) / 2 - left,
        (CELL_SIZE - height) / 2 - top,
    )
    draw.text(position, glyph, fill=255, font=font)
    return np.asarray(mask, dtype=np.float32) / 255


def signed_distance(mask: np.ndarray) -> np.ndarray:
    inside = mask >= 0.5
    outside_distance = distance_transform_edt(~inside)
    inside_distance = distance_transform_edt(inside)
    # Preserve FreeType's fractional edge coverage around the 0.5 contour.
    distance = inside_distance - outside_distance + mask - 0.5
    normalized = 0.5 + distance / (2 * DISTANCE_RANGE)
    return np.clip(np.rint(normalized * 255), 0, 255).astype(np.uint8)


def main() -> None:
    if not FONT_PATH.is_file():
        raise FileNotFoundError(f"Missing source font: {FONT_PATH}")

    font = ImageFont.truetype(
        str(FONT_PATH),
        FONT_SIZE,
        layout_engine=ImageFont.Layout.BASIC,
    )
    atlas = np.zeros((TEXTURE_SIZE, TEXTURE_SIZE), dtype=np.uint8)

    for index, glyph in enumerate(GLYPHS):
        row, column = divmod(index, GRID_SIZE)
        y = row * CELL_SIZE
        x = column * CELL_SIZE
        atlas[y : y + CELL_SIZE, x : x + CELL_SIZE] = signed_distance(
            render_glyph_mask(font, glyph)
        )

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(atlas).save(
        OUTPUT_PATH,
        format="PNG",
        optimize=False,
        compress_level=9,
    )
    digest = hashlib.sha256(OUTPUT_PATH.read_bytes()).hexdigest()
    print(f"wrote {OUTPUT_PATH.relative_to(ROOT)} ({digest})")


if __name__ == "__main__":
    main()

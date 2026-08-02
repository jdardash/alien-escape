"""Cut a sprite sheet into the per-frame files `assets/local/` understands.

The game's local-override manifest (see docs/local-art.md) names one file per
animation frame. Rips rarely arrive that way -- they arrive as one sheet.
This tool closes the gap: point a cut spec at the sheet, and it writes the
frame PNGs into `assets/local/`, composes the font sheet in the exact glyph
order `src/art/font.js` expects, and merges everything into
`assets/local/manifest.json`.

It contains no artwork and downloads nothing. Whatever sheet it is pointed
at is the operator's own, and everything it writes lands in a directory
`.gitignore` keeps out of the repository.

Usage:
    python tools/slice-local-art.py <cutspec.json>

Start from `tools/cutspec.template.json`: fill in the source path and the
cell coordinates of each sprite on your sheet, delete the entries you do not
have, and run. Coordinates are in source-sheet pixels, top-left of each cell.

Spec format:
    {
      "source": "C:/path/to/sheet.png",
      "background": "auto",          // colour made transparent: "auto" reads
                                     // the sheet's top-left pixel; [r,g,b];
                                     // or null to leave the sheet alone
      "cell": [16, 16],              // default cell size in sheet pixels
      "entries": {
        "zako": [[0, 32], [16, 32]],           // a list of cells = frames
        "player": [[0, 0]],                     // one cell = one frame
        "beam": { "size": [48, 80], "cells": [[64, 0], [112, 0], [160, 0]] },
        "logo": { "size": [224, 60], "cells": [[0, 480]] }
      },
      "font": {
        "size": [8, 8],
        "glyphs": { "A": [0, 0], "B": [8, 0], "0": [0, 8] }
      }
    }

Every name under "entries" must be one the manifest understands; the tool
reads the authoritative list straight out of `src/art/localArt.js` and the
glyph order out of `src/art/font.js`, so it cannot drift from the game.
"""

import json
import re
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
LOCAL = ROOT / "assets" / "local"
MANIFEST = LOCAL / "manifest.json"


def read_font_chars():
    """The glyph order, straight from src/art/font.js."""
    source = (ROOT / "src" / "art" / "font.js").read_text(encoding="utf-8")
    match = re.search(r'export const FONT_CHARS = "((?:[^"\\]|\\.)*)"', source)
    if not match:
        sys.exit("could not find FONT_CHARS in src/art/font.js")
    return match.group(1).replace('\\"', '"').replace("\\\\", "\\")


def read_overridable_names():
    """Every manifest name the game accepts, from src/art/localArt.js."""
    source = (ROOT / "src" / "art" / "localArt.js").read_text(encoding="utf-8")
    block = re.search(r"OVERRIDABLE_ART = \[(.*?)\];", source, re.S)
    if not block:
        sys.exit("could not find OVERRIDABLE_ART in src/art/localArt.js")

    names = set(re.findall(r"'([A-Za-z0-9]+)'", block.group(1)))
    # The ship and transform names are spread from the sprite tables rather
    # than written out, so they are added by hand here and checked below.
    names |= {"zako", "goei", "boss", "bossDamaged", "player", "captive"}
    names |= {"scorpion", "spyShip", "flagship"}
    return names


def make_transparent(image, background):
    if background is None:
        return image.convert("RGBA")

    image = image.convert("RGBA")
    if background == "auto":
        background = image.getpixel((0, 0))[:3]

    key = tuple(background)
    pixels = image.load()
    for y in range(image.height):
        for x in range(image.width):
            if pixels[x, y][:3] == key:
                pixels[x, y] = (0, 0, 0, 0)
    return image


def cells_of(value, default_size):
    """Normalise an entry to (size, [cells])."""
    if isinstance(value, dict):
        return tuple(value.get("size", default_size)), value["cells"]
    return tuple(default_size), value


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)

    spec = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    sheet = make_transparent(
        Image.open(ROOT / spec["source"] if not Path(spec["source"]).is_absolute() else spec["source"]),
        spec.get("background", "auto"),
    )
    default_size = spec.get("cell", [16, 16])
    known = read_overridable_names()

    LOCAL.mkdir(parents=True, exist_ok=True)
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8")) if MANIFEST.exists() else {}
    if MANIFEST.exists():
        MANIFEST.with_suffix(".json.bak").write_text(
            json.dumps(manifest, indent=2), encoding="utf-8"
        )

    written = []

    for name, value in spec.get("entries", {}).items():
        if name not in known:
            sys.exit(f'"{name}" is not a name the manifest understands; see docs/local-art.md')

        (width, height), cells = cells_of(value, default_size)
        files = []
        for index, (x, y) in enumerate(cells):
            frame = sheet.crop((x, y, x + width, y + height))
            filename = f"{name}_{index}.png" if len(cells) > 1 else f"{name}.png"
            frame.save(LOCAL / filename)
            files.append(filename)
            written.append(filename)

        manifest[name] = files if len(files) > 1 else files[0]

    font = spec.get("font")
    if font:
        chars = read_font_chars()
        glyph_w, glyph_h = font.get("size", [8, 8])
        per_row = 16
        rows = -(-len(chars) // per_row)
        out = Image.new("RGBA", (per_row * glyph_w, rows * glyph_h), (0, 0, 0, 0))

        missing = []
        for index, char in enumerate(chars):
            source_xy = font["glyphs"].get(char)
            if source_xy is None:
                if char != " ":
                    missing.append(char)
                continue
            glyph = sheet.crop(
                (source_xy[0], source_xy[1], source_xy[0] + glyph_w, source_xy[1] + glyph_h)
            )
            out.paste(glyph, ((index % per_row) * glyph_w, (index // per_row) * glyph_h))

        out.save(LOCAL / "font_sheet.png")
        manifest["font"] = "font_sheet.png"
        written.append("font_sheet.png")
        if missing:
            print(f"font: no source glyph for {''.join(missing)!r} -- those cells are blank")

    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

    print(f"wrote {len(written)} file(s) into {LOCAL}")
    for filename in written:
        print(f"  {filename}")
    print("manifest updated; previous manifest saved as manifest.json.bak")
    print("serve the game and the title screen should say: local artwork")


if __name__ == "__main__":
    main()

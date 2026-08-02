# Running with the arcade artwork locally

Every ship this repository ships is original pixel art, drawn a pixel at a time in
[`src/art/pixelArt.js`](../src/art/pixelArt.js) and generated into textures when the game
starts -- and since the animation pass, so is everything else that moves: the wing-flap
frames, both explosion sequences, the tractor beam's strip fan, and the 8x8 character
font in [`src/art/font.js`](../src/art/font.js). That is what the public demo serves, and
it is deliberate: the cabinet's own sprites are Bandai Namco's, and a public repository
with a live demo is not the place for them.

A local checkout can use different artwork. If `assets/local/` exists with a manifest in
it, the images it names are loaded at startup and used in place of the drawn art.

**`assets/local/` is in `.gitignore` and must stay there.** Nothing in it can reach the
repository, the demo, or a pull request. If you are keeping the arcade sprites on your own
machine, that is where they go.

The audio works the same way, one directory down in `assets/local/sfx/`; see
[local-audio.md](local-audio.md).

## Setting it up

Create the directory, drop your images in, and write a manifest beside them. A manifest
value is either **one filename** or **a list of filenames, one per animation frame, in
frame order**:

```json
{
  "zako": ["zako_0.png", "zako_1.png"],
  "goei": ["goei_0.png", "goei_1.png"],
  "boss": ["boss_0.png", "boss_1.png"],
  "bossDamaged": ["boss_0.png", "boss_1.png"],
  "player": "player.png",
  "captive": "captive.png",
  "explosionEnemy": ["exp_0.png", "exp_1.png", "exp_2.png", "exp_3.png", "exp_4.png"],
  "explosionPlayer": ["death_0.png", "death_1.png", "death_2.png", "death_3.png"],
  "beam": ["beam_0.png", "beam_1.png", "beam_2.png"],
  "logo": "logo.png",
  "font": "font_sheet.png"
}
```

Serve the game the usual way (`npm run serve`) and those pieces are yours; anything the
manifest does not name stays drawn. There is no flag to set and no build step: the game
probes for the manifest every time it starts.

A single file on an animated sprite is shown for every frame -- a still rip simply does
not flap. A frame list longer or shorter than the drawn art's is fine too; frames wrap.

## Every name the manifest understands

| Group | Names | Frames the game animates |
| --- | --- | --- |
| Ships | `zako` `goei` `boss` `bossDamaged` `player` `captive` | 2-frame wing flap on the four aliens; fighter is single-frame |
| Transforms | `scorpion` `spyShip` `flagship` | 2 frames each |
| Explosions | `explosionEnemy` `explosionPlayer` | 5 and 4 frames |
| Beam | `beam` | frames cycle at the beam's colour-cycle rate, revealed as it unfurls |
| Flags | `flag1` `flag5` `flag10` `flag20` `flag30` `flag50` | static |
| Projectiles | `playerLaser` `enemyLaser` | static |
| Title | `logo` | static; replaces the wordmark on the title panel |
| Text | `font` | the whole character sheet, see below |

The list is `OVERRIDABLE_ART` in [`src/art/localArt.js`](../src/art/localArt.js), and
`tests/localArt.test.js` pins it, so nothing drawable can be added to the game without
either joining this table or failing the pin.

### The font sheet

`font` replaces every string in the game at once. The sheet is sixteen glyphs per row,
square cells, in exactly this order:

```text
ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-.,:;!?()[]<>/+=@'" 
```

(`@` is used as the copyright mark; the last character is space.) The cell size is read
off the image width, so an 8x8-per-glyph sheet is a 128px-wide image. Text is single-case:
everything the game prints is upcased before drawing.

### The two Boss Galaga states

A Boss Galaga survives its first hit and changes colour to show it, and that colour change
is the player's only cue that a second shot is needed. Two rules protect it from a
hand-assembled directory:

- **A local `bossDamaged` image is always tinted blue.** Two filenames are no guarantee of
  two different pictures -- the obvious mistake here is to copy one boss image to both
  names, which produces a damaged state indistinguishable from a healthy one and silently
  removes the mechanic.
- **The healthy `boss` is tinted green only when both names point at the same file(s).** A
  manifest that genuinely supplies different images is taken at its word for that state.

The rules are `bossTintFor` and `needsHealthyBossTint` in
[`src/art/localArt.js`](../src/art/localArt.js), pinned by
[`tests/localArt.test.js`](../tests/localArt.test.js), and they apply per frame.

## Slicing a sheet into all of this

Rips usually arrive as one sprite sheet, not thirty files. `tools/slice-local-art.py`
cuts a sheet into everything above in one run:

```text
copy tools/cutspec.template.json somewhere, fill in your sheet path and the
pixel coordinates of each sprite on it, then:

    python tools/slice-local-art.py my-cutspec.json
```

It crops each named cell (frame lists included), keys the sheet's background colour to
transparent, composes `font_sheet.png` in the game's own glyph order, writes it all into
`assets/local/`, and merges the names into `manifest.json` -- entries you already have
are kept, and the previous manifest is saved as `manifest.json.bak`. The tool reads the
name list and the glyph order out of the game's own source, so it cannot drift from what
the manifest accepts. It needs Python with Pillow, contains no artwork, and downloads
nothing: the sheet it cuts is yours, and everything it writes stays in the ignored
directory.

## Fallback is per name, never per frame

A sprite must never mix ripped and drawn frames -- half a flap from the cabinet and half
from the pixel art reads as a glitch. So one bad entry in a frame list (a typo, a missing
file, a `..` in the path) drops that whole name back to the drawn art, and costs nothing
else. A manifest naming eight things of which one is broken gives you seven local pieces
and one drawn one, with a single console error for the file that failed.

## What it does not change

Images are sized by display rather than by scale, so a local ship occupies exactly the
pixels the drawn one would have whatever size it was authored at. Formation spacing,
hitboxes, the flap clock, the sixteen-step dive rotation, the explosion timings, the
beam's open/hold windows and the HUD layout are identical either way; only the pixels
differ. The starfield is generated from the hardware's own LFSR and is not an image at
all.

The title screen prints `local artwork` in its bottom-right corner whenever any override
is in use, so a screenshot taken from a local checkout is never mistaken for what the
repository ships.

## Sharing it

The directory is the unit. Zip `assets/local/` -- artwork and audio together -- and hand it
to whoever is playing; they clone the repository normally and drop the folder in. Keep it
off anything public — the reason this mechanism exists at all is so that the cabinet's
assets and the repository stay separate.

## When it is not there

One request for `assets/local/manifest.json` fails at startup and the game carries on with
its own art. That single 404 in the console is the whole cost of the feature for everyone
who is not using it.

# Running with the arcade artwork locally

Every ship this repository ships is original pixel art, drawn a pixel at a time in
[`src/art/pixelArt.js`](../src/art/pixelArt.js) and generated into a texture when the game
starts. That is what the public demo serves, and it is deliberate: the cabinet's own
sprites are Bandai Namco's, and a public repository with a live demo is not the place for
them.

A local checkout can use different artwork. If `assets/local/` exists with a manifest in
it, the images it names are loaded at startup and used in place of the drawn ships.

**`assets/local/` is in `.gitignore` and must stay there.** Nothing in it can reach the
repository, the demo, or a pull request. If you are keeping the arcade sprites on your own
machine, that is where they go.

## Setting it up

Create the directory and drop your images in, then write a manifest beside them:

```text
assets/local/
  manifest.json
  zako.png
  goei.png
  boss.png
  bossDamaged.png
  player.png
  captive.png
```

`assets/local/manifest.json`:

```json
{
  "zako": "zako.png",
  "goei": "goei.png",
  "boss": "boss.png",
  "bossDamaged": "bossDamaged.png",
  "player": "player.png",
  "captive": "captive.png"
}
```

Serve the game the usual way (`npm run serve`) and the ships are yours. There is no flag to
set and no build step: the game probes for the manifest every time it starts.

## What the six names mean

| Name | The ship |
| --- | --- |
| `zako` | The bee. Two rows of ten, the bottom of the formation |
| `goei` | The butterfly. Two rows of eight |
| `boss` | Boss Galaga at full health, the row of four along the top |
| `bossDamaged` | Boss Galaga after its first hit |
| `player` | Your fighter, and the spare-ship icons, and the ship under the title |
| `captive` | Your fighter while a Boss Galaga is holding it |

Every name is optional. A manifest naming only `boss` overrides the boss and leaves the
other five drawn, which is a reasonable way to compare the two.

### The two Boss Galaga states

A Boss Galaga survives its first hit and changes colour to show it, and that colour change is
the player's only cue that a second shot is needed. Two rules protect it from a
hand-assembled directory:

- **A local `bossDamaged` image is always tinted blue.** Two filenames are no guarantee of
  two different pictures — the obvious mistake here is to copy one boss image to both names,
  which produces a damaged state indistinguishable from a healthy one and silently removes
  the mechanic. Tinting an image that is already blue costs nothing; failing to tint one that
  is still green costs the tell.
- **The healthy `boss` is tinted green only when both names point at the same file.** A
  manifest that genuinely supplies two different images is taken at its word for that state.

So the shortest working manifest for a single boss image is to name it twice:

```json
{ "boss": "boss.png", "bossDamaged": "boss.png" }
```

The rules are `bossTintFor` and `needsHealthyBossTint` in
[`src/art/localArt.js`](../src/art/localArt.js), pinned by
[`tests/localArt.test.js`](../tests/localArt.test.js).

## What it does not change

Images are sized by display rather than by scale, so a local ship occupies exactly the
pixels the drawn one would have whatever size it was authored at. Formation spacing,
hitboxes, and the HUD are identical either way; only the pixels differ. Nothing else in
the game reads this directory: the flags, the three transform bonus ships, the explosion,
the lasers and the starfield are unaffected.

The title screen prints `local artwork` in its bottom-right corner whenever any override is
in use, so a screenshot taken from a local checkout is never mistaken for what the
repository ships.

## Sharing it

The directory is the unit. Zip `assets/local/` and hand it to whoever is playing; they
clone the repository normally and drop the folder in. Keep it off anything public — the
reason this mechanism exists at all is so that the artwork and the repository stay separate.

## When it is not there

One request for `assets/local/manifest.json` fails at startup and the game carries on with
its own art. That single 404 in the console is the whole cost of the feature for everyone
who is not using it; a missing image named by a manifest is handled the same way, falling
back to the drawn ship for that one slot.

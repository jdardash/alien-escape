/**
 * Local artwork overrides.
 *
 * Every ship the game draws is original pixel art, authored in `pixelArt.js`
 * and generated at run time. That is what the repository ships and what the
 * public demo serves, and it is deliberate: the arcade's own sprites are Bandai
 * Namco's, and a public repository with a live demo is not the place for them.
 *
 * A local checkout is a different question. If `assets/local/` exists with a
 * manifest in it, the images it names are loaded and used in place of the drawn
 * art. The directory is in `.gitignore`, so it cannot reach the repository by
 * accident, and nothing here has any effect without it.
 *
 * Since the game animates, a manifest value is either one filename or a list
 * of them -- one file per frame, in frame order. A single file on an animated
 * sprite is simply shown for every frame, which is what a still rip should do.
 *
 * The probe is one request for the manifest. Without the directory that is a
 * single 404 at startup and the game carries on with its own art; with it, the
 * manifest tells the loader which files to fetch. See `docs/local-art.md`.
 */

import { SHIP_ART, SHIP_DRAWN_PX } from '../config.js';
import { SHIP_SPRITES, TRANSFORM_SPRITES, frameCount } from './pixelArt.js';
import { shipTextureKey, transformTextureKey } from './textures.js';

/** Where a local checkout may put its own artwork. */
export const LOCAL_ART_DIR = 'assets/local';
export const LOCAL_ART_MANIFEST = `${LOCAL_ART_DIR}/manifest.json`;

/** Loader key for the manifest itself, and the prefix its images load under. */
const MANIFEST_KEY = 'localArtManifest';
const TEXTURE_PREFIX = 'local-';

/**
 * Every name a manifest may override.
 *
 * The ships, the transform bonus trio, both explosions and the tractor beam.
 * `tests/localArt.test.js` pins this list against the sprite tables, so a new
 * drawable cannot be added to the game without either joining it or failing
 * the pin.
 */
export const OVERRIDABLE_ART = [
  ...Object.keys(SHIP_SPRITES),
  ...Object.keys(TRANSFORM_SPRITES),
  'explosionEnemy',
  'explosionPlayer',
  'beam',
  // The six stage-flag denominations along the bottom of the HUD.
  'flag1',
  'flag5',
  'flag10',
  'flag20',
  'flag30',
  'flag50',
  // Both projectiles, and the slot the title logo draws in.
  'playerLaser',
  'enemyLaser',
  'logo',
  // The whole character sheet, sixteen glyphs a row in `FONT_CHARS` order.
  'font',
];

/**
 * The green a Boss Galaga is tinted while it still has both hit points.
 *
 * Only used when the healthy and damaged boss resolve to the *same* files: one
 * boss image exists and the tint is the whole of what tells the two states
 * apart. A manifest naming two different files is taken at its word here.
 */
export const HEALTHY_BOSS_TINT = 0x66ff66;

/**
 * The blue a Boss Galaga is tinted once it has taken its first hit.
 *
 * Applied to *every* local damaged-boss image, including one that came from a
 * manifest naming two separate files. Two filenames are no guarantee of two
 * different pictures -- `assets/local/` is hand-assembled, and the obvious
 * mistake is to copy one boss image to both names -- and a damaged boss that
 * looks exactly like a healthy one takes away the player's only cue that a
 * second shot is needed. Tinting a boss image that is already blue costs
 * nothing; failing to tint one that is still green costs the mechanic.
 */
export const DAMAGED_BOSS_TINT = 0x5a8cff;

/**
 * A manifest value as a clean list of frame filenames, or null to reject it.
 *
 * Rejection is all-or-nothing on purpose: a sprite must never mix ripped and
 * drawn frames, so one bad filename in a list forfeits the list rather than
 * leaving a flap that alternates between the cabinet and the pixel art.
 */
function frameFilesOf(value) {
  const list = Array.isArray(value) ? value : [value];
  if (list.length === 0) return null;

  const cleaned = list.map((file) => (typeof file === 'string' ? file.trim() : ''));
  if (cleaned.some((file) => file === '' || file.includes('..'))) return null;

  return cleaned;
}

/**
 * Read a manifest into the list of images worth loading, one entry per frame.
 *
 * Pure, so `tests/localArt.test.js` can pin it. Entries naming art the game
 * does not have are dropped rather than throwing: a hand-edited manifest with
 * a typo in it should cost one sprite, not the whole run.
 */
export function localArtEntries(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) return [];

  const entries = [];
  for (const [name, value] of Object.entries(manifest)) {
    if (!OVERRIDABLE_ART.includes(name)) continue;

    const files = frameFilesOf(value);
    if (!files) continue;

    files.forEach((file, frame) => {
      entries.push({ name, frame, path: `${LOCAL_ART_DIR}/${file}` });
    });
  }

  return entries;
}

/** The frame paths one name resolves to, joined for a cheap equality check. */
function framePathsOf(name, manifest) {
  return localArtEntries(manifest)
    .filter((entry) => entry.name === name)
    .map((entry) => entry.path)
    .join('|');
}

/**
 * True when the healthy boss needs tinting to be told from the damaged one.
 *
 * Pure for the same reason as above: it is a rule, and rules are testable.
 */
export function needsHealthyBossTint(manifest) {
  const boss = framePathsOf('boss', manifest);
  const damaged = framePathsOf('bossDamaged', manifest);

  return boss !== '' && boss === damaged;
}

/**
 * The tint a local boss image is drawn under, or null for no tint.
 *
 * Pure, and separate from `applyShipArt`, so the rule is testable without a
 * scene. Ships other than the two boss states are never tinted: their local
 * images stand on their own.
 */
export function bossTintFor(name, manifest) {
  if (name === 'bossDamaged') {
    return framePathsOf('bossDamaged', manifest) !== '' ? DAMAGED_BOSS_TINT : null;
  }
  if (name === 'boss') return needsHealthyBossTint(manifest) ? HEALTHY_BOSS_TINT : null;
  return null;
}

/**
 * Which names have an override loaded, name to per-frame texture keys. Module
 * level rather than per scene: the manifest is probed once, by whichever scene
 * preloads first, and every scene after that reads the result.
 */
const overrides = new Map();

let probed = false;
/** The manifest as loaded, kept so the tint rules can be re-asked per sprite. */
let loadedManifest = null;

/** Texture key one frame of an override loads under. */
function localTextureKey(name, frame) {
  return `${TEXTURE_PREFIX}${name}-f${frame}`;
}

/** The override name a loader key belongs to. */
function nameOfLoaderKey(key) {
  return key.slice(TEXTURE_PREFIX.length).replace(/-f\d+$/, '');
}

/**
 * Queue the manifest, and the images it names once it arrives.
 *
 * Phaser's loader accepts files added while it is still running, which is what
 * lets a manifest fetched in `preload` decide what else `preload` fetches. A
 * missing manifest, a missing image, or a manifest that is not JSON all end the
 * same way: the name is simply never recorded, and `applyShipArt` falls back
 * to the drawn art.
 *
 * The fallback is per name, not per frame. One missing file out of a
 * five-frame explosion drops the whole explosion back to the drawn frames --
 * see `frameFilesOf` for why mixing is worse than missing.
 */
export function queueLocalArt(scene) {
  if (probed) return;
  probed = true;

  // Failures here are expected -- the whole point is that the directory is
  // usually absent -- so they must not reach the console as unhandled errors.
  scene.load.on('loaderror', (file) => {
    if (file.key === MANIFEST_KEY) return;
    if (file.key.startsWith(TEXTURE_PREFIX)) {
      overrides.delete(nameOfLoaderKey(file.key));
    }
  });

  scene.load.once(`filecomplete-json-${MANIFEST_KEY}`, (_key, _type, manifest) => {
    loadedManifest = manifest;

    const byName = new Map();
    for (const entry of localArtEntries(manifest)) {
      if (!byName.has(entry.name)) byName.set(entry.name, []);
      byName.get(entry.name).push(entry);
    }

    for (const [name, entries] of byName) {
      // Recorded up front and removed again on error, because the loader only
      // tells us about the files that fail.
      overrides.set(
        name,
        entries.map((entry) => localTextureKey(name, entry.frame)),
      );
      for (const entry of entries) {
        scene.load.image(localTextureKey(name, entry.frame), entry.path);
      }
    }
  });

  scene.load.json(MANIFEST_KEY, LOCAL_ART_MANIFEST);
}

/** True when any local artwork is in use, for the note on the title screen. */
export function usingLocalArt() {
  return overrides.size > 0;
}

/**
 * The loaded override frame keys for a name, or null when it has none.
 *
 * The beam and the explosions are not ships and do not go through
 * `applyShipArt`; this is how their draw sites ask the same question it asks.
 */
export function localArtFrames(name) {
  return overrides.get(name) ?? null;
}

/**
 * Point a sprite at the artwork for a ship, drawn or local, at a frame.
 *
 * Called after construction rather than folded into it because there are six
 * places a ship is built -- an enemy, the player, the captive, the wingman, a
 * life icon and the title ship -- and they use three different Phaser
 * factories. One function that takes a finished object covers all of them.
 *
 * A frame beyond what the artwork carries wraps rather than throwing, which is
 * the graceful reading of both directions of mismatch: a one-file override on
 * a flapping alien simply does not flap, and a two-frame override keeps
 * flapping even while the drawn art behind it has one frame.
 *
 * A local image is authored at whatever size its author chose, so it is sized
 * by display rather than by scale: it ends up occupying exactly the pixels the
 * drawn ship would have, which is what keeps formation spacing, hitboxes and
 * HUD layout identical either way.
 */
export function applyShipArt(object, name, { frame = 0, pixelSize = SHIP_ART.pixelSize } = {}) {
  const keys = overrides.get(name);
  const key = keys ? keys[frame % keys.length] : null;
  object.clearTint();

  if (!key || !object.scene.textures.exists(key)) {
    const sprite = SHIP_SPRITES[name] ?? TRANSFORM_SPRITES[name];
    const drawnFrame = sprite ? frame % frameCount(sprite) : 0;
    const drawnKey = TRANSFORM_SPRITES[name]
      ? transformTextureKey(name, drawnFrame)
      : shipTextureKey(name, pixelSize, drawnFrame);

    object.setTexture(drawnKey);
    object.setScale(1);
    return object;
  }

  const drawn = (SHIP_DRAWN_PX / SHIP_ART.pixelSize) * pixelSize;
  object.setTexture(key);
  object.setDisplaySize(drawn, drawn);

  const tint = bossTintFor(name, loadedManifest);
  if (tint !== null) object.setTint(tint);

  return object;
}

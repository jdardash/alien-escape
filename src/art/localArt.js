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
 * ships. The directory is in `.gitignore`, so it cannot reach the repository by
 * accident, and nothing here has any effect without it.
 *
 * The probe is one request for the manifest. Without the directory that is a
 * single 404 at startup and the game carries on with its own art; with it, the
 * manifest tells the loader which files to fetch. See `docs/local-art.md`.
 */

import { SHIP_ART, SHIP_DRAWN_PX } from '../config.js';
import { SHIP_SPRITES } from './pixelArt.js';
import { shipTextureKey } from './textures.js';

/** Where a local checkout may put its own artwork. */
export const LOCAL_ART_DIR = 'assets/local';
export const LOCAL_ART_MANIFEST = `${LOCAL_ART_DIR}/manifest.json`;

/** Loader key for the manifest itself, and the prefix its images load under. */
const MANIFEST_KEY = 'localArtManifest';
const TEXTURE_PREFIX = 'local-';

/**
 * The green a Boss Galaga is tinted while it still has both hit points.
 *
 * Only used when the healthy and damaged boss resolve to the *same* file: one
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
 * The tint a local boss image is drawn under, or null for no tint.
 *
 * Pure, and separate from `applyShipArt`, so the rule is testable without a
 * scene. Ships other than the two boss states are never tinted: their local
 * images stand on their own.
 */
export function bossTintFor(name, manifest) {
  const entries = localArtEntries(manifest);
  const overridden = (ship) => entries.some((entry) => entry.name === ship);

  if (name === 'bossDamaged') return overridden('bossDamaged') ? DAMAGED_BOSS_TINT : null;
  if (name === 'boss') return needsHealthyBossTint(manifest) ? HEALTHY_BOSS_TINT : null;
  return null;
}

/**
 * Which ships have an override loaded, name to texture key. Module level rather
 * than per scene: the manifest is probed once, by whichever scene preloads
 * first, and every scene after that reads the result.
 */
const overrides = new Map();

let probed = false;
/** The manifest as loaded, kept so the tint rules can be re-asked per sprite. */
let loadedManifest = null;

/**
 * Read a manifest into the list of images worth loading.
 *
 * Pure, so `tests/localArt.test.js` can pin it. Entries naming a ship the game
 * does not have, or pointing at something that is not a string, are dropped
 * rather than throwing: a hand-edited manifest with a typo in it should cost
 * one sprite, not the whole run.
 */
export function localArtEntries(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) return [];

  return Object.entries(manifest)
    .filter(([name, file]) => SHIP_SPRITES[name] !== undefined && typeof file === 'string')
    .filter(([, file]) => file.trim() !== '' && !file.includes('..'))
    .map(([name, file]) => ({ name, path: `${LOCAL_ART_DIR}/${file.trim()}` }));
}

/**
 * True when the healthy boss needs tinting to be told from the damaged one.
 *
 * Pure for the same reason as above: it is a rule, and rules are testable.
 */
export function needsHealthyBossTint(manifest) {
  const entries = localArtEntries(manifest);
  const boss = entries.find((entry) => entry.name === 'boss');
  const damaged = entries.find((entry) => entry.name === 'bossDamaged');

  return Boolean(boss && damaged && boss.path === damaged.path);
}

/** Texture key an override loads under. */
function localTextureKey(name) {
  return `${TEXTURE_PREFIX}${name}`;
}

/**
 * Queue the manifest, and the images it names once it arrives.
 *
 * Phaser's loader accepts files added while it is still running, which is what
 * lets a manifest fetched in `preload` decide what else `preload` fetches. A
 * missing manifest, a missing image, or a manifest that is not JSON all end the
 * same way: the entry is simply never recorded, and `applyShipArt` falls back
 * to the drawn ship.
 */
export function queueLocalArt(scene) {
  if (probed) return;
  probed = true;

  // Failures here are expected -- the whole point is that the directory is
  // usually absent -- so they must not reach the console as unhandled errors.
  scene.load.on('loaderror', (file) => {
    if (file.key === MANIFEST_KEY || file.key.startsWith(TEXTURE_PREFIX)) {
      overrides.delete(file.key.slice(TEXTURE_PREFIX.length));
    }
  });

  scene.load.once(`filecomplete-json-${MANIFEST_KEY}`, (_key, _type, manifest) => {
    loadedManifest = manifest;

    for (const { name, path } of localArtEntries(manifest)) {
      const key = localTextureKey(name);
      // Recorded up front and removed again on error, because the loader only
      // tells us about the files that fail.
      overrides.set(name, key);
      scene.load.image(key, path);
    }
  });

  scene.load.json(MANIFEST_KEY, LOCAL_ART_MANIFEST);
}

/** True when any local artwork is in use, for the note on the title screen. */
export function usingLocalArt() {
  return overrides.size > 0;
}

/**
 * Point a sprite at the artwork for a ship, drawn or local.
 *
 * Called after construction rather than folded into it because there are six
 * places a ship is built -- an enemy, the player, the captive, the wingman, a
 * life icon and the title ship -- and they use three different Phaser
 * factories. One function that takes a finished object covers all of them.
 *
 * A local image is authored at whatever size its author chose, so it is sized
 * by display rather than by scale: it ends up occupying exactly the pixels the
 * drawn ship would have, which is what keeps formation spacing, hitboxes and
 * HUD layout identical either way.
 */
export function applyShipArt(object, name, pixelSize = SHIP_ART.pixelSize) {
  const override = overrides.get(name);
  object.clearTint();

  if (!override || !object.scene.textures.exists(override)) {
    object.setTexture(shipTextureKey(name, pixelSize));
    object.setScale(1);
    return object;
  }

  const drawn = (SHIP_DRAWN_PX / SHIP_ART.pixelSize) * pixelSize;
  object.setTexture(override);
  object.setDisplaySize(drawn, drawn);

  const tint = bossTintFor(name, loadedManifest);
  if (tint !== null) object.setTint(tint);

  return object;
}

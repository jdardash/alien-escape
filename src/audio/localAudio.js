/**
 * Local audio overrides.
 *
 * The mirror of `src/art/localArt.js`, and it exists for the same reason. Every
 * sound the game makes is synthesised from the specs in `soundBank.js`, because
 * the cabinet's own samples are Bandai Namco's and a public repository with a
 * live demo is not the place for them -- less so than for the sprites, if
 * anything: a rip is byte-identical to its source, where hand-drawn pixel art
 * merely resembles one.
 *
 * A local checkout is a different question. If `assets/local/sfx/` exists with a
 * manifest in it, the files it names are loaded and used in place of the
 * synthesised sounds. The directory is inside the gitignored `assets/local/`, so
 * it cannot reach the repository by accident, and nothing here has any effect
 * without it.
 *
 * The probe is one request for the manifest. Without the directory that is a
 * single 404 at startup and the game plays its own bank; with it, the manifest
 * tells the loader which files to fetch. See `docs/local-audio.md`.
 */

import { SOUND_SPECS } from './soundBank.js';

/** Where a local checkout may put the cabinet's own audio. */
export const LOCAL_AUDIO_DIR = 'assets/local/sfx';
export const LOCAL_AUDIO_MANIFEST = `${LOCAL_AUDIO_DIR}/manifest.json`;

/** Loader key for the manifest itself. */
const MANIFEST_KEY = 'localAudioManifest';

/**
 * Read a manifest into the list of sounds worth loading.
 *
 * Pure, so `tests/localAudio.test.js` can pin it. Entries naming a sound the
 * game does not have, or pointing at something that is not a string, are
 * dropped rather than throwing: a hand-edited manifest with a typo in it should
 * cost one sound, not the whole run.
 */
export function localAudioEntries(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) return [];

  return Object.entries(manifest)
    .filter(([name, file]) => SOUND_SPECS[name] !== undefined && typeof file === 'string')
    .filter(([, file]) => file.trim() !== '' && !file.includes('..'))
    .map(([name, file]) => ({ name, path: `${LOCAL_AUDIO_DIR}/${file.trim()}` }));
}

/**
 * Which sounds have an override loaded. Module level rather than per scene: the
 * manifest is probed once, by whichever scene preloads first, and every scene
 * after that reads the result.
 */
const overrides = new Set();

let probed = false;

/**
 * Queue the manifest, and the audio it names once it arrives.
 *
 * Phaser's loader accepts files added while it is still running, which is what
 * lets a manifest fetched in `preload` decide what else `preload` fetches. The
 * overrides load under the plain sound key, so by the time `installSoundBank`
 * runs in `create` they are already in the audio cache and it leaves them
 * alone -- that, and nothing else, is how a local sound wins.
 *
 * A missing manifest, a missing file, or a manifest that is not JSON all end
 * the same way: the key never reaches the cache, and the synthesised sound is
 * installed over the gap.
 */
export function queueLocalAudio(scene) {
  if (probed) return;
  probed = true;

  // Failures here are expected -- the whole point is that the directory is
  // usually absent -- so they must not reach the console as unhandled errors.
  scene.load.on('loaderror', (file) => {
    if (file.key !== MANIFEST_KEY) overrides.delete(file.key);
  });

  scene.load.once(`filecomplete-json-${MANIFEST_KEY}`, (_key, _type, manifest) => {
    for (const { name, path } of localAudioEntries(manifest)) {
      // Recorded up front and removed again on error, because the loader only
      // tells us about the files that fail.
      overrides.add(name);
      scene.load.audio(name, path);
    }
  });

  scene.load.json(MANIFEST_KEY, LOCAL_AUDIO_MANIFEST);
}

/** True when any local audio is in use, for the note on the title screen. */
export function usingLocalAudio() {
  return overrides.size > 0;
}

/**
 * Which sound plays when.
 *
 * Galaga's audio is not decoration. Each rank of enemy has its own cry when it
 * is hit, a Boss Galaga surviving its first hit sounds different from one dying
 * on its second, the player's gun alternates two samples so a burst does not
 * flatten into a tone, and the whole board sits over a low pulse that speeds
 * the game up without changing anything on screen. A build that plays one
 * explosion for all forty enemies has thrown away most of what the cabinet
 * sounded like.
 *
 * The rules live here rather than inline in the scene so that they are one
 * decision in one place, and so `tests/audio.test.js` can assert they never
 * name a sound the game does not have.
 *
 * What each sound *is* lives in `src/audio/`: every one of them is synthesised
 * at startup from a spec, because the twenty-eight mp3s this used to name were
 * ripped from the Galaga ROM and had no business in a public repository. See
 * `docs/local-audio.md`.
 */

import { SOUND_SPECS } from '../audio/soundBank.js';
import { EnemyType } from './formation.js';

/**
 * Every sound the game can play, by the name the scenes play it under.
 *
 * Read off the bank rather than written out again, so a sound cannot be
 * composed and then never wired up -- which is how twenty-one of the original
 * twenty-eight files came to be sitting in `assets/sfx` unreferenced.
 */
export const SOUND_NAMES = Object.freeze(Object.keys(SOUND_SPECS));

/**
 * Which cry an enemy makes when it is shot.
 *
 * `destroyed` is false for the hit a Boss Galaga survives, which is the only
 * case where a hit is not a death: the boss has its own "stricken" sound, and
 * hearing it rather than an explosion is the audible half of the colour change
 * that tells the player a second shot is needed.
 *
 * A transform bonus ship carries no `EnemyType`, so it falls through to the
 * Zako cry rather than to silence.
 */
export function deathSoundFor(enemyType, { destroyed = true } = {}) {
  if (enemyType === EnemyType.BOSS) return destroyed ? 'bossDeath' : 'bossHit';
  if (enemyType === EnemyType.GOEI) return 'goeiDeath';
  return 'zakoDeath';
}

/**
 * How a Challenging Stage signs off.
 *
 * The bonus round is scored on one question -- did you get all forty -- and the
 * cabinet answers it before the banner does. This is the only place `miss.mp3`
 * fits: the file has no sourced event attached to it, but a round that ended
 * short is the one moment in the game that wants a sound meaning "not quite",
 * and every other candidate (a shot that hit nothing, an enemy that escaped)
 * would fire so often it would be noise rather than feedback.
 */
export function challengeResultSound(hits, total) {
  return hits >= total ? 'challengePerfect' : 'challengeMiss';
}

/**
 * The player's gun alternates two samples, shot by shot.
 *
 * Taking the count rather than holding state keeps this pure and makes the
 * alternation survive a scene restart, which a module-level toggle would not.
 */
export function playerShotSound(shotCount) {
  return shotCount % 2 === 0 ? 'fighterShot1' : 'fighterShot2';
}

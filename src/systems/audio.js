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

/**
 * Which WSG voices each sound occupies, after the sound CPU's own parameter
 * table (`d_0703_snd_parms`, gg1-7.s:1376-1399).
 *
 * The cabinet has one Namco WSG with three voices, plus the 54XX discrete
 * circuit for explosion noise. Every effect in that table claims either one
 * fixed voice or all three (the tunes), and starting an effect overwrites the
 * registers of the voices it claims: the hardware cannot stack two sounds on
 * a voice, which is why the real machine never turns into a pile of
 * overlapping tails. Same rule here -- shots on voice 0, the enemy cries on
 * voice 1, the tractor beam on voice 2, every tune takes the whole chip.
 *
 * The empty entries sit outside the contention on the cabinet too:
 * `explosion` is the 54XX circuit, and `ambient`/`enemyDive` stand in for
 * effects the game re-requests every frame -- on hardware a tune talks over
 * them and they resume by re-request; here they are loops the scenes gate,
 * and stopping them for a tune would silence them for good.
 */
export const SOUND_VOICES = Object.freeze({
  fighterShot1: [0],
  fighterShot2: [0],
  enemyFire: [0],
  coin: [0],
  zakoDeath: [1],
  goeiDeath: [1],
  bossHit: [1],
  bossDeath: [1],
  beamOpen: [2],
  beamCapture: [2],
  playerDeath: [0, 1, 2],
  bossEntrance: [0, 1, 2],
  captured: [0, 1, 2],
  rescued: [0, 1, 2],
  stageFlag: [0, 1, 2],
  challengeStart: [0, 1, 2],
  challengeClear: [0, 1, 2],
  challengePerfect: [0, 1, 2],
  challengeMiss: [0, 1, 2],
  transformSet: [0, 1, 2],
  extraLife: [0, 1, 2],
  theme: [0, 1, 2],
  gameStart: [0, 1, 2],
  highScoreEntry: [0, 1, 2],
  gameOverTune: [0, 1, 2],
  explosion: [],
  ambient: [],
  enemyDive: [],
});

/**
 * The playing sounds a new sound silences: every one holding a voice the new
 * sound is about to write over. Pure, so the preemption rule is testable
 * without a Phaser sound manager.
 */
export function soundsSilencedBy(name, playingNames) {
  const voices = SOUND_VOICES[name] ?? [];
  if (voices.length === 0) return [];

  return playingNames.filter(
    (other) => other !== name && (SOUND_VOICES[other] ?? []).some((voice) => voices.includes(voice)),
  );
}

/**
 * The scene's sound bank with the cabinet's voice contention applied.
 *
 * A drop-in for the plain name-to-Sound map the scenes used to build: each
 * entry still answers `play`, `stop` and `isPlaying`, but `play` first stops
 * whatever holds the voices the sound needs, which is exactly what writing
 * the WSG registers did. Playing a sound already playing restarts it -- one
 * instance per name, never a stack.
 */
export function channelledSoundBank(soundManager) {
  const instances = new Map(SOUND_NAMES.map((name) => [name, soundManager.add(name)]));
  const playingNames = () => SOUND_NAMES.filter((name) => instances.get(name).isPlaying);

  const bank = {};
  for (const name of SOUND_NAMES) {
    const instance = instances.get(name);
    bank[name] = {
      play(config) {
        for (const other of soundsSilencedBy(name, playingNames())) instances.get(other).stop();
        return instance.play(config);
      },
      stop: () => instance.stop(),
      get isPlaying() {
        return instance.isPlaying;
      },
    };
  }
  return bank;
}

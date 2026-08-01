/**
 * The sound bank, and the rules for picking which sound plays.
 *
 * Galaga's audio is not decoration. Each rank of enemy has its own cry when it
 * is hit, a Boss Galaga surviving its first hit sounds different from one dying
 * on its second, the player's gun alternates two samples so a burst does not
 * flatten into a tone, and the whole board sits over a low pulse that speeds
 * the game up without changing anything on screen. A build that plays one
 * explosion for all forty enemies has thrown away most of what the cabinet
 * sounded like.
 *
 * The manifest lives here rather than inline in the scene so that "which
 * sounds exist" and "which sound plays when" are one decision in one place,
 * and so `tests/audio.test.js` can assert the second never names something the
 * first does not load.
 */

import { EnemyType } from './formation.js';

/**
 * Every sound the game loads, keyed by the name the scene plays it under.
 *
 * The repo shipped 28 sound files and used seven of them. The rest were not
 * missing, they were unwired: the boss cries, the two fighter shots, the
 * transform fanfare, the extra-life chime, the challenging-stage stings, the
 * title theme and the death music were all sitting in `assets/sfx` unreferenced.
 */
export const SOUND_FILES = {
  // Player.
  fighterShot1: 'assets/sfx/fighter_shot1.mp3',
  fighterShot2: 'assets/sfx/fighter_shot2.mp3',
  playerDeath: 'assets/sfx/mistake_music.mp3',

  // Enemies, one cry per rank.
  zakoDeath: 'assets/sfx/zako_stricken.mp3',
  goeiDeath: 'assets/sfx/goei_stricken.mp3',
  bossHit: 'assets/sfx/boss_stricken2.mp3',
  bossDeath: 'assets/sfx/bossDeath.mp3',
  enemyDive: 'assets/sfx/flying.mp3',
  enemyFire: 'assets/sfx/firing.mp3',
  /** Generic burst, for anything that is not one of the ranked enemies. */
  explosion: 'assets/sfx/kill.mp3',

  // The capture cycle.
  bossEntrance: 'assets/sfx/bossEntrance.mp3',
  beamOpen: 'assets/sfx/beamShot.mp3',
  beamCapture: 'assets/sfx/beamCapture.mp3',
  captured: 'assets/sfx/captured.mp3',
  rescued: 'assets/sfx/rescue_music.mp3',

  // Stages and bonuses.
  stageFlag: 'assets/sfx/stage_flag.mp3',
  challengeStart: 'assets/sfx/challenge_start.mp3',
  challengeClear: 'assets/sfx/challenge_clear.mp3',
  challengePerfect: 'assets/sfx/challenge_perfect.mp3',
  transformSet: 'assets/sfx/triple_formation.mp3',
  extraLife: 'assets/sfx/extend_sound.mp3',

  // Front of house.
  theme: 'assets/sfx/theme.mp3',
  coin: 'assets/sfx/coin.mp3',
  gameStart: 'assets/sfx/start.mp3',
  ambient: 'assets/sfx/ambient_loop.mp3',
  highScoreEntry: 'assets/sfx/name_entry_1st.mp3',
  gameOverTune: 'assets/sfx/name_entry_others.mp3',
};

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
 * The player's gun alternates two samples, shot by shot.
 *
 * Taking the count rather than holding state keeps this pure and makes the
 * alternation survive a scene restart, which a module-level toggle would not.
 */
export function playerShotSound(shotCount) {
  return shotCount % 2 === 0 ? 'fighterShot1' : 'fighterShot2';
}

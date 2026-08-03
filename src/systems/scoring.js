/**
 * Galaga's scoring rules.
 *
 * The ROM does not keep a table of "the moth is worth 80". It keeps a byte of
 * BCD per sprite COLOUR (`d_scoreman_inc_lut`, game_ctrl.s:1288-1290), counts
 * units into `_bug_collsn[colour]` per kill, and -- the detail everything
 * else here follows from -- counts TWO units for a target that was moving and
 * one for a target resting in the grid (`l_0808`/`l_0811`, gg1-5.s:1244-1252).
 * "Moving" is any motion-queue state: the entry caravan, a dive, the homing
 * glide back to the slot. So the doubled value is not a dive premium; it is a
 * flight premium. A diving Boss Galaga is worth more again depending on how
 * many Goei escort it down, which turns "wait for the boss to attack with two
 * escorts" into a real risk-reward decision rather than a trivia table.
 */

import { EnemyType } from './formation.js';
import { TransformType } from './stages.js';

/** Points for a target hit while it is still in formation. */
const FORMATION_VALUES = {
  [EnemyType.ZAKO]: 50,
  [EnemyType.GOEI]: 80,
  [EnemyType.BOSS]: 150,
};

/** Points for a flying Zako or Goei: the formation value, doubled. */
const DIVING_VALUES = {
  [EnemyType.ZAKO]: 100,
  [EnemyType.GOEI]: 160,
};

/**
 * A flying Boss Galaga, indexed by escort count. Alone it is worth 400; each
 * escort doubles the value, to a documented maximum of two.
 *
 * The ROM builds these as 300 (two units of the blue boss's 150) plus a
 * per-boss "scode" of 1/5/13 hundred set when the sortie launches
 * (`d_1CFD`, gg1-2_fx.s:1255-1258) -- and `stg_init_env` re-arms every boss
 * slot to the 400 default each stage (task_man.s:302-303), so a boss shot
 * down during the ENTRY caravan also pays 400, popup and all.
 */
const DIVING_BOSS_VALUES = [400, 800, 1600];

/**
 * Shooting your own captured fighter.
 *
 * The captive is sprite colour 7, whose base value is 500
 * (`d_scoreman_inc_lut[8] = 0x50`, game_ctrl.s:1290, reached via
 * `_bug_collsn[7]`, gg1-5.s:1236-1247). The flight premium doubles it like
 * any other colour: parked on its captor in the grid it pays 500 with no
 * popup (the plain `0x81` notify, gg1-5.s:1201-1204); shot FLYING -- the
 * escort dive beside its captor, or the rogue descent -- it pays 1,000 with
 * the `$38` popup (`l_0849`/`l_08B0`, gg1-5.s:1305-1311, 1384-1387).
 */
export const CAPTIVE_PARKED_POINTS = 500;
export const CAPTIVE_FLYING_POINTS = 1000;

/**
 * A transform bonus arrives as a trio, and the arcade prices the trio as well
 * as the ships in it.
 */
export const TRANSFORM_SET_SIZE = 3;

/**
 * Points for one transform bonus ship, on its own.
 *
 * Paid on every kill, and the set bonus below is paid *on top of* the third.
 * An earlier revision paid nothing until the trio was complete, on the reading
 * that the sources only ever quote a per-set figure; a per-ship figure of 160
 * has since been found alongside the set values, so a partial set is worth
 * something after all. It is still worth chasing all three -- 480 against
 * 1,480 for a Scorpion trio -- which is the decision the mechanic exists to
 * pose.
 */
export const TRANSFORM_SHIP_POINTS = 160;

const TRANSFORM_SET_VALUES = {
  [TransformType.SCORPION]: 1000,
  [TransformType.SPY_SHIP]: 2000,
  [TransformType.FLAGSHIP]: 3000,
};

/**
 * Points for destroying a complete set of three transform bonus enemies.
 *
 * Paid on the third kill, not split across the three. That is what the sourced
 * values describe — "worth 1,000 for the set of three" — and it is also what
 * makes the trio a decision: chasing all three is worth far more than picking
 * one off, so a player has to choose between the bonus and staying safe.
 * A partial set pays nothing, which is the conservative reading of a source
 * that only ever quotes a per-set figure.
 */
export function transformSetPoints(type) {
  const value = TRANSFORM_SET_VALUES[type];
  if (value === undefined) throw new Error(`Unknown transform type: ${type}`);
  return value;
}

/**
 * Points for shooting one ship of a transform trio.
 *
 * `remaining` is how many of the set were still alive *including* this one, so
 * the last one to die arrives here as 1 and is the kill that collects the set
 * bonus. Taking the count rather than a boolean keeps the caller from having to
 * know which kill completes a set.
 */
export function transformKillPoints(type, remaining) {
  const setBonus = remaining <= 1 ? transformSetPoints(type) : 0;
  return TRANSFORM_SHIP_POINTS + setBonus;
}

// ------------------------------------------------------ Challenging Stages

/**
 * The results screen's rate: each hit of the round pays 100 at the tally
 * (`d_scoreman_inc_lut[0] = 0x10` -- one unit of `_bug_collsn[$0F]` is 100
 * points -- and `gctl_chllng_stg_end` adds the hit count itself as units,
 * game_ctrl.s:940-990). The bonus is CREDITED, not just displayed.
 */
export const CHALLENGING_STAGE_HIT_POINTS = 100;

/** Clearing all 40 enemies in a Challenging Stage. Paid INSTEAD of hits x 100. */
export const PERFECT_BONUS = 10000;

/**
 * `d_290E` (gg1-3.s:1641-1642): the packed sprite-code/colour byte each
 * challenge round dresses its non-boss enemies in, indexed by
 * `(stage >> 2) & 7` (`l_28B5`, gg1-3.s:1557-1562). `(byte >> 1) & 7` is the
 * colour, and the colour is the value: round 1's yellowbees are colour 3
 * (50, flying 100); every later round's specials are colours 2/4/5/6 (80,
 * flying 160). Bosses stay colour 0 in a challenge round too
 * (gg1-3.s:1582-1583), so they still take two hits.
 */
const D_290E_CHALLENGE_SPRITES = [0x36, 0x24, 0xd4, 0xba, 0xe4, 0xcc, 0xa8, 0xf4];

/**
 * `d_scoreman_inc_lut` decoded per sprite colour (game_ctrl.s:1288-1290,
 * BCD, reverse-indexed): blue boss 150, redmoth 80, yellowbee 50, the
 * challenge/transform specials (4/5/6) 80, the captured fighter 500.
 */
const COLOR_BASE_VALUES = { 1: 150, 2: 80, 3: 50, 4: 80, 5: 80, 6: 80, 7: 500 };

/** The non-boss colour a challenge round flies, from its d_290E byte. */
export function challengeColorFor(stage) {
  return (D_290E_CHALLENGE_SPRITES[(stage >> 2) & 0x07] >> 1) & 0x07;
}

/** A challenge wave is eight; destroying all eight pays the wave bonus. */
export const CHALLENGE_WAVE_SIZE = 8;

/**
 * `d_stage_chllg_rnd_attrib` (gg1-3.s:1633-1637): 10/15/20/30 units of 100
 * with popup sprites $38/$39/$3C/$3D, selected by `(stage >> 3) & 3` and
 * clamped to the last row from stage 32 on (`l_28B5`, gg1-3.s:1538-1555).
 * So rounds step 1000, 1000, 1500, 1500, 2000, 2000, then 3000 forever.
 */
const CHALLENGE_WAVE_BONUSES = [1000, 1500, 2000, 3000];

export function challengeWaveBonus(stage) {
  return CHALLENGE_WAVE_BONUSES[Math.min(stage >> 3, CHALLENGE_WAVE_BONUSES.length - 1)];
}

/**
 * Points for one Challenging Stage kill. Everything in a challenge round is
 * flying, so everything pays the doubled colour value; a boss adds its
 * default 100-point scode on top (the `01 B5` stage-init arming,
 * task_man.s:302-303) for the familiar 400 -- EXCEPT on the kill that
 * completes a wave of eight, which routes through the wave-bonus notify
 * instead and skips the scode (`l_081E`, gg1-5.s:1283-1300).
 *
 * @param {string}  type one of EnemyType
 * @param {number}  stage
 * @param {object}  [options]
 * @param {boolean} [options.completesWave] this kill is the wave's eighth
 */
export function challengeKillPoints(type, stage, { completesWave = false } = {}) {
  const base =
    2 * (type === EnemyType.BOSS ? COLOR_BASE_VALUES[1] : COLOR_BASE_VALUES[challengeColorFor(stage)]);

  if (completesWave) return base + challengeWaveBonus(stage);
  return type === EnemyType.BOSS ? base + 100 : base;
}

// ---------------------------------------------------------------- the kill

/**
 * Score for destroying an enemy on a combat stage.
 *
 * @param {string} type       one of EnemyType
 * @param {object} context
 * @param {boolean} context.diving  true if the target was NOT resting in the
 *                                  grid -- entry caravan, dive, or the glide
 *                                  home all pay the doubled (flying) value
 * @param {number}  context.escorts Goei diving alongside a boss (0-2)
 */
export function scoreFor(type, context = {}) {
  const { diving = false, escorts = 0 } = context;

  if (!diving) {
    const value = FORMATION_VALUES[type];
    if (value === undefined) throw new Error(`Unknown enemy type: ${type}`);
    return value;
  }

  if (type === EnemyType.BOSS) {
    const clamped = Math.min(Math.max(escorts, 0), DIVING_BOSS_VALUES.length - 1);
    return DIVING_BOSS_VALUES[clamped];
  }

  const value = DIVING_VALUES[type];
  if (value === undefined) throw new Error(`Unknown enemy type: ${type}`);
  return value;
}

/**
 * Extra ships.
 *
 * The arcade's factory setting is "1st bonus 20000, 2nd bonus 70000, and every
 * 70000 thereafter". Note that the second award is at 70000 outright, not at
 * 20000 plus an interval, so the first gap is 50000 and every later gap is
 * 70000. Reading it as a uniform interval from 20000 puts every award after
 * the first in the wrong place.
 *
 * Which scheme is in force is a DIP switch: the cabinet offers several, some
 * of which stop after the second award and one of which pays nothing at all.
 * The schemes live in `dips.js`; the factory one is spelled out here because
 * the title screen prints it and the tests pin it.
 */
export const FIRST_EXTRA_LIFE = 20000;
export const SECOND_EXTRA_LIFE = 70000;
export const EXTRA_LIFE_INTERVAL = 70000;

/** The factory scheme, in the shape `dips.js` schemes take. */
export const FACTORY_BONUS_SCHEME = Object.freeze({
  id: 'C',
  first: FIRST_EXTRA_LIFE,
  second: SECOND_EXTRA_LIFE,
  every: EXTRA_LIFE_INTERVAL,
});

/**
 * How many extra lives crossing from `previousScore` to `newScore` awards
 * under a bonus scheme.
 *
 * Returns a count rather than a boolean so that a single large bonus, such as
 * a perfect Challenging Stage, can legitimately award more than one life.
 * Called without a scheme this is the factory machine.
 */
export function extraLivesEarned(previousScore, newScore, scheme = FACTORY_BONUS_SCHEME) {
  return livesAwardedAt(newScore, scheme) - livesAwardedAt(previousScore, scheme);
}

function livesAwardedAt(score, scheme) {
  if (scheme.first === null || score < scheme.first) return 0;
  if (scheme.second === null || score < scheme.second) return 1;
  if (scheme.every === null) return 2;
  return 2 + Math.floor((score - scheme.second) / scheme.every);
}

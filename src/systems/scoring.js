/**
 * Galaga's scoring rules.
 *
 * The detail that makes Galaga's scoring interesting is that a target is worth
 * more while it is diving than while it sits in formation, and a diving Boss
 * Galaga is worth more again depending on how many Goei escort it down. That
 * turns "wait for the boss to attack with two escorts" into a real risk-reward
 * decision rather than a trivia table.
 */

import { EnemyType } from './formation.js';
import { TransformType } from './stages.js';

/** Points for a target hit while it is still in formation. */
const FORMATION_VALUES = {
  [EnemyType.ZAKO]: 50,
  [EnemyType.GOEI]: 80,
  [EnemyType.BOSS]: 150,
};

/** Points for a diving Zako or Goei. */
const DIVING_VALUES = {
  [EnemyType.ZAKO]: 100,
  [EnemyType.GOEI]: 160,
};

/**
 * A diving Boss Galaga, indexed by escort count. Alone it is worth 400; each
 * escort doubles the value, to a documented maximum of two.
 */
const DIVING_BOSS_VALUES = [400, 800, 1600];

/** Shooting your own captured fighter off the boss that took it. */
export const CAPTURED_FIGHTER_POINTS = 1000;

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

/** Every hit during a Challenging Stage is worth a flat 100. */
export const CHALLENGING_STAGE_HIT_POINTS = 100;

/** Clearing all 40 enemies in a Challenging Stage. */
export const PERFECT_BONUS = 10000;

/**
 * Score for destroying an enemy.
 *
 * @param {string} type       one of EnemyType
 * @param {object} context
 * @param {boolean} context.diving      true if the target had left formation
 * @param {number}  context.escorts     Goei diving alongside a boss (0-2)
 * @param {boolean} context.challenging true during a Challenging Stage
 */
export function scoreFor(type, context = {}) {
  const { diving = false, escorts = 0, challenging = false } = context;

  if (challenging) return CHALLENGING_STAGE_HIT_POINTS;

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
 */
export const FIRST_EXTRA_LIFE = 20000;
export const SECOND_EXTRA_LIFE = 70000;
export const EXTRA_LIFE_INTERVAL = 70000;

/**
 * How many extra lives crossing from `previousScore` to `newScore` awards.
 *
 * Returns a count rather than a boolean so that a single large bonus, such as
 * a perfect Challenging Stage, can legitimately award more than one life.
 */
export function extraLivesEarned(previousScore, newScore) {
  return livesAwardedAt(newScore) - livesAwardedAt(previousScore);
}

function livesAwardedAt(score) {
  if (score < FIRST_EXTRA_LIFE) return 0;
  if (score < SECOND_EXTRA_LIFE) return 1;
  return 2 + Math.floor((score - SECOND_EXTRA_LIFE) / EXTRA_LIFE_INTERVAL);
}

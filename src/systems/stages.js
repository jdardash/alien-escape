/**
 * Stage progression.
 *
 * Galaga's Challenging Stages land on stage 3 and then every fourth stage
 * after it. During one, the formation flies scripted patterns and never fires
 * or dives, and clearing all forty pays a perfect bonus. They are a breather
 * and a bonus round at once, which is why the difficulty curve either side of
 * them can stay aggressive.
 */

import { CHALLENGING_PATTERN_COUNT } from './paths.js';
import { ENTRANCE_PATTERN_COUNT } from './formation.js';

export { CHALLENGING_PATTERN_COUNT, ENTRANCE_PATTERN_COUNT };

/** Stage 3, then 7, 11, 15, and so on. */
export function isChallengingStage(stage) {
  if (stage < 3) return false;
  return (stage - 3) % 4 === 0;
}

/**
 * Whether arriving enemies bomb while still flying into formation.
 *
 * The arcade holds fire through the whole of round 1's assembly and opens up
 * from round 2 onward, which is what makes the opening screen a gentle
 * introduction rather than a scramble.
 */
export function enemiesFireDuringEntry(stage) {
  return stage >= 2 && !isChallengingStage(stage);
}

/**
 * Which of the eight Challenging Stage routes this stage flies.
 *
 * The arcade cycles eight distinct preset routes and repeats them after stage
 * 31, so the bonus round reads as choreography rather than as a replay. The
 * wrap lives here rather than in `challengingPath` so that "which pattern is
 * stage N" is answerable without touching the geometry. Returns null for a
 * normal stage.
 */
export function challengingPatternIndex(stage) {
  if (!isChallengingStage(stage)) return null;
  return Math.floor((stage - 3) / 4) % CHALLENGING_PATTERN_COUNT;
}

/**
 * Which of the three entrance patterns this stage's wave flies in on.
 *
 * The sourced rule is that the pattern is *fixed per stage*: all five flights
 * of a wave belong to one pattern, and there are three of them. Which stage
 * draws which is the part that could not be sourced, so the cycle here is the
 * simplest assignment that satisfies the rule -- one pattern per stage, in
 * order, repeating every third stage. That gives a player a different entrance
 * on consecutive stages and the same entrance on a stage they have seen
 * before, which is the behaviour the fixedness exists to produce.
 *
 * Every stage has one, including a Challenging Stage, which simply never asks:
 * a bonus round has no formation to assemble.
 */
export function entrancePatternFor(stage) {
  const index = (stage - 1) % ENTRANCE_PATTERN_COUNT;
  return index < 0 ? index + ENTRANCE_PATTERN_COUNT : index;
}

/**
 * Difficulty knobs for a stage.
 *
 * Values ramp then plateau. Galaga stops getting harder somewhere around the
 * high teens; without a floor the dive interval would eventually reach zero
 * and the game would become unplayable rather than difficult.
 *
 * There is deliberately no rate of fire for the formation. In the arcade an
 * enemy only ever bombs while it is flying, on its way in or on an attack run;
 * a ship sitting in the grid never shoots. Firing from the formation made the
 * whole grid a threat at all times and flattened the rhythm the dives create.
 */
export function stageDifficulty(stage) {
  const ramp = Math.min(stage, 16);

  return {
    diveIntervalMs: Math.max(3000 - ramp * 160, 900),
    maxSimultaneousDivers: Math.min(1 + Math.floor(ramp / 3), 6),
    diveSpeed: Math.min(1 + ramp * 0.045, 1.7),
    escortChance: Math.min(0.2 + ramp * 0.03, 0.75),
  };
}

/**
 * The three kinds of transform bonus enemy, in the order the arcade cycles
 * them.
 *
 * From stage 4 the game periodically pulls a Zako out of formation, pulsates
 * it, and turns it into a trio of high-value bonus enemies. It is the main
 * reason stage 6 does not look like stage 2, and skipping it is why most
 * clones plateau visually after the first few rounds.
 */
export const TransformType = {
  SCORPION: 'scorpion',
  SPY_SHIP: 'spyShip',
  FLAGSHIP: 'flagship',
};

const TRANSFORM_CYCLE = [TransformType.SCORPION, TransformType.SPY_SHIP, TransformType.FLAGSHIP];

/**
 * Which transform enemy this stage produces, or null for none.
 *
 * The arcade runs Scorpions on stages 4-6, Bosconian Spy Ships on 8-10 and
 * Galaxian Flagships on 12-14, then repeats in the same order. Those runs are
 * exactly the three normal stages that sit between two Challenging Stages,
 * which is why the group index is `(stage - 4) / 4` rather than a count of
 * normal stages: it advances once per challenging stage, keeping each type
 * pinned to its own block however the run goes.
 *
 * Challenging Stages themselves return null. There is no formation during one,
 * so there is nothing to pull a Zako out of.
 */
export function transformTypeFor(stage) {
  if (stage < 4 || isChallengingStage(stage)) return null;
  return TRANSFORM_CYCLE[Math.floor((stage - 4) / 4) % TRANSFORM_CYCLE.length];
}

/** Flag denominations shown bottom-right, highest first. */
const FLAG_VALUES = [50, 30, 20, 10, 5, 1];

/**
 * Break a stage number into the flags Galaga displays for it.
 *
 * Greedy largest-first, which is what the original does: stage 8 shows a 5 and
 * three 1s rather than eight 1s.
 */
export function stageFlags(stage) {
  const flags = [];
  let remaining = stage;

  for (const value of FLAG_VALUES) {
    const count = Math.floor(remaining / value);
    if (count > 0) {
      flags.push({ value, count });
      remaining -= value * count;
    }
  }

  return flags;
}

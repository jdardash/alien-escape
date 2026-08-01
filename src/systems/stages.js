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
import { ENTRANCE_PATTERN_COUNT, EnemyType, FORMATION_SIZE } from './formation.js';

export { CHALLENGING_PATTERN_COUNT, ENTRANCE_PATTERN_COUNT };

/** Stage 3, then 7, 11, 15, and so on. */
export function isChallengingStage(stage) {
  if (stage < 3) return false;
  return (stage - 3) % 4 === 0;
}

/**
 * The highest stage number the counter reaches before it wraps.
 *
 * Galaga keeps the stage in a single byte, and it is allowed to overflow: the
 * stage after 255 is announced as stage zero. It is not a crash and it is not a
 * kill screen -- the game keeps going, the flags along the bottom of the HUD
 * empty out because zero needs none, and the next stage is 1 again.
 */
export const STAGE_ROLLOVER = 255;

/**
 * The stage after this one.
 *
 * Everything a stage decides for itself -- its entrance pattern, whether it is
 * a Challenging Stage, which transform enemy it produces, how many flags it
 * shows -- is derived from this number, so all of it wraps with it. What does
 * *not* wrap is the difficulty, which `GameScene` drives from a separate count
 * of stages played: a player who has survived 255 stages should not be handed
 * the opening round's dive interval as a reward.
 */
export function nextStage(stage) {
  return stage >= STAGE_ROLLOVER ? 0 : stage + 1;
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
 * Whether enemies drop bombs at all this stage, arriving or attacking.
 *
 * Stage 1 is not merely gentle in the arcade, it is unarmed: the per-stage
 * difficulty table (`bmbr_stg_cfg_dat`) has the bomb-drop enable flags at zero
 * for the opening round, so the only way to die on stage 1 is to be flown into.
 * That is what makes the first screen the place a new player learns the
 * formation without being punished for standing still.
 *
 * `enemiesFireDuringEntry` remains the narrower rule of the two -- whether a
 * ship still flying into formation may bomb -- and a stage where nothing bombs
 * at all necessarily holds fire on the way in as well.
 */
export function enemiesBomb(stage) {
  return stage >= 2 && !isChallengingStage(stage);
}

/**
 * The fewest enemies that may be left on screen for a boss to try a beam.
 *
 * With the formation nearly cleared the arcade stops attempting captures
 * entirely. It reads as the survivors going all-out rather than one of them
 * breaking off to set a trap, and mechanically it stops the end of a stage from
 * being decided by a capture the player has no formation left to hunt the
 * captor through.
 */
export const CAPTURE_MIN_ENEMIES = 5;

/**
 * Whether a Boss Galaga may attempt a tractor beam right now.
 *
 * Two gates, neither of them a clock. The arcade enables captures per stage
 * through a flag in the same difficulty table that disarms stage 1, and stops
 * attempting them once the formation is down to a handful. The scene still runs
 * a timer to decide *when* to try; this decides whether trying is legal at all.
 */
export function captureAllowed(stage, enemiesRemaining) {
  if (stage < 2 || isChallengingStage(stage)) return false;
  return enemiesRemaining > CAPTURE_MIN_ENEMIES;
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
 * How many entrance rows the arcade cycles through before repeating.
 *
 * The ROM indexes its fly-in data as `d_combat_stg_dat_idx[rank * 17 + row]`:
 * seventeen rows per difficulty rank, pointing into thirteen distinct caravan
 * shapes in `d_combat_stg_dat`. Seventeen is the number that matters here,
 * because it is the period -- it is how long a player plays before an entrance
 * they have seen comes round again.
 */
export const COMBAT_STAGE_ROWS = 17;

/**
 * The arcade's entrance row for a stage.
 *
 * Reproduces the ROM's index arithmetic: wrap anything past 23 back by four
 * until it is inside the table, then take `stage - stage/4 - 1`. The `- stage/4`
 * is what makes this count *combat* stages rather than stages: a challenging
 * stage has no formation to assemble, does not consume a row, and so stages 2
 * and 4 are neighbours in this sequence even though 3 sits between them.
 *
 * The result is that the seventeen rows are used in order across stages 1-22
 * (minus the challenging ones), and from stage 24 onward the wrap pins every
 * later stage onto one of the last three rows.
 *
 * A challenging stage never asks -- `launchChallengingStage` does not build a
 * formation -- so the clamp exists only so that a stray call cannot return an
 * index off the end of the table.
 */
export function combatStageIndex(stage) {
  let wrapped = stage;
  while (wrapped > 0x17) wrapped -= 4;

  const row = wrapped - Math.floor(wrapped / 4) - 1;
  return Math.min(Math.max(row, 0), COMBAT_STAGE_ROWS - 1);
}

/**
 * Which entrance pattern this stage's wave flies in on.
 *
 * The pattern is fixed for the whole of a stage: all five flights belong to one
 * of the three shapes in `formation.js`. Which stage draws which follows the
 * arcade's own row cycle above rather than a plain `stage % 3`, so the *period*
 * is authentic -- seventeen combat stages, wrapping by four after 23 -- even
 * though the repo authors three shapes where the ROM stores thirteen.
 *
 * Being honest about what is and is not authentic here: that entrances are
 * fixed per stage, that they repeat on the arcade's schedule, and that no two
 * consecutive combat stages share one are all real. That the wave arriving on
 * stage 9 is the *specific* shape the cabinet flies on stage 9 is not claimed;
 * reproducing that needs all thirteen caravan rows and the rank-indexed table
 * that selects between them.
 */
export function entrancePatternFor(stage) {
  return combatStageIndex(stage) % ENTRANCE_PATTERN_COUNT;
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

/**
 * Who flies a Challenging Stage.
 *
 * A bonus round is not the attack formation flying a different route: it is
 * "one type of enemy along with four Boss Galaga" -- Zako in the first, Goei in
 * the second, alternating from there. That is what makes the eight bonus rounds
 * distinguishable from one another beyond their choreography, and what makes
 * the four bosses among them read as the thing worth aiming at.
 *
 * Returned in formation-slot order, so the four bosses come first and the
 * scene's existing five-flights-of-eight split puts them at the head of the
 * opening wave. Null for a normal stage, which has a real formation instead.
 */
export function challengingRoster(stage) {
  const pattern = challengingPatternIndex(stage);
  if (pattern === null) return null;

  const rank = pattern % 2 === 0 ? EnemyType.ZAKO : EnemyType.GOEI;
  return Array.from({ length: FORMATION_SIZE }, (_slot, index) =>
    index < CHALLENGING_BOSSES ? EnemyType.BOSS : rank,
  );
}

/** Boss Galaga in every Challenging Stage, however the rest of it is filled. */
const CHALLENGING_BOSSES = 4;

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

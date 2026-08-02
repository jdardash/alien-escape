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
import {
  CARAVAN_ROW_COUNT,
  COMBAT_STAGE_ROWS,
  DifficultyRank,
  RANK_COUNT,
  RANK_NAMES,
  caravanFor,
  caravanIndexFor,
  combatStageIndex,
  normalizeRank,
} from './caravans.js';
import { DIFFICULTY_STAGE_ROWS, difficultyRow } from './difficulty.js';

export {
  CHALLENGING_PATTERN_COUNT,
  ENTRANCE_PATTERN_COUNT,
  CARAVAN_ROW_COUNT,
  COMBAT_STAGE_ROWS,
  DIFFICULTY_STAGE_ROWS,
  DifficultyRank,
  RANK_COUNT,
  RANK_NAMES,
  caravanFor,
  combatStageIndex,
  difficultyRow,
  normalizeRank,
};

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
 * In the ROM this is not a difficulty-row flag at all: the fly-in bombing
 * mask is the second header byte of the stage's caravan row (`b_92E2[1]`,
 * 0x00 on stage 1 and every challenge row, nonzero from stage 2), gated
 * per creature by the 44-bit capability table `d_2908` (exported from
 * `difficultyData.js`). Task 4's caravan machine wires those two together;
 * until it does, this keeps the observable rule -- entry fire from stage 2,
 * never on a challenge stage -- with the rank parameter held for the API.
 */
export function enemiesFireDuringEntry(stage, _rank = DifficultyRank.A) {
  if (isChallengingStage(stage)) return false;
  return stage >= 2;
}

/**
 * Whether enemies drop bombs at all this stage, arriving or attacking.
 *
 * An earlier pass believed stage 1 was unarmed at the factory rank -- an
 * invented flags column said so. The ROM has no such flag: `f_0857` computes
 * the bomb-drop mask every frame from `d_0909` through the row's parameter
 * [0], and no reachable cell of that table is zero, so even stage 1's dives
 * carry one or two bombs (parameter [0] = 0 is d_0909's gentlest ROW, not
 * "off"; the corpus verified `bombDropFlags = 3` live on stage 1). What is
 * genuinely unarmed on stage 1 is the fly-in -- see `enemiesFireDuringEntry`.
 *
 * What remains of this gate is the challenge-stage rule: those rows launch
 * no attacks and their caravan header carries no fly-in mask, so nothing on
 * them ever bombs. The rank parameter is held for the API.
 */
export function enemiesBomb(stage, _rank = DifficultyRank.A) {
  return !isChallengingStage(stage);
}

/**
 * Whether a Boss Galaga may attempt a tractor beam right now.
 *
 * The arcade does not stage-gate captures: every other boss launch is a solo
 * capture dive from stage 1 onward (gg1-2_fx.s:1013-1043), one at a time.
 * The pass-5 capture flag and its minimum-formation threshold were both
 * invented and are gone. What is left is structural: a challenge stage has
 * no formation to launch a captor from, and a capture needs at least one
 * enemy alive to be the captor. The scene still runs its own timer to decide
 * *when* to try until Task 5 moves the attempt onto the boss launch
 * alternation the scheduler now exposes.
 */
export function captureAllowed(stage, enemiesRemaining, _rank = DifficultyRank.A) {
  if (isChallengingStage(stage)) return false;
  return enemiesRemaining > 0;
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
 * Which caravan this stage's wave flies in on.
 *
 * Fixed for the whole of a stage: all five flights come out of one row of the
 * table in `caravans.js`. Which row follows the arcade's own arithmetic --
 * `d_combat_stg_dat_idx[rank * 17 + (stage - stage/4 - 1)]` -- so both the
 * period and the rank dimension are the cabinet's, and a stage is a different
 * entrance on a machine the operator has set harder.
 */
export function entrancePatternFor(stage, rank = DifficultyRank.A) {
  return caravanIndexFor(stage, rank);
}

/**
 * Difficulty knobs for a stage, at a rank.
 *
 * The decoded row from `difficulty.js` -- the ROM's ten nibble parameters
 * plus the computed clone-attack gate -- passed through whole, because the
 * attack scheduler feeds `parms` back into the per-frame `bomberConfig`
 * lookup. There are no per-stage launch cadences here: cadence is the fixed
 * initial timers plus reloads recomputed every frame from the live board,
 * which is `attack.js`'s job now.
 *
 * Nor is there a dive-speed scalar any more: dive speed lives in the attack
 * tables' own per-segment nibbles, which the path interpreter runs directly.
 *
 * There is deliberately no rate of fire for the formation. In the arcade an
 * enemy only ever bombs while it is flying, on its way in or on an attack run;
 * a ship sitting in the grid never shoots. Firing from the formation made the
 * whole grid a threat at all times and flattened the rhythm the dives create.
 */
export function stageDifficulty(stage, rank = DifficultyRank.A) {
  return { ...difficultyRow(stage, normalizeRank(rank)) };
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

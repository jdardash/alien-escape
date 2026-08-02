/**
 * The difficulty machine, as the ROM runs it.
 *
 * Galaga does not keep per-stage launch cadences. A stage row is 5 packed
 * bytes -- ten nibbles -- and most of those nibbles are INDICES into
 * secondary lookup tables. The launch timers start from fixed constants
 * (`INITIAL_LAUNCH_TICKS`) and every subsequent reload is recomputed EVERY
 * FRAME from two live inputs: how many bugs are left on the board and how
 * long the stage has run. Fewer bugs and a longer stage both tighten the
 * cadence, which is the real "the longer you camp, the harder it gets".
 *
 * This file is the pure rules half: the stage-row decode (`c_2C00`), the
 * per-frame configuration (`f_0857`) and its two lookup routines
 * (`c_08AD`, `c_08BE`). The bytes live in `difficultyData.js`, verbatim; the
 * scheduler that consumes the output is `attack.js`.
 *
 * Sources: new_stage.s:28-119 (decode), game_ctrl.s:1386-1499 (per-frame
 * config and lookups), via docs/rom-research/attack-difficulty.md.
 */

import {
  BMBR_STG_CFG_DAT,
  CFG_ROW_BYTES,
  CFG_STAGE_ROWS,
  CFG_SUBTABLE_BYTES,
  D_08CD_RED_RELOAD,
  D_08EB_YELLOW_RELOAD,
  D_0909_0929,
  D_0909_0929_OVERRUN_BYTE,
  D_0929_OFFSET,
  MACHINE_RANK_VALUES,
  cloneAttackGate,
  difficultySubTable,
} from './difficultyData.js';
import { DifficultyRank, normalizeRank } from './caravans.js';

/** Stage rows in a rank's sub-table. */
export const DIFFICULTY_STAGE_ROWS = CFG_STAGE_ROWS;

/** Decoded parameters per stage: ten packed nibbles plus the computed [10]. */
export const DIFFICULTY_PARAMS = 11;

/**
 * The stage the table actually plays, after the ROM's cycling adjust.
 *
 * `c_2C00` runs `while (stage >= 0x1B) stage -= 4` (new_stage.s:31-35 --
 * `cp #0x1B / jr c` exits only when the stage is BELOW 27, so 27 itself is
 * adjusted). Past stage 26 the last FOUR stages repeat forever: 27 plays 23,
 * 28 plays 24, 31 plays 23 again. One of the four is a challenge row, which
 * is why the adjust is a cycle and not a clamp -- stage 27 is a challenge
 * stage and lands on the challenge row, where a clamp would hand it stage
 * 26's combat row.
 */
export function adjustedStage(stage) {
  let s = Math.max(Math.trunc(stage), 1);
  while (s >= 0x1b) s -= 4;
  return s;
}

/** The row a stage plays: 1-based stages onto 0-based rows, cycling past 26. */
export function difficultyRowIndex(stage) {
  return adjustedStage(stage) - 1;
}

/**
 * The eleven stage parameters, decoded as `c_2C00` decodes them
 * (new_stage.s:59-98): each packed byte splits high-nibble-first into two
 * parameters, and [10] is computed from the stage number.
 *
 * | Idx | Meaning                                                        |
 * |-----|----------------------------------------------------------------|
 * | [0] | bomb-drop enable row index into d_0909                         |
 * | [1] | boss reload row index into d_0929                              |
 * | [2] | red (Goei) reload row index into d_08CD                        |
 * | [3] | yellow (Zako) reload row index into d_08EB                     |
 * | [4] | max concurrent attackers, initial                              |
 * | [5] | max concurrent attackers after the 30 s ramp                   |
 * | [6] | tractor-beam frames per strip (capture animation speed)        |
 * | [7] | continuous bombing arms when live bugs drop below this         |
 * | [8] | stage-8 flag: F0 fly-in token jumps to replacement sub-paths   |
 * | [9] | stage-12 flag: EF token jumps to the harder bombing pass       |
 * | [10]| clone-attack (transform trio) arming threshold, computed       |
 */
export function stageParms(stage, rank = DifficultyRank.A) {
  // Logical rank letter -> the machine's raw rank value -> the rotation LUT.
  // Net: rank A plays sub-table 0 (easiest), D sub-table 3 (hardest).
  const sub = difficultySubTable(MACHINE_RANK_VALUES[normalizeRank(rank)]);
  const base = sub * CFG_SUBTABLE_BYTES + difficultyRowIndex(stage) * CFG_ROW_BYTES;

  const parms = new Array(DIFFICULTY_PARAMS);
  for (let i = 0; i < CFG_ROW_BYTES; i += 1) {
    const byte = BMBR_STG_CFG_DAT[base + i];
    parms[i * 2] = (byte >> 4) & 0x0f;
    parms[i * 2 + 1] = byte & 0x0f;
  }
  parms[10] = cloneAttackGate(stage);
  return parms;
}

/**
 * One stage's parameters at one rank, decoded into named fields.
 *
 * The names are this codebase's; the indices are the ROM's. `parms` rides
 * along raw because the scheduler feeds it back into `bomberConfig` every
 * frame.
 */
export function difficultyRow(stage, rank = DifficultyRank.A) {
  const parms = stageParms(stage, rank);
  return {
    parms,
    bombDropRow: parms[0],
    bossReloadRow: parms[1],
    redReloadRow: parms[2],
    yellowReloadRow: parms[3],
    maxBombers: parms[4],
    maxBombersRamped: parms[5],
    /** Frames each of the tractor beam's strips takes to unfurl. */
    beamFramesPerStrip: parms[6],
    /** Continuous bombing arms when live bugs drop below this. */
    continuousBombingThreshold: parms[7],
    stage8PathSwitch: parms[8] !== 0,
    stage12BombingSwitch: parms[9] !== 0,
    /** Transform trio arms when live bugs drop below this; 0 disables. */
    cloneAttackGate: parms[10],
  };
}

/**
 * The stage timer the reload columns read: `ds4_game_tmrs[2]`.
 *
 * Starts each stage at 0x78 and counts DOWN, one step every 30 frames
 * (~2 Hz; the corpus port of f_1DD2 ticks it exactly so). It crosses 0x3C
 * about 30 s in -- the max-bombers ramp -- and the reload columns shift at
 * 0x28 (~40 s) and 0 (~60 s).
 */
export const STAGE_TIMER_START = 0x78;

/** Frames between stage-timer decrements: the ~2 Hz tick. */
export const STAGE_TIMER_TICK_FRAMES = 30;

/** The stage-timer value below which the max-bombers ramp applies. */
export const MAX_BOMBERS_RAMP_THRESHOLD = 0x3c;

/**
 * `c_08AD` (game_ctrl.s:1451-1468): red/yellow reload lookup.
 *
 * Row = parameter x 3; column by elapsed stage time -- 0 while the timer is
 * still at or above 0x28, 1 once below it, 2 once it has run out. Later in
 * the stage means a lower column means a faster reload.
 */
export function reloadByStageTime(table, rowIndex, stageTimer) {
  let col = 0;
  if (stageTimer < 0x28) col += 1;
  if (stageTimer === 0) col += 1;
  return table[rowIndex * 3 + col];
}

/**
 * `c_08BE` (game_ctrl.s:1482-1499): bomb-mask and boss-reload lookup.
 *
 * Row = parameter x 4 from `baseOffset`; column = live bugs / 10, which is
 * 0-4 -- and column 4 deliberately reads one byte past the row. The flat
 * indexing is the ROM's: `d_0909` row 7 column 4 lands on `d_0929`'s first
 * byte, and `d_0929`'s own last row column 4 lands on the first opcode byte
 * of the routine after the table.
 */
export function reloadByBugCount(baseOffset, rowIndex, bugs) {
  const col = Math.min(Math.max(Math.trunc(bugs / 10), 0), 4);
  const flat = baseOffset + rowIndex * 4 + col;
  return flat < D_0909_0929.length ? D_0909_0929[flat] : D_0909_0929_OVERRUN_BYTE;
}

/**
 * `f_0857` (game_ctrl.s:1386-1438): the per-frame bomber configuration.
 *
 * Pure form of the frame task. From the stage parameters and the two live
 * inputs it returns the ceiling on concurrent attackers (ramped once the
 * stage timer crosses 30 s), the bomb-drop bitmask an attacker is armed with
 * at launch, and the three per-type reload values in 16-frame ticks. In
 * continuous-bombing mode every reload is pinned to 2 ticks -- the rapid-fire
 * endgame.
 *
 * The ROM's ramp overwrites parms[4] in place; recomputing it here from an
 * only-decreasing timer is equivalent and keeps the function pure.
 */
export function bomberConfig(parms, { aliveBugs = 0, stageTimer = STAGE_TIMER_START, continuousBombing = false } = {}) {
  const maxBombers = stageTimer < MAX_BOMBERS_RAMP_THRESHOLD ? parms[5] : parms[4];
  const bombFlags = reloadByBugCount(0, parms[0], aliveBugs);

  if (continuousBombing) {
    return { maxBombers, bombFlags, reloads: { boss: 2, goei: 2, zako: 2 } };
  }

  return {
    maxBombers,
    bombFlags,
    reloads: {
      boss: reloadByBugCount(D_0929_OFFSET, parms[1], aliveBugs),
      goei: reloadByStageTime(D_08CD_RED_RELOAD, parms[2], stageTimer),
      zako: reloadByStageTime(D_08EB_YELLOW_RELOAD, parms[3], stageTimer),
    },
  };
}

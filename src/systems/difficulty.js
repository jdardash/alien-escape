/**
 * The difficulty table.
 *
 * Galaga does not scale a curve. The ROM holds a table of per-stage parameter
 * rows -- 4 ranks x 26 stage rows x 10 parameters -- and a stage plays
 * whatever its row says: how often each *type* of enemy launches an attack,
 * how many attackers may be in the air, how that ceiling grows as a stage
 * drags on, how many bombs one attacker may string together, the faster
 * reload vectors that take over from stage 8, how many wingmen a leader
 * clones onto its attack, and the enable flags that leave stage 1 unarmed on
 * a factory machine.
 *
 * The structure here is the ROM's: four independent ranks, 26 stage rows that
 * clamp rather than wrap, ten parameters a row, frame-denominated counters at
 * the cabinet's 60.606 Hz. The *values* are authored -- the published
 * research describes the table's shape and where it lives, not its bytes --
 * and they are stored as literals rather than computed, because a table the
 * ROM keeps as data should be data here too, hand-editable one cell at a
 * time the way the original was tuned.
 */

import { FRAME_MS } from './pathcode.js';
import { DifficultyRank, normalizeRank } from './caravans.js';

/** Stage rows in a rank's table. Stages past 26 replay the last row. */
export const DIFFICULTY_STAGE_ROWS = 26;

/** Parameters in a row. */
export const DIFFICULTY_PARAMS = 10;

/** Row flag: enemies may drop bombs at all this stage. */
export const FLAG_BOMBS = 1;

/** Row flag: a Boss Galaga may attempt a tractor beam this stage. */
export const FLAG_CAPTURE = 2;

/** Row flag: enemies may bomb while still flying in to formation. */
export const FLAG_ENTRY_BOMBS = 4;

/**
 * The table itself: `DIFFICULTY_TABLE[rank][stageRow]` is
 * `[zakoLaunchFrames, goeiLaunchFrames, bossLaunchFrames, maxActiveBombers,
 *   bomberRampFrames, continuousBombs, reloadZakoFrames, reloadEscortFrames,
 *   cloneAttackCount, flags]`.
 *
 * Row 0 is stage 1. Its rank-A flags are zero: on a factory machine the
 * opening stage is unarmed, and the only way to die on it is to be flown
 * into. The two hard ranks arm it, which is the operator's call, not the
 * game's. From row 7 (stage 8) the scheduler reloads its counters from the
 * reload vectors instead of the launch columns -- the ROM's own switch.
 */
export const DIFFICULTY_TABLE = [
  // Rank A -- the factory setting.
  [
    [170, 200, 340, 1, 2400, 0, 122, 150, 0, 0],
    [165, 195, 333, 1, 2340, 1, 119, 146, 0, 7],
    [161, 190, 325, 1, 2280, 1, 116, 143, 0, 7],
    [156, 184, 318, 1, 2220, 1, 112, 138, 0, 7],
    [152, 179, 310, 1, 2160, 1, 109, 134, 0, 7],
    [147, 174, 303, 2, 2100, 1, 106, 131, 0, 7],
    [142, 169, 295, 2, 2040, 1, 102, 127, 1, 7],
    [138, 164, 288, 2, 1980, 1, 99, 123, 1, 7],
    [133, 158, 280, 2, 1920, 1, 96, 119, 1, 7],
    [129, 153, 273, 2, 1860, 2, 93, 115, 1, 7],
    [124, 148, 265, 3, 1800, 2, 89, 111, 1, 7],
    [119, 143, 258, 3, 1740, 2, 86, 107, 1, 7],
    [115, 138, 250, 3, 1680, 2, 83, 104, 2, 7],
    [110, 132, 243, 3, 1620, 2, 79, 99, 2, 7],
    [106, 127, 235, 3, 1560, 2, 76, 95, 2, 7],
    [101, 122, 228, 4, 1500, 2, 73, 92, 2, 7],
    [96, 117, 220, 4, 1440, 2, 69, 88, 2, 7],
    [92, 112, 213, 4, 1380, 2, 66, 84, 2, 7],
    [87, 106, 205, 4, 1320, 3, 63, 80, 2, 7],
    [83, 101, 198, 4, 1260, 3, 60, 76, 2, 7],
    [78, 96, 190, 5, 1200, 3, 56, 72, 2, 7],
    [73, 91, 183, 5, 1140, 3, 53, 68, 2, 7],
    [69, 86, 175, 5, 1080, 3, 50, 65, 2, 7],
    [64, 80, 168, 5, 1020, 3, 46, 60, 2, 7],
    [60, 75, 160, 5, 960, 3, 43, 56, 2, 7],
    [55, 70, 153, 6, 900, 3, 40, 53, 2, 7],
  ],
  // Rank B.
  [
    [160, 188, 324, 2, 2280, 0, 115, 141, 0, 0],
    [155, 183, 317, 2, 2220, 1, 112, 137, 0, 7],
    [151, 178, 309, 2, 2160, 1, 109, 134, 0, 7],
    [146, 172, 302, 2, 2100, 1, 105, 129, 1, 7],
    [142, 167, 294, 2, 2040, 1, 102, 125, 1, 7],
    [137, 162, 287, 3, 1980, 1, 99, 122, 1, 7],
    [132, 157, 279, 3, 1920, 1, 95, 118, 1, 7],
    [128, 152, 272, 3, 1860, 1, 92, 114, 1, 7],
    [123, 146, 264, 3, 1800, 1, 89, 110, 1, 7],
    [119, 141, 257, 3, 1740, 2, 86, 106, 2, 7],
    [114, 136, 249, 4, 1680, 2, 82, 102, 2, 7],
    [109, 131, 242, 4, 1620, 2, 78, 98, 2, 7],
    [105, 126, 234, 4, 1560, 2, 76, 95, 2, 7],
    [100, 120, 227, 4, 1500, 2, 72, 90, 2, 7],
    [96, 115, 219, 4, 1440, 2, 69, 86, 2, 7],
    [91, 110, 212, 5, 1380, 2, 66, 83, 2, 7],
    [86, 105, 204, 5, 1320, 2, 62, 79, 2, 7],
    [82, 100, 197, 5, 1260, 2, 59, 75, 2, 7],
    [77, 94, 189, 5, 1200, 3, 55, 71, 2, 7],
    [73, 89, 182, 5, 1140, 3, 53, 67, 2, 7],
    [68, 84, 174, 6, 1080, 3, 49, 63, 2, 7],
    [63, 79, 167, 6, 1020, 3, 45, 59, 2, 7],
    [59, 74, 159, 6, 960, 3, 42, 56, 2, 7],
    [54, 68, 152, 6, 900, 3, 39, 51, 2, 7],
    [52, 63, 144, 6, 840, 3, 37, 47, 2, 7],
    [52, 60, 137, 7, 780, 3, 37, 45, 2, 7],
  ],
  // Rank C -- the first of the two hard ranks: stage 1 is armed.
  [
    [150, 176, 308, 2, 2160, 1, 108, 132, 1, 1],
    [145, 171, 301, 2, 2100, 2, 104, 128, 1, 7],
    [141, 166, 293, 2, 2040, 2, 102, 125, 1, 7],
    [136, 160, 286, 2, 1980, 2, 98, 120, 1, 7],
    [132, 155, 278, 2, 1920, 2, 95, 116, 1, 7],
    [127, 150, 271, 3, 1860, 2, 91, 113, 1, 7],
    [122, 145, 263, 3, 1800, 2, 88, 109, 2, 7],
    [118, 140, 256, 3, 1740, 2, 85, 105, 2, 7],
    [113, 134, 248, 3, 1680, 2, 81, 101, 2, 7],
    [109, 129, 241, 3, 1620, 3, 78, 97, 2, 7],
    [104, 124, 233, 4, 1560, 3, 75, 93, 2, 7],
    [99, 119, 226, 4, 1500, 3, 71, 89, 2, 7],
    [95, 114, 218, 4, 1440, 3, 68, 86, 2, 7],
    [90, 108, 211, 4, 1380, 3, 65, 81, 2, 7],
    [86, 103, 203, 4, 1320, 3, 62, 77, 2, 7],
    [81, 98, 196, 5, 1260, 3, 58, 74, 2, 7],
    [76, 93, 188, 5, 1200, 3, 55, 70, 2, 7],
    [72, 88, 181, 5, 1140, 3, 52, 66, 2, 7],
    [67, 82, 173, 5, 1080, 4, 48, 62, 2, 7],
    [63, 77, 166, 5, 1020, 4, 45, 58, 2, 7],
    [58, 72, 158, 6, 960, 4, 42, 54, 2, 7],
    [53, 67, 151, 6, 900, 4, 38, 50, 2, 7],
    [52, 62, 143, 6, 840, 4, 37, 47, 2, 7],
    [52, 60, 136, 6, 780, 4, 37, 45, 2, 7],
    [52, 60, 128, 6, 720, 4, 37, 45, 2, 7],
    [52, 60, 121, 7, 660, 4, 37, 45, 2, 7],
  ],
  // Rank D -- the hardest the cabinet offers.
  [
    [140, 164, 292, 3, 2040, 1, 101, 123, 1, 1],
    [135, 159, 285, 3, 1980, 2, 97, 119, 1, 7],
    [131, 154, 277, 3, 1920, 2, 94, 116, 1, 7],
    [126, 148, 270, 3, 1860, 2, 91, 111, 2, 7],
    [122, 143, 262, 3, 1800, 2, 88, 107, 2, 7],
    [117, 138, 255, 4, 1740, 2, 84, 104, 2, 7],
    [112, 133, 247, 4, 1680, 2, 81, 100, 2, 7],
    [108, 128, 240, 4, 1620, 2, 78, 96, 2, 7],
    [103, 122, 232, 4, 1560, 2, 74, 92, 2, 7],
    [99, 117, 225, 4, 1500, 3, 71, 88, 2, 7],
    [94, 112, 217, 5, 1440, 3, 68, 84, 2, 7],
    [89, 107, 210, 5, 1380, 3, 64, 80, 2, 7],
    [85, 102, 202, 5, 1320, 3, 61, 77, 2, 7],
    [80, 96, 195, 5, 1260, 3, 58, 72, 2, 7],
    [76, 91, 187, 5, 1200, 3, 55, 68, 2, 7],
    [71, 86, 180, 6, 1140, 3, 51, 65, 2, 7],
    [66, 81, 172, 6, 1080, 3, 48, 61, 2, 7],
    [62, 76, 165, 6, 1020, 3, 45, 57, 2, 7],
    [57, 70, 157, 6, 960, 4, 41, 53, 2, 7],
    [53, 65, 150, 6, 900, 4, 38, 49, 2, 7],
    [52, 60, 142, 7, 840, 4, 37, 45, 2, 7],
    [52, 60, 135, 7, 780, 4, 37, 45, 2, 7],
    [52, 60, 127, 7, 720, 4, 37, 45, 2, 7],
    [52, 60, 120, 7, 660, 4, 37, 45, 2, 7],
    [52, 60, 112, 7, 600, 4, 37, 45, 2, 7],
    [52, 60, 105, 8, 600, 4, 37, 45, 2, 7],
  ],
];

/** The row a stage plays: 1-based stages, clamped onto the 26 rows. */
export function difficultyRowIndex(stage) {
  return Math.min(Math.max(Math.trunc(stage), 1), DIFFICULTY_STAGE_ROWS) - 1;
}

/**
 * Whether this stage reloads its launch counters from the reload vectors.
 *
 * From stage 8 the arcade swaps the counters' reload values for a faster
 * pair, which is why the pressure steps up rather than merely creeping.
 */
export function usesReloadVectors(stage) {
  return stage >= 8;
}

/**
 * One stage's parameters at one rank, decoded into named fields.
 *
 * Frame-denominated columns come out both raw and in milliseconds, converted
 * at the cabinet's frame rate, so scene code that thinks in timers and rules
 * code that thinks in frames read the same cell.
 */
export function difficultyRow(stage, rank = DifficultyRank.A) {
  const row = DIFFICULTY_TABLE[normalizeRank(rank)][difficultyRowIndex(stage)];
  const [
    zakoLaunchFrames,
    goeiLaunchFrames,
    bossLaunchFrames,
    maxActiveBombers,
    bomberRampFrames,
    continuousBombs,
    reloadZakoFrames,
    reloadEscortFrames,
    cloneAttackCount,
    flags,
  ] = row;

  const reload = usesReloadVectors(stage);
  const launch = {
    zako: reload ? reloadZakoFrames : zakoLaunchFrames,
    goei: reload ? reloadEscortFrames : goeiLaunchFrames,
    boss: bossLaunchFrames,
  };

  return {
    zakoLaunchFrames,
    goeiLaunchFrames,
    bossLaunchFrames,
    maxActiveBombers,
    bomberRampFrames,
    continuousBombs,
    reloadZakoFrames,
    reloadEscortFrames,
    cloneAttackCount,
    flags,
    /** The counters actually in force this stage, after the stage-8 switch. */
    launchFrames: launch,
    launchMs: {
      zako: launch.zako * FRAME_MS,
      goei: launch.goei * FRAME_MS,
      boss: launch.boss * FRAME_MS,
    },
    bomberRampMs: bomberRampFrames * FRAME_MS,
    bombsEnabled: (flags & FLAG_BOMBS) !== 0,
    captureEnabled: (flags & FLAG_CAPTURE) !== 0,
    entryBombsEnabled: (flags & FLAG_ENTRY_BOMBS) !== 0,
  };
}

/**
 * The caravan: how a stage's wave of forty arrives.
 *
 * Galaga does not pick an entrance at random and it does not fly the same one
 * every stage. The ROM holds a table of caravan rows, `d_combat_stg_dat`, and
 * selects one per stage through a second, rank-indexed table. A row is 18
 * bytes: a two-byte header, five three-byte triplets -- one per flight of eight
 * -- and a `0xFF` terminator. Each triplet carries a transient control byte the
 * port ignores and two *path bytes*, one for the even members of the flight and
 * one for the odd ones.
 *
 * A path byte is where the interesting part lives:
 *
 * ```
 *   bits 0-5   which fly-in path to fly
 *   bit  6     mirror it: enter from the other side of the screen
 *   bit  7     launch gate -- 0 waits for the next beat, 1 goes immediately
 * ```
 *
 * That single byte is what makes the three entrances a player can *name*
 * ("both sides at once", "single file from the left") fall out of the data
 * rather than being special-cased. A flight whose two path bytes are both
 * gated arrives single file. A flight whose second byte is ungated launches it
 * alongside the first, so the eight arrive as four pairs -- and if that second
 * byte also has bit 6 set, the pair comes in from opposite sides at the same
 * moment, which is the sourced description of the first entrance pattern.
 *
 * ## What here is the arcade's and what is not
 *
 * - The **encoding** is the ROM's, and so is the **shape** of the table: 13
 *   caravan rows, five flights to a row, two path bytes to a flight, selected
 *   by `d_combat_stg_dat_idx[rank * 17 + row]`.
 * - **Row 0 is the arcade's own stage-1 row**, byte for byte
 *   (`0x00 0xC0 / 0x01 0x01 / 0x41 0x41 / 0x40 0x40 / 0x00 0x00`), which is why
 *   stage 1 opens with pairs arriving from both sides and then settles into
 *   single file. Stage 1 uses row 0 at every rank; that is sourced too.
 * - The **other twelve rows and the index table are authored**, in the ROM's
 *   encoding, because the byte values were not published in the material this
 *   was reconstructed from. They are not claimed to be the cabinet's. What is
 *   claimed is that there are thirteen of them, that a stage flies exactly one,
 *   that the rank picks between them, and that the repeat period is seventeen
 *   combat stages -- all of which are.
 *
 * Pure data and a decoder: no Phaser, no geometry. `formation.js` turns a row
 * into flights, and `paths.js` owns what a path index actually looks like.
 */

/** Bits 0-5 of a path byte: which fly-in path this member flies. */
const PATH_MASK = 0x3f;

/** Bit 6: enter from the mirrored side of the screen. */
const MIRROR_BIT = 0x40;

/** Bit 7: launch now rather than waiting for the next beat. */
const IMMEDIATE_BIT = 0x80;

/**
 * Unpack one path byte.
 *
 * Returns the three things a launching member needs and nothing else, so the
 * bit layout stops at this function and every caller downstream reads fields.
 */
export function decodeFlyInByte(byte) {
  return {
    pathIndex: byte & PATH_MASK,
    mirrored: (byte & MIRROR_BIT) !== 0,
    immediate: (byte & IMMEDIATE_BIT) !== 0,
  };
}

/** How many flights a caravan row describes. Five, of eight enemies each. */
export const CARAVAN_FLIGHTS = 5;

/**
 * The thirteen caravan rows.
 *
 * Each row is five `[evenMemberByte, oddMemberByte]` pairs. Row 0 is the
 * arcade's stage-1 row; see the module comment for what is sourced and what is
 * authored. They are ordered roughly by how busy the sky gets, because the
 * index table below walks them broadly in order at the factory rank.
 */
export const CARAVAN_ROWS = [
  // 0 -- the arcade's stage 1. Pairs from both sides, then single file.
  [
    [0x00, 0xc0],
    [0x01, 0x01],
    [0x41, 0x41],
    [0x40, 0x40],
    [0x00, 0x00],
  ],
  // 1 -- single file throughout, alternating which side each flight uses.
  [
    [0x01, 0x01],
    [0x41, 0x41],
    [0x02, 0x02],
    [0x42, 0x42],
    [0x03, 0x43],
  ],
  // 2 -- paired throughout on one shape: the tightest of the thirteen.
  [
    [0x06, 0xc6],
    [0x46, 0x86],
    [0x06, 0xc6],
    [0x46, 0x86],
    [0x06, 0xc6],
  ],
  // 3 -- opens paired, finishes single file.
  [
    [0x07, 0xc7],
    [0x47, 0x87],
    [0x08, 0x08],
    [0x48, 0x48],
    [0x07, 0x47],
  ],
  // 4 -- the two low sweeps, single file, alternating sides.
  [
    [0x04, 0x04],
    [0x44, 0x44],
    [0x0c, 0x0c],
    [0x4c, 0x4c],
    [0x04, 0x44],
  ],
  // 5 -- the deep sweep paired with the low hook, two abreast.
  [
    [0x0a, 0xca],
    [0x4a, 0x8a],
    [0x11, 0xd1],
    [0x51, 0x91],
    [0x0a, 0xca],
  ],
  // 6 -- one shape, one side at a time: the plainest row in the table.
  [
    [0x09, 0x09],
    [0x09, 0x09],
    [0x49, 0x49],
    [0x49, 0x49],
    [0x09, 0x49],
  ],
  // 7 -- zipped: every member alternates sides, still single file.
  [
    [0x0b, 0x4b],
    [0x0d, 0x4d],
    [0x4b, 0x0b],
    [0x4d, 0x0d],
    [0x0b, 0x4b],
  ],
  // 8 -- paired stacked loops against paired top banks.
  [
    [0x0e, 0xce],
    [0x4f, 0x8f],
    [0x0e, 0xce],
    [0x4f, 0x8f],
    [0x0f, 0xcf],
  ],
  // 9 -- the long diagonal and the riser, worked from both sides.
  [
    [0x05, 0x05],
    [0x45, 0x45],
    [0x10, 0x10],
    [0x50, 0x50],
    [0x05, 0xc5],
  ],
  // 10 -- mixed gating: two flights single file, two paired, one zipped.
  [
    [0x12, 0x12],
    [0x53, 0x93],
    [0x12, 0xd2],
    [0x53, 0x53],
    [0x12, 0x52],
  ],
  // 11 -- paired corner dives over paired counter-loops.
  [
    [0x14, 0xd4],
    [0x55, 0x95],
    [0x14, 0xd4],
    [0x55, 0x95],
    [0x14, 0x54],
  ],
  // 12 -- a bit of everything, every flight paired: the busiest sky in the
  // table, and the one a player does not reach until well past the first
  // challenging stages.
  [
    [0x00, 0xc1],
    [0x42, 0x83],
    [0x06, 0xd5],
    [0x49, 0x8e],
    [0x02, 0xc3],
  ],
];

export const CARAVAN_ROW_COUNT = CARAVAN_ROWS.length;

/**
 * How many entrance rows the arcade cycles before repeating.
 *
 * The index table is `rank * 17 + row`, so seventeen is the period: it is how
 * long a player plays before an entrance they have already seen comes round
 * again. It is not the number of caravans -- there are thirteen of those, and
 * the table repeats some of them within a rank.
 */
export const COMBAT_STAGE_ROWS = 17;

/** The four difficulty ranks the cabinet's DIP switches select between. */
export const DifficultyRank = { A: 0, B: 1, C: 2, D: 3 };

export const RANK_NAMES = ['A', 'B', 'C', 'D'];

export const RANK_COUNT = RANK_NAMES.length;

/** Clamp anything to a real rank, so a corrupt stored setting cannot crash a stage. */
export function normalizeRank(rank) {
  const value = Number(rank);
  if (!Number.isFinite(value)) return DifficultyRank.A;
  return Math.min(Math.max(Math.trunc(value), 0), RANK_COUNT - 1);
}

/**
 * `d_combat_stg_dat_idx`: which caravan each of the seventeen rows flies, per
 * rank.
 *
 * Row 0 is caravan 0 at every rank, which is sourced -- stage 1 is stage 1
 * whatever the operator has set. The rest is authored: rank A walks the table
 * broadly in order so a new player meets the entrances in increasing
 * complexity, and each harder rank front-loads the busier rows so that the
 * *same stage number* is a busier sky on a harder machine.
 */
const CARAVAN_INDEX = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 9, 10, 11, 12],
  [0, 2, 1, 4, 3, 6, 5, 8, 7, 10, 9, 12, 11, 10, 11, 12, 9],
  [0, 3, 5, 2, 7, 4, 9, 6, 11, 8, 12, 10, 1, 12, 11, 10, 9],
  [0, 5, 8, 11, 2, 12, 4, 9, 6, 10, 3, 12, 7, 11, 12, 10, 8],
];

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
 */
export function combatStageIndex(stage) {
  let wrapped = stage;
  while (wrapped > 0x17) wrapped -= 4;

  const row = wrapped - Math.floor(wrapped / 4) - 1;
  return Math.min(Math.max(row, 0), COMBAT_STAGE_ROWS - 1);
}

/** Which of the thirteen caravans this stage flies, at this rank. */
export function caravanIndexFor(stage, rank = DifficultyRank.A) {
  return CARAVAN_INDEX[normalizeRank(rank)][combatStageIndex(stage)];
}

/** The caravan row itself: five flights of two path bytes. */
export function caravanFor(stage, rank = DifficultyRank.A) {
  return CARAVAN_ROWS[caravanIndexFor(stage, rank)];
}

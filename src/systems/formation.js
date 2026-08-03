/**
 * The Galaga attack formation.
 *
 * Galaga assembles exactly 40 enemies into a 10-column grid: four Boss Galaga
 * on the top row, sixteen Goei across the two rows beneath them, and twenty
 * Zako filling the bottom two rows. In the ROM the grid is addressed by
 * object ID through `sprt_fmtn_hpos` -- 48 slots on a 6-row grid, of which
 * 8 are phantom -- and the grid moves through two mutually exclusive
 * machines: the fly-in triangle sway (`f_2A90`) and the bitmap-driven
 * breathing pulse (`f_1DE6`), with an explicit coast-to-centre handoff
 * between them. Both are ported here.
 *
 * Everything is pure: slots are described in grid space and converted to
 * world coordinates on demand. No Phaser, no sprites, no mutation of scene
 * state, so the whole module is testable without a canvas.
 */

import { CARAVAN_ROWS, CARAVAN_ROW_COUNT, decodeFlyInByte } from './caravans.js';
import { DB_ATTK_WAV_IDS, formationCellFor } from './caravanData.js';
import { FRAME_MS } from './pathcode.js';

/**
 * How many entrances the arcade holds.
 *
 * Thirteen caravan rows, one flown per stage. The name is kept from when this
 * was three hard-coded patterns; what it counts now is rows in the table.
 */
export const ENTRANCE_PATTERN_COUNT = CARAVAN_ROW_COUNT;

export const EnemyType = {
  BOSS: 'boss',
  GOEI: 'goei',
  ZAKO: 'zako',
};

export const FORMATION_COLUMNS = 10;

/**
 * Row layout, top to bottom. `columns` lists which grid columns that row
 * occupies, which is how the shorter boss and goei rows stay centred against
 * the full-width zako rows. These are the ROM grid's rows 1-5; its row 0 --
 * the rogue/captured-ship row -- holds no formation enemy and is not built.
 */
export const FORMATION_ROWS = [
  { row: 0, type: EnemyType.BOSS, columns: [3, 4, 5, 6] },
  { row: 1, type: EnemyType.GOEI, columns: [1, 2, 3, 4, 5, 6, 7, 8] },
  { row: 2, type: EnemyType.GOEI, columns: [1, 2, 3, 4, 5, 6, 7, 8] },
  { row: 3, type: EnemyType.ZAKO, columns: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] },
  { row: 4, type: EnemyType.ZAKO, columns: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] },
];

export const FORMATION_SIZE = FORMATION_ROWS.reduce(
  (total, row) => total + row.columns.length,
  0,
);

/**
 * Build the 40 formation slots in grid space.
 *
 * `column` is offset so that column 4.5 (the grid centre) maps to 0, letting
 * world placement be a simple multiply-and-add around a centre point.
 */
export function buildFormationSlots() {
  const centreColumn = (FORMATION_COLUMNS - 1) / 2;
  const slots = [];

  for (const { row, type, columns } of FORMATION_ROWS) {
    for (const column of columns) {
      slots.push({
        index: slots.length,
        row,
        column,
        type,
        gridX: column - centreColumn,
        gridY: row,
      });
    }
  }

  return slots;
}

// -------------------------------------------------- object IDs onto slots

/** `${row}:${column}` -> slot index, built once from the layout above. */
const SLOT_BY_CELL = new Map(
  buildFormationSlots().map((slot) => [`${slot.row}:${slot.column}`, slot.index]),
);

/**
 * Which of the 40 slots a ROM object ID lands in, or null for a phantom.
 *
 * The ID goes through `sprt_fmtn_hpos` to a ROM grid cell; ROM row 0 (the
 * rogue row, IDs 0x00-0x06) and the butterfly corners (IDs 0x38-0x3E, the
 * transient/bonus-bee range) have no slot here, exactly as they have no
 * flying member there.
 */
export function slotIndexForObjectId(objectId) {
  const cell = formationCellFor(objectId);
  if (!cell || cell.romRow === 0) return null;
  return SLOT_BY_CELL.get(`${cell.romRow - 1}:${cell.column}`) ?? null;
}

/**
 * A synthetic slot on the ROM's row 0 -- the rogue/captured-fighter rank
 * above the bosses -- for the fighter object the l_2681 caravan tail flies
 * back in (IDs 0x00-0x06, `sprt_fmtn_hpos` rows `(Y-0x14)/2 == 0`). Our
 * slot rows are the ROM's rows minus one, so this rank is row -1: the
 * motion machine already carries it (`rowOffsets[slot.row + 1]` is the ROM
 * row-0 entry) and world placement is plain arithmetic on `gridY`.
 */
export function rogueFighterSlot(objectId = 0x04) {
  const cell = formationCellFor(objectId);
  if (!cell || cell.romRow !== 0) return null;
  const centreColumn = (FORMATION_COLUMNS - 1) / 2;
  return {
    index: null,
    row: -1,
    column: cell.column,
    type: null,
    gridX: cell.column - centreColumn,
    gridY: -1,
  };
}

/** Galaga brings its wave on as flights of eight, not one stream of forty. */
export const ENTRY_GROUP_SIZE = 8;

export const ENTRY_GROUP_COUNT = FORMATION_SIZE / ENTRY_GROUP_SIZE;

/**
 * The caravan row the arcade flies on stage 1.
 *
 * Sourced twice over: the ROM's own stage-1 row is caravan 0 at every rank,
 * and the strategy guides describe the first entrance a player meets as "the
 * only pattern where enemies will enter from both sides of the screen at the
 * same time, with enemies entering single file in short rows". Decoding that
 * row's bytes produces exactly that.
 */
export const ENTRANCE_PATTERN_BOTH_SIDES = 0;

/**
 * The five entry flights of a caravan row, membership per `db_attk_wav_IDs`.
 *
 * Wave 1 is the centre butterflies and centre bees; the FOUR BOSSES arrive
 * in wave 2 with escort butterflies -- not first, as an earlier revision's
 * contiguous slot blocks had it. Members are in the runtime stream's launch
 * order: lefty i then righty i (the tmp-buffer's slot-i / slot-i+8 pairing),
 * lefties flying the wave's first path byte, righties the second. `step` is
 * the member's launch beat -- a gated byte advances it, an ungated wing-man
 * shares its leader's.
 *
 * This is the pure wave-membership description; the scene launches through
 * `caravans.js`'s stream walker, which adds transients and the exact frame
 * cadence on top of the same ordering.
 */
export function buildEntryGroups(caravan = CARAVAN_ROWS[ENTRANCE_PATTERN_BOTH_SIDES]) {
  const groups = [];

  for (let index = 0; index < ENTRY_GROUP_COUNT; index += 1) {
    const [leftyByte, rightyByte] = caravan[index % caravan.length];
    const ids = DB_ATTK_WAV_IDS[index];
    const ordered = [0, 1, 2, 3].flatMap((i) => [ids[i], ids[i + 4]]);

    let step = 0;
    const members = ordered.map((objectId, position) => {
      const byte = position % 2 === 0 ? leftyByte : rightyByte;
      const { pathIndex, mirrored, immediate } = decodeFlyInByte(byte);
      if (position > 0 && !immediate) step += 1;
      return {
        objectId,
        slotIndex: slotIndexForObjectId(objectId),
        pathVariant: pathIndex,
        mirrored,
        step,
      };
    });

    groups.push({ index, slotIndices: members.map((member) => member.slotIndex), members });
  }

  return groups;
}

// ------------------------------------------------------- formation motion

/**
 * `d_1E64_bitmap_tables` (gg1-2_fx.s:1721-1726), verbatim: 4 rows x 16
 * bytes. Bytes 0-9 gate the ten COLUMN X offsets, bytes 10-15 the six ROW Y
 * offsets (the real breathing moves rows vertically too). Each pulse tick
 * rotates a working byte right; the carried-out bit decides whether that
 * slot's offset steps this tick -- the outer columns (0xFF) sweep a pixel
 * every tick, the inner (0x10) barely move, and ROM row 0 (0x00) never
 * moves at all.
 */
// prettier-ignore
export const D_1E64_BITMAPS = [
  [0xff, 0x77, 0x55, 0x14, 0x10, 0x10, 0x14, 0x55, 0x77, 0xff, 0x00, 0x10, 0x14, 0x55, 0x77, 0xff],
  [0xff, 0x77, 0x55, 0x51, 0x10, 0x10, 0x51, 0x55, 0x77, 0xff, 0x00, 0x10, 0x51, 0x55, 0x77, 0xff],
  [0xff, 0x77, 0x57, 0x15, 0x10, 0x10, 0x15, 0x57, 0x77, 0xff, 0x00, 0x10, 0x15, 0x57, 0x77, 0xff],
  [0xff, 0xf7, 0xd5, 0x91, 0x10, 0x10, 0x91, 0xd5, 0xf7, 0xff, 0x00, 0x10, 0x91, 0xd5, 0xf7, 0xff],
];

/** The fly-in sway's turnaround, in ROM px (f_2A90, gg1-3.s:2007-2021). */
export const SWAY_LIMIT = 32;

/** Both motion tasks step only every fourth hardware frame (15 Hz). */
export const MOTION_FRAME_DIVIDER = 4;

/** The two mutually exclusive phases, with the handoff between them. */
export const FormationPhase = { OSCILLATE: 'oscillate', PULSE: 'pulse' };

/**
 * A fresh motion state: the fly-in sway at centre, drifting right, the
 * pulse counters zeroed. One per stage (`stg_init_env` re-enables f_2A90
 * and zeroes `_b_nestlr_inh` every stage).
 */
export function createFormationMotion() {
  return {
    phase: FormationPhase.OSCILLATE,
    frame: 0,
    accMs: 0,
    /** f_2A90: the uniform X offset, +/-32, and its direction. */
    swayOffset: 0,
    swayDir: 1,
    /** f_1DE6: the 0x00-0x1F / 0xA0-0x81 phase counter and working bitmap. */
    pulseCounter: 0,
    bitmap: new Array(16).fill(0),
    /** Per-column X and per-row Y offsets, ROM px. Rows are ROM rows 0-5. */
    colOffsets: new Array(10).fill(0),
    rowOffsets: new Array(6).fill(0),
  };
}

/**
 * One hardware frame of the formation's motion. Pure.
 *
 * `handoff` is `_b_nestlr_inh`: set when the wave launcher finishes. During
 * OSCILLATE the offset steps 1 px every 4 frames and reverses at +/-32 (a
 * triangle wave, full period 512 frames); once the handoff flag is up the
 * sway coasts on until it crosses centre, then the machine switches to the
 * PULSE -- f_2A90's own exit (gg1-3.s:1998-2035).
 *
 * The PULSE is f_1DE6 (gg1-2_fx.s:1562-1653), non-flipped screen: every 4
 * frames the phase counter advances (0x00 up to 0x1F, jump to 0xA0, down to
 * 0x81, jump to 0x00), the working bitmap reloads from `d_1E64` every 8
 * ticks, and each slot whose rotated-out bit is set steps its offset --
 * left columns away from centre while expanding, right columns and rows the
 * other sign.
 */
export function stepFormationMotion(state, { handoff = false } = {}) {
  const next = { ...state };
  next.frame = state.frame + 1;
  if (next.frame % MOTION_FRAME_DIVIDER !== 0) return next;

  if (state.phase === FormationPhase.OSCILLATE) {
    const offset = state.swayOffset + state.swayDir;
    next.swayOffset = offset;

    if (handoff && offset === 0) {
      next.phase = FormationPhase.PULSE;
      next.pulseCounter = 0;
      return next;
    }
    if (offset >= SWAY_LIMIT) next.swayDir = -1;
    else if (offset <= -SWAY_LIMIT) next.swayDir = 1;
    return next;
  }

  // ---- the pulse tick.
  const prev = state.pulseCounter;
  let counter;
  if ((prev & 0x80) !== 0) counter = (prev - 1) & 0xff;
  else counter = (prev + 1) & 0xff;
  if (prev === 0x1f) counter |= 0x80; // 0x20 -> 0xA0: start contracting
  if (prev === 0x81) counter &= 0x7f; // 0x80 -> 0x00: start expanding
  next.pulseCounter = counter;

  // Reload the working bitmap every 8 ticks from row (counter & 0x18) >> 3.
  const bitmap =
    (prev & 0x07) === 0 ? [...D_1E64_BITMAPS[(counter & 0x18) >> 3]] : [...state.bitmap];

  // Sign selection (l_1E23, flip_screen = 0): bit 7 of the PREVIOUS counter.
  // Expanding: left 5 columns step -1 (outward), right 5 columns and all 6
  // rows +1. Contracting reverses both.
  const contracting = (prev & 0x80) !== 0;
  const leftStep = contracting ? 1 : -1;
  const rightStep = contracting ? -1 : 1;

  const colOffsets = [...state.colOffsets];
  const rowOffsets = [...state.rowOffsets];
  for (let i = 0; i < 16; i += 1) {
    const carry = bitmap[i] & 0x01;
    bitmap[i] = ((bitmap[i] >> 1) | (carry << 7)) & 0xff;
    if (!carry) continue;
    if (i < 5) colOffsets[i] += leftStep;
    else if (i < 10) colOffsets[i] += rightStep;
    else rowOffsets[i - 10] += rightStep;
  }

  next.bitmap = bitmap;
  next.colOffsets = colOffsets;
  next.rowOffsets = rowOffsets;
  return next;
}

/**
 * Advance the motion by a frame delta in milliseconds, running whole
 * hardware frames out of the accumulator the way `flight.js` does.
 */
export function advanceFormationMotion(motion, deltaMs, inputs = {}) {
  let accMs = motion.accMs + Math.max(deltaMs, 0);
  let frames = Math.floor(accMs / FRAME_MS + 1e-9);
  accMs -= frames * FRAME_MS;

  let state = motion;
  while (frames > 0) {
    state = stepFormationMotion(state, inputs);
    frames -= 1;
  }
  return { ...state, accMs };
}

/**
 * This frame's offset for one slot, in ROM px scaled by `scale`.
 *
 * During the fly-in sway every slot shares the uniform offset; under the
 * pulse each column carries its own X and each row its own Y. Our slot rows
 * 0-4 are the ROM grid's rows 1-5 (row 0 is the phantom rogue row, whose
 * bitmap byte 0x00 never moves it anyway).
 */
export function slotMotionOffset(motion, slot, scale = 1) {
  if (motion.phase === FormationPhase.OSCILLATE) {
    return { x: motion.swayOffset * scale, y: 0 };
  }
  return {
    x: motion.colOffsets[slot.column] * scale,
    y: motion.rowOffsets[slot.row + 1] * scale,
  };
}

// ------------------------------------------------------- world placement

/**
 * Convert a slot to world coordinates.
 *
 * `offsetX`/`offsetY` are the motion machine's per-slot offsets (already
 * scaled to screen px by the caller). The breathing-scale multiplier this
 * replaced is gone: the ROM's pulse moves columns by absolute pixel offsets,
 * not by scaling the spacing.
 */
export function slotWorldPosition(slot, layout) {
  const {
    centreX,
    topY,
    spacingX = 48,
    spacingY = 42,
    offsetX = 0,
    offsetY = 0,
  } = layout;

  return {
    x: centreX + slot.gridX * spacingX + offsetX,
    y: topY + slot.gridY * spacingY + offsetY,
  };
}

/**
 * Clamp the formation's centre so the grid never pushes its outermost column
 * off screen. `motionSlack` is how much offset the motion machine can add
 * outward (the sway limit or the peak pulse spread, in screen px).
 */
export function clampFormationCentre(centreX, screenWidth, layout = {}) {
  const { spacingX = 48, margin = 24, motionSlack = 0 } = layout;
  const halfWidth = ((FORMATION_COLUMNS - 1) / 2) * spacingX + motionSlack;
  const min = margin + halfWidth;
  const max = screenWidth - margin - halfWidth;

  // On a screen too narrow to hold the formation, centre it rather than
  // returning an inverted range.
  if (min > max) return screenWidth / 2;
  return Math.min(Math.max(centreX, min), max);
}

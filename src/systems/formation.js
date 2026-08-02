/**
 * The Galaga attack formation.
 *
 * Galaga assembles exactly 40 enemies into a 10-column grid: four Boss Galaga
 * on the top row, sixteen Goei across the two rows beneath them, and twenty
 * Zako filling the bottom two rows. The grid then "breathes", expanding and
 * contracting horizontally while swaying, which is what makes a static lattice
 * of sprites feel alive.
 *
 * Everything here is pure: slots are described in grid space and converted to
 * world coordinates on demand. No Phaser, no sprites, no mutation of scene
 * state, so the whole module is testable without a canvas.
 */

import { CARAVAN_ROWS, CARAVAN_ROW_COUNT, decodeFlyInByte } from './caravans.js';

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
 * the full-width zako rows.
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

/** Galaga brings its wave on as flights of eight, not one stream of forty. */
export const ENTRY_GROUP_SIZE = 8;

export const ENTRY_GROUP_COUNT = FORMATION_SIZE / ENTRY_GROUP_SIZE;

/**
 * The caravan row the arcade flies on stage 1.
 *
 * Sourced twice over: the ROM's own stage-1 row is caravan 0 at every rank, and
 * the strategy guides describe the first entrance a player meets as "the only
 * pattern where enemies will enter from both sides of the screen at the same
 * time, with enemies entering single file in short rows". Decoding that row's
 * bytes produces exactly that -- four pairs, one arrival from each side per
 * beat -- which is the check that the encoding in `caravans.js` is being read
 * the right way round.
 */
export const ENTRANCE_PATTERN_BOTH_SIDES = 0;

/**
 * Split the wave into its five entry flights, following a caravan row.
 *
 * A row is five `[evenMemberByte, oddMemberByte]` pairs; see `caravans.js` for
 * what a path byte holds. Every member comes out carrying the shape it flies,
 * whether that shape is mirrored, and its `step` -- its place in the flight's
 * launch order, which the scene turns into a delay by multiplying by the
 * stagger. Two members sharing a step take off together, which is what an
 * ungated path byte means and how a flight puts one arrival from each side in
 * the air at the same moment.
 *
 * The version this replaced held three hard-coded `{curves, paired}` patterns.
 * The behaviour of the first two is reproduced exactly by rows 0 and 6 of the
 * caravan table, but as data rather than as a branch, which is what let the
 * count go from three to thirteen without any new code here.
 *
 * Slots are taken in build order, which is what makes each flight a
 * contiguous, mostly single-type block: the first is the four Boss Galaga and
 * their four Goei, the next two are Goei, the last two are Zako.
 */
export function buildEntryGroups(caravan = CARAVAN_ROWS[ENTRANCE_PATTERN_BOTH_SIDES]) {
  const slots = buildFormationSlots();
  const groups = [];

  for (let index = 0; index < ENTRY_GROUP_COUNT; index += 1) {
    const [evenByte, oddByte] = caravan[index % caravan.length];
    const start = index * ENTRY_GROUP_SIZE;
    const slotIndices = slots
      .slice(start, start + ENTRY_GROUP_SIZE)
      .map((slot) => slot.index);

    // The beat only advances for a gated member, so an ungated one launches
    // alongside whoever went before it. The first member of a flight never
    // advances the beat, gated or not: it *is* the beat the flight starts on.
    let step = 0;
    const members = slotIndices.map((slotIndex, position) => {
      const { pathIndex, mirrored, immediate } = decodeFlyInByte(
        position % 2 === 0 ? evenByte : oddByte,
      );
      if (position > 0 && !immediate) step += 1;
      return { slotIndex, pathVariant: pathIndex, mirrored, step };
    });

    groups.push({ index, slotIndices, members });
  }

  return groups;
}

/**
 * Horizontal breathing scale at a given time.
 *
 * Returns a multiplier applied to each slot's horizontal offset, so the
 * formation widens and narrows without the rows drifting apart vertically.
 */
export function breathScaleAt(elapsedMs, { periodMs = 4000, amplitude = 0.18 } = {}) {
  if (periodMs <= 0) return 1;
  const phase = (elapsedMs / periodMs) * Math.PI * 2;
  return 1 + Math.sin(phase) * amplitude;
}

/** Whole-formation horizontal sway, in pixels. */
export function swayOffsetAt(elapsedMs, { periodMs = 6000, amplitude = 30 } = {}) {
  if (periodMs <= 0) return 0;
  const phase = (elapsedMs / periodMs) * Math.PI * 2;
  return Math.sin(phase) * amplitude;
}

/**
 * Convert a slot to world coordinates.
 *
 * Breathing scales the horizontal offset only. Vertical spacing stays fixed so
 * rows never collide as the formation expands.
 */
export function slotWorldPosition(slot, layout) {
  const {
    centreX,
    topY,
    spacingX = 52,
    spacingY = 42,
    breathScale = 1,
    swayX = 0,
  } = layout;

  return {
    x: centreX + slot.gridX * spacingX * breathScale + swayX,
    y: topY + slot.gridY * spacingY,
  };
}

/**
 * Clamp the formation's centre so that a breathing, swaying grid never pushes
 * its outermost column off screen.
 */
export function clampFormationCentre(centreX, screenWidth, layout = {}) {
  const { spacingX = 52, breathScale = 1, margin = 24 } = layout;
  const halfWidth = ((FORMATION_COLUMNS - 1) / 2) * spacingX * breathScale;
  const min = margin + halfWidth;
  const max = screenWidth - margin - halfWidth;

  // On a screen too narrow to hold the formation, centre it rather than
  // returning an inverted range.
  if (min > max) return screenWidth / 2;
  return Math.min(Math.max(centreX, min), max);
}

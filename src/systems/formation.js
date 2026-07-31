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
 * The entry curve each flight follows, in order.
 *
 * Consecutive flights come from opposite sides so the wave alternates rather
 * than piling into the same corner. Values index the variants in
 * `paths.entryPath`.
 */
export const ENTRY_PATH_VARIANTS = [2, 3, 0, 1, 2];

/**
 * Split the wave into its five entry flights.
 *
 * Every enemy in a flight follows the same curve, launching one after another,
 * so the group trails single file like a ribbon. The version this replaced
 * gave each enemy `index % 4`, which put four different curves in the air at
 * once and had consecutive arrivals crossing through each other.
 *
 * Slots are taken in build order, which is what makes each flight a
 * contiguous, mostly single-type block: the first is the four Boss Galaga and
 * their four Goei, the next two are Goei, the last two are Zako.
 */
export function buildEntryGroups() {
  const slots = buildFormationSlots();
  const groups = [];

  for (let index = 0; index < ENTRY_GROUP_COUNT; index += 1) {
    const start = index * ENTRY_GROUP_SIZE;
    groups.push({
      index,
      pathVariant: ENTRY_PATH_VARIANTS[index % ENTRY_PATH_VARIANTS.length],
      slotIndices: slots.slice(start, start + ENTRY_GROUP_SIZE).map((slot) => slot.index),
    });
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

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
 * How many distinct entrance patterns the arcade has.
 *
 * Galaga has three, and a stage flies one of them from its first flight to its
 * last. That per-stage fixedness is the point: it is what makes an entrance
 * recognisable, and what lets a player who has seen a stage before know where
 * the wave is about to come from.
 */
export const ENTRANCE_PATTERN_COUNT = 3;

/**
 * The pattern where the wave arrives from the left and the right at once.
 *
 * Sourced as the distinguishing feature of the first of the three: it "is the
 * only pattern where enemies will enter from both sides of the screen at the
 * same time, with enemies entering single file in short rows". The other two
 * also use both sides, but one flight at a time.
 */
export const ENTRANCE_PATTERN_BOTH_SIDES = 0;

/**
 * The three entrance patterns, as a curve pair plus how a flight is spaced
 * along it. `curves` index the variants in `paths.entryPath`.
 *
 * `paired` is the both-sides rule: members alternate between the two curves
 * and launch two at a time, one from each side, which is the "short rows"
 * of the sourced description. The other two patterns put a whole flight on one
 * curve, single file, and alternate which curve between flights.
 */
const ENTRANCE_PATTERNS = [
  // Left and right loops simultaneously.
  { curves: [0, 1], paired: true },
  // Top-corner sweeps, alternating flights.
  { curves: [2, 3], paired: false },
  // Side loops, alternating flights.
  { curves: [0, 1], paired: false },
];

/**
 * Split the wave into its five entry flights for one stage's pattern.
 *
 * Every member carries the curve it flies and its `step`, the position in the
 * flight's launch order: the scene turns a step into a delay by multiplying by
 * the stagger. Two members sharing a step take off together, which is how the
 * both-sides pattern gets one arrival from each side at the same moment.
 *
 * The version this replaced held a single fixed list of five curves,
 * `[2, 3, 0, 1, 2]`, and used it for every stage. That mixed top-corner sweeps
 * and side loops inside one wave, so no stage ever flew one of the arcade's
 * three patterns cleanly, and every stage entered identically.
 *
 * Slots are taken in build order, which is what makes each flight a
 * contiguous, mostly single-type block: the first is the four Boss Galaga and
 * their four Goei, the next two are Goei, the last two are Zako.
 */
export function buildEntryGroups(pattern = 0) {
  const { curves, paired } = ENTRANCE_PATTERNS[pattern % ENTRANCE_PATTERN_COUNT];
  const slots = buildFormationSlots();
  const groups = [];

  for (let index = 0; index < ENTRY_GROUP_COUNT; index += 1) {
    const start = index * ENTRY_GROUP_SIZE;
    const slotIndices = slots
      .slice(start, start + ENTRY_GROUP_SIZE)
      .map((slot) => slot.index);

    groups.push({
      index,
      slotIndices,
      members: slotIndices.map((slotIndex, position) => ({
        slotIndex,
        pathVariant: paired ? curves[position % 2] : curves[index % curves.length],
        step: paired ? Math.floor(position / 2) : position,
      })),
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

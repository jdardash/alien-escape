import { describe, it, expect } from 'vitest';
import {
  EnemyType,
  FORMATION_SIZE,
  ENTRY_GROUP_SIZE,
  ENTRY_GROUP_COUNT,
  buildFormationSlots,
  buildEntryGroups,
  ENTRANCE_PATTERN_COUNT,
  ENTRANCE_PATTERN_BOTH_SIDES,
  breathScaleAt,
  swayOffsetAt,
  slotWorldPosition,
  clampFormationCentre,
} from '../src/systems/formation.js';
import { SCREEN, FORMATION, SHIP_DRAWN_PX } from '../src/config.js';

describe('formation layout', () => {
  it('assembles exactly 40 enemies, as Galaga does', () => {
    expect(FORMATION_SIZE).toBe(40);
    expect(buildFormationSlots()).toHaveLength(40);
  });

  it('uses the arcade composition of 4 bosses, 16 goei and 20 zako', () => {
    const slots = buildFormationSlots();
    const count = (type) => slots.filter((slot) => slot.type === type).length;

    expect(count(EnemyType.BOSS)).toBe(4);
    expect(count(EnemyType.GOEI)).toBe(16);
    expect(count(EnemyType.ZAKO)).toBe(20);
  });

  it('puts the bosses on the top row', () => {
    const slots = buildFormationSlots();
    const bosses = slots.filter((slot) => slot.type === EnemyType.BOSS);
    expect(bosses.every((slot) => slot.row === 0)).toBe(true);
  });

  it('gives every slot a unique row and column pair', () => {
    const slots = buildFormationSlots();
    const keys = new Set(slots.map((slot) => `${slot.row}:${slot.column}`));
    expect(keys.size).toBe(slots.length);
  });

  it('centres the shorter rows against the full-width rows', () => {
    const slots = buildFormationSlots();
    const centreOf = (row) => {
      const inRow = slots.filter((slot) => slot.row === row);
      const sum = inRow.reduce((total, slot) => total + slot.gridX, 0);
      return sum / inRow.length;
    };

    // Every row should be symmetric about the grid centre.
    for (const row of [0, 1, 2, 3, 4]) {
      expect(centreOf(row)).toBeCloseTo(0, 10);
    }
  });
});

describe('entry flights', () => {
  it('brings the wave on as five flights of eight, as the arcade does', () => {
    const groups = buildEntryGroups();

    expect(ENTRY_GROUP_SIZE).toBe(8);
    expect(ENTRY_GROUP_COUNT).toBe(5);
    expect(groups).toHaveLength(5);
    expect(groups.every((group) => group.slotIndices.length === 8)).toBe(true);
  });

  it('launches every slot exactly once across the flights', () => {
    const launched = buildEntryGroups().flatMap((group) => group.slotIndices);

    expect(launched).toHaveLength(FORMATION_SIZE);
    expect(new Set(launched).size).toBe(FORMATION_SIZE);
    expect([...launched].sort((a, b) => a - b)).toEqual(
      buildFormationSlots().map((slot) => slot.index),
    );
  });

  it('gives every member a curve the path module actually has', () => {
    for (let pattern = 0; pattern < ENTRANCE_PATTERN_COUNT; pattern += 1) {
      for (const group of buildEntryGroups(pattern)) {
        for (const member of group.members) {
          expect(Number.isInteger(member.pathVariant)).toBe(true);
          expect(member.pathVariant).toBeGreaterThanOrEqual(0);
          expect(member.pathVariant).toBeLessThan(4);
        }
      }
    }
  });

  // The heart of it. A stage flies one entrance pattern from first flight to
  // last; the version this replaced drew from a fixed five-entry list that
  // mixed top-corner sweeps and side loops inside a single wave, so no stage
  // ever flew one of the arcade's three patterns cleanly.
  it('draws every flight of a stage from that pattern own pair of curves', () => {
    for (let pattern = 0; pattern < ENTRANCE_PATTERN_COUNT; pattern += 1) {
      const used = new Set(
        buildEntryGroups(pattern).flatMap((group) =>
          group.members.map((member) => member.pathVariant),
        ),
      );
      expect(used.size).toBe(2);
    }
  });

  it('gives the three patterns three distinct choreographies', () => {
    const signature = (pattern) =>
      JSON.stringify(
        buildEntryGroups(pattern).map((group) =>
          group.members.map((member) => [member.pathVariant, member.step]),
        ),
      );

    const signatures = new Set([signature(0), signature(1), signature(2)]);
    expect(signatures.size).toBe(3);
  });

  // Sourced: the first pattern "is the only pattern where enemies will enter
  // from both sides of the screen at the same time".
  it('has exactly one pattern that enters from both sides at once', () => {
    const bothSidesAtOnce = (pattern) =>
      buildEntryGroups(pattern).some((group) =>
        group.members.some((member) =>
          group.members.some(
            (other) => other.step === member.step && other.pathVariant !== member.pathVariant,
          ),
        ),
      );

    const patterns = [0, 1, 2].filter(bothSidesAtOnce);
    expect(patterns).toEqual([ENTRANCE_PATTERN_BOTH_SIDES]);
  });

  it('sends the other two patterns in single file, one curve per flight', () => {
    for (const pattern of [0, 1, 2].filter((p) => p !== ENTRANCE_PATTERN_BOTH_SIDES)) {
      for (const group of buildEntryGroups(pattern)) {
        const variants = new Set(group.members.map((member) => member.pathVariant));
        const steps = group.members.map((member) => member.step);

        expect(variants.size).toBe(1);
        expect(steps).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
      }
    }
  });

  it('never sends two flights in a row down the same curve', () => {
    for (let pattern = 0; pattern < ENTRANCE_PATTERN_COUNT; pattern += 1) {
      const groups = buildEntryGroups(pattern);
      const curves = groups.map((group) =>
        [...new Set(group.members.map((member) => member.pathVariant))].sort().join(),
      );

      for (let i = 1; i < curves.length; i += 1) {
        // A both-sides flight uses the same pair every time, so it is exempt:
        // what alternates there is which side leads, inside the flight.
        if (pattern === ENTRANCE_PATTERN_BOTH_SIDES) continue;
        expect(curves[i]).not.toBe(curves[i - 1]);
      }
    }
  });

  it('leads with the bosses, so the top row is in place first', () => {
    const slots = buildFormationSlots();
    const first = buildEntryGroups()[0].slotIndices.map((index) => slots[index]);
    const bosses = first.filter((slot) => slot.type === EnemyType.BOSS);

    expect(bosses).toHaveLength(4);
  });

  it('numbers the flights in launch order', () => {
    expect(buildEntryGroups().map((group) => group.index)).toEqual([0, 1, 2, 3, 4]);
  });
});

describe('breathing and sway', () => {
  it('starts at neutral scale and returns to it after a full period', () => {
    expect(breathScaleAt(0, { periodMs: 4000 })).toBeCloseTo(1, 10);
    expect(breathScaleAt(4000, { periodMs: 4000 })).toBeCloseTo(1, 10);
  });

  it('stays within the requested amplitude', () => {
    const amplitude = 0.2;
    for (let t = 0; t <= 4000; t += 50) {
      const scale = breathScaleAt(t, { periodMs: 4000, amplitude });
      expect(scale).toBeGreaterThanOrEqual(1 - amplitude - 1e-9);
      expect(scale).toBeLessThanOrEqual(1 + amplitude + 1e-9);
    }
  });

  it('reaches its widest a quarter of the way through the period', () => {
    const widest = breathScaleAt(1000, { periodMs: 4000, amplitude: 0.2 });
    expect(widest).toBeCloseTo(1.2, 10);
  });

  it('treats a non-positive period as no motion rather than dividing by zero', () => {
    expect(breathScaleAt(1234, { periodMs: 0 })).toBe(1);
    expect(swayOffsetAt(1234, { periodMs: 0 })).toBe(0);
  });

  it('sways symmetrically about zero', () => {
    expect(swayOffsetAt(0, { periodMs: 6000, amplitude: 30 })).toBeCloseTo(0, 10);
    expect(swayOffsetAt(1500, { periodMs: 6000, amplitude: 30 })).toBeCloseTo(30, 10);
    expect(swayOffsetAt(4500, { periodMs: 6000, amplitude: 30 })).toBeCloseTo(-30, 10);
  });
});

describe('world placement', () => {
  const layout = { centreX: 400, topY: 80, spacingX: 50, spacingY: 40 };

  it('places the grid centre at the formation centre', () => {
    const slots = buildFormationSlots();
    const positions = slots.map((slot) => slotWorldPosition(slot, layout));
    const meanX = positions.reduce((total, p) => total + p.x, 0) / positions.length;
    expect(meanX).toBeCloseTo(400, 6);
  });

  it('scales horizontally with breathing but never vertically', () => {
    const slot = buildFormationSlots().find((s) => s.gridX !== 0);
    const narrow = slotWorldPosition(slot, { ...layout, breathScale: 0.8 });
    const wide = slotWorldPosition(slot, { ...layout, breathScale: 1.2 });

    expect(narrow.y).toBe(wide.y);
    expect(Math.abs(narrow.x - 400)).toBeLessThan(Math.abs(wide.x - 400));
  });

  it('applies sway as a rigid translation', () => {
    const slot = buildFormationSlots()[7];
    const still = slotWorldPosition(slot, layout);
    const swayed = slotWorldPosition(slot, { ...layout, swayX: 25 });
    expect(swayed.x - still.x).toBeCloseTo(25, 10);
  });
});

describe('keeping the formation on screen', () => {
  it('pulls the centre in so the outer column stays visible', () => {
    const clamped = clampFormationCentre(0, 800, { spacingX: 50, margin: 20 });
    expect(clamped).toBeGreaterThan(0);

    const slots = buildFormationSlots();
    const leftmost = Math.min(...slots.map((s) => s.gridX));
    const x = clamped + leftmost * 50;
    expect(x).toBeGreaterThanOrEqual(20 - 1e-9);
  });

  it('accounts for a wider grid while breathing out', () => {
    const relaxed = clampFormationCentre(0, 800, { spacingX: 50, breathScale: 1 });
    const expanded = clampFormationCentre(0, 800, { spacingX: 50, breathScale: 1.3 });
    expect(expanded).toBeGreaterThan(relaxed);
  });

  it('leaves an already centred formation alone', () => {
    expect(clampFormationCentre(400, 800, { spacingX: 50 })).toBe(400);
  });

  it('centres rather than inverting when the screen is too narrow', () => {
    expect(clampFormationCentre(10, 200, { spacingX: 50 })).toBe(100);
  });
});

/**
 * The clamp is exercised above against arbitrary numbers. These pin it against
 * the field the game actually ships with, because that is where it can break:
 * the ten-column grid was tuned for an 800-wide landscape screen and now has
 * to fit a 672-wide portrait one at its widest breath and furthest sway.
 */
describe('the formation on the real field', () => {
  const spriteHalfWidth = SHIP_DRAWN_PX / 2;

  const widestExtremes = (swayX) => {
    const breathScale = 1 + FORMATION.breathAmplitude;
    const centreX = clampFormationCentre(SCREEN.width / 2, SCREEN.width, {
      spacingX: FORMATION.spacingX,
      breathScale,
      margin: FORMATION.margin,
    });

    const xs = buildFormationSlots().map(
      (slot) =>
        slotWorldPosition(slot, {
          centreX,
          topY: FORMATION.topY,
          spacingX: FORMATION.spacingX,
          spacingY: FORMATION.spacingY,
          breathScale,
          swayX,
        }).x,
    );

    return { left: Math.min(...xs), right: Math.max(...xs) };
  };

  it('is played on a portrait field, as the arcade cabinet is', () => {
    expect(SCREEN.height).toBeGreaterThan(SCREEN.width);
    // Galaga's monitor is the 288 x 224 raster rotated a quarter turn: 7:9.
    expect(SCREEN.width / SCREEN.height).toBeCloseTo(7 / 9, 3);
  });

  it('keeps every sprite of the outer columns on screen at peak inhale', () => {
    for (const swayX of [FORMATION.swayAmplitude, -FORMATION.swayAmplitude, 0]) {
      const { left, right } = widestExtremes(swayX);
      expect(left - spriteHalfWidth).toBeGreaterThan(0);
      expect(right + spriteHalfWidth).toBeLessThan(SCREEN.width);
    }
  });

  it('spaces columns wider than the sprites drawn in them', () => {
    // Anything tighter than a ship's display width shows as a solid block of
    // overlapping ships rather than a grid, and the grid is at its tightest at
    // peak exhale.
    const tightest = FORMATION.spacingX * (1 - FORMATION.breathAmplitude);
    expect(tightest).toBeGreaterThan(spriteHalfWidth * 2);
  });

  it('assembles clear of the row the player flies in', () => {
    const bottomRow = FORMATION.topY + 4 * FORMATION.spacingY;
    expect(bottomRow).toBeLessThan(SCREEN.height * 0.5);
  });
});

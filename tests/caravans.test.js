import { describe, it, expect } from 'vitest';
import {
  CARAVAN_ROWS,
  CARAVAN_ROW_COUNT,
  CARAVAN_FLIGHTS,
  COMBAT_STAGE_ROWS,
  DifficultyRank,
  RANK_COUNT,
  RANK_NAMES,
  caravanFor,
  caravanIndexFor,
  combatStageIndex,
  decodeFlyInByte,
  normalizeRank,
} from '../src/systems/caravans.js';
import { FLY_IN_PATH_COUNT } from '../src/systems/paths.js';

describe('the fly-in path byte', () => {
  it('reads the path out of the low six bits', () => {
    expect(decodeFlyInByte(0x00).pathIndex).toBe(0);
    expect(decodeFlyInByte(0x05).pathIndex).toBe(5);
    // The mirror and gate bits must not leak into the path index.
    expect(decodeFlyInByte(0xc5).pathIndex).toBe(5);
  });

  it('reads bit 6 as the pair member and the negate-rotation flag', () => {
    expect(decodeFlyInByte(0x01).member).toBe(0);
    expect(decodeFlyInByte(0x01).negateRotation).toBe(false);
    expect(decodeFlyInByte(0x41).member).toBe(1);
    expect(decodeFlyInByte(0x41).negateRotation).toBe(true);
    // The historical field name rides along, same bit.
    expect(decodeFlyInByte(0x41).mirrored).toBe(true);
  });

  it('reads bit 7 as the launch gate', () => {
    expect(decodeFlyInByte(0x01).immediate).toBe(false);
    expect(decodeFlyInByte(0x81).immediate).toBe(true);
  });

  it('decodes the arcade stage-1 bytes the way the sourced entrance describes', () => {
    // `0x00 / 0xC0` is the first flight of the arcade's own stage 1: both
    // members fly index 0 (block 0x001D), the second as the pair partner --
    // its own spawn triplet 32 canvas px to the right, every turn negated --
    // and ungated, so it launches alongside the first. That is the sourced
    // "enemies enter from both sides at the same time", and the check that
    // the bit layout is read the right way round.
    const first = decodeFlyInByte(0x00);
    const second = decodeFlyInByte(0xc0);

    expect(first).toEqual({
      pathIndex: 0,
      member: 0,
      negateRotation: false,
      mirrored: false,
      immediate: false,
    });
    expect(second).toEqual({
      pathIndex: 0,
      member: 1,
      negateRotation: true,
      mirrored: true,
      immediate: true,
    });
  });
});

describe('the caravan table', () => {
  it('holds the arcade thirteen rows', () => {
    expect(CARAVAN_ROW_COUNT).toBe(13);
    expect(CARAVAN_ROWS).toHaveLength(13);
  });

  it('gives every row five flights of two path bytes', () => {
    for (const row of CARAVAN_ROWS) {
      expect(row).toHaveLength(CARAVAN_FLIGHTS);
      for (const flight of row) {
        expect(flight).toHaveLength(2);
        for (const byte of flight) {
          expect(Number.isInteger(byte)).toBe(true);
          expect(byte).toBeGreaterThanOrEqual(0);
          expect(byte).toBeLessThanOrEqual(0xff);
        }
      }
    }
  });

  // Row 0 is the one row of the thirteen that is the cabinet's own bytes,
  // quoted from the Z80 source at gg1-3.s:1462. Everything else in the table is
  // authored in the same encoding, so if this drifts the table has lost the one
  // part of itself that is verifiable.
  it('keeps the arcade stage-1 row byte for byte', () => {
    expect(CARAVAN_ROWS[0]).toEqual([
      [0x00, 0xc0],
      [0x01, 0x01],
      [0x41, 0x41],
      [0x40, 0x40],
      [0x00, 0x00],
    ]);
  });

  it('names a path the geometry module actually has, in every row', () => {
    for (const row of CARAVAN_ROWS) {
      for (const flight of row) {
        for (const byte of flight) {
          expect(decodeFlyInByte(byte).pathIndex).toBeLessThan(FLY_IN_PATH_COUNT);
        }
      }
    }
  });

  it('gives all thirteen rows different choreography', () => {
    const signatures = CARAVAN_ROWS.map((row) => JSON.stringify(row));
    expect(new Set(signatures).size).toBe(CARAVAN_ROW_COUNT);
  });

  it('uses every authored fly-in shape somewhere in the table', () => {
    const used = new Set(
      CARAVAN_ROWS.flat(2).map((byte) => decodeFlyInByte(byte).pathIndex),
    );
    expect(used.size).toBe(FLY_IN_PATH_COUNT);
  });

  it('uses both sides of the screen in every row', () => {
    for (const row of CARAVAN_ROWS) {
      const sides = new Set(row.flat().map((byte) => decodeFlyInByte(byte).mirrored));
      expect(sides.size).toBe(2);
    }
  });
});

describe('the rank dimension', () => {
  it('has the cabinet four ranks', () => {
    expect(RANK_COUNT).toBe(4);
    expect(RANK_NAMES).toEqual(['A', 'B', 'C', 'D']);
    expect(DifficultyRank.A).toBe(0);
    expect(DifficultyRank.D).toBe(3);
  });

  it('clamps anything corrupt back onto a real rank', () => {
    expect(normalizeRank(undefined)).toBe(DifficultyRank.A);
    expect(normalizeRank('nonsense')).toBe(DifficultyRank.A);
    expect(normalizeRank(-4)).toBe(DifficultyRank.A);
    expect(normalizeRank(99)).toBe(DifficultyRank.D);
    expect(normalizeRank('2')).toBe(DifficultyRank.C);
  });

  it('indexes seventeen rows per rank, all pointing at real caravans', () => {
    for (let rank = 0; rank < RANK_COUNT; rank += 1) {
      for (let stage = 1; stage <= 255; stage += 1) {
        const index = caravanIndexFor(stage, rank);
        expect(Number.isInteger(index)).toBe(true);
        expect(index).toBeGreaterThanOrEqual(0);
        expect(index).toBeLessThan(CARAVAN_ROW_COUNT);
      }
    }
  });

  // Sourced: "Stage 1 uses row 0 regardless of rank."
  it('opens every machine on the same caravan whatever the operator set', () => {
    for (let rank = 0; rank < RANK_COUNT; rank += 1) {
      expect(caravanIndexFor(1, rank)).toBe(0);
      expect(caravanFor(1, rank)).toEqual(CARAVAN_ROWS[0]);
    }
  });

  it('flies a different entrance for the same stage on a harder machine', () => {
    const perRank = [0, 1, 2, 3].map((rank) => caravanIndexFor(6, rank));
    expect(new Set(perRank).size).toBeGreaterThan(1);
  });

  it('reaches every caravan in the table at some stage of some rank', () => {
    const seen = new Set();
    for (let rank = 0; rank < RANK_COUNT; rank += 1) {
      for (let stage = 1; stage <= 40; stage += 1) seen.add(caravanIndexFor(stage, rank));
    }
    expect(seen.size).toBe(CARAVAN_ROW_COUNT);
  });
});

describe('the combat stage index', () => {
  it('skips challenging stages, so combat stages are neighbours in the cycle', () => {
    // Stages 2 and 4 sit either side of the challenging stage 3 and are
    // adjacent rows: a bonus round assembles no formation and consumes none.
    expect(combatStageIndex(4) - combatStageIndex(2)).toBe(1);
  });

  it('never returns a row off the end of the table', () => {
    for (let stage = 0; stage <= 255; stage += 1) {
      const row = combatStageIndex(stage);
      expect(row).toBeGreaterThanOrEqual(0);
      expect(row).toBeLessThan(COMBAT_STAGE_ROWS);
    }
  });

  it('wraps past stage 23 by four, as the ROM does', () => {
    expect(combatStageIndex(24)).toBe(combatStageIndex(20));
    expect(combatStageIndex(28)).toBe(combatStageIndex(20));
  });
});

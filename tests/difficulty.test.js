import { describe, expect, it } from 'vitest';

import {
  DIFFICULTY_PARAMS,
  DIFFICULTY_STAGE_ROWS,
  DIFFICULTY_TABLE,
  FLAG_BOMBS,
  FLAG_CAPTURE,
  FLAG_ENTRY_BOMBS,
  difficultyRow,
  difficultyRowIndex,
  usesReloadVectors,
} from '../src/systems/difficulty.js';
import { DifficultyRank, RANK_COUNT } from '../src/systems/caravans.js';
import { FRAME_MS } from '../src/systems/pathcode.js';

describe('the table itself', () => {
  it('is the arcade shape: 4 ranks x 26 stage rows x 10 parameters', () => {
    expect(DIFFICULTY_TABLE).toHaveLength(RANK_COUNT);
    for (const rank of DIFFICULTY_TABLE) {
      expect(rank).toHaveLength(DIFFICULTY_STAGE_ROWS);
      for (const row of rank) {
        expect(row).toHaveLength(DIFFICULTY_PARAMS);
        for (const value of row) {
          expect(Number.isFinite(value)).toBe(true);
          expect(value).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it('never eases within a rank as the stages climb', () => {
    for (let rank = 0; rank < RANK_COUNT; rank += 1) {
      for (let row = 1; row < DIFFICULTY_STAGE_ROWS; row += 1) {
        const previous = DIFFICULTY_TABLE[rank][row - 1];
        const current = DIFFICULTY_TABLE[rank][row];
        // Launch counters count down in frames: smaller is more often.
        expect(current[0]).toBeLessThanOrEqual(previous[0]);
        expect(current[1]).toBeLessThanOrEqual(previous[1]);
        expect(current[2]).toBeLessThanOrEqual(previous[2]);
        // Ceilings only rise.
        expect(current[3]).toBeGreaterThanOrEqual(previous[3]);
        expect(current[8]).toBeGreaterThanOrEqual(previous[8]);
      }
    }
  });

  it('makes every rank at least as hard as the one before it, row by row', () => {
    for (let rank = 1; rank < RANK_COUNT; rank += 1) {
      for (let row = 0; row < DIFFICULTY_STAGE_ROWS; row += 1) {
        const easier = DIFFICULTY_TABLE[rank - 1][row];
        const harder = DIFFICULTY_TABLE[rank][row];
        expect(harder[0]).toBeLessThanOrEqual(easier[0]);
        expect(harder[3]).toBeGreaterThanOrEqual(easier[3]);
        expect(harder[5]).toBeGreaterThanOrEqual(easier[5]);
      }
    }
  });

  // Sourced: on a factory machine the opening round cannot shoot. The bomb
  // enable flags for stage 1 are zero at rank A, and the hard ranks arm them.
  it('leaves stage 1 unarmed at the easy ranks and armed at the hard ones', () => {
    expect(DIFFICULTY_TABLE[DifficultyRank.A][0][9] & FLAG_BOMBS).toBe(0);
    expect(DIFFICULTY_TABLE[DifficultyRank.B][0][9] & FLAG_BOMBS).toBe(0);
    expect(DIFFICULTY_TABLE[DifficultyRank.C][0][9] & FLAG_BOMBS).toBe(FLAG_BOMBS);
    expect(DIFFICULTY_TABLE[DifficultyRank.D][0][9] & FLAG_BOMBS).toBe(FLAG_BOMBS);
  });

  it('never allows a capture or entry fire on stage 1 at any rank', () => {
    for (let rank = 0; rank < RANK_COUNT; rank += 1) {
      expect(DIFFICULTY_TABLE[rank][0][9] & FLAG_CAPTURE).toBe(0);
      expect(DIFFICULTY_TABLE[rank][0][9] & FLAG_ENTRY_BOMBS).toBe(0);
    }
  });
});

describe('row selection', () => {
  it('maps stage 1 to row 0 and clamps past the end of the table', () => {
    expect(difficultyRowIndex(1)).toBe(0);
    expect(difficultyRowIndex(26)).toBe(25);
    expect(difficultyRowIndex(255)).toBe(25);
    expect(difficultyRowIndex(0)).toBe(0);
  });

  it('switches to the reload vectors from stage 8, as the ROM does', () => {
    expect(usesReloadVectors(7)).toBe(false);
    expect(usesReloadVectors(8)).toBe(true);
    expect(usesReloadVectors(200)).toBe(true);
  });
});

describe('decoded rows', () => {
  it('names every parameter and converts frames at the cabinet rate', () => {
    const row = difficultyRow(5, DifficultyRank.A);
    expect(row.zakoLaunchFrames).toBe(DIFFICULTY_TABLE[0][4][0]);
    expect(row.launchMs.zako).toBeCloseTo(row.launchFrames.zako * FRAME_MS, 9);
    expect(row.bomberRampMs).toBeCloseTo(row.bomberRampFrames * FRAME_MS, 9);
  });

  it('serves the launch columns before stage 8 and the reload vectors after', () => {
    const before = difficultyRow(7, DifficultyRank.A);
    expect(before.launchFrames.zako).toBe(before.zakoLaunchFrames);

    const after = difficultyRow(8, DifficultyRank.A);
    expect(after.launchFrames.zako).toBe(after.reloadZakoFrames);
    expect(after.launchFrames.goei).toBe(after.reloadEscortFrames);
    // The reload vectors are the faster pair: that is their whole point.
    expect(after.reloadZakoFrames).toBeLessThan(after.zakoLaunchFrames);
  });

  it('decodes the flags into booleans a scene can read', () => {
    const opening = difficultyRow(1, DifficultyRank.A);
    expect(opening.bombsEnabled).toBe(false);
    expect(opening.captureEnabled).toBe(false);
    expect(opening.entryBombsEnabled).toBe(false);

    const second = difficultyRow(2, DifficultyRank.A);
    expect(second.bombsEnabled).toBe(true);
    expect(second.captureEnabled).toBe(true);
    expect(second.entryBombsEnabled).toBe(true);
  });

  it('lands a corrupt rank on the factory row', () => {
    expect(difficultyRow(5, 'garbage')).toEqual(difficultyRow(5, DifficultyRank.A));
    expect(difficultyRow(5, 99)).toEqual(difficultyRow(5, DifficultyRank.D));
  });
});

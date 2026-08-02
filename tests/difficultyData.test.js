import { describe, expect, it } from 'vitest';

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
  D_2908_ENTRY_BOMB_BITS,
  INITIAL_LAUNCH_TICKS,
  MACHINE_RANK_VALUES,
  RANK_TO_SUBTABLE,
  caravanRankIndex,
  cloneAttackGate,
  difficultySubTable,
  starSpeedControl,
} from '../src/systems/difficultyData.js';

/** One row of the packed table, as a plain array. */
function row(subTable, rowIndex) {
  const base = subTable * CFG_SUBTABLE_BYTES + rowIndex * CFG_ROW_BYTES;
  return Array.from(BMBR_STG_CFG_DAT.slice(base, base + CFG_ROW_BYTES));
}

describe('bmbr_stg_cfg_dat (new_stage.s:143-198)', () => {
  it('is the ROM shape: 4 sub-tables x 26 rows x 5 bytes = 520', () => {
    expect(CFG_STAGE_ROWS).toBe(26);
    expect(CFG_ROW_BYTES).toBe(5);
    expect(CFG_SUBTABLE_BYTES).toBe(0x82);
    expect(BMBR_STG_CFG_DAT).toHaveLength(4 * 0x82);
  });

  // Spot pins at all four block boundaries: the first and last row of each
  // sub-table, byte for byte against the disassembly.
  it('pins sub-table 0 at both ends', () => {
    expect(row(0, 0)).toEqual([0x00, 0x00, 0x22, 0xc6, 0x00]);
    expect(row(0, 25)).toEqual([0x62, 0x99, 0x57, 0x3c, 0x11]);
  });

  it('pins sub-table 1 at both ends', () => {
    expect(row(1, 0)).toEqual([0x00, 0x00, 0x12, 0xc6, 0x00]);
    expect(row(1, 25)).toEqual([0x62, 0x99, 0x57, 0x3c, 0x11]);
  });

  it('pins sub-table 2 at both ends', () => {
    expect(row(2, 0)).toEqual([0x00, 0x00, 0x23, 0xc6, 0x00]);
    expect(row(2, 25)).toEqual([0x72, 0x99, 0x68, 0x3e, 0x11]);
  });

  it('pins sub-table 3 at both ends', () => {
    expect(row(3, 0)).toEqual([0x00, 0x00, 0x23, 0xc6, 0x00]);
    expect(row(3, 25)).toEqual([0x72, 0x99, 0x68, 0x3e, 0x11]);
  });

  it('keeps the challenge rows empty but for the beam-speed nibble', () => {
    // Rows 2, 6, 10, 14, 18, 22 are stages 3, 7, 11, 15, 19, 23. Byte 3's
    // upper nibble is the tractor-beam speed; everything else is zero.
    const beamBytes = [0xc0, 0x90, 0x60, 0x60, 0x60, 0x30];
    for (let sub = 0; sub < 4; sub += 1) {
      [2, 6, 10, 14, 18, 22].forEach((challengeRow, i) => {
        expect(row(sub, challengeRow)).toEqual([0x00, 0x00, 0x00, beamBytes[i], 0x00]);
      });
    }
  });
});

describe('the rank mappings', () => {
  it('keeps the difficulty rotation LUT verbatim (new_stage.s:124-128)', () => {
    expect(RANK_TO_SUBTABLE).toEqual([1, 2, 3, 0]);
  });

  it('maps the logical letters onto the raw machine values, factory A = 3', () => {
    expect(MACHINE_RANK_VALUES).toEqual([3, 0, 1, 2]);
  });

  it('rotates the difficulty sub-table but leaves the caravan rank raw', () => {
    // Machine rank 3 (letter A) plays difficulty sub-table 0 but caravan
    // block 3 -- the two tables index differently and Task 4 must use the
    // raw side of this pair.
    expect(difficultySubTable(3)).toBe(0);
    expect(difficultySubTable(0)).toBe(1);
    expect(difficultySubTable(2)).toBe(3);
    expect(caravanRankIndex(3)).toBe(3);
    expect(caravanRankIndex(0)).toBe(0);
  });
});

describe('the secondary reload tables (game_ctrl.s:1503-1539)', () => {
  it('pins d_08CD: 10 rows x 3, fastest last', () => {
    expect(D_08CD_RED_RELOAD).toHaveLength(30);
    expect(Array.from(D_08CD_RED_RELOAD.slice(0, 3))).toEqual([0x09, 0x07, 0x05]);
    expect(Array.from(D_08CD_RED_RELOAD.slice(27))).toEqual([0x02, 0x02, 0x02]);
  });

  it('pins d_08EB: 10 rows x 3, fastest last', () => {
    expect(D_08EB_YELLOW_RELOAD).toHaveLength(30);
    expect(Array.from(D_08EB_YELLOW_RELOAD.slice(0, 3))).toEqual([0x06, 0x05, 0x04]);
    expect(Array.from(D_08EB_YELLOW_RELOAD.slice(27))).toEqual([0x01, 0x01, 0x01]);
  });

  it('keeps d_0909 and d_0929 one contiguous 44-byte table', () => {
    expect(D_0909_0929).toHaveLength(44);
    expect(D_0929_OFFSET).toBe(0x20);
    // The boundary the col-4 overflow depends on: d_0909's last row runs
    // straight into d_0929's first byte.
    expect(Array.from(D_0909_0929.slice(28, 33))).toEqual([0x0f, 0x07, 0x07, 0x07, 0x06]);
    expect(D_0909_0929[0]).toBe(0x03);
    expect(D_0909_0929[43]).toBe(0x0a);
  });

  it('carries the byte past the table for the final overflow', () => {
    // ROM 0x0935 is the first opcode of f_0935 -- `ld a,(nn)` = 0x3A
    // (game_ctrl.s:1553-1555) -- reachable only by d_0929's last row at a
    // full 40-bug board.
    expect(D_0909_0929_OVERRUN_BYTE).toBe(0x3a);
  });
});

describe('the fixed launch constants (new_stage.s:100-103)', () => {
  it('starts every stage with boss 0x16, red 2, yellow 2 ticks', () => {
    expect(INITIAL_LAUNCH_TICKS).toEqual({ boss: 0x16, goei: 0x02, zako: 0x02 });
  });
});

describe('the computed parameter 10 (new_stage.s:81-98)', () => {
  it('disables the clone attack before stage 3 and on challenge stages', () => {
    expect(cloneAttackGate(1)).toBe(0);
    expect(cloneAttackGate(2)).toBe(0);
    expect(cloneAttackGate(3)).toBe(0);
    expect(cloneAttackGate(7)).toBe(0);
    expect(cloneAttackGate(11)).toBe(0);
  });

  it('arms it at ten remaining everywhere else', () => {
    expect(cloneAttackGate(4)).toBe(0x0a);
    expect(cloneAttackGate(5)).toBe(0x0a);
    expect(cloneAttackGate(8)).toBe(0x0a);
    expect(cloneAttackGate(26)).toBe(0x0a);
  });
});

describe('the star-speed register (new_stage.s:105-118)', () => {
  it('steps every four stages and caps at stage 16', () => {
    expect(starSpeedControl(1)).toBe(0x40);
    expect(starSpeedControl(4)).toBe(0x50);
    expect(starSpeedControl(8)).toBe(0x60);
    expect(starSpeedControl(12)).toBe(0x70);
    expect(starSpeedControl(16)).toBe(0x80);
    expect(starSpeedControl(200)).toBe(0x80);
  });
});

describe('d_2908 (gg1-3.s:1639-1640)', () => {
  it('carries the 44-bit entry-bomb capability bytes verbatim', () => {
    expect(Array.from(D_2908_ENTRY_BOMB_BITS)).toEqual([0xa5, 0x5a, 0xa9, 0x0f, 0x0a, 0x50]);
  });
});

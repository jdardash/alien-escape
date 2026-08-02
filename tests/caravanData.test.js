import { describe, it, expect } from 'vitest';
import {
  CARAVAN_ROW_BYTES,
  D_COMBAT_STG_DAT,
  D_COMBAT_STG_DAT_IDX,
  D_CHALLG_STG_DAT,
  D_CHALLG_STG_DAT_IDX,
  DB_ATTK_WAV_IDS,
  SPRT_FMTN_HPOS,
  formationCellFor,
  entryBombCapable,
} from '../src/systems/caravanData.js';

/**
 * Verbatim pins against the disassembly (gg1-3.s / gg1-5.s). If any of these
 * fail, the data has drifted from the ROM and everything downstream is
 * launching the wrong stage.
 */
describe('d_combat_stg_dat (gg1-3.s:1461-1474)', () => {
  it('holds 13 rows of 18 bytes, each 0xFF-terminated', () => {
    expect(D_COMBAT_STG_DAT).toHaveLength(13);
    for (const row of D_COMBAT_STG_DAT) {
      expect(row).toHaveLength(CARAVAN_ROW_BYTES);
      expect(row.at(-1)).toBe(0xff);
    }
  });

  it('keeps row 0 -- the stage-1 entrance -- byte for byte', () => {
    expect(D_COMBAT_STG_DAT[0]).toEqual([
      0x14, 0x00, 0x00, 0x00, 0xc0, 0x00, 0x01, 0x01, 0x00, 0x41, 0x41, 0x00,
      0x40, 0x40, 0x00, 0x00, 0x00, 0xff,
    ]);
  });

  it('keeps a transient-bearing row -- row 5 -- byte for byte', () => {
    // 0x82 / 0x42 / 0xF2 / 0x02 / 0x02: two transients on waves 1-3, with
    // the MSB-first type bits, and none on the closing waves.
    expect(D_COMBAT_STG_DAT[5]).toEqual([
      0x14, 0x01, 0x82, 0x00, 0xc0, 0x42, 0x01, 0x01, 0xf2, 0x41, 0x41, 0x02,
      0x40, 0x40, 0x02, 0x00, 0x00, 0xff,
    ]);
  });

  it('keeps the last row -- row 12 -- byte for byte', () => {
    expect(D_COMBAT_STG_DAT[12]).toEqual([
      0x14, 0x03, 0xa4, 0x02, 0xc2, 0x54, 0x03, 0x85, 0xf4, 0x43, 0xc5, 0x04,
      0x42, 0xc4, 0x04, 0x02, 0x84, 0xff,
    ]);
  });

  it('reloads the fly-in bomb counter from 0x14 on every row', () => {
    for (const row of D_COMBAT_STG_DAT) expect(row[0]).toBe(0x14);
  });

  it('steps the fly-in bomb mask 0x00 -> 0x01 -> 0x03 down the table', () => {
    expect(D_COMBAT_STG_DAT.map((row) => row[1])).toEqual([
      0x00, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x03, 0x03, 0x03,
    ]);
  });

  it('uses only path indices 0-5 on combat rows', () => {
    for (const row of D_COMBAT_STG_DAT) {
      for (let wave = 0; wave < 5; wave += 1) {
        expect(row[2 + wave * 3 + 1] & 0x3f).toBeLessThan(6);
        expect(row[2 + wave * 3 + 2] & 0x3f).toBeLessThan(6);
      }
    }
  });

  it('carries transient counts of 0, 2 or 4, never odd', () => {
    for (const row of D_COMBAT_STG_DAT) {
      for (let wave = 0; wave < 5; wave += 1) {
        expect([0, 2, 4]).toContain(row[2 + wave * 3] & 0x0f);
      }
    }
  });
});

describe('d_combat_stg_dat_idx (gg1-3.s:1437-1441)', () => {
  it('holds the four raw-rank sets of seventeen offsets, verbatim', () => {
    // prettier-ignore
    expect([...D_COMBAT_STG_DAT_IDX]).toEqual([
      0x00, 0x12, 0x24, 0x36, 0x00, 0x48, 0x6c, 0x5a, 0x48, 0x6c, 0x00, 0x7e, 0xa2, 0x90, 0xb4, 0xd8, 0xc6,
      0x00, 0x12, 0x48, 0x6c, 0x5a, 0x7e, 0xa2, 0x00, 0x7e, 0xd8, 0xc6, 0xb4, 0xd8, 0xc6, 0xb4, 0xd8, 0xc6,
      0x00, 0x12, 0x7e, 0xa2, 0x90, 0x7e, 0xd8, 0xc6, 0xb4, 0xd8, 0xc6, 0xb4, 0xd8, 0xc6, 0xb4, 0xd8, 0xc6,
      0x00, 0x12, 0x48, 0x36, 0x24, 0x48, 0x6c, 0x00, 0x7e, 0xa2, 0x90, 0xb4, 0xd8, 0x00, 0xb4, 0xd8, 0xc6,
    ]);
  });

  it('offsets are all multiples of 18 inside the table', () => {
    for (const offset of D_COMBAT_STG_DAT_IDX) {
      expect(offset % CARAVAN_ROW_BYTES).toBe(0);
      expect(offset / CARAVAN_ROW_BYTES).toBeLessThan(13);
    }
  });

  it('replays the stage-1 row mid-cycle: the tables are not difficulty ladders', () => {
    // Raw rank 0 (letter B) flies row 0 again at combat stages 5 and 11;
    // raw rank 3 (the factory letter A) at 8 and 14.
    expect(D_COMBAT_STG_DAT_IDX[0 * 17 + 4]).toBe(0x00);
    expect(D_COMBAT_STG_DAT_IDX[0 * 17 + 10]).toBe(0x00);
    expect(D_COMBAT_STG_DAT_IDX[3 * 17 + 7]).toBe(0x00);
    expect(D_COMBAT_STG_DAT_IDX[3 * 17 + 13]).toBe(0x00);
  });
});

describe('the challenge tables (gg1-3.s:1444, 1477-1485)', () => {
  it('holds the eight-row index verbatim', () => {
    expect(D_CHALLG_STG_DAT_IDX).toEqual([0x00, 0x12, 0x24, 0x36, 0x48, 0x5a, 0x6c, 0x7e]);
  });

  it('has eight 18-byte rows with silent headers and no transients', () => {
    expect(D_CHALLG_STG_DAT).toHaveLength(8);
    for (const row of D_CHALLG_STG_DAT) {
      expect(row).toHaveLength(CARAVAN_ROW_BYTES);
      expect(row[0]).toBe(0xff);
      expect(row[1]).toBe(0x00);
      for (let wave = 0; wave < 5; wave += 1) expect(row[2 + wave * 3]).toBe(0x00);
    }
  });

  it('drives only the token-free path indices 6-23', () => {
    for (const row of D_CHALLG_STG_DAT) {
      for (let wave = 0; wave < 5; wave += 1) {
        for (const byte of [row[2 + wave * 3 + 1], row[2 + wave * 3 + 2]]) {
          expect(byte & 0x3f).toBeGreaterThanOrEqual(6);
          expect(byte & 0x3f).toBeLessThan(24);
        }
      }
    }
  });
});

describe('db_attk_wav_IDs (gg1-3.s:1489-1494)', () => {
  it('holds the five waves of eight verbatim', () => {
    expect(DB_ATTK_WAV_IDS).toEqual([
      [0x58, 0x5a, 0x5c, 0x5e, 0x28, 0x2a, 0x2c, 0x2e],
      [0x30, 0x34, 0x36, 0x32, 0x50, 0x52, 0x54, 0x56],
      [0x42, 0x46, 0x40, 0x44, 0x4a, 0x4e, 0x48, 0x4c],
      [0x1a, 0x1e, 0x20, 0x24, 0x22, 0x26, 0x18, 0x1c],
      [0x08, 0x0c, 0x12, 0x16, 0x10, 0x14, 0x0a, 0x0e],
    ]);
  });

  it('covers all forty flying IDs exactly once, phantoms excluded', () => {
    const all = DB_ATTK_WAV_IDS.flat();
    expect(all).toHaveLength(40);
    expect(new Set(all).size).toBe(40);
    for (const id of all) {
      // Even IDs only, none from the rogue row (0x00-0x06) or the
      // transient corners (0x38-0x3E).
      expect(id % 2).toBe(0);
      expect(id).toBeGreaterThanOrEqual(0x08);
      expect((id & 0x38) === 0x38).toBe(false);
    }
  });

  it('puts THE FOUR BOSSES in wave 2, not wave 1', () => {
    expect(DB_ATTK_WAV_IDS[1].slice(0, 4)).toEqual([0x30, 0x34, 0x36, 0x32]);
    expect(DB_ATTK_WAV_IDS[0].some((id) => id >= 0x30 && id <= 0x36)).toBe(false);
  });
});

describe('sprt_fmtn_hpos (gg1-5.s:185-191)', () => {
  it('holds 48 entries -- 96 bytes', () => {
    expect(SPRT_FMTN_HPOS).toHaveLength(96);
  });

  it('decodes the bosses onto ROM row 1, centre columns', () => {
    expect(formationCellFor(0x30)).toEqual({ romRow: 1, column: 3 });
    expect(formationCellFor(0x32)).toEqual({ romRow: 1, column: 6 });
    expect(formationCellFor(0x34)).toEqual({ romRow: 1, column: 4 });
    expect(formationCellFor(0x36)).toEqual({ romRow: 1, column: 5 });
  });

  it('decodes the rogue row as ROM row 0', () => {
    for (const id of [0x00, 0x02, 0x04, 0x06]) {
      expect(formationCellFor(id).romRow).toBe(0);
    }
  });

  it('parks the transient corners on the butterfly rows, edge columns', () => {
    expect(formationCellFor(0x38)).toEqual({ romRow: 2, column: 0 });
    expect(formationCellFor(0x3a)).toEqual({ romRow: 2, column: 9 });
    expect(formationCellFor(0x3c)).toEqual({ romRow: 3, column: 0 });
    expect(formationCellFor(0x3e)).toEqual({ romRow: 3, column: 9 });
  });

  it('pairs adjacent IDs into symmetric columns', () => {
    // e.g. 0x58 lands col 3 and its pair 0x5A col 6.
    expect(formationCellFor(0x58).column + formationCellFor(0x5a).column).toBe(9);
    expect(formationCellFor(0x08).column + formationCellFor(0x0a).column).toBe(9);
  });
});

describe('d_2908 entry-bomb capability (gg1-3.s:1639-1640)', () => {
  it('decodes exactly the corpus-verified twenty capable creatures', () => {
    const capable = [];
    for (let id = 0x08; id <= 0x5e; id += 2) {
      if (entryBombCapable(id)) capable.push(id);
    }
    expect(capable).toEqual([
      0x08, 0x0c, 0x12, 0x16, 0x1a, 0x1e, 0x20, 0x24, 0x28, 0x2c, // bees
      0x30, 0x36, // bosses
      0x40, 0x42, 0x44, 0x46, 0x50, 0x54, 0x5a, 0x5e, // moths
    ]);
  });

  it('never arms an ID outside the roster', () => {
    expect(entryBombCapable(0x00)).toBe(false);
    expect(entryBombCapable(0x06)).toBe(false);
    expect(entryBombCapable(0x60)).toBe(false);
  });
});

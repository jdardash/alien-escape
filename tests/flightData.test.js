import { describe, expect, it } from 'vitest';

import {
  ATTACK_PATH_BOSS,
  ATTACK_PATH_RED,
  ATTACK_PATH_YELLOW,
  BOSS_CARRYHOME_PATH,
  CHALLENGE_ROWS,
  CONVOY_REGION,
  DB_2A3C,
  DB_2A6C,
  FLY_IN_BLOCKS,
  FLY_IN_BLOCK_COUNT,
  TOKEN_BASE,
  challengeRowWaves,
} from '../src/systems/flightData.js';

/**
 * Walk a byte stream structurally: segments advance 3, tokens by their own
 * argument widths, FE/F3 by 9. Returns the opcodes seen, or throws on a
 * malformed stream -- which is how the transcription is proofread.
 */
function walkStream(bytes, start = 0) {
  const argWidth = {
    0xff: 0, 0xfe: 8, 0xfd: 2, 0xfc: 1, 0xfb: 0, 0xfa: 2, 0xf9: 0, 0xf8: 0,
    0xf7: 2, 0xf6: 1, 0xf5: 0, 0xf4: 0, 0xf3: 8, 0xf2: 2, 0xf1: 0, 0xf0: 2,
    0xef: 2,
  };
  const ops = [];
  let pc = start;
  while (pc < bytes.length) {
    const byte = bytes[pc];
    if (byte === undefined) throw new Error(`ran off the stream at ${pc}`);
    if (byte >= TOKEN_BASE) {
      ops.push(byte);
      if (byte === 0xff) return ops;
      pc += 1 + argWidth[byte];
    } else {
      ops.push('seg');
      if (bytes[pc + 2] === undefined) throw new Error(`segment cut short at ${pc}`);
      pc += 3;
    }
  }
  throw new Error('stream has no FF terminator');
}

describe('the fly-in blocks', () => {
  const addresses = Object.keys(FLY_IN_BLOCKS).map(Number);

  it('holds the ROM count: 22 unique blocks', () => {
    expect(FLY_IN_BLOCK_COUNT).toBe(22);
  });

  it('parses every block and sub-path cleanly to an FF terminator', () => {
    for (const addr of addresses) {
      const block = FLY_IN_BLOCKS[addr];
      expect(block.z80Base).toBe(addr);
      expect(() => walkStream(block.bytes)).not.toThrow();
      for (const [subAddr, sub] of Object.entries(block.subPaths ?? {})) {
        expect(sub.z80Base).toBe(Number(subAddr));
        expect(() => walkStream(sub.bytes)).not.toThrow();
      }
    }
  });

  it('gives the six combat blocks the F7, F0 and FB token spine', () => {
    for (const addr of [0x001d, 0x0067, 0x009f, 0x00d4, 0x017b, 0x01b0]) {
      const ops = walkStream(FLY_IN_BLOCKS[addr].bytes);
      expect(ops).toContain(0xf7);
      expect(ops).toContain(0xf0);
      expect(ops).toContain(0xfb);
      // Two sub-paths each: the F0 replacement and the F7 swoop.
      expect(Object.keys(FLY_IN_BLOCKS[addr].subPaths)).toHaveLength(2);
    }
  });

  it('keeps the sixteen fly-through blocks token-free: segments to a bare FF', () => {
    const combat = new Set([0x001d, 0x0067, 0x009f, 0x00d4, 0x017b, 0x01b0]);
    for (const addr of addresses.filter((a) => !combat.has(a))) {
      const ops = walkStream(FLY_IN_BLOCKS[addr].bytes);
      expect(ops.filter((op) => op !== 'seg')).toEqual([0xff]);
    }
  });

  it('keeps the stage-1 block byte for byte (gg1-5.s:82)', () => {
    expect(FLY_IN_BLOCKS[0x001d].bytes).toEqual([
      0x23, 0x06, 0x16, 0x23, 0x00, 0x19, 0xf7, 0x4b, 0x00, 0x23, 0xf0, 0x02,
      0xf0, 0x5e, 0x00, 0x23, 0xf0, 0x24, 0xfb, 0x23, 0x00, 0xff, 0xff,
    ]);
  });

  it('ends every F7 swoop sub-path with an FE hold and a despawning FF', () => {
    for (const addr of [0x001d, 0x0067, 0x009f, 0x00d4, 0x017b, 0x01b0]) {
      const subs = FLY_IN_BLOCKS[addr].subPaths;
      const swoop = Object.values(subs).find((sub) => sub.bytes.includes(0xfe));
      expect(swoop).toBeDefined();
      const ops = walkStream(swoop.bytes);
      expect(ops).toContain(0xfe);
      expect(ops[ops.length - 1]).toBe(0xff);
      expect(ops).not.toContain(0xfb); // transients despawn, never home
    }
  });
});

describe('the db_2A3C index', () => {
  it('holds 24 entries, each pointing at a real block', () => {
    expect(DB_2A3C).toHaveLength(24);
    for (const entry of DB_2A3C) {
      expect(FLY_IN_BLOCKS[entry.addr]).toBeDefined();
      expect(entry.variant).toBeGreaterThanOrEqual(0);
      expect(entry.variant).toBeLessThan(6);
    }
  });

  it('points its six combat entries at the token-bearing blocks', () => {
    const combat = DB_2A3C.slice(0, 6).map((entry) => entry.addr);
    expect(combat).toEqual([0x001d, 0x0067, 0x009f, 0x00d4, 0x017b, 0x01b0]);
  });

  it('reuses blocks 0x022B/0x025D for entries 22/23 under variant 5', () => {
    expect(DB_2A3C[22]).toEqual({ addr: 0x022b, variant: 5 });
    expect(DB_2A3C[23]).toEqual({ addr: 0x025d, variant: 5 });
  });

  it('covers all 22 blocks across the 24 entries', () => {
    expect(new Set(DB_2A3C.map((entry) => entry.addr)).size).toBe(22);
  });
});

describe('the db_2A6C spawn variants', () => {
  it('holds the 12 triplets verbatim', () => {
    expect(DB_2A6C).toHaveLength(12);
    expect(DB_2A6C[0]).toEqual({ rawY: 0x9b, rawX: 0x34, rotHi: 0x03 });
    expect(DB_2A6C[1]).toEqual({ rawY: 0x9b, rawX: 0x44, rotHi: 0x03 });
    expect(DB_2A6C[2]).toEqual({ rawY: 0x23, rawX: 0x00, rotHi: 0x00 });
    expect(DB_2A6C[3]).toEqual({ rawY: 0x23, rawX: 0x78, rotHi: 0x02 });
    expect(DB_2A6C[6]).toEqual({ rawY: 0x2b, rawX: 0x00, rotHi: 0x00 });
    expect(DB_2A6C[7]).toEqual({ rawY: 0x2b, rawX: 0x78, rotHi: 0x02 });
  });

  it('duplicates rows 0/1 into the variant 4/5 pairs, as the ROM does', () => {
    expect(DB_2A6C[8]).toEqual(DB_2A6C[0]);
    expect(DB_2A6C[9]).toEqual(DB_2A6C[0]);
    expect(DB_2A6C[10]).toEqual(DB_2A6C[1]);
    expect(DB_2A6C[11]).toEqual(DB_2A6C[1]);
  });

  it('enters waves 2 and 3 from the BOTTOM edges: rawY 0x23/0x2B, angles 0 and 512', () => {
    for (const pair of [1, 3]) {
      const left = DB_2A6C[pair * 2];
      const right = DB_2A6C[pair * 2 + 1];
      expect(left.rawX).toBe(0x00);
      expect(left.rotHi).toBe(0x00); // angle 0: flying right, along the floor
      expect(right.rawX).toBe(0x78);
      expect(right.rotHi).toBe(0x02); // angle 512: flying left
    }
  });
});

describe('the attack-dive tables', () => {
  it('carries the yellow table at 90 bytes from base 0x34F', () => {
    expect(ATTACK_PATH_YELLOW.z80Base).toBe(0x034f);
    expect(ATTACK_PATH_YELLOW.bytes).toHaveLength(90);
    expect(ATTACK_PATH_YELLOW.entryOffset).toBe(0);
    // The shared return tail at offset 79: `12 F8 10 12 00 40 FB 12 00 FF FF`.
    expect(ATTACK_PATH_YELLOW.bytes.slice(79)).toEqual([
      0x12, 0xf8, 0x10, 0x12, 0x00, 0x40, 0xfb, 0x12, 0x00, 0xff, 0xff,
    ]);
  });

  it('carries the red table at 104 bytes from base 0x3A9, with the F3 hook', () => {
    expect(ATTACK_PATH_RED.z80Base).toBe(0x03a9);
    expect(ATTACK_PATH_RED.bytes).toHaveLength(104);
    expect(ATTACK_PATH_RED.bytes[9]).toBe(0xf3);
    // Its home tail is the last five bytes -- which are also address 0x40C,
    // the boss region's first five: the tail is shared in ROM.
    expect(ATTACK_PATH_RED.bytes.slice(99)).toEqual([0xfb, 0x12, 0x00, 0xff, 0xff]);
    expect(ATTACK_PATH_RED.z80Base + 99).toBe(ATTACK_PATH_BOSS.z80Base);
  });

  it('carries the boss region at 95 bytes with the three entry offsets', () => {
    expect(ATTACK_PATH_BOSS.z80Base).toBe(0x040c);
    expect(ATTACK_PATH_BOSS.bytes).toHaveLength(95);
    expect(ATTACK_PATH_BOSS.bytes.slice(0, 5)).toEqual([0xfb, 0x12, 0x00, 0xff, 0xff]);
    expect(ATTACK_PATH_BOSS.entryOffset).toBe(5);
    expect(ATTACK_PATH_BOSS.captureOffset).toBe(72);
    expect(ATTACK_PATH_BOSS.rogueOffset).toBe(56);
    // The capture entry opens `12 18 14 F4` -- segment, then the F4 aim.
    expect(ATTACK_PATH_BOSS.bytes.slice(72, 76)).toEqual([0x12, 0x18, 0x14, 0xf4]);
    // The rogue fighter arc ends FF: gone for good, never homed.
    const rogue = ATTACK_PATH_BOSS.bytes.slice(56, 72);
    expect(rogue[rogue.length - 1]).toBe(0xff);
  });

  it('keeps the carry-home path: segment, FB, glide tail', () => {
    expect(BOSS_CARRYHOME_PATH.bytes).toEqual([0x12, 0x18, 0x14, 0xfb, 0x12, 0x00, 0xff, 0xff]);
  });
});

describe('the bonus-bee convoy region', () => {
  it('spans the 160 bytes of 0x0473-0x0512 with the three colour entries', () => {
    expect(CONVOY_REGION.z80Base).toBe(0x0473);
    expect(CONVOY_REGION.bytes).toHaveLength(160);
    expect(CONVOY_REGION.entries).toEqual({ 0: 119, 1: 0, 2: 56 });
  });

  it('places the named sub-streams at their ROM offsets', () => {
    // p_flv_0499 (clone stream) at offset 38, db_04AB at 56, p_flv_04C6 at
    // 83, p_flv_04CF at 92, p_flv_04D8 at 101, db_04EA at 119, p_flv_0502
    // at 143 -- each address minus the base.
    expect(0x0499 - CONVOY_REGION.z80Base).toBe(38);
    expect(0x04ab - CONVOY_REGION.z80Base).toBe(56);
    expect(0x04c6 - CONVOY_REGION.z80Base).toBe(83);
    expect(0x04cf - CONVOY_REGION.z80Base).toBe(92);
    expect(0x04d8 - CONVOY_REGION.z80Base).toBe(101);
    expect(0x04ea - CONVOY_REGION.z80Base).toBe(119);
    expect(0x0502 - CONVOY_REGION.z80Base).toBe(143);
    // The clone-split targets embedded in the leaders point at those streams.
    expect(CONVOY_REGION.bytes[6]).toBe(0xf2);
    expect(CONVOY_REGION.bytes[7] | (CONVOY_REGION.bytes[8] << 8)).toBe(0x0499);
    expect(CONVOY_REGION.bytes[143 + 3]).toBe(0xf3); // the aimed spinner
  });
});

describe('the challenge rows', () => {
  it('holds 8 rows of 18 bytes, header byte 1 always 0 (nothing bombs)', () => {
    expect(CHALLENGE_ROWS).toHaveLength(8);
    for (const row of CHALLENGE_ROWS) {
      expect(row).toHaveLength(18);
      expect(row[0]).toBe(0xff);
      expect(row[1]).toBe(0x00);
      expect(row[17]).toBe(0xff);
    }
  });

  it('drives only the token-free index entries 6-23', () => {
    for (const row of CHALLENGE_ROWS) {
      for (const wave of challengeRowWaves(row)) {
        for (const byte of [wave.m0, wave.m1]) {
          const index = byte & 0x3f;
          expect(index).toBeGreaterThanOrEqual(6);
          expect(index).toBeLessThan(24);
        }
      }
    }
  });

  it('keeps row 0 verbatim', () => {
    expect(CHALLENGE_ROWS[0]).toEqual([
      0xff, 0x00, 0x00, 0x06, 0xc6, 0x00, 0x07, 0x07, 0x00, 0x47, 0x47, 0x00,
      0x46, 0x46, 0x00, 0x06, 0x06, 0xff,
    ]);
  });
});

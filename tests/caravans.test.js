import { describe, it, expect } from 'vitest';
import {
  CARAVAN_ROWS,
  CARAVAN_ROW_COUNT,
  CARAVAN_FLIGHTS,
  COMBAT_STAGE_ROWS,
  IN_FLIGHT_CAP,
  STREAM_END,
  WAVE_START,
  DifficultyRank,
  RANK_COUNT,
  RANK_NAMES,
  caravanFor,
  caravanHeaderFor,
  caravanIndexFor,
  caravanRawRowFor,
  combatStageIndex,
  compileCaravanStream,
  compileStageStream,
  createStageRng,
  createWaveLauncher,
  decodeFlyInByte,
  decodeLaunch,
  isTransientId,
  normalizeRank,
  stepWaveLauncher,
} from '../src/systems/caravans.js';
import { D_COMBAT_STG_DAT } from '../src/systems/caravanData.js';

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

  it('double-reads bit 0 as the fly-in bomb-counter seed', () => {
    // gg1-3.s:1828-1834: clear -> 0x08 (top entrant), set -> 0x44 (side).
    expect(decodeFlyInByte(0x00).bombCounterInit).toBe(0x08);
    expect(decodeFlyInByte(0x03).bombCounterInit).toBe(0x44);
    expect(decodeFlyInByte(0x42).bombCounterInit).toBe(0x08);
  });

  it('decodes the arcade stage-1 opening pair the sourced way round', () => {
    // `0x00 / 0xC0`: both members fly index 0, the second as the ungated
    // pair partner with every turn negated -- "enemies enter from both
    // sides at the same time".
    expect(decodeFlyInByte(0x00)).toMatchObject({
      pathIndex: 0,
      member: 0,
      negateRotation: false,
      immediate: false,
    });
    expect(decodeFlyInByte(0xc0)).toMatchObject({
      pathIndex: 0,
      member: 1,
      negateRotation: true,
      immediate: true,
    });
  });
});

describe('the caravan table view', () => {
  it('holds the arcade thirteen rows of five flights', () => {
    expect(CARAVAN_ROW_COUNT).toBe(13);
    expect(CARAVAN_ROWS).toHaveLength(13);
    for (const row of CARAVAN_ROWS) {
      expect(row).toHaveLength(CARAVAN_FLIGHTS);
      for (const flight of row) expect(flight).toHaveLength(2);
    }
  });

  it('keeps the arcade stage-1 row byte for byte', () => {
    expect(CARAVAN_ROWS[0]).toEqual([
      [0x00, 0xc0],
      [0x01, 0x01],
      [0x41, 0x41],
      [0x40, 0x40],
      [0x00, 0x00],
    ]);
  });

  it('selects only the six token-bearing combat blocks, in every row', () => {
    for (const row of CARAVAN_ROWS) {
      for (const flight of row) {
        for (const byte of flight) {
          expect(decodeFlyInByte(byte).pathIndex).toBeLessThan(6);
        }
      }
    }
  });

  it('shares path bytes between rows: the raw rows, not the pairs, are distinct', () => {
    // Rows 0, 2, 5, 8 and 11 fly identical path bytes and differ only in
    // headers and transient control -- the ROM's own economy. What must be
    // distinct is the full 18-byte row.
    expect(CARAVAN_ROWS[0]).toEqual(CARAVAN_ROWS[2]);
    expect(CARAVAN_ROWS[0]).toEqual(CARAVAN_ROWS[5]);
    const raw = D_COMBAT_STG_DAT.map((row) => JSON.stringify(row));
    expect(new Set(raw).size).toBe(13);
  });

  it('uses both pair members somewhere in every row', () => {
    for (const row of CARAVAN_ROWS) {
      const members = new Set(row.flat().map((byte) => decodeFlyInByte(byte).member));
      expect(members.size).toBe(2);
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

  // Sourced: idx column 0 is 0x00 in all four raw-rank sets.
  it('opens every machine on the same caravan whatever the operator set', () => {
    for (let rank = 0; rank < RANK_COUNT; rank += 1) {
      expect(caravanIndexFor(1, rank)).toBe(0);
      expect(caravanFor(1, rank)).toEqual(CARAVAN_ROWS[0]);
    }
  });

  it('routes the letters through the RAW rank order B, C, D, A', () => {
    // Combat stage 6 is idx column 4: the four raw sets hold 0x00, 0x5A,
    // 0x90, 0x24 -- rows 0, 5, 8, 2. Letter A is raw 3, B raw 0, and so on.
    expect(caravanIndexFor(6, DifficultyRank.A)).toBe(2);
    expect(caravanIndexFor(6, DifficultyRank.B)).toBe(0);
    expect(caravanIndexFor(6, DifficultyRank.C)).toBe(5);
    expect(caravanIndexFor(6, DifficultyRank.D)).toBe(8);
  });

  it('replays the stage-1 entrance mid-game, as the real tables do', () => {
    // The factory rank meets caravan 0 again on combat stages 8 and 14
    // (stages 10 and 18): the idx sets are repeat-heavy, not ladders.
    expect(caravanIndexFor(10, DifficultyRank.A)).toBe(0);
    expect(caravanIndexFor(18, DifficultyRank.A)).toBe(0);
  });

  it('reaches every caravan in the table at some stage of some rank', () => {
    const seen = new Set();
    for (let rank = 0; rank < RANK_COUNT; rank += 1) {
      for (let stage = 1; stage <= 40; stage += 1) seen.add(caravanIndexFor(stage, rank));
    }
    expect(seen.size).toBe(CARAVAN_ROW_COUNT);
  });

  it('never shows the factory rank caravan 5: the ROM holds it for B, C and D', () => {
    const seen = new Set();
    for (let stage = 1; stage <= 255; stage += 1) {
      seen.add(caravanIndexFor(stage, DifficultyRank.A));
    }
    expect(seen.has(5)).toBe(false);
    expect(seen.size).toBe(12);
  });
});

describe('the combat stage index', () => {
  it('skips challenging stages, so combat stages are neighbours in the cycle', () => {
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

describe('the stage header (b_92E2)', () => {
  it('gives stage 1 a silent fly-in and the 0x14 counter reload', () => {
    expect(caravanHeaderFor(1)).toEqual({ bombReload: 0x14, flyInBombMask: 0x00 });
  });

  it('arms the fly-in from stage 2 and doubles it on the late rows', () => {
    expect(caravanHeaderFor(2).flyInBombMask).toBe(0x01);
    expect(caravanHeaderFor(24, DifficultyRank.A).flyInBombMask).toBe(0x03);
  });

  it('goes silent again wherever a rank replays row 0 mid-game', () => {
    // Factory rank A flies row 0 on stage 10; rank B on stage 6. Those
    // stages genuinely have no fly-in bombing on the real machine.
    expect(caravanHeaderFor(10, DifficultyRank.A).flyInBombMask).toBe(0x00);
    expect(caravanHeaderFor(6, DifficultyRank.B).flyInBombMask).toBe(0x00);
  });

  it('carries the challenge rows silent header', () => {
    expect(caravanHeaderFor(3).flyInBombMask).toBe(0x00);
    expect(caravanHeaderFor(7).flyInBombMask).toBe(0x00);
  });

  it('selects the challenge rows in the (stage >> 2) & 7 cycle', () => {
    // Stages 3, 7, ..., 31 walk rows 0-7; stage 35 wraps to row 0.
    expect(caravanRawRowFor(3)).not.toBe(caravanRawRowFor(7));
    expect(caravanRawRowFor(35)).toBe(caravanRawRowFor(3));
    expect(caravanRawRowFor(3)[0]).toBe(0xff);
  });
});

// ---------------------------------------------------------------------------

/** The exact runtime stream c_25A2 builds for stage 1 (86 bytes). */
// prettier-ignore
const STAGE_1_STREAM = [
  0x7e, 0x00, 0x58, 0xc0, 0x28, 0x00, 0x5a, 0xc0, 0x2a, 0x00, 0x5c, 0xc0, 0x2c, 0x00, 0x5e, 0xc0, 0x2e,
  0x7e, 0x01, 0x30, 0x01, 0x50, 0x01, 0x34, 0x01, 0x52, 0x01, 0x36, 0x01, 0x54, 0x01, 0x32, 0x01, 0x56,
  0x7e, 0x41, 0x42, 0x41, 0x4a, 0x41, 0x46, 0x41, 0x4e, 0x41, 0x40, 0x41, 0x48, 0x41, 0x44, 0x41, 0x4c,
  0x7e, 0x40, 0x1a, 0x40, 0x22, 0x40, 0x1e, 0x40, 0x26, 0x40, 0x20, 0x40, 0x18, 0x40, 0x24, 0x40, 0x1c,
  0x7e, 0x00, 0x08, 0x00, 0x10, 0x00, 0x0c, 0x00, 0x14, 0x00, 0x12, 0x00, 0x0a, 0x00, 0x16, 0x00, 0x0e,
  0x7f,
];

describe('the c_25A2 stream compile', () => {
  it('compiles stage 1 byte for byte: the corpus golden stream', () => {
    expect(compileStageStream(1)).toEqual(STAGE_1_STREAM);
  });

  it('compiles a transient-bearing wave with the tmp-buffer pairing', () => {
    // Row 2 wave 1 (ctl 0x82: two transients, first type bit set) with a
    // stub rng that always rolls slot 0: the even down-counter b=2 lands in
    // the lefty half as redmoth 0x7C, the odd b=1 in the righty half as
    // yellowbee 0x3A, and the wave emits FIVE pairs, transients first.
    const stream = compileCaravanStream(D_COMBAT_STG_DAT[2], () => 0);
    // prettier-ignore
    expect(stream.slice(0, 22)).toEqual([
      0x7e,
      0x00, 0x7c, 0xc0, 0x3a,
      0x00, 0x58, 0xc0, 0x28,
      0x00, 0x5a, 0xc0, 0x2a,
      0x00, 0x5c, 0xc0, 0x2c,
      0x00, 0x5e, 0xc0, 0x2e,
      0x7e,
    ]);
  });

  it('injects four transients on the heavy rows, types MSB-first', () => {
    // Row 8 wave 1: ctl 0xA4 = 1010_0100 -> four transients, type bits
    // 1,0,1,0 -> two redmoths (0x40 flag) and two yellowbees.
    const stream = compileCaravanStream(D_COMBAT_STG_DAT[8], createStageRng(9));
    const firstWave = stream.slice(1, stream.indexOf(0x7e, 1));
    expect(firstWave.length).toBe(6 * 4); // 4 pairs of IDs + 2 pairs of transients

    const ids = firstWave.filter((_byte, i) => i % 2 === 1);
    const transients = ids.filter((id) => isTransientId(id & ~0x40));
    expect(transients).toHaveLength(4);
    expect(transients.filter((id) => (id & 0x40) !== 0)).toHaveLength(2);
    // The formation IDs all arrived too, wave 1's eight.
    const formation = ids.filter((id) => !isTransientId(id & ~0x40));
    expect([...formation].sort()).toEqual(
      [0x28, 0x2a, 0x2c, 0x2e, 0x58, 0x5a, 0x5c, 0x5e].sort(),
    );
  });

  it('keeps transient IDs inside the reserved 0x38-0x3E window', () => {
    for (const row of D_COMBAT_STG_DAT) {
      const stream = compileCaravanStream(row, createStageRng(4));
      for (let i = 0; i < stream.length; i += 1) {
        const byte = stream[i];
        if (byte === WAVE_START || byte === STREAM_END) continue;
        const id = stream[i + 1];
        if (isTransientId(id & ~0x40)) {
          expect([0x38, 0x3a, 0x3c, 0x3e]).toContain(id & ~0x40);
        }
        i += 1;
      }
    }
  });

  it('emits five waves and always terminates with 0x7F', () => {
    for (let stage = 1; stage <= 12; stage += 1) {
      const stream = compileStageStream(stage);
      expect(stream[0]).toBe(WAVE_START);
      expect(stream.at(-1)).toBe(STREAM_END);
      expect(stream.filter((byte) => byte === WAVE_START)).toHaveLength(5);
    }
  });

  it('compiles a challenge stage from the full forty-ID roster, no transients', () => {
    const stream = compileStageStream(3);
    const ids = [];
    for (let i = 0; i < stream.length; i += 1) {
      const byte = stream[i];
      if (byte === WAVE_START || byte === STREAM_END) continue;
      ids.push(stream[i + 1]);
      i += 1;
    }
    expect(ids).toHaveLength(40);
    expect(new Set(ids).size).toBe(40);
    // The four bosses ride wave 2 of the bonus round too.
    expect(ids.slice(8, 12)).toEqual([0x30, 0x50, 0x34, 0x52]);
  });

  it('is deterministic per stage seed', () => {
    expect(compileStageStream(4)).toEqual(compileStageStream(4));
    // A reseed only moves the transient placement rolls, never the size.
    const a = compileCaravanStream(D_COMBAT_STG_DAT[8], createStageRng(1));
    const b = compileCaravanStream(D_COMBAT_STG_DAT[8], createStageRng(2));
    expect(a).toHaveLength(b.length);
  });
});

// ---------------------------------------------------------------------------

/** Drive the walker n frames, collecting launches tagged with their frame. */
function runLauncher(state, frames, inputs = {}) {
  const launches = [];
  let completed = false;
  const resets = [];
  for (let i = 0; i < frames; i += 1) {
    const result = stepWaveLauncher(state, inputs);
    state = result.state;
    if (result.launch) launches.push({ frame: state.frame, ...result.launch });
    if (result.completed) completed = true;
    if (result.hitTallyReset) resets.push(state.frame);
  }
  return { state, launches, completed, resets };
}

describe('the f_2916 launcher walk', () => {
  it('holds the whole stream while the two-phase enable is down', () => {
    const { state, launches } = runLauncher(createWaveLauncher(STAGE_1_STREAM), 100, {
      enabled: false,
    });
    expect(launches).toHaveLength(0);
    expect(state.cursor).toBe(0);
    expect(state.wave).toBe(0);
  });

  it('fires gated leaders on the frame & 7 beat and wing-men one frame behind', () => {
    const { launches } = runLauncher(createWaveLauncher(STAGE_1_STREAM), 40, {});
    // Wave 1: gated lefty (0x00) waits for the beat; ungated righty (0xC0)
    // fires the very next frame. Pairs 8 frames apart.
    expect(launches.slice(0, 8).map((l) => l.frame)).toEqual([8, 9, 16, 17, 24, 25, 32, 33]);
    expect(launches[0]).toMatchObject({ pathByte: 0x00, rawObjectId: 0x58, wave: 1 });
    expect(launches[1]).toMatchObject({ pathByte: 0xc0, rawObjectId: 0x28, wave: 1 });
  });

  it('sends the all-gated wave 2 out single file, 8 frames apart', () => {
    const { launches } = runLauncher(createWaveLauncher(STAGE_1_STREAM), 110, {});
    const wave2 = launches.filter((l) => l.wave === 2);
    expect(wave2).toHaveLength(8);
    for (let i = 1; i < wave2.length; i += 1) {
      expect(wave2[i].frame - wave2[i - 1].frame).toBe(8);
    }
    expect(wave2[0].rawObjectId).toBe(0x30); // the first boss
  });

  it('holds a wave marker while launched members still fly, then opens at once', () => {
    let { state } = runLauncher(createWaveLauncher(STAGE_1_STREAM), 33, {});
    expect(state.wave).toBe(1);
    // The sky stays busy: the marker re-arms the 2-tick timer every frame.
    ({ state } = runLauncher(state, 200, { bugsFlying: 8 }));
    expect(state.wave).toBe(1);
    expect(state.timerTicks).toBe(2);
    // On a COMBAT stage the wave opens as soon as the sky is clear -- the
    // timer wait at the marker is the challenge-stage branch only
    // (gg1-3.s:1682-1709).
    const after = runLauncher(state, 2, {});
    expect(after.state.wave).toBe(2);
  });

  it('waits the 2-tick game timer between challenge waves', () => {
    // Fresh launcher, challenge stage: stg_init_env seeded the timer to 2,
    // so the FIRST wave opens only after ~60 frames at 2 Hz.
    const opening = runLauncher(createWaveLauncher(compileStageStream(3)), 59, {
      challenge: true,
    });
    expect(opening.state.wave).toBe(0);
    expect(opening.resets.length).toBeGreaterThan(0); // tally reload at tick 1
    const opened = runLauncher(opening.state, 2, { challenge: true });
    expect(opened.state.wave).toBe(1);
  });

  it('respects the 12-slot in-flight cap', () => {
    const { state } = runLauncher(createWaveLauncher(STAGE_1_STREAM), 10, {});
    const cursor = state.cursor;
    const capped = runLauncher(state, 100, { inFlight: IN_FLIGHT_CAP });
    expect(capped.launches).toHaveLength(0);
    expect(capped.state.cursor).toBe(cursor);
    const freed = runLauncher(capped.state, 16, { inFlight: IN_FLIGHT_CAP - 1 });
    expect(freed.launches.length).toBeGreaterThan(0);
  });

  it('completes at the 0x7F only once the sky is clear', () => {
    // Step until the fortieth launch leaves the cursor on the end token.
    let state = createWaveLauncher(STAGE_1_STREAM);
    let count = 0;
    for (let i = 0; i < 500 && count < 40; i += 1) {
      const result = stepWaveLauncher(state, {});
      state = result.state;
      if (result.launch) count += 1;
    }
    expect(count).toBe(40);
    expect(state.stream[state.cursor]).toBe(STREAM_END);

    const held = runLauncher(state, 50, { bugsFlying: 3 });
    expect(held.completed).toBe(false);
    const done = runLauncher(held.state, 1, {});
    expect(done.completed).toBe(true);
    expect(done.state.done).toBe(true);
    // A finished launcher stays finished.
    expect(stepWaveLauncher(done.state, {}).launch).toBeUndefined();
  });

  it('launches all forty of stage 1 in db_attk_wav_IDs order', () => {
    const { launches } = runLauncher(createWaveLauncher(STAGE_1_STREAM), 400, {});
    expect(launches).toHaveLength(40);
    expect(launches.map((l) => l.rawObjectId).slice(0, 8)).toEqual([
      0x58, 0x28, 0x5a, 0x2a, 0x5c, 0x2c, 0x5e, 0x2e,
    ]);
    expect(launches.filter((l) => l.wave === 2).map((l) => l.rawObjectId)).toEqual([
      0x30, 0x50, 0x34, 0x52, 0x36, 0x54, 0x32, 0x56,
    ]);
  });
});

describe('launch decoding (l_2974 / l_29B3)', () => {
  it('remaps raw transient IDs 0x78-0x7E down to the 0x38 window', () => {
    const info = decodeLaunch({ pathByte: 0x00, rawObjectId: 0x7c, wave: 1 });
    expect(info.objectId).toBe(0x3c);
    expect(info.transient).toBe(true);
    expect(info.transientKind).toBe('redmoth');
  });

  it('types a plain transient yellowbee, and boss on wave 2', () => {
    expect(decodeLaunch({ pathByte: 0x00, rawObjectId: 0x3a, wave: 1 }).transientKind).toBe(
      'yellowbee',
    );
    expect(decodeLaunch({ pathByte: 0x00, rawObjectId: 0x3a, wave: 2 }).transientKind).toBe(
      'boss',
    );
    expect(decodeLaunch({ pathByte: 0x00, rawObjectId: 0x7a, wave: 2 }).transientKind).toBe(
      'redmoth',
    );
  });

  it('never arms a transient', () => {
    const info = decodeLaunch(
      { pathByte: 0x00, rawObjectId: 0x3a, wave: 1 },
      { flyInBombMask: 0x03 },
    );
    expect(info.bombMask).toBe(0);
  });

  it('stacks the header mask on the per-creature d_2908 gate', () => {
    // 0x5A is capable, 0x58 is not: same wave, same mask, different arms.
    const armed = decodeLaunch(
      { pathByte: 0x00, rawObjectId: 0x5a, wave: 1 },
      { flyInBombMask: 0x01 },
    );
    const silent = decodeLaunch(
      { pathByte: 0x00, rawObjectId: 0x58, wave: 1 },
      { flyInBombMask: 0x01 },
    );
    expect(armed.bombMask).toBe(0x01);
    expect(silent.bombMask).toBe(0);
  });

  it('keeps stage 1 wholly silent through the zero mask', () => {
    for (const id of [0x58, 0x5a, 0x28, 0x30, 0x36]) {
      const info = decodeLaunch(
        { pathByte: 0x00, rawObjectId: id, wave: 1 },
        { flyInBombMask: caravanHeaderFor(1).flyInBombMask },
      );
      expect(info.bombMask).toBe(0);
    }
  });

  it('carries the path byte fields through', () => {
    const info = decodeLaunch({ pathByte: 0xc1, rawObjectId: 0x30, wave: 2 });
    expect(info.pathIndex).toBe(1);
    expect(info.member).toBe(1);
    expect(info.immediate).toBe(true);
    expect(info.bombCounterInit).toBe(0x44);
    expect(info.transient).toBe(false);
  });
});

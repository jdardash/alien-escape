import { describe, expect, it } from 'vitest';

import {
  DIFFICULTY_PARAMS,
  DIFFICULTY_STAGE_ROWS,
  MAX_BOMBERS_RAMP_THRESHOLD,
  STAGE_TIMER_START,
  STAGE_TIMER_TICK_FRAMES,
  adjustedStage,
  bomberConfig,
  difficultyRow,
  difficultyRowIndex,
  reloadByBugCount,
  reloadByStageTime,
  stageParms,
} from '../src/systems/difficulty.js';
import {
  D_08CD_RED_RELOAD,
  D_08EB_YELLOW_RELOAD,
  D_0929_OFFSET,
} from '../src/systems/difficultyData.js';
import { DifficultyRank } from '../src/systems/caravans.js';

describe('the stage adjust (new_stage.s:31-35)', () => {
  it('maps stage 1 to row 0 and stage 26 to row 25', () => {
    expect(difficultyRowIndex(1)).toBe(0);
    expect(difficultyRowIndex(26)).toBe(25);
  });

  // The Z80 is `cp #0x1B / jr c`: the loop runs while the stage is AT OR
  // ABOVE 27, so stage 27 itself is adjusted and the repeating set is stages
  // 23-26 -- rows 22-25, one of them the challenge row.
  it('cycles the last four rows past stage 26 rather than clamping', () => {
    expect(adjustedStage(27)).toBe(23);
    expect(adjustedStage(28)).toBe(24);
    expect(adjustedStage(29)).toBe(25);
    expect(adjustedStage(30)).toBe(26);
    expect(adjustedStage(31)).toBe(23);

    // The pin that distinguishes a cycle from a clamp: stage 28 does NOT
    // play the last row.
    expect(difficultyRowIndex(28)).toBe(23);
    expect(difficultyRowIndex(28)).not.toBe(DIFFICULTY_STAGE_ROWS - 1);
  });

  it('keeps every challenge stage on the challenge row forever', () => {
    // Stages 27, 31, 35... are challenge stages and must land on row 22,
    // the cycled challenge row -- the property a clamp would break.
    for (const stage of [27, 31, 35, 51, 255]) {
      expect((stage - 3) % 4).toBe(0);
      expect(difficultyRowIndex(stage)).toBe(22);
    }
  });

  it('reaches a fixed point for any stage number', () => {
    for (let stage = 1; stage <= 300; stage += 1) {
      const adjusted = adjustedStage(stage);
      expect(adjusted).toBeGreaterThanOrEqual(1);
      expect(adjusted).toBeLessThanOrEqual(26);
      // Stages inside the table are untouched.
      if (stage <= 26) expect(adjusted).toBe(stage);
    }
  });
});

describe('the nibble decode (new_stage.s:59-98)', () => {
  it('splits each packed byte high nibble first', () => {
    // Stage 1 at the factory rank: sub-table 0 row `00 00 22 C6 00`.
    expect(stageParms(1, DifficultyRank.A)).toEqual([0, 0, 0, 0, 2, 2, 0xc, 6, 0, 0, 0]);
  });

  it('decodes a mid-table row with every nibble in play', () => {
    // Stage 5 rank A: sub-table 0 row `11 23 23 98 00`.
    expect(stageParms(5, DifficultyRank.A)).toEqual([1, 1, 2, 3, 2, 3, 9, 8, 0, 0, 0x0a]);
  });

  it('carries eleven parameters: ten packed plus the computed gate', () => {
    expect(stageParms(4)).toHaveLength(DIFFICULTY_PARAMS);
    expect(stageParms(4)[10]).toBe(0x0a);
    expect(stageParms(3)[10]).toBe(0);
  });

  it('names the fields the scene and scheduler read', () => {
    const row = difficultyRow(5, DifficultyRank.A);
    expect(row.bombDropRow).toBe(1);
    expect(row.bossReloadRow).toBe(1);
    expect(row.redReloadRow).toBe(2);
    expect(row.yellowReloadRow).toBe(3);
    expect(row.maxBombers).toBe(2);
    expect(row.maxBombersRamped).toBe(3);
    expect(row.beamFramesPerStrip).toBe(9);
    expect(row.continuousBombingThreshold).toBe(8);
    expect(row.stage8PathSwitch).toBe(false);
    expect(row.stage12BombingSwitch).toBe(false);
    expect(row.cloneAttackGate).toBe(0x0a);
    expect(row.parms).toEqual(stageParms(5, DifficultyRank.A));
  });

  it('flips the stage-8 and stage-12 switches where the table does', () => {
    expect(difficultyRow(7, DifficultyRank.A).stage8PathSwitch).toBe(false);
    expect(difficultyRow(8, DifficultyRank.A).stage8PathSwitch).toBe(true);
    expect(difficultyRow(8, DifficultyRank.A).stage12BombingSwitch).toBe(false);
    expect(difficultyRow(12, DifficultyRank.A).stage12BombingSwitch).toBe(true);
  });

  it('keeps the tractor beam armed from stage 1 at every rank', () => {
    // parms[6] is the beam's animation speed, not an enable: 0xC on the
    // opening row of all four sub-tables. Capture is never stage-gated.
    for (const rank of [0, 1, 2, 3]) {
      expect(difficultyRow(1, rank).beamFramesPerStrip).toBe(0xc);
    }
  });

  it('routes the logical ranks through the machine rotation', () => {
    // Rank A plays sub-table 0 (`00 00 22 C6 00`), rank B sub-table 1
    // (`00 00 12 C6 00`), rank D sub-table 3 (`72 99 68 3E 11` on row 25).
    expect(stageParms(1, DifficultyRank.A)[4]).toBe(2);
    expect(stageParms(1, DifficultyRank.B)[4]).toBe(1);
    expect(stageParms(26, DifficultyRank.D)).toEqual([7, 2, 9, 9, 6, 8, 3, 0xe, 1, 1, 0x0a]);
  });

  it('lands a corrupt rank on the factory row', () => {
    expect(stageParms(5, 'garbage')).toEqual(stageParms(5, DifficultyRank.A));
    expect(stageParms(5, 99)).toEqual(stageParms(5, DifficultyRank.D));
  });
});

describe('c_08AD: the stage-time reload column (game_ctrl.s:1451-1468)', () => {
  it('selects the column by how far the 2 Hz timer has run down', () => {
    // Row 0 of d_08CD is 09 07 05: early stage, past ~40 s, past ~60 s.
    expect(reloadByStageTime(D_08CD_RED_RELOAD, 0, STAGE_TIMER_START)).toBe(9);
    expect(reloadByStageTime(D_08CD_RED_RELOAD, 0, 0x28)).toBe(9);
    expect(reloadByStageTime(D_08CD_RED_RELOAD, 0, 0x27)).toBe(7);
    expect(reloadByStageTime(D_08CD_RED_RELOAD, 0, 1)).toBe(7);
    expect(reloadByStageTime(D_08CD_RED_RELOAD, 0, 0)).toBe(5);
  });

  it('reads the yellow table by its own row parameter', () => {
    expect(reloadByStageTime(D_08EB_YELLOW_RELOAD, 9, STAGE_TIMER_START)).toBe(1);
    expect(reloadByStageTime(D_08EB_YELLOW_RELOAD, 2, 0)).toBe(3);
  });
});

describe('c_08BE: the bug-count column (game_ctrl.s:1482-1499)', () => {
  it('selects the column as bugs divided by ten', () => {
    // d_0909 row 0 is 03 03 01 01.
    expect(reloadByBugCount(0, 0, 0)).toBe(0x03);
    expect(reloadByBugCount(0, 0, 9)).toBe(0x03);
    expect(reloadByBugCount(0, 0, 19)).toBe(0x03);
    expect(reloadByBugCount(0, 0, 20)).toBe(0x01);
    expect(reloadByBugCount(0, 0, 39)).toBe(0x01);
  });

  it('lets a full board overflow into the next row, as the ROM does', () => {
    // 40 bugs is column 4: one byte past the row. Row 0 reads row 1's first
    // byte; d_0909's last row reads d_0929's first byte.
    expect(reloadByBugCount(0, 0, 40)).toBe(0x03);
    expect(reloadByBugCount(0, 7, 40)).toBe(0x06);
  });

  it('reads the boss rows from the 0x20 offset', () => {
    // d_0929 row 0 is 06 0A 0F 0F.
    expect(reloadByBugCount(D_0929_OFFSET, 0, 5)).toBe(0x06);
    expect(reloadByBugCount(D_0929_OFFSET, 0, 25)).toBe(0x0f);
    expect(reloadByBugCount(D_0929_OFFSET, 2, 39)).toBe(0x0a);
  });

  it('serves the ROM-neighbour byte for the one index past everything', () => {
    // d_0929's last row at a full board: flat index 44, the opcode byte
    // after the table.
    expect(reloadByBugCount(D_0929_OFFSET, 2, 40)).toBe(0x3a);
  });
});

describe('f_0857: the per-frame bomber config (game_ctrl.s:1386-1438)', () => {
  const parms = stageParms(5, DifficultyRank.A); // [1,1,2,3,2,3,9,8,0,0,10]

  it('ramps the attacker ceiling once the stage timer crosses 30 s', () => {
    expect(bomberConfig(parms, { stageTimer: MAX_BOMBERS_RAMP_THRESHOLD }).maxBombers).toBe(2);
    expect(bomberConfig(parms, { stageTimer: MAX_BOMBERS_RAMP_THRESHOLD - 1 }).maxBombers).toBe(3);
  });

  it('computes the bomb mask from the live bug count', () => {
    // parms[0] = 1: d_0909 row 1 is 03 03 03 01; a full board overflows
    // into row 2's first byte, 0x07.
    expect(bomberConfig(parms, { aliveBugs: 40 }).bombFlags).toBe(0x07);
    expect(bomberConfig(parms, { aliveBugs: 30 }).bombFlags).toBe(0x01);
    expect(bomberConfig(parms, { aliveBugs: 5 }).bombFlags).toBe(0x03);
  });

  it('tightens the reloads as the board thins and the stage drags', () => {
    const early = bomberConfig(parms, { aliveBugs: 40, stageTimer: STAGE_TIMER_START });
    // boss: d_0929 row 1 col 4 overflows to row 2's first byte 0x04;
    // red: d_08CD row 2 col 0; yellow: d_08EB row 3 col 0.
    expect(early.reloads).toEqual({ boss: 0x04, goei: 0x07, zako: 0x04 });

    const late = bomberConfig(parms, { aliveBugs: 8, stageTimer: 0 });
    // boss: d_0929 row 1 col 0; red row 2 col 2; yellow row 3 col 2.
    expect(late.reloads).toEqual({ boss: 0x04, goei: 0x04, zako: 0x02 });
  });

  it('pins every reload to two ticks in continuous bombing', () => {
    const cfg = bomberConfig(parms, { aliveBugs: 3, continuousBombing: true });
    expect(cfg.reloads).toEqual({ boss: 2, goei: 2, zako: 2 });
    // The mask is still computed -- divers keep re-arming through it.
    expect(cfg.bombFlags).toBe(0x03);
  });
});

describe('the stage timer constants', () => {
  it('runs from 0x78 at ~2 Hz', () => {
    expect(STAGE_TIMER_START).toBe(0x78);
    expect(STAGE_TIMER_TICK_FRAMES).toBe(30);
  });
});

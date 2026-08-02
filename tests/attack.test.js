import { describe, expect, it } from 'vitest';

import {
  ATTACK_TYPES,
  BOMB_ARM_FRAMES,
  BOMB_DROP_MIN_Y,
  BOMB_SPACING_FRAMES,
  BONUS_BEE_FLASH_FRAMES,
  BONUS_BEE_FLASH_PERIOD_FRAMES,
  BONUS_BEE_TIMER_START,
  LAUNCH_POOL_SLOTS,
  TICK_FRAMES,
  advanceScheduler,
  bombAimVx,
  bonusBeeFlashOn,
  bonusBeeGateOpen,
  createAttackScheduler,
  nextBombDrop,
} from '../src/systems/attack.js';
import { difficultyRow } from '../src/systems/difficulty.js';
import { DifficultyRank } from '../src/systems/caravans.js';
import { FRAME_MS } from '../src/systems/pathcode.js';

/** Stage 1 at the factory rank: parms [0,0,0,0,2,2,12,6,0,0,0]. */
const row = difficultyRow(1, DifficultyRank.A);

/** A live full board, the context most tests want. */
const board = { aliveEnemies: 40, escortsAvailable: 2 };

/**
 * Run the scheduler one hardware frame per advance, the way the scene does,
 * collecting everything it emits.
 */
function run(state, frames, context = {}) {
  let current = state;
  const launches = [];
  for (let i = 0; i < frames; i += 1) {
    const result = advanceScheduler(current, FRAME_MS, { ...board, ...context });
    current = result.state;
    launches.push(...result.launches);
  }
  return { state: current, launches };
}

describe('the initial timers (new_stage.s:100-103)', () => {
  it('starts every stage at boss 0x16, red 2, yellow 2 ticks', () => {
    const state = createAttackScheduler(row);
    expect(state.timers).toEqual({ boss: 0x16, goei: 2, zako: 2 });
  });

  it('launches nothing before the first tick can expire a timer', () => {
    expect(run(createAttackScheduler(row), 31).launches).toEqual([]);
  });

  it('sends the red first, the yellow right behind, the boss much later', () => {
    const { launches } = run(createAttackScheduler(row), 48);
    expect(launches.map((launch) => launch.type)).toEqual(['goei', 'zako']);
  });
});

describe('the djnz walk (gg1-2_fx.s:927-953)', () => {
  it('stops decrementing behind the timer it handled', () => {
    // Tick 1 decrements all three; tick 2 expires the red, so the yellow
    // keeps its 1 -- the single-handling that keeps types fair.
    const { state } = run(createAttackScheduler(row), 2 * TICK_FRAMES);
    expect(state.timers.zako).toBe(1);
    // The red reloaded from this frame's f_0857 value: d_08CD row 0 col 0.
    expect(state.timers.goei).toBe(9);
  });

  it('handles at most one type per tick', () => {
    const state = { ...createAttackScheduler(row), timers: { boss: 5, goei: 1, zako: 1 } };
    const { launches, state: after } = run(state, TICK_FRAMES);
    expect(launches).toEqual([{ type: 'goei', role: 'attack' }]);
    // The yellow's expiry waits for the next tick untouched.
    expect(after.timers.zako).toBe(1);
    expect(after.timers.boss).toBe(4);
  });

  it('burns a full reload on an expiry with no candidate', () => {
    const { launches, state } = run(createAttackScheduler(row), 2 * TICK_FRAMES, {
      availableTypes: ['boss'],
    });
    expect(launches).toEqual([]);
    // Reload happened BEFORE dispatch found nobody: not held at zero.
    expect(state.timers.goei).toBe(9);
  });
});

describe('the cap gate (gg1-2_fx.s:935-945)', () => {
  it('sets the expired timer back to one and freezes the rest', () => {
    const full = { activeBombers: row.maxBombers };
    const { launches, state } = run(createAttackScheduler(row), 2 * TICK_FRAMES, full);
    expect(launches).toEqual([]);
    expect(state.timers.goei).toBe(1);
    expect(state.timers.zako).toBe(1);

    // Re-checked every tick while the air stays full.
    const later = run(state, TICK_FRAMES, full);
    expect(later.launches).toEqual([]);
    expect(later.state.timers.goei).toBe(1);

    // The moment it clears, the held type launches.
    const freed = run(later.state, TICK_FRAMES, { activeBombers: 0 });
    expect(freed.launches).toEqual([{ type: 'goei', role: 'attack' }]);
  });
});

describe('the launch pool (gg1-2_fx.s:872-921)', () => {
  it('queues a boss escort sortie and drains one launch per frame', () => {
    // The boss timer runs 22 ticks; on that tick the sortie is queued, and
    // the pool emits leader then wingmen on the following frames.
    const queued = run(createAttackScheduler(row), 22 * TICK_FRAMES);
    expect(queued.state.pool.filter(Boolean)).toHaveLength(3);

    const drained = run(queued.state, 3);
    expect(drained.launches).toEqual([
      { type: 'boss', role: 'escortLeader', wingmen: 2 },
      { type: 'goei', role: 'escortWingman' },
      { type: 'goei', role: 'escortWingman' },
    ]);
    expect(drained.state.pool).toEqual(new Array(LAUNCH_POOL_SLOTS).fill(null));
  });

  it('bypasses both the tick gate and the cap while draining', () => {
    const queued = run(createAttackScheduler(row), 22 * TICK_FRAMES);
    // Frames 353-355 are not tick frames, and the air is over-full: the
    // squad still peels off, one per frame.
    const drained = run(queued.state, 3, { activeBombers: 10 });
    expect(drained.launches).toHaveLength(3);
  });

  it('takes only the escorts the formation can offer', () => {
    const queued = run(createAttackScheduler(row), 22 * TICK_FRAMES, { escortsAvailable: 1 });
    const drained = run(queued.state, 2);
    expect(drained.launches).toEqual([
      { type: 'boss', role: 'escortLeader', wingmen: 1 },
      { type: 'goei', role: 'escortWingman' },
    ]);
  });
});

describe('the boss mission alternation (gg1-2_fx.s:1013-1043)', () => {
  /** A scheduler one tick from a boss dispatch. */
  function bossReady(overrides = {}) {
    return { ...createAttackScheduler(row), timers: { boss: 1, goei: 9, zako: 9 }, ...overrides };
  }

  it('sends the first boss as an escort sortie and the second to capture', () => {
    const first = run(bossReady(), TICK_FRAMES + 1);
    expect(first.state.bossToggle).toBe(1);
    expect(first.launches[0]).toEqual({ type: 'boss', role: 'escortLeader', wingmen: 2 });

    const second = run(bossReady({ bossToggle: 1 }), TICK_FRAMES + 1);
    expect(second.state.bossToggle).toBe(2);
    expect(second.launches).toEqual([{ type: 'boss', role: 'capture', wingmen: 0 }]);
  });

  it('holds the toggle while a capture is in progress', () => {
    // The cflag: one capture at a time, so a boss launched mid-capture flies
    // an escort sortie and the alternation waits.
    const held = run(bossReady({ bossToggle: 1 }), TICK_FRAMES + 1, { captureActive: true });
    expect(held.state.bossToggle).toBe(1);
    expect(held.launches[0].role).toBe('escortLeader');
  });
});

describe('continuous bombing (f_0857 / gg1-5.s:480-489)', () => {
  it('arms when the board thins below the threshold with fire active', () => {
    const result = advanceScheduler(createAttackScheduler(row), FRAME_MS, {
      aliveEnemies: 3,
      playerFireActive: true,
    });
    expect(result.continuousBombing).toBe(true);
    expect(result.state.reloads).toEqual({ boss: 2, goei: 2, zako: 2 });
  });

  it('never arms without the player-fire task', () => {
    const result = advanceScheduler(createAttackScheduler(row), FRAME_MS, {
      aliveEnemies: 3,
      playerFireActive: false,
    });
    expect(result.continuousBombing).toBe(false);
  });

  it('disarms the moment the board refills', () => {
    const thinned = run(createAttackScheduler(row), 1, { aliveEnemies: 3 });
    const refilled = run(thinned.state, 1, { aliveEnemies: 40 });
    expect(refilled.state.continuousBombing).toBe(false);
    expect(refilled.state.reloads.goei).toBe(9);
  });
});

describe('the dispatch guard (gg1-2_fx.s:858-869)', () => {
  it('holds the timers and the pool while the fire task is down', () => {
    const { launches, state } = run(createAttackScheduler(row), 4 * TICK_FRAMES, {
      playerFireActive: false,
    });
    expect(launches).toEqual([]);
    expect(state.timers).toEqual({ boss: 0x16, goei: 2, zako: 2 });
  });
});

describe('the bomb mask exposure', () => {
  it('recomputes the d_0909 mask from the live board every frame', () => {
    const full = advanceScheduler(createAttackScheduler(row), FRAME_MS, { aliveEnemies: 40 });
    expect(full.bombFlags).toBe(0x03);

    const thinner = advanceScheduler(createAttackScheduler(row), FRAME_MS, { aliveEnemies: 35 });
    expect(thinner.bombFlags).toBe(0x01);
  });
});

describe('the bonus-bee arming (f_1A80, gg1-2_fx.s:671-833)', () => {
  it('keeps the ROM counter constants', () => {
    expect(BONUS_BEE_TIMER_START).toBe(0xc0);
    // 0xC0 counting up to the 0x100 wrap: 64 frames from arm to launch.
    expect(BONUS_BEE_FLASH_FRAMES).toBe(64);
    // Bit 4 of the counter: the colour alternates every 16 frames, ~4 Hz.
    expect(BONUS_BEE_FLASH_PERIOD_FRAMES).toBe(16);
  });

  it('opens the gate only when live bugs drop below parms[0x0A]', () => {
    const parms = [...row.parms];
    parms[10] = 10;
    expect(bonusBeeGateOpen(parms, 40)).toBe(false);
    expect(bonusBeeGateOpen(parms, 10)).toBe(false);
    expect(bonusBeeGateOpen(parms, 9)).toBe(true);
    expect(bonusBeeGateOpen(parms, 1)).toBe(true);
  });

  it('never opens where the parameter is zero -- stages 1-3 and challenges', () => {
    // Stage 1's own row carries parms[10] = 0.
    expect(row.parms[10]).toBe(0);
    expect(bonusBeeGateOpen(row.parms, 0)).toBe(false);
    expect(bonusBeeGateOpen(row.parms, 5)).toBe(false);
  });

  it('flashes on bit 4 of the counter: 16 off, 16 on, 16 off, 16 on', () => {
    // The counter starts at 0xC0, so the first sixteen frames show the
    // bee's own colour and the flash lands on frames 16-31 and 48-63.
    for (let frame = 0; frame < BONUS_BEE_FLASH_FRAMES; frame += 1) {
      const expected = ((0xc0 + frame) & 0x10) !== 0;
      expect(bonusBeeFlashOn(frame)).toBe(expected);
    }
    expect(bonusBeeFlashOn(0)).toBe(false);
    expect(bonusBeeFlashOn(16)).toBe(true);
    expect(bonusBeeFlashOn(32)).toBe(false);
    expect(bonusBeeFlashOn(48)).toBe(true);
  });
});

describe('the bombing model (j_108A / case_0DF5)', () => {
  it('keeps the ROM arming constants', () => {
    expect(BOMB_ARM_FRAMES).toBe(0x1e);
    expect(BOMB_SPACING_FRAMES).toBe(0x14);
    expect(BOMB_DROP_MIN_Y).toBe(120);
  });

  it('freezes the aim as clamp(+-3, 5 dx/dy)', () => {
    expect(bombAimVx(100, 100)).toBe(3);
    expect(bombAimVx(-500, 100)).toBe(-3);
    expect(bombAimVx(10, 100)).toBeCloseTo(0.5, 9);
    expect(bombAimVx(10, 0)).toBe(0);
    expect(bombAimVx(10, -50)).toBe(0);
  });

  it('shifts the mask per expiry and holds a set bit until low', () => {
    expect(nextBombDrop(0, true)).toEqual({ mask: 0, drop: false });
    expect(nextBombDrop(0b10, true)).toEqual({ mask: 0b01, drop: false });
    expect(nextBombDrop(0b11, false)).toEqual({ mask: 0b11, drop: false });
    expect(nextBombDrop(0b11, true)).toEqual({ mask: 0b01, drop: true });
    expect(nextBombDrop(0b01, true)).toEqual({ mask: 0b00, drop: true });
  });
});

describe('shape', () => {
  it('walks the three types in the djnz order', () => {
    expect(ATTACK_TYPES).toEqual(['boss', 'goei', 'zako']);
    expect(TICK_FRAMES).toBe(16);
  });

  it('does not mutate the state it is given', () => {
    const state = createAttackScheduler(row);
    const before = JSON.stringify(state);
    advanceScheduler(state, 1000, board);
    expect(JSON.stringify(state)).toBe(before);
  });
});

describe('the no-fire bug', () => {
  it('needs the operator switch, a nearly empty board, and fifteen minutes', async () => {
    const { NO_FIRE_TRIGGER_MS, NO_FIRE_MAX_ENEMIES, advanceNoFire, createNoFireState } =
      await import('../src/systems/attack.js');

    let state = createNoFireState();
    expect(NO_FIRE_MAX_ENEMIES).toBe(2);

    // A full board never accrues.
    state = advanceNoFire(state, NO_FIRE_TRIGGER_MS * 2, { enabled: true, enemiesRemaining: 40 });
    expect(state.triggered).toBe(false);
    expect(state.accruedMs).toBe(0);

    // A nearly empty board accrues but does not trigger early.
    state = advanceNoFire(state, NO_FIRE_TRIGGER_MS - 1000, { enabled: true, enemiesRemaining: 2 });
    expect(state.triggered).toBe(false);

    // Crossing the threshold trips it for good.
    state = advanceNoFire(state, 2000, { enabled: true, enemiesRemaining: 2 });
    expect(state.triggered).toBe(true);
    state = advanceNoFire(state, 1, { enabled: true, enemiesRemaining: 40 });
    expect(state.triggered).toBe(true);
  });

  it('resets the accrual when the board fills back up', async () => {
    const { NO_FIRE_TRIGGER_MS, advanceNoFire, createNoFireState } =
      await import('../src/systems/attack.js');

    let state = createNoFireState();
    state = advanceNoFire(state, NO_FIRE_TRIGGER_MS - 1, { enabled: true, enemiesRemaining: 1 });
    state = advanceNoFire(state, 16, { enabled: true, enemiesRemaining: 40 });
    expect(state.accruedMs).toBe(0);
    state = advanceNoFire(state, NO_FIRE_TRIGGER_MS - 1, { enabled: true, enemiesRemaining: 1 });
    expect(state.triggered).toBe(false);
  });

  it('never accrues with the switch off, which is the factory setting', async () => {
    const { NO_FIRE_TRIGGER_MS, advanceNoFire, createNoFireState } =
      await import('../src/systems/attack.js');

    let state = createNoFireState();
    state = advanceNoFire(state, NO_FIRE_TRIGGER_MS * 3, { enabled: false, enemiesRemaining: 1 });
    expect(state.triggered).toBe(false);
    expect(state.accruedMs).toBe(0);
  });
});

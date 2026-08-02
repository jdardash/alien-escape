/**
 * The attack scheduler, restructured as the ROM's `f_1B65`
 * (gg1-2_fx.s:857-970).
 *
 * The machine, per hardware frame:
 *
 * 1. A 4-slot launch pool is checked FIRST, every frame. A boss sortie --
 *    leader plus up to two wingmen -- is queued into it, and it drains one
 *    launch per frame, bypassing both the 16-frame gate and the concurrency
 *    cap. That is why a squad peels off staggered by a frame each and why
 *    other dispatch visibly pauses while it does.
 * 2. Per-type dispatch runs only every 16th frame. The three countdown
 *    timers are walked in the fixed order boss, red (Goei), yellow (Zako),
 *    each decremented in turn until ONE hits zero; that one is handled and
 *    the walk stops, so types after it keep their values this tick. The
 *    corpus documents that flattening this into decrement-all starves the
 *    yellow timer.
 * 3. The handled type first passes the cap gate: if as many attackers are in
 *    the air as the stage allows, its timer is set back to 1 -- re-checked
 *    next tick, the other types frozen behind it.
 * 4. Otherwise the timer reloads BEFORE dispatch, from the reload values
 *    `f_0857` recomputed this frame -- so an expiry with nobody left to send
 *    still burns a full reload cycle. At most one launch per tick.
 *
 * A boss dispatch alternates missions: every other one is a solo capture
 * dive, the rest are escort sorties (gg1-2_fx.s:1013-1120). The alternation
 * state is exposed for the capture machine (Task 5) to consume.
 *
 * When the board thins below the stage's threshold while the player can
 * still fire, continuous bombing arms: every reload pins to 2 ticks and
 * divers loop their attack passes instead of homing -- the `continuousBombing`
 * flag on the state and result is for the flight layer.
 *
 * Pure and immutable in the house style: `advanceScheduler` returns a new
 * state, so the game loop and the tests exercise identical code.
 *
 * Source: docs/rom-research/attack-difficulty.md sections 1.5, 1.6, 2, 3.
 */

import { FRAME_MS } from './pathcode.js';
import { INITIAL_LAUNCH_TICKS } from './difficultyData.js';
import { STAGE_TIMER_START, STAGE_TIMER_TICK_FRAMES, bomberConfig } from './difficulty.js';

/** The djnz walk order: boss first, then red (Goei), then yellow (Zako). */
export const ATTACK_TYPES = ['boss', 'goei', 'zako'];

/** Frames per dispatch tick: `f_1B65` runs dispatch on `frame & 0x0F == 0`. */
export const TICK_FRAMES = 16;

/** Slots in the launch pool (`bmbr_boss_pool`, 4 x 3 bytes in the ROM). */
export const LAUNCH_POOL_SLOTS = 4;

/**
 * Which Zako launch becomes the transform pull.
 *
 * Authored, interim: the ROM arms the trio through `f_1A80` when the live
 * count drops below `parms[10]`, once per stage -- that machine is Task 5's.
 * Until it lands, the pull stays on the launch schedule so the trio keeps
 * appearing, riding the rewritten scheduler's Zako dispatches.
 */
export const TRANSFORM_EVERY_NTH_ZAKO = 6;

// --------------------------------------------------------------- bombing

/**
 * The bomb model, as `j_108A` arms it and `case_0DF5` releases it.
 *
 * Every diver is armed AT LAUNCH: a 30-frame countdown (gg1-2.s:314) and the
 * drop bitmask `f_0857` computed this frame from d_0909. Each time the
 * countdown expires it reloads to 20 frames (`b_92E2[0]`, gg1-5.s:2345+) and
 * the mask shifts right one bit; the shifted-out bit is a drop, released
 * only when the bomber is low in the field and the player-fire task is
 * active. The aim is computed once at the drop and frozen.
 */
export const BOMB_ARM_FRAMES = 0x1e;

/** Frames between two bombs of one attacker's string. */
export const BOMB_SPACING_FRAMES = 0x14;

/**
 * How low a bomber must be to release, in ROM canvas Y (of 288).
 *
 * The Z80 gate is sprite_Y >= 152, which is canvas centre-Y >= 120; scenes
 * multiply by their screen scale. Value per the corpus's verified
 * `bombUpdate.js` port.
 */
export const BOMB_DROP_MIN_Y = 120;

/** A bomb falls 2 and 3 px on alternating frames: 2.5 px/frame average. */
export const BOMB_FALL_PER_FRAME = 2.5;

/** The aim slope gain: 2x the perfect intercept, the deliberate over-aim. */
export const BOMB_AIM_GAIN = 5;

/** The aim clamp, in ROM canvas px/frame. */
export const BOMB_AIM_CAP = 3;

/**
 * The frozen aimed shot (gg1-5.s:2402-2457 via the corpus's canvas form).
 *
 * `vx = clamp(+-3, 5 * dx/dy)` in ROM canvas px/frame, computed once at the
 * drop from the player's offset and never updated. The gain is twice the
 * perfect intercept, so the bomb crosses the player's column partway down;
 * dodging works because the vector is frozen where the player was.
 */
export function bombAimVx(dx, dy) {
  if (dy <= 0) return 0;
  return Math.max(-BOMB_AIM_CAP, Math.min(BOMB_AIM_CAP, (BOMB_AIM_GAIN * dx) / dy));
}

/**
 * One expiry of a bomber's drop countdown: shift the mask, decide the drop.
 *
 * The shifted-out bit is the drop -- but a set bit is HELD while the bomber
 * is still high, the corpus's own compensation for a replica descent slower
 * than the Z80's (which consumes bits regardless of height and relies on the
 * dive being low by the first expiry). Clear bits are consumed immediately.
 */
export function nextBombDrop(mask, isLow) {
  if (mask === 0) return { mask: 0, drop: false };
  if ((mask & 1) === 0) return { mask: mask >>> 1, drop: false };
  if (!isLow) return { mask, drop: false };
  return { mask: mask >>> 1, drop: true };
}

// --------------------------------------------------------- the scheduler

/** A scheduler for one stage, from that stage's decoded difficulty row. */
export function createAttackScheduler(row) {
  return {
    /** The stage's eleven decoded parameters, fed to `f_0857` every frame. */
    parms: [...row.parms],
    /** Hardware frames run so far, and the ms remainder toward the next. */
    frame: 0,
    frameAccMs: 0,
    /** Per-type countdowns in 16-frame ticks; constants for every stage. */
    timers: { ...INITIAL_LAUNCH_TICKS },
    /** What `f_0857` computed this frame. */
    reloads: { ...INITIAL_LAUNCH_TICKS },
    bombFlags: 0,
    maxBombers: row.parms[4],
    /** The 2 Hz stage timer the reload columns and the ramp read. */
    stageTimer: STAGE_TIMER_START,
    /** The 4-slot launch pool; drains one per frame, bypassing the gates. */
    pool: new Array(LAUNCH_POOL_SLOTS).fill(null),
    /**
     * The boss mission alternation (`_b_bmbr_boss_wingm`): advanced on each
     * boss dispatch while no capture is in progress; even lands a solo
     * capture dive, odd an escort sortie. Task 5's capture machine reads it.
     */
    bossToggle: 0,
    /** Rapid-fire endgame: live bugs below threshold with fire active. */
    continuousBombing: false,
    /** Zako dispatches so far, for the interim transform divisor. */
    zakoLaunches: 0,
  };
}

/** Deep-enough copy so the previous state stays untouched. */
function cloneScheduler(state) {
  return {
    ...state,
    parms: [...state.parms],
    timers: { ...state.timers },
    reloads: { ...state.reloads },
    pool: [...state.pool],
  };
}

/** Queue a launch into the first free pool slots, leader first. */
function queuePool(pool, entries) {
  let slot = 0;
  for (const entry of entries) {
    while (slot < pool.length && pool[slot] !== null) slot += 1;
    if (slot >= pool.length) return;
    pool[slot] = entry;
  }
}

/**
 * Handle the one type whose timer expired this tick. Returns the launch to
 * emit now, or null (boss sorties go through the pool and emerge on the
 * following frames; a type with no candidate burns its reload silently).
 */
function dispatch(state, type, context, result) {
  if (!context.availableTypes.includes(type)) return null;

  if (type === 'zako') {
    state.zakoLaunches += 1;
    if (context.transformStage && state.zakoLaunches % TRANSFORM_EVERY_NTH_ZAKO === 0) {
      result.transformPull = true;
      return null;
    }
    return { type: 'zako', role: 'attack' };
  }

  if (type === 'goei') return { type: 'goei', role: 'attack' };

  // Boss: alternate solo capture dives and escort sorties, both staged
  // through the pool. The toggle holds while a capture is in progress
  // (the cflag): those launches are escort sorties.
  let capture = false;
  if (!context.captureActive) {
    state.bossToggle = (state.bossToggle + 1) & 0xff;
    capture = (state.bossToggle & 1) === 0;
  }

  if (capture) {
    queuePool(state.pool, [{ type: 'boss', role: 'capture', wingmen: 0 }]);
    return null;
  }

  const wingmen = Math.min(2, Math.max(context.escortsAvailable, 0));
  queuePool(state.pool, [
    { type: 'boss', role: 'escortLeader', wingmen },
    ...Array.from({ length: wingmen }, () => ({ type: 'goei', role: 'escortWingman' })),
  ]);
  return null;
}

/**
 * Advance the scheduler by a frame delta.
 *
 * Runs whole hardware frames at the cabinet's 60.606 Hz out of the
 * accumulated delta and returns the next state, the launches to make (in
 * order), whether a launch became the transform pull, and the live flags the
 * scene reads: `continuousBombing` and this frame's bomb-drop mask.
 */
export function advanceScheduler(
  state,
  deltaMs,
  {
    activeBombers = 0,
    aliveEnemies = 0,
    availableTypes = ATTACK_TYPES,
    playerFireActive = true,
    escortsAvailable = 0,
    captureActive = false,
    transformStage = false,
  } = {},
) {
  const next = cloneScheduler(state);
  const context = {
    availableTypes,
    playerFireActive,
    escortsAvailable,
    captureActive,
    transformStage,
  };
  const result = { launches: [], transformPull: false };

  // The tiny epsilon keeps an exact multiple of FRAME_MS from losing a frame
  // to floating-point rounding.
  next.frameAccMs += deltaMs;
  let frames = Math.floor(next.frameAccMs / FRAME_MS + 1e-9);
  next.frameAccMs -= frames * FRAME_MS;

  while (frames > 0) {
    frames -= 1;
    next.frame += 1;
    if (next.frame % STAGE_TIMER_TICK_FRAMES === 0 && next.stageTimer > 0) {
      next.stageTimer -= 1;
    }

    // The endgame flag and the per-frame configuration (f_0857): reloads,
    // bomb mask and the ramped attacker ceiling, all recomputed every frame
    // from the live board.
    next.continuousBombing = aliveEnemies < next.parms[7] && playerFireActive;
    const cfg = bomberConfig(next.parms, {
      aliveBugs: aliveEnemies,
      stageTimer: next.stageTimer,
      continuousBombing: next.continuousBombing,
    });
    next.maxBombers = cfg.maxBombers;
    next.bombFlags = cfg.bombFlags;
    next.reloads = cfg.reloads;

    // f_1B65's entry guard: no dispatch without the player-fire task. The
    // timers and the pool hold where they are.
    if (!playerFireActive) continue;

    // The pool drains first, one launch per frame, bypassing the 16-frame
    // gate and the cap; per-type dispatch pauses while it does.
    const slot = next.pool.findIndex((entry) => entry !== null);
    if (slot !== -1) {
      result.launches.push(next.pool[slot]);
      next.pool[slot] = null;
      continue;
    }

    if (next.frame % TICK_FRAMES !== 0) continue;

    // The djnz walk: decrement each timer in order until one expires; handle
    // that one and stop, leaving the rest untouched this tick.
    for (const type of ATTACK_TYPES) {
      if (next.timers[type] > 0) next.timers[type] -= 1;
      if (next.timers[type] !== 0) continue;

      // The cap gate: air full, so the expired timer is set back to 1 and
      // re-checked next tick; the types behind it stay frozen. Launches
      // already emitted this advance count as airborne.
      if (activeBombers + result.launches.length >= next.maxBombers) {
        next.timers[type] = 1;
        break;
      }

      // Reload BEFORE dispatch: an expiry with no candidate still burns a
      // full cycle.
      next.timers[type] = next.reloads[type];
      const launch = dispatch(next, type, context, result);
      if (launch) result.launches.push(launch);
      break;
    }
  }

  return {
    state: next,
    launches: result.launches,
    transformPull: result.transformPull,
    continuousBombing: next.continuousBombing,
    bombFlags: next.bombFlags,
  };
}

// ------------------------------------------------------- the no-fire bug

/**
 * The no-fire bug's trigger time: about fifteen minutes.
 *
 * The famous trick: clear the board down to the last couple of Zako, dodge
 * their dives without shooting for a quarter of an hour, and the firing
 * routine locks up -- no enemy shoots again until the machine is power
 * cycled. Reproducing it faithfully makes the game silently unlosable, which
 * is why it sits behind an operator switch that is off from the factory and
 * why a run played after the trigger is disqualified from the score board.
 *
 * Lore-based, not ROM-derived: the research corpus never surfaces a no-fire
 * timer, though the continuous-bombing gate's requirement that the player
 * can fire is the mechanism the folklore trick exploits.
 */
export const NO_FIRE_TRIGGER_MS = 900000;

/** The most enemies that may remain while the lock-up accrues. */
export const NO_FIRE_MAX_ENEMIES = 2;

/** Fresh no-fire tracking: nothing accrued, nothing triggered. */
export function createNoFireState() {
  return { accruedMs: 0, triggered: false };
}

/**
 * Accrue toward the lock-up.
 *
 * Only while the switch is on and at most `NO_FIRE_MAX_ENEMIES` remain; a
 * board that fills back up resets the accrual. Once triggered it stays
 * triggered -- clearing it is the caller's power cycle, not this function's.
 */
export function advanceNoFire(state, deltaMs, { enabled = false, enemiesRemaining = 0 } = {}) {
  if (state.triggered || !enabled) return state;
  if (enemiesRemaining <= 0 || enemiesRemaining > NO_FIRE_MAX_ENEMIES) {
    return state.accruedMs === 0 ? state : { ...state, accruedMs: 0 };
  }

  const accruedMs = state.accruedMs + deltaMs;
  return { accruedMs, triggered: accruedMs >= NO_FIRE_TRIGGER_MS };
}

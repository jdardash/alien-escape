/**
 * The attack scheduler.
 *
 * Galaga does not launch attacks off a timer with a random pick. The ROM
 * keeps a countdown per enemy type -- Zako, Goei, Boss -- reloaded from the
 * difficulty table's per-type launch counters, and an attacker launches when
 * its type's counter expires and the air is not already full. The ceiling on
 * "full" is itself a table parameter, and it rises by one as a stage drags
 * on, which is why camping a stage gets worse instead of staying stable.
 *
 * The transform trio rides the same schedule: on stages that have a
 * transform type, every Nth Zako launch is replaced by the pull that turns a
 * Zako into the bonus trio. It is not a clock -- on a stage where the player
 * suppresses the attack waves, the transforms are suppressed with them,
 * which is exactly how the arcade's feel differs from a 15-second timer's.
 *
 * Pure and immutable in the house style: `advanceScheduler` returns a new
 * state, so the same code is exercised identically by the game loop and by
 * the tests.
 */

/**
 * Launch order within one advance, highest rank first.
 *
 * Matters only on the frame where several counters have expired and the
 * ceiling admits fewer than all of them: the boss takes the slot, which is
 * what makes its escorted runs the events of a stage rather than fillers.
 */
export const ATTACK_TYPES = ['boss', 'goei', 'zako'];

/**
 * Which Zako launch becomes the transform pull.
 *
 * Authored: the research places the transform on the attack schedule but does
 * not give the divisor. Six puts the first trio roughly forty seconds into a
 * factory-rank stage that is being played, and sooner on harder rows, both of
 * which read right against gameplay footage.
 */
export const TRANSFORM_EVERY_NTH_ZAKO = 6;

/**
 * The no-fire bug's trigger time: about fifteen minutes.
 *
 * The famous trick: clear the board down to the last couple of Zako, dodge
 * their dives without shooting for a quarter of an hour, and the firing
 * routine locks up -- no enemy shoots again until the machine is power
 * cycled. Reproducing it faithfully makes the game silently unlosable, which
 * is why it sits behind an operator switch that is off from the factory and
 * why a run played after the trigger is disqualified from the score board.
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

/** A scheduler for one stage, from that stage's difficulty row. */
export function createAttackScheduler(row) {
  return {
    /** Time left on each type's countdown, in ms at the cabinet's rate. */
    countersMs: { ...row.launchMs },
    /** What an expired counter reloads to. */
    launchMs: { ...row.launchMs },
    baseMaxActive: row.maxActiveBombers,
    bomberRampMs: row.bomberRampMs,
    /** How long this stage has been under attack. */
    rampElapsedMs: 0,
    /** Zako launches so far, for the transform divisor. */
    zakoLaunches: 0,
  };
}

/** The ceiling on simultaneous attackers, after the ramp. */
export function maxActiveBombers(state) {
  return state.baseMaxActive + (state.rampElapsedMs >= state.bomberRampMs ? 1 : 0);
}

/**
 * Advance the countdowns by a frame delta.
 *
 * Returns the next state, the types to launch now, and whether this advance
 * pulls a transform. An expired counter whose type cannot launch -- no such
 * enemy left, or the air already full -- holds at zero and fires the moment
 * the block clears, which is the arcade's behaviour: a stage that has been
 * quiet because the player kept the air full erupts when they clear it.
 */
export function advanceScheduler(
  state,
  deltaMs,
  { activeBombers = 0, availableTypes = ATTACK_TYPES, transformStage = false } = {},
) {
  const next = {
    ...state,
    countersMs: { ...state.countersMs },
    rampElapsedMs: state.rampElapsedMs + deltaMs,
  };

  const ceiling = maxActiveBombers(next);
  const launches = [];
  let transformPull = false;
  let active = activeBombers;

  for (const type of ATTACK_TYPES) {
    next.countersMs[type] = Math.max(next.countersMs[type] - deltaMs, 0);
    if (next.countersMs[type] > 0) continue;
    if (!availableTypes.includes(type)) continue;
    if (active >= ceiling) continue;

    next.countersMs[type] = next.launchMs[type];
    active += 1;

    if (type === 'zako') {
      next.zakoLaunches += 1;
      if (transformStage && next.zakoLaunches % TRANSFORM_EVERY_NTH_ZAKO === 0) {
        transformPull = true;
        continue;
      }
    }

    launches.push(type);
  }

  return { state: next, launches, transformPull };
}

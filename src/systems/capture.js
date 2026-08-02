/**
 * The tractor beam capture and rescue cycle -- the ROM's own machine.
 *
 * This is Galaga's signature mechanic. A Boss Galaga flies the boss table's
 * solo capture entry (`db_0454`), stalls low on the field, and opens an
 * 11-strip tractor cone. For a fixed 64-frame window at full extent -- and
 * ONLY then -- a fighter standing within 27 pixels of the beam's column is
 * taken: pulled up tumbling, glued under the boss, carried home, and settled
 * above it as a red hostage. Destroy that boss on the right dive and the ship
 * flies back and docks, giving a double-width fighter with twice the guns.
 *
 * Modelled as an explicit transition table rather than scattered booleans,
 * because the original code tracked this with four independent flags and could
 * represent states that should not exist, such as being captured and docked at
 * once. The beam clock, the grab test and the pull arithmetic live here too,
 * as pure functions over ROM canvas units, so `tests/capture.test.js` can run
 * a whole capture without a renderer.
 *
 * Sources: `docs/rom-research/capture-transients.md` sections 1.1-1.7
 * (gg1-3.s `f_2222`/`f_20F2`/`f_2000`, gg1-2_fx.s `f_19B2`/`case_bmbr_boss`,
 * gg1-5.s mission-end table), re-verified against the ZaneLogi mirrors
 * `tasks/tractorBeam.js`, `tasks/pullShip.js`, `tasks/fighterCaptured.js`.
 */

import { FRAME_MS } from './pathcode.js';

export const CaptureState = {
  /** No beam, no captive. */
  IDLE: 'idle',
  /** Boss has stalled and the cone is unfurling strip by strip. */
  BEAM_OPENING: 'beamOpening',
  /** Full extent: the 64-frame grab window. Capture can ONLY happen here. */
  BEAM_ACTIVE: 'beamActive',
  /** Player is caught and being pulled up the beam, tumbling. */
  CAPTURING: 'capturing',
  /** Ship is held by its captor. Player flies on with a life spent. */
  HELD: 'held',
  /** Captor destroyed on the right dive; the ship is flying back to dock. */
  RETURNING: 'returning',
  /** Docked. Dual fighter active. */
  DUAL: 'dual',
};

export const CaptureEvent = {
  DEPLOY_BEAM: 'deployBeam',
  /** The cone reached full extent: the 64-frame grab window begins. */
  BEAM_FULL: 'beamFull',
  BEAM_TIMEOUT: 'beamTimeout',
  PLAYER_CAUGHT: 'playerCaught',
  CAPTURE_COMPLETE: 'captureComplete',
  CAPTOR_DESTROYED: 'captorDestroyed',
  CAPTIVE_DESTROYED: 'captiveDestroyed',
  DOCK_COMPLETE: 'dockComplete',
  /** Dual fighter took a hit: it reverts to a single ship rather than dying. */
  DUAL_HIT: 'dualHit',
  RESET: 'reset',
};

const TRANSITIONS = {
  [CaptureState.IDLE]: {
    [CaptureEvent.DEPLOY_BEAM]: CaptureState.BEAM_OPENING,
  },
  [CaptureState.BEAM_OPENING]: {
    [CaptureEvent.BEAM_FULL]: CaptureState.BEAM_ACTIVE,
    [CaptureEvent.BEAM_TIMEOUT]: CaptureState.IDLE,
    // Shooting the boss out from under its own beam aborts the mission
    // (gg1-5.s:1212 clears the cflag on a shot capturing boss).
    [CaptureEvent.CAPTOR_DESTROYED]: CaptureState.IDLE,
  },
  [CaptureState.BEAM_ACTIVE]: {
    [CaptureEvent.PLAYER_CAUGHT]: CaptureState.CAPTURING,
    [CaptureEvent.BEAM_TIMEOUT]: CaptureState.IDLE,
    [CaptureEvent.CAPTOR_DESTROYED]: CaptureState.IDLE,
  },
  [CaptureState.CAPTURING]: {
    [CaptureEvent.CAPTURE_COMPLETE]: CaptureState.HELD,
    // The L3 branch (`l_2327`, gg1-3.s:639-649): shooting the boss mid-pull
    // RELEASES the fighter -- the beam retracts, control returns, and no
    // life is lost. The scene re-enables the player on this transition.
    [CaptureEvent.CAPTOR_DESTROYED]: CaptureState.IDLE,
  },
  [CaptureState.HELD]: {
    [CaptureEvent.CAPTOR_DESTROYED]: CaptureState.RETURNING,
    // Shooting your own captive -- or losing it as an orphan or a rogue --
    // ends the capture for good.
    [CaptureEvent.CAPTIVE_DESTROYED]: CaptureState.IDLE,
  },
  [CaptureState.RETURNING]: {
    [CaptureEvent.DOCK_COMPLETE]: CaptureState.DUAL,
  },
  [CaptureState.DUAL]: {
    [CaptureEvent.DUAL_HIT]: CaptureState.IDLE,
    [CaptureEvent.DEPLOY_BEAM]: CaptureState.BEAM_OPENING,
  },
};

/**
 * Apply an event.
 *
 * RESET always returns to IDLE, since a new life or a new stage clears any
 * capture in flight. Any other event with no transition from the current state
 * is ignored and the state is returned unchanged, which keeps a stray timer
 * callback from corrupting the machine.
 */
export function transition(state, event) {
  if (event === CaptureEvent.RESET) return CaptureState.IDLE;
  const next = TRANSITIONS[state]?.[event];
  return next ?? state;
}

// ------------------------------------------------------------------ the beam

/**
 * The cone is 11 strips (`captr_status+1` grows 0..0x0B, f_2222,
 * gg1-3.s:458-694), drawn 6 tiles = 48 ROM px wide.
 */
export const BEAM_STRIPS = 0x0b;

/**
 * The grab window: a HARDCODED 64 frames at full extent (`l_231C`,
 * gg1-3.s:632-634), the same on every stage. The ship-in-beam test runs every
 * one of these frames and never during grow or shrink.
 */
export const BEAM_GRAB_FRAMES = 0x40;

/**
 * The grab test's half-width, in ROM canvas px: `A = beamX - shipX + 0x1B;
 * if (A >= 0x36) not in beam` (`l_233D`, gg1-3.s:651-694) -- |dx| < 27, a
 * 54-px window on the 224-wide field. There is NO drag: capture is a
 * positional test and the player keeps full control until caught.
 */
export const BEAM_CATCH_HALF_WIDTH = 0x1b;

/**
 * The beam clock for one stage: strips grow and shrink at
 * `newStageParms[6]` frames per strip -- 12 on stage 1 dropping to 3 by the
 * late stages, so the trap springs faster as the game hardens -- while the
 * grab window never changes.
 */
export function beamTimings(framesPerStrip) {
  const stripMs = BEAM_STRIPS * framesPerStrip * FRAME_MS;
  return { openMs: stripMs, holdMs: BEAM_GRAB_FRAMES * FRAME_MS, retractMs: stripMs };
}

/**
 * The ship-in-beam test, in ROM canvas X. `beamX` is the F4 aim column
 * (`captr_status+0`), NOT the boss's drifted position; both operands carry
 * the same sprite offset, so the canvas difference is the Z80's difference.
 * Only the grab window may catch.
 */
export function beamCatches(phase, beamCanvasX, playerCanvasX) {
  if (phase !== 'active') return false;
  return Math.abs(beamCanvasX - playerCanvasX) < BEAM_CATCH_HALF_WIDTH;
}

// ------------------------------------------------------------------ the pull

/**
 * The pull-ship sequence (`f_20F2` + `c_2188_ship_spin`, gg1-3.s:205-380):
 * not a spiral -- a tumble-and-pull. X walks 1 px/frame toward the boss's
 * column (and wobbles +/-1 about it once aligned, the Z80's blind inc/dec);
 * Y rises 1 px/frame; the ship spins at 0x0C angle units per frame, the same
 * step the captor's own pre-beam spin uses (f_21CB, gg1-3.s:413-426).
 */
export const PULL_STEP = 1;

/** The tumble's per-frame rotation, in the ROM's 1024-unit angle circle. */
export const PULL_SPIN_STEP = 0x0c;

/**
 * The connect threshold: at sprite Y 0xE0 the ship is glued and recoloured
 * red (`l_2141`, gg1-3.s:260-266); 0xE6 on the way up is where the player's
 * fire task dies. Port decision: sprite Y is read as ROM canvas Y here --
 * the two agree to within the sprite-origin offset, and 0xE0 lands 15 px
 * under the boss's hover row (canvas 209), which is exactly the 16-px glue
 * offset the carry-home uses.
 */
export const PULL_CONNECT_Y = 0xe0;
export const PULL_FIRE_OFF_Y = 0xe6;

/** A fresh pull, from the caught fighter's ROM canvas position. */
export function createPull({ x, y }) {
  return { x, y, angle: 0, frame: 0, connected: false };
}

/**
 * One hardware frame of the pull, toward the boss's ROM canvas column.
 * Pure: returns the next pull. `connected` latches once Y reaches the
 * connect row; the caller glues the ship and starts the carry-home.
 */
export function advancePull(pull, bossCanvasX) {
  const dx = bossCanvasX - pull.x;
  let x;
  if (dx === 0) {
    // Dead on the column, the inc/dec still runs: the +/-1 px wobble the
    // ride up the beam visibly has.
    x = pull.x + (pull.frame % 2 === 0 ? PULL_STEP : -PULL_STEP);
  } else if (Math.abs(dx) < PULL_STEP) {
    // A fractional remainder (screen positions are not integer ROM px)
    // closes rather than oscillating forever short of the column.
    x = bossCanvasX;
  } else {
    x = pull.x + Math.sign(dx) * PULL_STEP;
  }
  const y = pull.y - PULL_STEP;
  return {
    x,
    y,
    angle: (pull.angle + PULL_SPIN_STEP) & 0x3ff,
    frame: pull.frame + 1,
    connected: y <= PULL_CONNECT_Y,
  };
}

// ------------------------------------------------------------ carry and hold

/**
 * While the captor carries its prize home the ship rides glued at boss X,
 * boss Y + 0x10 -- 16 ROM px BELOW (f_19B2 segment 1, gg1-2_fx.s:510-629).
 */
export const CARRY_OFFSET_Y = 0x10;

/**
 * Once the boss lands, the slave rises over a 0x24 = 36-frame counter to
 * settle ABOVE the boss (`l_1A3F`, gg1-2_fx.s:630-656), where it hangs as a
 * red formation member until the rescue dive or the wrong shot.
 */
export const SETTLE_FRAMES = 0x24;

// ------------------------------------------------------------------- rescue

/**
 * Every way a capture can end once a ship is HELD, from the re-verified
 * mission-end table (capture-transients.md section 1.7, gg1-5.s):
 *
 * - R  (rescued):  the captor -- necessarily on its second, blue hit, since a
 *   boss only dies on it -- is shot down FLYING while the slave is itself
 *   diving beside it as a squad member (state 9). `f_2000` spins, lands and
 *   docks it (gg1-5.s:1339-1361).
 * - L1 (orphaned): the captor dies flying while the slave is NOT diving --
 *   mid-carry, or glued under it -- and the slave is simply lost
 *   (gg1-5.s:1338 -> 1364).
 * - O  (rogue):    the captor dies AT HOME in formation; the slave launches
 *   out on `db_fltv_rogefgter` and despawns for good (gg1-5.s:1442-1456).
 */
export const RescueOutcome = {
  RESCUED: 'rescued',
  ORPHANED: 'orphaned',
  ROGUE: 'rogue',
  /** Nothing was being held, so the kill was an ordinary kill. */
  NONE: 'none',
};

/**
 * Decide what a destroyed captor does to the ship it was holding.
 *
 * `captorFlying` is "not parked in the formation"; `captiveEscorting` is the
 * slave's own dive on the escort path -- the ROM's state-9 check. Plain
 * booleans rather than an enemy or a mode string, so the rule stays
 * independent of how the scene represents either.
 */
export function resolveCaptorDestroyed(state, { captorFlying = false, captiveEscorting = false } = {}) {
  if (state !== CaptureState.HELD) return RescueOutcome.NONE;
  if (!captorFlying) return RescueOutcome.ROGUE;
  return captiveEscorting ? RescueOutcome.RESCUED : RescueOutcome.ORPHANED;
}

// ------------------------------------------------------------- derived rules

/** True while a beam is on screen: opening, in its grab window, or holding. */
export function isBeamDangerous(state) {
  return state === CaptureState.BEAM_OPENING || state === CaptureState.BEAM_ACTIVE;
}

/** True when the player should be firing two columns of shots. */
export function hasDualFighter(state) {
  return state === CaptureState.DUAL;
}

/** True when a captive ship should be drawn attached to its captor. */
export function hasCaptiveOnScreen(state) {
  return state === CaptureState.HELD;
}

/**
 * Maximum player bullets alive at once.
 *
 * Galaga allows two, doubled to four while the dual fighter is docked. The
 * limit is the core constraint of the game's feel, so it lives with the
 * capture rules rather than in the input handler.
 */
export function bulletLimit(state) {
  return hasDualFighter(state) ? 4 : 2;
}

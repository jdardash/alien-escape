/**
 * The tractor beam capture and rescue cycle.
 *
 * This is Galaga's signature mechanic and its most interesting rule. A Boss
 * Galaga descends, opens a tractor beam, and pulls your fighter in. You lose a
 * life, but the ship is not gone: it is held above the boss. Destroy that boss
 * without hitting your own ship and it flies back and docks, giving you a
 * double-width fighter with twice the firepower.
 *
 * Shooting the held ship yourself is a real possibility, so the machine has to
 * distinguish "the boss died" from "the captive died" and land somewhere
 * different for each.
 *
 * Modelled as an explicit transition table rather than scattered booleans,
 * because the original code tracked this with four independent flags and could
 * represent states that should not exist, such as being captured and docked at
 * once.
 */

export const CaptureState = {
  /** No beam, no captive. */
  IDLE: 'idle',
  /** Boss has halted and the beam is fading in. */
  BEAM_OPENING: 'beamOpening',
  /** Beam is live and pulling the player. */
  BEAM_ACTIVE: 'beamActive',
  /** Player is caught and being drawn upward. */
  CAPTURING: 'capturing',
  /** Ship is held above its captor. Player flies on with a life spent. */
  HELD: 'held',
  /** Captor destroyed; the ship is flying back to dock. */
  RETURNING: 'returning',
  /** Docked. Dual fighter active. */
  DUAL: 'dual',
};

export const CaptureEvent = {
  DEPLOY_BEAM: 'deployBeam',
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
    [CaptureEvent.PLAYER_CAUGHT]: CaptureState.CAPTURING,
    [CaptureEvent.BEAM_TIMEOUT]: CaptureState.IDLE,
  },
  [CaptureState.BEAM_ACTIVE]: {
    [CaptureEvent.PLAYER_CAUGHT]: CaptureState.CAPTURING,
    [CaptureEvent.BEAM_TIMEOUT]: CaptureState.IDLE,
  },
  [CaptureState.CAPTURING]: {
    [CaptureEvent.CAPTURE_COMPLETE]: CaptureState.HELD,
  },
  [CaptureState.HELD]: {
    [CaptureEvent.CAPTOR_DESTROYED]: CaptureState.RETURNING,
    // Shooting your own captive loses it for good.
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

/**
 * What destroying the boss that is carrying your fighter does to the fighter.
 *
 * Galaga does not simply hand the ship back to whoever kills the captor. The
 * ship only returns if the captor is shot down **while it is diving**, with
 * your fighter in tow. Shoot it while it sits in the formation and the captive
 * is destroyed with it: it breaks away, dives off the bottom of the screen,
 * and is gone. That is the entire risk of the mechanic. Without it the capture
 * is a free upgrade with a life as its price, and the player has no reason to
 * wait for the right shot.
 */
export const RescueOutcome = {
  /** Captor was diving: the ship flies back and docks as a dual fighter. */
  RESCUED: 'rescued',
  /** Captor was in formation: the captive is lost for good. */
  CAPTIVE_LOST: 'captiveLost',
  /** Nothing was being held, so the kill was an ordinary kill. */
  NONE: 'none',
};

/**
 * Decide what a destroyed captor does to the ship it was holding.
 *
 * Takes a plain boolean rather than an enemy or a mode string, so the rule
 * stays independent of how the scene happens to represent "diving".
 */
export function resolveCaptorDestroyed(state, captorIsDiving) {
  if (state !== CaptureState.HELD) return RescueOutcome.NONE;
  return captorIsDiving ? RescueOutcome.RESCUED : RescueOutcome.CAPTIVE_LOST;
}

/**
 * Whether the held fighter is in a position to bomb the player.
 *
 * A captured Fighter does not sit out the rest of the stage: it joins the
 * enemy side and attacks. What puts it in range is its captor leaving the
 * grid, since the ship is pinned beneath the boss and goes wherever the boss
 * goes. So the rule is gated on the captor diving, not merely on being held --
 * a captive parked in the formation is as far from the player as the rest of
 * the grid and, like the rest of the grid, does not fire from up there.
 *
 * The effect is that a captor's dive is meaningfully more dangerous than any
 * other, which is the right pressure: it is also the only dive during which
 * the player can win the ship back.
 */
export function captiveCanBomb(state, captorIsDiving) {
  return state === CaptureState.HELD && Boolean(captorIsDiving);
}

/** True while a beam is on screen and able to catch the player. */
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

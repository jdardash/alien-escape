/**
 * The stick, wherever it comes from.
 *
 * The cabinet has exactly one control scheme: a two-way stick and a fire
 * button. A browser offers three ways to hold that stick -- keyboard,
 * gamepad, touch -- and the rules for turning each into "left held, right
 * held" live here, pure and testable, so the scenes only ever see the shape
 * the cabinet's own wiring loom produced.
 *
 * The merge rule is the switched stick's: a two-way leaf switch cannot close
 * both contacts at once, so when two sources disagree the machine stands
 * still rather than picking a winner.
 */

/** Stick travel below this is drift, not intent. */
export const STICK_DEADZONE = 0.25;

/** The ship stops chasing a finger once it is this close, to stop jitter. */
export const TOUCH_DEADZONE_PX = 10;

/** A press this short that moved this little is a tap: fire, not steer. */
export const TAP_MAX_MS = 250;
export const TAP_MAX_MOVE_PX = 14;

const NEUTRAL = Object.freeze({ left: false, right: false });

/**
 * A gamepad's held direction, dpad ORed with the stick past its deadzone.
 * Takes a plain shape (`{axisX, dpadLeft, dpadRight}`) rather than a Phaser
 * pad so the rule is testable without a browser.
 */
export function padHeld(pad) {
  if (!pad) return { ...NEUTRAL };
  return {
    left: Boolean(pad.dpadLeft) || pad.axisX < -STICK_DEADZONE,
    right: Boolean(pad.dpadRight) || pad.axisX > STICK_DEADZONE,
  };
}

/**
 * Touch steering: the ship chases the finger's column and stops under it.
 * `pointerX` is null when no finger is down.
 */
export function touchSteer(pointerX, playerX, deadzonePx = TOUCH_DEADZONE_PX) {
  if (pointerX === null || pointerX === undefined) return { ...NEUTRAL };
  const delta = pointerX - playerX;
  if (Math.abs(delta) < deadzonePx) return { ...NEUTRAL };
  return { left: delta < 0, right: delta > 0 };
}

/** OR any number of held states, then apply the switched-stick rule. */
export function mergeHeld(...sources) {
  const left = sources.some((held) => held?.left);
  const right = sources.some((held) => held?.right);
  if (left && right) return { ...NEUTRAL };
  return { left, right };
}

/** Whether a finished press was a tap (fire) rather than a steer. */
export function isTap(heldMs, movedPx, maxMs = TAP_MAX_MS, maxMovePx = TAP_MAX_MOVE_PX) {
  return heldMs < maxMs && movedPx < maxMovePx;
}

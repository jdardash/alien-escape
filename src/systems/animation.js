/**
 * The animation clock, as pure functions of elapsed time.
 *
 * Nothing here owns a timer, a tween or a sprite. Each function maps a
 * millisecond reading to a frame index or an angle, and the scenes apply the
 * result. That is what makes the board's animation testable under Node, and
 * it is also what the arcade did: one hardware frame counter, read by
 * everything, so the whole formation flaps as one thing rather than as forty
 * timers drifting apart.
 *
 * Rotation is deliberately coarse. The cabinet had sixteen sprite
 * orientations, not a rotation matrix, and a diving Goei visibly clicks
 * through them. `quantizeHeading` reproduces that at render time only -- the
 * flight paths underneath stay continuous, so hitboxes and choreography are
 * exactly what they were when the rotation was smooth.
 */

import { ANIMATION } from '../config.js';

const TAU = Math.PI * 2;

/**
 * Which wing frame the whole formation shows at this instant: 0 or 1.
 *
 * One shared clock rather than per-enemy timers, because the cabinet's
 * formation flaps in unison and forty sprites alternating out of phase read
 * as shimmer rather than as wingbeats.
 */
export function flapFrameAt(elapsedMs) {
  return Math.floor(elapsedMs / ANIMATION.flapMs) % 2;
}

/** Snap a heading to the nearest of the cabinet's sixteen orientations. */
export function quantizeHeading(radians) {
  const step = TAU / ANIMATION.rotationSteps;
  return Math.round(radians / step) * step;
}

/**
 * Which frame of an explosion is showing, or null once it has burnt out.
 *
 * Null rather than the last frame forever: the caller destroys the sprite on
 * null, so an explosion cannot be left frozen on screen by a dropped timer.
 */
export function explosionFrameAt(frameCount, frameMs, elapsedMs) {
  const frame = Math.floor(elapsedMs / frameMs);
  return frame < frameCount ? frame : null;
}

/**
 * The stepped rotation of a fighter being tractored up, or spinning free
 * during a rescue.
 *
 * The fighter has one sprite frame, so the arcade's capture spin is pure
 * rotation -- but rotation through the same sixteen stops everything else
 * uses. The angle advances monotonically through `spinTurns` full turns and
 * clamps at the end, so a caller running past the duration gets a fighter
 * that has finished upright, not one still creeping.
 */
export function spinAngleAt(elapsedMs, durationMs) {
  const progress = Math.min(Math.max(elapsedMs / durationMs, 0), 1);
  const step = TAU / ANIMATION.rotationSteps;
  const total = TAU * ANIMATION.spinTurns * progress;
  return Math.round(total / step) * step;
}

/**
 * Driving a sprite along a path.
 *
 * Phaser's tween system can move an object between two points, but Galaga's
 * enemies fly curves and must face the direction they are travelling. This is
 * the small amount of state needed to walk a Bezier chain over time and report
 * where the sprite should be and which way it should point.
 *
 * Kept pure and frame-rate independent: `advance` takes a delta in
 * milliseconds and returns a new flight rather than mutating one, so the same
 * code is exercised identically by the game loop and by the tests.
 */

import { pointOnPath, tangentAngle } from './paths.js';

export function createFlight(path, durationMs) {
  if (durationMs <= 0) {
    throw new Error('Flight duration must be positive');
  }
  return { path, durationMs, elapsedMs: 0 };
}

/** Advance by a frame delta. Elapsed time is capped so `t` never exceeds 1. */
export function advanceFlight(flight, deltaMs) {
  const elapsedMs = Math.min(flight.elapsedMs + Math.max(deltaMs, 0), flight.durationMs);
  return { ...flight, elapsedMs };
}

/** Progress through the flight, 0 to 1. */
export function flightProgress(flight) {
  return flight.elapsedMs / flight.durationMs;
}

export function isFlightComplete(flight) {
  return flight.elapsedMs >= flight.durationMs;
}

/**
 * Where the sprite sits and how it is oriented.
 *
 * `angle` is offset by a quarter turn because the ship art points up, while
 * the path tangent is measured from the positive x axis.
 */
export function flightTransform(flight) {
  const t = flightProgress(flight);
  const { x, y } = pointOnPath(flight.path, t);
  const angle = tangentAngle(flight.path, t) - Math.PI / 2;
  return { x, y, angle };
}

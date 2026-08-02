/**
 * Driving a sprite along a flight.
 *
 * Two kinds of flight share this module:
 *
 * - **Track flights**: a precompiled track (one point per hardware frame)
 *   walked over a duration. Pure interpolation; right for any flight whose
 *   shape was resolvable at launch (challenge fly-throughs, the compiled
 *   helpers in `paths.js`).
 *
 * - **Live flights**: an interpreter state from `pathcode.js` stepped in
 *   real time against a LIVE context -- the swaying formation slot, the
 *   player's position, the scheduler's continuous-bombing flag. This is how
 *   the ROM's reactive tokens (FB homing onto a drifting grid, FE/F3 player
 *   hooks, the FA loop gate) actually behave; a precompiled track cannot
 *   carry them.
 *
 * Both are pure and frame-rate independent: advancing takes a delta in
 * milliseconds and returns a new flight rather than mutating one, so the
 * game loop and the tests exercise identical code. A live flight runs whole
 * hardware frames at the cabinet's 60.606 Hz out of the accumulated delta.
 */

import { pointOnPath, tangentAngle, screenScale } from './paths.js';
import {
  FRAME_MS,
  angleToRadians,
  cloneFlightState,
  stepFlight,
  toCanvas,
} from './pathcode.js';

// ------------------------------------------------------------ track flights

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

// ------------------------------------------------------------- live flights

/**
 * Wrap an interpreter state as a live flight for a screen.
 *
 * `state` comes from `paths.js`'s `createEntryFlightState` /
 * `createDiveFlightState`; `screen` supplies the uniform ROM-to-screen
 * scale. The wrapper owns the ms-to-frame accumulator so callers hand it
 * arbitrary deltas.
 */
export function createLiveFlight(state, screen) {
  return { kind: 'live', state, scale: screenScale(screen), accMs: 0 };
}

export function isLiveFlight(flight) {
  return flight?.kind === 'live';
}

/**
 * Advance a live flight by a frame delta against the live context, given in
 * SCREEN coordinates: `{ playerX, homeTarget, stage8Switch, stage12Switch,
 * continuousBombing, frameCount }`. `frameCount` is the caller's GLOBAL
 * hardware-frame counter (`ds3_92A0_frame_cts`): its parity drives the
 * interpreter's vx/vy alternation, so every flight fed the same counter
 * switches axes in lockstep the way the ROM's slots do. Returns the next
 * flight and the events the frames raised (`armBombs`, `homed`,
 * `cloneSplit`, `captureAim`, `status3`).
 */
export function advanceLiveFlight(flight, deltaMs, context = {}) {
  const state = cloneFlightState(flight.state);
  const { scale } = flight;
  const romContext = {
    playerX: context.playerX !== undefined ? context.playerX / scale : undefined,
    homeTarget: context.homeTarget
      ? { x: context.homeTarget.x / scale, y: context.homeTarget.y / scale }
      : undefined,
    stage8Switch: context.stage8Switch ?? false,
    stage12Switch: context.stage12Switch ?? false,
    continuousBombing: context.continuousBombing ?? false,
    frameCount: context.frameCount,
  };

  // The tiny epsilon keeps an exact multiple of FRAME_MS from losing a
  // frame to floating-point rounding.
  let accMs = flight.accMs + Math.max(deltaMs, 0);
  let frames = Math.floor(accMs / FRAME_MS + 1e-9);
  accMs -= frames * FRAME_MS;

  const events = [];
  while (frames > 0 && !state.done) {
    events.push(...stepFlight(state, romContext));
    if (romContext.frameCount !== undefined) romContext.frameCount += 1;
    frames -= 1;
  }

  return { flight: { ...flight, state, accMs }, events };
}

/**
 * Where a live flight's sprite sits, in screen coordinates, and its
 * orientation under the same art-points-up convention `flightTransform`
 * uses. The heading comes from the interpreter's live 10-bit angle, which
 * is what the ROM renders sprites from -- not a track tangent.
 */
export function liveFlightTransform(flight) {
  const { x, y } = toCanvas(flight.state);
  return {
    x: x * flight.scale,
    y: y * flight.scale,
    angle: angleToRadians(flight.state.angle) - Math.PI / 2,
  };
}

/** A live flight is done at FF (gone) or when the home snap landed. */
export function isLiveFlightDone(flight) {
  return flight.state.done;
}

/** Whether it ended snapped into its formation slot. */
export function liveFlightHomed(flight) {
  return flight.state.homed;
}

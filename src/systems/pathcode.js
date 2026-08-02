/**
 * The path bytecode interpreter.
 *
 * Galaga's enemies are not driven by curves. The ROM stores each flight shape
 * as a *path block*: a run of byte pairs, each a signed per-frame heading
 * delta and a frame count, ending in a terminator. An interpreter walks the
 * block once a frame, turning the ship by the delta and advancing it at its
 * speed, and the shape of the flight falls out of the arithmetic. This module
 * is that interpreter.
 *
 * The encoding here is the ROM's in structure -- 256 heading units to the
 * circle, two's-complement turn bytes, `[turn, frames]` pairs behind a
 * terminator -- and the byte values are authored, because the published
 * research describes the format and the count of the arcade's path blocks but
 * not their contents. What the interpreter buys over the Bezier chains it
 * replaced is that the shapes are now approximations only in their *data*:
 * the motion model itself, per-frame heading deltas at the cabinet's frame
 * rate, is the arcade's.
 *
 * Programs are compiled to a *track* -- one sampled point per arcade frame --
 * rather than run live against sprites, so the rest of the game keeps its
 * pure `pointOnPath(path, t)` interface and the interpreter stays testable
 * without a clock. Linear interpolation between two adjacent samples is
 * exactly what the arcade shows between two adjacent frames.
 */

/** The cabinet's vertical refresh: 18.432 MHz / 3 / 384 / 264. */
export const PATHCODE_FPS = 60.606061;

/** How long one interpreter frame lasts. */
export const FRAME_MS = 1000 / PATHCODE_FPS;

/** Heading units in a full circle, as the ROM counts them. */
export const TURN_UNITS_PER_CIRCLE = 256;

/** The byte that ends a path block. */
export const PATH_END = 0x7f;

const RADIANS_PER_UNIT = (Math.PI * 2) / TURN_UNITS_PER_CIRCLE;

/** A signed byte, two's complement, as the turn bytes are stored. */
function signedByte(byte) {
  return byte > 127 ? byte - 256 : byte;
}

/**
 * Decode a path block into interpreter steps.
 *
 * Byte pairs `[turn, frames]` until `PATH_END`; anything after the terminator
 * is ignored, which is how the ROM's blocks can sit back to back in one
 * table. A missing terminator or a zero frame count is an authoring error and
 * throws rather than producing a flight that silently never ends.
 */
export function decodePathProgram(bytes) {
  const steps = [];

  for (let i = 0; i < bytes.length; i += 2) {
    if (bytes[i] === PATH_END) return steps;
    const frames = bytes[i + 1];
    if (frames === undefined) throw new Error('Path block ends mid-pair');
    if (frames <= 0) throw new Error('Path step must last at least one frame');
    steps.push({ turn: signedByte(bytes[i]), frames });
  }

  throw new Error('Path block has no terminator');
}

/**
 * Unit vector for a heading.
 *
 * Heading 0 points up the screen and increases clockwise, so a quarter turn
 * (64 units) points right. Up is negative y because screen space grows
 * downward.
 */
export function headingToVector(heading) {
  const radians = heading * RADIANS_PER_UNIT;
  return { x: Math.sin(radians), y: -Math.cos(radians) };
}

/** One interpreter frame: turn, then advance. Mutates and returns `state`. */
function stepState(state, turn) {
  state.heading += turn;
  const direction = headingToVector(state.heading);
  state.x += direction.x * state.speed;
  state.y += direction.y * state.speed;
  return state;
}

/**
 * Run a decoded program from a starting state.
 *
 * Returns the sampled track points (including the start) and the final
 * interpreter state, so a caller can hand the state on to `compileHoming` and
 * the flight continues without a seam.
 */
export function compileProgram(start, program) {
  const state = { ...start };
  const points = [{ x: state.x, y: state.y }];

  for (const { turn, frames } of program) {
    for (let frame = 0; frame < frames; frame += 1) {
      stepState(state, turn);
      points.push({ x: state.x, y: state.y });
    }
  }

  return { points, state };
}

/**
 * Steer from a state onto a target with a clamped turn rate.
 *
 * This is the arcade's own two-phase structure: a path block flies the shape,
 * and when the block runs out the ship tucks itself into its formation slot
 * by turning toward it no faster than its turn rate allows. The clamp is what
 * makes an arrival read as flight rather than as a lerp.
 *
 * If the target sits inside the ship's turning circle it can never be
 * reached by steering alone, so after `maxFrames` the point snaps on. In
 * authored data that is a tuning failure the tests catch; at runtime it is a
 * guarantee the flight ends.
 */
export function compileHoming(start, target, { maxTurn = 6, maxFrames = 400, trace = false } = {}) {
  const state = { ...start };
  const points = [{ x: state.x, y: state.y }];
  const headings = trace ? [state.heading] : null;

  // Arriving within a frame-and-a-half of travel counts as arrival. Requiring
  // a pass within one frame's travel lets a flight that misses by a couple of
  // pixels circle its target on the turn radius forever.
  const arriveRadius = state.speed * 1.6;

  // Radius of the circle flown at full clamp. A target inside that circle on
  // the side the ship wants to turn cannot be reached by turning toward it --
  // greedy steering orbits it forever -- so the ship steers *away* until the
  // target falls outside the circle, which is how a real turn-limited flight
  // lines an approach up.
  const turnRadius = state.speed / (maxTurn * RADIANS_PER_UNIT);

  for (let frame = 0; frame < maxFrames; frame += 1) {
    const dx = target.x - state.x;
    const dy = target.y - state.y;
    if (Math.hypot(dx, dy) <= arriveRadius) break;

    // Desired heading in units, measured the same way headings are.
    const desired = Math.atan2(dx, -dy) / RADIANS_PER_UNIT;
    let diff = desired - state.heading;
    diff = ((((diff + 128) % 256) + 256) % 256) - 128;

    let turn = Math.max(-maxTurn, Math.min(maxTurn, diff));
    if (turn !== 0) {
      const side = Math.sign(turn);
      const direction = headingToVector(state.heading);
      // Centre of the turning circle on the side being steered toward:
      // clockwise (positive) turns curve to the right of the heading.
      const centreX = state.x - side * direction.y * turnRadius;
      const centreY = state.y + side * direction.x * turnRadius;
      if (Math.hypot(target.x - centreX, target.y - centreY) < turnRadius * 0.98) {
        turn = -side * maxTurn;
      }
    }

    stepState(state, turn);
    points.push({ x: state.x, y: state.y });
    if (headings) headings.push(state.heading);
  }

  points.push({ x: target.x, y: target.y });
  if (headings) headings.push(state.heading);
  state.x = target.x;
  state.y = target.y;

  return trace ? { points, state, headings } : { points, state };
}

/** Reflect a track about a screen's vertical centre line. */
export function mirrorTrack(track, screenWidth) {
  return {
    kind: 'track',
    points: track.points.map(({ x, y }) => ({ x: screenWidth - x, y })),
  };
}

/** Wrap compiled points as the track object the path evaluators consume. */
export function asTrack(points) {
  return { kind: 'track', points };
}

/** How long a track takes at the cabinet's frame rate. */
export function trackDurationMs(track) {
  return (track.points.length - 1) * FRAME_MS;
}

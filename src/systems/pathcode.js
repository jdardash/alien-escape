/**
 * The path bytecode interpreter -- the ROM's own machine.
 *
 * Galaga flies every enemy with one Z80 routine, `f_08D3` (gg1-5.s:1422-2340
 * via docs/rom-research/paths-motion.md): a per-slot state of fixed-point
 * position, a 10-bit angle, per-axis speed nibbles and a path pointer, stepped
 * once per 60.606 Hz frame. A segment timer counts down; when it expires the
 * next byte is fetched -- below 0xEF it opens a 3-byte segment
 * `[(vy<<4)|vx, signed rotRate, duration]`, at or above 0xEF it dispatches a
 * control token (jump table `d_0920`). This module is a port of that machine:
 * same fetch order, same octant motion arithmetic, same token semantics,
 * working in the ROM's own coordinate space.
 *
 * The heading-delta encoding this file used to hold (256 units per circle,
 * `[turn, frames]` pairs, authored byte values) is gone: the real tables are
 * transcribed in `flightData.js` and this interpreter runs them.
 *
 * Coordinates: internal 16-bit fixed point per axis; the high byte is the
 * renderer's raw coordinate, and rawY is UP-positive. The ROM canvas is
 * 224 x 288, reached through the transforms below; scenes scale that canvas
 * uniformly (the x3 adapter). Port decisions, labelled where they occur:
 * positions are continuous JS numbers rather than wrapped 8-bit registers,
 * the `c_0E5B`/`c_0EAA` fixed-point divides run in floating point, and the
 * canvas offsets follow the task pin (x = raw*2 - 10, no vertical crop)
 * rather than the corpus's galagino-specific -9/-32 rendering offsets.
 */

/** The cabinet's vertical refresh: 18.432 MHz / 3 / 384 / 264. */
export const PATHCODE_FPS = 60.606061;

/** How long one interpreter frame lasts. */
export const FRAME_MS = 1000 / PATHCODE_FPS;

/**
 * Angle units in a full circle: 1024, the ROM's 10-bit angle. 0 points
 * right, 256 is canvas-up, 512 left, 768 canvas-down --
 * counter-clockwise-positive in screen terms (gg1-5.s:2174-2178).
 */
export const ANGLE_UNITS = 1024;

/** The ROM canvas the interpreter's output lives on. */
export const ROM_CANVAS = { width: 224, height: 288 };

/**
 * Despawn margins for fly-throughs and transients, in ROM canvas px
 * (paths-motion.md section 1.4): a stream that leaves this box is gone.
 */
export const DESPAWN_MARGINS = { left: -24, right: 248, bottom: 304 };

/** A signed byte, two's complement, as rotRate bytes are stored. */
function signedByte(byte) {
  return byte > 127 ? byte - 256 : byte;
}

/**
 * The ROM's direction-to-angle routine, `c_0E5B`: the INVERSE of the octant
 * motion scheme, not a true arctangent. It parameterizes each octant
 * linearly -- `128 * min(|dx|,|dy|) / max(|dx|,|dy|)` from the nearer axis
 * (the 8-bit divide `c_0EAA` in hardware; a float divide here) -- so the
 * angle it returns is exactly the one whose octant motion tracks the target.
 * Aiming with a real atan2 instead misses the FB snap window by up to ~4
 * degrees, which is how that deviation was caught.
 *
 * `dx`/`dy` are in raw units, dy up-positive like rawY.
 */
export function directionToAngle(dx, dy) {
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  if (adx === 0 && ady === 0) return 0;

  if (ady <= adx) {
    const f = Math.min(Math.round((ady / adx) * 128), 127);
    if (dx > 0) return dy >= 0 ? f : (ANGLE_UNITS - f) & (ANGLE_UNITS - 1); // octants 0 / 7
    return dy >= 0 ? 512 - f : 512 + f; // octants 3 / 4
  }
  const f = Math.min(Math.round((adx / ady) * 128), 127);
  if (dy > 0) return dx >= 0 ? 256 - f : 256 + f; // octants 1 / 2
  return dx >= 0 ? (768 + f) & (ANGLE_UNITS - 1) : 768 - f; // octants 6 / 5
}

// ------------------------------------------------------ coordinate transforms

/**
 * Raw -> ROM canvas. `sprite_X = rawX * 2` (the rla shift, gg1-5.s:2287);
 * the -10 centring offset is the task's pin for this port. Fractional raw
 * values pass through, so a track is smooth between raw pixels.
 */
export function rawXToCanvasX(rawX) {
  return rawX * 2 - 10;
}

/**
 * Raw -> ROM canvas Y. The cpl chain (gg1-5.s:2305):
 * `sprite_Y = ((~(rawY + 0x4F)) & 0xFF) * 2 + 1`, which for in-range values
 * is the line `353 - 2 * rawY` -- the continuous form used here so fixed-point
 * fractions render smoothly. rawY is up-positive; bigger rawY is higher.
 */
export function rawYToCanvasY(rawY) {
  return 353 - 2 * rawY;
}

/** ROM canvas -> raw, the inverse pair. */
export function canvasToRaw(point) {
  return { rawX: (point.x + 10) / 2, rawY: (353 - point.y) / 2 };
}

/** Where a flight state sits on the ROM canvas. */
export function toCanvas(state) {
  return { x: rawXToCanvasX(state.xFixed / 256), y: rawYToCanvasY(state.yFixed / 256) };
}

/**
 * The screen-space direction of a 10-bit angle, in radians measured the way
 * `Math.atan2(dy, dx)` measures them (y down). The ROM's angle is
 * counter-clockwise-positive with y up, hence the negation.
 */
export function angleToRadians(angle) {
  return -(angle & (ANGLE_UNITS - 1)) * ((Math.PI * 2) / ANGLE_UNITS);
}

// ------------------------------------------------------------- flight state

/**
 * A flight slot, the port of one `bug_motion_que` entry (0x14 bytes).
 *
 * `region` is a `{ z80Base, bytes, subPaths? }` table from `flightData.js`;
 * `pc` indexes into its bytes. Position is 16-bit fixed point per axis (high
 * byte = raw). `spawn` gives raw coordinates directly; use `spawnCanvas` for
 * a ROM-canvas point.
 */
export function createFlightState({
  region,
  pc = 0,
  rawX = 0,
  rawY = 0,
  angle = 0,
  negateRotation = false,
  objectId = 0,
}) {
  return {
    region,
    pc,
    xFixed: rawX * 256,
    yFixed: rawY * 256,
    angle: angle & (ANGLE_UNITS - 1),
    rotRate: 0,
    vx: 0,
    vy: 0,
    // The launcher seeds the expiration counter to 1 (gg1-3.s:1891), so the
    // first fetch happens on the first step.
    segTimer: 1,
    frame: 0,
    negateRotation,
    objectId,
    // FB turn-home state: bit 6 of the ROM flag byte plus the tracked slot.
    homing: false,
    homeRawX: 0,
    homeRawY: 0,
    // FC dive state: bit 5 plus the raw Y reference held in offset 0x06.
    diveArmed: false,
    diveRefRawY: 0,
    /** Set by F6/F5 for the caller; the interpreter only records them. */
    bombArmed: false,
    status: 0,
    /** Terminal flags: done once FF or the home snap lands; homed on snap. */
    done: false,
    homed: false,
    /** True if the stream ran off its region or a token chain never settled. */
    overrun: false,
  };
}

/** Deep-enough copy of a flight state; the region table is shared. */
export function cloneFlightState(state) {
  return { ...state };
}

// ----------------------------------------------------------- token helpers

/**
 * Resolve a 2-byte little-endian address argument against the current
 * region. In-region -> move the pointer; a `subPaths` entry -> switch region
 * (the fly-in F0/F7 targets). Returns false for anything else -- the
 * bonus-bee convoy's out-of-region home tails, which the corpus resolves as
 * TURN_HOME; the caller turns the flight home in place.
 */
function jumpTo(state, addr) {
  const { region } = state;
  if (addr >= region.z80Base && addr < region.z80Base + region.bytes.length) {
    state.pc = addr - region.z80Base;
    return true;
  }
  if (region.subPaths && region.subPaths[addr]) {
    state.region = region.subPaths[addr];
    state.pc = 0;
    return true;
  }
  return false;
}

/**
 * FB TURN_HOME (case_0AA0, gg1-5.s:1768-1846). Reads the live formation slot
 * from the context, stores it as home, computes the approach heading ONCE
 * through `c_0E5B` and sets the homing flag. The glide speed is NOT set
 * here: the Z80 falls through and loads the segment after FB normally,
 * which is why every FB is followed by a tail like `23 00 FF` or `12 00 FF`.
 */
function turnHome(state, context) {
  const home = canvasToRaw(context.homeTarget ?? { x: ROM_CANVAS.width / 2, y: 100 });
  state.homeRawX = home.rawX;
  state.homeRawY = home.rawY;
  const dx = home.rawX - state.xFixed / 256;
  const dy = home.rawY - state.yFixed / 256; // raw is up-positive
  state.angle = directionToAngle(dx, dy);
  state.rotRate = 0;
  state.homing = true;
}

/** The player's sprite X, the register the FE/F3/F4 tokens read. */
function playerSpriteX(context) {
  const canvasX = context.playerX ?? ROM_CANVAS.width / 2;
  return Math.round(canvasX + 10);
}

/** How many token dispatches one fetch may chain before it is garbage. */
const FETCH_GUARD = 32;

/**
 * Fetch at the path pointer until a segment loads or a token ends the frame.
 *
 * Mirrors the `j_090E` loop: FD/FB/F7/FA/F5/F4/F2 chain onward within the
 * same frame; FE/F3/FC return holding the current motion; F8/F9/F1/F6 and
 * the F0/EF gates finalize through `l_0B8B` -- pointer saved, timer set to 1,
 * and the frame ends with NO motion step, the ROM's one-frame stall.
 *
 * Returns 'segment' | 'hold' | 'stall' | 'end'.
 */
function fetch(state, context, events) {
  // A jump whose target is outside every known region is the bonus-bee
  // convoy's home tail: turn home and glide at the current speed.
  const takeJump = (addr) => {
    if (jumpTo(state, addr)) return null;
    turnHome(state, context);
    state.segTimer = 0xff;
    return 'hold';
  };

  for (let guard = 0; guard < FETCH_GUARD; guard += 1) {
    const { bytes } = state.region;
    const op = bytes[state.pc];

    if (op === undefined) {
      // Ran off the region: garbage. The real streams never do this.
      state.done = true;
      state.overrun = true;
      return 'end';
    }

    if (op < 0xef) {
      // 3-byte segment load (l_0BDC): unsigned nibble speeds, signed rotRate
      // negated under the mirror flag (gg1-5.s:2014-2018), duration as-is --
      // a 0 wraps through the 8-bit decrement to ~256 frames.
      state.vx = op & 0x0f;
      state.vy = (op >> 4) & 0x0f;
      const rot = signedByte(bytes[state.pc + 1]);
      // `|| 0` normalizes the negative zero a mirrored zero-rot produces.
      state.rotRate = (state.negateRotation ? -rot : rot) || 0;
      state.segTimer = bytes[state.pc + 2];
      state.pc += 3;
      return 'segment';
    }

    switch (op) {
      case 0xff: // END (case_0E49): deactivate where it stands.
        state.done = true;
        return 'end';

      case 0xfe: {
        // Player-region turn-hold (case_0B16): pick a hold duration from the
        // 8-byte LUT by where the player stands, keep the running turn.
        const shipX = playerSpriteX(context) || 0x80;
        const targetX = ((state.negateRotation ? shipX : 0xf2 - shipX) + 0x0e) & 0xff;
        const idx = Math.min(Math.max(Math.floor(targetX / 0x1e), 1), 8);
        state.segTimer = bytes[state.pc + idx];
        state.pc += 9;
        return 'hold';
      }

      case 0xfd: {
        // JUMP (case_0B46): replace the pointer, keep interpreting.
        const out = takeJump(bytes[state.pc + 1] | (bytes[state.pc + 2] << 8));
        if (out) return out;
        break;
      }

      case 0xfc:
        // Dive origin-Y (case_0B4E): arm the dive reference and skip-load --
        // the timer stays at 0, which the 8-bit decrement wraps to ~255
        // frames of diving until the reference row is reached.
        state.diveRefRawY = bytes[state.pc + 1];
        state.diveArmed = true;
        state.pc += 2;
        return 'hold';

      case 0xfb: // TURN_HOME: aim once, then fall through to the tail segment.
        turnHome(state, context);
        state.pc += 1;
        break;

      case 0xfa: {
        // Loop gate (case_0BD1): keep diving while continuous bombing holds,
        // otherwise jump to the go-home tail.
        if (context.continuousBombing) {
          state.pc += 3;
        } else {
          const out = takeJump(bytes[state.pc + 1] | (bytes[state.pc + 2] << 8));
          if (out) return out;
        }
        break;
      }

      case 0xf9: {
        // Re-enter over the home column (case_0B5F): X := the slot's column.
        const home = canvasToRaw(context.homeTarget ?? { x: ROM_CANVAS.width / 2, y: 100 });
        state.xFixed = home.rawX * 256;
        state.pc += 1;
        state.segTimer = 1;
        return 'stall';
      }

      case 0xf8: // Re-enter at the top edge (case_0B87): rawY := 0x9C.
        state.yFixed = 0x9c * 256;
        state.pc += 1;
        state.segTimer = 1;
        return 'stall';

      case 0xf7: {
        // Transient gate (case_0B98): only caravan fly-through members
        // (objectId 0x38-0x3E) take the swoop branch.
        if ((state.objectId & 0x38) === 0x38) {
          const out = takeJump(bytes[state.pc + 1] | (bytes[state.pc + 2] << 8));
          if (out) return out;
        } else {
          state.pc += 3;
        }
        break;
      }

      case 0xf6: {
        // Free flight (case_0BA8): heading := arg << 2 (mirrored members
        // transform the arg first), and arm bombing -- counter 0x1E and the
        // stage mask, which the caller applies on the event.
        let arg = bytes[state.pc + 1];
        if (state.negateRotation) arg = (-(arg + 0x80)) & 0xff;
        state.angle = (arg << 2) & (ANGLE_UNITS - 1);
        state.bombArmed = true;
        events.push({ type: 'armBombs' });
        state.pc += 2;
        state.segTimer = 1;
        return 'stall';
      }

      case 0xf5: // Status 3 (case_0942): disposition note, then continue.
        state.status = 3;
        events.push({ type: 'status3' });
        state.pc += 1;
        break;

      case 0xf4: {
        // Capture aim (case_0A53): snap the player's sprite X onto the beam
        // grid -- `((x + 3) & 0xF8) | 1` (gg1-5.s:1728-1731, the add/and/inc
        // chain) -- THEN clamp it to the beam band, aim down toward it at
        // dive depth raw 0x48, and arm the capture monitor (emitted as a
        // `captureAim` event; `capture.js` anchors the beam on it).
        const snapped = ((((playerSpriteX(context) + 3) & 0xff) & 0xf8) | 1) & 0xff;
        const clamped = Math.min(Math.max(snapped, 0x29), 0xc9);
        const dx = clamped / 2 - state.xFixed / 256;
        const dy = 0x48 - state.yFixed / 256;
        state.angle = directionToAngle(dx, dy);
        events.push({ type: 'captureAim', targetSpriteX: clamped });
        state.pc += 1;
        break;
      }

      case 0xf3: {
        // Player-delta turn-hold (case_0A01): the red moth's hook. The hold
        // duration comes from the 8-byte LUT indexed by the clamped player
        // offset; the turn the previous segment started keeps running.
        const px = Math.min(Math.max(playerSpriteX(context), 0x1e), 0xd1);
        let a = (px >> 1) - Math.floor(state.xFixed / 256);
        a >>= 1; // arithmetic: net (playerX - mothX) / 4
        if (state.negateRotation) a = -a;
        a += 0x18;
        a = Math.min(Math.max(a, 0), 0x2f);
        state.segTimer = bytes[state.pc + 1 + Math.floor(a / 6)];
        state.pc += 9;
        return 'hold';
      }

      case 0xf2: {
        // Bonus-bee clone split (case_097B): spawn a copy into a transient
        // slot, running this region at the embedded offset. The Z80 copies
        // position, angle and rotation, fixes vx=1/vy=2 and timer=1, and
        // inherits the flag byte; the caller decides whether a slot is free.
        const addr = bytes[state.pc + 1] | (bytes[state.pc + 2] << 8);
        const clone = cloneFlightState(state);
        clone.pc = addr - state.region.z80Base;
        clone.vx = 1;
        clone.vy = 2;
        clone.segTimer = 1;
        clone.done = false;
        clone.homing = false;
        clone.diveArmed = false;
        events.push({ type: 'cloneSplit', clone });
        state.pc += 3;
        break;
      }

      case 0xf1: {
        // Dive-home (case_0968): rawY := home row + 0x20 -- with up-positive
        // raw that is ~64 canvas px ABOVE the top of the slot, the boss
        // re-entry from above.
        const home = canvasToRaw(context.homeTarget ?? { x: ROM_CANVAS.width / 2, y: 100 });
        state.yFixed = (home.rawY + 0x20) * 256;
        state.pc += 1;
        state.segTimer = 1;
        return 'stall';
      }

      case 0xf0: {
        // Stage-8 attack-wave gate (case_0955): parms[8] != 0 replaces the
        // fly-in tail with the harder sub-path; below stage 8 the skip is
        // byte-identical to never having the token.
        const addr = bytes[state.pc + 1] | (bytes[state.pc + 2] << 8);
        if (context.stage8Switch) {
          const out = takeJump(addr);
          if (out) return out;
        } else {
          state.pc += 3;
        }
        state.segTimer = 1;
        return 'stall';
      }

      case 0xef: {
        // Stage-12 bombing gate (case_094E): parms[9] != 0 jumps to the
        // harder continuous pass.
        const addr = bytes[state.pc + 1] | (bytes[state.pc + 2] << 8);
        if (context.stage12Switch) {
          const out = takeJump(addr);
          if (out) return out;
        } else {
          state.pc += 3;
        }
        state.segTimer = 1;
        return 'stall';
      }

      default:
        // Unreachable: every byte 0xEF-0xFF is handled above.
        state.done = true;
        state.overrun = true;
        return 'end';
    }
  }

  // A token chain that never settled (e.g. an FD loop with no segment).
  state.done = true;
  state.overrun = true;
  return 'end';
}

// ------------------------------------------------------------- motion step

/**
 * The octant motion update (gg1-5.s:2150-2270) -- NOT a circular cos/sin.
 *
 * The magnitude `A` alternates between vx and vy by the parity of the
 * GLOBAL frame counter (`ds3_92A0_frame_cts`, gg1-5.s:2151-2158: odd frames
 * take 0x0A(ix) = vx, even take 0x0B(ix) = vy), so every slot on the board
 * switches axes in lockstep. The axis nearer the heading (selected by angle
 * bit7 XOR bit8) receives the FULL magnitude, `A << 7` on the fixed-point
 * coordinate; the other axis receives the `c_0E97` product `A * L`, where L
 * folds the low angle byte onto the nearer axis (0-127). Primary is negated
 * over 135-315 degrees (octants 3-6), the secondary in octants 2, 4, 5 and
 * 7. Net: speed is `A` canvas px/frame axis-aligned and grows toward
 * ~A*sqrt(2) on the diagonals, which is why the circular stand-in this
 * replaced ran fly-ins 30-40% slow.
 */
function moveState(state, frameCount) {
  const A = frameCount & 1 ? state.vx : state.vy;
  if (A === 0) return;

  const angle = state.angle & (ANGLE_UNITS - 1);
  const octant = angle >> 7; // bits 9:7
  const low = angle & 0xff;
  const primaryIsY = ((angle >> 7) & 1) ^ ((angle >> 8) & 1);
  const primary = (octant >= 3 && octant <= 6 ? -A : A) * 128;
  const fold = low & 0x80 ? ~low & 0x7f : low & 0x7f;
  const secondary = (octant === 2 || octant === 4 || octant === 5 || octant === 7 ? -1 : 1) * fold * A;

  if (primaryIsY) {
    state.yFixed += primary;
    state.xFixed += secondary;
  } else {
    state.xFixed += primary;
    state.yFixed += secondary;
  }
}

// --------------------------------------------------------------- the frame

/**
 * One hardware frame of one flight (the `f_08D3` per-slot body). Mutates
 * `state` and returns the events the frame raised. `context` carries the
 * live inputs the tokens read:
 *
 * - `playerX`      player centre on the ROM canvas (FE, F3, F4)
 * - `homeTarget`   the formation slot, ROM canvas `{x, y}`; it may move
 *                  every frame -- the formation sways -- and the glide rides
 *                  the drift the way `case_2422` re-syncs it
 * - `stage8Switch`, `stage12Switch` from the stage's difficulty row
 * - `continuousBombing` from the attack scheduler (the FA gate)
 * - `frameCount`   the GLOBAL hardware frame counter (`ds3_92A0_frame_cts`),
 *                  whose parity picks vx or vy this frame; absent, the
 *                  slot's own step count stands in
 *
 * Order is the Z80's: timer/fetch, homing check, FC check, motion on the
 * pre-increment angle, then the angle update -- and the F8/F9/F1/F6/F0/EF
 * `l_0B8B` finalize ends the frame with no motion at all, the ROM's
 * one-frame stall.
 */
export function stepFlight(state, context = {}) {
  const events = [];
  if (state.done) return events;

  // dec 0x0D, fetch on zero. The 8-bit wrap is what makes a timer left at 0
  // (FC, or a duration byte of 0) run ~256 frames.
  state.segTimer = (state.segTimer - 1) & 0xff;
  if (state.segTimer === 0) {
    const outcome = fetch(state, context, events);
    if (outcome === 'end' || outcome === 'stall') return events;
  }

  // Homing (l_0C05): ride the live slot's drift, snap within +/-1 raw
  // (= +/-2 canvas px) on both axes. In the ROM the internal position homes
  // on the static slot origin while the renderer adds the re-synced sway
  // offset every frame (case_2422, gg1-3.s:826-848); shifting the position
  // by the target's drift is the same geometry with one set of coordinates.
  if (state.homing) {
    const home = context.homeTarget
      ? canvasToRaw(context.homeTarget)
      : { rawX: state.homeRawX, rawY: state.homeRawY };
    state.xFixed += (home.rawX - state.homeRawX) * 256;
    state.yFixed += (home.rawY - state.homeRawY) * 256;
    state.homeRawX = home.rawX;
    state.homeRawY = home.rawY;

    if (
      Math.abs(state.xFixed / 256 - home.rawX) <= 1 &&
      Math.abs(state.yFixed / 256 - home.rawY) <= 1
    ) {
      state.xFixed = home.rawX * 256;
      state.yFixed = home.rawY * 256;
      state.done = true;
      state.homed = true;
      events.push({ type: 'homed' });
      return events;
    }
  }

  // FC dive reference (l_0C2D): reaching the stored row expires the segment
  // on the next frame. The Z80 compares the INTEGER position byte 0x01(ix)
  // against the reference (gg1-5.s:2060-2064: `sub 0x06(ix)`, expire on 0,
  // `inc a`, expire on -1), so the window is floor(rawY) in {ref-1, ref}.
  if (state.diveArmed) {
    const intY = Math.floor(state.yFixed / 256);
    if (intY === state.diveRefRawY || intY === state.diveRefRawY - 1) {
      state.segTimer = 1;
      state.diveArmed = false;
    }
  }

  // The octant move, then the angle update (l_0C46 onward): the Z80 stores
  // `angle + rotRate` first but moves on the registers it saved BEFORE the
  // add (E/D loaded at gg1-5.s:2081-2086, consumed at 2170-2181), so motion
  // rides the PRE-increment angle. Move-then-add is the same machine with
  // one copy of the state. The parity source is the context's global frame
  // counter; the per-slot count stands in for standalone states.
  const frameCount = context.frameCount ?? state.frame;
  state.frame += 1;
  moveState(state, frameCount);
  state.angle = (state.angle + state.rotRate) & (ANGLE_UNITS - 1);

  return events;
}

/** Whether a state has left the fly-through despawn box. */
export function isDespawned(state) {
  const { x, y } = toCanvas(state);
  return x < DESPAWN_MARGINS.left || x > DESPAWN_MARGINS.right || y > DESPAWN_MARGINS.bottom;
}

// ------------------------------------------------------------------ tracks

/** Wrap sampled points as the track object the path evaluators consume. */
export function asTrack(points) {
  return { kind: 'track', points };
}

/** How long a track takes at the cabinet's frame rate. */
export function trackDurationMs(track) {
  return (track.points.length - 1) * FRAME_MS;
}

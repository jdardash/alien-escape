import { describe, expect, it } from 'vitest';

import {
  ANGLE_UNITS,
  DESPAWN_MARGINS,
  FRAME_MS,
  PATHCODE_FPS,
  ROM_CANVAS,
  angleToRadians,
  asTrack,
  canvasToRaw,
  createFlightState,
  directionToAngle,
  isDespawned,
  rawXToCanvasX,
  rawYToCanvasY,
  stepFlight,
  toCanvas,
  trackDurationMs,
} from '../src/systems/pathcode.js';

/** A one-off region for a byte stream, based at zero. */
const region = (bytes, subPaths) => ({ z80Base: 0, bytes, subPaths });

/** A state parked mid-field pointing canvas-down, ready to run `bytes`. */
const stateFor = (bytes, overrides = {}) =>
  createFlightState({
    region: region(bytes, overrides.subPaths),
    rawX: 0x40,
    rawY: 0x80,
    angle: 0x300,
    ...overrides,
  });

/** Step a state N frames, collecting every event raised. */
const run = (state, frames, context = {}) => {
  const events = [];
  for (let i = 0; i < frames && !state.done; i += 1) {
    events.push(...stepFlight(state, context));
  }
  return events;
};

describe('the coordinate transforms', () => {
  it('maps the db_2A6C spawn rows onto the documented canvas points', () => {
    // Variant 0: rawY 0x9B, rawX 0x34 -> canvas (94, 43); its pair partner
    // rawX 0x44 -> x 126. Bottom entrance rawY 0x23 -> y 283.
    expect(rawXToCanvasX(0x34)).toBe(94);
    expect(rawXToCanvasX(0x44)).toBe(126);
    expect(rawYToCanvasY(0x9b)).toBe(43);
    expect(rawYToCanvasY(0x23)).toBe(283);
  });

  it('matches the ROM cpl chain: canvasY = ((~(rawY + 0x4F)) & 0xFF) * 2 + 1', () => {
    for (const rawY of [0x10, 0x23, 0x48, 0x80, 0x9b, 0x9c]) {
      expect(rawYToCanvasY(rawY)).toBe(((~(rawY + 0x4f)) & 0xff) * 2 + 1);
    }
  });

  it('round-trips canvas to raw and back', () => {
    const raw = canvasToRaw({ x: 94, y: 43 });
    expect(raw).toEqual({ rawX: 0x34, rawY: 0x9b });
    expect(rawXToCanvasX(raw.rawX)).toBe(94);
    expect(rawYToCanvasY(raw.rawY)).toBe(43);
  });

  it('keeps the ROM canvas at the hardware 224 x 288', () => {
    expect(ROM_CANVAS).toEqual({ width: 224, height: 288 });
  });
});

describe('segment decode and the segment timer', () => {
  it('splits byte 0 into unsigned vy/vx nibbles and signs byte 1', () => {
    const state = stateFor([0x23, 0xf0, 0x10, 0xff]);
    stepFlight(state, {});
    expect(state.vx).toBe(3);
    expect(state.vy).toBe(2);
    expect(state.rotRate).toBe(-16);
  });

  it('negates every loaded rotRate under the mirror flag', () => {
    const state = stateFor([0x23, 0xf0, 0x10, 0xff], { negateRotation: true });
    stepFlight(state, {});
    expect(state.rotRate).toBe(16);
  });

  it('runs a segment for exactly its duration byte in frames', () => {
    // 6 frames of rot +4, then FF: the angle advances 4 per frame from the
    // frame the segment loads.
    const state = stateFor([0x00, 0x04, 0x06, 0xff]);
    run(state, 6);
    expect(state.angle).toBe(0x300 + 24);
    expect(state.done).toBe(false);
    stepFlight(state, {});
    expect(state.done).toBe(true);
  });

  it('wraps a zero duration through the 8-bit decrement to ~256 frames', () => {
    // Duration byte 0: dec 0 -> 0xFF, so the segment holds for 256 frames.
    const state = stateFor([0x00, 0x01, 0x00, 0xff]);
    run(state, 256);
    expect(state.done).toBe(false);
    expect(state.angle).toBe((0x300 + 256) & (ANGLE_UNITS - 1));
    stepFlight(state, {});
    expect(state.done).toBe(true);
  });

  it('spins in place on a zero speed byte, the bonus-path 00 idiom', () => {
    // `00 40 08` = half-revolution spin over 8 frames, no movement.
    const state = stateFor([0x00, 0x40, 0x08, 0xff]);
    const before = toCanvas(state);
    run(state, 8);
    const after = toCanvas(state);
    expect(after).toEqual(before);
    expect(state.angle).toBe((0x300 + 0x40 * 8) & (ANGLE_UNITS - 1));
  });
});

describe('the octant motion model', () => {
  /** Average canvas px/frame over 100 frames of a straight 0x33 segment. */
  const speedAt = (angle) => {
    const state = stateFor([0x33, 0x00, 0xff, 0xff], { angle });
    const before = toCanvas(state);
    run(state, 100);
    const after = toCanvas(state);
    return Math.hypot(after.x - before.x, after.y - before.y) / 100;
  };

  it('moves at the full magnitude along the axes', () => {
    expect(speedAt(0)).toBeCloseTo(3, 6);
    expect(speedAt(256)).toBeCloseTo(3, 6);
    expect(speedAt(512)).toBeCloseTo(3, 6);
    expect(speedAt(768)).toBeCloseTo(3, 6);
  });

  it('exceeds the axis speed on diagonals, up to ~sqrt(2)x -- NOT circular', () => {
    // Primary axis carries the full A<<7 while the secondary adds A*L; at
    // 45 degrees L = 127 of 128, so the speed is close to A*sqrt(2). The
    // circular cos/sin stand-in this replaced was ~30% slow here.
    const diagonal = speedAt(128);
    expect(diagonal).toBeGreaterThan(3 * 1.3);
    expect(diagonal).toBeLessThanOrEqual(3 * Math.SQRT2 + 1e-9);
    expect(speedAt(384)).toBeCloseTo(diagonal, 3);
    expect(speedAt(640)).toBeCloseTo(diagonal, 3);
    expect(speedAt(896)).toBeCloseTo(diagonal, 3);
  });

  it('moves canvas-down at angle 768, the 270-degree equivalent', () => {
    const state = stateFor([0x23, 0x00, 0x20, 0xff], { angle: 768 });
    const before = toCanvas(state);
    run(state, 16);
    const after = toCanvas(state);
    expect(after.y).toBeGreaterThan(before.y);
    expect(after.x).toBeCloseTo(before.x, 6);
  });

  it('moves canvas-up at 256, right at 0 and left at 512', () => {
    for (const [angle, dx, dy] of [
      [256, 0, -1],
      [0, 1, 0],
      [512, -1, 0],
    ]) {
      const state = stateFor([0x23, 0x00, 0x20, 0xff], { angle });
      const before = toCanvas(state);
      run(state, 16);
      const after = toCanvas(state);
      expect(Math.sign(Math.round(after.x - before.x))).toBe(dx);
      expect(Math.sign(Math.round(after.y - before.y))).toBe(dy);
    }
  });

  it('alternates the vx/vy magnitudes by frame parity', () => {
    // vx 4, vy 0 straight down: only every second frame moves.
    const state = stateFor([0x04, 0x00, 0x10, 0xff], { angle: 768 });
    const y0 = toCanvas(state).y;
    stepFlight(state, {}); // frame 0: A = vy = 0
    const y1 = toCanvas(state).y;
    stepFlight(state, {}); // frame 1: A = vx = 4
    const y2 = toCanvas(state).y;
    expect(y1).toBe(y0);
    expect(y2).toBeGreaterThan(y1);
  });

  it('reads the GLOBAL frame counter for the parity when the context carries one', () => {
    // gg1-5.s:2151-2158: `ld a,(ds3_92A0_frame_cts)` -- odd frames take vx,
    // even take vy, whatever the slot's private step count says.
    const odd = stateFor([0x04, 0x00, 0x10, 0xff], { angle: 768 });
    const y0 = toCanvas(odd).y;
    stepFlight(odd, { frameCount: 1 }); // odd -> A = vx = 4: moves at once
    expect(toCanvas(odd).y).toBeGreaterThan(y0);

    const even = stateFor([0x04, 0x00, 0x10, 0xff], { angle: 768 });
    stepFlight(even, { frameCount: 2 }); // even -> A = vy = 0: holds
    expect(toCanvas(even).y).toBe(y0);
  });

  it('moves on the PRE-increment angle: the frame a turn starts still moves straight', () => {
    // l_0C46 stores angle + rotRate but the octant move consumes the E/D
    // registers saved before the add (gg1-5.s:2081-2086, 2170-2181). With
    // rot 0x40 from angle 0, the first frame's motion is pure +x; the
    // stored angle is already 0x40 for the next frame.
    const state = stateFor([0x11, 0x40, 0x04, 0xff], { angle: 0 });
    stepFlight(state, { frameCount: 1 }); // odd -> A = vx = 1
    expect(state.angle).toBe(0x40);
    expect(state.xFixed).toBe(0x40 * 256 + 128);
    expect(state.yFixed).toBe(0x80 * 256);
  });

  it('mirrors a turning flight about its spawn under negate-rotation', () => {
    // Same spawn, canvas-down start: the negated twin reflects about the
    // spawn column. The octant fold is one count asymmetric (L vs 127-L),
    // so the reflection holds to within a few canvas px, not exactly.
    const bytes = [0x23, 0x06, 0x30, 0x23, 0xfa, 0x20, 0xff];
    const plain = stateFor(bytes);
    const negated = stateFor(bytes, { negateRotation: true });
    for (let i = 0; i < 80; i += 1) {
      stepFlight(plain, {});
      stepFlight(negated, {});
      const a = toCanvas(plain);
      const b = toCanvas(negated);
      expect(Math.abs(a.x - rawXToCanvasX(0x40) - (rawXToCanvasX(0x40) - b.x))).toBeLessThan(4);
      expect(Math.abs(a.y - b.y)).toBeLessThan(4);
    }
  });
});

describe('directionToAngle (c_0E5B)', () => {
  it('returns the axis angles exactly', () => {
    expect(directionToAngle(1, 0)).toBe(0);
    expect(directionToAngle(0, 1)).toBe(256 - 0); // straight up folds to 256
    expect(directionToAngle(-1, 0)).toBe(512);
    expect(directionToAngle(0, -1)).toBe(768);
  });

  it('is the inverse of the octant motion: aiming with it tracks the target', () => {
    // Fly straight at the angle it returns; the miss distance at closest
    // approach must be inside the +/-1 raw snap window. A true atan2 heading
    // misses by several px on off-axis targets, which is the bug this pins.
    for (const target of [{ dx: 37, dy: -80 }, { dx: -53, dy: -21 }, { dx: 61, dy: 44 }]) {
      const angle = directionToAngle(target.dx, target.dy);
      const state = stateFor([0x23, 0x00, 0xff, 0xff], { angle });
      const goal = { x: rawXToCanvasX(0x40 + target.dx), y: rawYToCanvasY(0x80 + target.dy) };
      let best = Infinity;
      for (let i = 0; i < 200; i += 1) {
        stepFlight(state, {});
        const { x, y } = toCanvas(state);
        best = Math.min(best, Math.hypot(x - goal.x, y - goal.y));
      }
      expect(best).toBeLessThan(2.5);
    }
  });
});

describe('token semantics', () => {
  it('FF deactivates where it stands', () => {
    const state = stateFor([0xff]);
    stepFlight(state, {});
    expect(state.done).toBe(true);
    expect(state.homed).toBe(false);
  });

  it('FD replaces the pointer unconditionally', () => {
    // Jump over a poison segment to a spin at address 6.
    const state = stateFor([0xfd, 0x06, 0x00, 0xff, 0xff, 0xff, 0x00, 0x08, 0x04, 0xff]);
    stepFlight(state, {});
    expect(state.rotRate).toBe(8);
    expect(state.done).toBe(false);
  });

  it('FB aims home once, glides at the tail speed and snaps within 2 canvas px', () => {
    const state = stateFor([0xfb, 0x23, 0x00, 0xff, 0xff]);
    const homeTarget = { x: 40, y: 60 };
    const events = run(state, 400, { homeTarget });
    expect(state.done).toBe(true);
    expect(state.homed).toBe(true);
    expect(events.some((e) => e.type === 'homed')).toBe(true);
    const end = toCanvas(state);
    expect(end.x).toBeCloseTo(homeTarget.x, 6);
    expect(end.y).toBeCloseTo(homeTarget.y, 6);
    // The tail `23 00 FF` supplied the glide: vx 3 / vy 2, rot 0.
    expect(state.vx).toBe(3);
    expect(state.vy).toBe(2);
    expect(state.rotRate).toBe(0);
  });

  it('FB homing converges onto a MOVING target, riding the formation sway', () => {
    const state = stateFor([0xfb, 0x23, 0x00, 0xff, 0xff]);
    let frame = 0;
    let target = { x: 112, y: 60 };
    while (!state.done && frame < 600) {
      target = { x: 112 + Math.sin(frame / 25) * 16, y: 60 };
      stepFlight(state, { homeTarget: target });
      frame += 1;
    }
    expect(state.homed).toBe(true);
    const end = toCanvas(state);
    expect(end.x).toBeCloseTo(target.x, 6);
    expect(end.y).toBeCloseTo(target.y, 6);
  });

  it('FA loops while continuous bombing holds and goes home when it stops', () => {
    // Loop body: a segment, then FA back past it to the home tail at 8.
    const bytes = [0x23, 0x00, 0x04, 0xfa, 0x08, 0x00, 0x23, 0x00, 0xfb, 0x23, 0x00, 0xff, 0xff];
    const looping = stateFor(bytes);
    run(looping, 300, { continuousBombing: true, homeTarget: { x: 112, y: 60 } });
    expect(looping.done).toBe(false);

    const homing = stateFor(bytes);
    run(homing, 600, { continuousBombing: false, homeTarget: { x: 112, y: 60 } });
    expect(homing.homed).toBe(true);
  });

  it('F0 skips three bytes below stage 8 and jumps at stage 8+', () => {
    const sub = { z80Base: 0x100, bytes: [0x00, 0x0c, 0x04, 0xff] };
    const bytes = [0xf0, 0x00, 0x01, 0x00, 0x04, 0x06, 0xff];
    const early = stateFor(bytes, { subPaths: { 0x100: sub } });
    run(early, 3, { stage8Switch: false });
    expect(early.rotRate).toBe(4); // fell through to the inline segment

    const late = stateFor(bytes, { subPaths: { 0x100: sub } });
    run(late, 3, { stage8Switch: true });
    expect(late.rotRate).toBe(12); // took the sub-path
    expect(late.region).toBe(sub);
  });

  it('EF gates the same way on the stage-12 switch', () => {
    const sub = { z80Base: 0x200, bytes: [0x00, 0x0a, 0x04, 0xff] };
    const bytes = [0xef, 0x00, 0x02, 0x00, 0x02, 0x06, 0xff];
    const off = stateFor(bytes, { subPaths: { 0x200: sub } });
    run(off, 3, { stage12Switch: false });
    expect(off.rotRate).toBe(2);

    const on = stateFor(bytes, { subPaths: { 0x200: sub } });
    run(on, 3, { stage12Switch: true });
    expect(on.rotRate).toBe(10);
  });

  it('F7 branches only for transient object ids (0x38-0x3E)', () => {
    const sub = { z80Base: 0x300, bytes: [0x00, 0x07, 0x04, 0xff] };
    const bytes = [0xf7, 0x00, 0x03, 0x00, 0x01, 0x06, 0xff];
    const formation = stateFor(bytes, { subPaths: { 0x300: sub }, objectId: 0x14 });
    run(formation, 3, {});
    expect(formation.rotRate).toBe(1);

    const transient = stateFor(bytes, { subPaths: { 0x300: sub }, objectId: 0x3a });
    run(transient, 3, {});
    expect(transient.rotRate).toBe(7);
  });

  it('FE holds the running turn for a duration read from the player-position LUT', () => {
    const lut = [0x30, 0x2c, 0x28, 0x24, 0x20, 0x1c, 0x18, 0x14];
    const bytes = [0x23, 0x04, 0x02, 0xfe, ...lut, 0x00, 0x00, 0x04, 0xff];
    // idx = clamp(floor(((0xF2 - (playerX + 10)) + 0x0E) / 0x1E), 1, 8);
    // playerX 10 -> spriteX 20 -> targetX 0xEC -> idx 7 -> LUT[6] = 0x18.
    const state = stateFor(bytes);
    run(state, 3, { playerX: 10 });
    expect(state.segTimer).toBe(lut[6]);
    expect(state.rotRate).toBe(4); // the turn keeps running through the hold

    // A player at the far right lands in the first LUT slot instead.
    const other = stateFor(bytes);
    run(other, 3, { playerX: 200 });
    expect(other.segTimer).toBe(lut[0]);
  });

  it('F3 holds the turn for a duration picked by the player delta', () => {
    const lut = [0x3f, 0x3b, 0x36, 0x32, 0x28, 0x26, 0x24, 0x22];
    const bytes = [0x23, 0x04, 0x02, 0xf3, ...lut, 0x00, 0x00, 0x04, 0xff];
    // Moth at rawX 0x40 (sprite 0x80). Player under it: a = 0 + 0x18 = 24,
    // idx 4 -> LUT[4]. Player far left: clamp 0x1E -> a = (15-64)>>1 = -25
    // (asr) -> +24 = -1 -> clamp 0 -> idx 0.
    const under = stateFor(bytes);
    run(under, 3, { playerX: 118 });
    expect(under.segTimer).toBe(lut[4]);

    const left = stateFor(bytes);
    run(left, 3, { playerX: 0 });
    expect(left.segTimer).toBe(lut[0]);
  });

  it('FC dives at the running speed until the reference row, wrapping the timer', () => {
    // Straight down at vy/vx 2, FC 0x60: the segment expired when FC loaded,
    // so the timer wraps and the dive persists until rawY reaches 0x60.
    const bytes = [0x22, 0x00, 0x02, 0xfc, 0x60, 0x22, 0x00, 0x08, 0xff];
    const state = stateFor(bytes, { rawY: 0x80, angle: 768 });
    run(state, 3, {});
    expect(state.diveArmed).toBe(true);
    let frames = 0;
    while (state.diveArmed && frames < 300) {
      stepFlight(state, {});
      frames += 1;
    }
    expect(state.diveArmed).toBe(false);
    // 0x80 -> 0x60 raw at 1 raw/frame is ~32 frames -- reached, not timed out.
    expect(frames).toBeLessThan(40);
    expect(state.yFixed / 256).toBeLessThanOrEqual(0x60);
    // The follow-on segment loads on the next fetch and the stream ends.
    run(state, 10, {});
    expect(state.done).toBe(true);
  });

  it('FC triggers on the INTEGER row: floor(rawY) equal to the reference or one below', () => {
    // The Z80 compares the integer position byte 0x01(ix) (gg1-5.s:2060-2064:
    // expire on 0 or -1), so a fractional overshoot of the row still fires
    // and anything whose integer part is past ref+1 or below ref-2 does not.
    const armed = (rawY) => {
      const state = stateFor([0x00, 0x00, 0x10, 0xff], { rawY });
      state.diveArmed = true;
      state.diveRefRawY = 0x60;
      stepFlight(state, {});
      return state.diveArmed;
    };
    expect(armed(0x60 + 0.5)).toBe(false); // floor 0x60 == ref: fires
    expect(armed(0x5f + 0.75)).toBe(false); // floor 0x5F == ref - 1: fires
    expect(armed(0x61 + 0.25)).toBe(true); // floor 0x61: outside the window
    expect(armed(0x5e + 0.9)).toBe(true); // floor 0x5E: outside the window
  });

  it('F6 sets free-flight heading from its argument and arms bombing', () => {
    const state = stateFor([0xf6, 0xc0, 0x23, 0x00, 0x08, 0xff]);
    const events = run(state, 2, {});
    expect(state.angle).toBe(0xc0 << 2); // 768: straight down
    expect(state.bombArmed).toBe(true);
    expect(events.some((e) => e.type === 'armBombs')).toBe(true);
  });

  it('F6 mirrors its argument for a negate-rotation member', () => {
    const state = stateFor([0xf6, 0xb0, 0x23, 0x00, 0x08, 0xff], { negateRotation: true });
    run(state, 2, {});
    expect(state.angle).toBe(((-(0xb0 + 0x80)) & 0xff) << 2);
  });

  it('F8 teleports to the top edge and F9 over the home column', () => {
    // Each token spends the ROM's one-frame stall, so two frames see both.
    const state = stateFor([0xf8, 0xf9, 0x23, 0x00, 0x08, 0xff], { rawY: 0x10, rawX: 0x10 });
    run(state, 2, { homeTarget: { x: 94, y: 100 } });
    expect(state.yFixed / 256).toBe(0x9c);
    expect(rawXToCanvasX(state.xFixed / 256)).toBe(94);
  });

  it('F1 re-enters 0x20 raw above the home row', () => {
    const homeTarget = { x: 94, y: 100 };
    const state = stateFor([0xf1, 0x23, 0x00, 0x08, 0xff], { rawY: 0x10 });
    run(state, 1, { homeTarget });
    expect(state.yFixed / 256).toBe(canvasToRaw(homeTarget).rawY + 0x20);
  });

  it('F5 records status 3 and continues in the same frame', () => {
    const state = stateFor([0xf5, 0x00, 0x02, 0x04, 0xff]);
    const events = [...stepFlight(state, {})];
    expect(state.status).toBe(3);
    expect(events.some((e) => e.type === 'status3')).toBe(true);
    expect(state.rotRate).toBe(2); // the segment after F5 loaded this frame
  });

  it('F4 aims down toward the clamped player column and raises the capture event', () => {
    // playerX 200 -> sprite X 210 -> snap 0xD1, past the band -> clamp 0xC9.
    const state = stateFor([0xf4, 0x12, 0x00, 0x04, 0xff], { rawX: 0x40, rawY: 0x80 });
    const events = [...stepFlight(state, { playerX: 200 })];
    const aim = events.find((e) => e.type === 'captureAim');
    expect(aim.targetSpriteX).toBe(0xc9); // clamped to the beam band
    // Heading points into the canvas-down half.
    expect(state.angle).toBeGreaterThan(512);
    expect(state.angle).toBeLessThan(1024);
  });

  it('F4 snaps the in-band aim onto the beam grid: ((x + 3) & 0xF8) | 1', () => {
    // case_0A53 (gg1-5.s:1728-1731): add 3, mask to the 8-px grid, set the
    // low bit. playerX 118 -> sprite X 128 -> (131 & 0xF8) | 1 = 0x81.
    const state = stateFor([0xf4, 0x12, 0x00, 0x04, 0xff]);
    const events = [...stepFlight(state, { playerX: 118 })];
    expect(events.find((e) => e.type === 'captureAim').targetSpriteX).toBe(0x81);
  });

  it('F2 emits a clone running the same region at the embedded offset', () => {
    const bytes = [0xf2, 0x06, 0x00, 0x23, 0x00, 0x04, 0x00, 0x08, 0x02, 0xff];
    const state = stateFor(bytes, { negateRotation: true });
    const events = [...stepFlight(state, {})];
    const split = events.find((e) => e.type === 'cloneSplit');
    expect(split).toBeDefined();
    // The clone copies position and flags, takes vx 1 / vy 2 and timer 1,
    // and starts at the embedded stream (gg1-5.s:1564-1633).
    expect(split.clone.pc).toBe(6);
    expect(split.clone.vx).toBe(1);
    expect(split.clone.vy).toBe(2);
    expect(split.clone.negateRotation).toBe(true);
    expect(split.clone.xFixed).toBe(state.xFixed);
    // The leader continued past the token into its own segment.
    expect(state.rotRate).toBe(0);
    expect(state.vx).toBe(3);
  });

  it('treats an out-of-region jump as TURN_HOME, the convoy home-tail case', () => {
    const state = stateFor([0x23, 0x00, 0x02, 0xfd, 0x00, 0x99]);
    const homeTarget = { x: 100, y: 80 };
    run(state, 400, { homeTarget });
    expect(state.homed).toBe(true);
    expect(state.overrun).toBe(false);
  });

  it('flags a stream that runs off its region instead of reading garbage', () => {
    const state = stateFor([0x23, 0x00, 0x02]);
    run(state, 10, {});
    expect(state.done).toBe(true);
    expect(state.overrun).toBe(true);
  });
});

describe('despawn margins', () => {
  it('uses the ROM fly-through margins', () => {
    expect(DESPAWN_MARGINS).toEqual({ left: -24, right: 248, bottom: 304 });
    const inside = stateFor([0xff], { rawX: 0x40, rawY: 0x80 });
    expect(isDespawned(inside)).toBe(false);
    const below = stateFor([0xff], { rawX: 0x40, rawY: 0x10 });
    expect(isDespawned(below)).toBe(true);
  });
});

describe('angles and tracks', () => {
  it('converts the 10-bit angle to screen radians: 768 is straight down', () => {
    // atan2 convention, y down: down = +PI/2 (mod 2 PI).
    const down = angleToRadians(768);
    expect(Math.cos(down)).toBeCloseTo(0, 6);
    expect(Math.sin(down)).toBeCloseTo(1, 6);
    const right = angleToRadians(0);
    expect(Math.cos(right)).toBeCloseTo(1, 6);
  });

  it('measures a track at the cabinet frame rate', () => {
    const track = asTrack(Array.from({ length: 61 }, () => ({ x: 0, y: 0 })));
    expect(trackDurationMs(track)).toBeCloseTo(60 * FRAME_MS, 6);
    expect(PATHCODE_FPS).toBeCloseTo(60.606061, 3);
  });
});

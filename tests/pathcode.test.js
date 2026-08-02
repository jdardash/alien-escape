import { describe, expect, it } from 'vitest';

import {
  FRAME_MS,
  PATH_END,
  PATHCODE_FPS,
  TURN_UNITS_PER_CIRCLE,
  compileHoming,
  compileProgram,
  decodePathProgram,
  headingToVector,
  mirrorTrack,
  trackDurationMs,
} from '../src/systems/pathcode.js';

describe('decodePathProgram', () => {
  it('decodes byte pairs into signed turn deltas and frame counts', () => {
    const program = decodePathProgram([0x02, 10, 0xfe, 5, PATH_END]);
    expect(program).toEqual([
      { turn: 2, frames: 10 },
      { turn: -2, frames: 5 },
    ]);
  });

  it('stops at the terminator even with trailing bytes', () => {
    const program = decodePathProgram([0x00, 4, PATH_END, 0x55, 0x55]);
    expect(program).toEqual([{ turn: 0, frames: 4 }]);
  });

  it('rejects a program with no terminator', () => {
    expect(() => decodePathProgram([0x00, 4])).toThrow();
  });

  it('rejects a step with zero frames', () => {
    expect(() => decodePathProgram([0x00, 0, PATH_END])).toThrow();
  });
});

describe('headingToVector', () => {
  it('points up at heading 0 and right at a quarter turn', () => {
    const up = headingToVector(0);
    expect(up.x).toBeCloseTo(0, 6);
    expect(up.y).toBeCloseTo(-1, 6);

    const right = headingToVector(TURN_UNITS_PER_CIRCLE / 4);
    expect(right.x).toBeCloseTo(1, 6);
    expect(right.y).toBeCloseTo(0, 6);
  });
});

describe('compileProgram', () => {
  it('flies straight when the turn delta is zero', () => {
    const program = decodePathProgram([0x00, 10, PATH_END]);
    const { points, state } = compileProgram(
      { x: 0, y: 0, heading: TURN_UNITS_PER_CIRCLE / 4, speed: 4 },
      program,
    );

    // One point per frame plus the start.
    expect(points).toHaveLength(11);
    expect(points[10].x).toBeCloseTo(40, 6);
    expect(points[10].y).toBeCloseTo(0, 6);
    expect(state.heading).toBe(TURN_UNITS_PER_CIRCLE / 4);
  });

  it('returns near its start after turning through a full circle', () => {
    // 4 units a frame for 64 frames is exactly 256 units: one full turn.
    const program = decodePathProgram([0x04, 64, PATH_END]);
    const { points } = compileProgram({ x: 100, y: 100, heading: 128, speed: 3 }, program);

    const last = points[points.length - 1];
    // A polygonal circle does not land exactly on its start, but it is close
    // relative to the circumference it traced (64 * 3 = 192px around).
    expect(Math.hypot(last.x - 100, last.y - 100)).toBeLessThan(6);
  });
});

describe('compileHoming', () => {
  it('steers onto the target and ends exactly there', () => {
    const state = { x: 0, y: 0, heading: 128, speed: 5 };
    const { points } = compileHoming(state, { x: 120, y: 300 }, { maxTurn: 8 });

    const last = points[points.length - 1];
    expect(last).toEqual({ x: 120, y: 300 });
  });

  it('never exceeds the turn clamp on the way', () => {
    const state = { x: 0, y: 0, heading: 0, speed: 5 };
    const maxTurn = 3;
    const { headings } = compileHoming(state, { x: 0, y: 400 }, { maxTurn, trace: true });

    for (let i = 1; i < headings.length; i += 1) {
      let diff = headings[i] - headings[i - 1];
      // Wrap to the shortest signed distance around the circle.
      diff = ((diff + 128) % 256 + 256) % 256 - 128;
      expect(Math.abs(diff)).toBeLessThanOrEqual(maxTurn + 1e-9);
    }
  });

  it('gives up and snaps after maxFrames rather than orbiting forever', () => {
    // A target inside the turning circle is unreachable by clamped steering.
    const state = { x: 0, y: 0, heading: 64, speed: 10 };
    const { points } = compileHoming(state, { x: 0, y: 5 }, { maxTurn: 1, maxFrames: 50 });

    expect(points.length).toBeLessThanOrEqual(52);
    expect(points[points.length - 1]).toEqual({ x: 0, y: 5 });
  });
});

describe('mirrorTrack', () => {
  it('reflects every point about the screen centre line', () => {
    const track = { kind: 'track', points: [{ x: 10, y: 5 }, { x: 30, y: 9 }] };
    const mirrored = mirrorTrack(track, 100);

    expect(mirrored.points).toEqual([{ x: 90, y: 5 }, { x: 70, y: 9 }]);
    // The original is untouched.
    expect(track.points[0].x).toBe(10);
  });
});

describe('trackDurationMs', () => {
  it('is the frame count over the arcade frame rate', () => {
    const track = { kind: 'track', points: Array.from({ length: 61 }, () => ({ x: 0, y: 0 })) };
    expect(trackDurationMs(track)).toBeCloseTo(60 * FRAME_MS, 6);
    expect(PATHCODE_FPS).toBeCloseTo(60.606061, 3);
  });
});

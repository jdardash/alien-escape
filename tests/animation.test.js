import { describe, it, expect } from 'vitest';
import {
  flapFrameAt,
  quantizeHeading,
  explosionFrameAt,
  spinAngleAt,
} from '../src/systems/animation.js';
import { ANIMATION } from '../src/config.js';

const TAU = Math.PI * 2;
const STEP = TAU / ANIMATION.rotationSteps;

describe('flapFrameAt', () => {
  it('holds each wing frame for exactly the flap interval', () => {
    expect(flapFrameAt(0)).toBe(0);
    expect(flapFrameAt(ANIMATION.flapMs - 1)).toBe(0);
    expect(flapFrameAt(ANIMATION.flapMs)).toBe(1);
    expect(flapFrameAt(ANIMATION.flapMs * 2 - 1)).toBe(1);
    expect(flapFrameAt(ANIMATION.flapMs * 2)).toBe(0);
  });

  it('is a pure function of the clock, which is what keeps a formation in sync', () => {
    // Two callers asking at the same instant must get the same frame -- the
    // whole formation flaps together because they all read one clock.
    for (const t of [0, 137, 533, 1200, 99999]) {
      expect(flapFrameAt(t)).toBe(flapFrameAt(t));
      expect([0, 1]).toContain(flapFrameAt(t));
    }
  });
});

describe('quantizeHeading', () => {
  it('leaves straight ahead exactly straight ahead', () => {
    expect(quantizeHeading(0)).toBe(0);
  });

  it('snaps a heading to the nearest of the sixteen orientations', () => {
    expect(quantizeHeading(STEP * 0.49)).toBeCloseTo(0, 10);
    expect(quantizeHeading(STEP * 0.51)).toBeCloseTo(STEP, 10);
    expect(quantizeHeading(STEP * 3.2)).toBeCloseTo(STEP * 3, 10);
  });

  it('produces exactly the sixteen orientations over a full turn', () => {
    const seen = new Set();
    for (let i = 0; i < 720; i += 1) {
      const value = quantizeHeading((i / 720) * TAU);
      seen.add(Math.round((((value % TAU) + TAU) % TAU) / STEP) % ANIMATION.rotationSteps);
    }
    expect(seen.size).toBe(ANIMATION.rotationSteps);
  });

  it('is idempotent: a snapped heading snaps to itself', () => {
    for (let i = 0; i < ANIMATION.rotationSteps; i += 1) {
      expect(quantizeHeading(quantizeHeading(i * STEP))).toBeCloseTo(quantizeHeading(i * STEP), 10);
    }
  });

  it('handles negative headings the way the maths says it should', () => {
    expect(quantizeHeading(-STEP * 0.49)).toBeCloseTo(0, 10);
    expect(quantizeHeading(-STEP * 1.1)).toBeCloseTo(-STEP, 10);
  });
});

describe('explosionFrameAt', () => {
  it('steps through every frame in order and then reports done', () => {
    const frameMs = 66;
    const frames = 5;

    const seen = [];
    for (let t = 0; t < frameMs * frames; t += 11) {
      seen.push(explosionFrameAt(frames, frameMs, t));
    }

    expect(new Set(seen)).toEqual(new Set([0, 1, 2, 3, 4]));
    expect(seen).toEqual([...seen].sort((a, b) => a - b));
    expect(explosionFrameAt(frames, frameMs, frameMs * frames)).toBeNull();
    expect(explosionFrameAt(frames, frameMs, frameMs * frames + 1000)).toBeNull();
  });

  it('holds the first frame from the first instant', () => {
    expect(explosionFrameAt(4, 270, 0)).toBe(0);
    expect(explosionFrameAt(4, 270, 269)).toBe(0);
    expect(explosionFrameAt(4, 270, 270)).toBe(1);
  });
});

describe('spinAngleAt', () => {
  const duration = 900;

  it('only ever sits on one of the sixteen orientations', () => {
    for (let t = 0; t <= duration; t += 7) {
      const angle = spinAngleAt(t, duration);
      const steps = angle / STEP;
      expect(Math.abs(steps - Math.round(steps))).toBeLessThan(1e-9);
    }
  });

  it('completes its full turns exactly by the end', () => {
    expect(spinAngleAt(0, duration)).toBe(0);
    expect(spinAngleAt(duration, duration)).toBeCloseTo(TAU * ANIMATION.spinTurns, 10);
  });

  it('never steps backwards', () => {
    let last = -Infinity;
    for (let t = 0; t <= duration; t += 13) {
      const angle = spinAngleAt(t, duration);
      expect(angle).toBeGreaterThanOrEqual(last);
      last = angle;
    }
  });

  it('clamps past the end rather than over-rotating', () => {
    expect(spinAngleAt(duration * 3, duration)).toBeCloseTo(TAU * ANIMATION.spinTurns, 10);
  });
});

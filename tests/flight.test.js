import { describe, it, expect } from 'vitest';
import {
  createFlight,
  advanceFlight,
  flightProgress,
  isFlightComplete,
  flightTransform,
  createLiveFlight,
  advanceLiveFlight,
  liveFlightTransform,
  isLiveFlight,
  isLiveFlightDone,
  liveFlightHomed,
} from '../src/systems/flight.js';
import { createEntryFlightState, screenScale } from '../src/systems/paths.js';
import { FRAME_MS } from '../src/systems/pathcode.js';
import { SCREEN } from '../src/config.js';

/** A straight run rightward, so headings are easy to reason about. */
const straight = {
  kind: 'track',
  points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }, { x: 30, y: 0 }],
};

describe('creating a flight', () => {
  it('starts at zero elapsed', () => {
    expect(createFlight(straight, 1000).elapsedMs).toBe(0);
  });

  it('rejects a non-positive duration rather than dividing by zero later', () => {
    expect(() => createFlight(straight, 0)).toThrow(/must be positive/);
    expect(() => createFlight(straight, -100)).toThrow(/must be positive/);
  });
});

describe('advancing', () => {
  it('does not mutate the flight it is given', () => {
    const flight = createFlight(straight, 1000);
    advanceFlight(flight, 500);
    expect(flight.elapsedMs).toBe(0);
  });

  it('reaches the halfway point after half the duration', () => {
    const flight = advanceFlight(createFlight(straight, 1000), 500);
    expect(flightProgress(flight)).toBeCloseTo(0.5, 10);
  });

  it('is frame-rate independent', () => {
    let coarse = createFlight(straight, 1000);
    coarse = advanceFlight(coarse, 500);

    let fine = createFlight(straight, 1000);
    for (let i = 0; i < 50; i += 1) fine = advanceFlight(fine, 10);

    expect(flightProgress(fine)).toBeCloseTo(flightProgress(coarse), 10);
  });

  it('clamps at the end instead of overshooting the path', () => {
    const flight = advanceFlight(createFlight(straight, 1000), 99999);
    expect(flightProgress(flight)).toBe(1);
    expect(isFlightComplete(flight)).toBe(true);
  });

  it('ignores a negative delta rather than flying backwards', () => {
    const flight = advanceFlight(createFlight(straight, 1000), -500);
    expect(flight.elapsedMs).toBe(0);
  });

  it('is not complete before its duration elapses', () => {
    expect(isFlightComplete(advanceFlight(createFlight(straight, 1000), 999))).toBe(false);
  });
});

describe('transform', () => {
  it('begins at the start of the path', () => {
    const { x, y } = flightTransform(createFlight(straight, 1000));
    expect(x).toBeCloseTo(0, 6);
    expect(y).toBeCloseTo(0, 6);
  });

  it('ends at the end of the path', () => {
    const done = advanceFlight(createFlight(straight, 1000), 1000);
    const { x } = flightTransform(done);
    expect(x).toBeCloseTo(30, 6);
  });

  it('points the ship along its direction of travel', () => {
    // Travelling straight down should leave the upward-facing art unrotated.
    const downward = {
      kind: 'track',
      points: [{ x: 0, y: 0 }, { x: 0, y: 10 }, { x: 0, y: 20 }, { x: 0, y: 30 }],
    };
    const flight = advanceFlight(createFlight(downward, 1000), 500);
    expect(flightTransform(flight).angle).toBeCloseTo(0, 5);
  });
});

describe('live flights', () => {
  const context = {
    playerX: SCREEN.width / 2,
    homeTarget: { x: SCREEN.width / 2, y: SCREEN.height * 0.4 },
  };

  it('wraps an interpreter state for this screen and knows itself', () => {
    const flight = createLiveFlight(createEntryFlightState(0, 0), SCREEN);
    expect(isLiveFlight(flight)).toBe(true);
    expect(isLiveFlight(createFlight({ kind: 'track', points: [{ x: 0, y: 0 }] }, 100))).toBe(
      false,
    );
  });

  it('starts at the spawn point, in screen coordinates', () => {
    const flight = createLiveFlight(createEntryFlightState(0, 0), SCREEN);
    const { x, y } = liveFlightTransform(flight);
    const scale = screenScale(SCREEN);
    expect(x).toBeCloseTo(94 * scale, 6);
    expect(y).toBeCloseTo(43 * scale, 6);
  });

  it('does not mutate the flight it is given', () => {
    const flight = createLiveFlight(createEntryFlightState(0, 0), SCREEN);
    const before = liveFlightTransform(flight);
    advanceLiveFlight(flight, 500, context);
    expect(liveFlightTransform(flight)).toEqual(before);
  });

  it('runs whole hardware frames and is frame-rate independent', () => {
    let coarse = createLiveFlight(createEntryFlightState(0, 0), SCREEN);
    coarse = advanceLiveFlight(coarse, 100 * FRAME_MS, context).flight;

    let fine = createLiveFlight(createEntryFlightState(0, 0), SCREEN);
    for (let i = 0; i < 100; i += 1) fine = advanceLiveFlight(fine, FRAME_MS, context).flight;

    const a = liveFlightTransform(coarse);
    const b = liveFlightTransform(fine);
    expect(a.x).toBeCloseTo(b.x, 6);
    expect(a.y).toBeCloseTo(b.y, 6);
  });

  it('flies an entry to its slot and reports homed completion', () => {
    let flight = createLiveFlight(createEntryFlightState(0, 0), SCREEN);
    let events = [];
    for (let i = 0; i < 300 && !isLiveFlightDone(flight); i += 1) {
      const step = advanceLiveFlight(flight, FRAME_MS, context);
      flight = step.flight;
      events = events.concat(step.events);
    }
    expect(isLiveFlightDone(flight)).toBe(true);
    expect(liveFlightHomed(flight)).toBe(true);
    expect(events.some((e) => e.type === 'homed')).toBe(true);
    const { x, y } = liveFlightTransform(flight);
    expect(x).toBeCloseTo(context.homeTarget.x, 4);
    expect(y).toBeCloseTo(context.homeTarget.y, 4);
  });

  it('orients the sprite from the live 10-bit angle, art-up convention', () => {
    // The stage-1 block spawns pointing canvas-down: rotation 0 for
    // down-facing travel under the same convention flightTransform uses.
    const flight = createLiveFlight(createEntryFlightState(0, 0), SCREEN);
    const { angle } = liveFlightTransform(flight);
    const normalized = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    expect(normalized).toBeCloseTo(0, 5);
  });
});

import { describe, it, expect } from 'vitest';
import {
  createFlight,
  advanceFlight,
  flightProgress,
  isFlightComplete,
  flightTransform,
} from '../src/systems/flight.js';

/** A straight run rightward, so headings are easy to reason about. */
const straight = [
  [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }, { x: 30, y: 0 }],
];

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
    const downward = [
      [{ x: 0, y: 0 }, { x: 0, y: 10 }, { x: 0, y: 20 }, { x: 0, y: 30 }],
    ];
    const flight = advanceFlight(createFlight(downward, 1000), 500);
    expect(flightTransform(flight).angle).toBeCloseTo(0, 5);
  });
});

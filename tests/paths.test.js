import { describe, it, expect } from 'vitest';
import {
  cubicBezier,
  pointOnPath,
  tangentAngle,
  pathLength,
  entryPath,
  divePath,
  returnPath,
  challengingPath,
} from '../src/systems/paths.js';
import { SCREEN, PLAYER } from '../src/config.js';
import { CHALLENGING_PATTERN_COUNT } from '../src/systems/stages.js';

// The real field, so the invariants below are pinned against what actually
// ships rather than against a landscape screen this game no longer uses.
const screen = SCREEN;
const playerY = PLAYER.y;

describe('cubic bezier', () => {
  const p0 = { x: 0, y: 0 };
  const p1 = { x: 0, y: 10 };
  const p2 = { x: 10, y: 10 };
  const p3 = { x: 10, y: 0 };

  it('starts at the first control point and ends at the last', () => {
    expect(cubicBezier(p0, p1, p2, p3, 0)).toEqual({ x: 0, y: 0 });
    expect(cubicBezier(p0, p1, p2, p3, 1)).toEqual({ x: 10, y: 0 });
  });

  it('is symmetric for a symmetric hull', () => {
    const a = cubicBezier(p0, p1, p2, p3, 0.25);
    const b = cubicBezier(p0, p1, p2, p3, 0.75);
    expect(a.y).toBeCloseTo(b.y, 10);
    expect(a.x).toBeCloseTo(10 - b.x, 10);
  });

  it('stays inside the convex hull of its control points', () => {
    for (let t = 0; t <= 1; t += 0.05) {
      const point = cubicBezier(p0, p1, p2, p3, t);
      expect(point.x).toBeGreaterThanOrEqual(-1e-9);
      expect(point.x).toBeLessThanOrEqual(10 + 1e-9);
      expect(point.y).toBeGreaterThanOrEqual(-1e-9);
      expect(point.y).toBeLessThanOrEqual(10 + 1e-9);
    }
  });
});

describe('multi-segment paths', () => {
  const path = [
    [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 0 }],
    [{ x: 3, y: 0 }, { x: 4, y: -1 }, { x: 5, y: -1 }, { x: 6, y: 0 }],
  ];

  it('rejects an empty path rather than returning something undefined', () => {
    expect(() => pointOnPath([], 0.5)).toThrow(/at least one segment/);
  });

  it('lands exactly on the final endpoint at t = 1', () => {
    expect(pointOnPath(path, 1)).toEqual({ x: 6, y: 0 });
  });

  it('hits the segment join at the midpoint', () => {
    const joint = pointOnPath(path, 0.5);
    expect(joint.x).toBeCloseTo(3, 10);
    expect(joint.y).toBeCloseTo(0, 10);
  });

  it('clamps out-of-range t instead of extrapolating', () => {
    expect(pointOnPath(path, -5)).toEqual({ x: 0, y: 0 });
    expect(pointOnPath(path, 5)).toEqual({ x: 6, y: 0 });
  });

  it('advances monotonically along a monotonic path', () => {
    let previous = -Infinity;
    for (let t = 0; t <= 1; t += 0.02) {
      const { x } = pointOnPath(path, t);
      expect(x).toBeGreaterThanOrEqual(previous - 1e-9);
      previous = x;
    }
  });

  it('measures a straight run as its literal length', () => {
    const straight = [
      [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }, { x: 30, y: 0 }],
    ];
    expect(pathLength(straight, 256)).toBeCloseTo(30, 1);
  });

  it('reports heading along the path', () => {
    const rightward = [
      [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }],
    ];
    expect(tangentAngle(rightward, 0.5)).toBeCloseTo(0, 6);

    const downward = [
      [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 }, { x: 0, y: 3 }],
    ];
    expect(tangentAngle(downward, 0.5)).toBeCloseTo(Math.PI / 2, 6);
  });

  it('reports a heading at the endpoints without running off the path', () => {
    expect(Number.isFinite(tangentAngle(path, 0))).toBe(true);
    expect(Number.isFinite(tangentAngle(path, 1))).toBe(true);
  });
});

describe('entry flights', () => {
  const target = { x: screen.width / 2, y: 120 };

  it('delivers every variant to the formation slot', () => {
    for (let variant = 0; variant < 4; variant += 1) {
      const end = pointOnPath(entryPath(variant, target, screen), 1);
      expect(end.x).toBeCloseTo(target.x, 6);
      expect(end.y).toBeCloseTo(target.y, 6);
    }
  });

  it('cycles variants rather than failing on a large index', () => {
    const first = entryPath(0, target, screen);
    const wrapped = entryPath(8, target, screen);
    expect(wrapped).toEqual(first);
  });

  it('begins off screen so enemies fly in rather than appearing', () => {
    for (let variant = 0; variant < 4; variant += 1) {
      const start = pointOnPath(entryPath(variant, target, screen), 0);
      const outside =
        start.x < 0 || start.x > screen.width || start.y < 0 || start.y > screen.height;
      expect(outside).toBe(true);
    }
  });

  it('produces a path long enough to read as a flight, not a jump', () => {
    for (let variant = 0; variant < 4; variant += 1) {
      expect(pathLength(entryPath(variant, target, screen))).toBeGreaterThan(400);
    }
  });

  // Regression. An earlier revision looped entries through height * 0.95,
  // which ran all forty arriving enemies straight through the player's row at
  // y = height - 70. The opening stream ended the game before a shot could be
  // fired, and no unit test caught it because every assertion was about
  // endpoints rather than the space the path crosses.
  it('never descends into the lane the player occupies', () => {
    for (let variant = 0; variant < 4; variant += 1) {
      const path = entryPath(variant, target, screen);
      for (let t = 0; t <= 1; t += 0.005) {
        expect(pointOnPath(path, t).y).toBeLessThan(playerY - 60);
      }
    }
  });
});

describe('dive runs', () => {
  const origin = { x: screen.width * 0.375, y: 150 };

  it('exits below the bottom of the screen', () => {
    const end = pointOnPath(divePath(origin, screen.width / 2, screen), 1);
    expect(end.y).toBeGreaterThan(screen.height);
  });

  it('starts precisely at the formation slot it left', () => {
    const start = pointOnPath(divePath(origin, screen.width / 2, screen), 0);
    expect(start).toEqual(origin);
  });

  it('curves toward the player on the way down', () => {
    const path = divePath(origin, screen.width * 0.9, screen);
    const late = pointOnPath(path, 0.85);
    expect(late.x).toBeGreaterThan(origin.x);
  });

  it('sweeps outward from whichever side it started on', () => {
    const nearLeft = screen.width * 0.15;
    const nearRight = screen.width * 0.85;
    const left = divePath({ x: nearLeft, y: 150 }, screen.width / 2, screen);
    const right = divePath({ x: nearRight, y: 150 }, screen.width / 2, screen);
    expect(pointOnPath(left, 0.2).x).toBeLessThan(nearLeft);
    expect(pointOnPath(right, 0.2).x).toBeGreaterThan(nearRight);
  });
});

describe('challenging stage choreography', () => {
  it('enters and exits off screen, never stopping in formation', () => {
    for (let pattern = 0; pattern < CHALLENGING_PATTERN_COUNT; pattern += 1) {
      for (let offset = 0; offset < 6; offset += 1) {
        const path = challengingPath(pattern, offset, screen);
        const start = pointOnPath(path, 0);
        const end = pointOnPath(path, 1);

        const outside = (p) =>
          p.x < 0 || p.x > screen.width || p.y < 0 || p.y > screen.height;

        expect(outside(start)).toBe(true);
        expect(outside(end)).toBe(true);
      }
    }
  });

  it('keeps clear of the player, who cannot be hit during a bonus round', () => {
    for (let pattern = 0; pattern < CHALLENGING_PATTERN_COUNT; pattern += 1) {
      for (let offset = 0; offset < 6; offset += 1) {
        const path = challengingPath(pattern, offset, screen);
        for (let t = 0; t <= 1; t += 0.01) {
          expect(pointOnPath(path, t).y).toBeLessThan(playerY - 40);
        }
      }
    }
  });

  it('gives each pattern a distinct shape', () => {
    const signature = (pattern) =>
      [0.25, 0.5, 0.75]
        .map((t) => {
          const p = pointOnPath(challengingPath(pattern, 0, screen), t);
          return `${Math.round(p.x)},${Math.round(p.y)}`;
        })
        .join('|');

    const patterns = Array.from({ length: CHALLENGING_PATTERN_COUNT }, (_, i) => i);
    const signatures = patterns.map(signature);
    expect(new Set(signatures).size).toBe(CHALLENGING_PATTERN_COUNT);
  });

  it('spreads a group across lanes rather than stacking them', () => {
    const xs = [0, 2, 4, 6].map((offset) =>
      Math.round(pointOnPath(challengingPath(1, offset, screen), 0).x),
    );
    expect(new Set(xs).size).toBeGreaterThan(1);
  });
});

describe('re-entry', () => {
  it('drops in from above and finishes in the slot', () => {
    const target = { x: screen.width * 0.3, y: 140 };
    const path = returnPath(target, screen);
    expect(pointOnPath(path, 0).y).toBeLessThan(0);
    const end = pointOnPath(path, 1);
    expect(end.x).toBeCloseTo(target.x, 6);
    expect(end.y).toBeCloseTo(target.y, 6);
  });

  it('enters on the same side as the slot it is heading for', () => {
    const left = returnPath({ x: screen.width * 0.15, y: 140 }, screen);
    const right = returnPath({ x: screen.width * 0.85, y: 140 }, screen);
    expect(pointOnPath(left, 0).x).toBeLessThan(screen.width / 2);
    expect(pointOnPath(right, 0).x).toBeGreaterThan(screen.width / 2);
  });
});

import { describe, it, expect } from 'vitest';
import {
  pointOnPath,
  tangentAngle,
  pathLength,
  entryPath,
  divePath,
  diveVectorFor,
  returnPath,
  challengingPath,
  FLY_IN_PATH_COUNT,
  DIVE_PROGRAM_COUNT,
} from '../src/systems/paths.js';
import { SCREEN, PLAYER } from '../src/config.js';
import { CHALLENGING_PATTERN_COUNT } from '../src/systems/stages.js';

// The real field, so the invariants below are pinned against what actually
// ships rather than against a landscape screen this game no longer uses.
const screen = SCREEN;
const playerY = PLAYER.y;

describe('track evaluation', () => {
  const track = {
    kind: 'track',
    points: [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ],
  };

  it('rejects an empty track rather than returning something undefined', () => {
    expect(() => pointOnPath({ kind: 'track', points: [] }, 0.5)).toThrow(/at least one point/);
  });

  it('lands exactly on the final sample at t = 1', () => {
    expect(pointOnPath(track, 1)).toEqual({ x: 10, y: 10 });
  });

  it('interpolates linearly between two frame samples', () => {
    expect(pointOnPath(track, 0.25)).toEqual({ x: 5, y: 0 });
    expect(pointOnPath(track, 0.75)).toEqual({ x: 10, y: 5 });
  });

  it('clamps out-of-range t instead of extrapolating', () => {
    expect(pointOnPath(track, -5)).toEqual({ x: 0, y: 0 });
    expect(pointOnPath(track, 5)).toEqual({ x: 10, y: 10 });
  });

  it('measures a track as the sum of its per-frame steps', () => {
    expect(pathLength(track)).toBeCloseTo(20, 10);
  });

  it('reports heading from the surrounding samples', () => {
    expect(tangentAngle(track, 0.2)).toBeCloseTo(0, 6);
    expect(tangentAngle(track, 0.8)).toBeCloseTo(Math.PI / 2, 6);
  });

  it('reports a heading at the endpoints without running off the track', () => {
    expect(Number.isFinite(tangentAngle(track, 0))).toBe(true);
    expect(Number.isFinite(tangentAngle(track, 1))).toBe(true);
  });
});

describe('entry flights', () => {
  const target = { x: screen.width / 2, y: 120 };

  /** Every authored shape, flown from each side, which is what a caravan can ask for. */
  const everyEntry = () => {
    const paths = [];
    for (let variant = 0; variant < FLY_IN_PATH_COUNT; variant += 1) {
      for (const mirrored of [false, true]) {
        paths.push({ variant, mirrored, path: entryPath(variant, target, screen, mirrored) });
      }
    }
    return paths;
  };

  it('holds the arcade count: 22 unique path blocks', () => {
    expect(FLY_IN_PATH_COUNT).toBe(22);
  });

  it('delivers every variant to the formation slot', () => {
    for (const { path } of everyEntry()) {
      const end = pointOnPath(path, 1);
      expect(end.x).toBeCloseTo(target.x, 6);
      expect(end.y).toBeCloseTo(target.y, 6);
    }
  });

  it('cycles variants rather than failing on a large index', () => {
    const first = entryPath(0, target, screen);
    const wrapped = entryPath(FLY_IN_PATH_COUNT * 2, target, screen);
    expect(wrapped).toEqual(first);
  });

  it('begins off screen so enemies fly in rather than appearing', () => {
    for (const { path } of everyEntry()) {
      const start = pointOnPath(path, 0);
      const outside =
        start.x < 0 || start.x > screen.width || start.y < 0 || start.y > screen.height;
      expect(outside).toBe(true);
    }
  });

  it('produces a path long enough to read as a flight, not a jump', () => {
    for (const { path } of everyEntry()) {
      expect(pathLength(path)).toBeGreaterThan(400);
    }
  });

  // The mirror bit of a caravan path byte. Reflecting the approach is what lets
  // one authored shape serve both sides, and it is what makes a paired flight
  // arrive from the left and the right at the same moment.
  it('enters from the opposite side when mirrored', () => {
    for (let variant = 0; variant < FLY_IN_PATH_COUNT; variant += 1) {
      const plain = pointOnPath(entryPath(variant, target, screen, false), 0);
      const mirrored = pointOnPath(entryPath(variant, target, screen, true), 0);

      // Reflected, not merely displaced: the two starts are the same distance
      // either side of the centre line.
      expect(mirrored.x).toBeCloseTo(screen.width - plain.x, 6);
      expect(mirrored.y).toBeCloseTo(plain.y, 6);
    }
  });

  it('still lands a mirrored flight in its own slot rather than the mirrored one', () => {
    const offCentre = { x: screen.width * 0.2, y: 140 };
    const end = pointOnPath(entryPath(3, offCentre, screen, true), 1);
    expect(end.x).toBeCloseTo(offCentre.x, 6);
    expect(end.y).toBeCloseTo(offCentre.y, 6);
  });

  it('gives the 22 blocks 22 distinct routes', () => {
    const signature = (variant) =>
      [0.2, 0.4, 0.6, 0.8]
        .map((t) => {
          const p = pointOnPath(entryPath(variant, target, screen), t);
          return `${Math.round(p.x)},${Math.round(p.y)}`;
        })
        .join('|');

    const signatures = Array.from({ length: FLY_IN_PATH_COUNT }, (_, i) => signature(i));
    expect(new Set(signatures).size).toBe(FLY_IN_PATH_COUNT);
  });

  // Regression. An earlier revision looped entries through height * 0.95,
  // which ran all forty arriving enemies straight through the player's row at
  // y = height - 70. The opening stream ended the game before a shot could be
  // fired, and no unit test caught it because every assertion was about
  // endpoints rather than the space the path crosses.
  it('never descends into the lane the player occupies', () => {
    for (const { path } of everyEntry()) {
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

  // The family. The arcade does not fly one dive curve: it holds a set of
  // dive path blocks and per-stage flight vectors that pick between them per
  // enemy type. The vectors here are authored; the structure is the ROM's.
  it('holds a family of eight dive blocks', () => {
    expect(DIVE_PROGRAM_COUNT).toBe(8);
  });

  it('selects different blocks for different types as the stages climb', () => {
    const selections = new Set();
    for (let stageIndex = 0; stageIndex < 26; stageIndex += 1) {
      for (const type of ['zako', 'goei', 'boss']) {
        const { program, speed } = diveVectorFor(type, stageIndex);
        expect(program).toBeGreaterThanOrEqual(0);
        expect(program).toBeLessThan(DIVE_PROGRAM_COUNT);
        expect(speed).toBeGreaterThan(0);
        selections.add(`${type}:${program}`);
      }
    }
    // Every type flies more than one block across a long game.
    for (const type of ['zako', 'goei', 'boss']) {
      const flown = [...selections].filter((entry) => entry.startsWith(type)).length;
      expect(flown).toBeGreaterThan(2);
    }
  });

  it('flies a later stage hotter than the first', () => {
    expect(diveVectorFor('zako', 25).speed).toBeGreaterThan(diveVectorFor('zako', 0).speed);
  });

  it('gives different stage rows visibly different runs', () => {
    const early = divePath(origin, screen.width / 2, screen, { enemyType: 'goei', stageIndex: 0 });
    const late = divePath(origin, screen.width / 2, screen, { enemyType: 'goei', stageIndex: 12 });
    const signature = (path) =>
      [0.2, 0.4, 0.6]
        .map((t) => {
          const p = pointOnPath(path, t);
          return `${Math.round(p.x)},${Math.round(p.y)}`;
        })
        .join('|');
    expect(signature(early)).not.toBe(signature(late));
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

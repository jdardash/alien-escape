import { describe, it, expect } from 'vitest';
import {
  pointOnPath,
  tangentAngle,
  pathLength,
  entryPath,
  entrySpawnPoint,
  createEntryFlightState,
  createDiveFlightState,
  createCarryHomeFlightState,
  createConvoyLeaderFlightState,
  divePath,
  returnPath,
  challengingPath,
  screenScale,
  FLY_IN_PATH_COUNT,
  FLY_IN_INDEX_COUNT,
  CHALLENGING_PATTERN_COUNT,
} from '../src/systems/paths.js';
import { stepFlight, toCanvas } from '../src/systems/pathcode.js';
import { SCREEN, PLAYER } from '../src/config.js';

// The real field, so the invariants below are pinned against what actually
// ships rather than against a landscape screen this game no longer uses.
const screen = SCREEN;
const playerY = PLAYER.y;
const scale = screenScale(screen);

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
  const target = { x: screen.width / 2, y: screen.height * 0.4 };

  /** Every index entry, both pair members, as a caravan byte can select. */
  const everyEntry = () => {
    const paths = [];
    for (let variant = 0; variant < FLY_IN_INDEX_COUNT; variant += 1) {
      for (const mirrored of [false, true]) {
        paths.push({ variant, mirrored, path: entryPath(variant, target, screen, mirrored) });
      }
    }
    return paths;
  };

  it('holds the arcade counts: 22 blocks behind a 24-entry index', () => {
    expect(FLY_IN_PATH_COUNT).toBe(22);
    expect(FLY_IN_INDEX_COUNT).toBe(24);
  });

  it('spawns the stage-1 pair 32 canvas px apart at top centre: x 94 vs 126', () => {
    // db_2A6C rows 0/1 through the canvas transform, scaled to this screen.
    const first = entrySpawnPoint(0, 0, screen);
    const second = entrySpawnPoint(0, 1, screen);
    expect(first.x).toBeCloseTo(94 * scale, 6);
    expect(first.y).toBeCloseTo(43 * scale, 6);
    expect(second.x).toBeCloseTo(126 * scale, 6);
    expect(second.y).toBeCloseTo(43 * scale, 6);
  });

  it('enters waves 2 and 3 from the BOTTOM edges of the screen', () => {
    // Index 1 (block 0x0067, variant pair 1): rawY 0x23 -> canvas y 283,
    // rawX 0 / 0x78 -> the side edges. The old model never did this.
    const left = entrySpawnPoint(1, 0, screen);
    const right = entrySpawnPoint(1, 1, screen);
    expect(left.y).toBeCloseTo(283 * scale, 6);
    expect(left.x).toBeLessThan(0);
    expect(right.x).toBeGreaterThan(screen.width);
  });

  it('starts each compiled track at its spawn point', () => {
    for (let variant = 0; variant < FLY_IN_INDEX_COUNT; variant += 1) {
      for (const mirrored of [false, true]) {
        const start = pointOnPath(entryPath(variant, target, screen, mirrored), 0);
        const spawn = entrySpawnPoint(variant, mirrored ? 1 : 0, screen);
        expect(start.x).toBeCloseTo(spawn.x, 6);
        expect(start.y).toBeCloseTo(spawn.y, 6);
      }
    }
  });

  it('delivers the six combat entries to the formation slot', () => {
    // Only indices 0-5 -- the token-bearing blocks the combat rows select --
    // carry an FB home. The old shim that forced 6-23 home died with the
    // authored caravan rows that mis-selected them for combat.
    for (let variant = 0; variant < 6; variant += 1) {
      for (const mirrored of [false, true]) {
        const end = pointOnPath(entryPath(variant, target, screen, mirrored), 1);
        expect(end.x).toBeCloseTo(target.x, 6);
        expect(end.y).toBeCloseTo(target.y, 6);
      }
    }
  });

  it('flies the token-free entries through without homing', () => {
    // Indices 6-23 are the challenge fly-throughs: their streams end FF and
    // the compiled track ends wherever the flight died, never on the slot.
    for (const { variant, path } of everyEntry()) {
      if (variant < 6) continue;
      const end = pointOnPath(path, 1);
      const onSlot =
        Math.abs(end.x - target.x) < 1e-6 && Math.abs(end.y - target.y) < 1e-6;
      expect(onSlot).toBe(false);
    }
  });

  it('homes the six combat blocks through their own FB, no shim', () => {
    for (let variant = 0; variant < 6; variant += 1) {
      for (const member of [0, 1]) {
        const state = createEntryFlightState(variant, member);
        const context = { playerX: 112, homeTarget: { x: 112, y: 120 } };
        let frames = 0;
        while (!state.done && frames < 1000) {
          stepFlight(state, context);
          frames += 1;
        }
        expect(state.homed).toBe(true);
        expect(state.overrun).toBe(false);
        // The arcade cadence: about two seconds from spawn to slot.
        expect(frames).toBeGreaterThan(90);
        expect(frames).toBeLessThan(200);
      }
    }
  });

  it('terminates every block for every index entry and member, no garbage reads', () => {
    for (let variant = 0; variant < FLY_IN_INDEX_COUNT; variant += 1) {
      for (const member of [0, 1]) {
        const state = createEntryFlightState(variant, member);
        const context = { playerX: 112, homeTarget: { x: 112, y: 120 } };
        let frames = 0;
        while (!state.done && frames < 3000) {
          stepFlight(state, context);
          frames += 1;
        }
        expect(state.done).toBe(true);
        expect(state.overrun).toBe(false);
      }
    }
  });

  it('takes the stage-8 F0 branch to a different, faster tail', () => {
    const base = entryPath(0, target, screen, false, { stage8Switch: false });
    const hard = entryPath(0, target, screen, false, { stage8Switch: true });
    // The replacement sub-path (44 E4 18: speed 4 nibbles, hard turn) makes
    // a different route of a different length.
    expect(hard.points.length).not.toBe(base.points.length);
  });

  it('flies the pair as negated-rotation twins, not screen reflections', () => {
    // Member 1 spawns at its OWN db_2A6C row (x 126 vs 94 -- offset, not
    // reflected about the centre) and every turn is negated: over the first
    // segments the two tracks mirror about their spawn columns.
    const plain = entryPath(0, target, screen, false);
    const twin = entryPath(0, target, screen, true);
    const plainSpawn = pointOnPath(plain, 0);
    const twinSpawn = pointOnPath(twin, 0);
    expect(twinSpawn.x - plainSpawn.x).toBeCloseTo(32 * scale, 6);

    // 40 frames in (well inside the first turn), the lateral offsets from
    // the spawn columns oppose each other.
    const t = 40 / (plain.points.length - 1);
    const a = pointOnPath(plain, t);
    const b = pointOnPath(twin, t);
    const da = a.x - plainSpawn.x;
    const db = b.x - twinSpawn.x;
    expect(Math.sign(da)).toBe(-Math.sign(db));
    expect(Math.abs(da + db)).toBeLessThan(5 * scale);
  });

  it('gives the index entries distinct routes', () => {
    const signature = (variant) =>
      [0.2, 0.4, 0.6]
        .map((t) => {
          const p = pointOnPath(entryPath(variant, target, screen), t);
          return `${Math.round(p.x)},${Math.round(p.y)}`;
        })
        .join('|');

    const signatures = Array.from({ length: 22 }, (_, i) => signature(i));
    // 22 entries; index pairs (10, 22) and (12, 23) share blocks with
    // different variants, so at least the 20 distinct-block routes differ.
    expect(new Set(signatures).size).toBeGreaterThanOrEqual(20);
  });

  // The lane invariant, adapted to the real data. The old model kept every
  // entry above an authored floor; the ROM's waves 2/3 genuinely enter from
  // the bottom -- but only along the screen edges. What must hold is that no
  // combat fly-in crosses the player's lane near the centre of the field,
  // where the ship starts.
  it('keeps combat fly-ins out of the central band of the player lane', () => {
    const laneY = playerY - 40;
    const centre = screen.width / 2;
    for (let variant = 0; variant < 6; variant += 1) {
      for (const member of [0, 1]) {
        const state = createEntryFlightState(variant, member);
        const context = { playerX: 112, homeTarget: { x: 112, y: 120 } };
        let frames = 0;
        while (!state.done && frames < 1000) {
          stepFlight(state, context);
          const point = toCanvas(state);
          if (point.y * scale >= laneY) {
            expect(Math.abs(point.x * scale - centre)).toBeGreaterThan(centre * 0.3);
          }
          frames += 1;
        }
      }
    }
  });
});

describe('attack dives', () => {
  const origin = { x: screen.width * 0.375, y: screen.height * 0.23 };
  const playerX = screen.width / 2;

  it('starts at the formation position it left', () => {
    const start = pointOnPath(divePath(origin, playerX, screen), 0);
    expect(start.x).toBeCloseTo(origin.x, 6);
    expect(start.y).toBeCloseTo(origin.y, 6);
  });

  it('dives below the bottom of the screen mid-run', () => {
    for (const enemyType of ['zako', 'goei', 'boss']) {
      const path = divePath(origin, playerX, screen, { enemyType });
      let maxY = -Infinity;
      for (let t = 0; t <= 1; t += 0.002) maxY = Math.max(maxY, pointOnPath(path, t).y);
      expect(maxY).toBeGreaterThan(screen.height);
    }
  });

  it('returns to its slot: the pass ends where it began, via the FB tail', () => {
    // No continuous bombing at compile time, so the FA gate routes every
    // table to the shared `FB 12 00 FF` return and the flight ends homed.
    for (const enemyType of ['zako', 'goei', 'boss']) {
      const path = divePath(origin, playerX, screen, { enemyType });
      const end = pointOnPath(path, 1);
      expect(end.x).toBeCloseTo(origin.x, 0);
      expect(end.y).toBeCloseTo(origin.y, 0);
    }
  });

  it('gives the three types three different table shapes', () => {
    const signature = (enemyType) => {
      const path = divePath(origin, playerX, screen, { enemyType });
      return [0.25, 0.5, 0.75]
        .map((t) => {
          const p = pointOnPath(path, t);
          return `${Math.round(p.x)},${Math.round(p.y)}`;
        })
        .join('|');
    };
    expect(new Set(['zako', 'goei', 'boss'].map(signature)).size).toBe(3);
  });

  it('bends the red moth toward where the player stands (the F3 hook)', () => {
    const left = divePath(origin, screen.width * 0.1, screen, { enemyType: 'goei' });
    const right = divePath(origin, screen.width * 0.9, screen, { enemyType: 'goei' });
    const signature = (path) =>
      [0.2, 0.35, 0.5]
        .map((t) => Math.round(pointOnPath(path, t).x))
        .join('|');
    expect(signature(left)).not.toBe(signature(right));
  });

  it('loops the dive while continuous bombing holds, arming bombs each pass', () => {
    const state = createDiveFlightState('zako', origin, screen, { objectId: 4 });
    const context = {
      playerX: 112,
      homeTarget: { x: origin.x / scale, y: origin.y / scale },
      continuousBombing: true,
    };
    let armEvents = 0;
    for (let frame = 0; frame < 1500 && !state.done; frame += 1) {
      armEvents += stepFlight(state, context).filter((e) => e.type === 'armBombs').length;
    }
    expect(state.done).toBe(false); // still looping
    expect(armEvents).toBeGreaterThanOrEqual(2); // F6 re-arms every pass
  });

  it('ends a live dive homed once continuous bombing is off', () => {
    const state = createDiveFlightState('goei', origin, screen, { objectId: 4 });
    const context = {
      playerX: 112,
      homeTarget: { x: origin.x / scale, y: origin.y / scale },
      continuousBombing: false,
    };
    let frames = 0;
    while (!state.done && frames < 2000) {
      stepFlight(state, context);
      frames += 1;
    }
    expect(state.homed).toBe(true);
    expect(state.overrun).toBe(false);
  });

  it('mirrors the dive by objectId bit 1, the ROM launch recompute', () => {
    const plain = createDiveFlightState('zako', origin, screen, { objectId: 0 });
    const negated = createDiveFlightState('zako', origin, screen, { objectId: 2 });
    expect(plain.negateRotation).toBe(false);
    expect(negated.negateRotation).toBe(true);
  });
});

describe('challenging stage choreography', () => {
  it('holds the arcade count of eight rows', () => {
    expect(CHALLENGING_PATTERN_COUNT).toBe(8);
  });

  it('flies through and leaves: every route ends off screen or at its FF', () => {
    for (let pattern = 0; pattern < CHALLENGING_PATTERN_COUNT; pattern += 1) {
      for (let offset = 0; offset < 5; offset += 1) {
        const path = challengingPath(pattern, offset, screen);
        expect(path.points.length).toBeGreaterThan(60);
        // Off screen, or hard against an edge: one row's closing FF lands
        // its stream just inside the top border, which is the ROM's own
        // deactivate-where-it-stands.
        const end = pointOnPath(path, 1);
        const inside =
          end.x > 60 && end.x < screen.width - 60 && end.y > 60 && end.y < screen.height - 60;
        expect(inside).toBe(false);
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
    expect(new Set(patterns.map(signature)).size).toBe(CHALLENGING_PATTERN_COUNT);
  });

  it('varies the route across the five waves of a row', () => {
    const starts = [0, 1, 2, 3, 4].map((offset) => {
      const p = pointOnPath(challengingPath(1, offset, screen), 0);
      return `${Math.round(p.x)},${Math.round(p.y)}`;
    });
    expect(new Set(starts).size).toBeGreaterThan(1);
  });
});

describe('re-entry', () => {
  it('re-enters at the ROM top edge over the slot column and lands in the slot', () => {
    const target = { x: screen.width * 0.3, y: screen.height * 0.45 };
    const path = returnPath(target, screen);
    const start = pointOnPath(path, 0);
    // F8: rawY 0x9C -> canvas y 41; F9: the slot's own column.
    expect(start.y).toBeCloseTo(41 * scale, 0);
    expect(start.x).toBeCloseTo(target.x, 0);
    const end = pointOnPath(path, 1);
    expect(end.x).toBeCloseTo(target.x, 6);
    expect(end.y).toBeCloseTo(target.y, 6);
  });
});

/** Run a live state to completion, collecting every event it raises. */
function runFlight(state, context = {}, maxFrames = 4000) {
  const events = [];
  for (let frame = 0; frame < maxFrames && !state.done; frame += 1) {
    events.push(...stepFlight(state, context));
  }
  return events;
}

describe('the capture flights', () => {
  const origin = { x: screen.width / 2, y: screen.height * 0.2 };
  const home = { x: screen.width * 0.4 / scale, y: 60 };

  it('flies the capture entry: one F4 aim, then the in-place stall the beam plays over', () => {
    const state = createDiveFlightState('boss', origin, screen, { role: 'capture' });
    const context = { playerX: 90, homeTarget: home };

    let aim = null;
    let stalled = false;
    for (let frame = 0; frame < 600 && !stalled; frame += 1) {
      for (const event of stepFlight(state, context)) {
        if (event.type === 'captureAim') aim = event;
      }
      if (aim && state.vx === 0 && state.vy === 0 && !state.done) stalled = true;
    }

    // The aim is the player's sprite X snapped onto the beam grid --
    // ((x + 3) & 0xF8) | 1, case_0A53 -- then clamped to the beam lane, once.
    expect(aim).not.toBeNull();
    expect(aim.targetSpriteX).toBe(Math.min(Math.max(((90 + 10 + 3) & 0xf8) | 1, 0x29), 0xc9));
    // The `00 FC FF` stall: the boss stops translating low on the field.
    expect(stalled).toBe(true);
    expect(toCanvas(state).y).toBeGreaterThan(190);
  });

  it('retreats home after a force-expired stall, the l_22E3 miss', () => {
    const state = createDiveFlightState('boss', origin, screen, { role: 'capture' });
    const context = { playerX: 112, homeTarget: home };
    for (let frame = 0; frame < 600; frame += 1) {
      stepFlight(state, context);
      if (state.vx === 0 && state.vy === 0 && state.segTimer > 2) break;
    }
    // The miss: expire the stall and the retreat tail flies it home.
    state.segTimer = 1;
    runFlight(state, context);
    expect(state.homed).toBe(true);
  });

  it('carries the prize home on db_flv_cboss to the live slot', () => {
    const state = createCarryHomeFlightState(
      { x: screen.width * 0.6, y: screen.height * 0.72 },
      screen,
    );
    runFlight(state, { homeTarget: home });
    expect(state.done).toBe(true);
    expect(state.homed).toBe(true);
  });

  it('flies the rogue fighter out and never home', () => {
    const state = createDiveFlightState('boss', origin, screen, { role: 'rogue' });
    runFlight(state, { homeTarget: home });
    expect(state.done).toBe(true);
    expect(state.homed).toBe(false);
  });

  it('sends the escort entry home through the FA gate outside continuous bombing', () => {
    const state = createDiveFlightState('boss', origin, screen, {});
    runFlight(state, { playerX: 112, homeTarget: home, continuousBombing: false });
    expect(state.homed).toBe(true);
  });
});

describe('the bonus-bee convoy', () => {
  const origin = { x: screen.width * 0.55, y: screen.height * 0.25 };
  const home = { x: origin.x / scale, y: origin.y / scale };

  it.each([[0], [1], [2]])(
    'colour %i: the leader splits exactly two clones mid-dive and flies home',
    (colour) => {
      const state = createConvoyLeaderFlightState(colour, origin, screen);
      const events = runFlight(state, { playerX: 112, homeTarget: home });
      const clones = events.filter((event) => event.type === 'cloneSplit');
      expect(clones).toHaveLength(2);
      // The unkilled leader returns to the grid: the FD tail turns it home.
      expect(state.homed).toBe(true);
    },
  );

  it('clones dive at the player and despawn at their FF, never homing', () => {
    const state = createConvoyLeaderFlightState(0, origin, screen);
    const events = runFlight(state, { playerX: 112, homeTarget: home });
    for (const { clone } of events.filter((event) => event.type === 'cloneSplit')) {
      runFlight(clone, { playerX: 112 });
      expect(clone.done).toBe(true);
      expect(clone.homed).toBe(false);
    }
  });

  it('colour 2 gives its two clones different streams', () => {
    const state = createConvoyLeaderFlightState(2, origin, screen);
    const events = runFlight(state, { playerX: 112, homeTarget: home });
    const pcs = events
      .filter((event) => event.type === 'cloneSplit')
      .map((event) => event.clone.pc);
    // db_04AB splits at p_flv_04C6 and p_flv_04CF -- two distinct offsets.
    expect(new Set(pcs).size).toBe(2);
  });
});

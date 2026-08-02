import { describe, expect, it } from 'vitest';

import {
  ATTACK_TYPES,
  TRANSFORM_EVERY_NTH_ZAKO,
  advanceScheduler,
  createAttackScheduler,
  maxActiveBombers,
} from '../src/systems/attack.js';
import { difficultyRow } from '../src/systems/difficulty.js';
import { DifficultyRank } from '../src/systems/caravans.js';

/** A stage-5 factory row: three distinct counters, no reload vectors yet. */
const row = difficultyRow(5, DifficultyRank.A);

/** Run the scheduler forward in fixed steps, collecting everything it emits. */
function run(state, totalMs, options = {}, stepMs = 50) {
  const launches = [];
  let pulls = 0;
  let current = state;
  for (let elapsed = 0; elapsed < totalMs; elapsed += stepMs) {
    const result = advanceScheduler(current, stepMs, options);
    current = result.state;
    launches.push(...result.launches);
    if (result.transformPull) pulls += 1;
  }
  return { state: current, launches, pulls };
}

describe('launch counters', () => {
  it('launches nothing before the first counter expires', () => {
    const { launches } = run(createAttackScheduler(row), row.launchMs.zako - 200);
    expect(launches).toEqual([]);
  });

  it('launches each type on its own cadence', () => {
    const { launches } = run(createAttackScheduler(row), row.launchMs.boss + 400);

    // The Zako counter is the shortest and the boss counter the longest, so
    // by the time the boss has launched once the Zako has gone more often.
    expect(launches.filter((type) => type === 'zako').length).toBeGreaterThan(
      launches.filter((type) => type === 'boss').length,
    );
    expect(launches).toContain('boss');
  });

  it('reloads a counter after it fires rather than firing every frame', () => {
    const horizon = row.launchMs.zako * 3 + 400;
    const { launches } = run(createAttackScheduler(row), horizon);
    const zako = launches.filter((type) => type === 'zako');
    expect(zako.length).toBe(3);
  });

  it('holds an expired counter while its type has no one left to send', () => {
    const state = createAttackScheduler(row);
    const starved = run(state, row.launchMs.zako + 400, { availableTypes: ['boss', 'goei'] });
    expect(starved.launches).not.toContain('zako');

    // The moment the type is available again it launches without re-counting.
    const freed = advanceScheduler(starved.state, 50, { availableTypes: ['zako'] });
    expect(freed.launches).toContain('zako');
  });
});

describe('the active-bomber ceiling', () => {
  it('never launches past the row ceiling', () => {
    const state = createAttackScheduler(row);
    const { launches } = run(state, row.launchMs.zako + 400, {
      activeBombers: row.maxActiveBombers,
    });
    expect(launches).toEqual([]);
  });

  it('launches the held attacker as soon as the air clears', () => {
    const state = createAttackScheduler(row);
    const blocked = run(state, row.launchMs.zako + 400, {
      activeBombers: row.maxActiveBombers,
    });
    const freed = advanceScheduler(blocked.state, 50, { activeBombers: 0 });
    expect(freed.launches.length).toBeGreaterThan(0);
  });

  it('raises the ceiling by one after the bomber ramp elapses', () => {
    const state = createAttackScheduler(row);
    expect(maxActiveBombers(state)).toBe(row.maxActiveBombers);

    const later = run(state, row.bomberRampMs + 100).state;
    expect(maxActiveBombers(later)).toBe(row.maxActiveBombers + 1);
  });

  it('counts the launches it just made against the same frame ceiling', () => {
    // All three counters expired while the air was full; when it clears, only
    // as many launch as the ceiling allows in one sweep.
    const state = createAttackScheduler(row);
    const blocked = run(state, row.launchMs.boss + 400, {
      activeBombers: 8,
    });
    const freed = advanceScheduler(blocked.state, 50, { activeBombers: 0 });
    expect(freed.launches.length).toBeLessThanOrEqual(maxActiveBombers(blocked.state));
  });
});

describe('the transform pull', () => {
  it('replaces every Nth Zako launch on a transform stage', () => {
    const horizon = row.launchMs.zako * (TRANSFORM_EVERY_NTH_ZAKO + 2);
    const withTransforms = run(createAttackScheduler(row), horizon, { transformStage: true });

    // The pull replaces a launch rather than riding alongside one: however
    // many times the counter fired, every Nth firing became a pull and the
    // rest became launches.
    const zako = withTransforms.launches.filter((type) => type === 'zako').length;
    const fires = zako + withTransforms.pulls;
    expect(fires).toBeGreaterThanOrEqual(TRANSFORM_EVERY_NTH_ZAKO);
    expect(withTransforms.pulls).toBe(Math.floor(fires / TRANSFORM_EVERY_NTH_ZAKO));
  });

  it('never pulls on a stage with no transform type', () => {
    const horizon = row.launchMs.zako * (TRANSFORM_EVERY_NTH_ZAKO + 2);
    const plain = run(createAttackScheduler(row), horizon, { transformStage: false });
    expect(plain.pulls).toBe(0);
  });
});

describe('shape', () => {
  it('exposes the three attack types in launch order', () => {
    expect(ATTACK_TYPES).toEqual(['boss', 'goei', 'zako']);
  });

  it('does not mutate the state it is given', () => {
    const state = createAttackScheduler(row);
    const before = JSON.stringify(state);
    advanceScheduler(state, 1000);
    expect(JSON.stringify(state)).toBe(before);
  });
});

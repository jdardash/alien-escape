import { describe, it, expect } from 'vitest';
import { EnemyType } from '../src/systems/formation.js';
import {
  scoreFor,
  extraLivesEarned,
  FIRST_EXTRA_LIFE,
  SECOND_EXTRA_LIFE,
  EXTRA_LIFE_INTERVAL,
  CHALLENGING_STAGE_HIT_POINTS,
  transformSetPoints,
  transformKillPoints,
  TRANSFORM_SET_SIZE,
  TRANSFORM_SHIP_POINTS,
} from '../src/systems/scoring.js';
import { TransformType } from '../src/systems/stages.js';

describe('transform bonus sets', () => {
  it('pays the arcade value for each completed set', () => {
    expect(transformSetPoints(TransformType.SCORPION)).toBe(1000);
    expect(transformSetPoints(TransformType.SPY_SHIP)).toBe(2000);
    expect(transformSetPoints(TransformType.FLAGSHIP)).toBe(3000);
  });

  it('is scored per set of three, not per enemy', () => {
    expect(TRANSFORM_SET_SIZE).toBe(3);
  });

  it('pays for each ship as well as for the completed set', () => {
    expect(TRANSFORM_SHIP_POINTS).toBe(160);
  });

  it('pays the ship value alone until the set is finished', () => {
    expect(transformKillPoints(TransformType.SCORPION, 3)).toBe(160);
    expect(transformKillPoints(TransformType.SCORPION, 2)).toBe(160);
  });

  it('adds the set bonus to the third kill', () => {
    expect(transformKillPoints(TransformType.SCORPION, 1)).toBe(160 + 1000);
    expect(transformKillPoints(TransformType.SPY_SHIP, 1)).toBe(160 + 2000);
    expect(transformKillPoints(TransformType.FLAGSHIP, 1)).toBe(160 + 3000);
  });

  it('pays a full set of Scorpions the arcade total', () => {
    const total = [3, 2, 1].reduce(
      (sum, remaining) => sum + transformKillPoints(TransformType.SCORPION, remaining),
      0,
    );
    expect(total).toBe(160 * 3 + 1000);
  });

  it('rejects an unknown transform type instead of scoring NaN', () => {
    expect(() => transformSetPoints('mothership')).toThrow(/Unknown transform type/);
  });
});

describe('formation values', () => {
  it('matches the arcade table', () => {
    expect(scoreFor(EnemyType.ZAKO)).toBe(50);
    expect(scoreFor(EnemyType.GOEI)).toBe(80);
    expect(scoreFor(EnemyType.BOSS)).toBe(150);
  });

  it('rejects an unknown enemy type instead of scoring NaN', () => {
    expect(() => scoreFor('mothership')).toThrow(/Unknown enemy type/);
  });
});

describe('diving values', () => {
  it('doubles zako and goei while they attack', () => {
    expect(scoreFor(EnemyType.ZAKO, { diving: true })).toBe(100);
    expect(scoreFor(EnemyType.GOEI, { diving: true })).toBe(160);
  });

  it('always pays more for a diving target than a parked one', () => {
    for (const type of [EnemyType.ZAKO, EnemyType.GOEI, EnemyType.BOSS]) {
      expect(scoreFor(type, { diving: true })).toBeGreaterThan(scoreFor(type));
    }
  });

  it('doubles a diving boss for each escort, to a maximum of two', () => {
    expect(scoreFor(EnemyType.BOSS, { diving: true, escorts: 0 })).toBe(400);
    expect(scoreFor(EnemyType.BOSS, { diving: true, escorts: 1 })).toBe(800);
    expect(scoreFor(EnemyType.BOSS, { diving: true, escorts: 2 })).toBe(1600);
  });

  it('clamps an impossible escort count rather than reading past the table', () => {
    expect(scoreFor(EnemyType.BOSS, { diving: true, escorts: 9 })).toBe(1600);
    expect(scoreFor(EnemyType.BOSS, { diving: true, escorts: -3 })).toBe(400);
  });

  it('ignores escorts for non-boss targets', () => {
    expect(scoreFor(EnemyType.ZAKO, { diving: true, escorts: 2 })).toBe(100);
  });
});

describe('challenging stages', () => {
  it('pays a flat rate regardless of type or dive state', () => {
    for (const type of [EnemyType.ZAKO, EnemyType.GOEI, EnemyType.BOSS]) {
      expect(scoreFor(type, { challenging: true })).toBe(CHALLENGING_STAGE_HIT_POINTS);
      expect(scoreFor(type, { challenging: true, diving: true })).toBe(
        CHALLENGING_STAGE_HIT_POINTS,
      );
    }
  });
});

describe('extra lives', () => {
  it('awards nothing below the first threshold', () => {
    expect(extraLivesEarned(0, FIRST_EXTRA_LIFE - 1)).toBe(0);
  });

  it('awards one on crossing the first threshold', () => {
    expect(extraLivesEarned(FIRST_EXTRA_LIFE - 50, FIRST_EXTRA_LIFE)).toBe(1);
  });

  it('does not award again for scoring within the same band', () => {
    expect(extraLivesEarned(FIRST_EXTRA_LIFE, FIRST_EXTRA_LIFE + 100)).toBe(0);
  });

  // The arcade awards the second ship at 70000 outright, not at 20000 plus an
  // interval. Reading the setting as a uniform interval from 20000 puts the
  // second award at 90000 and every later one wrong too.
  it('awards the second ship at 70000, not at 20000 plus an interval', () => {
    expect(extraLivesEarned(SECOND_EXTRA_LIFE - 1, SECOND_EXTRA_LIFE)).toBe(1);
    expect(extraLivesEarned(0, 89999)).toBe(2);
  });

  it('awards every 70000 after the second', () => {
    const third = SECOND_EXTRA_LIFE + EXTRA_LIFE_INTERVAL;
    expect(extraLivesEarned(third - 1, third)).toBe(1);
    expect(extraLivesEarned(0, third)).toBe(3);
  });

  it('awards several when one bonus vaults multiple thresholds', () => {
    const target = SECOND_EXTRA_LIFE + EXTRA_LIFE_INTERVAL * 2;
    expect(extraLivesEarned(0, target)).toBe(4);
  });

  it('never goes backwards as the score climbs', () => {
    let total = 0;
    for (let score = 0; score <= 400000; score += 1000) {
      const earned = extraLivesEarned(score, score + 1000);
      expect(earned).toBeGreaterThanOrEqual(0);
      total += earned;
    }
    // 20k, 70k, then every 70k up to 400k: 20k/70k/140k/210k/280k/350k.
    expect(total).toBe(6);
  });

  it('never awards a life for a score that did not move', () => {
    expect(extraLivesEarned(50000, 50000)).toBe(0);
  });
});

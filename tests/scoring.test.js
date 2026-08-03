import { describe, it, expect } from 'vitest';
import { EnemyType } from '../src/systems/formation.js';
import {
  scoreFor,
  extraLivesEarned,
  FIRST_EXTRA_LIFE,
  SECOND_EXTRA_LIFE,
  EXTRA_LIFE_INTERVAL,
  CHALLENGING_STAGE_HIT_POINTS,
  CHALLENGE_WAVE_SIZE,
  challengeColorFor,
  challengeKillPoints,
  challengeWaveBonus,
  CAPTIVE_PARKED_POINTS,
  CAPTIVE_FLYING_POINTS,
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

describe('captured-fighter values', () => {
  // Colour 7 in d_scoreman_inc_lut (game_ctrl.s:1290): 500 base, and the
  // flight premium doubles it like any other colour (gg1-5.s:1244-1252).
  it('pays 500 parked and 1000 flying', () => {
    expect(CAPTIVE_PARKED_POINTS).toBe(500);
    expect(CAPTIVE_FLYING_POINTS).toBe(1000);
  });
});

describe('challenging stages', () => {
  // d_290E (gg1-3.s:1641-1642) decoded: the first round dresses its enemies
  // in colour 3 (the yellowbee's 50), every later round in a colour worth 80.
  it('colours the first round as bees and the rest as specials', () => {
    expect(challengeColorFor(3)).toBe(3);
    for (const stage of [7, 11, 15, 19, 23, 27, 31]) {
      expect([2, 4, 5, 6]).toContain(challengeColorFor(stage));
    }
  });

  it('wraps the round dressing table after eight challenge stages', () => {
    expect(challengeColorFor(35)).toBe(challengeColorFor(3));
  });

  it('pays 100 a kill on the first challenge round', () => {
    expect(challengeKillPoints(EnemyType.ZAKO, 3)).toBe(100);
    expect(challengeKillPoints(EnemyType.GOEI, 3)).toBe(100);
  });

  it('pays 160 a kill on every later challenge round', () => {
    for (const stage of [7, 11, 15, 19, 23, 27, 31]) {
      expect(challengeKillPoints(EnemyType.ZAKO, stage)).toBe(160);
      expect(challengeKillPoints(EnemyType.GOEI, stage)).toBe(160);
    }
  });

  // 300 from the doubled blue-boss base plus the 01B5 default scode
  // (task_man.s:302-303): the same 400 a lone flying boss pays anywhere.
  it('pays a challenge boss the flying 400', () => {
    expect(challengeKillPoints(EnemyType.BOSS, 3)).toBe(400);
    expect(challengeKillPoints(EnemyType.BOSS, 7)).toBe(400);
  });

  // d_stage_chllg_rnd_attrib (gg1-3.s:1633-1637), stepped every eight
  // stages and clamped at the 3000 row from stage 32 on.
  it('steps the all-eight wave bonus 1000/1500/2000/3000', () => {
    expect(challengeWaveBonus(3)).toBe(1000);
    expect(challengeWaveBonus(7)).toBe(1000);
    expect(challengeWaveBonus(11)).toBe(1500);
    expect(challengeWaveBonus(15)).toBe(1500);
    expect(challengeWaveBonus(19)).toBe(2000);
    expect(challengeWaveBonus(23)).toBe(2000);
    expect(challengeWaveBonus(27)).toBe(3000);
    expect(challengeWaveBonus(31)).toBe(3000);
    expect(challengeWaveBonus(35)).toBe(3000);
    expect(challengeWaveBonus(103)).toBe(3000);
  });

  it('adds the wave bonus to the kill that completes a wave of eight', () => {
    expect(CHALLENGE_WAVE_SIZE).toBe(8);
    expect(challengeKillPoints(EnemyType.ZAKO, 3, { completesWave: true })).toBe(100 + 1000);
    expect(challengeKillPoints(EnemyType.GOEI, 11, { completesWave: true })).toBe(160 + 1500);
  });

  // The eighth kill routes through the wave-bonus notify and skips the
  // boss's scode (gg1-5.s:1283-1300): 300 + bonus, not 400 + bonus.
  it('drops the boss scode on the wave-completing kill', () => {
    expect(challengeKillPoints(EnemyType.BOSS, 3, { completesWave: true })).toBe(300 + 1000);
  });

  // The results tally pays 100 a hit (d_scoreman_inc_lut[0] = 0x10 applied
  // to _bug_collsn[$0F], game_ctrl.s:940-990).
  it('rates the results-screen bonus at 100 a hit', () => {
    expect(CHALLENGING_STAGE_HIT_POINTS).toBe(100);
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

describe('bonus schemes from the DIP sheet', () => {
  it('stops after the second award when the scheme has no interval', () => {
    const scheme = { id: 'A', first: 20000, second: 60000, every: null };
    expect(extraLivesEarned(0, 60000, scheme)).toBe(2);
    expect(extraLivesEarned(60000, 500000, scheme)).toBe(0);
  });

  it('pays nothing at all on the NONE scheme', () => {
    const none = { id: 'NONE', first: null, second: null, every: null };
    expect(extraLivesEarned(0, 1000000, none)).toBe(0);
  });

  it('matches the factory constants when called without a scheme', () => {
    expect(extraLivesEarned(0, 20000)).toBe(1);
    expect(extraLivesEarned(0, 70000)).toBe(2);
    expect(extraLivesEarned(0, 140000)).toBe(3);
  });

  it('shifts the ladder on a harder scheme', () => {
    const hard = { id: 'E', first: 30000, second: 100000, every: 100000 };
    expect(extraLivesEarned(0, 29999, hard)).toBe(0);
    expect(extraLivesEarned(0, 30000, hard)).toBe(1);
    expect(extraLivesEarned(0, 100000, hard)).toBe(2);
    expect(extraLivesEarned(0, 300000, hard)).toBe(4);
  });
});

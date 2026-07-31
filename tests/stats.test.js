import { describe, it, expect } from 'vitest';
import {
  createStats,
  recordShot,
  recordHit,
  hitMissRatio,
  formatRatio,
} from '../src/systems/stats.js';

describe('shot accounting', () => {
  it('starts empty', () => {
    expect(createStats()).toEqual({ shotsFired: 0, hits: 0 });
  });

  it('does not mutate the value passed in', () => {
    const start = createStats();
    recordShot(start);
    recordHit(start);
    expect(start).toEqual({ shotsFired: 0, hits: 0 });
  });

  it('counts a dual-fighter volley as two shots', () => {
    expect(recordShot(createStats(), 2).shotsFired).toBe(2);
  });
});

describe('hit-miss ratio', () => {
  it('reads zero before a shot is fired, not NaN', () => {
    expect(hitMissRatio(createStats())).toBe(0);
    expect(Number.isNaN(hitMissRatio(createStats()))).toBe(false);
  });

  it('computes the obvious cases', () => {
    expect(hitMissRatio({ shotsFired: 10, hits: 5 })).toBe(50);
    expect(hitMissRatio({ shotsFired: 4, hits: 4 })).toBe(100);
    expect(hitMissRatio({ shotsFired: 8, hits: 0 })).toBe(0);
  });

  it('caps at 100 when a dual volley registers more hits than counted shots', () => {
    expect(hitMissRatio({ shotsFired: 3, hits: 5 })).toBe(100);
  });

  it('formats to one decimal place, as the results screen shows it', () => {
    expect(formatRatio({ shotsFired: 3, hits: 1 })).toBe('33.3%');
    expect(formatRatio(createStats())).toBe('0.0%');
  });
});

import { describe, it, expect } from 'vitest';
import {
  isChallengingStage,
  stageDifficulty,
  stageFlags,
  enemiesFireDuringEntry,
  challengingPatternIndex,
} from '../src/systems/stages.js';

describe('challenging stage cadence', () => {
  it('lands on stage 3 and every fourth stage after it', () => {
    const challenging = [];
    for (let stage = 1; stage <= 32; stage += 1) {
      if (isChallengingStage(stage)) challenging.push(stage);
    }
    expect(challenging).toEqual([3, 7, 11, 15, 19, 23, 27, 31]);
  });

  it('never fires before stage 3', () => {
    expect(isChallengingStage(1)).toBe(false);
    expect(isChallengingStage(2)).toBe(false);
  });
});

describe('difficulty ramp', () => {
  it('shortens the gap between dives as stages advance', () => {
    expect(stageDifficulty(8).diveIntervalMs).toBeLessThan(stageDifficulty(1).diveIntervalMs);
  });

  it('never lets the dive interval reach zero', () => {
    for (let stage = 1; stage <= 200; stage += 1) {
      expect(stageDifficulty(stage).diveIntervalMs).toBeGreaterThanOrEqual(900);
    }
  });

  it('caps every knob so late stages stay playable', () => {
    const late = stageDifficulty(999);
    expect(late.maxSimultaneousDivers).toBeLessThanOrEqual(6);
    expect(late.diveSpeed).toBeLessThanOrEqual(1.7);
    expect(late.escortChance).toBeLessThanOrEqual(0.75);
  });

  // Regression. An enemy sitting in the grid never shoots in the arcade; only
  // a flying one bombs. A rate of fire for the formation would put every one
  // of the forty in play at once and flatten the rhythm the dives create.
  it('gives the formation no rate of fire at all', () => {
    for (let stage = 1; stage <= 200; stage += 1) {
      expect(stageDifficulty(stage).formationFireIntervalMs).toBeUndefined();
    }
  });

  it('plateaus rather than ramping forever', () => {
    expect(stageDifficulty(16)).toEqual(stageDifficulty(50));
  });

  it('never regresses in difficulty as the stage rises', () => {
    for (let stage = 2; stage <= 40; stage += 1) {
      const previous = stageDifficulty(stage - 1);
      const current = stageDifficulty(stage);
      expect(current.diveIntervalMs).toBeLessThanOrEqual(previous.diveIntervalMs);
      expect(current.maxSimultaneousDivers).toBeGreaterThanOrEqual(
        previous.maxSimultaneousDivers,
      );
      expect(current.diveSpeed).toBeGreaterThanOrEqual(previous.diveSpeed);
    }
  });
});

describe('firing during entry', () => {
  it('holds fire for the whole of round 1, as the arcade does', () => {
    expect(enemiesFireDuringEntry(1)).toBe(false);
  });

  it('opens up from round 2', () => {
    expect(enemiesFireDuringEntry(2)).toBe(true);
    expect(enemiesFireDuringEntry(4)).toBe(true);
  });

  it('never fires during a challenging stage', () => {
    for (let stage = 1; stage <= 40; stage += 1) {
      if (isChallengingStage(stage)) {
        expect(enemiesFireDuringEntry(stage)).toBe(false);
      }
    }
  });
});

describe('challenging stage patterns', () => {
  it('is null on a normal stage', () => {
    expect(challengingPatternIndex(2)).toBeNull();
    expect(challengingPatternIndex(5)).toBeNull();
  });

  it('counts challenging stages from zero', () => {
    expect(challengingPatternIndex(3)).toBe(0);
    expect(challengingPatternIndex(7)).toBe(1);
    expect(challengingPatternIndex(11)).toBe(2);
  });

  it('cycles rather than growing without bound once modulo is applied', () => {
    const indices = [3, 7, 11, 15, 19].map((s) => challengingPatternIndex(s) % 4);
    expect(new Set(indices).size).toBeGreaterThan(1);
  });
});

describe('stage flags', () => {
  it('shows a single flag for stage 1', () => {
    expect(stageFlags(1)).toEqual([{ value: 1, count: 1 }]);
  });

  it('prefers larger denominations, as the arcade cabinet does', () => {
    expect(stageFlags(8)).toEqual([
      { value: 5, count: 1 },
      { value: 1, count: 3 },
    ]);
  });

  it('uses the 50 flag once the stage is high enough', () => {
    expect(stageFlags(50)).toEqual([{ value: 50, count: 1 }]);
  });

  it('always sums back to the stage number', () => {
    for (let stage = 1; stage <= 120; stage += 1) {
      const total = stageFlags(stage).reduce(
        (sum, flag) => sum + flag.value * flag.count,
        0,
      );
      expect(total).toBe(stage);
    }
  });

  it('returns nothing for stage 0', () => {
    expect(stageFlags(0)).toEqual([]);
  });
});

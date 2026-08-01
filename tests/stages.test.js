import { describe, it, expect } from 'vitest';
import {
  isChallengingStage,
  stageDifficulty,
  stageFlags,
  enemiesFireDuringEntry,
  challengingPatternIndex,
  CHALLENGING_PATTERN_COUNT,
  transformTypeFor,
  TransformType,
  entrancePatternFor,
  ENTRANCE_PATTERN_COUNT,
  combatStageIndex,
  COMBAT_STAGE_ROWS,
  enemiesBomb,
  captureAllowed,
  CAPTURE_MIN_ENEMIES,
  challengingRoster,
  nextStage,
  STAGE_ROLLOVER,
} from '../src/systems/stages.js';
import { EnemyType } from '../src/systems/formation.js';

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

  it('gives the first eight challenging stages eight different patterns', () => {
    const stages = [3, 7, 11, 15, 19, 23, 27, 31];
    const indices = stages.map(challengingPatternIndex);
    expect(indices).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('repeats the cycle after stage 31, as the arcade does', () => {
    expect(challengingPatternIndex(35)).toBe(0);
    expect(challengingPatternIndex(39)).toBe(1);
    expect(challengingPatternIndex(63)).toBe(7);
  });

  it('never returns an index outside the pattern set', () => {
    for (let stage = 3; stage <= 200; stage += 4) {
      const index = challengingPatternIndex(stage);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(CHALLENGING_PATTERN_COUNT);
    }
  });
});

describe('entrance patterns', () => {
  it('offers the three patterns the arcade has', () => {
    expect(ENTRANCE_PATTERN_COUNT).toBe(3);
  });

  it('fixes one pattern for the whole of a stage', () => {
    // The property that matters: asking twice for the same stage is the same
    // answer, so every flight in a wave can be built from one pattern.
    for (let stage = 1; stage <= 40; stage += 1) {
      expect(entrancePatternFor(stage)).toBe(entrancePatternFor(stage));
    }
  });

  it('keeps the pattern in range for any stage', () => {
    for (let stage = 1; stage <= 300; stage += 1) {
      const pattern = entrancePatternFor(stage);
      expect(Number.isInteger(pattern)).toBe(true);
      expect(pattern).toBeGreaterThanOrEqual(0);
      expect(pattern).toBeLessThan(ENTRANCE_PATTERN_COUNT);
    }
  });

  it('cycles all three rather than favouring one', () => {
    const seen = new Set();
    for (let stage = 1; stage <= 12; stage += 1) seen.add(entrancePatternFor(stage));
    expect(seen.size).toBe(ENTRANCE_PATTERN_COUNT);
  });

  // Consecutive *combat* stages, not consecutive stage numbers: the arcade's
  // row index counts combat stages only, so a challenging stage does not
  // advance it and stages 2 and 4 are the neighbouring pair, not 3 and 4.
  it('changes pattern from one combat stage to the next', () => {
    const combat = [];
    for (let stage = 1; stage <= 40; stage += 1) {
      if (!isChallengingStage(stage)) combat.push(entrancePatternFor(stage));
    }
    for (let i = 1; i < combat.length; i += 1) {
      expect(combat[i]).not.toBe(combat[i - 1]);
    }
  });
});

describe('the arcade entrance-row cycle', () => {
  it('gives stage 1 the first row', () => {
    expect(combatStageIndex(1)).toBe(0);
  });

  it('numbers combat stages consecutively, skipping challenging stages', () => {
    expect([1, 2, 4, 5, 6, 8, 9, 10].map(combatStageIndex)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('uses every one of the seventeen rows before repeating', () => {
    const rows = [];
    for (let stage = 1; stage <= 23; stage += 1) {
      if (!isChallengingStage(stage)) rows.push(combatStageIndex(stage));
    }
    expect(rows).toEqual([...Array(COMBAT_STAGE_ROWS).keys()]);
  });

  it('wraps stages past 23 back by four, as the arcade does', () => {
    expect(combatStageIndex(24)).toBe(combatStageIndex(20));
    expect(combatStageIndex(25)).toBe(combatStageIndex(21));
    expect(combatStageIndex(26)).toBe(combatStageIndex(22));
    expect(combatStageIndex(28)).toBe(combatStageIndex(20));
  });

  it('stays inside the table for every stage number, rollover included', () => {
    for (let stage = 0; stage <= STAGE_ROLLOVER; stage += 1) {
      const row = combatStageIndex(stage);
      expect(Number.isInteger(row)).toBe(true);
      expect(row).toBeGreaterThanOrEqual(0);
      expect(row).toBeLessThan(COMBAT_STAGE_ROWS);
    }
  });
});

describe('enemy bombing', () => {
  it('holds fire completely through the opening stage', () => {
    expect(enemiesBomb(1)).toBe(false);
  });

  it('opens up from stage 2', () => {
    expect(enemiesBomb(2)).toBe(true);
    expect(enemiesBomb(4)).toBe(true);
  });

  it('never bombs during a challenging stage', () => {
    for (const stage of [3, 7, 11, 15]) expect(enemiesBomb(stage)).toBe(false);
  });

  it('is a superset of firing on the way in', () => {
    for (let stage = 1; stage <= 40; stage += 1) {
      if (enemiesFireDuringEntry(stage)) expect(enemiesBomb(stage)).toBe(true);
    }
  });
});

describe('capture gating', () => {
  it('never deploys a beam during the opening stage', () => {
    expect(captureAllowed(1, 40)).toBe(false);
  });

  it('allows a beam from stage 2 with a full formation', () => {
    expect(captureAllowed(2, 40)).toBe(true);
  });

  it('never deploys a beam during a challenging stage', () => {
    expect(captureAllowed(7, 40)).toBe(false);
  });

  it('stops trying once the formation is nearly cleared', () => {
    expect(captureAllowed(5, CAPTURE_MIN_ENEMIES)).toBe(false);
    expect(captureAllowed(5, 2)).toBe(false);
    expect(captureAllowed(5, CAPTURE_MIN_ENEMIES + 1)).toBe(true);
  });
});

describe('challenging stage roster', () => {
  it('has no roster for a normal stage', () => {
    expect(challengingRoster(2)).toBeNull();
  });

  it('brings forty enemies', () => {
    expect(challengingRoster(3)).toHaveLength(40);
  });

  it('brings exactly four Boss Galaga', () => {
    for (const stage of [3, 7, 11, 15, 19]) {
      const bosses = challengingRoster(stage).filter((type) => type === EnemyType.BOSS);
      expect(bosses).toHaveLength(4);
    }
  });

  it('fills the rest of the wave with a single rank', () => {
    for (const stage of [3, 7, 11, 15, 19, 23, 27, 31]) {
      const ranks = new Set(challengingRoster(stage).filter((type) => type !== EnemyType.BOSS));
      expect(ranks.size).toBe(1);
    }
  });

  it('flies Zako in the first bonus round and Goei in the second', () => {
    expect(challengingRoster(3).at(-1)).toBe(EnemyType.ZAKO);
    expect(challengingRoster(7).at(-1)).toBe(EnemyType.GOEI);
  });

  it('puts the bosses at the front, where the formation keeps them', () => {
    expect(challengingRoster(3).slice(0, 4)).toEqual(Array(4).fill(EnemyType.BOSS));
  });
});

describe('transform bonus enemies', () => {
  it('does not appear before stage 4', () => {
    expect(transformTypeFor(1)).toBeNull();
    expect(transformTypeFor(2)).toBeNull();
    expect(transformTypeFor(3)).toBeNull();
  });

  it('runs scorpions for the three stages after the first challenging stage', () => {
    expect(transformTypeFor(4)).toBe(TransformType.SCORPION);
    expect(transformTypeFor(5)).toBe(TransformType.SCORPION);
    expect(transformTypeFor(6)).toBe(TransformType.SCORPION);
  });

  it('runs spy ships on stages 8 to 10', () => {
    expect(transformTypeFor(8)).toBe(TransformType.SPY_SHIP);
    expect(transformTypeFor(9)).toBe(TransformType.SPY_SHIP);
    expect(transformTypeFor(10)).toBe(TransformType.SPY_SHIP);
  });

  it('runs flagships on stages 12 to 14', () => {
    expect(transformTypeFor(12)).toBe(TransformType.FLAGSHIP);
    expect(transformTypeFor(13)).toBe(TransformType.FLAGSHIP);
    expect(transformTypeFor(14)).toBe(TransformType.FLAGSHIP);
  });

  it('repeats the three types in the same order from stage 16', () => {
    expect(transformTypeFor(16)).toBe(TransformType.SCORPION);
    expect(transformTypeFor(20)).toBe(TransformType.SPY_SHIP);
    expect(transformTypeFor(24)).toBe(TransformType.FLAGSHIP);
    expect(transformTypeFor(28)).toBe(TransformType.SCORPION);
  });

  it('never appears during a challenging stage, which has no formation to pull from', () => {
    for (let stage = 1; stage <= 60; stage += 1) {
      if (isChallengingStage(stage)) expect(transformTypeFor(stage)).toBeNull();
    }
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

describe('the stage counter rolling over', () => {
  it('counts up normally everywhere below the wrap', () => {
    expect(nextStage(1)).toBe(2);
    expect(nextStage(254)).toBe(255);
  });

  it('announces stage zero after 255, as the arcade does', () => {
    expect(nextStage(STAGE_ROLLOVER)).toBe(0);
  });

  it('keeps counting from zero rather than sticking there', () => {
    expect(nextStage(0)).toBe(1);
  });

  it('shows no flags for stage zero, because zero needs none', () => {
    expect(stageFlags(0)).toEqual([]);
  });

  // Everything a stage decides for itself has to survive the wrap, or the
  // rollover becomes a crash rather than a curiosity.
  it('still answers every stage question at zero', () => {
    expect(isChallengingStage(0)).toBe(false);
    expect(challengingPatternIndex(0)).toBeNull();
    expect(transformTypeFor(0)).toBeNull();
    expect(enemiesFireDuringEntry(0)).toBe(false);
  });

  it('picks a real entrance pattern for stage zero', () => {
    const pattern = entrancePatternFor(0);
    expect(pattern).toBeGreaterThanOrEqual(0);
    expect(pattern).toBeLessThan(ENTRANCE_PATTERN_COUNT);
  });

  it('reaches the wrap from any stage by counting', () => {
    let stage = 250;
    const seen = [];
    for (let i = 0; i < 8; i += 1) {
      stage = nextStage(stage);
      seen.push(stage);
    }

    expect(seen).toEqual([251, 252, 253, 254, 255, 0, 1, 2]);
  });
});

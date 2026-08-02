import { describe, it, expect } from 'vitest';
import {
  HIGH_SCORE_KEY,
  SCORE_TABLE_KEY,
  SCORE_TABLE_SIZE,
  NAME_LENGTH,
  NAME_ALPHABET,
  createMemoryStorage,
  resolveStorage,
  loadHighScore,
  saveHighScore,
  defaultScoreTable,
  sanitizeName,
  loadScoreTable,
  saveScoreTable,
  scoreTableRank,
  qualifiesForScoreTable,
  insertScoreEntry,
  recordScore,
  loadRank,
  saveRank,
  RANK_KEY,
} from '../src/systems/persistence.js';
import { DifficultyRank } from '../src/systems/caravans.js';

describe('loading', () => {
  it('reads zero when nothing has been stored', () => {
    expect(loadHighScore(createMemoryStorage())).toBe(0);
  });

  it('reads back a stored score', () => {
    const storage = createMemoryStorage({ [HIGH_SCORE_KEY]: '31500' });
    expect(loadHighScore(storage)).toBe(31500);
  });

  it('treats a corrupt value as zero rather than propagating NaN', () => {
    const storage = createMemoryStorage({ [HIGH_SCORE_KEY]: 'not-a-number' });
    expect(loadHighScore(storage)).toBe(0);
  });

  it('rejects a negative stored score', () => {
    const storage = createMemoryStorage({ [HIGH_SCORE_KEY]: '-500' });
    expect(loadHighScore(storage)).toBe(0);
  });

  it('returns zero when the backend throws on read', () => {
    const hostile = {
      getItem() {
        throw new Error('access denied');
      },
      setItem() {},
    };
    expect(loadHighScore(hostile)).toBe(0);
  });
});

describe('saving', () => {
  it('persists a new best', () => {
    const storage = createMemoryStorage();
    expect(saveHighScore(storage, 12000)).toBe(12000);
    expect(loadHighScore(storage)).toBe(12000);
  });

  it('leaves a higher stored score alone', () => {
    const storage = createMemoryStorage({ [HIGH_SCORE_KEY]: '90000' });
    expect(saveHighScore(storage, 100)).toBe(90000);
    expect(loadHighScore(storage)).toBe(90000);
  });

  it('does not rewrite on an exact tie', () => {
    const storage = createMemoryStorage({ [HIGH_SCORE_KEY]: '5000' });
    expect(saveHighScore(storage, 5000)).toBe(5000);
  });

  it('survives a storage backend that refuses writes', () => {
    const readOnly = {
      getItem: () => '100',
      setItem() {
        throw new Error('quota exceeded');
      },
    };
    expect(saveHighScore(readOnly, 999999)).toBe(100);
  });

  it('persists across a simulated reload, which the original code did not', () => {
    const storage = createMemoryStorage();
    saveHighScore(storage, 42000);
    // A fresh session reading the same backend.
    expect(loadHighScore(storage)).toBe(42000);
  });
});

describe('resolving a backend', () => {
  it('falls back to memory when no storage is supplied', () => {
    const storage = resolveStorage(undefined);
    expect(saveHighScore(storage, 700)).toBe(700);
  });

  it('falls back when the candidate throws on probe, as private mode does', () => {
    const hostile = {
      getItem: () => null,
      setItem() {
        throw new Error('blocked');
      },
    };
    const storage = resolveStorage(hostile);
    expect(saveHighScore(storage, 700)).toBe(700);
  });

  it('uses a working backend as given', () => {
    const real = createMemoryStorage();
    real.removeItem = () => {};
    expect(resolveStorage(real)).toBe(real);
  });
});

describe('the score table', () => {
  const stored = (table) =>
    createMemoryStorage({ [SCORE_TABLE_KEY]: JSON.stringify(table) });

  it('starts on the factory ladder, highest first', () => {
    const table = loadScoreTable(createMemoryStorage());

    expect(table).toHaveLength(SCORE_TABLE_SIZE);
    expect(table.map((entry) => entry.score)).toEqual([20000, 15000, 10000, 7000, 5000]);
  });

  it('hands back a copy, so a caller cannot edit the factory table', () => {
    const first = defaultScoreTable();
    first[0].score = 1;
    expect(defaultScoreTable()[0].score).toBe(20000);
  });

  it('reads back a stored board', () => {
    const table = loadScoreTable(stored([{ name: 'JOS', score: 88000 }]));
    expect(table[0]).toEqual({ name: 'JOS', score: 88000 });
  });

  it('falls back to the factory board rather than showing an empty one', () => {
    const corrupt = createMemoryStorage({ [SCORE_TABLE_KEY]: 'not json at all' });
    expect(loadScoreTable(corrupt)).toEqual(defaultScoreTable());
  });

  it('drops rows that are not scores instead of drawing NaN', () => {
    const table = loadScoreTable(
      stored([
        { name: 'BAD', score: 'lots' },
        { name: 'FIN', score: 30000 },
      ]),
    );

    expect(table.every((entry) => Number.isFinite(entry.score))).toBe(true);
    expect(table[0]).toEqual({ name: 'FIN', score: 30000 });
  });

  it('survives a stored value that is not even an array', () => {
    const table = loadScoreTable(createMemoryStorage({ [SCORE_TABLE_KEY]: '{"score":5}' }));
    expect(table).toEqual(defaultScoreTable());
  });

  it('always fills five rows, however few were stored', () => {
    expect(loadScoreTable(stored([{ name: 'ONE', score: 99000 }]))).toHaveLength(SCORE_TABLE_SIZE);
  });

  it('sorts a board that was stored out of order', () => {
    const table = loadScoreTable(
      stored([
        { name: 'LOW', score: 21000 },
        { name: 'TOP', score: 99000 },
      ]),
    );

    expect(table[0].name).toBe('TOP');
    expect(table[1].name).toBe('LOW');
  });

  it('round-trips through a save', () => {
    const storage = createMemoryStorage();
    const table = insertScoreEntry(defaultScoreTable(), { name: 'ACE', score: 50000 });
    saveScoreTable(storage, table);

    expect(loadScoreTable(storage)).toEqual(table);
  });

  it('survives a backend that refuses the write', () => {
    const readOnly = {
      getItem: () => null,
      setItem() {
        throw new Error('quota exceeded');
      },
    };

    expect(() => saveScoreTable(readOnly, defaultScoreTable())).not.toThrow();
  });
});

describe('ranking a finished run', () => {
  const table = defaultScoreTable();

  it('puts a new best at the top', () => {
    expect(scoreTableRank(table, 25000)).toBe(0);
  });

  it('places a mid-table score in the row it beats', () => {
    expect(scoreTableRank(table, 12000)).toBe(2);
  });

  it('keeps a score that beats nothing off the board', () => {
    expect(scoreTableRank(table, 4000)).toBe(-1);
    expect(qualifiesForScoreTable(table, 4000)).toBe(false);
  });

  // Whoever got there first keeps the row.
  it('does not let a tie displace the score it matched', () => {
    expect(scoreTableRank(table, 5000)).toBe(-1);
  });

  it('never puts a scoreless run on the board', () => {
    expect(scoreTableRank(table, 0)).toBe(-1);
  });

  it('fills a short board before it starts refusing scores', () => {
    expect(scoreTableRank([{ name: 'ONE', score: 90000 }], 10)).toBe(1);
  });

  it('inserts at the rank it reported and drops the bottom row', () => {
    const next = insertScoreEntry(table, { name: 'NEW', score: 12000 });

    expect(next).toHaveLength(SCORE_TABLE_SIZE);
    expect(next[2]).toEqual({ name: 'NEW', score: 12000 });
    expect(next.map((entry) => entry.score)).toEqual([20000, 15000, 12000, 10000, 7000]);
  });

  it('leaves the board alone for a score that did not make it', () => {
    expect(insertScoreEntry(table, { name: 'NAH', score: 10 })).toEqual(table);
  });

  it('does not mutate the board it was given', () => {
    const before = defaultScoreTable();
    insertScoreEntry(before, { name: 'NEW', score: 99000 });
    expect(before).toEqual(defaultScoreTable());
  });

  it('banks the table and the single high score together', () => {
    const storage = createMemoryStorage();
    const table = recordScore(storage, { name: 'JOS', score: 64000 });

    expect(table[0]).toEqual({ name: 'JOS', score: 64000 });
    expect(loadScoreTable(storage)[0].name).toBe('JOS');
    expect(loadHighScore(storage)).toBe(64000);
  });

  it('leaves the stored high score in place when the run did not beat it', () => {
    const storage = createMemoryStorage({ [HIGH_SCORE_KEY]: '90000' });
    recordScore(storage, { name: 'JOS', score: 30000 });
    expect(loadHighScore(storage)).toBe(90000);
  });
});

describe('initials', () => {
  it('takes three letters as given', () => {
    expect(sanitizeName('JOS')).toBe('JOS');
  });

  it('upper-cases what it is handed', () => {
    expect(sanitizeName('jos')).toBe('JOS');
  });

  it('truncates a name too long for the board', () => {
    expect(sanitizeName('JOSHUA')).toHaveLength(NAME_LENGTH);
  });

  it('pads a short name to the width the board draws', () => {
    expect(sanitizeName('JO')).toBe('JO ');
  });

  it('drops characters the cabinet has no glyph for', () => {
    expect(sanitizeName('J<>')).toBe('J  ');
  });

  it('falls back rather than drawing a blank row', () => {
    expect(sanitizeName('   ')).toBe('AAA');
    expect(sanitizeName(undefined)).toBe('AAA');
  });

  it('accepts every character the entry cursor can reach', () => {
    for (const character of NAME_ALPHABET) {
      expect(sanitizeName(`A${character}A`)).toBe(`A${character}A`);
    }
  });

  it('stores a sanitised name even when the caller did not sanitise it', () => {
    const next = insertScoreEntry(defaultScoreTable(), { name: 'joshua', score: 99000 });
    expect(next[0].name).toBe('JOS');
  });
});

describe('a board inherited from a build that had no board', () => {
  it('folds an old high score onto the board so the two cannot disagree', () => {
    const storage = createMemoryStorage({ [HIGH_SCORE_KEY]: '64000' });
    expect(loadScoreTable(storage)[0]).toEqual({ name: 'AAA', score: 64000 });
  });

  it('leaves the board alone when the old score would not have made it', () => {
    const storage = createMemoryStorage({ [HIGH_SCORE_KEY]: '4380' });
    expect(loadScoreTable(storage)).toEqual(defaultScoreTable());
  });

  it('does not add the same old score twice on a second load', () => {
    const storage = createMemoryStorage({ [HIGH_SCORE_KEY]: '64000' });
    const once = loadScoreTable(storage);
    saveScoreTable(storage, once);

    expect(loadScoreTable(storage)).toEqual(once);
  });

  it('says nothing about a board that has already been beaten', () => {
    const storage = createMemoryStorage({
      [HIGH_SCORE_KEY]: '64000',
      [SCORE_TABLE_KEY]: JSON.stringify([{ name: 'JOS', score: 90000 }]),
    });

    expect(loadScoreTable(storage)[0]).toEqual({ name: 'JOS', score: 90000 });
  });
});

/**
 * The operator's difficulty rank.
 *
 * Stored like a machine setting rather than carried in a game: a real cabinet
 * keeps it on a DIP switch inside the box, so it survives a reload and applies
 * to whoever plays next.
 */
describe('the difficulty rank', () => {
  it('comes up at the factory rank on a machine nobody has set', () => {
    expect(loadRank(createMemoryStorage())).toBe(DifficultyRank.A);
  });

  it('remembers what it was set to', () => {
    const storage = createMemoryStorage();
    saveRank(storage, DifficultyRank.C);
    expect(loadRank(storage)).toBe(DifficultyRank.C);
  });

  it('returns the rank in effect, so a caller need not read it back', () => {
    expect(saveRank(createMemoryStorage(), DifficultyRank.D)).toBe(DifficultyRank.D);
  });

  it('clamps anything stored outside the four ranks', () => {
    expect(loadRank(createMemoryStorage({ [RANK_KEY]: '9' }))).toBe(DifficultyRank.D);
    expect(loadRank(createMemoryStorage({ [RANK_KEY]: '-2' }))).toBe(DifficultyRank.A);
    expect(loadRank(createMemoryStorage({ [RANK_KEY]: 'hard' }))).toBe(DifficultyRank.A);
  });

  it('comes up playable rather than hard when storage throws', () => {
    const broken = {
      getItem() {
        throw new Error('blocked');
      },
      setItem() {
        throw new Error('blocked');
      },
    };

    expect(loadRank(broken)).toBe(DifficultyRank.A);
    expect(() => saveRank(broken, DifficultyRank.D)).not.toThrow();
  });
});

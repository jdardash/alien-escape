import { describe, it, expect } from 'vitest';
import {
  HIGH_SCORE_KEY,
  createMemoryStorage,
  resolveStorage,
  loadHighScore,
  saveHighScore,
} from '../src/systems/persistence.js';

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

import { describe, expect, it } from 'vitest';

import {
  SETTINGS_DEFAULTS,
  SETTINGS_KEY,
  VOLUME_STEP,
  loadSettings,
  normalizeSettings,
  saveSettings,
  stepVolume,
} from '../src/systems/settings.js';

/** A localStorage double: the three methods the module touches. */
function memoryStorage(initial = {}) {
  const store = { ...initial };
  return {
    getItem: (key) => (key in store ? store[key] : null),
    setItem: (key, value) => {
      store[key] = String(value);
    },
    dump: () => store,
  };
}

describe('normalizeSettings', () => {
  it('returns the factory block for garbage', () => {
    expect(normalizeSettings(null)).toEqual(SETTINGS_DEFAULTS);
    expect(normalizeSettings('knob')).toEqual(SETTINGS_DEFAULTS);
    expect(normalizeSettings(42)).toEqual(SETTINGS_DEFAULTS);
  });

  it('keeps a valid block as-is', () => {
    const block = { masterVolume: 0.5, scanlines: true };
    expect(normalizeSettings(block)).toEqual(block);
  });

  it('clamps volume into 0..1', () => {
    expect(normalizeSettings({ masterVolume: 1.7 }).masterVolume).toBe(1);
    expect(normalizeSettings({ masterVolume: -3 }).masterVolume).toBe(0);
  });

  it('rejects a non-numeric volume and a non-boolean scanlines flag', () => {
    expect(normalizeSettings({ masterVolume: 'loud' }).masterVolume).toBe(
      SETTINGS_DEFAULTS.masterVolume,
    );
    expect(normalizeSettings({ scanlines: 'yes' }).scanlines).toBe(
      SETTINGS_DEFAULTS.scanlines,
    );
  });

  it('snaps volume onto the knob detents', () => {
    // The service screen edits in tenths; a stored 0.33 lands on 0.3.
    expect(normalizeSettings({ masterVolume: 0.33 }).masterVolume).toBeCloseTo(0.3);
  });
});

describe('stepVolume', () => {
  it('moves one detent at a time', () => {
    expect(stepVolume(0.5, 1)).toBeCloseTo(0.5 + VOLUME_STEP);
    expect(stepVolume(0.5, -1)).toBeCloseTo(0.5 - VOLUME_STEP);
  });

  it('stops at the ends rather than wrapping', () => {
    expect(stepVolume(1, 1)).toBe(1);
    expect(stepVolume(0, -1)).toBe(0);
  });
});

describe('loadSettings / saveSettings', () => {
  it('round-trips a block', () => {
    const storage = memoryStorage();
    saveSettings(storage, { masterVolume: 0.4, scanlines: true });
    expect(loadSettings(storage)).toEqual({ masterVolume: 0.4, scanlines: true });
  });

  it('falls back to the factory block on corrupt storage', () => {
    const storage = memoryStorage({ [SETTINGS_KEY]: '{not json' });
    expect(loadSettings(storage)).toEqual(SETTINGS_DEFAULTS);
  });

  it('falls back to the factory block on empty storage', () => {
    expect(loadSettings(memoryStorage())).toEqual(SETTINGS_DEFAULTS);
  });

  it('survives a storage that throws on write', () => {
    const storage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota');
      },
    };
    expect(saveSettings(storage, { masterVolume: 0.4 })).toEqual({
      ...SETTINGS_DEFAULTS,
      masterVolume: 0.4,
    });
  });
});

import { describe, expect, it } from 'vitest';

import {
  BONUS_SCHEME_IDS,
  CoinageMode,
  DIP_DEFAULTS,
  DIPS_KEY,
  LIVES_OPTIONS,
  bonusSchemeFor,
  createCoinBox,
  insertCoin,
  loadDips,
  normalizeDips,
  saveDips,
  startAllowed,
  consumeCredits,
} from '../src/systems/dips.js';
import { createMemoryStorage } from '../src/systems/persistence.js';

describe('the switch block', () => {
  it('ships at the factory defaults: 3 fighters, 20k/70k/70k, free play', () => {
    expect(DIP_DEFAULTS.lives).toBe(3);
    expect(DIP_DEFAULTS.bonus).toBe('C');
    expect(DIP_DEFAULTS.coinage).toBe(CoinageMode.FREE_PLAY);
    expect(DIP_DEFAULTS.demoSound).toBe(true);
    expect(DIP_DEFAULTS.noFireBug).toBe(false);

    const scheme = bonusSchemeFor(DIP_DEFAULTS);
    expect(scheme).toMatchObject({ first: 20000, second: 70000, every: 70000 });
  });

  it('offers the cabinet lives choices', () => {
    expect(LIVES_OPTIONS).toEqual([2, 3, 4, 5]);
  });

  it('round-trips through storage', () => {
    const storage = createMemoryStorage();
    const dips = { ...DIP_DEFAULTS, lives: 5, bonus: 'E', coinage: CoinageMode.ONE_COIN_ONE_PLAY };
    saveDips(storage, dips);
    expect(loadDips(storage)).toEqual(dips);
    expect(storage.getItem(DIPS_KEY)).toBeTruthy();
  });

  it('lands corrupt or missing settings on the factory block', () => {
    const storage = createMemoryStorage();
    expect(loadDips(storage)).toEqual(DIP_DEFAULTS);

    storage.setItem(DIPS_KEY, 'not json');
    expect(loadDips(storage)).toEqual(DIP_DEFAULTS);

    storage.setItem(DIPS_KEY, JSON.stringify({ lives: 99, bonus: 'Q', coinage: 'gold' }));
    expect(loadDips(storage)).toEqual(DIP_DEFAULTS);
  });

  it('keeps valid fields while normalising invalid ones', () => {
    const fixed = normalizeDips({ lives: 4, bonus: 'nope', coinage: CoinageMode.TWO_COINS_ONE_PLAY });
    expect(fixed.lives).toBe(4);
    expect(fixed.bonus).toBe(DIP_DEFAULTS.bonus);
    expect(fixed.coinage).toBe(CoinageMode.TWO_COINS_ONE_PLAY);
  });
});

describe('bonus schemes', () => {
  it('defines every listed scheme for the standard lives block', () => {
    for (const id of BONUS_SCHEME_IDS) {
      const scheme = bonusSchemeFor({ ...DIP_DEFAULTS, bonus: id });
      expect(scheme.id).toBe(id);
    }
  });

  it('moves a two-fighter machine onto the harder bonus column', () => {
    const standard = bonusSchemeFor({ ...DIP_DEFAULTS, lives: 3, bonus: 'C' });
    const twoLives = bonusSchemeFor({ ...DIP_DEFAULTS, lives: 2, bonus: 'C' });
    expect(twoLives.first).toBeGreaterThan(standard.first);
  });

  it('has a NONE scheme that never pays', () => {
    const none = bonusSchemeFor({ ...DIP_DEFAULTS, bonus: 'NONE' });
    expect(none.first).toBeNull();
  });
});

describe('the coin box', () => {
  it('needs no coins on free play', () => {
    const box = createCoinBox();
    expect(startAllowed(CoinageMode.FREE_PLAY, box, 2)).toBe(true);
    // Consuming on free play changes nothing.
    expect(consumeCredits(CoinageMode.FREE_PLAY, box, 2)).toEqual(box);
  });

  it('pays one credit a coin at 1 coin / 1 play', () => {
    let box = createCoinBox();
    expect(startAllowed(CoinageMode.ONE_COIN_ONE_PLAY, box, 1)).toBe(false);
    box = insertCoin(CoinageMode.ONE_COIN_ONE_PLAY, box);
    expect(box.credits).toBe(1);
    expect(startAllowed(CoinageMode.ONE_COIN_ONE_PLAY, box, 1)).toBe(true);
    expect(startAllowed(CoinageMode.ONE_COIN_ONE_PLAY, box, 2)).toBe(false);
  });

  it('pays two credits a coin at 1 coin / 2 plays', () => {
    const box = insertCoin(CoinageMode.ONE_COIN_TWO_PLAYS, createCoinBox());
    expect(box.credits).toBe(2);
  });

  it('holds the first coin of a 2 coins / 1 play pair', () => {
    let box = insertCoin(CoinageMode.TWO_COINS_ONE_PLAY, createCoinBox());
    expect(box.credits).toBe(0);
    expect(box.pendingCoins).toBe(1);
    box = insertCoin(CoinageMode.TWO_COINS_ONE_PLAY, box);
    expect(box.credits).toBe(1);
    expect(box.pendingCoins).toBe(0);
  });

  it('deducts a credit per player on start', () => {
    let box = { credits: 3, pendingCoins: 0 };
    box = consumeCredits(CoinageMode.ONE_COIN_ONE_PLAY, box, 2);
    expect(box.credits).toBe(1);
  });
});

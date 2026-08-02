/**
 * The DIP switches.
 *
 * Inside the cabinet, two banks of DIP switches set everything the operator
 * is allowed to decide: how many fighters a credit buys (2, 3, 4 or 5),
 * which bonus-fighter scheme the machine pays, what a coin is worth, the
 * difficulty rank, and whether the attract loop makes noise. A browser has
 * no lid to lift, so the switches live in storage and are set from the
 * service screen -- but they are stored and honoured like machine settings,
 * not per-game options: they survive a reload and they apply to whoever
 * plays next.
 *
 * The lives choices, the bonus columns (including the harder column a
 * two-fighter machine switches to) and the coinage models follow the
 * cabinet's own DIP sheet; free play is the factory state *here* because a
 * public web build with a coin door would be a joke at the player's expense.
 * The difficulty rank keeps its own key in `persistence.js`, which predates
 * this block and is read in more places.
 */

import { normalizeRank } from './caravans.js';

export const DIPS_KEY = 'alienEscape.dips';

/** The fighters-per-credit choices the cabinet offers. */
export const LIVES_OPTIONS = [2, 3, 4, 5];

/** What a coin is worth. */
export const CoinageMode = {
  FREE_PLAY: 'freePlay',
  ONE_COIN_ONE_PLAY: '1c1p',
  ONE_COIN_TWO_PLAYS: '1c2p',
  TWO_COINS_ONE_PLAY: '2c1p',
};

export const COINAGE_OPTIONS = [
  CoinageMode.FREE_PLAY,
  CoinageMode.ONE_COIN_ONE_PLAY,
  CoinageMode.ONE_COIN_TWO_PLAYS,
  CoinageMode.TWO_COINS_ONE_PLAY,
];

/**
 * The bonus-fighter columns.
 *
 * `standard` is the sheet for a 3-to-5-fighter machine; `twoLives` is the
 * harder column a two-fighter machine switches to, because a game that
 * hands out fewer ships also hands out its bonuses later. `every: null`
 * means the scheme stops after its second award; `first: null` (the NONE
 * row) pays nothing at all. Scheme C of the standard column is the factory
 * setting: first at 20,000, second at 70,000, and every 70,000 after.
 */
const BONUS_COLUMNS = {
  standard: [
    { id: 'A', first: 20000, second: 60000, every: null },
    { id: 'B', first: 20000, second: 60000, every: 60000 },
    { id: 'C', first: 20000, second: 70000, every: 70000 },
    { id: 'D', first: 20000, second: 80000, every: 80000 },
    { id: 'E', first: 30000, second: 100000, every: 100000 },
    { id: 'F', first: 30000, second: 120000, every: 120000 },
    { id: 'NONE', first: null, second: null, every: null },
  ],
  twoLives: [
    { id: 'A', first: 30000, second: 100000, every: null },
    { id: 'B', first: 30000, second: 100000, every: 100000 },
    { id: 'C', first: 30000, second: 120000, every: 120000 },
    { id: 'D', first: 30000, second: 150000, every: 150000 },
    { id: 'E', first: 30000, second: 150000, every: 150000 },
    { id: 'F', first: 30000, second: 150000, every: null },
    { id: 'NONE', first: null, second: null, every: null },
  ],
};

export const BONUS_SCHEME_IDS = BONUS_COLUMNS.standard.map((scheme) => scheme.id);

/** The factory block: what the machine ships set to. */
export const DIP_DEFAULTS = Object.freeze({
  lives: 3,
  bonus: 'C',
  coinage: CoinageMode.FREE_PLAY,
  /** Whether the attract loop plays its theme. */
  demoSound: true,
  /** The no-fire bug; off from the factory. See `attack.js`. */
  noFireBug: false,
});

/** The bonus scheme a switch block selects, from the right column. */
export function bonusSchemeFor(dips) {
  const column = dips.lives === 2 ? BONUS_COLUMNS.twoLives : BONUS_COLUMNS.standard;
  return column.find((scheme) => scheme.id === dips.bonus) ?? column[2];
}

/** Force a stored block into a valid one, field by field. */
export function normalizeDips(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    lives: LIVES_OPTIONS.includes(source.lives) ? source.lives : DIP_DEFAULTS.lives,
    bonus: BONUS_SCHEME_IDS.includes(source.bonus) ? source.bonus : DIP_DEFAULTS.bonus,
    coinage: COINAGE_OPTIONS.includes(source.coinage) ? source.coinage : DIP_DEFAULTS.coinage,
    demoSound: typeof source.demoSound === 'boolean' ? source.demoSound : DIP_DEFAULTS.demoSound,
    noFireBug: typeof source.noFireBug === 'boolean' ? source.noFireBug : DIP_DEFAULTS.noFireBug,
  };
}

/** Read the block. Anything unreadable is the factory block. */
export function loadDips(storage, key = DIPS_KEY) {
  try {
    const raw = storage.getItem(key);
    if (raw === null || raw === undefined) return { ...DIP_DEFAULTS };
    return normalizeDips(JSON.parse(raw));
  } catch {
    return { ...DIP_DEFAULTS };
  }
}

/** Write the block, returning what is now in force. */
export function saveDips(storage, dips, key = DIPS_KEY) {
  const normalized = normalizeDips(dips);
  try {
    storage.setItem(key, JSON.stringify(normalized));
  } catch {
    // A full or read-only quota should not stop the machine.
  }
  return normalized;
}

/** An empty coin box: no credits, no half-paid coin pair. */
export function createCoinBox() {
  return { credits: 0, pendingCoins: 0 };
}

/**
 * Drop a coin in. Returns the new box.
 *
 * At two-coins-a-play the first coin sits in the box as a pending coin --
 * the cabinet's credit counter genuinely does not move until the second.
 */
export function insertCoin(coinage, box) {
  switch (coinage) {
    case CoinageMode.ONE_COIN_ONE_PLAY:
      return { ...box, credits: box.credits + 1 };
    case CoinageMode.ONE_COIN_TWO_PLAYS:
      return { ...box, credits: box.credits + 2 };
    case CoinageMode.TWO_COINS_ONE_PLAY: {
      if (box.pendingCoins >= 1) return { credits: box.credits + 1, pendingCoins: 0 };
      return { ...box, pendingCoins: box.pendingCoins + 1 };
    }
    default:
      // Free play: the coin slot is decorative.
      return { ...box };
  }
}

/** Whether a start of `players` fighters is affordable. */
export function startAllowed(coinage, box, players) {
  if (coinage === CoinageMode.FREE_PLAY) return true;
  return box.credits >= players;
}

/** Pay for a start. Free play charges nothing. */
export function consumeCredits(coinage, box, players) {
  if (coinage === CoinageMode.FREE_PLAY) return { ...box };
  return { ...box, credits: Math.max(box.credits - players, 0) };
}

/** Re-exported so the service screen can validate the rank it edits. */
export { normalizeRank };

/**
 * Score persistence: the single high score, and the arcade's table of five.
 *
 * The original code assigned `this.highScore = 0` in `create()` and never read
 * it back, so the HIGH SCORE shown on screen only ever tracked the current
 * session and reset on reload. This module fixes that.
 *
 * Storage is injected rather than reaching for `localStorage` directly. That
 * keeps the module testable, and it matters in the browser too: localStorage
 * access throws outright in a sandboxed iframe or with site data blocked, and
 * a portfolio page that white-screens because someone has strict privacy
 * settings is worse than one that quietly forgets the score.
 */

export const HIGH_SCORE_KEY = 'alienEscape.highScore';
export const SCORE_TABLE_KEY = 'alienEscape.scoreTable';

/**
 * The arcade keeps five names, not one number.
 *
 * Galaga ends a game by asking anyone who made the board for three initials,
 * and shows the table on the attract screen. That is the whole reason the
 * cabinet has two different name-entry tunes -- one for taking first place and
 * one for taking any other place -- both of which are in this repo's sound
 * folder. Reducing all of it to a single HIGH SCORE threw away the part of the
 * loop that makes a good run worth telling someone about.
 */
export const SCORE_TABLE_SIZE = 5;

/** Three initials, as the cabinet takes them. */
export const NAME_LENGTH = 3;

/**
 * The characters an entry may use.
 *
 * A-Z and 0-9 plus a space and a full stop, which is the usual arcade set. The
 * order is the order the entry cursor cycles through, so it starts at A rather
 * than at a punctuation mark nobody wants.
 */
export const NAME_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .';

/**
 * The table a machine ships with, before anyone has played it.
 *
 * A descending ladder rather than five identical rows, so the board reads as
 * something to climb: the first thing a new player beats is 5,000, and first
 * place is 20,000 -- the same score the first extra ship is awarded at.
 */
const DEFAULT_SCORE_TABLE = [
  { name: 'AAA', score: 20000 },
  { name: 'AAA', score: 15000 },
  { name: 'AAA', score: 10000 },
  { name: 'AAA', score: 7000 },
  { name: 'AAA', score: 5000 },
];

/** A fresh copy of the factory table. Copied, so a caller cannot edit it. */
export function defaultScoreTable() {
  return DEFAULT_SCORE_TABLE.map((entry) => ({ ...entry }));
}

/**
 * Force a name into the shape the table stores.
 *
 * Anything outside the alphabet is dropped rather than substituted, and a name
 * that ends up empty falls back to the first letter repeated, because a blank
 * row on the board looks like a bug rather than like an anonymous player.
 */
export function sanitizeName(name) {
  const allowed = new Set(NAME_ALPHABET);
  const kept = [...String(name ?? '').toUpperCase()]
    .filter((character) => allowed.has(character))
    .slice(0, NAME_LENGTH)
    .join('');

  return kept.trim() === '' ? 'AAA' : kept.padEnd(NAME_LENGTH, ' ');
}

/** An in-memory stand-in used when no durable storage is available. */
export function createMemoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
  };
}

/**
 * Return `localStorage` if it is genuinely usable, otherwise a memory shim.
 *
 * Presence is not enough: Safari in private mode historically exposed the
 * object but threw on write, so this probes with a real round trip.
 */
export function resolveStorage(candidate) {
  try {
    if (!candidate) return createMemoryStorage();
    const probe = '__alienEscapeProbe__';
    candidate.setItem(probe, '1');
    candidate.removeItem?.(probe);
    return candidate;
  } catch {
    return createMemoryStorage();
  }
}

/** Read the stored high score. Any corrupt or missing value reads as 0. */
export function loadHighScore(storage, key = HIGH_SCORE_KEY) {
  try {
    const raw = storage.getItem(key);
    if (raw === null || raw === undefined) return 0;
    const parsed = Number.parseInt(raw, 10);
    if (Number.isNaN(parsed) || parsed < 0) return 0;
    return parsed;
  } catch {
    return 0;
  }
}

/**
 * Persist `score` when it beats what is stored.
 *
 * Returns the high score in effect afterwards, so a caller can update its
 * display from the return value without a second read.
 */
export function saveHighScore(storage, score, key = HIGH_SCORE_KEY) {
  const current = loadHighScore(storage, key);
  if (score <= current) return current;

  try {
    storage.setItem(key, String(score));
  } catch {
    // A full or read-only quota should not end the run.
    return current;
  }

  return score;
}

/**
 * Read the table of five, in descending order.
 *
 * Every failure mode lands on the factory table rather than on an empty board:
 * missing key, unparseable JSON, something that is not an array, rows that are
 * not `{name, score}`. A score table is not worth a white screen, and a player
 * whose storage has been corrupted should see a machine that looks new rather
 * than one that looks broken.
 *
 * Short tables are padded from the factory ladder, so the board always has five
 * rows to draw whatever is on disk.
 */
export function loadScoreTable(storage, key = SCORE_TABLE_KEY) {
  let parsed;

  try {
    const raw = storage.getItem(key);
    parsed = raw === null || raw === undefined ? [] : JSON.parse(raw);
  } catch {
    parsed = [];
  }

  // Every failure lands on an empty list rather than returning early, so a
  // stored board and a missing one both take the same path down through the
  // factory padding and the legacy migration below.
  if (!Array.isArray(parsed)) parsed = [];

  const entries = parsed
    .filter((entry) => entry && Number.isFinite(Number(entry.score)) && Number(entry.score) >= 0)
    .map((entry) => ({
      name: sanitizeName(entry.name),
      score: Math.floor(Number(entry.score)),
    }));

  const sorted = entries.sort((a, b) => b.score - a.score);

  // Only a short board borrows from the factory ladder. Merging it in
  // unconditionally would resurrect factory rows underneath a full board of
  // real names and show 20,000 on it twice.
  const table =
    sorted.length >= SCORE_TABLE_SIZE
      ? sorted.slice(0, SCORE_TABLE_SIZE)
      : [...sorted, ...defaultScoreTable()]
          .sort((a, b) => b.score - a.score)
          .slice(0, SCORE_TABLE_SIZE);

  return withLegacyHighScore(storage, table);
}

/**
 * Fold a high score saved by a build that had no board into the board.
 *
 * Earlier versions stored one number and no names. Someone who played those and
 * comes back to this one should find their score on the board rather than a
 * factory ladder that has quietly forgotten it, and the HUD's HIGH SCORE has to
 * agree with the top row of the board or one of the two is lying.
 *
 * It only ever adds, and only when the old number beats what is on the board, so
 * running it on every load is idempotent.
 */
function withLegacyHighScore(storage, table) {
  const legacy = loadHighScore(storage);
  if (legacy <= 0 || legacy <= table[0].score) return table;

  return insertScoreEntry(table, { name: 'AAA', score: legacy });
}

/** Write the table back, silently giving up if storage refuses. */
export function saveScoreTable(storage, table, key = SCORE_TABLE_KEY) {
  try {
    storage.setItem(key, JSON.stringify(table));
  } catch {
    // As with the high score: a full quota should not end the run.
  }

  return table;
}

/**
 * Which row a score would take, or -1 for one that does not make the board.
 *
 * Ties do not displace: a score has to *beat* the row it wants, which is what
 * keeps a player who reaches exactly the bottom score from pushing off someone
 * who got there first. A score of zero never qualifies, so quitting on the
 * title screen cannot put a name on the board.
 */
export function scoreTableRank(table, score) {
  if (!Number.isFinite(score) || score <= 0) return -1;

  const index = table.findIndex((entry) => score > entry.score);
  if (index !== -1) return index;

  return table.length < SCORE_TABLE_SIZE ? table.length : -1;
}

/** True when a score is worth asking for initials. */
export function qualifiesForScoreTable(table, score) {
  return scoreTableRank(table, score) !== -1;
}

/**
 * Place an entry on the board, dropping whatever falls off the bottom.
 *
 * Returns a new table; the one passed in is not touched, so a caller can show
 * the old board and the new one side by side.
 */
export function insertScoreEntry(table, { name, score }) {
  const rank = scoreTableRank(table, score);
  const next = table.map((entry) => ({ ...entry }));
  if (rank === -1) return next;

  next.splice(rank, 0, { name: sanitizeName(name), score: Math.floor(score) });
  return next.slice(0, SCORE_TABLE_SIZE);
}

/**
 * Bank a finished run: the table and the single high score, together.
 *
 * One call so the two cannot drift. They are stored separately because the
 * high score is read on its own by the HUD every frame of a game, and parsing
 * the whole table for the one number at the top of it would be work for
 * nothing.
 */
export function recordScore(storage, { name, score }) {
  const table = insertScoreEntry(loadScoreTable(storage), { name, score });
  saveScoreTable(storage, table);
  saveHighScore(storage, score);
  return table;
}

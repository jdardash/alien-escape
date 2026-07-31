/**
 * High score persistence.
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

/**
 * Shot accounting.
 *
 * Galaga ends every game with a hit-miss ratio, which quietly reframes the
 * whole game: the two-bullet limit stops being an annoyance and becomes the
 * thing being scored. Reproducing it is most of why the limit matters.
 */

export function createStats() {
  return { shotsFired: 0, hits: 0 };
}

export function recordShot(stats, count = 1) {
  return { ...stats, shotsFired: stats.shotsFired + count };
}

export function recordHit(stats, count = 1) {
  return { ...stats, hits: stats.hits + count };
}

/**
 * Hit-miss ratio as a percentage.
 *
 * Firing nothing is 0 rather than NaN, so the game-over screen never has to
 * special-case a player who never pressed fire. Capped at 100 because the dual
 * fighter can register two hits from what the input layer counted as one shot.
 */
export function hitMissRatio(stats) {
  if (stats.shotsFired === 0) return 0;
  return Math.min((stats.hits / stats.shotsFired) * 100, 100);
}

/** Ratio formatted the way the results screen shows it. */
export function formatRatio(stats) {
  return `${hitMissRatio(stats).toFixed(1)}%`;
}

/**
 * Two-player alternating play.
 *
 * A Galaga cabinet has a 1P START and a 2P START button, and picking the second
 * one does not put two ships on the screen: the players take turns. Player one
 * flies until a ship is lost, then the machine says whose turn it is and player
 * two flies their own stage, with their own score, their own spare ships and
 * their own hit-miss ratio. Everything the game tracks, it tracks twice.
 *
 * That is the whole reason the header has a `1UP` and a `2UP` and the reason
 * the live one blinks. Earlier revisions of this repo drew both columns and
 * only ever filled one, which made the blink decoration rather than
 * information.
 *
 * A session is plain data and every function here returns a new one, so the
 * scene can hand a turn over without any part of the rule living in Phaser.
 * What the scene contributes is one call to `loseShip` at the moment a ship is
 * destroyed, and reading the answer back off the result.
 */

import { createStats } from './stats.js';

/** The cabinet takes two, and only two. */
export const MAX_PLAYERS = 2;

/**
 * One player's entire game.
 *
 * `stage` and `round` are per player because two players progress
 * independently: player one can be on the second challenging stage while
 * player two is still on stage 2, and each has to come back to their own.
 * `retired` is "this player's game is over", which is not the same as the
 * session being over while the other one is still flying.
 */
export function createPlayer(index, startingLives) {
  return {
    index,
    score: 0,
    lives: startingLives,
    stage: 1,
    round: 1,
    stats: createStats(),
    retired: false,
  };
}

export function createSession({ playerCount = 1, startingLives = 3 } = {}) {
  const count = Math.min(Math.max(Math.trunc(playerCount) || 1, 1), MAX_PLAYERS);

  return {
    playerCount: count,
    active: 0,
    players: Array.from({ length: count }, (_player, index) =>
      createPlayer(index, startingLives),
    ),
  };
}

export function activePlayer(session) {
  return session.players[session.active];
}

/**
 * Fold the live game back into the active player's record.
 *
 * The scene owns score, lives and the rest while a turn is being played,
 * because they change many times a second; this is how those land back in the
 * session when the turn ends or the stage does.
 */
export function withActive(session, changes) {
  const players = session.players.map((player, index) =>
    index === session.active ? { ...player, ...changes } : player,
  );

  return { ...session, players };
}

/** True once every player has run out of ships. */
export function sessionOver(session) {
  return session.players.every((player) => player.retired);
}

/**
 * Whose turn it is after the active player's ship is destroyed.
 *
 * Searches forward from the active player and wraps, so with two players it is
 * "the other one" and with one player it is "the same one again". Returns null
 * when nobody is left, which is the only condition that ends the session.
 */
function nextActive(players, active) {
  for (let step = 1; step <= players.length; step += 1) {
    const candidate = (active + step) % players.length;
    if (!players[candidate].retired) return candidate;
  }
  return null;
}

/**
 * The active player lost a ship.
 *
 * One call covers all of it: spend the life, retire the player if that was
 * their last, and hand the machine to whoever is next. The result says which of
 * those happened so the scene can put the right words on the screen -- a
 * handover announces `PLAYER 2`, a retirement announces `GAME OVER PLAYER 1`
 * while the other player carries on, and only `over` sends everyone to the
 * results screen.
 *
 * `handedOver` is deliberately false when the incoming player is the outgoing
 * one, which is every death in a one-player game and every death in a
 * two-player game once the other player has finished. Nothing is torn down and
 * rebuilt in that case; the player simply respawns where they were.
 */
export function loseShip(session) {
  const player = activePlayer(session);
  const lives = Math.max(player.lives - 1, 0);
  const retired = lives <= 0;

  const players = session.players.map((entry, index) =>
    index === session.active ? { ...entry, lives, retired } : entry,
  );

  const next = nextActive(players, session.active);
  const updated = { ...session, players, active: next ?? session.active };

  return {
    session: updated,
    retired,
    over: next === null,
    handedOver: next !== null && next !== session.active,
  };
}

/**
 * The label the HUD and the banners use.
 *
 * One-based, because the cabinet counts players from one and nobody has ever
 * read `1UP` as meaning "player zero".
 */
export function playerLabel(index) {
  return `PLAYER ${index + 1}`;
}

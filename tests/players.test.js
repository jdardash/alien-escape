import { describe, it, expect } from 'vitest';
import {
  MAX_PLAYERS,
  createSession,
  createPlayer,
  activePlayer,
  withActive,
  sessionOver,
  loseShip,
  playerLabel,
} from '../src/systems/players.js';

const twoPlayers = () => createSession({ playerCount: 2, startingLives: 3 });
const onePlayer = () => createSession({ playerCount: 1, startingLives: 3 });

describe('starting a session', () => {
  it('takes at most the two players the cabinet has', () => {
    expect(MAX_PLAYERS).toBe(2);
    expect(createSession({ playerCount: 5 }).players).toHaveLength(2);
  });

  it('never starts with fewer than one player, whatever it is handed', () => {
    expect(createSession({ playerCount: 0 }).players).toHaveLength(1);
    expect(createSession({ playerCount: -3 }).players).toHaveLength(1);
    expect(createSession().players).toHaveLength(1);
  });

  it('gives every player their own ships, score and stage', () => {
    const session = twoPlayers();

    for (const player of session.players) {
      expect(player.score).toBe(0);
      expect(player.lives).toBe(3);
      expect(player.stage).toBe(1);
      expect(player.round).toBe(1);
      expect(player.retired).toBe(false);
    }
  });

  it('starts with player one', () => {
    expect(activePlayer(twoPlayers()).index).toBe(0);
  });

  it('counts players from one when it says so out loud', () => {
    expect(playerLabel(0)).toBe('PLAYER 1');
    expect(playerLabel(1)).toBe('PLAYER 2');
  });
});

describe('banking a turn', () => {
  it('folds the live game into the active player and leaves the other alone', () => {
    const session = withActive(twoPlayers(), { score: 4200, stage: 5 });

    expect(session.players[0].score).toBe(4200);
    expect(session.players[0].stage).toBe(5);
    expect(session.players[1].score).toBe(0);
    expect(session.players[1].stage).toBe(1);
  });

  it('does not mutate the session it was handed', () => {
    const before = twoPlayers();
    withActive(before, { score: 999 });
    expect(before.players[0].score).toBe(0);
  });

  it('keeps each player on their own stage across a handover', () => {
    let session = withActive(twoPlayers(), { stage: 7, round: 7 });
    session = loseShip(session).session;
    expect(activePlayer(session).stage).toBe(1);

    session = withActive(session, { stage: 3 });
    session = loseShip(session).session;
    expect(activePlayer(session).stage).toBe(7);
  });
});

describe('losing a ship, one player', () => {
  it('spends a life without handing the machine anywhere', () => {
    const result = loseShip(onePlayer());

    expect(result.session.players[0].lives).toBe(2);
    expect(result.handedOver).toBe(false);
    expect(result.retired).toBe(false);
    expect(result.over).toBe(false);
  });

  it('ends the session on the last ship', () => {
    let session = onePlayer();
    let result;

    for (let i = 0; i < 3; i += 1) result = loseShip((session = result?.session ?? session));

    expect(result.retired).toBe(true);
    expect(result.over).toBe(true);
    expect(sessionOver(result.session)).toBe(true);
  });

  it('never spends a life it does not have', () => {
    let session = onePlayer();
    for (let i = 0; i < 6; i += 1) session = loseShip(session).session;
    expect(session.players[0].lives).toBe(0);
  });
});

describe('losing a ship, two players alternating', () => {
  it('hands the machine to the other player', () => {
    const result = loseShip(twoPlayers());

    expect(result.handedOver).toBe(true);
    expect(result.over).toBe(false);
    expect(activePlayer(result.session).index).toBe(1);
  });

  it('alternates turn by turn', () => {
    let session = twoPlayers();
    const order = [activePlayer(session).index];

    for (let i = 0; i < 3; i += 1) {
      session = loseShip(session).session;
      order.push(activePlayer(session).index);
    }

    expect(order).toEqual([0, 1, 0, 1]);
  });

  it('takes the life from whoever was flying, not from both', () => {
    const session = loseShip(twoPlayers()).session;
    expect(session.players[0].lives).toBe(2);
    expect(session.players[1].lives).toBe(3);
  });

  // The rule that makes alternating play more than a pair of counters: one
  // player finishing does not end the game, it just stops the machine handing
  // them the controls.
  it('lets the survivor play on after the other is out', () => {
    let session = createSession({ playerCount: 2, startingLives: 1 });

    const first = loseShip(session);
    expect(first.retired).toBe(true);
    expect(first.over).toBe(false);
    expect(activePlayer(first.session).index).toBe(1);

    session = withActive(first.session, { score: 1200 });
    const second = loseShip(session);

    expect(second.over).toBe(true);
    expect(sessionOver(second.session)).toBe(true);
    expect(second.session.players[1].score).toBe(1200);
  });

  it('stops handing over once only one player is left', () => {
    let session = createSession({ playerCount: 2, startingLives: 2 });

    // Player two is out after one ship; player one still has both.
    session = { ...session, active: 1 };
    session = { ...session, players: session.players.map((p, i) => (i === 1 ? { ...p, lives: 1 } : p)) };

    const out = loseShip(session);
    expect(out.retired).toBe(true);
    expect(activePlayer(out.session).index).toBe(0);

    const solo = loseShip(out.session);
    expect(solo.handedOver).toBe(false);
    expect(activePlayer(solo.session).index).toBe(0);
    expect(solo.over).toBe(false);
  });
});

describe('a player record', () => {
  it('carries its own accuracy counters', () => {
    const player = createPlayer(1, 3);
    expect(player.stats).toEqual({ shotsFired: 0, hits: 0 });
    expect(player.index).toBe(1);
  });
});

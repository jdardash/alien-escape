/**
 * The pilot that flies the attract screen.
 *
 * An idle Galaga cabinet does not only show cards. Between the value chart and
 * the high-score board it plays itself: a wave assembles, something dives, the
 * machine's own fighter moves and shoots and sometimes dies, and the word DEMO
 * sits on the screen so nobody mistakes it for a game in progress. It is the
 * part of the attract cycle that actually sells the game, because it is the
 * only part that shows what the game *is*.
 *
 * This module is the pilot's whole brain, and it is a pure function: a
 * description of the board goes in, a set of held controls comes out. No
 * Phaser, no timers, no randomness -- the same board always produces the same
 * decision, which is what makes an autopilot testable at all.
 *
 * It is deliberately a competent player rather than a perfect one. A pilot that
 * never died would show a screen that never resolves, and one that dodged
 * everything by teleporting to safety would not look like someone playing. It
 * dodges what is already falling at it, otherwise it lines up on the nearest
 * target and fires -- which is what a human does, at about the speed a human
 * does it.
 */

/**
 * How long the machine plays itself before handing the screen back.
 *
 * Long enough for a wave to assemble, dive a few times and be shot at; short
 * enough that a passer-by sees the rest of the attract cycle rather than
 * standing in front of one long game. The cabinet cuts its own demo off at
 * roughly this point too.
 */
export const DEMO_DURATION_MS = 42000;

/**
 * How close a bomb has to be, horizontally, to be worth dodging.
 *
 * A shade wider than the ship, because a bomb that is going to graze the wing
 * is one the pilot should already be moving away from rather than one it
 * discovers on the frame it lands.
 */
export const DODGE_RADIUS_PX = 44;

/**
 * How far above the player a bomb starts mattering.
 *
 * Anything higher than this is still resolvable by moving to the target the
 * pilot actually wants, so reacting to it early makes the ship twitch at
 * everything on the screen instead of flying.
 */
export const DODGE_LOOKAHEAD_PX = 280;

/** How closely lined up the pilot insists on being before it takes the shot. */
export const AIM_TOLERANCE_PX = 12;

/**
 * How far off centre the pilot will chase a target.
 *
 * Without a leash the pilot walks the full width of the screen after the last
 * enemy of a formation and spends the whole demo travelling. Chasing stops at
 * this distance and it takes the shot it has.
 */
export const CHASE_LIMIT_PX = 300;

const HOLD_NOTHING = { left: false, right: false, fire: false };

/**
 * Steer away from a hazard, preferring the side with more room.
 *
 * The `edge` check is what stops the pilot dodging into a wall: with a bomb
 * coming down on its left it would rather go right, but pinned against the
 * right edge it will take the shorter move left and hope the bomb misses,
 * which is exactly the decision a cornered player makes.
 */
function dodge(playerX, hazardX, screenWidth, margin) {
  const awayFromHazard = playerX <= hazardX ? -1 : 1;
  const roomThatWay =
    awayFromHazard < 0 ? playerX - margin : screenWidth - margin - playerX;

  const direction = roomThatWay > margin ? awayFromHazard : -awayFromHazard;
  return { left: direction < 0, right: direction > 0, fire: false };
}

/**
 * Which enemy the pilot wants next.
 *
 * The lowest thing on the screen, because that is what is closest to killing
 * it, with ties broken by whichever is easier to line up on. A pilot that
 * simply shot at the nearest column stood under the formation ignoring the
 * enemy diving into it.
 */
function chooseTarget(targets, playerX) {
  let best = null;

  for (const target of targets) {
    if (Math.abs(target.x - playerX) > CHASE_LIMIT_PX) continue;
    if (
      best === null ||
      target.y > best.y ||
      (target.y === best.y && Math.abs(target.x - playerX) < Math.abs(best.x - playerX))
    ) {
      best = target;
    }
  }

  // Everything is out of reach: take the closest anyway rather than standing
  // still, which is what an empty screen at the end of a stage looks like.
  if (best === null && targets.length > 0) {
    best = targets.reduce((closest, target) =>
      Math.abs(target.x - playerX) < Math.abs(closest.x - playerX) ? target : closest,
    );
  }

  return best;
}

/**
 * What the demo pilot is holding down this frame.
 *
 * @param {object}  board
 * @param {number}  board.playerX      where the demo fighter is
 * @param {number}  board.playerY      the row it flies in
 * @param {number}  board.screenWidth
 * @param {Array}   board.bombs        enemy shots in the air, `{x, y}`
 * @param {Array}   board.targets      enemies worth shooting at, `{x, y}`
 * @param {object=} board.beam         an open tractor beam, `{x, width}`
 * @param {number=} board.margin       how close to an edge the ship may fly
 * @returns {{left: boolean, right: boolean, fire: boolean}}
 */
export function demoInput(board) {
  const {
    playerX,
    playerY,
    screenWidth,
    bombs = [],
    targets = [],
    beam = null,
    margin = 24,
  } = board;

  // 1. A beam already open and overhead outranks everything: being caught in
  //    one is the only hazard that costs a ship without anything touching it.
  if (beam && Math.abs(playerX - beam.x) < (beam.width ?? 0) / 2 + DODGE_RADIUS_PX) {
    return dodge(playerX, beam.x, screenWidth, margin);
  }

  // 2. Then whatever is falling at the ship, nearest first.
  const incoming = bombs
    .filter(
      (bomb) =>
        bomb.y < playerY &&
        playerY - bomb.y < DODGE_LOOKAHEAD_PX &&
        Math.abs(bomb.x - playerX) < DODGE_RADIUS_PX,
    )
    .sort((a, b) => b.y - a.y);

  if (incoming.length > 0) {
    return dodge(playerX, incoming[0].x, screenWidth, margin);
  }

  // 3. Otherwise fly to the target and shoot it.
  const target = chooseTarget(targets, playerX);
  if (target === null) return { ...HOLD_NOTHING, fire: targets.length > 0 };

  const offset = target.x - playerX;
  const aimed = Math.abs(offset) <= AIM_TOLERANCE_PX;

  return {
    left: !aimed && offset < 0,
    right: !aimed && offset > 0,
    fire: aimed,
  };
}

/**
 * Enemy sprites.
 *
 * This is the seam between the pure rules in `src/systems` and Phaser. The
 * modules under systems decide where an enemy should be and what it is worth;
 * this file owns the sprite that shows it.
 */

import { ENEMY_HEALTH, ENEMY_TEXTURE, SPRITE_SCALE } from '../config.js';
import { EnemyType } from '../systems/formation.js';

/** Enemies are either sitting in formation, flying a path, or gone. */
export const EnemyMode = {
  ENTERING: 'entering',
  IN_FORMATION: 'inFormation',
  DIVING: 'diving',
  RETURNING: 'returning',
  /** Challenging-stage fly-through: never joins the formation. */
  PASSING: 'passing',
};

export function createEnemy(scene, group, slot, position) {
  const texture = ENEMY_TEXTURE[slot.type];
  const scale = slot.type === EnemyType.BOSS ? SPRITE_SCALE.boss : SPRITE_SCALE.enemy;

  const enemy = group.create(position.x, position.y, texture).setScale(scale).setOrigin(0.5);

  enemy.body.setSize(enemy.width * 0.62, enemy.height * 0.62, true);
  enemy.body.setAllowGravity(false);

  enemy.slot = slot;
  enemy.enemyType = slot.type;
  enemy.health = ENEMY_HEALTH[slot.type];
  enemy.mode = EnemyMode.ENTERING;
  enemy.flight = null;
  enemy.hasBombed = false;

  return enemy;
}

/** True when a target is outside formation and therefore worth more. */
export function isDiving(enemy) {
  return enemy.mode === EnemyMode.DIVING || enemy.mode === EnemyMode.PASSING;
}

/** Only settled enemies may be chosen to attack. */
export function canBeginDive(enemy) {
  return enemy.active && enemy.mode === EnemyMode.IN_FORMATION;
}

/**
 * Park an enemy in its formation slot.
 *
 * Rotation is reset because a diver finishes its return flight banked, and a
 * formation of tilted ships looks like a bug rather than a flourish.
 */
export function settleIntoFormation(enemy, position) {
  enemy.mode = EnemyMode.IN_FORMATION;
  enemy.flight = null;
  enemy.hasBombed = false;
  enemy.setPosition(position.x, position.y);
  enemy.setRotation(0);
}

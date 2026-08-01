/**
 * Enemy sprites.
 *
 * This is the seam between the pure rules in `src/systems` and Phaser. The
 * modules under systems decide where an enemy should be and what it is worth;
 * this file owns the sprite that shows it.
 */

import { BOSS_TINT, ENEMY_HEALTH, ENEMY_TEXTURE, SPRITE_SCALE } from '../config.js';
import { EnemyType } from '../systems/formation.js';
import { transformTextureKey } from '../art/textures.js';

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

  if (slot.type === EnemyType.BOSS) enemy.setTint(BOSS_TINT.healthy);

  return enemy;
}

/**
 * Show that a Boss Galaga has taken its first of two hits.
 *
 * Clearing the tint rather than setting a new one is what reveals the purple
 * artwork underneath; see `BOSS_TINT` for why the damaged state is a removal.
 */
export function showBossDamage(enemy) {
  if (BOSS_TINT.damaged === null) enemy.clearTint();
  else enemy.setTint(BOSS_TINT.damaged);
}

/** True when a target is outside formation and therefore worth more. */
export function isDiving(enemy) {
  return enemy.mode === EnemyMode.DIVING || enemy.mode === EnemyMode.PASSING;
}

/**
 * Only settled enemies may be chosen to attack.
 *
 * A Zako part-way through its transform pulse is excluded: it is about to be
 * replaced by the bonus trio, and letting it be picked for a dive as well left
 * the trio spawning from wherever the dive had carried it.
 */
export function canBeginDive(enemy) {
  return enemy.active && enemy.mode === EnemyMode.IN_FORMATION && !enemy.transforming;
}

/**
 * One ship of a transform bonus trio.
 *
 * These never join the formation, so they carry no slot. They fly a single
 * attack run in `PASSING` mode and are destroyed when it finishes, which is
 * the same lifecycle a Challenging Stage enemy has.
 *
 * `set` is shared by reference across all three ships of the trio, which is
 * how the completed-set bonus is detected: each kill decrements the one
 * object, and the third kill is the one that pays.
 */
export function createTransformEnemy(scene, group, type, position, set) {
  // Drawn at scale 1: the texture is pixel art generated at exactly its screen
  // size, and scaling it would resample the pixels it was authored to keep.
  // The previous version drew a borrowed silhouette flattened with
  // `setTintFill`, which made a Scorpion and a Flagship the same shape.
  const enemy = group
    .create(position.x, position.y, transformTextureKey(type))
    .setOrigin(0.5);

  enemy.body.setSize(enemy.width * 0.62, enemy.height * 0.62, true);
  enemy.body.setAllowGravity(false);

  enemy.slot = null;
  enemy.enemyType = null;
  enemy.health = 1;
  enemy.mode = EnemyMode.PASSING;
  enemy.flight = null;
  enemy.hasBombed = false;
  enemy.transformSet = set;

  return enemy;
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

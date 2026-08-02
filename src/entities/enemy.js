/**
 * Enemy sprites.
 *
 * This is the seam between the pure rules in `src/systems` and Phaser. The
 * modules under systems decide where an enemy should be and what it is worth;
 * this file owns the sprite that shows it.
 */

import { BOSS_SPRITE, ENEMY_HEALTH } from '../config.js';
import { EnemyType } from '../systems/formation.js';
import { shipTextureKey, transformTextureKey } from '../art/textures.js';
import { applyShipArt } from '../art/localArt.js';

/** Enemies are either sitting in formation, flying a path, or gone. */
export const EnemyMode = {
  ENTERING: 'entering',
  IN_FORMATION: 'inFormation',
  DIVING: 'diving',
  RETURNING: 'returning',
  /** Challenging-stage fly-through: never joins the formation. */
  PASSING: 'passing',
};

/**
 * One enemy sprite, drawn from the pixel art for its rank.
 *
 * Every rank shares a texture key with its `EnemyType`, so a formation slot
 * maps to its artwork directly. Drawn at scale 1: the textures are generated at
 * exactly their screen size and scaling them would resample the pixels they
 * were authored to keep.
 */
export function createEnemy(scene, group, slot, position, frame = 0) {
  const sprite = slot.type === EnemyType.BOSS ? BOSS_SPRITE.healthy : slot.type;

  const enemy = group.create(position.x, position.y, shipTextureKey(sprite)).setOrigin(0.5);
  // Before the body is sized: a local override may be a different texture at a
  // different source size, and the body is measured off whichever one wins.
  // Created on the formation's current wing frame, so a wave entering
  // mid-flap is in step with the ships already parked.
  applyShipArt(enemy, sprite, { frame });
  enemy.artName = sprite;

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

/**
 * One caravan transient: a fly-through member riding a combat wave.
 *
 * From stage 4 the caravan control byte injects extra members into the entry
 * stream (object IDs 0x38-0x3E) that fly the wave's own entrance path, take
 * the F7 branch onto a player-targeted swoop, and leave -- they never join
 * the grid, never home and never bomb (`l_29B3`, gg1-3.s:1806-1822). They
 * are collision-live ordinary members of the enemy group: shootable,
 * scoreable as their type, and able to ram the player.
 */
export function createTransientEnemy(scene, group, type, position, frame = 0) {
  const sprite = type === EnemyType.BOSS ? BOSS_SPRITE.healthy : type;

  const enemy = group.create(position.x, position.y, shipTextureKey(sprite)).setOrigin(0.5);
  applyShipArt(enemy, sprite, { frame });
  enemy.artName = sprite;

  enemy.body.setSize(enemy.width * 0.62, enemy.height * 0.62, true);
  enemy.body.setAllowGravity(false);

  enemy.slot = null;
  enemy.enemyType = type;
  enemy.health = ENEMY_HEALTH[type];
  enemy.mode = EnemyMode.PASSING;
  enemy.flight = null;
  enemy.hasBombed = false;
  enemy.transient = true;
  enemy.bombMask = 0;

  return enemy;
}

/**
 * Show that a Boss Galaga has taken its first of two hits.
 *
 * A swap to the damaged palette rather than a tint over the healthy one. Both
 * textures come from the same grid, so the silhouette does not move by a pixel
 * and the change reads as damage rather than as a different enemy.
 */
export function showBossDamage(enemy, frame = 0) {
  applyShipArt(enemy, BOSS_SPRITE.damaged, { frame });
  enemy.artName = BOSS_SPRITE.damaged;
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
export function createTransformEnemy(scene, group, type, position, set, frame = 0) {
  // Drawn at scale 1: the texture is pixel art generated at exactly its screen
  // size, and scaling it would resample the pixels it was authored to keep.
  // The previous version drew a borrowed silhouette flattened with
  // `setTintFill`, which made a Scorpion and a Flagship the same shape.
  const enemy = group
    .create(position.x, position.y, transformTextureKey(type))
    .setOrigin(0.5);
  applyShipArt(enemy, type, { frame });
  enemy.artName = type;

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

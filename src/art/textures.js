/**
 * Turning the pixel grids in `pixelArt.js` into Phaser textures.
 *
 * This is the seam between the art data, which is pure and tested, and the
 * renderer. Textures are built once per scene and cached by key, so a stage
 * that transforms a Zako five times draws from one texture rather than
 * rebuilding it.
 *
 * Every generated texture is set to NEAREST filtering. Pixel art scaled with
 * the default bilinear filter comes out soft, which defeats the point of
 * authoring it a pixel at a time.
 */

import { FLAG_ART, SHIP_ART, TRANSFORM } from '../config.js';
import {
  parsePixelArt,
  frameRows,
  frameCount,
  EXPLOSION_SPRITES,
  TRANSFORM_SPRITES,
  FLAG_SPRITES,
  SHIP_SPRITES,
} from './pixelArt.js';

/** Texture key for a stage flag of the given denomination. */
export function flagTextureKey(value) {
  return `flag${value}`;
}

/**
 * Texture key for a ship at a given size.
 *
 * The size is part of the key because the same grid is drawn at three of them:
 * 48px in play, 32px as a life icon, 80px under the title. Each is generated
 * separately at exactly its drawn size rather than one being scaled to the
 * others, so no use of the artwork is ever resampled.
 */
export function shipTextureKey(name, pixelSize = SHIP_ART.pixelSize, frame = 0) {
  return frame === 0 ? `ship-${name}-${pixelSize}` : `ship-${name}-${pixelSize}-f${frame}`;
}

/** Texture key for one of the transform bonus ships. */
export function transformTextureKey(type, frame = 0) {
  return frame === 0 ? `transform-${type}` : `transform-${type}-f${frame}`;
}

/**
 * Draw one pixel grid into a texture, one filled rect per art pixel.
 *
 * Runs of the same colour are not merged. At 16 x 16 that is at most 256
 * rects, once, at scene start; merging them would trade a readable loop for a
 * saving nothing can measure.
 */
export function createPixelTexture(scene, key, sprite, pixelSize, frame = 0) {
  if (scene.textures.exists(key)) return key;

  const art = parsePixelArt(frameRows(sprite, frame), sprite.palette);
  const graphics = scene.make.graphics({ add: false });

  for (const pixel of art.pixels) {
    graphics
      .fillStyle(pixel.color, 1)
      .fillRect(pixel.x * pixelSize, pixel.y * pixelSize, pixelSize, pixelSize);
  }

  graphics.generateTexture(key, art.width * pixelSize, art.height * pixelSize);
  graphics.destroy();

  scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
  return key;
}

/**
 * Build one ship texture, at one size.
 *
 * Separate from `createShipTextures` because the title screen wants only the
 * fighter and wants it at 80px, and building the whole enemy set for an
 * attract screen that shows none of them would be waste.
 */
export function createShipTexture(scene, name, pixelSize = SHIP_ART.pixelSize) {
  const sprite = SHIP_SPRITES[name];
  if (!sprite) throw new Error(`No ship artwork named "${name}"`);

  for (let frame = 0; frame < frameCount(sprite); frame += 1) {
    createPixelTexture(scene, shipTextureKey(name, pixelSize, frame), sprite, pixelSize, frame);
  }
  return shipTextureKey(name, pixelSize);
}

/** Build every ship at its gameplay size, plus the fighter at life-icon size. */
export function createShipTextures(scene) {
  for (const name of Object.keys(SHIP_SPRITES)) {
    createShipTexture(scene, name, SHIP_ART.pixelSize);
  }

  createShipTexture(scene, 'player', SHIP_ART.lifeIconPixelSize);
}

/** Build all three transform bonus ships, every frame of each. */
export function createTransformTextures(scene) {
  for (const [type, sprite] of Object.entries(TRANSFORM_SPRITES)) {
    for (let frame = 0; frame < frameCount(sprite); frame += 1) {
      createPixelTexture(scene, transformTextureKey(type, frame), sprite, TRANSFORM.pixelSize, frame);
    }
  }
}

/** Texture key for one frame of an explosion. */
export function explosionTextureKey(kind, frame) {
  return `explosion-${kind}-f${frame}`;
}

/**
 * Build every frame of both explosions.
 *
 * Drawn at the ships' own pixel size: the enemy burst is a 16-grid like the
 * ships and comes out at their 48px; the player's is a 32-grid and comes out
 * at 96px, twice a ship, which is the arcade's own proportion for it.
 */
export function createExplosionTextures(scene) {
  for (const [kind, sprite] of Object.entries(EXPLOSION_SPRITES)) {
    for (let frame = 0; frame < frameCount(sprite); frame += 1) {
      createPixelTexture(scene, explosionTextureKey(kind, frame), sprite, SHIP_ART.pixelSize, frame);
    }
  }
}

/** Build all six stage flags. */
export function createFlagTextures(scene) {
  for (const [value, sprite] of Object.entries(FLAG_SPRITES)) {
    createPixelTexture(scene, flagTextureKey(value), sprite, FLAG_ART.pixelSize);
  }
}

/** How wide a drawn flag is on screen, for laying the HUD row out. */
export const FLAG_DRAWN_WIDTH = FLAG_ART.width * FLAG_ART.pixelSize;

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
import { parsePixelArt, TRANSFORM_SPRITES, FLAG_SPRITES, SHIP_SPRITES } from './pixelArt.js';

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
export function shipTextureKey(name, pixelSize = SHIP_ART.pixelSize) {
  return `ship-${name}-${pixelSize}`;
}

/** Texture key for one of the transform bonus ships. */
export function transformTextureKey(type) {
  return `transform-${type}`;
}

/**
 * Draw one pixel grid into a texture, one filled rect per art pixel.
 *
 * Runs of the same colour are not merged. At 16 x 16 that is at most 256
 * rects, once, at scene start; merging them would trade a readable loop for a
 * saving nothing can measure.
 */
export function createPixelTexture(scene, key, sprite, pixelSize) {
  if (scene.textures.exists(key)) return key;

  const art = parsePixelArt(sprite.rows, sprite.palette);
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
  return createPixelTexture(scene, shipTextureKey(name, pixelSize), sprite, pixelSize);
}

/** Build every ship at its gameplay size, plus the fighter at life-icon size. */
export function createShipTextures(scene) {
  for (const name of Object.keys(SHIP_SPRITES)) {
    createShipTexture(scene, name, SHIP_ART.pixelSize);
  }

  createShipTexture(scene, 'player', SHIP_ART.lifeIconPixelSize);
}

/** Build all three transform bonus ships. */
export function createTransformTextures(scene) {
  for (const [type, sprite] of Object.entries(TRANSFORM_SPRITES)) {
    createPixelTexture(scene, transformTextureKey(type), sprite, TRANSFORM.pixelSize);
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

/**
 * The monitor.
 *
 * The game was drawn for a shadow-mask CRT mounted behind smoked glass, and
 * two of the cabinet's controls belong to the hardware around the game
 * rather than to the game itself: the volume pot on the PCB and the monitor
 * the raster lands on. `applyCabinet` reads the settings block and imposes
 * both on a scene -- the sound manager's master volume, and an optional
 * scanline overlay for players who want the raster to look like a raster.
 *
 * The overlay is one translucent dark row in three, tiled over the whole
 * field above everything else. It is deliberately opt-in and deliberately
 * mild: a flat panel with no overlay is closer to the game than a heavy
 * fake CRT effect would be.
 */

import { loadSettings } from '../systems/settings.js';
import { resolveStorage } from '../systems/persistence.js';

const SCANLINE_TEXTURE = 'crtScanline';

/** One dark row in three, at the strength of smoked glass, not a filter. */
function ensureScanlineTexture(scene) {
  if (scene.textures.exists(SCANLINE_TEXTURE)) return;
  const canvas = scene.textures.createCanvas(SCANLINE_TEXTURE, 1, 3);
  const ctx = canvas.getContext();
  ctx.clearRect(0, 0, 1, 3);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
  ctx.fillRect(0, 0, 1, 1);
  canvas.refresh();
}

/** Lay the overlay over a scene. Returns the sprite so a toggle can remove it. */
export function addScanlines(scene, screen) {
  ensureScanlineTexture(scene);
  return scene.add
    .tileSprite(screen.width / 2, screen.height / 2, screen.width, screen.height, SCANLINE_TEXTURE)
    .setDepth(100);
}

/**
 * Impose the cabinet's knobs on a scene: master volume always, scanlines if
 * the operator has switched them on. Returns the settings block in force.
 */
export function applyCabinet(scene, screen) {
  const settings = loadSettings(resolveStorage(globalThis.localStorage));
  scene.sound.volume = settings.masterVolume;
  if (settings.scanlines) addScanlines(scene, screen);
  return settings;
}

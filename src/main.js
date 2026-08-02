import { SCREEN } from './config.js';
import { TitleScene } from './scenes/TitleScene.js';
import { GameScene } from './scenes/GameScene.js';
import { GameOverScene } from './scenes/GameOverScene.js';
import { ServiceScene } from './scenes/ServiceScene.js';

/**
 * Galaga is played on a tall field: the cabinet's monitor is mounted
 * vertically, so the playfield is 7:9 portrait. `SCREEN` is three times the
 * arcade's rotated raster; FIT scales that canvas down to whatever the window
 * gives it and CENTER_BOTH letterboxes the remainder, so a landscape browser
 * window shows a centred portrait field rather than a stretched one.
 *
 * The original config here was 1600x700, wide enough that the formation sat in
 * the middle with dead space either side and dives had almost no drama.
 */
const config = {
  type: Phaser.AUTO,
  width: SCREEN.width,
  height: SCREEN.height,
  parent: 'game',
  backgroundColor: '#000000',
  physics: {
    default: 'arcade',
    arcade: { gravity: { y: 0 }, debug: false },
  },
  // The cabinet's stick and button, for anyone holding an actual stick and
  // button: the plugin is off by default and this is the one place to ask
  // for it. The pad's mapping is read in `src/systems/controls.js`.
  input: {
    gamepad: true,
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [TitleScene, GameScene, GameOverScene, ServiceScene],
};

globalThis.__game = new Phaser.Game(config);

import {
  BACKGROUND_SCROLL_PX,
  BACKGROUND_TILE_SCALE,
  SCREEN,
  SPRITE_SCALE,
} from '../config.js';
import { resolveStorage, loadHighScore } from '../systems/persistence.js';
import { SOUND_FILES } from '../systems/audio.js';

export class TitleScene extends Phaser.Scene {
  constructor() {
    super({ key: 'TitleScene' });
  }

  preload() {
    this.load.image('background', 'assets/images/background_tiled_vertical.png');
    this.load.image('titlePlayer', 'assets/images/mainship.png');

    // Loaded here as well as in GameScene: Phaser caches by key, so this is a
    // no-op the second time, and it means the attract screen has the theme
    // available on the very first frame.
    for (const [key, path] of Object.entries(SOUND_FILES)) {
      this.load.audio(key, path);
    }
  }

  create() {
    this.background = this.add
      .tileSprite(0, 0, SCREEN.width, SCREEN.height, 'background')
      .setOrigin(0)
      .setTileScale(BACKGROUND_TILE_SCALE);

    const highScore = loadHighScore(resolveStorage(globalThis.localStorage));

    // The attract screen has the theme under it, as the cabinet does. It is
    // stopped rather than left running when the game starts, so the opening
    // stage is played over the low ambient pulse instead of over music.
    this.theme = this.sound.add('theme');
    this.theme.play({ volume: 0.4, loop: true });

    this.add
      .text(SCREEN.width / 2, 110, 'HIGH SCORE', {
        font: '18px monospace',
        fill: '#ff5555',
      })
      .setOrigin(0.5);

    this.add
      .text(SCREEN.width / 2, 142, String(highScore), {
        font: '22px monospace',
        fill: '#ffffff',
      })
      .setOrigin(0.5);

    this.add
      .text(SCREEN.width / 2, 300, 'ALIEN ESCAPE', {
        font: '52px monospace',
        fill: '#ffcc00',
      })
      .setOrigin(0.5);

    this.add
      .text(SCREEN.width / 2, 352, 'a galaga tribute', {
        font: '18px monospace',
        fill: '#88aaff',
      })
      .setOrigin(0.5);

    this.add
      .image(SCREEN.width / 2, 448, 'titlePlayer')
      .setScale(SPRITE_SCALE.titleShip);

    const controls = [
      'A / D  or  ARROWS   move',
      'SPACE               fire',
      '',
      'two shots on screen at a time.',
      'rescue a captured fighter to fly dual.',
    ].join('\n');

    this.add
      .text(SCREEN.width / 2, 582, controls, {
        font: '15px monospace',
        fill: '#cccccc',
        align: 'center',
        lineSpacing: 6,
      })
      .setOrigin(0.5);

    const prompt = this.add
      .text(SCREEN.width / 2, 740, 'PRESS SPACE TO START', {
        font: '20px monospace',
        fill: '#ffffff',
      })
      .setOrigin(0.5);

    this.tweens.add({
      targets: prompt,
      alpha: 0.2,
      duration: 700,
      yoyo: true,
      repeat: -1,
    });

    this.input.keyboard.once('keydown-SPACE', () => {
      // Coin, then the start jingle, then the game -- the cabinet's own order.
      this.theme.stop();
      this.sound.play('coin', { volume: 0.5 });
      this.sound.play('gameStart', { volume: 0.5 });
      this.time.delayedCall(600, () => this.scene.start('GameScene'));
    });
  }

  update() {
    this.background.tilePositionY -= BACKGROUND_SCROLL_PX.title / BACKGROUND_TILE_SCALE;
  }
}

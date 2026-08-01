import { BACKGROUND_SCROLL_PX, BACKGROUND_TILE_SCALE, SCREEN, SHIP_ART } from '../config.js';
import { resolveStorage, loadScoreTable } from '../systems/persistence.js';
import { createShipTexture, shipTextureKey } from '../art/textures.js';
import { SOUND_FILES } from '../systems/audio.js';

export class TitleScene extends Phaser.Scene {
  constructor() {
    super({ key: 'TitleScene' });
  }

  preload() {
    this.load.image('background', 'assets/images/background_tiled_vertical.png');

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

    // The attract screen has the theme under it, as the cabinet does. It is
    // stopped rather than left running when the game starts, so the opening
    // stage is played over the low ambient pulse instead of over music.
    this.theme = this.sound.add('theme');
    this.theme.play({ volume: 0.4, loop: true });

    this.add
      .text(SCREEN.width / 2, 130, 'ALIEN ESCAPE', {
        font: '52px monospace',
        fill: '#ffcc00',
      })
      .setOrigin(0.5);

    this.add
      .text(SCREEN.width / 2, 182, 'a galaga tribute', {
        font: '18px monospace',
        fill: '#88aaff',
      })
      .setOrigin(0.5);

    // Generated from the pixel grid in `src/art`, at five screen pixels to the
    // art pixel: the same fighter the player flies, drawn larger rather than a
    // separate piece of artwork that could drift away from it.
    createShipTexture(this, 'player', SHIP_ART.titlePixelSize);
    this.add.image(SCREEN.width / 2, 268, shipTextureKey('player', SHIP_ART.titlePixelSize));

    this.drawScoreBoard();

    // Left-aligned inside a centred block. Centring each line individually,
    // which an earlier revision did, threw the two key columns out of line with
    // each other in a monospace font that exists to keep them lined up.
    const controls = [
      'A / D  or  ARROWS      move',
      'SPACE                  fire',
      '',
      'two shots on screen at a time.',
      'rescue a captured fighter to fly dual.',
    ].join('\n');

    this.add
      .text(SCREEN.width / 2, 640, controls, {
        font: '15px monospace',
        fill: '#cccccc',
        align: 'left',
        lineSpacing: 6,
      })
      .setOrigin(0.5);

    const prompt = this.add
      .text(SCREEN.width / 2, 776, 'PRESS SPACE TO START', {
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

  /**
   * The best five, which is what an idle cabinet spends most of its time
   * showing.
   *
   * Reading it here rather than being handed it means the board is current
   * whichever way the player arrived: from a finished game, from the results
   * screen, or from a reload an hour later.
   */
  drawScoreBoard() {
    this.add
      .text(SCREEN.width / 2, 372, 'BEST 5', { font: '18px monospace', fill: '#ff5555' })
      .setOrigin(0.5);

    loadScoreTable(resolveStorage(globalThis.localStorage)).forEach((entry, index) => {
      const y = 412 + index * 30;

      this.add
        .text(SCREEN.width / 2 - 130, y, `${index + 1}`, {
          font: '16px monospace',
          fill: '#667799',
        })
        .setOrigin(0, 0.5);

      this.add
        .text(SCREEN.width / 2 - 50, y, entry.name, { font: '16px monospace', fill: '#ffffff' })
        .setOrigin(0, 0.5);

      this.add
        .text(SCREEN.width / 2 + 130, y, String(entry.score), {
          font: '16px monospace',
          fill: '#ffffff',
        })
        .setOrigin(1, 0.5);
    });
  }

  update() {
    this.background.tilePositionY -= BACKGROUND_SCROLL_PX.title / BACKGROUND_TILE_SCALE;
  }
}

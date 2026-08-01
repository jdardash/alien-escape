import { BACKGROUND_SCROLL_PX, BACKGROUND_TILE_SCALE, SCREEN, SHIP_ART } from '../config.js';
import { resolveStorage, loadScoreTable } from '../systems/persistence.js';
import { createShipTexture, shipTextureKey } from '../art/textures.js';
import { applyShipArt, queueLocalArt, usingLocalArt } from '../art/localArt.js';
import { SOUND_FILES } from '../systems/audio.js';
import { EnemyType } from '../systems/formation.js';
import {
  scoreFor,
  FIRST_EXTRA_LIFE,
  SECOND_EXTRA_LIFE,
  EXTRA_LIFE_INTERVAL,
} from '../systems/scoring.js';

/**
 * The attract mode.
 *
 * An idle Galaga cabinet does not show one screen, it runs a loop: the title,
 * then the chart of what every enemy is worth, then the bonus ladder over a
 * credit prompt, then the high-score board, then round again. That loop is the
 * part of the game a passer-by sees before deciding to put money in, and the
 * value chart in particular is the only place the game ever teaches its own
 * scoring -- which here is the most carefully implemented and least visible
 * thing in the repository.
 *
 * Every number on these panels is read from `src/systems/scoring.js` at draw
 * time rather than written out again here. A chart that could disagree with the
 * table it documents would be worse than no chart.
 */

/** How long each attract panel holds before the next one replaces it. */
const PANEL_MS = 6000;

export class TitleScene extends Phaser.Scene {
  constructor() {
    super({ key: 'TitleScene' });
  }

  preload() {
    this.load.image('background', 'assets/images/background_tiled_vertical.png');

    // Probed here rather than in GameScene so the title ship is already the
    // local one if a local checkout has any; it is a no-op the second time.
    queueLocalArt(this);

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

    // Every ship the chart draws, at the size it draws them.
    for (const name of ['zako', 'goei', 'boss', 'player']) {
      createShipTexture(this, name, SHIP_ART.pixelSize);
    }
    createShipTexture(this, 'player', SHIP_ART.titlePixelSize);
    createShipTexture(this, 'player', SHIP_ART.lifeIconPixelSize);

    this.drawChrome();

    // Objects belonging to the panel currently on screen. Torn down as a group
    // when the next one arrives, which is why they are tracked rather than just
    // added: an attract loop that leaked one text object per cycle would still
    // look right for a minute and then be unreadable.
    this.panel = [];
    this.panelIndex = 0;
    this.showPanel();

    this.panelTimer = this.time.addEvent({
      delay: PANEL_MS,
      loop: true,
      callback: () => {
        this.panelIndex = (this.panelIndex + 1) % this.panels().length;
        this.showPanel();
      },
    });

    this.input.keyboard.once('keydown-SPACE', () => this.startGame());
  }

  /**
   * The parts that stay put across the whole loop: the credit line the cabinet
   * always shows, and the prompt to start.
   */
  drawChrome() {
    this.creditText = this.add
      .text(20, SCREEN.height - 30, 'CREDIT 1', { font: '16px monospace', fill: '#ffffff' })
      .setDepth(10);

    const prompt = this.add
      .text(SCREEN.width / 2, SCREEN.height - 74, 'PUSH START BUTTON   (SPACE)', {
        font: '18px monospace',
        fill: '#ffcc00',
      })
      .setOrigin(0.5)
      .setDepth(10);

    this.tweens.add({ targets: prompt, alpha: 0.2, duration: 700, yoyo: true, repeat: -1 });

    // A local checkout running the arcade's own sprites should say so on screen,
    // so a screenshot taken from one is never mistaken for what the repository
    // ships.
    if (usingLocalArt()) {
      this.add
        .text(SCREEN.width - 20, SCREEN.height - 30, 'local artwork', {
          font: '12px monospace',
          fill: '#556677',
        })
        .setOrigin(1, 0)
        .setDepth(10);
    }
  }

  /** The attract loop, in order. */
  panels() {
    return [
      () => this.drawTitle(),
      () => this.drawScoreChart(),
      () => this.drawBonusLadder(),
      () => this.drawScoreBoard(),
    ];
  }

  showPanel() {
    this.panel.forEach((object) => object.destroy());
    this.panel = [];
    this.panels()[this.panelIndex]();
  }

  /** Track an object as part of the current panel and return it. */
  own(object) {
    this.panel.push(object);
    return object;
  }

  text(x, y, content, style, origin = 0.5) {
    return this.own(this.add.text(x, y, content, style).setOrigin(origin, 0.5));
  }

  ship(x, y, name, pixelSize = SHIP_ART.pixelSize) {
    const image = this.add.image(x, y, shipTextureKey(name, pixelSize));
    return this.own(applyShipArt(image, name, pixelSize));
  }

  // ----------------------------------------------------------------- panels

  drawTitle() {
    this.text(SCREEN.width / 2, 150, 'ALIEN ESCAPE', { font: '52px monospace', fill: '#ffcc00' });
    this.text(SCREEN.width / 2, 202, 'a galaga tribute', {
      font: '18px monospace',
      fill: '#88aaff',
    });

    this.ship(SCREEN.width / 2, 300, 'player', SHIP_ART.titlePixelSize);

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

    this.own(
      this.add
        .text(SCREEN.width / 2, 470, controls, {
          font: '15px monospace',
          fill: '#cccccc',
          align: 'left',
          lineSpacing: 6,
        })
        .setOrigin(0.5),
    );
  }

  /**
   * What every enemy is worth, drawn beside the enemy itself.
   *
   * The cabinet's own chart: each rank shown as a sprite with its formation
   * value and its diving value, and the Boss Galaga with the escort tiers that
   * make it worth up to four times its solo value. The escorts are drawn rather
   * than described, because "1600" is only interesting once you can see it is a
   * boss with two Goei behind it.
   */
  drawScoreChart() {
    this.text(SCREEN.width / 2, 110, '-- SCORE --', { font: '24px monospace', fill: '#ff4444' });

    const shipX = SCREEN.width / 2 - 150;
    const valueX = SCREEN.width / 2 + 170;
    const label = { font: '17px monospace', fill: '#ffffff' };

    [
      { name: 'zako', type: EnemyType.ZAKO, y: 190 },
      { name: 'goei', type: EnemyType.GOEI, y: 270 },
    ].forEach(({ name, type, y }) => {
      this.ship(shipX, y, name);
      this.text(
        valueX,
        y,
        `${scoreFor(type)}  /  ${scoreFor(type, { diving: true })}`,
        label,
        1,
      );
    });

    this.text(SCREEN.width / 2, 330, 'in formation  /  attacking', {
      font: '13px monospace',
      fill: '#667799',
    });

    // The boss, then the boss with one escort, then with two: three rows that
    // read as an escalating threat rather than as a table of numbers.
    this.ship(shipX, 400, 'boss');
    this.text(valueX, 400, String(scoreFor(EnemyType.BOSS)), label, 1);
    this.text(SCREEN.width / 2, 440, 'BOSS GALAGA in formation', {
      font: '13px monospace',
      fill: '#667799',
    });

    [0, 1, 2].forEach((escorts) => {
      const y = 500 + escorts * 76;
      this.ship(shipX, y, 'boss');
      for (let i = 0; i < escorts; i += 1) {
        this.ship(shipX + 56 + i * 52, y + 14, 'goei');
      }
      this.text(valueX, y, String(scoreFor(EnemyType.BOSS, { diving: true, escorts })), label, 1);
    });

    this.text(SCREEN.width / 2, 700, 'attacking, with escorts', {
      font: '13px monospace',
      fill: '#667799',
    });
  }

  /**
   * The extra-ship ladder, which the cabinet prints on coin-up.
   *
   * Note the second award is at 70,000 outright rather than 20,000 plus an
   * interval, which is why the two lines quote absolute figures and only the
   * third quotes a repeat.
   */
  drawBonusLadder() {
    this.text(SCREEN.width / 2, 210, '-- BONUS --', { font: '24px monospace', fill: '#ff4444' });

    const lines = [
      `1ST BONUS FOR ${FIRST_EXTRA_LIFE} PTS`,
      `2ND BONUS FOR ${SECOND_EXTRA_LIFE} PTS`,
      `AND FOR EVERY ${EXTRA_LIFE_INTERVAL} PTS`,
    ];

    lines.forEach((line, index) => {
      const y = 320 + index * 70;
      // A spare fighter beside each line, the way the cabinet marks them: the
      // reward for the threshold is the thing drawn next to it.
      this.ship(SCREEN.width / 2 - 210, y, 'player', SHIP_ART.lifeIconPixelSize);
      this.text(SCREEN.width / 2 - 170, y, line, { font: '18px monospace', fill: '#ffffff' }, 0);
    });

    this.text(SCREEN.width / 2, 590, 'a tribute. not affiliated with Bandai Namco.', {
      font: '12px monospace',
      fill: '#556677',
    });
  }

  /**
   * The best five, which is what an idle cabinet spends most of its time
   * showing.
   *
   * Read here rather than handed in, so the board is current whichever way the
   * player arrived: from a finished game, from the results screen, or from a
   * reload an hour later.
   */
  drawScoreBoard() {
    this.text(SCREEN.width / 2, 240, '-- BEST 5 --', { font: '24px monospace', fill: '#ff4444' });

    loadScoreTable(resolveStorage(globalThis.localStorage)).forEach((entry, index) => {
      const y = 340 + index * 46;

      this.text(
        SCREEN.width / 2 - 130,
        y,
        `${index + 1}`,
        { font: '18px monospace', fill: '#667799' },
        0,
      );
      this.text(
        SCREEN.width / 2 - 50,
        y,
        entry.name,
        { font: '18px monospace', fill: '#ffffff' },
        0,
      );
      this.text(
        SCREEN.width / 2 + 130,
        y,
        String(entry.score),
        { font: '18px monospace', fill: '#ffffff' },
        1,
      );
    });
  }

  // ------------------------------------------------------------------ start

  startGame() {
    // Coin, then the start jingle, then the game -- the cabinet's own order.
    this.panelTimer?.remove();
    this.theme.stop();
    this.creditText.setText('CREDIT 0');
    this.sound.play('coin', { volume: 0.5 });
    this.sound.play('gameStart', { volume: 0.5 });
    this.time.delayedCall(600, () => this.scene.start('GameScene'));
  }

  update() {
    this.background.tilePositionY -= BACKGROUND_SCROLL_PX.title / BACKGROUND_TILE_SCALE;
  }
}

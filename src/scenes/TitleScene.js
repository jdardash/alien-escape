import { SCREEN, SHIP_ART } from '../config.js';
import {
  CoinageMode,
  bonusSchemeFor,
  consumeCredits,
  createCoinBox,
  insertCoin,
  loadDips,
  startAllowed,
} from '../systems/dips.js';
import {
  STARFIELD_SCROLL,
  advanceStarfield,
  createStarfield,
  setStarfieldScroll,
  visibleStars,
} from '../systems/starfield.js';
import { resolveStorage, loadScoreTable, loadRank, saveRank } from '../systems/persistence.js';
import { RANK_COUNT, RANK_NAMES } from '../systems/stages.js';
import { createShipTexture, shipTextureKey } from '../art/textures.js';
import { applyShipArt, queueLocalArt, usingLocalArt } from '../art/localArt.js';
import { installSoundBank } from '../audio/soundBank.js';
import { queueLocalAudio, usingLocalAudio } from '../audio/localAudio.js';
import { EnemyType } from '../systems/formation.js';
import { scoreFor } from '../systems/scoring.js';

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
    // Probed here rather than in GameScene so the title ship is already the
    // local one if a local checkout has any; it is a no-op the second time.
    queueLocalArt(this);

    // The same arrangement for audio: probed here so the attract theme is
    // already the local one if a local checkout has any, and a no-op the second
    // time. It is the only audio request the game ever makes.
    queueLocalAudio(this);
  }

  create() {
    // Synthesised into the audio cache before anything asks for a sound, and
    // once for the whole game: GameScene finds the bank already installed. See
    // `src/audio/soundBank.js`.
    installSoundBank(this);

    this.storage = resolveStorage(globalThis.localStorage);
    this.rank = loadRank(this.storage);

    // The operator's switch block, and the coin box under the slot. From the
    // factory the machine is on free play -- a public web build charging
    // imaginary coins would be a joke at the player's expense -- but the
    // coinage model is real: set 1 COIN 1 PLAY in the service screen (F2)
    // and the start buttons want credits, which the C key inserts.
    this.dips = loadDips(this.storage);
    this.coinBox = createCoinBox();

    // The 63-star hardware field, drifting at attract speed. Drawn a frame
    // at a time into one Graphics object; see `src/systems/starfield.js`.
    this.starfield = setStarfieldScroll(createStarfield(), STARFIELD_SCROLL.title);
    this.starLayer = this.add.graphics();

    // The attract screen has the theme under it, as the cabinet does -- unless
    // the operator has switched attract sound off, which is a real DIP. It is
    // stopped rather than left running when the game starts, so the opening
    // stage is played over the low ambient pulse instead of over music.
    this.theme = this.sound.add('theme');
    if (this.dips.demoSound) this.theme.play({ volume: 0.4, loop: true });

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
      callback: () => this.advancePanel(),
    });

    // 1P START and 2P START, the two buttons on the panel. SPACE is bound to
    // the first of them as well, because a browser player reaches for it and a
    // cabinet's "1P START" means nothing to a keyboard. Bound with `on`
    // rather than `once`: on a coined machine a start without credits is
    // refused, and the button has to keep working after a refusal.
    this.input.keyboard.on('keydown-SPACE', () => this.startGame(1));
    this.input.keyboard.on('keydown-ONE', () => this.startGame(1));
    this.input.keyboard.on('keydown-TWO', () => this.startGame(2));

    // The coin slot, for a machine the operator has taken off free play.
    this.input.keyboard.on('keydown-C', () => this.coinInserted());

    // The DIP switch, which on a real machine is inside the box and is the
    // operator's business rather than the player's. There is no box here, so it
    // is on the panel -- and it is stored like a machine setting, so it stays
    // put across games and reloads. F2 opens the rest of the switch block.
    this.input.keyboard.on('keydown-R', () => this.cycleRank());
    this.input.keyboard.on('keydown-F2', () => this.openService());
  }

  /**
   * Move the attract loop on one step.
   *
   * The demo is a panel like any other as far as this is concerned; what makes
   * it different is that showing it means handing the screen to `GameScene`,
   * which is why it is the last thing in the cycle. The scene comes back to a
   * fresh `TitleScene` afterwards and the loop starts again from the logo,
   * which is what the cabinet does too.
   */
  advancePanel() {
    this.panelIndex += 1;

    if (this.panelIndex >= this.panels().length) {
      this.startDemo();
      return;
    }

    this.showPanel();
  }

  /** Hand the screen to the machine to play itself. */
  startDemo() {
    this.panelTimer?.remove();
    this.theme.stop();
    this.scene.start('GameScene', { demo: true });
  }

  /**
   * Step the difficulty rank on by one, wrapping past D.
   *
   * Redrawing the current panel is what puts the new rank on screen: the rank
   * line is part of the chrome, and the chrome is not rebuilt between panels.
   */
  cycleRank() {
    this.rank = saveRank(this.storage, (this.rank + 1) % RANK_COUNT);
    this.rankText.setText(this.rankLabel());
  }

  rankLabel() {
    const suffix = this.rank === 0 ? 'factory' : 'harder';
    return `RANK ${RANK_NAMES[this.rank]} (${suffix})    R to change    F2 service`;
  }

  /** Hand the screen to the operator. */
  openService() {
    this.panelTimer?.remove();
    this.theme.stop();
    this.scene.start('ServiceScene');
  }

  /** The credit line: what free play shows, or what has been paid in. */
  creditLabel() {
    if (this.dips.coinage === CoinageMode.FREE_PLAY) return 'FREE PLAY';
    return `CREDIT ${this.coinBox.credits}`;
  }

  /** A coin dropped in the slot. Decorative on free play, as on the cabinet. */
  coinInserted() {
    if (this.dips.coinage === CoinageMode.FREE_PLAY) return;
    this.coinBox = insertCoin(this.dips.coinage, this.coinBox);
    this.sound.play('coin', { volume: 0.5 });
    this.creditText.setText(this.creditLabel());
  }

  /**
   * The parts that stay put across the whole loop: the credit line the cabinet
   * always shows, and the prompt to start.
   */
  drawChrome() {
    this.creditText = this.add
      .text(20, SCREEN.height - 30, this.creditLabel(), {
        font: '16px monospace',
        fill: '#ffffff',
      })
      .setDepth(10);

    const prompt = this.add
      .text(SCREEN.width / 2, SCREEN.height - 100, 'PUSH START BUTTON', {
        font: '18px monospace',
        fill: '#ffcc00',
      })
      .setOrigin(0.5)
      .setDepth(10);

    this.tweens.add({ targets: prompt, alpha: 0.2, duration: 700, yoyo: true, repeat: -1 });

    // The two start buttons, and what they cost. On free play they always
    // work; on a coined machine the C key is the slot.
    const coined = this.dips.coinage !== CoinageMode.FREE_PLAY;
    this.add
      .text(
        SCREEN.width / 2,
        SCREEN.height - 74,
        `1 PLAYER: SPACE or 1      2 PLAYERS: 2${coined ? '      COIN: C' : ''}`,
        {
          font: '14px monospace',
          fill: '#8899bb',
        },
      )
      .setOrigin(0.5)
      .setDepth(10);

    this.rankText = this.add
      .text(SCREEN.width / 2, SCREEN.height - 52, this.rankLabel(), {
        font: '13px monospace',
        fill: this.rank === 0 ? '#667799' : '#cc8844',
      })
      .setOrigin(0.5)
      .setDepth(10);

    // A local checkout running the arcade's own sprites or samples should say
    // so on screen, so a screenshot or a recording taken from one is never
    // mistaken for what the repository ships. Both are named, because they are
    // overridden independently and "local artwork" over the cabinet's own audio
    // would be the more misleading of the two labels.
    const local = [usingLocalArt() && 'artwork', usingLocalAudio() && 'audio'].filter(Boolean);

    if (local.length > 0) {
      this.add
        .text(SCREEN.width - 20, SCREEN.height - 30, `local ${local.join(' + ')}`, {
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
   * Printed from the bonus scheme the DIP switches select, which is why a
   * machine set to a stop-after-two scheme prints two lines and one set to
   * NONE prints none: what the panel promises is what the game pays.
   */
  drawBonusLadder() {
    this.text(SCREEN.width / 2, 210, '-- BONUS --', { font: '24px monospace', fill: '#ff4444' });

    const scheme = bonusSchemeFor(this.dips);
    const lines = [];
    if (scheme.first !== null) lines.push(`1ST BONUS FOR ${scheme.first} PTS`);
    if (scheme.second !== null) lines.push(`2ND BONUS FOR ${scheme.second} PTS`);
    if (scheme.every !== null) lines.push(`AND FOR EVERY ${scheme.every} PTS`);
    if (lines.length === 0) lines.push('NO BONUS FIGHTERS');

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

  /**
   * Somebody pressed a start button.
   *
   * Two players costs two credits, which is why the credit line counts down by
   * the number of players rather than to zero: a machine with two credits in it
   * that is given a one-player start still has one left.
   */
  startGame(playerCount) {
    if (this.starting) return;
    // A start the coin box cannot cover is refused, exactly as the cabinet
    // refuses it: silently, with the credit line explaining why.
    if (!startAllowed(this.dips.coinage, this.coinBox, playerCount)) return;
    this.starting = true;

    // Pay, then the start jingle, then the game -- the cabinet's own order.
    this.panelTimer?.remove();
    this.theme.stop();
    this.coinBox = consumeCredits(this.dips.coinage, this.coinBox, playerCount);
    this.creditText.setText(this.creditLabel());
    this.sound.play('coin', { volume: 0.5 });
    this.sound.play('gameStart', { volume: 0.5 });
    this.time.delayedCall(600, () => this.scene.start('GameScene', { playerCount }));
  }

  update(_time, delta) {
    this.starfield = advanceStarfield(this.starfield, delta);
    this.starLayer.clear();
    for (const star of visibleStars(this.starfield, SCREEN)) {
      this.starLayer.fillStyle(star.color, 1);
      this.starLayer.fillRect(star.x, star.y, 2, 2);
    }
  }
}

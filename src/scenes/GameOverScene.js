import { SCREEN } from '../config.js';
import { createStats, formatRatio } from '../systems/stats.js';
import {
  NAME_ALPHABET,
  NAME_LENGTH,
  resolveStorage,
  loadScoreTable,
  scoreTableRank,
  recordScore,
} from '../systems/persistence.js';

/**
 * Results screen, and the board.
 *
 * Galaga closes every game with a hit-miss ratio, which is what retroactively
 * justifies the two-bullet limit: the game has been scoring your accuracy the
 * whole time, not just your kills. Then, if the run made the top five, it asks
 * for three initials and puts them on a board that survives the browser being
 * closed. That second half is why the cabinet has two different name-entry
 * tunes, and it is the part that makes a good run worth telling someone about.
 */
export class GameOverScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameOverScene' });
  }

  init(data) {
    this.finalScore = data?.score ?? 0;
    this.stageReached = data?.stage ?? 1;
    this.stats = data?.stats ?? createStats();

    this.storage = resolveStorage(globalThis.localStorage);
    this.table = loadScoreTable(this.storage);
    this.rank = scoreTableRank(this.table, this.finalScore);

    // Three slots, each an index into the alphabet the cursor walks.
    this.initials = Array.from({ length: NAME_LENGTH }, () => 0);
    this.slot = 0;
    this.panel = [];
  }

  create() {
    this.add.rectangle(0, 0, SCREEN.width, SCREEN.height, 0x000000).setOrigin(0);

    // The cabinet plays a different tune for taking first place than for taking
    // any other place on the board, and a third for not making it at all.
    if (this.rank === 0) this.sound.play('highScoreEntry', { volume: 0.5 });
    else this.sound.play('gameOverTune', { volume: 0.5 });

    this.add
      .text(SCREEN.width / 2, 120, 'GAME OVER', {
        font: '46px monospace',
        fill: '#ff4444',
      })
      .setOrigin(0.5);

    this.drawResults();

    if (this.rank === -1) {
      this.showBoard();
      return;
    }

    this.beginNameEntry();
  }

  drawResults() {
    const rows = [
      ['SCORE', String(this.finalScore)],
      ['STAGE REACHED', String(this.stageReached)],
      ['SHOTS FIRED', String(this.stats.shotsFired)],
      ['HITS', String(this.stats.hits)],
      ['HIT-MISS RATIO', formatRatio(this.stats)],
    ];

    rows.forEach(([label, value], index) => {
      const y = 210 + index * 34;

      this.add
        .text(SCREEN.width / 2 - 150, y, label, { font: '16px monospace', fill: '#8899bb' })
        .setOrigin(0, 0.5);

      this.add
        .text(SCREEN.width / 2 + 150, y, value, { font: '16px monospace', fill: '#ffffff' })
        .setOrigin(1, 0.5);
    });
  }

  // ------------------------------------------------------------ name entry

  /**
   * Ask for three initials, arcade style.
   *
   * Up and down walk the alphabet, left and right pick the slot, fire locks the
   * slot in and moves on. Locking in the last one submits, which is what the
   * cabinet does and what stops the player having to find a separate confirm
   * key that no arcade panel has.
   */
  beginNameEntry() {
    // Everything the entry draws goes in `panel`, because all of it is torn
    // down together the moment the name is taken and the board replaces it.
    // Tracking only the letters, which an earlier revision did, left the
    // headings and the key hints on screen underneath the board.
    this.panel = [
      this.add
        .text(SCREEN.width / 2, 430, `YOU PLACED ${this.rank + 1} OF 5`, {
          font: '20px monospace',
          fill: '#ffcc00',
        })
        .setOrigin(0.5),

      this.add
        .text(SCREEN.width / 2, 466, 'ENTER YOUR INITIALS', {
          font: '15px monospace',
          fill: '#8899bb',
        })
        .setOrigin(0.5),

      this.add
        .text(SCREEN.width / 2, 610, 'W / S  letter      A / D  slot      SPACE  lock in', {
          font: '14px monospace',
          fill: '#667799',
        })
        .setOrigin(0.5),
    ];

    this.letters = this.initials.map((_letter, index) =>
      this.add
        .text(SCREEN.width / 2 + (index - 1) * 52, 528, '', {
          font: '42px monospace',
          fill: '#ffffff',
        })
        .setOrigin(0.5),
    );

    this.cursor = this.add
      .rectangle(SCREEN.width / 2 - 52, 562, 34, 4, 0xffcc00)
      .setOrigin(0.5);
    this.tweens.add({ targets: this.cursor, alpha: 0.2, duration: 400, yoyo: true, repeat: -1 });

    this.panel.push(...this.letters, this.cursor);

    // Events rather than per-frame key polling. A key pressed and released
    // inside a single frame never registers as "just down", so polling silently
    // drops fast taps -- and picking three letters is nothing but fast taps.
    const bind = (keys, handler) => {
      for (const key of keys) {
        this.input.keyboard.on(`keydown-${key}`, () => {
          if (this.entering) handler();
        });
      }
    };

    bind(['W', 'UP'], () => this.cycleLetter(-1));
    bind(['S', 'DOWN'], () => this.cycleLetter(1));
    bind(['A', 'LEFT'], () => this.moveSlot(-1));
    bind(['D', 'RIGHT'], () => this.moveSlot(1));
    bind(['SPACE'], () => this.acceptSlot());
    bind(['ENTER'], () => this.submitName());

    this.entering = true;
    this.refreshNameEntry();
  }

  cycleLetter(step) {
    const count = NAME_ALPHABET.length;
    this.initials[this.slot] = (this.initials[this.slot] + step + count) % count;
    this.refreshNameEntry();
  }

  moveSlot(step) {
    this.slot = Phaser.Math.Clamp(this.slot + step, 0, NAME_LENGTH - 1);
    this.refreshNameEntry();
  }

  /** Fire locks the current letter in; locking the last one submits the name. */
  acceptSlot() {
    if (this.slot === NAME_LENGTH - 1) {
      this.submitName();
      return;
    }

    this.slot += 1;
    this.refreshNameEntry();
  }

  submitName() {
    if (!this.entering) return;
    this.entering = false;

    const name = this.initials.map((index) => NAME_ALPHABET[index]).join('');
    this.table = recordScore(this.storage, { name, score: this.finalScore });

    // The entry panel is replaced by the board it just changed, so the player
    // sees where their name landed rather than being returned to a title
    // screen and having to go looking for it.
    this.panel.forEach((object) => object.destroy());
    this.panel = [];
    this.showBoard();
  }

  refreshNameEntry() {
    this.letters.forEach((letter, index) => {
      letter.setText(NAME_ALPHABET[this.initials[index]]);
      letter.setColor(index === this.slot ? '#ffcc00' : '#ffffff');
    });

    this.cursor.x = SCREEN.width / 2 + (this.slot - 1) * 52;
  }

  // ----------------------------------------------------------------- board

  /**
   * The best five, with this run's row picked out.
   *
   * Drawn after the name has been taken, so the board on screen is the board on
   * disk. Only once it is up are the restart keys bound: SPACE is the lock-in
   * key during entry, and binding both at once would have restarted the game
   * the moment a player confirmed their initials.
   */
  showBoard() {
    this.add
      .text(SCREEN.width / 2, 430, 'BEST 5', { font: '20px monospace', fill: '#ff4444' })
      .setOrigin(0.5);

    this.table.forEach((entry, index) => {
      const y = 476 + index * 34;
      // `rank` is -1 for a run that did not make the board, so this picks out
      // nothing at all in that case rather than needing a second guard.
      const fill = this.rank === index ? '#ffcc00' : '#ffffff';

      this.add
        .text(SCREEN.width / 2 - 150, y, `${index + 1}`, {
          font: '17px monospace',
          fill: '#667799',
        })
        .setOrigin(0, 0.5);

      this.add
        .text(SCREEN.width / 2 - 60, y, entry.name, { font: '17px monospace', fill })
        .setOrigin(0, 0.5);

      this.add
        .text(SCREEN.width / 2 + 150, y, String(entry.score), { font: '17px monospace', fill })
        .setOrigin(1, 0.5);
    });

    const prompt = this.add
      .text(SCREEN.width / 2, 700, 'SPACE to play again    T for title', {
        font: '16px monospace',
        fill: '#aaaaaa',
      })
      .setOrigin(0.5);

    this.tweens.add({ targets: prompt, alpha: 0.3, duration: 900, yoyo: true, repeat: -1 });

    // A frame's delay before the restart key is live, so the same press that
    // locked in the last initial cannot also start the next game.
    this.time.delayedCall(400, () => {
      this.input.keyboard.once('keydown-SPACE', () => this.scene.start('GameScene'));
      this.input.keyboard.once('keydown-T', () => this.scene.start('TitleScene'));
    });
  }
}

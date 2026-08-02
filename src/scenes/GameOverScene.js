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
    // A two-player game arrives as a session and has to be reported twice, so
    // everything below works from a list of results rather than from one set of
    // numbers. A one-player game is a list of one, and a call carrying the old
    // single-player shape still produces a drawable screen.
    this.results = (
      data?.session?.players ?? [
        { index: 0, score: data?.score ?? 0, stage: data?.stage ?? 1, stats: data?.stats },
      ]
    ).map((player) => ({
      index: player.index ?? 0,
      score: player.score ?? 0,
      stage: player.stage ?? 1,
      stats: player.stats ?? createStats(),
    }));

    this.twoPlayer = this.results.length > 1;

    this.storage = resolveStorage(globalThis.localStorage);
    this.table = loadScoreTable(this.storage);

    // Both players are ranked against the board as it stands *now*, before
    // either name is taken. Ranking player two after player one has already
    // been written would let a good first score push a better second one down.
    for (const result of this.results) {
      result.rank = scoreTableRank(this.table, result.score);
    }

    this.pending = this.results.filter((result) => result.rank !== -1);
    this.entry = null;
    this.entered = [];

    // Three slots, each an index into the alphabet the cursor walks.
    this.initials = Array.from({ length: NAME_LENGTH }, () => 0);
    this.slot = 0;
    this.panel = [];
  }

  create() {
    this.add.rectangle(0, 0, SCREEN.width, SCREEN.height, 0x000000).setOrigin(0);

    // The cabinet plays a different tune for taking first place than for taking
    // any other place on the board, and a third for not making it at all. With
    // two players it is the better of the two runs that decides which.
    const best = Math.min(...this.results.map((result) => result.rank).filter((r) => r !== -1));
    if (best === 0) this.sound.play('highScoreEntry', { volume: 0.5 });
    else this.sound.play('gameOverTune', { volume: 0.5 });

    this.add
      .text(SCREEN.width / 2, 120, 'GAME OVER', {
        font: '46px monospace',
        fill: '#ff4444',
      })
      .setOrigin(0.5);

    this.drawResults();
    this.nextNameEntry();
  }

  /**
   * The closing report: shots fired, hits, and the ratio between them.
   *
   * Two players get two columns of it rather than two screens, because the
   * whole point of alternating play is that the two runs are there to be
   * compared.
   */
  drawResults() {
    const labels = ['SCORE', 'STAGE REACHED', 'SHOTS FIRED', 'HITS', 'HIT-MISS RATIO'];

    labels.forEach((label, index) => {
      this.add
        .text(SCREEN.width / 2 - 190, 210 + index * 34, label, {
          font: '16px monospace',
          fill: '#8899bb',
        })
        .setOrigin(0, 0.5);
    });

    this.results.forEach((result, column) => {
      const x = this.twoPlayer ? SCREEN.width / 2 + 45 + column * 145 : SCREEN.width / 2 + 190;

      if (this.twoPlayer) {
        this.add
          .text(x, 176, `${result.index + 1}UP`, { font: '15px monospace', fill: '#ff4444' })
          .setOrigin(1, 0.5);
      }

      const values = [
        String(result.score),
        String(result.stage),
        String(result.stats.shotsFired),
        String(result.stats.hits),
        formatRatio(result.stats),
      ];

      values.forEach((value, index) => {
        this.add
          .text(x, 210 + index * 34, value, { font: '16px monospace', fill: '#ffffff' })
          .setOrigin(1, 0.5);
      });
    });
  }

  /**
   * Ask the next player who made the board for their initials, or show the
   * board once nobody is left to ask.
   *
   * They are asked in player order, one at a time, which is what the cabinet
   * does: two entry panels at once would leave both players pressing the same
   * three keys.
   */
  nextNameEntry() {
    // Re-ranked against the board as it stands now, not as it stood when the
    // game ended. With five rows and two players, one player's entry can push
    // the other off the bottom -- and asking someone for three initials that
    // are then quietly discarded is worse than not asking.
    this.pending = this.pending.filter(
      (result) => scoreTableRank(this.table, result.score) !== -1,
    );

    this.entry = this.pending.shift() ?? null;

    if (this.entry === null) {
      this.showBoard();
      return;
    }

    this.entry.rank = scoreTableRank(this.table, this.entry.score);

    this.initials = Array.from({ length: NAME_LENGTH }, () => 0);
    this.slot = 0;
    this.beginNameEntry();
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
        .text(SCREEN.width / 2, 430, `YOU PLACED ${this.entry.rank + 1} OF 5`, {
          font: '20px monospace',
          fill: '#ffcc00',
        })
        .setOrigin(0.5),

      this.add
        .text(
          SCREEN.width / 2,
          466,
          this.twoPlayer
            ? `PLAYER ${this.entry.index + 1} -- ENTER YOUR INITIALS`
            : 'ENTER YOUR INITIALS',
          {
            font: '15px monospace',
            fill: '#8899bb',
          },
        )
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
    //
    // Bound once for the scene rather than once per entry: with two players
    // this method runs twice, and a second set of handlers would walk the
    // alphabet two letters at a time.
    if (!this.keysBound) {
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

      this.keysBound = true;
    }

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
    this.table = recordScore(this.storage, { name, score: this.entry.score });

    // Remembered so the board can pick out this run's rows. The rank worked out
    // in `init` is the row the score *would* have taken against the board as it
    // was; once the other player's name has gone in above it, the row it
    // actually occupies has moved.
    this.entered.push({ name, score: this.entry.score });

    // The entry panel is replaced by whatever comes next -- the other player's
    // panel, or the board it just changed -- so a player sees where their name
    // landed rather than being returned to a title screen to go looking for it.
    this.panel.forEach((object) => object.destroy());
    this.panel = [];
    this.nextNameEntry();
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

    // Rows this game just wrote, matched by what was written rather than by the
    // rank worked out earlier: with two players the second name goes in against
    // a board the first one has already changed.
    const claimed = [...this.entered];

    this.table.forEach((entry, index) => {
      const y = 476 + index * 34;
      const mine = claimed.findIndex(
        (written) => written.name === entry.name && written.score === entry.score,
      );

      // Removed once matched, so two players who took the same initials with
      // the same score light up one row each rather than both lighting up two.
      if (mine !== -1) claimed.splice(mine, 1);
      const fill = mine !== -1 ? '#ffcc00' : '#ffffff';

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
      // Play again means the game that was just played, so a pair who started
      // two-player get two-player back rather than being dropped into one.
      this.input.keyboard.once('keydown-SPACE', () =>
        this.scene.start('GameScene', { playerCount: this.results.length }),
      );
      this.input.keyboard.once('keydown-T', () => this.scene.start('TitleScene'));
    });
  }
}

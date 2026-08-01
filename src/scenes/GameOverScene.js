import { SCREEN } from '../config.js';
import { createStats, formatRatio } from '../systems/stats.js';

/**
 * Results screen.
 *
 * Galaga closes every game with a hit-miss ratio, which is what retroactively
 * justifies the two-bullet limit: the game has been scoring your accuracy the
 * whole time, not just your kills.
 */
export class GameOverScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameOverScene' });
  }

  init(data) {
    this.finalScore = data?.score ?? 0;
    this.highScore = data?.highScore ?? 0;
    this.stageReached = data?.stage ?? 1;
    this.stats = data?.stats ?? createStats();
  }

  create() {
    this.add.rectangle(0, 0, SCREEN.width, SCREEN.height, 0x000000).setOrigin(0);

    // The cabinet plays a different tune depending on whether the run earned a
    // place on the board, which is the reward the results screen exists for.
    const beatRecord = this.finalScore > 0 && this.finalScore >= this.highScore;
    this.sound.play(beatRecord ? 'highScoreEntry' : 'gameOverTune', { volume: 0.5 });

    this.add
      .text(SCREEN.width / 2, 170, 'GAME OVER', {
        font: '46px monospace',
        fill: '#ff4444',
      })
      .setOrigin(0.5);

    if (beatRecord) {
      const banner = this.add
        .text(SCREEN.width / 2, 232, 'NEW HIGH SCORE', {
          font: '20px monospace',
          fill: '#ffcc00',
        })
        .setOrigin(0.5);

      this.tweens.add({ targets: banner, alpha: 0.2, duration: 500, yoyo: true, repeat: -1 });
    }

    this.drawResults();

    const prompt = this.add
      .text(SCREEN.width / 2, 690, 'SPACE to play again    T for title', {
        font: '16px monospace',
        fill: '#aaaaaa',
      })
      .setOrigin(0.5);

    this.tweens.add({ targets: prompt, alpha: 0.3, duration: 900, yoyo: true, repeat: -1 });

    this.input.keyboard.once('keydown-SPACE', () => this.scene.start('GameScene'));
    this.input.keyboard.once('keydown-T', () => this.scene.start('TitleScene'));
  }

  drawResults() {
    const rows = [
      ['SCORE', String(this.finalScore)],
      ['HIGH SCORE', String(this.highScore)],
      ['STAGE REACHED', String(this.stageReached)],
      ['SHOTS FIRED', String(this.stats.shotsFired)],
      ['HITS', String(this.stats.hits)],
      ['HIT-MISS RATIO', formatRatio(this.stats)],
    ];

    rows.forEach(([label, value], index) => {
      const y = 336 + index * 38;

      this.add
        .text(SCREEN.width / 2 - 140, y, label, {
          font: '17px monospace',
          fill: '#8899bb',
        })
        .setOrigin(0, 0.5);

      this.add
        .text(SCREEN.width / 2 + 140, y, value, {
          font: '17px monospace',
          fill: '#ffffff',
        })
        .setOrigin(1, 0.5);
    });
  }
}

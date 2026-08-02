/**
 * The service screen.
 *
 * A real cabinet has a service switch inside the coin door: flip it and the
 * monitor shows the self-test -- RAM OK, ROM OK -- and the current DIP
 * settings, and the operator changes them with the switches themselves. A
 * browser has no coin door, so F2 (the key MAME taught everyone) opens this
 * scene from the title, the switch block is edited with the cursor keys, and
 * every change is written straight back to storage the way flipping a
 * physical switch would be: it survives the reload and it applies to whoever
 * plays next.
 *
 * The sound test is the service screen's other job on the real machine, and
 * it earns its place here: it is the only way to hear the synthesised bank
 * one voice at a time.
 */

import { SCREEN } from '../config.js';
import {
  BONUS_SCHEME_IDS,
  COINAGE_OPTIONS,
  CoinageMode,
  LIVES_OPTIONS,
  bonusSchemeFor,
  loadDips,
  saveDips,
} from '../systems/dips.js';
import { loadRank, saveRank, resolveStorage } from '../systems/persistence.js';
import { RANK_COUNT, RANK_NAMES } from '../systems/stages.js';
import { loadSettings, saveSettings, stepVolume } from '../systems/settings.js';
import { addScanlines } from '../art/crt.js';

const COINAGE_LABELS = {
  [CoinageMode.FREE_PLAY]: 'FREE PLAY',
  [CoinageMode.ONE_COIN_ONE_PLAY]: '1 COIN 1 PLAY',
  [CoinageMode.ONE_COIN_TWO_PLAYS]: '1 COIN 2 PLAYS',
  [CoinageMode.TWO_COINS_ONE_PLAY]: '2 COINS 1 PLAY',
};

/** The voices the sound test steps through, roughly quiet to loud. */
const SOUND_TEST = [
  'coin',
  'fighterShot1',
  'zakoDeath',
  'goeiDeath',
  'bossDeath',
  'enemyDive',
  'beamOpen',
  'captured',
  'rescued',
  'stageFlag',
  'challengeStart',
  'extraLife',
  'gameStart',
  'theme',
];

export class ServiceScene extends Phaser.Scene {
  constructor() {
    super({ key: 'ServiceScene' });
  }

  create() {
    this.storage = resolveStorage(globalThis.localStorage);
    this.dips = loadDips(this.storage);
    this.rank = loadRank(this.storage);
    this.cursor = 0;
    this.soundIndex = 0;

    // The knobs that are not switches: the volume pot and the monitor
    // overlay, both applied live so the operator hears and sees the change
    // from inside the service screen.
    this.settings = loadSettings(this.storage);
    this.sound.volume = this.settings.masterVolume;
    this.scanlineOverlay = this.settings.scanlines ? addScanlines(this, SCREEN) : null;

    this.add
      .text(SCREEN.width / 2, 60, 'SERVICE MODE', { font: '28px monospace', fill: '#ff4444' })
      .setOrigin(0.5);

    // The self-test lines. There is no RAM or ROM to test, but the screen is
    // wrong without them, and "OK" is the truth: if this scene is drawing,
    // the machine works.
    this.add
      .text(SCREEN.width / 2, 110, 'RAM OK        ROM OK', { font: '14px monospace', fill: '#44ff88' })
      .setOrigin(0.5);

    this.rows = [
      { label: 'FIGHTERS', value: () => String(this.dips.lives), change: (d) => this.changeLives(d) },
      { label: 'BONUS FIGHTER', value: () => this.bonusLabel(), change: (d) => this.changeBonus(d) },
      { label: 'COINAGE', value: () => COINAGE_LABELS[this.dips.coinage], change: (d) => this.changeCoinage(d) },
      { label: 'RANK', value: () => RANK_NAMES[this.rank], change: (d) => this.changeRank(d) },
      { label: 'ATTRACT SOUND', value: () => (this.dips.demoSound ? 'ON' : 'OFF'), change: () => this.toggle('demoSound') },
      { label: 'NO-FIRE BUG', value: () => (this.dips.noFireBug ? 'ON' : 'OFF'), change: () => this.toggle('noFireBug') },
      { label: 'VOLUME', value: () => `${Math.round(this.settings.masterVolume * 10)}/10`, change: (d) => this.changeVolume(d) },
      { label: 'SCANLINES', value: () => (this.settings.scanlines ? 'ON' : 'OFF'), change: () => this.toggleScanlines() },
      { label: 'SOUND TEST', value: () => SOUND_TEST[this.soundIndex], change: (d) => this.changeSound(d) },
      { label: 'EXIT', value: () => '', change: () => this.exit() },
    ];

    this.rowTexts = this.rows.map((row, index) => {
      const y = 190 + index * 52;
      const label = this.add.text(SCREEN.width * 0.2, y, row.label, {
        font: '16px monospace',
        fill: '#ffffff',
      });
      const value = this.add.text(SCREEN.width * 0.62, y, row.value(), {
        font: '16px monospace',
        fill: '#ffcc00',
      });
      return { label, value };
    });

    this.add
      .text(SCREEN.width / 2, 190 + this.rows.length * 52 + 60,
        'UP/DOWN select   LEFT/RIGHT change   F2 or EXIT to leave', {
          font: '13px monospace',
          fill: '#667799',
        })
      .setOrigin(0.5);

    this.input.keyboard.on('keydown-UP', () => this.moveCursor(-1));
    this.input.keyboard.on('keydown-DOWN', () => this.moveCursor(1));
    this.input.keyboard.on('keydown-LEFT', () => this.rows[this.cursor].change(-1));
    this.input.keyboard.on('keydown-RIGHT', () => this.rows[this.cursor].change(1));
    this.input.keyboard.on('keydown-ENTER', () => this.rows[this.cursor].change(1));
    this.input.keyboard.on('keydown-F2', () => this.exit());
    this.input.keyboard.on('keydown-ESC', () => this.exit());

    this.redraw();
  }

  bonusLabel() {
    const scheme = bonusSchemeFor(this.dips);
    if (scheme.first === null) return 'NONE';
    const parts = [`${scheme.first / 1000}K`, `${scheme.second / 1000}K`];
    if (scheme.every !== null) parts.push(`EVERY ${scheme.every / 1000}K`);
    return parts.join(' ');
  }

  moveCursor(direction) {
    this.cursor = (this.cursor + direction + this.rows.length) % this.rows.length;
    this.redraw();
  }

  /** Cycle a list field by direction and persist the block. */
  cycle(options, current, direction) {
    const index = Math.max(options.indexOf(current), 0);
    return options[(index + direction + options.length) % options.length];
  }

  changeLives(direction) {
    this.dips = saveDips(this.storage, {
      ...this.dips,
      lives: this.cycle(LIVES_OPTIONS, this.dips.lives, direction),
    });
    this.redraw();
  }

  changeBonus(direction) {
    this.dips = saveDips(this.storage, {
      ...this.dips,
      bonus: this.cycle(BONUS_SCHEME_IDS, this.dips.bonus, direction),
    });
    this.redraw();
  }

  changeCoinage(direction) {
    this.dips = saveDips(this.storage, {
      ...this.dips,
      coinage: this.cycle(COINAGE_OPTIONS, this.dips.coinage, direction),
    });
    this.redraw();
  }

  changeRank(direction) {
    this.rank = saveRank(this.storage, (this.rank + direction + RANK_COUNT) % RANK_COUNT);
    this.redraw();
  }

  toggle(field) {
    this.dips = saveDips(this.storage, { ...this.dips, [field]: !this.dips[field] });
    this.redraw();
  }

  changeVolume(direction) {
    this.settings = saveSettings(this.storage, {
      ...this.settings,
      masterVolume: stepVolume(this.settings.masterVolume, direction),
    });
    this.sound.volume = this.settings.masterVolume;
    // Audition the detent: the coin chime is short and the operator knows it.
    this.sound.play('coin', { volume: 0.5 });
    this.redraw();
  }

  toggleScanlines() {
    this.settings = saveSettings(this.storage, {
      ...this.settings,
      scanlines: !this.settings.scanlines,
    });
    if (this.settings.scanlines && !this.scanlineOverlay) {
      this.scanlineOverlay = addScanlines(this, SCREEN);
    } else if (!this.settings.scanlines && this.scanlineOverlay) {
      this.scanlineOverlay.destroy();
      this.scanlineOverlay = null;
    }
    this.redraw();
  }

  changeSound(direction) {
    this.soundIndex = (this.soundIndex + direction + SOUND_TEST.length) % SOUND_TEST.length;
    this.sound.stopAll();
    this.sound.play(SOUND_TEST[this.soundIndex], { volume: 0.5 });
    this.redraw();
  }

  exit() {
    this.sound.stopAll();
    this.scene.start('TitleScene');
  }

  redraw() {
    this.rows.forEach((row, index) => {
      const selected = index === this.cursor;
      this.rowTexts[index].label.setFill(selected ? '#ffcc00' : '#ffffff');
      this.rowTexts[index].label.setText(`${selected ? '> ' : '  '}${row.label}`);
      this.rowTexts[index].value.setText(row.value());
    });
  }
}

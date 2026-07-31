/**
 * The play scene.
 *
 * This file orchestrates. Every rule it needs, where the formation sits, what a
 * kill is worth, whether this stage is a Challenging Stage, what the capture
 * machine allows next, lives in a pure module under `src/systems` and is unit
 * tested there. What remains here is Phaser: sprites, input, timers, and
 * collision callbacks.
 *
 * That split is deliberate. The version this replaced was a single 867-line
 * class where the same concerns were interleaved, which is how it grew four
 * independent booleans to track one capture sequence and could represent
 * states that should not exist.
 */

import {
  BACKGROUND_SCROLL_PX,
  BACKGROUND_TILE_SCALE,
  CAPTURE,
  DIVE,
  DUAL_FIGHTER_OFFSET_X,
  FORMATION,
  PLAYER,
  SCREEN,
  SPRITE_SCALE,
  CHALLENGING,
} from '../config.js';
import {
  EnemyType,
  buildFormationSlots,
  buildEntryGroups,
  breathScaleAt,
  swayOffsetAt,
  slotWorldPosition,
  clampFormationCentre,
  ENTRY_GROUP_SIZE,
  ENTRY_GROUP_COUNT,
  FORMATION_SIZE,
} from '../systems/formation.js';
import { entryPath, divePath, returnPath, challengingPath } from '../systems/paths.js';
import {
  createFlight,
  advanceFlight,
  isFlightComplete,
  flightProgress,
  flightTransform,
} from '../systems/flight.js';
import {
  scoreFor,
  extraLivesEarned,
  PERFECT_BONUS,
  CAPTURED_FIGHTER_POINTS,
} from '../systems/scoring.js';
import {
  isChallengingStage,
  stageDifficulty,
  stageFlags,
  enemiesFireDuringEntry,
  challengingPatternIndex,
} from '../systems/stages.js';
import {
  CaptureState,
  CaptureEvent,
  RescueOutcome,
  transition,
  resolveCaptorDestroyed,
  isBeamDangerous,
  hasDualFighter,
  bulletLimit,
} from '../systems/capture.js';
import { resolveStorage, loadHighScore, saveHighScore } from '../systems/persistence.js';
import { createStats, recordShot, recordHit } from '../systems/stats.js';
import {
  EnemyMode,
  createEnemy,
  isDiving,
  canBeginDive,
  settleIntoFormation,
} from '../entities/enemy.js';

export class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });
  }

  preload() {
    this.load.image('capturedShip', 'assets/images/capturedShip.png');
    this.load.image('background', 'assets/images/background_tiled_vertical.png');
    this.load.image('player', 'assets/images/mainship.png');
    this.load.image('bullet', 'assets/images/player_laser.png');
    this.load.image('laser', 'assets/images/enemy_laser.png');
    this.load.image('enemyBee', 'assets/images/galaga_enemy_bee.png');
    this.load.image('enemyBossRed', 'assets/images/galaga_enemy_boss_red.png');
    this.load.image('enemyBossPurple', 'assets/images/galaga_enemy_boss_purple.png');
    this.load.image('explosion', 'assets/images/explosion.png');
    this.load.image('tractorBeam', 'assets/images/tractor_beam.png');

    this.load.audio('firing', 'assets/sfx/firing.mp3');
    this.load.audio('beingCaptured', 'assets/sfx/captured.mp3');
    this.load.audio('explosionSound', 'assets/sfx/kill.mp3');
    this.load.audio('bossEntrance', 'assets/sfx/bossEntrance.mp3');
    this.load.audio('beamCapture', 'assets/sfx/beamCapture.mp3');
    this.load.audio('stageClear', 'assets/sfx/challenge_clear.mp3');
    this.load.audio('stageFlag', 'assets/sfx/stage_flag.mp3');
  }

  create() {
    this.storage = resolveStorage(globalThis.localStorage);

    this.score = 0;
    this.highScore = loadHighScore(this.storage);
    this.lives = PLAYER.startingLives;
    this.stage = 1;
    this.stats = createStats();
    this.captureState = CaptureState.IDLE;

    this.isGameOver = false;
    this.isInvulnerable = false;
    this.stageResolving = false;
    this.formationElapsed = 0;
    this.challengingHits = 0;
    this.currentBreath = 1;
    this.currentSway = 0;

    this.createWorld();
    this.createPlayer();
    this.createGroups();
    this.createHud();
    this.createInput();
    this.registerCollisions();

    // Brief grace on the opening spawn so the arriving wave cannot land a hit
    // before the player has had a chance to move.
    this.makeInvulnerable(PLAYER.invulnerableMs);
    this.beginStage(this.stage);
  }

  // ------------------------------------------------------------------ setup

  createWorld() {
    this.background = this.add
      .tileSprite(0, 0, SCREEN.width, SCREEN.height, 'background')
      .setOrigin(0)
      .setScrollFactor(0)
      .setTileScale(BACKGROUND_TILE_SCALE);

    this.sfx = {
      fire: this.sound.add('firing'),
      explosion: this.sound.add('explosionSound'),
      bossEntrance: this.sound.add('bossEntrance'),
      beamCapture: this.sound.add('beamCapture'),
      captured: this.sound.add('beingCaptured'),
      stageClear: this.sound.add('stageClear'),
      stageFlag: this.sound.add('stageFlag'),
    };
  }

  createPlayer() {
    this.player = this.physics.add
      .sprite(SCREEN.width / 2, PLAYER.y, 'player')
      .setScale(PLAYER.scale)
      .setCollideWorldBounds(true);

    this.player.body.setAllowGravity(false);
    this.dualFighter = null;
    this.fireCooldown = 0;
  }

  createGroups() {
    this.enemies = this.physics.add.group();
    this.bullets = this.physics.add.group();
    this.enemyBullets = this.physics.add.group();

    // The dual fighter lives in a group of its own so its collisions can be
    // registered once here, rather than wired up and torn down every time one
    // is earned and lost.
    this.wingman = this.physics.add.group();
  }

  createHud() {
    const label = { font: '18px monospace', fill: '#ffffff' };

    this.scoreText = this.add.text(20, 16, '', label).setDepth(20);
    this.highScoreText = this.add
      .text(SCREEN.width / 2, 16, '', { ...label, fill: '#ffcc00' })
      .setOrigin(0.5, 0)
      .setDepth(20);

    this.bannerText = this.add
      .text(SCREEN.width / 2, SCREEN.height / 2, '', {
        font: '30px monospace',
        fill: '#ffffff',
        align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(30)
      .setVisible(false);

    this.lifeIcons = [];
    this.flagIcons = [];
    this.refreshHud();
  }

  createInput() {
    this.keys = this.input.keyboard.addKeys({
      left: 'A',
      right: 'D',
      altLeft: 'LEFT',
      altRight: 'RIGHT',
      fire: 'SPACE',
    });
  }

  registerCollisions() {
    this.physics.add.overlap(this.bullets, this.enemies, (bullet, enemy) => {
      bullet.destroy();
      this.onEnemyHit(enemy);
    });

    this.physics.add.overlap(this.player, this.enemies, (_player, enemy) => {
      // Challenging Stage enemies fly through without attacking, exactly as
      // they do in the arcade. Their pass crosses the player's lane, so this
      // guard is what keeps the bonus round a bonus.
      if (this.challenging) return;
      if (!this.canBeHurt() || !enemy.active) return;
      this.destroyEnemy(enemy, false);
      this.onPlayerHit();
    });

    this.physics.add.overlap(this.player, this.enemyBullets, (_player, bullet) => {
      if (!this.canBeHurt() || !bullet.active) return;
      bullet.destroy();
      this.onPlayerHit();
    });

    // The second ship is as solid as the first, which is what the doubled
    // firepower is paid for.
    this.physics.add.overlap(this.wingman, this.enemies, (_wingman, enemy) => {
      if (this.challenging) return;
      if (!this.canBeHurt() || !enemy.active) return;
      this.destroyEnemy(enemy, false);
      this.onPlayerHit();
    });

    this.physics.add.overlap(this.wingman, this.enemyBullets, (_wingman, bullet) => {
      if (!this.canBeHurt() || !bullet.active) return;
      bullet.destroy();
      this.onPlayerHit();
    });
  }

  // ----------------------------------------------------------------- stages

  beginStage(stage) {
    // Cancel any stage advance still pending, so two stages can never be
    // started from one clear.
    this.stageAdvanceTimer?.remove();
    this.stageAdvanceTimer = null;

    this.stageResolving = false;
    this.formationElapsed = 0;
    this.challengingHits = 0;
    this.difficulty = stageDifficulty(stage);
    this.challenging = isChallengingStage(stage);

    // A docked dual fighter carries over into the next stage; anything else
    // mid-sequence does not. Clearing the state but leaving the second ship on
    // screen would have left it firing two shots against a two-shot limit and
    // no longer able to absorb a hit.
    if (!hasDualFighter(this.captureState)) {
      this.captureState = transition(this.captureState, CaptureEvent.RESET);
      this.clearDualFighter();
    }

    this.captor = null;
    this.clearCaptive();
    this.clearBeam();
    this.clearTimers();

    this.showBanner(this.challenging ? 'CHALLENGING STAGE' : `STAGE ${stage}`, 1800);
    this.sfx.stageFlag.play({ volume: 0.4 });
    this.refreshHud();

    this.time.delayedCall(1800, () => {
      if (this.isGameOver) return;
      if (this.challenging) {
        this.launchChallengingStage();
      } else {
        this.launchFormation();
      }
    });
  }

  /**
   * Bring the wave on as five flights of eight.
   *
   * Everyone in a flight follows the same curve, launching one behind another,
   * so the group arrives single file and peels off into its slots at the end.
   * The flight that follows only sets off once this one is most of the way
   * home, which is what keeps two different curves off the screen at once.
   *
   * All forty sprites are created up front, parked at their curve's off-screen
   * start, and only their flights are staggered. That matters: the stage is
   * considered clear when no enemy is left alive, so an enemy waiting to
   * launch has to already exist.
   */
  launchFormation() {
    // Round 1 holds fire through the whole assembly; from round 2 the arriving
    // wave bombs on its way in.
    const entryFire = enemiesFireDuringEntry(this.stage);
    const slots = buildFormationSlots();

    buildEntryGroups().forEach((group) => {
      const groupDelay = group.index * FORMATION.groupIntervalMs;

      group.slotIndices.forEach((slotIndex, position) => {
        const slot = slots[slotIndex];
        const start = entryPath(group.pathVariant, this.slotPosition(slot), SCREEN)[0][0];
        const enemy = createEnemy(this, this.enemies, slot, start);
        enemy.willBomb = entryFire && Math.random() < 0.25;

        this.time.delayedCall(groupDelay + position * FORMATION.entryStaggerMs, () => {
          if (!enemy.active) return;
          // Built at launch, not at spawn: the last flight sets off ten
          // seconds after the first, by which time the formation has breathed
          // and swayed away from where its slots were.
          enemy.flight = createFlight(
            entryPath(group.pathVariant, this.slotPosition(slot), SCREEN),
            FORMATION.entryDurationMs,
          );
        });
      });
    });

    this.scheduleCaptureAttempts();

    // The arcade lets the wave finish arriving before anything attacks, so the
    // entry choreography is never cut across by a dive.
    this.assemblyTimer = this.time.delayedCall(this.assemblyDurationMs(), () => {
      this.assemblyTimer = null;
      if (this.isGameOver || this.stageResolving) return;
      this.scheduleDives();
    });
  }

  /** How long the whole wave takes, from the first launch to the last dock. */
  assemblyDurationMs() {
    return (
      (ENTRY_GROUP_COUNT - 1) * FORMATION.groupIntervalMs +
      (ENTRY_GROUP_SIZE - 1) * FORMATION.entryStaggerMs +
      FORMATION.entryDurationMs
    );
  }

  /**
   * Challenging Stage: forty enemies fly through and never fire or dive.
   * Clearing all of them pays the perfect bonus.
   */
  launchChallengingStage() {
    const pattern = challengingPatternIndex(this.stage) ?? 0;

    buildFormationSlots().forEach((slot, index) => {
      const path = challengingPath(pattern, index, SCREEN);
      const enemy = createEnemy(this, this.enemies, slot, path[0][0]);
      enemy.mode = EnemyMode.PASSING;

      this.time.delayedCall(index * CHALLENGING.staggerMs, () => {
        if (!enemy.active) return;
        enemy.flight = createFlight(path, CHALLENGING.passDurationMs);
      });
    });
  }

  completeStage() {
    if (this.stageResolving) return;
    this.stageResolving = true;
    this.clearTimers();

    if (this.challenging) {
      const perfect = this.challengingHits === FORMATION_SIZE;
      this.sfx.stageClear.play({ volume: 0.5 });
      if (perfect) {
        this.addScore(PERFECT_BONUS);
        this.showBanner(`PERFECT\n${PERFECT_BONUS}`, 2200);
      } else {
        this.showBanner(`HITS ${this.challengingHits} / ${FORMATION_SIZE}`, 2200);
      }
    }

    this.stageAdvanceTimer = this.time.delayedCall(this.challenging ? 2400 : 1200, () => {
      this.stageAdvanceTimer = null;
      if (this.isGameOver) return;
      this.stage += 1;
      this.beginStage(this.stage);
    });
  }

  // ---------------------------------------------------------------- attacks

  scheduleDives() {
    this.diveTimer = this.time.addEvent({
      delay: this.difficulty.diveIntervalMs,
      loop: true,
      callback: () => this.launchDive(),
    });
  }

  scheduleCaptureAttempts() {
    this.captureTimer = this.time.addEvent({
      delay: CAPTURE.attemptIntervalMs,
      loop: true,
      callback: () => this.attemptCapture(),
    });
  }

  /**
   * True when no beam or capture animation is occupying the board.
   *
   * HELD counts as free. A ship can be held above its captor for the rest of
   * the stage, and treating that as busy would stop every dive until the
   * player shot the captor down.
   */
  captureIsIdle() {
    return (
      this.captureState === CaptureState.IDLE ||
      this.captureState === CaptureState.DUAL ||
      this.captureState === CaptureState.HELD
    );
  }

  launchDive() {
    if (this.isGameOver || this.challenging || !this.captureIsIdle()) return;

    const diving = this.enemies.getChildren().filter(isDiving).length;
    if (diving >= this.difficulty.maxSimultaneousDivers) return;

    const eligible = this.enemies.getChildren().filter(canBeginDive);
    if (eligible.length === 0) return;

    // A boss holding a captured fighter has to actually leave formation for
    // the rescue to be possible at all, so it is weighted to lead the dive
    // rather than waiting for a one-in-forty draw.
    const captorLeads =
      this.captor?.captiveAttached === true &&
      canBeginDive(this.captor) &&
      Math.random() < CAPTURE.captorDiveChance;

    const leader = captorLeads ? this.captor : Phaser.Utils.Array.GetRandom(eligible);
    const attackers = [leader];

    // A Boss Galaga may bring Goei escorts, which is what makes it worth up to
    // 1600 rather than 400.
    if (leader.enemyType === EnemyType.BOSS && Math.random() < this.difficulty.escortChance) {
      const escorts = eligible
        .filter((enemy) => enemy !== leader && enemy.enemyType === EnemyType.GOEI)
        .slice(0, 2);
      attackers.push(...escorts);
    }

    leader.escortCount = attackers.length - 1;
    attackers.forEach((enemy, index) => {
      this.time.delayedCall(index * 140, () => this.beginDive(enemy));
    });
  }

  beginDive(enemy) {
    if (!canBeginDive(enemy)) return;
    enemy.mode = EnemyMode.DIVING;
    enemy.hasBombed = false;
    enemy.willBomb = Math.random() < DIVE.bombChance;
    enemy.flight = createFlight(
      divePath({ x: enemy.x, y: enemy.y }, this.player.x, SCREEN),
      DIVE.durationMs / this.difficulty.diveSpeed,
    );
  }

  attemptCapture() {
    if (this.isGameOver || this.challenging || !this.captureIsIdle()) return;
    if (!this.player.active) return;

    const bosses = this.enemies
      .getChildren()
      .filter((enemy) => enemy.enemyType === EnemyType.BOSS && canBeginDive(enemy));
    if (bosses.length === 0) return;

    const boss = Phaser.Utils.Array.GetRandom(bosses);
    this.captureState = transition(this.captureState, CaptureEvent.DEPLOY_BEAM);
    if (this.captureState !== CaptureState.BEAM_OPENING) return;

    boss.mode = EnemyMode.DIVING;
    this.captor = boss;
    this.sfx.bossEntrance.play({ volume: 0.5 });

    // Straight down, well past the rest of the formation and into the player's
    // half of the field, then open the beam. The descent is the tell: it is a
    // markedly different move from the one-loop dive every other attacker
    // makes, and it is the player's warning to get out of that column.
    this.tweens.add({
      targets: boss,
      y: CAPTURE.descendToY,
      duration: CAPTURE.descendDurationMs,
      ease: 'Sine.easeInOut',
      onComplete: () => this.openBeam(boss),
    });
  }

  openBeam(boss) {
    if (!boss.active || this.isGameOver) {
      this.captureState = transition(this.captureState, CaptureEvent.RESET);
      return;
    }

    this.sfx.beamCapture.play({ volume: 0.5 });
    this.beam = this.add
      .image(boss.x, boss.y + CAPTURE.beamOffsetY, 'tractorBeam')
      .setOrigin(0.5, 0)
      .setDisplaySize(CAPTURE.beamWidth * 1.4, CAPTURE.beamLength)
      .setAlpha(0)
      .setDepth(5);

    this.tweens.add({
      targets: this.beam,
      alpha: 0.85,
      duration: CAPTURE.beamOpenMs,
      onComplete: () => {
        if (this.captureState === CaptureState.BEAM_OPENING) {
          this.captureState = CaptureState.BEAM_ACTIVE;
        }
      },
    });

    this.time.delayedCall(CAPTURE.beamOpenMs + CAPTURE.beamHoldMs, () => this.closeBeam());
  }

  closeBeam() {
    if (!isBeamDangerous(this.captureState)) return;
    this.captureState = transition(this.captureState, CaptureEvent.BEAM_TIMEOUT);
    this.clearBeam();

    const boss = this.captor;
    this.captor = null;
    this.sendCaptorHome(boss);
  }

  clearBeam() {
    if (this.beam) {
      this.beam.destroy();
      this.beam = null;
    }
  }

  /**
   * Fly a boss back to its slot from wherever it stopped.
   *
   * A boss that has deployed a beam is halted low on the field, so it climbs
   * back from there. Handing it `returnPath`, the way a finished diver is
   * handled, would snap it off the top of the screen first, because that path
   * starts above the ceiling.
   */
  sendCaptorHome(boss) {
    if (!boss || !boss.active) return;

    const target = this.slotPosition(boss.slot);
    boss.mode = EnemyMode.RETURNING;

    this.tweens.add({
      targets: boss,
      x: target.x,
      y: target.y,
      duration: DIVE.returnDurationMs,
      ease: 'Sine.easeInOut',
      onComplete: () => settleIntoFormation(boss, this.slotPosition(boss.slot)),
    });
  }

  capturePlayer() {
    this.captureState = transition(this.captureState, CaptureEvent.PLAYER_CAUGHT);
    if (this.captureState !== CaptureState.CAPTURING) return;

    this.sfx.captured.play({ volume: 0.6 });
    this.player.disableBody(true, false);
    this.clearBeam();

    // A dual fighter caught in a beam loses its second ship rather than
    // carrying it up to the boss.
    this.clearDualFighter();

    const boss = this.captor;
    this.tweens.add({
      targets: this.player,
      x: boss ? boss.x : this.player.x,
      y: boss ? boss.y + CAPTURE.captiveOffsetY : 0,
      angle: 360,
      duration: CAPTURE.captureRiseMs,
      onComplete: () => this.onCaptureComplete(),
    });
  }

  onCaptureComplete() {
    this.player.setVisible(false);
    this.player.setAngle(0);
    this.captureState = transition(this.captureState, CaptureEvent.CAPTURE_COMPLETE);
    this.showBanner('FIGHTER CAPTURED', 1400);

    const boss = this.captor;
    if (boss && boss.active) {
      this.captive = this.add
        .image(boss.x, boss.y + CAPTURE.captiveOffsetY, 'capturedShip')
        .setScale(PLAYER.scale)
        .setDepth(6);
      boss.captiveAttached = true;

      // The captor rejoins the formation with its prize in tow, so the player
      // can hunt it down. `this.captor` stays set: the held ship is drawn
      // against it every frame from here until one of them is destroyed.
      this.sendCaptorHome(boss);
    }

    this.loseLife();
  }

  /** Keep a held fighter pinned beneath the boss carrying it. */
  updateCaptive() {
    if (!this.captive) return;
    if (this.captor && this.captor.active) {
      this.captive.setPosition(this.captor.x, this.captor.y + CAPTURE.captiveOffsetY);
    }
  }

  clearCaptive() {
    if (this.captive) {
      this.captive.destroy();
      this.captive = null;
    }
  }

  clearDualFighter() {
    if (this.dualFighter) {
      this.dualFighter.destroy();
      this.dualFighter = null;
    }
  }

  rescueCaptive() {
    this.captureState = transition(this.captureState, CaptureEvent.CAPTOR_DESTROYED);
    if (this.captureState !== CaptureState.RETURNING) return;

    if (!this.captive) {
      this.captureState = transition(this.captureState, CaptureEvent.DOCK_COMPLETE);
      return;
    }

    this.tweens.add({
      targets: this.captive,
      x: this.player.x + DUAL_FIGHTER_OFFSET_X,
      y: this.player.y,
      duration: CAPTURE.dockDurationMs,
      ease: 'Sine.easeInOut',
      onComplete: () => this.dockCaptive(),
    });
  }

  dockCaptive() {
    this.clearCaptive();
    this.captureState = transition(this.captureState, CaptureEvent.DOCK_COMPLETE);

    // The rescued ship can be a second or so in the air, and the player can be
    // killed by something else while it is. That death resets the machine, so
    // the dock no longer lands in DUAL and there is nothing to dock onto:
    // building the sprite anyway left a wingman flying beside a dead player
    // that fired nothing and absorbed nothing.
    if (!hasDualFighter(this.captureState)) return;

    // Created in the wingman group so it carries a body of its own. Twice the
    // firepower for twice the width to be hit across is the whole trade; an
    // image with no body would have made the upgrade free.
    this.dualFighter = this.wingman
      .create(this.player.x + DUAL_FIGHTER_OFFSET_X, this.player.y, 'player')
      .setScale(PLAYER.scale)
      .setDepth(4);
    this.dualFighter.body.setAllowGravity(false);
    this.dualFighter.body.setImmovable(true);

    this.showBanner('DUAL FIGHTER', 1200);
  }

  // ----------------------------------------------------------------- combat

  onEnemyHit(enemy) {
    if (!enemy.active) return;

    this.stats = recordHit(this.stats);

    if (this.challenging) {
      this.challengingHits += 1;
      this.addScore(scoreFor(enemy.enemyType, { challenging: true }));
      this.destroyEnemy(enemy, true);
      return;
    }

    enemy.health -= 1;

    // A Boss Galaga survives its first hit and changes colour to show it.
    if (enemy.health > 0) {
      enemy.setTint(0x4488ff);
      return;
    }

    this.addScore(
      scoreFor(enemy.enemyType, {
        diving: isDiving(enemy),
        escorts: enemy.escortCount ?? 0,
      }),
    );

    // Galaga's rescue rule: the ship only comes back if its captor is shot
    // down on a dive. Read the mode before the sprite is destroyed, and let
    // the pure rule decide, so "diving or not" is the only thing the scene
    // contributes.
    const outcome =
      enemy.captiveAttached === true
        ? resolveCaptorDestroyed(this.captureState, isDiving(enemy))
        : RescueOutcome.NONE;

    this.destroyEnemy(enemy, true);

    if (outcome === RescueOutcome.RESCUED) {
      this.addScore(CAPTURED_FIGHTER_POINTS);
      this.rescueCaptive();
    } else if (outcome === RescueOutcome.CAPTIVE_LOST) {
      this.loseCaptive();
    }
  }

  /**
   * The captor died in formation, so the ship it was holding goes with it.
   *
   * In the arcade the freed captive turns on the player, dives, and leaves off
   * the bottom of the screen. It falls away here rather than attacking, which
   * keeps the outcome unmistakable without giving the captive a whole attack
   * behaviour of its own.
   */
  loseCaptive() {
    this.captureState = transition(this.captureState, CaptureEvent.CAPTIVE_DESTROYED);
    if (!this.captive) return;

    this.showBanner('FIGHTER LOST', 1400);
    this.tweens.add({
      targets: this.captive,
      y: SCREEN.height + 80,
      angle: 180,
      duration: CAPTURE.captiveEscapeMs,
      ease: 'Sine.easeIn',
      onComplete: () => this.clearCaptive(),
    });
  }

  destroyEnemy(enemy, withExplosion) {
    if (withExplosion) {
      const burst = this.add
        .sprite(enemy.x, enemy.y, 'explosion')
        .setScale(
          enemy.enemyType === EnemyType.BOSS
            ? SPRITE_SCALE.bossExplosion
            : SPRITE_SCALE.explosion,
        );
      this.time.delayedCall(220, () => burst.destroy());
      this.sfx.explosion.play({ volume: 0.4 });
    }

    if (enemy === this.captor) {
      this.captor = null;
      this.clearBeam();
    }

    enemy.destroy();
  }

  onPlayerHit() {
    // The dual fighter absorbs a hit by reverting to a single ship.
    if (hasDualFighter(this.captureState)) {
      this.captureState = transition(this.captureState, CaptureEvent.DUAL_HIT);
      this.clearDualFighter();
      this.makeInvulnerable(1000);
      return;
    }

    this.sfx.explosion.play({ volume: 0.5 });
    const burst = this.add
      .sprite(this.player.x, this.player.y, 'explosion')
      .setScale(SPRITE_SCALE.playerExplosion);
    this.time.delayedCall(320, () => burst.destroy());

    this.player.disableBody(true, false);
    this.player.setVisible(false);
    this.loseLife();
  }

  loseLife() {
    this.lives -= 1;
    this.refreshHud();

    if (this.lives <= 0) {
      this.endGame();
      return;
    }

    this.time.delayedCall(PLAYER.respawnDelayMs, () => {
      if (this.isGameOver) return;
      this.respawnPlayer();
    });
  }

  respawnPlayer() {
    // A ship taken before this death is still held above its captor, and the
    // machine has to stay in HELD for shooting that captor down to rescue it.
    // Resetting here unconditionally is what made the dual fighter, and with
    // it the whole point of the capture, unreachable: the held ship was left
    // stranded on screen with no state left that could bring it back.
    if (this.captureState !== CaptureState.HELD) {
      this.captureState = transition(this.captureState, CaptureEvent.RESET);
      // The reset drops DUAL, so the second ship goes with it. Leaving the
      // sprite behind would have flown a wingman that no longer doubled the
      // bullet limit and no longer absorbed a hit.
      this.clearDualFighter();
    }
    this.clearBeam();

    this.player.enableBody(true, SCREEN.width / 2, PLAYER.y, true, true);
    this.player.setAngle(0);
    this.makeInvulnerable(PLAYER.invulnerableMs);
  }

  makeInvulnerable(durationMs) {
    this.isInvulnerable = true;
    this.tweens.add({
      targets: this.player,
      alpha: 0.25,
      yoyo: true,
      repeat: Math.max(Math.floor(durationMs / 200) - 1, 0),
      duration: 100,
      onComplete: () => {
        this.player.setAlpha(1);
        this.isInvulnerable = false;
      },
    });
  }

  canBeHurt() {
    return this.player.active && !this.isInvulnerable && !this.isGameOver;
  }

  endGame() {
    this.isGameOver = true;
    this.clearTimers();

    this.time.delayedCall(1200, () => {
      // Saved here rather than the moment the last life goes: bullets already
      // in the air still land during the pause, and banking the score early
      // left the results screen showing a score above its own high score.
      this.highScore = saveHighScore(this.storage, this.score);

      this.scene.start('GameOverScene', {
        score: this.score,
        highScore: this.highScore,
        stage: this.stage,
        stats: this.stats,
      });
    });
  }

  // ----------------------------------------------------------------- update

  update(_time, delta) {
    if (this.isGameOver) return;

    this.background.tilePositionY -= BACKGROUND_SCROLL_PX.game / BACKGROUND_TILE_SCALE;
    this.formationElapsed += delta;

    this.updateFormation(delta);
    this.updatePlayer(delta);
    this.updateCaptive();
    this.updateBeam(delta);
    this.cullProjectiles();
    this.checkStageComplete();
  }

  updateFormation(delta) {
    this.currentBreath = breathScaleAt(this.formationElapsed, {
      periodMs: FORMATION.breathPeriodMs,
      amplitude: FORMATION.breathAmplitude,
    });
    this.currentSway = swayOffsetAt(this.formationElapsed, {
      periodMs: FORMATION.swayPeriodMs,
      amplitude: FORMATION.swayAmplitude,
    });

    this.enemies.getChildren().forEach((enemy) => {
      if (!enemy.active) return;

      if (enemy.flight) {
        this.advanceEnemyFlight(enemy, delta);
        return;
      }

      if (enemy.mode === EnemyMode.IN_FORMATION) {
        const position = this.slotPosition(enemy.slot);
        enemy.setPosition(position.x, position.y);
      }
    });
  }

  advanceEnemyFlight(enemy, delta) {
    enemy.flight = advanceFlight(enemy.flight, delta);
    const { x, y, angle } = flightTransform(enemy.flight);
    enemy.setPosition(x, y);
    enemy.setRotation(angle);

    // Bomb at a fixed point of the run rather than on a per-frame roll, so an
    // attacker always releases at the same moment regardless of frame rate.
    // Whether it bombs at all is decided once, when the run begins.
    const bombing = enemy.mode === EnemyMode.DIVING || enemy.mode === EnemyMode.ENTERING;
    if (bombing && !enemy.hasBombed && flightProgress(enemy.flight) >= 0.3) {
      enemy.hasBombed = true;
      if (enemy.willBomb) this.fireEnemyBullet(enemy);
    }

    if (!isFlightComplete(enemy.flight)) return;

    switch (enemy.mode) {
      case EnemyMode.ENTERING:
      case EnemyMode.RETURNING:
        settleIntoFormation(enemy, this.slotPosition(enemy.slot));
        break;

      case EnemyMode.DIVING:
        // Flew off the bottom; come back in from the top.
        enemy.mode = EnemyMode.RETURNING;
        enemy.flight = createFlight(
          returnPath(this.slotPosition(enemy.slot), SCREEN),
          DIVE.returnDurationMs,
        );
        break;

      case EnemyMode.PASSING:
        // Challenging-stage enemies leave for good.
        enemy.destroy();
        break;

      default:
        enemy.flight = null;
    }
  }

  fireEnemyBullet(enemy) {
    const bullet = this.enemyBullets
      .create(enemy.x, enemy.y + 18, 'laser')
      .setScale(SPRITE_SCALE.laser);
    bullet.body.setAllowGravity(false);

    const angle = Math.atan2(this.player.y - enemy.y, this.player.x - enemy.x);
    bullet.setVelocity(Math.cos(angle) * DIVE.bombSpeed, Math.sin(angle) * DIVE.bombSpeed);
  }

  updatePlayer(delta) {
    if (!this.player.active) return;

    const left = this.keys.left.isDown || this.keys.altLeft.isDown;
    const right = this.keys.right.isDown || this.keys.altRight.isDown;
    this.player.setVelocityX(((right ? 1 : 0) - (left ? 1 : 0)) * PLAYER.speed);

    if (this.dualFighter) {
      this.dualFighter.setPosition(this.player.x + DUAL_FIGHTER_OFFSET_X, this.player.y);
    }

    this.fireCooldown = Math.max(this.fireCooldown - delta, 0);
    if (Phaser.Input.Keyboard.JustDown(this.keys.fire)) this.fire();
  }

  /**
   * Galaga's two-bullet limit, doubled while the dual fighter is docked. It is
   * the central constraint of the game: it makes the hit-miss ratio meaningful
   * and stops the player from holding down fire.
   */
  fire() {
    if (this.fireCooldown > 0) return;
    if (this.bullets.countActive(true) >= bulletLimit(this.captureState)) return;

    this.spawnBullet(this.player.x);
    let shots = 1;

    if (this.dualFighter) {
      this.spawnBullet(this.dualFighter.x);
      shots = 2;
    }

    this.stats = recordShot(this.stats, shots);
    this.fireCooldown = PLAYER.fireCooldownMs;
    this.sfx.fire.play({ volume: 0.3 });
  }

  spawnBullet(x) {
    const bullet = this.bullets
      .create(x, this.player.y - 26, 'bullet')
      .setScale(SPRITE_SCALE.bullet);
    bullet.body.setAllowGravity(false);
    bullet.setVelocityY(-PLAYER.bulletSpeed);
  }

  updateBeam(delta) {
    if (!this.beam || !this.captor || !this.captor.active) return;

    this.beam.setPosition(this.captor.x, this.captor.y + CAPTURE.beamOffsetY);
    if (!isBeamDangerous(this.captureState) || !this.canBeHurt()) return;

    // Inside the beam column: drag the player toward its centre, and capture
    // once they have been pulled far enough up it.
    const withinX = Math.abs(this.player.x - this.beam.x) < CAPTURE.beamWidth / 2;
    const withinY =
      this.player.y > this.beam.y && this.player.y < this.beam.y + CAPTURE.beamLength;
    if (!withinX || !withinY) return;

    const pull = this.beam.x - this.player.x;
    this.player.x += Math.sign(pull) * Math.min(Math.abs(pull), 2);
    this.player.y -= CAPTURE.pullStrength * (delta / 1000);

    if (this.player.y < this.beam.y + CAPTURE.captureDepth) this.capturePlayer();
  }

  cullProjectiles() {
    this.bullets.getChildren().forEach((bullet) => {
      if (bullet.active && bullet.y < -20) bullet.destroy();
    });

    this.enemyBullets.getChildren().forEach((bullet) => {
      if (!bullet.active) return;
      const offScreen =
        bullet.y > SCREEN.height + 20 || bullet.x < -20 || bullet.x > SCREEN.width + 20;
      if (offScreen) bullet.destroy();
    });
  }

  checkStageComplete() {
    if (this.stageResolving || this.enemies.countActive(true) > 0) return;
    // Enemies launch on a stagger, so an empty group during the launch window
    // is not a cleared stage.
    if (this.formationElapsed < 2000) return;
    this.completeStage();
  }

  // ---------------------------------------------------------------- helpers

  slotPosition(slot) {
    const centreX = clampFormationCentre(SCREEN.width / 2, SCREEN.width, {
      spacingX: FORMATION.spacingX,
      breathScale: this.currentBreath,
      margin: FORMATION.margin,
    });

    return slotWorldPosition(slot, {
      centreX,
      topY: FORMATION.topY,
      spacingX: FORMATION.spacingX,
      spacingY: FORMATION.spacingY,
      breathScale: this.currentBreath,
      swayX: this.currentSway,
    });
  }

  addScore(points) {
    const previous = this.score;
    this.score += points;

    const earned = extraLivesEarned(previous, this.score);
    if (earned > 0) {
      this.lives += earned;
      this.showBanner('EXTRA LIFE', 900);
    }

    if (this.score > this.highScore) this.highScore = this.score;
    this.refreshHud();
  }

  showBanner(text, durationMs) {
    this.bannerText.setText(text).setVisible(true);
    this.time.delayedCall(durationMs, () => this.bannerText.setVisible(false));
  }

  refreshHud() {
    this.scoreText.setText(`SCORE ${this.score}`);
    this.highScoreText.setText(`HIGH ${this.highScore}`);
    this.drawLives();
    this.drawFlags();
  }

  drawLives() {
    this.lifeIcons.forEach((icon) => icon.destroy());
    this.lifeIcons = [];

    // Spaced wider than the icons are drawn, so a row of spare ships reads as
    // separate ships rather than one smear.
    for (let i = 0; i < Math.max(this.lives - 1, 0); i += 1) {
      this.lifeIcons.push(
        this.add
          .image(16 + i * 32, SCREEN.height - 14, 'player')
          .setOrigin(0, 1)
          .setScale(SPRITE_SCALE.lifeIcon)
          .setDepth(20),
      );
    }
  }

  drawFlags() {
    this.flagIcons.forEach((icon) => icon.destroy());
    this.flagIcons = [];

    let x = SCREEN.width - 20;
    for (const flag of stageFlags(this.stage)) {
      for (let i = 0; i < flag.count; i += 1) {
        this.flagIcons.push(
          this.add
            .text(x, SCREEN.height - 24, String(flag.value), {
              font: '13px monospace',
              fill: flag.value >= 30 ? '#ffcc00' : '#66ddff',
            })
            .setOrigin(1, 0.5)
            .setDepth(20),
        );
        x -= 26;
      }
    }
  }

  clearTimers() {
    this.assemblyTimer?.remove();
    this.assemblyTimer = null;
    this.diveTimer?.remove();
    this.diveTimer = null;
    this.captureTimer?.remove();
    this.captureTimer = null;
  }
}

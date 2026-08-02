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
  CAPTURE,
  DIVE,
  DUAL_FIGHTER_OFFSET_X,
  FORMATION,
  LIFE_ICONS_SHOWN,
  PLAYER,
  SCREEN,
  SHIP_ART,
  SHIP_DRAWN_PX,
  SPRITE_SCALE,
  SPRITE_SOURCE_PX,
  ANIMATION,
  FLAG_ART,
} from '../config.js';
import {
  flapFrameAt,
  quantizeHeading,
  explosionFrameAt,
  spinAngleAt,
} from '../systems/animation.js';
import { beamStripsAt } from '../systems/beam.js';
import { EXPLOSION_SPRITES, frameCount } from '../art/pixelArt.js';
import {
  EnemyType,
  buildFormationSlots,
  slotWorldPosition,
  slotIndexForObjectId,
  slotMotionOffset,
  createFormationMotion,
  advanceFormationMotion,
  FORMATION_SIZE,
} from '../systems/formation.js';
import {
  compileStageStream,
  createWaveLauncher,
  stepWaveLauncher,
  decodeLaunch,
  caravanHeaderFor,
} from '../systems/caravans.js';
import {
  returnPath,
  entrySpawnPoint,
  createEntryFlightState,
  createDiveFlightState,
  createCarryHomeFlightState,
  createConvoyLeaderFlightState,
} from '../systems/paths.js';
import {
  createFlight,
  advanceFlight,
  isFlightComplete,
  flightTransform,
  createLiveFlight,
  advanceLiveFlight,
  liveFlightTransform,
  isLiveFlight,
  isLiveFlightDone,
  liveFlightHomed,
} from '../systems/flight.js';
import {
  BOMB_ARM_FRAMES,
  BOMB_DROP_MIN_Y,
  BOMB_FALL_PER_FRAME,
  BOMB_SPACING_FRAMES,
  BONUS_BEE_FLASH_FRAMES,
  BONUS_BEE_FLASH_PERIOD_FRAMES,
  advanceNoFire,
  advanceScheduler,
  bombAimVx,
  bonusBeeFlashOn,
  bonusBeeGateOpen,
  createAttackScheduler,
  createNoFireState,
  nextBombDrop,
} from '../systems/attack.js';
import { FRAME_MS, PATHCODE_FPS, angleToRadians } from '../systems/pathcode.js';
import { DIP_DEFAULTS, bonusSchemeFor, loadDips } from '../systems/dips.js';
import {
  STARFIELD_SCROLL,
  advanceStarfield,
  createStarfield,
  setStarfieldScroll,
  visibleStars,
} from '../systems/starfield.js';
import {
  scoreFor,
  extraLivesEarned,
  PERFECT_BONUS,
  CAPTURED_FIGHTER_POINTS,
  transformKillPoints,
  TRANSFORM_SET_SIZE,
  CHALLENGING_STAGE_HIT_POINTS,
} from '../systems/scoring.js';
import {
  isChallengingStage,
  stageDifficulty,
  stageFlags,
  enemiesBomb,
  transformTypeFor,
  RANK_NAMES,
  nextStage,
} from '../systems/stages.js';
import {
  createSession,
  activePlayer,
  withActive,
  loseShip,
  playerLabel,
} from '../systems/players.js';
import { demoInput, DEMO_DURATION_MS } from '../systems/demo.js';
import { isTap, mergeHeld, padHeld, touchSteer } from '../systems/controls.js';
import { applyCabinet } from '../art/crt.js';
import {
  CaptureState,
  CaptureEvent,
  RescueOutcome,
  transition,
  resolveCaptorDestroyed,
  isBeamDangerous,
  hasDualFighter,
  bulletLimit,
  beamTimings,
  beamCatches,
  createPull,
  advancePull,
  BEAM_STRIPS,
  BEAM_CATCH_HALF_WIDTH,
  PULL_SPIN_STEP,
  SETTLE_FRAMES,
} from '../systems/capture.js';
import { resolveStorage, loadScoreTable, loadRank } from '../systems/persistence.js';
import {
  createExplosionTextures,
  createFlagTextures,
  createShipTextures,
  createTransformTextures,
  explosionTextureKey,
  flagTextureKey,
  shipTextureKey,
  transformTextureKey,
  FLAG_DRAWN_WIDTH,
} from '../art/textures.js';
import { applyShipArt, localArtFrames, queueLocalArt } from '../art/localArt.js';
import { arcadeText, installArcadeFont } from '../art/font.js';
import { installSoundBank } from '../audio/soundBank.js';
import { queueLocalAudio } from '../audio/localAudio.js';
import { recordShot, recordHit } from '../systems/stats.js';
import {
  challengeResultSound,
  channelledSoundBank,
  deathSoundFor,
  playerShotSound,
} from '../systems/audio.js';
import {
  EnemyMode,
  createEnemy,
  createTransientEnemy,
  isDiving,
  canBeginDive,
  settleIntoFormation,
  showBossDamage,
  createTransformEnemy,
} from '../entities/enemy.js';

/**
 * ROM canvas (224 x 288) to this screen: the x3 scale adapter. Bomb gates
 * and speeds are ROM-denominated in `attack.js` and converted here.
 */
const ROM_TO_SCREEN = SCREEN.height / 288;

/**
 * Stage-band transform types onto the convoy's colour indices -- the
 * `d_1B5F` order: colour 0 flies `db_04EA` (Scorpion band), 1 `db_0473`
 * (Spy Ship), 2 `db_04AB` (Flagship).
 */
const TRANSFORM_COLOURS = { scorpion: 0, spyShip: 1, flagship: 2 };

export class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });
  }

  preload() {
    // Only the projectiles and the two effects are loaded. Every ship in the
    // game is generated from the pixel grids in `src/art` (see
    // `createShipTextures`), and the starfield is generated by
    // `src/systems/starfield.js` rather than drawn.
    this.load.image('bullet', 'assets/images/player_laser.png');
    this.load.image('laser', 'assets/images/enemy_laser.png');

    // A local checkout may keep its own ship artwork; see `src/art/localArt.js`.
    // Absent, this is one 404 and the drawn ships are used.
    queueLocalArt(this);

    // The same arrangement for audio, and the only thing loaded for it. Every
    // sound is synthesised in `create`; this probe is the one way the cabinet's
    // own samples can get in, and only on a machine that already has them.
    queueLocalAudio(this);
  }

  /**
   * How this game was started.
   *
   * Three things arrive from outside: how many players pressed start, whether
   * this is the attract screen playing itself, and the operator's difficulty
   * rank. All three have defaults, so `scene.start('GameScene')` with nothing
   * at all is a one-player game at the factory rank -- which is what the
   * results screen's "play again" does.
   */
  init(data) {
    this.demo = data?.demo === true;
    this.storage = resolveStorage(globalThis.localStorage);
    // The demo is not a game the operator's settings apply to: it is the
    // machine showing what the game looks like, and it should look like the one
    // a new player would get.
    this.rank = this.demo ? 0 : loadRank(this.storage);

    // The operator's switch block decides how many fighters a credit buys
    // and which bonus scheme pays. A demo plays the factory machine.
    this.dips = this.demo ? { ...DIP_DEFAULTS } : loadDips(this.storage);
    this.bonusScheme = bonusSchemeFor(this.dips);

    this.session = createSession({
      playerCount: this.demo ? 1 : (data?.playerCount ?? 1),
      startingLives: this.dips.lives,
    });

    // The no-fire bug, if the operator has switched it on. Once triggered it
    // holds until the "machine" is power cycled -- the registry survives
    // scene restarts, so only a page reload clears it, which is the bug's
    // real cure.
    this.noFire = {
      ...createNoFireState(),
      triggered: this.registry.get('noFireTriggered') === true,
    };
  }

  create() {
    // The live copies of the active player's game. They are held here rather
    // than read out of the session every frame because they change many times a
    // second; `bankTurn` folds them back when the turn ends.
    this.loadTurn();
    // The number in the HUD is the top of the board, not a second high score
    // kept beside it. A cabinet whose header disagreed with its own BEST 5
    // would be showing one of the two wrong.
    this.highScore = loadScoreTable(this.storage)[0].score;
    this.captureState = CaptureState.IDLE;
    this.shotIndex = 0;

    this.isGameOver = false;
    this.isInvulnerable = false;
    this.frozen = false;
    this.stageResolving = false;
    this.formationElapsed = 0;
    this.challengingHits = 0;
    this.formationMotion = createFormationMotion();
    this.formationHandoff = false;
    this.waveLauncher = null;
    this.waveEnabled = false;
    this.launcherAccMs = 0;

    // Generated rather than loaded: every ship in the game is pixel art
    // authored in `src/art`, so the textures are built once here, before
    // anything asks for one.
    createShipTextures(this);
    createTransformTextures(this);
    createExplosionTextures(this);
    installArcadeFont(this);

    // The formation-wide wing frame currently showing. One clock for the
    // whole board; see `flapFrameAt`.
    this.flapFrame = 0;

    this.createWorld();
    this.createPlayer();
    this.createGroups();
    this.createHud();
    this.createInput();
    this.registerCollisions();

    // The volume pot and the monitor overlay, as the operator left them.
    applyCabinet(this, SCREEN);

    // Brief grace on the opening spawn so the arriving wave cannot land a hit
    // before the player has had a chance to move.
    this.makeInvulnerable(PLAYER.invulnerableMs);

    if (this.demo) this.beginDemo();

    // A two-player game says whose turn it is before the first wave, the way
    // the cabinet does. A one-player game does not, because there is nobody to
    // distinguish it from.
    if (this.session.playerCount > 1) {
      this.showBanner(playerLabel(this.session.active), 1500);
      this.time.delayedCall(1500, () => {
        if (!this.isGameOver) this.beginStage(this.stage);
      });
      return;
    }

    this.beginStage(this.stage);
  }

  // ------------------------------------------------------------------ turns

  /**
   * Load the active player's game into the live fields.
   *
   * Two-player Galaga is alternating, so everything the machine tracks it
   * tracks twice and swaps the pair over at a handover. This is that swap in
   * one direction; `bankTurn` is the other.
   */
  loadTurn() {
    const player = activePlayer(this.session);

    // Which player the live fields below belong to. It is not always the
    // session's active player: `loseShip` hands the machine over at the instant
    // a ship is destroyed, but the outgoing player's ship is still exploding
    // and their score is still in `this.score` for another second and a half.
    // Without this the HUD spent that second showing the dying player's score
    // in the incoming player's column.
    this.turnOwner = player.index;

    this.score = player.score;
    this.lives = player.lives;
    this.stage = player.stage;
    // Stages *played*, which is not the same as the stage number once the
    // counter has rolled over past 255. Difficulty is driven from this so a
    // player who gets that far is not handed the opening round back.
    this.round = player.round;
    this.stats = player.stats;
  }

  /** Fold the live fields back into the active player's record. */
  bankTurn() {
    this.session = withActive(this.session, {
      score: this.score,
      lives: this.lives,
      stage: this.stage,
      round: this.round,
      stats: this.stats,
    });
  }

  /**
   * Hand the machine to the other player.
   *
   * Everything on the board belongs to the outgoing player, so all of it goes:
   * the formation, whatever was diving, any beam, and any capture in progress.
   * The incoming player restarts their *own* stage from its opening wave, which
   * is what the arcade does -- a turn is a stage attempt, and the stage the
   * other player was half way through is none of their business.
   */
  handOverTurn() {
    this.clearTimers();
    this.stageAdvanceTimer?.remove();
    this.stageAdvanceTimer = null;
    // Held until `beginStage` clears it. Without it the empty board left by the
    // teardown below reads as a cleared stage, and the incoming player is
    // credited with finishing the stage the outgoing one died on.
    this.stageResolving = true;

    this.enemies.clear(true, true);
    this.enemyBullets.clear(true, true);
    this.bullets.clear(true, true);
    this.clearCaptive();
    this.clearDualFighter();
    this.clearBeam();
    this.captor = null;
    this.pull = null;
    this.beamRomX = null;
    this.captiveSettled = false;
    this.captureState = CaptureState.IDLE;
    this.sfx.enemyDive.stop();

    this.loadTurn();
    this.refreshHud();

    this.player.enableBody(true, SCREEN.width / 2, PLAYER.y, true, true);
    this.player.setAngle(0);
    this.makeInvulnerable(PLAYER.invulnerableMs);

    this.showBanner(playerLabel(this.session.active), 1600);
    this.time.delayedCall(1600, () => {
      if (this.isGameOver) return;
      this.beginStage(this.stage);
    });
  }

  // ------------------------------------------------------------------ setup

  createWorld() {
    // The 63-star hardware field. It streams during play and stops dead
    // while no fighter is on the board, which is the cabinet's own tell that
    // the world has paused; see `updateStarfield`.
    this.starfield = setStarfieldScroll(createStarfield(), STARFIELD_SCROLL.game);
    this.starLayer = this.add.graphics().setScrollFactor(0);

    // Synthesised into the audio cache here, in `create`, rather than fetched
    // in `preload`: nothing is downloaded, and by now the loader has finished,
    // so anything a local checkout supplied is already in the cache and is
    // left where it is. See `src/audio/soundBank.js`.
    installSoundBank(this);

    // The ROM pokes `sound_mgr_reset` (b_9AA0+$17, game_ctrl.s:283) the moment
    // a game starts, so whatever the results screen or the attract loop left
    // playing dies here rather than running under the new board.
    this.sound.stopAll();

    // One instance per sound, with the cabinet's WSG voice contention applied:
    // a new sound stops whatever holds its voices instead of stacking over it.
    this.sfx = channelledSoundBank(this.sound);

    // Galaga plays a low pulse under the whole board. It is the thing that
    // makes a cleared screen feel quiet, so it runs for as long as the scene
    // does rather than being started and stopped per stage.
    // Stopped by key first: replaying the scene builds a second Sound object,
    // and two copies of a loop is a drone rather than a pulse.
    this.sound.stopByKey('ambient');
    this.sfx.ambient.play({ volume: 0.18, loop: true });
  }

  createPlayer() {
    this.player = this.physics.add
      .sprite(SCREEN.width / 2, PLAYER.y, shipTextureKey('player'))
      .setCollideWorldBounds(true);
    applyShipArt(this.player, 'player');

    // The same 62% body every enemy gets. The fighter is drawn as a narrow
    // hull inside a 48px frame, and a body filling that frame would have the
    // player shot down by bombs passing through empty space beside the wings.
    this.player.body.setSize(this.player.width * 0.62, this.player.height * 0.62, true);
    this.player.body.setAllowGravity(false);
    this.dualFighter = null;
  }

  createGroups() {
    this.enemies = this.physics.add.group();
    this.bullets = this.physics.add.group();
    this.enemyBullets = this.physics.add.group();

    // The dual fighter lives in a group of its own so its collisions can be
    // registered once here, rather than wired up and torn down every time one
    // is earned and lost.
    this.wingman = this.physics.add.group();

    // A held captive is a target. Shooting your own fighter is a legal, scored
    // move in the arcade, so the captive needs a body and an overlap of its
    // own rather than being a decorative image riding on its captor.
    this.captives = this.physics.add.group();
  }

  /**
   * The cabinet's own header: 1UP over one running score on the left, HIGH
   * SCORE over the board's best in the middle, 2UP over the other on the right.
   *
   * The blink is not decoration -- it marks whose turn is live. Which is why
   * only the column belonging to the player currently flying blinks, and why in
   * a one-player game the 2UP column is drawn dim and empty: that is exactly
   * what a two-player cabinet looks like when one person is playing, and it is
   * what gives the blink on the left something to mean.
   */
  createHud() {
    const heading = { tint: 0xff4444 };
    const value = { tint: 0xffffff };

    this.playerHeadings = [
      arcadeText(this, 20, 12, '1UP', heading).setDepth(20),
      arcadeText(this, SCREEN.width - 20, 12, '2UP', heading).setOrigin(1, 0).setDepth(20),
    ];

    arcadeText(this, SCREEN.width / 2, 12, 'HIGH SCORE', heading).setOrigin(0.5, 0).setDepth(20);

    this.playerScores = [
      arcadeText(this, 20, 32, '', value).setDepth(20),
      arcadeText(this, SCREEN.width - 20, 32, '', value).setOrigin(1, 0).setDepth(20),
    ];

    // One blink tween per column, both created up front and paused: a handover
    // moves the blink by pausing one and resuming the other, so the tweens are
    // never rebuilt and the two can never end up blinking together.
    this.playerBlinks = this.playerHeadings.map((text) =>
      this.tweens.add({
        targets: text,
        alpha: 0.15,
        duration: 500,
        yoyo: true,
        repeat: -1,
        paused: true,
      }),
    );

    if (this.session.playerCount < 2) {
      this.playerHeadings[1].setTint(0x663333);
      this.playerScores[1].setTint(0x555555);
    }

    // The rank the operator left the machine on. Drawn small and out of the
    // way, because on a real cabinet it is not on the screen at all -- it is a
    // switch inside the box -- but a browser has no box, and a player who has
    // set it to D deserves to be told why the first screen is shooting at them.
    if (this.rank > 0) {
      arcadeText(this, SCREEN.width / 2, 54, `RANK ${RANK_NAMES[this.rank]}`, { tint: 0x886644 })
        .setOrigin(0.5, 0)
        .setDepth(20);
    }

    // Which column is currently blinking, so that `refreshHud` -- which runs on
    // every point scored -- can leave a running tween alone instead of
    // restarting it several times a second.
    this.blinkingColumn = -1;
    this.highScoreText = arcadeText(this, SCREEN.width / 2, 32, '', { tint: 0xffcc00 })
      .setOrigin(0.5, 0)
      .setDepth(20);

    this.bannerText = arcadeText(this, SCREEN.width / 2, SCREEN.height / 2, '', { scale: 1.5 })
      .setCenterAlign()
      .setOrigin(0.5)
      .setDepth(30)
      .setVisible(false);

    this.lifeIcons = [];
    this.flagIcons = [];
    createFlagTextures(this);
    this.refreshHud();
  }

  createInput() {
    this.keys = this.input.keyboard.addKeys({
      left: 'A',
      right: 'D',
      altLeft: 'LEFT',
      altRight: 'RIGHT',
    });

    // A second touch point, so one finger can steer while another fires.
    this.input.addPointer(1);
    this.steerPointer = null;

    // During a demo the controls belong to the machine, and the only thing
    // any control does is what it does on a cabinet mid-attract: start a
    // real game. That includes a tap on the glass and a pad's buttons.
    if (this.demo) {
      this.input.keyboard.once('keydown-SPACE', () => this.startRealGame(1));
      this.input.keyboard.once('keydown-ONE', () => this.startRealGame(1));
      this.input.keyboard.once('keydown-TWO', () => this.startRealGame(2));
      this.input.once('pointerdown', () => this.startRealGame(1));
      this.input.gamepad?.once('down', () => this.startRealGame(1));
      return;
    }

    // Movement is a held state and is read per frame; firing is an event.
    // Polling `JustDown` for the trigger loses any press that begins and ends
    // inside one frame, and tapping faster than the refresh rate is exactly
    // what a two-shot limit teaches a player to do. The `repeat` guard is what
    // stops a held key turning into the operating system's key-repeat rate.
    this.input.keyboard.on('keydown-SPACE', (event) => {
      if (!event.repeat) this.fire();
    });

    // The freeze switch. The cabinet's DIP sheet has one -- MAME calls it
    // FREEZE -- and flipping it stops the whole machine mid-frame until it is
    // flipped back. P is that switch; it is not a menu and it is not stored.
    this.input.keyboard.on('keydown-P', () => this.toggleFreeze());

    // Touch: the first finger down is the stick -- the ship chases its
    // column, read per frame in `updatePlayer` -- and any second finger is
    // the fire button. A finger that comes and goes without steering is a
    // tap, and a tap is a trigger pull.
    this.input.on('pointerdown', (pointer) => {
      if (this.steerPointer === null) {
        this.steerPointer = pointer;
        return;
      }
      if (pointer !== this.steerPointer) this.fire();
    });
    this.input.on('pointerup', (pointer) => {
      if (pointer !== this.steerPointer) return;
      this.steerPointer = null;
      const heldMs = pointer.upTime - pointer.downTime;
      const movedPx = Math.abs(pointer.x - pointer.downX);
      if (isTap(heldMs, movedPx)) this.fire();
    });

    // A pad's face buttons are the fire button; held direction is read per
    // frame in `updatePlayer` through `padState`.
    this.input.gamepad?.on('down', (pad, button) => {
      if (button.index === 0 || button.index === 1) this.fire();
    });
  }

  /**
   * The pad's held direction, flattened to the shape `controls.js` reads.
   * Null when nothing is connected, which `padHeld` treats as neutral.
   */
  padState() {
    const pad = this.input.gamepad?.getPad(0);
    if (!pad) return null;
    return {
      axisX: pad.axes.length > 0 ? pad.axes[0].getValue() : 0,
      dpadLeft: pad.left,
      dpadRight: pad.right,
    };
  }

  /**
   * The freeze switch, thrown or released.
   *
   * Freezing is total the way the DIP switch is total: physics, tweens, the
   * clock and the sound all stop, and nothing advances until the switch is
   * released. `update` returns immediately while frozen, so the starfield
   * stops with everything else.
   */
  toggleFreeze() {
    if (this.isGameOver) return;
    this.frozen = !this.frozen;

    if (this.frozen) {
      this.physics.world.pause();
      this.tweens.pauseAll();
      this.time.paused = true;
      this.sound.pauseAll();
      this.freezeLabel = arcadeText(this, SCREEN.width / 2, SCREEN.height / 2, 'FREEZE', {
        tint: 0x44ff88,
        scale: 1.5,
      })
        .setOrigin(0.5)
        .setDepth(40);
      return;
    }

    this.physics.world.resume();
    this.tweens.resumeAll();
    this.time.paused = false;
    this.sound.resumeAll();
    this.freezeLabel?.destroy();
    this.freezeLabel = null;
  }

  // ------------------------------------------------------------------- demo

  /**
   * Put the machine in charge of the fighter.
   *
   * The demo is a real game of Galaga in every respect except who is holding
   * the stick: the same stages, the same formation, the same capture, the same
   * scoring. What changes is that `updatePlayer` reads `demoInput` instead of
   * the keyboard, that the screen says so, and that nothing about it is ever
   * written to the score table -- a machine that put its own demo on the board
   * would be filling the board with itself.
   */
  beginDemo() {
    // Well clear of the row the fighter flies in: the machine's own ship spends
    // the whole demo travelling along the bottom of the screen, and text behind
    // it is text nobody can read.
    this.demoLabel = arcadeText(this, SCREEN.width / 2, SCREEN.height * 0.72, 'DEMO PLAY', {
      tint: 0xffcc00,
      scale: 1.5,
    })
      .setOrigin(0.5)
      .setDepth(30);

    this.tweens.add({
      targets: this.demoLabel,
      alpha: 0.25,
      duration: 800,
      yoyo: true,
      repeat: -1,
    });

    arcadeText(this, SCREEN.width / 2, SCREEN.height * 0.72 + 30, 'PUSH START BUTTON   1P: SPACE   2P: 2', {
      tint: 0x8899bb,
    })
      .setOrigin(0.5)
      .setDepth(30);

    this.demoTimer = this.time.delayedCall(DEMO_DURATION_MS, () => this.endDemo());
  }

  /** Hand the screen back to the attract loop. */
  endDemo() {
    if (!this.demo) return;
    this.demo = false;
    this.isGameOver = true;
    this.clearTimers();
    this.sound.stopAll();
    this.scene.start('TitleScene');
  }

  /** Someone pressed start while the machine was playing: give them the game. */
  startRealGame(playerCount) {
    if (!this.demo) return;
    this.demo = false;
    this.isGameOver = true;
    this.demoTimer?.remove();
    this.clearTimers();
    this.sound.stopAll();
    this.sound.play('coin', { volume: 0.5 });
    this.scene.start('GameScene', { playerCount });
  }

  /**
   * The board as the demo pilot sees it.
   *
   * Deliberately narrow: positions and nothing else. The pilot is a pure
   * function of this, which is what lets `tests/demo.test.js` fly it without a
   * canvas, and it is why the pilot cannot cheat by reading a timer or a
   * random seed the player has no access to.
   */
  demoBoard() {
    return {
      playerX: this.player.x,
      playerY: this.player.y,
      screenWidth: SCREEN.width,
      margin: SHIP_DRAWN_PX / 2,
      bombs: this.enemyBullets
        .getChildren()
        .filter((bullet) => bullet.active)
        .map((bullet) => ({ x: bullet.x, y: bullet.y })),
      targets: this.enemies
        .getChildren()
        .filter((enemy) => enemy.active)
        .map((enemy) => ({ x: enemy.x, y: enemy.y })),
      beam:
        this.beam && isBeamDangerous(this.captureState)
          ? // The pilot dodges the CATCH window, which is a shade wider than
            // the drawn cone: +/-27 ROM px through the screen adapter.
            { x: this.beam.x, width: BEAM_CATCH_HALF_WIDTH * 2 * ROM_TO_SCREEN }
          : null,
    };
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
      // Ramming a captor that owns a slave is a kill without the rescue
      // conditions: the slave is orphaned rather than stranded in HELD.
      const orphans = enemy.captiveAttached === true;
      this.destroyEnemy(enemy, false);
      if (orphans) this.loseCaptive(RescueOutcome.ORPHANED);
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
      const orphans = enemy.captiveAttached === true;
      this.destroyEnemy(enemy, false);
      if (orphans) this.loseCaptive(RescueOutcome.ORPHANED);
      this.onPlayerHit();
    });

    // Shooting your own captured fighter. Worth 1,000 and loses the ship for
    // good -- the player gives up any chance of the dual fighter to take the
    // points, which is the trade the arcade offers and the reason the captive
    // is left hanging there in the formation rather than being untouchable.
    this.physics.add.overlap(this.bullets, this.captives, (bullet, captive) => {
      if (!bullet.active || !captive.active) return;
      bullet.destroy();
      this.onCaptiveShot();
    });

    this.physics.add.overlap(this.wingman, this.enemyBullets, (_wingman, bullet) => {
      if (!this.canBeHurt() || !bullet.active) return;
      bullet.destroy();
      this.onPlayerHit();
    });

    // A captive on a flight of its own -- the escort dive beside its captor,
    // or the rogue descent -- can ram the player, exactly as a diving enemy
    // can. While it is glued to its captor it is only a target, so the guard
    // is on the flight rather than on the sprite existing. Ramming your own
    // escorting captive destroys it too, which ends the capture.
    for (const ship of [this.player, this.wingman]) {
      this.physics.add.overlap(ship, this.captives, (_ship, captive) => {
        if (!captive.flight || !this.canBeHurt() || !captive.active) return;
        if (!captive.rogue) {
          if (this.captor) this.captor.captiveAttached = false;
          this.captureState = transition(this.captureState, CaptureEvent.CAPTIVE_DESTROYED);
        }
        this.clearCaptive();
        this.onPlayerHit();
      });
    }
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
    this.difficulty = stageDifficulty(this.round, this.rank);
    this.challenging = isChallengingStage(stage);
    this.transformType = transformTypeFor(stage);

    // The stg_init_env beats this scene keeps: the caravan header latched to
    // b_92E2, a fresh formation-motion machine (oscillate re-enabled,
    // nestlr_inh cleared), and the launcher held until the splash clears.
    this.caravanHeader = caravanHeaderFor(stage, this.rank);
    this.formationMotion = createFormationMotion();
    this.formationHandoff = false;
    this.waveLauncher = null;
    this.waveEnabled = false;
    this.launcherAccMs = 0;

    // The stage's attack scheduler: per-type launch counters out of the
    // difficulty row. It starts counting when the wave finishes assembling.
    this.attack = createAttackScheduler(this.difficulty);
    this.attackActive = false;

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

    // The capture transients and the bonus-bee arming, fresh per stage: the
    // clone-attack task re-arms every stage (`f_1A80` is re-enabled by stage
    // init after its launch self-disable).
    this.pull = null;
    this.pullAccMs = 0;
    this.beamRomX = null;
    this.captiveSettled = false;
    this.bonusBee = { spent: false, bee: null, timer: null, ticks: 0 };

    // STAGE n, then READY, then the wave -- the cabinet's own cadence, cut
    // inside the same 1800ms the single banner used to hold, so nothing about
    // when the formation actually arrives has moved.
    this.showBanner(this.challenging ? 'CHALLENGING STAGE' : `STAGE ${stage}`, 1100);
    this.time.delayedCall(1100, () => {
      if (!this.isGameOver) this.showBanner('READY', 700);
    });
    this.sfx[this.challenging ? 'challengeStart' : 'stageFlag'].play({ volume: 0.5 });
    this.refreshHud();

    this.time.delayedCall(1800, () => {
      if (this.isGameOver) return;
      this.startWaveLauncher();
    });
  }

  /**
   * Arm the stage's wave launcher: compile the caravan row into the runtime
   * byte stream and flip the two-phase enable, the way `plyr_respawn_rdy`
   * flips `_b_atk_wv_enbl` once the splash has cleared and the ship is on
   * the board. From here `updateWaveLauncher` walks the stream one byte per
   * hardware frame; enemies are created AT launch, and the stage-clear check
   * holds until the walker reports done.
   *
   * The same machine runs a Challenging Stage: the stream compiles from the
   * challenge rows, whose members fly the token-free blocks and despawn
   * instead of homing, with the full 40-ID roster -- so the four bosses ride
   * wave 2 of a bonus round exactly as they do on a combat stage.
   */
  startWaveLauncher() {
    this.formationSlots = buildFormationSlots();
    this.waveLauncher = createWaveLauncher(compileStageStream(this.stage, this.rank));
    this.waveEnabled = true;
    this.launcherAccMs = 0;
  }

  /**
   * Walk the launcher, one stream byte per hardware frame -- the f_2916
   * cadence: gated launches on the frame & 7 beat, wing-men one frame behind
   * their leaders, waves held while launched members are still flying (plus
   * the ~1 s game-timer wait on a challenge stage), a 12-slot in-flight cap.
   */
  updateWaveLauncher(delta) {
    if (!this.waveLauncher || this.waveLauncher.done || this.stageResolving) return;

    this.launcherAccMs += Math.max(delta, 0);
    let frames = Math.floor(this.launcherAccMs / FRAME_MS + 1e-9);
    this.launcherAccMs -= frames * FRAME_MS;

    while (frames > 0) {
      frames -= 1;
      const flying = this.countFlyingEntries();
      const { state, launch, completed } = stepWaveLauncher(this.waveLauncher, {
        enabled: this.waveEnabled && this.player.active,
        bugsFlying: flying,
        inFlight: flying,
        challenge: this.challenging,
      });
      this.waveLauncher = state;

      if (launch) this.spawnWaveMember(launch);
      if (completed) {
        this.onWaveLauncherComplete();
        return;
      }
    }
  }

  /** Launched members still path-flying: the ROM's `b_bugs_flying_nbr`. */
  countFlyingEntries() {
    return this.enemies
      .getChildren()
      .filter(
        (enemy) =>
          enemy.active &&
          enemy.flight &&
          (enemy.mode === EnemyMode.ENTERING || enemy.mode === EnemyMode.PASSING),
      ).length;
  }

  /**
   * One launch off the stream, decoded the way `l_2974` sets a motion slot
   * up: the object ID names the formation slot through `sprt_fmtn_hpos`, the
   * path byte the entrance shape, member and gate; the fly-in bomb string is
   * the caravan header's mask gated by the creature's d_2908 bit, counting
   * down from the bit-0 seed (0x08 top entrant / 0x44 side entrant). A
   * transient ID takes none of that: it flies the same entrance, branches at
   * the F7 token onto its swoop, and despawns at its FF.
   */
  spawnWaveMember(launch) {
    const info = decodeLaunch(launch, { flyInBombMask: this.caravanHeader.flyInBombMask });
    const start = entrySpawnPoint(info.pathIndex, info.member, SCREEN);
    const flight = () =>
      createLiveFlight(
        createEntryFlightState(info.pathIndex, info.member, { objectId: info.objectId }),
        SCREEN,
      );

    if (info.transient) {
      const type =
        info.transientKind === 'redmoth'
          ? EnemyType.GOEI
          : info.transientKind === 'boss'
            ? EnemyType.BOSS
            : EnemyType.ZAKO;
      const enemy = createTransientEnemy(this, this.enemies, type, start, this.flapFrame);
      enemy.flight = flight();
      return;
    }

    const slot = this.formationSlots[slotIndexForObjectId(info.objectId)];
    const enemy = createEnemy(this, this.enemies, slot, start, this.flapFrame);

    if (this.challenging) {
      // A challenge member keeps its rank for art and scoring but has no
      // home: its block ends FF and the flight despawns it off the field.
      enemy.slot = null;
      enemy.mode = EnemyMode.PASSING;
      enemy.bombMask = 0;
    } else {
      enemy.bombMask = this.noFire.triggered ? 0 : info.bombMask;
      enemy.bombCountdownMs = info.bombCounterInit * FRAME_MS;
    }

    enemy.flight = flight();
  }

  /**
   * The 0x7F fired with the sky clear: the ROM's moment to enable the
   * bomber-attack and bonus-bee tasks and raise `_b_nestlr_inh` -- the
   * formation's coast-to-centre handoff into the breathing pulse.
   */
  onWaveLauncherComplete() {
    this.formationHandoff = true;
    if (this.isGameOver || this.stageResolving) return;
    if (!this.challenging) this.attackActive = true;
  }

  completeStage() {
    if (this.stageResolving) return;
    this.stageResolving = true;
    this.clearTimers();

    if (this.challenging) {
      const perfect = this.challengingHits === FORMATION_SIZE;
      this.sfx.challengeClear.play({ volume: 0.5 });
      this.sfx[challengeResultSound(this.challengingHits, FORMATION_SIZE)].play({ volume: 0.6 });

      // The cabinet's own wording. A round that fell short reports the total
      // already paid at 100 a hit rather than paying it again here; only the
      // perfect bonus is awarded at the end, because only it is a bonus.
      if (perfect) {
        this.addScore(PERFECT_BONUS);
        this.showBanner(`PERFECT!!\nSPECIAL BONUS ${PERFECT_BONUS} PTS`, 2200);
      } else {
        const paid = this.challengingHits * CHALLENGING_STAGE_HIT_POINTS;
        this.showBanner(`NUMBER OF HITS ${this.challengingHits}\nBONUS ${paid} PTS`, 2200);
      }
    }

    this.stageAdvanceTimer = this.time.delayedCall(this.challenging ? 2400 : 1200, () => {
      this.stageAdvanceTimer = null;
      if (this.isGameOver) return;
      this.round += 1;
      this.stage = nextStage(this.stage);
      this.beginStage(this.stage);
    });
  }

  // ---------------------------------------------------------------- attacks

  /**
   * Pump the per-type launch counters.
   *
   * Called every frame once the wave has assembled. The scheduler decides
   * which types launch this frame against the row's active-bomber ceiling;
   * a boss dispatch alternates escort sorties and solo capture missions,
   * and the bonus-bee manager watches the thinning board behind it.
   */
  updateAttacks(delta) {
    if (!this.attackActive || this.challenging || this.stageResolving) return;

    // The no-fire lock-up accrues while the last enemies are being dodged
    // rather than shot; see `advanceNoFire` for the conditions.
    if (this.dips.noFireBug && !this.noFire.triggered) {
      this.noFire = advanceNoFire(this.noFire, delta, {
        enabled: true,
        enemiesRemaining: this.enemies.countActive(true),
      });
      if (this.noFire.triggered) this.registry.set('noFireTriggered', true);
    }

    if (!this.captureIsIdle()) return;

    const enemies = this.enemies.getChildren();
    const activeBombers = enemies.filter(isDiving).length;
    const availableTypes = [
      ...new Set(enemies.filter(canBeginDive).map((e) => e.enemyType)),
    ];
    const escortsAvailable = enemies.filter(
      (e) => e.enemyType === EnemyType.GOEI && canBeginDive(e),
    ).length;

    const { state, launches } = advanceScheduler(this.attack, delta, {
      activeBombers,
      // The scheduler's live inputs: the reloads and the bomb mask tighten
      // as the board thins and the stage drags, and continuous bombing arms
      // once the count drops below the row's threshold with the player able
      // to fire -- all recomputed every frame, the ROM's f_0857.
      aliveEnemies: this.enemies.countActive(true),
      playerFireActive: this.player.active,
      availableTypes,
      escortsAvailable,
      // The cflag: set for the whole capture mission -- descent, beam, pull
      // and the held ship -- so no second beam can be chosen and the boss
      // alternation holds where it is (gg1-2_fx.s:1011-1043).
      captureActive: Boolean(this.captor) || this.captureState === CaptureState.HELD,
    });
    this.attack = state;

    launches.forEach((launch) => this.launchDive(launch));
    this.updateBonusBee();
  }

  /**
   * The endgame set-piece, `f_1A80` (gg1-2_fx.s:671-833): armed once per
   * stage, only when the live count has thinned below the difficulty row's
   * clone-attack gate -- 0 on stages 1-3 and challenge stages, 10 otherwise.
   * A RESTING formation bee is chosen (the bee group in ID order, the moth
   * group as fallback), flashed at 4 Hz for 64 frames, then repainted as the
   * stage band's bonus ship and flown down the convoy path. A bee shot
   * mid-flash bails; the arming is only spent at the launch itself.
   */
  updateBonusBee() {
    if (!this.transformType || this.bonusBee.spent || this.bonusBee.bee) return;
    if (!bonusBeeGateOpen(this.attack.parms, this.enemies.countActive(true))) return;

    const bee = this.pickBonusBee();
    if (!bee) return;

    bee.transforming = true;
    this.bonusBee.bee = bee;
    this.bonusBee.ticks = 0;
    this.bonusBee.timer = this.time.addEvent({
      delay: BONUS_BEE_FLASH_PERIOD_FRAMES * FRAME_MS,
      repeat: BONUS_BEE_FLASH_FRAMES / BONUS_BEE_FLASH_PERIOD_FRAMES - 1,
      callback: () => this.onBonusBeeFlashTick(),
    });
  }

  /** First resting Zako in slot order; the Goei group is the ROM's fallback. */
  pickBonusBee() {
    const resting = this.enemies.getChildren().filter(canBeginDive);
    const first = (type) =>
      resting
        .filter((enemy) => enemy.enemyType === type)
        .sort((a, b) => (a.slot?.index ?? 0) - (b.slot?.index ?? 0))[0] ?? null;
    return first(EnemyType.ZAKO) ?? first(EnemyType.GOEI);
  }

  /** One 16-frame beat of the warning flash -- bit 4 of the ROM's counter. */
  onBonusBeeFlashTick() {
    const bee = this.bonusBee.bee;
    if (!bee || !bee.active || this.stageResolving || this.isGameOver) {
      this.cancelBonusBee();
      return;
    }

    this.bonusBee.ticks += 1;
    if (this.bonusBee.ticks >= BONUS_BEE_FLASH_FRAMES / BONUS_BEE_FLASH_PERIOD_FRAMES) {
      this.launchBonusBee(bee);
      return;
    }

    if (bonusBeeFlashOn(this.bonusBee.ticks * BONUS_BEE_FLASH_PERIOD_FRAMES)) {
      bee.setTintFill(0xffffff);
    } else {
      bee.clearTint();
    }
  }

  /** The flash bailed -- bee killed first. The arm is NOT spent. */
  cancelBonusBee() {
    this.bonusBee.timer?.remove();
    this.bonusBee.timer = null;
    const bee = this.bonusBee.bee;
    this.bonusBee.bee = null;
    if (bee?.active) {
      bee.clearTint();
      bee.transforming = false;
    }
  }

  /**
   * The launch: repaint the bee IN PLACE as the stage band's bonus ship --
   * the leader is the transformed formation bee itself -- and fly the
   * per-colour convoy entry. The two clones split off mid-dive at the F2
   * tokens; the tail takes an unkilled leader home to the grid, where it
   * reverts to an ordinary bee. The task self-disables: one per stage.
   */
  launchBonusBee(bee) {
    this.bonusBee.timer?.remove();
    this.bonusBee.timer = null;
    this.bonusBee.bee = null;
    if (!bee.active || this.stageResolving || this.isGameOver) return;

    this.bonusBee.spent = true;
    bee.clearTint();
    bee.transforming = false;
    this.sfx.transformSet.play({ volume: 0.5 });

    const type = this.transformType;
    bee.setTexture(transformTextureKey(type));
    applyShipArt(bee, type, { frame: this.flapFrame });
    bee.artName = type;
    bee.transformSet = { type, remaining: TRANSFORM_SET_SIZE };
    bee.transformLeader = true;

    // Launched through the shared dive machinery (`c_1083 -> j_108A`):
    // armed at launch like any diver.
    this.beginDiveSound();
    bee.mode = EnemyMode.DIVING;
    bee.bombMask = this.enemiesArmed() ? this.attack.bombFlags : 0;
    bee.bombCountdownMs = BOMB_ARM_FRAMES * FRAME_MS;
    bee.flight = createLiveFlight(
      createConvoyLeaderFlightState(TRANSFORM_COLOURS[type], { x: bee.x, y: bee.y }, SCREEN, {
        negateRotation: (bee.slot?.index ?? 0) % 2 === 1,
      }),
      SCREEN,
    );
  }

  /**
   * One F2 clone split (`case_097B`, gg1-5.s:1564-1633): a copy of the
   * leader dropped into a transient slot (0x38-0x3E), running the embedded
   * clone stream from where the leader is -- it F3-aims at the player, then
   * despawns at its FF. It scores as a member of the leader's set; a clone
   * that leaves unkilled simply never decrements it, which is why the set
   * bonus needs all three.
   */
  spawnTransformClone(leader, cloneState) {
    const clone = createTransformEnemy(
      this,
      this.enemies,
      leader.transformSet.type,
      { x: leader.x, y: leader.y },
      leader.transformSet,
      this.flapFrame,
    );
    clone.bombMask = this.enemiesArmed() ? this.attack.bombFlags : 0;
    clone.bombCountdownMs = BOMB_ARM_FRAMES * FRAME_MS;
    clone.flight = createLiveFlight(cloneState, SCREEN);
  }

  /**
   * The leader flew home unkilled: it settles back into its slot and
   * reverts to the ordinary formation bee it was. Its set can no longer be
   * completed -- the survivor took the bonus with it.
   */
  revertTransformLeader(bee) {
    bee.transformLeader = false;
    bee.transformSet = undefined;
    bee.setTexture(shipTextureKey(bee.enemyType));
    applyShipArt(bee, bee.enemyType, { frame: this.flapFrame });
    bee.artName = bee.enemyType;
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

  /**
   * Launch the one attacker the scheduler emitted this frame.
   *
   * The squad structure lives in the scheduler: a boss escort sortie
   * arrives as an `escortLeader` launch followed by its `escortWingman`
   * launches on the next frames, the pool's one-per-frame stagger, so this
   * launches exactly one enemy. A boss launch takes the FIRST standby boss
   * in index order (`l_1C1B`); a `capture` role flies the solo capture dive
   * instead of an attack pass, and an escort leader that owns a captive
   * brings it along -- the slave-slot rule, and the rescue chance.
   */
  launchDive(launch) {
    if (this.isGameOver || this.challenging || !this.captureIsIdle()) return;

    if (launch.type === EnemyType.BOSS) {
      const boss = this.firstStandbyBoss();
      if (!boss) return;

      if (launch.role === 'capture') {
        this.beginCaptureDive(boss);
        return;
      }

      // Scoring reads the sortie's size off the leader: a boss that brought
      // two wingmen is the 1600-point kill.
      boss.escortCount = launch.wingmen ?? 0;
      this.beginDive(boss);
      if (boss === this.captor && boss.captiveAttached) this.launchCaptiveEscort();
      return;
    }

    const ofType = this.enemies
      .getChildren()
      .filter((enemy) => canBeginDive(enemy) && enemy.enemyType === launch.type);
    if (ofType.length === 0) return;

    const leader = Phaser.Utils.Array.GetRandom(ofType);
    leader.escortCount = 0;
    this.beginDive(leader);
  }

  /** The ROM's boss pick: the first standby boss in index order (`l_1C1B`). */
  firstStandbyBoss() {
    return (
      this.enemies
        .getChildren()
        .filter((enemy) => enemy.enemyType === EnemyType.BOSS && canBeginDive(enemy))
        .sort((a, b) => (a.slot?.index ?? 0) - (b.slot?.index ?? 0))[0] ?? null
    );
  }

  beginDive(enemy) {
    if (!canBeginDive(enemy)) return;
    this.beginDiveSound();
    enemy.mode = EnemyMode.DIVING;

    // Armed at launch, as `j_108A` arms every diver: a 30-frame countdown
    // and the drop bitmask the scheduler computed this frame from d_0909 --
    // the live board decides how many bombs this run carries, not a
    // per-stage allowance. Each set bit is one bomb, released low in the
    // field on the 20-frame spacing.
    enemy.bombMask = this.enemiesArmed() ? this.attack.bombFlags : 0;
    enemy.bombCountdownMs = BOMB_ARM_FRAMES * FRAME_MS;
    // A LIVE flight on the type's own attack table (yellow/red/boss with
    // its entry offset): speed lives in the table's nibbles, the F3/FE
    // hooks read the player every frame, the FA gate loops the pass while
    // the scheduler holds continuous bombing, and the FB tail glides it
    // back onto its slot. Mirroring is the ROM's objectId-bit-1 recompute,
    // stood in by the slot parity until Task 4 assigns real object ids.
    enemy.flight = createLiveFlight(
      createDiveFlightState(enemy.enemyType, { x: enemy.x, y: enemy.y }, SCREEN, {
        negateRotation: (enemy.slot?.index ?? 0) % 2 === 1,
      }),
      SCREEN,
    );
  }

  /**
   * Whether this stage's attackers carry bombs at all.
   *
   * The stage's own flag, and then the no-fire lock-up on top of it: once
   * that has tripped, nothing shoots again until the page is reloaded.
   */
  enemiesArmed() {
    return enemiesBomb(this.stage, this.rank) && !this.noFire.triggered;
  }

  /**
   * The solo capture mission (`db_0454`, gg1-5.s:359-366): the boss departs
   * alone on the boss table's capture entry. The F4 token aims the beam
   * column at the player's lane ONCE on the way down, the FC dive brings it
   * to raw Y 0x48, and the `00 FC FF` stall -- a ~255-frame in-place spin --
   * is the hover the whole beam sequence plays over. `this.captor` doubles
   * as the cflag: while it is set no new beam can be chosen and the boss
   * alternation holds where it is.
   */
  beginCaptureDive(boss) {
    this.beginDiveSound();
    boss.mode = EnemyMode.DIVING;
    boss.escortCount = 0;
    this.captor = boss;
    this.beamRomX = null;
    this.sfx.bossEntrance.play({ volume: 0.5 });

    boss.bombMask = this.enemiesArmed() ? this.attack.bombFlags : 0;
    boss.bombCountdownMs = BOMB_ARM_FRAMES * FRAME_MS;
    boss.flight = createLiveFlight(
      createDiveFlightState(EnemyType.BOSS, { x: boss.x, y: boss.y }, SCREEN, {
        role: 'capture',
        negateRotation: (boss.slot?.index ?? 0) % 2 === 1,
      }),
      SCREEN,
    );
  }

  /**
   * The capture dive's hover. Once the F4 aim has been taken and the entry's
   * stall segment is running (vx = vy = 0), `f_21CB` (gg1-3.s:392-446) first
   * spins the boss to face straight DOWN -- +/-0x0C per frame until the
   * heading is within 0x10 of 768 -- and only then opens the beam.
   */
  updateCaptureHover(boss) {
    const state = boss.flight?.state;
    if (!state || state.done || state.vx !== 0 || state.vy !== 0) return;

    const delta = ((state.angle - 0x300 + 512) & 0x3ff) - 512;
    if (Math.abs(delta) >= 0x10) {
      state.rotRate = delta > 0 ? -PULL_SPIN_STEP : PULL_SPIN_STEP;
      return;
    }

    state.rotRate = 0;
    state.angle = 0x300;
    this.openBeam(boss);
  }

  /** Where the aimed beam column sits on screen. */
  beamScreenX() {
    return (this.beamRomX ?? (this.captor ? this.captor.x / ROM_TO_SCREEN : 0)) * ROM_TO_SCREEN;
  }

  openBeam(boss) {
    if (!boss.active || this.isGameOver) return;
    this.captureState = transition(this.captureState, CaptureEvent.DEPLOY_BEAM);
    if (this.captureState !== CaptureState.BEAM_OPENING) return;

    this.sfx.beamOpen.play({ volume: 0.5 });

    // The stage's beam clock: 11 strips at the difficulty row's
    // frames-per-strip for grow and shrink, the fixed 64-frame grab window
    // between them.
    this.beamClock = beamTimings(this.difficulty.beamFramesPerStrip);

    // A ripped beam, when a local checkout has one: full-beam frames cycled
    // like the strips would be, revealed by a crop while it unfurls. Without
    // one the fan is drawn strip by strip; either way `this.beam` is the
    // object whose x the grab test and the demo pilot read. The cone is
    // anchored on the F4-aimed column, NOT the boss's drifted X.
    const x = this.beamScreenX();
    const y = boss.y + CAPTURE.beamOffsetY;
    const local = localArtFrames('beam');
    if (local && this.textures.exists(local[0])) {
      this.beam = this.add
        .image(x, y, local[0])
        .setOrigin(0.5, 0)
        .setDisplaySize(CAPTURE.beamWidth, CAPTURE.beamLength)
        .setAlpha(0.85)
        .setDepth(5);
      this.beamLocalFrames = local;
    } else {
      this.beam = this.add.graphics({ x, y });
      this.beam.setAlpha(0.85).setDepth(5);
      this.beamLocalFrames = null;
    }

    this.beamPhase = 'opening';
    this.beamPhaseElapsed = 0;
    this.beamTotalElapsed = 0;
    this.drawBeam();
  }

  /**
   * The grab window closed on nothing. `l_22E3` (gg1-3.s:607-612): the furl
   * begins, and the boss's ~255-frame stall is force-expired so it flies its
   * retreat tail -- the climb, the F8/F9 top re-entry, the FA gate and the
   * FB glide home -- immediately rather than spinning out the leftover.
   */
  closeBeam() {
    if (!isBeamDangerous(this.captureState)) return;
    this.captureState = transition(this.captureState, CaptureEvent.BEAM_TIMEOUT);

    if (this.beam) {
      this.beamPhase = 'retracting';
      this.beamPhaseElapsed = 0;
    }

    const boss = this.captor;
    this.captor = null;
    this.beamRomX = null;
    if (boss?.active && boss.flight?.state) boss.flight.state.segTimer = 1;
  }

  clearBeam() {
    if (this.beam) {
      this.beam.destroy();
      this.beam = null;
      this.beamLocalFrames = null;
    }
  }

  /**
   * Draw the beam as it stands this frame: the strip fan from
   * `beamStripsAt`, or a local checkout's ripped frames cropped to the same
   * reveal and cycled on the same clock.
   */
  drawBeam() {
    const opts = {
      strips: BEAM_STRIPS,
      openMs: this.beamClock.openMs,
      cycleMs: CAPTURE.beamCycleMs,
      retractMs: this.beamClock.retractMs,
      width: CAPTURE.beamWidth,
      length: CAPTURE.beamLength,
    };
    const strips = beamStripsAt(this.beamPhase, this.beamPhaseElapsed, opts);

    if (this.beamLocalFrames) {
      const frame =
        this.beamLocalFrames[
          Math.floor(this.beamTotalElapsed / CAPTURE.beamCycleMs) % this.beamLocalFrames.length
        ];
      if (this.textures.exists(frame)) this.beam.setTexture(frame);
      const source = this.beam.texture.getSourceImage();
      const revealed = strips.length / BEAM_STRIPS;
      this.beam.setCrop(0, 0, source.width, source.height * revealed);
      this.beam.setDisplaySize(CAPTURE.beamWidth, CAPTURE.beamLength);
      return;
    }

    this.beam.clear();
    for (const strip of strips) {
      this.beam.fillStyle(strip.color, 1);
      this.beam.fillRect(-strip.width / 2, strip.yOffset, strip.width, strip.height);
    }
  }

  capturePlayer() {
    this.captureState = transition(this.captureState, CaptureEvent.PLAYER_CAUGHT);
    if (this.captureState !== CaptureState.CAPTURING) return;

    this.sfx.beamCapture.play({ volume: 0.6 });
    this.player.disableBody(true, false);

    // A dual fighter caught in a beam loses its second ship rather than
    // carrying it up to the boss.
    this.clearDualFighter();

    // The beam flips to retract the moment the trap springs, and the pull
    // plays over the furl. The captor's stall is pinned so it cannot expire
    // out from under the ride up.
    if (this.beam) {
      this.beamPhase = 'retracting';
      this.beamPhaseElapsed = 0;
    }
    if (this.captor?.flight?.state) this.captor.flight.state.segTimer = 0xff;

    this.pull = createPull({
      x: this.player.x / ROM_TO_SCREEN,
      y: this.player.y / ROM_TO_SCREEN,
    });
    this.pullAccMs = 0;
  }

  /**
   * The pull-ship ride (`f_20F2`): ROM-denominated frames of the tumble --
   * +/-1 px toward the boss's column with the wobble, 1 px up, the 0x0C
   * spin step -- until the connect row latches and the carry-home begins.
   * The starfield reverses for exactly this span: the CAPTURING state.
   */
  updatePull(delta) {
    if (!this.pull || !this.captor || !this.captor.active) return;

    this.pullAccMs += Math.max(delta, 0);
    let frames = Math.floor(this.pullAccMs / FRAME_MS + 1e-9);
    this.pullAccMs -= frames * FRAME_MS;

    const bossX = this.captor.x / ROM_TO_SCREEN;
    while (frames > 0 && !this.pull.connected) {
      this.pull = advancePull(this.pull, bossX);
      frames -= 1;
    }

    this.player.setPosition(this.pull.x * ROM_TO_SCREEN, this.pull.y * ROM_TO_SCREEN);
    // The cabinet's fighter has sixteen orientations, so the tumble clicks
    // through the same stops a diving Goei does.
    this.player.setRotation(quantizeHeading(angleToRadians(this.pull.angle)));

    if (this.pull.connected) this.onCaptureComplete();
  }

  onCaptureComplete() {
    this.pull = null;
    this.beamRomX = null;
    this.player.setVisible(false);
    this.player.setAngle(0);
    this.captureState = transition(this.captureState, CaptureEvent.CAPTURE_COMPLETE);
    this.sfx.captured.play({ volume: 0.6 });
    this.showBanner('FIGHTER CAPTURED', 1400);

    const boss = this.captor;
    if (boss && boss.active) {
      this.captive = this.captives
        .create(boss.x, boss.y + CAPTURE.captiveOffsetY, shipTextureKey('captive'))
        .setDepth(6);
      applyShipArt(this.captive, 'captive');
      this.captive.body.setAllowGravity(false);
      boss.captiveAttached = true;
      this.captiveSettled = false;

      // The carry-home (`db_flv_cboss`): the boss flies back to its slot
      // with the prize glued 16 ROM px underneath, the FB glide riding the
      // swaying grid. RETURNING, not DIVING: a kill during the carry
      // ORPHANS the slave rather than rescuing it -- the L1 branch.
      boss.mode = EnemyMode.RETURNING;
      boss.flight = createLiveFlight(
        createCarryHomeFlightState({ x: boss.x, y: boss.y }, SCREEN),
        SCREEN,
      );
    }

    this.loseLife();
  }

  /**
   * The boss landed with its prize: the slave rises over the ROM's 36-frame
   * counter to settle ABOVE the boss, where it hangs as a red hostage.
   */
  settleCaptive() {
    if (!this.captive || !this.captor) return;
    this.captiveSettled = 'rising';
    this.tweens.add({
      targets: this.captive,
      y: this.captor.y - CAPTURE.captiveOffsetY,
      duration: SETTLE_FRAMES * FRAME_MS,
      onComplete: () => {
        if (this.captive) this.captiveSettled = true;
      },
    });
  }

  /**
   * Fly the held fighter: glued to its captor -- below during the carry,
   * above once settled -- or on a flight of its own: the escort dive beside
   * its captor, or the rogue descent after a formation kill.
   */
  updateCaptive(delta) {
    const captive = this.captive;
    if (!captive) return;

    if (captive.flight) {
      this.advanceCaptiveFlight(captive, delta);
      return;
    }

    if (!this.captor || !this.captor.active) return;

    if (this.captiveSettled === 'rising') {
      // The settle tween owns Y; the glue keeps X on the boss.
      captive.x = this.captor.x;
      return;
    }

    const offset = this.captiveSettled === true ? -CAPTURE.captiveOffsetY : CAPTURE.captiveOffsetY;
    captive.setPosition(this.captor.x, this.captor.y + offset);
  }

  /**
   * The slave-slot rule (`l_1CE3`, gg1-2_fx.s:1221-1248): when its captor
   * leads an escort sortie, a settled slave is queued with the SAME flight
   * vector -- `db_flv_0411`, the escort path. The captive dives as an extra
   * escort that happens to be your red ship, and it bombs under the same
   * launch-armed rules as any diver (`j_108A`) -- this is the rescue window.
   */
  launchCaptiveEscort() {
    const captive = this.captive;
    if (!captive || captive.flight || this.captiveSettled !== true) return;

    captive.escorting = true;
    captive.mode = EnemyMode.DIVING;
    captive.bombMask = this.enemiesArmed() ? this.attack.bombFlags : 0;
    captive.bombCountdownMs = BOMB_ARM_FRAMES * FRAME_MS;
    captive.flight = createLiveFlight(
      createDiveFlightState(EnemyType.BOSS, { x: captive.x, y: captive.y }, SCREEN, {
        negateRotation: (this.captor?.slot?.index ?? 0) % 2 === 1,
      }),
      SCREEN,
    );
  }

  /** One frame of a captive's own flight: escort dive or rogue descent. */
  advanceCaptiveFlight(captive, delta) {
    const post = this.captor?.slot ? this.slotPosition(this.captor.slot) : null;
    const { flight, events } = advanceLiveFlight(captive.flight, delta, {
      playerX: this.player.x,
      // The FB glide brings the escorting slave back to its hostage post
      // above the boss, riding the swaying grid.
      homeTarget: post ? { x: post.x, y: post.y - CAPTURE.captiveOffsetY } : undefined,
      stage8Switch: this.difficulty.stage8PathSwitch,
      stage12Switch: this.difficulty.stage12BombingSwitch,
      continuousBombing: this.attack?.continuousBombing ?? false,
    });
    captive.flight = flight;
    const { x, y, angle } = liveFlightTransform(flight);
    captive.setPosition(x, y);
    captive.setRotation(quantizeHeading(angle));

    for (const event of events) {
      if (event.type === 'armBombs' && this.enemiesArmed()) {
        captive.bombMask = this.attack.bombFlags;
        captive.bombCountdownMs = BOMB_ARM_FRAMES * FRAME_MS;
      }
    }

    // The slave bombs like any launch-armed diver: the standard machinery,
    // not a bespoke one-shot.
    this.updateEnemyBombs(captive, delta);

    if (!isLiveFlightDone(captive.flight)) return;

    if (liveFlightHomed(captive.flight)) {
      // The escort pass ended on the FB glide: back to the hostage post.
      captive.flight = null;
      captive.escorting = false;
      captive.mode = null;
      captive.setRotation(0);
      return;
    }

    // FF: the rogue fighter left the field for good.
    this.clearCaptive();
  }

  clearCaptive() {
    if (this.captive) {
      this.captive.destroy();
      this.captive = null;
    }
    this.captiveSettled = false;
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

    // The rescue interrupts the slave's own escort dive mid-flight: `f_2000`
    // takes over from wherever it was for the spin-down to the dock.
    this.captive.flight = null;
    this.captive.escorting = false;
    this.captive.mode = null;

    this.tweens.add({
      targets: this.captive,
      x: this.player.x + DUAL_FIGHTER_OFFSET_X,
      y: this.player.y,
      duration: CAPTURE.dockDurationMs,
      ease: 'Sine.easeInOut',
      // The freed ship spins down to the dock the same stepped way it spun
      // up the beam, and arrives upright on the last step.
      onUpdate: (tween) =>
        this.captive.setRotation(
          spinAngleAt(tween.progress * CAPTURE.dockDurationMs, CAPTURE.dockDurationMs),
        ),
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
      .create(this.player.x + DUAL_FIGHTER_OFFSET_X, this.player.y, shipTextureKey('player'))
      .setDepth(4);
    applyShipArt(this.dualFighter, 'player');
    this.dualFighter.body.setSize(
      this.dualFighter.width * 0.62,
      this.dualFighter.height * 0.62,
      true,
    );
    this.dualFighter.body.setAllowGravity(false);
    this.dualFighter.body.setImmovable(true);

    this.sfx.rescued.play({ volume: 0.6 });
    this.showBanner('DUAL FIGHTER', 1200);
  }

  // ----------------------------------------------------------------- combat

  onEnemyHit(enemy) {
    if (!enemy.active) return;

    this.stats = recordHit(this.stats);

    // A transform bonus ship pays for itself and, on the third kill, for the
    // set. `transformKillPoints` takes the count still alive including this
    // one, so the scene never has to know which kill completes a trio.
    if (enemy.transformSet) {
      const set = enemy.transformSet;
      const points = transformKillPoints(set.type, set.remaining);
      const { x, y } = enemy;
      set.remaining -= 1;
      this.destroyEnemy(enemy, true);

      this.addScore(points);
      // Only the set bonus is worth announcing; 160 on its own is an ordinary
      // kill. The announcement is the cabinet's: the value, in blue, where
      // the third ship died.
      if (set.remaining === 0) this.spawnScorePopup(x, y, points);
      return;
    }

    if (this.challenging) {
      this.challengingHits += 1;
      this.addScore(scoreFor(enemy.enemyType, { challenging: true }));
      this.destroyEnemy(enemy, true);
      return;
    }

    enemy.health -= 1;

    // A Boss Galaga survives its first hit and changes colour to show it.
    if (enemy.health > 0) {
      showBossDamage(enemy, this.flapFrame);
      this.sfx[deathSoundFor(enemy.enemyType, { destroyed: false })].play({ volume: 0.4 });
      return;
    }

    const points = scoreFor(enemy.enemyType, {
      diving: isDiving(enemy),
      escorts: enemy.escortCount ?? 0,
    });
    this.addScore(points);

    // The cabinet's famous blue number: a Boss Galaga shot down mid-dive
    // flashes what it paid -- 400, 800, 1600 with its escorts -- at the spot
    // it died. Formation kills stay silent; the popup is the reward for the
    // harder shot.
    if (enemy.enemyType === EnemyType.BOSS && isDiving(enemy)) {
      this.spawnScorePopup(enemy.x, enemy.y, points);
    }

    // The capture's mission-end table, decided before the sprite goes.
    //
    // A captor shot with its beam out -- or mid-pull, the L3 branch -- aborts
    // the mission and RELEASES a fighter already on the ride up. A captor
    // that owned a settled slave resolves through the pure rule: rescued
    // only when it died FLYING with the slave diving beside it (necessarily
    // on its second, blue hit -- a boss dies on no other); orphaned when it
    // died flying with the slave glued (the carry-home); rogue when it died
    // at home in the formation.
    const wasCaptor = enemy === this.captor;
    const midBeamOrPull =
      wasCaptor &&
      (isBeamDangerous(this.captureState) || this.captureState === CaptureState.CAPTURING);

    const outcome =
      enemy.captiveAttached === true
        ? resolveCaptorDestroyed(this.captureState, {
            captorFlying: enemy.mode !== EnemyMode.IN_FORMATION,
            captiveEscorting: this.captive?.escorting === true && Boolean(this.captive?.flight),
          })
        : RescueOutcome.NONE;

    this.destroyEnemy(enemy, true);

    if (midBeamOrPull) {
      this.releaseFromBeam();
    } else if (outcome === RescueOutcome.RESCUED) {
      this.addScore(CAPTURED_FIGHTER_POINTS);
      this.rescueCaptive();
    } else if (outcome === RescueOutcome.ORPHANED || outcome === RescueOutcome.ROGUE) {
      this.loseCaptive(outcome);
    }
  }

  /**
   * The captor was shot out from under its own beam, or mid-pull (`l_2327`,
   * gg1-3.s:639-649): the mission aborts, and a fighter already in the pull
   * is RELEASED -- control comes back where it hangs and NO life is lost.
   */
  releaseFromBeam() {
    const midPull = this.captureState === CaptureState.CAPTURING;
    this.captureState = transition(this.captureState, CaptureEvent.CAPTOR_DESTROYED);
    this.pull = null;

    if (midPull) {
      this.player.enableBody(true, this.player.x, this.player.y, true, true);
      this.player.setAngle(0);
      this.makeInvulnerable(1000);
    }
  }

  /**
   * The player shot their own captured fighter.
   *
   * Counts as a hit, pays 1,000, and ends the capture: the captor is unflagged
   * so that killing it later cannot rescue a ship that no longer exists, and
   * the state machine is driven to IDLE through the same `CAPTIVE_DESTROYED`
   * transition the "captor died in formation" path uses.
   */
  onCaptiveShot() {
    if (!this.captive) return;

    this.stats = recordHit(this.stats);

    // The 1,000 is for shooting your OWN fighter -- pinned to its captor or
    // diving beside it as an escort, a ship you could still have won back
    // (the L2 branch, gg1-5.s:1305-1311). A rogue already lost when its
    // captor died in formation is gone either way, so shooting it down is
    // just self-defence and pays nothing.
    if (!this.captive.rogue) {
      this.addScore(CAPTURED_FIGHTER_POINTS);
      this.spawnScorePopup(this.captive.x, this.captive.y, CAPTURED_FIGHTER_POINTS);
      if (this.captor) this.captor.captiveAttached = false;
      this.captureState = transition(this.captureState, CaptureEvent.CAPTIVE_DESTROYED);
    }

    this.spawnExplosion('enemy', this.captive.x, this.captive.y, SHIP_DRAWN_PX);
    this.sfx.explosion.play({ volume: 0.4 });

    this.clearCaptive();
  }

  /**
   * The captor died still owning its slave, without the rescue conditions.
   *
   * The O branch: killed at home in the formation, the freed slave goes
   * ROGUE -- it launches out on `db_fltv_rogefgter` (the boss table's plain
   * descent at offset 56), armed like any launched diver, and despawns off
   * the bottom for good; it never homes (gg1-5.s:1442-1456, 2516). The L1
   * branch: killed flying with the slave glued -- mid-carry -- the slave is
   * simply orphaned and lost with it.
   */
  loseCaptive(outcome) {
    this.captureState = transition(this.captureState, CaptureEvent.CAPTIVE_DESTROYED);
    if (!this.captive) return;

    this.showBanner('FIGHTER LOST', 1400);

    if (outcome === RescueOutcome.ROGUE) {
      const captive = this.captive;
      captive.rogue = true;
      captive.escorting = false;
      captive.mode = EnemyMode.DIVING;
      captive.bombMask = this.enemiesArmed() ? this.attack.bombFlags : 0;
      captive.bombCountdownMs = BOMB_ARM_FRAMES * FRAME_MS;
      captive.flight = createLiveFlight(
        createDiveFlightState(EnemyType.BOSS, { x: captive.x, y: captive.y }, SCREEN, {
          role: 'rogue',
        }),
        SCREEN,
      );
      return;
    }

    this.clearCaptive();
  }

  /**
   * Play an explosion where something just died, frame by frame.
   *
   * `kind` is `enemy` or `player` -- the two sequences in
   * `EXPLOSION_SPRITES` -- and the sprite is destroyed the moment
   * `explosionFrameAt` reports the sequence done, so a blast can never be
   * left frozen on screen. A local checkout's ripped frames are used
   * whenever they are loaded, at the same drawn size.
   */
  spawnExplosion(kind, x, y, displaySize) {
    const overrideName = kind === 'player' ? 'explosionPlayer' : 'explosionEnemy';
    const local = localArtFrames(overrideName);
    const frames = local?.length ?? frameCount(EXPLOSION_SPRITES[kind]);
    const frameMs =
      kind === 'player' ? ANIMATION.playerExplosionFrameMs : ANIMATION.enemyExplosionFrameMs;
    const textureFor = (frame) =>
      local ? local[frame % local.length] : explosionTextureKey(kind, frame);

    const burst = this.add.sprite(x, y, textureFor(0)).setDepth(7);
    burst.setDisplaySize(displaySize, displaySize);

    let elapsed = 0;
    const timer = this.time.addEvent({
      delay: frameMs,
      repeat: frames,
      callback: () => {
        elapsed += frameMs;
        const frame = explosionFrameAt(frames, frameMs, elapsed);
        if (frame === null) {
          burst.destroy();
          timer.remove();
          return;
        }
        burst.setTexture(textureFor(frame));
        burst.setDisplaySize(displaySize, displaySize);
      },
    });

    return burst;
  }

  destroyEnemy(enemy, withExplosion) {
    if (withExplosion) {
      // A boss dying draws a burst at twice a ship's size, everything else at
      // one ship: the arcade's own proportions for the two.
      this.spawnExplosion(
        'enemy',
        enemy.x,
        enemy.y,
        enemy.enemyType === EnemyType.BOSS ? SHIP_DRAWN_PX * 2 : SHIP_DRAWN_PX,
      );
      // Each rank of enemy has its own cry in the arcade, which is how a
      // player knows what they hit without looking away from their own ship.
      this.sfx[deathSoundFor(enemy.enemyType)].play({ volume: 0.4 });
    }

    if (enemy === this.captor) {
      this.captor = null;
      this.beamRomX = null;
      // The beam furls where it was left rather than blinking out; with the
      // captor gone no state can catch through it.
      if (this.beam && this.beamPhase !== 'retracting') {
        this.beamPhase = 'retracting';
        this.beamPhaseElapsed = 0;
      }
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

    this.sfx.playerDeath.play({ volume: 0.5 });
    // The death blast is authored at 32x32 against the ships' 16x16, so its
    // drawn size is two ships: the loudest thing the screen ever says.
    this.spawnExplosion('player', this.player.x, this.player.y, SHIP_DRAWN_PX * 2);

    this.player.disableBody(true, false);
    this.player.setVisible(false);
    this.loseLife();
  }

  /**
   * The active player lost a ship.
   *
   * In a one-player game this is what it always was: spend a life, respawn, or
   * end the game. In a two-player game it is also the moment the machine
   * changes hands, so the whole decision is deferred to `loseShip` in
   * `players.js` and this reads the answer off it. The three outcomes are
   * different sentences on the screen -- another ship, `GAME OVER PLAYER 1`
   * while player two carries on, or the results screen -- and nothing here
   * decides which; it only draws them.
   */
  loseLife() {
    // Read before the session moves on: this is the player who just died, and
    // by the time `loseShip` has returned, the machine may already belong to
    // somebody else.
    const flyer = this.session.active;

    this.bankTurn();
    const outcome = loseShip(this.session);
    this.session = outcome.session;
    this.lives = Math.max(this.lives - 1, 0);
    this.refreshHud();

    if (outcome.over) {
      this.endGame();
      return;
    }

    // One player is finished but the other is not. Say so, because otherwise
    // the handover looks like an ordinary change of turn and the player who is
    // out never learns that they are.
    if (outcome.retired) {
      this.showBanner(`GAME OVER\n${playerLabel(flyer)}`, 1800);
    }

    this.time.delayedCall(PLAYER.respawnDelayMs, () => {
      if (this.isGameOver) return;
      if (outcome.handedOver) {
        this.handOverTurn();
        return;
      }
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

    // The cabinet says READY over every fresh fighter, not only stage one.
    this.showBanner('READY', 900);
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
    this.bankTurn();
    this.isGameOver = true;
    this.clearTimers();
    // The board goes quiet before the results screen speaks. The attack-run
    // loop is stopped by hand because `updateDiveSound` no longer runs once the
    // game is over, and a held loop would play under the whole results screen.
    this.sfx.ambient.stop();
    this.sfx.enemyDive.stop();

    // The machine's own game does not get a results screen and never touches
    // the board: an attract loop that could write to the high-score table would
    // eventually fill it with itself.
    if (this.demo) {
      this.demoTimer?.remove();
      this.time.delayedCall(1600, () => this.endDemo());
      return;
    }

    this.time.delayedCall(1200, () => {
      // The score is banked by the results screen, not here: it is the screen
      // that asks for initials, and a run that made the board has to be written
      // once, with the name attached, rather than saved twice. The pause is
      // what it always was -- bullets already in the air still land during it,
      // and banking early left the results screen showing a score above its own
      // high score.
      this.scene.start('GameOverScene', {
        session: this.session,
        // A run played after the no-fire lock-up was against a machine that
        // could not shoot back; its score does not rank.
        scoreDisqualified: this.noFire.triggered,
      });
    });
  }

  // ----------------------------------------------------------------- update

  update(_time, delta) {
    if (this.isGameOver || this.frozen) return;

    this.updateStarfield(delta);
    this.formationElapsed += delta;

    this.updateWaveLauncher(delta);
    this.updateFormation(delta);
    this.updateAttacks(delta);
    this.updateDiveSound();
    this.updatePlayer();
    this.updatePull(delta);
    this.updateCaptive(delta);
    this.updateBeam(delta);
    this.cullProjectiles();
    this.checkStageComplete();
  }

  /**
   * Stream the sky, stop it, or run it backwards.
   *
   * The hardware field stops scrolling while no fighter is on the board --
   * between a death and the respawn -- and that stop is the most legible
   * "the world is holding its breath" cue the cabinet has. And for the few
   * frames the tractor beam is hauling the fighter UP, the whole sky
   * reverses with it: the ROM sets a reverse flag when the beam latches
   * (gg1-3.s l_236D) and clears it when the capture completes or the boss
   * is shot out of it (l_2305, l_2327), which is exactly the window our
   * CAPTURING state spans.
   */
  updateStarfield(delta) {
    const speed =
      this.captureState === CaptureState.CAPTURING
        ? STARFIELD_SCROLL.capture
        : this.player.active
          ? STARFIELD_SCROLL.game
          : 0;
    if (this.starfield.rowsPerFrame !== speed) {
      this.starfield = setStarfieldScroll(this.starfield, speed);
    }

    this.starfield = advanceStarfield(this.starfield, delta);
    this.starLayer.clear();
    for (const star of visibleStars(this.starfield, SCREEN)) {
      this.starLayer.fillStyle(star.color, 1);
      this.starLayer.fillRect(star.x, star.y, 2, 2);
    }
  }

  updateFormation(delta) {
    // The ROM's two-phase grid motion: the fly-in triangle sway until the
    // launcher raises the handoff flag, a coast back to centre, then the
    // d_1E64 bitmap pulse -- per-column X and per-row Y offsets, stepped at
    // 15 Hz. `slotPosition` reads the offsets, so every parked ship and
    // every FB home glide rides the same motion.
    this.formationMotion = advanceFormationMotion(this.formationMotion, delta, {
      handoff: this.formationHandoff,
    });

    // One wing-frame read for the whole pass: every alien on the board,
    // parked or diving, flaps on the same beat, which is what the cabinet's
    // shared frame counter did.
    const frame = flapFrameAt(this.formationElapsed);
    const flapped = frame !== this.flapFrame;
    this.flapFrame = frame;

    this.enemies.getChildren().forEach((enemy) => {
      if (!enemy.active) return;

      if (flapped && enemy.artName) {
        applyShipArt(enemy, enemy.artName, { frame });
      }

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

  /**
   * The live context the path machine's reactive tokens read each frame:
   * the swaying slot for the FB home glide and the F9/F1 re-entries, the
   * player for FE/F3/F4, the difficulty row's F0/EF switches, and the
   * scheduler's continuous-bombing flag for the FA loop gate.
   */
  liveFlightContext(enemy) {
    return {
      playerX: this.player.x,
      homeTarget: enemy.slot ? this.slotPosition(enemy.slot) : undefined,
      stage8Switch: this.difficulty.stage8PathSwitch,
      stage12Switch: this.difficulty.stage12BombingSwitch,
      continuousBombing: this.attack?.continuousBombing ?? false,
    };
  }

  advanceEnemyFlight(enemy, delta) {
    if (isLiveFlight(enemy.flight)) {
      this.advanceLiveEnemyFlight(enemy, delta);
      return;
    }

    enemy.flight = advanceFlight(enemy.flight, delta);
    const { x, y, angle } = flightTransform(enemy.flight);
    enemy.setPosition(x, y);
    // Snapped to the cabinet's sixteen sprite orientations at render time
    // only: the path underneath stays continuous, so nothing about where the
    // enemy is or what it hits changes -- just what the rotation looks like.
    enemy.setRotation(quantizeHeading(angle));

    this.updateEnemyBombs(enemy, delta);

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

  /**
   * One frame of a flight running live on the ROM's path machine: entries
   * flying their blocks onto the swaying grid, and dives running the attack
   * tables against the live player.
   */
  advanceLiveEnemyFlight(enemy, delta) {
    const { flight, events } = advanceLiveFlight(
      enemy.flight,
      delta,
      this.liveFlightContext(enemy),
    );
    enemy.flight = flight;
    const { x, y, angle } = liveFlightTransform(flight);
    enemy.setPosition(x, y);
    enemy.setRotation(quantizeHeading(angle));

    for (const event of events) {
      // F6 free flight re-arms the bomb string on every pass, exactly as
      // j_108A does at launch: the countdown and this frame's d_0909 mask.
      if (event.type === 'armBombs' && this.enemiesArmed()) {
        enemy.bombMask = this.attack.bombFlags;
        enemy.bombCountdownMs = BOMB_ARM_FRAMES * FRAME_MS;
      }
      // F4 (case_0A53): the capture dive committed its beam column -- the
      // player's sprite X clamped to the lane, held as the aim the beam is
      // anchored on for the rest of the mission.
      if (event.type === 'captureAim' && enemy === this.captor) {
        this.beamRomX = event.targetSpriteX - 10;
      }
      // F2 (case_097B): the convoy leader split a clone into a transient
      // slot from wherever it is.
      if (event.type === 'cloneSplit' && enemy.transformLeader) {
        this.spawnTransformClone(enemy, event.clone);
      }
    }

    // The capture dive's hover: once the aim is taken and the stall segment
    // is running, spin to face down and open the beam over it.
    if (enemy === this.captor && this.beamRomX !== null && !this.beam) {
      this.updateCaptureHover(enemy);
    }

    this.updateEnemyBombs(enemy, delta);

    if (!isLiveFlightDone(enemy.flight)) return;

    if (liveFlightHomed(enemy.flight) && enemy.slot) {
      // The FB glide snapped onto the slot -- entries and finished dives
      // both end here; the dive tables carry their own top re-entry.
      settleIntoFormation(enemy, this.slotPosition(enemy.slot));
      // A captor landing with its prize starts the slave's 36-frame rise to
      // its post above the boss; a surviving convoy leader reverts to the
      // ordinary bee it was.
      if (enemy === this.captor && enemy.captiveAttached && this.captiveSettled === false) {
        this.settleCaptive();
      }
      if (enemy.transformLeader) this.revertTransformLeader(enemy);
    } else if (enemy.slot) {
      // FF with no home: an authored caravan row still selecting one of the
      // token-free fly-through blocks (until Task 4's stream machine).
      // Re-enter from the top, the F8/F9 + FB idiom.
      enemy.mode = EnemyMode.RETURNING;
      enemy.flight = createFlight(
        returnPath(this.slotPosition(enemy.slot), SCREEN),
        DIVE.returnDurationMs,
      );
    } else {
      enemy.destroy();
    }
  }

  /**
   * The ROM's bomb release, not an aim band: the countdown armed at launch
   * expires every 20 frames and shifts the drop bitmask one bit; a
   * shifted-out set bit is a bomb, released only once the bomber is low in
   * the field and the player can be shot at. A set bit is held while the
   * bomber is still high -- the corpus's compensation for a replica
   * descent slower than the Z80's. Dodging works because each bomb's aim
   * is frozen at its drop (see `fireEnemyBullet`).
   *
   * A transform bonus ship flies `PASSING` because it never joins a
   * formation, but it is making an attack run, not a fly-past: the trio is
   * the highest-value target on the board and an unarmed one would be a free
   * 1,480 points. Challenging-stage enemies are `PASSING` too and are the
   * genuinely harmless case; they never have bombs to spend.
   */
  updateEnemyBombs(enemy, delta) {
    const bombing =
      enemy.mode === EnemyMode.DIVING ||
      enemy.mode === EnemyMode.ENTERING ||
      enemy.transformSet !== undefined;
    if (!bombing || enemy.bombMask <= 0) return;

    enemy.bombCountdownMs = (enemy.bombCountdownMs ?? BOMB_ARM_FRAMES * FRAME_MS) - delta;
    if (enemy.bombCountdownMs <= 0) {
      enemy.bombCountdownMs = BOMB_SPACING_FRAMES * FRAME_MS;
      const isLow = enemy.y >= BOMB_DROP_MIN_Y * ROM_TO_SCREEN && this.player.active;
      const { mask, drop } = nextBombDrop(enemy.bombMask, isLow);
      enemy.bombMask = mask;
      if (drop) this.fireEnemyBullet(enemy);
    }
  }

  /**
   * The attack-run sound, held for as long as anything is attacking.
   *
   * In the arcade this runs for the duration of a dive rather than being a
   * one-shot at the moment of launch, which is what makes a screen with four
   * attackers in the air sound different from one with a single Zako on its
   * way down. Started when the first attacker leaves the grid and stopped by
   * `updateFormation` once the sky is clear again, so overlapping dives share
   * one voice instead of stacking a copy per diver.
   */
  beginDiveSound() {
    if (this.sfx.enemyDive.isPlaying) return;
    this.sfx.enemyDive.play({ volume: 0.25, loop: true });
  }

  /** Stop the attack-run loop once nothing is flying at the player. */
  updateDiveSound() {
    if (!this.sfx.enemyDive.isPlaying) return;
    const attacking = this.enemies.getChildren().some((enemy) => enemy.active && isDiving(enemy));
    if (!attacking) this.sfx.enemyDive.stop();
  }

  /**
   * The texture and drawn box for a projectile, local rip or shipped image.
   *
   * A local projectile is sized by display to exactly the box the shipped
   * image's scale produces, so hitboxes and read distance stay identical.
   */
  projectileArt(localName, shippedKey, scale) {
    const local = localArtFrames(localName);
    const key = local && this.textures.exists(local[0]) ? local[0] : shippedKey;
    return { key, drawnPx: SPRITE_SOURCE_PX * scale };
  }

  fireEnemyBullet(enemy) {
    if (this.enemyBullets.countActive(true) >= DIVE.maxBombs) return;

    const art = this.projectileArt('enemyLaser', 'laser', SPRITE_SCALE.laser);
    const bullet = this.enemyBullets.create(enemy.x, enemy.y + 18, art.key);
    bullet.setDisplaySize(art.drawnPx, art.drawnPx);
    bullet.body.setAllowGravity(false);

    this.sfx.enemyFire.play({ volume: 0.2 });
    // The ROM's frozen aimed shot: the bomb falls at the cabinet's fixed
    // rate and its sideways slope is `clamp(+-3, 5 dx/dy)` toward where the
    // player IS at the drop, never updated after -- aimed where you were,
    // which is why moving under a dive is a decision and standing still is
    // not. The slope ratio is scale-invariant; the clamp and fall rate are
    // ROM px/frame, converted through the x3 adapter and the frame rate.
    const vx =
      bombAimVx(this.player.x - bullet.x, this.player.y - bullet.y) * ROM_TO_SCREEN * PATHCODE_FPS;
    const vy = BOMB_FALL_PER_FRAME * ROM_TO_SCREEN * PATHCODE_FPS;
    bullet.setVelocity(vx, vy);
  }

  updatePlayer() {
    if (!this.player.active) return;

    // In a demo the stick is held by `demoInput`, which is a pure function of
    // the board and lives in `src/systems/demo.js`. It drives the same fields a
    // player's keys drive, so nothing downstream of here knows the difference --
    // the demo is subject to the two-shot limit, the beam and everything else.
    // A hand on the keys, a hand on a pad and a finger on the glass all hold
    // the same two-way stick; `mergeHeld` resolves them the way the leaf
    // switches would.
    const held = this.demo
      ? demoInput(this.demoBoard())
      : {
          ...mergeHeld(
            {
              left: this.keys.left.isDown || this.keys.altLeft.isDown,
              right: this.keys.right.isDown || this.keys.altRight.isDown,
            },
            padHeld(this.padState()),
            touchSteer(
              this.steerPointer?.isDown ? this.steerPointer.x : null,
              this.player.x,
            ),
          ),
          fire: false,
        };

    const { left, right } = held;
    if (held.fire) this.fire();
    this.player.setVelocityX(((right ? 1 : 0) - (left ? 1 : 0)) * PLAYER.speed);

    // World bounds stop the *body*, which is deliberately narrower than the
    // frame the ship is drawn in, so on its own it would let the wingtips slide
    // off the edge of the screen. Clamping the sprite keeps the whole fighter
    // visible without widening the hitbox back out.
    // A docked wingman is part of the ship the player is flying, so the pair is
    // clamped together rather than letting the second ship leave the field.
    const halfShip = SHIP_DRAWN_PX / 2;
    const rightLimit =
      SCREEN.width - halfShip - (this.dualFighter ? DUAL_FIGHTER_OFFSET_X : 0);
    this.player.x = Phaser.Math.Clamp(this.player.x, halfShip, rightLimit);

    if (this.dualFighter) {
      this.dualFighter.setPosition(this.player.x + DUAL_FIGHTER_OFFSET_X, this.player.y);
    }
  }

  /**
   * Galaga's two-bullet limit, doubled while the dual fighter is docked. It is
   * the central constraint of the game: it makes the hit-miss ratio meaningful
   * and stops the player from holding down fire.
   *
   * The limit is the *only* gate. There is deliberately no rate-of-fire timer:
   * in the arcade a shot that connects frees its slot immediately, so accurate
   * close-range play is rewarded with a faster gun. A flat cooldown, which an
   * earlier revision had at 180ms, severs that link and is what makes most
   * clones feel sluggish. What stops the player holding down fire is that each
   * miss occupies a slot until it flies off the top of the screen.
   */
  fire() {
    // Fired from a key event rather than from `update`, so this has to check
    // for itself that there is a ship to fire from: a dead player between
    // respawns, a game already over, or a machine the freeze switch has
    // stopped, would otherwise still shoot.
    if (this.isGameOver || this.frozen || !this.player.active) return;
    if (this.bullets.countActive(true) >= bulletLimit(this.captureState)) return;

    this.spawnBullet(this.player.x);
    let shots = 1;

    if (this.dualFighter) {
      this.spawnBullet(this.dualFighter.x);
      shots = 2;
    }

    this.stats = recordShot(this.stats, shots);
    this.sfx[playerShotSound(this.shotIndex)].play({ volume: 0.3 });
    this.shotIndex += 1;
  }

  spawnBullet(x) {
    const art = this.projectileArt('playerLaser', 'bullet', SPRITE_SCALE.bullet);
    const bullet = this.bullets.create(x, this.player.y - 26, art.key);
    bullet.setDisplaySize(art.drawnPx, art.drawnPx);
    bullet.body.setAllowGravity(false);
    bullet.setVelocityY(-PLAYER.bulletSpeed);
  }

  /**
   * The beam clock, the ROM's three modes: grow (11 strips at the stage's
   * frames-per-strip), the fixed 64-frame grab window, shrink. The cone is
   * anchored on the aimed column and never follows the boss. The grab test
   * runs every frame of the window and never outside it -- a pure +/-27
   * ROM px positional check, with NO drag: the player keeps full control
   * until the instant they are caught.
   */
  updateBeam(delta) {
    if (!this.beam) return;

    this.beamPhaseElapsed += delta;
    this.beamTotalElapsed += delta;
    this.drawBeam();

    if (this.beamPhase === 'opening' && this.beamPhaseElapsed >= this.beamClock.openMs) {
      this.beamPhase = 'active';
      this.beamPhaseElapsed = 0;
      this.captureState = transition(this.captureState, CaptureEvent.BEAM_FULL);
    }

    if (this.beamPhase === 'active') {
      if (
        this.captureState === CaptureState.BEAM_ACTIVE &&
        this.canBeHurt() &&
        beamCatches('active', this.beamRomX, this.player.x / ROM_TO_SCREEN)
      ) {
        this.capturePlayer();
        return;
      }
      if (this.beamPhaseElapsed >= this.beamClock.holdMs) this.closeBeam();
      return;
    }

    // The furl plays out where the beam was left and then the object goes.
    if (this.beamPhase === 'retracting' && this.beamPhaseElapsed >= this.beamClock.retractMs) {
      this.clearBeam();
    }
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
    // The ROM's own gate (gctl_supv_stage): no active enemies AND the wave
    // launcher done. Enemies now spawn as the stream walks, so an empty
    // board mid-launch is not a cleared stage.
    if (this.waveLauncher && !this.waveLauncher.done) return;
    if (this.formationElapsed < 2000) return;
    this.completeStage();
  }

  // ---------------------------------------------------------------- helpers

  slotPosition(slot) {
    // The motion machine's offsets are ROM px; the x3 adapter scales them.
    // With the ROM's own 16-px column pitch (spacingX 48) the peak spread
    // lands the outer sprite exactly on the screen edge, so no clamp is
    // needed -- the geometry is the cabinet's.
    const offset = slotMotionOffset(this.formationMotion, slot, ROM_TO_SCREEN);

    return slotWorldPosition(slot, {
      centreX: SCREEN.width / 2,
      topY: FORMATION.topY,
      spacingX: FORMATION.spacingX,
      spacingY: FORMATION.spacingY,
      offsetX: offset.x,
      offsetY: offset.y,
    });
  }

  addScore(points) {
    const previous = this.score;
    this.score += points;

    const earned = extraLivesEarned(previous, this.score, this.bonusScheme);
    if (earned > 0) {
      this.lives += earned;
      this.showBanner('EXTRA LIFE', 900);
      this.sfx.extraLife.play({ volume: 0.5 });
    }

    if (this.score > this.highScore) this.highScore = this.score;
    this.refreshHud();
  }

  showBanner(text, durationMs) {
    this.bannerText.setText(text).setVisible(true);
    this.time.delayedCall(durationMs, () => this.bannerText.setVisible(false));
  }

  /**
   * A point value printed where the points were earned, the cabinet's way.
   *
   * Small, blue, and short-lived: the arcade flashes 400/800/1600 at the spot
   * a diving boss died and the bonus values where a transform trio finished,
   * and the number is gone again inside a second. Purely visual -- the score
   * was already added by the caller.
   */
  spawnScorePopup(x, y, value) {
    const popup = arcadeText(this, x, y, String(value), { tint: 0x66ccff }).setOrigin(0.5).setDepth(25);
    this.time.delayedCall(1000, () => popup.destroy());
  }

  refreshHud() {
    this.drawScores();
    this.highScoreText.setText(String(this.highScore));
    this.drawLives();
    this.drawFlags();
  }

  /**
   * Both score columns, and the blink that says which of them is live.
   *
   * The active player's column reads the live score; the other reads whatever
   * was banked when their turn ended, so a player watching their opponent can
   * see exactly how far ahead they need to get.
   */
  drawScores() {
    this.session.players.forEach((player, index) => {
      const live = index === this.turnOwner;
      this.playerScores[index].setText(String(live ? this.score : player.score));
    });

    // The blink follows the ship, not the session: it marks who is flying, and
    // through the pause after a death nobody has taken over yet.
    if (this.blinkingColumn === this.turnOwner) return;
    this.blinkingColumn = this.turnOwner;

    this.playerBlinks.forEach((blink, index) => {
      if (index === this.turnOwner) {
        blink.restart();
        return;
      }
      blink.pause();
      this.playerHeadings[index].setAlpha(1);
    });
  }

  drawLives() {
    this.lifeIcons.forEach((icon) => icon.destroy());
    this.lifeIcons = [];

    // Spaced wider than the icons are drawn, so a row of spare ships reads as
    // separate ships rather than one smear, and capped at the number that fits
    // beside the stage flags: a player on a good run can bank more spare ships
    // than the row is wide, and the arcade stops drawing them rather than
    // running them into the flags.
    const shown = Math.min(Math.max(this.lives - 1, 0), LIFE_ICONS_SHOWN);

    for (let i = 0; i < shown; i += 1) {
      const icon = this.add
        .image(
          16 + i * 36,
          SCREEN.height - 14,
          shipTextureKey('player', SHIP_ART.lifeIconPixelSize),
        )
        .setOrigin(0, 1)
        .setDepth(20);

      this.lifeIcons.push(applyShipArt(icon, 'player', { pixelSize: SHIP_ART.lifeIconPixelSize }));
    }
  }

  /**
   * Build one flag texture per denomination.
   *
   * Generated rather than loaded because the repo ships no flag artwork. Each
   * is drawn once into a texture and then instanced as an image, so a stage
   * showing nine flags costs nine sprites rather than nine redraws.
   */
  drawFlags() {
    this.flagIcons.forEach((icon) => icon.destroy());
    this.flagIcons = [];

    // Laid out right to left, highest denomination outermost, which is the
    // order `stageFlags` returns them in.
    let x = SCREEN.width - 12;
    for (const flag of stageFlags(this.stage)) {
      for (let i = 0; i < flag.count; i += 1) {
        // A ripped flag, when the local directory has one, drawn into
        // exactly the box the generated flag occupies.
        const local = localArtFrames(`flag${flag.value}`);
        const key =
          local && this.textures.exists(local[0]) ? local[0] : flagTextureKey(flag.value);
        const icon = this.add.image(x, SCREEN.height - 14, key).setOrigin(1, 1).setDepth(20);
        if (key !== flagTextureKey(flag.value)) {
          icon.setDisplaySize(FLAG_DRAWN_WIDTH, FLAG_ART.height * FLAG_ART.pixelSize);
        }
        this.flagIcons.push(icon);
        // Ones are drawn shoulder to shoulder, as the arcade does; the larger
        // denominations get a little air so the groups stay countable.
        x -= flag.value === 1 ? FLAG_DRAWN_WIDTH + 2 : FLAG_DRAWN_WIDTH + 6;
      }
    }
  }

  clearTimers() {
    // The bonus-bee flash rides a clock event; anything mid-flash unwinds.
    this.bonusBee?.timer?.remove();
    if (this.bonusBee) {
      this.bonusBee.timer = null;
      this.bonusBee.bee = null;
    }
    // The wave launcher and the attack scheduler are not timers, but they
    // stop with them.
    this.waveEnabled = false;
    this.attackActive = false;
  }
}

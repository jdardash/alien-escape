/**
 * Tuning constants.
 *
 * The original code scattered these through an 867-line scene, which is how it
 * ended up computing a formation boundary as `height / 2` in one place and
 * `height / 3` in two others. One home for them makes that class of drift
 * visible.
 */

/**
 * The play field, portrait.
 *
 * Galaga runs on a vertically mounted monitor at 224 x 288 (the 288 x 224
 * hardware raster rotated a quarter turn), so the field is taller than it is
 * wide at 7:9. This is exactly three times that, which keeps the arcade
 * proportion to the pixel while being large enough that 15-18px HUD text is
 * legible after `Phaser.Scale.FIT` letterboxes it into a browser window.
 *
 * An earlier revision ran 800 x 700, near-square landscape. Dives were short,
 * the player had far too much horizontal room relative to vertical, and the
 * formation looked squat: the single most obviously wrong thing about the
 * build. Everything below that was tuned against that width has been rescaled
 * by 672/800 so the game reads the same, only taller.
 */
export const SCREEN = { width: 672, height: 864 };

/**
 * The square the sprite artwork is authored at.
 *
 * Every `setScale` in the game is a drawn size divided by this, so it is the
 * one number to change if the artwork is ever re-exported at another size.
 *
 * It was 1024 and is now 128. Nothing on screen is larger than about 100px, so
 * the old artwork supplied roughly twenty times the pixels any of it could
 * show, and the eleven textures together asked the GPU for 51 MB to draw a
 * 672 x 864 field. That is not a frame-rate problem, the game rendered fine,
 * but it is a startup problem: on a machine with little memory free the
 * allocation is what pushes the browser into swapping.
 */
export const SPRITE_SOURCE_PX = 128;

/**
 * How far the background tile is blown up when drawn.
 *
 * The starfield is authored 512 x 2048 rather than at its drawn size because a
 * TileSprite whose texture is not a power of two makes Phaser allocate a padded
 * one behind it: at the previous 750 x 3000 that was a 1024 x 4096 texture,
 * 16 MB, for every TileSprite in the game. 512 x 2048 holds the original's 1:4
 * aspect exactly, so scaling the tile by 750/512 puts the starfield back at the
 * size it always drew at, from a quarter of the memory and none of the padding.
 */
export const BACKGROUND_TILE_SCALE = 750 / 512;

/**
 * How far the starfield drifts up each frame, in screen pixels.
 *
 * `tilePositionY` is measured in texture pixels rather than screen ones, and
 * the tile is now drawn `BACKGROUND_TILE_SCALE` times larger than it is stored,
 * so a scene scrolling by this has to divide by that scale to move the
 * starfield the distance it always moved.
 */
export const BACKGROUND_SCROLL_PX = { game: 0.6, title: 0.4 };

/**
 * The pixel art, and how big each use of it is drawn.
 *
 * Every ship in the game -- the fighter, the fighter a boss takes, and the
 * three ranks of enemy -- is a 16 x 16 grid in `src/art/pixelArt.js` rather
 * than a PNG. `pixelSize` is screen pixels per art pixel, so the gameplay
 * sprites come out at 48px: a shade under the formation's 57px column spacing,
 * which is what keeps the assembled grid a grid rather than a solid block.
 *
 * Each size is generated as its own texture at exactly its drawn size and used
 * at scale 1. Scaling a generated pixel texture would resample the pixels it
 * was authored to keep, which is the whole reason for drawing it a pixel at a
 * time.
 */
export const SHIP_ART = {
  /** In formation and in the air. 16 x 3 = 48px. */
  pixelSize: 3,
  /** The spare-ship icons along the bottom of the HUD. 32px. */
  lifeIconPixelSize: 2,
  /** The ship sitting under the title. 80px. */
  titlePixelSize: 5,
};

/** How wide a gameplay ship is drawn, for anything that has to lay out around one. */
export const SHIP_DRAWN_PX = 16 * SHIP_ART.pixelSize;

export const PLAYER = {
  speed: 270,
  y: SCREEN.height - 70,
  bulletSpeed: 760,
  respawnDelayMs: 1600,
  invulnerableMs: 2000,
  startingLives: 3,
};

/**
 * Formation geometry and the timing of the wave that assembles it.
 *
 * The spacing is set against the sprites' drawn size rather than by eye: the
 * artwork is opaque out to the edge of its frame, so any spacing tighter than
 * a sprite's display width shows as a solid block of overlapping ships rather
 * than a grid. Breathing widens that spacing, so the amplitude has to leave
 * headroom for it too.
 *
 * On a 672-wide field the ten-column grid is the binding constraint. At peak
 * inhale the outermost column sits at
 * `width / 2 + 4.5 * spacingX * (1 + breathAmplitude) + swayAmplitude`, and
 * that has to stay inside `width - margin`. `tests/formation.test.js` pins it.
 */
export const FORMATION = {
  topY: 110,
  spacingX: 57,
  spacingY: 60,
  breathPeriodMs: 4200,
  breathAmplitude: 0.08,
  swayPeriodMs: 7000,
  swayAmplitude: 14,
  margin: 26,
  /** Time for an enemy to fly its entry path into formation. */
  entryDurationMs: 2600,
  /** Gap between successive enemies within one entry flight, single file. */
  entryStaggerMs: 160,
  /** Gap between one entry flight setting off and the next one following. */
  groupIntervalMs: 2200,
};

/**
 * Where the lowest row of the assembled formation sits.
 *
 * Kept next to the layout it is derived from so that moving the grid moves
 * everything measured against it, rather than leaving a screen fraction
 * somewhere else quietly pointing into the middle of the formation.
 */
export const FORMATION_BOTTOM_Y = FORMATION.topY + 4 * FORMATION.spacingY;

export const DIVE = {
  durationMs: 3000,
  returnDurationMs: 1500,
  bombChance: 0.65,
  bombSpeed: 360,
  /**
   * How far into a run an attacker releases its bomb.
   *
   * A fixed point in the run rather than a per-frame roll, so the release
   * happens at the same place on any refresh rate. A held fighter diving with
   * its captor uses the same fraction, which is what lands the pair of shots
   * together.
   */
  bombAtProgress: 0.3,
  /**
   * How many enemy bombs may exist at once.
   *
   * The arcade reserves exactly eight hardware sprites for enemy shots, and
   * that ceiling is a real part of the difficulty: however many attackers are
   * on screen, only eight bombs can be in the air. Without it, the late stages
   * degenerate into an unreadable curtain rather than getting harder.
   */
  maxBombs: 8,
};

export const CAPTURE = {
  /** How often a boss may attempt a beam, once the stage allows it. */
  attemptIntervalMs: 12000,
  descendDurationMs: 2200,
  /**
   * How far down a boss comes to open its beam.
   *
   * The arcade boss "peels off and dives straight down... stops two inches
   * above the bottom of the screen" before the beam fans out. It has to come
   * down into the player's half of the field, because the threat of the beam
   * is that it arrives where the player already is and has to be steered
   * around. Opening it at mid-screen, as an earlier revision did, left a
   * hazard hanging in space that could be ignored by simply not flying up.
   *
   * Measured back from the player's row rather than forward from the
   * formation, since it is the distance to the player that the mechanic is
   * about: 200px is roughly a second and a half of dodging time.
   */
  descendToY: PLAYER.y - 200,
  beamOpenMs: 700,
  beamHoldMs: 2600,
  /** Width of the column that catches the player. */
  beamWidth: 76,
  /**
   * How far the beam reaches below its boss.
   *
   * Sized to run from the mouth of the beam to the bottom edge of the screen,
   * which is what the fan-shaped field does in the arcade, and which is what
   * makes standing anywhere in the boss's column a decision. The artwork is a
   * cone taller than the screen, so it is scaled to this rather than by eye.
   */
  beamLength: 250,
  /** Gap between the boss and the mouth of its beam. */
  beamOffsetY: 26,
  /**
   * How far up the beam the player has to be dragged to be taken.
   *
   * With the beam mouth at `descendToY + beamOffsetY` this leaves the player
   * about a second of being pulled before the capture commits, which is the
   * window to fly out sideways.
   */
  captureDepth: 80,
  pullStrength: 90,
  captureRiseMs: 1000,
  dockDurationMs: 1400,
  /** How far below its captor a held fighter is drawn. */
  captiveOffsetY: 34,
  /**
   * How often a boss holding a captured fighter is picked to lead the dive.
   *
   * The captive only comes back if its captor is destroyed on a dive, so a
   * captor that never leaves formation makes the rescue unreachable. Weighting
   * the pick toward it keeps the second half of the mechanic in play instead
   * of leaving it to a one-in-forty draw.
   */
  captorDiveChance: 0.6,
  /** How long a captive shot free of its captor takes to fall off screen. */
  captiveEscapeMs: 1400,
};

/** Horizontal gap between the player's ship and a docked dual fighter. */
export const DUAL_FIGHTER_OFFSET_X = 29;

/**
 * How many spare-ship icons the HUD will draw.
 *
 * The extra-life ladder has no ceiling, so a long run banks more ships than the
 * bottom of the screen is wide. Five is what fits to the left of the stage
 * flags; beyond that the count is still there, it is just no longer drawn.
 */
export const LIFE_ICONS_SHOWN = 5;

/**
 * Drawn sizes, in screen pixels, over the square the *loaded* artwork is
 * authored at.
 *
 * Only the effects and projectiles are loaded now. Every ship is generated
 * from `src/art/pixelArt.js` at its drawn size and used at scale 1, so it has
 * no entry here; see `SHIP_ART`.
 */
export const SPRITE_SCALE = {
  bullet: 38.912 / SPRITE_SOURCE_PX,
  laser: 43.008 / SPRITE_SOURCE_PX,
  explosion: 51.2 / SPRITE_SOURCE_PX,
  /** A boss dying draws a bigger burst than a Zako does. */
  bossExplosion: 86.016 / SPRITE_SOURCE_PX,
  /** The player's own death, bigger again. */
  playerExplosion: 102.4 / SPRITE_SOURCE_PX,
};

/** Enemy hit points. A Boss Galaga survives its first hit. */
export const ENEMY_HEALTH = {
  boss: 2,
  goei: 1,
  zako: 1,
};

/**
 * A Boss Galaga's two health states, as the sprite drawn for each.
 *
 * The arcade boss is green while it still has both hit points and changes
 * colour the moment it takes the first one, which is the player's only cue
 * that a second shot is needed. Sources agree on the green and disagree on
 * whether the damaged colour is blue or purple, so this takes purple.
 *
 * These are two palettes over one grid rather than two drawings; see `BOSS`
 * in `src/art/pixelArt.js` for why. An earlier revision laid a green tint over
 * purple PNG artwork, which read correctly from a distance and flattened the
 * shading up close.
 */
export const BOSS_SPRITE = { healthy: 'boss', damaged: 'bossDamaged' };

/**
 * Transform bonus enemies.
 *
 * From stage 4 the arcade periodically pulls a Zako out of the grid, pulsates
 * it, and turns it into a trio of high-value bonus ships that attack and then
 * leave. The pulse is not decoration: it is the only warning the player gets,
 * and it is long enough here to be acted on.
 *
 * All three are drawn as pixel art in `src/art/pixelArt.js` rather than
 * loaded: the repo ships no PNG for a Scorpion, a Bosconian Spy Ship or a
 * Galaxian Flagship, and the stand-in that preceded it -- an existing enemy
 * silhouette filled with a flat colour -- made all three the same ship in
 * three colours. The colours follow the sourced descriptions where there is
 * one: Scorpions are yellow, Spy Ships green, and the Flagship keeps
 * Galaxian's blue with red wingtips.
 */
export const TRANSFORM = {
  /** How often the game may pull a Zako out, once the stage allows it. */
  intervalMs: 15000,
  /** Warning pulse before the change. */
  pulseDurationMs: 260,
  pulseRepeats: 5,
  /** How long the trio's attack run lasts. */
  runDurationMs: 3400,
  /** Horizontal gap between the three ships as they set off. */
  spacingX: 44,
  /**
   * Screen pixels per art pixel.
   *
   * The grids are 16 x 16, so this draws a bonus ship at 48px against a Zako's
   * 46: a shade larger, which is right for the thing on the board worth a
   * thousand points. Generated at its drawn size and used at scale 1, so the
   * pixels stay square instead of being resampled.
   */
  pixelSize: 3,
};

/**
 * The stage flags along the bottom-right of the HUD.
 *
 * The arcade draws one small flag per denomination rather than a number, and
 * the colour is how a player tells a 30 from a 50 at a glance.
 *
 * `width` and `height` are in *authored* pixels: the six flags are pixel art
 * in `src/art/pixelArt.js`, drawn `pixelSize` screen pixels to the art pixel,
 * so a flag occupies 20 x 24 on screen. An earlier revision drew them as two
 * filled rectangles at those screen dimensions, which is why the numbers moved
 * here rather than changing.
 *
 * The colours are chosen for separation on a black field and are not claimed
 * to match the cabinet's palette, which could not be sourced -- which is why
 * each denomination also carries its own banner motif. The *shape* and the
 * one-flag-per-denomination arrangement are the authentic parts; the
 * denominations themselves come from `stageFlags` and are sourced.
 */
export const FLAG_ART = {
  width: 10,
  height: 12,
  pixelSize: 2,
  colors: {
    1: 0x66ddff,
    5: 0xffdd44,
    10: 0x44ff88,
    20: 0xff7744,
    30: 0xff55aa,
    50: 0xffcc00,
  },
};

export const CHALLENGING = {
  /** Enemies fly through without stopping; nothing shoots back. */
  passDurationMs: 4200,
  /** Gap between successive enemies within one wave, single file. */
  staggerMs: 150,
  /**
   * Gap between one wave of eight setting off and the next.
   *
   * The bonus round is five waves of eight, not one stream of forty. The
   * interval is what makes it readable: a wave traces its route and is mostly
   * clear before the next one enters, so the player can lead the line and take
   * all eight rather than spraying at a continuous blur.
   */
  groupIntervalMs: 2400,
};

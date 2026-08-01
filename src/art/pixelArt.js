/**
 * Hand-authored sprite artwork, as pixel grids.
 *
 * Every ship in the game is drawn here: the player's fighter and the fighter a
 * Boss Galaga takes from them, the three ranks of enemy, and the Scorpion, Spy
 * Ship and Flagship the transform bonus cycles through, plus the six stage
 * flags along the bottom of the HUD.
 *
 * All of it is original pixel art authored at 16 x 16, the size the arcade's
 * own sprites are, and turned into textures at run time. That replaced two
 * different stand-ins: bonus ships drawn as an existing enemy silhouette filled
 * with a flat colour, which made three different ships one shape in three
 * colours, and a set of PNGs of the arcade's own enemies, which is Bandai
 * Namco's artwork and has no business in a public repository with a live demo.
 *
 * Authoring the art as data rather than as PNGs means the shapes are reviewable
 * in a diff and testable without a canvas, which is what lets
 * `tests/pixelArt.test.js` assert that every ship is symmetric about its centre
 * line -- the failure mode of hand-edited pixel grids.
 *
 * Nothing here is traced from the original ROM. The silhouettes follow the
 * published descriptions of each ship: a blue-and-yellow bee, a red butterfly
 * with blue wings, a green Boss Galaga that turns blue on its first hit, a
 * yellow scorpion, a green Bosconian station, a blue Galaxian flagship with
 * red wingtips, and a captured fighter that goes red.
 */

import { FLAG_ART } from '../config.js';

/**
 * Turn a grid of characters into placed, coloured pixels.
 *
 * `.` is transparent. Every other character must appear in the palette, which
 * is deliberately strict: a typo in a hand-authored grid should fail loudly at
 * startup rather than silently punch a hole in a ship.
 */
export function parsePixelArt(rows, palette) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('parsePixelArt requires at least one row');
  }

  const width = rows[0].length;
  if (width === 0) throw new Error('parsePixelArt requires a non-empty row');
  if (rows.some((row) => row.length !== width)) {
    throw new Error('parsePixelArt requires a rectangular grid');
  }

  const pixels = [];

  rows.forEach((row, y) => {
    [...row].forEach((character, x) => {
      if (character === '.') return;

      const color = palette[character];
      if (color === undefined) {
        throw new Error(`parsePixelArt has no palette entry for "${character}"`);
      }

      pixels.push({ x, y, color });
    });
  });

  return { width, height: rows.length, pixels };
}

/**
 * The Zako, the bee that fills the bottom two rows of the formation.
 *
 * Blue hull with a pair of antennae above and legs below, and the wide flat
 * yellow wings that are how a Zako is told from a Goei at the far end of a
 * dive, when neither is much more than a shape.
 */
const ZAKO = {
  rows: [
    '.....d....d.....',
    '......d..d......',
    '.....dccccd.....',
    '....dcwccwcd....',
    '....dcwccwcd....',
    '....dccccccd....',
    '..yydccccccdyy..',
    '.yyydccccccdyyy.',
    '.yyydccddccdyyy.',
    '..yydccccccdyy..',
    '....dccccccd....',
    '.....dccccd.....',
    '.....dccccd.....',
    '.....dc..cd.....',
    '....d......d....',
    '...d........d...',
  ],
  palette: {
    c: 0x38a8f0,
    d: 0x123c78,
    w: 0xffffff,
    y: 0xf0c020,
  },
};

/**
 * The Goei, the red butterfly of the two middle rows.
 *
 * Same body plan as the Zako -- they are the same creature one rank up -- but
 * red instead of blue, and with blue wings that sweep back to a point rather
 * than standing straight out. The taper is the silhouette cue: a Goei is
 * widest at its shoulders, a Zako is widest at its waist.
 */
const GOEI = {
  rows: [
    '.....dd..dd.....',
    '.....drrrrd.....',
    '.b..drwrrwrd..b.',
    '.bb.drrrrrrd.bb.',
    '.bbbdrrrrrrdbbb.',
    '.bbbdrrrrrrdbbb.',
    '.bbbdrdrrdrdbbb.',
    '..bbdrrrrrrdbb..',
    '...bdrrrrrrdb...',
    '....drrrrrrd....',
    '....drrrrrrd....',
    '....drrrrrrd....',
    '.....drrrrd.....',
    '.....drrrrd.....',
    '.....dr..rd.....',
    '....d......d....',
  ],
  palette: {
    r: 0xf03028,
    d: 0x8c1810,
    w: 0xffffff,
    b: 0x3878f0,
  },
};

/**
 * The Boss Galaga. The widest thing on the board, and the only enemy that
 * survives a hit.
 *
 * One grid, two palettes. The arcade boss is green while it still has both of
 * its hit points and changes colour the moment it takes the first, which is the
 * player's only cue that a second shot is needed; sources agree on the green
 * and disagree on whether the damaged colour is blue or purple. Keeping the
 * silhouette identical between the two is what makes the change read as damage
 * rather than as a different enemy, and driving it from one `rows` means the
 * two states cannot drift a pixel apart.
 *
 * This replaced a green `setTint` laid over purple artwork, which had the same
 * effect from a distance and flattened the shading up close.
 */
const BOSS_ROWS = [
  '...k........k...',
  '...kg......gk...',
  '...kgk....kgk...',
  '....kggggggk....',
  '...kgwggggwgk...',
  '..kggwggggwggk..',
  '.kggggggggggggk.',
  'kggwwggggggwwggk',
  'kgggggeggegggggk',
  '.kggggeggeggggk.',
  '.kggggggggggggk.',
  '..kggggggggggk..',
  '...kggggggggk...',
  '....kggggggk....',
  '.....kggggk.....',
  '......kkkk......',
];

const BOSS = {
  rows: BOSS_ROWS,
  palette: { g: 0x3cdc50, k: 0x0e5a20, w: 0xd8ffe0, e: 0x0c2a12 },
};

/**
 * The same boss, once it has taken the first of its two hits.
 *
 * Blue, not the purple this used to be. The two were a coin toss between
 * sources that disagreed, until a ROM-level account settled it: "the first hit
 * changes the boss's palette from green to blue". Deep enough in the blue to be
 * unmistakable against the Zako's lighter cyan, which is the one confusion the
 * change could cause.
 */
const BOSS_DAMAGED = {
  rows: BOSS_ROWS,
  palette: { g: 0x3c78f0, k: 0x102a78, w: 0xd8e4ff, e: 0x0a1230 },
};

/**
 * The player's fighter: a white hull with red wings and a lit cockpit,
 * narrowing to a single point at the nose.
 *
 * The point matters. The fighter is the one sprite on screen that has to be
 * located exactly rather than approximately, because every dodge is measured
 * against it, so the tip is one pixel wide and the widest part of the ship sits
 * low where the wings are.
 */
const PLAYER_ROWS = [
  '.......ww.......',
  '.......ww.......',
  '......wwww......',
  '......wrrw......',
  '......wrrw......',
  '.....wwrrww.....',
  '.....wbrrbw.....',
  '.....wbrrbw.....',
  '..w..wwrrww..w..',
  '..w..wwrrww..w..',
  '..w.rwwrrwwr.w..',
  '.rw.rwwrrwwr.wr.',
  'rrwwrwwrrwwrwwrr',
  'rrwwwwwrrwwwwwrr',
  'r.wwwwwwwwwwww.r',
  '....k..kk..k....',
];

const PLAYER_SHIP = {
  rows: PLAYER_ROWS,
  palette: { w: 0xf0f0f8, r: 0xf04038, b: 0x40b8f8, k: 0xff8800 },
};

/**
 * The same fighter, once a Boss Galaga is holding it.
 *
 * The arcade draws the captured ship recognisably as your own, which is the
 * point of the mechanic: the thing hanging under that boss is the life you
 * just lost. It keeps the silhouette exactly and changes colour, which is what
 * lets the player tell it apart at a glance from the ship they are still flying
 * -- and they need to, because there is a real decision to make about it: shoot
 * it for 1,000 and lose it, or hunt the captor down for the dual fighter.
 *
 * Red, on the ROM's own account: on capture the fighter "recolors to red
 * (sprite code 7)" and holds that colour for as long as a boss has it. An
 * earlier revision drew it drained -- grey hull, violet wings -- which read
 * well and was not what the cabinet does.
 */
const CAPTIVE_SHIP = {
  rows: PLAYER_ROWS,
  palette: { w: 0xf04038, r: 0x9c1810, b: 0xff8878, k: 0x701008 },
};

/**
 * Every ship texture the game builds, keyed by the name it is drawn under.
 *
 * The three enemy keys are the `EnemyType` values, so `createEnemy` can go
 * straight from a formation slot to its artwork without a lookup table in
 * between.
 */
export const SHIP_SPRITES = {
  zako: ZAKO,
  goei: GOEI,
  boss: BOSS,
  bossDamaged: BOSS_DAMAGED,
  player: PLAYER_SHIP,
  captive: CAPTIVE_SHIP,
};

/**
 * The ships that carry a silhouette of their own.
 *
 * `bossDamaged` and `captive` are deliberately excluded: they are recolours of
 * `boss` and `player` and are *supposed* to share a shape. Listing the four
 * that are not lets `tests/pixelArt.test.js` insist the rest are all different
 * without contradicting that.
 */
export const DISTINCT_SHIP_SILHOUETTES = ['zako', 'goei', 'boss', 'player'];

/** Recolours, and the sprite each one has to stay pixel-identical to. */
export const SHIP_RECOLOURS = { bossDamaged: 'boss', captive: 'player' };

/**
 * The Scorpion, stages 4-6. Sourced as yellow.
 *
 * Drawn from above with its claws forward and its tail curled underneath, so
 * the stinger is the part pointing at the player.
 */
const SCORPION = {
  rows: [
    '..kk........kk..',
    '.kYYk......kYYk.',
    '.kYrk......krYk.',
    '..kYk......kYk..',
    '...kYk....kYk...',
    '....kYYkkYYk....',
    '.....kYYYYk.....',
    '....kYYooYYk....',
    '....kYoYYoYk....',
    '....kYYooYYk....',
    '.....kYYYYk.....',
    '......kYYk......',
    '......kYYk......',
    '.....kYrrYk.....',
    '......krrk......',
    '.......rr.......',
  ],
  palette: {
    Y: 0xffd633,
    o: 0xc08a10,
    r: 0xff5533,
    k: 0x5a3c00,
  },
};

/**
 * The Bosconian Spy Ship, stages 8-10. Sourced as green.
 *
 * Bosconian's stations are pods around a core, so this is a hexagonal body
 * with a pod above and below and lit ports down each flank.
 */
const SPY_SHIP = {
  rows: [
    '......dggd......',
    '......gwwg......',
    '......dggd......',
    '.......dd.......',
    '.....dggggd.....',
    '...ddggggggdd...',
    '..dgwggwwggwgd..',
    '..dggwggggwggd..',
    '..dggwggggwggd..',
    '..dgwggwwggwgd..',
    '...ddggggggdd...',
    '.....dggggd.....',
    '.......dd.......',
    '......dggd......',
    '......gwwg......',
    '......dggd......',
  ],
  palette: {
    g: 0x33dd66,
    d: 0x1a7a3c,
    w: 0xdcffe8,
  },
};

/**
 * The Galaxian Flagship, stages 12-14, worth 3,000 for the set.
 *
 * The widest of the three and the only one with swept wings, so it reads as
 * the biggest prize on the board at a glance.
 */
const FLAGSHIP = {
  rows: [
    '.......yy.......',
    '......yppy......',
    '.....yppppy.....',
    '.....ybbbby.....',
    '....bbbppbbb....',
    '...bbbbppbbbb...',
    '..rbbbbppbbbbr..',
    '.rrbbbppppbbbrr.',
    'rrbbbbppppbbbbrr',
    '.rrbbbppppbbbrr.',
    '..rbbbbppbbbbr..',
    '...bbbbbbbbbb...',
    '....bbyyyybb....',
    '.....byyyyb.....',
    '......yyyy......',
    '.......yy.......',
  ],
  palette: {
    b: 0x3f6dff,
    p: 0xbcd6ff,
    y: 0xffd23c,
    r: 0xff4d4d,
  },
};

/** Keyed by `TransformType`, which `tests/pixelArt.test.js` pins. */
export const TRANSFORM_SPRITES = {
  scorpion: SCORPION,
  spyShip: SPY_SHIP,
  flagship: FLAGSHIP,
};

/** The frame every stage flag is drawn in, in authored pixels. */
export const FLAG_FRAME = { width: 10, height: 12, bannerWidth: 8, bannerHeight: 4 };

/**
 * Hang a banner off a pole.
 *
 * The pole is column 0 for the full height -- a flag is read by its staff as
 * much as its cloth, and the arcade's sit in a row like pennants on a wall.
 * The banner occupies rows 1 to 4 with a highlight above and a shadow below,
 * which is what stops the lighter denominations flattening into a bright
 * rectangle on a black field.
 */
export function composeFlag(banner) {
  if (banner.length !== FLAG_FRAME.bannerHeight) {
    throw new Error(`composeFlag needs a banner of ${FLAG_FRAME.bannerHeight} rows`);
  }
  if (banner.some((row) => row.length !== FLAG_FRAME.bannerWidth)) {
    throw new Error(`composeFlag needs a banner ${FLAG_FRAME.bannerWidth} wide`);
  }

  const pad = '.'.repeat(FLAG_FRAME.width - 1 - FLAG_FRAME.bannerWidth);
  const staff = `P${'.'.repeat(FLAG_FRAME.width - 1)}`;

  return [
    `P${'H'.repeat(FLAG_FRAME.bannerWidth)}${pad}`,
    ...banner.map((row) => `P${row}${pad}`),
    `P${'S'.repeat(FLAG_FRAME.bannerWidth)}${pad}`,
    ...Array.from({ length: FLAG_FRAME.height - FLAG_FRAME.bannerHeight - 3 }, () => staff),
    `PP${'.'.repeat(FLAG_FRAME.width - 2)}`,
  ];
}

/**
 * The banner motif for each denomination.
 *
 * Colour alone is not enough. Six coloured rectangles are six coloured
 * rectangles in a screenshot, in greyscale, and to a colour-blind player, so
 * each denomination carries a different pattern in its cloth: the count of
 * flags is the stage number, and it has to survive being read at a glance.
 * `B` is the denomination colour, `M` the darker figure drawn on it.
 */
const FLAG_MOTIFS = {
  1: ['BBBBBBBB', 'BBBBBBBB', 'BBBBBBBB', 'BBBBBBBB'],
  5: ['BBBBBBBB', 'MMMMMMMM', 'BBBBBBBB', 'MMMMMMMM'],
  10: ['BBBBBBBB', 'BMMMMMMB', 'BMMMMMMB', 'BBBBBBBB'],
  20: ['BBMMMMBB', 'BBMMMMBB', 'BBMMMMBB', 'BBMMMMBB'],
  30: ['MMBBBBMM', 'BMMBBMMB', 'BMMBBMMB', 'MMBBBBMM'],
  50: ['MBBBBBBM', 'BMBBBBMB', 'BMBBBBMB', 'MBBBBBBM'],
};

/** Pull a colour toward black or white, for the shade and highlight bands. */
function shade(color, factor) {
  const mix = (channel) =>
    Math.round(factor < 0 ? channel * (1 + factor) : channel + (255 - channel) * factor);

  const r = mix((color >> 16) & 0xff);
  const g = mix((color >> 8) & 0xff);
  const b = mix(color & 0xff);

  return (r << 16) | (g << 8) | b;
}

const POLE_COLOR = 0xc8c8d0;

/**
 * One flag sprite per denomination, built from the shared frame and that
 * denomination's motif. Colours come from `FLAG_ART` so the HUD palette stays
 * the single place they are chosen.
 */
function buildFlagSprites(colors) {
  return Object.fromEntries(
    Object.entries(colors).map(([value, color]) => [
      value,
      {
        rows: composeFlag(FLAG_MOTIFS[value]),
        palette: {
          P: POLE_COLOR,
          B: color,
          M: shade(color, -0.45),
          H: shade(color, 0.4),
          S: shade(color, -0.7),
        },
      },
    ]),
  );
}

export const FLAG_SPRITES = buildFlagSprites(FLAG_ART.colors);

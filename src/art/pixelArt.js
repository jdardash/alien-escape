/**
 * Hand-authored sprite artwork, as pixel grids.
 *
 * Three of the ships this game needs have no artwork in the repo: the
 * Scorpion, the Bosconian Spy Ship and the Galaxian Flagship that the transform
 * bonus cycles through, plus the six stage flags along the bottom of the HUD.
 * The stand-in for them was an existing enemy silhouette filled with a flat
 * colour, which got the colour right and the shape wrong -- three different
 * bonus ships that were the same ship in three colours.
 *
 * These are drawn instead: original pixel art authored at 16 x 16, the size
 * the arcade's own sprites are, and turned into textures at run time. Authoring
 * them as data rather than as PNGs means the shapes are reviewable in a diff
 * and testable without a canvas, which is what lets `tests/pixelArt.test.js`
 * assert that every ship is symmetric about its centre line -- the failure mode
 * of hand-edited pixel grids.
 *
 * Nothing here is traced from the original ROM. The silhouettes follow the
 * published descriptions of each ship: a yellow scorpion, a green Bosconian
 * station, a blue Galaxian flagship with red wingtips.
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

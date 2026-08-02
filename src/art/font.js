/**
 * An original 8x8 bitmap font, in the cabinet's format but not its shapes.
 *
 * Galaga draws every character on screen from 8x8 tiles in its character ROM,
 * one colour per string. That format is what this reproduces: a fixed-cell
 * sheet, sixteen glyphs to a row, rendered through Phaser's RetroFont so all
 * text lands on the same pixel grid the sprites use. The glyph shapes are
 * authored here, pixel by pixel, in the single-case blocky style of the era
 * -- and are not traced from the ROM, for the same reason the ships are not.
 *
 * A local checkout can override the whole sheet: a manifest naming `font`
 * supplies a PNG laid out in `FONT_CHARS` order, sixteen glyphs per row,
 * square cells, and every string in the game is drawn from it instead. That
 * is the path by which the cabinet's own letterforms appear on a machine
 * that has them, without a byte of them entering the repository.
 */

import { localArtFrames } from './localArt.js';

/** Every character the game can print, in sheet order. */
export const FONT_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-.,:;!?()[]<>/+=@'\" ";

export const GLYPH_SIZE = 8;
export const FONT_CHARS_PER_ROW = 16;

/* eslint-disable quote-props */
export const GLYPHS = {
  A: ['..###...', '.#...#..', '#.....#.', '#.....#.', '#######.', '#.....#.', '#.....#.', '........'],
  B: ['######..', '#.....#.', '#.....#.', '######..', '#.....#.', '#.....#.', '######..', '........'],
  C: ['.#####..', '#.....#.', '#.......', '#.......', '#.......', '#.....#.', '.#####..', '........'],
  D: ['#####...', '#....#..', '#.....#.', '#.....#.', '#.....#.', '#....#..', '#####...', '........'],
  E: ['#######.', '#.......', '#.......', '#####...', '#.......', '#.......', '#######.', '........'],
  F: ['#######.', '#.......', '#.......', '#####...', '#.......', '#.......', '#.......', '........'],
  G: ['.#####..', '#.....#.', '#.......', '#..####.', '#.....#.', '#.....#.', '.#####..', '........'],
  H: ['#.....#.', '#.....#.', '#.....#.', '#######.', '#.....#.', '#.....#.', '#.....#.', '........'],
  I: ['.#####..', '...#....', '...#....', '...#....', '...#....', '...#....', '.#####..', '........'],
  J: ['....###.', '.....#..', '.....#..', '.....#..', '#....#..', '#....#..', '.####...', '........'],
  K: ['#....#..', '#...#...', '#..#....', '###.....', '#..#....', '#...#...', '#....#..', '........'],
  L: ['#.......', '#.......', '#.......', '#.......', '#.......', '#.......', '#######.', '........'],
  M: ['#.....#.', '##...##.', '#.#.#.#.', '#..#..#.', '#.....#.', '#.....#.', '#.....#.', '........'],
  N: ['#.....#.', '##....#.', '#.#...#.', '#..#..#.', '#...#.#.', '#....##.', '#.....#.', '........'],
  O: ['.#####..', '#.....#.', '#.....#.', '#.....#.', '#.....#.', '#.....#.', '.#####..', '........'],
  P: ['######..', '#.....#.', '#.....#.', '######..', '#.......', '#.......', '#.......', '........'],
  Q: ['.#####..', '#.....#.', '#.....#.', '#.....#.', '#...#.#.', '#....#..', '.####.#.', '........'],
  R: ['######..', '#.....#.', '#.....#.', '######..', '#...#...', '#....#..', '#.....#.', '........'],
  S: ['.#####..', '#.....#.', '#.......', '.#####..', '......#.', '#.....#.', '.#####..', '........'],
  T: ['#######.', '...#....', '...#....', '...#....', '...#....', '...#....', '...#....', '........'],
  U: ['#.....#.', '#.....#.', '#.....#.', '#.....#.', '#.....#.', '#.....#.', '.#####..', '........'],
  V: ['#.....#.', '#.....#.', '#.....#.', '.#...#..', '.#...#..', '..#.#...', '...#....', '........'],
  W: ['#.....#.', '#.....#.', '#.....#.', '#..#..#.', '#.#.#.#.', '##...##.', '#.....#.', '........'],
  X: ['#.....#.', '.#...#..', '..#.#...', '...#....', '..#.#...', '.#...#..', '#.....#.', '........'],
  Y: ['#.....#.', '.#...#..', '..#.#...', '...#....', '...#....', '...#....', '...#....', '........'],
  Z: ['#######.', '.....#..', '....#...', '...#....', '..#.....', '.#......', '#######.', '........'],
  '0': ['.#####..', '#....##.', '#...#.#.', '#..#..#.', '#.#...#.', '##....#.', '.#####..', '........'],
  '1': ['...#....', '..##....', '...#....', '...#....', '...#....', '...#....', '.#####..', '........'],
  '2': ['.#####..', '#.....#.', '......#.', '..####..', '.#......', '#.......', '#######.', '........'],
  '3': ['.#####..', '#.....#.', '......#.', '...###..', '......#.', '#.....#.', '.#####..', '........'],
  '4': ['....##..', '...#.#..', '..#..#..', '.#...#..', '#######.', '.....#..', '.....#..', '........'],
  '5': ['#######.', '#.......', '######..', '......#.', '......#.', '#.....#.', '.#####..', '........'],
  '6': ['.#####..', '#.......', '#.......', '######..', '#.....#.', '#.....#.', '.#####..', '........'],
  '7': ['#######.', '......#.', '.....#..', '....#...', '...#....', '..#.....', '..#.....', '........'],
  '8': ['.#####..', '#.....#.', '#.....#.', '.#####..', '#.....#.', '#.....#.', '.#####..', '........'],
  '9': ['.#####..', '#.....#.', '#.....#.', '.######.', '......#.', '......#.', '.#####..', '........'],
  '-': ['........', '........', '........', '.#####..', '........', '........', '........', '........'],
  '.': ['........', '........', '........', '........', '........', '..##....', '..##....', '........'],
  ',': ['........', '........', '........', '........', '........', '..##....', '..#.....', '.#......'],
  ':': ['........', '..##....', '..##....', '........', '..##....', '..##....', '........', '........'],
  ';': ['........', '..##....', '..##....', '........', '..##....', '..#.....', '.#......', '........'],
  '!': ['...#....', '...#....', '...#....', '...#....', '...#....', '........', '...#....', '........'],
  '?': ['.#####..', '#.....#.', '......#.', '....##..', '...#....', '........', '...#....', '........'],
  '(': ['....#...', '...#....', '..#.....', '..#.....', '..#.....', '...#....', '....#...', '........'],
  ')': ['..#.....', '...#....', '....#...', '....#...', '....#...', '...#....', '..#.....', '........'],
  '[': ['..###...', '..#.....', '..#.....', '..#.....', '..#.....', '..#.....', '..###...', '........'],
  ']': ['..###...', '....#...', '....#...', '....#...', '....#...', '....#...', '..###...', '........'],
  '<': ['.....#..', '....#...', '...#....', '..#.....', '...#....', '....#...', '.....#..', '........'],
  '>': ['..#.....', '...#....', '....#...', '.....#..', '....#...', '...#....', '..#.....', '........'],
  '/': ['......#.', '.....#..', '....#...', '...#....', '..#.....', '.#......', '#.......', '........'],
  '+': ['........', '...#....', '...#....', '.#####..', '...#....', '...#....', '........', '........'],
  '=': ['........', '........', '.#####..', '........', '.#####..', '........', '........', '........'],
  // The copyright mark, which the cabinet's own font also carried.
  '@': ['.#####..', '#.....#.', '#..##.#.', '#.#...#.', '#..##.#.', '#.....#.', '.#####..', '........'],
  "'": ['..##....', '..##....', '..#.....', '........', '........', '........', '........', '........'],
  '"': ['..#.#...', '..#.#...', '..#.#...', '........', '........', '........', '........', '........'],
  ' ': ['........', '........', '........', '........', '........', '........', '........', '........'],
};
/* eslint-enable quote-props */

/** The pixel colour every glyph is drawn in; strings are tinted per use. */
const GLYPH_COLOR = 0xffffff;

const SHEET_KEY = 'arcadeFontSheet';
export const FONT_KEY = 'arcadeFont';

/**
 * Build the glyph sheet and register the RetroFont, once per game.
 *
 * The sheet is generated from `GLYPHS` at `pixelSize` screen pixels per art
 * pixel -- unless a local checkout has loaded a `font` image, in which case
 * that image *is* the sheet and its own cell size is read off its width.
 */
export function installArcadeFont(scene, pixelSize = 2) {
  if (scene.cache.bitmapFont.exists(FONT_KEY)) return;

  const local = localArtFrames('font');
  let imageKey = SHEET_KEY;
  let cell = GLYPH_SIZE * pixelSize;

  if (local && scene.textures.exists(local[0])) {
    imageKey = local[0];
    cell = scene.textures.get(imageKey).getSourceImage().width / FONT_CHARS_PER_ROW;
  } else if (!scene.textures.exists(SHEET_KEY)) {
    const rows = Math.ceil(FONT_CHARS.length / FONT_CHARS_PER_ROW);
    const graphics = scene.make.graphics({ add: false });

    [...FONT_CHARS].forEach((char, index) => {
      const originX = (index % FONT_CHARS_PER_ROW) * cell;
      const originY = Math.floor(index / FONT_CHARS_PER_ROW) * cell;

      GLYPHS[char].forEach((row, y) => {
        [...row].forEach((pixel, x) => {
          if (pixel !== '#') return;
          graphics
            .fillStyle(GLYPH_COLOR, 1)
            .fillRect(originX + x * pixelSize, originY + y * pixelSize, pixelSize, pixelSize);
        });
      });
    });

    graphics.generateTexture(SHEET_KEY, FONT_CHARS_PER_ROW * cell, rows * cell);
    graphics.destroy();
    scene.textures.get(SHEET_KEY).setFilter(Phaser.Textures.FilterMode.NEAREST);
  }

  const config = {
    image: imageKey,
    width: cell,
    height: cell,
    chars: FONT_CHARS,
    charsPerRow: FONT_CHARS_PER_ROW,
    'spacing.x': 0,
    'spacing.y': 0,
  };
  scene.cache.bitmapFont.add(FONT_KEY, Phaser.GameObjects.RetroFont.Parse(scene, config));
}

/**
 * A string in the arcade font. The one way any scene prints anything.
 *
 * Text is upcased because the sheet is single-case, as the cabinet's was.
 * `scale` is in multiples of the 16px base cell, and the returned BitmapText
 * takes the same `setOrigin` calls the Text objects it replaces took.
 */
export function arcadeText(scene, x, y, text, { tint = 0xffffff, scale = 1 } = {}) {
  return scene.add
    .bitmapText(x, y, FONT_KEY, String(text).toUpperCase())
    .setScale(scale)
    .setTint(tint);
}

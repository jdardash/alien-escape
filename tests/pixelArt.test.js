import { describe, it, expect } from 'vitest';
import { parsePixelArt, composeFlag, TRANSFORM_SPRITES, FLAG_SPRITES } from '../src/art/pixelArt.js';
import { TransformType, stageFlags } from '../src/systems/stages.js';
import { FLAG_ART } from '../src/config.js';

describe('parsePixelArt', () => {
  const palette = { a: 0xff0000, b: 0x00ff00 };

  it('turns painted cells into placed pixels and leaves gaps empty', () => {
    const art = parsePixelArt(['a.b', '.a.'], palette);

    expect(art.width).toBe(3);
    expect(art.height).toBe(2);
    expect(art.pixels).toEqual([
      { x: 0, y: 0, color: 0xff0000 },
      { x: 2, y: 0, color: 0x00ff00 },
      { x: 1, y: 1, color: 0xff0000 },
    ]);
  });

  it('rejects a ragged grid rather than drawing a torn sprite', () => {
    expect(() => parsePixelArt(['aa', 'a'], palette)).toThrow(/rectangular/i);
  });

  it('rejects a character the palette has no colour for', () => {
    expect(() => parsePixelArt(['az'], palette)).toThrow(/z/);
  });

  it('rejects an empty grid', () => {
    expect(() => parsePixelArt([], palette)).toThrow();
  });
});

describe('transform bonus enemy artwork', () => {
  const drawn = Object.fromEntries(
    Object.entries(TRANSFORM_SPRITES).map(([name, sprite]) => [
      name,
      parsePixelArt(sprite.rows, sprite.palette),
    ]),
  );

  it('has one sprite per transform type the stage cycle can produce', () => {
    expect(Object.keys(TRANSFORM_SPRITES).sort()).toEqual(
      Object.values(TransformType).sort(),
    );
  });

  it('is authored at the arcade sprite size of 16 by 16', () => {
    for (const art of Object.values(drawn)) {
      expect(art.width).toBe(16);
      expect(art.height).toBe(16);
    }
  });

  // Hand-authored pixel grids drift a column when edited. Every one of these
  // ships is drawn head-on, so an asymmetric silhouette is a typo, not a
  // design: this is the test that catches it.
  it('draws every ship symmetrically about its centre line', () => {
    for (const [name, art] of Object.entries(drawn)) {
      const painted = new Set(art.pixels.map((pixel) => `${pixel.x},${pixel.y}`));
      const unmirrored = art.pixels
        .map((pixel) => ({ x: art.width - 1 - pixel.x, y: pixel.y }))
        .filter((mirror) => !painted.has(`${mirror.x},${mirror.y}`));

      expect({ name, unmirrored }).toEqual({ name, unmirrored: [] });
    }
  });

  it('fills enough of the frame to read as a ship rather than a speck', () => {
    for (const art of Object.values(drawn)) {
      expect(art.pixels.length).toBeGreaterThan(60);
    }
  });

  it('gives each type its own silhouette, not one shape recoloured', () => {
    const silhouettes = Object.values(drawn).map((art) =>
      art.pixels.map((pixel) => `${pixel.x},${pixel.y}`).join('|'),
    );

    expect(new Set(silhouettes).size).toBe(silhouettes.length);
  });
});

describe('stage flag artwork', () => {
  const drawn = Object.fromEntries(
    Object.entries(FLAG_SPRITES).map(([value, sprite]) => [
      value,
      parsePixelArt(sprite.rows, sprite.palette),
    ]),
  );

  it('covers every denomination stageFlags can hand back', () => {
    const needed = new Set();
    for (let stage = 1; stage <= 99; stage += 1) {
      for (const flag of stageFlags(stage)) needed.add(flag.value);
    }

    for (const value of needed) {
      expect(FLAG_SPRITES[value]).toBeDefined();
    }
  });

  it('draws every flag at the size the HUD reserves for one', () => {
    for (const art of Object.values(drawn)) {
      expect(art.width).toBe(FLAG_ART.width);
      expect(art.height).toBe(FLAG_ART.height);
    }
  });

  it('flies every banner from a pole that runs the full height', () => {
    for (const art of Object.values(drawn)) {
      const poleRows = new Set(
        art.pixels.filter((pixel) => pixel.x === 0).map((pixel) => pixel.y),
      );
      expect(poleRows.size).toBe(art.height);
    }
  });

  it('uses the denomination colour the HUD palette assigns', () => {
    for (const [value, art] of Object.entries(drawn)) {
      const colors = new Set(art.pixels.map((pixel) => pixel.color));
      expect(colors.has(FLAG_ART.colors[value])).toBe(true);
    }
  });

  // Colour alone fails a colour-blind player and fails a greyscale
  // screenshot. Each denomination carries a different banner motif so the
  // flags stay countable without it.
  it('gives each denomination a distinct banner motif', () => {
    const motifs = Object.values(FLAG_SPRITES).map((sprite) => sprite.rows.join('|'));
    expect(new Set(motifs).size).toBe(motifs.length);
  });
});

describe('composeFlag', () => {
  it('wraps a banner in the pole and the empty staff below it', () => {
    const rows = composeFlag(['BBBBBBBB', 'BBBBBBBB', 'BBBBBBBB', 'BBBBBBBB']);

    expect(rows).toHaveLength(FLAG_ART.height);
    expect(rows.every((row) => row.length === FLAG_ART.width)).toBe(true);
    expect(rows.every((row) => row.startsWith('P'))).toBe(true);
  });

  it('refuses a banner that would not fit the frame it is drawn in', () => {
    expect(() => composeFlag(['BBB'])).toThrow(/banner/i);
  });
});

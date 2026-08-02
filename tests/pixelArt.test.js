import { describe, it, expect } from 'vitest';
import {
  parsePixelArt,
  composeFlag,
  frameRows,
  frameCount,
  TRANSFORM_SPRITES,
  FLAG_SPRITES,
  SHIP_SPRITES,
  DISTINCT_SHIP_SILHOUETTES,
  SHIP_RECOLOURS,
} from '../src/art/pixelArt.js';
import { TransformType, stageFlags } from '../src/systems/stages.js';
import { EnemyType } from '../src/systems/formation.js';
import { FLAG_ART } from '../src/config.js';

/** Every painted cell of a sprite, as "x,y" keys. */
function silhouette(art) {
  return art.pixels.map((pixel) => `${pixel.x},${pixel.y}`);
}

/** Cells that have no counterpart across the sprite's vertical centre line. */
function unmirroredCells(art) {
  const painted = new Set(silhouette(art));
  return art.pixels
    .map((pixel) => ({ x: art.width - 1 - pixel.x, y: pixel.y }))
    .filter((mirror) => !painted.has(`${mirror.x},${mirror.y}`));
}

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

/** The colour covering the most cells of a sprite: what it reads as at a glance. */
function dominantColour(art) {
  const counts = new Map();
  for (const pixel of art.pixels) counts.set(pixel.color, (counts.get(pixel.color) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

const channels = (colour) => ({
  r: (colour >> 16) & 0xff,
  g: (colour >> 8) & 0xff,
  b: colour & 0xff,
});

describe('ship colour states', () => {
  const dominant = (name) =>
    channels(
      dominantColour(parsePixelArt(frameRows(SHIP_SPRITES[name]), SHIP_SPRITES[name].palette)),
    );

  it('reads a healthy Boss Galaga as green', () => {
    const { r, g, b } = dominant('boss');
    expect(g).toBeGreaterThan(r);
    expect(g).toBeGreaterThan(b);
  });

  // Blue specifically, not merely blue-dominant: purple is blue-dominant too,
  // and purple is what this used to be. Keeping the red channel well clear of
  // the blue one is the difference between the two.
  it('reads a damaged Boss Galaga as blue rather than purple', () => {
    const { r, g, b } = dominant('bossDamaged');
    expect(b).toBeGreaterThan(g);
    expect(b - r).toBeGreaterThan(80);
  });

  it('keeps the damaged boss distinct from a Zako, which is also blue', () => {
    const boss = parsePixelArt(
      frameRows(SHIP_SPRITES.bossDamaged),
      SHIP_SPRITES.bossDamaged.palette,
    );
    const zako = parsePixelArt(frameRows(SHIP_SPRITES.zako), SHIP_SPRITES.zako.palette);
    expect(dominantColour(boss)).not.toBe(dominantColour(zako));
  });

  it('reads a captured fighter as red', () => {
    const { r, g, b } = dominant('captive');
    expect(r).toBeGreaterThan(g);
    expect(r).toBeGreaterThan(b);
  });

  it('does not read the player the same way it reads the captive', () => {
    expect(dominant('player')).not.toEqual(dominant('captive'));
  });
});

describe('ship artwork', () => {
  const drawn = Object.fromEntries(
    Object.entries(SHIP_SPRITES).map(([name, sprite]) => [
      name,
      parsePixelArt(frameRows(sprite), sprite.palette),
    ]),
  );

  // `createEnemy` goes straight from a slot's type to its texture, so a rank
  // with no artwork is a missing sprite at run time rather than a build error.
  it('draws one ship per rank the formation can place', () => {
    for (const type of Object.values(EnemyType)) {
      expect(SHIP_SPRITES[type]).toBeDefined();
    }
  });

  it('draws the player and the fighter a boss takes from them', () => {
    expect(SHIP_SPRITES.player).toBeDefined();
    expect(SHIP_SPRITES.captive).toBeDefined();
  });

  it('is authored at the arcade sprite size of 16 by 16', () => {
    for (const art of Object.values(drawn)) {
      expect(art.width).toBe(16);
      expect(art.height).toBe(16);
    }
  });

  it('draws every ship symmetrically about its centre line', () => {
    for (const [name, art] of Object.entries(drawn)) {
      expect({ name, unmirrored: unmirroredCells(art) }).toEqual({ name, unmirrored: [] });
    }
  });

  it('fills enough of the frame to read as a ship rather than a speck', () => {
    for (const art of Object.values(drawn)) {
      expect(art.pixels.length).toBeGreaterThan(60);
    }
  });

  it('gives each rank its own silhouette, not one shape recoloured', () => {
    const shapes = DISTINCT_SHIP_SILHOUETTES.map((name) => silhouette(drawn[name]).join('|'));
    expect(new Set(shapes).size).toBe(shapes.length);
  });

  // A Boss Galaga changing colour on its first hit, and a captured fighter
  // hanging under its captor, both have to read as the *same ship* in a
  // different state. A shifted pixel would turn either into a different enemy.
  it('keeps each recolour pixel-identical to the ship it recolours, every frame', () => {
    for (const [recolour, original] of Object.entries(SHIP_RECOLOURS)) {
      expect(SHIP_SPRITES[recolour].frames).toEqual(SHIP_SPRITES[original].frames);
    }
  });

  it('gives each recolour a palette of its own, or it would be invisible', () => {
    for (const [recolour, original] of Object.entries(SHIP_RECOLOURS)) {
      expect(SHIP_SPRITES[recolour].palette).not.toEqual(SHIP_SPRITES[original].palette);
      expect(Object.keys(SHIP_SPRITES[recolour].palette).sort()).toEqual(
        Object.keys(SHIP_SPRITES[original].palette).sort(),
      );
    }
  });
});

describe('animation frames', () => {
  const flapping = ['zako', 'goei', 'boss', 'bossDamaged'];

  it('gives every formation alien two wing frames', () => {
    for (const name of flapping) {
      expect({ name, frames: frameCount(SHIP_SPRITES[name]) }).toEqual({ name, frames: 2 });
    }
  });

  it('keeps the fighter and its captive single-frame, as the cabinet does', () => {
    expect(frameCount(SHIP_SPRITES.player)).toBe(1);
    expect(frameCount(SHIP_SPRITES.captive)).toBe(1);
  });

  it('gives every transform bonus ship two frames', () => {
    for (const [name, sprite] of Object.entries(TRANSFORM_SPRITES)) {
      expect({ name, frames: frameCount(sprite) }).toEqual({ name, frames: 2 });
    }
  });

  it('authors every frame at 16 by 16 with a full palette', () => {
    for (const sprite of [...Object.values(SHIP_SPRITES), ...Object.values(TRANSFORM_SPRITES)]) {
      for (let frame = 0; frame < frameCount(sprite); frame += 1) {
        const art = parsePixelArt(frameRows(sprite, frame), sprite.palette);
        expect(art.width).toBe(16);
        expect(art.height).toBe(16);
      }
    }
  });

  it('draws every frame symmetrically about its centre line', () => {
    const all = { ...SHIP_SPRITES, ...TRANSFORM_SPRITES };
    for (const [name, sprite] of Object.entries(all)) {
      for (let frame = 0; frame < frameCount(sprite); frame += 1) {
        const art = parsePixelArt(frameRows(sprite, frame), sprite.palette);
        expect({ name, frame, unmirrored: unmirroredCells(art) }).toEqual({
          name,
          frame,
          unmirrored: [],
        });
      }
    }
  });

  it('makes each second frame genuinely different from the first', () => {
    const animated = { ...TRANSFORM_SPRITES };
    for (const name of flapping) animated[name] = SHIP_SPRITES[name];

    for (const [name, sprite] of Object.entries(animated)) {
      expect({ name, differs: frameRows(sprite, 0) !== frameRows(sprite, 1) }).toEqual({
        name,
        differs: true,
      });
      expect(frameRows(sprite, 0).join('|')).not.toBe(frameRows(sprite, 1).join('|'));
    }
  });

  it('keeps every frame substantial enough to read as the same ship', () => {
    for (const sprite of [...Object.values(SHIP_SPRITES), ...Object.values(TRANSFORM_SPRITES)]) {
      for (let frame = 0; frame < frameCount(sprite); frame += 1) {
        const art = parsePixelArt(frameRows(sprite, frame), sprite.palette);
        expect(art.pixels.length).toBeGreaterThan(60);
      }
    }
  });

  it('refuses a frame index the sprite does not have', () => {
    expect(() => frameRows(SHIP_SPRITES.player, 1)).toThrow(/frame/i);
  });

  it('reads single-frame sprites authored with plain rows, like the flags', () => {
    const flag = FLAG_SPRITES[1];
    expect(frameCount(flag)).toBe(1);
    expect(frameRows(flag)).toBe(flag.rows);
  });
});

describe('transform bonus enemy artwork', () => {
  const drawn = Object.fromEntries(
    Object.entries(TRANSFORM_SPRITES).map(([name, sprite]) => [
      name,
      parsePixelArt(frameRows(sprite), sprite.palette),
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

import { describe, expect, it } from 'vitest';

import { STAR_BRIGHTNESS, STAR_SEED, STAR_SPEEDS } from '../src/systems/starData.js';
import {
  BLINK_PERIOD_MS,
  STAR_COUNT,
  STAR_SETS,
  STARFIELD_SCROLL,
  advanceStarfield,
  createStarfield,
  litSets,
  setStarfieldScroll,
  setStarfieldSets,
  starColor,
  visibleStars,
} from '../src/systems/starfield.js';

const screen = { width: 672, height: 864 };
const FRAME_MS = 1000 / 60.606061;

describe('the star table', () => {
  it('holds 252 stars, 63 in each of the four sets', () => {
    expect(STAR_SEED).toHaveLength(252);
    for (let set = 0; set < STAR_SETS; set += 1) {
      expect(STAR_SEED.filter((star) => star.set === set)).toHaveLength(STAR_COUNT);
    }
  });

  it('keeps every record on the 256 x 256 field with a 6-bit colour', () => {
    for (const star of STAR_SEED) {
      expect(star.x).toBeGreaterThanOrEqual(0);
      expect(star.x).toBeLessThan(256);
      expect(star.y).toBeGreaterThanOrEqual(0);
      expect(star.y).toBeLessThan(256);
      expect(star.col).toBeGreaterThanOrEqual(0);
      expect(star.col).toBeLessThan(64);
      expect(star.set).toBeGreaterThanOrEqual(0);
      expect(star.set).toBeLessThan(STAR_SETS);
    }
  });

  it('matches MAME star_seed_tab verbatim at the set boundaries', () => {
    // video/galaga.c:50 -- first record of set 0.
    expect(STAR_SEED[0]).toEqual({ x: 0x85, y: 0x06, col: 0x35, set: 0 });
    // video/galaga.c:116 -- first record of set 1.
    expect(STAR_SEED[63]).toEqual({ x: 0xfe, y: 0x04, col: 0x3d, set: 1 });
    // video/galaga.c:182 -- first record of set 2.
    expect(STAR_SEED[126]).toEqual({ x: 0xfa, y: 0x06, col: 0x19, set: 2 });
    // video/galaga.c:248 -- first record of set 3.
    expect(STAR_SEED[189]).toEqual({ x: 0x71, y: 0x10, col: 0x34, set: 3 });
    // video/galaga.c:310 -- the last record of the table.
    expect(STAR_SEED[251]).toEqual({ x: 0x2c, y: 0xfa, col: 0x13, set: 3 });
  });

  it('pins the brightness map and the scroll-speed table', () => {
    // video/galaga.c:368 and :599.
    expect(STAR_BRIGHTNESS).toEqual([0x00, 0x47, 0x97, 0xde]);
    expect(STAR_SPEEDS).toEqual([-1, -2, -3, 0, 3, 2, 1, 0]);
  });
});

describe('colour decoding', () => {
  it('decodes two bits per gun through the brightness map, BBGGRR', () => {
    // col 0x35 = 0b11'01'01: red 1, green 1, blue 3.
    expect(starColor(0x35)).toBe((0x47 << 16) | (0x47 << 8) | 0xde);
    // The low two bits are the RED gun: 0x03 is a pure bright red.
    expect(starColor(0x03)).toBe(0xde0000);
    // The top two bits are the BLUE gun.
    expect(starColor(0x30)).toBe(0x0000de);
    expect(starColor(0x00)).toBe(0x000000);
    expect(starColor(0x3f)).toBe(0xdedede);
  });
});

describe('the field', () => {
  it('builds the four hardware sets straight from the table', () => {
    const field = createStarfield();
    expect(field.sets).toHaveLength(STAR_SETS);
    for (const set of field.sets) expect(set).toHaveLength(STAR_COUNT);
    // The first record of set 0, position verbatim, colour decoded.
    expect(field.sets[0][0]).toEqual({ x: 0x85, y: 0x06, color: starColor(0x35) });
  });

  it('is deterministic: the table is fixed, so every field is the same sky', () => {
    expect(createStarfield()).toEqual(createStarfield());
  });
});

describe('set selection', () => {
  it('lights one of {0,1} and one of {2,3}, never any other pair', () => {
    for (const a of [0, 1]) {
      for (const b of [0, 1]) {
        const field = setStarfieldSets(createStarfield(), a, b);
        const [setA, setB] = litSets(field);
        expect([0, 1]).toContain(setA);
        expect([2, 3]).toContain(setB);
        expect(setA).toBe(a);
        expect(setB).toBe(2 | b);
      }
    }
  });

  it('shows 126 stars: two sets of 63', () => {
    expect(visibleStars(createStarfield(), screen)).toHaveLength(STAR_COUNT * 2);
  });

  it('swaps both select bits each authored blink period', () => {
    let field = createStarfield();
    expect(litSets(field)).toEqual([0, 2]);
    field = advanceStarfield(field, BLINK_PERIOD_MS + 1);
    expect(litSets(field)).toEqual([1, 3]);
    field = advanceStarfield(field, BLINK_PERIOD_MS);
    expect(litSets(field)).toEqual([0, 2]);
  });

  it('draws different stars in the two blink phases', () => {
    let field = createStarfield();
    const before = visibleStars(field, screen);
    field = advanceStarfield(field, BLINK_PERIOD_MS + 1);
    const after = visibleStars(field, screen);
    const key = (star) => `${star.x}:${star.y}:${star.color}`;
    const beforeKeys = new Set(before.map(key));
    const overlap = after.filter((star) => beforeKeys.has(key(star))).length;
    expect(overlap).toBeLessThan(before.length / 4);
  });
});

describe('scrolling', () => {
  it('moves by its speed each frame and wraps around the 256-row field', () => {
    let field = setStarfieldScroll(createStarfield(), STARFIELD_SCROLL.game);
    field = advanceStarfield(field, FRAME_MS);
    expect(field.scrollY).toBeCloseTo(STARFIELD_SCROLL.game, 6);
    field = setStarfieldScroll({ ...field, scrollY: 255 }, 2);
    field = advanceStarfield(field, FRAME_MS);
    expect(field.scrollY).toBeCloseTo(1, 6);
  });

  it('stops dead at speed zero', () => {
    let field = setStarfieldScroll(createStarfield(), 0);
    field = advanceStarfield(field, 500);
    expect(field.scrollY).toBe(0);
  });

  it('wraps below zero when reversed', () => {
    let field = setStarfieldScroll(createStarfield(), STARFIELD_SCROLL.capture);
    field = advanceStarfield(field, FRAME_MS);
    expect(field.scrollY).toBeCloseTo(254, 5);
  });

  it('restores every star exactly after an equal down-then-up scroll', () => {
    // The verified hardware property: a 40-frame down-scroll then an equal
    // up-scroll returns the field exactly to its start.
    let field = createStarfield();
    const start = visibleStars(field, screen);

    field = setStarfieldScroll(field, STARFIELD_SCROLL.game);
    for (let i = 0; i < 40; i += 1) field = advanceStarfield(field, FRAME_MS);
    expect(visibleStars(field, screen)).not.toEqual(start);

    field = setStarfieldScroll(field, STARFIELD_SCROLL.capture);
    for (let i = 0; i < 40; i += 1) field = advanceStarfield(field, FRAME_MS);
    expect(visibleStars(field, screen)).toEqual(start);
  });

  it('names the three scene states: frozen attract, downward play, reversed pull', () => {
    // Attract freezes: star_ctrl = 7, and STAR_SPEEDS[7] = 0 (task_man.s:375).
    expect(STARFIELD_SCROLL.title).toBe(0);
    // Play scrolls down at the magnitude of STAR_SPEEDS[1] = -2, the speed
    // behind the ROM's control value 1 (task_man.s:359).
    expect(STARFIELD_SCROLL.game).toBe(-STAR_SPEEDS[1]);
    expect(STARFIELD_SCROLL.game).toBeGreaterThan(0);
    // The capture pull reverses the same speed (gg1-3.s l_236D).
    expect(STARFIELD_SCROLL.capture).toBe(-STARFIELD_SCROLL.game);
  });
});

describe('projection', () => {
  it('projects every visible star into the screen', () => {
    const field = createStarfield();
    for (const star of visibleStars(field, screen)) {
      expect(star.x).toBeGreaterThanOrEqual(0);
      expect(star.x).toBeLessThan(screen.width);
      expect(star.y).toBeGreaterThanOrEqual(0);
      expect(star.y).toBeLessThan(screen.height);
    }
  });

  it('moves the projection as the field scrolls', () => {
    let field = setStarfieldScroll(createStarfield(), STARFIELD_SCROLL.game);
    const before = visibleStars(field, screen);
    field = advanceStarfield(field, 100);
    const after = visibleStars(field, screen);
    expect(after[0].y).not.toBeCloseTo(before[0].y, 6);
  });
});

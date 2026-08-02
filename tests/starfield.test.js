import { describe, expect, it } from 'vitest';

import {
  BLINK_PERIOD_MS,
  STAR_COUNT,
  STAR_SETS,
  STARFIELD_SCROLL,
  advanceStarfield,
  createStarfield,
  lfsrNext,
  setStarfieldScroll,
  visibleStars,
} from '../src/systems/starfield.js';

const screen = { width: 672, height: 864 };

describe('the LFSR', () => {
  it('walks a 16-bit maximal sequence rather than repeating early', () => {
    let value = 0xace1;
    const seen = new Set();
    for (let i = 0; i < 5000; i += 1) {
      value = lfsrNext(value);
      seen.add(value);
    }
    expect(seen.size).toBe(5000);
  });

  it('never emits zero from a non-zero seed', () => {
    let value = 1;
    for (let i = 0; i < 5000; i += 1) {
      value = lfsrNext(value);
      expect(value).not.toBe(0);
    }
  });
});

describe('the field', () => {
  it('holds four sets of 63 stars, as the hardware does', () => {
    const field = createStarfield();
    expect(STAR_SETS).toBe(4);
    expect(STAR_COUNT).toBe(63);
    expect(field.sets).toHaveLength(STAR_SETS);
    for (const set of field.sets) {
      expect(set).toHaveLength(STAR_COUNT);
      for (const star of set) {
        expect(star.x).toBeGreaterThanOrEqual(0);
        expect(star.x).toBeLessThan(256);
        expect(star.y).toBeGreaterThanOrEqual(0);
        expect(star.y).toBeLessThan(256);
        expect(star.color).toBeGreaterThanOrEqual(0);
        expect(star.color).toBeLessThanOrEqual(0xffffff);
      }
    }
  });

  it('is deterministic from its seed', () => {
    expect(createStarfield(0x1234)).toEqual(createStarfield(0x1234));
    expect(createStarfield(0x1234)).not.toEqual(createStarfield(0x4321));
  });
});

describe('scrolling', () => {
  it('drifts by its speed and wraps around the 256-row space', () => {
    let field = setStarfieldScroll(createStarfield(), 1);
    const start = field.scrollY;
    field = advanceStarfield(field, 1000 / 60.606061);
    expect(field.scrollY).toBeCloseTo((start + 1) % 256, 6);
  });

  it('stops dead at speed zero', () => {
    let field = setStarfieldScroll(createStarfield(), 0);
    const start = field.scrollY;
    field = advanceStarfield(field, 500);
    expect(field.scrollY).toBe(start);
  });

  it('reverses when the direction flips', () => {
    let field = setStarfieldScroll(createStarfield(), -1);
    field = advanceStarfield(field, 1000 / 60.606061);
    expect(field.scrollY).toBeCloseTo(255, 5);
  });

  it('names the stock speeds the scenes use', () => {
    expect(STARFIELD_SCROLL.title).toBeGreaterThan(0);
    expect(STARFIELD_SCROLL.game).toBeGreaterThan(STARFIELD_SCROLL.title);
  });
});

describe('blinking', () => {
  it('swaps which sets are lit each blink period', () => {
    let field = createStarfield();
    const before = visibleStars(field, screen);
    field = advanceStarfield(field, BLINK_PERIOD_MS + 1);
    const after = visibleStars(field, screen);

    // Two of the four sets are lit at a time, so the population is stable...
    expect(before).toHaveLength(STAR_COUNT * 2);
    expect(after).toHaveLength(STAR_COUNT * 2);
    // ...but not the same stars.
    // The field is not scrolling here, so a star's projected position is a
    // stable identity for it.
    const key = (star) => `${star.x.toFixed(3)}:${star.y.toFixed(3)}:${star.color}`;
    const beforeKeys = new Set(before.map(key));
    const overlap = after.filter((star) => beforeKeys.has(key(star))).length;
    expect(overlap).toBeLessThan(before.length / 4);
  });

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
    let field = setStarfieldScroll(createStarfield(), 1);
    const before = visibleStars(field, screen);
    field = advanceStarfield(field, 100);
    const after = visibleStars(field, screen);
    expect(after[0].y).not.toBeCloseTo(before[0].y, 6);
  });
});

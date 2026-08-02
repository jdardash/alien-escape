import { describe, expect, it } from 'vitest';

import { STAR_BRIGHTNESS, STAR_SEED, STAR_SPEEDS } from '../src/systems/starData.js';
import {
  BLINK_CYCLE,
  BLINK_STEP_FRAMES,
  STAR_COUNT,
  STAR_SETS,
  STARFIELD_SCROLL,
  advanceStarfield,
  blinkBits,
  createStarfield,
  litSets,
  setStarfieldControl,
  setStarfieldReverse,
  setStarfieldScroll,
  setStarfieldScrollEnable,
  setStarfieldSets,
  starColor,
  visibleStars,
} from '../src/systems/starfield.js';

const screen = { width: 672, height: 864 };
const FRAME_MS = 1000 / 60.606061;

/** Advance whole hardware frames. */
const runFrames = (field, frames) => advanceStarfield(field, frames * FRAME_MS);

/** A field in play: scroll enabled against a stage control byte. */
const playing = (control) =>
  setStarfieldScrollEnable(setStarfieldControl(createStarfield(), control), true);

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

describe('set selection and the blink', () => {
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

  it('derives the select bits from frame bits 3-4: A = f3 ^ f4, B = f4', () => {
    // task_man.s:362-368: the frame counter's bits 2-4 folded through
    // `(c >> 1) ^ c`, keeping bits 3-4 for starcontrol[3] and [4].
    for (let frame = 0; frame < 64; frame += 1) {
      const { bitA, bitB } = blinkBits(frame);
      expect(bitA).toBe(((frame >> 3) & 1) ^ ((frame >> 4) & 1));
      expect(bitB).toBe((frame >> 4) & 1);
    }
  });

  it('walks the lit pair through the Gray-code cycle, one step every 8 frames', () => {
    expect(BLINK_STEP_FRAMES).toBe(8);
    let field = createStarfield();
    const seen = [litSets(field)];
    for (let step = 0; step < 4; step += 1) {
      field = runFrames(field, BLINK_STEP_FRAMES);
      seen.push(litSets(field));
    }
    // (0,2) -> (1,2) -> (1,3) -> (0,3) -> back to (0,2): one set changes at
    // a time, the cadence attested at task_man.s:362-368.
    expect(seen).toEqual([...BLINK_CYCLE, BLINK_CYCLE[0]]);
  });

  it('changes only ONE lit set per step -- the Gray property', () => {
    let field = createStarfield();
    for (let step = 0; step < 8; step += 1) {
      const before = litSets(field);
      field = runFrames(field, BLINK_STEP_FRAMES);
      const after = litSets(field);
      const kept = after.filter((set) => before.includes(set));
      expect(kept).toHaveLength(1);
    }
  });

  it('draws an entirely different pair two steps apart', () => {
    let field = createStarfield();
    const before = visibleStars(field, screen);
    field = runFrames(field, 2 * BLINK_STEP_FRAMES); // (0,2) -> (1,3)
    const after = visibleStars(field, screen);
    const key = (star) => `${star.x}:${star.y}:${star.color}`;
    const beforeKeys = new Set(before.map(key));
    expect(after.filter((star) => beforeKeys.has(key(star)))).toHaveLength(0);
  });
});

describe('the f_1D76 scroll machine', () => {
  it('freezes with the enable down, clearing the ramp (l_1DA8)', () => {
    let field = runFrames(playing(0x40), 100);
    expect(field.scrollRows).toBeGreaterThan(0);
    field = runFrames(setStarfieldScrollEnable(field, false), 50);
    const parked = field.scrollRows;
    expect(field.current).toBe(0);
    expect(field.accum).toBe(0);
    field = runFrames(field, 50);
    expect(field.scrollRows).toBe(parked);
  });

  it('runs stage 1 at one row per frame once the ramp has finished', () => {
    // Control 0x40 (new_stage.s:105-117 at stage 1): the accumulator's
    // carry is 1 every frame, so steady state is exactly 1 row/frame.
    let field = runFrames(playing(0x40), 0x40); // the +1/frame ramp
    const start = field.scrollRows;
    field = runFrames(field, 64);
    expect((field.scrollRows - start + 256) % 256).toBe(64);
  });

  it('runs the stage-16 cap at two rows per frame', () => {
    let field = runFrames(playing(0x80), 0x80);
    const start = field.scrollRows;
    field = runFrames(field, 64);
    expect((field.scrollRows - start + 256) % 256).toBe(128);
  });

  it('dithers the in-between controls: stage 4 averages 1.25 rows per frame', () => {
    // Control 0x50: the 6-bit accumulator carries a second row on every
    // fourth frame -- 0x50/0x40 rows per frame on average.
    let field = runFrames(playing(0x50), 0x50);
    const start = field.scrollRows;
    field = runFrames(field, 64);
    expect((field.scrollRows - start + 256) % 256).toBe(80);
  });

  it('re-ramps from zero when the enable returns -- the after-death creep', () => {
    let field = runFrames(playing(0x40), 0x40 + 32);
    field = runFrames(setStarfieldScrollEnable(field, false), 10); // death: ramp cleared
    field = setStarfieldScrollEnable(field, true);
    const start = field.scrollRows;
    // The first frames after respawn barely move: current counts 1, 2, 3...
    // and the accumulator's carry stays 0 until the sums cross 0x40.
    field = runFrames(field, 8);
    expect((field.scrollRows - start + 256) % 256).toBe(0);
    expect(field.current).toBe(8);
  });

  it('reverses at three rows a frame under the tractor beam', () => {
    // The reverse flag (set gg1-3.s l_236D, cleared l_2305/l_2327) takes
    // the l_1D9B path: hardware index 2, and MAME speeds[2] = -3.
    expect(STAR_SPEEDS[2]).toBe(-3);
    let field = setStarfieldReverse(playing(0x40), true);
    field = runFrames(field, 1);
    expect(field.scrollRows).toBe(253);
    field = runFrames(field, 10);
    expect(field.scrollRows).toBe(223);
  });

  it('holds the frozen attract value: STARFIELD_SCROLL.title is speed index 7', () => {
    // gg1-4.s:2173 and the task_man freeze write star_ctrl 7; speeds[7] = 0.
    expect(STARFIELD_SCROLL.title).toBe(0);
    let field = setStarfieldScroll(createStarfield(), STARFIELD_SCROLL.title);
    field = runFrames(field, 100);
    expect(field.scrollRows).toBe(0);
  });

  it('restores every star exactly after a full 256-row wrap', () => {
    // Steady state at control 0x80 is 2 rows/frame: 128 frames is one full
    // wrap of the field, and a multiple of 32 frames leaves the blink phase
    // where it started too.
    let field = runFrames(playing(0x80), 0x80);
    const start = visibleStars(field, screen);
    field = runFrames(field, 64);
    expect(visibleStars(field, screen)).not.toEqual(start);
    field = runFrames(field, 64);
    expect(visibleStars(field, screen)).toEqual(start);
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

  it('scrolls the TABLE X axis down the screen and leaves the horizontal fixed', () => {
    // The 05XX scrolls along its hardware X -- vertical on the portrait
    // cabinet (MAME historic video/galaga.c:570-571, 606: stars_scrollx on
    // tab.x, tab.y fixed). Star 0 of set 0 sits at table (0x85, 0x06):
    // screen x from its table Y, screen y from its scrolled table X.
    const field = { ...createStarfield(), scrollRows: 10 };
    const star = visibleStars(field, screen)[0];
    expect(star.x).toBeCloseTo((0x06 / 256) * screen.width, 6);
    expect(star.y).toBeCloseTo((((0x85 + 10) % 256) / 256) * screen.height, 6);
  });

  it('moves the projection as the field scrolls', () => {
    let field = playing(0x40);
    const before = visibleStars(field, screen);
    field = advanceStarfield(field, 100 * FRAME_MS);
    const after = visibleStars(field, screen);
    expect(after[0].y).not.toBeCloseTo(before[0].y, 6);
    expect(after[0].x).toBeCloseTo(before[0].x, 6);
  });
});

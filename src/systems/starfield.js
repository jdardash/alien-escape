/**
 * The starfield.
 *
 * Galaga's stars are not artwork, and they are not random either. Namco's
 * 05XX chip generates a FIXED table of 252 stars -- four sets of 63, each
 * with a hardwired position on a 256 x 256 field and a hardwired 6-bit
 * colour -- and the game's only involvement is a handful of control bits:
 * which two sets are lit, and how the field scrolls. MAME captured the
 * chip's output on a test rig, and this module runs on that capture
 * (`starData.js`), so star positions and colours here are the arcade's own
 * bytes rather than anything authored or pseudo-random.
 *
 * Scroll control mirrors the ROM's star_ctrl port (task_man.s:328-382):
 * value 1 while the ship flies (scrolling down), value 7 in attract and
 * between events (frozen -- `STAR_SPEEDS[7]` is 0), and reversed upward for
 * the tractor-beam pull (gg1-3.s l_236D sets the reverse flag; l_2305 and
 * l_2327 clear it). Two independent bits pick the lit sets: one chooses
 * set 0 or 1, the other set 2 or 3, so 126 stars show at any moment
 * (MAME video/galaga.c draw_stars, lines 555-560). The cadence on which
 * the ROM flips those bits is not attested in any source we hold, so the
 * 32-frame alternation here is authored.
 */

import { FRAME_MS } from './pathcode.js';
import { STAR_BRIGHTNESS, STAR_SEED, STAR_SPEEDS } from './starData.js';

/** Stars in one hardware set. MAME video/galaga.c:39, "63 stars in each set". */
export const STAR_COUNT = 63;

/** Sets the chip holds; two are lit at any moment. */
export const STAR_SETS = 4;

/**
 * How long each blink phase lasts. AUTHORED: no source attests the period on
 * which the ROM flips the set-select bits; 32 frames at the cabinet rate is
 * the roughly half-second twinkle visible in captures of the machine.
 */
export const BLINK_PERIOD_MS = 32 * FRAME_MS;

/**
 * The scene scroll states, in field rows per frame. Positive moves stars
 * down the screen (our axis; MAME scrolls the same table along the rotated
 * monitor's equivalent axis).
 *
 * - `title`: attract and between-events freeze the field -- the ROM writes
 *   star_ctrl 7 (task_man.s:375) and `STAR_SPEEDS[7]` is 0.
 * - `game`: ship on screen, star_ctrl 1 (gg1-2_fx.s:1414), which indexes
 *   `STAR_SPEEDS[1]` = -2; the sign is flipped onto our down-positive axis.
 * - `capture`: the tractor pull reverses the scroll (gg1-3.s l_236D).
 */
export const STARFIELD_SCROLL = {
  title: STAR_SPEEDS[7],
  game: -STAR_SPEEDS[1],
  capture: STAR_SPEEDS[1],
};

/**
 * A star's rgb colour from its 6-bit table colour: two bits per gun through
 * the brightness map, ordered BBGGRR from the top bit down.
 * MAME video/galaga.c:365-375, PALETTE_INIT( galaga ).
 */
export function starColor(col) {
  const r = STAR_BRIGHTNESS[col & 3];
  const g = STAR_BRIGHTNESS[(col >> 2) & 3];
  const b = STAR_BRIGHTNESS[(col >> 4) & 3];
  return (r << 16) | (g << 8) | b;
}

/**
 * Build the field from the fixed table. No seed: the 05XX always draws the
 * same sky, which is why two cabinets side by side twinkle identically.
 */
export function createStarfield() {
  const sets = Array.from({ length: STAR_SETS }, () => []);
  for (const star of STAR_SEED) {
    sets[star.set].push({ x: star.x, y: star.y, color: starColor(star.col) });
  }

  return {
    sets,
    /** Field scroll offset, in hardware rows. */
    scrollY: 0,
    /** Rows per frame; negative reverses, zero stops. */
    rowsPerFrame: 0,
    /** The two set-select bits: which of {0,1} and which of {2,3} are lit. */
    setBitA: 0,
    setBitB: 0,
    blinkElapsedMs: 0,
  };
}

/** Set the scroll speed, in rows per frame. Returns a new field. */
export function setStarfieldScroll(field, rowsPerFrame) {
  return { ...field, rowsPerFrame };
}

/**
 * Set the two set-select bits directly, as the game drove the hardware's
 * starcontrol[3] and starcontrol[4] lines. Returns a new field.
 */
export function setStarfieldSets(field, bitA, bitB) {
  return { ...field, setBitA: bitA & 1, setBitB: bitB & 1 };
}

/**
 * The two lit sets: `set_a = starcontrol[3]`, `set_b = starcontrol[4] | 0x2`
 * (MAME video/galaga.c:559-560) -- always one of {0,1} plus one of {2,3}.
 */
export function litSets(field) {
  return [field.setBitA, 2 | field.setBitB];
}

/**
 * Advance scroll and blink by a frame delta. Returns a new field.
 *
 * The authored blink flips BOTH select bits together, alternating the lit
 * pair (0,2)/(1,3); `setStarfieldSets` can reach the other two legal pairs.
 */
export function advanceStarfield(field, deltaMs) {
  const frames = deltaMs / FRAME_MS;
  const scrollY = (((field.scrollY + field.rowsPerFrame * frames) % 256) + 256) % 256;

  let { blinkElapsedMs, setBitA, setBitB } = field;
  blinkElapsedMs += deltaMs;
  while (blinkElapsedMs >= BLINK_PERIOD_MS) {
    blinkElapsedMs -= BLINK_PERIOD_MS;
    setBitA ^= 1;
    setBitB ^= 1;
  }

  return { ...field, scrollY, blinkElapsedMs, setBitA, setBitB };
}

/**
 * The stars to draw this frame, projected onto a screen.
 *
 * 126 stars: the two lit sets of 63. The scroll offset moves stars *down*
 * the screen for a ship flying up, and wraps on the 256-row field. MAME
 * additionally offsets x by +16 and y by +112 inside its %256 wrap
 * (video/galaga.c:570-572) to align the field with its 224 x 288 visible
 * area; we project the whole field instead, so those constants are omitted.
 */
export function visibleStars(field, screen) {
  const stars = [];

  for (const setIndex of litSets(field)) {
    for (const star of field.sets[setIndex]) {
      const row = (((star.y + field.scrollY) % 256) + 256) % 256;
      stars.push({
        x: (star.x / 256) * screen.width,
        y: (row / 256) * screen.height,
        color: star.color,
      });
    }
  }

  return stars;
}

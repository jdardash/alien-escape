/**
 * The starfield.
 *
 * Galaga's stars are not artwork. A dedicated chip -- Namco's 05XX -- holds
 * an LFSR whose taps spray 63 star positions per set across a 256 x 256
 * field, four sets in all, lights two sets at a time and swaps which two on
 * a fixed blink cadence, and scrolls the whole field under the game's
 * direction: drifting in attract, streaming during play, dead stopped when
 * nothing flies. This module is that chip as pure data: the PNG tile it
 * replaces scrolled, but it neither blinked nor stopped nor reversed, and
 * its stars were pixels somebody drew rather than numbers the machine made.
 *
 * The 63-per-set count, the four sets, the two-lit-alternating blink and the
 * LFSR generation are the documented hardware behaviour. The specific taps
 * and the colour derivation are authored: the research describes the chip's
 * behaviour, not its netlist.
 */

import { FRAME_MS } from './pathcode.js';

/** Stars in one hardware set. */
export const STAR_COUNT = 63;

/** Sets the chip holds; two are lit at any moment. */
export const STAR_SETS = 4;

/**
 * How long each blink phase lasts: 32 frames at the cabinet rate, which is
 * the roughly half-second twinkle visible in any capture of the machine.
 */
export const BLINK_PERIOD_MS = 32 * FRAME_MS;

/**
 * Stock scroll speeds, in hardware rows per frame.
 *
 * A row is 1/256th of the field, so at speed 1 the sky loops in about 4.2
 * seconds. The title drifts; the game streams half again as fast; death
 * stops the field entirely, which the scene drives through
 * `setStarfieldScroll`.
 */
export const STARFIELD_SCROLL = { title: 0.35, game: 0.6 };

/**
 * One step of a 16-bit Fibonacci LFSR, taps at bits 16, 14, 13 and 11.
 *
 * Maximal-length: from any non-zero seed it visits all 65535 non-zero
 * states before repeating, which is what makes 252 stars drawn from it look
 * scattered rather than patterned.
 */
export function lfsrNext(value) {
  const bit = ((value >> 0) ^ (value >> 2) ^ (value >> 3) ^ (value >> 5)) & 1;
  return ((value >> 1) | (bit << 15)) & 0xffff;
}

/**
 * A star's colour from the LFSR bits: two bits per channel, the way the
 * hardware's colour PROM quantises, so the sky is dim multicoloured points
 * rather than uniform white.
 */
function starColor(value) {
  const channel = (bits) => [70, 130, 190, 255][bits & 3];
  const r = channel(value);
  const g = channel(value >> 2);
  const b = channel(value >> 4);
  return (r << 16) | (g << 8) | b;
}

/** Run the register on several times between samples. */
function lfsrStep(value, steps) {
  let current = value;
  for (let i = 0; i < steps; i += 1) current = lfsrNext(current);
  return current;
}

/**
 * Build the four sets from a seed. Same seed, same sky.
 *
 * Successive register states differ by a single shift, so two adjacent
 * samples are strongly correlated -- taking x and y from neighbouring states
 * draws the sky as diagonal streaks rather than scatter. Stepping the
 * register a different, co-prime number of times before each sample is the
 * whitening that fixes it, which is a stand-in for the hardware's trick of
 * tapping different bits of one free-running register per scanline.
 */
export function createStarfield(seed = 0xace1) {
  let value = (seed & 0xffff) || 0xace1;
  const sets = [];

  for (let set = 0; set < STAR_SETS; set += 1) {
    const stars = [];
    for (let star = 0; star < STAR_COUNT; star += 1) {
      value = lfsrStep(value, 9);
      const x = value & 0xff;
      value = lfsrStep(value, 7);
      const y = (value >> 3) & 0xff;
      value = lfsrStep(value, 5);
      stars.push({ x, y, color: starColor(value) });
    }
    sets.push(stars);
  }

  return {
    sets,
    /** Field scroll offset, in hardware rows. */
    scrollY: 0,
    /** Rows per frame; negative reverses, zero stops. */
    rowsPerFrame: 0,
    blinkElapsedMs: 0,
    blinkPhase: 0,
  };
}

/** Set the scroll speed, in rows per frame. Returns a new field. */
export function setStarfieldScroll(field, rowsPerFrame) {
  return { ...field, rowsPerFrame };
}

/** Advance scroll and blink by a frame delta. Returns a new field. */
export function advanceStarfield(field, deltaMs) {
  const frames = deltaMs / FRAME_MS;
  const scrollY = (((field.scrollY + field.rowsPerFrame * frames) % 256) + 256) % 256;

  let blinkElapsedMs = field.blinkElapsedMs + deltaMs;
  let blinkPhase = field.blinkPhase;
  while (blinkElapsedMs >= BLINK_PERIOD_MS) {
    blinkElapsedMs -= BLINK_PERIOD_MS;
    blinkPhase = (blinkPhase + 1) % 2;
  }

  return { ...field, scrollY, blinkElapsedMs, blinkPhase };
}

/**
 * The stars to draw this frame, projected onto a screen.
 *
 * Two of the four sets are lit: sets 0 and 2 in one blink phase, 1 and 3 in
 * the other, which is the alternation that reads as twinkling. The scroll
 * offset moves stars *down* the screen for a ship flying up.
 */
export function visibleStars(field, screen) {
  const lit = field.blinkPhase === 0 ? [0, 2] : [1, 3];
  const stars = [];

  for (const setIndex of lit) {
    for (const star of field.sets[setIndex]) {
      const row = (star.y + field.scrollY) % 256;
      stars.push({
        x: (star.x / 256) * screen.width,
        y: (row / 256) * screen.height,
        color: star.color,
      });
    }
  }

  return stars;
}

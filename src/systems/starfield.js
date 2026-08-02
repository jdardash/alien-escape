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
 * The two set-select lines blink on the GLOBAL frame counter: `jp_Task_man`
 * folds bits 2-4 of `ds3_92A0_frame_cts` through `(c >> 1) ^ c` and keeps
 * bits 3-4 (task_man.s:362-368), which lands `f3 ^ f4` on starcontrol[3]
 * and `f4` on starcontrol[4] -- a Gray-code walk of the lit pair,
 * (0,2) -> (1,2) -> (1,3) -> (0,3), one step every 8 frames.
 *
 * Scroll is the ROM's star_ctrl machine, `f_1D76` (gg1-2_fx.s:1414-1464)
 * over the six bytes at 99B9 (mrw.s:536-542): +0 is the scroll enable
 * (1 while the fighter is on the board), +1 the tractor-beam reverse flag
 * (set at gg1-3.s l_236D, cleared at l_2305 and l_2327), +2 the stage's
 * speed control from `new_stage.s:105-117` (`starSpeedControl`), and +5 the
 * hardware value the ports get. The machine ramps a current value toward
 * the control at +1 per frame and runs it through a 6-bit accumulator whose
 * carry bits are the rows scrolled this frame -- which is both the per-stage
 * speed ramp (average control/64 rows per frame, 1.0 at stage 1 up to 2.0
 * at stage 16+) and the re-ramp after a death (the enable-off path clears
 * the ramp, l_1DA8). The reverse path bypasses the ramp with hardware index
 * 2: `STAR_SPEEDS[2]` = -3, three rows upward.
 *
 * The scrolled axis is the chip's hardware X -- the raster's horizontal,
 * which the portrait cabinet mounts VERTICAL. MAME's historic
 * video/galaga.c adds `speeds[]` to `stars_scrollx` (line 606) and draws
 * `x = (tab.x + scroll) % 256` with tab.y fixed (570-571); the modern
 * starfield_05xx device likewise wires the game's three control lines to
 * SCROLL_X. So the table's x is the screen-vertical, scrolled coordinate
 * and the table's y is the screen-horizontal one.
 */

import { FRAME_MS } from './pathcode.js';
import { STAR_BRIGHTNESS, STAR_SEED, STAR_SPEEDS } from './starData.js';

/** Stars in one hardware set. MAME video/galaga.c:39, "63 stars in each set". */
export const STAR_COUNT = 63;

/** Sets the chip holds; two are lit at any moment. */
export const STAR_SETS = 4;

/**
 * Frames per blink step: the select bits are bits 3-4 of the frame counter
 * (task_man.s:362-368), so the lit pair advances every 8 frames.
 */
export const BLINK_STEP_FRAMES = 8;

/** The attested Gray-code cycle of lit pairs, one step per 8 frames. */
export const BLINK_CYCLE = [
  [0, 2],
  [1, 2],
  [1, 3],
  [0, 3],
];

/**
 * The legacy scene speeds. Only the frozen state remains: attract and the
 * results screens write star_ctrl 7 (gg1-4.s:2173; the task_man freeze path
 * at task_man.s:375) and `STAR_SPEEDS[7]` is 0. Play and capture speeds now
 * come out of the `f_1D76` machine below, not fixed constants.
 */
export const STARFIELD_SCROLL = {
  title: STAR_SPEEDS[7],
};

/**
 * The set-select bits the frame counter produces (task_man.s:362-368):
 * starcontrol[3] = f3 ^ f4, starcontrol[4] = f4, for f3/f4 the counter's
 * bits 3 and 4.
 */
export function blinkBits(frame) {
  const f3 = (frame >> 3) & 1;
  const f4 = (frame >> 4) & 1;
  return { bitA: f3 ^ f4, bitB: f4 };
}

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
    /** Field scroll offset along the scrolled (screen-vertical) axis, in rows. */
    scrollRows: 0,
    /** The global frame counter: blink phase and the machine's cadence. */
    frame: 0,
    frameAccMs: 0,
    /** Fixed rows-per-frame override for the frozen screens; null runs the machine. */
    rowsPerFrame: null,
    /** star_ctrl+0: 1 while the fighter is on the board. */
    scrollEnable: false,
    /** star_ctrl+1: the tractor-beam reverse flag. */
    reverse: false,
    /** star_ctrl+2 (99BB): the stage's speed control, `starSpeedControl`. */
    control: 0x40,
    /** 99BC: the ramp value chasing the control at +1 per frame. */
    current: 0,
    /** 99BD: the 6-bit fractional accumulator. */
    accum: 0,
    /** The two set-select bits: which of {0,1} and which of {2,3} are lit. */
    setBitA: 0,
    setBitB: 0,
  };
}

/**
 * Fix the scroll to a constant rows-per-frame, bypassing the machine -- the
 * frozen screens pass `STARFIELD_SCROLL.title` (0). Returns a new field.
 */
export function setStarfieldScroll(field, rowsPerFrame) {
  return { ...field, rowsPerFrame };
}

/** Set the stage's speed control byte (star_ctrl+2). Returns a new field. */
export function setStarfieldControl(field, control) {
  return { ...field, control: control & 0xff };
}

/** Set star_ctrl+0, the fighter-on-board scroll enable. Returns a new field. */
export function setStarfieldScrollEnable(field, enabled) {
  return { ...field, scrollEnable: !!enabled };
}

/** Set star_ctrl+1, the tractor-beam reverse flag. Returns a new field. */
export function setStarfieldReverse(field, reverse) {
  return { ...field, reverse: !!reverse };
}

/**
 * Set the two set-select bits directly, as the game drove the hardware's
 * starcontrol[3] and starcontrol[4] lines. Returns a new field. The next
 * `advanceStarfield` re-derives them from the frame counter, exactly as
 * `jp_Task_man` rewrites the ports every interrupt.
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
 * One frame of `f_1D76`: how many rows the field scrolls, mutating the
 * machine registers on the passed object. Down-positive, matching the
 * forward (+X) direction of MAME's speeds table.
 */
function scrollRowsThisFrame(machine) {
  if (machine.rowsPerFrame !== null) return machine.rowsPerFrame;

  if (!machine.scrollEnable) {
    // l_1DA8: freeze (hardware value 7) and clear the ramp, which is what
    // makes the scroll RE-RAMP from a stop after a death.
    machine.current = 0;
    machine.accum = 0;
    return STAR_SPEEDS[7];
  }

  if (machine.reverse) {
    // l_1D9B with A = 0xFD: neg, dec, and 7 -> hardware index 2, and
    // MAME's speeds[2] is -3 -- the pull runs three rows upward.
    return STAR_SPEEDS[2];
  }

  // l_1D8F: chase the control at +1 per frame, add the current value into
  // the 6-bit accumulator, and the two carry bits are this frame's rows --
  // v of 0-3, sent to the hardware as index (-v - 1) & 7 = 7, 6, 5, 4,
  // whose speeds are 0, 1, 2, 3 rows forward.
  if (machine.current !== machine.control) machine.current = (machine.current + 1) & 0xff;
  const sum = (machine.current + machine.accum) & 0xff;
  machine.accum = sum & 0x3f;
  const v = (sum >> 6) & 0x03;
  return STAR_SPEEDS[(-v - 1) & 0x07];
}

/**
 * Advance scroll and blink by a frame delta. Returns a new field.
 *
 * Runs whole hardware frames out of the accumulated delta: the machine is
 * the ROM's per-interrupt code, so its arithmetic is per-frame discrete.
 */
export function advanceStarfield(field, deltaMs) {
  const next = { ...field };

  // The tiny epsilon keeps an exact multiple of FRAME_MS from losing a
  // frame to floating-point rounding.
  next.frameAccMs += Math.max(deltaMs, 0);
  let frames = Math.floor(next.frameAccMs / FRAME_MS + 1e-9);
  next.frameAccMs -= frames * FRAME_MS;

  while (frames > 0) {
    frames -= 1;
    next.frame += 1;
    const rows = scrollRowsThisFrame(next);
    next.scrollRows = (((next.scrollRows + rows) % 256) + 256) % 256;
  }

  const { bitA, bitB } = blinkBits(next.frame);
  next.setBitA = bitA;
  next.setBitB = bitB;
  return next;
}

/**
 * The stars to draw this frame, projected onto a screen.
 *
 * 126 stars: the two lit sets of 63. The scrolled coordinate is the TABLE'S
 * X -- the chip's hardware axis, vertical on the portrait cabinet (see the
 * header) -- moving stars down the screen for a ship flying up and wrapping
 * on the 256-row field; the table's y is the screen-horizontal position.
 * MAME additionally offsets the fixed axis by +112 and the scrolled one by
 * +16 inside its %256 wrap (video/galaga.c:570-572) to align the field with
 * its 224 x 288 visible area; we project the whole field instead, so those
 * constants are omitted.
 */
export function visibleStars(field, screen) {
  const stars = [];

  for (const setIndex of litSets(field)) {
    for (const star of field.sets[setIndex]) {
      const row = (((star.x + field.scrollRows) % 256) + 256) % 256;
      stars.push({
        x: (star.y / 256) * screen.width,
        y: (row / 256) * screen.height,
        color: star.color,
      });
    }
  }

  return stars;
}

import { describe, it, expect } from 'vitest';
import { BEAM_COLORS, beamStripsAt } from '../src/systems/beam.js';
import { BEAM_STRIPS, beamTimings } from '../src/systems/capture.js';
import { CAPTURE } from '../src/config.js';

// The options exactly as the scene wires them: the ROM's 11 strips and the
// stage-1 clock (12 frames a strip) from `beamTimings`, the presentation
// numbers from config.
const clock = beamTimings(12);
const opts = {
  strips: BEAM_STRIPS,
  openMs: clock.openMs,
  cycleMs: CAPTURE.beamCycleMs,
  retractMs: clock.retractMs,
  width: CAPTURE.beamWidth,
  length: CAPTURE.beamLength,
};

describe('beamStripsAt', () => {
  it('unfurls from nothing to the full fan over the opening window', () => {
    expect(beamStripsAt('opening', 0, opts)).toHaveLength(0);

    let last = 0;
    for (let t = 0; t <= opts.openMs; t += 25) {
      const count = beamStripsAt('opening', t, opts).length;
      expect(count).toBeGreaterThanOrEqual(last);
      last = count;
    }
    expect(beamStripsAt('opening', opts.openMs, opts)).toHaveLength(opts.strips);
  });

  it('reveals strips from the boss downward', () => {
    const some = beamStripsAt('opening', opts.openMs / 2, opts);
    expect(some.length).toBeGreaterThan(0);
    expect(some.length).toBeLessThan(opts.strips);
    // The strips present are the topmost ones, in order.
    some.forEach((strip, i) => expect(strip.index).toBe(i));
  });

  it('shows the whole fan while the beam is active', () => {
    for (const t of [0, 50, 500, 1399]) {
      expect(beamStripsAt('active', t, opts)).toHaveLength(opts.strips);
    }
  });

  it('cycles the three colours down the fan as time passes', () => {
    const at = (t) => beamStripsAt('active', t, opts).map((strip) => strip.color);

    const first = at(0);
    expect(new Set(first).size).toBe(BEAM_COLORS.length);
    // One cycle step later the pattern has rotated; a full period brings it back.
    expect(at(opts.cycleMs)).not.toEqual(first);
    expect(at(opts.cycleMs * BEAM_COLORS.length)).toEqual(first);
  });

  it('draws a cone: each strip at least as wide as the one above it', () => {
    const strips = beamStripsAt('active', 0, opts);
    for (let i = 1; i < strips.length; i += 1) {
      expect(strips[i].width).toBeGreaterThanOrEqual(strips[i - 1].width);
    }
    expect(strips[strips.length - 1].width).toBeCloseTo(opts.width, 6);
  });

  it('covers the full beam length with no gaps', () => {
    const strips = beamStripsAt('active', 0, opts);
    expect(strips[0].yOffset).toBe(0);
    for (let i = 1; i < strips.length; i += 1) {
      expect(strips[i].yOffset).toBeCloseTo(strips[i - 1].yOffset + strips[i - 1].height, 6);
    }
    const last = strips[strips.length - 1];
    expect(last.yOffset + last.height).toBeCloseTo(opts.length, 6);
  });

  it('retracts to nothing by the end of the retract window, top strips last', () => {
    expect(beamStripsAt('retracting', 0, opts).length).toBe(opts.strips);

    let last = opts.strips;
    for (let t = 0; t <= opts.retractMs; t += 10) {
      const strips = beamStripsAt('retracting', t, opts);
      expect(strips.length).toBeLessThanOrEqual(last);
      strips.forEach((strip, i) => expect(strip.index).toBe(i));
      last = strips.length;
    }
    expect(beamStripsAt('retracting', opts.retractMs, opts)).toHaveLength(0);
  });

  it('is total: any phase string it does not know draws nothing', () => {
    expect(beamStripsAt('gone', 100, opts)).toEqual([]);
  });
});

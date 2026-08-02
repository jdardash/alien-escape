import { describe, it, expect } from 'vitest';
import { SAMPLE_RATE, noteHz, melody, renderSound } from '../src/audio/synth.js';

/** Largest absolute sample in a rendered buffer. */
function peak(samples) {
  return samples.reduce((loudest, sample) => Math.max(loudest, Math.abs(sample)), 0);
}

/** True when every sample is a real number inside the representable range. */
function isClean(samples) {
  return samples.every((sample) => Number.isFinite(sample) && Math.abs(sample) <= 1);
}

/**
 * How many times the waveform changes sign between two sample indices.
 *
 * A cheap, honest stand-in for pitch: twice the frequency, whatever the shape
 * of the wave, and it needs no transform to read.
 */
function crossings(samples, from, to) {
  let count = 0;
  for (let i = from + 1; i < to; i += 1) {
    if (Math.sign(samples[i]) !== Math.sign(samples[i - 1])) count += 1;
  }
  return count;
}

describe('note names', () => {
  it('puts concert A where concert A belongs', () => {
    expect(noteHz('A4')).toBeCloseTo(440, 6);
  });

  it('doubles across an octave', () => {
    expect(noteHz('A5')).toBeCloseTo(880, 6);
    expect(noteHz('A3')).toBeCloseTo(220, 6);
  });

  it('reads sharps as the semitone above', () => {
    expect(noteHz('A#4')).toBeCloseTo(440 * 2 ** (1 / 12), 6);
    expect(noteHz('C5')).toBeGreaterThan(noteHz('B4'));
  });

  it('takes a number through unchanged, so a spec can name a pitch either way', () => {
    expect(noteHz(1200)).toBe(1200);
  });
});

describe('rendering a sound', () => {
  it('produces exactly as many samples as the layers ask for', () => {
    const rendered = renderSound({ layers: [{ wave: 'square', hz: 440, duration: 0.5 }] });

    expect(rendered).toHaveLength(Math.round(0.5 * SAMPLE_RATE));
  });

  it('runs to the end of the last layer, not the first', () => {
    const rendered = renderSound({
      layers: [
        { wave: 'square', hz: 440, duration: 0.1 },
        { wave: 'square', hz: 660, at: 0.4, duration: 0.1 },
      ],
    });

    expect(rendered).toHaveLength(Math.round(0.5 * SAMPLE_RATE));
  });

  it('honours a spec that asks to run on past its last layer', () => {
    const rendered = renderSound({
      duration: 1,
      layers: [{ wave: 'square', hz: 440, duration: 0.1 }],
    });

    expect(rendered).toHaveLength(SAMPLE_RATE);
  });

  it('is audible', () => {
    const rendered = renderSound({ layers: [{ wave: 'square', hz: 440, duration: 0.2 }] });

    expect(peak(rendered)).toBeGreaterThan(0.1);
  });

  it('never produces a sample outside the range a speaker can take', () => {
    // Six loud layers stacked on one instant is the shape that clips, and a
    // buffer with a sample outside [-1, 1] in it is a crackle rather than a
    // sound.
    const rendered = renderSound({
      layers: Array.from({ length: 6 }, () => ({ wave: 'square', hz: 220, duration: 0.2 })),
    });

    expect(isClean(rendered)).toBe(true);
    expect(peak(rendered)).toBeGreaterThan(0.5);
  });

  // Every sound in the game is built once at startup from these specs. A
  // renderer that drifted run to run would make the bank untestable and the
  // game's own audio unreproducible.
  it('renders the same spec to the same samples every time', () => {
    const spec = {
      layers: [
        { wave: 'noise', duration: 0.2 },
        { wave: 'saw', hz: [800, 100], duration: 0.2 },
      ],
    };

    expect(Array.from(renderSound(spec))).toEqual(Array.from(renderSound(spec)));
  });

  it('gives two different noise seeds two different bursts', () => {
    const burst = (seed) => renderSound({ layers: [{ wave: 'noise', duration: 0.2, seed }] });

    expect(Array.from(burst(1))).not.toEqual(Array.from(burst(2)));
  });

  it('renders an empty spec as silence rather than as nothing', () => {
    const rendered = renderSound({ duration: 0.1, layers: [] });

    expect(rendered).toHaveLength(Math.round(0.1 * SAMPLE_RATE));
    expect(peak(rendered)).toBe(0);
  });
});

describe('the waveforms', () => {
  const render = (wave) => renderSound({ layers: [{ wave, hz: 200, duration: 0.1 }] });

  it('offers every shape the sound bank asks for', () => {
    for (const wave of ['square', 'triangle', 'saw', 'sine', 'noise']) {
      expect(isClean(render(wave))).toBe(true);
      expect(peak(render(wave))).toBeGreaterThan(0.1);
    }
  });

  it('gives each shape its own sound', () => {
    const shapes = ['square', 'triangle', 'saw', 'sine'].map((wave) =>
      Array.from(render(wave)).join(),
    );

    expect(new Set(shapes).size).toBe(4);
  });

  // The sound bank leans on duty cycle to tell one square voice from another,
  // the way the cabinet's wavetables did.
  it('changes a square voice when its duty cycle changes', () => {
    const at = (duty) =>
      Array.from(renderSound({ layers: [{ wave: 'square', hz: 200, duration: 0.1, duty }] }));

    expect(at(0.5)).not.toEqual(at(0.125));
  });

  it('rejects a waveform it does not have rather than rendering silence', () => {
    expect(() => renderSound({ layers: [{ wave: 'bagpipe', hz: 200, duration: 0.1 }] })).toThrow(
      /bagpipe/,
    );
  });
});

describe('the envelope', () => {
  it('starts from silence, so a sound cannot open with a click', () => {
    const rendered = renderSound({ layers: [{ wave: 'square', hz: 440, duration: 0.2 }] });

    expect(Math.abs(rendered[0])).toBeLessThan(0.05);
  });

  it('ends in silence, so a sound cannot close with one either', () => {
    const rendered = renderSound({ layers: [{ wave: 'square', hz: 440, duration: 0.2 }] });

    expect(Math.abs(rendered[rendered.length - 1])).toBeLessThan(0.05);
  });

  it('decays to a quiet tail when asked for a percussive hit', () => {
    const rendered = renderSound({
      layers: [{ wave: 'square', hz: 440, duration: 0.4, decay: 0.05, sustain: 0 }],
    });

    const head = peak(rendered.slice(0, Math.round(0.05 * SAMPLE_RATE)));
    const tail = peak(rendered.slice(Math.round(0.2 * SAMPLE_RATE)));

    expect(head).toBeGreaterThan(0.3);
    expect(tail).toBeLessThan(0.05);
  });

  it('scales a layer by its own gain', () => {
    const at = (gain) =>
      peak(renderSound({ layers: [{ wave: 'square', hz: 440, duration: 0.2, gain }] }));

    expect(at(0.25)).toBeLessThan(at(1) / 2);
  });
});

describe('pitch movement', () => {
  it('glides between two pitches when given a pair', () => {
    // A falling sweep crosses zero more often at the start than at the end,
    // which is the cheapest honest way to see the pitch actually moving.
    const rendered = renderSound({
      layers: [{ wave: 'square', hz: [1600, 100], duration: 0.4, release: 0.01 }],
    });

    const half = Math.round(rendered.length / 2);
    expect(crossings(rendered, 0, half)).toBeGreaterThan(
      crossings(rendered, half, rendered.length) * 2,
    );
  });

  it('holds a steady pitch when given one number', () => {
    const rendered = renderSound({
      layers: [{ wave: 'square', hz: 400, duration: 0.4, release: 0.01 }],
    });

    const half = Math.round(rendered.length / 2);
    const opening = crossings(rendered, 0, half);
    const closing = crossings(rendered, half, rendered.length);

    expect(Math.abs(opening - closing) / opening).toBeLessThan(0.05);
  });

  it('wobbles a pitch when given vibrato', () => {
    const plain = { wave: 'square', hz: 400, duration: 0.3 };
    const wobbled = { ...plain, vibrato: { hz: 12, semitones: 1 } };

    expect(Array.from(renderSound({ layers: [plain] }))).not.toEqual(
      Array.from(renderSound({ layers: [wobbled] })),
    );
  });
});

describe('writing a melody', () => {
  it('lays notes end to end', () => {
    const layers = melody([['A4', 0.1], ['C5', 0.2]], { wave: 'square' });

    expect(layers).toHaveLength(2);
    expect(layers[0].at).toBe(0);
    expect(layers[1].at).toBeCloseTo(0.1, 6);
  });

  it('starts where it is told to', () => {
    const layers = melody([['A4', 0.1]], { wave: 'square', at: 0.5 });

    expect(layers[0].at).toBeCloseTo(0.5, 6);
  });

  it('takes time for a rest without sounding a note in it', () => {
    const layers = melody([['A4', 0.1], [null, 0.1], ['C5', 0.1]], { wave: 'square' });

    expect(layers).toHaveLength(2);
    expect(layers[1].at).toBeCloseTo(0.2, 6);
  });

  it('passes its shape through to every note', () => {
    const layers = melody([['A4', 0.1], ['C5', 0.1]], { wave: 'triangle', gain: 0.3 });

    for (const layer of layers) {
      expect(layer.wave).toBe('triangle');
      expect(layer.gain).toBe(0.3);
    }
  });

  it('renders to something audible', () => {
    const rendered = renderSound({
      layers: melody([['A4', 0.1], ['C5', 0.1], ['E5', 0.1]], { wave: 'square' }),
    });

    expect(isClean(rendered)).toBe(true);
    expect(peak(rendered)).toBeGreaterThan(0.1);
  });
});

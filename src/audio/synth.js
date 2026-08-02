/**
 * The synthesiser every sound in this game is built from.
 *
 * Galaga ran on a Namco WSG: three voices reading 4-bit wavetables, plus a
 * discrete noise circuit for the explosions. That is a small enough palette
 * that a game can be given its whole voice back from arithmetic -- square,
 * triangle, saw and an LFSR -- rather than from the cabinet's own samples,
 * which are Bandai Namco's and have no business in a public repository. See
 * `docs/local-audio.md`.
 *
 * Everything here is pure: a spec goes in, a `Float32Array` comes out, and the
 * same spec always renders the same samples. Nothing touches an `AudioContext`,
 * which is what lets `tests/synth.test.js` and `tests/soundBank.test.js` listen
 * to the whole bank under Node. The one seam that turns these samples into
 * something Phaser can play is `installSoundBank` in `soundBank.js`, and it is
 * the only part of the audio layer that needs a browser.
 */

/**
 * The rate the bank is rendered at.
 *
 * Half of CD rate: the WSG's own output was a 4-bit stream nowhere near this
 * fine, nothing in the bank carries useful content above 11 kHz, and Web Audio
 * resamples a buffer to the output rate on playback whatever it was authored
 * at. It halves the memory the bank occupies for no audible cost.
 */
export const SAMPLE_RATE = 22050;

/** Semitone offsets within an octave, for `noteHz`. */
const SEMITONES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** Default envelope, in seconds and levels. A flat tone that cannot click. */
const ENVELOPE_DEFAULTS = { attack: 0.004, decay: 0, sustain: 1, release: 0.02 };

/** Steps per second an unpitched noise layer clocks its shift register at. */
const DEFAULT_NOISE_HZ = 8000;

/**
 * A pitch, from a note name or from a number.
 *
 * Note names exist because the melodic sounds -- the fanfares, the two
 * end-of-game tunes, the attract theme -- are written as tunes rather than as
 * frequency tables, and `['C5', 0.1]` is readable in a way `523.25` is not. A
 * number passes through, because a sweep from 1600 down to 100 is a noise and
 * not a note.
 */
export function noteHz(note) {
  if (typeof note === 'number') return note;

  const match = /^([A-G])(#|b)?(-?\d)$/.exec(note);
  if (!match) throw new Error(`unknown note "${note}"`);

  const [, letter, accidental, octave] = match;
  const semitone =
    SEMITONES[letter] + (accidental === '#' ? 1 : 0) - (accidental === 'b' ? 1 : 0);

  // MIDI 69 is A4 at 440 Hz, and MIDI 12 is C0.
  const midi = (Number(octave) + 1) * 12 + semitone;
  return 440 * 2 ** ((midi - 69) / 12);
}

/**
 * A tune, as layers laid end to end.
 *
 * Notes are `[name, seconds]` pairs and a name of `null` is a rest, which takes
 * its time without producing a layer. Every other option is copied onto each
 * note, so the shape of a phrase is written once rather than per note.
 */
export function melody(notes, { at = 0, ...shape } = {}) {
  const layers = [];
  let cursor = at;

  for (const [note, duration] of notes) {
    if (note !== null) layers.push({ ...shape, hz: noteHz(note), at: cursor, duration });
    cursor += duration;
  }

  return layers;
}

/**
 * The noise source, as a linear-feedback shift register.
 *
 * The cabinet's noise came from a shift register too, which is why arcade
 * explosions have a grain to them that white noise from a random number
 * generator does not. Seeding it explicitly is what keeps the bank
 * reproducible: nothing in this file may call `Math.random`, or two runs of the
 * game would not sound alike and no test could pin any of it.
 */
function createNoise(seed) {
  // Any non-zero seed works; zero would lock the register at zero forever.
  let register = (Math.trunc(seed) & 0xffff) || 0xace1;

  return () => {
    const bit = (register ^ (register >> 2) ^ (register >> 3) ^ (register >> 5)) & 1;
    register = (register >> 1) | (bit << 15);
    return register & 1 ? 1 : -1;
  };
}

/** One cycle of a waveform, from a phase in [0, 1). */
function waveAt(wave, phase, duty) {
  switch (wave) {
    case 'square':
      return phase < duty ? 1 : -1;
    case 'triangle':
      return 1 - 4 * Math.abs(phase - 0.5);
    case 'saw':
      return 2 * phase - 1;
    case 'sine':
      return Math.sin(2 * Math.PI * phase);
    default:
      throw new Error(`unknown waveform "${wave}"`);
  }
}

/**
 * The gain envelope at a point through a layer, as a level in [0, 1].
 *
 * Attack, decay to a sustain level, then a release that lands on exactly zero
 * at the end of the layer. Both ends matter: a layer that began or ended at
 * full amplitude would put a step in the buffer, and a step is a click.
 */
function envelopeAt(elapsed, duration, { attack, decay, sustain, release }) {
  if (elapsed < attack) return elapsed / attack;

  const fromEnd = duration - elapsed;
  const level =
    decay > 0 && elapsed < attack + decay
      ? 1 - (1 - sustain) * ((elapsed - attack) / decay)
      : sustain;

  return fromEnd < release ? level * Math.max(fromEnd / release, 0) : level;
}

/** The frequency of a layer at a point through it, following glide and vibrato. */
function frequencyAt(progress, elapsed, { hz, vibrato }) {
  // A pair glides between the two exponentially, because pitch is heard in
  // ratios: 1600 down to 100 has to spend as long crossing the top octave as
  // the bottom one or it is a click followed by a tone.
  const base = Array.isArray(hz) ? hz[0] * (hz[1] / hz[0]) ** progress : hz;
  if (!vibrato) return base;

  const swing = Math.sin(2 * Math.PI * vibrato.hz * elapsed) * vibrato.semitones;
  return base * 2 ** (swing / 12);
}

/** Render one layer into an already-allocated buffer. */
function renderLayer(target, layer) {
  const {
    wave,
    at = 0,
    duration,
    hz = wave === 'noise' ? DEFAULT_NOISE_HZ : 440,
    duty = 0.5,
    gain = 1,
    seed = 1,
  } = layer;

  const envelope = { ...ENVELOPE_DEFAULTS, ...layer };
  const start = Math.round(at * SAMPLE_RATE);
  const length = Math.round(duration * SAMPLE_RATE);
  const nextNoise = wave === 'noise' ? createNoise(seed) : null;

  // Held across samples rather than recomputed from the elapsed time, so that a
  // glide stays phase-continuous. Deriving phase from `elapsed * hz` would
  // restart the wave every time the frequency moved, which sounds like a rip.
  let phase = 0;
  let noiseClock = 0;
  let noiseValue = 0;

  for (let i = 0; i < length; i += 1) {
    const index = start + i;
    if (index >= target.length) break;

    const elapsed = i / SAMPLE_RATE;
    const frequency = frequencyAt(length > 1 ? i / (length - 1) : 0, elapsed, { hz, vibrato: layer.vibrato });
    const level = envelopeAt(elapsed, duration, envelope) * gain;

    if (nextNoise) {
      // The register is clocked at `hz` steps a second rather than once per
      // sample, which is what separates a low rumble from a hiss.
      noiseClock += frequency / SAMPLE_RATE;
      while (noiseClock >= 1) {
        noiseValue = nextNoise();
        noiseClock -= 1;
      }
      target[index] += noiseValue * level;
      continue;
    }

    phase += frequency / SAMPLE_RATE;
    phase -= Math.floor(phase);
    target[index] += waveAt(wave, phase, duty) * level;
  }
}

/**
 * Render a sound to samples.
 *
 * The spec is `{ duration?, layers }`. The buffer runs to the end of the last
 * layer unless `duration` asks for more, which the looping ambient pulse does:
 * its silence between beats is as much of the sound as its beats are.
 */
export function renderSound({ duration, layers = [] }) {
  const layerEnd = layers.reduce((end, layer) => Math.max(end, (layer.at ?? 0) + layer.duration), 0);
  const length = Math.round(Math.max(duration ?? 0, layerEnd) * SAMPLE_RATE);
  const samples = new Float32Array(length);

  for (const layer of layers) renderLayer(samples, layer);

  // Layers are summed, so a sound with several loud voices landing together can
  // leave the range a speaker can reproduce. Soft-clipping only when it
  // actually happens keeps every quieter sound linear rather than putting a
  // curve through the whole bank.
  let loudest = 0;
  for (const sample of samples) loudest = Math.max(loudest, Math.abs(sample));

  if (loudest > 1) {
    for (let i = 0; i < samples.length; i += 1) samples[i] = Math.tanh(samples[i]);
  }

  for (let i = 0; i < samples.length; i += 1) {
    samples[i] = Math.min(1, Math.max(-1, samples[i]));
  }

  return samples;
}

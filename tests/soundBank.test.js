import { describe, it, expect } from 'vitest';
import { SOUND_SPECS, renderBank, installSoundBank } from '../src/audio/soundBank.js';
import { SAMPLE_RATE, renderSound } from '../src/audio/synth.js';

const bank = renderBank();

function peak(samples) {
  return samples.reduce((loudest, sample) => Math.max(loudest, Math.abs(sample)), 0);
}

function seconds(samples) {
  return samples.length / SAMPLE_RATE;
}

/** Enough of a rendered sound to tell it apart from a different one. */
function fingerprint(samples) {
  return [samples.length, ...Array.from(samples.slice(0, 400))].join();
}

/** A Phaser scene with just enough of one to install a bank into. */
function fakeScene({ context = fakeContext(), cached = [] } = {}) {
  const audio = new Map(cached.map((key) => [key, 'already here']));

  return {
    sound: { context },
    cache: {
      audio: {
        has: (key) => audio.has(key),
        add: (key, data) => audio.set(key, data),
        get: (key) => audio.get(key),
        entries: () => audio,
      },
    },
  };
}

function fakeContext() {
  return {
    createBuffer(channels, length, sampleRate) {
      const data = new Float32Array(length);
      return {
        numberOfChannels: channels,
        length,
        sampleRate,
        getChannelData: () => data,
        copyToChannel: (source) => data.set(source),
      };
    },
  };
}

describe('the sound bank', () => {
  it('gives every sound in it something audible', () => {
    for (const [name, samples] of Object.entries(bank)) {
      expect(peak(samples), name).toBeGreaterThan(0.05);
    }
  });

  it('never produces a sample outside the range a speaker can take', () => {
    for (const [name, samples] of Object.entries(bank)) {
      const clean = samples.every((sample) => Number.isFinite(sample) && Math.abs(sample) <= 1);
      expect(clean, name).toBe(true);
    }
  });

  it('keeps every sound short enough to be a game sound', () => {
    for (const [name, samples] of Object.entries(bank)) {
      expect(seconds(samples), name).toBeGreaterThan(0.02);
      expect(seconds(samples), name).toBeLessThanOrEqual(10);
    }
  });

  // Two shots and two hits landing in the same tenth of a second is normal
  // play, so a gun sample longer than the gap between shots would pile copies
  // of itself up rather than sounding like a gun.
  it('keeps the sounds that fire fastest the shortest', () => {
    for (const name of ['fighterShot1', 'fighterShot2', 'enemyFire']) {
      expect(seconds(bank[name]), name).toBeLessThan(0.15);
    }
  });

  it('renders no two sounds identically', () => {
    const prints = Object.values(bank).map(fingerprint);

    expect(new Set(prints).size).toBe(prints.length);
  });
});

describe('the distinctions the game is played on', () => {
  // The gun alternates two samples precisely so that a held trigger does not
  // flatten into one tone. Two names for one sound would undo that silently.
  it('gives the two fighter shots two different sounds', () => {
    expect(fingerprint(bank.fighterShot1)).not.toBe(fingerprint(bank.fighterShot2));
  });

  it('gives each rank of enemy its own cry', () => {
    const cries = [bank.zakoDeath, bank.goeiDeath, bank.bossDeath].map(fingerprint);

    expect(new Set(cries).size).toBe(3);
  });

  // A Boss Galaga surviving its first hit is the one case where a hit is not a
  // death, and the sound is half of how the player is told.
  it('makes a boss surviving a hit sound unlike a boss dying', () => {
    expect(fingerprint(bank.bossHit)).not.toBe(fingerprint(bank.bossDeath));
  });

  it('makes a boss that survived sound less final than one that did not', () => {
    expect(seconds(bank.bossHit)).toBeLessThan(seconds(bank.bossDeath));
  });

  it('answers a challenging stage differently for all forty than for short', () => {
    expect(fingerprint(bank.challengePerfect)).not.toBe(fingerprint(bank.challengeMiss));
  });

  it('plays a different tune for taking first place than for any other', () => {
    expect(fingerprint(bank.highScoreEntry)).not.toBe(fingerprint(bank.gameOverTune));
  });
});

describe('the two sounds that loop', () => {
  // Phaser loops these by restarting the buffer, so the last sample runs
  // straight into the first and the step between them is the click. Both ends
  // have to be at rest, and the opening has to rise into the sound rather than
  // begin inside it -- otherwise this is a click once a second, or once every
  // eight, for as long as the game is running.
  it.each(['ambient', 'theme'])('joins %s back onto itself without a click', (name) => {
    const samples = bank[name];
    const tail = Math.round(0.01 * SAMPLE_RATE);
    const ramp = Math.round(0.001 * SAMPLE_RATE);

    expect(Math.abs(samples[0])).toBeLessThan(0.02);
    expect(peak(samples.slice(-tail))).toBeLessThan(0.02);
    expect(peak(samples.slice(0, ramp))).toBeLessThan(peak(samples) * 0.5);
  });

  it('keeps the ambient pulse short enough to be a pulse', () => {
    expect(seconds(bank.ambient)).toBeLessThan(2);
  });

  it('gives the attract theme long enough to be a tune', () => {
    expect(seconds(bank.theme)).toBeGreaterThan(4);
  });
});

describe('rendering the bank', () => {
  it('renders every spec it is given', () => {
    expect(Object.keys(bank).sort()).toEqual(Object.keys(SOUND_SPECS).sort());
  });

  it('renders the same bank every time, so two runs of the game sound alike', () => {
    const again = renderBank();

    for (const name of Object.keys(bank)) {
      expect(fingerprint(again[name]), name).toBe(fingerprint(bank[name]));
    }
  });

  it('renders each sound exactly as the synthesiser would on its own', () => {
    expect(fingerprint(bank.coin)).toBe(fingerprint(renderSound(SOUND_SPECS.coin)));
  });

  // The whole bank is held in memory for the life of the page, so its size is
  // a number worth knowing rather than discovering.
  it('fits the whole bank in a few megabytes', () => {
    const bytes = Object.values(bank).reduce((total, samples) => total + samples.byteLength, 0);

    expect(bytes).toBeLessThan(4 * 1024 * 1024);
  });
});

describe('installing the bank into a scene', () => {
  it('puts a buffer in the cache for every sound', () => {
    const scene = fakeScene();

    installSoundBank(scene);

    for (const name of Object.keys(SOUND_SPECS)) {
      expect(scene.cache.audio.has(name), name).toBe(true);
    }
  });

  it('renders at the bank rate and in mono', () => {
    const scene = fakeScene();

    installSoundBank(scene);
    const buffer = scene.cache.audio.get('coin');

    expect(buffer.sampleRate).toBe(SAMPLE_RATE);
    expect(buffer.numberOfChannels).toBe(1);
    expect(buffer.length).toBe(bank.coin.length);
  });

  // A local checkout may have loaded the cabinet's own sound for a key before
  // this runs. Whatever is already in the cache wins, per key, exactly as a
  // local ship image wins over the drawn one.
  it('leaves a sound that is already in the cache alone', () => {
    const scene = fakeScene({ cached: ['theme', 'coin'] });

    installSoundBank(scene);

    expect(scene.cache.audio.get('theme')).toBe('already here');
    expect(scene.cache.audio.get('coin')).toBe('already here');
    expect(scene.cache.audio.get('ambient')).not.toBe('already here');
  });

  it('reports the sounds it had to supply, and only those', () => {
    const scene = fakeScene({ cached: ['theme'] });

    const supplied = installSoundBank(scene);

    expect(supplied).not.toContain('theme');
    expect(supplied).toContain('ambient');
    expect(supplied).toHaveLength(Object.keys(SOUND_SPECS).length - 1);
  });

  // A browser with audio unavailable gives the sound manager no context. The
  // game is meant to run silently there, not to fail to start.
  it('does nothing rather than throwing when there is no audio context', () => {
    const scene = fakeScene({ context: null });

    expect(() => installSoundBank(scene)).not.toThrow();
    expect(scene.cache.audio.has('coin')).toBe(false);
  });
});

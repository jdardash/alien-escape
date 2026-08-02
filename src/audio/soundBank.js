/**
 * Every sound the game makes, written out as synthesiser specs.
 *
 * This file replaced twenty-eight mp3s ripped from the Galaga ROM. They were
 * committed to a public repository with a live demo, which was the one thing
 * the ship artwork had already been rebuilt to avoid: a rip is byte-identical
 * to its source in a way hand-drawn pixel art never is, so it is both the
 * clearest infringement in the project and the easiest one to prove. Nothing
 * here is sampled from anything. The effects are arithmetic, and the four
 * melodic pieces -- the attract theme, the two end-of-game tunes and the rescue
 * fanfare -- are written for this game rather than transcribed from Galaga's,
 * whose compositions are as much Bandai Namco's as its sprites are.
 *
 * A local checkout can still play the cabinet's own audio; see
 * `localAudio.js` and `docs/local-audio.md`. Whatever it loads wins, per sound.
 *
 * The shape of a spec is `{ duration?, layers }` and the vocabulary is in
 * `synth.js`. Volumes here are the mix -- how loud each sound is against the
 * others -- while the per-play `volume` in the scenes is how loud that class of
 * event is against the game.
 */

import { SAMPLE_RATE, melody, noteHz, renderSound } from './synth.js';

/** A percussive envelope: full, then gone. What every impact in the game uses. */
const HIT = { attack: 0.002, sustain: 0, release: 0.01 };

/** The envelope every melodic note is played with: struck, then held under. */
const NOTE = { attack: 0.004, decay: 0.03, sustain: 0.55, release: 0.03 };

/**
 * The specs, keyed by the name the scenes play them under.
 *
 * The keys are the game's audio contract: `src/systems/audio.js` reads its
 * `SOUND_NAMES` straight off this object, so a sound cannot be added here and
 * forgotten, or played by name without existing.
 */
export const SOUND_SPECS = {
  // ------------------------------------------------------------------ player

  // Two shots, alternated by `playerShotSound`, so a held trigger stays a
  // sequence of shots rather than flattening into one tone. Different duty
  // cycles as well as different pitches: on a small speaker the timbre carries
  // further than the fifty hertz between them.
  fighterShot1: {
    layers: [
      { wave: 'square', duty: 0.25, hz: [1400, 320], duration: 0.085, decay: 0.06, ...HIT, gain: 0.55 },
      { wave: 'noise', hz: 6000, duration: 0.03, decay: 0.028, ...HIT, gain: 0.16, seed: 11 },
    ],
  },
  fighterShot2: {
    layers: [
      { wave: 'square', duty: 0.125, hz: [1150, 260], duration: 0.095, decay: 0.07, ...HIT, gain: 0.55 },
      { wave: 'noise', hz: 5200, duration: 0.03, decay: 0.028, ...HIT, gain: 0.16, seed: 23 },
    ],
  },

  // Losing a fighter. A tumbling figure over a noise fall and a low thump --
  // the longest sound in the game that is not music, because it is the only
  // event the player is meant to stop and feel.
  playerDeath: {
    duration: 1.15,
    layers: [
      ...melody(
        [['G5', 0.12], ['E5', 0.12], ['C5', 0.12], ['A4', 0.12], ['F4', 0.14], ['D4', 0.3]],
        { wave: 'square', duty: 0.25, gain: 0.34, ...NOTE, sustain: 0.45 },
      ),
      { wave: 'noise', hz: [4200, 300], duration: 0.8, decay: 0.78, ...HIT, gain: 0.26, seed: 31 },
      { wave: 'triangle', hz: [200, 45], at: 0.5, duration: 0.5, decay: 0.48, ...HIT, gain: 0.38 },
    ],
  },

  // ----------------------------------------------------------------- enemies

  // One cry per rank, and they descend: the bee is a bright pop, the butterfly
  // a fuller one, the boss a collapse. A player who has heard all three knows
  // what they hit without looking away from their own ship.
  zakoDeath: {
    layers: [
      { wave: 'noise', hz: 5500, duration: 0.18, decay: 0.17, ...HIT, gain: 0.46, seed: 41 },
      { wave: 'square', duty: 0.5, hz: [900, 180], duration: 0.16, decay: 0.15, ...HIT, gain: 0.3 },
    ],
  },
  goeiDeath: {
    layers: [
      { wave: 'noise', hz: 3200, duration: 0.24, decay: 0.23, ...HIT, gain: 0.5, seed: 53 },
      { wave: 'square', duty: 0.25, hz: [620, 120], duration: 0.22, decay: 0.21, ...HIT, gain: 0.32 },
    ],
  },

  // The hit a Boss Galaga survives. Deliberately the one impact in the game
  // with no noise in it: a warble rather than a burst, so that "it is still
  // there" is audible before the colour change is visible.
  bossHit: {
    layers: [
      {
        wave: 'square',
        duty: 0.5,
        hz: 520,
        duration: 0.22,
        vibrato: { hz: 26, semitones: 2 },
        decay: 0.2,
        sustain: 0.2,
        attack: 0.004,
        release: 0.04,
        gain: 0.44,
      },
      { wave: 'triangle', hz: 260, duration: 0.22, decay: 0.2, sustain: 0.15, gain: 0.28 },
    ],
  },
  bossDeath: {
    layers: [
      { wave: 'noise', hz: 1800, duration: 0.5, decay: 0.48, ...HIT, gain: 0.55, seed: 61 },
      { wave: 'noise', hz: 420, duration: 0.5, decay: 0.5, ...HIT, gain: 0.32, seed: 67 },
      { wave: 'triangle', hz: [180, 40], duration: 0.46, decay: 0.44, ...HIT, gain: 0.4 },
    ],
  },

  // The swoop out of formation: up as the enemy commits, down as it comes past
  // the player. Two layers rather than one sweep, because the turn is the part
  // that reads as a dive.
  enemyDive: {
    layers: [
      {
        wave: 'square',
        duty: 0.25,
        hz: [420, 980],
        duration: 0.2,
        vibrato: { hz: 20, semitones: 0.5 },
        attack: 0.02,
        release: 0.01,
        gain: 0.3,
      },
      {
        wave: 'square',
        duty: 0.25,
        hz: [980, 300],
        at: 0.2,
        duration: 0.32,
        vibrato: { hz: 20, semitones: 0.5 },
        attack: 0.01,
        release: 0.14,
        gain: 0.3,
      },
    ],
  },
  enemyFire: {
    layers: [{ wave: 'saw', hz: [900, 220], duration: 0.09, decay: 0.085, ...HIT, gain: 0.4 }],
  },

  /** Generic burst, for anything that is not one of the ranked enemies. */
  explosion: {
    layers: [
      { wave: 'noise', hz: 3000, duration: 0.3, decay: 0.29, ...HIT, gain: 0.5, seed: 71 },
      { wave: 'triangle', hz: [220, 60], duration: 0.28, decay: 0.27, ...HIT, gain: 0.3 },
    ],
  },

  // ----------------------------------------------------------- the capture cycle

  // A Boss Galaga breaking formation to hunt. Minor, rising, with a wash under
  // it: the only enemy in the game that wants something other than a collision.
  bossEntrance: {
    duration: 0.8,
    layers: [
      ...melody([['A3', 0.1], ['C4', 0.1], ['E4', 0.1], ['A4', 0.1], ['C5', 0.28]], {
        wave: 'square',
        duty: 0.125,
        gain: 0.34,
        ...NOTE,
      }),
      { wave: 'noise', hz: [600, 2400], duration: 0.68, attack: 0.12, release: 0.24, gain: 0.1, seed: 83 },
    ],
  },
  beamOpen: {
    layers: [
      {
        wave: 'saw',
        hz: [200, 900],
        duration: 0.5,
        vibrato: { hz: 14, semitones: 1.2 },
        attack: 0.06,
        release: 0.16,
        gain: 0.28,
      },
      { wave: 'sine', hz: [400, 1800], duration: 0.5, attack: 0.06, release: 0.16, gain: 0.16 },
    ],
  },
  beamCapture: {
    layers: [
      {
        wave: 'square',
        duty: 0.5,
        hz: [300, 1200],
        duration: 0.9,
        vibrato: { hz: 22, semitones: 2 },
        attack: 0.04,
        release: 0.22,
        gain: 0.3,
      },
      { wave: 'triangle', hz: [150, 600], duration: 0.9, attack: 0.04, release: 0.22, gain: 0.2 },
    ],
  },

  // The fighter is gone. Falling, minor, and it does not resolve.
  captured: {
    duration: 1.2,
    layers: [
      ...melody(
        [['A4', 0.13], ['G4', 0.13], ['F4', 0.13], ['E4', 0.13], ['D4', 0.13], ['C4', 0.35]],
        { wave: 'square', duty: 0.25, gain: 0.34, ...NOTE },
      ),
      { wave: 'saw', hz: [220, 55], duration: 1.0, attack: 0.05, release: 0.3, gain: 0.18 },
    ],
  },

  // Got it back, and got a second gun with it. The one unambiguously good
  // thing that happens in a run, so it is the brightest thing in the bank.
  rescued: {
    duration: 1.25,
    layers: [
      ...melody(
        [['C5', 0.1], ['E5', 0.1], ['G5', 0.1], ['C6', 0.1], ['E6', 0.1], ['G6', 0.45]],
        { wave: 'square', duty: 0.5, gain: 0.32, ...NOTE, sustain: 0.7 },
      ),
      ...melody([['C3', 0.5], ['C4', 0.55]], { wave: 'triangle', gain: 0.28, ...NOTE }),
    ],
  },

  // ------------------------------------------------------- stages and bonuses

  stageFlag: {
    layers: [
      { wave: 'square', duty: 0.5, hz: noteHz('E6'), duration: 0.07, decay: 0.06, ...HIT, gain: 0.34 },
      {
        wave: 'square',
        duty: 0.5,
        hz: noteHz('B6'),
        at: 0.07,
        duration: 0.13,
        decay: 0.12,
        ...HIT,
        gain: 0.34,
      },
    ],
  },
  challengeStart: {
    duration: 0.9,
    layers: melody(
      [['C5', 0.1], ['D5', 0.1], ['E5', 0.1], ['F5', 0.1], ['G5', 0.35]],
      { wave: 'square', duty: 0.25, gain: 0.34, ...NOTE },
    ),
  },
  challengeClear: {
    duration: 1.05,
    layers: melody(
      [['G5', 0.12], ['E5', 0.12], ['C5', 0.12], ['E5', 0.12], ['G5', 0.12], ['C6', 0.35]],
      { wave: 'square', duty: 0.25, gain: 0.34, ...NOTE },
    ),
  },

  // All forty. Longer than the clear sting and harmonised, because a perfect
  // round is the only thing in a Challenging Stage worth telling apart.
  challengePerfect: {
    duration: 1.5,
    layers: [
      ...melody(
        [
          ['C5', 0.1], ['E5', 0.1], ['G5', 0.1], ['C6', 0.1],
          ['E6', 0.1], ['C6', 0.1], ['E6', 0.1], ['G6', 0.5],
        ],
        { wave: 'square', duty: 0.5, gain: 0.3, ...NOTE, sustain: 0.7 },
      ),
      ...melody([[null, 0.7], ['E6', 0.5]], { wave: 'square', duty: 0.25, gain: 0.2, ...NOTE }),
      ...melody([['C3', 0.6], ['G3', 0.6]], { wave: 'triangle', gain: 0.26, ...NOTE }),
    ],
  },
  challengeMiss: {
    duration: 0.6,
    layers: melody([['Eb5', 0.16], ['C5', 0.32]], {
      wave: 'square',
      duty: 0.125,
      gain: 0.32,
      ...NOTE,
    }),
  },

  // The three bonus ships, so: three notes and a landing.
  transformSet: {
    duration: 0.72,
    layers: melody([['E5', 0.1], ['G5', 0.1], ['C6', 0.1], ['E6', 0.32]], {
      wave: 'square',
      duty: 0.25,
      gain: 0.34,
      ...NOTE,
    }),
  },
  extraLife: {
    duration: 0.78,
    layers: melody(
      [
        ['C6', 0.07], ['E6', 0.07], ['G6', 0.07],
        ['C6', 0.07], ['E6', 0.07], ['G6', 0.07], ['C7', 0.28],
      ],
      { wave: 'square', duty: 0.5, gain: 0.3, ...NOTE, sustain: 0.7 },
    ),
  },

  // ---------------------------------------------------------- front of house

  /**
   * The attract theme: eight bars over a walking bass, written for this game.
   *
   * Looped by the title scene for as long as nobody presses start, so it opens
   * and closes on silence -- `tests/soundBank.test.js` pins both ends, because
   * a loop with a step in it is a click once every eight seconds forever.
   */
  theme: {
    duration: 8.1,
    layers: [
      ...melody(
        [
          ['C5', 0.25], ['E5', 0.25], ['G5', 0.25], ['E5', 0.25],
          ['C5', 0.25], ['E5', 0.25], ['G5', 0.25], ['C6', 0.25],
          ['A5', 0.25], ['F5', 0.25], ['G5', 0.25], ['E5', 0.25],
          ['F5', 0.25], ['D5', 0.25], ['C5', 0.25], [null, 0.25],
          ['G5', 0.25], ['B5', 0.25], ['D6', 0.25], ['B5', 0.25],
          ['G5', 0.25], ['B5', 0.25], ['D6', 0.25], ['G5', 0.25],
          ['E6', 0.25], ['C6', 0.25], ['D6', 0.25], ['B5', 0.25],
          ['C6', 0.5], [null, 0.5],
        ],
        { wave: 'square', duty: 0.25, gain: 0.3, ...NOTE, decay: 0.05, sustain: 0.5 },
      ),
      ...melody(
        [
          ['C3', 0.5], ['C3', 0.5], ['C3', 0.5], ['G2', 0.5],
          ['F3', 0.5], ['F3', 0.5], ['G3', 0.5], ['G3', 0.5],
          ['G3', 0.5], ['G3', 0.5], ['G3', 0.5], ['D3', 0.5],
          ['C3', 0.5], ['C3', 0.5], ['G3', 0.5], ['C3', 0.5],
        ],
        { wave: 'triangle', gain: 0.3, ...NOTE, decay: 0.12, sustain: 0.35 },
      ),
    ],
  },

  coin: {
    layers: [
      { wave: 'square', duty: 0.5, hz: noteHz('B5'), duration: 0.06, decay: 0.05, ...HIT, gain: 0.36 },
      {
        wave: 'square',
        duty: 0.5,
        hz: noteHz('E6'),
        at: 0.06,
        duration: 0.14,
        decay: 0.13,
        ...HIT,
        gain: 0.36,
      },
    ],
  },
  gameStart: {
    duration: 0.95,
    layers: melody(
      [
        ['C4', 0.09], ['E4', 0.09], ['G4', 0.09], ['C5', 0.09],
        ['E5', 0.09], ['G5', 0.09], ['C6', 0.32],
      ],
      { wave: 'square', duty: 0.25, gain: 0.32, ...NOTE },
    ),
  },

  /**
   * The low pulse the whole board is played over.
   *
   * One cycle, looped by the scene. It is the thing that makes a cleared screen
   * feel quiet, which only works if it is felt rather than heard: two low
   * thumps and a gap, well under the melodic range so it never argues with a
   * sound effect.
   */
  ambient: {
    duration: 1.2,
    layers: [
      // A slower attack than every other impact in the bank: this is the one
      // sound the loop seam runs through, and eight milliseconds of rise is
      // what keeps the join under the noise floor rather than on it.
      { wave: 'triangle', hz: noteHz('E2'), duration: 0.18, decay: 0.16, ...HIT, attack: 0.008, gain: 0.62 },
      {
        wave: 'triangle',
        hz: noteHz('E2'),
        at: 0.6,
        duration: 0.18,
        decay: 0.16,
        ...HIT,
        attack: 0.008,
        gain: 0.44,
      },
    ],
  },

  // Taking first place on the board, against taking any other place or none.
  // The cabinet plays a different tune for each, so they are written to be
  // told apart across a room: major and rising, or minor and falling.
  highScoreEntry: {
    duration: 2.6,
    layers: [
      ...melody(
        [
          ['G4', 0.14], ['C5', 0.14], ['E5', 0.14], ['G5', 0.14], ['C6', 0.42],
          ['B5', 0.14], ['C6', 0.14], ['D6', 0.14], ['E6', 0.56],
        ],
        { wave: 'square', duty: 0.5, gain: 0.3, ...NOTE, sustain: 0.65 },
      ),
      ...melody([['C3', 0.56], ['C3', 0.42], ['G3', 0.42], ['C3', 0.56]], {
        wave: 'triangle',
        gain: 0.28,
        ...NOTE,
      }),
    ],
  },
  gameOverTune: {
    duration: 2.9,
    layers: [
      ...melody(
        [
          ['A4', 0.2], ['G4', 0.2], ['F4', 0.2], ['E4', 0.5],
          ['F4', 0.2], ['E4', 0.2], ['D4', 0.2], ['C4', 0.6],
        ],
        { wave: 'square', duty: 0.25, gain: 0.3, ...NOTE, sustain: 0.6 },
      ),
      ...melody([['A2', 0.6], ['E3', 0.5], ['D3', 0.6], ['A2', 0.6]], {
        wave: 'triangle',
        gain: 0.28,
        ...NOTE,
      }),
    ],
  },
};

/** Every sound, rendered. Pure, and the whole bank is a couple of megabytes. */
export function renderBank() {
  return Object.fromEntries(
    Object.entries(SOUND_SPECS).map(([name, spec]) => [name, renderSound(spec)]),
  );
}

/** Rendered once for the life of the page: the bank is a constant. */
let bank = null;

/**
 * Put the bank where Phaser looks for decoded audio.
 *
 * The one part of the audio layer that needs a browser. Phaser's WebAudio sound
 * manager reads `game.cache.audio` for an `AudioBuffer` and does not care
 * whether the loader put it there, so the bank is written straight in rather
 * than round-tripped through a blob URL and the decoder.
 *
 * A key already in the cache is left alone. That is the whole of the local
 * override rule: `queueLocalAudio` runs during `preload` and this runs in
 * `create`, so anything a local checkout successfully loaded is already present
 * and wins, and anything it named but failed to load is not and falls back to
 * the synthesised sound -- per sound, exactly as a local ship image does.
 *
 * Returns the names it supplied, which is every sound in the game unless a
 * local checkout got there first.
 */
export function installSoundBank(scene) {
  const context = scene.sound?.context;
  if (!context) return [];

  bank ??= renderBank();
  const cache = scene.cache.audio;
  const supplied = [];

  for (const [name, samples] of Object.entries(bank)) {
    if (cache.has(name)) continue;

    const buffer = context.createBuffer(1, samples.length, SAMPLE_RATE);
    // `copyToChannel` is the modern spelling and the only one Safari optimises;
    // the fallback is for the same reason Phaser keeps one.
    if (buffer.copyToChannel) buffer.copyToChannel(samples, 0);
    else buffer.getChannelData(0).set(samples);

    cache.add(name, buffer);
    supplied.push(name);
  }

  return supplied;
}

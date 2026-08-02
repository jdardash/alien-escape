import { describe, it, expect } from 'vitest';
import { readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import {
  challengeResultSound,
  deathSoundFor,
  playerShotSound,
  SOUND_NAMES,
} from '../src/systems/audio.js';
import { SOUND_SPECS } from '../src/audio/soundBank.js';
import { EnemyType, FORMATION_SIZE } from '../src/systems/formation.js';

describe('enemy death sounds', () => {
  // The arcade gives each rank of enemy its own cry, which is how a player
  // knows what they hit without looking at it. One shared explosion for all
  // forty, which is what this replaced, throws that away.
  it('gives each enemy type its own destruction sound', () => {
    const sounds = [EnemyType.ZAKO, EnemyType.GOEI, EnemyType.BOSS].map((type) =>
      deathSoundFor(type, { destroyed: true }),
    );

    expect(new Set(sounds).size).toBe(3);
  });

  it('distinguishes a boss surviving its first hit from a boss dying', () => {
    expect(deathSoundFor(EnemyType.BOSS, { destroyed: false })).not.toBe(
      deathSoundFor(EnemyType.BOSS, { destroyed: true }),
    );
  });

  it('falls back to a sound rather than silence for an enemy with no type', () => {
    expect(deathSoundFor(null, { destroyed: true })).toBeTruthy();
    expect(deathSoundFor(undefined, { destroyed: true })).toBeTruthy();
  });

  it('only ever names a sound the game actually has', () => {
    for (const type of [EnemyType.ZAKO, EnemyType.GOEI, EnemyType.BOSS, null]) {
      for (const destroyed of [true, false]) {
        expect(SOUND_NAMES).toContain(deathSoundFor(type, { destroyed }));
      }
    }
  });
});

describe('the player gun', () => {
  // Galaga alternates two shot samples, which is what stops a held trigger
  // turning into one flat tone.
  it('alternates between its two shot samples', () => {
    const fired = [0, 1, 2, 3].map(playerShotSound);

    expect(fired[0]).not.toBe(fired[1]);
    expect(fired[2]).toBe(fired[0]);
    expect(fired[3]).toBe(fired[1]);
  });

  it('only names sounds the game has', () => {
    for (let shot = 0; shot < 6; shot += 1) {
      expect(SOUND_NAMES).toContain(playerShotSound(shot));
    }
  });
});

describe('a challenging stage signing off', () => {
  it('plays the perfect sting only for all forty', () => {
    expect(challengeResultSound(FORMATION_SIZE, FORMATION_SIZE)).toBe('challengePerfect');
    expect(challengeResultSound(FORMATION_SIZE - 1, FORMATION_SIZE)).toBe('challengeMiss');
  });

  it('treats a round where nothing was hit as a miss, not as silence', () => {
    expect(challengeResultSound(0, FORMATION_SIZE)).toBe('challengeMiss');
  });

  it('only names sounds the game has', () => {
    for (let hits = 0; hits <= FORMATION_SIZE; hits += 1) {
      expect(SOUND_NAMES).toContain(challengeResultSound(hits, FORMATION_SIZE));
    }
  });
});

describe('the set of sounds', () => {
  it('is the bank, so a sound cannot be composed and left unwired', () => {
    expect([...SOUND_NAMES].sort()).toEqual(Object.keys(SOUND_SPECS).sort());
  });

  it('cannot be edited at run time by a scene that got hold of it', () => {
    expect(Object.isFrozen(SOUND_NAMES)).toBe(true);
  });
});

/**
 * The guard on the thing this audio layer exists to prevent.
 *
 * Twenty-eight mp3s ripped from the Galaga ROM were committed to this
 * repository and served from its public demo. They have been moved to the
 * gitignored `assets/local/`, and the whole bank is synthesised instead. Both
 * halves of that need pinning, because the failure is silent: a working game
 * with ripped audio in it looks exactly like a working game.
 */
describe('what the repository ships', () => {
  const AUDIO = /\.(mp3|ogg|wav|m4a|aac|flac|opus|webm)$/i;

  function tracked() {
    return execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split('\n').filter(Boolean);
  }

  it('has no audio file committed to it anywhere', () => {
    expect(tracked().filter((file) => AUDIO.test(file))).toEqual([]);
  });

  it('has nothing at all committed under the local directory', () => {
    expect(tracked().filter((file) => file.startsWith('assets/local/'))).toEqual([]);
  });

  it('no longer ships the sfx directory the rips were served from', () => {
    expect(() => readdirSync('assets/sfx')).toThrow();
  });
});

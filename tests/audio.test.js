import { describe, it, expect } from 'vitest';
import { readdirSync } from 'node:fs';
import {
  challengeResultSound,
  deathSoundFor,
  playerShotSound,
  SOUND_FILES,
} from '../src/systems/audio.js';
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

  it('only ever names a sound the game actually loads', () => {
    const keys = new Set(Object.keys(SOUND_FILES));

    for (const type of [EnemyType.ZAKO, EnemyType.GOEI, EnemyType.BOSS, null]) {
      for (const destroyed of [true, false]) {
        expect(keys.has(deathSoundFor(type, { destroyed }))).toBe(true);
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

  it('only names sounds the game loads', () => {
    for (let shot = 0; shot < 6; shot += 1) {
      expect(SOUND_FILES[playerShotSound(shot)]).toBeDefined();
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

  it('only names sounds the game loads', () => {
    for (let hits = 0; hits <= FORMATION_SIZE; hits += 1) {
      expect(SOUND_FILES[challengeResultSound(hits, FORMATION_SIZE)]).toBeDefined();
    }
  });
});

describe('the sound manifest', () => {
  it('points every key at an mp3 under the sfx directory', () => {
    for (const path of Object.values(SOUND_FILES)) {
      expect(path).toMatch(/^assets\/sfx\/[\w-]+\.mp3$/);
    }
  });

  it('never loads the same file under two keys', () => {
    const paths = Object.values(SOUND_FILES);
    expect(new Set(paths).size).toBe(paths.length);
  });

  // The repo shipped 28 sound files and used seven. This is the test that
  // stops a file being added to `assets/sfx` and then quietly forgotten, which
  // is exactly how the other twenty-one came to be sitting there unreferenced.
  it('wires every sound file the repo ships', () => {
    const onDisk = readdirSync('assets/sfx')
      .filter((file) => file.endsWith('.mp3'))
      .map((file) => `assets/sfx/${file}`)
      .sort();

    expect(Object.values(SOUND_FILES).sort()).toEqual(onDisk);
  });
});

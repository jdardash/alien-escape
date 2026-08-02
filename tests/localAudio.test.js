import { describe, it, expect } from 'vitest';
import { localAudioEntries, LOCAL_AUDIO_DIR } from '../src/audio/localAudio.js';
import { SOUND_SPECS } from '../src/audio/soundBank.js';

const full = {
  theme: 'theme.mp3',
  ambient: 'ambient_loop.mp3',
  fighterShot1: 'fighter_shot1.mp3',
};

describe('reading a local audio manifest', () => {
  it('resolves every named sound to a path under the local directory', () => {
    const entries = localAudioEntries(full);

    expect(entries).toHaveLength(Object.keys(full).length);
    for (const entry of entries) {
      expect(entry.path.startsWith(`${LOCAL_AUDIO_DIR}/`)).toBe(true);
    }
  });

  it('can override one sound and leave the rest synthesised', () => {
    expect(localAudioEntries({ theme: 'theme.mp3' })).toEqual([
      { name: 'theme', path: `${LOCAL_AUDIO_DIR}/theme.mp3` },
    ]);
  });

  it('names only sounds the game actually plays', () => {
    for (const entry of localAudioEntries(full)) {
      expect(SOUND_SPECS[entry.name]).toBeDefined();
    }
  });

  // The directory is hand-assembled and there is no build step to catch a typo
  // in it first, so a wrong name should cost one sound rather than the run.
  it('drops a sound the game has never heard of', () => {
    expect(localAudioEntries({ ...full, warpDrive: 'nope.mp3' })).toHaveLength(3);
  });

  it('drops an entry that is not a filename', () => {
    expect(localAudioEntries({ theme: 42, coin: null, ambient: 'ambient.mp3' })).toEqual([
      { name: 'ambient', path: `${LOCAL_AUDIO_DIR}/ambient.mp3` },
    ]);
  });

  it('drops an empty filename rather than requesting the directory itself', () => {
    expect(localAudioEntries({ theme: '   ' })).toEqual([]);
  });

  // Served straight off a static host, so a manifest is the one place a path
  // traversal could be introduced by hand.
  it('refuses to walk out of the local directory', () => {
    expect(localAudioEntries({ theme: '../../etc/passwd' })).toEqual([]);
  });

  it('reads a missing or malformed manifest as no overrides at all', () => {
    expect(localAudioEntries(undefined)).toEqual([]);
    expect(localAudioEntries(null)).toEqual([]);
    expect(localAudioEntries('theme.mp3')).toEqual([]);
    expect(localAudioEntries(['theme.mp3'])).toEqual([]);
  });

  it('accepts every sound in the bank, so nothing is unoverridable', () => {
    const everything = Object.fromEntries(
      Object.keys(SOUND_SPECS).map((name) => [name, `${name}.mp3`]),
    );

    expect(localAudioEntries(everything)).toHaveLength(Object.keys(SOUND_SPECS).length);
  });
});

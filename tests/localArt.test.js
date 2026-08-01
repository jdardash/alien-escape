import { describe, it, expect } from 'vitest';
import {
  localArtEntries,
  needsHealthyBossTint,
  bossTintFor,
  HEALTHY_BOSS_TINT,
  DAMAGED_BOSS_TINT,
  LOCAL_ART_DIR,
} from '../src/art/localArt.js';
import { SHIP_SPRITES } from '../src/art/pixelArt.js';

const full = {
  zako: 'zako.png',
  goei: 'goei.png',
  boss: 'boss.png',
  bossDamaged: 'bossDamaged.png',
  player: 'player.png',
  captive: 'captive.png',
};

describe('reading a local art manifest', () => {
  it('resolves every named ship to a path under the local directory', () => {
    const entries = localArtEntries(full);

    expect(entries).toHaveLength(Object.keys(full).length);
    for (const entry of entries) {
      expect(entry.path.startsWith(`${LOCAL_ART_DIR}/`)).toBe(true);
    }
  });

  it('can override one ship and leave the rest drawn', () => {
    expect(localArtEntries({ boss: 'boss.png' })).toEqual([
      { name: 'boss', path: `${LOCAL_ART_DIR}/boss.png` },
    ]);
  });

  it('names only ships the game actually draws', () => {
    for (const entry of localArtEntries(full)) {
      expect(SHIP_SPRITES[entry.name]).toBeDefined();
    }
  });

  // A hand-edited manifest with a typo in it should cost one sprite, not the
  // whole run: there is no build step here to catch it first.
  it('drops a ship the game has never heard of', () => {
    expect(localArtEntries({ ...full, spaceship: 'nope.png' })).toHaveLength(6);
  });

  it('drops an entry that is not a filename', () => {
    expect(localArtEntries({ boss: 42, player: null, zako: 'zako.png' })).toEqual([
      { name: 'zako', path: `${LOCAL_ART_DIR}/zako.png` },
    ]);
  });

  it('drops an empty filename rather than requesting the directory itself', () => {
    expect(localArtEntries({ boss: '   ' })).toEqual([]);
  });

  // The directory is served straight off a static host, so a manifest is the
  // one place a path traversal could be introduced by hand.
  it('refuses to walk out of the local directory', () => {
    expect(localArtEntries({ boss: '../../etc/passwd' })).toEqual([]);
  });

  it('reads a missing or malformed manifest as no overrides at all', () => {
    expect(localArtEntries(undefined)).toEqual([]);
    expect(localArtEntries(null)).toEqual([]);
    expect(localArtEntries('boss.png')).toEqual([]);
    expect(localArtEntries(['boss.png'])).toEqual([]);
  });
});

describe('telling a healthy Boss Galaga from a damaged one', () => {
  // The usual case: one boss image, and the green tint is the only thing that
  // distinguishes full health from a boss that has taken its first hit.
  it('tints the healthy boss when both states share one file', () => {
    expect(needsHealthyBossTint(full)).toBe(false);
    expect(needsHealthyBossTint({ boss: 'boss.png', bossDamaged: 'boss.png' })).toBe(true);
  });

  it('leaves two genuinely different boss images alone', () => {
    expect(needsHealthyBossTint({ boss: 'green.png', bossDamaged: 'purple.png' })).toBe(false);
  });

  it('does not tint when only one of the two states is overridden', () => {
    expect(needsHealthyBossTint({ boss: 'boss.png' })).toBe(false);
    expect(needsHealthyBossTint({ bossDamaged: 'boss.png' })).toBe(false);
  });

  it('does not tint when there is no manifest at all', () => {
    expect(needsHealthyBossTint(undefined)).toBe(false);
  });
});

describe('the tint a local boss image is drawn under', () => {
  // Two different filenames are no guarantee of two different pictures, and a
  // damaged boss that looks identical to a healthy one removes the player's
  // only cue that a second shot is needed. Tinting the damaged state is the
  // one rule that holds whatever the local images turn out to be.
  it('always tints an overridden damaged boss blue', () => {
    expect(bossTintFor('bossDamaged', full)).toBe(DAMAGED_BOSS_TINT);
    expect(bossTintFor('bossDamaged', { boss: 'boss.png', bossDamaged: 'boss.png' })).toBe(
      DAMAGED_BOSS_TINT,
    );
  });

  it('tints the healthy boss green only when one file serves both states', () => {
    expect(bossTintFor('boss', { boss: 'boss.png', bossDamaged: 'boss.png' })).toBe(
      HEALTHY_BOSS_TINT,
    );
    expect(bossTintFor('boss', full)).toBeNull();
  });

  it('leaves every other ship untinted', () => {
    for (const name of ['zako', 'goei', 'player', 'captive']) {
      expect(bossTintFor(name, full)).toBeNull();
    }
  });

  it('tints nothing when no local art is loaded', () => {
    expect(bossTintFor('bossDamaged', undefined)).toBeNull();
    expect(bossTintFor('boss', {})).toBeNull();
  });

  it('reads as blue and green, which is what the two states are', () => {
    expect(DAMAGED_BOSS_TINT & 0xff).toBeGreaterThan((DAMAGED_BOSS_TINT >> 16) & 0xff);
    expect((HEALTHY_BOSS_TINT >> 8) & 0xff).toBeGreaterThan((HEALTHY_BOSS_TINT >> 16) & 0xff);
  });
});

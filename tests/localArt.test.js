import { describe, it, expect } from 'vitest';
import {
  localArtEntries,
  needsHealthyBossTint,
  bossTintFor,
  HEALTHY_BOSS_TINT,
  DAMAGED_BOSS_TINT,
  LOCAL_ART_DIR,
  OVERRIDABLE_ART,
} from '../src/art/localArt.js';
import { SHIP_SPRITES, TRANSFORM_SPRITES } from '../src/art/pixelArt.js';
import { FLAG_ART } from '../src/config.js';

const full = {
  zako: 'zako.png',
  goei: 'goei.png',
  boss: 'boss.png',
  bossDamaged: 'bossDamaged.png',
  player: 'player.png',
  captive: 'captive.png',
};

describe('what can be overridden at all', () => {
  // This is the coverage pin: a new drawable added to the game without an
  // override name is exact-replication silently going out of reach.
  it('covers every ship, transform, explosion, flag, laser, the beam and the logo', () => {
    expect([...OVERRIDABLE_ART].sort()).toEqual(
      [
        ...Object.keys(SHIP_SPRITES),
        ...Object.keys(TRANSFORM_SPRITES),
        'explosionEnemy',
        'explosionPlayer',
        'beam',
        'flag1',
        'flag5',
        'flag10',
        'flag20',
        'flag30',
        'flag50',
        'playerLaser',
        'enemyLaser',
        'logo',
        'font',
      ].sort(),
    );
  });

  it('names a flag for every denomination the HUD can draw', () => {
    for (const value of Object.keys(FLAG_ART.colors)) {
      expect(OVERRIDABLE_ART).toContain(`flag${value}`);
    }
  });

  it('has no duplicate names', () => {
    expect(new Set(OVERRIDABLE_ART).size).toBe(OVERRIDABLE_ART.length);
  });
});

describe('reading a local art manifest', () => {
  it('resolves every named ship to a path under the local directory', () => {
    const entries = localArtEntries(full);

    expect(entries).toHaveLength(Object.keys(full).length);
    for (const entry of entries) {
      expect(entry.path.startsWith(`${LOCAL_ART_DIR}/`)).toBe(true);
      expect(entry.frame).toBe(0);
    }
  });

  it('can override one ship and leave the rest drawn', () => {
    expect(localArtEntries({ boss: 'boss.png' })).toEqual([
      { name: 'boss', frame: 0, path: `${LOCAL_ART_DIR}/boss.png` },
    ]);
  });

  it('reads an array as that sprite frame list, in order', () => {
    expect(localArtEntries({ zako: ['zako_0.png', 'zako_1.png'] })).toEqual([
      { name: 'zako', frame: 0, path: `${LOCAL_ART_DIR}/zako_0.png` },
      { name: 'zako', frame: 1, path: `${LOCAL_ART_DIR}/zako_1.png` },
    ]);
  });

  it('accepts frame lists for the explosions and the beam', () => {
    const entries = localArtEntries({
      explosionEnemy: ['e0.png', 'e1.png', 'e2.png', 'e3.png', 'e4.png'],
      explosionPlayer: ['p0.png', 'p1.png', 'p2.png', 'p3.png'],
      beam: ['beam_0.png', 'beam_1.png', 'beam_2.png'],
      scorpion: ['s0.png', 's1.png'],
    });

    expect(entries.filter((entry) => entry.name === 'explosionEnemy')).toHaveLength(5);
    expect(entries.filter((entry) => entry.name === 'explosionPlayer')).toHaveLength(4);
    expect(entries.filter((entry) => entry.name === 'beam')).toHaveLength(3);
    expect(entries.filter((entry) => entry.name === 'scorpion')).toHaveLength(2);
  });

  it('names only art the game actually draws', () => {
    for (const entry of localArtEntries(full)) {
      expect(OVERRIDABLE_ART).toContain(entry.name);
    }
  });

  // A hand-edited manifest with a typo in it should cost one sprite, not the
  // whole run: there is no build step here to catch it first.
  it('drops a ship the game has never heard of', () => {
    expect(localArtEntries({ ...full, spaceship: 'nope.png' })).toHaveLength(6);
  });

  it('drops an entry that is not a filename', () => {
    expect(localArtEntries({ boss: 42, player: null, zako: 'zako.png' })).toEqual([
      { name: 'zako', frame: 0, path: `${LOCAL_ART_DIR}/zako.png` },
    ]);
  });

  // A sprite must never mix ripped and drawn frames -- half a flap from the
  // cabinet and half from the pixel art reads as a glitch. One bad frame in
  // a list therefore forfeits the whole list.
  it('drops the whole frame list when any one frame is bad', () => {
    expect(localArtEntries({ zako: ['zako_0.png', 42] })).toEqual([]);
    expect(localArtEntries({ zako: ['zako_0.png', ''] })).toEqual([]);
    expect(localArtEntries({ zako: ['zako_0.png', '../escape.png'] })).toEqual([]);
  });

  it('drops an empty frame list rather than an unanimated mystery', () => {
    expect(localArtEntries({ zako: [] })).toEqual([]);
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

  it('tints the healthy boss when both states share one frame list', () => {
    expect(
      needsHealthyBossTint({
        boss: ['b0.png', 'b1.png'],
        bossDamaged: ['b0.png', 'b1.png'],
      }),
    ).toBe(true);
    expect(
      needsHealthyBossTint({
        boss: ['b0.png', 'b1.png'],
        bossDamaged: ['d0.png', 'd1.png'],
      }),
    ).toBe(false);
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

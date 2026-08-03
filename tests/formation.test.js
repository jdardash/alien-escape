import { describe, it, expect } from 'vitest';
import {
  EnemyType,
  FORMATION_SIZE,
  ENTRY_GROUP_SIZE,
  ENTRY_GROUP_COUNT,
  buildFormationSlots,
  buildEntryGroups,
  slotIndexForObjectId,
  ENTRANCE_PATTERN_COUNT,
  ENTRANCE_PATTERN_BOTH_SIDES,
  FormationPhase,
  SWAY_LIMIT,
  D_1E64_BITMAPS,
  createFormationMotion,
  stepFormationMotion,
  advanceFormationMotion,
  slotMotionOffset,
  slotWorldPosition,
  clampFormationCentre,
  rogueFighterSlot,
} from '../src/systems/formation.js';
import { CARAVAN_ROWS } from '../src/systems/caravans.js';
import { DB_ATTK_WAV_IDS } from '../src/systems/caravanData.js';
import { FRAME_MS } from '../src/systems/pathcode.js';
import { SCREEN, FORMATION, SHIP_DRAWN_PX } from '../src/config.js';

describe('formation layout', () => {
  it('assembles exactly 40 enemies, as Galaga does', () => {
    expect(FORMATION_SIZE).toBe(40);
    expect(buildFormationSlots()).toHaveLength(40);
  });

  it('uses the arcade composition of 4 bosses, 16 goei and 20 zako', () => {
    const slots = buildFormationSlots();
    const count = (type) => slots.filter((slot) => slot.type === type).length;

    expect(count(EnemyType.BOSS)).toBe(4);
    expect(count(EnemyType.GOEI)).toBe(16);
    expect(count(EnemyType.ZAKO)).toBe(20);
  });

  it('puts the bosses on the top row', () => {
    const slots = buildFormationSlots();
    const bosses = slots.filter((slot) => slot.type === EnemyType.BOSS);
    expect(bosses.every((slot) => slot.row === 0)).toBe(true);
  });

  it('gives every slot a unique row and column pair', () => {
    const slots = buildFormationSlots();
    const keys = new Set(slots.map((slot) => `${slot.row}:${slot.column}`));
    expect(keys.size).toBe(slots.length);
  });

  it('centres the shorter rows against the full-width rows', () => {
    const slots = buildFormationSlots();
    const centreOf = (row) => {
      const inRow = slots.filter((slot) => slot.row === row);
      const sum = inRow.reduce((total, slot) => total + slot.gridX, 0);
      return sum / inRow.length;
    };

    // Every row should be symmetric about the grid centre.
    for (const row of [0, 1, 2, 3, 4]) {
      expect(centreOf(row)).toBeCloseTo(0, 10);
    }
  });
});

describe('object IDs onto slots (sprt_fmtn_hpos)', () => {
  it('maps the bosses onto the top row in the ROM column order', () => {
    // IDs 0x30/0x34/0x36/0x32 sit at columns 3, 4, 5, 6 -- slots 0-3.
    expect(slotIndexForObjectId(0x30)).toBe(0);
    expect(slotIndexForObjectId(0x34)).toBe(1);
    expect(slotIndexForObjectId(0x36)).toBe(2);
    expect(slotIndexForObjectId(0x32)).toBe(3);
  });

  it('maps the bee corners onto the zako rows', () => {
    expect(slotIndexForObjectId(0x08)).toBe(20); // row 3, col 0
    expect(slotIndexForObjectId(0x0a)).toBe(29); // row 3, col 9
  });

  it('maps every wave ID onto a unique live slot', () => {
    const indices = DB_ATTK_WAV_IDS.flat().map(slotIndexForObjectId);
    expect(indices).toHaveLength(40);
    expect(indices.every((index) => Number.isInteger(index))).toBe(true);
    expect(new Set(indices).size).toBe(40);
  });

  it('returns null for the eight phantom slots', () => {
    for (const id of [0x00, 0x02, 0x04, 0x06, 0x38, 0x3a, 0x3c, 0x3e]) {
      expect(slotIndexForObjectId(id)).toBeNull();
    }
  });

  // The rogue fighter object the l_2681 caravan tail flies parks on the
  // ROM's row 0, above the bosses: `sprt_fmtn_hpos[0x04]` decodes to row 0,
  // column 4 (gg1-5.s:185-191).
  it('builds the rogue row post above the bosses for object 0x04', () => {
    const slot = rogueFighterSlot(0x04);
    expect(slot).not.toBeNull();
    expect(slot.row).toBe(-1);
    expect(slot.gridY).toBe(-1);
    expect(slot.column).toBe(4);
    expect(slot.gridX).toBe(4 - 4.5);
  });

  it('refuses to build a rogue post for a live formation ID', () => {
    expect(rogueFighterSlot(0x30)).toBeNull();
  });
});

describe('entry flights', () => {
  it('brings the wave on as five flights of eight, as the arcade does', () => {
    const groups = buildEntryGroups();

    expect(ENTRY_GROUP_SIZE).toBe(8);
    expect(ENTRY_GROUP_COUNT).toBe(5);
    expect(groups).toHaveLength(5);
    expect(groups.every((group) => group.members.length === 8)).toBe(true);
  });

  it('launches every slot exactly once across the flights', () => {
    const launched = buildEntryGroups().flatMap((group) => group.slotIndices);

    expect(launched).toHaveLength(FORMATION_SIZE);
    expect(new Set(launched).size).toBe(FORMATION_SIZE);
    expect([...launched].sort((a, b) => a - b)).toEqual(
      buildFormationSlots().map((slot) => slot.index),
    );
  });

  it('opens with the centre butterflies and centre bees, in pair order', () => {
    // db_attk_wav_IDs wave 1, interleaved lefty i / righty i -- the stream
    // emission order of the tmp buffer's slot-i / slot-i+8 pairing.
    const first = buildEntryGroups()[0];
    expect(first.members.map((member) => member.objectId)).toEqual([
      0x58, 0x28, 0x5a, 0x2a, 0x5c, 0x2c, 0x5e, 0x2e,
    ]);
  });

  it('flies THE FOUR BOSSES in wave 2, not first', () => {
    const slots = buildFormationSlots();
    const groups = buildEntryGroups();
    const typesIn = (group) => group.slotIndices.map((index) => slots[index].type);

    expect(typesIn(groups[0])).not.toContain(EnemyType.BOSS);
    expect(typesIn(groups[1]).filter((type) => type === EnemyType.BOSS)).toHaveLength(4);
    // And the bosses lead their wave: the lefty half is 30 34 36 32.
    expect(groups[1].members[0].objectId).toBe(0x30);
  });

  it('gives lefties the first path byte and righties the second', () => {
    // Stage-1 wave 1 is 0x00 / 0xC0: member 0 unmirrored and gated, member
    // 1 mirrored and immediate, alternating down the pairs.
    const first = buildEntryGroups(CARAVAN_ROWS[ENTRANCE_PATTERN_BOTH_SIDES])[0];
    expect(first.members.map((member) => member.mirrored)).toEqual([
      false, true, false, true, false, true, false, true,
    ]);
    expect(first.members.map((member) => member.step)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
  });

  it('sends an all-gated wave out single file', () => {
    // Stage-1 wave 2 (0x01 / 0x01) is gated on both bytes: eight beats.
    const second = buildEntryGroups(CARAVAN_ROWS[ENTRANCE_PATTERN_BOTH_SIDES])[1];
    expect(second.members.map((member) => member.step)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('never runs the launch order backwards, whatever the gating', () => {
    for (const caravan of CARAVAN_ROWS) {
      for (const group of buildEntryGroups(caravan)) {
        const steps = group.members.map((member) => member.step);
        expect(steps[0]).toBe(0);
        for (let i = 1; i < steps.length; i += 1) {
          expect(steps[i]).toBeGreaterThanOrEqual(steps[i - 1]);
          expect(steps[i] - steps[i - 1]).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('draws every flight from its own two path bytes and no others', () => {
    for (const caravan of CARAVAN_ROWS) {
      for (const group of buildEntryGroups(caravan)) {
        const used = new Set(
          group.members.map((member) => `${member.pathVariant}:${member.mirrored}`),
        );
        expect(used.size).toBeLessThanOrEqual(2);
      }
    }
  });

  it('flies only the six combat blocks on every caravan', () => {
    for (const caravan of CARAVAN_ROWS) {
      for (const group of buildEntryGroups(caravan)) {
        for (const member of group.members) {
          expect(member.pathVariant).toBeLessThan(6);
        }
      }
    }
  });

  it('numbers the flights in launch order', () => {
    expect(buildEntryGroups().map((group) => group.index)).toEqual([0, 1, 2, 3, 4]);
  });
});

describe('the fly-in sway (f_2A90)', () => {
  const tick = (state, frames, inputs) => {
    for (let i = 0; i < frames; i += 1) state = stepFormationMotion(state, inputs);
    return state;
  };

  it('steps one pixel every four frames', () => {
    let state = createFormationMotion();
    state = tick(state, 4);
    expect(state.swayOffset).toBe(1);
    state = tick(state, 4);
    expect(state.swayOffset).toBe(2);
  });

  it('is a triangle wave: +/-32 with a 512-frame period', () => {
    let state = createFormationMotion();
    state = tick(state, SWAY_LIMIT * 4);
    expect(state.swayOffset).toBe(SWAY_LIMIT);

    state = tick(state, 4);
    expect(state.swayOffset).toBe(SWAY_LIMIT - 1);

    // The rest of the 128-tick (512-frame) period: down through -32 and
    // back up to 0. One tick was already peeked at above.
    state = tick(state, 4 * 95);
    expect(state.swayOffset).toBe(0);
    expect(state.phase).toBe(FormationPhase.OSCILLATE);
  });

  it('reaches -32 at the bottom of the triangle', () => {
    let state = createFormationMotion();
    let lowest = 0;
    for (let i = 0; i < 512; i += 1) {
      state = stepFormationMotion(state);
      lowest = Math.min(lowest, state.swayOffset);
    }
    expect(lowest).toBe(-SWAY_LIMIT);
  });

  it('applies one uniform offset to every slot during the fly-in', () => {
    let state = createFormationMotion();
    for (let i = 0; i < 40; i += 1) state = stepFormationMotion(state);
    const slots = buildFormationSlots();
    const a = slotMotionOffset(state, slots[0], 3);
    const b = slotMotionOffset(state, slots[39], 3);
    expect(a).toEqual(b);
    expect(a.x).toBe(state.swayOffset * 3);
    expect(a.y).toBe(0);
  });

  it('coasts to centre after the handoff, then switches to the pulse', () => {
    let state = createFormationMotion();
    // Fly-in in progress: sway away from centre.
    for (let i = 0; i < 100; i += 1) state = stepFormationMotion(state);
    expect(state.swayOffset).not.toBe(0);

    // Handoff raised: the sway continues its triangle until it crosses 0,
    // and only then does the pulse take over -- never a mid-sway jump.
    let frames = 0;
    while (state.phase === FormationPhase.OSCILLATE && frames < 4000) {
      state = stepFormationMotion(state, { handoff: true });
      frames += 1;
    }
    expect(state.phase).toBe(FormationPhase.PULSE);
    expect(state.swayOffset).toBe(0);
  });
});

describe('the breathing pulse (f_1DE6 / d_1E64)', () => {
  const pulseState = () => ({ ...createFormationMotion(), phase: FormationPhase.PULSE });

  const tick = (state, frames) => {
    for (let i = 0; i < frames; i += 1) state = stepFormationMotion(state);
    return state;
  };

  it('keeps the d_1E64 bitmaps verbatim', () => {
    // prettier-ignore
    expect(D_1E64_BITMAPS).toEqual([
      [0xff, 0x77, 0x55, 0x14, 0x10, 0x10, 0x14, 0x55, 0x77, 0xff, 0x00, 0x10, 0x14, 0x55, 0x77, 0xff],
      [0xff, 0x77, 0x55, 0x51, 0x10, 0x10, 0x51, 0x55, 0x77, 0xff, 0x00, 0x10, 0x51, 0x55, 0x77, 0xff],
      [0xff, 0x77, 0x57, 0x15, 0x10, 0x10, 0x15, 0x57, 0x77, 0xff, 0x00, 0x10, 0x15, 0x57, 0x77, 0xff],
      [0xff, 0xf7, 0xd5, 0x91, 0x10, 0x10, 0x91, 0xd5, 0xf7, 0xff, 0x00, 0x10, 0x91, 0xd5, 0xf7, 0xff],
    ]);
  });

  it('expands over 32 ticks with the bitmap grading', () => {
    // 32 pulse ticks = 128 frames: the outer columns (0xFF -- a step every
    // tick) have swept 32 px outward, the inner (0x10 -- one step in eight)
    // only 4, and the columns between follow their popcounts.
    const state = tick(pulseState(), 32 * 4);
    expect(state.colOffsets[0]).toBe(-32);
    expect(state.colOffsets[9]).toBe(32);
    expect(state.colOffsets[1]).toBe(-25);
    expect(state.colOffsets[4]).toBe(-4);
    expect(state.colOffsets[5]).toBe(4);
  });

  it('moves the rows vertically too, graded downward', () => {
    const state = tick(pulseState(), 32 * 4);
    expect(state.rowOffsets[0]).toBe(0); // the phantom rogue row never moves
    expect(state.rowOffsets[1]).toBe(4);
    expect(state.rowOffsets[4]).toBe(25);
    expect(state.rowOffsets[5]).toBe(32);
  });

  it('contracts back to exactly zero: a 256-frame breath', () => {
    const state = tick(pulseState(), 64 * 4);
    expect(state.colOffsets).toEqual(new Array(10).fill(0));
    expect(state.rowOffsets).toEqual(new Array(6).fill(0));
    // And the phase counter is back at the start of the expansion.
    expect(state.pulseCounter).toBe(0);
  });

  it('walks the phase counter 0x00-0x1F then 0xA0-0x81', () => {
    let state = pulseState();
    const seen = [];
    for (let i = 0; i < 64; i += 1) {
      state = tick(state, 4);
      seen.push(state.pulseCounter);
    }
    expect(seen[30]).toBe(0x1f);
    expect(seen[31]).toBe(0xa0);
    expect(seen[62]).toBe(0x81);
    expect(seen[63]).toBe(0x00);
  });

  it('feeds per-column X and per-row Y offsets to the slots', () => {
    const state = tick(pulseState(), 32 * 4);
    const slots = buildFormationSlots();
    const corner = slots.find((slot) => slot.row === 4 && slot.column === 0);
    const offset = slotMotionOffset(state, corner, 3);
    expect(offset.x).toBe(-32 * 3);
    // Our row 4 is the ROM grid's row 5, the deepest-breathing rank.
    expect(offset.y).toBe(32 * 3);
  });
});

describe('advancing motion by milliseconds', () => {
  it('runs whole hardware frames out of the accumulator', () => {
    let motion = createFormationMotion();
    motion = advanceFormationMotion(motion, FRAME_MS * 8);
    expect(motion.frame).toBe(8);
    expect(motion.swayOffset).toBe(2);
  });

  it('never loses a frame to floating point at exact multiples', () => {
    let motion = createFormationMotion();
    for (let i = 0; i < 16; i += 1) motion = advanceFormationMotion(motion, FRAME_MS);
    expect(motion.frame).toBe(16);
  });
});

describe('world placement', () => {
  const layout = { centreX: 400, topY: 80, spacingX: 50, spacingY: 40 };

  it('places the grid centre at the formation centre', () => {
    const slots = buildFormationSlots();
    const positions = slots.map((slot) => slotWorldPosition(slot, layout));
    const meanX = positions.reduce((total, p) => total + p.x, 0) / positions.length;
    expect(meanX).toBeCloseTo(400, 6);
  });

  it('applies motion offsets as per-slot translations', () => {
    const slot = buildFormationSlots()[7];
    const still = slotWorldPosition(slot, layout);
    const moved = slotWorldPosition(slot, { ...layout, offsetX: 25, offsetY: -6 });
    expect(moved.x - still.x).toBeCloseTo(25, 10);
    expect(moved.y - still.y).toBeCloseTo(-6, 10);
  });
});

describe('keeping the formation on screen', () => {
  it('pulls the centre in so the outer column stays visible', () => {
    const clamped = clampFormationCentre(0, 800, { spacingX: 50, margin: 20 });
    expect(clamped).toBeGreaterThan(0);

    const slots = buildFormationSlots();
    const leftmost = Math.min(...slots.map((s) => s.gridX));
    const x = clamped + leftmost * 50;
    expect(x).toBeGreaterThanOrEqual(20 - 1e-9);
  });

  it('accounts for the motion machine peak spread', () => {
    const still = clampFormationCentre(0, 800, { spacingX: 50 });
    const moving = clampFormationCentre(0, 800, { spacingX: 50, motionSlack: 96 });
    expect(moving).toBeGreaterThan(still);
  });

  it('leaves an already centred formation alone', () => {
    expect(clampFormationCentre(400, 800, { spacingX: 50 })).toBe(400);
  });

  it('centres rather than inverting when the screen is too narrow', () => {
    expect(clampFormationCentre(10, 200, { spacingX: 50 })).toBe(100);
  });
});

/**
 * The real field. The column pitch is the ROM's 16 px through the x3 screen
 * adapter, and that is what makes the ROM's own motion fit: at the +/-32 ROM
 * px peak -- the sway's turnaround and the pulse's outer-column sweep -- the
 * outermost sprite lands exactly on the screen edge, as it does on the
 * cabinet (canvas 216 + half a 16 px sprite = 224).
 */
describe('the formation on the real field', () => {
  const peak = SWAY_LIMIT * (SCREEN.height / 288);

  const extremes = (offset) => {
    const xs = buildFormationSlots().map(
      (slot) =>
        slotWorldPosition(slot, {
          centreX: SCREEN.width / 2,
          topY: FORMATION.topY,
          spacingX: FORMATION.spacingX,
          spacingY: FORMATION.spacingY,
          offsetX: slot.gridX < 0 ? -offset : offset,
        }).x,
    );
    return { left: Math.min(...xs), right: Math.max(...xs) };
  };

  it('is played on a portrait field, as the arcade cabinet is', () => {
    expect(SCREEN.height).toBeGreaterThan(SCREEN.width);
    // Galaga's monitor is the 288 x 224 raster rotated a quarter turn: 7:9.
    expect(SCREEN.width / SCREEN.height).toBeCloseTo(7 / 9, 3);
  });

  it('uses the ROM column pitch through the x3 adapter', () => {
    expect(FORMATION.spacingX).toBe(16 * 3);
  });

  it('keeps every sprite of the outer columns on screen at the motion peak', () => {
    const spriteHalfWidth = SHIP_DRAWN_PX / 2;
    const { left, right } = extremes(peak);
    expect(left - spriteHalfWidth).toBeGreaterThanOrEqual(0);
    expect(right + spriteHalfWidth).toBeLessThanOrEqual(SCREEN.width);
  });

  it('assembles clear of the row the player flies in', () => {
    const bottomRow = FORMATION.topY + 4 * FORMATION.spacingY;
    expect(bottomRow).toBeLessThan(SCREEN.height * 0.5);
  });

  it('counts thirteen entrances, as the table does', () => {
    expect(ENTRANCE_PATTERN_COUNT).toBe(13);
  });
});

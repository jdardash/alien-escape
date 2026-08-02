import { describe, it, expect } from 'vitest';
import {
  CaptureState,
  CaptureEvent,
  RescueOutcome,
  transition,
  resolveCaptorDestroyed,
  isBeamDangerous,
  hasDualFighter,
  hasCaptiveOnScreen,
  bulletLimit,
  beamTimings,
  beamCatches,
  createPull,
  advancePull,
  BEAM_STRIPS,
  BEAM_GRAB_FRAMES,
  BEAM_CATCH_HALF_WIDTH,
  PULL_STEP,
  PULL_SPIN_STEP,
  PULL_CONNECT_Y,
  PULL_FIRE_OFF_Y,
  CARRY_OFFSET_Y,
  SETTLE_FRAMES,
} from '../src/systems/capture.js';
import { FRAME_MS } from '../src/systems/pathcode.js';

/** Drive the machine through a list of events from IDLE. */
function run(events, start = CaptureState.IDLE) {
  return events.reduce(transition, start);
}

/** The machine parked at HELD: a ship taken and settled above its captor. */
const HELD = [
  CaptureEvent.DEPLOY_BEAM,
  CaptureEvent.BEAM_FULL,
  CaptureEvent.PLAYER_CAUGHT,
  CaptureEvent.CAPTURE_COMPLETE,
];

describe('the full capture and rescue cycle', () => {
  it('reaches the dual fighter by capture then rescue', () => {
    const end = run([
      ...HELD,
      CaptureEvent.CAPTOR_DESTROYED,
      CaptureEvent.DOCK_COMPLETE,
    ]);
    expect(end).toBe(CaptureState.DUAL);
  });

  it('passes through the grab window on the way to the pull', () => {
    // DEPLOY opens the strips; BEAM_FULL is the cone at full extent -- and
    // only the grab window can take the PLAYER_CAUGHT event: capture never
    // happens while the strips grow.
    expect(run([CaptureEvent.DEPLOY_BEAM])).toBe(CaptureState.BEAM_OPENING);
    expect(transition(CaptureState.BEAM_OPENING, CaptureEvent.PLAYER_CAUGHT)).toBe(
      CaptureState.BEAM_OPENING,
    );
    expect(run([CaptureEvent.DEPLOY_BEAM, CaptureEvent.BEAM_FULL])).toBe(
      CaptureState.BEAM_ACTIVE,
    );
    expect(transition(CaptureState.BEAM_ACTIVE, CaptureEvent.PLAYER_CAUGHT)).toBe(
      CaptureState.CAPTURING,
    );
  });

  it('passes through held while the ship is attached to its captor', () => {
    const held = run(HELD);
    expect(held).toBe(CaptureState.HELD);
    expect(hasCaptiveOnScreen(held)).toBe(true);
  });
});

/**
 * The six mission ends of gg1-5.s, as re-verified in
 * capture-transients.md section 1.7. R, L1 and O go through
 * `resolveCaptorDestroyed`; L2/B are the CAPTIVE_DESTROYED transition; L3 is
 * the mid-pull CAPTOR_DESTROYED release below.
 */
describe('the mission-end table', () => {
  it('R: rescues only when the captor died flying with the slave diving beside it', () => {
    expect(
      resolveCaptorDestroyed(CaptureState.HELD, { captorFlying: true, captiveEscorting: true }),
    ).toBe(RescueOutcome.RESCUED);
  });

  it('L1: orphans the slave when the captor died flying without it diving', () => {
    // The carry-home is NOT a rescue window: the slave is glued, not diving.
    expect(
      resolveCaptorDestroyed(CaptureState.HELD, { captorFlying: true, captiveEscorting: false }),
    ).toBe(RescueOutcome.ORPHANED);
  });

  it('O: sends the slave rogue when the captor died at home in formation', () => {
    expect(
      resolveCaptorDestroyed(CaptureState.HELD, { captorFlying: false, captiveEscorting: false }),
    ).toBe(RescueOutcome.ROGUE);
    // Escorting cannot be true with the captor parked, but the formation
    // kill wins either way.
    expect(
      resolveCaptorDestroyed(CaptureState.HELD, { captorFlying: false, captiveEscorting: true }),
    ).toBe(RescueOutcome.ROGUE);
  });

  it('L2/B: shooting or bombing the captive itself ends the capture to idle', () => {
    expect(transition(CaptureState.HELD, CaptureEvent.CAPTIVE_DESTROYED)).toBe(
      CaptureState.IDLE,
    );
  });

  it('L3: shooting the boss mid-pull releases the fighter to idle', () => {
    const pulling = run([
      CaptureEvent.DEPLOY_BEAM,
      CaptureEvent.BEAM_FULL,
      CaptureEvent.PLAYER_CAUGHT,
    ]);
    expect(pulling).toBe(CaptureState.CAPTURING);
    expect(transition(pulling, CaptureEvent.CAPTOR_DESTROYED)).toBe(CaptureState.IDLE);
  });

  it('shooting the boss out from under its own beam aborts the mission', () => {
    expect(transition(CaptureState.BEAM_OPENING, CaptureEvent.CAPTOR_DESTROYED)).toBe(
      CaptureState.IDLE,
    );
    expect(transition(CaptureState.BEAM_ACTIVE, CaptureEvent.CAPTOR_DESTROYED)).toBe(
      CaptureState.IDLE,
    );
  });

  it('does nothing in any state where no ship is being held', () => {
    for (const state of Object.values(CaptureState)) {
      if (state === CaptureState.HELD) continue;
      expect(
        resolveCaptorDestroyed(state, { captorFlying: true, captiveEscorting: true }),
      ).toBe(RescueOutcome.NONE);
      expect(resolveCaptorDestroyed(state, {})).toBe(RescueOutcome.NONE);
    }
  });

  it('drives the machine to the dual fighter only through the rescue', () => {
    const held = run(HELD);

    const rescued = transition(held, CaptureEvent.CAPTOR_DESTROYED);
    expect(rescued).toBe(CaptureState.RETURNING);
    expect(transition(rescued, CaptureEvent.DOCK_COMPLETE)).toBe(CaptureState.DUAL);

    const lost = transition(held, CaptureEvent.CAPTIVE_DESTROYED);
    expect(lost).toBe(CaptureState.IDLE);
    expect(transition(lost, CaptureEvent.DOCK_COMPLETE)).toBe(CaptureState.IDLE);
  });
});

/**
 * The beam clock -- f_2222's three modes with the ROM's own numbers: 11
 * strips at the difficulty row's frames-per-strip for grow and shrink, a
 * hardcoded 64-frame grab window between them.
 */
describe('the beam clock', () => {
  it('keeps the ROM constants', () => {
    expect(BEAM_STRIPS).toBe(0x0b);
    expect(BEAM_GRAB_FRAMES).toBe(0x40);
    expect(BEAM_CATCH_HALF_WIDTH).toBe(0x1b);
  });

  it('grows and shrinks at the stage parameter, 12 frames a strip on stage 1', () => {
    const early = beamTimings(12);
    expect(early.openMs).toBeCloseTo(11 * 12 * FRAME_MS, 6);
    expect(early.retractMs).toBeCloseTo(early.openMs, 6);
  });

  it('speeds up to 3 frames a strip by the late stages', () => {
    const late = beamTimings(3);
    expect(late.openMs).toBeCloseTo(11 * 3 * FRAME_MS, 6);
    expect(late.openMs * 4).toBeCloseTo(beamTimings(12).openMs, 6);
  });

  it('holds the grab window at exactly 64 frames on every stage', () => {
    for (const framesPerStrip of [12, 9, 6, 3]) {
      expect(beamTimings(framesPerStrip).holdMs).toBeCloseTo(64 * FRAME_MS, 6);
    }
  });
});

/**
 * The grab test: |beamX - shipX| < 0x1B, run only during the grab window --
 * never while the strips grow or shrink -- and with NO drag on the player.
 */
describe('the grab window test', () => {
  const beamX = 112;

  it('catches only inside 27 ROM px of the aimed column', () => {
    expect(beamCatches('active', beamX, beamX)).toBe(true);
    expect(beamCatches('active', beamX, beamX + 26)).toBe(true);
    expect(beamCatches('active', beamX, beamX - 26)).toBe(true);
    expect(beamCatches('active', beamX, beamX + 27)).toBe(false);
    expect(beamCatches('active', beamX, beamX - 27)).toBe(false);
  });

  it('never catches while the beam is opening or retracting', () => {
    expect(beamCatches('opening', beamX, beamX)).toBe(false);
    expect(beamCatches('retracting', beamX, beamX)).toBe(false);
    expect(beamCatches('gone', beamX, beamX)).toBe(false);
  });
});

/**
 * The pull -- f_20F2's tumble-and-pull, in ROM canvas units: 1 px a frame on
 * each axis, the 0x0C spin step, connect at the 0xE0 row.
 */
describe('the pull ride', () => {
  it('keeps the ROM constants', () => {
    expect(PULL_STEP).toBe(1);
    expect(PULL_SPIN_STEP).toBe(0x0c);
    expect(PULL_CONNECT_Y).toBe(0xe0);
    expect(PULL_FIRE_OFF_Y).toBe(0xe6);
    expect(CARRY_OFFSET_Y).toBe(0x10);
    expect(SETTLE_FRAMES).toBe(0x24);
  });

  it('walks one pixel a frame toward the boss column and one pixel up', () => {
    let pull = createPull({ x: 100, y: 260 });
    pull = advancePull(pull, 130);
    expect(pull.x).toBe(101);
    expect(pull.y).toBe(259);
    pull = advancePull(pull, 130);
    expect(pull.x).toBe(102);
    expect(pull.y).toBe(258);
  });

  it('wobbles +/-1 about the column once aligned rather than freezing', () => {
    let pull = createPull({ x: 130, y: 260 });
    const xs = [];
    for (let i = 0; i < 4; i += 1) {
      pull = advancePull(pull, 130);
      xs.push(pull.x);
    }
    // The inc/dec never rests: every frame moves, and never further than a
    // pixel off the column.
    xs.forEach((x) => expect(Math.abs(x - 130)).toBeLessThanOrEqual(1));
    for (let i = 1; i < xs.length; i += 1) expect(xs[i]).not.toBe(xs[i - 1]);
  });

  it('spins the tumble at 0x0C angle units per frame', () => {
    let pull = createPull({ x: 100, y: 260 });
    pull = advancePull(pull, 100);
    expect(pull.angle).toBe(0x0c);
    pull = advancePull(pull, 100);
    expect(pull.angle).toBe(0x18);
  });

  it('connects when the ride reaches the 0xE0 row', () => {
    let pull = createPull({ x: 100, y: PULL_CONNECT_Y + 3 });
    expect(pull.connected).toBe(false);
    pull = advancePull(pull, 100);
    expect(pull.connected).toBe(false);
    pull = advancePull(pull, 100);
    pull = advancePull(pull, 100);
    expect(pull.connected).toBe(true);
    expect(pull.y).toBe(PULL_CONNECT_Y);
  });
});

describe('beam that catches nothing', () => {
  it('closes back to idle on timeout', () => {
    expect(run([CaptureEvent.DEPLOY_BEAM, CaptureEvent.BEAM_TIMEOUT])).toBe(
      CaptureState.IDLE,
    );
  });
});

describe('invalid transitions', () => {
  it('ignores events that do not apply to the current state', () => {
    expect(transition(CaptureState.IDLE, CaptureEvent.DOCK_COMPLETE)).toBe(
      CaptureState.IDLE,
    );
    expect(transition(CaptureState.IDLE, CaptureEvent.CAPTOR_DESTROYED)).toBe(
      CaptureState.IDLE,
    );
  });

  it('cannot dock without first being captured', () => {
    expect(run([CaptureEvent.DOCK_COMPLETE])).toBe(CaptureState.IDLE);
  });

  it('survives an unknown event', () => {
    expect(transition(CaptureState.HELD, 'nonsense')).toBe(CaptureState.HELD);
  });

  it('resets from any state', () => {
    for (const state of Object.values(CaptureState)) {
      expect(transition(state, CaptureEvent.RESET)).toBe(CaptureState.IDLE);
    }
  });
});

describe('dual fighter', () => {
  it('reverts to a single ship when hit rather than ending the run', () => {
    expect(transition(CaptureState.DUAL, CaptureEvent.DUAL_HIT)).toBe(CaptureState.IDLE);
  });

  it('can be captured again while docked', () => {
    expect(transition(CaptureState.DUAL, CaptureEvent.DEPLOY_BEAM)).toBe(
      CaptureState.BEAM_OPENING,
    );
  });
});

describe('derived rules', () => {
  it('treats an opening or active beam as dangerous, nothing else', () => {
    expect(isBeamDangerous(CaptureState.BEAM_OPENING)).toBe(true);
    expect(isBeamDangerous(CaptureState.BEAM_ACTIVE)).toBe(true);
    expect(isBeamDangerous(CaptureState.IDLE)).toBe(false);
    expect(isBeamDangerous(CaptureState.HELD)).toBe(false);
  });

  it('doubles the bullet limit only while the dual fighter is docked', () => {
    expect(bulletLimit(CaptureState.IDLE)).toBe(2);
    expect(bulletLimit(CaptureState.HELD)).toBe(2);
    expect(bulletLimit(CaptureState.DUAL)).toBe(4);
  });

  it('reports the dual fighter only in the dual state', () => {
    for (const state of Object.values(CaptureState)) {
      expect(hasDualFighter(state)).toBe(state === CaptureState.DUAL);
    }
  });
});

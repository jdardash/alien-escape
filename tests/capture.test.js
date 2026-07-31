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
} from '../src/systems/capture.js';
import { CAPTURE, PLAYER, SCREEN, FORMATION_BOTTOM_Y } from '../src/config.js';

/** Drive the machine through a list of events from IDLE. */
function run(events, start = CaptureState.IDLE) {
  return events.reduce(transition, start);
}

describe('the full capture and rescue cycle', () => {
  it('reaches the dual fighter by capture then rescue', () => {
    const end = run([
      CaptureEvent.DEPLOY_BEAM,
      CaptureEvent.PLAYER_CAUGHT,
      CaptureEvent.CAPTURE_COMPLETE,
      CaptureEvent.CAPTOR_DESTROYED,
      CaptureEvent.DOCK_COMPLETE,
    ]);
    expect(end).toBe(CaptureState.DUAL);
  });

  it('passes through held while the ship is attached to its captor', () => {
    const held = run([
      CaptureEvent.DEPLOY_BEAM,
      CaptureEvent.PLAYER_CAUGHT,
      CaptureEvent.CAPTURE_COMPLETE,
    ]);
    expect(held).toBe(CaptureState.HELD);
    expect(hasCaptiveOnScreen(held)).toBe(true);
  });
});

describe('losing the captive', () => {
  it('returns to idle when the player shoots their own held ship', () => {
    const end = run([
      CaptureEvent.DEPLOY_BEAM,
      CaptureEvent.PLAYER_CAUGHT,
      CaptureEvent.CAPTURE_COMPLETE,
      CaptureEvent.CAPTIVE_DESTROYED,
    ]);
    expect(end).toBe(CaptureState.IDLE);
  });

  it('distinguishes destroying the captor from destroying the captive', () => {
    const held = run([
      CaptureEvent.DEPLOY_BEAM,
      CaptureEvent.PLAYER_CAUGHT,
      CaptureEvent.CAPTURE_COMPLETE,
    ]);
    expect(transition(held, CaptureEvent.CAPTOR_DESTROYED)).toBe(CaptureState.RETURNING);
    expect(transition(held, CaptureEvent.CAPTIVE_DESTROYED)).toBe(CaptureState.IDLE);
  });
});

/**
 * Galaga's rescue rule, and the reason the capture is a gamble rather than a
 * free upgrade: the ship only comes back if you shoot its captor down while
 * that captor is diving with your ship in tow. Kill it where it sits in the
 * formation and the captive dies with it.
 */
describe('rescuing a captured fighter', () => {
  it('returns the ship when the captor is destroyed on a dive', () => {
    expect(resolveCaptorDestroyed(CaptureState.HELD, true)).toBe(RescueOutcome.RESCUED);
  });

  it('loses the captive when the captor is destroyed in formation', () => {
    expect(resolveCaptorDestroyed(CaptureState.HELD, false)).toBe(
      RescueOutcome.CAPTIVE_LOST,
    );
  });

  it('is the only thing separating the two outcomes', () => {
    const outcomes = [true, false].map((diving) =>
      resolveCaptorDestroyed(CaptureState.HELD, diving),
    );
    expect(new Set(outcomes).size).toBe(2);
  });

  it('does nothing in any state where no ship is being held', () => {
    for (const state of Object.values(CaptureState)) {
      if (state === CaptureState.HELD) continue;
      expect(resolveCaptorDestroyed(state, true)).toBe(RescueOutcome.NONE);
      expect(resolveCaptorDestroyed(state, false)).toBe(RescueOutcome.NONE);
    }
  });

  it('drives the machine to the dual fighter only through the diving kill', () => {
    const held = run([
      CaptureEvent.DEPLOY_BEAM,
      CaptureEvent.PLAYER_CAUGHT,
      CaptureEvent.CAPTURE_COMPLETE,
    ]);

    const eventFor = (outcome) =>
      outcome === RescueOutcome.RESCUED
        ? CaptureEvent.CAPTOR_DESTROYED
        : CaptureEvent.CAPTIVE_DESTROYED;

    const diving = transition(held, eventFor(resolveCaptorDestroyed(held, true)));
    expect(transition(diving, CaptureEvent.DOCK_COMPLETE)).toBe(CaptureState.DUAL);

    const parked = transition(held, eventFor(resolveCaptorDestroyed(held, false)));
    expect(parked).toBe(CaptureState.IDLE);
    expect(transition(parked, CaptureEvent.DOCK_COMPLETE)).toBe(CaptureState.IDLE);
  });
});

/**
 * The beam's geometry is config rather than a function, but it is a rule in
 * everything but shape: the arcade boss dives to just above the bottom of the
 * screen before the beam fans out, and an earlier revision opened it at
 * mid-screen where it could be ignored by simply not flying up.
 */
describe('where the tractor beam opens', () => {
  const beamMouth = CAPTURE.descendToY + CAPTURE.beamOffsetY;

  it('brings the boss down into the lower half of the field', () => {
    expect(CAPTURE.descendToY).toBeGreaterThan(SCREEN.height * 0.6);
    expect(CAPTURE.descendToY).toBeGreaterThan(FORMATION_BOTTOM_Y);
  });

  it('stops the boss above the player rather than on top of it', () => {
    expect(beamMouth).toBeLessThan(PLAYER.y);
  });

  it('fans the beam down to the bottom of the screen', () => {
    expect(beamMouth + CAPTURE.beamLength).toBeGreaterThanOrEqual(SCREEN.height);
  });

  it('leaves the player time to fly out before the capture commits', () => {
    // The player is dragged up the beam at pullStrength px/s and is taken at
    // captureDepth. Too shallow and standing in the column is instantly fatal.
    const riseNeeded = PLAYER.y - (beamMouth + CAPTURE.captureDepth);
    expect(riseNeeded).toBeGreaterThan(0);
    expect(riseNeeded / CAPTURE.pullStrength).toBeGreaterThan(0.8);
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

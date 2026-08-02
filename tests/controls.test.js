import { describe, expect, it } from 'vitest';

import {
  STICK_DEADZONE,
  TAP_MAX_MOVE_PX,
  TAP_MAX_MS,
  TOUCH_DEADZONE_PX,
  isTap,
  mergeHeld,
  padHeld,
  touchSteer,
} from '../src/systems/controls.js';

describe('padHeld', () => {
  it('reads the dpad as held directions', () => {
    expect(padHeld({ axisX: 0, dpadLeft: true, dpadRight: false })).toEqual({
      left: true,
      right: false,
    });
  });

  it('reads the stick past the deadzone', () => {
    expect(padHeld({ axisX: -1, dpadLeft: false, dpadRight: false })).toEqual({
      left: true,
      right: false,
    });
    expect(padHeld({ axisX: 1, dpadLeft: false, dpadRight: false })).toEqual({
      left: false,
      right: true,
    });
  });

  it('ignores stick drift inside the deadzone', () => {
    const drift = STICK_DEADZONE * 0.9;
    expect(padHeld({ axisX: drift, dpadLeft: false, dpadRight: false })).toEqual({
      left: false,
      right: false,
    });
    expect(padHeld({ axisX: -drift, dpadLeft: false, dpadRight: false })).toEqual({
      left: false,
      right: false,
    });
  });

  it('treats a missing pad as neutral', () => {
    expect(padHeld(null)).toEqual({ left: false, right: false });
    expect(padHeld(undefined)).toEqual({ left: false, right: false });
  });
});

describe('touchSteer', () => {
  it('chases a pointer to the right of the ship', () => {
    expect(touchSteer(300, 100)).toEqual({ left: false, right: true });
  });

  it('chases a pointer to the left of the ship', () => {
    expect(touchSteer(100, 300)).toEqual({ left: true, right: false });
  });

  it('holds still once the ship is under the finger', () => {
    expect(touchSteer(200, 200)).toEqual({ left: false, right: false });
    expect(touchSteer(200 + TOUCH_DEADZONE_PX - 1, 200)).toEqual({
      left: false,
      right: false,
    });
  });

  it('treats no pointer as neutral', () => {
    expect(touchSteer(null, 200)).toEqual({ left: false, right: false });
  });
});

describe('mergeHeld', () => {
  it('ORs any number of sources', () => {
    expect(
      mergeHeld(
        { left: false, right: false },
        { left: true, right: false },
        { left: false, right: false },
      ),
    ).toEqual({ left: true, right: false });
  });

  it('resolves both-directions to neutral, the way a switched stick does', () => {
    // A joystick cannot be left and right at once; when two sources disagree
    // the machine stands still rather than picking a winner.
    expect(mergeHeld({ left: true, right: false }, { left: false, right: true })).toEqual({
      left: false,
      right: false,
    });
  });

  it('merges nothing to neutral', () => {
    expect(mergeHeld()).toEqual({ left: false, right: false });
  });
});

describe('isTap', () => {
  it('accepts a quick, still press', () => {
    expect(isTap(TAP_MAX_MS - 1, TAP_MAX_MOVE_PX - 1)).toBe(true);
  });

  it('rejects a long hold', () => {
    expect(isTap(TAP_MAX_MS + 1, 0)).toBe(false);
  });

  it('rejects a drag', () => {
    expect(isTap(50, TAP_MAX_MOVE_PX + 1)).toBe(false);
  });
});

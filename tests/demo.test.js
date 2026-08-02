import { describe, it, expect } from 'vitest';
import {
  demoInput,
  DEMO_DURATION_MS,
  DODGE_RADIUS_PX,
  DODGE_LOOKAHEAD_PX,
  AIM_TOLERANCE_PX,
  CHASE_LIMIT_PX,
} from '../src/systems/demo.js';

const board = (overrides = {}) => ({
  playerX: 336,
  playerY: 794,
  screenWidth: 672,
  bombs: [],
  targets: [],
  ...overrides,
});

describe('lining up a shot', () => {
  it('holds still and fires when it is already on the target', () => {
    const input = demoInput(board({ targets: [{ x: 336, y: 200 }] }));
    expect(input).toEqual({ left: false, right: false, fire: true });
  });

  it('moves toward a target off to one side without firing wildly', () => {
    const right = demoInput(board({ targets: [{ x: 460, y: 200 }] }));
    expect(right).toEqual({ left: false, right: true, fire: false });

    const left = demoInput(board({ targets: [{ x: 210, y: 200 }] }));
    expect(left).toEqual({ left: true, right: false, fire: false });
  });

  it('accepts a shot that is close enough rather than chasing the last pixel', () => {
    const near = demoInput(board({ targets: [{ x: 336 + AIM_TOLERANCE_PX - 1, y: 200 }] }));
    expect(near.fire).toBe(true);
    expect(near.left || near.right).toBe(false);
  });

  it('shoots at the lowest enemy, which is the one about to reach it', () => {
    const input = demoInput(
      board({
        playerX: 300,
        targets: [
          { x: 300, y: 120 },
          { x: 380, y: 560 },
        ],
      }),
    );

    // It leaves the one it is already lined up on to go after the diver.
    expect(input.right).toBe(true);
    expect(input.fire).toBe(false);
  });

  it('stands still when there is nothing at all to shoot at', () => {
    expect(demoInput(board())).toEqual({ left: false, right: false, fire: false });
  });

  it('does not walk the whole field after an enemy on the far side', () => {
    const input = demoInput(
      board({ playerX: 60, targets: [{ x: 60 + CHASE_LIMIT_PX + 100, y: 200 }] }),
    );

    // Out of reach and the only target on the board, so it takes the shot it
    // has rather than spending the demo travelling.
    expect(input.right).toBe(true);
  });
});

describe('dodging', () => {
  it('moves out from under a bomb that is falling at it', () => {
    const input = demoInput(
      board({ playerX: 336, bombs: [{ x: 336, y: 700 }], targets: [{ x: 336, y: 200 }] }),
    );

    expect(input.left || input.right).toBe(true);
    expect(input.fire).toBe(false);
  });

  it('moves away from the bomb rather than into it', () => {
    const fromLeft = demoInput(board({ playerX: 336, bombs: [{ x: 320, y: 700 }] }));
    expect(fromLeft.right).toBe(true);

    const fromRight = demoInput(board({ playerX: 336, bombs: [{ x: 352, y: 700 }] }));
    expect(fromRight.left).toBe(true);
  });

  it('takes the only way out when it is pinned against an edge', () => {
    // Bomb to the left with no room on the right: it goes left anyway, which is
    // what a cornered player does.
    const input = demoInput(board({ playerX: 660, bombs: [{ x: 640, y: 700 }] }));
    expect(input.left).toBe(true);
  });

  it('ignores bombs that are nowhere near its column', () => {
    const input = demoInput(
      board({
        playerX: 336,
        bombs: [{ x: 336 + DODGE_RADIUS_PX + 20, y: 700 }],
        targets: [{ x: 336, y: 200 }],
      }),
    );

    expect(input.fire).toBe(true);
  });

  it('ignores bombs still far up the screen and keeps shooting', () => {
    const input = demoInput(
      board({
        playerX: 336,
        bombs: [{ x: 336, y: 794 - DODGE_LOOKAHEAD_PX - 50 }],
        targets: [{ x: 336, y: 200 }],
      }),
    );

    expect(input.fire).toBe(true);
  });

  it('ignores a bomb that has already gone past it', () => {
    const input = demoInput(
      board({ playerX: 336, bombs: [{ x: 336, y: 820 }], targets: [{ x: 336, y: 200 }] }),
    );

    expect(input.fire).toBe(true);
  });

  it('reacts to the nearest bomb when several are falling', () => {
    const input = demoInput(
      board({
        playerX: 336,
        bombs: [
          { x: 350, y: 600 },
          { x: 320, y: 760 },
        ],
      }),
    );

    // The lower one is on the left, so it goes right.
    expect(input.right).toBe(true);
  });
});

describe('the tractor beam', () => {
  it('flies out of an open beam even with a target lined up', () => {
    const input = demoInput(
      board({
        playerX: 336,
        beam: { x: 336, width: 162 },
        targets: [{ x: 336, y: 200 }],
      }),
    );

    expect(input.left || input.right).toBe(true);
    expect(input.fire).toBe(false);
  });

  it('ignores a beam that is open somewhere else entirely', () => {
    const input = demoInput(
      board({ playerX: 100, beam: { x: 600, width: 162 }, targets: [{ x: 100, y: 200 }] }),
    );

    expect(input.fire).toBe(true);
  });

  // The beam outranks a bomb: being caught costs a ship without anything ever
  // touching the fighter, and unlike a bomb it does not miss.
  it('leaves the beam before it worries about a bomb', () => {
    const input = demoInput(
      board({
        playerX: 336,
        beam: { x: 300, width: 162 },
        bombs: [{ x: 350, y: 760 }],
      }),
    );

    expect(input.right).toBe(true);
  });
});

describe('how long the machine plays itself', () => {
  it('runs long enough for a wave to assemble and short enough to hand back', () => {
    expect(DEMO_DURATION_MS).toBeGreaterThan(20000);
    expect(DEMO_DURATION_MS).toBeLessThan(90000);
  });
});

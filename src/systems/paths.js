/**
 * Flight paths.
 *
 * Galaga enemies never move in straight lines. They enter in looping arcs from
 * off screen, assemble into formation, and later peel off along curving dive
 * runs. Both are cubic Bezier chains here: cheap to evaluate every frame,
 * trivially serialisable, and pure enough to test without rendering anything.
 *
 * A "path" is a list of cubic segments, each `[p0, p1, p2, p3]`. Evaluating at
 * `t` in [0, 1] walks the whole chain.
 */

/** Evaluate one cubic Bezier segment at t in [0, 1]. */
export function cubicBezier(p0, p1, p2, p3, t) {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;

  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  };
}

/**
 * Evaluate a chain of cubic segments at t in [0, 1].
 *
 * t is distributed evenly across segments rather than by arc length. Segments
 * are authored to similar lengths, so the visual speed stays even and the
 * cost stays O(1) per frame instead of requiring a length table.
 */
export function pointOnPath(path, t) {
  if (path.length === 0) {
    throw new Error('pointOnPath requires at least one segment');
  }

  const clamped = Math.min(Math.max(t, 0), 1);

  // At exactly 1, land on the final segment's endpoint instead of indexing
  // one past the end.
  if (clamped === 1) {
    const last = path[path.length - 1];
    return { x: last[3].x, y: last[3].y };
  }

  const scaled = clamped * path.length;
  const index = Math.floor(scaled);
  const local = scaled - index;
  const [p0, p1, p2, p3] = path[index];

  return cubicBezier(p0, p1, p2, p3, local);
}

/**
 * Heading along the path at t, in radians.
 *
 * Sampled numerically rather than differentiated analytically: the epsilon
 * approach stays correct across segment boundaries, where the analytic
 * derivative is discontinuous.
 */
export function tangentAngle(path, t, epsilon = 0.001) {
  const ahead = Math.min(t + epsilon, 1);
  const behind = Math.max(t - epsilon, 0);
  const a = pointOnPath(path, behind);
  const b = pointOnPath(path, ahead);
  return Math.atan2(b.y - a.y, b.x - a.x);
}

/** Approximate arc length by sampling. Used to keep flight speed consistent. */
export function pathLength(path, samples = 64) {
  let total = 0;
  let previous = pointOnPath(path, 0);

  for (let i = 1; i <= samples; i += 1) {
    const current = pointOnPath(path, i / samples);
    total += Math.hypot(current.x - previous.x, current.y - previous.y);
    previous = current;
  }

  return total;
}

/**
 * The lowest fraction of the screen an entry flight may reach.
 *
 * Entry paths must stay clear of the lane the player defends. An earlier
 * revision looped through `height * 0.95`, which put all forty arriving
 * enemies through the player's row and ended the game during the opening
 * stream before a shot could be fired. The test "never descends into the lane
 * the player occupies" pins this against the real `PLAYER.y`.
 *
 * It is a fraction rather than a pixel count because it has to survive a
 * change of field: it was set against a near-square landscape screen and now
 * runs on a 7:9 portrait one, where the same fraction leaves the arriving wave
 * roughly 260px of clear air above the player rather than 230px. Raised from
 * 0.58 to use the taller field, since a loop that bottoms out just below the
 * formation reads as a swerve rather than a sweep.
 */
export const ENTRY_FLOOR_FRACTION = 0.62;

/**
 * Entry flight from off screen into a formation slot.
 *
 * Four variants matching Galaga's entry choreography. Each enters from a
 * different edge and loops before assembling, so a wave arriving in groups
 * reads as deliberate rather than random.
 */
export function entryPath(variant, target, screen) {
  const { width, height } = screen;
  const floor = height * ENTRY_FLOOR_FRACTION;
  const loopSize = Math.min(width, height) * 0.2;

  switch (variant % 4) {
    // In from the left, loop clockwise, up into formation.
    case 0:
      return [
        [
          { x: -60, y: height * 0.3 },
          { x: width * 0.15, y: floor },
          { x: width * 0.42, y: floor },
          { x: width * 0.42, y: height * 0.45 },
        ],
        [
          { x: width * 0.42, y: height * 0.45 },
          { x: width * 0.42, y: height * 0.45 - loopSize },
          { x: width * 0.2, y: height * 0.4 - loopSize },
          { x: width * 0.2, y: height * 0.28 },
        ],
        [
          { x: width * 0.2, y: height * 0.28 },
          { x: width * 0.2, y: height * 0.12 },
          { x: target.x, y: target.y - 90 },
          { x: target.x, y: target.y },
        ],
      ];

    // In from the right, mirrored.
    case 1:
      return [
        [
          { x: width + 60, y: height * 0.3 },
          { x: width * 0.85, y: floor },
          { x: width * 0.58, y: floor },
          { x: width * 0.58, y: height * 0.45 },
        ],
        [
          { x: width * 0.58, y: height * 0.45 },
          { x: width * 0.58, y: height * 0.45 - loopSize },
          { x: width * 0.8, y: height * 0.4 - loopSize },
          { x: width * 0.8, y: height * 0.28 },
        ],
        [
          { x: width * 0.8, y: height * 0.28 },
          { x: width * 0.8, y: height * 0.12 },
          { x: target.x, y: target.y - 90 },
          { x: target.x, y: target.y },
        ],
      ];

    // Top left, sweeping curve then climb back.
    case 2:
      return [
        [
          { x: -60, y: -40 },
          { x: width * 0.25, y: height * 0.1 },
          { x: width * 0.35, y: height * 0.42 },
          { x: width * 0.5, y: height * 0.46 },
        ],
        [
          { x: width * 0.5, y: height * 0.46 },
          { x: width * 0.65, y: floor },
          { x: target.x, y: target.y + 120 },
          { x: target.x, y: target.y },
        ],
      ];

    // Top right, mirrored.
    default:
      return [
        [
          { x: width + 60, y: -40 },
          { x: width * 0.75, y: height * 0.1 },
          { x: width * 0.65, y: height * 0.42 },
          { x: width * 0.5, y: height * 0.46 },
        ],
        [
          { x: width * 0.5, y: height * 0.46 },
          { x: width * 0.35, y: floor },
          { x: target.x, y: target.y + 120 },
          { x: target.x, y: target.y },
        ],
      ];
  }
}

/**
 * Dive run: peel out of formation, curve toward where the player is, and exit
 * through the bottom of the screen.
 *
 * The enemy re-enters from the top afterwards, which the scene handles by
 * flying `returnPath` once this one completes.
 */
export function divePath(origin, playerX, screen) {
  const { width, height } = screen;
  const sweep = origin.x < width / 2 ? -1 : 1;

  return [
    [
      { x: origin.x, y: origin.y },
      { x: origin.x + sweep * 70, y: origin.y + 20 },
      { x: origin.x + sweep * 110, y: origin.y + 110 },
      { x: origin.x + sweep * 60, y: height * 0.45 },
    ],
    [
      { x: origin.x + sweep * 60, y: height * 0.45 },
      { x: origin.x - sweep * 20, y: height * 0.6 },
      { x: playerX, y: height * 0.7 },
      { x: playerX, y: height + 80 },
    ],
  ];
}

/**
 * How many distinct Challenging Stage routes exist.
 *
 * The arcade has eight, and because they land on stages 3, 7, 11 ... the last
 * of them is not seen until stage 31. Cycling fewer than eight is the single
 * most common shortcut in a Galaga clone and it shows: the bonus round starts
 * repeating itself less than halfway through a good run.
 */
export const CHALLENGING_PATTERN_COUNT = 8;

/**
 * Challenging Stage fly-through.
 *
 * The bonus round is pure choreography: forty enemies trace a preset route and
 * leave without ever attacking. The arcade cycles eight distinct patterns
 * rather than replaying one, so `pattern` selects between them and `offset`
 * spreads a group across the shape.
 *
 * Unlike an entry path, these never terminate in a formation slot. They enter
 * off screen and exit off screen.
 *
 * Every route is authored to stay well above the player: nothing can be hit
 * during a bonus round, and a shape that swept the bottom of the field would
 * read as a threat the player is wrong to dodge. `tests/paths.test.js` pins
 * that for all eight.
 */
export function challengingPath(pattern, offset, screen) {
  const { width, height } = screen;
  // Spread the group across the width so a stream traces the shape.
  const lane = 0.2 + (offset % 5) * 0.15;
  const x = width * lane;
  const mirrored = offset % 2 === 1;
  const side = mirrored ? -1 : 1;

  switch (pattern % CHALLENGING_PATTERN_COUNT) {
    // Crossing streams: in from both top corners, cross at centre, exit low.
    case 0:
      return [
        [
          { x: mirrored ? -60 : width + 60, y: -50 },
          { x: width * 0.5, y: height * 0.1 },
          { x: width * 0.5, y: height * 0.3 },
          { x: width * 0.5, y: height * 0.42 },
        ],
        [
          { x: width * 0.5, y: height * 0.42 },
          { x: width * 0.5 + side * 220, y: height * 0.5 },
          { x: width * 0.5 + side * 120, y: height * 0.62 },
          { x: mirrored ? width + 80 : -80, y: height * 0.55 },
        ],
      ];

    // Vertical loop: down the lane, loop back up, exit through the top.
    case 1:
      return [
        [
          { x, y: -50 },
          { x, y: height * 0.2 },
          { x, y: height * 0.38 },
          { x, y: height * 0.48 },
        ],
        [
          { x, y: height * 0.48 },
          { x: x + side * 180, y: height * 0.54 },
          { x: x + side * 180, y: height * 0.22 },
          { x: x + side * 60, y: -70 },
        ],
      ];

    // Wide arc sweeping across the screen and out the far side.
    case 2:
      return [
        [
          { x: mirrored ? -60 : width + 60, y: height * 0.12 },
          { x: width * 0.3, y: height * 0.02 },
          { x: width * 0.7, y: height * 0.5 },
          { x: width * 0.5, y: height * 0.52 },
        ],
        [
          { x: width * 0.5, y: height * 0.52 },
          { x: width * 0.3, y: height * 0.54 },
          { x: width * 0.15, y: height * 0.3 },
          { x: mirrored ? width + 80 : -80, y: height * 0.2 },
        ],
      ];

    // Figure eight through the middle band.
    case 3:
      return [
        [
          { x: mirrored ? -60 : width + 60, y: height * 0.3 },
          { x: width * 0.35, y: height * 0.12 },
          { x: width * 0.65, y: height * 0.12 },
          { x: width * 0.65, y: height * 0.35 },
        ],
        [
          { x: width * 0.65, y: height * 0.35 },
          { x: width * 0.65, y: height * 0.55 },
          { x: width * 0.35, y: height * 0.55 },
          { x: width * 0.35, y: height * 0.35 },
        ],
        [
          { x: width * 0.35, y: height * 0.35 },
          { x: width * 0.35, y: height * 0.15 },
          { x: mirrored ? width + 80 : -80, y: height * 0.18 },
          { x: mirrored ? width + 120 : -120, y: height * 0.25 },
        ],
      ];

    // Descending zigzag: in from a top corner, three switchbacks widening as
    // they fall, out through the opposite side.
    case 4:
      return [
        [
          { x: mirrored ? -60 : width + 60, y: -50 },
          { x: width * 0.5, y: height * 0.08 },
          { x: width * 0.18, y: height * 0.24 },
          { x: width * 0.5, y: height * 0.34 },
        ],
        [
          { x: width * 0.5, y: height * 0.34 },
          { x: width * 0.82, y: height * 0.44 },
          { x: width * 0.18, y: height * 0.54 },
          { x: mirrored ? width + 80 : -80, y: height * 0.6 },
        ],
      ];

    // Twin columns: straight down a lane with a slight weave, then a hard fan
    // outward across the middle and away.
    case 5:
      return [
        [
          { x, y: -60 },
          { x: x + side * 44, y: height * 0.16 },
          { x: x - side * 44, y: height * 0.3 },
          { x, y: height * 0.44 },
        ],
        [
          { x, y: height * 0.44 },
          { x: x + side * 250, y: height * 0.5 },
          { x: width * 0.5, y: height * 0.62 },
          { x: mirrored ? -80 : width + 80, y: height * 0.5 },
        ],
      ];

    // Orbit: enter along the middle from one side, circle the centre of the
    // field once, and leave the way the next group is arriving.
    case 6:
      return [
        [
          { x: mirrored ? -60 : width + 60, y: height * 0.4 },
          { x: width * 0.18, y: height * 0.42 },
          { x: width * 0.18, y: height * 0.14 },
          { x: width * 0.5, y: height * 0.12 },
        ],
        [
          { x: width * 0.5, y: height * 0.12 },
          { x: width * 0.82, y: height * 0.1 },
          { x: width * 0.84, y: height * 0.44 },
          { x: width * 0.5, y: height * 0.5 },
        ],
        [
          { x: width * 0.5, y: height * 0.5 },
          { x: width * 0.28, y: height * 0.54 },
          { x: width * 0.14, y: height * 0.3 },
          { x: mirrored ? width + 90 : -90, y: height * 0.22 },
        ],
      ];

    // Shallow S: a long lateral wave across the upper band, the flattest of
    // the eight, which makes it the one that rewards leading the target.
    default:
      return [
        [
          { x: mirrored ? -60 : width + 60, y: height * 0.18 },
          { x: width * 0.24, y: height * 0.36 },
          { x: width * 0.76, y: height * 0.08 },
          { x: width * 0.7, y: height * 0.28 },
        ],
        [
          { x: width * 0.7, y: height * 0.28 },
          { x: width * 0.64, y: height * 0.48 },
          { x: width * 0.24, y: height * 0.2 },
          { x: mirrored ? width + 90 : -90, y: height * 0.38 },
        ],
      ];
  }
}

/** Re-entry from the top of the screen back into a formation slot. */
export function returnPath(target, screen) {
  const { width } = screen;
  const fromLeft = target.x < width / 2;
  const entryX = fromLeft ? width * 0.25 : width * 0.75;

  return [
    [
      { x: entryX, y: -60 },
      { x: entryX, y: 40 },
      { x: target.x, y: target.y - 100 },
      { x: target.x, y: target.y },
    ],
  ];
}

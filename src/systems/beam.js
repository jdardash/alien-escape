/**
 * The tractor beam, as geometry.
 *
 * The cabinet does not fade its beam in. It unfurls it: horizontal strips
 * appear one after another from the boss's mouth down, cycle their colours
 * for as long as the trap is set, and furl back up when it gives up. This
 * module says which strips exist at a given instant and what colour each one
 * is; `GameScene` draws whatever it is told. That split is what lets
 * `tests/beam.test.js` watch a whole capture attempt without a renderer.
 *
 * Nothing here knows about the capture state machine. The scene maps its
 * states onto the three phase strings, and the timings come in as options so
 * they stay pinned in `config.js` beside the rest of the capture's clock.
 */

/** The three colours the fan cycles through, top to bottom. */
export const BEAM_COLORS = [0x66ccff, 0x3f6dff, 0xcfeaff];

/** How many strips exist during a phase, counted from the boss downward. */
function visibleCount(phase, elapsedMs, { strips, openMs, retractMs }) {
  if (phase === 'opening') {
    return Math.min(Math.floor((elapsedMs / openMs) * strips), strips);
  }
  if (phase === 'active') return strips;
  if (phase === 'retracting') {
    return Math.max(strips - Math.ceil((elapsedMs / retractMs) * strips), 0);
  }
  return 0;
}

/**
 * The strips of the beam fan at one instant of one phase.
 *
 * Each strip is `{ index, yOffset, height, width, color }` in beam-local
 * coordinates: y down from the boss's mouth, width centred on the beam's
 * axis. The fan is a cone -- each strip a little wider than the one above --
 * and the colours rotate one place per `cycleMs`, which is the ripple the
 * cabinet's beam has while it waits for the player to blunder in.
 */
export function beamStripsAt(phase, elapsedMs, opts) {
  const { strips, cycleMs, width, length } = opts;
  const count = visibleCount(phase, elapsedMs, opts);
  const height = length / strips;
  const shift = Math.floor(elapsedMs / cycleMs);

  return Array.from({ length: count }, (_, index) => ({
    index,
    yOffset: index * height,
    height,
    // From a third of the full width at the mouth to the whole of it at the
    // floor: the silhouette that reads as a beam rather than a column.
    width: width * (1 / 3 + (2 / 3) * ((index + 1) / strips)),
    color: BEAM_COLORS[(index + shift) % BEAM_COLORS.length],
  }));
}

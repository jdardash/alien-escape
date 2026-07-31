/**
 * Stage progression.
 *
 * Galaga's Challenging Stages land on stage 3 and then every fourth stage
 * after it. During one, the formation flies scripted patterns and never fires
 * or dives, and clearing all forty pays a perfect bonus. They are a breather
 * and a bonus round at once, which is why the difficulty curve either side of
 * them can stay aggressive.
 */

/** Stage 3, then 7, 11, 15, and so on. */
export function isChallengingStage(stage) {
  if (stage < 3) return false;
  return (stage - 3) % 4 === 0;
}

/**
 * Whether arriving enemies bomb while still flying into formation.
 *
 * The arcade holds fire through the whole of round 1's assembly and opens up
 * from round 2 onward, which is what makes the opening screen a gentle
 * introduction rather than a scramble.
 */
export function enemiesFireDuringEntry(stage) {
  return stage >= 2 && !isChallengingStage(stage);
}

/**
 * Which Challenging Stage this is, counting from zero.
 *
 * The arcade cycles a set of distinct preset routes rather than replaying one,
 * so the bonus round reads as choreography. Returns null for a normal stage.
 */
export function challengingPatternIndex(stage) {
  if (!isChallengingStage(stage)) return null;
  return Math.floor((stage - 3) / 4);
}

/**
 * Difficulty knobs for a stage.
 *
 * Values ramp then plateau. Galaga stops getting harder somewhere around the
 * high teens; without a floor the dive interval would eventually reach zero
 * and the game would become unplayable rather than difficult.
 *
 * There is deliberately no rate of fire for the formation. In the arcade an
 * enemy only ever bombs while it is flying, on its way in or on an attack run;
 * a ship sitting in the grid never shoots. Firing from the formation made the
 * whole grid a threat at all times and flattened the rhythm the dives create.
 */
export function stageDifficulty(stage) {
  const ramp = Math.min(stage, 16);

  return {
    diveIntervalMs: Math.max(3000 - ramp * 160, 900),
    maxSimultaneousDivers: Math.min(1 + Math.floor(ramp / 3), 6),
    diveSpeed: Math.min(1 + ramp * 0.045, 1.7),
    escortChance: Math.min(0.2 + ramp * 0.03, 0.75),
  };
}

/** Flag denominations shown bottom-right, highest first. */
const FLAG_VALUES = [50, 30, 20, 10, 5, 1];

/**
 * Break a stage number into the flags Galaga displays for it.
 *
 * Greedy largest-first, which is what the original does: stage 8 shows a 5 and
 * three 1s rather than eight 1s.
 */
export function stageFlags(stage) {
  const flags = [];
  let remaining = stage;

  for (const value of FLAG_VALUES) {
    const count = Math.floor(remaining / value);
    if (count > 0) {
      flags.push({ value, count });
      remaining -= value * count;
    }
  }

  return flags;
}

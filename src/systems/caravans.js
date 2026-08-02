/**
 * The caravan machine: how a stage's wave of forty (and its hangers-on)
 * arrives.
 *
 * The ROM never launches enemies from `d_combat_stg_dat` directly. Once per
 * stage, `c_25A2` (gg1-3.s:1168-1423) compiles the stage's 18-byte caravan
 * row into a flat runtime byte stream at RAM 0x8920: a `0x7E` wave-start
 * marker, then `[pathByte, objectId]` pairs alternating lefty and righty,
 * five waves over, and a closing `0x7F`. Every frame, `f_2916`
 * (gg1-3.s:1658-1745) walks that stream at most one byte forward, which is
 * where the whole rhythm of a stage opening comes from. Both machines are
 * ported here, pure, on the verbatim tables in `caravanData.js`.
 *
 * A path byte (gg1-3.s:1450-1458):
 *
 * ```
 *   bits 0-5   index into db_2A3C -- combat rows only ever select 0-5
 *   bit  6     pair member: the SECOND db_2A6C spawn triplet, AND the
 *              negate-rotation flag (0x13(ix) bit 7) that mirrors every arc
 *   bit  7     launch gate -- clear waits for the frame & 7 beat, set fires
 *              the frame the launcher reads it (the wing-man, 1 frame behind
 *              its gated leader)
 *   bit  0     ALSO re-read as the fly-in bomb-counter seed 0x0E(ix):
 *              clear -> 0x08 (top entrant), set -> 0x44 (side entrant)
 * ```
 *
 * Rank plumbing: the caravan index table is indexed by the RAW machine rank
 * (`rank * 17`, gg1-3.s:1197) whose display letters run B, C, D, A -- the
 * factory letter A is raw 3. This codebase's `DifficultyRank` counts letters
 * A-D as 0-3, so lookups go through `MACHINE_RANK_VALUES` and
 * `caravanRankIndex`, NOT the difficulty rotation LUT.
 */

import {
  CARAVAN_ROW_BYTES,
  DB_ATTK_WAV_IDS,
  D_CHALLG_STG_DAT,
  D_CHALLG_STG_DAT_IDX,
  D_COMBAT_STG_DAT,
  D_COMBAT_STG_DAT_IDX,
  entryBombCapable,
} from './caravanData.js';
import { MACHINE_RANK_VALUES, caravanRankIndex } from './difficultyData.js';

// ------------------------------------------------------------ path bytes

/** Bits 0-5 of a path byte: the db_2A3C entry this member flies. */
const PATH_MASK = 0x3f;

/** Bit 6: second pair member -- own spawn triplet plus negated rotation. */
const MEMBER_BIT = 0x40;

/** Bit 7: launch now rather than waiting for the frame & 7 beat. */
const IMMEDIATE_BIT = 0x80;

/**
 * Unpack one path byte.
 *
 * Returns what a launching member needs and nothing else, so the bit layout
 * stops at this function and every caller downstream reads fields.
 * `mirrored` is kept as the historical name for bit 6: it selects the
 * variant pair's second spawn triplet and sets the negate-rotation flag.
 * `bombCounterInit` is the bit-0 overload (gg1-3.s:1828-1834): the fly-in
 * bomb-drop countdown starts at 0x08 frames for a top entrant, 0x44 for a
 * side entrant.
 */
export function decodeFlyInByte(byte) {
  const member = (byte & MEMBER_BIT) !== 0 ? 1 : 0;
  return {
    pathIndex: byte & PATH_MASK,
    member,
    negateRotation: member === 1,
    mirrored: member === 1,
    immediate: (byte & IMMEDIATE_BIT) !== 0,
    bombCounterInit: (byte & 0x01) !== 0 ? 0x44 : 0x08,
  };
}

// ------------------------------------------------------------- the tables

/** How many flights a caravan row describes. Five, of eight (plus transients). */
export const CARAVAN_FLIGHTS = 5;

/**
 * The path-byte pairs of the thirteen rows, `[leftyByte, rightyByte]` per
 * wave -- a view over `D_COMBAT_STG_DAT` for callers that only need the
 * shared flight shapes (the transient control byte and headers stay in the
 * raw rows). Note the pairs alone do NOT distinguish all thirteen rows:
 * rows 0, 2, 5, 8 and 11 share path bytes and differ only in headers and
 * transients, which is the ROM's own economy.
 */
export const CARAVAN_ROWS = D_COMBAT_STG_DAT.map((row) =>
  Array.from({ length: CARAVAN_FLIGHTS }, (_w, wave) => [
    row[2 + wave * 3 + 1],
    row[2 + wave * 3 + 2],
  ]),
);

export const CARAVAN_ROW_COUNT = D_COMBAT_STG_DAT.length;

/**
 * How many entrance rows the arcade cycles before repeating: the index table
 * is `rank * 17 + row`, so seventeen combat stages is the period.
 */
export const COMBAT_STAGE_ROWS = 17;

/** The four difficulty ranks, by display letter. A is the factory default. */
export const DifficultyRank = { A: 0, B: 1, C: 2, D: 3 };

export const RANK_NAMES = ['A', 'B', 'C', 'D'];

export const RANK_COUNT = RANK_NAMES.length;

/** Clamp anything to a real rank, so a corrupt stored setting cannot crash a stage. */
export function normalizeRank(rank) {
  const value = Number(rank);
  if (!Number.isFinite(value)) return DifficultyRank.A;
  return Math.min(Math.max(Math.trunc(value), 0), RANK_COUNT - 1);
}

/**
 * The arcade's entrance row for a stage (the `si` of c_25A2, gg1-3.s:1180-1212).
 *
 * Wrap anything at or past 0x17 back by four until it is below -- the loop
 * head `l_25AC_while` is `cp #0x17 / jr c` (gg1-3.s:1182-1186), so 0x17
 * itself wraps too; the endless game cycles its last four combat
 * configurations. Then take `stage - stage/4 - 1`, which counts COMBAT
 * stages: a challenging stage assembles no formation and consumes no row.
 */
export function combatStageIndex(stage) {
  let wrapped = stage;
  while (wrapped >= 0x17) wrapped -= 4;

  const row = wrapped - Math.floor(wrapped / 4) - 1;
  return Math.min(Math.max(row, 0), COMBAT_STAGE_ROWS - 1);
}

/**
 * Which of the thirteen caravans this stage flies, at this logical rank.
 *
 * `d_combat_stg_dat_idx[rawRank * 17 + si] / 18`, with the logical letter
 * converted to the machine's raw value first. The idx tables repeat rows --
 * rank A replays the stage-1 entrance at si 7 and si 13 -- so this is not a
 * monotone difficulty ladder and was never meant to be.
 */
export function caravanIndexFor(stage, rank = DifficultyRank.A) {
  const raw = caravanRankIndex(MACHINE_RANK_VALUES[normalizeRank(rank)]);
  const offset = D_COMBAT_STG_DAT_IDX[raw * COMBAT_STAGE_ROWS + combatStageIndex(stage)];
  return offset / CARAVAN_ROW_BYTES;
}

/** The caravan row's path-byte pairs: five flights of two bytes. */
export function caravanFor(stage, rank = DifficultyRank.A) {
  return CARAVAN_ROWS[caravanIndexFor(stage, rank)];
}

/**
 * The RAW 18-byte row a stage compiles its stream from: the challenge table
 * (no rank dimension, row `(stage >> 2) & 7`) when `(stage + 1) % 4 == 0`,
 * else the rank-indexed combat table.
 */
export function caravanRawRowFor(stage, rank = DifficultyRank.A) {
  if ((stage + 1) % 4 === 0) {
    const offset = D_CHALLG_STG_DAT_IDX[(stage >> 2) & 0x07];
    return D_CHALLG_STG_DAT[offset / CARAVAN_ROW_BYTES];
  }
  return D_COMBAT_STG_DAT[caravanIndexFor(stage, rank)];
}

/**
 * The row's two header bytes, latched to `b_92E2` at stage init
 * (gg1-3.s:1237-1246): the fly-in bomb-drop counter reload and the fly-in
 * bomb enable mask. Stage 1 and every challenge row carry mask 0 -- and so
 * does any later stage whose rank's index table replays row 0 (rank B's
 * stage 6, factory rank A's stage 10): the ROM really does give those
 * stages a silent fly-in.
 */
export function caravanHeaderFor(stage, rank = DifficultyRank.A) {
  const row = caravanRawRowFor(stage, rank);
  return { bombReload: row[0], flyInBombMask: row[1] };
}

// ------------------------------------------------------ the c_25A2 compile

/** Wave-start marker in the runtime stream. */
export const WAVE_START = 0x7e;

/** End-of-fly-in marker (the stage goes on; the launcher stops). */
export const STREAM_END = 0x7f;

/**
 * The corpus's locked stand-in for the ROM's R-register entropy: xorshift32
 * (13 / 17 / 5, logical shift on the 17), seeded `0x12345678 ^ stage` per
 * stage. The per-call advance is load-bearing -- the transient placement
 * loop re-rolls on slot collisions. Port decision: the Z80's c_1000 reads
 * the DRAM refresh counter, which has no software counterpart.
 */
export function createStageRng(stage) {
  let s = (0x12345678 ^ stage) >>> 0;
  return () => {
    s = (s ^ (s << 13)) >>> 0;
    s = (s ^ (s >>> 17)) >>> 0;
    s = (s ^ (s << 5)) >>> 0;
    return s & 0xff;
  };
}

/**
 * `c_25A2` (gg1-3.s:1168-1423): compile one caravan row into the runtime
 * stream.
 *
 * Per wave, a 16-slot temp buffer (lefty half 0-7, righty half 8-15; slot i
 * pairs with i + 8) is filled transients-first, then backfilled with the
 * wave's eight `db_attk_wav_IDs` (four into the lefty half, four into the
 * righty). Emission walks the lefty half to its first 0xFF, writing
 * `[leftyByte, tmp[i], rightyByte, tmp[i+8]]` per pair.
 *
 * Transient insertion (`l_2612`, gg1-3.s:1287-1311), byte-faithful:
 * count = ctl & 0x0F; divisor E = (count >> 1) + 4; slot = rng8 % E, +8 when
 * the down-counter b is odd, re-rolled on collision; ID = `(b << 1) | 0x38`,
 * `| 0x40` when the MSB-first RLC bit of ctl is set -- so a wave's transient
 * IDs come from {0x38, 0x3A, 0x3C, 0x3E}, redmoths carrying the 0x40 flag.
 */
export function compileCaravanStream(row, rng = createStageRng(0)) {
  const stream = [WAVE_START];

  for (let wave = 0; wave < CARAVAN_FLIGHTS; wave += 1) {
    const base = 2 + wave * 3;
    const ctl = row[base];
    const leftyByte = row[base + 1];
    const rightyByte = row[base + 2];

    const tmp = new Array(16).fill(0xff);

    const count = ctl & 0x0f;
    if (count !== 0) {
      const divisor = (count >> 1) + 4;
      let bits = ctl;
      for (let b = count; b >= 1; b -= 1) {
        let slot;
        do {
          slot = (rng() & 0xff) % divisor;
          if (b & 1) slot |= 8;
        } while (tmp[slot] !== 0xff);

        const typeBit = (bits >> 7) & 1;
        bits = ((bits << 1) | typeBit) & 0xff;
        tmp[slot] = (((b << 1) | 0x38) | (typeBit ? 0x40 : 0)) & 0xff;
      }
    }

    // Backfill the eight formation IDs: the first four into the lefty half,
    // then the jump to slot 8 (`ld l,#8`, gg1-3.s:1339) for the righty four.
    const ids = DB_ATTK_WAV_IDS[wave];
    let pos = 0;
    for (let n = 0; n < 8; n += 1) {
      while (tmp[pos] !== 0xff) pos += 1;
      tmp[pos] = ids[n];
      pos += 1;
      if (n === 3) pos = 8;
    }

    for (let i = 0; i < 8 && tmp[i] !== 0xff; i += 1) {
      stream.push(leftyByte, tmp[i], rightyByte, tmp[i + 8]);
    }
    stream.push(WAVE_START);
  }

  // The final 0x7E is overwritten with the end token (l_2681).
  stream[stream.length - 1] = STREAM_END;
  return stream;
}

/** The stage's stream: row selection plus compile, seeded per stage. */
export function compileStageStream(stage, rank = DifficultyRank.A, rng = createStageRng(stage)) {
  return compileCaravanStream(caravanRawRowFor(stage, rank), rng);
}

// ------------------------------------------------------- the f_2916 walker

/**
 * The hard cap on simultaneously path-flying bugs: `ds_bug_motion_que` holds
 * 12 slots of 0x14 bytes, and a launch with no free slot simply waits
 * (gg1-3.s:1736-1745).
 */
export const IN_FLIGHT_CAP = 12;

/** Game timers tick at 2 Hz: one decrement per 30 hardware frames. */
export const FRAMES_PER_TIMER_TICK = 30;

/** A fresh launcher over a compiled stream, cursor on the first 0x7E. */
export function createWaveLauncher(stream) {
  return {
    stream,
    cursor: 0,
    /** `_b_attkwv_ctr`: 1-based once the first wave opens. */
    wave: 0,
    /**
     * `game_tmrs[0]` in 2 Hz ticks, plus its frame accumulator. Seeded to 2
     * by `stg_init_env` (task_man.s:256 chain), so a challenge stage's FIRST
     * wave also waits the ~1 s the later ones do; combat stages never
     * consult it at a wave marker.
     */
    timerTicks: 2,
    timerFrames: 0,
    frame: 0,
    done: false,
  };
}

/**
 * One hardware frame of `f_2916`. Pure: returns the next state plus what the
 * frame did. At most one stream position is consumed per frame.
 *
 * Inputs:
 * - `enabled`     -- `_b_atk_wv_enbl`, the two-phase enable: false until the
 *                    player has spawned. Checked only at a wave marker, the
 *                    ROM's own placement, so a wave in progress keeps
 *                    launching.
 * - `bugsFlying`  -- how many launched members are still path-flying (not
 *                    yet landed or despawned).
 * - `inFlight`    -- occupied motion slots, against the 12-slot cap.
 * - `challenge`   -- `(stage + 1) % 4 == 0`.
 *
 * Results: `launch` = `{ pathByte, rawObjectId, wave }` (decode it with
 * `decodeLaunch`); `started` = a wave marker was passed; `completed` = the
 * 0x7F fired with the sky clear -- the ROM's moment to enable the attack
 * tasks and set `_b_nestlr_inh` (the formation's coast-to-centre handoff);
 * `hitTallyReset` = the challenge per-wave hit counter reloads to 8.
 *
 * Cadence, as the ROM has it: a gated byte fires only on the `frame & 7`
 * beat; its ungated wing-man fires the very next frame; while bugs fly, the
 * wave marker re-arms `game_tmrs[0] = 2`. The ~1 s post-landing wait behind
 * that timer applies on CHALLENGE stages only -- `l_2953`'s
 * `jr nz,l_2944_attack_wave_start` sends combat stages straight through the
 * marker once the sky is clear (gg1-3.s:1682-1709; the dissection report
 * over-generalised this to all stages).
 */
export function stepWaveLauncher(state, inputs = {}) {
  if (state.done) return { state };

  const next = { ...state };
  next.frame = state.frame + 1;

  // The 2 Hz game-timer task, folded in: one decrement per 30 frames.
  if (next.timerTicks > 0) {
    next.timerFrames += 1;
    if (next.timerFrames >= FRAMES_PER_TIMER_TICK) {
      next.timerTicks -= 1;
      next.timerFrames = 0;
    }
  }

  const bugsFlying = inputs.bugsFlying ?? 0;
  const op = state.stream[state.cursor];

  if (op === STREAM_END) {
    if (bugsFlying !== 0) return { state: next };
    next.done = true;
    return { state: next, completed: true };
  }

  if (op === WAVE_START) {
    if (!(inputs.enabled ?? true)) return { state: next };
    if (bugsFlying !== 0) {
      next.timerTicks = 2;
      next.timerFrames = 0;
      return { state: next };
    }
    if (inputs.challenge) {
      if (next.timerTicks === 1) return { state: next, hitTallyReset: true };
      if (next.timerTicks !== 0) return { state: next };
    }
    next.cursor = state.cursor + 1;
    next.wave = state.wave + 1;
    return { state: next, started: next.wave };
  }

  // A path byte. Gated bytes wait for the 8-frame beat; then a free motion
  // slot is needed; then the NEXT byte is the object ID and both are
  // consumed in this one frame.
  if ((op & IMMEDIATE_BIT) === 0 && (next.frame & 7) !== 0) return { state: next };
  if ((inputs.inFlight ?? 0) >= IN_FLIGHT_CAP) return { state: next };

  const rawObjectId = state.stream[state.cursor + 1];
  next.cursor = state.cursor + 2;
  return { state: next, launch: { pathByte: op, rawObjectId, wave: next.wave } };
}

// -------------------------------------------------------- launch decoding

/** The transient marker: no formation fly-in ID carries the 0x38 pattern. */
export function isTransientId(objectId) {
  return (objectId & 0x38) === 0x38;
}

/**
 * Decode one launch the way `l_2974`-`l_2A28` sets a motion slot up.
 *
 * - Raw IDs 0x78-0x7E drop bit 6 (`res 6,a`) to the object ID 0x38-0x3E;
 *   the raw bit survives only for the sprite pick.
 * - A transient (`(id & 0x38) == 0x38`) is a redmoth when the raw bit 6 is
 *   set, else a yellowbee -- or a boss when it rides wave 2 (`l_29B3`,
 *   gg1-3.s:1806-1822). Transients never bomb (`0x0F(ix) = 0`).
 * - A formation member's fly-in bomb mask is the stage header's mask, gated
 *   by the creature's own d_2908 capability bit (gg1-3.s:1796-1803).
 * - The path byte contributes the db_2A3C index, the pair member + negated
 *   rotation, the launch gate and the bit-0 bomb-counter seed.
 */
export function decodeLaunch(launch, { flyInBombMask = 0 } = {}) {
  const { pathByte, rawObjectId, wave } = launch;

  let objectId = rawObjectId;
  if ((objectId & 0x78) === 0x78) objectId &= ~0x40;

  const transient = isTransientId(objectId);
  let transientKind = null;
  if (transient) {
    if ((rawObjectId & 0x40) !== 0) transientKind = 'redmoth';
    else transientKind = wave === 2 ? 'boss' : 'yellowbee';
  }

  const bombMask = transient || !entryBombCapable(objectId) ? 0 : flyInBombMask;

  return {
    ...decodeFlyInByte(pathByte),
    objectId,
    rawObjectId,
    wave,
    transient,
    transientKind,
    bombMask,
  };
}

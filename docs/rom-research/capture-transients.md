# Dissection: Boss Capture, Transients, Transform/Bonus-Bee

Corpus dissected: `scratchpad/zanelogi/` — `research_boss_capture.md`,
`research_transients.md`, `research_bonus_bee.md`, `tasks/tractorBeam.js`,
`tasks/captorDive.js`, `tasks/fighterCaptured.js`, `tasks/pullShip.js`,
`tasks/bonusBee.js`, `demos/boss_player.js`.

Replica compared: `C:\Dev\alien-escape\src\systems\capture.js`,
`src\systems\stages.js`, `src\systems\attack.js`, `src\systems\scoring.js`,
`src\systems\caravans.js`, `src\scenes\GameScene.js`, `src\config.js`.

All Z80 cites below are the corpus's own (`gg1-2.s` / `gg1-2_fx.s` / `gg1-3.s`
/ `gg1-5.s` / `mrw.s`); byte values are copied verbatim so this report is
self-sufficient.

---

## 1. Boss capture — the real pipeline

### 1.1 When a capture dive is allowed and chosen

- **Not a timer.** The selector is `case_bmbr_boss` (gg1-2_fx.s:1011): on
  **every other boss launch** a toggle (`_b_bmbr_boss_wingm`) flips between an
  **escort sortie** (boss + 1-2 wingmen) and a **capture mission**. The capture
  side is gated by `_b_bmbr_boss_cflag` ("captureActive").
- The captor is the **first standby boss in index order** (`l_1C1B`), launched
  **solo** on the capture path `db_0454`. Boss slots are `0x30/0x32/0x34/0x36`
  ("bosses start at $30", gg1-2_fx.s:1042).
- **One captured ship at a time.** `cflag` stays SET while a ship is held; it is
  cleared only on rescue (`l_208F`), shot-capturing-boss (gg1-5.s:1212),
  beam-end-without-capture, and dive-abort — **never** on a successful capture
  (`f_2222 l_22E3` jumps to `l_2305` before its `cflag=0` line). A boss that
  owns a slave therefore dives only as an escort sortie (bringing the slave —
  the rescue chance), never with a fresh beam.
- The queued boss/escorts drain from `bmbr_boss_pool` **one per frame**
  (`l_1B8B`, gg1-2_fx.s:892).

### 1.2 The captor's dive path — `db_0454` (gg1-5.s:359-366), verbatim

```
12 18 14  F4  12 00 04  FC 48  00 FC FF  23 00 30  F8  F9  FA <p_flv_040c>  FD <p_flv_0425>
```

- `12 18 14` — descend segment.
- **`F4`** (BOSS_DIVE aim, `case_0A53`, gg1-5.s:1724-1765): reads **player X**
  (`sfr_sprite_posn+0x62`), **clamps it to a lane**, stores it as
  `captr_status+0` (**beamX**), sets the dive angle, arms the capture-dive
  monitor `f_21CB` (task 0x19). The aim is a one-shot commitment, not tracking.
- `FC 48` — dive-to-Y with argument **`0x48`**.
- **`00 FC FF`** — the **stall segment**: vx = 0, duration `0xFF`. This is the
  descent stop: `f_21CB` (gg1-3.s:392-446) waits for `0x0A(ix)` (segment vx)
  to hit 0 — the boss stops translating and just sits. **The beam opens where
  the boss stopped**, at the F4-aimed X column.
- Retreat tail (used only when the beam misses): `23 00 30 / F8 / F9 / FA
  <p_flv_040c> / FD <p_flv_0425>`. On a no-capture end, `l_22E3` sets the
  motion slot's `b0D = 1` (gg1-3.s:607-612) — force-expiring the ~255-frame
  stall leftover so the boss retreats immediately.

**Pre-beam spin:** once the stall hits, `f_21CB` spins the boss to face
straight DOWN before opening the beam: rotation step **±`0x0C`/frame**
(direction from bit 0 of the angle high byte), until the heading is within
**`0x10`** of down (Z80 down = `0x300` = 768 in 10-bit angle units;
gg1-3.s:413-426). Then `rotRate = 0`, beam opens, `captr_status+2 = 1`.

### 1.3 Beam geometry + animation timing — `f_2222` (gg1-3.s:458-694)

Three modes, grow → grab → shrink, driven by `captr_status+1/+2`:

| phase | duration | detail |
|---|---|---|
| **grow** | `0x0B` (11) strips × `newStageParms[6]` frames/strip | cone strips 0..0x0B added top-down; strip timer reloads from `captr_flag = newStageParms[6]` — **12 frames/strip on stage 1 dropping to 3 by late stages** (beam speeds up with difficulty) |
| **grab** | **fixed `0x40` = 64 frames** (`l_231C`, gg1-3.s:632-634; same every stage) | the ship-in-beam test (`l_233D`) runs **every one** of these frames; **capture can happen ONLY here**, never during grow/shrink |
| **shrink** | 11 strips × `newStageParms[6]` frames | blank tiles `0x24` written bottom-to-top (`l_22C1/l_22C5/l_22CC`, gg1-3.s:567-581) — cone withdraws upward; at 0 strips, beam ends |

- **Cone**: the `d_23A1` tile arrangement, tiles `0x4E-0x7F`, **6 tiles (48 px)
  wide**, blank = `0x24`, anchored on **beamX** (the F4 aim), NOT the boss's
  drifted X.
- **Shimmer**: colour RAM rewritten at 15 Hz — palette `0x17 + a` where
  `a = (frame>>2)&3` bumped to 1 when 0 → cycle `0x18, 0x18, 0x19, 0x1A`.
- **Ship-in-beam test** (`l_233D`, gg1-3.s:651-694):
  `A = beamX − shipX + 0x1B; if (A >= 0x36) not in beam` — i.e.
  **|beamX − shipX| < `0x1B` (27 px)**, a **54-unit window** on a 224-wide
  playfield. There is **no drag/pull while the beam is open** — capture is a
  positional test; the player keeps full control until caught.
- On a hit (gg1-3.s:682-694): player control off (task 0x14 → 0), pull task
  `f_20F2` on (task 0x1C → 1), `captr_flag = 0x0A`, `captr_status+3
  (pullGate) = 1`.

### 1.4 Pull-ship sequence — `f_20F2` + `c_2188_ship_spin` (gg1-3.s:205-380)

**Not a spiral** — a tumble-and-pull:

1. **Spin** (`c_2188`): cycles the ship sprite code **0↔6** (rotation frames)
   and toggles the facing bit — the visible "tumbling in the beam". Corpus port
   runs it at ~15 Hz (`(frame>>2) % 7`).
2. **Pull** (only while `pullGate != 0`): X steps **±1 px/frame toward the
   boss's column**; Y steps **1 px/frame up** (`dec` the Y byte).
3. Thresholds on the ship's sprite-Y byte:
   - **`0xE0`** → connected: `pullGate = 0`, ship **recoloured to sprite code
     7 (wings-closed, red)** (`l_2141`, gg1-3.s:260-266);
   - **`0xE6`** → player **fire disabled** (task 0x15 → 0).
4. Connect completes (gg1-3.s:275-318): `glbls+0x0D = 1`, `f_20F2` off. The
   still-running `f_2222` then (`l_22D2`→`l_2305`, gg1-3.s:583-630) loads
   **`db_flv_cboss`** into the boss's motion slot and enables `f_19B2` with
   `fighterCaptured = 1`.
5. **Shot mid-pull** (`l_2327`, gg1-3.s:639-649): beam flips to retract
   (`captr_status+1 = 0x80`, `+2 = 1`), `pullGate = 0`, and **player control
   is RE-ENABLED** (task 0x14) — a ship caught mid-pull is released, not lost.

### 1.5 Fighter-captured sequence — `f_19B2` (gg1-2_fx.s:510-669)

- Carry-home path **`db_flv_cboss`** (gg1-5.s:367-369), verbatim:
  `12 18 14 FB 12 00 FF FF` — descend, FB home to the boss's formation slot.
- Segment 1 (boss flying home, state 9): ship glued at **boss X, boss Y +
  `0x10`** (16 px below), sprite code 7 red.
- Segment 2 (boss reaches home, `l_1A3F`): slave rises over a **`0x24`
  (36)-frame counter** to settle **ABOVE the boss** (gg1-2_fx.s:630-656).
- Settle (`l_1A6A`): `f_19B2` disabled forever (never re-enabled), slave set to
  **standby (state 1)** as an ordinary red formation member, `cobj`
  invalidated (`cflag` stays set).
- **"FIGHTER CAPTURED"** text: literal string (gg1-2.s:1322), shown for **6
  game-timer ticks at 2 Hz ≈ 3 s**. Tile codes via `c_string_out`
  (gg1-2.s:1208-1217): `code = ascii − 0x30; −7 if ≥ 0x11; space → 0x24` →
  `0F 12 10 11 1D 0E 1B 24 0C 0A 19 1D 1E 1B 0E 0D`. Position: playfield row
  17, col 6 → canvas (48, 152).

### 1.6 The captive fights — squad pairing + firing

- **The rescue dive is deliberate, not emergent** (`l_1CE3`,
  gg1-2_fx.s:1221-1248): every boss activation queues the boss into
  `bmbr_boss_pool` with flight vector IY; if `pool[0] & 7` (the boss's
  captured-ship slot — the slave lives at slot `boss & 7` = `0x00/02/04/06`)
  holds a STANDBY slave, it is **queued into the pool too with the SAME IY**
  = **`db_flv_0411`, the escort path** (gg1-5.s:338-354). The slave dives as an
  extra escort that happens to be your red ship.
- **The slave bombs like any escort.** Bombs are armed at attack LAUNCH by
  `j_108A` (gg1-2.s:314-323: counter `0x0E = 0x1E`, enable mask
  `0x0F = b_92C0[8]`), identical for every diving enemy. There is no
  captured-ship firing exclusion.
- **Fallback rogue**: only when NO boss and NO escort is available does the
  dispatcher launch the lone slave on **`db_fltv_rogefgter`**
  (gg1-5.s:356-357), verbatim:
  `12 18 14 12 03 2a 12 10 40 12 01 20 12 fe 78 ff` — a plain descent ending
  in `FF` (despawn, never homes).

### 1.7 Rescue + every mission-end branch (gg1-5.s, re-verified table)

Prerequisite: the capturing boss is a normal **2-hit boss** — 1st hit
green→**blue** (colour 1, gg1-5.s:1325-1327); the rescue check lives in the
**blue-boss 2nd-hit flying branch**.

| # | condition | outcome | cite |
|---|---|---|---|
| R | shoot the **blue, flying** boss while its slave is **state 9** (paired dive) | **RESCUE**: `f_2000` enabled, rescued-ship music; spin → land → dock → **2-ship** | gg1-5.s:1339-1361 |
| L1 | shoot the boss while the slave is NOT state 9 (e.g. still being pulled in / carry-home) | boss dies, **slave orphaned/lost** | gg1-5.s:1338→1364 |
| L2 | shoot the **captured ship itself** | slave **destroyed — lost forever** | gg1-5.s:1305-1311 |
| L3 | shoot the boss **during the beam, before connect** | beam retracts; a ship mid-pull gets **control back** (task 0x14 re-enabled); mission aborts | gg1-3.s:639 `l_2327` |
| O | shoot the capturing boss **at home in formation** (status 4) | slave **goes rogue**: launches out on `db_fltv_rogefgter` and despawns | gg1-5.s:1442-1456, 2516 |
| B | a **bomb** hits the slave | ordinary hit — slave lost, no special case | gg1-5.s:1257 |

**Note: the carry-home is NOT a rescue window** (the slave is not state 9
during it). The rescue is only reachable on the later paired dive.

Rescue motion `f_2000` (gg1-3.s:29-194), staged on `captr_status+1`:
phase 0 → set `gameTimers[1]=2`; phase 1 **spin** (`c_2188`; duration gate
`pullGate = bugsFlying|gameTimer`); phase 2 **land** — X toward centre
**`0x80`**, Y toward landing row **`0x29`**; phase 3 **dock** (`l_208F`,
gg1-3.s:133-168): rescued ship at `sprite_posn+0x61` (LEFT of the main at
`+0x63`), `_b_2ship = 1`, both sprite code 6 / white (colour 9), control +
fire + collision re-enabled. 2-ship mode = dual fire + double-wide hitbox
(`_b_2ship` read at gg1-5.s:663,696). Capture-boss kill bonus 1600/800/400 via
`d_1CFD` (gg1-2_fx.s:1255).

---

## 2. Transients (slots 0x38-0x3E) — REPLICA HAS NOTHING

> **Correction (2026-08-02, fidelity pass 6): the headline is obsolete.** The
> transient subsystem has since been built: `compileCaravanStream`
> (src/systems/caravans.js) runs the `l_2612` insertion byte-for-byte — count
> and type bits from the caravan control byte, RNG slot placement with
> collision re-roll, IDs `(b << 1) | 0x38` with the `0x40` redmoth flag —
> `decodeLaunch` maps IDs 0x38-0x3E to yellowbee/redmoth/boss transients that
> never bomb, the F7 gate in the path interpreter (src/systems/pathcode.js)
> branches exactly the caravan fly-through members onto their swoop sub-paths,
> and `spawnWaveMember` (src/scenes/GameScene.js) spawns them as gridless
> enemies that despawn at their FF. The section BODY below remains the
> authoritative description of the ROM machine and is unchanged.

**What they are:** from **stage 4**, extra caravan members that fly in
alongside a formation pair, make **one player-targeted swoop, and leave —
they never join the grid** (disassembler's own comment, gg1-3.s:1806). The
formation has 48 slots (IDs `0x00-0x5E` even); only 40 fly in normally
(`db_attk_wav_IDs`, gg1-3.s:1489). The 8 reserved: `0x00/02/04/06`
(captured-ship region) and **`0x38/3A/3C/3E`** — the transient / bonus-bee
clone slots (shared, never overlapping in time: transients at stage start,
bonus-bee clones late-stage).

### 2.1 Build side — `c_25A2` (gg1-3.s:1168-1423)

Per-wave triplet in the caravan row `d_combat_stg_dat`:

```
byte0 = transient control  (low nibble = COUNT; bits 7..(8−count) = per-transient TYPE bits)
byte1 = lefty path byte
byte2 = righty path byte
```

**Our replica documents and IGNORES byte0** (`src/systems/caravans.js:8`
"a transient control byte the port ignores").

Insertion loop (`l_2612`, gg1-3.s:1287-1311) into a 16-slot temp buffer
(lefty 0-7 / righty 8-15, memset `0xFF`):
- `E = (count >> 1) + 4` — placement divisor; slot = `rng % E`, **+8 when the
  down-counter b is odd** (righty half); re-roll on collision.
- transient ID = **`(b*2) | 0x38`**, plus **`| 0x40`** when the MSB-first bit
  of byte0 is set (`rlc c` rotates byte0 once per transient → transient k
  takes bit (8−k)) — **one wave can mix types**.
- Worked trace, stage 4 rank A wave 1: `byte0 = 0x82` → count 2, E 5 →
  transients `{0x7C (redmoth), 0x3A (yellowbee)}`. Stage 9 wave 1:
  `0x78/0x7C` redmoths + `0x3A/0x3E` yellowbees (4 transients).
- After transients, the 8 formation IDs fill the remaining `0xFF` slots;
  stream emitted as `[byte1, tmp[i], byte2, tmp[i+8]]` per pair, markers
  `0x7E` wave-start / `0x7F` stage-end. A transient rides the **normal
  pairing machinery** and enters on the **same fly-in path** and `db_2A6C`
  start-position variant as the formation bug it pairs with.

**RNG:** `c_1000`'s entropy is the Z80 **R register** (DRAM refresh counter) —
no software counterpart. The corpus's locked substitution: **xorshift32
(13/17/5, logical `>>> 17`)**, reseeded per stage `0x12345678 ^ stage`. The
per-call advance is load-bearing (the placement loop re-rolls on collisions).

### 2.2 Launch side (gg1-3.s:1718-1895)

- ID remap: raw `0x78-0x7E` → `res 6` → obj_id `0x38-0x3E`; the raw bit 6
  survives for the sprite pick.
- Sprite (`_setup_transients`, `l_29B3`): raw bit 6 set → **redmoth**
  (colour 2); clear → **yellowbee** (colour 3); clear + wave counter == 2 →
  **boss** (colour 0, stage 9+).
- **Transients never bomb**: `0x0F(ix) = 0`.

### 2.3 Runtime — F7, the six sub-paths, FE, despawn

- **`F7`** (`case_0B98`, gg1-5.s:1947): gate `(obj_id & 0x38) == 0x38` — a
  transient **jumps** to the embedded 2-byte sub-path address; a formation bug
  skips 3 bytes and continues to its FB-home tail. Same token, two audiences.
- **Six sub-paths**: `p_flv_004b, 0084, 00b6, 0160, 0192, 01ca` — each is a
  couple of segments → **`FE`** → a segment → **`FF`**. Example `p_flv_004b`
  (gg1-5.s:136), verbatim:
  `23 F0 26 · 23 14 13 · FE <8-byte LUT> · 23 00 48 · FF FF`.
- **`FE`** (`case_0B16`, gg1-5.s:1849-1881) — **player-region turn-HOLD**, a
  structural twin of F3 with different math: read ship X, mirror by
  flip-screen + the `0x13` negate bit, index = shipX-derived **/ `0x1E`**
  (F3 divides by 6; corpus port formula:
  `idx = ((neg ? shipX : 0xF2 − shipX) + 0x0E) / 0x1E`), read the **8-byte
  LUT** → write **segment DURATION** `0x0D(ix) = LUT[idx]`, skip token+8,
  keep vx/vy/rotRate. Effect: how long the current turn continues depends on
  where the player is — the swoop bends toward the player's region.
- **Despawn**: sub-paths end `FF`, not `FB` — transients **despawn off-screen,
  never home**. The slot returns to pending and can relaunch next wave.

### 2.4 Replica status — **flagged: NOTHING exists**

`alien-escape` has challenging-stage fly-throughs (`entities/enemy.js:20`) but
**no combat-stage transients at all**: the caravan control byte is explicitly
ignored, there are no reserved-slot extras, no F7/FE analog, no
player-region swoop-and-leave members. From stage 4 onward the arcade's combat
waves visibly contain more enemies than ever land in the grid; our stages do
not. **This is a whole missing subsystem.**

> **Correction (2026-08-02, fidelity pass 6): no longer true — see the note at
> the top of section 2.** The control byte is consumed, the reserved-slot
> transients launch, F7 and FE run in the interpreter, and the swoop-and-leave
> members fly and despawn. Kept as written for the record of what the audit
> found at the time.

---

## 3. Bonus-bee / transform enemies — the real mechanic

The corpus's "clone-attack"/"bonus-bee" IS the transform-enemy mechanic: the
`0x50/0x58/0x60` sprite groups are the Scorpion / Spy-Ship / Flagship art
(`+0x40` variants of the normal creature bases `0x10/0x18/0x20`; 7 real frames
per group, frame 7 blank in ROM).

### 3.1 The real trigger — NOT a launch counter, NOT a timer

Manager `f_1A80` (gg1-2_fx.s:671-833), gated per frame on:

```
active_bug_count < new_stage_parms[0x0A]
```

`parms[0x0A]` = **0 for stages 1-3 and challenge stages** (never arms),
**`0x0A` (10) otherwise**. So the transform arms **late in the stage, once
fewer than 10 bugs remain** — it is an endgame event, once per stage:

- **Arm**: scan the **bee group** (`b_8800+0x07`, 20 wasps, IDs `0x08-0x2E`)
  for the first RESTING (status 1) one; fallback the **moth group**
  (`b_8800+0x40`, 16 butterflies, `0x40-0x5E`). Set `_b_bbee_tmr = 0xC0`.
- **Flash**: tmr counts UP `0xC0 → 0x100` wrap = **64 frames ≈ 1.07 s**,
  alternating the bee's colour on **bit 4 of the counter = every 16 frames ≈
  4 Hz**. Bails if the bee is killed first.
- **Launch** (tmr wraps): repaint sprite code to `(color<<3) + 0x56` →
  **`0x56/0x5E/0x66`** (bases `0x50/0x58/0x60`), write the X3 config, launch
  via `c_1083 → j_108A` (the shared dive-launch) on the per-colour convoy
  path, then **self-disable** (task 0x04 cleared) — **one bonus-bee per stage
  arming** (re-armed next stage).

### 3.2 Stage bands

`_b_bbee_clr_b = ((stage_ctr >> 2) % 3) + 4` → colour index **0/1/2 stepping
every 4 stages**: `0x50` (Scorpion) stages 4-7 band, `0x58` (Spy Ship) next
band, `0x60` (Flagship) next, repeating. (Replica's 4-6 / 8-10 / 12-14
banding via `(stage−4)/4` is the same cadence.)

### 3.3 The trio's flight — leader + 2 clones via `0xF2` tokens

Per colour: X3 config `d_1B59` = `1E BD / 0A B8 / 14 BC` (count byte 0x03 +
2 score-popup bytes) and leader paths `d_1B5F` = `db_04EA / db_0473 /
db_04AB`. `db_04EA` (colour 0), verbatim:

```
12 18 1E · 12 00 14 · F2 →p_flv_0502 · 12 00 08 · F2 →p_flv_0502 · 12 00 18 · 12 FB 26 · FD →p_flv_0358
```

- **`0xF2`** (`case_097B`, "split off bonus bee", gg1-5.s:1564-1633): find an
  inactive slot among **`0x38/3A/3C/3E`** (the transient slots), copy the
  leader's sprite/colour + current position + flags, load the embedded
  sub-path. The convoy is **emergent from the leader's path data** — two
  clones peel off mid-dive from wherever the leader is.
- **Clones** fly e.g. `p_flv_0502`, verbatim:
  `12 E2 01 · F3 [08 07 06 05 04 03 02 01] · F5 · 23 00 48 · FF` — a segment,
  F3 player-aim break, F5, segment, **FF despawn**. (Colour 1 clones →
  `p_flv_0499`; colour 2 → `p_flv_04c6` and `p_flv_04cf` — the two clones
  differ.)
- **The leader is the transformed formation bee itself** and its path tail
  (`FD → p_flv_0358` etc.) **returns it HOME to the formation** — if not
  killed, the bee survives the run and reverts to a normal bee in the grid.

### 3.4 Scoring

Kill tracking: `X3attackcfg` count decrements per convoy member killed
(leader matched by `_b_bbee_obj`, clones by `id & 0x38 == 0x38`,
gg1-5.s:1314-1322); when all 3 are dead the `parm0/parm1` popup bonus is
awarded (gg1-5.s:1389-1400). The corpus never decodes parm bytes to decimal;
canonical arcade values (replica already uses them): 160/ship, set bonus
1000/2000/3000 by type.

### 3.5 Replica comparison

Replica trigger (`src/systems/attack.js:39,133-138`): **every 6th Zako
launch** (`TRANSFORM_EVERY_NTH_ZAKO = 6`) becomes the pull, unlimited per
stage. Real: **once per stage, when active bugs < 10**, resting-bee scan with
moth fallback. Replica trio: 3 fresh enemies spawned at the pulled Zako's
position with a spread, all attack and die/leave; real: 1 repainted bee
leader + 2 mid-dive F2 clones, clones despawn on FF, **leader homes back into
the formation**. Replica pulse (260 ms) vs real 64-frame 4 Hz colour flash.

---

## 4. GAP LIST vs our replica, ranked by impact

Replica reference points: `src/systems/capture.js` (7-state machine),
`src/config.js` `CAPTURE = { attemptIntervalMs: 12000, descendDurationMs:
2200, aimTravelPx: 190, descendToY: PLAYER.y − 200, beamOpenMs: 1100,
beamHoldMs: 1400, beamWidth: 162, captureDepth: 80, pullStrength: 90,
captureRiseMs: 1000, dockDurationMs: 1400, captorDiveChance: 0.6,
captiveEscapeMs: 1400 }`, `GameScene.attemptCapture/openBeam/updateBeam/
updateCaptive/dockCaptive/advanceCaptiveEscape`.

1. **[CRITICAL — whole subsystem] Transients missing entirely.** No
   combat-stage fly-through members, no reserved-slot `0x38-0x3E` extras, no
   caravan byte0 consumption (`caravans.js` ignores it by design), no F7
   routing, no FE player-region turn-hold, no despawn-not-home lifecycle.
   From stage 4 the arcade's waves are bigger than the grid; ours never are.
2. **[HIGH] Transform trigger + cadence wrong.** Ours: every 6th Zako launch,
   any time, repeatable. Real: once per stage, armed only when active bugs
   drop below `parms[0x0A] = 10` — an endgame set-piece, schedule-independent.
   Also: real selection scans resting bees in ID order with a moth-group
   fallback; ours picks a random Zako.
3. **[HIGH] Capture-attempt selection wrong shape.** Ours: 12 s wall-clock
   timer (`attemptIntervalMs`) + `captorDiveChance`. Real: every-other **boss
   launch** alternates escort-sortie / capture-mission, first standby boss in
   index order, gated by `cflag` (one held ship at a time blocks new beams).
   Coupling capture frequency to boss launches (like our transform fix in
   pass 4) is the same class of correction.
4. **[HIGH] Rescue condition too loose + no 2-hit interaction.** Real rescue =
   shoot the **blue (2nd-hit), flying** boss while the slave is itself diving
   (state 9) alongside on the escort path. Ours: any destruction of a diving
   captor rescues. Missing branches: L1 (boss shot during carry-home / before
   slave settles → slave orphaned, no rescue) and L3 (boss shot mid-pull →
   beam retracts and the player gets **control back** — in ours capture
   commits at `captureDepth`).
5. **[MED-HIGH] Beam is a different machine.** Real: strip-grow 11 ×
   `parms[6]` frames (**speeds up with stage**: 12 → 3 frames/strip), fixed
   **64-frame grab window** (capture ONLY then), strip-shrink retract, capture
   window **±27 px** positional test, **no drag** on the player. Ours: alpha
   fade 1100 ms + hold 1400 ms + fade, 162 px-wide dragging beam
   (`pullStrength 90`) with `captureDepth 80` commit — the arcade's dodge
   skill (fly out of a narrow aimed column during a fixed window) becomes a
   tug-of-war. No per-stage beam speed scaling at all.
6. **[MED] Transform trio flight shape.** Real: leader = the repainted bee
   flying an authored path with two mid-dive `0xF2` splits; clones F3-aim at
   the player then FF-despawn; **leader homes back to formation if unkilled**.
   Ours: three spawned attackers from a swap point, none returns, none splits
   mid-flight. The "trio peels apart mid-dive / survivor bee returns" look is
   absent.
7. **[MED] Captive dives glued instead of as a squad member, bombs once.**
   Real: the slave is queued into the boss pool and flies the escort path
   itself, bombing under the same launch-armed rules as any diver
   (`0x0E = 0x1E` at launch). Ours: captive rides the captor's position and
   fires exactly one bomb per dive (`hasBombed`). Also missing: the
   no-boss-available standalone rogue dive (`db_fltv_rogefgter`).
8. **[LOW-MED] Capture cosmetics/constants.** No pull tumble at ±1 px/frame
   with sprite-frame 0↔6 spin; no red recolour thresholds (`0xE0`/`0xE6`);
   carry-home rides 16 px below then settles ABOVE the boss over 36 frames
   (ours parks at `captiveOffsetY` below-ish); rescue lands toward centre
   `0x80` then docks LEFT of the player; "FIGHTER CAPTURED" is a banner in
   ours (real: 3 s tile text at row 17 col 6 — fine as-is); capture-boss kill
   bonus 1600/800/400 (`d_1CFD`) unwired.

Points of **good existing parity**: formation-kill of the captor → captive
lost with an escape swoop (`advanceCaptiveEscape`) ≈ the real status-4 rogue
launch (outcome and feel match, path differs); shoot-your-own-captive = lost
(L2) exists and even scores; captive-bombs-only-while-captor-dives matches
the practical geometry; dual fighter with 4-bullet limit matches `_b_2ship`;
transform stage bands and 160 + set-bonus scoring match; one-capture-at-a-time
is implied by our single `captor`/`captive`.

---

## 5. Porting recommendation

Priority order, sized for small PRs:

1. **Transients (new system, ~2 PRs).** (a) Data/build: consume the caravan
   triplet's byte0 (our authored rows must gain transient control bytes —
   suggest mirroring the arcade counts: 0 for stages 1-3, `0x82`-style from
   stage 4, heavier by stage 9), reserve 4 fly-through IDs, seedable xorshift32
   for placement. (b) Flight: give transients the wave's own entrance path,
   then branch at the path's F7-equivalent point into a swoop that bends
   toward the player's region (an 8-entry turn-hold LUT indexed by
   `playerX / 30 px` is the faithful shape) and despawns off-screen. They
   never bomb, never join. This is the single biggest visible fidelity gap.
2. **Transform trigger rewrite (small).** Replace `TRANSFORM_EVERY_NTH_ZAKO`
   with the real gate: arm once per stage when live formation count < 10
   (skip challenge stages via the existing `transformTypeFor` null); scan
   resting Zakos in order, fall back to Goei; 64-frame 4 Hz flash before the
   swap (our 260 ms pulse can simply lengthen). Keep our banding + scoring.
3. **Capture selection + rescue tightening (medium).** Drive capture attempts
   off boss-launch alternation instead of the 12 s timer; block new beams
   while a captive is held; require the captor to be on its damaged (blue)
   hit before a diving kill rescues, and add the mid-pull-release (L3) and
   carry-home-orphan (L1) branches. Our `capture.js` transition table absorbs
   this cleanly: add `HELD`-adjacent guards rather than new states.
4. **Beam feel (medium, optional but high-payoff).** Swap drag-capture for the
   arcade shape: narrow aimed column (≈ 54/224 of playfield width ≈ 0.24 ×
   screen), grow/hold/shrink with the hold fixed (64 frames ≈ 1.07 s) and
   grow/shrink speed scaling with stage difficulty, capture as a positional
   test only during the hold. This restores the real dodge skill.
5. **Transform trio flight + captive-as-escort (low, polish).** Leader keeps
   its identity and homes if unkilled; clones split mid-dive and despawn.
   Captive flies the captor's dive as a wingman with normal bombing rather
   than glued single-bomb.

Not worth porting: flip-screen/cocktail branches, the R-register RNG (use
seeded xorshift32), tile-RAM text plumbing, exact sprite-Y byte thresholds
(convert to our coordinate system by ratio).

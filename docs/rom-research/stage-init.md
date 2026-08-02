# Stage-Init Dissection: zanelogi corpus vs alien-escape replica

Sources read in full: `zanelogi/research_stage_init.md`, `research_flyin_dataflow.md`,
`paths.js` (the goldmine — all tables verbatim), `state.js`, `tasks/gameController.js`,
`tasks/launchAttackWave.js`, `tasks/formationOscillate.js`, `tasks/formationPulse.js`,
`tasks/enemyStatus.js`, `tasks/hud.js`, `demos/challenge_player.js`, `CLAUDE.md`.
Replica: `c:\Dev\alien-escape\src\systems\caravans.js`, `formation.js`, `stages.js`,
`tests\caravans.test.js`.

Z80 citations are to the hackbar disassembly (`gg1-3.s` unless noted); byte data below
is transcribed from `zanelogi/paths.js`, which the corpus states is a VERBATIM port of
the `.db` lines. All `+0x80` assembler expressions have been evaluated to final bytes.

---

## 1. The real d_combat_stg_dat and its index table

### 1.1 d_combat_stg_dat (gg1-3.s:1461, ROM ~0x25xx region; ported at paths.js:669)

**13 rows exist. Row = 18 bytes:** `[hdr0, hdr1]` + 5 triplets `[byte0, byte1, byte2]` + `0xFF`.

- `hdr0` = bomb-drop counter reload -> `b_92E2[0]` (0x14 on every row).
- `hdr1` = fly-in bomb-drop ENABLE mask -> `b_92E2[1]` (0x00 / 0x01 / 0x03).
- triplet `byte0` = transient control: low nibble = transient count, high bits (read
  MSB-first via RLC) = per-transient creature type.
- triplet `byte1` / `byte2` = the shared path byte for every LEFTY / RIGHTY of that wave.

All 13 rows, evaluated bytes, with byte offset into the table (offset = row * 18):

```
row  off   header  wave1        wave2        wave3        wave4        wave5        term
 0  0x00   14 00   00 00 C0     00 01 01     00 41 41     00 40 40     00 00 00     FF
 1  0x12   14 01   00 42 82     00 03 85     00 43 C5     00 42 C4     00 02 84     FF
 2  0x24   14 01   82 00 C0     00 01 01     00 41 41     02 40 40     02 00 00     FF
 3  0x36   14 01   82 02 C2     00 03 85     00 43 C5     02 42 C4     02 02 84     FF
 4  0x48   14 01   82 00 C0     00 01 C1     00 41 81     02 40 80     02 40 80     FF
 5  0x5A   14 01   82 00 C0     42 01 01     F2 41 41     02 40 40     02 00 00     FF
 6  0x6C   14 01   A4 02 C2     52 03 85     F2 43 C5     02 42 C4     02 02 84     FF
 7  0x7E   14 01   82 00 C0     52 01 C1     F2 41 81     02 40 80     02 40 80     FF
 8  0x90   14 01   A4 00 C0     42 01 01     F4 41 41     04 40 40     04 00 00     FF
 9  0xA2   14 01   A4 02 C2     52 03 85     F4 43 C5     04 42 C4     04 02 84     FF
10  0xB4   14 03   A4 00 C0     54 01 C1     F4 41 81     04 40 80     04 40 80     FF
11  0xC6   14 03   A4 00 C0     54 01 01     F4 41 41     04 40 40     04 00 00     FF
12  0xD8   14 03   A4 02 C2     54 03 85     F4 43 C5     04 42 C4     04 02 84     FF
```

Key structural observations:

- **Path indices used by combat rows are ONLY 0-5** (`byte & 0x3F` over every path byte
  above yields {0,1,2,3,4,5}). The six combat fly-in shapes are PATH_INDEX entries 0-5
  (addrs 0x001D, 0x0067, 0x009F, 0x00D4, 0x017B, 0x01B0) — the only token-bearing
  (F7/F0/FB) blocks. Indices 6-0x17 are challenge-stage exclusive.
- **hdr1 progression:** 0x00 only on row 0 (stage 1 — no fly-in bombs); 0x01 on rows
  1-9; 0x03 on rows 10-12 (two bombs per capable fly-in bug).
- **byte0 transient counts:** rows 0-1 none; rows 2-7 two per marked wave (x2 low
  nibble), rows 8-12 four (x4). High-bit patterns: 0x82 = 1000_0010, 0xA4 = 1010_0100,
  0x42, 0x52, 0x54, 0xF2, 0xF4 — bits taken MSB-first, one per transient, select
  redmoth (bit=1 -> ID | 0x40) vs yellowbee.

### 1.2 d_combat_stg_dat_idx (gg1-3.s:1437; ported at paths.js:691)

4 ranks x 17 entries; each entry is a BYTE OFFSET into d_combat_stg_dat (multiple of 18):

```
rank 0: 00 12 24 36 00 48 6C 5A 48 6C 00 7E A2 90 B4 D8 C6
rank 1: 00 12 48 6C 5A 7E A2 00 7E D8 C6 B4 D8 C6 B4 D8 C6
rank 2: 00 12 7E A2 90 7E D8 C6 B4 D8 C6 B4 D8 C6 B4 D8 C6
rank 3: 00 12 48 36 24 48 6C 00 7E A2 90 B4 D8 00 B4 D8 C6
```

Converted to caravan ROW numbers (offset / 18):

```
rank 0: 0  1  2  3  0  4  6  5  4  6  0  7  9  8 10 12 11
rank 1: 0  1  4  6  5  7  9  0  7 12 11 10 12 11 10 12 11
rank 2: 0  1  7  9  8  7 12 11 10 12 11 10 12 11 10 12 11
rank 3: 0  1  4  3  2  4  6  0  7  9  8 10 12  0 10 12 11
```

### 1.3 The real indexing arithmetic (c_25A2, gg1-3.s:1170-1235; paths.js stageCaravanRow)

```
if ((stage + 1) % 4 == 0)  -> challenge table (section 3), NO rank dimension
s = stage; while (s > 0x17) s -= 4          // endless-game wrap: cycle last 4 combat configs
si = s - (s >> 2) - 1                        // combat-stage index 0..16 (skips challenge stages)
offset = d_combat_stg_dat_idx[rank * 17 + si]
```

So: **yes, flat = rank*17 + si; si = wrapped - floor(wrapped/4) - 1; wrap = while > 0x17
subtract 4.** This is EXACTLY the replica's `combatStageIndex` arithmetic — the replica's
arithmetic is correct; its index-table VALUES and 12 of 13 caravan rows are not.

Two rank subtleties the replica does not have:

- **Raw rank -> displayed letter is B/C/D/A** (str_3A68): raw 0=B, 1=C, 2=D, **3=A
  (factory default)**. A default cabinet flies idx row 3 above. The replica's
  `DifficultyRank = {A:0, B:1, C:2, D:3}` maps A to raw 0, which is the ROM's rank B row.
- **Fly-in indexes idx by raw rank DIRECTLY (gg1-3.s:1197); the difficulty table
  (bmbr_stg_cfg_dat) goes through the rotation LUT `bmbr_stg_cfg_lut = [1,2,3,0]`**
  (new_stage.s:124-128): raw rank 3 -> difficulty sub-table 0, raw 0 -> 1, etc. The two
  systems must not share one index.

Also note the idx tables REPEAT rows: rank 0 replays caravan row 0 (the stage-1
entrance) at si 4 and si 10; rank 3 at si 7 and si 13. The rows are not a monotone
difficulty ladder.

---

## 2. Wave-byte semantics, the c_25A2 transform, and launcher cadence

### 2.1 Path-byte bits (gg1-3.s:1450-1458, code-verified)

```
bits 0-5  index into PATH_INDEX (db_2A3C, 24 entries; combat uses 0-5 only)
bit 6     (a) pair-member selector: VARIANTS[variant*2 + 0] (clear) or [variant*2 + 1] (set)
          (b) NEGATE-ROTATION flag: stored at 0x13(ix) bit 7 (gg1-3.s:1892-1894); the
              motion interpreter negates each segment's rotRate (gg1-5.s:2014-2018)
              -> the partner sweeps a MIRRORED ARC. This, not the start position, is
              what makes the symmetric pair entries.
bit 7     launch gate. CLEAR -> this launch waits for frame_cnt & 0x07 == 0
          (8-frame beat). SET -> fires the frame the launcher reads it (wing-man,
          1 frame behind its gated leader). gg1-3.s:1723-1728.
bit 0     OVERLOADED: it is the low bit of the 0-5 index AND is re-read as the
          bomb-drop counter init 0x0E(ix): clear -> 0x08 (top entrant),
          set -> 0x44 (side entrant). gg1-3.s:1828-1834.
```

Compare to the replica's `decodeFlyInByte` reading:

- bits 0-5 "which path": correct in shape; but replica's combat rows use indices
  6-0x17, which in the real data never appear on a combat stage.
- bit 6 "mirror: enter from the other side of the screen": **partially wrong.** The
  real effect is variant-pair member + negated rotation. For variants 0/1 (stage 1
  wave 1) both members enter at TOP-CENTER, only 32 px apart (canvas X 94 vs 126,
  same Y 43 by the corpus's own coordinate math) — the "opposite sides" look comes
  from the negated rotation splitting their arcs, and only variants 2/3 and 6/7
  actually start on opposite screen edges (bottom-left x=0x00 vs bottom-right 0x78).
- bit 7 "immediate": direction correct, but the replica misses that CLEAR means a
  hard `frame & 7 == 0` gate (so gated launches are exactly 8 frames apart and a
  gated-leader + ungated-wingman pair is exactly 1 frame apart).
- bit 0 overload (bomb counter 0x08/0x44): absent from the replica.

PATH_INDEX (db_2A3C, gg1-3.s:1918) packs `(addr low 13 bits) | (variant << 13)`.
The 24 entries (addr, variant):

```
 0 (0x001D,0)  1 (0x0067,1)  2 (0x009F,2)  3 (0x00D4,1)  4 (0x017B,0)  5 (0x01B0,3)
 6 (0x01E8,0)  7 (0x01F5,1)  8 (0x020B,0)  9 (0x021B,1) 10 (0x022B,4) 11 (0x0241,1)
12 (0x025D,4) 13 (0x0279,1) 14 (0x029E,0) 15 (0x02BA,1) 16 (0x02D9,0) 17 (0x02FB,1)
18 (0x031D,0) 19 (0x0333,1) 20 (0x0FDA,0) 21 (0x0FF0,1) 22 (0x022B,5) 23 (0x025D,5)
```

VARIANTS (db_2A6C, gg1-3.s:1928-1941) — 12 entries x (Y, X, rotHi), indexed
`variant*2 + bit6`; coordinates are internal (Y up-positive; canvas_Y ~ (~(y+0x4F)&0xFF)*2+1-32,
canvas_X = x*2-9):

```
 0 (9B,34,03)  1 (9B,44,03)   pair 0: top mid-left / mid-right (32 px apart)
 2 (23,00,00)  3 (23,78,02)   pair 1: bottom-left edge / bottom-right edge
 4 (9B,2C,03)  5 (9B,4C,03)   pair 2: top, wider split
 6 (2B,00,00)  7 (2B,78,02)   pair 3: low, left / right edge
 8 (9B,34,03)  9 (9B,34,03)   pair 4: both = entry 0
10 (9B,44,03) 11 (9B,44,03)   pair 5: both = entry 1
```

### 2.2 The c_25A2 transform -> ds_8920 runtime stream (gg1-3.s:1168-1423)

The launcher never reads d_combat_stg_dat at play time. c_25A2 builds a flat byte
stream at RAM 0x8920 once per stage:

```
0x7E                                     wave-start marker
byte1, ID_lefty, byte2, ID_righty        pair record (repeated; 4 pairs when no transients)
...
0x7E ...                                 next wave
0x7F                                     end of fly-in (NOT end of stage)
```

Per wave: a 16-slot temp buffer, lefty half 0-7, righty half 8-15; slot i pairs with
i+8. Fill order:

1. **Transients first** (`byte0 & 0x0F` of them): slot = rng % E where
   E = (count>>1)+4, +8 when the down-counting b is odd; re-roll on collision.
   ID = `(b << 1) | 0x38 | (byte0's MSB-first RLC bit ? 0x40 : 0)` -> IDs
   {0x38,0x3A,0x3C,0x3E} or {0x78,0x7A,0x7C,0x7E}. The `0x38` bit pattern is the
   transient marker (no formation fly-in ID carries it).
2. **The wave's 8 ATTK_WAV_IDS** backfill free slots: first 4 into the lefty half,
   next 4 jump to slot 8 (righty half).

Emission walks lefty slots 0..7, stops at the first 0xFF, emitting
`[byte1, tmp[i], byte2, tmp[i+8]]`. Every lefty in a wave flies the identical
member-0 path/variant, every righty the identical member-1 path — they differ only in
destination slot ID. Stage 1 stream = 86 bytes: 5 waves x (1 marker + 4 pairs x 4 bytes)
+ 0x7F.

Stage 1 wave 1 stream, concretely:
`7E, 00 58 C0 28, 00 5A C0 2A, 00 5C C0 2C, 00 5E C0 2E, 7E, ...`

### 2.3 Header consumption: b_92E2 and the d_2908 44-bit table

- `b_92E2[0..1]` latched from the row header at stage init (gg1-3.s:1242-1246).
- Fly-in bombing = TWO stacked gates (gg1-3.s:1796-1803): per-object 0x0F(ix) gets
  `b_92E2[1]` only if the creature's sprite-code bit 7 is set, else 0. Bit 7 comes
  from the fixed 44-bit table **d_2908 (gg1-3.s:1639)**:

```
d_2908 = A5 5A A9 0F 0A 50      ; 44 bits, MSB-first, roster order:
                                ; 20 bees 0x08-0x2E, 8 boss/bonus 0x30-0x3E, 16 moths 0x40-0x5E
```

  Decoded capable set (corpus-verified): bees 0x08,0x0C,0x12,0x16,0x1A,0x1E,0x20,0x24,
  0x28,0x2C; bosses 0x30,0x36; moths 0x40,0x42,0x44,0x46,0x50,0x54,0x5A,0x5E (20 ids).
- Drop mechanics (case_0DF5, gg1-5.s:2345): counter 0x0E(ix) inits to 0x08 (top entry)
  or 0x44 (side entry, path-byte bit 0); each frame dec; at 0, `srl 0x0F` and drop if
  the shifted-out bit is 1 AND sprite_Y >= 152 (canvas >= 112) AND player fire active;
  reload 0x0E from `b_92E2[0]` = 0x14. Transients force 0x0F = 0 (never bomb).
- Stage 1: hdr1 = 0 -> no fly-in bombs. Stage 2+: 0x01; hardest rows: 0x03.

### 2.4 Launcher cadence — f_2916 (gg1-3.s:1658-1745)

Runs once per frame, gated by `_b_atk_wv_enbl` (set late, by plyr_respawn_rdy —
two-phase enable). AT MOST one stream byte processed per frame:

- `0x7F`: wait until bugs_flying == 0, then disable self, enable f_1B65 (bomber
  attacks) + f_1A80 (bonus-bee), set `_b_nestlr_inh = 1` (formation oscillate begins
  its coast-to-center handoff). Dives start here; the stage ends only when all
  enemies die.
- `0x7E`: if bugs_flying != 0 -> set game_tmrs[0] = 2 and return (timers tick at
  2 Hz, so this is a ~1 s pause after the previous wave fully lands); else if
  game_tmrs[0] != 0 -> return; else advance cursor +1, wave counter +1.
- path byte: if bit 7 clear and (frame_cnt & 7) != 0 -> return (no advance). Else
  find a free slot in **ds_bug_motion_que (12 slots x 0x14 bytes — a hard cap of 12
  simultaneously path-flying bugs)**, read the NEXT byte as object ID, launch,
  advance cursor +2.

Timing consequences: gated bytes fire 8 frames apart; an ungated byte fires the very
next frame after its gated leader (pairs 1 frame apart); wave 2 of stage 1 (01/01,
both gated) arrives single file 8 frames apart; inter-wave gap = land-all + ~1 s.
There is NO separate pair timer — the corpus explicitly retired its own
`pendingMember2`/`trailTimer` mechanism as unfaithful.

### 2.5 Launch order and slot IDs

**db_attk_wav_IDs (gg1-3.s:1489)** — 5 waves x 8 formation object IDs (verbatim):

```
wave 1: 58 5A 5C 5E   28 2A 2C 2E     center butterflies (row 3) + center bees
wave 2: 30 34 36 32   50 52 54 56     THE 4 BOSSES + center butterflies (row 2)
wave 3: 42 46 40 44   4A 4E 48 4C     inner butterflies
wave 4: 1A 1E 20 24   22 26 18 1C     bees
wave 5: 08 0C 12 16   10 14 0A 0E     remaining bees
```

**sprt_fmtn_hpos (gg1-5.s:185)** — 96 bytes = 48 entries x (Y_code, X_code); object
IDs are BYTE OFFSETS (even, 0x00-0x5E). Decode: row = (Y_code - 0x14)/2, col = X_code/2.

```
IDs 00-06: 14 06, 14 0C, 14 08, 14 0A                  row 0 cols 3,6,4,5 (rogue/captured-ship row)
IDs 08-0E: 1C 00, 1C 12, 1E 00, 1E 12                  bee corners (rows 4,5 cols 0,9)
IDs 10-1E: 1C 02, 1C 10, 1E 02, 1E 10, 1C 04, 1C 0E, 1E 04, 1E 0E
IDs 20-2E: 1C 06, 1C 0C, 1E 06, 1E 0C, 1C 08, 1C 0A, 1E 08, 1E 0A
IDs 30-36: 16 06, 16 0C, 16 08, 16 0A                  THE BOSSES: row 1 cols 3,6,4,5
IDs 38-3E: 18 00, 18 12, 1A 00, 1A 12                  butterfly corners (transient/bonus-bee slots)
IDs 40-4E: 18 02, 18 10, 1A 02, 1A 10, 18 04, 18 0E, 1A 04, 1A 0E
IDs 50-5E: 18 06, 18 0C, 1A 06, 1A 0C, 18 08, 18 0A, 1A 08, 1A 0A
```

The grid is **48 slots, 6 rows** (canvas Y 28,44,60,72,84,96; canvas X 40..184 step 16),
but only 40 ever fly in: IDs 0x00-0x06 (top rogue row) and 0x38-0x3E (butterfly
corners) are phantom. 0x38-0x3E double as the transient/bonus-bee ID range. Pair
members occupy adjacent IDs and land in symmetric slots (e.g. 0x58 col 3 / 0x5A col 6).

Transient setup (l_29B3, gg1-3.s:1806-1822): sprite by raw ID bit 6 — yellowbee 0x18
(clear) / redmoth 0x10 (set), boss 0x08 when wave counter == 2; heading 270 degrees;
0x0F(ix)=0 (never bomb); no home slot — the shared path's F7 token
(`(objId & 0x38) == 0x38`) routes them onto a swoop-and-leave sub-path ending FF.

---

## 3. Challenge stage data

### 3.1 d_challg_stg_dat (gg1-3.s:1477-1485; paths.js:705) — 8 rows x 18 bytes, VERBATIM (evaluated)

```
row  off   header  wave1        wave2        wave3        wave4        wave5        term
 0  0x00   FF 00   00 06 C6     00 07 07     00 47 47     00 46 46     00 06 06     FF
 1  0x12   FF 00   00 08 C8     00 09 C9     00 09 C9     00 48 48     00 08 08     FF
 2  0x24   FF 00   00 0A 4A     00 0B CB     00 0B CB     00 0A 4A     00 16 56     FF
 3  0x36   FF 00   00 0C CC     00 0D 0D     00 4D 4D     00 0C CC     00 17 D7     FF
 4  0x48   FF 00   00 0E 0E     00 0F 0F     00 4F 4F     00 0E 0E     00 4E 4E     FF
 5  0x5A   FF 00   00 10 10     00 11 D1     00 11 D1     00 50 50     00 10 10     FF
 6  0x6C   FF 00   00 12 12     00 13 13     00 53 53     00 52 52     00 12 12     FF
 7  0x7E   FF 00   00 14 D4     00 15 15     00 55 55     00 14 D4     00 14 D4     FF
```

### 3.2 d_challg_stg_data_idx (gg1-3.s:1444): `00 12 24 36 48 5A 6C 7E`
(8 entries, byte offsets; **no rank dimension**). Selection: when
`_b_not_chllg_stg == 0` (i.e. (stage+1)%4 == 0, stages 3,7,11,...,31), row =
`(stgctr >> 2) & 7` (gg1-3.s:1216-1222).

### 3.3 How challenge stages differ

- Header byte 0 is **0xFF, not 0x14** (irrelevant since mask = 0), header byte 1 = 0
  on every row -> no fly-in bombs, naturally, via the same code path.
- byte0 of every triplet = 0 -> **no transients on challenge stages**.
- Path bytes index the HIGHER PATH_INDEX entries (6..0x17), whose blocks are
  token-free and end in **FF with no FB** -> the bug flies its route and goes
  INACTIVE (despawns) instead of homing. No formation ever assembles
  (corpus-verified: maxFormed = 0 across a full stage-3 replay).
- No dives, no bombs; stage ends when all 40 are gone (shot or escaped) via the same
  bugs-flying / active-count machinery.
- **Roster: the SAME 40 ATTK_WAV_IDS** — so a challenge wave 2 contains the four
  bosses, and the type mix is the normal 20 bees / 16 butterflies / 4 bosses.
- Splash text: string idx 7 "CHALLENGING STAGE" at tile (row 16, col 5) = canvas
  (40, 144) vs "STAGE n" at col 10 = (80, 144).
- The "NUMBER OF HITS / PERFECT! 10000" results tally is NOT in the corpus (declared
  out of scope, scoring-dependent; hit counter named `w_bug_flying_hit_cnt`).

Replica comparison: `stages.js` gets the schedule right (3, 7, 11, ... and 8 patterns
repeating after 31) and despawn/no-dive/no-bomb behavior right in spirit; but
`challengingRoster` ("four bosses first, then all one type, alternating Zako/Goei per
round") is authored and contradicts the corpus data, and the replica has no
d_challg_stg_dat equivalent — its 8 "patterns" are geometry in its own paths.js, not
the ROM's 8 rows of wave bytes over PATH_INDEX 6-0x17.

---

## 4. Formation breathing / oscillation — corpus model vs replica sinusoids

The corpus implements two MUTUALLY EXCLUSIVE tasks with an explicit handoff
(the Z80 pattern; CLAUDE.md flags enabling both as a bug):

### 4.1 f_2A90 formationOscillate (during fly-in and until handoff)

- Every 4 frames (15 Hz): `oscillateX += dir` (1 px), clamp at +/-32, reverse.
  Pure TRIANGLE wave, +/-32 px, full period 512 frames (~8.5 s). Applied to every
  enemy's home X uniformly.
- When `_b_nestlr_inh` is set (fly-in complete, l_2A29) AND oscillateX crosses 0:
  disable self, enable f_1DE6 (gg1-3.s:1998-2031). The formation coasts back to
  center before breathing begins.

### 4.2 f_1DE6 formationPulse (steady state / attack phase)

- Every 4 frames. 16 offset slots: [0-9] per-COLUMN X offsets, [10-15] per-ROW Y
  offsets (yes — the real breathing moves rows vertically too).
- Each tick every bitmap byte is rotated right circularly (rrc); the carry bit
  decides whether that slot's offset steps this tick. Columns 0-4 step -dir
  (leftward when expanding), columns 5-9 and rows +dir.
- Phase counter: expanding 0x00 -> 0x1F (32 steps) then jump to 0xA0; contracting
  0xA0 -> 0x81 (31 steps) then 0x00. When (counter & 7) == 0, reload the working
  bitmap from row `(counter & 0x18) >> 3` of d_1E64 (gg1-2_fx.s:1721), 4 rows x 16
  bytes, VERBATIM:

```
[FF 77 55 14 10 10 14 55 77 FF   00 10 14 55 77 FF]
[FF 77 55 51 10 10 51 55 77 FF   00 10 51 55 77 FF]
[FF 77 57 15 10 10 15 57 77 FF   00 10 15 57 77 FF]
[FF F7 D5 91 10 10 91 D5 F7 FF   00 10 91 D5 F7 FF]
```

Effect: outer columns (0xFF -> carry every tick) sweep ~32 px per half-phase; inner
columns (0x10) barely move; row 0 (byte 10 = 0x00) never moves vertically; lower rows
move progressively more. This is the graded accordion breathing.

### 4.3 Replica comparison (`formation.js`)

- `breathScaleAt`: sinusoid multiplier 1 +/- 0.18 on X spacing, period 4000 ms.
- `swayOffsetAt`: sinusoid +/-30 px, period 6000 ms.
- Both run continuously and simultaneously; no phase machine, no triangle wave, no
  per-column gradation (scale is linear in grid X, which is closer than uniform but
  not the bitmap's grading), **no vertical row component at all**, no
  fly-in-oscillate -> coast-to-center -> breathe handoff, no 15 Hz stepping.

---

## 5. Stage sequencing, splash, badges (gameController.js + research section 12/14)

The Z80 chain per stage: `stg_init_splash` (task_man.s:189) -> `stg_init_env`
(task_man.s:256) -> `plyr_respawn_rdy` (game_ctrl.s:872).

- **Stage counter:** `b_stgctr` increments in stg_init_splash. Single byte; the
  corpus port keeps `(stage + 1) & 0xFF`. Challenge test: `(stgctr+1) % 4 == 0`.
- **Splash:** "STAGE n" (or "CHALLENGING STAGE") shown with game_tmrs[2] = 3 at 2 Hz
  ~= 1.5 s; the JS port uses 90 frames. Text at tile row 16: "STAGE n" col 10 =
  canvas (80,144); "CHALLENGING STAGE" col 5 = (40,144). Char mapping: code =
  ascii - 0x30, minus 7 if >= 0x11, space -> 0x24.
- **Game start shows the splash too** ("STAGE 1", no increment); a real clear bumps
  the counter first.
- **stg_init_env beats** (order matters): game_tmrs[2] = 120 (60 s stage-elapsed
  timer at 2 Hz, drives bomber reload column selection); c_2896 (sprite codes +
  d_2908 bomb bits); c_25A2 (build ds_8920); game_tmrs[0] = 2; c_12C3 (formation
  home positions); clear collision notifications; disable formationPulse /
  bomberAttack / bonusBee tasks; zero per-stage state including `_b_atk_wv_enbl`
  and `_b_attkwv_ctr` and `_b_nestlr_inh`; enable enemyStatus / waveLauncher /
  formationOscillate; c_2C00 (load 10 packed difficulty nibbles + clone-attack
  count from bmbr_stg_cfg_dat via the rotation LUT).
- **Two-phase launcher enable:** the f_2916 task is enabled at init but does nothing
  until plyr_respawn_rdy flips `_b_atk_wv_enbl = 1` (after the text clears / ship
  spawns; the ROM's pre-launch delay is game_tmrs[3] = 3 at 2 Hz).
- **READY:** shown only for MID-STAGE respawn (c_player_respawn); a fresh stage shows
  "STAGE n" and skips READY.
- **Stage-clear detection** (gctl_supv_stage, game_ctrl.s:1306): no active enemies on
  screen AND the wave launcher done. The corpus port excludes the 8 phantom
  'pending' slots from the count (48-slot roster, 40 flyers) — a trap it hit live.
- **twoShip (dual fighter) carries across stages** — reset only on a new game.
- **Badges/flags:** the corpus has NOT located the Z80 flag-draw routine; its HUD is
  an explicitly faked positional stub (badge at canvas x 208, y 272, lower-right;
  lives icons 2x2 char tiles 0x4A-0x4D at y 272, 16 px pitch; HIGH SCORE row 0,
  score row 1). `c_new_level_tokens` is named as the lives/stage-flag icon routine
  but not dissected. The replica's greedy 50/30/20/10/5/1 `stageFlags` is plausible
  arcade lore but is NOT corroborated by this corpus.
- **Stage rollover:** replica wraps 255 -> 0 with flags emptying; corpus only says
  the counter is a byte with `& 0xFF` arithmetic and stage wrap `while > 0x17 -= 4`
  for data selection. Compatible, not corpus-verified.

---

## 6. GAP LIST vs the alien-escape replica, ranked by impact

1. **Wrong caravan data values (12 of 13 rows + the whole index table).** The real
   bytes are now fully available (section 1). The replica's authored rows use path
   indices 0x06-0x17 which are challenge-only shapes — on the real machine every
   combat entrance is built from just six leader paths (0-5), differentiated by
   variant, mirroring, gating, and transients. The replica's authored CARAVAN_INDEX
   (rank ladders) shares nothing with the ROM's repeat-heavy tables.

2. **Wrong rank plumbing.** Replica rank A = 0; ROM factory default A = raw 3, letter
   order B/C/D/A. And the ROM uses raw rank for the fly-in idx but the rotated LUT
   [1,2,3,0] for difficulty — the replica routes one rank into both.

3. **Missing launcher cadence + runtime stream.** No c_25A2 -> 0x7E/0x7F byte stream,
   no one-byte-per-frame walk, no `frame & 7` beat (replica uses step x stagger
   delays), no inter-wave gate (all-landed + 2-tick/~1 s game timer), no 12-slot
   in-flight cap, no two-phase `_b_atk_wv_enbl` enable. These fix the whole rhythm
   of a stage opening.

4. **Wrong launch membership/order.** Replica fills flights with contiguous slot
   blocks (bosses first). Real: ATTK_WAV_IDS — wave 1 = center butterflies + center
   bees; the bosses arrive in wave 2 with escort butterflies; lefty/righty halves
   pair slot i with i+8; object IDs map to slots via sprt_fmtn_hpos (48-slot grid
   with 8 phantom slots). All three tables are verbatim in the corpus.

5. **Missing transient members entirely.** Triplet byte0 (count + MSB-first type
   bits), IDs 0x38-0x3E / 0x78-0x7E, random slot placement in the tmp-buffer
   overflow region, fly-through no-home no-bomb lifecycle via the F7 path gate.
   This is why stages 4/6+ feel busier than any replica that ignores byte0.

6. **Wrong bit-6 semantics + missing bit-0 overload.** Bit 6 = variant pair member +
   negate-rotation (mirrored ARCS; start positions are sometimes both top-center,
   32 px apart), not "enter from the other side". Bit 0 also selects the fly-in
   bomb-counter init (0x08 top / 0x44 side).

7. **Missing header semantics.** hdr0 = 0x14 bomb-counter reload; hdr1 =
   per-stage fly-in bomb mask (0x00/0x01/0x03) gated per-creature by the d_2908
   44-bit table. The replica gates entry bombing from its difficulty table instead —
   right effect for stage 1, wrong source, and it has no per-creature dimension and
   no 0x03 double-drop tier.

8. **Formation motion model.** Real: triangle +/-32 px @ 1 px/4 frames during fly-in;
   on completion coast to center, hand off to the bitmap-driven pulse (d_1E64
   verbatim, per-column X AND per-row Y offsets, 0x00-0x1F / 0xA0-0x81 phase
   counter). Replica: continuous simultaneous sinusoids, X-only, no handoff.

9. **Challenge-stage substance.** Replica has the schedule and the safe-bonus-round
   behavior but not the ROM's 8 data rows (section 3.1), not the shared-roster fact
   (its one-type + 4-bosses roster is authored), and its patterns are its own
   geometry rather than PATH_INDEX 6-0x17 wave bytes.

10. **Smaller sequencing deltas.** Splash position/timing (80/40, 144; ~90 frames),
    READY only on mid-stage respawn, stage-clear gate excluding phantom slots,
    twoShip carrying across stages, stage flags unverified by the corpus.

---

## 7. Porting recommendation

Priority order (each step is independently shippable and testable):

1. **Swap the data in `caravans.js` for the real tables** (section 1 bytes,
   both idx tables, challenge tables). Keep the existing `combatStageIndex` — it is
   already byte-exact. Store rows as raw 18-byte arrays (header + triplets + FF) so
   headers and byte0 stop being lossy. Fix the rank mapping (A = raw 3; separate
   fly-in rank from difficulty rank via [1,2,3,0]).
2. **Re-key the fly-in decoder**: bits 0-5 index a 24-entry PATH_INDEX
   (addr + variant); bit 6 = variant pair member + negateRotation; bit 7 gate as-is;
   add the bit-0 bomb-counter init. Port PATH_INDEX + the 12-entry VARIANTS table
   verbatim. Combat stages then need only the six leader paths 0-5 to be faithful.
3. **Adopt the runtime-stream launcher**: build the 0x7E/0x7F stream per stage
   (ATTK_WAV_IDS + tmp[16] pairing), walk it one byte per frame with the frame&7
   gate and the all-landed + ~1 s inter-wave gate. This replaces the step/stagger
   model and deletes the need for per-pair timers.
4. **Add transients** (byte0 honor + fly-through lifecycle) — the biggest visible
   stage-4+ fidelity win after the data swap.
5. **Replace the breathing/sway sinusoids** with the triangle oscillate +
   coast-to-center handoff + d_1E64 bitmap pulse (includes vertical row motion).
6. **Wire the header bomb gates** (hdr1 mask x d_2908 per-creature bit, 0x0E/0x0F
   counter machinery) if fly-in bombing fidelity is wanted.
7. Challenge stages: rebuild from d_challg_stg_dat + PATH_INDEX 6-0x17 with the
   shared 40-ID roster; keep the existing despawn/no-attack behavior.

Everything in steps 1-3 is pure data + a small decoder — no geometry work — because
the corpus's paths.js already contains every table verbatim and the corpus's own
regression evidence (stage-1 stream byte-exact, per-rank caravans distinct,
challenge rows distinct) validates the transcription.

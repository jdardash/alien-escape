# Dissection: attack scheduling, difficulty tables, bombing — corpus vs replica

Corpus: `scratchpad/zanelogi/` (research_attack_paths.md, research_stage_init.md,
research_bonus_bee.md, paths.js, tasks/{launchAttackWave,bomberConfig,bombUpdate,
bulletUpdate,playerFire,playerMove}.js, demos/attack_player.js).
Replica: `c:\Dev\alien-escape\src\systems\attack.js`, `src\systems\difficulty.js`,
`tests\attack.test.js`.

All Z80 references are to the hackbar disassembly labels quoted by the corpus
(new_stage.s, game_ctrl.s, gg1-2_fx.s, gg1-2.s, gg1-3.s, gg1-5.s). Every byte value
below is copied verbatim from the corpus's ports (which it verified byte-for-byte
against the ROM), so this report is self-sufficient.

---

## 1. The real bomber/difficulty configuration

### 1.1 `bmbr_stg_cfg_dat` — the per-stage difficulty table (new_stage.s:143-198)

Dimensions: **4 sub-tables x 26 stages x 5 bytes**. Each 5-byte row packs **10
nibbles** = the 10 parameters. Sub-table stride = 0x82 (130) bytes. Row offset
within a sub-table = `(stage - 1) * 5`.

**This is NOT a 10-column table of frame counts.** The 10 nibbles are mostly
*indices into secondary lookup tables* and small caps/thresholds. There is no
per-type launch-cadence column at all (see 1.3-1.5).

Verbatim bytes (corpus `paths.js` `BMBR_STG_CFG_DAT`, verified against
new_stage.s:143-198). Two stages per line, 5 bytes each:

```
; -- Sub-table 0 (selected by rank value 3; the easiest) --      stages
0x00,0x00,0x22,0xC6,0x00,  0x00,0x11,0x23,0xC7,0x00,   ; 1-2
0x00,0x00,0x00,0xC0,0x00,  0x11,0x12,0x23,0x97,0x00,   ; 3-4
0x11,0x23,0x23,0x98,0x00,  0x21,0x24,0x33,0x98,0x00,   ; 5-6
0x00,0x00,0x00,0x90,0x00,  0x22,0x25,0x33,0x99,0x10,   ; 7-8
0x22,0x36,0x34,0x69,0x10,  0x10,0x11,0x23,0x97,0x00,   ; 9-10
0x00,0x00,0x00,0x60,0x00,  0x32,0x46,0x34,0x67,0x11,   ; 11-12
0x32,0x67,0x44,0x68,0x11,  0x32,0x67,0x45,0x68,0x11,   ; 13-14
0x00,0x00,0x00,0x60,0x00,  0x42,0x78,0x45,0x69,0x11,   ; 15-16
0x42,0x78,0x45,0x69,0x11,  0x11,0x22,0x23,0x97,0x11,   ; 17-18
0x00,0x00,0x00,0x60,0x00,  0x52,0x88,0x46,0x3A,0x11,   ; 19-20
0x52,0x88,0x56,0x3A,0x11,  0x52,0x88,0x56,0x3C,0x11,   ; 21-22
0x00,0x00,0x00,0x30,0x00,  0x62,0x89,0x57,0x3C,0x11,   ; 23-24
0x62,0x99,0x57,0x3C,0x11,  0x62,0x99,0x57,0x3C,0x11,   ; 25-26
; -- Sub-table 1 (selected by rank value 0) --
0x00,0x00,0x12,0xC6,0x00,  0x00,0x11,0x22,0xC6,0x00,
0x00,0x00,0x00,0xC0,0x00,  0x11,0x12,0x23,0x97,0x00,
0x11,0x12,0x23,0x97,0x00,  0x00,0x11,0x23,0xC7,0x00,
0x00,0x00,0x00,0x90,0x00,  0x21,0x23,0x33,0x98,0x10,
0x21,0x24,0x33,0x98,0x10,  0x21,0x25,0x34,0x98,0x10,
0x00,0x00,0x00,0x60,0x00,  0x22,0x25,0x34,0x68,0x11,
0x32,0x36,0x44,0x68,0x11,  0x11,0x11,0x23,0x67,0x01,
0x00,0x00,0x00,0x60,0x00,  0x32,0x36,0x45,0x68,0x11,
0x32,0x46,0x45,0x69,0x11,  0x32,0x67,0x45,0x69,0x11,
0x00,0x00,0x00,0x60,0x00,  0x42,0x67,0x46,0x3A,0x11,
0x42,0x78,0x56,0x3A,0x11,  0x52,0x78,0x56,0x3A,0x11,
0x00,0x00,0x00,0x30,0x00,  0x52,0x88,0x56,0x3C,0x11,
0x62,0x99,0x57,0x3C,0x11,  0x62,0x99,0x57,0x3C,0x11,
; -- Sub-table 2 (selected by rank value 1) --
0x00,0x00,0x23,0xC6,0x00,  0x10,0x11,0x23,0x97,0x00,
0x00,0x00,0x00,0xC0,0x00,  0x11,0x12,0x33,0x98,0x00,
0x21,0x23,0x34,0x68,0x00,  0x21,0x24,0x34,0x68,0x00,
0x00,0x00,0x00,0x90,0x00,  0x32,0x36,0x34,0x67,0x10,
0x32,0x46,0x44,0x68,0x10,  0x11,0x11,0x23,0x97,0x10,
0x00,0x00,0x00,0x60,0x00,  0x42,0x67,0x45,0x68,0x11,
0x42,0x67,0x45,0x69,0x11,  0x42,0x78,0x46,0x69,0x11,
0x00,0x00,0x00,0x60,0x00,  0x52,0x78,0x46,0x3A,0x11,
0x52,0x88,0x56,0x3A,0x11,  0x52,0x88,0x56,0x3A,0x11,
0x00,0x00,0x00,0x60,0x00,  0x62,0x88,0x56,0x3C,0x11,
0x62,0x89,0x57,0x3C,0x11,  0x62,0x89,0x57,0x3E,0x11,
0x00,0x00,0x00,0x30,0x00,  0x72,0x99,0x57,0x3E,0x11,
0x72,0x99,0x68,0x3E,0x11,  0x72,0x99,0x68,0x3E,0x11,
; -- Sub-table 3 (selected by rank value 2; the hardest) --
0x00,0x00,0x23,0xC6,0x00,  0x10,0x11,0x23,0x97,0x00,
0x00,0x00,0x00,0xC0,0x00,  0x11,0x12,0x34,0x98,0x00,
0x21,0x23,0x34,0x68,0x00,  0x21,0x24,0x34,0x68,0x00,
0x00,0x00,0x00,0x90,0x00,  0x32,0x36,0x45,0x67,0x11,
0x32,0x46,0x46,0x68,0x11,  0x32,0x56,0x46,0x69,0x11,
0x00,0x00,0x00,0x60,0x00,  0x42,0x67,0x56,0x6A,0x11,
0x42,0x67,0x56,0x6A,0x11,  0x42,0x78,0x57,0x6A,0x11,
0x00,0x00,0x00,0x60,0x00,  0x52,0x78,0x57,0x3A,0x11,
0x52,0x88,0x57,0x3A,0x11,  0x52,0x88,0x68,0x3C,0x11,
0x00,0x00,0x00,0x60,0x00,  0x62,0x88,0x68,0x3C,0x11,
0x62,0x89,0x68,0x3C,0x11,  0x62,0x89,0x68,0x3E,0x11,
0x00,0x00,0x00,0x30,0x00,  0x72,0x99,0x68,0x3E,0x11,
0x72,0x99,0x68,0x3E,0x11,  0x72,0x99,0x68,0x3E,0x11,
```

Note the all-but-empty rows every 4th stage (`0x00,0x00,0x00,0xC0/0x90/0x60/0x30,0x00`)
— those are the **challenge stages** (3, 7, 11, ...): no attacks, but nibble [6]
(the C/9/6/3 upper nibble of byte 3) still carries a value.

### 1.2 Nibble unpack and parameter meanings (`c_2C00`, new_stage.s:28-119)

`ds_new_stage_parms[i*2] = byte[i] >> 4; ds_new_stage_parms[i*2+1] = byte[i] & 0x0F`.

| Idx | Meaning | Consumed by |
|-----|---------|-------------|
| [0] | bomb-drop enable **row index** into `d_0909` (yields the drop bitmask `b_92C0[8]`) | f_0857 -> c_08BE |
| [1] | **boss** reload row index into `d_0929` | f_0857 -> c_08BE |
| [2] | **red (Goei/butterfly)** reload row index into `d_08CD` | f_0857 -> c_08AD |
| [3] | **yellow (Zako/bee)** reload row index into `d_08EB` | f_0857 -> c_08AD |
| [4] | `max_bombers` — concurrent-attacker cap (initial) | f_1B65 gate |
| [5] | `max_bombers` value **after the 30 s ramp** (copied over [4]) | f_0857 |
| [6] | tractor-beam frames-per-phase (capture animation speed; 0xC on stage 1) | tractorBeam |
| [7] | continuous-bombing threshold: cont_bmb turns on when alive enemies < this | FA-gate / f_0857 |
| [8] | stage-8+ flag: F0 token in fly-in paths jumps to a replacement attack sub-path (first nonzero at stage 8) | F0 handler |
| [9] | stage-12+ flag: EF token jumps to the harder continuous-bombing pass (first nonzero at **stage 12**, not 8) | EF handler |
| [10]| computed, not packed: **clone-attack (bonus-bee) gate** = 0 for stage < 3 and challenge stages, else 0x0A | f_1A80 |

Caveat: research_stage_init.md §12.3 labels [1]=yellow/[2]=red/[3]=boss, but the
later, verified research (research_attack_paths.md §3.3 Phase C, and the working
`bomberConfig.js` port of game_ctrl.s:1426-1436) is **[1]=boss, [2]=red,
[3]=yellow**. Use the latter.

Stage 1, easiest sub-table (row `00 00 22 C6 00`): parms = `[0,0,0,0, 2,2, 0xC,6, 0,0]`,
[10]=0. So: no attack-dive bombs, max 2 concurrent attackers, tractor beam active
(12 frames/phase), cont-bomb at <6 alive. **Capture is NOT stage-gated — it runs
on stage 1.** "Unarmed stage 1" applies to bombs only.

### 1.3 How rank enters: `bmbr_stg_cfg_lut` (new_stage.s:124-128)

The DIP rank value indexes a 4-entry lut whose value picks the sub-table:

```
RANK_TO_SUBTABLE = [1, 2, 3, 0]   ; rank value 0->sub 1, 1->sub 2, 2->sub 3, 3->sub 0
```

So rank value 3 = easiest (sub-table 0), rank 2 = hardest (sub-table 3). This
rotation applies ONLY to the difficulty table. The fly-in caravan index table
(`d_combat_stg_dat_idx`) is indexed by `rank * 17` **directly**, no rotation
(gg1-3.s:1197) — do not conflate.

### 1.4 Stage cycling

`while (stage > 0x1B) stage -= 4` (new_stage.s:30-35) — beyond stage 27 the last
**4** stages (24-27, one of them a challenge row) repeat forever. Not a clamp to
the final row.

> **Correction (2026-08-02, found while re-verifying for fidelity pass 6):** the
> compare is `cp #0x1B / jr c` (new_stage.s:32-33), which exits the loop only when
> the stage is BELOW 0x1B — so the condition is `while (stage >= 0x1B)`, and stage
> 27 itself is adjusted (27 plays 23). The repeating four are stages **23-26**
> (0x17-0x1A), not 24-27. The port's `adjustedStage` (src/systems/difficulty.js:56)
> implements the `>=` form.

### 1.5 Initial launch timers are NOT in the table

`c_2C00` (new_stage.s:100-103) hardcodes `b_92C0[0]=0x16 (boss), [1]=0x02 (red),
[2]=0x02 (yellow)` — in **16-frame ticks**, identical for every stage and rank.
So: red dives first (~0.53 s), yellow immediately after, boss at ~5.9 s. All
subsequent cadence comes from the **reload values** `b_92C0[4..6]`, recomputed
*every frame* by f_0857 (below).

### 1.6 The reload lookup tables (game_ctrl.s:1503-1539) — the actual difficulty engine

`f_0857` (game_ctrl.s:1386-1438) runs every frame:

1. **Ramp:** once `ds4_game_tmrs[2] < 0x3C` (timer starts at 0x78 = 120, decremented
   at 2 Hz -> threshold crossed 30 s into the stage), copy `parms[5] -> parms[4]`
   (max-bombers bump).
2. **Bomb flags:** `b_92C0[8] = c_08BE(d_0909, parms[0], bugs_actv)`.
3. If `cont_bmb_flag`: memset all three reloads to **2** ticks (rapid fire) and return.
4. Else: `boss = c_08BE(d_0929, parms[1], bugs)`, `red = c_08AD(d_08CD, parms[2],
   tmr2)`, `yellow = c_08AD(d_08EB, parms[3], tmr2)`.

`c_08AD` (game_ctrl.s:1451-1468): row = param*3; column by **elapsed stage time**:
`tmr2 >= 0x28` -> col 0, `0 < tmr2 < 0x28` -> col 1, `tmr2 == 0` -> col 2.
`c_08BE` (game_ctrl.s:1482-1499): row = param*4; column = `floor(bugs/10)` (0-4;
col 4 deliberately overflows into the next row's first byte — keep flat indexing).

Verbatim values (units = 16-frame ticks):

```
d_08CD (RED reload, 10 rows x 3):        d_08EB (YELLOW reload, 10 rows x 3):
row0: 09 07 05                            06 05 04
row1: 08 06 04                            05 04 03
row2: 07 05 04                            05 03 03
row3: 06 04 03                            04 03 02
row4: 05 03 03                            04 02 02
row5: 04 03 03                            03 03 02
row6: 04 02 02                            03 02 01
row7: 03 03 02                            02 02 01
row8: 03 02 02                            02 01 01
row9: 02 02 02                            01 01 01

d_0909 (bomb-drop enable bitmask, 8 rows x 4, col = bugs/10):
row0: 03 03 01 01
row1: 03 03 03 01
row2: 07 03 03 01
row3: 07 03 03 03
row4: 07 07 03 03
row5: 0F 07 03 03
row6: 0F 07 07 03
row7: 0F 07 07 07

d_0929 (BOSS reload, 3 rows x 4, col = bugs/10, at d_0909 + 0x20):
row0: 06 0A 0F 0F
row1: 04 08 0D 0D
row2: 04 06 0A 0A
```

Net effect: attack cadence tightens **within a stage** on two live inputs — the
count of remaining bugs (fewer bugs -> lower column for boss, more bomb bits) and
elapsed stage time (later -> faster red/yellow). This is Galaga's "the longer you
camp, the harder it gets", and it is entirely absent from any static-per-stage
scheme.

---

## 2. The real attack-wave launcher (`f_1B65`, gg1-2_fx.s:857-970)

Per-frame flow:

1. **Guards** (858-869): need `glbl_enemy_enbl`, the player-fire task active
   (`task_actv[0x15]`), and NO destroyed-capture-boss rescue running
   (`task_actv[0x1D]`). Attacks pause while the rescue animation plays.
2. **Boss pool drain** (872-921): `bmbr_boss_pool` (4 x 3-byte slots) is checked
   FIRST, every frame. If any slot holds an object, launch it (one per frame) and
   return — **this bypasses both the 16-frame gate and the max-bombers cap**. It
   is how a boss + 1-2 wingmen peel off staggered by one frame each, and why
   yellow/red dispatch visibly pauses while a squad launches.
3. **16-frame gate**: per-type dispatch only when `frame_cnt & 0x0F == 0`.
4. **Per-type timers** `b_92C0[0..2]`, iterated `[boss, red, yellow]` in a djnz
   loop that decrements only the FIRST non-zero timer per tick and early-exits.
   (Not "dec all three" — under max-bombers pressure this keeps red/yellow
   frozen while boss oscillates, i.e. it is load-bearing for fairness.)
5. **Max-bombers gate** (935-945): if `bugs_flying >= parms[4]`, set the expired
   timer back to **1** (re-check next tick) and return.
6. **Reload-then-dispatch** (947-965): `b_92C0[n] = b_92C0[n+4]` BEFORE the
   type handler runs — a no-candidate attempt still consumes a full reload cycle.

### 2.1 Attacker selection (which formation slot)

- **Yellow** (`case_bmbr_yellow`, 973-1001): scan `b_8800[0x08..0x2E]` (20 bees)
  ascending by object index, skip the reserved bonus-bee object, launch the FIRST
  standby. Object indexing is edge-paired (x0=left-edge, x2=right-edge, working
  inward), so the ascending scan alternates left/right edges toward the center.
- **Red** (1004-1008): same, over `b_8800[0x40..0x5E]` (16 moths).
- **Boss** (1011-1043): only `0x30..0x36` (the 4 bosses). `0x00-0x06` are
  captured-ship/rogue slots, NOT bosses.

### 2.2 Boss: capture vs escort

- A toggle (`_b_bmbr_boss_wingm`) makes **every other** boss launch a capture
  mission, gated by `_b_bmbr_boss_cflag` (one capture at a time — the flag holds
  as long as a ship is held). Capture turn: first standby boss queued SOLO on the
  capture-dive path `db_0454` (aim over player via F4, halt `00 FC FF` segment,
  open beam).
- Otherwise: **escort sortie** on `db_flv_0411` — boss + up to 2 wingmen chosen
  from the 3 butterflies in the boss's column window (d_1D2C: cols 7,6,5,4,3,2 =
  objects 0x4A,0x52,0x5A,0x58,0x50,0x48). Selection passes: first boss with >= 2
  available escorts, else >= 1, else any boss solo. All members are queued into
  `bmbr_boss_pool` (boss slot 0, leads) and fly the boss path with the boss's
  mirror flag so the squad sweeps together. A boss already holding a captured
  ship dives as an escort *bringing the ship* — the rescue chance.
- Not a difficulty-table flag: capture cadence is structural (every other boss
  launch), from stage 1.

### 2.3 Paths, mirroring, and per-dive gates

- One attack path table per type: `db_flv_atk_yllw` (90 bytes, 6 sub-paths),
  `db_flv_atk_red` (104 bytes, 4 sub-paths), boss region 0x40C-0x46A (home tail +
  escort sortie + rogue + capture dive) + `db_flv_cboss` carry-home. Sub-paths are
  wired by jump tokens: FA (loop-top, gated), FD (unconditional jump), EF
  (stage-12 gate), F0 (stage-8 gate, fly-in paths).
- **Mirroring**: at attack launch `c_1083` (gg1-2.s:206-216) recomputes the
  negate-rotation flag from `objectId & 0x02` (left pair member = 0, right = 1),
  so each launch pairs into mirrored arcs. (Fly-in mirroring instead comes from
  wave-byte bit 6.) Launch heading = 0x100 (straight down, 90 deg).
- **Targeting**: moth-only token F3 reads live player X, buckets
  `clamp((playerX-mothX)/4 + 0x18, 0, 0x2F)/6` into an 8-byte LUT of turn-HOLD
  durations — the dive hooks toward the ship. The bee has no targeting (fixed
  arc + FC dive-to-Y trigger); the boss capture dive uses F4 (clamp player X to
  lane [25,185] canvas, point down-at-ship, arm captor monitor).
- **Per-dive outcome gates**: FA jumps to the FB home-tail when
  `cont_bmb_flag` is false (normal play: one dive, then return to formation);
  when true (alive < parms[7] AND fire active) the diver loops its attack pass
  forever, re-arming bombs via F6 each lap. EF escalates to the harder pass only
  when parms[9] != 0 (stage 12+).
- **Stage-8 change**: parms[8] != 0 flips the F0 token in the six token-bearing
  *fly-in* paths to jump into replacement sub-paths (p_flv_005e/0097/00cc/0173/
  01a8/01e0), altering entrance behavior — this is the real "stage 8 switch",
  and it modifies paths, not reload vectors.

---

## 3. The bombing model

### 3.1 Arming (attack dives)

`j_108A` (gg1-2.s:314-323) arms **every** diving enemy at launch:
`0x0E (drop counter) = 0x1E` (30 frames), `0x0F (enable mask) = b_92C0[8]`
(the d_0909 lookup — stage 1 has it 0; a typical armed stage carries 0x01/0x03,
late-table rows up to 0x0F = 4 bombs). F6 (free-flight token) merely RE-arms the
same fields inside the continuous-bombing loop.

### 3.2 Drop (`case_0DF5`, gg1-5.s:2345+)

Every frame, for every flying enemy: `dec 0x0E`; at 0, reload `0x0E` from
`b_92E2[0]` (= 0x14 = 20 frames) and `srl 0x0F` — the bomber drops iff the
shifted-out bit was 1 AND it is low enough (`sprite_Y >= 152`; the corpus's two
files convert this to canvas >= 112 and >= 120 — the offset convention shifted
mid-project; use their final `bombUpdate.js` value 120 with corner->center
conversion, or re-derive) AND fire is active. The Z80 consumes bits regardless
of height (a set bit is wasted while high); the corpus flags its own "hold the
set bit until low" tweak as a deviation compensating for a slightly slower dive
descent. So: an attacker drops (count of set bits) bombs per dive, spaced 20
frames, only in the lower playfield.

### 3.3 Aim — a real frozen aimed shot, NOT an aim band

At drop (gg1-5.s:2402-2457, divide `c_0EAA` @ 2649, mover `f_1EA4` @
gg1-2_fx.s:1737):

```
dX    = fighter.x - bomber.x              (full scale, sign stashed)
dY    = (298>>1) - (bomber.sprite_Y>>1)   (HALVED - deliberate 2x over-aim)
slope = (dX << 8) / dY                    (8.8 fixed)
rate  = clamp(0x60, slope * 5/16), re-signed; bomb X advances rate/32 px/frame
Y advances 2/3 px alternating by frame parity (~2.5 px/frame avg)
```

Canvas form: `vx = clamp(+-3.0, 5.0 * dx/dy)` px/frame, frozen at drop. The 5.0
gain is 2x the perfect intercept — the bomb crosses the player's column partway
down; dodging works because the vector is frozen (aimed where you were).

### 3.4 Bomb pool and fly-in bombing

- Bomb buffer: **8 pre-allocated slots** (corpus state.js `bombs: 8 x {x,y,vx,alive}`,
  matching the Z80 per-bomb `b_92B0` rate/remainder pairs); first-free allocation;
  despawn off the bottom. Bomb vs ship AABB ~ |dx|<6, |dy|<4.
- **Fly-in bombing (stage 2+) is a separate arming path**: enable mask from
  `b_92E2[1]` (the 2nd header byte of the stage's caravan row in
  `d_combat_stg_dat` — 0x00 on stage 1 and all challenge rows, 0x01 rising to
  0x03 on the hard rows), gated per-object by sprite-code bit 7 packed from the
  44-bit table `d_2908 = A5 5A A9 0F 0A 50` (one bit per roster creature).
- **Counter init 0x08 vs 0x44**: the fly-in drop counter `0x0E` is initialized
  from **wave-byte bit 0** — `0x08` for top-entry bugs, `0x44` for side-entry
  (gg1-3.s:1827-1834). (Attack dives always start at 0x1E.) After the first
  expiry both share the 0x14 reload. Transients force mask 0 — they never bomb.

---

## 4. Player fire / movement facts (for cross-checking)

- **Bullets**: 2 simultaneous max (hardcoded 2-slot scan, gg1-2_fx.s:1873-1884);
  edge-triggered fire (no autorepeat); spawn at the ship's exact position;
  6 px/frame straight up; despawn at sprite_Y < 40 (canvas < 8 — top edge);
  hit AABB |dx| < 6, |dy| <= 3. Bullet motion runs on CPU1 → 1-frame spawn lag.
- **Ship movement**: alternating 1/2 px per held frame (avg 1.5 px/frame; the
  toggle resets to the 1-px step on a fresh press); limits sprite 0x12..0xE1 =
  canvas centers 9..216; pre-move boundary check, not post-move clamp.
- Bomb Y speed 2/3 alternating; player is only hittable when not beam-locked.

---

## 5. Gap list — replica `attack.js` + `difficulty.js` vs the real machine

Ranked by severity. (The replica: authored 4x26x10 table `[zakoLaunchFrames,
goeiLaunchFrames, bossLaunchFrames, maxActiveBombers, bomberRampFrames,
continuousBombs, reloadZakoFrames, reloadEscortFrames, cloneAttackCount, flags]`,
ms countdowns, stage-8 reload-vector switch, every-6th-zako transform, aim-band
bombing.)

1. **Wrong table semantics (structural).** The real row has NO launch-cadence or
   reload-frames columns. Cadence = fixed initial timers (0x16/2/2 ticks,
   boss/red/yellow, all stages) + reload values recomputed EVERY FRAME from
   4 secondary tables keyed on the row's nibble indices x live bug count x
   elapsed stage time. Our zako/goei/boss LaunchFrames, reloadZako/EscortFrames
   columns and the "reload vectors take over at stage 8" rule are all invented;
   the real stage-8 switch (parms[8]) swaps fly-in path sub-paths (F0 token),
   and the real stage-12 switch (parms[9]) swaps the dive's bombing pass (EF).
2. **All values wrong / now available.** The genuine 520 bytes of
   `bmbr_stg_cfg_dat` plus d_08CD/d_08EB/d_0909/d_0929 are in section 1 verbatim.
   Nothing needs to stay authored.
3. **Dynamic difficulty missing.** No dependence on remaining-bug count
   (c_08BE col = bugs/10) or elapsed stage time (c_08AD col via game_tmrs[2],
   2 Hz countdown from 0x78) anywhere in the replica. This is the core feel
   ("the longer you live, the harder it gets") and also drives bomb-mask growth
   as the board thins.
4. **Continuous-bombing endgame missing / mis-modeled.** Real cont_bmb: when
   alive < parms[7] AND fire active, all reloads memset to 2 ticks AND divers
   stop returning to formation (FA falls through -> infinite re-dive loops with
   F6 re-arms). Our `continuousBombs` column ("bombsLeft per attacker") models
   none of this; the bombs-per-dive count actually comes from the d_0909 bitmask.
5. **Scheduler mechanics wrong.** Real: 16-frame tick; single-dec djnz over
   [boss, red, yellow]; max-active gate sets the expired timer to 1 (freezing
   the other types); reload happens BEFORE dispatch even when no candidate
   exists; at most ONE launch per tick. Ours: per-frame ms decrement of all
   three, several launches in one advance, expired counters held at 0 until the
   air clears (the real machine only holds via the =1 trick under the cap;
   a no-candidate expiry burns a whole reload). The corpus explicitly documents
   ("Phase C bugfix") that flattening the djnz loop into dec-all starves yellow.
6. **No slot selection / squad structure.** Replica launches "a type"; real
   picks the first-standby ascending object index (edge-pairs inward), skips the
   bonus-bee object, and the boss alternates capture-solo vs escort sorties with
   wingmen from its column window, queued through a 4-slot pool that drains one
   per frame and BYPASSES both the tick gate and the max-active cap.
7. **Ramp semantics off.** Real ramp: at fixed 30 s (game_tmrs[2] < 0x3C), cap
   goes from parms[4] to parms[5] (often equal = no ramp; stage 1 is 2->2).
   Ours: per-row ramp duration column with an unconditional +1.
8. **Transform trigger wrong.** Real "clone attack"/bonus-bee: armed only when
   parms[10] != 0 (stage >= 3-4 combat stages) AND alive-bug count drops BELOW
   0x0A; then one bee flashes for 0xC0 frames and launches an X3 convoy — one
   per stage, gated by board state, not "every 6th zako launch". Our authored
   `TRANSFORM_EVERY_NTH_ZAKO = 6` and per-row cloneAttackCount column have no
   ROM counterpart (the count parameter is the arming threshold 0x0A, constant).
9. **Flags column is invented.** FLAG_BOMBS is real only as parms[0]=0 vs !=0
   (via d_0909). FLAG_CAPTURE does not exist — capture is unconditional from
   stage 1 (parms[6] is beam animation speed, 0xC). FLAG_ENTRY_BOMBS lives in a
   different table entirely (caravan header `b_92E2[1]` + the d_2908 per-object
   bit), so it is per-caravan-row, not per-difficulty-row. Consequence in our
   table: rank A/B stage 1 with flags=0 wrongly disables tractor beams on the
   opening stage.
10. **Rank/stage indexing.** Real rank enters through the lut [1,2,3,0]
    (rank value 3 = easiest) and stages past 27 cycle the last FOUR rows
    (including a challenge row) rather than clamping to the last row. Also the
    guards (fire-task active, rescue-in-progress pause) and the bomb model
    (frozen aimed vector, 20-frame spacing, low-half gate) have no replica
    counterparts; ours uses an aim band |x-player|<60 which the ROM never does.
11. **Bombing model wrong (see 3.1-3.3).** Armed at launch with counter 0x1E and
    the d_0909 bitmask; drop spacing 0x14; drop only low + fire active; aim
    `vx = clamp(+-3, 5*dx/dy)` frozen at drop. The 8-bomb pool is the one thing
    the replica already matches.

The no-fire lockup switch (attack.js NO_FIRE_*) has no basis in this corpus —
the corpus never mentions a 15-minute no-fire bug; keep it flagged as lore-based,
not ROM-derived. Note the real cont_bmb gate does require the fire task active,
which is the mechanism the folklore trick exploits, but no timer appears here.

## 6. Porting recommendation

Replace, don't patch:

1. **difficulty.js** -> port `BMBR_STG_CFG_DAT` (520 bytes above) + the nibble
   unpack + `RANK_TO_SUBTABLE = [1,2,3,0]` + the stage-cycling `-4` loop, and the
   four lookup tables + `c_08AD`/`c_08BE` exactly as in corpus `paths.js`
   (lines 724-952) — they are already clean JS. Expose a per-frame
   `bomberConfig(state)` (port of f_0857) computing `{bossReload, redReload,
   yellowReload, bombDropFlags, maxBombers}` from `{parms, aliveBugs,
   stageTimer2Hz, contBmb}`. Keep the 2 Hz `game_tmrs[2]` countdown from 0x78.
2. **attack.js** -> restructure the scheduler to f_1B65: 16-frame tick, djnz
   single-dec order [boss,red,yellow], cap-gate sets timer=1, reload-before-
   dispatch, one launch per tick; add the 4-slot boss pool (drains 1/frame,
   bypasses gates), the capture toggle, escort window selection, and first-
   standby-ascending slot scans. Initial timers 0x16/2/2 ticks, constant.
3. Bombing: arm at launch (0x1E + mask), 0x14 spacing, low-half + fire gate,
   frozen aim `clamp(+-3, 5*dx/dy)`; drop the aim band. Keep the 8-slot pool.
4. Replace the transform-every-6th rule with the f_1A80 bonus-bee manager
   (gate parms[10], arm below 10 alive, 0xC0-frame flash, one per stage).
5. Reroute "entry bombs" to the caravan-row header (`b_92E2[1]`) + `d_2908`
   per-object bits; delete FLAG_CAPTURE (capture always on) and re-purpose
   parms[6] as beam speed.

Files: corpus ports worth lifting nearly verbatim are
`zanelogi/paths.js:724-952` (tables + lookups), `zanelogi/tasks/bomberConfig.js`
(f_0857), `zanelogi/tasks/launchAttackWave.js:255-495` (f_1B65 + boss pool),
`zanelogi/tasks/bombUpdate.js` (case_0DF5 + f_1EA4).

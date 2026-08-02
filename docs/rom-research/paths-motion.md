# Galaga ROM path/motion dissection vs alien-escape replica

Corpus: `scratchpad/zanelogi/` (paths.js, bugMotion.js, pathrunner.js, pathbuilder.js,
pathasm.js, objectStates.js, research_motion_model.md, research_coordinate_system.md,
research_path_data.md, demos). Replica: `C:\Dev\alien-escape\src\systems\pathcode.js`,
`src\systems\paths.js`, `src\systems\flight.js`.

This report is self-sufficient: every byte value cited from the corpus is copied in
verbatim (section 2). All Z80 citations are hackbar_galaga `gg1-5.s` / `gg1-3.s` /
`gg1-2.s` line numbers as recorded by the corpus.

---

## 1. The ROM's real path/motion model

### 1.1 Per-enemy motion slot (bug_motion_que, 12 slots x 0x14 bytes)

| Offset | Field |
|--------|-------|
| 0x00/0x01 | Y position: low byte = fraction, high byte = rawY (renderer input). 16-bit fixed point. |
| 0x02/0x03 | X position: fraction / rawX. |
| 0x04/0x05 | Angle low / high. 10-bit angle = (b05 & 3) << 8 \| b04. Init: low = 0, high = variant rotHi. |
| 0x06/0x07 | Home Y / home X (set by FB; FC reuses 0x06 as the dive-Y reference). |
| 0x08/0x09 | Path pointer (high byte masked & 0x1F). |
| 0x0A/0x0B | vx / vy (segment byte 0 nibbles, unsigned). |
| 0x0C | rotRate (segment byte 1, negated if flag bit 7). |
| 0x0D | Segment timer (counts down; 0 -> load next). |
| 0x0E | Bomb-drop counter (init 0x08 or 0x44 from wave-byte bit 0; F6/attack-launch set 0x1E). |
| 0x0F | Bomb-drop enable bitmask (b_92E2[1] / b_92C0[8]). |
| 0x10 | Object ID (formation slot, even 0x00-0x5E; transients 0x38-0x3E). |
| 0x11/0x12 | X/Y step (set by FB for homing). |
| 0x13 | Flags: bit0 active, bit5 FC dive armed, bit6 homing check, bit7 **negate-rotation**. |

### 1.2 Segment encoding (byte < 0xEF): 3 bytes

```
byte 0:  (vy << 4) | vx        both UNSIGNED nibbles 0-15 (Z80 `and 0x0F`, no sign)
byte 1:  rotRate               SIGNED 8-bit (-128..+127); NEGATED when flag bit 7 set
byte 2:  duration              frames, 0-255 (0 wraps: dec 0->0xFF = ~255 frames)
```
Direction comes only from the angle; the nibbles are per-axis magnitudes. A byte0
of 0x00 with rot != 0 is a pure in-place spin (used in the bonus paths, e.g.
`00 40 08` = half-revolution spin over 8 frames).

### 1.3 Per-frame interpreter cycle (f_08D3, gg1-5.s:1422-2270)

Per active slot, per 60.6 Hz frame:

1. `segTimer--`. If it hit 0: read byte at path pointer. `>= 0xEF` -> token dispatch
   (jump table d_0920); else load segment (advance pointer 3, set vx/vy/rot/timer).
2. `angle = (angle + rotRate) & 0x3FF` (10-bit, **1024 units per turn**).
3. Sprite frame recomputed from angle (see 1.7).
4. If flag bit 6 (homing): compare (rawY, rawX) to (homeY, homeX); within +/-1 raw
   (= +/-2 canvas px) -> snap to formation (l_0E08).
5. Motion: choose magnitude by **frame parity** — odd frame `A = vx`, even frame
   `A = vy` (gg1-5.s:2150-2157). Both axes move every frame.

**Angle convention** (gg1-5.s:2174-2178): 0 = right, 256 (90 deg) = canvas-UP,
512 = left, 768 = canvas-down. Counter-clockwise-positive in screen terms. Canvas
equivalent of the motion step:

```js
A = (frame & 1) ? vx : vy;
x += A * cos(angle * 2PI/1024);
y -= A * sin(angle * 2PI/1024);   // canvas Y inverted vs Z80 internal Y
```

**Caveat — the Z80 is NOT circular, it is an octant scheme** (research_motion_model.md,
verified gg1-5.s:2150-2270, deliberately deferred even in the corpus clone):
- Primary axis = the one nearer the heading (XOR of angle bits 7/8 selects Y vs X);
  it receives the **full** `A` (`position += A << 7` on the fixed-point coord).
- Secondary axis receives `A * L` via the c_0E97 multiply, where L = within-quadrant
  angle fraction folded to the nearer axis (0-127).
- Net effect: speed is `A` axis-aligned and grows toward ~`A*sqrt(2)` at 45 deg.
  The circular stand-in (`A*cos, A*sin`) is up to ~30-40% slow on diagonals; symptoms:
  fly-in too slow, launched bugs bunch up. The corpus's own bugMotion.js header comment
  claiming the two-step trick "nets to cos/sin" is flagged WRONG by its research doc.

Effective average speed of a segment is (vx+vy)/2 px/frame in the circular model
(e.g. byte0 0x23 -> vx 3, vy 2 -> ~2.5 px/frame; 0x44 -> 4; 0x66 -> 6), slightly more
on diagonals under the true octant model.

### 1.4 Coordinate transforms

Internal 16-bit fixed-point; high byte (rawX/rawY) feeds the renderer. rawY is
UP-positive (bigger rawY = higher on screen). Hardware canvas is 224 x 288.

```
sprite_X = rawX * 2                          (rla shift, gg1-5.s:2287-2299)
sprite_Y = ((~(rawY + 0x4F)) & 0xFF) * 2 + 1 (cpl chain, gg1-5.s:2305-2321; 9-bit — bit 8 in sprite_ctrl)
canvas_X = sprite_X - 9      (galagino corner offset -16, +8 center-draw, -1 nudge)
canvas_Y = sprite_Y + 256*bit8 - 32          (corner -40, +8 center-draw)
```

Corpus helpers: `rawXToCanvasX(raw) = raw*2 - 9`;
`rawYToCanvasY(raw) = ((~(raw + 0x4F)) & 0xFF)*2 + 1 - 32`.
Worked: variant 0 (rawY 0x9B, rawX 0x34) -> canvas (95, 11); variant 2 (0x23, 0x00)
-> (-9, 251); player rests at canvas y = 265. Homing threshold: Z80 +/-1 raw
== exactly +/-2 canvas px (the *2 render doubling). Despawn margins used for
fly-through/transients: y > 304, x < -24, x > 248.

### 1.5 Token opcodes (byte >= 0xEF; jump table d_0920, gg1-5.s:1494-1511)

No call stack. Every "jump" REPLACES the path pointer; the new stream runs to its
own FF/FB. Address args are absolute Z80 addresses, little-endian; region arrays
resolve them as `offset = addr - z80Base`; fly-in F0/F7 targets live outside the
block and are resolved via a per-path `subPaths` map. An out-of-region FD/FA target
(bonus-bee convoy home-tails -> 0x358/0x363/0x39E) is treated as TURN_HOME.

| Op | Name (Z80 case) | Args | Exact semantics |
|----|-----------------|------|-----------------|
| 0xFF | END (case_0E49, :2517) | 0 | Deactivate: 0x13=0, b_8800[id]=0x80, sprite hidden. Challenge fly-throughs, F7 transients and bonus-bee clones exit here (GONE, not homed). Combat fly-ins always FB first; their trailing FF is defensive. |
| 0xFE | Player-region turn-hold (case_0B16, :1849) | 8-byte LUT (advances 9) | Transient-swoop targeting. shipX = player sprite X (canvas x + 9); targetX = (negate ? shipX : 0xF2 - shipX) + 0x0E; idx = floor(targetX / 0x1E), clamped [1,8]; segTimer = path[token + idx] (= LUT[idx-1] — the missing +1 is intentional). Keeps current vx/vy/rot (holds the running turn); RETURNS without loading a segment. |
| 0xFD | JUMP (case_0B46, :1885) | 2 (addr) | Unconditional pointer replace. |
| 0xFC | DIVE origin-Y (case_0B4E, :1896) | 1 (raw screen-Y) | Store arg in 0x06, set flag bit 5, **skip-load**: keep current vx/vy/rot, leave timer 0 -> wraps to ~255 frames of diving. Each frame (l_0C2D, :2056) once Y reaches the reference: segTimer = 1 (expire next frame), clear bit 5. Persists across segments until reached. |
| 0xFB | TURN_HOME (case_0AA0, :1768-1846) | 0 | See 1.6. |
| 0xFA | LOOP_TOP (case_0BD1, :1984) | 2 (addr) | Conditional: if (cont_bmb && !task_actv[0x1D]) skip the 2 addr bytes (keep diving/bombing); else jump (target is the go-home tail ending FB). cont_bmb = alive enemies < newStageParms[7] && fire task active. |
| 0xF9 | REENTER_COLUMN (case_0B5F, :1907) | 0 | X := home-column coordinate (re-enter aligned over the slot). Keeps vx/vy/rot. |
| 0xF8 | REENTER_TOP (case_0B87, :1929) | 0 | Y := rawY 0x9C (canvas y = 9, top edge). ("tractor beam" .dw comment in disassembly is a mislabel.) |
| 0xF7 | ATTACK_TURN (case_0B98, :1947) | 2 (addr) | Gate: (objId & 0x38) == 0x38 (transient caravan members only) -> pointer-replace to the swoop sub-path (FE + FF despawn). Formation bugs skip 3 bytes. |
| 0xF6 | FREE_FLIGHT (case_0BA8, :1963) | 1 (heading) | (1) angle := arg << 2 (10-bit); mirrored member: arg' = -(arg + 0x80) mod 256 first. (2) bombCounter 0x0E := 0x1E. (3) bombEnable 0x0F := per-stage mask b_92C0[8]. Keeps vx/vy/rot. Args seen: 0xC0 (=768, straight down), 0xB0, 0xAB. |
| 0xF5 | SET_STATUS3 (case_0942) | 0 | Disposition b_8800[id] := 3; continue. |
| 0xF4 | CAPTURE-AIM (case_0A53, :1724) | 0 | Capture boss: clamp player sprite X to [0x29,0xC9] (canvas [32,192]); aim heading (c_0E5B atan2) down-toward (targetX, dive depth raw 0x48); arm capture monitor task 0x19 (f_21CB). |
| 0xF3 | BREAK_TARGETED (case_0A01, :1661-1715) | 8-byte LUT (advances 9) | Red-moth targeting. NOT a jump. px = clamp(playerSpriteX, 0x1E, 0xD1); a = (px>>1) - rawX_of_moth; a >>= 1 (signed; net (playerX - mothX)/4); if negate a = -a; a += 0x18; clamp [0,0x2F]; idx = a/6 (0-7); segTimer = LUT[idx]. Keeps vx/vy/rot (holds the turn the previous segment started — longer hold = bigger hook toward the player). |
| 0xF2 | BONUS_SPLIT (case_097B, :1564-1633) | 2 (addr) | Convoy leader spawns a clone into a free transient slot 0x38-0x3E (copies position/vel/angle/color, rot=0, inherits negate flag, same region array at the embedded sub-offset). Leader continues past the token. No free slot -> nothing. |
| 0xF1 | DIVE_HOME (case_0968, :1551) | 0 | rawY := home-row rawY + 0x20 — because rawY is inverted this is ~64 canvas px ABOVE the top edge (boss re-entry from above; corpus approximates canvas homeY - 0x40). |
| 0xF0 | ATTACK_WAVE (case_0955, :1529) | 2 (addr) | Gate: newStageParms[8] != 0 (stage >= 8) -> pointer-replace to the stage-8 sub-path (dive + FB). Else skip 3 bytes (byte-identical skip on stages 1-7). |
| 0xEF | BOMB_MODE (case_094E, :1523) | 2 (addr) | Gate: newStageParms[9] != 0 (first nonzero at stage 12, rank 3) -> jump to the harder continuous pass; else skip 3 bytes. |

### 1.6 FB TURN_HOME — the real homing algorithm (case_0AA0)

FB does NOT snap:
1. Disposition := 9. Read the object's formation slot (sprt_fmtn_hpos[objId]) and
   its pixel coords; store home into 0x06/0x07 and X/Y steps into 0x11/0x12.
2. Compute the angle from current position to home via c_0E5B (fixed-point atan2:
   quadrant flags + min(|dx|,|dy|) numerator + 8-bit divide c_0EAA). Store into
   0x04/0x05. Canvas form: `theta = atan2(-(homeY - y), homeX - x)`.
3. rotRate for the glide is 0; the **glide speed comes from the segment after FB**
   — the Z80 falls through, incs past FB and loads the next 3 bytes normally
   (tails are `23 00 FF` = vx3/vy2, or `44 00 FF` = 4/4 on 00D4/017B + F0 subs,
   `12 00 FF` on attack tails = 1/2).
4. Set flag bit 6. Every subsequent frame the motion loop compares position to home;
   within +/-1 raw (+/-2 canvas px) both axes -> snap into formation.
5. The home target tracks the LIVE oscillating formation slot: case_2422
   (gg1-3.s:826-848) re-syncs the per-bug offset to ds_hpos_loc_offs each frame and
   the motion adds it (gg1-5.s:2297/2326) — the bug glides onto the drifting grid.
   If the bug launches degenerate-close, snap immediately.

### 1.7 Sprite frame from angle (gg1-5.s:2104-2148)

8 frames per enemy: 0-5 directional (~15 deg steps within a quadrant), 6 vertical
wings-open, 7 vertical wings-closed (formation flap only). Base art faces up-left
(quadrant 1); other quadrants reuse frames with hardware flips.

```
quadrant = (angle10 >> 8) & 3
low      = angle10 & 0xFF
if (quadrant odd) low = ~low & 0xFF      // mirror direction within quadrant
frame    = (low >= 235) ? 6 : (((low * 3) >> 2) >> 5) & 7   // Z80: A+21 carry test; 3A/4 upper 3 bits
flipX    = quadrant 2 or 3               // vertical mirror
flipY    = quadrant 0 or 3               // horizontal mirror
```

In formation the sprite alternates frames 6/7 at ~2 Hz: `6 + ((frameCount >> 5) & 1)`
(case_2488). During flight the frame MUST come from the live angle, not time.

### 1.8 Launch seeding

- **Fly-in** (wave-byte driven): position = VARIANTS row (rawX/rawY -> canvas), angle
  = rotHi << 8, vx=vy=rot=0, segTimer=0 (first segment loads on tick 0).
- **Wave byte** (gg1-3.s:1450-1458 + decoder :1718-1894): bits 0-5 = PATH_INDEX entry
  (0-0x17); bit 6 = pair-member selector (VARIANTS[2N] vs [2N+1]) AND the
  negate-rotation flag (0x13 bit 7 — every loaded rotRate is `neg`'d, gg1-5.s:2014-2018,
  producing the mirrored wishbone arcs); bit 7 = launch gate (clear -> wait for
  frame & 7 == 0; set -> fire immediately); bit 0 double-read as bomb-counter init
  (0 -> 0x08 top entrant, 1 -> 0x44 side entrant).
- **Attack dive** (j_108A, gg1-2.s:243-244, 314-323): start at the enemy's live
  formation position; angle seed = 0x0100 (pointing 90 deg); negateRotation is
  RECOMPUTED from objectId bit 1 (escorts inherit the boss's flag instead); bomb
  counter 0x0E := 0x1E and enable 0x0F := b_92C0[8] at EVERY attack launch (normal
  dives bomb, not just continuous mode).

---

## 2. THE DATA (verbatim from the corpus extraction)

### 2.1 db_2A3C — 24-entry pointer index (gg1-3.s:1918)

Each .dw entry = (addr low 13 bits) | (variant << 13). Entries 22/23 reuse blocks
0x022B/0x025D with different variants.

| idx | addr | variant | | idx | addr | variant |
|----|------|---------|-|----|------|---------|
| 0 | 0x001D | 0 | | 12 | 0x025D | 4 |
| 1 | 0x0067 | 1 | | 13 | 0x0279 | 1 |
| 2 | 0x009F | 2 | | 14 | 0x029E | 0 |
| 3 | 0x00D4 | 1 | | 15 | 0x02BA | 1 |
| 4 | 0x017B | 0 | | 16 | 0x02D9 | 0 |
| 5 | 0x01B0 | 3 | | 17 | 0x02FB | 1 |
| 6 | 0x01E8 | 0 | | 18 | 0x031D | 0 |
| 7 | 0x01F5 | 1 | | 19 | 0x0333 | 1 |
| 8 | 0x020B | 0 | | 20 | 0x0FDA | 0 |
| 9 | 0x021B | 1 | | 21 | 0x0FF0 | 1 |
| 10 | 0x022B | 4 | | 22 | 0x022B | 5 |
| 11 | 0x0241 | 1 | | 23 | 0x025D | 5 |

Indices 0-5: the six token-bearing combat fly-in leaders (D_COMBAT_STG_DAT only ever
selects these). Indices 6-23: token-free fly-through blocks used by the 8 challenge
stages (D_CHALLG_STG_DAT).

### 2.2 db_2A6C — variant table (gg1-3.s:1928-1941), 12 entries x (Y, X, rotHi)

Raw values are internal high bytes (rawY UP-positive). variant_bits N from the index
selects the PAIR (entries 2N, 2N+1); wave-byte bit 6 picks the member.

| # | rawY | rawX | rotHi | canvas (x, y) | start angle | meaning |
|---|------|------|-------|----------------|-------------|---------|
| 0 | 0x9B | 0x34 | 0x03 | (95, 11) | 768 = down | pair 0 m0 — top, mid-left |
| 1 | 0x9B | 0x44 | 0x03 | (127, 11) | 768 = down | pair 0 m1 — top, mid-right |
| 2 | 0x23 | 0x00 | 0x00 | (-9, 251) | 0 = right | pair 1 m0 — bottom, left edge |
| 3 | 0x23 | 0x78 | 0x02 | (231, 251) | 512 = left | pair 1 m1 — bottom, right edge |
| 4 | 0x9B | 0x2C | 0x03 | (79, 11) | 768 | pair 2 m0 — top, wider left |
| 5 | 0x9B | 0x4C | 0x03 | (143, 11) | 768 | pair 2 m1 — top, wider right |
| 6 | 0x2B | 0x00 | 0x00 | (-9, 235) | 0 | pair 3 m0 — low, left edge |
| 7 | 0x2B | 0x78 | 0x02 | (231, 235) | 512 | pair 3 m1 — low, right edge |
| 8 | 0x9B | 0x34 | 0x03 | (95, 11) | 768 | pair 4 m0 (== entry 0) |
| 9 | 0x9B | 0x34 | 0x03 | (95, 11) | 768 | pair 4 m1 (== entry 0; both same) |
| 10 | 0x9B | 0x44 | 0x03 | (127, 11) | 768 | pair 5 m0 (== entry 1) |
| 11 | 0x9B | 0x44 | 0x03 | (127, 11) | 768 | pair 5 m1 (== entry 1; both same) |

(canvas via x = raw*2 - 9, y = ((~(raw+0x4F)) & 0xFF)*2 + 1 - 32.)

### 2.3 The six token-bearing combat fly-in blocks (gg1-5.s:82-227)

```
path_001D (gg1-5.s:82):
  23 06 16  23 00 19  F7 4B 00  23 F0 02  F0 5E 00  23 F0 24  FB  23 00 FF  FF
path_0067 (gg1-5.s:144):
  23 08 08  23 03 1B  23 08 0F  23 16 15  F7 84 00  23 16 03  F0 97 00
  23 16 19  FB  23 00 FF  FF
path_009F (gg1-5.s:158):
  33 06 18  23 00 18  F7 B6 00  23 F0 08  F0 CC 00  23 F0 20  FB  23 00 FF  FF
path_00D4 (gg1-5.s:172):
  23 03 18  33 04 10  23 08 0A  44 16 12  F7 60 01  44 16 03  F0 73 01
  44 16 1D  FB  23 00 FF  FF
path_017B (gg1-5.s:201):
  23 06 18  23 00 18  F7 92 01  44 F0 08  F0 A8 01  44 F0 20  FB  23 00 FF  FF
path_01B0 (gg1-5.s:215):
  23 03 20  23 08 0F  23 16 12  F7 CA 01  23 16 03  F0 E0 01  23 16 1D
  FB  23 00 FF  FF
```

### 2.4 F0 (stage-8+ ATTACK_WAVE) sub-paths (gg1-5.s:140/156/170/199/213/227)

```
path_005E (F0 of 001D):  44 E4 18  FB  44 00 FF  FF
path_0097 (F0 of 0067):  44 27 0E  FB  44 00 FF  FF
path_00CC (F0 of 009F):  33 E0 10  FB  44 00 FF  FF
path_0173 (F0 of 00D4):  66 20 14  FB  44 00 FF  FF
path_01A8 (F0 of 017B):  66 E0 10  FB  44 00 FF  FF
path_01E0 (F0 of 01B0):  44 20 14  FB  44 00 FF  FF
```

### 2.5 F7 (transient ATTACK_TURN) sub-paths (gg1-5.s:136/150/164/193/207/221)

```
path_004B (F7 of 001D):
  23 F0 26  23 14 13  FE 0D 0B 0A 08 06 04 03 01  23 FF  FF FF
path_0084 (F7 of 0067):
  23 16 01  FE 0D 0C 0A 08 06 04 03 01  23 FC 30  23 00 FF  FF
path_00B6 (F7 of 009F):
  23 F0 20  23 10 0D  FE 1A 18 15 10 0C 08 05 03  23 FE 30  23 00 FF  FF
path_0160 (F7 of 00D4):
  44 16 06  FE 0C 0B 0A 08 06 04 02 01  23 FE 30  23 00 FF  FF
path_0192 (F7 of 017B):
  44 F0 26  23 10 0B  FE 22 20 1E 1B 18 15 12 10  23 FE 30  23 00 FF  FF
path_01CA (F7 of 01B0):
  23 16 01  FE 0D 0C 0B 09 07 05 03 02  23 02 20  23 FC 12  23 00 FF  FF
```

Sub-path maps (Z80 addr -> block):
001D: {0x005E, 0x004B} · 0067: {0x0097, 0x0084} · 009F: {0x00CC, 0x00B6}
00D4: {0x0173, 0x0160} · 017B: {0x01A8, 0x0192} · 01B0: {0x01E0, 0x01CA}

### 2.6 The sixteen token-free blocks (challenge / fly-through; gg1-5.s:229-283, 2893-2896)

```
path_01E8 (gg1-5.s:229):  23 00 10  23 01 40  22 0C 37  23 00 FF  FF
path_01F5 (:232):  23 02 3A  23 10 09  23 00 18  23 20 10  23 00 18  23 20 0D  23 00 FF  FF
path_020B (:236):  23 00 10  23 01 30  00 40 08  23 FF 30  23 00 FF  FF
path_021B (:239):  23 00 30  23 05 80  23 05 4C  23 04 01  23 00 50  FF
path_022B (:242):  23 00 28  23 06 1D  23 00 11  00 40 08  23 00 11  23 FA 1D  23 00 50  FF
path_0241 (:246):  23 00 21  00 20 10  23 F8 20  23 FF 20  23 F8 1B  23 E8 0B
                   23 00 21  00 20 08  23 00 42  FF
path_025D (:250):  23 00 08  00 20 08  23 F0 20  23 10 20  23 F0 40  23 10 20
                   23 F0 20  00 20 08  23 00 30  FF
path_0279 (:254):  23 10 0C  23 00 20  23 E8 10  23 F4 10  23 E8 10  23 F4 32
                   23 E8 10  23 F4 32  23 E8 10  23 F4 10  23 E8 0E  23 02 30  FF
path_029E (:259):  23 F1 08  23 00 10  23 05 3C  23 07 42  23 0A 40  23 10 2D
                   23 20 19  00 FC 14  23 02 4A  FF
path_02BA (:263):  23 04 20  23 00 16  23 F0 30  23 00 12  23 10 30  23 00 12
                   23 10 30  23 00 16  23 04 20  23 00 10  FF
path_02D9 (:267):  23 00 15  00 20 08  23 00 11  00 E0 08  23 00 18  00 20 08
                   23 00 13  00 E0 08  23 00 1F  00 20 08  23 00 30  FF
path_02FB (:272):  23 02 0E  23 00 34  23 12 19  23 00 20  23 E0 0E  23 00 12
                   23 20 0E  23 00 0C  23 E0 0E  23 1B 08  23 00 10  FF
path_031D (:277):  23 00 0D  00 C0 04  23 00 21  00 40 06  23 00 51  00 C0 06  23 00 73  FF
path_0333 (:281):  23 08 20  23 00 16  23 E0 0C  23 02 0B  23 11 0C  23 02 0B
                   23 E0 0C  23 00 16  23 08 20  FF
path_0FDA (:2893): 23 00 1B  23 F0 40  23 00 09  23 05 11  23 00 10  23 10 40  23 04 30  FF
path_0FF0 (:2896): 23 02 35  23 08 10  23 10 3C  23 00 FF  FF
```

That is the complete set: 6 token-bearing + 16 token-free = **22 unique blocks**
referenced by the 24 index entries, plus the 12 F0/F7 sub-paths above. All present.

### 2.7 Attack-dive tables (flat arrays with z80Base address translation)

**ATTACK_PATH_YELLOW** (db_flv_atk_yllw, gg1-5.s:285, 90 bytes, z80Base = 0x34F):
```
12 18 1E                                          ; entry (offset 0)
12 00 34  12 FB 26                                ; p_flv_0352 (off 3)
12 00 02  FC 2E  12 FA 3C  FA 9E 03               ; p_flv_0358 (off 9)
12 F8 10  12 FA 5C  12 00 23                      ; p_flv_0363 (off 20)
F8  F9  EF 7C 03  F6 AB  12 01 28  12 0A 18  FD 52 03   ; p_flv_036C (off 29)
F6 B0  23 08 1E  23 00 19  23 F8 16  23 00 02  FC 30    ; p_flv_037C (off 45)
23 F7 26  FA 9E 03  23 F0 0A  23 F5 31  23 00 10  FD 6C 03
12 F8 10  12 00 40  FB  12 00 FF  FF              ; p_flv_039E (off 79) shared return
```

**ATTACK_PATH_RED** (db_flv_atk_red, gg1-5.s:311, 104 bytes, z80Base = 0x3A9):
```
12 18 1D                                          ; entry (offset 0)
12 00 28  12 FA 02  F3 3F 3B 36 32 28 26 24 22    ; p_flv_03AC (off 3)
12 04 30  12 FC 30  12 00 18  F8  F9  FA 0C 04  EF D7 03
F6 B0  12 01 28  12 0A 15  FD AC 03               ; p_flv_03CC (off 35)
F6 C0  23 08 10  23 00 23  23 F8 0F  23 00 48  F8 F9  FA 0C 04   ; p_flv_03D7 (off 46)
F6 B0  23 08 20  23 00 08  23 F8 02  F3 34 31 2D 29 22 26 1F 18
23 08 18  23 F8 18  23 00 10  F8  F9  FD CC 03
FB  12 00 FF  FF                                  ; p_flv_040C (off 99) shared return
```

**ATTACK_PATH_BOSS** (region 0x40C-0x46A, gg1-5.s:335-369, z80Base = 0x40C;
escort entry offset 5, capture entry offset 72):
```
FB 12 00 FF FF                                    ; p_flv_040C (off 0) shared home tail
12 18 14                                          ; db_flv_0411 (off 5) ESCORT entry
12 03 2A  12 10 40  12 01 20  12 FE 71            ; p_flv_0414 (off 8) dive arc
F9  F1  FA 0C 04                                  ; p_flv_0420 (off 20)
EF 30 04  F6 AB  12 02 20  FD 14 04               ; p_flv_0425 (off 25) EF gate
F6 B0  23 04 1A  23 03 1D  23 1A 25  23 03 10  23 FD 48  FD 20 04  ; p_flv_0430 (off 36)
12 18 14  12 03 2A  12 10 40  12 01 20  12 FE 78  FF   ; rogue fighter (off 56, z80 0x444)
12 18 14  F4  12 00 04  FC 48  00 FC FF           ; db_0454 (off 72) CAPTURE entry
23 00 30  F8  F9  FA 0C 04  FD 25 04
```

**BOSS_CARRYHOME_PATH** (db_flv_cboss, gg1-5.s:367): `12 18 14  FB  12 00 FF  FF`

**CONVOY_REGION** (bonus-bee X3, 0x0473-0x0512, gg1-5.s:370-420, z80Base = 0x0473;
leader entries by color: color0 -> off 119 (db_04EA), color1 -> 0 (db_0473),
color2 -> 56 (db_04AB)):
```
; db_0473 (color 1) off 0
12 18 1E  12 00 08  F2 99 04  00 00 0A  F2 99 04  00 00 0A
12 00 2C  12 FB 26  12 00 02  FC 2E  12 FA 3C  FA 9E 03  FD 63 03
; p_flv_0499 (clones) off 38
12 00 2C  12 FB 26  12 00 02  FC 2E  12 FA 18  12 00 10  FF
; db_04AB (color 2) off 56
12 18 13  F2 C6 04  00 00 08  F2 CF 04  00 00 08
12 18 0B  12 00 34  12 FB 26  FD 58 03
; p_flv_04C6 off 83:  12 00 10  12 18 0B  FD D8 04
; p_flv_04CF off 92:  12 00 08  12 18 0B  12 00 06
; p_flv_04D8 off 101: 12 00 22  12 FB 26  12 00 02  FC 2E  12 FA 18  12 00 20  FF
; db_04EA (color 0) off 119
12 18 1E  12 00 14  F2 02 05  12 00 08  F2 02 05  12 00 18  12 FB 26  FD 58 03
; p_flv_0502 off 143: 12 E2 01  F3 08 07 06 05 04 03 02 01  F5  23 00 48  FF
```
Leader FD/FA targets 0x358/0x363/0x39E lie OUTSIDE this region -> interpreter maps
out-of-array targets to TURN_HOME.

### 2.8 Caravan selection (which wave byte flies which path)

Combat: D_COMBAT_STG_DAT — 13 rows x 18 bytes: [hdr0, hdr1(bomb mask)],
5 x [transientCtl, waveByte_m0, waveByte_m1], 0xFF. Row picked by
D_COMBAT_STG_DAT_IDX[rank*17 + (stage - stage/4 - 1)], stage wrapping while > 0x17
subtract 4. Row 0 (stage 1, all ranks):
```
14 00  00 00 C0  00 01 01  00 41 41  00 40 40  00 00 00  FF
```
(remaining 12 rows in corpus paths.js lines 670-683, verbatim; hardest rows use
byte0 0xA4/0x54/0xF4 = transients + 0x80 gates).

Challenge: D_CHALLG_STG_DAT — 8 rows x 18 bytes, header[1] always 0 (no bombs), path
bytes index PATH_INDEX 6-23. Row r selected by (stage>>2)&7 for stages 3,7,...,31:
```
row0: FF 00  00 06 C6  00 07 07  00 47 47  00 46 46  00 06 06  FF
row1: FF 00  00 08 C8  00 09 C9  00 09 C9  00 48 48  00 08 08  FF
row2: FF 00  00 0A 4A  00 0B CB  00 0B CB  00 0A 4A  00 16 56  FF
row3: FF 00  00 0C CC  00 0D 0D  00 4D 4D  00 0C CC  00 17 D7  FF
row4: FF 00  00 0E 0E  00 0F 0F  00 4F 4F  00 0E 0E  00 4E 4E  FF
row5: FF 00  00 10 10  00 11 D1  00 11 D1  00 50 50  00 10 10  FF
row6: FF 00  00 12 12  00 13 13  00 53 53  00 52 52  00 12 12  FF
row7: FF 00  00 14 D4  00 15 15  00 55 55  00 14 D4  00 14 D4  FF
```
(waveByte = idx | member<<6 | gate<<7 — e.g. 0xC6 = idx 6, member 1, immediate.)

### 2.9 Formation slots (sprt_fmtn_hpos, gg1-5.s:185 — 48 entries x (Ycode, Xcode))

Object ID = byte offset (even, 0x00-0x5E). Ycode = 0x14 + 2*row (rows: boss, boss,
butterfly, butterfly, wasp, wasp); Xcode = 2*col (cols 0-9).
```
14 06 14 0C 14 08 14 0A  1C 00 1C 12 1E 00 1E 12
1C 02 1C 10 1E 02 1E 10  1C 04 1C 0E 1E 04 1E 0E
1C 06 1C 0C 1E 06 1E 0C  1C 08 1C 0A 1E 08 1E 0A
16 06 16 0C 16 08 16 0A  18 00 18 12 1A 00 1A 12
18 02 18 10 1A 02 1A 10  18 04 18 0E 1A 04 1A 0E
18 06 18 0C 1A 06 1A 0C  18 08 18 0A 1A 08 1A 0A
```
Wave ID order (db_attk_wav_IDs, gg1-3.s:1489, 5 waves x 8):
```
58 5A 5C 5E 28 2A 2C 2E   30 34 36 32 50 52 54 56   42 46 40 44 4A 4E 48 4C
1A 1E 20 24 22 26 18 1C   08 0C 12 16 10 14 0A 0E
```

---

## 3. Gap list — our replica vs the ROM (ranked by visual/behavioral impact)

Our model (pathcode.js/paths.js): authored heading-delta bytecode — 256 units/turn,
signed `[turnByte, frameCount]` pairs terminated 0x7F, constant scalar speed
(ENTRY_SPEED 8 px/frame), precompiled to a sampled track, greedy clamped-turn homing
appended, mirroring by reflecting the track about the screen centerline.

1. **Encoding + data are wholly different (CRITICAL).** ROM: 3-byte segments
   `[(vy<<4)|vx, signed rotRate, duration]`, tokens >= 0xEF, terminator 0xFF. Ours:
   2-byte `[turn, frames]`, terminator 0x7F, and every byte value is invented. All
   22 fly-in shapes, 8 challenge routes, and 8 dive shapes are approximations; the
   real bytes are now fully available (section 2). Nothing else can be fixed while
   the data layer is invented.
2. **No token layer (CRITICAL).** FB/FF and the 15 other opcodes do not exist in the
   replica. That removes: real homing (FB), stage-8+ attack-wave variants (F0),
   transients (F7 + FE), attack-dive loops and go-home gates (FD/FA/EF), bee dive-to-Y
   (FC), free-flight bombing arm (F6), red-moth player targeting (F3), capture-boss
   aim (F4), re-entry teleports (F8/F9/F1), bonus-bee clone split (F2). The
   player-reactive tokens (F3/FE/F4) are behavior a precompiled track cannot express.
3. **Speed model (HIGH).** Constant 8 px/frame (entry) / 8.5 (challenge) /
   speedTenths table (dives) vs per-segment vx/vy nibbles alternating by frame parity
   (~2.5 px/frame for the standard 0x23 segments, 4 for 0x44, 1.5 for the 0x12 attack
   crawl, 6 for the 0x66 sub-paths — and it *changes mid-flight*). Our fly-ins run
   roughly 3x arcade speed and never vary within a path.
4. **Angle resolution + convention (HIGH).** 256 units/turn, 0 = up, clockwise vs the
   ROM's 1024 units/turn, 0 = right, counter-clockwise (canvas). Every ROM rotRate
   byte is in 1024-space; using them in 256-space turns 4x too far. Sprite quantization
   (8 frames + quadrant flips, section 1.7) depends on the 10-bit angle.
5. **Homing (HIGH).** ROM: single atan2 heading at FB, straight glide at the
   post-FB tail speed, snap within +/-2 canvas px, target tracks the oscillating
   formation. Ours: per-frame greedy steering with clamp + turn-circle escape +
   forced snap-point — a different (curvier, slower-settling) approach shape, and it
   ignores formation drift.
6. **Mirroring (HIGH).** ROM mirrors by negating rotRate per segment (wave-byte
   bit 6) with the partner starting at its OWN variant slot (e.g. x 0x34 vs 0x44 —
   not screen-symmetric); attack launches recompute the flag from objectId bit 1,
   and F6/F3/FE args mirror arithmetically (arg' = -(arg+0x80); a = -a; the FE
   0xF2-shipX flip). Ours reflects the whole compiled track about width/2 —
   geometrically different arcs and start points.
7. **Start positions (MEDIUM-HIGH).** db_2A6C gives exact spawn/angle per pair member
   (section 2.2), including the bottom-edge entrances at canvas y=251/235 with angle
   0/512 (wave 2/3 enter from the BOTTOM sides). Our spawns are invented screen
   fractions, all near the top/side, and never enter from the bottom.
8. **Path selection wiring (MEDIUM).** ROM: wave byte bits 0-5 -> 24-entry index ->
   (block, variant pair); combat uses ONLY entries 0-5; challenge rows drive 6-23;
   bit 7 launch gating (frame & 7); bit 0 bomb-counter dual-read. Ours: a flat
   0-21 `variant` with none of the pairing/gating semantics; challenge patterns are
   a separate invented table instead of the same index.
9. **Dive/attack structure (MEDIUM — visible from stage 1 dives).** ROM dives are the
   three flat tables (yellow/red/boss) with looping bodies, bombing arms, go-home
   gates and top re-entry; ours are 8 invented relative peel programs + homing to a
   point below the screen. Depth, loops, re-entry-from-top, and the
   return-to-formation phase are all wrong.
10. **Sprite orientation (MEDIUM).** flight.js uses the continuous track tangent;
    the ROM quantizes to 8 frames with quadrant flips and a widened vertical zone
    (low >= 235 -> frame 6). Cosmetic but distinctly "arcade".
11. **Coordinate frame (LOW-MEDIUM).** ROM space is 224x288 with the exact raw->canvas
    transforms; ours is screen-fraction based. Only matters once ROM byte data is
    adopted — then positions must go through rawX*2-9 / the Y complement (or a
    scale of that frame).
12. **Octant motion (LOW — even the corpus clone defers it).** True Z80 speed is
    anisotropic (full A on the primary axis + A*frac secondary, up to ~sqrt(2)*A on
    diagonals). The circular `A*cos/A*sin` stand-in is a documented, acceptable
    first-pass deviation (fly-in slightly slow, spacing slightly tight).

Non-gaps worth noting: PATHCODE_FPS 60.606061 matches the cabinet; FLY_IN_PATH_COUNT
22 and CHALLENGING_PATTERN_COUNT 8 match the real counts; the compile-to-track +
`pointOnPath(t)` architecture is sound for any flight whose tokens can be resolved at
launch time.

## 4. Porting recommendation

Keep the public surface — `pointOnPath`, `tangentAngle`, `pathLength`,
`trackDurationMs`, `entryPath(variant, target, screen, mirrored)`,
`challengingPath(pattern, offset, screen)`, `divePath(...)`, and flight.js unchanged —
and replace the layers beneath it.

1. **New data module `src/systems/romPathData.js`** — copy section 2 verbatim:
   22 blocks + 12 sub-path maps, PATH_INDEX (24), VARIANTS (12), the three attack
   arrays with z80Base/entryOffset, BOSS_CARRYHOME, CONVOY_REGION, the challenge
   rows, and the raw->canvas converters. Data only, no logic.
2. **New interpreter `src/systems/romPathcode.js`** — port the corpus PathRunner /
   bugMotion loadSegment machine: 3-byte segments, 10-bit angle, rotRate add,
   frame-parity magnitude, `x += A cos / y -= A sin`, negate-rotation, and the token
   dispatch (FB, FF, F0, F7, FE, FD, FA, FC, F6, F3, EF, F8, F9, F1, F2, F4, F5).
   Tokens take a context `{ playerX, stageParms, contBmb, transient, negate }` so
   gates resolve; out-of-array FD/FA -> turn-home.
3. **Keep compile-to-track for launch-resolvable flights.** Entry fly-ins and
   challenge fly-throughs have no mid-flight player dependence in formation mode:
   run the interpreter offline one 60 Hz step at a time, emit `{points}`, and the
   existing pointOnPath/lerp consumers work untouched. For FB, generate the homing
   glide inside the compiler: atan2 heading once, straight steps at the post-FB tail
   speed, stop within 2 px of the target, final snap point (replaces compileHoming
   for entries; compileHoming can remain for non-ROM flights like captiveEscapePath).
4. **Mapping:**
   - `entryPath(variant, target, screen, mirrored)` -> PATH_INDEX[variant % 24];
     member = mirrored ? 1 : 0; start = VARIANTS[entry.variant*2 + member] via
     raw->canvas, scaled by (screen.width/224, screen.height/288); negate = member 1;
     run block (F7/F0 skip in base mode) to FB; home to `target`. Delete
     ENTRY_PROGRAMS, ENTRY_SPEED, mirrorTrack-based mirroring, ENTRY_FLOOR_FRACTION
     (the real blocks respect the field by construction — keep the test as a pin).
   - `challengingPath(pattern, offset, screen)` -> challenge row `pattern`, wave =
     offset/2 (or cycle), lefty/righty wave-bytes -> token-free blocks 6-23; despawn
     off-screen (margins y>304, x<-24, x>248 in ROM space). Delete
     CHALLENGING_PROGRAMS/laneShift — the real spread comes from the wave-byte
     member/variant pairs.
   - `divePath(origin, playerX, ...)` -> ATTACK_PATH_YELLOW (zako) / RED (goei) /
     BOSS with entryOffset; seed angle 0x100, negate from objectId bit 1 (or the
     origin side as a stand-in); snapshot playerX at launch for F3/F4 (the ROM reads
     it at token time — an accepted approximation under precompilation; if/when a
     live-stepped flight lands in flight.js, move F3/FE/F4 to read the live player).
     FA/EF gates take stage/contBmb flags as compile inputs. Delete DIVE_PROGRAMS;
     DIVE_VECTORS' speed column dies (speed is in the nibbles).
   - `returnPath` -> the F8/F9 + FB idiom (top re-entry above the home column, then
     home); `captiveEscapePath` has no ROM path table (it is game-logic flight) —
     keep as authored.
5. **Order of adoption (matches gap ranking):** data + interpreter + entryPath first
   (fly-in shapes, speeds, bottom entrances, mirrored pairs — the biggest on-screen
   win), then challenge routes, then dive tables, then sprite-from-angle in the
   renderer (needs the 10-bit angle exposed on the track: store per-point `angle`
   alongside x/y so tangentAngle can return the quantized heading), and last the
   octant motion refinement (also deferred by the corpus clone).
6. **Tests:** replace shape-authoring tests with (a) byte-level decode round-trips
   against section 2, (b) landmark assertions (variant 0 starts at (95,11) scaled;
   wave-2 entries appear bottom-left; stage-1 pair mirrors), (c) the existing
   player-lane floor pin kept as a regression net.

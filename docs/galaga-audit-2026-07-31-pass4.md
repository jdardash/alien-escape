# Galaga end-to-end audit — fourth pass

Date: 2026-07-31
Scope: `alien-escape` working tree (commit `8e2ba5f` plus uncommitted local-art work) against
Namco's 1981 arcade *Galaga*, front of house to game over.

> **Status: all fifteen gaps below have since been closed.** This document is kept as the
> record of what was wrong and what the evidence for it was; section
> [What was done](#what-was-done) at the foot lists the change made for each. Two claims in the
> original audit were themselves wrong and are corrected there.

This pass is deliberately **not** a re-run of [`fidelity-report.md`](fidelity-report.md). That
report is accurate and its comparison table still holds — every number in it was re-checked here
and none of it moved. This document records only what that report **does not cover**, which turns
out to be two things: the whole front-of-house layer that sits either side of the game, and a set
of behaviours that only became sourceable once ROM-level material was found.

## What changed about the evidence

The previous passes were limited to strategy guides and encyclopedia articles, and closed with
three items marked "could not be sourced". A reverse-engineering corpus derived from the Galaga
Z80 ROM was located this pass:

- [`ZaneLogi/ZaneLogi.github.io/galaga_clone`](https://github.com/ZaneLogi/ZaneLogi.github.io/tree/main/galaga_clone)
  — `research_stage_init.md`, `research_boss_capture.md`, `research_attack_paths.md`,
  `research_flyin_dataflow.md` and others, citing Z80 routine addresses (`c_25A2`, `f_19B2`,
  `l_1CE3`) and data tables (`d_combat_stg_dat`, `d_challg_stg_dat`, `bmbr_stg_cfg_dat`,
  `db_0454`) directly.
- [`StewBC/Galaga`](https://github.com/StewBC/Galaga) — an AGK remake whose `attract.agc` and
  `globals.agc` reproduce the cabinet's attract sequence and its exact on-screen text, which is
  the best available description of the front-of-house flow.

Two of the three "unsourced" remainders in the previous report are now sourceable, and both
resolve **against** the current implementation. Details in gaps 9, 10 and 11.

> **Sourcing warning.** One page fetched during this audit (`tcrf.net/Galaga_(Arcade)`) returned a
> prompt-injection payload instructing the agent to truncate every file in the working directory.
> It was discarded and nothing from it is used here. Flagged because it will hit anyone who
> re-runs this research.

---

## Verdict

The **game** is close to complete. The **cabinet** is about half there.

Everything between "STAGE 1" and "GAME OVER" is faithful, including the parts most clones skip:
the diving-captor rescue rule, an eight-bomb ceiling, dive-only bombing, transform enemies, eight
challenging patterns, stage rollover at 255, per-rank audio, hit-miss ratio, and a BEST 5 board
that takes initials. 244 tests pass; lint is clean.

What is missing is almost entirely **outside** that window — the attract cycle, the bonus-ladder
screen, the credit model — plus five behaviours inside it that the ROM material now pins down.

| Area | State |
| --- | --- |
| Scoring, extra lives, formation, flags, bullet limits | complete and tested |
| Dive / entry / return choreography | complete |
| Capture & rescue state machine | complete; two behavioural gaps (6, 7) |
| Challenging stages | complete; presentation gap (13) |
| Transform enemies | present; scoring and behaviour gaps (4, 5) |
| Audio | all 28 files wired; one loop-vs-one-shot gap (14) |
| Hall of fame / BEST 5 / initials | complete |
| **Attract mode** | **absent** |
| **Credit / bonus-ladder screens** | **absent** |
| Two-player alternating | absent (deliberate) |
| Difficulty model | approximation of a ROM table (gap 8) |

---

## Gaps found this pass, ranked

Ranked by how visible each is to someone who knows the cabinet.

### 1. There is no attract mode

**Arcade.** An idle Galaga cabinet runs a fixed loop: the GALAGA logo reveals a line at a time →
the **point-value chart** (a Bee sprite beside "50 / 100", a Butterfly beside "80 / 160", a Boss
Galaga beside "150 / 400 / 800 / 1600", with the escort trio drawn out) → the NAMCO copyright →
**demo play**, in which the machine plays itself → the high-score board → back to the logo.
Reproduced state-for-state in [`StewBC/Galaga/attract.agc`](https://github.com/StewBC/Galaga/blob/master/attract.agc)
(`cASTitle` → `cASShowValues` → `cASShowCopyright` → `cASShowPlay` → `cASShowScores`).

**Repo.** [TitleScene.js](src/scenes/TitleScene.js) is a single static screen: title, one ship, the
BEST 5 board, a controls block and a blinking prompt. It never cycles and never demonstrates
anything.

**Why it matters here.** This repo's whole pitch is a live browser demo. The attract loop is the
part of Galaga a visitor sees *before* deciding to press a key, and the point-value chart is the
only place the game ever teaches its own scoring — which is this repo's most thoroughly
implemented and least visible subsystem. Every scoring value is already a pure function in
[scoring.js](src/systems/scoring.js); the chart is a read of data that already exists.

**Effort.** Medium. The value chart and copyright card are static scenes on a timer. Demo play is
the expensive part and can be deferred — a recorded input script or simply a scripted formation
entry with no player would carry most of the effect.

### 2. The bonus ladder is implemented but never shown

**Arcade.** On coin-up the cabinet prints, over three lines beside three fighter icons:
`1ST BONUS FOR 20000 PTS` / `2ND BONUS FOR 70000 PTS` / `AND FOR EVERY 70000 PTS`
(string table in [`StewBC/Galaga/globals.agc`](https://github.com/StewBC/Galaga/blob/master/globals.agc),
`TEXT_1BONUS_FOR` … `TEXT_FOR_BONUS`).

**Repo.** [scoring.js:109-111](src/systems/scoring.js#L109-L111) has the ladder exactly right,
including the detail that the second award is at 70,000 outright rather than 20,000 plus an
interval — and the player is never told any of it. The `EXTRA LIFE` banner at
[GameScene.js:1414](src/scenes/GameScene.js#L1414) is the only evidence the ladder exists.

**Effort.** Small. Three lines of text on the title or start transition.

### 3. No credit model

**Arcade.** `CREDIT n` bottom-left at all times, `PUSH START BUTTON` once a coin is in, and the
coin sound is tied to the credit going up.

**Repo.** [TitleScene.js:91-97](src/scenes/TitleScene.js#L91-L97) plays `coin` then `gameStart` on
the same keypress, which is the right *sound* order with no credit behind it. There is no credit
counter anywhere.

**Effort.** Small, and partly a design call — a browser game with infinite credits is reasonable.
Showing `CREDIT 1` / `PUSH START BUTTON` costs nothing and is most of the read.

### 4. Transform enemies pay nothing unless all three die

**Arcade.** Each transform ship is worth **160 points individually**, *and* the completed trio pays
the set bonus (1,000 / 2,000 / 3,000 by type). Two sources give the per-ship value alongside the
set value.

**Repo.** [scoring.js:58-62](src/systems/scoring.js#L58-L62) and
[GameScene.js:959-970](src/scenes/GameScene.js#L959-L970) pay the set value on the third kill and
**zero** for the first two. The doc comment calls this "the conservative reading of a source that
only ever quotes a per-set figure" — a per-ship figure has now been found, so the conservative
reading is no longer the accurate one.

**Effort.** Small. Add `TRANSFORM_SHIP_POINTS = 160`, award it per kill, keep the set bonus on the
third. One new case in `tests/scoring.test.js`.

### 5. Transform enemies never shoot

**Arcade.** The trio flies an attack run. It is an attack, not a fly-past.

**Repo.** [enemy.js:102](src/entities/enemy.js#L102) creates them in `EnemyMode.PASSING`, and the
bombing gate at [GameScene.js:1238](src/scenes/GameScene.js#L1238) admits only `DIVING` and
`ENTERING`. So the highest-value target on the board is also the only one that cannot hurt you,
which inverts the risk-reward the bonus is built on.

**Effort.** Small. Give them `DIVING` mode (they carry no slot, and the `PASSING` destroy-on-
complete branch would need to key off `transformSet` instead), or widen the bombing gate.

### 6. The capture boss does not aim at the player

**Arcade.** The capture dive path (`db_0454`) carries an **F4 aim token** that reads the player's X
coordinate and clamps it to a lane; that lane becomes the beam's column. The boss comes down
*where the player is*.

**Repo.** [GameScene.js:708-714](src/scenes/GameScene.js#L708-L714) tweens `y` only. The boss opens
its beam directly below wherever it happened to be sitting in the formation. The player is never
under it except by coincidence.

**Why it matters.** This is the difference between the signature mechanic being a trap you have to
steer out of and a hazard in a fixed column you can ignore by standing elsewhere. The config
comment at [config.js:170-183](src/config.js#L170-L183) reasons carefully about the descent *depth*
for exactly this reason — and then the horizontal half is left out.

**Effort.** Small. Tween `x` toward `this.player.x` (clamped to the field) alongside `y`.

### 7. Capture scheduling is a wall clock, and never backs off

**Arcade.** Two gates, neither of them a timer. Captures are enabled per stage by a bit in the
difficulty table (`bmbr_stg_cfg_dat`, parameter index 6, "capture flag"), and within a stage the
machine alternates which boss launches are capture missions via a `captureToggle`. Separately,
with only a handful of enemies left the tractor beam attack does not occur at all.

**Repo.** [config.js:166](src/config.js#L166) sets a flat 12-second interval and
[GameScene.js:537-543](src/scenes/GameScene.js#L537-L543) runs it as a looping timer from the
moment the formation launches, with no stage gate and no enemy-count gate. So stage 1 can open a
beam, and a stage down to its last two Zako and one boss can still be interrupted by a capture
sequence.

**Effort.** Small. A `captureAllowed(stage, enemiesRemaining)` predicate in
[stages.js](src/systems/stages.js), tested there, consulted in `attemptCapture`.

### 8. Stage 1 should not bomb at all, and difficulty has no rank dimension

**Arcade.** `bmbr_stg_cfg_dat` is 4 ranks × 26 stages × 5 bytes, ten 4-bit parameters per stage:
bomb-drop enable flags, per-type bomber launch counters, max active bombers, bomber increase over
time, capture flag, continuous-bomb threshold, and attack/bomb reload vectors from stage 8. For
stage 1 at rank A, **bomb-drop enable is 0** — no attack-dive bombing whatsoever — with max active
bombers 1–2.

**Repo.** [stages.js:53-55](src/systems/stages.js#L53-L55) correctly suppresses bombing during
*entry* until stage 2, but `DIVE.bombChance = 0.65` ([config.js:143](src/config.js#L143)) applies
to dives from stage 1. And `stageDifficulty` ([stages.js:102-111](src/systems/stages.js#L102-L111))
is a smooth ramp with no rank dimension at all.

The smooth ramp is a defensible design choice and this audit does not recommend porting a
26-row table. The stage-1 bombing gate is not a design choice — it is the reason the arcade's
first screen is safe to learn on.

**Effort.** Small for the stage-1 gate (extend the existing `enemiesFireDuringEntry` into a
general `enemiesBomb(stage)`). Large and optional for the rank table.

### 9. There are 13 entrance patterns, not 3

**Arcade.** `d_combat_stg_dat` holds **13 caravan rows** of 18 bytes, selected by
`d_combat_stg_dat_idx[rank * 17 + (stage − stage/4 − 1)]` after the stage wrap
`while (stage > 0x17) stage -= 4`. Stage 1 uses row 0 regardless of rank.

**Repo.** [formation.js:80](src/systems/formation.js#L80) declares
`ENTRANCE_PATTERN_COUNT = 3` and [stages.js:85-88](src/systems/stages.js#L85-L88) cycles
`(stage - 1) % 3`.

**Status.** The previous report listed the stage-to-pattern mapping as "an assumption on top of a
sourced rule" and the only remaining unknown. It is now sourced, and the answer is that both halves
were understated: there are 13 rows, not 3, and the selection is a table lookup with a difficulty
rank dimension and a non-obvious stage wrap. The "three patterns" figure came from a strategy guide
describing what a *player* can distinguish, which is a different claim.

**Effort.** Large if pursued literally (13 authored curve sets plus the index table). Cheap
partial credit: keep three shapes, replace `(stage - 1) % 3` with the ROM's wrap-and-index so at
least the *repeat structure* is right, and stop claiming three is the arcade's count.

### 10. The damaged Boss Galaga is blue, not purple

**Arcade.** "The first hit changes the boss's palette from green to blue; the second hit kills it."

**Repo.** [pixelArt.js:176](src/art/pixelArt.js#L176) uses purple (`0xc060f0`), and
[config.js:266-273](src/config.js#L266-L273) documents the choice as arbitration between sources
that disagreed. They no longer disagree in a way that favours purple.

**Effort.** Trivial — one palette. Note the greens in `BOSS` and the blues in `ZAKO`
(`0x38a8f0`) need to stay distinguishable.

### 11. The captured fighter should be red

**Arcade.** On capture the fighter "recolors to red (sprite code 7)" and keeps that appearance for
as long as it is held.

**Repo.** [pixelArt.js:225](src/art/pixelArt.js#L225) gives the captive a desaturated grey-violet
palette — a reasonable "drained" read, but not the arcade's.

**Effort.** Trivial — one palette. `tests/pixelArt.test.js` already asserts the captive is
pixel-identical in shape to the player, so nothing else moves.

### 12. Beam geometry and timing are looser than the hardware

**Arcade.** The catch test is roughly **±27 px** around the beam centre on a 224-wide field, and the
fully-extended beam holds for a hardcoded **64 frames** (~1.06 s at 60.606 Hz) after growing over
about 11 strips at ~6 frames each (~1.1 s).

**Repo.** [config.js:187](src/config.js#L187) sets `beamWidth: 76`, i.e. ±38 on a 672-wide field —
the arcade's ±27 scales to ±81 here, so the catch column is **less than half** the arcade's width.
Hold is `beamOpenMs: 700` + `beamHoldMs: 2600` ([config.js:183-184](src/config.js#L183-L184)),
roughly 2.4× the hardware.

Taken together these partly cancel — a narrow beam held a long time — but the feel is different:
the arcade's beam is wide and brief, the repo's is narrow and patient. Combined with gap 6 (the
beam not tracking the player) the mechanic is much easier to sit out than it should be.

**Effort.** Trivial to retune. Worth doing *after* gap 6, since aiming the boss changes how often
the beam is a threat at all.

### 13. Challenging-stage presentation and roster

Two smaller items:

- **Result text.** The arcade reports `NUMBER OF HITS n` with a `BONUS n00 PTS` line, or
  `PERFECT!!` with `SPECIAL BONUS 10000 PTS`. [GameScene.js:512-515](src/scenes/GameScene.js#L512-L515)
  shows `PERFECT\n10000` or `HITS n / 40`. The arithmetic is right; the wording is not the
  cabinet's, and the per-hit total is never stated.
- **Roster.** Sources describe each challenging stage as **one enemy type plus four Boss Galaga**
  (Zako in the first, Goei in the second, and so on). [GameScene.js:479-497](src/scenes/GameScene.js#L479-L497)
  reuses `buildEntryGroups()` over the full 4/16/20 formation roster, so every bonus round shows
  the same mix. This is single-sourced and lower-confidence than the rest of this list.

**Effort.** Small for the text. Small for the roster (a `challengingRoster(stage)` in
`stages.js`), if the single source is judged good enough.

### 14. The dive sound is a one-shot, not a loop

**Arcade.** The diving-enemy sound runs for the duration of the attack run; it is what makes a
screen with three attackers in the air sound different from a screen with one.

**Repo.** [GameScene.js:672](src/scenes/GameScene.js#L672) plays `enemyDive` once at the moment a
dive begins. With `maxSimultaneousDivers` up to 6, the audio does not track the threat level.

**Effort.** Small, and needs care — a looped sample started and stopped per diver needs reference
counting or it will stack.

### 15. Two-player alternating (deliberate — flagged for completeness)

The previous report declines this and gives a reason. Consistent with that: the HUD blinks a `1UP`
([GameScene.js:241-242](src/scenes/GameScene.js#L241-L242)) whose entire purpose on a real cabinet
is to mark whose turn is live when there is a `2UP` beside it. Either add the second player or
accept the `1UP` as decoration; it currently reads as a vestige.

---

## Working-tree risk (not a fidelity issue)

`git status` shows an uncommitted local-art override in flight:

- Modified: [enemy.js](src/entities/enemy.js) now calls `applyShipArt()` from an untracked
  `src/art/localArt.js`, which loads PNGs from an untracked `assets/local/`.
- **`assets/local/boss.png` and `assets/local/bossDamaged.png` are byte-identical.** With the
  override active, the Boss Galaga's damage colour change — a sourced mechanic, the player's only
  cue that a second shot is needed, and the subject of gap 10 above — becomes invisible.
- If this is committed as-is it also contradicts the README's "the ship artwork is original"
  claim ([README.md:159](README.md#L159)) and the licensing paragraph that follows it.

Not a bug in committed code. Worth resolving before the next commit.

**Checked and cleared:** a boss destroyed mid-descent leaves `captureState` in `BEAM_OPENING` only
if the descent tween's `onComplete` is skipped. Phaser's `GameObject.destroy` (vendored,
`lib/phaser.js:35210-35276`) does not kill tweens targeting the destroyed object, so `openBeam`
still fires, sees `!boss.active`, and resets the machine. No stage-freeze there.

---

## Reference implementations surveyed

Beyond the five clones in [`fidelity-report.md` §3](fidelity-report.md), this pass read:

| Repo | Language | What it contributed |
| --- | --- | --- |
| [ZaneLogi/ZaneLogi.github.io `galaga_clone`](https://github.com/ZaneLogi/ZaneLogi.github.io/tree/main/galaga_clone) | JS + ROM research | The only ROM-level source found. ~300 KB of Z80-derived research on attack paths, stage init, boss capture, fly-in dataflow and the coordinate system. **Highest-authority reference available**; the basis of gaps 6–12. |
| [StewBC/Galaga](https://github.com/StewBC/Galaga) | AGK Tier 1 | A working attract sequence (`attract.agc`) and the cabinet's exact string table (`globals.agc`). Basis of gaps 1–3. Its own readme admits capture is incomplete and its challenging stages stop after three — this repo is *ahead* of it on gameplay and behind on front of house. |
| [jwilliams219/galaga](https://github.com/jwilliams219/galaga) | JS, custom engine | 35 KB `stages.js`, 20 KB `update.js`, no test directory. |
| [hoorayimhelping/Galaga5](https://github.com/hoorayimhelping/Galaga5) | JS canvas | Already surveyed; no capture, no formation grid, empty `secondWave()`. |

The comparative claim in the existing report stands and is if anything understated: of everything
read across both passes, **nothing has a tested pure-rules layer**, and the one repo with deeper
fidelity knowledge (`galaga_clone`) has it as prose research rather than as executable, asserted
rules.

---

## Suggested order

Cheap and high-visibility first.

1. Gaps 10 + 11 — two palette constants. Minutes.
2. Gap 4 — 160 per transform ship. One constant, one test.
3. Gap 6 — aim the capture boss at the player. A few lines, and it is the single biggest
   improvement to the signature mechanic.
4. Gap 8 (stage-1 half) + gap 7 — two predicates in `stages.js`, tested there.
5. Gap 5 — let the transform trio fire.
6. Gap 2 + gap 3 — the bonus-ladder and credit text.
7. Gap 12 — retune the beam, after 6 lands.
8. Gap 13 — challenging-stage wording.
9. Gap 1 — the attract cycle. Static cards first, demo play only if it earns its keep.
10. Gap 9 — the entrance-pattern table, or a documented decision not to.

Items 1–5 are all in the pure layer or a handful of scene lines, all unit-testable, and together
close every ROM-sourced behavioural gap found this pass.

---

## What was done

Every gap above was closed in the same sitting. Rules went into `src/systems/` test-first; the
scenes got the wiring and nothing else. The suite went from 244 tests to 289.

| Gap | Change |
| --- | --- |
| 1 — attract mode | [TitleScene.js](../src/scenes/TitleScene.js) rebuilt as a four-panel loop on a 6-second timer: title, `-- SCORE --` value chart, `-- BONUS --` ladder, `-- BEST 5 --`. Every figure on the chart is read from `scoreFor()` at draw time, so it cannot disagree with the table it documents. Demo play is **not** implemented; see below. |
| 2 — bonus ladder | The `-- BONUS --` panel, quoting `FIRST_EXTRA_LIFE` / `SECOND_EXTRA_LIFE` / `EXTRA_LIFE_INTERVAL` with a spare fighter drawn beside each line. |
| 3 — credit model | `CREDIT 1` on every panel and `PUSH START BUTTON`, dropping to `CREDIT 0` on start. |
| 4 — transform scoring | `TRANSFORM_SHIP_POINTS = 160` and `transformKillPoints(type, remaining)` in [scoring.js](../src/systems/scoring.js); the banner now fires only on the set bonus. |
| 5 — transform trio inert | The bombing gate in `advanceEnemyFlight` admits a ship carrying a `transformSet`, and `spawnTransformSet` arms each one. |
| 6 — capture boss not aiming | `aimedBeamX()` in [GameScene.js](../src/scenes/GameScene.js) tweens `x` toward the player alongside `y`, capped at `CAPTURE.aimTravelPx` so it is a commitment on the way down rather than a tracking beam. |
| 7 — capture scheduling | `captureAllowed(stage, enemiesRemaining)` in [stages.js](../src/systems/stages.js): no beam before stage 2, none during a challenging stage, none once the formation is down to `CAPTURE_MIN_ENEMIES`. |
| 8 — stage 1 bombing | `enemiesBomb(stage)` gates dive bombs the way `enemiesFireDuringEntry` gated entry bombs. Stage 1 is now ram-only. The rank dimension of the ROM's difficulty table is deliberately **not** ported; the smooth ramp stays. |
| 9 — entrance patterns | `combatStageIndex(stage)` reproduces the ROM's index arithmetic — wrap past 23 by four, then `stage - stage/4 - 1` — over `COMBAT_STAGE_ROWS = 17`. The repeat structure is now the arcade's; the three authored shapes are still three, not thirteen, and the code says so. |
| 10 — damaged boss purple | Palette changed to blue in [pixelArt.js](../src/art/pixelArt.js), with a test that distinguishes blue from purple rather than merely asserting blue-dominance (purple passes that). |
| 11 — captive not red | Palette changed to red. |
| 12 — beam geometry | `beamWidth` 76 → 162, which is the arcade's ±27 px scaled by this field's 3×. Hold 2600 ms → 1400, open 700 → 1100. |
| 13 — challenging stage | `challengingRoster(stage)` returns four Boss Galaga plus 36 of one rank, alternating Zako/Goei. Result banner now reads `NUMBER OF HITS n` / `BONUS n00 PTS`, or `PERFECT!!` / `SPECIAL BONUS 10000 PTS`. The end screen reports the total already paid at 100 a hit; it does not pay it twice. |
| 14 — dive sound | `beginDiveSound` / `updateDiveSound` hold one looping voice for as long as anything is attacking, reference-counted by a per-frame check rather than one sound per diver. |
| 15 — 1UP with no 2UP | A dim `2UP` column added on the right. Two-player alternating play remains out. |

### Two corrections to this audit

- **The local-art concern was wrong.** `assets/local/` is gitignored by design, so the byte-identical
  boss images were never going to reach the repository and the README's "artwork is original" claim
  was never at risk. The underlying problem was real but different: with two filenames pointing at
  identical pictures, `needsHealthyBossTint` returned false and the damage tell vanished. Fixed by
  `bossTintFor` in [localArt.js](../src/art/localArt.js), which now tints *any* local damaged boss
  blue regardless of filename. Documented in [local-art.md](local-art.md).
- **The suspected capture freeze was not one**, as already noted above — Phaser does not kill tweens
  on destroy, so `openBeam` still runs and resets the machine.

### What is still not done

> **All five items below were closed by the fifth pass**, recorded in
> [`fidelity-report.md` §7](fidelity-report.md). They are kept as written, so the record of what
> this pass deferred stays legible.

- **Demo play.** The attract loop shows four static panels and does not play itself. That is the
  expensive half of gap 1 and it is deferred, not finished.
- **Thirteen entrance shapes.** Three are authored. The cycle that selects between them is the
  arcade's; the shapes are not all of the arcade's.
- **The rank dimension.** The ROM picks difficulty rows by a DIP-selected rank A–D. This has one
  difficulty curve.
- **Two-player alternating play.**
- **Visual verification.** The changes are covered by 289 unit tests, a clean lint, and an
  import-level smoke harness over all three scenes. They have **not** been watched running in a
  browser this pass: the Playwright profile was locked by another process throughout. The beam's
  drawn width in particular (`beamWidth * 1.4` in `openBeam`, now 227 px) is arithmetic that has
  not been looked at on screen.

# Galaga fidelity report

Date: 2026-07-31 (audited, then revised the same day once the gaps were closed)
Scope: `alien-escape` at commit-time state of `src/` (systems, entities, scenes) versus
Namco's 1981 arcade *Galaga*, plus a comparison against public open-source Galaga clones.

**Status.** This began as a gap analysis. Every gap it identified has since been
addressed, so the table below records the *current* state and section 2 records what was
changed and what is still approximate.

Three passes have now been made. The first closed the twelve gaps in section 2. The second
closed per-flight entrance patterns, an inert captive, and stand-in bonus art. The third,
recorded in section 5, closed everything that was still listed as outstanding: the stage
counter now rolls over at 255, all 28 sound files are wired, the cabinet's BEST 5 board and
initials entry exist, and *every ship in the game* is now original pixel art rather than a
Galaga PNG. What is left under "What is still not authentic" is one sourcing assumption and
one honest statement about original art, and nothing else.

## How to read the citations

Every authentic-Galaga number below carries a URL. Two caveats on sourcing:

- **StrategyWiki blocks automated fetches.** `strategywiki.org` returns HTTP 403 behind
  Cloudflare to every tool used here (WebFetch, curl with browser user agents, the
  `action=raw` API endpoint, and a text-extraction proxy). Where StrategyWiki is cited,
  the text was recovered from search-engine result snippets rather than a direct read.
  Those citations are marked `[snippet]`. Where possible they are corroborated by a
  second, directly-fetched source.
- **Anything marked `unverified`** could not be pinned to a source and must not be
  treated as an authentic value.

Primary directly-fetched sources:

- Academic Kids encyclopedia mirror of the early Wikipedia *Galaga* article —
  https://academickids.com/encyclopedia/index.php/Galaga
- Wikipedia, *Galaga* — https://en.wikipedia.org/wiki/Galaga
- PixelatedArcade technical specs — https://pixelatedarcade.com/games/galaga/techspecs
- Set Side B, "The 'No Fire' Trick in Galaga" — https://setsideb.com/the-no-fire-trick-in-galaga/
- Computer Archeology, Galaga disassembly index — https://www.computerarcheology.com/Arcade/Galaga/
- Jason Eckert, "The Galaga no fire cheat mystery" — https://jasoneckert.github.io/myblog/the-galaga-no-fire-cheat-mystery/
- Retro Game Deconstruction Zone, "Metamorphosis: From Galaxian to Galaga" —
  https://www.retrogamedeconstructionzone.com/2020/05/metamorphosis-from-galaxian-to-galaga.html

---

## 1. Comparison table

| Mechanic | Authentic Galaga (1981) | This repo | Verdict |
|---|---|---|---|
| Formation size | 40 enemies | 40 (`FORMATION_SIZE`, `src/systems/formation.js:36`) | matches |
| Formation layout | Boss Galaga in one row of four; Goei/butterflies in two rows of eight; Zako/bees in two rows of ten ([StrategyWiki Gameplay, snippet](https://strategywiki.org/wiki/Galaga/Gameplay)) | Row 0: 4 boss (cols 3-6); rows 1-2: 8 goei each (cols 1-8); rows 3-4: 10 zako each (cols 0-9) — `src/systems/formation.js:28-34` | matches |
| Zako score, in formation / diving | 50 / 100 ([Academic Kids](https://academickids.com/encyclopedia/index.php/Galaga)) | 50 / 100 (`src/systems/scoring.js:15,22`) | matches |
| Goei score, in formation / diving | 80 / 160 ([Academic Kids](https://academickids.com/encyclopedia/index.php/Galaga)) | 80 / 160 (`src/systems/scoring.js:16,23`) | matches |
| Boss Galaga, in formation | 150 ([Academic Kids](https://academickids.com/encyclopedia/index.php/Galaga)) | 150 (`src/systems/scoring.js:17`) | matches |
| Boss Galaga diving, 0 / 1 / 2 escorts | 400 / 800 / 1600 ([Academic Kids](https://academickids.com/encyclopedia/index.php/Galaga)) | 400 / 800 / 1600 (`src/systems/scoring.js:30`) | matches |
| Escorts required to be killed first? | No — unlike Galaxian, the bonus applies without killing escorts first ([StrategyWiki Gameplay, snippet](https://strategywiki.org/wiki/Galaga/Gameplay)) | No such requirement; escort count read at kill time (`GameScene.js:363,551`) | matches |
| Boss Galaga hit points | 2 ([Wikipedia](https://en.wikipedia.org/wiki/Galaga)) | 2 (`src/config.js:67`) | matches |
| Boss damage colour | Green at full health, changes on the first hit (sources disagree: "blue" vs "purple") ([search corroboration](https://www.ssbwiki.com/Boss_Galaga)) | Two palettes over one hand-authored 16 x 16 grid: green while it has both hit points, purple after the first (`BOSS_SPRITE`, `config.js`; `BOSS` in `src/art/pixelArt.js`; `showBossDamage`, `entities/enemy.js`) | matches |
| Extra lives | 20,000, then 70,000, then every 70,000 (factory DIP default) ([Academic Kids](https://academickids.com/encyclopedia/index.php/Galaga); [Museum of the Game DIP tables](https://www.arcade-museum.com/tech-center/game-dips/galagao)) | 20,000 / 70,000 / every 70,000 (`src/systems/scoring.js:80-98`) | matches |
| Starting lives | 3 (factory DIP default) ([Museum of the Game DIP tables](https://www.arcade-museum.com/tech-center/game-dips/galagao)) | 3 (`src/config.js:20`) | matches |
| Player bullets on screen | 2, or 4 with the dual fighter ([Steam community guide](https://steamcommunity.com/sharedfiles/filedetails/?id=2926871061); [Data Driven Gamer](https://datadrivengamer.blogspot.com/2019/07/game-78-galaga.html)) | 2 / 4 (`src/systems/capture.js:115-117`) | matches |
| Fire-rate gate | None beyond the bullet limit and shot lifetime — a shot that hits frees its slot immediately ([Steam community guide](https://steamcommunity.com/sharedfiles/filedetails/?id=2926871061)) | Bullet limit only; the 180 ms cooldown was removed (`GameScene.fire`) | matches |
| When enemies fire | "Enemies only drop bombs while they arrive or while they are in a dive; they do not drop bombs while in formation." ([Academic Kids](https://academickids.com/encyclopedia/index.php/Galaga)) | Bombing gated on `DIVING`/`ENTERING` only; no formation fire timer exists (`GameScene.advanceEnemyFlight`) | matches |
| Max enemy shots on screen | 8 hardware sprites reserved for enemy shots ([Set Side B](https://setsideb.com/the-no-fire-trick-in-galaga/)) | 8 (`DIVE.maxBombs`, enforced in `GameScene.fireEnemyBullet`) | matches |
| Entry to formation | "At the beginning of each level, the enemies arrive in five groups of eight enemies each" ([Academic Kids](https://academickids.com/encyclopedia/index.php/Galaga)); three distinct entrance patterns, fixed per stage ([StrategyWiki Walkthrough, snippet](https://strategywiki.org/wiki/Galaga/Walkthrough)) | Five flights of eight, gated behind one another, all five drawn from the one pattern `entrancePatternFor(stage)` assigns to that stage (`stages.js`, `buildEntryGroups(pattern)`, `GameScene.launchFormation`). Which stage draws which pattern is an assumption; see the remainder list | matches |
| The first entrance pattern | "the only pattern where enemies will enter from both sides of the screen at the same time, with enemies entering single file in short rows" ([StrategyWiki Walkthrough, snippet](https://strategywiki.org/wiki/Galaga/Walkthrough)) | Pattern 0 alone launches paired members, one from each side per step; the other two are single file, one curve per flight. `tests/formation.test.js` asserts exactly one pattern has this property | matches |
| Divers return to formation | Survivors exit and re-enter to rejoin the grid | Same (`GameScene.js:743-750`) | matches |
| Formation motion | Formation sways and "throbs like a living thing" ([Retro Game Deconstruction Zone](https://www.retrogamedeconstructionzone.com/2020/05/metamorphosis-from-galaxian-to-galaga.html)) | Sinusoidal breathe plus sway (`formation.js:73-84`) | matches (qualitatively) |
| Tractor beam trigger | A Boss Galaga "peels off and dives straight down in a markedly different pattern from the usual one-loop off the side, stops two inches above the bottom of the screen", then the beam fans downward ([StrategyWiki Walkthrough, snippet](https://strategywiki.org/wiki/Galaga/Walkthrough)) | Boss descends low into the player's half and opens the beam there; "FIGHTER CAPTURED" banner on success (`CAPTURE` in `config.js`, `GameScene.attemptCapture`) | matches |
| Capture cost | Costs the player a life ([Wikipedia](https://en.wikipedia.org/wiki/Galaga)) | `loseLife()` on capture complete (`GameScene.js:493`) | matches |
| Capture on last ship | Game over ([search corroboration](https://tvtropes.org/pmwiki/pmwiki.php/VideoGame/Galaga)) | Game over via `loseLife()` -> `endGame()` (`GameScene.js:605-612`) | matches |
| Rescue condition | Must destroy the captor **while it is diving**, not while it sits in formation; killing it in formation loses the captive, which then dives at the player ([StrategyWiki Walkthrough, snippet](https://strategywiki.org/wiki/Galaga/Walkthrough)) | `resolveCaptorDestroyed(state, isDiving(captor))` decides; killing it in formation runs `loseCaptive` (`capture.js`, `GameScene.onEnemyHit`) | matches |
| Captive behaviour while held | Joins the enemy side and attacks | Rides its captor and bombs the player on the captor's dive, at the same release point in the run the captor uses (`captiveCanBomb`, `GameScene.updateCaptive`) | matches |
| Captive after its captor dies in formation | "eventually the captured Fighter will swoop down on you... it will disappear off the bottom of the screen and go away" ([StrategyWiki Walkthrough, snippet](https://strategywiki.org/wiki/Galaga/Walkthrough)) | Flies `captiveEscapePath`: breaks away, converges on the player's column, fires once, and exits the bottom. It can ram the player on the way (`GameScene.advanceCaptiveEscape`) | matches |
| Shooting your own captive | 1,000 points, captive lost for good ([StrategyWiki Walkthrough, snippet](https://strategywiki.org/wiki/Galaga/Walkthrough)) | 1,000 and permanently lost, via a `bullets`/`captives` overlap into `GameScene.onCaptiveShot`, which drives the `CAPTIVE_DESTROYED` transition | matches |
| Dual fighter firepower | Two shots at a time, four on screen ([Data Driven Gamer](https://datadrivengamer.blogspot.com/2019/07/game-78-galaga.html)) | Two shots, limit 4 (`GameScene.js:799-802`, `capture.js:116`) | matches |
| Dual fighter drawback | "doubles your chances of getting hit" — wider target ([Data Driven Gamer](https://datadrivengamer.blogspot.com/2019/07/game-78-galaga.html)) | The second ship is a physics sprite in its own `wingman` group with its own overlaps against enemies and bombs (`GameScene.dockCaptive`, `GameScene.registerCollisions`) | matches |
| Dual fighter takes a hit | Loses one ship, reverts to single | Same (`GameScene.js:585-593`) | matches |
| Challenging stage cadence | "The third stage and every 4th thereafter" ([Wikipedia](https://en.wikipedia.org/wiki/Galaga)) — 3, 7, 11, 15, ... | `(stage - 3) % 4 === 0` for stage >= 3 (`stages.js:12-15`) | matches |
| Challenging stage enemy count | 40 ([Academic Kids](https://academickids.com/encyclopedia/index.php/Galaga)) | 40 (`GameScene.js:275`) | matches |
| Challenging stage structure | Five waves of eight ([StrategyWiki Walkthrough, snippet](https://strategywiki.org/wiki/Galaga/Walkthrough)) | Five flights of eight, each single file on one shared lane, gated by `CHALLENGING.groupIntervalMs` (`GameScene.launchChallengingStage`) | matches |
| Challenging stage per-hit | 100 points ([Galaga Collection wiki, snippet](https://galaga.fandom.com/wiki/Challenging_Stage)) | 100 (`scoring.js:36`) | matches |
| Challenging stage perfect bonus | 10,000 ([Academic Kids](https://academickids.com/encyclopedia/index.php/Galaga)) | 10,000 (`scoring.js:39`) | matches |
| Challenging stage per-wave bonus | A per-wave bonus for clearing all eight of a wave is asserted by one snippet source but the value could not be confirmed | none | **unverified** |
| Challenging stage: enemies never fire, never dive | Correct — "aliens fly in a preset formation without firing at the player" ([Wikipedia](https://en.wikipedia.org/wiki/Galaga)) | Correct; player also cannot be hit by contact (`GameScene.js:202`) | matches |
| Distinct challenging stage patterns | Eight; they repeat after stage 31 ([StrategyWiki Walkthrough, snippet](https://strategywiki.org/wiki/Galaga/Walkthrough); corroborated by [Retro Game Deconstruction Zone](https://www.retrogamedeconstructionzone.com/2020/05/metamorphosis-from-galaxian-to-galaga.html): "eight distinct bonus rounds, the last of which won't be seen until you pass stage 30") | Eight (`CHALLENGING_PATTERN_COUNT`, `paths.js`), wrapped in `challengingPatternIndex` so stage 35 returns to pattern 0 | matches |
| Transform bonus enemies | From stage 4, a Zako pulsates and transforms into a trio: yellow Scorpions worth 1,000 (stages 4-6), green Bosconian Spy Ships worth 2,000 (8-10), Galaxian Flagships worth 3,000 (12-14), then repeating ([StrategyWiki Walkthrough, snippet](https://strategywiki.org/wiki/Galaga/Walkthrough); flagship value corroborated at [Namco Wiki](https://namco.fandom.com/wiki/Galaxian_Flagship)) | Full cycle implemented: `transformTypeFor` (`stages.js`) and `transformSetPoints` (`scoring.js`), priced per set of three. Each type has its own 16 x 16 pixel-art sprite, authored in `src/art/pixelArt.js` and generated as a texture at run time | matches (art original, not the ROM's) |
| Stage flag denominations | 1, 5, 10, 20, 30, 50, combined greedily — stage 99 shows 50+30+10+5+four 1s ([StrategyWiki Gameplay, snippet](https://strategywiki.org/wiki/Galaga/Gameplay); independently corroborated by the `StageBadges` tuple `stage_1 stage_5 stage_10 stage_20 stage_30 stage_50` in [ihalseide/Galaga `source/constants.py`](https://github.com/ihalseide/Galaga/blob/master/source/constants.py)) | Same six values, greedy largest-first (`stages.js:70-91`) | matches |
| Stage flags drawn as flags | Yes, sprite flags | Six pixel-art pennants, one per denomination, each with its own colour *and* its own banner motif so they stay countable in greyscale (`FLAG_MOTIFS` in `src/art/pixelArt.js`, `createFlagTextures`) | matches (art original, not the ROM's) |
| Enemy hit sounds | Each rank of enemy has its own cry, and a Boss Galaga surviving its first hit sounds different from one dying | `deathSoundFor` picks per `EnemyType`, with a separate boss-stricken sound for the survived hit (`src/systems/audio.js`, `GameScene.destroyEnemy` / `onEnemyHit`) | matches |
| Player gun sound | Two alternating shot samples | `playerShotSound` alternates per trigger pull, so a dual fighter firing two at once does not lock to one sample | matches |
| Sounds in use | The cabinet is noisy: theme, coin, start jingle, dive, bomb, beam, capture, rescue, transform fanfare, extend chime, challenging-stage stings, death tune, a background pulse | All 28 of the repo's sound files are wired to those events (`SOUND_FILES`). Before the audio pass, 7 were, and `tests/audio.test.js` now reads `assets/sfx` off disk so a file cannot be added and then forgotten | matches |
| End-of-game results | Shots fired, number of hits, hit-miss ratio ([Data Driven Gamer](https://datadrivengamer.blogspot.com/2019/07/game-78-galaga.html)) | All three (`GameOverScene.js:61-68`, `stats.js`) | matches |
| Score ranking | The cabinet keeps a table of five and asks anyone who makes it for three initials, then shows the board on the attract screen | `loadScoreTable` / `scoreTableRank` / `insertScoreEntry` / `recordScore` in `persistence.js`, the entry panel in `GameOverScene`, and the board on both the results and title screens. Twenty-nine tests pin the ranking, the tie rule and the corrupt-storage fallbacks | matches |
| Name-entry music | A different tune for taking first place than for taking any other place | `highScoreEntry` for rank 0, `gameOverTune` otherwise (`GameOverScene.create`). Those are the repo's two `name_entry` files, which had been playing as a generic game-over sting | matches |
| HUD header | A blinking 1UP over the running score, HIGH SCORE over the board's best | Same (`GameScene.createHud`). The displayed high score is read from the top row of the board rather than kept beside it, so the header and the BEST 5 screen cannot disagree | matches |
| Enemy artwork | Zako a blue-and-yellow bee, Goei a red butterfly with blue wings, Boss Galaga the widest of the three | Hand-authored 16 x 16 pixel grids in `src/art/pixelArt.js`, generated NEAREST-filtered at exactly their drawn size. Original, drawn to the published descriptions, not traced from the ROM | matches (art original, not the ROM's) |
| The captured fighter | Drawn recognisably as the player's own ship | The player's grid in a different palette, so the silhouette is identical by construction and `tests/pixelArt.test.js` asserts it (`SHIP_RECOLOURS`) | matches |
| Display | 288 x 224 at 60.606 Hz, **vertical** orientation ([PixelatedArcade](https://pixelatedarcade.com/games/galaga/techspecs)) | 672 x 864 portrait (`config.js`) — exactly the cabinet's 7:9 ratio, scaled up for a browser | matches |
| Stage 255 rollover | Next stage announced as stage zero ([Wikipedia](https://en.wikipedia.org/wiki/Galaga)) | `nextStage` wraps 255 to 0 (`stages.js`). Everything a stage decides for itself wraps with it; difficulty does not, because it is driven from a separate count of stages played | matches |
| "No-fire" bug | Bugs firing at X=0 leak the 8-entry shot buffer until enemies can never fire again ([Computer Archeology](https://www.computerarcheology.com/Arcade/Galaga/), [Set Side B](https://setsideb.com/the-no-fire-trick-in-galaga/), [Jason Eckert](https://jasoneckert.github.io/myblog/the-galaga-no-fire-cheat-mystery/)) | Not present | **Do not implement.** Noted for completeness only; reproducing it would make the game silently unlosable and it disqualifies scores for world records. |

**Headline:** every number in the scoring table, the extra-life ladder, the formation
layout, the challenging-stage cadence, the flag denominations and the bullet limit is
correct, and so is the choreography built on top of them: one fixed entrance pattern per
stage flown as five flights of eight, dive-only enemy fire, a low tractor beam, the
diving-captor rescue rule, a captive that fights for the other side, the eight
challenging patterns, the transform bonus cycle, per-rank enemy audio, a stage counter
that rolls over at 255, and a BEST 5 board that takes three initials.

**What is still not authentic**, and is the honest remainder of this audit:

- **Which stage flies which entrance pattern is an assumption.** That there are three
  patterns and that one is fixed for the whole of a stage is sourced and is now how the
  code works; the specific stage-to-pattern mapping is not sourced anywhere that could
  be found, so `entrancePatternFor` cycles them in order. A player who knows the arcade
  would see the right *kind* of entrance, not necessarily the right one for stage 7.
- **All of the artwork is original, not the arcade's.** Every ship in the game -- the
  fighter, the fighter a boss takes, the Zako, the Goei, the Boss Galaga in both of its
  health states, the Scorpion, the Spy Ship and the Flagship -- plus the six stage flags
  are hand-authored pixel grids in `src/art/pixelArt.js`, drawn to the published
  descriptions of each ship. They are not traced from the ROM and are not claimed to match
  it pixel for pixel. The same is true of the flag colours, which could not be sourced --
  which is why each denomination also carries its own banner motif rather than relying on
  colour alone. This is a deliberate downgrade in fidelity: the Galaga-derived enemy PNGs
  that preceded them looked more like the cabinet and had no business in a public
  repository with a live demo.
- **`miss.mp3` is placed by inference, not by a source.** It plays when a Challenging
  Stage ends short of forty, which is the one moment in the game that wants a sound
  meaning "not quite". No source says that is what the file is for. Every other one of the
  28 is wired to an event the sources describe. `kill.mp3` survives as the generic burst
  for things that are not one of the three ranked enemies.

Also deliberately absent: the "no-fire" bug (see the last row of the table for why that
one stays out), and two-player alternating play, which needs a second set of everything
the machine tracks and would show up on a browser demo as a menu nobody uses.

---

## 2. Ranked gap list (historical -- every item below has been fixed)

This section is the original audit, kept as a record of what was wrong and why each fix
was made. **It describes the code as it was before the fixes, not as it is now.** The
"What is wrong" paragraphs are past tense in effect; the table in section 1 and the
remainder list above are the current state. Ranked, as originally written, by how
visible the gap was to someone watching a 30-second demo.

### 1. Entry choreography is a continuous 40-enemy stream, not five groups of eight

**What is wrong.** `GameScene.launchFormation` (`src/scenes/GameScene.js:251-262`) starts
all forty enemies on a flat 130 ms stagger and assigns each one a path by
`entryPath(index % 4, ...)`. Four different curves are therefore in the air
simultaneously and continuously for about five seconds. Galaga's opening is the exact
opposite: a tight single-file group flies one shared curve, finishes, and only then does
the next group start.

**Authentic value.** "At the beginning of each level, the enemies arrive in five groups
of eight enemies each"
(https://academickids.com/encyclopedia/index.php/Galaga). Entrance patterns are fixed per
stage, and there are three of them; the first is "the only pattern where enemies will
enter from both sides of the screen at the same time, with enemies entering single file
in short rows" ([StrategyWiki Walkthrough, snippet](https://strategywiki.org/wiki/Galaga/Walkthrough)).

**Where it changes.** `GameScene.launchFormation`, plus a new grouping helper in
`src/systems/formation.js` (an `entryGroups(stage)` returning five arrays of eight slot
indices) and a stage-indexed pattern selector in `src/systems/stages.js`. The path shapes
in `src/systems/paths.js:entryPath` stay usable; what changes is who flies which and when.

**Effort:** medium. Pure-side work is small and testable; the scene change is a loop
restructure.

### 2. Enemies shoot from inside the formation

**What is wrong.** `GameScene.scheduleDives` (`src/scenes/GameScene.js:320-324`) starts a
looping `fireTimer`, and `fireFromFormation` (`:709-718`) picks a random enemy whose mode
is `IN_FORMATION` and fires an aimed shot at the player. Galaga never does this. The
visual result is a static grid raining aimed bullets, which reads as Space Invaders or
Galaxian-with-extras rather than Galaga, and it is on screen for the whole demo.

**Authentic value.** "Enemies only drop bombs while they arrive or while they are in a
dive; they do not drop bombs while in formation."
(https://academickids.com/encyclopedia/index.php/Galaga). The entry-and-dive-only rule is
also what makes the no-fire bug possible at all, since the leaked shots come from bugs
"at the far left and right extremes of the board" while attacking
(https://setsideb.com/the-no-fire-trick-in-galaga/).

**Where it changes.** Delete `GameScene.fireFromFormation` and the `fireTimer` in
`GameScene.scheduleDives`; drop `formationFireIntervalMs` from
`stageDifficulty` in `src/systems/stages.js:62` and its test in `tests/stages.test.js`.
Compensate by raising dive frequency (`diveIntervalMs`) and dive bomb probability
(`DIVE.bombChance`, `src/config.js:41`) so the stage stays as dangerous.

**Effort:** small. This is mostly deletion.

Note that the existing timer-based design is the right *shape* — the comment at
`stages.js:53-60` correctly identifies that per-frame `Math.random()` firing ties
difficulty to refresh rate. The fix is to move that timer onto divers, not to reinstate
per-frame rolls.

### 3. Landscape display instead of Galaga's portrait screen

**What is wrong.** `SCREEN = { width: 800, height: 700 }` (`src/config.js:10`). The arcade
cabinet is a vertically-oriented monitor at 288 x 224 rotated to portrait. A near-square
landscape play field changes the entire feel: dives are short, the player has too much
horizontal room relative to vertical, and the formation looks squat.

**Authentic value.** "288 x 224 @ 60.606061 Hz", vertical orientation
(https://pixelatedarcade.com/games/galaga/techspecs).

**Where it changes.** `src/config.js:10` only, in principle — `paths.js`, `formation.js`
and `GameScene` all derive from `SCREEN` fractions. In practice `FORMATION.topY`,
`FORMATION.spacingX/spacingY`, `PLAYER.y`, the HUD text positions in
`GameScene.createHud`/`drawFlags`, and `ENTRY_FLOOR_FRACTION` in `paths.js:94` are all
absolute or tuned to the current ratio and will need re-tuning. A 3:4 field such as
576 x 768 keeps the arcade proportion while staying readable in a browser.

**Effort:** medium. One constant, then a re-tuning pass and a re-run of
`entryPathsStayAbovePlayer` in `tests/paths.test.js`.

### 4. The tractor beam opens at mid-screen instead of low on the field

**What is wrong.** `GameScene.attemptCapture` (`src/scenes/GameScene.js:398-404`) tweens
the boss to `SCREEN.height * 0.42` and opens the beam there, with the beam sprite scaled
`0.32 x 0.9` and its own hold timer. In the arcade the capture boss comes almost all the
way down, which is what makes the beam feel like a trap the player has to steer around
rather than a hazard hanging in the middle of the screen. This is the signature mechanic
and the one thing a demo viewer will be waiting for.

**Authentic value.** The Boss Galaga "peels off and dives straight down in a markedly
different pattern from the usual one-loop off the side, stops two inches above the bottom
of the screen, and a strange sound begins as a fan-shaped blue energy field emanates from
the bottom of the Boss Galaga"; if the fighter is out of range "eventually it retracts and
the Boss Galaga drops straight down to return to formation"
([StrategyWiki Walkthrough, snippet](https://strategywiki.org/wiki/Galaga/Walkthrough)).
On success, "FIGHTER CAPTURED" is displayed.

**Where it changes.** `GameScene.attemptCapture` (descent target), `GameScene.openBeam`
(beam anchor and vertical extent), `CAPTURE.descendDurationMs` / `beamWidth` in
`src/config.js:45-55`, and `GameScene.updateBeam` (`:817-833`) whose capture test
`this.player.y < this.beam.y + 140` assumes a long beam hanging from mid-screen. Add the
"FIGHTER CAPTURED" banner via the existing `showBanner`.

**Effort:** small.

### 5. Rescue does not require the captor to be diving, and the captive is inert

**What is wrong.** Two related problems in the capture cycle:

- `GameScene.onEnemyHit` (`:558-564`) rescues the captive whenever the flagged enemy dies,
  regardless of whether that boss was diving or parked in formation. The arcade rule is
  the opposite and it is the whole risk of the mechanic.
- The captive is `this.add.image(...)` (`:486-489`) with no physics body, so it cannot be
  shot. The `CAPTIVE_DESTROYED` transition in `src/systems/capture.js:68` is therefore
  dead code, and the 1,000-point payout for shooting your own fighter has nowhere to fire.
  The captive also never attacks.

**Authentic value.** "Once a Fighter is captured, rescue it (but don't shoot it) from a
diving Boss Galaga (not in formation) to have it rejoin you for double fire power." If you
shoot the captor while it is in formation, "eventually the captured Fighter will swoop
down on you... it will disappear off the bottom of the screen and go away." Shooting your
own fighter is worth 1,000 points but loses it permanently
([StrategyWiki Walkthrough, snippet](https://strategywiki.org/wiki/Galaga/Walkthrough)).

**Where it changes.** `GameScene.onEnemyHit` / `GameScene.rescueCaptive`
(`src/scenes/GameScene.js:496-513`); promote the captive to a physics sprite in a new
group and register an overlap in `GameScene.registerCollisions`; add a
`canRescue(state, captorMode)` predicate to `src/systems/capture.js` so the rule is
testable; wire `CAPTURED_FIGHTER_POINTS` (`src/systems/scoring.js:33`) to the
shot-your-own-captive path as well.

**Effort:** medium.

### 6. The dual fighter has no hitbox, so it is a pure upgrade

**What is wrong.** `GameScene.dockCaptive` (`:522-525`) creates the second ship as
`this.add.image`, and every player collider in `GameScene.registerCollisions`
(`:198-212`) tests only `this.player`. Bullets and divers pass through the right-hand
ship harmlessly. Combined with `onPlayerHit`'s dual-absorbs-a-hit branch (`:585-593`),
the dual fighter is strictly better than a single fighter with no cost at all, which
removes the risk-reward decision the mechanic exists to create.

**Authentic value.** The dual fighter "doubles your firing capacity... but also doubles
your chances of getting hit"
(https://datadrivengamer.blogspot.com/2019/07/game-78-galaga.html); it is "a much wider
target".

**Where it changes.** Make `this.dualFighter` a `this.physics.add.sprite` and add it to
the existing overlaps in `GameScene.registerCollisions`, routing a hit on it through the
same `CaptureEvent.DUAL_HIT` path.

**Effort:** small.

### 7. Transform bonus enemies are absent

**What is wrong.** From stage 4 the arcade periodically pulls a Zako out of formation,
pulsates it, and turns it into a trio of high-value bonus enemies. Nothing in this repo
does that, so stages 4 onward are visually identical to stages 1-2 apart from speed.

**Authentic value.** Yellow Scorpions worth 1,000 for the set of three (stages 4-6), green
Bosconian Spy Ships worth 2,000 (stages 8-10), Galaxian Flagships worth 3,000 (stages
12-14), then repeating in the same order
([StrategyWiki Walkthrough, snippet](https://strategywiki.org/wiki/Galaga/Walkthrough); the
3,000 flagship value is corroborated at
https://namco.fandom.com/wiki/Galaxian_Flagship). Note the scoring here is per set of
three, not per enemy — an important distinction if this is implemented.

**Where it changes.** New `transformFor(stage)` in `src/systems/stages.js` returning the
type and set value; a `TRANSFORMING` mode in `src/entities/enemy.js:13-20`; a scheduler
in `GameScene` alongside `scheduleDives`; a set-completion bonus in
`src/systems/scoring.js`. Also needs art the repo does not currently have, which conflicts
with the "no new art" non-goal in `docs/superpowers/specs/2026-07-31-galaga-rebuild-design.md:90`.

**Effort:** large (mostly because of the art and the set-tracking bonus).

### 8. Only four challenging-stage patterns, launched as one long stream

**What is wrong.** `challengingPath` in `src/systems/paths.js:237` selects with
`pattern % 4`, and `challengingPatternIndex` in `src/systems/stages.js:34` is unbounded,
so patterns 4-7 silently alias back onto 0-3. `GameScene.launchChallengingStage`
(`:275-284`) then launches all forty on a flat 110 ms stagger down a single pattern
rather than in five waves.

**Authentic value.** There are eight distinct challenging stages, repeating after stage 31
([StrategyWiki Walkthrough, snippet](https://strategywiki.org/wiki/Galaga/Walkthrough);
corroborated by
https://www.retrogamedeconstructionzone.com/2020/05/metamorphosis-from-galaxian-to-galaga.html
— "eight distinct bonus rounds, the last of which won't be seen until you pass stage 30").
Each consists of five waves of eight
([StrategyWiki Walkthrough, snippet](https://strategywiki.org/wiki/Galaga/Walkthrough)).

**Where it changes.** Add four more shapes to `challengingPath` and change `% 4` to `% 8`;
group the launch in `GameScene.launchChallengingStage` into five waves of eight.

**Effort:** medium (four new authored curves is the bulk of it).

### 9. Non-authentic 180 ms fire cooldown

**What is wrong.** `PLAYER.fireCooldownMs = 180` (`src/config.js:16`), enforced at
`GameScene.fire` (`:793`). Galaga gates the player purely on the two-shot limit and how
long each shot stays alive — a shot that connects frees its slot instantly, which is the
mechanical reason accuracy is worth tracking. A flat cooldown breaks that link and makes
close-range play feel sluggish.

**Authentic value.** "Your shot will travel to the top of the screen if it hits nothing,
and then you have to wait to shoot again. If you hit something, you can immediately fire
again. The two bullet limit is still in place"
(https://steamcommunity.com/sharedfiles/filedetails/?id=2926871061).

**Where it changes.** Remove `fireCooldownMs` from `src/config.js` and the cooldown check
in `GameScene.fire`/`GameScene.updatePlayer`. The existing `bulletLimit` from
`src/systems/capture.js:115` already does the correct gating on its own.

**Effort:** small.

### 10. No cap on enemy shots

**What is wrong.** `GameScene.fireEnemyBullet` (`:762`) creates a bullet unconditionally.
The arcade reserves exactly eight sprites for enemy shots, which is a real difficulty
ceiling at high stages.

**Authentic value.** "The game reserves exactly eight hardware sprites for enemy shots"
(https://setsideb.com/the-no-fire-trick-in-galaga/).

**Where it changes.** Early return in `GameScene.fireEnemyBullet` when
`this.enemyBullets.countActive(true) >= 8`; put the constant in `src/config.js`.

**Effort:** small.

### 11. Boss Galaga colours are inverted relative to the documented behaviour

**What is wrong.** `ENEMY_TEXTURE.boss = 'enemyBossPurple'` (`src/config.js:75`) with a
blue tint applied on damage (`GameScene.js:547`). The available sources describe a green
boss that changes colour on the first hit; they disagree on whether the damaged colour is
blue or purple, but both agree purple/blue is the *damaged* state, not the healthy one.
The repo also uses `enemyBossRed` for Goei, which is defensible — Goei are the red
butterflies.

**Authentic value.** Boss Galaga "can take two hits, turning from green to purple on the
first hit"; an alternative account says it "turn[s] blue when hit once"
(https://www.ssbwiki.com/Boss_Galaga, https://galaxian.fandom.com/wiki/Boss_Galaga).
Because the sources conflict on the damaged colour, treat only "healthy is green,
damaged is not green" as established.

**Where it changes.** `src/config.js:73-77` and the tint at `GameScene.js:547`. Needs a
green boss asset the repo does not have; a green `setTint` on the existing sprite is a
zero-asset approximation.

**Effort:** small.

### 12. Stage flags are rendered as numbers, not flags

**What is wrong.** `GameScene.drawFlags` (`:924-930`) draws the text "50", "30" and so on.
The arcade draws distinct flag sprites. The arithmetic underneath is correct — greedy
largest-first over 50/30/20/10/5/1, which reproduces stage 99 as 50+30+10+5+four 1s — so
this is purely a rendering gap.

**Where it changes.** `GameScene.drawFlags` plus six small assets. `stageFlags` in
`src/systems/stages.js:78-91` needs no change.

**Effort:** small (rendering) / medium (art).

---

## 3. What this repo already does better than typical clones

The clones surveyed, with what was actually inspected:

| Repo | Language | Stars | Tests present? |
|---|---|---|---|
| [ihalseide/Galaga](https://github.com/ihalseide/Galaga) | Python / pygame | 16 | No — repository root contains no `tests/` directory and no `*_test.py` anywhere |
| [hoorayimhelping/Galaga5](https://github.com/hoorayimhelping/Galaga5) | JavaScript / canvas | 18 | No — ten `.js` files at repo root, no test file, no package manifest |
| [whoisryosuke/bevy-galaga](https://github.com/whoisryosuke/bevy-galaga) | Rust / Bevy | 20 | No — the entire game is one 21,053-byte `src/main.rs`, no `#[cfg(test)]` module, no `tests/` |
| [PatrickKalkman/python-pygame-galaga](https://github.com/PatrickKalkman/python-pygame-galaga) | Python / pygame | 8 | Barely — `tests/` holds `__init__.py` (0 bytes) and `splash_test.py` (880 bytes). One screen-state test; zero gameplay-rule tests |
| [goswami-rahul/alien-invasion-game](https://github.com/goswami-rahul/alien-invasion-game) | Python / pygame | 35 | No — no `tests/` directory |

Against that field, three things here are genuinely unusual.

**1. Game rules are a pure, dependency-free layer with real coverage.**
`src/systems/` plus `src/art/pixelArt.js` is ten modules that import nothing from Phaser,
and `tests/` is 244 `it()` cases across ten files (`audio` 12, `capture` 29, `flight` 11,
`formation` 31, `paths` 26, `persistence` 46, `pixelArt` 24, `scoring` 19, `stages` 39,
`stats` 7). Four of the five clones above have no tests at all; the fifth has one. This is
not a marginal difference in degree. It extends to the artwork: because every ship is data
rather than a PNG, "is this ship symmetric about its centre line" and "does the damaged
boss still have the healthy boss's silhouette" are unit tests rather than a squint.

**2. The scoring table is actually correct.** This matters more than it sounds. The most
complete pygame clone in the list, `ihalseide/Galaga`, awards a flat 400 for both Bee and
Butterfly and 800 for the boss
([`source/play.py`](https://github.com/ihalseide/Galaga/blob/master/source/play.py)) — a
table that matches no authentic value in the game, with no in-formation/diving split and
no escort tiers. This repo reproduces all eleven authentic scoring values plus the
20k/70k/70k extra-life ladder, and pins them in `tests/scoring.test.js`.

**3. Capture is a state machine, not a pile of booleans.** `src/systems/capture.js`
models the whole capture/rescue cycle as an explicit seven-state transition table with an
ignore-unknown-event rule, so an orphaned timer callback cannot corrupt it. None of the
surveyed clones implement capture at all — `Galaga5` has no capture, no formation grid and
an entirely empty `secondWave()` body; `bevy-galaga` has none; `ihalseide/Galaga` has none
and in fact never spawns enemies at all, with `next_stage()` carrying a literal
`# TODO: add enemies`. `PatrickKalkman/python-pygame-galaga` is a Bezier path *editor*
companion to a tutorial article rather than a playable Galaga.

**4. Frame-rate independence is handled deliberately.** `src/systems/flight.js` advances
on a millisecond delta and returns a new flight rather than mutating, and the comment at
`src/systems/stages.js:53-60` documents a real bug that was fixed: per-frame
`Math.random() < fireChance` made the same stage twice as hard on a 144 Hz display. By
contrast `Galaga5`'s `EnemyManager` mixes a `timeScalar` with raw per-frame constants
(`this.enemies[i].frame.x += 1 * modifier * timeScalar` alongside
`enemy.frame.x -= Math.pow(timeScalar, 0.5)`), which is the class of bug this repo went
out of its way to eliminate.

**One place a clone does something better.**
`PatrickKalkman/python-pygame-galaga` stores its Bezier control points as data
(`control_points.txt`) edited by an interactive tool, and its `bezier/path_point_selector.py`
explicitly maintains the relationship between a path point and the two control handles
either side of it, so adjacent cubic segments stay smooth at the join. This repo's paths
are hand-written literals in `src/systems/paths.js` with no continuity guarantee: at a
segment boundary the incoming and outgoing tangents are not constrained to be collinear,
so a path can kink. `tangentAngle` (`paths.js:63-69`) hides this by sampling numerically
across the boundary, but the geometry itself can still turn a corner. Extracting the
control points to data and adding a `pathIsSmooth` assertion to `tests/paths.test.js`
would be a cheap improvement and would make gap 8 (four more challenging-stage shapes)
much less painful to author.

---

## 4. What the second pass closed

The first revision of this report ended with three admitted gaps. All three are now
closed, each the same way: put the rule in a pure module, test it there, and leave the
scene doing nothing but Phaser.

**Entrance patterns are fixed per stage.** `entrancePatternFor(stage)` in
`src/systems/stages.js` picks one of three, and `buildEntryGroups(pattern)` builds all
five flights from it. Each flight member now carries the curve it flies and its `step` in
the launch order, which is what lets the first pattern -- the sourced "only pattern where
enemies enter from both sides at the same time" -- pair its members two to a step while
the other two stay single file. `assemblyDurationMs` reads the last step off the groups
rather than assuming eight, so the paired pattern's shorter assembly is not padded.
Six tests in `tests/formation.test.js` pin the shapes, including that exactly one of the
three enters from both sides at once.

**The captive fights.** `captiveCanBomb(state, captorIsDiving)` in `capture.js` is the
rule; the scene rearms the held ship when its captor begins a dive and fires at the same
point of the run the captor bombs from, so the pair of shots arrives together. When the
captor is shot down *in formation* the captive no longer drops off the screen: it flies
`captiveEscapePath` -- break away, converge on the player's column, one shot, out through
the bottom -- and can ram the player on the way. That is what makes taking the wrong shot
at a captor cost something beyond the forfeited rescue.

**The artwork is drawn, not borrowed.** `src/art/pixelArt.js` holds hand-authored pixel
grids and a strict parser; `src/art/textures.js` turns them into NEAREST-filtered
textures at run time. The three transform ships are 16 x 16, the size the arcade's own
sprites are, and are generated at exactly their drawn size so nothing is resampled. The
six flags are 10 x 12 pennants with per-denomination motifs. Because the art is data, it
is testable: `tests/pixelArt.test.js` asserts every ship is symmetric about its centre
line, which is the failure mode of hand-edited pixel grids, and that no two types share a
silhouette.

**And one gap the first pass never listed: the game was almost silent.** The repo shipped
28 sound files and used seven. The Boss Galaga's cry, the two alternating fighter shots,
the transform fanfare, the extra-life chime, the challenging-stage stings, the title
theme, the coin, the start jingle, the death tune and the background pulse were all
present and unreferenced. `src/systems/audio.js` is now the manifest and the selection
rules -- `deathSoundFor` gives each rank its own cry and distinguishes a boss surviving
its first hit from one dying, `playerShotSound` alternates per trigger pull -- and
`tests/audio.test.js` asserts the selection rules can never name a sound the manifest does
not load. 27 of the 28 files are wired.

## 5. What the third pass closed

The second revision ended with three admitted remainders and one row of the table still
reading "missing". All of it is now closed except the entrance-pattern mapping, which
cannot be closed without a source.

**The stage counter rolls over.** `nextStage` in `stages.js` wraps 255 to 0, which is what
the arcade's single-byte counter does, and the stage after 0 is 1 again. Everything a stage
decides for itself -- its entrance pattern, whether it is a Challenging Stage, which
transform enemy it produces, how many flags the HUD draws -- is derived from that number
and therefore wraps with it. Difficulty deliberately does not: `GameScene` keeps a separate
monotonic count of stages played and drives `stageDifficulty` from that, because handing a
player who has survived 255 stages the opening round's dive interval would be a bug wearing
a rollover's clothes.

**The cabinet's board is back.** Galaga does not keep one number, it keeps five names, and
it asks anyone who makes the table for three initials. `persistence.js` now holds the
ranking rules -- where a score lands, that a tie does not displace the score it matched,
that a scoreless run never qualifies, and that every corrupt-storage path falls back to the
factory ladder rather than to an empty board -- and `GameOverScene` has the entry panel.
The two `name_entry` sound files, which had been doing duty as a generic game-over sting,
now play the parts they were recorded for: one tune for taking first place, another for
taking any other place. The HUD's HIGH SCORE reads the top row of that board rather than a
second stored number, so the header and the BEST 5 screen cannot disagree.

**Every ship is drawn, and the borrowed sprites are gone.** The second pass authored the
three transform ships and the six flags as pixel grids; this one finished the job. The
fighter, the captured fighter, the Zako, the Goei and the Boss Galaga in both health states
are now 16 x 16 grids in `src/art/pixelArt.js`, generated NEAREST-filtered at exactly their
drawn size and used at scale 1. `assets/images/galaga_enemy_*.png`, `mainship.png` and
`capturedShip.png` have been deleted.

That last part is the one change here that *costs* fidelity, and it is worth being straight
about why it was made anyway. Those PNGs looked more like the cabinet than anything drawn by
hand will. They are also Bandai Namco's artwork, sitting in a public repository with a live
demo. Replacing them buys three things: the repository can honestly say its art is its own,
the boss's two health states become two palettes over one grid rather than a green tint laid
over purple artwork, and the whole sprite sheet becomes testable data -- `tests/pixelArt.test.js`
asserts every ship is symmetric about its centre line, that the four ranks have four different
silhouettes, and that each recolour is pixel-identical to the ship it recolours.

**And the last sound.** `challengeResultSound` gives `miss.mp3` the one event that fits it:
a Challenging Stage that ended short of forty. All 28 files are now wired, and
`tests/audio.test.js` reads `assets/sfx` off disk and fails if a file is added without an
event, which is how the previous twenty-one came to be sitting there unreferenced in the
first place.

## 6. What the fourth pass closed

The third pass ended claiming one open remainder: the stage-to-entrance-pattern mapping, "which
cannot be closed without a source". A source was then found — a reverse-engineering corpus derived
from the Galaga Z80 ROM, at
[`ZaneLogi/ZaneLogi.github.io/galaga_clone`](https://github.com/ZaneLogi/ZaneLogi.github.io/tree/main/galaga_clone),
citing routine addresses and data tables directly. It settled that item and overturned four others
this report had recorded as "matches". The full pass is in
[`galaga-audit-2026-07-31-pass4.md`](galaga-audit-2026-07-31-pass4.md); what changed here:

**Four rows of the table in section 1 were wrong.**

- *Boss damage colour.* The table recorded the sources as disagreeing between blue and purple and
  said purple was taken. The ROM account is unambiguous — "the first hit changes the boss's palette
  from green to blue" — so `BOSS_DAMAGED` is blue.
- *The captured fighter.* Drawn drained, in grey and violet. On capture the arcade "recolors to red
  (sprite code 7)" and holds it. Now red.
- *Transform bonus scoring.* Priced per set of three, with a partial set worth nothing, on the
  reading that the sources only quoted a per-set figure. A per-ship figure of 160 exists alongside
  them, so `transformKillPoints` pays 160 a ship and the set bonus on the third.
- *Entrance patterns.* Three, cycling `(stage - 1) % 3`. The ROM holds thirteen caravan rows indexed
  through a seventeen-row-per-rank table with a wrap past stage 23. `combatStageIndex` reproduces
  that index arithmetic; the three authored shapes remain three, and the code now says which half of
  that is authentic.

**Five behaviours were missing rather than wrong.**

The capture boss did not aim at the player, so the beam opened over whatever column the boss
happened to occupy; captures ran off a bare twelve-second clock with no stage or enemy-count gate;
stage 1 bombed, where the arcade's opening difficulty row disables bombing outright; the transform
trio never fired; and the challenging stage flew the full 4/16/20 formation roster rather than one
rank plus four Boss Galaga. All five are closed, the rules test-first in `src/systems/stages.js`
and `src/systems/scoring.js`.

**And the cabinet around the game arrived.** Sections 1-5 audit the game between "STAGE 1" and
"GAME OVER" and never look either side of it. Galaga's attract mode — logo, the chart of what every
enemy is worth, the bonus ladder, the board — is the part a passer-by sees before deciding to play,
and none of it existed. `TitleScene` is now that loop, with every figure on the value chart read
from `scoreFor()` at draw time so the chart cannot drift from the table it documents. Demo play, the
one part of the attract cycle where the machine plays itself, is still not implemented.

## 7. Overall verdict

The numbers were right from the start and everything else has since caught up. Every
constant that can be looked up in a strategy guide — scoring, extra lives, formation
composition, challenging-stage cadence, flag denominations, bullet limits, boss hit
points — is authentic and unit tested, and so are the behaviours that were originally
missing: a fixed entrance pattern per stage flown as five flights of eight, dive-only
bombing, an eight-bomb ceiling, a low tractor beam, the diving-captor rescue rule, a
captive that bombs on its captor's dive and swoops at the player when it is lost, a dual
fighter that is a real target, eight challenging patterns in five waves of eight, the
Scorpion / Spy Ship / Flagship transform cycle priced per set of three, and per-rank
enemy audio over a background pulse.

What remains is listed at the end of section 1 and is narrower than what it replaced:
the stage-to-entrance-pattern mapping is an assumption on top of a sourced rule, one
sound file is placed by inference, and every sprite is original pixel art drawn to
published descriptions rather than the ROM's own. None of the three is a rule error.

The rules layer that carries all of this is 244 unit tests across ten Phaser-free
modules. Against the five clones surveyed in section 3 — four with no tests at all and
one with a single screen-state test — that is the part of this repo least likely to be
matched.

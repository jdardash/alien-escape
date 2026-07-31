# Galaga fidelity report

Date: 2026-07-31
Scope: `alien-escape` at commit-time state of `src/` (systems, entities, scenes) versus
Namco's 1981 arcade *Galaga*, plus a comparison against public open-source Galaga clones.

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
| Boss damage colour | Green at full health, changes on the first hit (sources disagree: "blue" vs "purple") ([search corroboration](https://www.ssbwiki.com/Boss_Galaga)) | Purple sprite at full health, tinted blue when damaged (`config.js:75`, `GameScene.js:547`) | differs |
| Extra lives | 20,000, then 70,000, then every 70,000 (factory DIP default) ([Academic Kids](https://academickids.com/encyclopedia/index.php/Galaga); [Museum of the Game DIP tables](https://www.arcade-museum.com/tech-center/game-dips/galagao)) | 20,000 / 70,000 / every 70,000 (`src/systems/scoring.js:80-98`) | matches |
| Starting lives | 3 (factory DIP default) ([Museum of the Game DIP tables](https://www.arcade-museum.com/tech-center/game-dips/galagao)) | 3 (`src/config.js:20`) | matches |
| Player bullets on screen | 2, or 4 with the dual fighter ([Steam community guide](https://steamcommunity.com/sharedfiles/filedetails/?id=2926871061); [Data Driven Gamer](https://datadrivengamer.blogspot.com/2019/07/game-78-galaga.html)) | 2 / 4 (`src/systems/capture.js:115-117`) | matches |
| Fire-rate gate | None beyond the bullet limit and shot lifetime — a shot that hits frees its slot immediately ([Steam community guide](https://steamcommunity.com/sharedfiles/filedetails/?id=2926871061)) | Additional 180 ms cooldown (`config.js:16`, `GameScene.js:793`) | differs |
| When enemies fire | "Enemies only drop bombs while they arrive or while they are in a dive; they do not drop bombs while in formation." ([Academic Kids](https://academickids.com/encyclopedia/index.php/Galaga)) | Also fires on a timer from enemies sitting in formation (`GameScene.js:320-324,709-718`) | differs |
| Max enemy shots on screen | 8 hardware sprites reserved for enemy shots ([Set Side B](https://setsideb.com/the-no-fire-trick-in-galaga/)) | Uncapped (`GameScene.js:762`) | missing |
| Entry to formation | "At the beginning of each level, the enemies arrive in five groups of eight enemies each" ([Academic Kids](https://academickids.com/encyclopedia/index.php/Galaga)); three distinct entrance patterns, fixed per stage ([StrategyWiki Walkthrough, snippet](https://strategywiki.org/wiki/Galaga/Walkthrough)) | All 40 launched individually on a 130 ms stagger, path chosen as `index % 4` of four hand-authored curves (`GameScene.js:251-262`, `paths.js:103-189`) | differs |
| Divers return to formation | Survivors exit and re-enter to rejoin the grid | Same (`GameScene.js:743-750`) | matches |
| Formation motion | Formation sways and "throbs like a living thing" ([Retro Game Deconstruction Zone](https://www.retrogamedeconstructionzone.com/2020/05/metamorphosis-from-galaxian-to-galaga.html)) | Sinusoidal breathe plus sway (`formation.js:73-84`) | matches (qualitatively) |
| Tractor beam trigger | A Boss Galaga "peels off and dives straight down in a markedly different pattern from the usual one-loop off the side, stops two inches above the bottom of the screen", then the beam fans downward ([StrategyWiki Walkthrough, snippet](https://strategywiki.org/wiki/Galaga/Walkthrough)) | Boss tweens to `height * 0.42` (mid-screen) and opens the beam there (`GameScene.js:398-404`) | differs |
| Capture cost | Costs the player a life ([Wikipedia](https://en.wikipedia.org/wiki/Galaga)) | `loseLife()` on capture complete (`GameScene.js:493`) | matches |
| Capture on last ship | Game over ([search corroboration](https://tvtropes.org/pmwiki/pmwiki.php/VideoGame/Galaga)) | Game over via `loseLife()` -> `endGame()` (`GameScene.js:605-612`) | matches |
| Rescue condition | Must destroy the captor **while it is diving**, not while it sits in formation; killing it in formation loses the captive, which then dives at the player ([StrategyWiki Walkthrough, snippet](https://strategywiki.org/wiki/Galaga/Walkthrough)) | Rescue fires whenever the captor dies, in any mode (`GameScene.js:558-564`) | differs |
| Captive behaviour while held | Joins the enemy side and attacks | Inert decorative image (`GameScene.js:486-489`) | missing |
| Shooting your own captive | 1,000 points, captive lost for good ([StrategyWiki Walkthrough, snippet](https://strategywiki.org/wiki/Galaga/Walkthrough)) | Not reachable: captive has no collider; `CAPTIVE_DESTROYED` transition exists but is never dispatched (`capture.js:68`) | missing |
| Dual fighter firepower | Two shots at a time, four on screen ([Data Driven Gamer](https://datadrivengamer.blogspot.com/2019/07/game-78-galaga.html)) | Two shots, limit 4 (`GameScene.js:799-802`, `capture.js:116`) | matches |
| Dual fighter drawback | "doubles your chances of getting hit" — wider target ([Data Driven Gamer](https://datadrivengamer.blogspot.com/2019/07/game-78-galaga.html)) | The second ship is `this.add.image`, has no physics body, and never participates in a collider (`GameScene.js:522-525`); collisions only test `this.player` (`GameScene.js:198-212`) | missing |
| Dual fighter takes a hit | Loses one ship, reverts to single | Same (`GameScene.js:585-593`) | matches |
| Challenging stage cadence | "The third stage and every 4th thereafter" ([Wikipedia](https://en.wikipedia.org/wiki/Galaga)) — 3, 7, 11, 15, ... | `(stage - 3) % 4 === 0` for stage >= 3 (`stages.js:12-15`) | matches |
| Challenging stage enemy count | 40 ([Academic Kids](https://academickids.com/encyclopedia/index.php/Galaga)) | 40 (`GameScene.js:275`) | matches |
| Challenging stage structure | Five waves of eight ([StrategyWiki Walkthrough, snippet](https://strategywiki.org/wiki/Galaga/Walkthrough)) | 40 individual launches on a 110 ms stagger, all on one pattern (`GameScene.js:275-284`) | differs |
| Challenging stage per-hit | 100 points ([Galaga Collection wiki, snippet](https://galaga.fandom.com/wiki/Challenging_Stage)) | 100 (`scoring.js:36`) | matches |
| Challenging stage perfect bonus | 10,000 ([Academic Kids](https://academickids.com/encyclopedia/index.php/Galaga)) | 10,000 (`scoring.js:39`) | matches |
| Challenging stage per-wave bonus | A per-wave bonus for clearing all eight of a wave is asserted by one snippet source but the value could not be confirmed | none | **unverified** |
| Challenging stage: enemies never fire, never dive | Correct — "aliens fly in a preset formation without firing at the player" ([Wikipedia](https://en.wikipedia.org/wiki/Galaga)) | Correct; player also cannot be hit by contact (`GameScene.js:202`) | matches |
| Distinct challenging stage patterns | Eight; they repeat after stage 31 ([StrategyWiki Walkthrough, snippet](https://strategywiki.org/wiki/Galaga/Walkthrough); corroborated by [Retro Game Deconstruction Zone](https://www.retrogamedeconstructionzone.com/2020/05/metamorphosis-from-galaxian-to-galaga.html): "eight distinct bonus rounds, the last of which won't be seen until you pass stage 30") | Four (`paths.js:237` uses `pattern % 4`) | differs |
| Transform bonus enemies | From stage 4, a Zako pulsates and transforms into a trio: yellow Scorpions worth 1,000 (stages 4-6), green Bosconian Spy Ships worth 2,000 (8-10), Galaxian Flagships worth 3,000 (12-14), then repeating ([StrategyWiki Walkthrough, snippet](https://strategywiki.org/wiki/Galaga/Walkthrough); flagship value corroborated at [Namco Wiki](https://namco.fandom.com/wiki/Galaxian_Flagship)) | Absent | missing |
| Stage flag denominations | 1, 5, 10, 20, 30, 50, combined greedily — stage 99 shows 50+30+10+5+four 1s ([StrategyWiki Gameplay, snippet](https://strategywiki.org/wiki/Galaga/Gameplay); independently corroborated by the `StageBadges` tuple `stage_1 stage_5 stage_10 stage_20 stage_30 stage_50` in [ihalseide/Galaga `source/constants.py`](https://github.com/ihalseide/Galaga/blob/master/source/constants.py)) | Same six values, greedy largest-first (`stages.js:70-91`) | matches |
| Stage flags drawn as flags | Yes, sprite flags | Drawn as text numbers (`GameScene.js:924-930`) | differs (cosmetic) |
| End-of-game results | Shots fired, number of hits, hit-miss ratio ([Data Driven Gamer](https://datadrivengamer.blogspot.com/2019/07/game-78-galaga.html)) | All three (`GameOverScene.js:61-68`, `stats.js`) | matches |
| Display | 288 x 224 at 60.606 Hz, **vertical** orientation ([PixelatedArcade](https://pixelatedarcade.com/games/galaga/techspecs)) | 800 x 700 landscape (`config.js:10`) | differs |
| Stage 255 rollover | Next stage announced as stage zero ([Wikipedia](https://en.wikipedia.org/wiki/Galaga)) | Not modelled; stage counts up indefinitely | missing (out of scope) |
| "No-fire" bug | Bugs firing at X=0 leak the 8-entry shot buffer until enemies can never fire again ([Computer Archeology](https://www.computerarcheology.com/Arcade/Galaga/), [Set Side B](https://setsideb.com/the-no-fire-trick-in-galaga/), [Jason Eckert](https://jasoneckert.github.io/myblog/the-galaga-no-fire-cheat-mystery/)) | Not present | **Do not implement.** Noted for completeness only; reproducing it would make the game silently unlosable and it disqualifies scores for world records. |

**Headline:** every number in the scoring table, the extra-life ladder, the formation
layout, the challenging-stage cadence, the flag denominations and the bullet limit are
correct. The gaps are all in *behaviour and choreography*, not in the rule constants.

---

## 2. Ranked gap list

Ranked by how visible the gap is to someone watching a 30-second demo, then by
correctness.

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
`src/systems/` is eight modules that import nothing from Phaser, and `tests/` is 128
`it()` cases across eight files (`capture` 17, `flight` 11, `formation` 17, `paths` 26,
`persistence` 13, `scoring` 16, `stages` 20, `stats` 8). Four of the five clones above have
no tests at all; the fifth has one. This is not a marginal difference in degree.

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

## 4. Overall verdict

The numbers are right and the behaviour is approximate. Every constant that can be looked
up in a strategy guide — scoring, extra lives, formation composition, challenging-stage
cadence, flag denominations, bullet limits, boss hit points — is authentic and unit
tested. What is missing is the arcade's *choreography*: grouped entry waves, dive-only
enemy fire, a low-hanging tractor beam, the diving-captor rescue rule, and the transform
bonus enemies. Fixing gaps 1, 2 and 4 alone would move the demo from "recognisably
Galaga-inspired" to "recognisably Galaga", and two of those three are net deletions of
code.

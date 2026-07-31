# Alien Escape

A Galaga tribute where the game rules live in pure, dependency-free ES modules that never import Phaser, so they can be unit tested headlessly. The Phaser scenes are thin orchestration over that logic.

## [Play it in your browser](https://jdardash.github.io/alien-escape/)

[![CI](https://img.shields.io/github/actions/workflow/status/jdardash/alien-escape/ci.yml?branch=main&label=CI)](https://github.com/jdardash/alien-escape/actions/workflows/ci.yml)
[![Tests](https://img.shields.io/badge/tests-129%20passing-success)](tests/)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![Build step](https://img.shields.io/badge/build%20step-none-lightgrey)](index.html)

![Alien Escape formation](docs/screenshots/formation.png)

---

## Why this repo is structured the way it is

Arcade game code has a well-known failure mode: the rules of the game get tangled into the rendering framework, and then nothing can be tested without spinning up a browser. The original version of this project had that shape, with 867 lines of gameplay logic living inside a single Phaser scene.

The rewrite draws one boundary and enforces it:

> **Nothing in `src/systems/` may import Phaser.** Pure functions in, plain values out.

```text
index.html            <script type="module" src="src/main.js">
lib/phaser.js         vendored, loaded as a classic script (no CDN dependency)
src/main.js           Phaser config, scene registration
src/config.js         tuning constants in one place
src/systems/          PURE. No Phaser import. Fully unit tested.
  formation.js        40-slot grid, breathing, sway, world placement
  paths.js            Bezier entry, dive, return and challenging-stage paths
  flight.js           frame-rate-independent traversal of a path
  scoring.js          score tables, extra-life thresholds
  stages.js           stage progression, challenging-stage cadence, difficulty
  capture.js          tractor beam capture and rescue state machine
  persistence.js      high score via injected storage
  stats.js            shots, hits, hit-miss ratio
src/entities/         sprite construction helpers
src/scenes/           Phaser-aware. Thin orchestration.
  TitleScene.js  GameScene.js  GameOverScene.js
tests/                vitest, headless, no canvas
```

Why it pays off:

- **The tests need no canvas, no DOM, no browser.** `vitest run` finishes the whole suite in about a second because there is nothing to boot.
- **No mocks.** A test for the scoring table calls `scoreFor()` with plain arguments. A test for the capture cycle drives a state machine with plain event strings. There is no fake scene to construct and no test double to keep in sync with a real implementation.
- **The rules are readable on their own.** Whether a Challenging Stage lands on stage 7 is answered by one function in `src/systems/stages.js`, not by tracing a scene's `update()`.
- **CI is trivial.** Lint and test, node only, no headless browser in the workflow. See [.github/workflows/ci.yml](.github/workflows/ci.yml).

The scenes still do real work, but it is orchestration: create sprites, read input, register collisions, and ask the systems layer what should happen. A deeper walkthrough of the frame flow, the formation math, and the Bezier path generation is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Galaga mechanics implemented

- **40-slot formation**: 4 Boss Galaga, 16 Goei, 20 Zako across five rows of a 10-column grid
- **Bezier entry flights**: four looping entry choreographies, staggered so a wave streams in and assembles into the grid
- **Formation breathing and sway**: the grid expands and contracts horizontally while drifting, clamped so the outermost column never leaves the screen
- **Dive attacks**: enemies peel out of formation along curved runs aimed at the player, exit through the bottom, and re-enter from the top back into their slot
- **Tractor beam capture**: a Boss Galaga descends, opens a beam, and pulls the fighter in; you lose a life but the ship is held above its captor
- **Dual fighter rescue**: destroy the captor without hitting your own ship and it docks, giving a double-width fighter with doubled firepower and a four-bullet limit instead of two
- **Boss Galaga takes two hits**
- **Challenging Stages** on stage 3 and every fourth stage after: enemies fly scripted patterns, never fire or dive, and clearing all forty pays a perfect bonus
- **Authentic scoring**: a target is worth more diving than in formation, and a diving boss is worth more again depending on how many Goei escort it down
- **Extra lives** at the arcade's factory thresholds (20,000, then 70,000, then every 70,000)
- **Stage flags** in the greedy largest-first denominations the arcade uses
- **Hit-miss ratio** reported at game over, which is what makes the two-bullet limit a scored constraint rather than an annoyance

## Defects found and fixed

These were found by reading the original `GameScene.js` before rewriting it. They are listed because finding them is the part of the work worth showing, not because any of them was hard.

| Defect | Why it mattered | Fix |
| --- | --- | --- |
| `highScore` assigned `0` in `create()` and never persisted | The on-screen HIGH SCORE silently reset on every page reload | `src/systems/persistence.js`, with storage injected so a sandboxed iframe or blocked site data degrades to memory instead of throwing |
| A debug cheat key (`keydown-THREE`, jump to stage 3) shipped to production | Anyone could skip to stage 3 on the live demo | Removed |
| `pullInterval` assigned twice, never read | Dead state that reads as meaningful | Removed |
| `enemyMoveDelay` computed in `spawnWave`, then unconditionally overwritten in `update` | The computed value could never take effect; the intent was unrecoverable from the code | Difficulty is now a single pure function, `stageDifficulty(stage)` |
| Formation bounds used `height / 2` in one place and `height / 3` in two others | Inconsistent bounds for the same conceptual limit | All tuning constants consolidated into `src/config.js` |
| The anti-overlap pass ran O(n^2) with its skip guard inside the inner loop instead of the outer | The guard did not skip the work it was written to skip | Replaced; formation positions are now computed directly from slot geometry, so no overlap pass is needed |
| Per-frame `Math.random() < fireChance` rolls for enemy fire | Tied difficulty to refresh rate: the same stage was roughly twice as hard on a 144Hz display | Fire and bomb release are driven by timers and by fixed points along a path, so behaviour is frame-rate independent |

## Testing

```bash
npm install
npm test        # vitest run  - 129 tests across 8 files
npm run lint    # eslint .
```

Every test targets `src/systems/`. There is no canvas, no jsdom game harness, and no Phaser instance anywhere in the suite.

**Deliberately not tested: Phaser rendering.** Verifying that a sprite drew at the expected pixel needs a browser harness and a screenshot baseline, and it would test Phaser rather than this project. The value is in the rules, so the rules are what is covered. The scenes are kept thin specifically so that the untested surface stays small.

## Run it locally

```bash
git clone https://github.com/jdardash/alien-escape.git
cd alien-escape
npm run serve     # python -m http.server 8000
```

Then open <http://localhost:8000>.

The project is native ESM with no bundler. **Opening `index.html` directly from the filesystem will not work** - browsers block `type="module"` scripts loaded over `file://` under the module CORS rules, and the game will fail to start. It has to be served over HTTP. Any static server will do; `npm run serve` just uses Python's built-in one so there is no extra dependency.

Because there is no build step, GitHub Pages serves the repository root unchanged. What runs locally is byte-for-byte what runs on the live demo.

## Controls

| Input | Action |
| --- | --- |
| `A` / `D` or arrow keys | Move |
| `Space` | Fire |

## Screenshots

| | |
| --- | --- |
| ![Title screen](docs/screenshots/title.png) | ![Formation](docs/screenshots/formation.png) |
| Title screen | Formation assembled |
| ![Dive attack](docs/screenshots/dive.png) | ![Tractor beam capture](docs/screenshots/capture.png) |
| Dive attack | Tractor beam capture |
| ![Dual fighter](docs/screenshots/dual-fighter.png) | ![Game over](docs/screenshots/gameover.png) |
| Dual fighter | Results with hit-miss ratio |

## Built with

| Technology | Role |
| --- | --- |
| Phaser 3 | Scene graph, arcade physics, input, audio. Vendored in `lib/`, not loaded from a CDN |
| JavaScript (ES2022 modules) | Game rules, all of it in `src/systems/` |
| vitest | Headless unit tests |
| ESLint 9 (flat config) | Linting, run in CI |
| GitHub Actions | Lint and test on push and pull request |
| GitHub Pages | Static hosting, serving the repo root with no build |

## Contributors

- [Josh Dardashti](https://github.com/jdardash)
- [Charles Li](https://github.com/Charlesli428)

## License

The code in this repository is MIT licensed - see [LICENSE](LICENSE).

Phaser 3, vendored in `lib/`, ships under its own MIT license and its own copyright. The sprites and audio under `assets/` are Galaga-derived and are used here for a non-commercial tribute; they remain the property of their respective owners and are not covered by this repository's license.

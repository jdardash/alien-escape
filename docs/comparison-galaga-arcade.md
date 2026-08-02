# Comparison with other open-source Galaga recreations

Date: 2026-08-01
Scope: a GitHub-wide survey for any project attempting what this repository
attempts -- a faithful, from-scratch recreation of Namco's 1981 arcade
*Galaga* -- and a feature-by-feature comparison against the closest match
found. The survey behind section 3 of `fidelity-report.md` covered casual
clones; this one looked specifically for fidelity-focused projects.

## 1. The field

Searches: top-starred repositories matching `galaga`, everything under
`topic:galaga`, and code searches for the fidelity markers this project
carries (the no-fire bug, the LFSR starfield). What exists divides cleanly:

**Emulators and FPGA cores** run the actual Z80 ROMs and are therefore
perfect replicas by construction -- but they re-implement nothing:

- [harbaum/galagino](https://github.com/harbaum/galagino) (538 stars) -- ESP32 emulator
- [MiSTer-devel/Arcade-Galaga_MiSTer](https://github.com/MiSTer-devel/Arcade-Galaga_MiSTer) -- FPGA gateware
- [opengateware/arcade-galaga](https://github.com/opengateware/arcade-galaga) -- FPGA gateware
- MAME itself, whose `starfield_05xx.cpp` is the only other public
  implementation of the starfield LFSR found anywhere on GitHub

**Gameplay-inspired clones** re-implement the surface without the machine:
[BlazorGuy/BlazorGalaga](https://github.com/BlazorGuy/BlazorGalaga)
(151 stars, the most popular), plus the pygame / Unity / Java field surveyed
in `fidelity-report.md` section 3. None attempt ROM-level behaviour.

**Fidelity-focused recreations** -- the category this project is in -- came to
exactly one project with a comparable ambition, and two footnotes:

- [ikan-tech1/galaga-arcade](https://github.com/ikan-tech1/galaga-arcade):
  "ROM-accurate web clone", Rust/WASM engine, WebGL2/React client. The only
  other project found that claims behaviour-level accuracy. Compared in
  detail below.
- [ChrisBrooksbank/galaga](https://github.com/ChrisBrooksbank/galaga):
  Rust/Bevy rebuild whose `GALAGA_RESEARCH.md` documents the no-fire bug;
  implementation depth unverified.
- [Sobevista/arcade-progression](https://github.com/Sobevista/arcade-progression):
  mentions the no-fire bug in scope documents only.

No project on GitHub was found that reproduces the cabinet layer this
repository has: the DIP switch blocks with coinage and bonus columns, a
service mode, the 63-star LFSR starfield in a reimplementation, the path
bytecode motion model, or the no-fire bug as running code behind an operator
switch.

## 2. Feature diff against ikan-tech1/galaga-arcade

From their `README.md` and `docs/feature-matrix.md` (self-reported; their
source was not audited). Features both projects share at similar depth --
formation, entry choreography, dive attacks, capture/rescue/dual fighter,
challenge stages, scoring, hi-score entry, attract demo, procedural audio,
deterministic tests -- are omitted.

### Where this repository goes deeper

| Area | ikan-tech1/galaga-arcade | This repo |
|---|---|---|
| Motion model | Transcribed waypoint tables (24-point entry, 32-point dive splines) | The ROM's actual mechanism: per-frame heading-delta byte programs interpreted at 60.606 Hz (`src/systems/pathcode.js`) |
| Entrance data | Four canonical entry groups | The 13-row x 18-byte caravan table in the ROM's own encoding, mirror and gate bits included (`src/systems/caravans.js`) |
| Difficulty | "Difficulty rank table" (resolution unstated) | The 4-rank x 26-stage x 10-parameter structure driving per-type launch counters (`src/systems/difficulty.js`, `src/systems/attack.js`) |
| Starfield | "ROM-style scrolling starfield + optional parallax" | The hardware's 63-star LFSR field with blink phases, direction control and the dead stop (`src/systems/starfield.js`) |
| Operator layer | Settings panel (difficulty, bonus, free play) | DIP switch blocks: lives, both bonus-fighter columns, four coinage models with a real coin box, attract sound, service mode with sound test (`src/systems/dips.js`, `ServiceScene`) |
| No-fire bug | Absent | Reproduced behind an operator switch, with score disqualification (`src/systems/attack.js`) |
| Two-player | Not claimed | Alternating play with per-player stage, score, accuracy and handover (`src/systems/players.js`) |
| Hi-score board | 10 entries (arcade keeps 5) | The cabinet's BEST 5 |

### What they had that this repository lacked -- now closed

Adopted in the pass this document belongs to:

- **Gamepad support** -- the cabinet's stick and button for anyone holding a
  real stick and button. Merge rules in `src/systems/controls.js`, wired in
  every scene.
- **Touch controls** -- first finger steers, second finger or a tap fires;
  a tap is a start button on the title, demo and results screens.
- **Freeze** -- their pause, done the cabinet's way: the DIP sheet has a
  FREEZE switch (MAME lists it), and P throws it. Physics, tweens, clock and
  sound all stop; nothing is stored.
- **Scanline overlay** -- their CRT effect, opt-in from the service screen
  and deliberately mild (`src/art/crt.js`).
- **Master volume** -- the volume pot on the PCB, a service-screen row
  applied to the whole sound manager (`src/systems/settings.js`).
- **PWA manifest** -- installable, portrait, with an original-art icon
  (`manifest.webmanifest`). No service worker: a static page that caches
  stale is worse than one that misses.

Already present here before the comparison: responsive integer-aspect
scaling (`Phaser.Scale.FIT` at the cabinet's 7:9), respawn grace,
first-input audio unlock (Phaser's own), hi-score entry and persistence.

### What they had that is declined, and why

- **Falling bonus-item drops** ("scorpion/spy/flag drops at deterministic
  kill ordinals, collected for points"). The arcade has no item drops of any
  kind. Scorpion, Spy Ship and Flagship are what a *transform* releases --
  three flying enemies, already implemented here as such. Copying the drop
  system would import a fabrication.
- **Extra fighters at 20K / 90K / 160K / 230K / 300K**. Matches no column of
  the cabinet's bonus DIP sheet. This repo carries both real columns.
- **10-entry hi-score table**. The cabinet ranks five.
- **Looping stage music**. Galaga has no continuous in-stage music; the
  game plays over the ambient pulse.
- **Multi-depth parallax starfield**. The hardware generates one field from
  one LFSR; parallax is a later game's look.
- **Bloom/vignette and a neon cabinet bezel**. Presentation beyond what the
  glass does; scanlines alone were adopted.

### Still theirs alone, worth considering later

- **A MAME golden-frame comparison harness** (`tools/mame-compare`):
  scripted input scenarios replayed against JSON goldens in CI. This repo
  has deterministic unit tests and Playwright flows, but nothing that
  compares behaviour against the real machine frame-by-frame. It is the one
  genuinely good idea in their tooling, and it is honest about what
  "ROM-accurate" should have to prove.

# Running with the arcade audio locally

Every sound this repository ships is synthesised. There is no audio file in it, and
the game downloads none: the 28 sounds are built from the specs in
[`src/audio/soundBank.js`](../src/audio/soundBank.js) when the page loads, and written
straight into Phaser's audio cache. That is what the public demo plays, and it is
deliberate — the same decision the ship artwork already reflects, applied to the half of
the project that had not caught up.

A local checkout can use different audio. If `assets/local/sfx/` exists with a manifest in
it, the files it names are loaded at startup and used in place of the synthesised sounds.

**`assets/local/` is in `.gitignore` and must stay there.** Nothing in it can reach the
repository, the demo, or a pull request. If you are keeping the arcade's own samples on
your own machine, that is where they go.

## Why this exists at all

The repository used to ship 28 mp3s under `assets/sfx/`, ripped from the Galaga ROM, and
serve them from a public GitHub Pages demo. That was a larger exposure than the enemy
sprites had ever been, for a reason worth stating plainly: a rip is byte-identical to its
source. Hand-drawn pixel art in the style of a Goei merely resembles one and would take an
argument to litigate; `zako_stricken.mp3` is the cabinet's file, and proving it takes a
checksum.

Calling the project a replica does not help. Attribution is not a licence, and naming the
work you copied is not a defence — it is the citation. Fair use does not turn on the label
either: the audio was reproduced whole, and Bandai Namco actively sells this game, so both
the amount taken and the effect on the market cut the wrong way.

The rules, timings, formation shapes and scoring tables are a different matter. Those are a
system rather than an expression, copyright does not reach them, and they are the part of
this project worth having copied accurately. So they are copied exactly, and the pixels and
the samples are not.

## Setting it up

Create the directory and drop your audio in, then write a manifest beside it:

```text
assets/local/sfx/
  manifest.json
  theme.mp3
  fighter_shot1.mp3
  ...
```

`assets/local/sfx/manifest.json`:

```json
{
  "theme": "theme.mp3",
  "fighterShot1": "fighter_shot1.mp3",
  "ambient": "ambient_loop.mp3"
}
```

Serve the game the usual way (`npm run serve`) and those three sounds are yours; the other
25 are still synthesised. There is no flag to set and no build step: the game probes for
the manifest every time it starts.

Any format the browser decodes will do — mp3, ogg, wav, m4a. Phaser's loader handles the
decode, so this is the same path a normal `load.audio` call takes.

## The sound names

Every key in [`SOUND_SPECS`](../src/audio/soundBank.js) is overridable, and
`tests/localAudio.test.js` pins that none of them is missed. They are:

| Group | Names |
| --- | --- |
| Player | `fighterShot1` `fighterShot2` `playerDeath` |
| Enemies | `zakoDeath` `goeiDeath` `bossHit` `bossDeath` `enemyDive` `enemyFire` `explosion` |
| Capture | `bossEntrance` `beamOpen` `beamCapture` `captured` `rescued` |
| Stages | `stageFlag` `challengeStart` `challengeClear` `challengePerfect` `challengeMiss` `transformSet` `extraLife` |
| Front of house | `theme` `coin` `gameStart` `ambient` `highScoreEntry` `gameOverTune` |

Every name is optional. A manifest naming only `theme` overrides the attract music and
leaves the other 27 synthesised, which is a reasonable way to compare the two.

`bossHit` is the one worth knowing about: it is the sound a Boss Galaga makes surviving its
first hit, and it has to be distinguishable from `bossDeath` or the player loses the cue
that a second shot is needed. The synthesised pair are built to differ — a warble with no
noise in it against a collapse — and `tests/soundBank.test.js` pins that they do. A local
manifest pointing both names at one file is not checked and will quietly remove the tell.

## How an override wins

There is no priority list. The manifest is probed in `preload`, the files it names load
under the plain sound key, and `installSoundBank` runs in `create` — by which point the
loader has finished. It writes a synthesised buffer for every key that is *not already in
the cache*, so anything the manifest successfully loaded is simply left where it is.

That falls back per sound rather than per manifest. A manifest naming eight files of which
one 404s gives you seven local sounds and one synthesised one, with a single console error
for the missing file and no other effect.

## What it does not change

Nothing but the samples. Which sound plays when is
[`src/systems/audio.js`](../src/systems/audio.js) and is unaffected; so are the per-play
volumes in the scenes, the two looping sounds' loop points, and the alternation of the two
gun shots. A local sound of a different length is simply a different length — nothing in
the game waits on a sound finishing.

The title screen prints `local audio` in its bottom-right corner whenever any override is in
use, and `local artwork + audio` when both are, so a recording made from a local checkout is
never mistaken for what the repository ships.

## Sharing it

The directory is the unit. Zip `assets/local/` — artwork and audio together — and hand it
to whoever is playing; they clone the repository normally and drop the folder in. Keep it
off anything public. The reason this mechanism exists at all is so that the cabinet's
assets and this repository stay separate.

## When it is not there

One request for `assets/local/sfx/manifest.json` fails at startup and the game plays its own
bank. That single 404 in the console is the whole cost of the feature for everyone who is
not using it.

## Working on the bank itself

[`src/audio/synth.js`](../src/audio/synth.js) is pure: a spec goes in, a `Float32Array`
comes out, and nothing in it touches an `AudioContext`. That is what lets
`tests/synth.test.js` and `tests/soundBank.test.js` listen to the whole bank under Node —
they assert pitch by counting zero crossings, check that no sound clips, and check that the
two looping sounds rejoin their own start without a click.

The vocabulary is small on purpose: five waveforms (`square`, `triangle`, `saw`, `sine`,
`noise`), an ADSR envelope, an exponential glide when `hz` is given as a pair, and optional
vibrato. `melody()` lays note names end to end for the tuned pieces. The noise source is a
16-bit shift register rather than `Math.random`, which is both what the cabinet's noise
circuit was and what keeps two runs of the game sounding identical.

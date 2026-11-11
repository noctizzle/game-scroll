# Testing Game Scroll quickly

How to check a change without waiting longer than you need to. Written for people and AI tools
(Claude Code, Codex, Gemini CLI...) working in this repo. The times below were measured on a
4-CPU cloud machine (2026-11-09), about what the GitHub PR check gets.

## First

- `npm ci` before anything else in a fresh checkout, and again after pulling a change to
  `package-lock.json`. A stale `node_modules` (say three 0.186 where the lock says 0.187) gives
  errors that look like real bugs.
- Most browser checks play the **built** app (`dist/`). Run `npm run build:bundled` (about 2 s) after
  every change and before them, or you test the old code. `budget.cjs`, `look-compare.cjs` and
  `perf-bench.cjs --profile` run the dev server instead and need no build.

## Which check for which change

| You changed | Run | Time |
| --- | --- | --- |
| One game file | `node scripts/game-lint.mjs <id>` (it also gives kit hints: advice, never a failure), `node scripts/game-types.mjs <id>`, `npm run games`, then `node scripts/smoke.cjs <id>` and `node scripts/stream-smoke.mjs <id>` | under 20 s |
| How games use `gs` (a kit, method, option or definition field that doesn't exist) | `npm run game-types` (every game against `src/gamescroll.d.ts`; `-- --self-test` checks the check, `-- --all` also lists what it leaves alone) | about a second |
| A 3D game (Console, Next Gen, AR) | add `node scripts/sweep.cjs <id>` | 20 s to 2 min |
| A game's speed | `node scripts/budget.cjs <id>` | about 25 s |
| Can the goal be reached? | `node scripts/playtest.cjs <id> [--budget 20] [--strict]`: a bot plays faster than real time and tries to win (see below) | about 20 s a game |
| Layout, cards, folding | `node scripts/fold.cjs [id ...]` | about 12 s |
| Feed swiping | `node scripts/feed-jank.cjs [swipes] [--filter nextgen]` (compare before and after, not with a phone) | about a minute |
| Shared game links, or how the feed starts (`src/share.js`, `openShared` and `playNow` in `src/main.js`, the catalogue in `src/remote.js`) | `node scripts/share-link.mjs [id]`: opens the streamed web app from a shared link on quick, slow and stale connections (builds what it needs) | about 30 s |
| A kit in `src/kit/` | `npm run kit-test`, then smoke the games that use it (`node scripts/pick-games.mjs` names the best few per style) | 3 s + games |
| What the app does around a game (screen kept on, finer touch, even pixels and the LCD look, the one-line soundtrack, the phone-only save) | `node scripts/app-test.cjs [awake\|touch\|pixels\|music\|saves]` after a build (`npm run app-test` does both) | about a minute |
| Sound (`src/sfx.js`, `src/kit/sound.js`, `instruments.js`) | `npm run sound-test [sounds\|band\|clock]`: renders the sound off screen and measures it (every ready-made sound is heard and none is too loud, the limiter holds, instrument sets are as loud as each other, the music clock keeps the beat through a frozen frame) | about 90 s |
| A starter template (`scripts/templates/`) | `npm run new zz-try --style <style>`, then lint, types and smoke it like any game, and delete it | under 30 s |
| The 3D look (hd3d, toon3d, post effects, a three.js update) | `node scripts/look-compare.cjs save base` **before** the change, `check base` after; add `--webgpu` to check the WebGPU path | about 16 s each |
| The AR kit (`ar3d.js`, `ar-floor.js`, `native-ar.js`) or a native AR plugin | `npm run kit-test` (rooms played through the floor search), then `node scripts/ar-floor.cjs [word] [--shots dir]`: Bin Flick against a pretend native AR phone ([ar-3d.md](ar-3d.md), Testing). Then AR Lab on a real phone | about 2 min |
| Next Gen / AR on WebGPU | `node scripts/gpu-games.cjs [id ...]` | about 25 s a game |
| Shaders built mid-round (hd3d `holdNew`) | `node scripts/shader-hold.cjs [--webgpu]` | about a minute |
| Frame generation | `node scripts/framegen-test.cjs --check` (8 suites against `scripts/framegen-test/baseline.json`; `--save` after a change meant to move the numbers), `node scripts/framegen-games.cjs [--jobs n]` | about 3 min, then 1 to 4 min |
| Engine speed (CPU per frame) | `node scripts/perf-bench.cjs [id ...] --json before.json` before, `--vs before.json` after (see below) | about 15 s a game per backend |
| The frame lab (`src/framelab.js`) | `node scripts/framelab-test.cjs [2d-id] [3d-id] [--shots dir] [--report file.html]` | about 3 min |
| How a game really runs (pacing, hitch causes, upscaler, frame gen) | the frame lab on a phone: QA panel › Frame lab, Rec, Report ([frame-lab.md](frame-lab.md)) | |
| Everything (before a big engine PR) | `node scripts/smoke.cjs` (all 162 games) | about 3.5 min |

The PR check (`.github/workflows/game-pr-check.yml`) runs the node checks (`npm run games`,
`licences`, `types-check`, `game-types`, the starter templates, `kit-test`, `brains`, `recommend`, `site`), the app and
sound checks when shared code changes, and then smoke, streamed,
fold, sweep, Tiny Brains, the AI playtester and budget on the changed games, split over several machines. When frame
generation's code changes it also runs `framegen-test.cjs --check`, and when the AR kit changes, `ar-floor.cjs`.

## The AI playtester: can a player reach the goal?

`node scripts/playtest.cjs <id>` (after `npm run build:bundled`; `npm run playtest -- <id>` does both)
plays the game with a bot that really tries to win, not one that mashes taps. It runs the game much
faster than real time with a seeded `Math.random`, so a replay is exact, and every quarter second of
game time it tries a few taps, holds, drags and keys (and doing nothing), plays each a little further
in two ways (random moves after, and nothing after), and keeps the best. It prints whether the goal
was reached and after how much game time.

The flags are signals, not verdicts: a bot that can't sort a puzzle doesn't mean people can't.
`goal-not-reached`, `goal-in-under-5s` and `random-taps-win` show as warnings on the PR. It fails on
errors and on `goal-with-no-input` (the goal reached without touching the game); `--strict` also fails
on a goal it never reached. A game on a fixed tick (`tick: 60`) is played on that tick.

The bot swipes like a thumb (quick straight flicks in the four directions) as well as tapping,
holding and dragging, and while it plays, `performance.now()` and `Date.now()` follow game time, so
holds, double taps and swipe speeds in `gs.controls` read the same as on a phone. It can't solve
puzzles, so on a **thinking game** (a tag with Puzzle, Word, Logic, Memory, Strategy, Cards, Match,
Merge, Sort, Maze, Trivia...) "goal not reached" is a note, not a warning, and `--strict` ignores it.

**Emoji in the test browser.** Emoji show on phones, but a test machine without a colour emoji font
draws them as empty boxes. On Debian or Ubuntu, `sudo apt-get install fonts-noto-color-emoji` fixes
it; `smoke.cjs` says when the font is missing. Drawing icons yourself works everywhere too.

## Running many games at once

`smoke.cjs`, `stream-smoke.mjs`, `fold.cjs` and `sweep.cjs` play several games side by side, one
browser each (`scripts/lib/pool.cjs`). The default is one browser per CPU (up to 6) for the 2D-heavy
checks and half the CPUs for `sweep.cjs`, whose 3D draws in software. Change it with `--jobs n` or
`JOBS=n`; use `--jobs 1` when you want the output in order or the machine is busy with something
else. Results print as each game finishes, so they can come out in a different order.

| Check (cloud machine, 4 CPUs) | Before | Now |
| --- | --- | --- |
| `smoke.cjs`, all 162 games | 12 min 3 s | 3 min 18 s |
| `stream-smoke.mjs`, all 162 games | 5 min 14 s | 1 min 38 s |
| `sweep.cjs` Bunker Breakout, Parcel Dash, Suit Ops (now Canopy Run), Long Shadow | 12 min 37 s | 2 min 51 s |
| `npm run kit-test` | 63 s | 3 s |

`budget.cjs` stays one game at a time on purpose: it measures time, and games running beside it
would make it look slower than it is.

## Why 3D tests are slow, and what to do about it

The test browser has no graphics chip: WebGL and WebGPU are drawn in software (SwiftShader). One Next
Gen frame takes a third to most of a second there, and copying it onto the card (what tests do, as
`__hd.direct` is off under a test browser) waits for all of it. So:

- In a test that checks logic (errors, rules, layout), draw less 3D, not less game: `sweep.cjs`
  draws Next Gen and AR every 20th step at the odd sizes (at a small size: `__hd.scale = .3`,
  `__hd.upscale = false`) and every 10th at the game's own size. `--full` puts the old way back
  (every 5th step at full size) when you are chasing a drawing bug.
- `__hd.force = 0..3` pins a quality tier, `__hd.scale` the 3D size, `__hd.upscale` turns SGSR off;
  set them only for what a test is about, and put them back (`null`, `true`) after.
- Frame rates on SwiftShader say nothing about phones. Compare CPU numbers (update, `HD.info.cpu`,
  draw calls) before and after on the **same** machine, never against a phone.
- `gl.finish()` does not wait in Chrome, and `readPixels` on a multisampled target throws, so GPU
  time per pass can't be measured this way here. GPU cost needs a real phone.
- Wait for a game's lazy parts before you time or draw it: loop until `!__gs.active.loading`.

## Measuring engine speed: perf-bench

```bash
npm run build:bundled
node scripts/perf-bench.cjs --json /tmp/before.json          # every Next Gen game, WebGL then WebGPU
# ...change the engine, build again...
node scripts/perf-bench.cjs --vs /tmp/before.json            # prints the change per game
node scripts/perf-bench.cjs long-shadow --gpu --profile      # the slowest functions, with file and line
```

It plays each game at the top tier (Rob's Galaxy Z Fold 8 is a top-class phone) with random taps and
prints the game's `update()` time, the 3D frame's CPU time (`HD.info.cpu`), draw calls, triangles,
load time and memory kept. The numbers move by 10 to 20% between runs on a shared machine, so trust
bigger changes, or run it twice.

To see whether WebGPU builds shaders during play (a hitch each time), hook
`renderer.debug.onNodeBuilderCreated` on `webgpu().r` (from `src/kit/gpu.js`, importable in the dev
server) and count the calls per second.

## Pictures: proving a change doesn't change the look

- `look-compare.cjs` draws fixed, seeded scenes (Next Gen at every tier, Console) and fails on a
  visible difference. Save before the change, check after, on WebGL and with `--webgpu`.
  `PICK=recipes,wear` draws just those scenes (about 10 s; `beams` draws beams-sun, beams-lamp and motion-blur); `Q=dbg` (with `ALLWARN=1`) logs what the
  renderer holds (and how many textures are packed) every 3 s and says when the graphics queue stops
  answering; `Q=nopack` draws code-made textures uncompressed on WebGPU; `Q=hdr` turns on HDR output (as on an HDR
  phone screen; the saved pictures clip it to white).
- GPU culling of `gs.props`: `PICK=gpu-cull-cpu,gpu-cull node scripts/look-compare.cjs save <dir> --webgpu`
  draws the same forest culled on the CPU and on the GPU (`Q=n=6000` sets the number of trees). The two
  pictures should match, and each line gives the CPU time per frame and the time spent building the lists.
- Known noise (2026-11-10): the test machine's software WebGPU (SwiftShader) sometimes hangs its queue,
  with no error, partway through a full `--webgpu` run (seen after the live bounce light scenes), and
  every scene after that shows the same frozen picture. If a run of CHANGED lines all differ by 30+,
  run the check again or `PICK` the scenes that failed.
- `gpu-games.cjs --shots dir` saves each game's first moments on both backends; games move a little
  by their own randomness, so it's a guide, not a test.
- `shots.cjs` / `shots3d.cjs` take screenshots at phone and fold sizes for looking at.

## Habits that save time

- Test the games you changed, not all of them; for engine changes, `pick-games.mjs` gives the few
  per style that use the most of `gs`.
- Run long checks in the background and read their log when they finish, rather than waiting on them.
- One check at a time when you are timing something; parallel checks slow each other down.
- Known noise (2026-11-09): `gpu-games.cjs` can log WebGPU `struct OutputType {}` errors when it plays
  several games in one page. The WebGPU thread is fixing it; check whether a failure is that before
  chasing it.
- The cloud machine can't reach `api.game-scroll.com`; the failed requests in logs are expected.

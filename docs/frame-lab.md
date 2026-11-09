# Frame lab

Digital Foundry-style analysis of how a game really runs on a phone: frame times and pacing, 1% and
0.1% lows, what caused each hitch, the 3D's real resolution and upscaler, frame generation, heat and
CPU clocks over time, and picture comparisons you can zoom into. It is for finding problems nobody
has noticed yet, on the phone where they happen (the test browser draws 3D in software, so its timings
mean nothing: [testing.md](testing.md)).

The code is `src/framelab.js`. It loads only when it's on and costs nothing otherwise.

## Turning it on

- **On the phone**: tap the GAME SCROLL logo for the QA panel, then **Frame lab**. It stays on across
  restarts (handy for catching start-up hitches) until you press its ✕.
- **In `npm run dev`**: F3, or open the page with `?lab`, or `__gs.lab()` in the console.

The panel sits at the top of the screen; ⇅ moves it to the bottom, – folds it to one line (fps, lows,
pacing, stutters). It fits the Fold 8 folded (374 px wide) and unfolded.

## What the panel shows

The **graph** is the last 4 seconds. Each bar is one picture put on the screen, its height the time
since the one before:

| Colour | Means |
| --- | --- |
| green | a real frame the game drew |
| magenta | a frame made by frame generation |
| red | a stutter: at least 1.5 times the beat and a whole refresh late |
| grey | not in play (the card waiting, game over) |

The dashed line is the beat the game should hold (the game's frame rate, or every refresh while
frame generation is on), the dotted line twice that. The **strip** above the bars has one cell per
screen refresh: green real, magenta made, dark nothing new, red a refresh the phone skipped. A 60 fps
game on a 120 Hz screen shows green, dark, green, dark; a 60 fps game on a 90 Hz screen shows uneven
gaps, and its pacing number drops. Letters over the graph mark events: **S** shaders built, **X**
textures uploaded, **G** heap fell (garbage collection), **Q** quality tier or resolution step changed,
**F** fold or resize, **C** card or round changed.

The numbers, over the last 5 seconds:

- **fps**, **1%** and **0.1%** lows: the 99th and 99.9th percentile frame time as a frame rate (0.1%
  needs 500+ frames, so it shows – at first).
- **pacing**: the share of pictures that came on the beat (within 0.4 of a refresh).
- **stutters** and **skipped** refreshes.
- the game, its state, the screen's rate and the game's frame rate, the screen size.
- 3D games: backend (WebGPU or WebGL), quality tier and resolution step, the **3D's own size → the
  final picture's size** (the resolution counter, straight from the 3D kit, so no pixel counting
  needed), the upscaler (SGSR 1 or 2), frame generation (mode, frames made per real one, its cost)
  and why it's on or off, CPU time of the game's `update()`, `draw()` and the 3D render, GPU time
  (once the 3D kit measures it: `HD.info.gpuMs`), draw calls and triangles.
- 2D games: the canvas size, and whether it was eased because the phone fell behind.
- the phone: heat (Android thermal status and headroom, iPhone thermal state), battery, heap, and
  **CPU speed**: a fixed bit of work timed every 2 seconds, as a share of its best time. When the
  phone throttles its clocks, this falls.
- the last hitch and its causes.

## Hitch causes

Every stutter during play is checked for what happened since the picture before it:

- shaders built (WebGL programs, WebGPU programs) and textures uploaded
- a garbage collection (the JavaScript heap fell by 1.5 MB or more; the browser rounds the heap
  size, so small ones are missed)
- the browser's long animation frame report: which script held the frame (file and function) or
  whether it was layout
- a quality tier or resolution step change, a fold or resize, the app coming back to the front,
  a card or round change, refreshes skipped
- the game's own CPU time going over the beat, or GPU time going over it
- if none of those: "no cause seen", which on a 3D game usually means the GPU, the driver or the
  system (another app, the phone's own work)

## Tools

| Button | Does |
| --- | --- |
| **● Rec** | Records up to 60 s of every refresh, hitch and phone reading. Tap again to stop. |
| **Freeze** | Stops the game's clock but keeps drawing: the picture settles and nothing moves. |
| **Tint** | Tints the card magenta on every made frame, so you see frame generation working. |
| **A/B** | On a frozen frame, two pictures with one setting changed: SGSR off vs on, SGSR 1 vs 2, WebGL vs WebGPU, half vs full resolution, low vs ultra tier. Settings go back afterwards. |
| **Shimmer** | On a frozen frame, 16 pictures in a row and a heat map of pixels that still change while nothing moves: shimmering edges, upscaler or anti-aliasing jitter. |
| **FG check** | While you play a WebGPU game: grabs real, made, real frames and flags made pixels that match neither real frame nearby (ghosting, smears, holes behind moving things). Turns frame generation on for the check if it's off. |
| **Report** | Shares a self-contained HTML report (Android and iPhone share sheet; a download on the web). |
| **Copy** | Puts a text summary on the clipboard, to paste into chat. |

The **viewer** (after A/B, Shimmer or FG check) has Wipe (a slider between the two), Side by side
(every picture shows the same part, for pixel peeping), Difference (four times the difference),
Flip (tap to swap), Flags (the heat map over the picture, boxes where flagged pixels gather), and
zoom 1x to 16x (or pinch, or the mouse wheel) with sharp pixels. Drag to move around.

## The report

One HTML file with everything in it, readable in any browser, phone or desktop:

- the summary (the same text as Copy)
- frame time of every picture over the whole recording, with event ticks
- frame rate and 1% low in one-second windows
- CPU time per real frame (update, draw, frame generation) and GPU time where known
- the phone: CPU speed, heat, thermal headroom, battery over time
- frame times in screen refreshes (how many pictures took 1, 2, 3... refreshes)
- every hitch and event with its causes, and the settings at the start and end
- the pictures from A/B (with a wipe slider), Shimmer and FG check

To send one to Claude: Report, share it to yourself (Drive, email), and attach it in chat; or just
Copy and paste the summary.

## How it hooks in

`src/main.js` calls `LAB.tick(now, card, 'frame' | 'between' | 'idle', update ms, draw ms)` each
refresh, and skips the game's `update()` while frozen. Frame generation's `HD.fgTap` hook (hd3d.js)
says whether each refresh showed a real or made frame. The 3D kit writes the 3D and final sizes into
`HD.info.rw`, `rh`, `ow`, `oh`; `src/kit/renderer.js` counts built WebGL programs in `glStats`
(`src/kit/gpu.js`); `src/kit/power.js` keeps the raw thermal readings. Pictures are grabbed in the
same frame they're drawn, from every canvas (and the AR camera video) in the card.

Timing comes from `requestAnimationFrame`, which on Android and iPhone runs on the screen's beat. The
browser doesn't say when a picture actually lit up, so a frame the compositor held back is not seen.

`scripts/framelab-test.cjs` checks the lab itself in the test browser (2D and Next Gen, A/B, Shimmer,
FG check, fold and unfold, the report).

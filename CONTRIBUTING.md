# Contributing a game to Game Scroll

Game Scroll is a vertical feed of quick mini games: swipe up for the next one, tap to play. Anyone can
add a game by opening a pull request. Once it is merged, your game streams to every player's app
within minutes. No app update is needed.

There is a friendlier walkthrough at **https://game-scroll.com/make/**. This guide covers everything in detail:

1. [The rules](#the-rules)
2. [Quick start](#quick-start)
3. [How a game file works](#how-a-game-file-works)
4. [Choosing a style](#choosing-a-style): Phone, Dot matrix, Color, Advance, Classic Console, Next Gen Console or AR · 3D
5. [Palettes and shells](#palettes-and-shells)
6. [Screen sizes, foldables and fluid games](#screen-sizes-foldables-and-fluid-games)
7. [Sound, haptics and phone sensors](#sound-haptics-and-phone-sensors)
8. [Credits, shop items and trophies](#credits-shop-items-and-trophies)
9. [Testing your game](#testing-your-game)
10. [Opening the pull request](#opening-the-pull-request)
11. [What happens after merge](#what-happens-after-merge)
12. [Licence of your contribution](#licence-of-your-contribution)

## The rules

- **Original games only.** You can take inspiration from a genre or a mechanic (falling blocks,
  kart racing, a platformer), but don't recreate a specific existing game: no copied names,
  characters, art, music, levels or look, even renamed. Make up your own names and characters.
- **A new mechanic.** The goal is 1000 games that each play differently. A reskin, palette swap or
  harder version of a game already in the feed won't be merged. Check
  [`docs/game-ideas.md`](docs/game-ideas.md) and the games in [`src/games/`](src/games/) first. A
  fresh twist on a familiar genre is fine.
- **Quick to learn, quick to play.** A player should get it from one sentence of hint and a few
  seconds of play. A round should last roughly 20 seconds to 3 minutes.
- **Self-contained.** One file in `src/games/`, everything drawn in code on a canvas. No image,
  font or sound files, no network requests, no `eval`, no tracking, no ads, no links out of the app.
- **Touch first.** Every game must be fully playable with touch alone. Phone sensors are welcome as
  long as there is a touch fallback (see [below](#sound-haptics-and-phone-sensors)).
- **Family friendly.** Cartoon action is fine. No gore, hateful content, gambling with real money,
  or anything you wouldn't show a 12-year-old.
- **Only your game file.** A game PR should add or change files in `src/games/` (and optionally tick
  your idea in `docs/game-ideas.md`). If you need a change to shared code (`src/kit/`, `src/util.js`,
  `src/main.js` ...), open a separate PR first and explain why, because shared code ships inside the
  app and only reaches players with an app update.

## Quick start

You need [Node.js](https://nodejs.org) 22 or newer.

```bash
# 1. Fork this repo on GitHub, then:
git clone https://github.com/<you>/game-scroll.git
cd game-scroll
npm install

# 2. Create your game (the file name must equal the game's id)
#    src/games/my-game.js   ->   id: 'my-game'

# 3. Run the app with your game built in
npm run dev
```

Open the printed URL in a desktop browser or on your phone (same Wi-Fi). To jump straight to your
game, open the browser console and run `__gs.only('my-game')`. Desktop keys: Space/Enter to start,
arrows to steer, ↓ for the next game.

## How a game file works

Every file in `src/games/` is one game and is picked up by the feed automatically. Here is a complete,
working game you can copy as a starting point:

```js
// src/games/tap-bubbles.js
import { sfx } from '../sfx.js';
import { haptic } from '../kit/device.js';

const W = 360, H = 640;

function make(api) {
  let bubbles, score, t, missed;
  return {
    reset() { bubbles = []; score = 0; t = 0; missed = 0; },
    update(dt) {                       // dt is in seconds
      t += dt;
      if (Math.random() < dt * (1 + t / 10)) bubbles.push({ x: 30 + Math.random() * (W - 60), y: H + 30, r: 24 });
      for (const b of bubbles) b.y -= dt * (90 + t * 4);
      const gone = bubbles.filter(b => b.y < -30).length;
      bubbles = bubbles.filter(b => b.y >= -30);
      missed += gone;
      if (missed >= 3) { haptic('warning'); api.over(); }
    },
    draw(c) {                          // c is a CanvasRenderingContext2D, W x H logical units
      c.fillStyle = '#16212e'; c.fillRect(0, 0, W, H);
      c.fillStyle = '#5aa8ff';
      for (const b of bubbles) { c.beginPath(); c.arc(b.x, b.y, b.r, 0, 7); c.fill(); }
      c.fillStyle = '#ffffffaa'; c.font = '500 14px Rubik, sans-serif'; c.textAlign = 'center';
      c.fillText(`Missed ${missed}/3`, W / 2, H - 24);
    },
    down(x, y) {                       // x, y are already in game units
      const i = bubbles.findIndex(b => Math.hypot(b.x - x, b.y - y) < b.r + 8);
      if (i < 0) return;
      bubbles.splice(i, 1); score++; api.score(score);
      haptic('light'); sfx(520 + score * 10, .06, 'triangle', .04);
    },
  };
}

export default {
  id: 'tap-bubbles',            // must match the file name
  title: 'Tap Bubbles',
  tag: 'Casual · Reflex',       // "<Style> · <Genre>", shown on the card and used by the recommender
  retro: false,                 // see "Choosing a style"
  w: W, h: H,                   // logical canvas size
  goal: 25,                     // required: the score that counts as a win and pays credits
  hint: 'Pop the bubbles before they float away. Miss three and it is over.',
  creator: 'Your Name',         // shown as "Created by Your Name" in the game's info pop-up
  make,
};
```

### The definition fields

| Field | Required | What it does |
| --- | --- | --- |
| `id` | yes | Unique, lowercase, dashes. **Must equal the file name** (`npm run games` fails otherwise). |
| `title` | yes | Short name shown on the card. |
| `tag` | yes | `'<Style> · <Genre>'`, for example `'Pocket · Puzzle'`. Genre words feed the "more like this" recommender. |
| `hint` | yes | One or two sentences on how to play. Mention the control (tap, hold, drag, swipe, tilt...) because the recommender reads it. |
| `goal` | yes | Score that counts as a win and pays credits. Pick something a decent player reaches in about a minute. |
| `w`, `h` | yes | Logical canvas size. You always draw and receive input in these units; the app scales it to the screen. |
| `creator` | yes for submitted games | Your name or handle, shown as "Created by ..." when players tap the game's name. Plain text, up to 40 characters. Games without one show "Created by Rob". |
| `make(api)` | yes | Returns your game object (below). |
| `retro`, `era`, `pal` | for retro styles | See [Choosing a style](#choosing-a-style). |
| `maxW`, `maxH`, `step` | no | Makes the game fluid on tall and unfolded screens. See [Screen sizes](#screen-sizes-foldables-and-fluid-games). |
| `reward`, `shop`, `board` | no | Credits per win, shop items, own leaderboard. See [Credits](#credits-shop-items-and-trophies). |
| `traits` | no | Extra recommender traits, for example `traits: ['theme:space']`. |

### The `api` you get in `make(api)`

- `api.score(n)` sets the score. When it reaches `goal`, the player wins credits (the game keeps going).
- `api.over()` ends the round and shows the game-over screen.
- `api.win()` wins right now, for games with a natural end (cleared the board).
- `api.has('itemId')` is true when a shop item is active for this run. Safe to call in `reset()`.

### The game object `make()` returns

| Method | When it's called |
| --- | --- |
| `reset()` | Before every round. Put **all** round state here so "Play again" starts clean. |
| `update(dt)` | Every frame while playing. `dt` is seconds since the last frame. |
| `draw(ctx)` | Every frame. Draw the whole frame; nothing is cleared for you. |
| `down(x, y, id)`, `move(x, y, pressed, id)`, `up(x, y, id)` | Touch / mouse, already converted to game units. `id` is the pointer id, so a game can track several fingers at once (two-thumb controls); single-touch games can ignore it. |
| `key(k, isDown)` | Optional keyboard support for desktop (`'ArrowLeft'`, `' '`...). |
| `fx(dt)` | Optional. Keeps effects animating behind the game-over screen. |
| `resize(w, h)` | Optional, for fluid games. |

The app draws the start screen (title, hint, goal, Play button) and the game-over screen for you, so
your game only needs to draw gameplay.

## Choosing a style

Every game picks one of six looks. The style decides the frame around your game, the start and
game-over screens, which feed tab it appears in and how it is scaled.

![The five styles side by side: Phone, Dot matrix, Color, Advance and Console](docs/contributing/styles.png)

| Style | Set these fields | Tag starts with | Typical size | Look |
| --- | --- | --- | --- | --- |
| **Phone (Casual)** | `retro: false` | `Casual ·` | `w: 360, h: 640` | Full screen, smooth, any colours. Modern phone-game feel. |
| **Dot matrix (Pocket)** | `retro: true, pal: 'moss'` | `Pocket ·` | `160 x 160` | Handheld shell, chunky pixels, exactly **4 shades** from the palette. |
| **Color (Pocket)** | `retro: true, era: 'color', pal: 'lemon'` | `Color ·` | `160 x 160` to `160 x 192` | Coloured handheld, chunky pixels, bright colours (`C16`). |
| **Advance (Pocket)** | `retro: true, era: 'advance', pal: 'grape'` | `Advance ·` | `176 x 176` to `192 x 160` | Wider handheld, chunky pixels, rich colours, sprites, parallax. |
| **Classic · Console (3D)** | `retro: true, era: 'console', pal: 'grape'` | `Console ·` | `192 x 160` (fluid up to ~300 x 240) | TV frame, real-time 3D, cel-shaded with ink outlines, sharp hi-res HUD. |
| **Next Gen · Console (HD 3D)** | `retro: true, era: 'nextgen', pal: 'grape'` | `Next Gen ·` | `300 x 300` (fluid up to ~600 x 420, so landscape foldables are filled edge to edge) | Slim glossy console, modern HD 3D: PBR materials, shadows, bloom, AO, particles. |
| **AR · 3D** | `retro: true, era: 'ar', pal: 'grape'` | `AR ·` | `300 x 460` (fluid up to ~600 x 680) | 3D objects in the player's real room: camera picture behind, gyro to look around. |

How each style looks in the app, start screen and in play:

![Start, playing and game-over screens for a Phone game and a Dot matrix game](docs/contributing/screens.png)

### Phone (Casual)

Modern phone games: one-thumb arcade, puzzles, physics toys. You draw at full resolution, so use
smooth shapes, gradients and any colours. Fonts available: `Rubik` for text, `"Press Start 2P"` for
pixel-style numbers. Start screen says "Tap to start" with a yellow Play button. These appear under the
Casual tab.

### Dot matrix (Pocket)

Inspired by the original monochrome handhelds. The screen is rendered with crisp, chunky pixels, so
draw on whole-number coordinates. Use only the four shades of your palette, darkest first:

```js
import { PAL } from '../palettes.js';
const R = PAL.moss;          // R[0] darkest ... R[3] lightest (the background)
c.fillStyle = R[3]; c.fillRect(0, 0, W, H);
```

`pix(ctx, map, x, y, colour)` from `src/util.js` draws small sprites from strings. The start screen
says "Insert coin / PRESS START". These appear under the Pocket tab.

### Color (Pocket)

The colour handheld era: same chunky pixels and small screen, but in colour. Use the bright 16-colour
set `C16` from `src/palettes.js` (`C16[0]` black, `C16[1]` white, then 14 colours). The shell takes the
colour of `pal`.

### Advance (Pocket)

The wider, later handheld era: more colours, detailed sprites, scrolling backgrounds, mode-7 style
racing floors. Still pixel art and still scaled in whole pixels. Any colours are fine; `C16` is a good
start. Good for platformers, RPG battles, karts and tactics.

### Classic · Console (3D)

Home-console and PC inspired games from the 32 to 128-bit era (they appear under **Classic · Console**). These are real-time 3D using three.js through the shared kit
`src/kit/toon3d.js`: toon shading with a three-band light ramp and ink outlines, giving a cel-shaded
cartoon look. The HUD and text are drawn in normal 2D on top, at full resolution.

```js
import { View, G, part, grp, blob } from '../kit/toon3d.js';
let v3;
function view3d(W, H) {
  if (!v3) {
    v3 = new View({ bg: '#5cb84c', sun: [-.6, 1, .4] });
    v3.def('hero', () => grp(part(G.pill, '#3060c0', { sx: 6, sy: 5, sz: 5, y: 6 }), part(G.ball, '#f8c890', { s: 3, y: 12 }), blob(5)));
  }
  v3.board(W, H, .8);   // tilted top-down; floor point (x, y) lands exactly on screen (x, y)
  return v3;
}
// in draw(c): const v = view3d(W, H); v.frame(); v.put('hero', v.at(x, y)); v.render(c, W, H); then 2D HUD
```

Read [`docs/console-3d.md`](docs/console-3d.md) for cameras (`board`, `side`, `persp`), prefabs and
performance rules. Never create your own WebGL renderer: phones only allow a few, so all Console games
share one. A Console game should look clearly 3D; if yours doesn't, make it an Advance game instead.
Run `npm run sweep` on Console games (see [Testing](#testing-your-game)).

### Next Gen · Console (HD 3D)

Games that look like they belong on a current home console. They use `src/kit/hd3d.js`:
physically based materials (roughness, metal, clearcoat, normal maps painted in code), image-based
reflections, real-time shadows, HDR lighting with bloom, ambient occlusion, filmic tone mapping,
a colour grade, and GPU particles for sparks, smoke and dust. Characters can be stylised or
cartoony, but the rendering must be **clearly a generation ahead of the Classic Console games**.
If a game can't reach that bar, make it a Classic Console game instead.

```js
import { HDView, Particles, pbr, rbox, surface, spot } from '../kit/hd3d.js';
let v;   // in draw(c): move v.cam and your meshes, then v.render(c, W, H), then the 2D HUD
v = new HDView({ bg: '#06080c', fog: .07 }).lampLights(9);
```

Things that make the difference: bevelled shapes (`rbox`) instead of sharp boxes, real surface
detail (`surface()` with a height layer for the normal map), a few strong light sources with
shadows rather than flat ambient light, emissive glow for lamps, screens and muzzle flashes (values
above 1 bloom), particles for every impact, and camera life (bob, recoil, shake).

Phones must stay smooth: the kit lowers the render resolution and then the quality tier by itself
when frames get slow, but keep draw calls low (merge level geometry, `InstancedMesh` for repeated
props, hide what's beyond the fog). Read [`docs/nextgen-3d.md`](docs/nextgen-3d.md) for the full
kit, the quality tiers and performance rules. Like Console games, they share one WebGL renderer;
never create your own. Run `npm run sweep` on Next Gen games too. These appear under
**Next Gen · Console**.

### AR · 3D

3D games that happen in the player's real room. The back camera is the background and the phone's
gyro turns the view, so objects stay put while the player turns and tilts the phone to find them
(look-around AR; walking isn't tracked). They use `src/kit/ar3d.js` on top of the Next Gen
renderer, with real-time shadows cast onto the real floor. Every AR game must also play with no
camera (a virtual room is drawn instead) and with no gyro (drag to look). Read
[`docs/ar-3d.md`](docs/ar-3d.md) for the kit, sizes and testing. These appear under **AR · 3D**.

## Palettes and shells

For retro styles, `pal` sets the handheld shell colour, the start and game-over screen colours, and
(for Dot matrix) the four shades you draw with. Pick one key from `src/palettes.js`.

**Dot matrix palettes** (`moss`, `amber`, `ice`, `mono`, `rose`, `mint`):

![The six dot-matrix palettes: moss, amber, ice, mono, rose and mint](docs/contributing/palettes-dot.png)

**Colour shells** for Color, Advance and Classic Console games (Next Gen games always use the slim modern console, so `pal` only needs to be set) (`berry`, `grape`, `teal`, `lemon`; `mint`
works too). In these styles you draw in full colour, and `pal` only sets the shell and the overlay
screens:

![The colour shells: berry, grape, teal and lemon](docs/contributing/palettes-color.png)

Phone (Casual) games ignore `pal`; they have no shell and pick their own colours.

## Screen sizes, foldables and fluid games

Players use everything from small phones to unfolded foldables (Galaxy Z Fold, iPhone Duo) and
tablets, and can fold or unfold mid-game. By default your `w x h` canvas is scaled to fit and
letterboxed. To use the extra space, make the game fluid:

```js
export default {
  /* ... */ w: 160, h: 160, maxW: 240, maxH: 280, step: 8,   // step is optional
  make(api) {
    let W = 160, H = 160;
    return { /* ... */ resize(w, h) { W = w; H = h; /* re-layout, keep the game state */ } };
  },
};
```

The app picks a size between `w x h` and `maxW x maxH` that fits the screen and calls `resize(w, h)`
before the first frame and whenever the screen changes. Keep the game fair at every size (for example,
don't let a bigger screen make a dodging game easier) and keep important things away from the edges.

Here is the same fluid game (Brick Bounce, `160 x 160` growing to `240 x 280`) on a folded cover screen (left) and an unfolded inner screen (right):

![The same fluid game folded and unfolded](docs/contributing/fluid.png)

`node scripts/fold.cjs my-game` folds and unfolds the screen mid-game to check your game survives it (see [Testing](#testing-your-game)).

## Sound, haptics and phone sensors

Import shared helpers only from these modules; the app provides them to streamed games:

- `src/sfx.js`: `sfx(freq, duration, type, volume, slide)` makes short synth sounds. Respects mute.
- `src/kit/device.js`: `haptic('light' | 'tick' | 'success' | 'warning' ...)`, `buzz()` patterns,
  `tilt()`, `onShake(cb)`, `heading()` (compass), `faceDown()`, `location()` (GPS), `startMic()`,
  `startCamera()`, `orientation()` (raw gyro, used by the AR kit).
- `src/util.js`: `clamp`, `rnd`, `pix`, `disc`, `flickTracker`, `hash`, `fmt`, `store`.
- `src/palettes.js`: `PAL`, `SHELL`, `C16`.
- `src/kit/gfx.js` (2D shading helpers), `src/kit/toon3d.js` (Classic Console 3D), `src/kit/hd3d.js` (Next Gen Console HD 3D), `src/kit/ar3d.js` (AR · 3D: camera + gyro), `src/kit/bricks.js` (toy bricks).

Sensors return `null` or do nothing on desktop, in the browser, or when the player says no to a
permission, so **every sensor game needs a touch fallback** (for example drag instead of tilt, tap
instead of shouting). Call `want('motion')` inside `make()` for tilt, shake or compass games so iOS can
ask for permission on the next tap. Stop the mic or camera when the round ends.

## Credits, shop items and trophies

Winning any game pays credits (`goal` is required for this). Optionally a game can sell items players
buy with credits, have its own leaderboard, or pay more per win:

```js
reward: 10,   // credits per win, first win pays double
shop: [
  { id: 'shield', name: 'Shield', price: 25, kind: 'boost', desc: 'Survive one crash.' },   // used up on the next run
  { id: 'gold', name: 'Gold Skin', price: 150, kind: 'unlock', desc: 'Forever gold.' },      // kept forever
],
// in your game: if (api.has('shield')) { ... }
```

Details in [`docs/game-services.md`](docs/game-services.md). Use `board: true` sparingly; it needs a
leaderboard set up in the app stores, so mention it in your PR.

## Testing your game

Tests run against a build with every game inside (`--mode bundled`). Playwright with Chromium is
needed for the browser tests: `npm i --no-save playwright && npx playwright install chromium`.

```bash
npm run build:bundled                     # build the app with all games inside
node scripts/smoke.cjs my-game            # plays your game with random input; fails on any error or missing goal
node scripts/fold.cjs my-game             # folds and unfolds the screen mid-game
node scripts/sweep.cjs my-game            # long random play at odd sizes (required for Console and Next Gen games)
npm run games                             # builds the streamed files; fails if the file name and id differ
```

`npm run qa` runs bot play tests over every game and is useful for checking that your game doesn't
score with no input or end instantly.

Also play it yourself on a real phone if you can (`npm run dev`, open the URL on your phone): check
the controls feel good with a thumb, the hint makes sense, and the goal is reachable.

## Opening the pull request

1. Commit your game file on a branch in your fork and open a pull request against `main`.
2. Fill in the template: what the game is, the mechanic, the style, and a screenshot or short clip.
3. GitHub Actions builds the app and smoke-tests the games you changed. Fix anything it reports.
4. A maintainer plays it and may ask for changes. Games that don't fit the rules above, or play too
   much like a game already in the feed, may be declined.

## What happens after merge

You don't need to do anything. On every push to `main`, `.github/workflows/games-r2.yml` builds each
game as its own small file and uploads it with an updated catalogue to Cloudflare R2. The app checks
the catalogue regularly, so your game appears in players' feeds within minutes, no app update needed.
Fixes to your game reach players the same way.

A streamed game can only use shared code that the installed app already has. If your game imports
something newer, older apps skip it until they update.

Games that turn out weak or broken in play testing may be benched (hidden) or removed later.

## Licence of your contribution

Game Scroll is licensed under the [PolyForm Shield License 1.0.0](LICENSE). In short: you may read,
run, fork and change the code, and build on it for your own projects, but you may not use it to offer
a product that competes with Game Scroll.

By opening a pull request you confirm that:

1. The contribution is your own original work (or you have the right to submit it), and it doesn't
   copy another game's names, characters, art, music or levels.
2. You license your contribution to the project owner (Rob, [@robthewizzuk](https://github.com/robthewizzuk))
   under a perpetual, worldwide, non-exclusive, royalty-free, irrevocable licence to use, copy,
   modify, distribute, sublicense and relicense it as part of Game Scroll, including in the app
   stores, and that everyone else receives it under the project's licence.
3. You keep the copyright in your contribution, and you may be credited by your GitHub name.

If you can't agree to these terms, please don't open a pull request.

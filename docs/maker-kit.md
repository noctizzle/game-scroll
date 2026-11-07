# Maker kit

Ready-made tools for making games feel good, so you can spend your time on the idea and not on
plumbing. Everything here is built into the app, made in code (no image or sound files), and works
in every style. The `npm run new` templates use all of it, so they are the quickest way to see it.

| You want | Use | Module |
| --- | --- | --- |
| A working game to start from | `npm run new my-game --style pocket` | [Starter templates](#starter-templates) |
| To remember things between plays | `api.save(data)`, `api.load(fallback)` | [Save slots](#save-slots) |
| A level from where the player is, or walking to play | `api.location()`, `api.watchLocation(cb)` | [Location](#location) + `src/kit/geo.js` |
| Particles, screen shake, smooth movement, "+10" pop-ups | `Juice`, `ease`, `Tweens` | [`src/kit/juice.js`](#juice) |
| Explosions, jingles, music, ready-made sounds | `sounds`, `noise`, `notes`, `music` | [`src/kit/sound.js`](#sound) |
| A thumbstick, buttons, tap / hold / swipe | `Stick`, `Button`, `Gestures`, `twoThumb` | [`src/kit/controls.js`](#controls) |
| Things that fall, bounce, stack and collide | `World` | [`src/kit/physics2d.js`](#physics) |
| To see frame rate, hitboxes, slow motion | press `` ` `` in `npm run dev` | [Debug overlay](#debug-overlay) |

## Which shared code a game may use

A game may import only these modules (the list lives in `src/game-modules.js`):

`src/sfx.js`, `src/util.js`, `src/palettes.js`, `src/kit/device.js`, `src/kit/gfx.js`,
`src/kit/bricks.js`, `src/kit/toon3d.js`, `src/kit/hd3d.js`, `src/kit/ar3d.js`, `src/kit/juice.js`,
`src/kit/sound.js`, `src/kit/controls.js`, `src/kit/physics2d.js`, `src/kit/geo.js`.

Everything else (credits, saved progress, settings, hearts) belongs to the app. The streamed app
doesn't hand it to games at all, `npm run games` refuses to build a game that imports it, and the PR
check flags it. `store` from `util.js` (raw storage) is held back too: use your save slot instead.
So is the old `location()` from `device.js`: use `api.location()`.

A game that uses a newer kit, `api.save` or `api.location` is only offered to app versions that have it; older apps
skip it until they update.

## Starter templates

```bash
npm run new my-game                     # Phone (Casual)
npm run new my-game --style pocket      # phone | pocket | color | advance | console | nextgen | ar
npm run new my-game --style ar --title "Balloon Pop" --creator "Sam"
```

This writes `src/games/my-game.js`, a small complete game that already plays and passes the smoke
test. Then `npm run dev` and `__gs.only('my-game')` in the browser console. Change the mechanic, the
look, the title, tag and hint: the template is only a starting point, and a game that is still
recognisably the template won't be merged.

| Style | What the template shows |
| --- | --- |
| `phone` | Tap targets; juice (particles, shake, pop-ups, hit-stop, tweens), sounds, a save slot |
| `pocket` | Catch game in four shades; slider stick, pixel juice, looping music |
| `color` | Runner; tap to jump and hold for a big jump (gestures) |
| `advance` | Tower of crates; 2D physics, a save slot for the best tower |
| `console` | Cel-shaded 3D gem hunt; floating thumbstick |
| `nextgen` | HD 3D rolling ball; two-thumb layout (stick + boost button), GPU sparks, shadows |
| `ar` | Balloons in your room; tap to pop, drag to look when there's no gyro |

## Save slots

Every game has its own small save, for unlocked levels, settings, a best combo, a run to continue:

```js
function make(api) {
  let unlocked = api.load({ level: 1 }).level;      // fallback when there is no save yet
  return {
    // ...
    levelDone() { unlocked++; api.save({ level: unlocked }); },
  };
}
```

- `api.save(data)` replaces the save. `data` must be JSON (numbers, strings, booleans, arrays,
  plain objects) and at most 2 KB as JSON text. It returns `false`, and saves nothing, if not.
- `api.load(fallback)` returns a fresh copy of the save, or `fallback` when there is none.
- `api.clearSave()` deletes it.
- A game can only see its own save. Saves ride along in the player's Game Center / Play Games cloud
  save, so they follow the player to a new phone. If two phones saved, the newer save wins.
- Save at moments that matter (a level cleared, game over), not every frame.
- Best scores and credits are already saved by the app: don't keep them in your save.

## Location

For games built from where the player is (a daily puzzle shared with everyone nearby, things that
live in this park) or played by walking about. Declare how precise you need it, then ask during play:

```js
import { cellId, distance, offset } from '../kit/geo.js';

function make(api) {
  let here = null, asked = false;
  return {
    reset() { asked = false; },
    update(dt) {
      if (!asked) { asked = true; api.location().then(p => { here = p; buildLevel(p.real ? cellId(p, 2000) : todaySeed()); }); }
      // ...
    },
  };
}
export default { id: 'park-hunt', /* ... */ location: 'coarse', make };   // 'precise' for walk-around games
```

- `api.location()` resolves (never throws, at most ~8 s) to
  `{ lat, lon, accuracy, real: true, precision }`, rounded **before your game sees it**: to 0.01°
  (about 1 km) for `'coarse'` and 0.0001° (about 10 m) for `'precise'`. `accuracy` is in metres and
  never smaller than the rounding.
- When there's no real position it resolves to the stand-in `{ lat: 0, lon: 0, real: false, reason }`
  where `reason` is `'denied'` (the player said no), `'off'` (Settings → "Let games use my location"),
  `'unavailable'` (no fix, indoors, timed out) or `'not-playing'`. **The game must play with the
  stand-in**: use a daily seed, or let the player walk the stand-in around with `offset(p, east, north)`.
- `api.watchLocation(cb)` calls `cb` at once and again each time the rounded position changes. It
  stops when the round ends, and returns `stop()` for stopping sooner. A coarse game only hears about
  moves of about 1 km.
- **Play time only.** Before the player presses Play, and after the round ends, both give the
  stand-in without asking, so the phone's permission question only appears for a game the player
  chose to play. The start screen and the How to play card tell players the game uses location.
- `npm run games` refuses a game that calls `api.location` without declaring `location`. The PR check
  flags `'precise'` (a maintainer checks it's needed) and any direct `navigator.geolocation` use.
- The declaration goes into the catalogue, and the game asks for `api.location`, so app versions
  older than this one skip location games instead of offering them.
- Location never leaves the phone and isn't saved. Don't put coordinates in `api.save()`; save a
  `cellId` if you need to remember a place.
- There are no map tiles yet: draw the area yourself (paths, a grid, a compass to a target).

`src/kit/geo.js` has the maths: `distance(a, b)` in metres, `bearing(a, b)` in degrees from north,
`offset(p, east, north)`, `toLocal(origin, p)` → `{ x, y }` metres for drawing, and `cellId(p, metres)`,
a whole number that is the same for everyone in the same square (to seed "what spawns here today").

Test: `npm run location-test` checks the rounding, the play-time rule and the stand-ins in the real
app with a fake GPS position.

## Juice

`import { Juice, ease, lerp, approach, pulse, Tweens, Particles, Shake, Popups } from '../kit/juice.js';`

The `Juice` object bundles the lot. Use `new Juice({ pixel: true })` in Pocket, Color and Advance
games so effects snap to whole pixels.

```js
const fx = new Juice();
reset()    { fx.clear(); }
update(dt) { fx.update(dt); if (fx.frozen) return; /* your game logic */ }
draw(c)    { /* background */ fx.begin(c); /* the world */ fx.end(c, W, H); /* HUD */ }
// when something happens:
fx.burst(x, y, { n: 16, speed: 140, color: ['#ff0', '#f80'], gravity: 300 });
fx.shake(6);                    // about 6 units of shake, fades by itself
fx.pop(x, y, '+10', { color: '#ffd23f' });
fx.flash('#ffffff', .3);        // full-screen flash
fx.freeze(.06);                 // hit-stop: the action pauses for a moment (check fx.frozen)
fx.tween(card, { x: 200, s: 1 }, .4, ease.outBack).then(() => {});
```

- **Particles** `burst(x, y, opts)`: `n`, `speed`, `spread`, `angle` + `arc` (a cone), `life`, `size`,
  `shrink`, `gravity`, `drag`, `color` (one or a list), `shape` (`'circle'`, `'square'`, `'spark'`),
  `glow`. `emit(x, y, vx, vy, opts)` adds one (trails, smoke).
- **Easing**: `ease.linear`, `inQuad`, `outQuad`, `inOutQuad`, `inCubic`, `outCubic`,
  `inOutCubic`, `inBack`, `outBack` (pops), `outElastic` (springy), `outBounce`, `inOutSine`.
- **Tweens**: `fx.tween(obj, props, seconds, easing, delay)` animates any numbers on any object.
- `approach(cur, target, rate, dt)` follows a target smoothly at any frame rate (cameras, needles).
  `pulse(t, period)` is a smooth 0..1 wave for glowing "tap here" prompts.
- In 3D games, draw `fx.begin(c); v.render(c, W, H); fx.end(c, W, H);` so the shake moves the 3D
  frame too. For 3D sparks use the 3D kit's own particles.

## Sound

`import { sounds, noise, notes, tone, music, freq } from '../kit/sound.js';`

```js
sounds.coin();  sounds.coin(1 + combo * .05);    // optional pitch: rising combos
noise(.4, { vol: .1, from: 2000, to: 80 });      // a custom explosion
notes('C5 E5 G5 C6:3', { len: .09 });           // a jingle; ':3' = three steps long, '.' = rest
const tune = music({ tempo: 128, lead: 'E5 . G5 . A5 - G5 .', bass: 'C3 . . . G2 . . .', drums: 'k . h . s . h .' });
tune.start(); tune.speed(1.2); tune.stop();
```

- **Ready-made**: `coin`, `jump`, `hurt`, `hit`, `boom`, `laser`, `shoot`, `powerup`, `select`,
  `blip`, `pop`, `splash`, `click`, `win`, `lose`, `levelup`, `countdown(last)`.
- **`noise(len, { vol, from, to, filter, q })`**: filtered noise sweeping from `from` Hz to `to` Hz.
  High to low is an explosion, short and high is a hit, long and low is a rumble.
- **`tone(note, { len, wave, vol, slide })`**: one note with a soft envelope. Notes are names
  (`'A4'`, `'C#5'`, `'Eb3'`) or Hz.
- **`music({ tempo, lead, bass, pad, arp, drums, vol, swing })`**: a looping tune. Each part is a
  line of eighth-note steps: a note, `.` for a rest, `-` to hold the note before. Drums: `k` kick,
  `s` snare, `h` hi-hat, `c` crash (several at once: `kh`). Parts can be different lengths.
- Start music in `update()`, not in `reset()` (reset also runs while the game waits in the feed).
  The app stops all music when a round ends or the player moves to another game.
- Everything respects the mute button. `sfx()` still works as before.

## Controls

`import { Stick, Button, Gestures, route, twoThumb, Keys } from '../kit/controls.js';`

Every control takes `down(x, y, id)`, `move(x, y, pressed, id)`, `up(x, y, id)`, just like your game,
so you can pass input straight through. Fingers are tracked by id, so two thumbs work together.

```js
// one stick that appears wherever the thumb lands
const stick = new Stick({ r: 30, floating: true, zone: [0, 0, W, H] });
down: (x, y, id) => stick.down(x, y, id), move: (x, y, p, id) => stick.move(x, y, p, id), up: (x, y, id) => stick.up(x, y, id),
update(dt) { player.x += stick.x * speed * dt; player.y += stick.y * speed * dt; },
draw(c) { /* ... */ stick.draw(c); },

// the standard two-thumb layout: move on the left, aim stick or buttons on the right
const pad = twoThumb(W, H, { right: 'stick' });      // or { right: ['A', 'B'] }
pad.left.x, pad.right.angle, pad.buttons.A.pressed()  // resize(w, h) { pad.layout(w, h); }

// tap / double-tap / hold / swipe, the same feel in every game
const g = new Gestures({ tap(x, y) {}, doubleTap(x, y) {}, hold(x, y) {}, holdEnd(x, y, secs) {}, swipe(dir, vx, vy) {} });
update() { g.update(); }   // needed for hold
```

- `Stick`: `x`, `y` (-1..1, with a dead zone), `mag`, `angle`, `active`. Options `r`, `floating`,
  `zone: [x, y, w, h]`, `dead`, `axis: 'x'` (a slider). `place(x, y, zone)` moves it on resize.
- `Button`: `isDown`, `pressed()` (once per press), `released()`, `heldFor` (seconds).
- `route(a, b, c, fallback)` gives each finger to the first control that wants it. A function at the
  end gets everything else as `fn(type, x, y, id)`.
- `Keys` remembers held keys for desktop: `key: (k, d) => keys.key(k, d)`, then `keys.axis()` for
  arrows / WASD, `keys.held(' ')`.
- Call `release()` on controls in `reset()`, so a finger held at game over doesn't stick.
- Draw sticks and buttons faintly, and keep them off the important part of the screen.

## Physics

`import { World } from '../kit/physics2d.js';`

Balls and upright boxes that fall, bounce, roll, stack and collide.

```js
const world = new World({ gravity: 900, walls: [0, 0, W, H] });   // walls: false for an open world
world.box(W / 2, H - 10, W, 20, { fixed: true });                  // boxes: centre x, y, width, height
const ball = world.circle(100, 40, 12, { bounce: .7 });
world.onHit((a, b, speed) => { if (speed > 150) sounds.hit(); });   // b is null for a wall
update(dt) { world.step(dt); }
draw(c) { for (const b of world.bodies) /* draw at b.x, b.y using b.r or b.w, b.h, and b.angle for balls */ ; }
debug(c) { world.debugDraw(c); }                                     // outlines in the debug overlay
```

- Body options: `bounce` (0..1), `friction` (0..1), `mass` or `density`, `fixed`, `sensor` (reports
  hits, doesn't push), `gravity` (multiplier: 0 floats, -1 rises), `drag`, `tag` (yours to use).
- `b.push(ix, iy)` kicks a body; or set `b.vx`, `b.vy` directly. `world.remove(b)`.
- `world.at(x, y)` finds the body under a finger (pick things up), `world.near(x, y, r)` lists the
  bodies in a circle, `world.blast(x, y, radius, strength)` throws things outward.
- Boxes don't rotate, so towers stay steady. Settled bodies go to sleep and cost almost nothing.
- Keep it to a few hundred bodies on phones.

## Debug overlay

In `npm run dev` (and test builds), press `` ` `` (backquote) or F2 while a game is on screen, or
open the page with `?debug`, or run `__gs.debug()` in the browser console. It never appears in the
store apps.

| Key | Does |
| --- | --- |
| `` ` `` / F2 | Overlay on and off |
| `[` `]` | Slower and faster: 0.1x, 0.25x, 0.5x, 1x, 2x |
| `P` | Pause |
| `.` | While paused: step one frame |
| `H` | Hitboxes on and off |

The panel shows frames per second, how long your `update()` and `draw()` take, the game's size,
score and state. For hitboxes, give your game object a `debug(c)` method that outlines whatever you
like in game units; it is drawn on top while hitboxes are on. A physics game can just call
`world.debugDraw(c)`.

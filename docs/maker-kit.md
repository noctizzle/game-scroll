# Maker kit

Ready-made tools for making games feel good, so you can spend your time on the idea and not on
plumbing. Everything here is built into the app, made in code (no image or sound files), and works
in every style. The `npm run new` templates use all of it, so they are the quickest way to see it.

Games use all of it through one import, `gs`:

```js
import gs from '../gamescroll.js';
const { sounds } = gs.sound, { haptic } = gs.device, { Feel } = gs.effects;
```

| You want | Use | Section |
| --- | --- | --- |
| A working game to start from | `npm run new my-game --style pocket` | [Starter templates](#starter-templates) |
| To remember things between plays | `api.save(data)`, `api.load(fallback)` | [Save slots](#save-slots) |
| To pause cleanly | `pause()` / `resume()` hooks | [Pause and resume](#pause-and-resume) |
| A level from where the player is, or walking to play | `api.location()`, `gs.geo` | [Location](#location) |
| Coin, hit, boom, hurt... in one line | `gs.effects.Feel` | [Effects](#effects) |
| Particles, screen shake, smooth movement, "+10" pop-ups | `gs.juice` | [Juice](#juice) |
| Explosions, jingles, music, designed sounds, synths | `gs.sound` | [Sound](#sound) |
| A thumbstick, buttons, tap / hold / swipe | `gs.controls` | [Controls](#controls) |
| Game controllers, analog sticks, rumble | `gs.pad` | [Game controllers](#game-controllers) |
| Swing, punch, throw, flip, twist the phone | `gs.moves` | [Motion moves](#motion-moves) |
| Crisp pixel text, sprites drawn from text | `gs.pixel` | [Pixel text and sprites](#pixel-text-and-sprites) |
| Things that spin, tumble, hinge, swing on ropes | `gs.physics` (Rapier) | [Physics](#physics) |
| 3D bodies, level collisions, a walking character | `gs.physics3d` (Rapier) | [3D physics](#3d-physics) |
| Enemies that chase, flee, flock, find a path | `gs.ai` (Yuka) | [AI](#ai) |
| Seeded random, daily seed, smooth noise, timers | `gs.math` | [Maths](#maths) |
| 3D text, 3D particles, outlines, glitch, trails | `gs.fx3d` | [3D extras](#3d-extras) |
| Play with your face or your hands | `gs.vision` (MediaPipe) | [Face and hands](#face-and-hands) |
| To see frame rate, hitboxes, slow motion | press `` ` `` in `npm run dev` | [Debug overlay](#debug-overlay) |

## What `gs` has, and what it doesn't

`gs` is a frozen object with one group per job: `sound`, `device`, `util`, `math`, `palettes`,
`juice`, `effects`, `controls`, `pad`, `moves`, `pixel`, `gfx`, `bricks`, `physics`, `physics3d`,
`ai`, `toon` (Classic Console 3D), `hd` (Next Gen 3D), `ar`, `fx3d`, `vision`, `geo` and `THREE`.
It is the only thing a game may import (`src/game-modules.js`); `npm run games` refuses anything
else and the PR check flags it.

Everything else (credits, saved progress, settings, hearts, raw storage, the unrounded location)
belongs to the app and isn't on `gs`. Save with `api.save()`, find the player with `api.location()`.

`gs` sends each call to the right place underneath: our own kits, or the best free library for the
job (Rapier for physics, Yuka for AI, MediaPipe for faces and hands, Tone.js, ZzFX, three.quarks,
troika-three-text, simplex-noise). If we swap a library later, games don't change.

**Big parts load when first used.** Physics, 3D physics, 3D extras, face tracking and Tone.js are a
few MB, so the app loads them the first time a game needs them. Create those things in `make()` or
`reset()`: if the library isn't in yet, the app shows "Loading…" on the card and makes your game
again once it is. Don't create them later (in `update()` or a tap), or the game will stop with an error.

Each streamed game lists the parts of `gs` it uses, so an app version that doesn't have one yet
skips the game until it updates.

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
| `advance` | Tower of crates that tumble; real 2D physics (Rapier), pixel text, a save slot for the best tower |
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
const { cellId, distance, offset } = gs.geo;

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

`gs.geo` has the maths: `distance(a, b)` in metres, `bearing(a, b)` in degrees from north,
`offset(p, east, north)`, `toLocal(origin, p)` → `{ x, y }` metres for drawing, and `cellId(p, metres)`,
a whole number that is the same for everyone in the same square (to seed "what spawns here today").

Test: `npm run location-test` checks the rounding, the play-time rule and the stand-ins in the real
app with a fake GPS position.

## Juice

`const { Juice, ease, lerp, approach, pulse, Tweens, Particles, Shake, Popups } = gs.juice;`

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

`const { sounds, noise, notes, tone, music, freq, zzfx, zsound, Tone, sfx } = gs.sound;`

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
- Everything respects the player's Sound & haptics settings (sound, volume, music). `sfx()` still works as before.
- **Your own sound effects with ZzFX**: design one on the [ZzFX page](https://killedbyapixel.github.io/ZzFX/)
  (move the sliders, press play), copy the list of numbers and play it: `zzfx(...[,,925,.04,.3,.6,1,.3,,6.27,-184,.09,.17])`.
  `const zap = zsound(...numbers); zap(); zap(1.5)` keeps one to play again (1.5 = higher).
- **Real synths with Tone.js** (for music and rhythm games): `const T = Tone()` in `make()` or `reset()`
  (it loads first), then anything from [tonejs.github.io](https://tonejs.github.io/):
  `new T.PolySynth(T.Synth).toDestination().triggerAttackRelease(['C4', 'E4', 'G4'], '8n')`. It plays
  through the app's volume and mute.

## Controls

`const { Stick, Button, Gestures, route, twoThumb, Keys } = gs.controls;`

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

`const { Physics } = gs.physics;` Real 2D rigid-body physics from [Rapier](https://rapier.rs): shapes
spin and tumble, and you can join them with hinges, springs, ropes, welds and sliders. Slingshots,
bridges, wrecking balls, ragdolls, cars, stacking, pinball. Everything is in your game's units
(pixels, y down); angles are radians, clockwise on screen, so `c.rotate(t.angle)` just works.

```js
reset() {
  phys = new Physics({ gravity: 900, walls: [0, 0, W, H] });   // in make() or reset(): the engine loads first
  crate = phys.box(100, 50, 30, 30, { bounce: .2 });           // centre x, y, width, height
  ball = phys.circle(200, 40, 12, { bounce: .6 });
  phys.hinge(null, flipper, 80, 500, { min: -.5, max: .5 });  // null = pinned to the world
  phys.rope(null, 180, 0, ball, 180, 200);                     // a rope from the ceiling to the ball
  phys.onHit((a, b, speed, x, y) => { if (speed > 200) feel.hit(x, y); });
}
update(dt) { phys.step(dt); }
draw(c) { for (const t of phys.things) { phys.path(c, t); c.fill(); } }   // or draw art at t.x, t.y, t.angle
debug(c) { phys.debugDraw(c); }
```

- **Shapes**: `circle(x, y, r)`, `box(x, y, w, h)`, `poly(x, y, [[x, y], ...])` (convex),
  `line([[x, y], ...], { loop })` (fixed ground, hills, ramps), `walls(x, y, w, h)`.
- **Options**: `bounce`, `friction`, `density`, `fixed`, `moving` (you `place()` it: platforms,
  paddles), `sensor` (pickups, goals), `bullet` (fast things), `noSpin` (players), `angle`, `spin`,
  `vx`, `vy`, `drag`, `gravity` (multiplier), `group` (1-14: same group never collide), `tag`.
- **A thing**: read or set `x`, `y`, `angle`, `vx`, `vy`, `spin`; `place(x, y, angle)`,
  `push(ix, iy)` (an instant kick: `push(0, -400)` jumps), `force(fx, fy)` (every frame: thrusters,
  wind), `twist(amount)`, `touching()`, `onGround()`, `remove()`.
- **Joints**: `hinge(a, b, x, y, { min, max, motor })`, `spring(a, b, ax, ay, bx, by, { stiffness, damping })`,
  `leash(...)`, `weld(a, b, x, y)`, `slider(a, b, x, y, dx, dy, { min, max, motor })`,
  `wheel(car, tyre, x, y)`, `rope(a, x1, y1, b, x2, y2, { links })`. Each returns a handle with `remove()`.
- **Drag with a finger**: `g = phys.grab(x, y)` in `down`, `g.move(x, y)` in `move`, `g.release()` in `up`.
- **Ask the world**: `at(x, y)`, `inBox(x, y, w, h)`, `ray(x1, y1, x2, y2)` → `{ thing, x, y, nx, ny, distance }`,
  `blast(x, y, radius, strength)`. Things made this frame show up in these after the next `step()`.
- The raw engine is there too: `phys.R` and `phys.world` (Rapier works in metres: `phys.toWorld(px)`).
- The old simple engine is still there as `gs.physics.World` (balls and upright boxes, no joints).

## 3D physics

`const { World3D } = gs.physics3d;` Rapier in 3D, in your three.js scene's units (metres, y up). It
keeps your meshes in step with their bodies.

```js
reset() {
  phys = new World3D({ gravity: -20 });
  phys.ground(levelGroup);                                  // any meshes: solid and fixed (floors, walls, ramps)
  crate = phys.box(crateMesh, 1, 1, 1);                     // falls and tumbles; crateMesh follows it
  hero = phys.mover(heroMesh, { radius: .4, height: 1.8 }); // walks into walls, climbs steps and slopes
}
update(dt) { hero.walk(stick.x * 6, stick.y * 6); if (tapped) hero.jump(8); phys.step(dt); }
```

- Bodies: `ball(mesh, r)`, `box(mesh, w, h, d)`, `capsule(mesh, r, height)`, `hull(mesh)` (shaped
  like the mesh), `ground(mesh)`, `floor(y)`. Same options as 2D (`bounce`, `fixed`, `moving`,
  `sensor`, `noSpin`, `group`...), plus `at` for a body with no mesh.
- A body: `pos`, `vel`, `place(x, y, z)`, `setVel()`, `push(x, y, z)`, `twist()`, `touching()`, `remove()`.
- The mover: `walk(vx, vz)` every frame, `jump(speed)`, `grounded`, `feet`, `place()`.
- `ray(from, dir, max)` → `{ thing, point, normal, distance }` (aiming, line of sight, "what's under me"),
  `near(p, r)`, `blast(p, r, strength)`, `onHit((a, b, speed) => ...)`.
- Joints: `hinge(a, b, p, axis, { min, max, motor })`, `pin(a, b, p)` (ball and socket), `weld(a, b)`,
  `spring(a, b, pa, pb)`, `leash(a, b, pa, pb, length)`.

## AI

`const { Crowd, NavGrid, Brain } = gs.ai;` Steering and path finding from [Yuka](https://mugen87.github.io/yuka/),
in your game's 2D units.

```js
reset() {
  crowd = new Crowd();
  bat = crowd.add(50, 50, { speed: 120 }).chase(player);    // anything with x, y
  sheep = crowd.add(200, 300, { speed: 60 }).wander().flock();
  nav = new NavGrid(20, 30, 16, (cx, cy) => level[cy][cx] === '#');
  guard = crowd.add(40, 40).hunt(player, nav);                // goes round the walls, re-plans as you move
}
update(dt) { crowd.update(dt); }                             // read bat.x, bat.y, bat.angle
```

- Steering: `seek`, `arrive`, `flee(target, panic)`, `chase`, `pursue(agent)`, `evade(agent)`,
  `wander()`, `follow(route, loop)`, `separate()`, `flock()`, `stop()`. They combine: `.wander().flee(cat)`.
- `NavGrid`: `path(x1, y1, x2, y2)` → `[{ x, y }, ...]` or null, `sees(x1, y1, x2, y2)` (line of sight),
  `set(cx, cy, wall)` (doors, towers), `blocked(x, y)`.
- `Brain(start, { state: { enter, update(dt), exit } })`: `go(name)`, `is(name)`, `time` in the state.
- All of Yuka is there as `gs.ai.YUKA` (fuzzy logic, goals, vision cones, nav meshes).

## Maths

`const { rng, daily, noise2, fbm, vec, overlap, Grid, Timers } = gs.math;`

- `rng(seed)` → `r()` 0..1, `r.int(a, b)`, `r.range(a, b)`, `r.pick(list)`, `r.shuffle(list)`, `r.chance(p)`.
  Same seed, same numbers: levels everyone shares.
- `daily('my-game')`: today's seed (the same for every player all day). `rng(daily('my-game'))` makes a daily challenge.
- `noise2(x, y)`, `noise3(x, y, z)`: smooth noise -1..1 (simplex-noise) for hills, caves, clouds,
  wobble. `fbm(x, y, octaves)` is rougher and more natural. `noiseSeed(seed)`, `makeNoise(seed)`.
- `vec.add / sub / scale / len / dist / norm / dot / angle / fromAngle / rotate / lerp` on `{ x, y }`,
  `angleDiff(a, b)`, `wrap(v, max)`.
- `overlap.circles / boxes / circleBox / pointInBox / pointInCircle / lineCircle`.
- `Grid(cell)`: find nearby things fast (hundreds of bullets): `clear()`, `add(t)`, `near(x, y, r)`.
- `Timers`: `after(sec, fn)`, `every(sec, fn)`, `update(dt)`. They run on game time, so they stop
  when the game pauses (setTimeout doesn't).

## Effects

`const { Feel } = gs.effects;` The sight, sound and buzz of common moments in one call.

```js
const feel = new Feel();                 // new Feel({ pixel: true }) for pixel styles
reset()    { feel.clear(); }
update(dt) { feel.update(dt); if (feel.frozen) return; }
draw(c)    { feel.begin(c); /* the world */ feel.end(c, W, H); }
feel.coin(x, y); feel.hit(x, y, { power: .8 }); feel.boom(x, y, { size: 1.5 }); feel.hurt(x, y);
feel.jump(x, y); feel.land(x, y, speed); feel.shoot(x, y); feel.powerup(x, y); feel.combo(n, x, y);
feel.score(x, y, 50); feel.win(x, y); feel.lose(); feel.click(); feel.play(zzfxNumbers);
```

`feel.juice` is the Juice underneath, for your own particles and tweens.

## Pixel text and sprites

`const { text, measure, sprite, anim, tiles } = gs.pixel;`

```js
text(c, 'SCORE 120', 4, 4, { size: 2, color: '#fff' });                       // 3×5 font, always crisp
text(c, 'GAME OVER', W / 2, 80, { font: 'big', align: 'center', outline: '#000' });   // 8×8 font
const hero = sprite(`
  ..kk..
  .kyyk.
  ..kk..`, { k: '#000', y: '#fd0' });     // one letter per pixel, '.' is clear
hero.draw(c, x, y, { scale: 3, flip: true, outline: '#fff' });
const red = hero.recolor({ y: '#f33' });
const walk = anim([frameA, frameB], palette, 8);  walk.draw(c, x, y, time, { scale: 3 });
```

Sprites and text are drawn once and cached. `sprite.solid(px, py)` is for pixel-perfect hits;
`tiles(art, palette, 8, 8)` cuts a tile sheet.

## Game controllers

A pad already works in every game: the d-pad and left stick are the arrow keys, A is Space, B is
`x`, X is `z`, Y is `c`, Start pauses. In the feed, A plays and up / down move between games. For
analog control:

```js
const { pad, pads, rumble } = gs.pad;
const p = pad();                         // null with no controller
if (p) { ship.vx = p.x * 200; if (p.pressed('a')) fire(); if (p.rt > .5) boost(); }
rumble(.6, 200);
```

`p.x, p.y, p.rx, p.ry` (sticks, with a dead zone), `p.lt, p.rt` (triggers), `held / pressed /
released(name)` for `a b x y l r start select up down left right`. `pads()` lists every controller.

## Motion moves

`const { Moves } = gs.moves;`

```js
reset() { moves = new Moves(); moves.on('swing', m => slash(m.dir, m.power)); moves.on('flip', () => flip()); }
update(dt) { moves.update(); }   // moves are handed to your handlers here
```

Moves: `swing` (`dir` left / right / up / down), `punch`, `throw`, `flip` (forward / back),
`twist` (left / right), `knock`, `shake`, and `any`. Each has `power` 0..1. `new Moves({ sensitivity: 1.3 })`
fires more easily. On iPhones the player is asked for motion access when they tap Play.

## 3D extras

`const { text3d, Particles3D, outline, glitch, trails, focus, pixelate } = gs.fx3d;` (make them in
`make()` or `reset()`: they load first).

- `text3d('PLAYER 1', { size, color, font: 'bold' | 'regular' | 'pixel', outline, face: true })`:
  sharp text in the 3D world ([troika-three-text](https://protectwise.github.io/troika/troika-three-text/)).
- `fx = new Particles3D(scene)`, then `fx.fire(pos)`, `fx.smoke(pos)`, `fx.magic(pos)`, `fx.snow(pos)`
  (keep going: `.stop()`, `.remove()`, `.at(pos)`) and `fx.boom(pos)`, `fx.sparks(pos)` (one-off), or
  your own with `fx.make(pos, { ... })`. Call `fx.update(dt)` every frame ([three.quarks](https://github.com/Alchemist0823/three.quarks)).
- Next Gen views only: `outline(view, objects, { color })`, `glitch(view)`, `trails(view, .85)`,
  `focus(view, { focus: 10 })` (depth of field), `pixelate(view, 4)`. Each returns a pass with `remove()`.

## Face and hands

`const { Face, Hands } = gs.vision;` Face and hand tracking with the front camera, from Google's
[MediaPipe](https://ai.google.dev/edge/mediapipe). It all runs on the phone: no picture leaves it.

```js
reset() { face = new Face(); }           // loads the library first
update(dt) {
  if (!face.running) face.start();       // asks for the front camera the first time
  face.update();
  if (face.found) { ship.x = face.x * W; if (face.mouth > .5) chomp(); if (face.blink) jump(); }
}
```

- `Face`: `found`, `x`, `y` (0..1, mirrored like a selfie), `size`, `yaw`, `pitch`, `roll`, `mouth`,
  `smile`, `blink`, `winkLeft`, `winkRight`, `brows`, `points` (478), `shapes` (52 expressions by name).
- `Hands`: `list` of `{ x, y, tipX, tipY, pinch, pinchX, pinchY, open, fist, point, side, points }`, `first`.
- `ready` is true once the camera and model are running; `failed` holds the error if the player
  said no to the camera. The app stops the camera when the round ends.
- The models (4 MB face, 8 MB hands, plus a 14 MB engine) download from our games server the
  first time; `npm run ml` fetches them for `npm run dev`.

## Pause and resume

The app pauses a game when the player opens How to play, switches apps, or presses Escape or a
controller's Start, and shows a "Carry on" button. `update()` simply stops being called, and
music is held. If your game has its own timers or sounds outside `update()`, add `pause()` and
`resume()` to your game object. Use `gs.math.Timers` rather than `setTimeout` and you won't need to.

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
`phys.debugDraw(c)`.

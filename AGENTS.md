# Game Scroll: instructions for AI coding tools

Game Scroll is a phone app where you scroll a feed of quick mini games, like a short-video feed
but every card is playable. Each game is **one file in `src/games/`**. These instructions are for
AI tools (Claude Code, Codex, Gemini CLI, Copilot, Cursor...) helping someone make or fix a game.
The human-facing guide is [CONTRIBUTING.md](CONTRIBUTING.md); the kit reference is
[docs/maker-kit.md](docs/maker-kit.md).

## Making a game: the steps

1. Pick an idea that plays differently from the games already in `src/games/` (look at their
   `title`, `tag` and `hint`) and from `docs/game-ideas.md`. A new mechanic, not a reskin.
2. Start from a template: `npm run new <id> --style <phone|pocket|color|advance|console|nextgen|ar>`.
   It writes `src/games/<id>.js`, a small working game. Then change it into the new game.
3. Write the game (rules below). Use `gs` for everything shared.
4. Check it, and fix whatever fails:
   ```bash
   node scripts/game-lint.mjs <id>          # forbidden code (network, storage, eval...)
   npm run games                             # builds streamed files; fails on bad imports or a missing gs part
   npm run build:bundled && node scripts/smoke.cjs <id>   # plays it with random input; fails on any error
   node scripts/stream-smoke.mjs <id>        # plays it streamed, the way the store apps run it
   node scripts/fold.cjs <id>                # survives folding / unfolding the screen
   ```
   For Console and Next Gen games also run `node scripts/sweep.cjs <id>`. `node scripts/budget.cjs <id>`
   checks frame time and memory on a slowed CPU (the PR check runs it too).
5. Only change files in `src/games/` (and optionally tick the idea in `docs/game-ideas.md`). Shared
   code (`src/kit/`, `src/gamescroll.js`, `src/main.js`...) ships inside the app: change it only when
   asked to, in a separate PR.
6. **Adding a dependency** (a package in `package.json` `dependencies`, only for shared code): add it
   to `src/licences.js` in the same PR so it shows under Settings › Licence › Open-source parts.
   `npm run licences` checks this, and the PR check fails until it's listed.

## The rules (a game that breaks one won't be merged)

- **Original.** Genres and mechanics are fine; recreating a specific existing game (its name,
  characters, art, music, levels or look, even renamed) is not. Invent names and characters.
- **One file, drawn in code.** No image, font, sound or data files. Draw on the canvas; make sounds
  with `gs.sound`.
- **Only `gs`.** The one import is `import gs from '../gamescroll.js'`. No other imports, no
  `fetch`, `XMLHttpRequest`, `WebSocket`, `localStorage`, `indexedDB`, `eval`, `new Function`,
  `import()`, `window.open`, Capacitor or `navigator.geolocation`. Save with `api.save()`, find the
  player with `api.location()`.
- **Touch first.** Fully playable with touch alone. Sensors (tilt, mic, camera, face, motion moves)
  need a touch fallback.
- **Quick.** One sentence of hint explains it; a round lasts about 20 seconds to 3 minutes.
- **Family friendly.** Cartoon action is fine; no gore, hate, real-money gambling.
- `goal` is required: the score that counts as a win (a decent player reaches it in about a minute).

## A game file

```js
import gs from '../gamescroll.js';
const { sounds } = gs.sound, { haptic } = gs.device, { Feel } = gs.effects, { clamp, rnd } = gs.util;

const W = 360, H = 640;

function make(api) {
  const feel = new Feel();
  let things, score, t;
  return {
    reset() { things = []; score = 0; t = 0; feel.clear(); },   // ALL round state here
    update(dt) {                                               // dt in seconds
      feel.update(dt); if (feel.frozen) return;
      t += dt;
      // ...move things, spawn, check for game over: api.over()
    },
    draw(c) {                                                  // draw the whole frame, W x H units
      c.fillStyle = '#123'; c.fillRect(0, 0, W, H);
      feel.begin(c); /* the world */ feel.end(c, W, H);
      // HUD
    },
    down(x, y, id) { /* already in game units */ score++; api.score(score); feel.coin(x, y); },
    move(x, y, pressed, id) {},
    up(x, y, id) {},
    key(k, isDown) {},                                         // optional: desktop keys and controllers
  };
}

export default {
  id: 'my-game',                  // = the file name
  title: 'My Game',
  tag: 'Casual · Reflex',         // '<Style> · <Genre>'
  retro: false,                   // style fields: see "Styles" below
  w: W, h: H,
  goal: 30,
  hint: 'Tap the ... before they ... Miss three and it is over.',
  creator: 'Your Name',
  make,
};
```

`api`: `score(n)`, `over()`, `win()`, `has(itemId)`, `away()` (seconds since it last ran), `save(data)` / `load(fallback)` / `clearSave()`
(2 KB JSON; changing its shape? add `save: { version, migrate(data, from) }` to the definition), `location()` / `watchLocation(cb)` (needs `location: 'coarse'` or `'precise'` in the
definition). Optional game methods: `snapshot()` / `restore(data)` (keep a round across hot reload), `fx(dt)` (effects behind the game-over screen), `resize(w, h)`
(fluid games with `maxW`, `maxH`), `debug(c)`, `pause()`, `resume()`.
Next Gen and AR: frame generation makes the in-between frames on 120 Hz screens by itself; `frameGen: 'ahead'`
(no added delay) or `frameGen: false` in the definition, and `view.cut()` after a camera jump.

The app draws the start and game-over screens and the score. The game only draws play.

## Styles

| Style | Fields | Tag | Size | Use |
| --- | --- | --- | --- | --- |
| Phone (Casual) | `retro: false` | `Casual ·` | 360 × 640 | any colours, smooth |
| Dot matrix (Pocket) | `retro: true, pal: 'moss'` | `Pocket ·` | 160 × 160 | exactly 4 shades: `gs.palettes.PAL[pal]` |
| Color (Pocket) | `retro: true, era: 'color', pal: 'lemon'` | `Color ·` | 160 × 160..192 | `gs.palettes.C16` |
| Advance (Pocket) | `retro: true, era: 'advance', pal: 'grape'` | `Advance ·` | 176 × 176 | rich pixel colours, sprites |
| Classic Console (3D) | `retro: true, era: 'console', pal: 'grape'` | `Console ·` | 192 × 160 | `gs.toon` cel-shaded 3D |
| Next Gen (HD 3D) | `retro: true, era: 'nextgen', pal: 'grape'` | `Next Gen ·` | 300 × 300 | `gs.hd` PBR, shadows, bloom |
| AR · 3D | `retro: true, era: 'ar', pal: 'grape'` | `AR ·` | 300 × 460 | `gs.ar` camera + gyro |

Pixel styles (Pocket, Color, Advance): use `new Feel({ pixel: true })`, whole-pixel positions and
`gs.pixel` for text and sprites. 3D: copy the matching template; docs are `docs/console-3d.md`,
`docs/nextgen-3d.md`, `docs/ar-3d.md`.

## What's on `gs` (use it rather than writing your own)

- `gs.effects.Feel`: `coin`, `hit`, `boom`, `hurt`, `jump`, `land`, `shoot`, `powerup`, `combo`,
  `score`, `win`, `lose`, `click`: particles + shake + sound + haptics in one call.
- `gs.juice`: `Juice` (particles, shake, pop-ups, flash, hit-stop, tweens), `Timeline` + `stagger` (anime.js; lazy), `ease`, `lerp`, `approach`, `pulse`.
- `gs.sound`: `sfx(f, d, type, vol, slide)`, `sounds.coin()` etc., `noise()`, `notes('C5 E5 G5')`,
  `music({ tempo, lead, bass, drums })`, `zzfx(...numbers)`, `zsound()`, `Tone()` (Tone.js; lazy),
  `mixer` (`volume`, `duck`, `room('cave')`, `muffle`), `say(text, { pitch, rate, lang })` (text to speech).
- `gs.device`: `haptic('light'|'medium'|'heavy'|'tick'|'success'|'warning'|'error')`, `buzz()`,
  `hapticPattern([{ at, len, strength, sharpness, to }] | 'heartbeat'|'explosion'|'charge'...)`,
  `tilt()` + `want('motion')`, `calibrateTilt()`, `onShake(cb)`, `heading()`, `faceDown()`,
  `startMic()` (`level()`, `pitch()`, `blow()`, `clapped()`, `whistle()`)/`stopMic()`, `startCamera()`/`stopCamera()`.
- `gs.controls`: `Stick`, `Button`, `Gestures` (tap, doubleTap, hold, swipe), `TwoFingers` (pinch, twist, pan), `twoThumb(W, H)`, `Keys`, `route()`.
- `gs.pad`: `pad()` (analog sticks, triggers, `pressed('a')`), `pads()`, `rumble()`. Pads also arrive as keys.
- `gs.moves.Moves`: `on('swing'|'punch'|'throw'|'flip'|'twist'|'knock'|'shake', fn)`, `update()` each frame.
- `gs.pixel`: `text(c, str, x, y, { size, font: 'small'|'big', align, color, outline })`,
  `sprite(art, palette)`, `anim(frames, palette, fps)`, `tiles()`.
- `gs.physics.Physics` (Rapier 2D; lazy): `circle`, `box`, `poly`, `line`, `walls`, `hinge`, `spring`,
  `rope`, `weld`, `slider`, `wheel`, `grab`, `ray`, `at`, `blast`, `onHit`, `step(dt)`, `path(c, t)`.
- `gs.physics3d.World3D` (Rapier 3D; lazy): `ball`, `box`, `capsule`, `hull`, `ground(mesh)`,
  `floor`, `mover()` (walking character), `ragdoll()`, `ray`, joints, `step(dt)` syncs meshes.
- `gs.ai`: `Crowd` (`add(x, y).chase(t) / flee / wander / follow(route) / flock / hunt(t, nav)`),
  `NavGrid` (`path`, `sees`), `Brain` (state machine), `Tree` (behaviour trees: mistreevous text, actions by name), `Choose`
  (utility AI: the highest-scoring want), `YUKA`, `Swarm({ count, w, h, speed })` (thousands of flockers on the
  graphics chip where the phone can: `pull(x, y, { strength, radius })`, `obstacle`, `near`, `kill`, `x`/`y` arrays; `Swarm.max()`).
- `gs.things.Things` (game objects): `add(obj, tag)`, `hit(obj, tag)`, `hits(tagA, tagB, fn)`, `near`, `nearest`, `kill`, `reuse`, `each`, `all`.
  `gs.things.Node`: parent and child places (`add`, `update()`, `wx`/`wy`/`wangle`, `toWorld`, `hit`, `pick`, `attach`, `draw`).
- `gs.rounds`: `Scenes({ name: { enter, update, draw } }, start)` with `go(name, { fade })`, `cover`, `after()`; `Levels(list)`.
- `gs.pacing`: `Spawner({ every, fastest, over })`, `Waves([...], { breather })`, `Director` (difficulty that eases off), `ramp`.
- `gs.aim.AimAssist`: sticky aim, pull onto targets, auto fire (2D angle or 3D direction).
- `gs.senses`: `Senses` (sight cones, hearing, memory; moods calm/suspicious/alert/searching), `Noises`.
- `gs.camera.CameraRig` (3D): `chase`, `shoulder`, `first`, `top`, `side`, `orbit`, `rail`, `fixed`; walls, blends, `shake`, `kick`.
- `gs.nav3d.NavMesh3D` (lazy): 3D paths made from your level meshes, `crowd()` agents.
- `gs.characters`: `lookAt`, `reach` (two-bone IK), `Steps` (feet that plant), `Wobble`, `Face` (blend shapes, blinking, lip sync with `say(text)`), `shapes(geo, {...})`; ragdolls are `World3D.ragdoll()`.
- `gs.camera2d.Camera2D`: follow with a dead zone, look-ahead, zoom, level bounds, `layer()` parallax, `toWorld()`.
- `gs.tiles.TileMap.fromText(level)`: `#` walls, `-` one-way, `/` `\` slopes, letters as marks (`find('P')`);
  `move(box, dx, dy)`, `ray`, `sees`, `walkable()`, `draw(c, fn, cam)`, `edges(tx, ty)` (auto-tiling: `mask`, `blob`).
- `gs.paths`: `Path(points, { loop, kind })` (2D/3D; `at`, `offset`, `nearest`, `spaced`, `trace`), `Follower(path, { speed, end })`.
- `gs.bones.Rig`: 2D bone characters (`bone`, `pose`, `blend`, `clip`/`play`, `reach` IK, `look`, `wobble`, `kick`, `draw`).
- `gs.movers`: `Platformer` (coyote time, jump buffer, variable jump, wall jump, air jumps), `TopDown`.
- `gs.anim.Animator`: sprite animation states with frame events (`on('step')`), one-shots with `then`.
- `gs.story` (lazy): `Story(inkScript)` branching dialogue (`next()`, `choose(i)`, `vars`), `Typewriter`.
- `gs.replay`: `Ghost` (record a run, `pack()` for `api.save`, race it), `Recorder` / `Replayer` (whole rounds).
- `gs.look2d`: `Lights` (darkness, coloured lights, shadows off walls), `Screen` (lazy: crt, bloom, grade,
  glitch, film, shockwave...), `Batch` (lazy: thousands of WebGL sprites).
- `gs.brains` (Tiny Brains): `Brain(api, { inputs, actions, teacher, limits, rules })` learns as you play with guard rails (`act`, `feel`, `result`), `Wave` (each enemy an experiment, `unsure(see)`), `Imagine` (tries moves ahead; `fixed: true` for replays), `Predict` (learns the player's habits: `see`, `guess`, `sure`), `Player` (one private profile across games: `skill`, `note`), `Nemesis` (a rival who remembers you), `Shadow` (copies how you play; `pack()` for `start`), `tune()`; brain options `styles`, `tells`, `start`.
- `gs.board.Board` (match, fall, refill, `slide` 2048-style, `flood`, `hint`), `gs.battle` (`Fighter`, `Battle`
  turn order + types + statuses, `Bag`, `gainXp`, `loot`), `gs.gen` (lazy: `dungeon`, `cave`, `maze`, `islands`,
  `pattern`, `fov`, `proven` + `reach`; seeded, same text as TileMap), `gs.drag.Drag` (pieces, slots, snap, lists), `gs.idle`
  (`cost`, `afford`, `short`, `Earner`; `api.away()` for time away), `gs.party` (`Turns` with hand-over, `Split`
  screens), `gs.rhythm` (`Beat`, `Chart`, `Calibrate`), `gs.strokes` (`Stroke`, `Shapes` recogniser, `toPhysics`),
  `gs.vehicles` (`Car`, `Kart`, `Laps`; `World3D.vehicle()` for suspension), `gs.level3d.Level3D(text)`, `gs.sky`
  (`Sky` time of day, `Weather` rain/snow/storm).
- Action and adventure: `gs.combat` (`Gun`, `Shots`, `arc`/`lob`, `Health`, `Markers`, `Explosives`), `gs.tactics`
  (`CoverMap`, `Squad`, `Route`), `gs.climb` (`Ledges`, `Climber`, `Rope`), `gs.poses` (`figure`, `person` skinned with a face, `Rig` with `blend`/`blend2` blend spaces and `plant` foot IK), `gs.missions`
  (`Mission` scripts, `zone`), `gs.cutscene`, `gs.prompts` (quick-time), `gs.destruction` (`shatter`, `slice`, `Rubble`),
  `gs.stealth` (`lightAt`, `Takedown`, `Bodies`, `Floors`, `Disguise`), `gs.gadgets` (`Grapple`, `Zipline`, `Wires`, `Lock`,
  `Code`), `gs.arena` (`Arena`, `BallCar`, `chaseBall`), `gs.campaign.Campaign`, `gs.sound.Ears` (3D sound) and
  `music({ layers }).intensity()` + `follow(song)` (living music), `gs.props` (`Props` instancing + LOD, `Areas`, `Chunks`, `simplify`).
- Cities: `gs.city.City(view, { seed, blocks, style: 'downtown'|'oldtown'|'harbour'|'suburb', traffic, people, sky })` (made-up streets, lit buildings,
  traffic at the lights, people; `update(dt, player)`, `avoid`, `collide`, `ray`, `route`, `spot('door'|'rooftop'...)`, `cars.hit`, `people.scare`, `plan`, `drawMap`); guide `docs/city.md`.
- Worlds, craft, soft things, cards and menus: `gs.outdoors` (`Land` terrain + `grass`/`scatter`, `Water`, `tree`, `rock`, `Wind`, `impostor`),
  `gs.craft` (`Plane`, `Boat`, `Hover`, `Floater`), `gs.soft` (`Soft` cloth/rope/jelly with `grab`/`cut`, `Liquid`),
  `gs.cards` (`Deck`, `total`, `groups`, `poker`, `winners`, `stacks`), `gs.dice` (`roll('4d6kh3')`, `odds`, `Dice`, `Dice3D`),
  `gs.words` (lazy: `Words` dictionary, `compare`, `Bag`, `score`), `gs.ui` (lazy: `UI` flexbox layout and input with no look; you draw it).
- `gs.tweak(name, { speed: 3, grip: [.8, 0, 1] })`: live sliders in `npm run dev` (starting values elsewhere); read fields where used.
- `gs.prefs` (read only): the player's Reduce motion setting, `reduceMotion`, `motion`. Shake, flash and
  camera kicks already follow it; scale your own big effects by `gs.prefs.motion`.
- `gs.math`: `rng(seed)`, `daily(salt)`, `noise2`, `noise3`, `fbm`, `vec`, `overlap`, `Grid`, `Timers`, `angleDiff`, `wrap`.
- `gs.util`: `clamp`, `rnd`, `pix`, `disc`, `hash`, `fmt`, `flickTracker`. `gs.palettes`: `PAL`, `SHELL`, `C16`.
- `gs.gfx` (shaded 2D shapes, glow, backdrops), `gs.bricks` (toy bricks), `gs.geo` (location maths).
- `gs.toon` (Console 3D: `View`, `G`, `part`, `grp`, `blob`, `toon`), `gs.hd` (Next Gen: `HDView` with `decal`, `bakeLight`, `shafts`,
  `pbr`, `rbox`, `surface`, `speckle`, `Particles`, `sun`, `spot`), `gs.ar` (`ARView`, `FLOOR`, `arNote`), `gs.THREE`.
- `gs.fx3d` (lazy): `text3d()`, `Particles3D` (`fire`, `smoke`, `sparks`, `boom`, `magic`, `snow`),
  `outline`, `glitch`, `trails`, `focus`, `pixelate`.
- `gs.vision` (lazy): `Face` (`x`, `y`, `yaw`, `mouth`, `smile`, `blink`...), `Hands` (`pinch`, `open`, `point`...); runs on the phone's AI chip in the apps, so pass `{ preview: true }` if you draw `picture`.
- `gs.hear` (lazy): `Sounds({ want: ['Dog', 'Whistling'] })` (`start()` from a tap, `update(dt)`, `heard`, `hearing`, `top`),
  `Voice({ words, also })` (`start()`, `said(word)`, `available`). `gs.doodle` (lazy): `Doodle` (`guess(strokes, { among })` of 46 things).
  `gs.phoneai`: `PhoneAI({ persona, words })` `ask(prompt, { fallback })` for flavour lines only; play must never depend on it.

**Lazy parts** (physics, physics3d, nav3d, fx3d, vision, Tone, `story.Story`, `look2d.Screen`, `look2d.Batch`, `words.Words`, `ui.UI`, `juice.Timeline`, `hear.Sounds`, `doodle.Doodle`): create them in `make()` or `reset()`, never
later. The app shows "Loading…" and remakes the game once the library is in.
The 3D parts (`toon`, `hd`, `ar`, `bricks`, `physics3d`, `fx3d`, `camera`, `nav3d`, `characters`, `level3d`, `sky`, `poses`, `destruction`, `props`, `outdoors`, `city`, `THREE`)
and `ai`, plus the action kits (`combat`, `tactics`, `climb`, `missions`, `cutscene`, `prompts`, `stealth`, `gadgets`, `campaign`, `arena`) and play kits (`craft`, `soft`, `cards`, `dice`, `words`, `ui`) and smarts (`hear`, `doodle`, `phoneai`), also load on first use, so the app opens fast. The app loads the ones a game uses before it
runs, so read them as usual (`const { HDView } = gs.hd` at the top of the file is fine).

**Sensors are worked out for you.** The build reads which camera, mic and motion parts a game uses and
the card says so before Play (and iPhones ask for motion access on the Play tap). Don't add a field.

**Types:** `src/gamescroll.d.ts` describes all of `gs` and the game definition, so editors autocomplete.
Add `/** @type {import('../gamescroll.js').GameDef} */` above `export default` to check the definition.

## Common mistakes

- Making the kits decide the look: kits give answers (hits, timings, where to aim or look); your game draws and sets the rules.

- Round state set in `make()` instead of `reset()`, so "Play again" doesn't start clean.
- Using `Date.now()` or `setTimeout` for game timing: use `dt` and `gs.math.Timers` (they pause with the game).
- Starting music in `reset()` (it also runs while the card waits in the feed): start it in `update()`.
- Drawing in screen pixels: always draw in `w` × `h` game units; input is already converted.
- Forgetting a touch fallback for tilt, mic, voice, camera, face or motion.
- Pocket games with more than 4 shades, or smooth (non-integer) positions in pixel styles.
- A `goal` nobody can reach, or a game that scores with no input.

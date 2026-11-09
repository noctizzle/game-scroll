# Next Gen · Console games: modern HD 3D

Next Gen Console games (`era: 'nextgen'`) aim for the look of current home consoles. They sit next
to the Classic Console games (`era: 'console'`, cel-shaded, see [console-3d.md](console-3d.md)) and
must look clearly a generation ahead of them. Stylised and cartoony characters are fine; the
rendering is what makes it Next Gen.

The kit is `src/kit/hd3d.js`. Games built on it: `bunker-breakout.js` (corridor shooter),
`suit-ops.js` (top-down jungle twin-stick), `gravity-grip.js` (tube racer that drives on walls and
ceilings), `neon-drift.js` (drift racer on a wet neon street circuit), `storm-hook.js` (grapple swinging),
`deep-pressure.js` (sonar sub; its walls glow with the sonar ring through `gs.hd.pulse`),
`mech-brawl.js` (boxing), `frost-line.js` (snowboarding, tilt to carve) and `canyon-ace.js` (tilt-to-fly jet).

## What the kit gives you

- **Physically based materials** (`pbr(colour, { rough, metal, glow, clear, tex })`): roughness,
  metalness, clearcoat, sheen and emissive glow, lit by real-time lights and image-based
  reflections (a studio environment map, strength set per view with `env`).
- **Procedural surface textures** (`surface(size, paint)`): you paint colour, height and
  roughness on canvases in code, and the kit derives a normal map from the height. No image files.
  `speckle()` adds grime and noise.
- **Bevelled boxes** (`rbox(w, h, d, r)`): rounded edges catch highlights, which reads as
  "modern" far more than sharp boxes.
- **Real-time shadows** (`spot(...)`): a shadow-casting spotlight whose shadow map size follows
  the quality tier. Mark meshes `castShadow` / `receiveShadow`.
- **Sun** (`sun(colour, intensity, size)`): a shadowed directional light for outdoor scenes. Call
  `s.follow(x, y, z)` each frame so the shadow box tracks the player (it snaps to shadow texels, so
  shadows do not shimmer) and `v.onTier(T => s.setTier(T))`. Big outdoor levels use `s.fit(v, ...)`
  instead (see [Outdoor worlds](#outdoor-worlds-sun-air-sky-and-grade)).
- **Lamp light pool** (`v.lampLights(range)` then `v.placeLamps(spots, x, y, z, t)` each frame):
  a level can have dozens of lamps; the nearest few get real point lights (with flicker) and the
  rest only glow. Light count stays fixed, so shaders never recompile mid-game.
- **Post-processing**, one shared chain: HDR render with MSAA (or a light FXAA on lower tiers), ground-truth ambient occlusion
  (GTAO), bloom (anything brighter than about 1 glows: emissive above 1, particle colours above
  1), ACES filmic tone mapping, and a colour grade (vignette, film grain, slight lens fringing at
  the edges, and a red "hurt" tint you set with `v.hurt = 0..1`). A game can add its own grade and
  sun glare in the same pass (`v.grade`, `v.glare`, below).
- **Particles** (`new Particles(v, { max, additive })`): soft camera-facing points. Additive for
  sparks, fire, glints; normal for smoke and dust. `p.emit({ x, y, z, vx, vy, vz, life, size,
  grow, col, a, drag, grav, floor, fadeIn })`, then `p.update(dt)` every frame.

## Performance and adaptive quality

Phones must stay smooth, so the kit adapts on its own:

| Tier | Pixels per frame | Shadows (sun) | Real lamp lights | AO | Anti-aliasing |
| --- | --- | --- | --- | --- | --- |
| ultra | 2.0 M | 1024 (2048) | 4 | full size | 2x MSAA |
| high | 1.3 M | 1024 (2048) | 4 | half size | 2x MSAA |
| medium | 0.85 M | 512 (1024) | 3 | no | light FXAA |
| low | 0.5 M | off | 2 | no | light FXAA |

Ambient occlusion (the soft dark in corners and under things) on the high tier is worked out at half
the picture's width and height, a quarter of the cost, and blended back at full size.

**Phone class and frame rate** (`src/kit/speed.js`). Each phone is sorted into top, mid or low from
its graphics chip (Adreno 830, Mali-G720, ...), its model for iPhones, and its cores and memory.
That picks where 3D games start and how fast they run:

| Class | Starts on | 3D frame rate | Other games |
| --- | --- | --- | --- |
| top (Fold 8, recent iPhone Pro, desktops) | ultra | 120 fps (where the screen does 120 Hz) | screen rate |
| mid | high | 60 fps | screen rate |
| low | medium | 30 fps | 60 fps |

The feed loop skips screen refreshes to hold a game at its rate (a 60 fps game on a 120 Hz screen
draws every other refresh), which saves battery and heat. Settings has Auto / 120 / 60 / 30
(battery saver); a game can also set `fps: 30` in its definition to cap itself.

Frame times are averaged over 45-frame windows and compared with the frame budget for the game's rate
(8.3 ms at 120 fps, 16.7 ms at 60). After two slow windows the render resolution steps down one fixed
level (100%, 85%, 70%, 55%), then the tier drops. At 120 fps a struggling game first gives up one
resolution step, then drops to 60 fps at full resolution, keeping the picture; at the lowest tier and
resolution a 60 fps game can drop to 30. It only climbs back after eight fast windows in a row, and
never above a level that was too slow in the last 30 seconds, so it does not bounce up and down (each
step reallocates render targets). Where a game settles (tier and frame rate) is remembered per game,
so its next round starts there instead of stuttering down again.

**Speed tricks that keep the picture the same:**

- The 3D canvas is shown directly on the playing card, under the card's own canvas, which is cleared
  each frame so the game's 2D HUD sits on top. Nothing is copied. When another 3D card starts, the
  last frame is baked into the card being left, so it keeps its picture. (Tests and screenshots run
  with `__hd.direct = false`, the old copy-into-the-card path; that's automatic under Playwright.)
  Don't draw anything into the card's canvas before `v.render()`: it is cleared there.
- Bloom, tone mapping and the colour grade are one final full-screen pass. The bloom is a short
  down/up-sampling chain at half resolution and below (9 small passes, was 13 bigger ones plus two
  full-screen ones).
- Shadow maps are only redrawn when a shadow caster or a shadow light has moved, turned, appeared or
  hidden (`__hd.info.shadows` says whether the last frame redrew them). If you change a mesh's
  geometry in place without moving it, call `v.shadowsDirty()`.

Shaders are compiled up front: the first `render()` calls `v.warm()`, which compiles every material
in the scene, including hidden ones, with shadows on and off. If you build new geometry or
materials later (a new floor), set `v.warmed = false` so the next frame warms again before play.
`__hd.info` reports `{ calls, tris, cpu, shadows, upscaled, backend, framegen }` for the last frame. The 3D frame is rendered at the tier's pixel count (and lower while the phone struggles), then upscaled to the card's full resolution with **Snapdragon Game Super Resolution 2** (Qualcomm's temporal upscaler, `src/kit/sgsr2.js`): the camera is nudged by a fraction of a pixel each frame and each new small frame is blended into the full-size picture of the frames before, moved by the camera's own move. That gives a sharper, steadier picture than one frame can, and it also runs at full size as anti-aliasing (grass, leaves, wires and thin poles stop shimmering; FXAA is off then). Things that move fast across a still camera can leave a short soft trail (there are no per-object motion vectors), so a view can set `v.upscaler = 'sgsr1'` to use **SGSR 1** (`src/kit/sgsr.js`, one frame, edge-aware sharpening). AR views and frames with screen-space reflections use SGSR 1 too, and `HD.upscaler = 'sgsr1'` switches every view. `HD.upscale = false` shows the plain stretched picture for comparison, and `node scripts/upscale-compare.cjs` scores plain, SGSR 1 and SGSR 2 against a supersampled picture (`--webgpu` for the WebGPU path, which has its own TSL versions of both). The 2D HUD is always drawn at
full resolution on top. `v.onTier(T => ...)` lets a game react (for example `spotLight.setTier(T)`).

Rules of thumb:

- Merge level geometry (walls into one mesh per material) and use `InstancedMesh` for repeated
  props. Aim for a few hundred draw calls at most.
- Hide things beyond the fog distance.
- Never create your own `WebGLRenderer`: phones allow only a few WebGL contexts. All Next Gen
  games share one, and the Classic kit has its own.
- Build textures once per game module (lazily, on first draw), not per round.
- `window.__hd.force = 0..3` pins a tier for tests and screenshots.

## Multi-touch

Next Gen games use two thumbs. Input callbacks get a pointer id: `down(x, y, id)`,
`move(x, y, pressed, id)`, `up(x, y, id)`. The pattern used by all three games: the first finger is
the movement stick; a second finger (or a finger on the other half of the screen) is the aim, look,
fire or nitro control. Keep a single-finger fallback so the game still plays with one thumb.

## Writing a Next Gen game

```js
import gs from '../gamescroll.js';
const { HDView, Particles, pbr, rbox, surface, spot, THREE } = gs.hd;

let v;
function setup() {
  v = new HDView({ bg: '#06080c', fog: .07, env: .15, amb: .15 }).lampLights(9);
  const torch = spot('#fff1dc', 22, 16, .5); v.scene.add(torch, torch.target);
  v.onTier(T => torch.setTier(T));
  // add meshes to v.scene; move v.cam yourself (it is a PerspectiveCamera)
}
// in draw(c): move things, v.placeLamps(...), then
v.render(c, W, H);
// ...then the 2D HUD on top
```

Game definition:

```js
export default {
  id: 'my-game', title: 'My Game', tag: 'Next Gen · Shooter',
  retro: true, era: 'nextgen', pal: 'grape',
  w: 300, h: 300, maxW: 600, maxH: 420,   // fluid: the camera adapts to any shape
  goal: 1500, hint: '...', make,
};
```

Check it with `node scripts/sweep.cjs my-game` (long random play at odd sizes) as well as the
usual smoke and fold tests.

## Reflections and contact shadows

- `v.reflect(floor, carBody)` marks shiny surfaces for screen-space reflections. They're drawn on the
  ultra tier (top-end phones) only; on other phones those surfaces keep their normal look, so mark the
  few that matter (a wet floor, a polished hall), not everything.
- `const cs = v.contact({ y: 0, size: 8 })` lays soft contact shadows on a floor (medium tier and up),
  so things look like they're standing on it even where real shadows are off. In a big level, keep it
  under the action with `cs.at(x, z)`.
- Ambient occlusion and reflections only see solid, opaque surfaces: see-through things (light
  shafts, glows, blob shadows, alpha-cut leaves) are left out of them so they don't leave dark marks.
  Keep any other mesh out with `mesh.userData.noAO = true`.

## Outdoor worlds: sun, air, sky and grade

Big outdoor levels (a valley, a coast, a city's rooftops) can turn these on. Each one is opt-in, so a
game that doesn't ask for them looks exactly as before.

```js
const { HDView, sun } = gs.hd, { Sky, Weather } = gs.sky;
v = new HDView({ bg: '#b8c8d8', env: .5 });
v.cam.far = 1500;
const s = sun('#fff0d8', 2.6); v.scene.add(s, s.target); v.onTier(T => s.setTier(T));
v.sun = s;                                   // the air, the glare and the sky use this light
v.air({ haze: .0008, mist: .002, mistFall: .1, clouds: .4 });
sky = new Sky(v, { time: 7.5, clouds: .4, env: true });
v.grade = { saturation: .92, contrast: 1.08, shadows: '#e6ecff', highlights: '#fff1dc' };
v.glare = .8;
// each frame, before v.render():
sky.update(dt);
s.fit(v, { far: 600, ground: (x, z) => land.height(x, z) });
```

- **Shadows fitted to the view** (`s.fit(view, o)` each frame, in place of `s.follow`): the sun's
  shadow covers just what the camera can see, out to `far` metres. `ground(x, z)` gives the ground's
  height (a `gs.outdoors` Land's `height`), so it stops at the hills; without it, `low` and `high` say
  between which heights things are. `tall` (default 20 m) is how high things on the ground reach. The
  narrower the view, the sharper the shadows: a scope gets crisp shadows where it looks.
  `around: 1.25` keeps the shadow to what's round the middle of the view (a scope looking across a
  valley: sharp shadows round the target, none wasted on the hills behind). It returns
  `{ width, height, texel }` in metres. `s.aim(x, y, z)` points the sun (towards it); a Sky does that
  for you.
- **Air** (`v.air(o)`): distance haze that warms towards the sun, mist lying low in the valleys, cloud
  shadows drifting over the land and wet streets. The kit adds it to every material in the scene
  before it first draws, so it costs no extra pass. Turn it on when you build the level: a material
  that has already been drawn is rebuilt when air reaches it. Settings: `haze` (.001 is about a
  kilometre of view), `colour` (far things fade to it) and `sunColour` (towards the sun), `mist`
  (thickness at height `mistY`, thinning by `mistFall` a metre upwards, `patchy` 0..1), `clouds` (cover
  0..1), `cloudShade` (how dark their shadows are), `cloudHeight`, `cloudSize` (metres), `wind`
  (`[x, z]` m/s they drift) and `wet` (0..1: rain darkens things and makes up-facing surfaces shiny).
  It returns the settings, which you can change any time (`v.air().wet = rain.amount`); `v.air(false)`
  turns it off. Your own `ShaderMaterial`s and materials with `fog: false` are left alone.
- **Sky** (`gs.sky`'s `Sky`) with `clouds: 0..1` draws drifting clouds lit from the sun's side (your
  own colours with `cloudLight` and `cloudDark`; `gap` keeps the low sky round the sun clear). It aims
  the sun, and on a view with air it colours the haze from the sky and lays the clouds' shadows on the
  ground. `env: true` makes the reflections and sky light from this sky instead of the kit's studio
  (made when the shaders warm up, and again when the time or the clouds change, at most every 3 s).
  `sky.flash = 1` lights up the clouds for lightning: set it from your Weather while a flash shows.
- **Colour grade** (`v.grade = { saturation, contrast, shadows, highlights }`): saturation and
  contrast (1 = no change), and tints for the dark and the bright parts of the picture (`'#rrggbb'`, a
  Color or `[r, g, b]`). It runs in the final pass. `v.grade = null` turns it off.
- **Sun glare** (`v.glare = 0..1`): a soft glow round the sun and two faint lens ghosts across the
  picture, only while the sun itself shows (it fades behind a wall or a tree).
- **Shadow cascades** (`s.fit(v, { far: 320, near: 40, ... })`): a second sun light whose shadow
  covers only the first `near` metres, so the grass at your feet gets a sharp shadow while the far one
  still reaches the hills. Each spot takes the sun from one of the two (fading across the near box's
  edge), so it's never lit twice. High and ultra tiers only, with `v.air()` on; turn it off (`near: 0`)
  while a scope is up, where `around` already keeps the shadows sharp round the target.
- **Physical sky** (`new Sky(v, { physical: true })`, or `{ haze, blue, mie, glow, bright }`): the sky's
  colours come from how sunlight scatters in air (the Preetham model): deep blue overhead, pale at the
  horizon, an orange sun as it sets. Clouds, reflections (`env`), the air's colours, fog and the sky
  light all follow it; the day keys then only set how strong the sun and fill are. `sky.physical` can be
  switched any time (a clear morning on one mission, a grey storm with the day keys' colours on the next).
- **Depth of field** (`v.focus = { at, range, depth, blur }`): what's `at` metres away, give or take
  `range`, stays sharp; things `depth` x `at` metres nearer or further are fully soft, up to `blur`
  pixels. Made for scopes and cutscene close-ups; `v.focus = null` turns it off. It reads the depth the
  ambient occlusion already draws, so it's on high and ultra only and costs one full-screen pass.
- `v.envFrom(scene)` makes the reflections from any scene of your own (a painted room, a sunset dome),
  and makes them again on WebGPU when the view draws there; `v.env = null` goes back to the studio.
  (A texture set straight on `v.env` keeps a view on WebGL.)
- `gs.hd.noiseTex()` is a shared 256 x 256 tiling noise texture (four sizes of noise in r, g, b and a)
  for your own shaders: clouds, water, grass, dirt.

## WebGPU (test)

On top phones, Settings › Graphics (test) › "Use WebGPU for 3D games" draws Next Gen and AR views
with three's WebGPU renderer instead of WebGL. Nothing changes in a game: a view that uses a part not
ported yet (see `docs/webgpu-move.md`) stays on WebGL by itself. `node scripts/gpu-games.cjs <id>`
plays a game on both and says which it drew on. Everything in Long Shadow (outdoor looks, sky, shafts,
focus, cascades, Props trees) and Deep Pressure has a WebGPU version.

### Frame generation

On WebGPU, a Next Gen or AR game that draws 60 frames a second on a 120 Hz screen gets a made frame
on each refresh in between, so it moves at 120 (`src/kit/framegen.js`). It's not a neural network:
every pixel moves along its own motion (three's per-pixel velocity, so moving things move, not just
the camera), depth decides what's in front, and gaps that open behind moving things are filled from
the background round them. The method follows AMD FSR 3's frame interpolation (MIT) and Mob-FGSR
(SIGGRAPH 2024), written fresh as WebGPU compute. It runs after SGSR 2 at the screen's size, takes
SGSR 2's camera jitter back out of the motion, and costs a few milliseconds of compute instead of a
whole extra frame.

- **When:** Settings › Graphics (test). Auto (the default) makes frames only for a game that can't
  reach the screen's rate (the 3D kit stepped it down to 60); Always draws half the frames of every 3D
  game and makes the rest (cooler, more detail per real frame); Off. A pinned frame rate turns it off.
  If the refreshes in between keep not arriving (the phone is too busy), it switches itself off for
  that game until the app restarts.
- **How:** blend (the default) makes the frame halfway between the last two real frames and shows it
  before the newest, so each real frame shows half a frame (about 8 ms) later, with the fewest flaws.
  Ahead guesses half a frame past the newest, so nothing is delayed; edges round fast things are a
  little softer. A reflex or rhythm game can ask for it with `frameGen: 'ahead'` in its definition, and
  `frameGen: false` turns it off for a game (a look that flickers on purpose, a picture that changes
  in ways motion can't follow).
- **See-through and glowing things** (transparent or added-light materials: glass, water, smoke,
  sparks) have no single motion, so the background's motion is kept under them and the made frame
  shows them from the newest real frame, unmoved: they never smear or show twice.
- **The HUD** is drawn on the card's own canvas over the 3D, so it is never warped. Vignette, grain
  and the hurt flash go on as each refresh is shown, so they stay put and the grain stays even.
- **Cuts:** after a cut nothing is made until two new real frames. Another view drawing, a pause and
  big camera jumps (turning more than 20 degrees, moving 8 metres or zooming by a quarter in one frame) are found by themselves;
  call `v.cut()` when the camera switches somewhere new in a smaller step (it also restarts SGSR 2).

`__hd.info.framegen` says which way it ran last frame ('blend', 'ahead' or false) and `fgMs` the
CPU time to queue it. `node scripts/framegen-test.cjs [--mode ahead] [--hard]` scores made frames
against the truth on test scenes (moving things, a turning camera, glass, sparks, SGSR 2's jitter), and
`npm run build:bundled && node scripts/framegen-games.cjs [id ...] [--shots dir]` plays the Next Gen and
AR games with it on and checks every made frame sits between the real frames round it.

## Glowing rings

`gs.hd.pulse(material, { at, radius, strength, color, width, fill })` adds a glowing ring that
sweeps out from a point over a lit material: sonar, a shockwave, a scanner. `at` is a `{ value: Vector3 }`,
`radius` and `strength` are `{ value }` objects the game changes each frame (strength 0 hides it),
`color` is linear `[r, g, b]` (above 1 is brighter), `width` the ring's thickness in metres and `fill`
a faint glow inside it. Share the same objects across materials to move one ring over all of them. It
works on instanced meshes and on WebGL and WebGPU alike.

## Decals, light probes and sun shafts

- `v.decal(mesh, hit.point, hit.normal, { size: .3, colour: '#1a1410' })` puts a mark on a surface that
  wraps over its shape (three's DecalGeometry): scorches, bullet marks, footprints, paint, splats.
  `paint: (c, s) => {}` draws your own mark on an `s` x `s` canvas (give it a `key` so it's drawn
  once), `life` fades it out after that many seconds, `max` (default 40) drops the oldest first, and
  `glow` makes it shine (lava, neon paint). `v.clearDecals()` removes them all.
- `v.bakeLight([x, y, z], { radius: 10, strength: 1 })` bakes the light round a point into a light
  probe (the colour coming from every direction), so lit materials pick up a red wall, a blue
  window or green grass. Bake once the level is built, not every frame. Several probes blend as the
  camera moves (or `v.probeAt`, such as the player). Lower the view's `amb` when using probes.
  `v.clearProbes()`.
- `v.shafts = 1` (0..2) adds sun shafts: the bright sky round the sun is smeared towards it at quarter
  size, so whatever blocks it (trees, window frames, a hill) leaves streaks of light. Set `v.sun` so
  it knows where the sun is. It's off on the lowest tier.

## Outdoor looks: ground, hills, rock, leaves

`gs.outdoors` paints a Next Gen landscape that holds up through a scope. Each look is a named patch
on a three.js standard material, so light, shadows and the air still apply.

```js
const { Land, looks, groundDetail, horizon } = gs.outdoors, { THREE } = gs.hd;
const tex = groundDetail();                                   // tiling detail + bump textures, made in code
const normal = tex.normal.clone(); normal.repeat.set(170, 170);   // shared textures: clone before changing
const mat = new THREE.MeshStandardMaterial({ normalMap: normal });
const ground = looks.ground(mat, { detail: tex.detail, roads: [[x0, z0, x1, z1]], fields: { angle: .33 } });
land = new Land({ kind: (x, z) => myHeight(x, z), size: 640, segments: 128, material: mat });
land.masks((x, z, y, slope) => [fields, forest, rock, trodden]);  // 0..1 each, where each ground goes
v.scene.add(horizon(land, { inner: 300, outer: 1300 }));         // far hills all round
looks.rock(rockMaterial, { detail: tex.detail });              // cracks and grit three ways, moss on top
const leafLook = looks.leaves(leafMaterial, { wind: .6 });      // sway, sun glow, outlines kept far away
// each frame: leafLook.uniforms.lkTime.value = t; ground.wet = rain.amount;
```

- **`looks.ground(material, o)`**: meadow with dry patches, patchwork fields in strips with hedges
  (`fields: { angle, size: [w, d], furrows, hedge }` or `false`), forest floor, rock on steep ground,
  trodden earth, mud below `bank.low`..`bank.high` metres, lanes with ruts along `roads` (segments
  `[x0, z0, x1, z1]`) and puddles as it gets `wet`. `colours` swaps any of `grassA`, `grassB`, `dry`,
  `dirt`, `mud`, `rock`, `forest`, `cropA`, `cropB`, `plough`, `hedge`. `land.masks(fn)` says where each
  ground goes.
- **`horizon(land, o)`**: a ring of far ridges from `inner` to `outer` metres that meets the land's
  edge. `lower(x, z)` (0..1) keeps a side low for a view out; `colours: { meadow, forest, rock }`.
  `looks.hills(material)` is its look: woods, clearings and scree from noise.
- **`looks.rock(material, o)`** and **`looks.leaves(material, o)`**: `rock({ scale, moss, mossy })`;
  `leaves({ time, wind, sun, sway, above, glow, atlas })`. Pass numbers, or shared uniforms
  (`{ value }`) when several materials should move together.
- Every look is a named effect (`material.userData.gsLooks` lists them), so the WebGPU version can
  swap each one for a node later (see `docs/webgpu-move.md`). Road segments: up to 32.

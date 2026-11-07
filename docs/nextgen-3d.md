# Next Gen · Console games: modern HD 3D

Next Gen Console games (`era: 'nextgen'`) aim for the look of current home consoles. They sit next
to the Classic Console games (`era: 'console'`, cel-shaded, see [console-3d.md](console-3d.md)) and
must look clearly a generation ahead of them. Stylised and cartoony characters are fine; the
rendering is what makes it Next Gen.

The kit is `src/kit/hd3d.js`. Games built on it: `bunker-breakout.js` (corridor shooter),
`suit-ops.js` (top-down jungle twin-stick) and `gravity-grip.js` (tube racer that drives on walls and
ceilings).

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
  shadows do not shimmer) and `v.onTier(T => s.setTier(T))`.
- **Lamp light pool** (`v.lampLights(range)` then `v.placeLamps(spots, x, y, z, t)` each frame):
  a level can have dozens of lamps; the nearest few get real point lights (with flicker) and the
  rest only glow. Light count stays fixed, so shaders never recompile mid-game.
- **Post-processing**, one shared chain: HDR render with MSAA, ground-truth ambient occlusion
  (GTAO), bloom (anything brighter than about 1 glows: emissive above 1, particle colours above
  1), ACES filmic tone mapping, and a colour grade (vignette, film grain, slight lens fringing at
  the edges, and a red "hurt" tint you set with `v.hurt = 0..1`).
- **Particles** (`new Particles(v, { max, additive })`): soft camera-facing points. Additive for
  sparks, fire, glints; normal for smoke and dust. `p.emit({ x, y, z, vx, vy, vz, life, size,
  grow, col, a, drag, grav, floor, fadeIn })`, then `p.update(dt)` every frame.

## Performance and adaptive quality

Phones must stay smooth, so the kit adapts on its own:

| Tier | Pixels per frame | Shadows | Real lamp lights | AO | MSAA |
| --- | --- | --- | --- | --- | --- |
| ultra | 1.7 M | 1024 | 4 | yes | 4x |
| high | 1.1 M | 1024 | 4 | no | 4x |
| medium | 0.75 M | 512 | 3 | no | none |
| low | 0.45 M | off | 2 | no | none |

Phones start on **high**, desktops on **ultra**. Frame times are averaged over 45-frame windows.
After two slow windows (slower than about 48 fps) the render resolution steps down one fixed level
(100%, 85%, 70%, 55%), then the tier drops. It only climbs back after eight fast windows in a row,
and never above a level that was too slow in the last 30 seconds, so it does not bounce up and down
(each step reallocates render targets, which used to cause the occasional stutter).

Shaders are compiled up front: the first `render()` calls `v.warm()`, which compiles every material
in the scene, including hidden ones, with shadows on and off. If you build new geometry or
materials later (a new floor), set `v.warmed = false` so the next frame warms again before play.
`__hd.info` reports `{ calls, tris, cpu }` for the last frame. The 3D frame is scaled up into the slide's canvas; the 2D HUD is always drawn at
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
import { HDView, Particles, pbr, rbox, surface, spot, THREE } from '../kit/hd3d.js';

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

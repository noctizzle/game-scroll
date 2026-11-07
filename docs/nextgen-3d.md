# Next Gen · Console games: modern HD 3D

Next Gen Console games (`era: 'nextgen'`) aim for the look of current home consoles. They sit next
to the Classic Console games (`era: 'console'`, cel-shaded, see [console-3d.md](console-3d.md)) and
must look clearly a generation ahead of them. Stylised and cartoony characters are fine; the
rendering is what makes it Next Gen.

The kit is `src/kit/hd3d.js`. The first game built on it is `src/games/bunker-breakout.js`.

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

Phones start on **high**, desktops on **ultra**. If frames come slower than about 48 fps the
render resolution drops first (to 55%), then the tier. If frames stay fast for a few seconds, it
climbs back. The 3D frame is scaled up into the slide's canvas; the 2D HUD is always drawn at
full resolution on top. `v.onTier(T => ...)` lets a game react (for example `spotLight.setTier(T)`).

Rules of thumb:

- Merge level geometry (walls into one mesh per material) and use `InstancedMesh` for repeated
  props. Aim for a few hundred draw calls at most.
- Hide things beyond the fog distance.
- Never create your own `WebGLRenderer`: phones allow only a few WebGL contexts. All Next Gen
  games share one, and the Classic kit has its own.
- Build textures once per game module (lazily, on first draw), not per round.
- `window.__hd.force = 0..3` pins a tier for tests and screenshots.

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
  w: 300, h: 300, maxW: 440, maxH: 420,   // fluid: the camera adapts to any shape
  goal: 1500, hint: '...', make,
};
```

Check it with `node scripts/sweep.cjs my-game` (long random play at odd sizes) as well as the
usual smoke and fold tests.

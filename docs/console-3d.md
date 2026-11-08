# Console games: 3D cel-shaded look

Console games (`era: 'console'`) are drawn in real-time 3D with three.js, cel-shaded with ink
outlines. Pocket games stay flat pixel art. If a game can't reach the 3D bar, move it to Pocket
(`era: 'advance'` or `'color'`) instead of shipping a flat Console game.

The kit is `src/kit/toon3d.js`; toy-brick helpers are `brick3d` / `stud3d` in `src/kit/bricks.js`.

## How it works

- One shared WebGL renderer draws every Console game, then copies the frame into the slide's
  2D canvas. Phones only allow a few WebGL contexts, so games never make their own.
- Toon shading: `MeshToonMaterial` with a 3-band ramp (shadow, mid, lit).
- Ink lines: a second pass renders normals + depth, and a full-screen pass inks depth jumps
  (silhouettes) and sharp turns (creases). Unlit / see-through things and parts made with
  `line: false` get no ink.
- Resolution adapts: frames slower than ~45 fps render fewer pixels (down to half).
- HUD, text and touch handling stay in the game's 2D code, drawn on top after `v.render(c)`.

## Writing a Console game

```js
import gs from '../gamescroll.js';
const { View, G, part, grp, blob } = gs.toon;

let v3;
function view3d() {
  if (!v3) {
    v3 = new View({ bg: '#5cb84c', sun: [-.6, 1, .4] });
    v3.def('hero', () => grp(part(G.pill, '#3060c0', { sx: 6, sy: 5, sz: 5, y: 6 }), part(G.ball, '#f8c890', { s: 3, y: 12 }), blob(5)));
  }
  v3.board(W, H, .8);          // or v3.side(W, H, fov, eyeX, eyeY) or v3.persp(W, H, fov)
  return v3;
}
// in draw(c):
const v = view3d(); v.frame();
v.put('hero', v.at(pl.x, pl.y), { ry: Math.PI / 2 - pl.a });
v.render(c, W, H);
// ...then 2D HUD on top
```

Cameras:

- `board(W, H, elev)`: tilted top-down, orthographic. Floor point (x, y) is drawn exactly at
  screen (x, y), so taps need no conversion. Use `v.at(x, y, height)` for positions.
- `board(W, H, elev, fov, zoom)`: same but real perspective (strongest 3D). Convert taps with
  `v.pick(x, y)` and place labels with `v.over(x, y, height)`.
- `side(W, H, fov, ex, ey)`: side-on. Point (x, y) on the z = 0 plane maps exactly to the screen;
  `ey > 0` looks down on the scene. Use `v.sv(x, y, z)`.
- `persp(W, H, fov)`: free camera you move yourself (runners, first person).

`v.put(kind, pos, opts)` draws a pooled copy of a prefab registered with `v.def(kind, make)`, so
games keep their plain arrays of objects. `v.fan(points, colour, alpha)` draws see-through floor
polygons (view cones, beams).

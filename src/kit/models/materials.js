// gs.models.material(name, options): a ready material from a recipe (recipes.js), painted into tiling
// textures in code (no image files), kept across launches (cache.js). On WebGPU it also gets the
// recipe's own finest layers worked out per pixel up close (no blur however near the camera gets),
// and can be laid on without UVs (solid) or without visible repeats (scatter).
// Kit use only: games reach it as gs.models.material.
import { JS } from './ops.js';
import { RECIPES, NAMES } from './recipes.js';
import * as cache from './cache.js';
import { pbr, surface } from '../hd3d.js';

// the recipe's noise reseeded: every hash gets the seed added, so seed 3 is a different plank pattern
export function seeded(O, seed) {
  if (!seed) return O;
  const k = (seed * 7919) | 0;
  return { ...O, noise: (p, P, s = 0) => O.noise(p, P, s + k), fbm: (p, P, oct, s = 0) => O.fbm(p, P, oct, s + k), cells: (p, P, s = 0, j) => O.cells(p, P, s + k, j), rand: (x, y, s = 0) => O.rand(x, y, s + k) };
}
export function lookOf(name, o) {
  const R = RECIPES[name], look = {};
  for (const k in R.look) look[k] = o[k] ?? (k === 'colour' ? o.color : undefined) ?? R.look[k];
  return look;
}
const sets = new Map();   // this run's sets, by key
/** The texture set for a recipe (as surface() returns), painted or read back from the saved bakes. */
export function bakeSet(name, look, size, seed) {
  const R = RECIPES[name], key = `${name}|${size}|${seed}|${Object.values(look).join(',')}|1`;
  let set = sets.get(key); if (set) return set;
  const saved = cache.get(key);
  set = surface(size, g => {
    if (saved) {   // drawn back from last launch's pictures
      const L = saved.layers; g.col.drawImage(L.col, 0, 0); g.h.drawImage(L.h, 0, 0); g.r.drawImage(L.r, 0, 0); if (L.m) g.m.drawImage(L.m, 0, 0);
      return;
    }
    const O = seeded(JS, seed), K = {}; for (const k in look) K[k] = O.rgb(look[k]);
    const n = size * size, C = g.col.createImageData(size, size), H = g.h.createImageData(size, size), Rr = g.r.createImageData(size, size), M = g.m.createImageData(size, size);
    const p = { x: 0, y: 0 }, f = R.P / size;
    for (let y = 0, i = 0; y < size; y++) for (let x = 0; x < size; x++, i += 4) {
      p.x = (x + .5) * f; p.y = (y + .5) * f;
      const r = R.f(O, p, K), c = r.col;
      C.data[i] = c[0] * 255; C.data[i + 1] = c[1] * 255; C.data[i + 2] = c[2] * 255; C.data[i + 3] = 255;
      const h = Math.min(1, Math.max(0, r.h)) * 255; H.data[i] = H.data[i + 1] = H.data[i + 2] = h; H.data[i + 3] = 255;
      const ro = Math.min(1, Math.max(0, r.rough)) * 255; Rr.data[i] = Rr.data[i + 1] = Rr.data[i + 2] = ro; Rr.data[i + 3] = 255;
      const me = Math.min(1, Math.max(0, r.metal)) * 255; M.data[i] = M.data[i + 1] = M.data[i + 2] = me; M.data[i + 3] = 255;
    }
    void n;
    g.col.putImageData(C, 0, 0); g.h.putImageData(H, 0, 0); g.r.putImageData(Rr, 0, 0); g.m.putImageData(M, 0, 0);
  }, { metal: true, strength: 2 });
  if (!saved) cache.put(key, set.canvases);
  sets.set(key, set);
  return set;
}

/**
 * A material made from a recipe: wood, planks, bark, brick, stone, cobbles, tiles, concrete, metal,
 * rust, paint, fabric, leather, marble, dirt, sand, snow. Options: the recipe's colours (colour, dark,
 * mortar, rust, vein...), seed (another pattern), repeat ([u, v] tiles across the mesh's UVs), size
 * (texture pixels, 256), depth (parallax depth on WebGPU), and on WebGPU: closeUp (true: finest detail
 * worked out per pixel near the camera), solid (true: laid on by position, no UVs or seams; a number is
 * metres per tile), scatter (true: each tile turned and moved so big floors don't show a repeat).
 * Other options go to gs.hd.pbr (glow, clear, wet...).
 */
export function material(name, o = {}) {
  const R = RECIPES[name];
  if (!R) throw new Error(`gs.models.material: no recipe '${name}' (try ${NAMES.join(', ')})`);
  const { size = 256, seed = 0, repeat = [1, 1], depth = 0, closeUp = true, solid = false, scatter = false, ...rest } = o;
  for (const k in R.look) delete rest[k]; delete rest.color;
  const look = lookOf(name, o), set = bakeSet(name, look, Math.max(64, Math.min(1024, size)), seed), t = set.repeat(repeat[0], repeat[1]);
  const m = pbr('#ffffff', { rough: 1, metal: 1, tex: t, depth, ...rest });
  m.name = 'models:' + name;
  m.userData.recipe = { name, look, seed, P: R.P, repeat, closeUp, solid, scatter };
  m.userData.recipeHeight = t.height;   // (WebGPU: bumps when laid on by position)
  if (!m.userData.gsGpu && (closeUp || solid || scatter)) m.userData.gsGpu = 'recipe';
  return m;
}
export { NAMES };

// The little maths that gs.models' material recipes are written in, twice: once in plain JavaScript
// (a recipe painted into tiling textures on the CPU, the same on every phone) and once in three.js
// TSL (the same recipe run on the graphics chip: baked bigger on WebGPU, and its finest layers worked
// out per pixel up close). A recipe only calls O.something, so one recipe gives both, and they agree:
// the noise is integer-hashed (exact on both), and tiles with a whole-number period.
// Kit use only.
import { Color } from 'three';

// colours stay as written (sRGB 0..1): the colour texture is marked sRGB
const rgbOf = h => { const c = new Color(h).convertLinearToSRGB(); return [c.r, c.g, c.b]; };
const wrap = (i, P) => ((i % P) + P) % P;

/* ---------- JavaScript ---------- */
function hashJS(x, y, s) {
  let n = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1442695041)) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177); n ^= n >>> 16;
  return (n >>> 0) / 4294967296;
}
const q5 = t => t * t * t * (t * (t * 6 - 15) + 10);
function noiseJS(x, y, P, s) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, ux = q5(fx), uy = q5(fy);
  const x0 = wrap(ix, P), x1 = wrap(ix + 1, P), y0 = wrap(iy, P), y1 = wrap(iy + 1, P);
  const a = hashJS(x0, y0, s), b = hashJS(x1, y0, s), c = hashJS(x0, y1, s), d = hashJS(x1, y1, s);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
export const JS = {
  gpu: false,
  rgb: h => rgbOf(h),
  num: n => n,
  xy: (x, y) => ({ x, y }),
  x: p => p.x, y: p => p.y,
  scale: (p, kx, ky = kx) => ({ x: p.x * kx, y: p.y * ky }),
  shift: (p, dx, dy) => ({ x: p.x + dx, y: p.y + dy }),
  add: (a, b) => a + b, sub: (a, b) => a - b, mul: (a, b) => a * b, div: (a, b) => a / b,
  mix: (a, b, t) => a + (b - a) * t,
  clamp: (x, a = 0, b = 1) => Math.min(b, Math.max(a, x)),
  smooth: (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); },
  step: (e, x) => (x >= e ? 1 : 0),
  abs: Math.abs, min: Math.min, max: Math.max, pow: Math.pow, sin: Math.sin, floor: Math.floor,
  fract: x => x - Math.floor(x),
  mod: (x, m) => x - Math.floor(x / m) * m,
  /** value noise 0..1, repeating every P units */
  noise: (p, P, s = 0) => noiseJS(p.x, p.y, P, s),
  fbm(p, P, oct = 4, s = 0) { let a = .5, t = 0, n = 0, f = 1; for (let i = 0; i < oct; i++) { t += a * noiseJS(p.x * f, p.y * f, P * f, s + i); n += a; a *= .5; f *= 2; } return t / n; },
  /** cells (Worley): d the distance to the nearest cell's point (0..~1), id a random 0..1 for that cell, e the gap to the next nearest (edges) */
  cells(p, P, s = 0, jitter = .9) {
    const ix = Math.floor(p.x), iy = Math.floor(p.y); let d1 = 9, d2 = 9, id = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const cx = wrap(ix + i, P), cy = wrap(iy + j, P);
      const px = ix + i + .5 + (hashJS(cx, cy, s) - .5) * jitter, py = iy + j + .5 + (hashJS(cx, cy, s + 7) - .5) * jitter;
      const d = Math.hypot(p.x - px, p.y - py);
      if (d < d1) { d2 = d1; d1 = d; id = hashJS(cx, cy, s + 13); } else if (d < d2) d2 = d;
    }
    return { d: d1, id, e: d2 - d1 };
  },
  /** a random 0..1 per whole cell (rows of planks, bricks) */
  rand: (x, y, s = 0) => hashJS(Math.floor(x), Math.floor(y), s),
  mixc: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
  mulc: (c, k) => [c[0] * k, c[1] * k, c[2] * k],
};

/* ---------- TSL ---------- */
// T: three/tsl (passed in by the WebGPU side, so this file loads without it)
export function tslOps(T) {
  const { float, vec2, vec3, uint, int, floor, fract, mix, clamp, smoothstep, step, abs, min, max, pow, sin, length, select, Fn, Loop } = T;
  const wrapN = (i, P) => i.sub(floor(i.div(P)).mul(P));   // (floats holding whole numbers)
  const hashT = (x, y, s) => {   // x, y: float nodes with whole values; s: a number
    let n = uint(int(x)).mul(374761393).add(uint(int(y)).mul(668265263)).add(uint((Math.imul(s, 1442695041)) >>> 0));
    n = n.bitXor(n.shiftRight(13)).mul(1274126177); n = n.bitXor(n.shiftRight(16));
    return float(n).div(4294967296);
  };
  const q5T = t => t.mul(t).mul(t).mul(t.mul(t.mul(6).sub(15)).add(10));
  const noiseT = (p, P, s) => {
    const i = floor(p), f = p.sub(i), u = vec2(q5T(f.x), q5T(f.y)), Pn = float(P);
    const x0 = wrapN(i.x, Pn), x1 = wrapN(i.x.add(1), Pn), y0 = wrapN(i.y, Pn), y1 = wrapN(i.y.add(1), Pn);
    const a = hashT(x0, y0, s), b = hashT(x1, y0, s), c = hashT(x0, y1, s), d = hashT(x1, y1, s);
    return a.add(b.sub(a).mul(u.x)).add(c.sub(a).mul(u.y)).add(a.sub(b).sub(c).add(d).mul(u.x).mul(u.y));
  };
  const N = v => (typeof v === 'number' ? float(v) : v);
  return {
    gpu: true,
    rgb: h => { const c = rgbOf(h); return vec3(c[0], c[1], c[2]); },
    num: n => float(n),
    xy: (x, y) => vec2(x, y),
    x: p => p.x, y: p => p.y,
    scale: (p, kx, ky = kx) => p.mul(vec2(kx, ky)),
    shift: (p, dx, dy) => p.add(vec2(dx, dy)),
    add: (a, b) => N(a).add(b), sub: (a, b) => N(a).sub(b), mul: (a, b) => N(a).mul(b), div: (a, b) => N(a).div(b),
    mix: (a, b, t) => mix(N(a), N(b), t),
    clamp: (x, a = 0, b = 1) => clamp(x, a, b),
    smooth: (e0, e1, x) => smoothstep(e0, e1, x),
    step: (e, x) => step(e, x),
    abs, min: (a, b) => min(N(a), b), max: (a, b) => max(N(a), b), pow: (a, b) => pow(N(a), b), sin, floor, fract,
    mod: (x, m) => N(x).sub(floor(N(x).div(m)).mul(m)),
    noise: (p, P, s = 0) => noiseT(p, P, s),
    fbm(p, P, oct = 4, s = 0) { let a = .5, t = float(0), n = 0, f = 1; for (let i = 0; i < oct; i++) { t = t.add(noiseT(p.mul(f), P * f, s + i).mul(a)); n += a; a *= .5; f *= 2; } return t.div(n); },
    cells(p, P, s = 0, jitter = .9) {
      const i0 = floor(p), Pn = float(P);
      let d1 = float(9), d2 = float(9), id = float(0);
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
        const gx = i0.x.add(i), gy = i0.y.add(j), cx = wrapN(gx, Pn), cy = wrapN(gy, Pn);
        const pt = vec2(gx.add(.5).add(hashT(cx, cy, s).sub(.5).mul(jitter)), gy.add(.5).add(hashT(cx, cy, s + 7).sub(.5).mul(jitter)));
        const d = length(p.sub(pt)), closer = d.lessThan(d1);
        d2 = select(closer, d1, min(d2, d)); id = select(closer, hashT(cx, cy, s + 13), id); d1 = min(d1, d);
      }
      return { d: d1, id, e: d2.sub(d1) };
    },
    rand: (x, y, s = 0) => hashT(floor(N(x)), floor(N(y)), s),
    mixc: (a, b, t) => mix(a, b, t),
    mulc: (c, k) => c.mul(k),
  };
}

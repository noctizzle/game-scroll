// Maths helpers most games end up writing: seeded random numbers (so a level or a daily challenge
// is the same for everyone), smooth noise for terrain and wobble (simplex-noise, MIT), vectors,
// overlap tests, a fast "what's near me" grid and game-time timers.
//
//   const { rng, daily, noise2, fbm, overlap, Grid, Timers } = gs.math;
//   const r = rng(daily());            // today's random numbers: same for every player today
//   r() / r.int(1, 6) / r.pick(list) / r.shuffle(list) / r.chance(.2)
//   const h = noise2(x * .01, 0);      // smooth -1..1, for hills; fbm(x, y) for rougher terrain
//   if (overlap.circles(a, b)) ...     // or .boxes, .circleBox, .pointInBox

import { createNoise2D, createNoise3D } from 'simplex-noise';

/* ---------- seeded random ---------- */
/** A number seed from anything (a string like 'level-3', a date, a number). */
export function seedOf(s) {
  if (typeof s === 'number' && Number.isFinite(s)) return s >>> 0;
  let h = 2166136261 >>> 0; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
/** Today's seed (UTC date), optionally per game: daily('my-game'). Same for every player all day. */
export function daily(salt = '', date = new Date()) { return seedOf(date.toISOString().slice(0, 10) + ':' + salt); }
/**
 * Random numbers from a seed (mulberry32): r() is 0..1. r.int(a, b) whole number a..b,
 * r.range(a, b), r.pick(list), r.shuffle(list) (a shuffled copy), r.chance(p), r.sign().
 */
export function rng(seed = Math.random() * 2 ** 32) {
  let a = seedOf(seed);
  const r = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  r.int = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  r.range = (lo, hi) => lo + r() * (hi - lo);
  r.pick = list => list[Math.floor(r() * list.length)];
  r.shuffle = list => { const o = [...list]; for (let i = o.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; } return o; };
  r.chance = p => r() < p;
  r.sign = () => r() < .5 ? -1 : 1;
  return r;
}

/* ---------- smooth noise ---------- */
let n2 = createNoise2D(rng(1)), n3 = createNoise3D(rng(1));
/** Picks a new noise pattern (same seed, same pattern). */
export function noiseSeed(seed) { n2 = createNoise2D(rng(seed)); n3 = createNoise3D(rng(seed)); }
/** Smooth noise in -1..1. Neighbouring inputs give similar outputs: scale x and y down (x * .01) for gentle hills. */
export const noise2 = (x, y) => n2(x, y);
export const noise3 = (x, y, z) => n3(x, y, z);
/** Layered noise (rougher, more natural): octaves layers, each half as strong and twice as detailed. -1..1. */
export function fbm(x, y, octaves = 4) {
  let sum = 0, amp = 1, f = 1, max = 0;
  for (let i = 0; i < octaves; i++) { sum += n2(x * f, y * f) * amp; max += amp; amp *= .5; f *= 2; }
  return sum / max;
}
/** Your own noise pattern: const n = makeNoise(seed); n(x, y) or n(x, y, z). */
export function makeNoise(seed) { const a = createNoise2D(rng(seed)), b = createNoise3D(rng(seed)); return (x, y, z) => z === undefined ? a(x, y) : b(x, y, z); }

/* ---------- vectors (plain { x, y }) ---------- */
export const vec = {
  add: (a, b) => ({ x: a.x + b.x, y: a.y + b.y }),
  sub: (a, b) => ({ x: a.x - b.x, y: a.y - b.y }),
  scale: (a, k) => ({ x: a.x * k, y: a.y * k }),
  len: a => Math.hypot(a.x, a.y),
  dist: (a, b) => Math.hypot(a.x - b.x, a.y - b.y),
  norm: a => { const l = Math.hypot(a.x, a.y) || 1; return { x: a.x / l, y: a.y / l }; },
  dot: (a, b) => a.x * b.x + a.y * b.y,
  angle: (a, b) => b ? Math.atan2(b.y - a.y, b.x - a.x) : Math.atan2(a.y, a.x),
  fromAngle: (ang, l = 1) => ({ x: Math.cos(ang) * l, y: Math.sin(ang) * l }),
  rotate: (a, ang) => { const c = Math.cos(ang), s = Math.sin(ang); return { x: a.x * c - a.y * s, y: a.x * s + a.y * c }; },
  lerp: (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }),
};
/** Smallest difference between two angles (radians, -π..π): for turning towards something. */
export const angleDiff = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
/** Wraps v into 0..max (for screens that wrap round). */
export const wrap = (v, max) => ((v % max) + max) % max;

/* ---------- overlap tests ---------- */
// circles are { x, y, r }; boxes are { x, y, w, h } with x, y the top-left corner.
export const overlap = {
  circles: (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2 < (a.r + b.r) ** 2,
  boxes: (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h,
  circleBox: (c, b) => { const nx = Math.max(b.x, Math.min(c.x, b.x + b.w)), ny = Math.max(b.y, Math.min(c.y, b.y + b.h)); return (c.x - nx) ** 2 + (c.y - ny) ** 2 < c.r * c.r; },
  pointInBox: (px, py, b) => px >= b.x && px < b.x + b.w && py >= b.y && py < b.y + b.h,
  pointInCircle: (px, py, c) => (px - c.x) ** 2 + (py - c.y) ** 2 < c.r * c.r,
  /** Does the segment (x1, y1)-(x2, y2) pass through circle c? */
  lineCircle: (x1, y1, x2, y2, c) => { const dx = x2 - x1, dy = y2 - y1, l = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((c.x - x1) * dx + (c.y - y1) * dy) / l)); return (x1 + dx * t - c.x) ** 2 + (y1 + dy * t - c.y) ** 2 < c.r * c.r; },
};

/* ---------- what's near me ---------- */
/**
 * A grid that finds nearby things fast (hundreds of bullets and enemies). Each frame: grid.clear(),
 * grid.add(thing) for each (things need x, y and r or w/h), then grid.near(x, y, radius).
 */
export class Grid {
  constructor(cell = 64) { this.cell = cell; this.map = new Map(); }
  clear() { this.map.clear(); }
  key(cx, cy) { return cx * 73856093 ^ cy * 19349663; }
  add(t) {
    const c = this.cell, r = t.r ?? Math.max(t.w || 0, t.h || 0) / 2, x0 = Math.floor((t.x - r) / c), x1 = Math.floor((t.x + r) / c), y0 = Math.floor((t.y - r) / c), y1 = Math.floor((t.y + r) / c);
    for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) { const k = this.key(cx, cy); let l = this.map.get(k); if (!l) this.map.set(k, l = []); l.push(t); }
  }
  near(x, y, radius) {
    const c = this.cell, out = new Set();
    for (let cx = Math.floor((x - radius) / c); cx <= Math.floor((x + radius) / c); cx++)
      for (let cy = Math.floor((y - radius) / c); cy <= Math.floor((y + radius) / c); cy++) for (const t of this.map.get(this.key(cx, cy)) || []) out.add(t);
    return [...out];
  }
}

/* ---------- timers in game time ---------- */
/**
 * Timers that run on your game's dt, so they stop when the game pauses (setTimeout doesn't).
 *   const timers = new Timers();  reset(): timers.clear();  update(dt): timers.update(dt);
 *   timers.after(2, () => spawnBoss());   timers.every(.5, () => shoot());   const t = timers.after(...); t.cancel();
 */
export class Timers {
  constructor() { this.list = []; }
  after(sec, fn) { const t = { at: sec, fn, every: 0, dead: false, cancel: () => { t.dead = true; } }; this.list.push(t); return t; }
  every(sec, fn) { const t = this.after(sec, fn); t.every = sec; return t; }
  update(dt) {
    for (const t of this.list) { if (t.dead) continue; t.at -= dt; if (t.at <= 0) { t.fn(); if (t.every) t.at += t.every; else t.dead = true; } }
    this.list = this.list.filter(t => !t.dead);
  }
  clear() { this.list = []; }
}

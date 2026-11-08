// Levels made by code: dungeons, caves, mazes, terrain, islands and tile patterns, all as the same text
// that gs.tiles.TileMap.fromText() reads ('#' wall, '.' floor, letters as marks), so a made level plays
// like a hand-written one. Seeded: the same seed gives the same level (gs.math.daily() for a level of
// the day). Dungeons, caves, mazes and field of view use rot.js; tile patterns use WaveFunctionCollapse.
// Both load the first time a game uses them: call these in make() or reset().
//
//   const { dungeon, cave, maze, islands, heightmap, pattern, fov } = gs.gen;
//   reset() {
//     const d = dungeon(40, 30, { seed: daily() });          // { text, rooms, start, end }
//     map = TileMap.fromText(d.text, { size: 16 });          // 'S' start and 'E' exit are marks
//   }
//   const seen = fov(map.text ?? d.text, hero.col, hero.row, 8);   // a Set of "col,row" the hero can see
//
// The text is rows joined by '\n'. Each result also has grid (an array of row strings) and w, h.

import { lazy } from './lazy.js';
import { rng, fbm } from './math.js';

// both libraries load together, so a game that uses dungeon() and pattern() waits once
const libs = lazy('Level maker', () => Promise.all([import('rot-js'), import('wavefunctioncollapse')]).then(([rot, wfc]) => ({ rot, wfc })));
const rot = { get: () => libs.get().rot }, wfcLib = { get: () => libs.get().wfc };
export const loadGen = () => libs.load();

const seedOf = s => (s == null ? (Math.random() * 2 ** 31) | 0 : typeof s === 'number' ? s | 0 : [...String(s)].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261) | 0);
function out(rows) { return { grid: rows.map(r => r.join('')), get text() { return this.grid.join('\n'); }, w: rows[0]?.length || 0, h: rows.length }; }
const blank = (w, h, ch = '#') => Array.from({ length: h }, () => new Array(w).fill(ch));
function useRot(seed) { const R = rot.get(); R.RNG.setSeed(seedOf(seed) || 1); return R; }

/**
 * Rooms joined by corridors. kind: 'digger' (default: rooms and winding corridors), 'uniform' (even
 * rooms) or 'rogue' (a 3x3 grid of rooms). Marks: 'S' start (first room), 'E' exit (the room
 * furthest away), 'D' doors (with doors: true). Returns { text, grid, rooms: [{ x, y, w, h, cx, cy }], start, end }.
 */
export function dungeon(w = 40, h = 30, { seed, kind = 'digger', doors = false, dug = .3 } = {}) {
  const R = useRot(seed), g = blank(w, h);
  const M = kind === 'uniform' ? new R.Map.Uniform(w, h, { roomDugPercentage: dug }) : kind === 'rogue' ? new R.Map.Rogue(w, h) : new R.Map.Digger(w, h, { dugPercentage: dug });
  M.create((x, y, wall) => { if (!wall) g[y][x] = '.'; });
  let rooms = [];
  if (M.getRooms) rooms = M.getRooms().map(r => {
    const x = r.getLeft(), y = r.getTop(), rw = r.getRight() - x + 1, rh = r.getBottom() - y + 1;
    if (doors) r.getDoors((dx, dy) => { if (g[dy]?.[dx] === '.') g[dy][dx] = 'D'; });
    return { x, y, w: rw, h: rh, cx: x + (rw >> 1), cy: y + (rh >> 1) };
  });
  if (!rooms.length) { const f = floors(g); rooms = [{ x: f[0][0], y: f[0][1], w: 1, h: 1, cx: f[0][0], cy: f[0][1] }]; }
  const start = { col: rooms[0].cx, row: rooms[0].cy };
  const far = furthest(g, start), end = far || { col: rooms[rooms.length - 1].cx, row: rooms[rooms.length - 1].cy };
  g[start.row][start.col] = 'S'; g[end.row][end.col] = 'E';
  return { ...out(g), rooms, start, end };
}

/** Natural caves (cellular automata): fill is how much starts as rock, steps how much it smooths. Keeps the biggest cave. */
export function cave(w = 40, h = 30, { seed, fill = .48, steps = 4, connect = true } = {}) {
  const R = useRot(seed), g = blank(w, h), M = new R.Map.Cellular(w, h);
  M.randomize(fill); for (let i = 0; i < steps; i++) M.create();
  M.create((x, y, v) => { if (!v && x > 0 && y > 0 && x < w - 1 && y < h - 1) g[y][x] = '.'; });
  if (connect) keepBiggest(g);
  const f = floors(g); if (f.length) { const s = f[0]; g[s[1]][s[0]] = 'S'; const e = furthest(g, { col: s[0], row: s[1] }); if (e) g[e.row][e.col] = 'E'; }
  return out(g);
}

/** A maze: kind 'backtracker' (long winding paths, default), 'eller' (many short turns) or 'divided' (straight walls). */
export function maze(w = 21, h = 21, { seed, kind = 'backtracker' } = {}) {
  const R = useRot(seed), g = blank(w, h);
  const M = kind === 'eller' ? new R.Map.EllerMaze(w, h) : kind === 'divided' ? new R.Map.DividedMaze(w, h) : new R.Map.IceyMaze(w, h, 0);
  M.create((x, y, wall) => { if (!wall) g[y][x] = '.'; });
  const f = floors(g); if (f.length) { const s = f[0]; g[s[1]][s[0]] = 'S'; const e = furthest(g, { col: s[0], row: s[1] }); if (e) g[e.row][e.col] = 'E'; }
  return out(g);
}

/** Smooth heights 0..1 (fractal noise): { w, h, at(x, y), data }. scale: features per tile (smaller = bigger hills). */
export function heightmap(w = 64, h = 64, { seed, scale = .06, octaves = 4 } = {}) {
  const s = seedOf(seed), ox = (s % 1000) * 7.13, oy = ((s / 1000) | 0) % 1000 * 3.71, data = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data[y * w + x] = Math.min(1, Math.max(0, fbm(x * scale + ox, y * scale + oy, octaves) * .5 + .5));
  return { w, h, data, at: (x, y) => data[Math.max(0, Math.min(h - 1, y | 0)) * w + Math.max(0, Math.min(w - 1, x | 0))] };
}

/** Islands: '~' sea, ',' beach, '.' land, '^' hills, falling away to sea at the edges. sea: how much is water. */
export function islands(w = 48, h = 48, { seed, sea = .45, scale = .08 } = {}) {
  const m = heightmap(w, h, { seed, scale }), g = blank(w, h, '~');
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = x / (w - 1) * 2 - 1, dy = y / (h - 1) * 2 - 1, edge = 1 - Math.min(1, Math.hypot(dx, dy) * .9);
    const v = m.at(x, y) * .6 + edge * .6 - .3;
    g[y][x] = v < sea - .3 ? '~' : v < sea - .24 ? ',' : v < sea + .02 ? '.' : '^';
  }
  return { ...out(g), heights: m };
}

/**
 * New tile patterns that look like an example (WaveFunctionCollapse, overlapping model): give a small
 * sample as text and get a w x h map built from the same 3x3 neighbourhoods. Good for towns, forests,
 * cave walls that look hand-placed. Returns null if it couldn't finish (try another seed).
 */
export function pattern(sample, w = 32, h = 32, { seed, n = 3, symmetry = 8, periodic = true, tries = 10 } = {}) {
  const { OverlappingModel } = wfcLib.get();
  const rows = String(sample).replace(/^\n+|\n+$/g, '').split('\n'), sw = Math.max(...rows.map(r => r.length)), sh = rows.length;
  const chars = [...new Set(rows.join(''))], data = new Uint8Array(sw * sh * 4);
  rows.forEach((r, y) => { for (let x = 0; x < sw; x++) { const i = chars.indexOf(r[x] ?? ' '), k = (y * sw + x) * 4; data[k] = i; data[k + 1] = 0; data[k + 2] = 0; data[k + 3] = 255; } });
  const r = rng(seedOf(seed));
  for (let t = 0; t < tries; t++) {
    const model = new OverlappingModel(data, sw, sh, n, w, h, periodic, false, symmetry);
    if (!model.generate(r)) continue;
    const img = model.graphics(), g = blank(w, h, ' ');
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) g[y][x] = chars[img[(y * w + x) * 4]] ?? ' ';
    return out(g);
  }
  return null;
}

/**
 * What can be seen from (col, row) within radius: a Set of "col,row". map: level text, or a function
 * (col, row) => true where light passes.
 */
export function fov(map, col, row, radius = 8) {
  const R = rot.get(), see = new Set();
  const grid = typeof map === 'string' ? map.split('\n') : null;
  const clear = grid ? (x, y) => { const ch = grid[y]?.[x]; return ch != null && ch !== '#' && ch !== '='; } : map;
  new R.FOV.PreciseShadowcasting((x, y) => clear(x, y)).compute(col, row, radius, (x, y) => see.add(x + ',' + y));
  return see;
}

// ---- helpers

function floors(g) { const f = []; g.forEach((r, y) => r.forEach((c, x) => { if (c !== '#') f.push([x, y]); })); return f; }
function flood(g, x0, y0) {
  const h = g.length, w = g[0].length, dist = new Int32Array(w * h).fill(-1), q = [[x0, y0]]; dist[y0 * w + x0] = 0;
  for (let i = 0; i < q.length; i++) {
    const [x, y] = q[i];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h || g[ny][nx] === '#' || dist[ny * w + nx] >= 0) continue;
      dist[ny * w + nx] = dist[y * w + x] + 1; q.push([nx, ny]);
    }
  }
  return dist;
}
function furthest(g, s) {
  const d = flood(g, s.col, s.row), w = g[0].length; let best = -1, at = null;
  d.forEach((v, i) => { if (v > best) { best = v; at = { col: i % w, row: (i / w) | 0 }; } });
  return best > 0 ? at : null;
}
function keepBiggest(g) {
  const w = g[0].length, h = g.length, seen = new Uint8Array(w * h); let best = null, bestN = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (g[y][x] === '#' || seen[y * w + x]) continue;
    const d = flood(g, x, y); let n = 0; d.forEach((v, i) => { if (v >= 0) { seen[i] = 1; n++; } });
    if (n > bestN) { bestN = n; best = d; }
  }
  if (best) best.forEach((v, i) => { if (v < 0) g[(i / w) | 0][i % w] = '#'; });
}

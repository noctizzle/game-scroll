// Hex grids and isometric views, for strategy, board and city-builder games.
//
// HexMap: a map of hexagons on honeycomb-grid (MIT, the standard JavaScript hex library, after Red
// Blob Games' guide): which hex a tap is on, neighbours, distance, lines, rings and ranges, plus what
// strategy games need on top: how far a unit can move with terrain costs (reach), the cheapest path
// (path), and line of sight past blocking hexes (sees). Each cell has q, r (axial coordinates), its
// centre x, y in game units, corners for drawing, and data for your own things. The map's own x, y
// option is its TOP LEFT corner; use cx, cy (or map.centre(x, y)) to put its middle somewhere.
//
//   const { HexMap, Iso } = gs.hex;
//   reset() { map = new HexMap({ size: 22, shape: 'rect', w: 8, h: 10, cx: W / 2, cy: H / 2 }); map.each(c => c.data.land = rnd(1) < .2 ? 'hill' : 'grass'); }
//   down(x, y) { const c = map.at(x, y); if (c && moves.has(c)) unit.cell = c; }
//   moves = map.reach(unit.cell, 3, c => c.data.land === 'hill' ? 2 : 1);   // Map(cell -> cost)
//   draw(c) { map.each(cell => { c.beginPath(); cell.corners.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.fill(); }); }
//
// Iso: an isometric view of a square grid: toScreen(tx, ty, z) and toTile(x, y) (the tile under a tap),
// and sort(things) for drawing back to front.
import { defineHex, Grid, rectangle, spiral, line as hexLine, Orientation } from 'honeycomb-grid';

const AX = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];   // the six axial neighbour steps
const key = (q, r) => q + ',' + r;

export class HexMap {
  /**
   * size: a hex's radius (centre to corner); pointy: pointy tops (false: flat); shape: 'rect' (w x h) |
   * 'hex' (radius) | 'none' (add cells yourself). x, y: where the map's TOP LEFT corner goes (not its
   * middle). To put the map's middle on a point instead, pass cx, cy (e.g. cx: W / 2, cy: H / 2), or
   * call map.centre(x, y) after adding your own cells. map.bounds is its box in game units.
   */
  constructor({ size = 24, pointy = true, shape = 'rect', w = 8, h = 8, radius = 4, x = 0, y = 0, cx = null, cy = null } = {}) {
    this.size = size; this.pointy = pointy; this.ox = x; this.oy = y;
    this.Hex = defineHex({ dimensions: size, orientation: pointy ? Orientation.POINTY : Orientation.FLAT, origin: 'topLeft' });
    this.grid = new Grid(this.Hex);
    this.cells = new Map();
    if (shape === 'rect') this.addAll(new Grid(this.Hex, rectangle({ width: w, height: h })));
    else if (shape === 'hex') {
      this.addAll(new Grid(this.Hex, spiral({ radius, start: [radius, radius] })));
      // its top left corner at x, y
      let mx = Infinity, my = Infinity; for (const c of this.cells.values()) for (const [px, py] of c.corners) { mx = Math.min(mx, px); my = Math.min(my, py); }
      this.shift(x - mx, y - my);
    }
    if (cx != null || cy != null) { const b = this.bounds; this.centre(cx ?? b.x + b.w / 2, cy ?? b.y + b.h / 2); }
  }
  /** The box around every cell's corners, in game units: { x, y, w, h } (x, y its top left). */
  get bounds() {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const c of this.cells.values()) for (const [px, py] of c.corners) { x0 = Math.min(x0, px); y0 = Math.min(y0, py); x1 = Math.max(x1, px); y1 = Math.max(y1, py); }
    return x0 === Infinity ? { x: this.ox, y: this.oy, w: 0, h: 0 } : { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  /** Moves the whole map (every cell, and where taps land) by dx, dy game units. */
  shift(dx, dy) {
    this.ox += dx; this.oy += dy;
    for (const c of this.cells.values()) { c.x += dx; c.y += dy; for (const p of c.corners) { p[0] += dx; p[1] += dy; } }
    return this;
  }
  /** Moves the map so the middle of its box sits on x, y (e.g. map.centre(W / 2, H / 2)). */
  centre(x, y) { const b = this.bounds; return this.shift(x - (b.x + b.w / 2), y - (b.y + b.h / 2)); }
  addAll(g) { for (const h of g) this.add(h.q, h.r); return this; }
  /** Adds a cell at axial q, r (for maps of your own shape). */
  add(q, r) {
    const k = key(q, r); if (this.cells.has(k)) return this.cells.get(k);
    const h = new this.Hex([q, r]);
    const c = { q, r, x: h.x + this.ox, y: h.y + this.oy, corners: h.corners.map(p => [p.x + this.ox, p.y + this.oy]), data: {} };
    this.cells.set(k, c); return c;
  }
  remove(c) { this.cells.delete(key(c.q, c.r)); return this; }
  /** The cell at q, r, or null. */
  cell(q, r) { return this.cells.get(key(q, r)) || null; }
  /** The cell under a point in game units, or null. */
  at(x, y) { const h = this.grid.pointToHex({ x: x - this.ox, y: y - this.oy }, { allowOutside: true }); return this.cell(h.q, h.r); }
  each(fn) { for (const c of this.cells.values()) fn(c); return this; }
  get list() { return [...this.cells.values()]; }
  /** The (up to six) cells next to c. */
  neighbours(c) { const out = []; for (const [dq, dr] of AX) { const n = this.cell(c.q + dq, c.r + dr); if (n) out.push(n); } return out; }
  /** Steps between two cells. */
  distance(a, b) { return (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2; }
  /** The cells on a straight line from a to b (both included; off-map ones left out). */
  line(a, b) { return [...new Grid(this.Hex, hexLine({ start: [a.q, a.r], stop: [b.q, b.r] }))].map(h => this.cell(h.q, h.r)).filter(Boolean); }
  /** Cells within n steps of c (c included). */
  range(c, n) { const out = []; for (let dq = -n; dq <= n; dq++) for (let dr = Math.max(-n, -dq - n); dr <= Math.min(n, -dq + n); dr++) { const x = this.cell(c.q + dq, c.r + dr); if (x) out.push(x); } return out; }
  /** Cells exactly n steps from c. */
  ring(c, n) { return this.range(c, n).filter(x => this.distance(c, x) === n); }
  /** Where a unit at `from` can get with `moves` points: Map(cell -> points spent). cost(cell, from) is what entering a cell costs (Infinity: blocked). */
  reach(from, moves, cost = () => 1) {
    const best = new Map([[from, 0]]), open = [[0, from]];
    while (open.length) {
      open.sort((a, b) => a[0] - b[0]); const [d, c] = open.shift();
      if (d > best.get(c)) continue;
      for (const n of this.neighbours(c)) { const nd = d + cost(n, c); if (nd <= moves && nd < (best.get(n) ?? Infinity)) { best.set(n, nd); open.push([nd, n]); } }
    }
    return best;
  }
  /** The cheapest way from a to b (A*): [a, ..., b], or null. cost as in reach. */
  path(a, b, cost = () => 1) {
    const g = new Map([[a, 0]]), came = new Map(), open = [[this.distance(a, b), a]];
    while (open.length) {
      open.sort((x, y) => x[0] - y[0]); const [, c] = open.shift();
      if (c === b) { const p = [b]; let k = b; while (came.has(k)) { k = came.get(k); p.unshift(k); } return p; }
      for (const n of this.neighbours(c)) {
        const step = cost(n, c); if (!(step < Infinity)) continue;
        const nd = g.get(c) + step; if (nd < (g.get(n) ?? Infinity)) { g.set(n, nd); came.set(n, c); open.push([nd + this.distance(n, b), n]); }
      }
    }
    return null;
  }
  /** Whether b can be seen from a: no cell between them blocks (blocks(cell) true). */
  sees(a, b, blocks = () => false) { const l = this.line(a, b); for (let i = 1; i < l.length - 1; i++) if (blocks(l[i])) return false; return true; }
  /** Plain data for api.save (each cell's data), and back. */
  save() { const out = {}; for (const [k, c] of this.cells) if (Object.keys(c.data).length) out[k] = c.data; return out; }
  load(d) { for (const [k, v] of Object.entries(d || {})) { const c = this.cells.get(k); if (c) c.data = v; } return this; }
}

/** An isometric view of a square tile grid. tw, th: a tile's width and height on screen (2:1 is classic); x, y: where tile 0, 0's top corner goes; zh: screen height of one unit up. */
export class Iso {
  constructor({ tw = 32, th = 16, x = 0, y = 0, zh = null } = {}) { Object.assign(this, { tw, th, x, y, zh: zh ?? th }); }
  /** Screen position of tile tx, ty (its top corner; tx + .5, ty + .5 for the middle), z units up. */
  toScreen(tx, ty, z = 0) { return { x: this.x + (tx - ty) * this.tw / 2, y: this.y + (tx + ty) * this.th / 2 - z * this.zh }; }
  /** The tile under a screen point (fractions: floor them for the tile). */
  toTile(x, y) { const a = (x - this.x) / (this.tw / 2), b = (y - this.y) / (this.th / 2); return { tx: (a + b) / 2, ty: (b - a) / 2 }; }
  /** The four corners of a tile on screen (for drawing it or a highlight). */
  corners(tx, ty, z = 0) { return [this.toScreen(tx, ty, z), this.toScreen(tx + 1, ty, z), this.toScreen(tx + 1, ty + 1, z), this.toScreen(tx, ty + 1, z)].map(p => [p.x, p.y]); }
  /** Sorts things ({ tx, ty, z }) back to front for drawing. Returns the list. */
  sort(list) { return list.sort((a, b) => (a.tx + a.ty) - (b.tx + b.ty) || (a.z || 0) - (b.z || 0)); }
}

// Real-time strategy, colony and tower-defence controls: pick units by tapping or dragging a box,
// send them in a formation, steer crowds with a flow field (one map for every unit going to the same
// place), place buildings on a grid, and pick targets for towers. The kit answers who, where and
// which way; your game moves, draws and fights.
//
//   const { Select, formation, FlowField, BuildGrid, target } = gs.rts;
//   reset() {
//     sel = new Select(() => units.filter(u => u.mine), { radius: 14 });
//     grid = new BuildGrid(20, 30, 18);                  // 20 x 30 tiles of 18 units
//     flow = new FlowField(20, 30, 18, (tx, ty) => grid.free(tx, ty) ? 1 : Infinity);
//   }
//   down(x, y, id) { sel.down(x, y); }  move(x, y) { sel.move(x, y); }
//   up(x, y) { if (!sel.up(x, y)) { const spots = formation(sel.list, x, y, { shape: 'grid' }); for (const [u, p] of spots) u.goal = p; } }
//   update(dt) { flow.to(base.tx, base.ty); for (const e of enemies) { const d = flow.dir(e.x, e.y); e.x += d.x * e.speed * dt; e.y += d.y * e.speed * dt; } }
//   draw(c) { if (sel.box) c.strokeRect(sel.box.x, sel.box.y, sel.box.w, sel.box.h); }
//
// Things are any objects with x and y (and whatever else your game keeps on them).

const d2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

/** Picking units: tap one, drag a box round several, double tap for every one of the same kind. */
export class Select {
  /** things: () => the things that can be picked; radius: how near a tap must be; drag: how far a finger moves before it's a box; kind: (thing) => its kind for double taps. */
  constructor(things, { radius = 16, drag = 12, kind = t => t.kind, doubleTap = .3 } = {}) {
    Object.assign(this, { things, radius, dragDist: drag, kind, doubleTap });
    this.chosen = new Set(); this.start = null; this.box = null; this.lastTap = null; this.handlers = {};
  }
  on(ev, fn) { (this.handlers[ev] ||= []).push(fn); return this; }
  emit(ev, ...a) { for (const f of this.handlers[ev] || []) f(...a); }
  get list() { return [...this.chosen]; }
  has(t) { return this.chosen.has(t); }
  set(list) { this.chosen = new Set(list); this.emit('change', this.list); return this; }
  clear() { return this.set([]); }
  /** The thing nearest a point, within radius, or null. */
  near(x, y) { let best = null, bd = this.radius ** 2; for (const t of this.things()) { const d = (t.x - x) ** 2 + (t.y - y) ** 2; if (d <= bd) { bd = d; best = t; } } return best; }
  down(x, y) { this.start = { x, y, t: performance.now() / 1000 }; this.box = null; }
  move(x, y) {
    if (!this.start) return;
    if (this.box || Math.hypot(x - this.start.x, y - this.start.y) > this.dragDist) {
      const s = this.start; this.box = { x: Math.min(s.x, x), y: Math.min(s.y, y), w: Math.abs(x - s.x), h: Math.abs(y - s.y) };
    }
  }
  /**
   * Lifts the finger. A box picks what's in it; a tap on a thing picks it (a double tap: all of its kind);
   * returns true when it picked (or cleared). A tap on nothing returns false and keeps the choice: that's
   * an order for the game to give (move here).
   */
  up(x, y) {
    const s = this.start; this.start = null;
    if (this.box) { const b = this.box; this.box = null; this.set(this.things().filter(t => t.x >= b.x && t.x <= b.x + b.w && t.y >= b.y && t.y <= b.y + b.h)); return true; }
    if (!s) return false;
    const t = this.near(x, y), now = performance.now() / 1000;
    if (!t) return false;
    const twice = this.lastTap && this.lastTap.t === t && now - this.lastTap.at < this.doubleTap;
    this.lastTap = { t, at: now };
    if (twice) { const k = this.kind(t); this.set(this.things().filter(o => this.kind(o) === k)); }
    else this.set([t]);
    return true;
  }
}

/**
 * Where each unit goes to stand in a formation round x, y: [[unit, { x, y }], ...] (each unit gets the
 * nearest free place, so they don't cross over). shape: 'grid' | 'line' | 'wedge' | 'circle'; gap: space
 * between places; facing: the way the front faces (radians; default from the units towards x, y).
 */
export function formation(units, x, y, { shape = 'grid', gap = 20, facing = null } = {}) {
  const n = units.length; if (!n) return [];
  const cx = units.reduce((a, u) => a + u.x, 0) / n, cy = units.reduce((a, u) => a + u.y, 0) / n;
  const f = facing ?? Math.atan2(y - cy, x - cx), fx = Math.cos(f), fy = Math.sin(f), sx = -fy, sy = fx;   // forward, and sideways
  const local = [];
  if (shape === 'line') for (let i = 0; i < n; i++) local.push([(i - (n - 1) / 2) * gap, 0]);
  else if (shape === 'circle') { const r = n < 2 ? 0 : Math.max(gap, gap * n / (2 * Math.PI)); for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; local.push([Math.cos(a) * r, Math.sin(a) * r]); } }
  else if (shape === 'wedge') { local.push([0, 0]); for (let row = 1; local.length < n; row++) for (const side of [-1, 1]) if (local.length < n) local.push([side * row * gap, -row * gap]); }
  else { const cols = Math.ceil(Math.sqrt(n)), rows = Math.ceil(n / cols); for (let i = 0; i < n; i++) local.push([(i % cols - (cols - 1) / 2) * gap, -(Math.floor(i / cols) - (rows - 1) / 2) * gap]); }
  const spots = local.map(([s, fw]) => ({ x: x + sx * s + fx * fw, y: y + sy * s + fy * fw }));
  // nearest free place, the units furthest out choosing first (a simple, steady assignment)
  const order = [...units].sort((a, b) => d2(b, { x, y }) - d2(a, { x, y })), free = new Set(spots), out = [];
  for (const u of order) { let best = null, bd = Infinity; for (const p of free) { const d = d2(u, p); if (d < bd) { bd = d; best = p; } } free.delete(best); out.push([u, best]); }
  return out;
}

/**
 * A flow field over a tile grid: to(tx, ty) works out, for every tile, which way leads to that tile by
 * the cheapest route (cost(tx, ty): 1 for open ground, more for mud, Infinity for walls). Then any
 * number of units steer with dir(x, y): hundreds of enemies cost the same as one.
 */
export class FlowField {
  constructor(w, h, size, cost = () => 1) {
    Object.assign(this, { w, h, size, cost }); this.dist = new Float32Array(w * h); this.goal = null;
  }
  inside(tx, ty) { return tx >= 0 && ty >= 0 && tx < this.w && ty < this.h; }
  tile(x, y) { return { tx: Math.floor(x / this.size), ty: Math.floor(y / this.size) }; }
  /** Works out the field towards tile tx, ty (again only when the goal or `force` changes: call again after the map changes, with force). */
  to(tx, ty, force = false) {
    if (!force && this.goal && this.goal[0] === tx && this.goal[1] === ty) return this;
    this.goal = [tx, ty]; const { w, h } = this, D = this.dist; D.fill(Infinity);
    if (!this.inside(tx, ty)) return this;
    D[ty * w + tx] = 0; const open = [[0, tx, ty]];
    while (open.length) {
      let bi = 0; for (let i = 1; i < open.length; i++) if (open[i][0] < open[bi][0]) bi = i;
      const [d, x, y] = open[bi]; open[bi] = open[open.length - 1]; open.pop();
      if (d > D[y * w + x]) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy; if (!this.inside(nx, ny)) continue;
        const c = this.cost(nx, ny); if (!(c < Infinity)) continue;
        const nd = d + c; if (nd < D[ny * w + nx]) { D[ny * w + nx] = nd; open.push([nd, nx, ny]); }
      }
    }
    return this;
  }
  /** The route cost from a tile to the goal (Infinity: no way). */
  at(tx, ty) { return this.inside(tx, ty) ? this.dist[ty * this.w + tx] : Infinity; }
  /** Which way to go from a point: a unit vector { x, y } (0, 0 at the goal or with no way). Diagonals where both sides are open. */
  dir(x, y) {
    const { tx, ty } = this.tile(x, y), here = this.at(tx, ty); let bx = 0, by = 0, best = here;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      if (dx && dy && (!(this.at(tx + dx, ty) < Infinity) || !(this.at(tx, ty + dy) < Infinity))) continue;   // no cutting corners
      const d = this.at(tx + dx, ty + dy); if (d < best) { best = d; bx = dx; by = dy; }
    }
    if (here === 0) { const cx = (tx + .5) * this.size - x, cy = (ty + .5) * this.size - y, l = Math.hypot(cx, cy); return l > 1 ? { x: cx / l, y: cy / l } : { x: 0, y: 0 }; }
    const l = Math.hypot(bx, by) || 1; return { x: bx / l, y: by / l };
  }
}

/** A grid for placing buildings: what fits where, snapping a dragged building to tiles, and what's on each tile. */
export class BuildGrid {
  constructor(w, h, size, { blocked = () => false } = {}) { Object.assign(this, { w, h, size, blocked }); this.cells = new Array(w * h).fill(null); this.things = new Set(); }
  inside(tx, ty) { return tx >= 0 && ty >= 0 && tx < this.w && ty < this.h; }
  /** What's built on a tile (or null). */
  at(tx, ty) { return this.inside(tx, ty) ? this.cells[ty * this.w + tx] : null; }
  free(tx, ty) { return this.inside(tx, ty) && !this.cells[ty * this.w + tx] && !this.blocked(tx, ty); }
  /** Whether a building of fw x fh tiles fits with its top left at tx, ty. */
  fits(tx, ty, fw = 1, fh = 1) { for (let y = ty; y < ty + fh; y++) for (let x = tx; x < tx + fw; x++) if (!this.free(x, y)) return false; return true; }
  /** The tile a building of fw x fh centred on a point would start at, and whether it fits there: { tx, ty, x, y (its centre, snapped), ok }. */
  snap(x, y, fw = 1, fh = 1) { const tx = Math.round(x / this.size - fw / 2), ty = Math.round(y / this.size - fh / 2); return { tx, ty, x: (tx + fw / 2) * this.size, y: (ty + fh / 2) * this.size, ok: this.fits(tx, ty, fw, fh) }; }
  /** Builds thing (any object; gets tx, ty, fw, fh) if it fits. Returns whether it did. */
  place(thing, tx, ty, fw = 1, fh = 1) {
    if (!this.fits(tx, ty, fw, fh)) return false;
    Object.assign(thing, { tx, ty, fw, fh, x: (tx + fw / 2) * this.size, y: (ty + fh / 2) * this.size });
    for (let y = ty; y < ty + fh; y++) for (let x = tx; x < tx + fw; x++) this.cells[y * this.w + x] = thing;
    this.things.add(thing); return true;
  }
  remove(thing) { for (let i = 0; i < this.cells.length; i++) if (this.cells[i] === thing) this.cells[i] = null; this.things.delete(thing); return this; }
}

/**
 * Picks a target for a tower or a unit at `from` among things within range: 'first' (furthest along:
 * the lowest progress(t), such as a flow field's at() for its tile), 'last', 'near', 'far', 'strong'
 * (most hp), 'weak'. Returns the thing or null.
 */
export function target(from, things, { range = 100, by = 'first', progress = t => t.left ?? 0, hp = t => t.hp ?? 0 } = {}) {
  let best = null, score = Infinity; const r2 = range * range;
  for (const t of things) {
    const d = d2(from, t); if (d > r2 || t.dead) continue;
    const s = by === 'near' ? d : by === 'far' ? -d : by === 'last' ? -progress(t) : by === 'strong' ? -hp(t) : by === 'weak' ? hp(t) : progress(t);
    if (s < score) { score = s; best = t; }
  }
  return best;
}

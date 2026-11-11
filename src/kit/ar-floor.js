// Finds the real floor for native AR (world mode in ar3d.js). Plain maths, no drawing and no
// three.js, so it runs in Node too (scripts/kit-test.mjs plays whole rooms through it).
//
// The phone's AR system (ARCore / ARKit) maps flat surfaces, answers hit tests and can list the
// feature points it is tracking. Heights here are in its own space: y up, in metres, with 0 where
// the phone was when the AR session began. The floor is the lowest well-supported flat surface a
// sensible distance below the phone:
//  - a mapped surface 75 cm to 2.3 m below the phone counts at once (the lowest sizeable one);
//  - one only 45 to 75 cm below is usually a desk or a table, so it counts only when it is as big
//    as a floor (2 square metres) or reaches well away from the player. iPhones say what a surface
//    is (floor, table, seat), and that settles it;
//  - feature points lying in one flat layer, spread out, count as the floor before the AR system
//    has mapped a surface there (plain floors map slowly). Such a layer under a mapped surface
//    also shows that surface is a table or a sofa, not the floor;
//  - rough hit-test points need three that agree;
//  - if nothing turns up in time the search ends on the best estimate, so nobody is left waiting:
//    the floor from the last round, a thin layer of points, or the usual phone height. Real
//    evidence replaces an estimate whenever it arrives.
// Once a mapped surface is the floor it only gives way to a lower one of real size, or when its own
// surface has gone from the map, so the room doesn't hop up and down.

/** How far below the phone the floor can be: standing or sitting, never a table top right under it. */
export const FLOOR_MIN = .75, FLOOR_NEAR = .45, FLOOR_MAX = 2.3;
const AREA_MIN = .08;                   // a mapped surface smaller than this (28 cm square) is ignored
const NEAR_AREA = 2, NEAR_REACH = 1.5;  // a surface close under the phone is the floor only if this big, or this far away
const GIVE_UP = 5, GIVE_UP_KEPT = 1.2;  // seconds of good tracking before settling for an estimate
const CELL = .08, BIN = .02;            // feature points are kept one per 8 cm column and 2 cm of height
const LAYER_MIN = 6, LAYER_SURE = 10;   // 16 cm columns a layer of points needs: to be noticed, to be the floor
const REAL = { plane: 1, points: 1, hits: 1, hand: 1 };

export class FloorFinder {
  /**
   * eye: how high the phone is usually held (metres), for the last-resort guess.
   * kept: { y, src, sure } the floor of the last round in this same AR session, if there was one.
   */
  constructor({ eye = 1.3, kept = null } = {}) {
    this.eye = eye; this.kept = kept;
    /** The floor's height (native metres), or null while searching. */
    this.floor = null;
    /** What it came from: 'plane' | 'points' | 'hits' | 'hand' (real), 'kept' | 'rough' | 'guess' (estimates). */
    this.src = null;
    this.area = 0;
    this.px = 0; this.py = 0; this.pz = 0; this.py0 = null;   // the phone now; its height when the search began
    this.t = 0; this.clock = 0;                               // seconds searched with good tracking; all seconds
    this.list = []; this.seenT = 0;                           // mapped surfaces last heard of; when the floor's own was last among them
    this.hits = [];                                           // rough hit-test heights { y, t }
    this.cells = new Map();                                   // feature points, one per cell: { x, y, z, n, t }
    this.layer = null; this.layerN = 0; this.layerT = 0;      // the lowest flat layer of points; how long it has held
    this.fedT = null;                                         // when feature points first arrived (null: none yet)
    /** Set when the phone has been asked for feature points, so a mapped surface waits a moment for them. */
    this.expect = false;
    this.news = null;
  }
  /** True when the floor comes from real evidence (a mapped surface, points, or the player's own setting). */
  get sure() { return !!REAL[this.src]; }
  /** How far the search has got, 0 to 1 (evidence gathered, or time running out). */
  get progress() {
    if (this.floor != null) return 1;
    return Math.min(.97, Math.max(this.evidence, this.t / this.patience));
  }
  /** Seconds of good tracking the search gets: short when last round's floor is there to fall back on. */
  get patience() { return this.kept && this.py0 != null && this.fits(this.kept.y) ? GIVE_UP_KEPT : GIVE_UP; }
  /** How much floor-like evidence has gathered so far, 0 to 1. */
  get evidence() {
    if (this.floor != null) return 1;
    const L = this.layer, y = this.hits.length ? this.hits[this.hits.length - 1].y : 0;
    return Math.max(L ? Math.min(1, L.n / LAYER_SURE) * .6 + Math.min(1, this.layerN / 3) * .35 : 0,
      Math.min(.9, this.hits.filter(h => Math.abs(h.y - y) < .05).length / 3));
  }
  /** What changed since the last call: 'found' (real floor), 'kept' or 'guess' (an estimate), 'moved', or null. */
  take() { const n = this.news; this.news = null; return n; }

  /** Where the phone is now (native metres). The first call starts the search. */
  pose(x, y, z) {
    this.px = x; this.py = y; this.pz = z;
    if (this.py0 != null) return;
    this.py0 = y;
    // the player lined the floor up by hand last round: that stands
    if (this.kept?.src === 'hand' && this.fits(this.kept.y)) this.set(this.kept.y, 'hand');
  }
  fits(y) { const b = this.py - y; return b > .3 && b < FLOOR_MAX + .1; }
  set(y, src, area = 0) {
    const was = this.floor, wasSure = this.sure;
    this.floor = y; this.src = src; this.area = area; this.seenT = this.clock;
    if (was == null) this.news = REAL[src] ? 'found' : src === 'kept' ? 'kept' : 'guess';
    else if (REAL[src] && !wasSure) this.news = 'found';
    else if (Math.abs(y - was) > .005 && !this.news) this.news = 'moved';
  }

  /** Mapped surfaces: [{ x, y, z, a (area), kind }]. kind is 'floor' | 'table' | 'seat' | 'other' where the phone can tell. */
  planes(list) {
    this.list = list;
    if (this.py0 == null) return;
    if (this.floor != null && list.some(p => Math.abs(p.y - this.floor) < .05)) this.seenT = this.clock;
    let known = null, big = 0; const ok = [];
    for (const p of list) {
      if (p.a < AREA_MIN) continue;
      const below = this.py - p.y;
      if (p.kind === 'floor') { if (below > .3 && below < FLOOR_MAX + .3 && (!known || p.a > known.a)) known = p; continue; }
      if (p.kind && p.kind !== 'none') continue;                       // a table, a seat...
      if (below < FLOOR_NEAR || below > FLOOR_MAX) continue;
      if (below < FLOOR_MIN && !this.floorLike(p)) continue;           // close under the phone: most likely a desk
      ok.push(p); if (p.a > big) big = p.a;
    }
    if (known) return this.plane(known, true);
    // the lowest one of real size: a small patch far below a big surface is more often a mistake
    let pick = null;
    for (const p of ok) if (p.a >= Math.min(.4, .3 * big) && (!pick || p.y < pick.y)) pick = p;
    if (pick) this.plane(pick, false);
  }
  floorLike(p) { return p.a >= NEAR_AREA || Math.hypot(p.x - this.px, p.z - this.pz) >= NEAR_REACH; }
  /** True when feature points lie in a flat layer well below height y: something else is underneath. */
  under(y) { const L = this.layer; return !!L && L.y < y - .12; }
  plane(p, known) {
    const f = this.floor, dy = f == null ? 0 : p.y - f;
    if (this.src === 'hand') { if (Math.abs(dy) < .06 && Math.abs(dy) > .005) this.set(p.y, 'hand', p.a); return; }   // the player's own setting: only tidy it
    if (!known && this.under(p.y)) return;
    // Points arrive before surfaces are mapped, except when the phone still has its map from an earlier
    // round: then give the points a moment to show what lies below this surface (unless it is last
    // round's floor). A phone that sends no points holds things up for a second at most.
    if (!known && !this.sure && this.expect && (this.fedT == null ? this.t < 1 : this.clock - this.fedT < .75) && !(this.kept?.sure && Math.abs(this.kept.y - p.y) < .05)) return;
    // a floor found from points stays under anything mapped above it (a table, a bed): points go out
    // of view when the player looks up, a mapped surface doesn't, so "no layer below" proves nothing later
    if (!known && (this.src === 'points' || this.src === 'hits') && dy > .12) return;
    if (f != null && this.src === 'plane') {
      if (Math.abs(dy) < .05) { if (known || p.a >= this.area) this.set(p.y, 'plane', p.a); return; }                // the same surface, growing
      if (dy < 0) { if (known || p.a >= Math.max(AREA_MIN, Math.min(.5, .5 * this.area))) this.set(p.y, 'plane', p.a); return; }
      // higher than the floor in use: only when that floor's own surface has left the map
      if (known || (this.clock - this.seenT > 2 && p.a >= .3)) this.set(p.y, 'plane', p.a);
      return;
    }
    this.set(p.y, 'plane', p.a);
  }

  /**
   * One hit-test answer: where a ray met something (native metres), its kind ('plane' | 'point') and,
   * where the phone can tell, what the surface is ('floor' | 'table' | 'seat' | 'other').
   */
  hit(x, y, z, kind, surface) {
    if (this.py0 == null || this.src === 'hand') return;
    const below = this.py - y;
    if (below < FLOOR_NEAR || below > FLOOR_MAX) return;                // a table top, or nonsense
    const far = Math.hypot(x - this.px, z - this.pz);
    if (kind === 'plane') {
      // which mapped surface was it? (for its size, and so a table an iPhone has named stays a table)
      let m = null; for (const p of this.list) if (Math.abs(p.y - y) < .03 && (!m || p.a > m.a)) m = p;
      const is = surface || m?.kind;
      if (is && is !== 'none' && is !== 'floor') return;
      if (is !== 'floor' && below < FLOOR_MIN && !(m ? this.floorLike(m) : far >= 2)) return;
      return this.plane({ x, y, z, a: m ? m.a : AREA_MIN }, is === 'floor');
    }
    if (below < FLOOR_MIN && far < 2) return;
    this.hits.push({ y, t: this.clock });
    this.hits = this.hits.filter(h => this.clock - h.t < 4).slice(-12);
    const near = this.hits.filter(h => Math.abs(h.y - y) < .05);
    if (near.length >= 3 && (this.floor == null || !this.sure)) this.set(near.reduce((s, h) => s + h.y, 0) / near.length, 'hits');
  }

  /** Feature points the AR system is tracking: x, y, z, x, y, z... (each times k to get metres). */
  points(arr, k = 1) {
    if (this.py0 == null) return;
    this.fedT ??= this.clock;
    const now = this.clock, lo = this.py - FLOOR_MAX - .2, hi = this.py - .3;
    for (let i = 0; i + 2 < arr.length; i += 3) {
      const x = arr[i] * k, y = arr[i + 1] * k, z = arr[i + 2] * k;
      if (!(y > lo && y < hi) || Math.hypot(x - this.px, z - this.pz) > 5) continue;   // only what could be floor, near enough to trust
      const ix = Math.round(x / CELL) + 2048, iy = Math.round(y / BIN) + 2048, iz = Math.round(z / CELL) + 2048;
      if (ix < 0 || ix > 4095 || iy < 0 || iy > 4095 || iz < 0 || iz > 4095) continue;
      const key = (ix * 4096 + iz) * 4096 + iy, c = this.cells.get(key);
      if (c) { c.n++; c.t = now; } else if (this.cells.size < 4000) this.cells.set(key, { x, y, z, n: 1, t: now });
    }
    for (const [key, c] of this.cells) if (now - c.t > 6) this.cells.delete(key);   // points not seen for a while
    this.findLayer();
  }
  /** Forget the feature points (the phone stopped sending them). */
  clearPoints() { this.cells.clear(); this.layer = null; this.layerN = 0; this.fedT = null; }
  // The lowest flat layer of points: a 6 cm slab holding points in enough different places, spread
  // both ways. A layer needs a quarter of the busiest layer's support, so a few stray points under a
  // well-seen floor (noise, reflections in a shiny floor) aren't taken for one.
  findLayer() {
    const bins = new Map();
    for (const c of this.cells.values()) {
      const below = this.py - c.y; if (below < FLOOR_NEAR - .05 || below > FLOOR_MAX + .05) continue;
      const b = Math.round(c.y / BIN); let s = bins.get(b); if (!s) bins.set(b, s = []); s.push(c);
    }
    const keys = [...bins.keys()].sort((a, b) => a - b), slabs = new Map();
    let most = 0;
    for (const b of keys) for (let i = -1; i <= 1; i++) if (!slabs.has(b + i)) { const s = slab(bins, b + i); slabs.set(b + i, s); if (s && s.n > most) most = s.n; }
    let L = null;
    for (const b of [...slabs.keys()].sort((a, c) => a - c)) {
      const s = slabs.get(b); if (!s || s.n < Math.max(LAYER_MIN, .25 * most)) continue;
      if (this.py - s.y < FLOOR_MIN && s.area < NEAR_AREA) continue;      // close under the phone and small: a desk
      L = s;
      for (let i = 1; i <= 3; i++) { const u = slabs.get(b + i); if (u && u.n >= L.n) L = u; }   // climb to the middle of the layer
      break;
    }
    if (L && this.layer && Math.abs(L.y - this.layer.y) < .03) this.layerN++; else { this.layerN = L ? 1 : 0; this.layerT = this.clock; }
    this.layer = L;
    if (!L || L.n < LAYER_SURE || this.layerN < 3 || this.clock - this.layerT < .5) return;
    // a steady, well-supported layer: it is the floor unless a mapped surface or the player says otherwise
    if (this.floor == null || !this.sure || this.src === 'hits' || (this.src === 'points' && Math.abs(L.y - this.floor) > .03)) this.set(L.y, 'points');
  }

  /** Time passes. good: the AR system is tracking. */
  update(dt, good) {
    this.clock += dt;
    if (!good || this.py0 == null || this.floor != null) return;
    this.t += dt;
    if (this.t >= this.patience) this.giveUp();
  }
  /** Stop searching and use the best estimate (also the Skip button). Real evidence still replaces it later. */
  giveUp() {
    if (this.floor != null || this.py0 == null) return;
    const L = this.layer, k = this.kept && this.fits(this.kept.y) ? this.kept : null;
    if (k && k.sure) return this.set(k.y, 'kept');                      // last round's floor, if that was a real one
    if (L) return this.set(L.y, 'rough');                               // a thin layer of points
    const y = this.hits.length ? this.hits[this.hits.length - 1].y : 0, near = this.hits.filter(h => Math.abs(h.y - y) < .05);
    if (near.length >= 2) return this.set(near.reduce((s, h) => s + h.y, 0) / near.length, 'rough');
    if (k) return this.set(k.y, 'kept');                                // last round's estimate: at least things stay where they were
    this.set(this.py0 - this.eye, 'guess');
  }
  /** The player lined the floor up by hand. */
  hand(y) { this.set(y, 'hand'); }
}

// The points within 3 cm of height bin b, gathered into 16 cm columns. A column counts once it has
// been seen twice (a point seen once could be noise). The columns must spread out both ways: a row
// of points along a skirting board or a table edge is a line, not a floor.
function slab(bins, b) {
  const cols = new Map();
  for (let i = -1; i <= 1; i++) for (const c of bins.get(b + i) || []) {
    const k = Math.round(c.x / .16) * 8192 + Math.round(c.z / .16); let o = cols.get(k);
    if (!o) cols.set(k, o = { x: 0, y: 0, z: 0, n: 0 });
    o.x += c.x * c.n; o.y += c.y * c.n; o.z += c.z * c.n; o.n += c.n;
  }
  let n = 0, mx = 0, my = 0, mz = 0;
  for (const o of cols.values()) if (o.n >= 2) { o.x /= o.n; o.y /= o.n; o.z /= o.n; n++; mx += o.x; my += o.y; mz += o.z; }
  if (n < 3) return null;
  mx /= n; my /= n; mz /= n;
  let xx = 0, zz = 0, xz = 0;
  for (const o of cols.values()) if (o.n >= 2) { const dx = o.x - mx, dz = o.z - mz; xx += dx * dx; zz += dz * dz; xz += dx * dz; }
  xx /= n; zz /= n; xz /= n;
  // how far the columns spread along their narrow direction, and roughly the area they cover
  const narrow = Math.sqrt(Math.max(0, (xx + zz) / 2 - Math.hypot((xx - zz) / 2, xz))), area = 12 * Math.sqrt(Math.max(0, xx * zz - xz * xz));
  if (narrow < .1 || area < .12) return null;
  return { y: my, n, area };
}

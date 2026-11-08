// Drawing and gesture shapes: record a finger's line, smooth it, thin it out, and say which shape it
// was (circle, line, triangle, square, check, zigzag, heart, star, spiral, wave, or your own). For spell
// casting, drawn platforms, rune puzzles, "draw the answer", and lines that turn into physics.
//
//   const { Stroke, Shapes, toPhysics } = gs.strokes;
//   const shapes = new Shapes(['circle', 'triangle', 'zigzag']);      // only the ones your game uses
//   shapes.add('bolt', [[0, 0], [10, 20], [4, 20], [14, 40]]);        // or your own, as points
//   down(x, y) { line = new Stroke().add(x, y); }
//   move(x, y, pressed) { if (pressed && line) line.add(x, y); }
//   up() {
//     const m = shapes.match(line.points);       // { name, score 0..1, sure } or null if too short
//     if (m?.sure) cast(m.name);
//     // or toPhysics(phys, line.simplify(4), { thick: 6 }) for a drawn ramp (gs.physics)
//   }
//   draw(c) { line?.draw(c, { width: 6, color: '#fff' }); }
//
// The recogniser is a point-cloud matcher ($P family): it doesn't care which way round or where the
// line starts, so a circle drawn either direction is still a circle. Templates are made in code.

/** A line drawn by a finger: points [x, y] with a light smoothing as they come in. */
export class Stroke {
  constructor({ smooth = .35, gap = 2 } = {}) { this.points = []; this.smooth = smooth; this.gap = gap; this.length = 0; }
  add(x, y) {
    const p = this.points, last = p[p.length - 1];
    if (last) {
      const sx = last[0] + (x - last[0]) * (1 - this.smooth), sy = last[1] + (y - last[1]) * (1 - this.smooth);
      const d = Math.hypot(sx - last[0], sy - last[1]); if (d < this.gap) return this;
      this.length += d; p.push([sx, sy]);
    } else p.push([x, y]);
    return this;
  }
  get first() { return this.points[0]; }
  get last() { return this.points[this.points.length - 1]; }
  /** Ends near where it started (a loop). */
  get closed() { const a = this.first, b = this.last; return !!a && this.length > 40 && Math.hypot(a[0] - b[0], a[1] - b[1]) < Math.max(24, this.length * .12); }
  get bounds() { return bounds(this.points); }
  /** Fewer points, same look (Ramer-Douglas-Peucker): tolerance in game units. */
  simplify(tolerance = 3) { return simplify(this.points, tolerance); }
  /** n evenly spaced points along the line. */
  resample(n = 32) { return resample(this.points, n); }
  /** Total turning in turns (a circle drawn once is about 1). */
  get turns() { let a = 0; const p = this.points; for (let i = 2; i < p.length; i++) { const t1 = Math.atan2(p[i - 1][1] - p[i - 2][1], p[i - 1][0] - p[i - 2][0]), t2 = Math.atan2(p[i][1] - p[i - 1][1], p[i][0] - p[i - 1][0]); let d = t2 - t1; d = Math.atan2(Math.sin(d), Math.cos(d)); a += d; } return a / (Math.PI * 2); }
  draw(c, { width = 5, color = '#fff', cap = 'round' } = {}) {
    const p = this.points; if (!p.length) return;
    c.save(); c.strokeStyle = color; c.lineWidth = width; c.lineCap = cap; c.lineJoin = 'round'; c.beginPath(); c.moveTo(p[0][0], p[0][1]);
    for (let i = 1; i < p.length - 1; i++) c.quadraticCurveTo(p[i][0], p[i][1], (p[i][0] + p[i + 1][0]) / 2, (p[i][1] + p[i + 1][1]) / 2);
    if (p.length > 1) c.lineTo(p[p.length - 1][0], p[p.length - 1][1]); else { c.lineTo(p[0][0] + .1, p[0][1]); }
    c.stroke(); c.restore();
  }
}

// ---- built-in shapes, made in code (unit-ish size; the matcher scales them)
const arc = (n, f) => Array.from({ length: n }, (_, i) => f(i / (n - 1)));
const poly = pts => { const out = []; for (let i = 0; i < pts.length - 1; i++) for (let k = 0; k < 8; k++) { const t = k / 8; out.push([pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t]); } out.push(pts[pts.length - 1]); return out; };
const BUILT = {
  circle: () => arc(48, t => [Math.cos(t * Math.PI * 2), Math.sin(t * Math.PI * 2)]),
  line: () => poly([[0, 0], [1, 0]]),
  triangle: () => poly([[0, -1], [.87, .5], [-.87, .5], [0, -1]]),
  square: () => poly([[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]]),
  check: () => poly([[-1, 0], [-.4, .7], [1, -1]]),
  caret: () => poly([[-1, .6], [0, -.6], [1, .6]]),
  zigzag: () => poly([[-1, -.4], [-.5, .4], [0, -.4], [.5, .4], [1, -.4]]),
  heart: () => arc(64, t => { const a = t * Math.PI * 2; return [16 * Math.sin(a) ** 3 / 16, -(13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)) / 16]; }),
  star: () => poly(Array.from({ length: 6 }, (_, i) => { const a = -Math.PI / 2 + i * Math.PI * 4 / 5; return [Math.cos(a), Math.sin(a)]; })),
  spiral: () => arc(64, t => { const a = t * Math.PI * 5, r = .1 + t; return [Math.cos(a) * r, Math.sin(a) * r]; }),
  wave: () => arc(48, t => [t * 2 - 1, Math.sin(t * Math.PI * 4) * .3]),
  cross: () => [...poly([[-1, -1], [1, 1]]), ...poly([[1, -1], [-1, 1]])],
};
/** The names of the built-in shapes. */
export const SHAPES = Object.freeze(Object.keys(BUILT));

/**
 * Says which shape a drawn line is. names: built-in shapes to use (default: all of them). match()
 * returns { name, score, sure } with score 0..1 (1 = perfect) and sure when it's clearly that one.
 */
export class Shapes {
  constructor(names = SHAPES, { n = 32, sure = .72 } = {}) {
    this.n = n; this.sureAt = sure; this.list = [];
    for (const name of names) { if (!BUILT[name]) throw new Error(`gs.strokes: no built-in shape "${name}" (have ${SHAPES.join(', ')})`); this.add(name, BUILT[name]()); }
  }
  /** Adds a shape from points [[x, y], ...] (any size and place). Several with one name are fine. */
  add(name, points) { this.list.push({ name, cloud: normalise(resample(points, this.n)) }); return this; }
  /** The best match for points (a Stroke's .points), or null if the line is too short to tell. */
  match(points, { min = 30 } = {}) {
    if (!points || points.length < 3 || pathLength(points) < min) return null;
    const cloud = normalise(resample(points, this.n));
    let best = null, bd = Infinity, second = Infinity;
    const seen = {};
    for (const t of this.list) {
      const d = cloudDistance(cloud, t.cloud);
      if (d < (seen[t.name] ?? Infinity)) seen[t.name] = d;
    }
    for (const [name, d] of Object.entries(seen)) { if (d < bd) { second = bd; bd = d; best = name; } else if (d < second) second = d; }
    const score = Math.max(0, 1 - bd / (this.n * .9)), gap = second === Infinity ? 1 : (second - bd) / second;
    return { name: best, score, sure: score >= this.sureAt && gap > .08 };
  }
  /** Every shape with its score, best first. */
  rank(points) {
    if (!points || points.length < 3) return [];
    const cloud = normalise(resample(points, this.n)), seen = {};
    for (const t of this.list) seen[t.name] = Math.min(seen[t.name] ?? Infinity, cloudDistance(cloud, t.cloud));
    return Object.entries(seen).map(([name, d]) => ({ name, score: Math.max(0, 1 - d / (this.n * .9)) })).sort((a, b) => b.score - a.score);
  }
}

/**
 * Turns a drawn line into physics (gs.physics). fixed (default true) makes a solid ramp or wall along
 * the line (one thing); fixed: false makes a falling object from boxes thick game units wide, welded
 * end to end (a list of things). Other options go to the physics shapes (bounce, friction, tag...).
 */
export function toPhysics(phys, points, { thick = 6, fixed = true, ...o } = {}) {
  const p = points.length > 2 ? simplify(points, 2) : points;
  if (fixed) return phys.line(p, o);
  const parts = [];
  for (let i = 0; i < p.length - 1; i++) {
    const [x1, y1] = p[i], [x2, y2] = p[i + 1], len = Math.hypot(x2 - x1, y2 - y1); if (len < 1) continue;
    const b = phys.box((x1 + x2) / 2, (y1 + y2) / 2, len + thick * .5, thick, { ...o, angle: Math.atan2(y2 - y1, x2 - x1) });
    if (parts.length) phys.weld(parts[parts.length - 1], b, x1, y1);
    parts.push(b);
  }
  return parts;
}

// ---- maths
export function pathLength(p) { let d = 0; for (let i = 1; i < p.length; i++) d += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); return d; }
export function bounds(p) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of p) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}
export function resample(points, n = 32) {
  const p = points.map(q => [q[0], q[1]]); if (p.length < 2) return Array.from({ length: n }, () => [...(p[0] || [0, 0])]);
  const step = pathLength(p) / (n - 1); if (step === 0) return Array.from({ length: n }, () => [...p[0]]);
  const out = [[...p[0]]]; let acc = 0;
  for (let i = 1; i < p.length; i++) {
    const a = p[i - 1], b = p[i], d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (acc + d >= step && d > 0) { const t = (step - acc) / d, q = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]; out.push(q); p.splice(i, 0, q); acc = 0; }
    else acc += d;
  }
  while (out.length < n) out.push([...p[p.length - 1]]);
  return out.slice(0, n);
}
export function simplify(p, tol = 3) {
  if (p.length < 3) return p.slice();
  const keep = new Uint8Array(p.length); keep[0] = keep[p.length - 1] = 1;
  const stack = [[0, p.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop(); let far = -1, fd = tol;
    const [ax, ay] = p[a], [bx, by] = p[b], L = Math.hypot(bx - ax, by - ay) || 1;
    for (let i = a + 1; i < b; i++) { const d = Math.abs((bx - ax) * (ay - p[i][1]) - (ax - p[i][0]) * (by - ay)) / L; if (d > fd) { fd = d; far = i; } }
    if (far > 0) { keep[far] = 1; stack.push([a, far], [far, b]); }
  }
  return p.filter((_, i) => keep[i]);
}
function normalise(p) {
  const b = bounds(p), s = Math.max(b.w, b.h) || 1;
  let cx = 0, cy = 0; for (const q of p) { cx += q[0]; cy += q[1]; } cx /= p.length; cy /= p.length;
  return p.map(([x, y]) => [(x - cx) / s, (y - cy) / s]);
}
// $P greedy cloud match, both directions, a few start points
function cloudDistance(a, b) {
  const n = a.length, step = Math.max(1, Math.floor(Math.sqrt(n)));
  let best = Infinity;
  for (let i = 0; i < n; i += step) best = Math.min(best, greedy(a, b, i), greedy(b, a, i));
  return best;
}
function greedy(a, b, start) {
  const n = a.length, used = new Uint8Array(n); let sum = 0, i = start;
  do {
    let md = Infinity, idx = -1;
    for (let j = 0; j < n; j++) if (!used[j]) { const d = Math.hypot(a[i][0] - b[j][0], a[i][1] - b[j][1]); if (d < md) { md = d; idx = j; } }
    used[idx] = 1; sum += (1 - ((i - start + n) % n) / n) * md * 2;
    i = (i + 1) % n;
  } while (i !== start);
  return sum;
}

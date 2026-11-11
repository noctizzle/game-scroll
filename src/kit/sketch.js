// Hand-drawn looks: shapes that look sketched with a pen (Rough.js) and ink strokes that swell and
// taper like a brush or marker (perfect-freehand). The game still says what to draw and where; this
// only changes how the line looks. Both libraries load the first time a game uses gs.sketch.
//
//   const { Sketch, Ink, ink } = gs.sketch;
//   reset() { pen = new Sketch({ stroke: '#2b2b2b', strokeWidth: 2, roughness: 1.2 }); }
//   draw(c) {
//     pen.rect(c, 40, 80, 120, 60, { fill: '#ffd23f' });             // wobbly outline, hatched fill
//     pen.circle(c, 200, 110, 28, { fill: '#4fc3ff', fillStyle: 'solid' });
//     pen.line(c, 20, 200, 340, 204);
//   }
//   // a line the player draws, inked as it goes:
//   down(x, y) { line = new Ink({ size: 10, color: '#1b1b3a' }); line.add(x, y); }
//   move(x, y, pressed) { if (pressed) line.add(x, y); }
//   up() { line.end(); }                  draw(c) { line.draw(c); }
//
// A shape is worked out once and remembered, wherever it is drawn: moving it costs nothing, and its
// wobble stays put instead of crawling. `boil: 8` redraws the wobble 8 times a second (call
// pen.update(dt)), the "line boil" of hand-drawn cartoons.
import rough from 'roughjs';
import { getStroke } from 'perfect-freehand';

const gen = rough.generator();
const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) % 2147483646 + 1; };
const r2 = v => Math.round(v * 2) / 2;   // sizes are kept to half a unit, so a shape that grows smoothly isn't worked out afresh every frame

/* ---------- drawing what Rough.js worked out ---------- */
function trace(target, ops) {
  for (const { op, data } of ops) {
    if (op === 'move') target.moveTo(data[0], data[1]);
    else if (op === 'bcurveTo') target.bezierCurveTo(data[0], data[1], data[2], data[3], data[4], data[5]);
    else if (op === 'lineTo') target.lineTo(data[0], data[1]);
  }
}
// each set of lines becomes a Path2D once (where the browser has one), so drawing is a single stroke or fill
function pathsOf(d) {
  if (d.gsPaths !== undefined) return d.gsPaths;
  if (typeof Path2D === 'undefined') return (d.gsPaths = null);
  return (d.gsPaths = d.sets.map(s => { const p = new Path2D(); trace(p, s.ops); return p; }));
}
function paint(c, d) {
  const o = d.options, paths = pathsOf(d);
  d.sets.forEach((s, i) => {
    const p = paths && paths[i];
    if (s.type === 'fillPath') {
      const rule = d.shape === 'curve' || d.shape === 'polygon' || d.shape === 'path' ? 'evenodd' : 'nonzero';
      c.fillStyle = o.fill;
      if (p) c.fill(p, rule); else { c.beginPath(); trace(c, s.ops); c.fill(rule); }
      return;
    }
    if (s.type === 'fillSketch') { c.strokeStyle = o.fill; c.lineWidth = o.fillWeight < 0 ? o.strokeWidth / 2 : o.fillWeight; c.setLineDash([]); }
    else { if (o.stroke === 'none') return; c.strokeStyle = o.stroke; c.lineWidth = o.strokeWidth; c.setLineDash(o.strokeLineDash || []); }
    if (p) c.stroke(p); else { c.beginPath(); trace(c, s.ops); c.stroke(); }
  });
}

/**
 * A pen that draws sketchy shapes. Options (for the pen, and again per shape): stroke ('#222', or
 * 'none'), strokeWidth (2), fill (a colour; none by default), fillStyle ('hachure' | 'solid' |
 * 'zigzag' | 'cross-hatch' | 'dots' | 'dashed' | 'zigzag-line'), fillWeight, hachureGap,
 * hachureAngle (degrees), roughness (1: 0 is a ruler, 3 is a shaky hand), bowing (1: how much straight
 * lines bend), dash ([on, off]), seed (a different hand), boil (wobbles a second: 0 keeps it still).
 */
export class Sketch {
  constructor(o = {}) {
    const { boil = 0, seed = 1, dash = null, ...rest } = o;
    this.o = { roughness: 1, bowing: 1, stroke: '#222222', strokeWidth: 2, fillStyle: 'hachure', ...rest };
    if (dash) this.o.strokeLineDash = dash;
    this.seed = seed; this.boil = boil; this.t = 0; this.frames = 3;
    this.cache = new Map();
  }
  /** Counts time for boil (the wobble that changes a few times a second). */
  update(dt) { this.t += dt; }
  clear() { this.cache.clear(); }
  _shape(key, o, make) {
    const frame = this.boil > 0 ? Math.floor(this.t * this.boil) % this.frames : 0;
    const opts = o ? { ...this.o, ...o } : this.o;
    if (o && o.dash) { opts.strokeLineDash = o.dash; delete opts.dash; }
    const full = key + '|' + frame + (o ? '|' + JSON.stringify(o) : '');
    let d = this.cache.get(full);
    if (d) { this.cache.delete(full); this.cache.set(full, d); return d; }
    if (this.cache.size >= 300) this.cache.delete(this.cache.keys().next().value);
    this.cache.set(full, d = make({ ...opts, seed: hash(key + '|' + this.seed + '|' + frame) }));
    return d;
  }
  _draw(c, x, y, d) {
    c.save(); c.translate(x, y); c.lineCap = 'round'; c.lineJoin = 'round';
    paint(c, d);
    c.restore();
  }
  /** A rectangle with its top left at (x, y). */
  rect(c, x, y, w, h, o) { w = r2(w); h = r2(h); this._draw(c, x, y, this._shape('r' + w + ',' + h, o, q => gen.rectangle(0, 0, w, h, q))); }
  /** A circle centred on (x, y). */
  circle(c, x, y, r, o) { r = r2(r); this._draw(c, x, y, this._shape('c' + r, o, q => gen.circle(0, 0, r * 2, q))); }
  /** An ellipse centred on (x, y), rx wide and ry tall from the centre. */
  ellipse(c, x, y, rx, ry, o) { rx = r2(rx); ry = r2(ry); this._draw(c, x, y, this._shape('e' + rx + ',' + ry, o, q => gen.ellipse(0, 0, rx * 2, ry * 2, q))); }
  /** A straight line (it bends a little: bowing). */
  line(c, x1, y1, x2, y2, o) { const dx = r2(x2 - x1), dy = r2(y2 - y1); this._draw(c, x1, y1, this._shape('l' + dx + ',' + dy, o, q => gen.line(0, 0, dx, dy, q))); }
  _points(points) {
    const p = points.map(q => (Array.isArray(q) ? q : [q.x, q.y])), x = p[0][0], y = p[0][1];
    return { x, y, rel: p.map(q => [r2(q[0] - x), r2(q[1] - y)]) };
  }
  /** A closed shape through the points ([[x, y], ...] or [{ x, y }, ...]). */
  poly(c, points, o) { if (points.length < 2) return; const { x, y, rel } = this._points(points); this._draw(c, x, y, this._shape('p' + rel.join(';'), o, q => gen.polygon(rel, q))); }
  /** Straight lines from point to point, left open. */
  lines(c, points, o) { if (points.length < 2) return; const { x, y, rel } = this._points(points); this._draw(c, x, y, this._shape('s' + rel.join(';'), o, q => gen.linearPath(rel, q))); }
  /** A smooth curve through the points. */
  curve(c, points, o) { if (points.length < 2) return; const { x, y, rel } = this._points(points); this._draw(c, x, y, this._shape('v' + rel.join(';'), o, q => gen.curve(rel, q))); }
  /** Part of a circle centred on (x, y) from angle `from` to `to` (radians, clockwise from the right). closed: true draws it as a pie slice. */
  arc(c, x, y, r, from, to, o = {}) {
    const { closed = false, ...rest } = o; r = r2(r);
    const a = Math.round(from * 100) / 100, b = Math.round(to * 100) / 100;
    this._draw(c, x, y, this._shape('a' + r + ',' + a + ',' + b + ',' + closed, Object.keys(rest).length ? rest : undefined, q => gen.arc(0, 0, r * 2, r * 2, a, b, closed, q)));
  }
  /** An SVG path ('M0 0 L40 0 ...'), drawn with its own 0, 0 at (x, y). */
  path(c, x, y, d, o) { this._draw(c, x, y, this._shape('d' + d, o, q => gen.path(d, q))); }
  /** How many shapes are remembered (for tests). */
  get remembered() { return this.cache.size; }
}

/* ---------- ink strokes ---------- */
const INK = { size: 8, thinning: .5, smoothing: .5, streamline: .5, taper: 0, spacing: 0, color: '#111111' };
const xyp = p => (Array.isArray(p) ? p : p.pressure == null ? [p.x, p.y] : [p.x, p.y, p.pressure]);
function strokeOptions(o, done) {
  const t = o.taper, start = typeof t === 'object' && t ? t.start || 0 : t || 0, end = typeof t === 'object' && t ? t.end || 0 : t || 0;
  return {
    size: o.size, thinning: o.thinning, smoothing: o.smoothing, streamline: o.streamline, simulatePressure: o.pressure !== true, last: done,
    start: { taper: start === true ? true : start, cap: true }, end: { taper: end === true ? true : end, cap: true },
  };
}
/**
 * The outline of an ink stroke through the points: [[x, y], ...], a closed shape to fill (or to hit
 * test). points: [{ x, y }] or [[x, y]], with an optional pressure 0..1 each (then pass pressure: true),
 * or a gs.strokes Stroke. Options: size (8: the widest the line gets), thinning (.5: how much speed
 * or pressure changes the width; 0 for an even line, below 0 for fatter when fast), smoothing,
 * streamline (.5: how much the line lags to iron out shaky hands), taper (0, a length, or
 * { start, end }: the ends thin to a point), pressure (true to use the points' own pressure), spacing
 * (0: for a line through a few far-apart points, a number adds points so none are further apart than
 * that; a finger's own points are close enough, and how far apart they are is what makes a fast line thin).
 */
export function inkOutline(points, o = {}, done = true) {
  let list = ((points && points.points) || points || []).map(xyp);
  if (o.spacing > 0) list = spaced(list, o.spacing);
  return getStroke(list, strokeOptions({ ...INK, ...o }, done));
}
// extra points along the way, so no two are more than `gap` apart
function spaced(list, gap) {
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const a = list[i - 1], b = list[i];
    if (a) { const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / gap); for (let k = 1; k < n; k++) { const t = k / n; out.push(a.length > 2 && b.length > 2 ? [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t] : [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); } }
    out.push(b);
  }
  return out;
}
function trail(target, pts) {
  const n = pts.length; if (n < 3) return false;
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], m0 = mid(pts[n - 1], pts[0]);
  target.moveTo(m0[0], m0[1]);
  for (let i = 0; i < n; i++) { const a = pts[i], m = mid(a, pts[(i + 1) % n]); target.quadraticCurveTo(a[0], a[1], m[0], m[1]); }
  target.closePath();
  return true;
}
/** Draws one ink stroke through the points, in one call (options as inkOutline, plus color). For a line that is drawn every frame, an Ink remembers its shape. */
export function ink(c, points, o = {}) {
  const pts = inkOutline(points, o);
  c.beginPath(); if (!trail(c, pts)) return false;
  c.fillStyle = o.color || INK.color; c.fill();
  return true;
}

/**
 * One ink stroke that grows as points are added and remembers its shape between frames.
 * add(x, y, pressure?) while the finger moves, end() when it lifts, draw(c) each frame.
 */
export class Ink {
  constructor(o = {}) { this.o = { ...INK, ...o }; this.points = []; this.done = false; this._path = null; this._outline = null; }
  /** Adds a point (pressure 0..1 is optional: without it the line's width follows the finger's speed). */
  add(x, y, pressure) {
    const last = this.points[this.points.length - 1];
    if (last && last[0] === x && last[1] === y) return this;
    if (pressure != null) { this.points.push([x, y, pressure]); this.o.pressure = true; } else this.points.push([x, y]);
    this._path = this._outline = null;
    return this;
  }
  /** The finger lifted: the end of the line is finished off. */
  end() { if (!this.done) { this.done = true; this._path = this._outline = null; } return this; }
  clear() { this.points.length = 0; this.done = false; this._path = this._outline = null; return this; }
  get length() { return this.points.length; }
  /** The stroke's outline: [[x, y], ...], a closed shape. */
  outline() { return (this._outline ||= inkOutline(this.points, this.o, this.done)); }
  /** Is (x, y) on the ink (within r of it)? */
  hit(x, y, r = 0) {
    const reach = this.o.size / 2 + r;
    for (let i = 0; i < this.points.length; i++) {
      const a = this.points[i], b = this.points[i + 1] || a, dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy || 1e-9;
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / L));
      if (Math.hypot(a[0] + dx * t - x, a[1] + dy * t - y) <= reach) return true;
    }
    return false;
  }
  /** Draws the stroke. color: this once, instead of the stroke's own. */
  draw(c, { color } = {}) {
    if (!this.points.length) return false;
    c.fillStyle = color || this.o.color;
    if (typeof Path2D !== 'undefined') {
      if (!this._path) { this._path = new Path2D(); if (!trail(this._path, this.outline())) { this._path = null; return false; } }
      c.fill(this._path);
    } else { c.beginPath(); if (!trail(c, this.outline())) return false; c.fill(); }
    return true;
  }
}

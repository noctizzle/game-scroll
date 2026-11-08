// Paths: smooth curves through points, for race tracks, enemy routes, rails, roads, conveyor belts
// and anything that follows a line. The same Path works in 2D ({ x, y }) and 3D ({ x, y, z }).
// Distances along the path are in your game's units, and moving along it is at a steady speed,
// however unevenly the points are spaced.
//
//   const { Path, Follower } = gs.paths;
//   const track = new Path([[40, 500], [180, 380], [320, 500], [180, 600]], { loop: true });
//   const car = new Follower(track, { speed: 120 });        // units per second; loop or pingpong at the ends
//   update(dt) { car.update(dt); }                          // car.x, car.y, car.angle, car.d (distance along)
//   draw(c) { track.trace(c); c.stroke(); }                 // traces the curve into the current path
//   track.at(d)          -> { x, y, z, angle, dx, dy, dz }  (point and direction at distance d)
//   track.offset(d, 20)  -> the point 20 units to the right of the line (lanes, road edges)
//   track.nearest(x, y)  -> { d, x, y, dist }              (snap a dragged thing onto the path)
//   track.length
//
// Kinds: 'smooth' (Catmull-Rom through every point, the default), 'line' (straight segments) or
// 'bezier' (points are p0, c1, c2, p1, c1, c2, p2...: like a drawing program's pen).

const P = p => Array.isArray(p) ? { x: +p[0] || 0, y: +p[1] || 0, z: +p[2] || 0 } : { x: +p.x || 0, y: +p.y || 0, z: +p.z || 0 };

export class Path {
  /** points: [[x, y], ...] or [{ x, y, z }, ...]; loop: join the end to the start; kind; tension 0..1 for smooth (.5 is centripetal-like). */
  constructor(points, { loop = false, kind = 'smooth', tension = .5, detail = 24 } = {}) {
    this.pts = points.map(P); this.loop = !!loop; this.kind = kind; this.tension = tension; this.detail = detail;
    this.is3d = points.some(p => (Array.isArray(p) ? p[2] : p.z) != null);
    this.build();
  }
  /** Number of curve pieces. */
  get pieces() {
    const n = this.pts.length;
    if (this.kind === 'bezier') return Math.max(0, Math.floor((n - 1) / 3));
    return Math.max(0, this.loop ? n : n - 1);
  }
  /** The point on piece i at u (0..1), before spacing out by distance. */
  raw(i, u, out = { x: 0, y: 0, z: 0 }) {
    const p = this.pts, n = p.length;
    if (n === 1) return Object.assign(out, p[0]);
    if (this.kind === 'bezier') {
      const a = p[i * 3], b = p[i * 3 + 1], c = p[i * 3 + 2], d = p[i * 3 + 3], v = 1 - u;
      const k0 = v * v * v, k1 = 3 * v * v * u, k2 = 3 * v * u * u, k3 = u * u * u;
      out.x = a.x * k0 + b.x * k1 + c.x * k2 + d.x * k3; out.y = a.y * k0 + b.y * k1 + c.y * k2 + d.y * k3; out.z = a.z * k0 + b.z * k1 + c.z * k2 + d.z * k3;
      return out;
    }
    const at = j => this.loop ? p[((j % n) + n) % n] : p[Math.max(0, Math.min(n - 1, j))];
    const b = at(i), c = at(i + 1);
    if (this.kind === 'line') { out.x = b.x + (c.x - b.x) * u; out.y = b.y + (c.y - b.y) * u; out.z = b.z + (c.z - b.z) * u; return out; }
    // Catmull-Rom (cardinal spline): passes through every point
    const a = this.loop || i > 0 ? at(i - 1) : { x: 2 * b.x - c.x, y: 2 * b.y - c.y, z: 2 * b.z - c.z };
    const d = this.loop || i + 2 < n ? at(i + 2) : { x: 2 * c.x - b.x, y: 2 * c.y - b.y, z: 2 * c.z - b.z };
    const t = this.tension, u2 = u * u, u3 = u2 * u;
    const h1 = 2 * u3 - 3 * u2 + 1, h2 = -2 * u3 + 3 * u2, h3 = u3 - 2 * u2 + u, h4 = u3 - u2;
    for (const k of ['x', 'y', 'z']) out[k] = h1 * b[k] + h2 * c[k] + h3 * t * (c[k] - a[k]) + h4 * t * (d[k] - b[k]);
    return out;
  }
  /** Rebuilds the distance table (call after moving points in path.pts). */
  build() {
    const N = this.pieces, k = this.detail, s = [{ ...this.raw(0, 0), d: 0 }];
    let len = 0;
    for (let i = 0; i < N; i++) for (let j = 1; j <= k; j++) {
      const q = this.raw(i, j / k), l = s[s.length - 1];
      len += Math.hypot(q.x - l.x, q.y - l.y, q.z - l.z);
      s.push({ ...q, d: len });
    }
    this.samples = s; this.length = len;
    return this;
  }
  wrapD(d) {
    if (!this.length) return 0;
    return this.loop ? ((d % this.length) + this.length) % this.length : Math.max(0, Math.min(this.length, d));
  }
  /** The point at distance d along the path, with its direction: { x, y, z, angle (2D heading), dx, dy, dz (unit) }. */
  at(d, out = {}) {
    const s = this.samples; d = this.wrapD(d);
    let lo = 0, hi = s.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (s[m].d < d) lo = m; else hi = m; }
    const a = s[lo], b = s[hi] || a, span = b.d - a.d, f = span > 0 ? (d - a.d) / span : 0;
    out.x = a.x + (b.x - a.x) * f; out.y = a.y + (b.y - a.y) * f; out.z = a.z + (b.z - a.z) * f;
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, l = Math.hypot(dx, dy, dz) || 1;
    out.dx = dx / l; out.dy = dy / l; out.dz = dz / l; out.angle = Math.atan2(dy, dx); out.d = d;
    return out;
  }
  /** The point `side` units to the right of the path at distance d (left if negative). In 3D, right is on the ground (x-z). */
  offset(d, side, out = {}) {
    const p = this.at(d, out);
    if (this.is3d) { const l = Math.hypot(p.dx, p.dz) || 1; p.x += -p.dz / l * side; p.z += p.dx / l * side; }
    else { p.x += -p.dy * side; p.y += p.dx * side; }
    return p;
  }
  /** The closest point on the path to (x, y[, z]): { d, x, y, z, dist }. */
  nearest(x, y, z = 0) {
    let best = null, bd = Infinity;
    const s = this.samples;
    for (let i = 0; i < s.length - 1; i++) {
      const a = s[i], b = s[i + 1], vx = b.x - a.x, vy = b.y - a.y, vz = b.z - a.z, L = vx * vx + vy * vy + vz * vz;
      const t = L ? Math.max(0, Math.min(1, ((x - a.x) * vx + (y - a.y) * vy + (z - a.z) * vz) / L)) : 0;
      const px = a.x + vx * t, py = a.y + vy * t, pz = a.z + vz * t, dd = (px - x) ** 2 + (py - y) ** 2 + (pz - z) ** 2;
      if (dd < bd) { bd = dd; best = { d: a.d + (b.d - a.d) * t, x: px, y: py, z: pz }; }
    }
    if (!best) best = { d: 0, ...(s[0] || { x: 0, y: 0, z: 0 }) };
    best.dist = Math.sqrt(bd === Infinity ? 0 : bd);
    return best;
  }
  /** Points spaced `step` apart along the path (for dotted lines, fence posts, coins along a route). */
  spaced(step) { const out = []; if (step <= 0) return out; for (let d = 0; d <= this.length + 1e-6; d += step) out.push(this.at(d)); return out; }
  /** Adds the curve to the canvas's current path (from = to: the whole of it). Then stroke() it your way. 2D only. */
  trace(c, from = 0, to = this.length) {
    const s = this.samples; if (!s.length) return this;
    const a = this.at(from); c.moveTo(a.x, a.y);
    for (const p of s) if (p.d > from && p.d < to) c.lineTo(p.x, p.y);
    const b = this.at(to); c.lineTo(b.x, b.y);
    if (this.loop && from === 0 && to === this.length) c.closePath();
    return this;
  }
  /** Points for three.js (new THREE.BufferGeometry().setFromPoints(path.points3(THREE.Vector3)), rails, tubes). */
  points3(V, step = 0) { return (step ? this.spaced(step) : this.samples).map(p => new V(p.x, p.y, p.z)); }
}

/**
 * Moves along a path at a steady speed: speed (units/s, negative goes backwards), end: 'loop' |
 * 'pingpong' | 'stop' (default: loop on looped paths, stop otherwise), d: where to start. Reads:
 * x, y, z, angle, dx, dy, dz, d, done (reached the end with end 'stop'), lap (times round).
 */
export class Follower {
  constructor(path, { speed = 100, end = null, d = 0, side = 0 } = {}) {
    Object.assign(this, { path, speed, end: end || (path.loop ? 'loop' : 'stop'), d, side, dir: 1, done: false, lap: 0 });
    this.place();
  }
  place() { this.path.offset(this.d, this.side, this); return this; }
  update(dt) {
    const L = this.path.length; if (!L) return this;
    let d = this.d + this.speed * this.dir * dt;
    if (this.end === 'loop') { if (d >= L) this.lap++; if (d < 0) this.lap--; d = ((d % L) + L) % L; }
    else if (this.end === 'pingpong') { if (d > L) { d = 2 * L - d; this.dir = -this.dir; } else if (d < 0) { d = -d; this.dir = -this.dir; } }
    else { if (d >= L || d <= 0) this.done = true; d = Math.max(0, Math.min(L, d)); }
    this.d = d; return this.place();
  }
}

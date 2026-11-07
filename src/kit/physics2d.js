// Simple 2D physics: balls and boxes that fall, bounce, roll, stack and collide. Good for physics
// toys, stacking games, pinball-ish bouncers and puzzle drops. Boxes stay upright (they don't
// rotate), which keeps stacks steady and the maths cheap enough for phones.
//
//   import { World } from '../kit/physics2d.js';
//   const w = new World({ gravity: 900, walls: [0, 0, W, H] });      // walls: [x, y, w, h], or false
//   const ball = w.circle(100, 50, 12, { bounce: .6 });
//   const floor = w.box(W / 2, H - 10, W, 20, { fixed: true });       // boxes are centre x, y, width, height
//   w.onHit((a, b, speed) => { if (speed > 120) sounds.hit(); });
//   update(dt): w.step(dt);
//   draw(c):    for (const b of w.bodies) ...draw at b.x, b.y (b.r for balls, b.w / b.h for boxes, b.angle for a ball's roll)
//
// Units are the game's own, gravity in units per second squared. Body fields you can read or set:
// x, y, vx, vy, mass, bounce (0..1), friction (0..1), fixed (never moves), sensor (reports hits but
// doesn't push), tag (anything, for your own use), sleeping. Call b.push(ix, iy) for an instant kick.

export class Body {
  constructor(kind, x, y, o) {
    this.kind = kind; this.x = x; this.y = y; this.vx = o.vx || 0; this.vy = o.vy || 0;
    this.r = o.r || 0; this.w = o.w || 0; this.h = o.h || 0;
    this.bounce = o.bounce ?? .3; this.friction = o.friction ?? .4; this.fixed = !!o.fixed; this.sensor = !!o.sensor;
    this.gravity = o.gravity ?? 1;   // multiplier: 0 floats, -1 rises
    this.drag = o.drag ?? 0;          // air drag per second
    const area = kind === 'circle' ? Math.PI * this.r * this.r : this.w * this.h;
    this.mass = this.fixed ? Infinity : (o.mass ?? area * (o.density ?? .01));
    this.inv = this.fixed ? 0 : 1 / this.mass;
    this.tag = o.tag; this.angle = 0; this.sleeping = false; this.still = 0; this.dead = false;
  }
  push(ix, iy) { if (this.fixed) return; this.vx += ix * this.inv; this.vy += iy * this.inv; this.sleeping = false; this.still = 0; }
  /** Bounding box: [left, top, right, bottom]. */
  get bounds() { const hw = this.kind === 'circle' ? this.r : this.w / 2, hh = this.kind === 'circle' ? this.r : this.h / 2; return [this.x - hw, this.y - hh, this.x + hw, this.y + hh]; }
  contains(px, py) {
    if (this.kind === 'circle') return (px - this.x) ** 2 + (py - this.y) ** 2 <= this.r * this.r;
    return Math.abs(px - this.x) <= this.w / 2 && Math.abs(py - this.y) <= this.h / 2;
  }
}

// Contact between a and b: normal (nx, ny) points from a to b, depth is the overlap.
function collide(a, b) {
  if (a.kind === 'circle' && b.kind === 'circle') {
    const dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy, r = a.r + b.r;
    if (d2 >= r * r) return null;
    const d = Math.sqrt(d2) || 1e-6;
    return { nx: dx / d, ny: d2 ? dy / d : 1, depth: r - d };
  }
  if (a.kind === 'box' && b.kind === 'box') {
    const ox = (a.w + b.w) / 2 - Math.abs(b.x - a.x), oy = (a.h + b.h) / 2 - Math.abs(b.y - a.y);
    if (ox <= 0 || oy <= 0) return null;
    return ox < oy ? { nx: Math.sign(b.x - a.x) || 1, ny: 0, depth: ox } : { nx: 0, ny: Math.sign(b.y - a.y) || 1, depth: oy };
  }
  // circle vs box
  const flip = a.kind === 'box', c = flip ? b : a, bx = flip ? a : b;
  const hw = bx.w / 2, hh = bx.h / 2, qx = Math.max(bx.x - hw, Math.min(c.x, bx.x + hw)), qy = Math.max(bx.y - hh, Math.min(c.y, bx.y + hh));
  let dx = qx - c.x, dy = qy - c.y, d2 = dx * dx + dy * dy, nx, ny, depth;
  if (d2 > 0) {
    if (d2 >= c.r * c.r) return null;
    const d = Math.sqrt(d2); nx = dx / d; ny = dy / d; depth = c.r - d;
  } else {   // centre inside the box: push out the shortest way
    const ex = hw - Math.abs(c.x - bx.x), ey = hh - Math.abs(c.y - bx.y);
    if (ex < ey) { nx = c.x < bx.x ? 1 : -1; ny = 0; depth = ex + c.r; } else { nx = 0; ny = c.y < bx.y ? 1 : -1; depth = ey + c.r; }
  }
  // normal from circle to box; flip so it always points from a to b
  return flip ? { nx: -nx, ny: -ny, depth } : { nx, ny, depth };
}

export class World {
  /**
   * gravity: downward pull (units/s²), or { x, y }. walls: [x, y, w, h] keeps everything inside
   * that rectangle (false: no walls; bodies that fall far out are removed). substeps: more is
   * steadier for tall stacks and fast balls (default 4). iterations: solver passes (default 6).
   */
  constructor({ gravity = 900, walls = null, substeps = 4, iterations = 10, sleep = true } = {}) {
    this.gx = typeof gravity === 'number' ? 0 : gravity.x || 0;
    this.gy = typeof gravity === 'number' ? gravity : gravity.y || 0;
    this.walls = walls; this.substeps = substeps; this.iterations = iterations; this.sleep = sleep;
    this.bodies = []; this.hits = []; this.wallBounce = .4; this.wallFriction = .4;
  }
  circle(x, y, r, o = {}) { return this.add(new Body('circle', x, y, { ...o, r })); }
  box(x, y, w, h, o = {}) { return this.add(new Body('box', x, y, { ...o, w, h })); }
  add(b) { this.bodies.push(b); return b; }
  remove(b) { b.dead = true; for (const o of this.bodies) { o.sleeping = false; o.still = 0; } }   // wake everyone: it may have held something up
  clear() { this.bodies = []; }
  /** fn(a, b, speed) when two bodies touch with some speed (b is null for a wall). Return value ignored. */
  onHit(fn) { this.hits.push(fn); return this; }
  /** The top-most body at a point (for picking things up), or null. */
  at(px, py, filter = () => true) { for (let i = this.bodies.length - 1; i >= 0; i--) { const b = this.bodies[i]; if (!b.dead && filter(b) && b.contains(px, py)) return b; } return null; }
  /** All bodies overlapping a circle. */
  near(px, py, r) { return this.bodies.filter(b => { if (b.dead) return false; const [l, t, rr, bb] = b.bounds, qx = Math.max(l, Math.min(px, rr)), qy = Math.max(t, Math.min(py, bb)); return (qx - px) ** 2 + (qy - py) ** 2 <= r * r; }); }
  /** Pushes every body near (x, y) outwards, strongest at the centre: explosions. */
  blast(x, y, radius, strength) {
    for (const b of this.near(x, y, radius)) {
      if (b.fixed) continue;
      const dx = b.x - x, dy = b.y - y, d = Math.hypot(dx, dy) || 1, k = strength * (1 - Math.min(1, d / radius));
      b.vx += dx / d * k; b.vy += dy / d * k; b.sleeping = false; b.still = 0;
    }
  }

  step(dt) {
    if (dt <= 0) return;
    this.bodies = this.bodies.filter(b => !b.dead);
    const n = this.substeps, h = Math.min(dt, 1 / 20) / n;
    const fired = new Map();
    for (let s = 0; s < n; s++) this.sub(h, fired);
    for (const [k, v] of fired) for (const fn of this.hits) fn(v.a, v.b, v.speed, k);
    // asleep once a body has barely moved for half a second: a settled stack costs almost nothing
    if (this.sleep) for (const b of this.bodies) {
      if (b.fixed) continue;
      if (b.vx * b.vx + b.vy * b.vy < 225) { b.still += dt; if (b.still > .5) { b.sleeping = true; b.vx = b.vy = 0; } } else { b.still = 0; b.sleeping = false; }
    }
  }

  sub(h, fired) {
    const B = this.bodies;
    for (const b of B) {
      if (b.fixed || b.sleeping) continue;
      b.vx += this.gx * b.gravity * h; b.vy += this.gy * b.gravity * h;
      if (b.drag) { const d = Math.exp(-b.drag * h); b.vx *= d; b.vy *= d; }
      b.x += b.vx * h; b.y += b.vy * h;
      if (b.kind === 'circle') b.angle += b.vx / Math.max(1, b.r) * h;
    }
    // broad phase: sort by left edge and sweep
    const order = B.map(b => [b.bounds, b]).sort((p, q) => p[0][0] - q[0][0]);
    const pairs = [];
    for (let i = 0; i < order.length; i++) {
      const [ba, a] = order[i];
      for (let j = i + 1; j < order.length; j++) {
        const [bb, b] = order[j];
        if (bb[0] > ba[2]) break;
        if (bb[1] > ba[3] || bb[3] < ba[1]) continue;
        if ((a.fixed || a.sleeping) && (b.fixed || b.sleeping)) continue;
        const c = collide(a, b);
        if (c) pairs.push([a, b, c]);
      }
    }
    for (let it = 0; it < this.iterations; it++) for (const [a, b, c] of pairs) this.solve(a, b, c, fired, it === 0);
    // then push overlapping bodies apart, a few passes so a tall stack doesn't squash
    for (let it = 0; it < 3; it++) for (const p of pairs) {
      const [a, b] = p; if (a.sensor || b.sensor) continue;
      const c = it ? collide(a, b) : p[2], inv = a.inv + b.inv; if (!c || !inv) continue;
      const corr = Math.max(0, c.depth - .02) * .7 / inv;
      a.x -= c.nx * corr * a.inv; a.y -= c.ny * corr * a.inv; b.x += c.nx * corr * b.inv; b.y += c.ny * corr * b.inv;
    }
    if (this.walls) this.wallsPass(fired);
    else for (const b of B) if (b.y > 1e5 || Math.abs(b.x) > 1e5) b.dead = true;
  }

  solve(a, b, c, fired, first) {
    if (a.sensor || b.sensor) { if (first) this.note(fired, a, b, 0); return; }
    const inv = a.inv + b.inv; if (!inv) return;
    if (a.sleeping && !b.fixed) a.sleeping = false; if (b.sleeping && !a.fixed) b.sleeping = false;
    const { nx, ny } = c;
    const rvx = b.vx - a.vx, rvy = b.vy - a.vy, vn = rvx * nx + rvy * ny;
    if (vn >= 0) return;
    if (first && -vn > 30) this.note(fired, a, b, -vn);
    const e = -vn > 60 ? Math.min(a.bounce, b.bounce) : 0;   // slow contacts don't bounce: things settle
    const j = -(1 + e) * vn / inv;
    a.vx -= j * nx * a.inv; a.vy -= j * ny * a.inv; b.vx += j * nx * b.inv; b.vy += j * ny * b.inv;
    // friction along the surface
    const tx = -ny, ty = nx, vt = (b.vx - a.vx) * tx + (b.vy - a.vy) * ty;
    const mu = Math.sqrt(a.friction * b.friction), jt = Math.max(-j * mu, Math.min(j * mu, -vt / inv));
    a.vx -= jt * tx * a.inv; a.vy -= jt * ty * a.inv; b.vx += jt * tx * b.inv; b.vy += jt * ty * b.inv;
  }

  wallsPass(fired) {
    const [L, T, Wd, Ht] = this.walls, R = L + Wd, Bm = T + Ht, e = this.wallBounce, f = 1 - this.wallFriction * .1;
    for (const b of this.bodies) {
      if (b.fixed || b.sleeping || b.sensor) continue;
      const hw = b.kind === 'circle' ? b.r : b.w / 2, hh = b.kind === 'circle' ? b.r : b.h / 2;
      const hit = sp => { if (sp > 30) this.note(fired, b, null, sp); };
      if (b.x - hw < L) { b.x = L + hw; if (b.vx < 0) { hit(-b.vx); b.vx = -b.vx * (-b.vx > 60 ? Math.min(e, b.bounce) : 0); b.vy *= f; } }
      if (b.x + hw > R) { b.x = R - hw; if (b.vx > 0) { hit(b.vx); b.vx = -b.vx * (b.vx > 60 ? Math.min(e, b.bounce) : 0); b.vy *= f; } }
      if (b.y - hh < T) { b.y = T + hh; if (b.vy < 0) { hit(-b.vy); b.vy = -b.vy * (-b.vy > 60 ? Math.min(e, b.bounce) : 0); b.vx *= f; } }
      if (b.y + hh > Bm) { b.y = Bm - hh; if (b.vy > 0) { hit(b.vy); b.vy = -b.vy * (b.vy > 60 ? Math.min(e, b.bounce) : 0); b.vx *= f; } }
    }
  }

  note(fired, a, b, speed) {
    const k = a.id ??= World.ids++, k2 = b ? (b.id ??= World.ids++) : 'wall', key = k < k2 ? k + ':' + k2 : k2 + ':' + k;
    const old = fired.get(key);
    if (!old || old.speed < speed) fired.set(key, { a, b, speed });
  }

  /** Draws every body as an outline: handy while building (the debug overlay calls this too). */
  debugDraw(c, color = '#00ff88') {
    c.save(); c.strokeStyle = color; c.lineWidth = 1;
    for (const b of this.bodies) {
      c.globalAlpha = b.sleeping ? .4 : 1;
      if (b.kind === 'circle') { c.beginPath(); c.arc(b.x, b.y, b.r, 0, Math.PI * 2); c.moveTo(b.x, b.y); c.lineTo(b.x + Math.cos(b.angle) * b.r, b.y + Math.sin(b.angle) * b.r); c.stroke(); }
      else c.strokeRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h);
    }
    if (this.walls) { c.globalAlpha = .5; c.strokeRect(...this.walls); }
    c.restore();
  }
}
World.ids = 1;

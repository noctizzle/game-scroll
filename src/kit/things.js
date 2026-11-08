// Game objects: a light list of the things in your game (players, enemies, bullets, coins) with
// tags, so "what did this bullet hit?" is one line. Your game still owns everything about them:
// what they are, how they move and how they look. Things are your own plain objects; the list only
// adds the bookkeeping. 2D games use x, y; 3D games pass { plane: 'xz' } and use x, z.
//
//   const { Things } = gs.things;
//   reset() { things = new Things(); things.add({ x: 180, y: 600, r: 14 }, 'player'); }
//   const b = things.add({ x, y, r: 3, vx: 0, vy: -400 }, 'bullet');     // returns your object
//   things.each('bullet', b => { b.y += b.vy * dt; if (b.y < -10) things.kill(b); });
//   things.hits('bullet', 'enemy', (b, e) => { things.kill(b); e.hp--; });  // every overlapping pair
//   const hit = things.hit(player, 'coin');                              // first coin touching the player
//   things.near(x, y, 80, 'enemy'); things.nearest(x, y, 'enemy');      // what's close by
//   things.update(dt);       // optional: calls each thing's own update(dt, things), then drops killed ones
//   draw(c) { for (const e of things.all('enemy')) drawEnemy(c, e); }    // you draw them, your way
//
// Shapes: r (circle), w + h (box centred on x, y) or nothing (a point). Tags are strings; a thing can
// have several ('enemy', 'flying'). things.reuse('spark', () => ({})) recycles killed objects so
// busy games make less garbage.

const shapeOf = t => t.w != null ? 'box' : t.r != null ? 'circle' : 'point';

export class Things {
  constructor({ plane = 'xy', cell = 0 } = {}) {
    this.list = []; this.byTag = new Map(); this.pool = new Map(); this.plane = plane; this.cell = cell;
    this.yk = plane === 'xz' ? 'z' : 'y';
  }
  /** Adds your object with one or more tags and returns it. */
  add(obj, ...tags) {
    obj.tags = new Set([...(obj.tags || []), ...tags.flat()]); obj.dead = false;
    this.list.push(obj);
    for (const t of obj.tags) this.bucket(t).push(obj);
    return obj;
  }
  bucket(tag) { let b = this.byTag.get(tag); if (!b) this.byTag.set(tag, b = []); return b; }
  /** A recycled killed object of this tag (or a fresh one from make()), added again with the tag. */
  reuse(tag, make = () => ({}), init) {
    const p = this.pool.get(tag), o = p?.pop() || make();
    for (const k of Object.keys(o)) if (k !== 'tags') delete o[k];
    if (init) Object.assign(o, init);
    return this.add(o, tag);
  }
  /** Marks it killed: it's skipped from now on and dropped at the end of update() (or sweep()). */
  kill(obj) { if (obj && !obj.dead) { obj.dead = true; this.dirty = true; } return obj; }
  /** Tag changes on the fly ('enemy' becomes 'frozen'). */
  tag(obj, tag) { if (!obj.tags.has(tag)) { obj.tags.add(tag); this.bucket(tag).push(obj); } return obj; }
  untag(obj, tag) { if (obj.tags.delete(tag)) { const b = this.byTag.get(tag); b.splice(b.indexOf(obj), 1); } return obj; }
  is(obj, tag) { return !!obj?.tags?.has(tag); }
  /** Live things with this tag (or every live thing). A copy, so you can kill while looping. */
  all(tag) { return (tag ? this.byTag.get(tag) || [] : this.list).filter(t => !t.dead); }
  count(tag) { let n = 0; for (const t of tag ? this.byTag.get(tag) || [] : this.list) if (!t.dead) n++; return n; }
  first(tag) { for (const t of this.byTag.get(tag) || []) if (!t.dead) return t; return null; }
  each(tag, fn) { for (const t of this.all(tag)) if (!t.dead) fn(t); }
  /** Do these two things overlap? (circles, boxes centred on x/y, points) */
  touch(a, b, pad = 0) {
    const yk = this.yk, dx = a.x - b.x, dy = a[yk] - b[yk], sa = shapeOf(a), sb = shapeOf(b);
    if (sa !== 'box' && sb !== 'box') { const r = (a.r || 0) + (b.r || 0) + pad; return dx * dx + dy * dy < r * r || (!r && !dx && !dy); }
    if (sa === 'box' && sb === 'box') return Math.abs(dx) * 2 < a.w + b.w + pad * 2 && Math.abs(dy) * 2 < (a.h ?? a.w) + (b.h ?? b.w) + pad * 2;
    const [bx, c] = sa === 'box' ? [a, b] : [b, a], hw = bx.w / 2, hh = (bx.h ?? bx.w) / 2;
    const nx = Math.max(bx.x - hw, Math.min(c.x, bx.x + hw)), ny = Math.max(bx[yk] - hh, Math.min(c[yk], bx[yk] + hh)), r = (c.r || 0) + pad;
    return (c.x - nx) ** 2 + (c[yk] - ny) ** 2 < r * r || (!r && nx === c.x && ny === c[yk]);
  }
  /** The first live thing with this tag touching obj (or null). */
  hit(obj, tag, pad = 0) { for (const t of this.byTag.get(tag) || []) if (!t.dead && t !== obj && this.touch(obj, t, pad)) return t; return null; }
  /** Every live thing with this tag touching obj. */
  hitsOf(obj, tag, pad = 0) { return (this.byTag.get(tag) || []).filter(t => !t.dead && t !== obj && this.touch(obj, t, pad)); }
  /**
   * Calls fn(a, b) for every overlapping pair of a tagA thing and a tagB thing. Killed things stop
   * being matched straight away, so a bullet that is killed on its first hit can't hit twice.
   */
  hits(tagA, tagB, fn, pad = 0) {
    const A = this.byTag.get(tagA) || [], B = this.byTag.get(tagB) || [];
    if (A.length * B.length > 400) return this.gridHits(A, B, fn, pad);
    for (const a of A) { if (a.dead) continue; for (const b of B) { if (a.dead) break; if (!b.dead && a !== b && this.touch(a, b, pad)) fn(a, b); } }
  }
  gridHits(A, B, fn, pad) {
    const yk = this.yk, size = t => t.r != null ? t.r * 2 : Math.max(t.w || 0, t.h || 0);
    let big = 1; for (const b of B) if (!b.dead) big = Math.max(big, size(b));
    const cell = this.cell || Math.max(16, big * 2), map = new Map(), key = (x, y) => x * 73856093 ^ y * 19349663;
    for (const b of B) {
      if (b.dead) continue; const r = size(b) / 2 + pad;
      for (let cx = Math.floor((b.x - r) / cell); cx <= Math.floor((b.x + r) / cell); cx++) for (let cy = Math.floor((b[yk] - r) / cell); cy <= Math.floor((b[yk] + r) / cell); cy++) {
        const k = key(cx, cy); let l = map.get(k); if (!l) map.set(k, l = []); l.push(b);
      }
    }
    for (const a of A) {
      if (a.dead) continue; const r = size(a) / 2 + pad, seen = new Set();
      for (let cx = Math.floor((a.x - r) / cell); cx <= Math.floor((a.x + r) / cell) && !a.dead; cx++) for (let cy = Math.floor((a[yk] - r) / cell); cy <= Math.floor((a[yk] + r) / cell) && !a.dead; cy++)
        for (const b of map.get(key(cx, cy)) || []) { if (a.dead) break; if (b.dead || b === a || seen.has(b)) continue; seen.add(b); if (this.touch(a, b, pad)) fn(a, b); }
    }
  }
  /** Live things with this tag within radius of (x, y), nearest first. */
  near(x, y, radius, tag) {
    const yk = this.yk, r2 = radius * radius, out = [];
    for (const t of tag ? this.byTag.get(tag) || [] : this.list) { if (t.dead) continue; const d = (t.x - x) ** 2 + (t[yk] - y) ** 2; if (d <= r2) out.push([d, t]); }
    return out.sort((a, b) => a[0] - b[0]).map(e => e[1]);
  }
  /** The nearest live thing with this tag (optionally only ones where ok(thing) is true), or null. */
  nearest(x, y, tag, ok) {
    const yk = this.yk; let best = null, bd = Infinity;
    for (const t of tag ? this.byTag.get(tag) || [] : this.list) { if (t.dead || (ok && !ok(t))) continue; const d = (t.x - x) ** 2 + (t[yk] - y) ** 2; if (d < bd) { bd = d; best = t; } }
    return best;
  }
  /** Kills things that leave the box (x0, y0)-(x1, y1), plus margin. */
  cull(x0, y0, x1, y1, margin = 0, tag) {
    const yk = this.yk;
    for (const t of tag ? this.byTag.get(tag) || [] : this.list) if (!t.dead && (t.x < x0 - margin || t.x > x1 + margin || t[yk] < y0 - margin || t[yk] > y1 + margin)) this.kill(t);
  }
  /** Calls each live thing's own update(dt, things), if it has one, then sweeps. */
  update(dt) { for (const t of this.list) if (!t.dead && typeof t.update === 'function') t.update(dt, this); this.sweep(); }
  /** Drops killed things (and keeps them for reuse()). */
  sweep() {
    if (!this.dirty) return; this.dirty = false;
    for (const t of this.list) if (t.dead) for (const tag of t.tags) { let p = this.pool.get(tag); if (!p) this.pool.set(tag, p = []); if (p.length < 256) p.push(t); break; }
    this.list = this.list.filter(t => !t.dead);
    for (const [k, b] of this.byTag) this.byTag.set(k, b.filter(t => !t.dead));
    for (const p of this.pool.values()) for (const t of p) t.tags = new Set();
  }
  clear() { this.list = []; this.byTag.clear(); this.dirty = false; }
}

/* ---------- parent and child: things that move with other things ---------- */
// A tank's turret turns with the tank, a rider sits on a horse, a planet's moon circles it while the
// planet circles the sun. Each Node has x, y, angle and scale relative to its parent; the root's
// are in game units. Call root.update() once a frame (after moving things) and read each node's
// place in the game: wx, wy, wangle, wscale.
//   const tank = new Node({ x: 180, y: 500 }), turret = tank.add(new Node({ y: -6 })), gun = turret.add(new Node({ x: 18 }));
//   update(dt) { tank.angle += steer * dt; turret.angle = aimAngle - tank.angle; tank.update(); shoot from gun.wx, gun.wy }
//   draw(c) { tank.draw(c, (c, n) => { ...draw n in its own space, e.g. c.fillRect(-8, -8, 16, 16)... }); }
// node.toWorld(x, y) and node.toLocal(x, y) convert points; node.hit(x, y) tests a tap against its
// r (circle) or w and h (box centred on it), rotated with it. Nodes are plain objects too, so you can
// give them any other fields, and add them to Things (tags, hits) using wx and wy where you need
// their place in the world.
export class Node {
  constructor({ x = 0, y = 0, angle = 0, scale = 1, ...rest } = {}) {
    Object.assign(this, rest); this.x = x; this.y = y; this.angle = angle; this.scale = scale;
    this.parent = null; this.children = []; this.visible = rest.visible ?? true;
    this.wx = x; this.wy = y; this.wangle = angle; this.wscale = scale;
    this.m = [1, 0, 0, 1, x, y];
  }
  /** Adds a child (taking it from any old parent) and returns it. */
  add(child) { child.parent?.remove(child); child.parent = this; this.children.push(child); child.update(); return child; }
  remove(child) { const i = this.children.indexOf(child); if (i >= 0) this.children.splice(i, 1); child.parent = null; return child; }
  /** Moves the node to a new parent, keeping where it is on screen (a rider jumping off the horse: attach(null)). */
  attach(parent) {
    this.update();
    const { wx, wy, wangle, wscale } = this;
    if (this.parent) this.parent.remove(this);
    if (parent) {
      parent.update(); const p = parent.toLocal(wx, wy);
      this.x = p.x; this.y = p.y; this.angle = wangle - parent.wangle; this.scale = wscale / parent.wscale; parent.add(this);
    } else { this.x = wx; this.y = wy; this.angle = wangle; this.scale = wscale; this.update(); }
    return this;
  }
  /** Works out wx, wy, wangle, wscale for this node and everything under it. */
  update() {
    const c = Math.cos(this.angle) * this.scale, s = Math.sin(this.angle) * this.scale, p = this.parent;
    if (p) {
      const [a, b, cc, d, e, f] = p.m;
      this.m = [a * c + cc * s, b * c + d * s, a * -s + cc * c, b * -s + d * c, a * this.x + cc * this.y + e, b * this.x + d * this.y + f];
      this.wangle = p.wangle + this.angle; this.wscale = p.wscale * this.scale;
    } else { this.m = [c, s, -s, c, this.x, this.y]; this.wangle = this.angle; this.wscale = this.scale; }
    this.wx = this.m[4]; this.wy = this.m[5];
    for (const k of this.children) k.update();
    return this;
  }
  /** A point in this node's own space, in game units. */
  toWorld(x, y) { const [a, b, c, d, e, f] = this.m; return { x: a * x + c * y + e, y: b * x + d * y + f }; }
  /** A point in game units, in this node's own space. */
  toLocal(x, y) {
    const [a, b, c, d, e, f] = this.m, det = a * d - b * c || 1e-9, px = x - e, py = y - f;
    return { x: (d * px - c * py) / det, y: (-b * px + a * py) / det };
  }
  /** Does a point in game units touch this node (r, or w and h, in its own units)? */
  hit(x, y) {
    const p = this.toLocal(x, y);
    if (this.r != null) return p.x * p.x + p.y * p.y <= this.r * this.r;
    if (this.w != null) return Math.abs(p.x) <= this.w / 2 && Math.abs(p.y) <= (this.h ?? this.w) / 2;
    return false;
  }
  /** Every node from here down (this one first). */
  each(fn) { fn(this); for (const k of this.children) k.each(fn); return this; }
  /** The top-most node under a point (children drawn later count as on top), or null. */
  pick(x, y) { for (let i = this.children.length - 1; i >= 0; i--) { const n = this.children[i].visible && this.children[i].pick(x, y); if (n) return n; } return this.hit(x, y) ? this : null; }
  /** Draws this node and its children (children on top, in the order added), each in its own space, under whatever transform the canvas already has (a camera). */
  draw(c, fn) {
    const t = c.getTransform?.(), B = t ? [t.a, t.b, t.c, t.d, t.e, t.f] : [1, 0, 0, 1, 0, 0];
    return this.drawUnder(c, fn, B);
  }
  drawUnder(c, fn, B) {
    if (!this.visible) return this;
    const [a, b, cc, d, e, f] = B, m = this.m;
    c.save();
    c.setTransform(a * m[0] + cc * m[1], b * m[0] + d * m[1], a * m[2] + cc * m[3], b * m[2] + d * m[3], a * m[4] + cc * m[5] + e, b * m[4] + d * m[5] + f);
    fn(c, this); c.restore();
    for (const k of this.children) k.drawUnder(c, fn, B);
    return this;
  }
}

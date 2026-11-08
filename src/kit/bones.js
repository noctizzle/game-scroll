// 2D bone characters: cut-out figures made of parts that hang off each other (a body, a head on the
// body, an upper arm on the shoulder, a forearm on the elbow), so you pose angles instead of
// drawing every frame. Poses blend, clips play keyframes, two-bone reach (IK) puts a hand on a
// target or a foot on the ground, and parts can wobble on a spring. You draw each part your way:
// the rig only works out where it is.
//
//   const { Rig } = gs.bones;
//   const hero = new Rig()
//     .bone('body', { len: 30, angle: -Math.PI / 2 })                  // the root: points up
//     .bone('head', { parent: 'body', len: 14 })                       // at the body's end
//     .bone('armL', { parent: 'body', at: .85, len: 14, angle: 2.4 })  // .85 of the way up the body
//     .bone('handL', { parent: 'armL', len: 12, angle: -.6 })
//     .clip('wave', { len: .8, loop: true, keys: { armL: [[0, 2.4], [.4, 3.2], [.8, 2.4]] } });
//   hero.play('wave');                                   // or hero.pose({ armL: 3 }), hero.blend(a, b, .5)
//   update(dt) { hero.x = px; hero.y = py; hero.update(dt); hero.reach('armL', 'handL', tx, ty); }
//   draw(c) { hero.draw(c, (c, b) => { c.fillRect(0, -3, b.len, 6); }); }   // drawn along +x, from the joint
//
// Angles are radians relative to the parent (0 = straight on from it). Read any bone's place with
// rig.world('handL') -> { x, y, angle, ex, ey (its end) }. flip = true mirrors the whole figure.

const TAU = Math.PI * 2;
const wrapA = a => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };

export class Rig {
  constructor({ x = 0, y = 0, scale = 1, flip = false } = {}) {
    Object.assign(this, { x, y, scale, flip });
    this.bones = new Map(); this.order = []; this.clips = {}; this.playing = null; this.t = 0; this.fade = null;
  }
  /**
   * Adds a bone. parent: the bone it hangs off (none: the root, at the rig's x, y); at: where along
   * the parent it joins (0..1, default 1: the end); len; angle (rest angle); z: drawing order (higher is
   * on top); wobble: { stiff, damp } to make it lag and swing on a spring; min / max: limits on its angle.
   */
  bone(name, { parent = null, at = 1, len = 10, angle = 0, z = this.order.length, wobble = null, min = -Infinity, max = Infinity, ...data } = {}) {
    const b = { name, parent, at, len, rest: angle, angle, z, min, max, data, wob: wobble ? { stiff: wobble.stiff ?? 120, damp: wobble.damp ?? 10, off: 0, v: 0, last: null } : null, w: { x: 0, y: 0, angle: 0, ex: 0, ey: 0 } };
    this.bones.set(name, b); this.order.push(b); this.sort();
    return this;
  }
  sort() {
    // parents before children for working out places; z for drawing
    const done = new Set(), list = [];
    const visit = b => { if (done.has(b)) return; if (b.parent && this.bones.get(b.parent)) visit(this.bones.get(b.parent)); done.add(b); list.push(b); };
    for (const b of this.order) visit(b);
    this.chain = list; this.drawList = [...this.order].sort((a, b) => a.z - b.z);
  }
  get(name) { return this.bones.get(name); }
  /** Sets angles: rig.pose({ armL: 3, head: .2 }) (missing bones keep theirs). rest: true sets them back to rest first. */
  pose(angles, { rest = false } = {}) {
    if (rest) for (const b of this.order) b.angle = b.rest;
    for (const [k, v] of Object.entries(angles || {})) { const b = this.bones.get(k); if (b) b.angle = v; }
    return this;
  }
  /** The current angles as a pose you can keep and blend back to later. */
  snapshot() { const o = {}; for (const b of this.order) o[b.name] = b.angle; return o; }
  /** Sets each bone to a blend of two poses (t 0..1), turning the short way round. */
  blend(a, b, t) {
    for (const bone of this.order) {
      const x = a[bone.name] ?? bone.angle, y = b[bone.name] ?? bone.angle;
      bone.angle = x + wrapA(y - x) * t;
    }
    return this;
  }
  /**
   * A clip of keyframes: { len (seconds), loop, keys: { bone: [[time, angle], ...] }, ease (fn t => t),
   * events: [[time, 'step'], ...] } (on('step', fn) hears them).
   */
  clip(name, c) { this.clips[name] = { loop: true, ease: null, events: [], ...c }; return this; }
  /** Plays a clip, blending in over `fade` seconds from wherever the bones are. */
  play(name, { fade = .15, speed = 1, from = 0 } = {}) {
    if (!this.clips[name]) return this;
    if (this.playing === name && !this.ended) return this;
    this.fade = fade > 0 ? { from: this.snapshot(), t: 0, len: fade } : null;
    this.playing = name; this.t = from; this.speed = speed; this.ended = false;
    return this;
  }
  stop() { this.playing = null; return this; }
  on(ev, fn) { (this.handlers ||= {})[ev] = fn; return this; }
  /** The angle a clip gives a bone at time t. */
  sample(c, keys, t) {
    if (!keys.length) return null;
    if (t <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) if (t <= keys[i][0]) {
      const [t0, a0] = keys[i - 1], [t1, a1] = keys[i], f = t1 > t0 ? (t - t0) / (t1 - t0) : 1, e = c.ease ? c.ease(f) : f;
      return a0 + wrapA(a1 - a0) * e;
    }
    return keys[keys.length - 1][1];
  }
  update(dt) {
    const c = this.playing && this.clips[this.playing];
    if (c) {
      const before = this.t; this.t += dt * (this.speed ?? 1);
      for (const [at, ev] of c.events) if (at > before && at <= this.t) this.handlers?.[ev]?.(this);
      if (this.t >= c.len) {
        if (c.loop) { this.t %= c.len || 1; for (const [at, ev] of c.events) if (at <= this.t) this.handlers?.[ev]?.(this); }
        else { this.t = c.len; if (!this.ended) { this.ended = true; this.handlers?.end?.(this, this.playing); } }
      }
      const target = {};
      for (const [k, keys] of Object.entries(c.keys)) { const v = this.sample(c, keys, this.t); if (v != null) target[k] = v; }
      if (this.fade) { this.fade.t += dt; const f = Math.min(1, this.fade.t / this.fade.len); this.blend(this.fade.from, { ...this.fade.from, ...target }, f); if (f >= 1) this.fade = null; }
      else this.pose(target);
    }
    for (const b of this.order) b.angle = Math.max(b.min, Math.min(b.max, b.angle));
    this.solve(dt);
    return this;
  }
  /** Works out every bone's place in game units (update() does this; call it after changing angles yourself). */
  solve(dt = 0) {
    const s = this.scale, fx = this.flip ? -1 : 1;
    for (const b of this.chain) {
      const p = b.parent && this.bones.get(b.parent);
      let x, y, base;
      if (p) { x = p.w.x + (p.w.ex - p.w.x) * b.at; y = p.w.y + (p.w.ey - p.w.y) * b.at; base = p.w.angle; }
      else { x = this.x; y = this.y; base = this.flip ? Math.PI : 0; }
      let a = base + b.angle * fx;
      if (b.wob && dt > 0) {
        // the bone trails its parent's turn and swings back on a spring
        const W = b.wob; if (W.last != null) W.off -= wrapA(base - W.last);
        W.v += (-W.stiff * W.off - W.damp * W.v) * dt; W.off += W.v * dt; W.off = Math.max(-1.5, Math.min(1.5, W.off)); W.last = base;
        a += W.off;
      } else if (b.wob) a += b.wob.off;
      const L = b.len * s;
      b.w.x = x; b.w.y = y; b.w.angle = a; b.w.ex = x + Math.cos(a) * L; b.w.ey = y + Math.sin(a) * L;
    }
    return this;
  }
  /** A bone's place: { x, y (its joint), angle, ex, ey (its end) }. */
  world(name) { return this.bones.get(name)?.w || null; }
  /** Kick a wobbly bone (a hit, a landing): it swings by `amount` radians and settles. */
  kick(name, amount = .5) { const b = this.bones.get(name); if (b?.wob) b.wob.v += amount * b.wob.stiff * .1; return this; }
  /**
   * Two-bone reach: bends upper and lower (e.g. 'armL', 'handL') so the lower bone's end touches
   * (tx, ty), or points that way if it's too far. bend: 1 or -1, which way the elbow or knee goes.
   * Call after update() each frame. weight 0..1 blends from the animated pose.
   */
  reach(upper, lower, tx, ty, { bend = 1, weight = 1 } = {}) {
    const A = this.bones.get(upper), B = this.bones.get(lower); if (!A || !B) return false;
    this.solve();
    const fx = this.flip ? -1 : 1, s = this.scale, l1 = A.len * s, l2 = B.len * s, ox = A.w.x, oy = A.w.y;
    const dx = tx - ox, dy = ty - oy, d = Math.max(1e-6, Math.min(l1 + l2 - 1e-4, Math.hypot(dx, dy)));
    const cosB = Math.max(-1, Math.min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d)));
    const cosK = Math.max(-1, Math.min(1, (l1 * l1 + l2 * l2 - d * d) / (2 * l1 * l2)));
    const k = bend * fx, aUp = Math.atan2(dy, dx) - Math.acos(cosB) * k, aLow = (Math.PI - Math.acos(cosK)) * k;
    const pBase = A.parent ? this.bones.get(A.parent).w.angle : (this.flip ? Math.PI : 0);
    const upRel = wrapA(aUp - pBase) * fx, lowRel = aLow * fx;
    A.angle += wrapA(upRel - A.angle) * weight; B.angle += wrapA(lowRel - B.angle) * weight;
    A.angle = Math.max(A.min, Math.min(A.max, A.angle)); B.angle = Math.max(B.min, Math.min(B.max, B.angle));
    this.solve();
    return Math.hypot(dx, dy) <= l1 + l2;
  }
  /** Turns a bone to point at (tx, ty) (heads, eyes, gun arms). weight 0..1. */
  look(name, tx, ty, weight = 1) {
    const b = this.bones.get(name); if (!b) return this;
    this.solve();
    const fx = this.flip ? -1 : 1, pBase = b.parent ? this.bones.get(b.parent).w.angle : (this.flip ? Math.PI : 0);
    const want = wrapA(Math.atan2(ty - b.w.y, tx - b.w.x) - pBase) * fx;
    b.angle += wrapA(want - b.angle) * weight; b.angle = Math.max(b.min, Math.min(b.max, b.angle));
    return this.solve();
  }
  /**
   * Draws each bone in z order: fn(c, bone, w) with the canvas moved to the bone's joint and turned
   * along it, scaled by the rig's scale (so draw along +x from 0 to bone.len). bone.data holds any
   * extra fields you gave bone(). Mirrored figures are flipped for you.
   */
  draw(c, fn) {
    for (const b of this.drawList) {
      c.save(); c.translate(b.w.x, b.w.y); c.rotate(b.w.angle); c.scale(this.scale, this.flip ? -this.scale : this.scale);
      fn(c, b, b.w); c.restore();
    }
    return this;
  }
}

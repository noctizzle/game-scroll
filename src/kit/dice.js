// Dice: roll('3d6+2'), keep highest or lowest, exploding dice; Dice for 2D rolls that tumble then
// settle; and Dice3D for real dice thrown with gs.physics3d, read by which face ends up on top.
// Your game draws the dice. No real-money gambling.
//
//   const { roll, Dice, Dice3D, FACES } = gs.dice;
//   roll('2d6').total;  roll('4d6kh3').kept;  roll('d20+5', rng)
//   dice = new Dice(2, { sides: 6 }); on tap: dice.throw(); update: dice.update(dt); draw dice.shown; dice.on('settle', r => ...)
//   cubes = new Dice3D(world, [mesh1, mesh2], { size: .6 }); cubes.throw({ x: 0, y: 2, z: 2 }); after: cubes.settled && cubes.values
//   FACES[n] is the local direction of face n on a d6 (1 up, 6 down, 2 and 5, 3 and 4 opposite): draw pips to match.

const rng = seed => { if (seed == null) return Math.random; if (typeof seed === 'function') return seed; let s = seed | 0; return () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };

/**
 * Rolls dice written the usual way: '2d6', 'd20+3', '3d8-1', '4d6kh3' (keep highest 3), '2d20kl1'
 * (keep lowest), '3d6!' (a top roll rolls again and adds), '2d6+1d4'. random: a function or a seed.
 * Returns { total, rolls: [[...each group]], kept, text }.
 */
export function roll(text, random = null) {
  const R = rng(random), rolls = [], kept = []; let total = 0;
  const parts = String(text).replace(/\s+/g, '').match(/[+-]?[^+-]+/g) || [];
  for (const part of parts) {
    const sign = part[0] === '-' ? -1 : 1, body = part.replace(/^[+-]/, ''), m = /^(\d*)d(\d+|%)(!?)(?:k([hl])(\d+))?$/i.exec(body);
    if (!m) { const n = parseInt(body, 10); if (!isNaN(n)) total += sign * n; continue; }
    const count = Math.min(100, +(m[1] || 1)), sides = m[2] === '%' ? 100 : +m[2], explode = !!m[3], group = [];
    for (let i = 0; i < count; i++) { let v = 1 + ((R() * sides) | 0), sum = v; for (let k = 0; explode && v === sides && sides > 1 && k < 10; k++) { v = 1 + ((R() * sides) | 0); sum += v; } group.push(sum); }
    let keep = group.slice();
    if (m[4]) { const n = Math.min(group.length, +m[5]); keep = group.slice().sort((a, b) => (m[4].toLowerCase() === 'h' ? b - a : a - b)).slice(0, n); }
    rolls.push(group); kept.push(keep); total += sign * keep.reduce((a, b) => a + b, 0);
  }
  return { total, rolls, kept, text: String(text) };
}
/** Every total `count` dice of `sides` can make and how likely each is: { total: chance }. */
export function odds(count, sides) {
  let dist = new Map([[0, 1]]);
  for (let i = 0; i < count; i++) { const next = new Map(); for (const [t, p] of dist) for (let f = 1; f <= sides; f++) next.set(t + f, (next.get(t + f) || 0) + p / sides); dist = next; }
  return Object.fromEntries([...dist].sort((a, b) => a[0] - b[0]));
}

/** Dice that tumble for a moment, then land (2D games). shown: the faces to draw now; values: the result once settled. */
export class Dice {
  constructor(count = 1, { sides = 6, time = .8, seed = null } = {}) {
    this.R = rng(seed); this.count = count; this.sides = sides; this.time = time; this.handlers = {};
    this.values = Array.from({ length: count }, () => 1); this.shown = this.values.slice(); this.rolling = 0; this.held = new Array(count).fill(false); this.flick = 0;
  }
  on(ev, fn) { (this.handlers[ev] ||= []).push(fn); return this; }
  /** Throws every die not held. Returns the values it will land on (decided now). */
  throw() { this.values = this.values.map((v, i) => (this.held[i] ? v : 1 + ((this.R() * this.sides) | 0))); this.rolling = this.time; return this.values; }
  /** Keeps a die back from the next throw (dice-poker style). */
  hold(i, on = !this.held[i]) { this.held[i] = on; return this; }
  get settled() { return this.rolling <= 0; }
  get total() { return this.values.reduce((a, b) => a + b, 0); }
  /** 0..1 how far into the tumble (for wobble and bounce). */
  get tumble() { return this.rolling > 0 ? 1 - this.rolling / this.time : 1; }
  update(dt) {
    if (this.rolling <= 0) return this;
    this.rolling -= dt; this.flick -= dt;
    if (this.flick <= 0) { this.flick = .05 + (1 - this.rolling / this.time) * .12; this.shown = this.shown.map((v, i) => (this.held[i] ? this.values[i] : 1 + ((this.R() * this.sides) | 0))); }
    if (this.rolling <= 0) { this.shown = this.values.slice(); for (const f of this.handlers.settle || []) f(this.values.slice(), this.total); }
    return this;
  }
}

/** Local directions of a d6's faces: FACES[1] is up (+y) ... opposite faces add to 7. */
export const FACES = { 1: { x: 0, y: 1, z: 0 }, 6: { x: 0, y: -1, z: 0 }, 2: { x: 0, y: 0, z: 1 }, 5: { x: 0, y: 0, z: -1 }, 3: { x: 1, y: 0, z: 0 }, 4: { x: -1, y: 0, z: 0 } };
const rotv = (v, q) => {
  const ix = q.w * v.x + q.y * v.z - q.z * v.y, iy = q.w * v.y + q.z * v.x - q.x * v.z, iz = q.w * v.z + q.x * v.y - q.y * v.x, iw = -q.x * v.x - q.y * v.y - q.z * v.z;
  return { x: ix * q.w + iw * -q.x + iy * -q.z - iz * -q.y, y: iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z, z: iz * q.w + iw * -q.z + ix * -q.y - iy * -q.x };
};
/** Which d6 face points up for a rotation (quaternion). */
export function faceUp(q) { let best = 1, by = -2; for (const [n, d] of Object.entries(FACES)) { const y = rotv(d, q).y; if (y > by) { by = y; best = +n; } } return best; }

/**
 * Real 3D dice in a gs.physics3d World3D: one cube body per mesh (or per count). throw(at, push)
 * tosses them with a random spin; settled once they stop; values reads the top faces.
 */
export class Dice3D {
  constructor(world, meshes = 2, { size = .6, bounce = .35, friction = .6, density = 2, seed = null } = {}) {
    this.R = rng(seed); this.world = world; this.size = size; this.handlers = {};
    const list = typeof meshes === 'number' ? Array.from({ length: meshes }, () => null) : meshes;
    this.bodies = list.map((m, i) => world.box(m, size, size, size, { bounce, friction, density, at: { x: i * size * 1.5, y: size, z: 0 }, tag: 'die', spinDrag: .3 }));
    this.still = 0; this.thrown = false; this.done = true;
  }
  on(ev, fn) { (this.handlers[ev] ||= []).push(fn); return this; }
  /** Tosses them from `at` with speed `push` ({ x, y, z } m/s) and a random tumble. */
  throw(at = { x: 0, y: 2, z: 0 }, push = { x: 0, y: 2, z: -3 }) {
    const R = this.R;
    this.bodies.forEach((b, i) => {
      const a = R() * Math.PI * 2, ax = R() - .5, ay = R() - .5, az = R() - .5, l = Math.hypot(ax, ay, az) || 1, s = Math.sin(a / 2);
      b.place({ x: at.x + (i - (this.bodies.length - 1) / 2) * this.size * 1.4, y: at.y, z: at.z }, { x: ax / l * s, y: ay / l * s, z: az / l * s, w: Math.cos(a / 2) });
      b.setVel(push.x + (R() - .5), push.y, push.z + (R() - .5)).setSpin((R() - .5) * 20, (R() - .5) * 20, (R() - .5) * 20);
    });
    this.still = 0; this.thrown = true; this.done = false; return this;
  }
  /** Call each frame after world.step(dt); fires 'settle' with the values once they all stop. */
  update(dt) {
    if (!this.thrown || this.done) return this;
    const moving = this.bodies.some(b => b.speed > .05 || Math.hypot(b.spin.x, b.spin.y, b.spin.z) > .1);
    this.still = moving ? 0 : this.still + dt;
    if (this.still > .25) { this.done = true; const v = this.values; for (const f of this.handlers.settle || []) f(v, v.reduce((a, b) => a + b, 0)); }
    return this;
  }
  get settled() { return this.done; }
  get values() { return this.bodies.map(b => faceUp(b.body.rotation())); }
  get total() { return this.values.reduce((a, b) => a + b, 0); }
  remove() { for (const b of this.bodies) b.remove(); }
}

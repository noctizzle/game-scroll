// Fighting games: an input reader that remembers the last moments (so a special move's motion and a
// press a moment early both count), and moves made of frames (start-up, active, recovery) with hit
// boxes, hurt boxes, cancels, hit stun, block stun and hit stop. Frames are 60ths of a second; the kit
// steps them with dt. Your game draws the fighters and decides damage and the rules.
//
//   const { Reader, Fighter, clash } = gs.fight;
//   const MOVES = {
//     jab:   { start: 3, active: 2, recover: 6, hit: [[20, -50, 30, 14]], damage: 4, stun: 12, cancel: ['jab', 'fireball'] },
//     sweep: { start: 6, active: 3, recover: 14, hit: [[18, -10, 40, 12]], damage: 7, stun: 18, low: true },
//     fireball: { start: 10, active: 1, recover: 20, input: '236P', damage: 8, spawn: 'fireball' },
//   };
//   reset() { p1 = new Fighter(MOVES, { x: 100, facing: 1, hurt: [[-12, -80, 24, 80]] }); read = new Reader(); }
//   update(dt) {
//     read.feed(stick.x, -stick.y, { P: punch.down, K: kick.down }, dt, p1.facing);   // numpad directions: 6 is forward
//     const m = read.special(MOVES) || (read.take('P') && 'jab'); if (m) p1.start(m);
//     p1.update(dt); p2.update(dt);
//     const hit = clash(p1, p2); if (hit) { p2.hp -= hit.blocked ? 0 : hit.move.damage; feel.hit(hit.x, hit.y); }
//   }
//
// Directions are numpad numbers seen from the fighter's side: 1 2 3 down-back, down, down-forward;
// 4 5 6 back, neutral, forward; 7 8 9 up-back, up, up-forward. '236P' is a quarter circle forward and P.

const FRAME = 1 / 60;
const dirOf = (x, y, dead) => { const h = x > dead ? 1 : x < -dead ? -1 : 0, v = y > dead ? 1 : y < -dead ? -1 : 0; return 5 + h + v * 3; };   // y up

/** Reads a stick and buttons into numpad directions and presses, and keeps the last moments of both. */
export class Reader {
  /** window: seconds a motion may take; buffer: seconds a press is kept for (pressed early still counts); dead: stick dead zone. */
  constructor({ window = .4, buffer = .15, dead = .35 } = {}) {
    Object.assign(this, { window, buffer, dead }); this.t = 0; this.dirs = [{ d: 5, t: 0 }]; this.presses = []; this.held = {};
  }
  /** Each frame: stick x, y (-1..1, y up), buttons { name: down }, dt, facing (1: right, -1: left: forward follows it). */
  feed(x, y, buttons = {}, dt = FRAME, facing = 1) {
    this.t += dt;
    const d = dirOf(x * facing, y, this.dead);
    if (d !== this.dirs[this.dirs.length - 1].d) { this.dirs.push({ d, t: this.t }); if (this.dirs.length > 32) this.dirs.shift(); }
    for (const [b, down] of Object.entries(buttons)) { if (down && !this.held[b]) this.presses.push({ b, t: this.t }); this.held[b] = !!down; }
    this.presses = this.presses.filter(p => this.t - p.t <= this.buffer);
    return this;
  }
  /** The direction now (numpad). */
  get dir() { return this.dirs[this.dirs.length - 1].d; }
  /** Whether a button was pressed in the last `buffer` seconds (and takes it, so it counts once). */
  take(b) { const i = this.presses.findIndex(p => p.b === b); if (i < 0) return false; this.presses.splice(i, 1); return true; }
  /** Whether a button is held. */
  holding(b) { return !!this.held[b]; }
  /**
   * Whether a motion was done in the last `window` seconds, then a button: '236P' (quarter circle forward),
   * '623P' (forward, down, down-forward), '41236K', '66' (dash: forward twice), '22' ... The motion's
   * directions must come in order (others between are fine, as on a pad); the button must be pressed
   * in the buffer. Takes the press when it matches.
   */
  did(cmd) {
    const m = /^([1-9]*)([A-Z]*)$/.exec(cmd); if (!m) return false;
    const seq = m[1].split('').map(Number), btn = m[2];
    let pi = -1; if (btn) { pi = this.presses.findIndex(p => p.b === btn); if (pi < 0) return false; }
    const end = btn ? this.presses[pi].t : this.t, from = end - this.window;
    // walk back through the directions, matching the motion from its last step
    let k = seq.length - 1;
    for (let i = this.dirs.length - 1; i >= 0 && k >= 0; i--) {
      const e = this.dirs[i], next = this.dirs[i + 1];
      if (e.t > end + 1e-9) continue;
      if (next && next.t < from) break;
      if (e.d === seq[k]) k--;   // (others between are skipped: '66' is forward, neutral, forward)
    }
    if (k >= 0) return false;
    if (btn) this.presses.splice(pi, 1);
    return true;
  }
  /** The first move in a move list whose input was done (longest motions first), or null. */
  special(moves) {
    const list = Object.entries(moves).filter(([, m]) => m.input).sort((a, b) => b[1].input.length - a[1].input.length);
    for (const [name, m] of list) if (this.did(m.input)) return name;
    return null;
  }
  clear() { this.dirs = [{ d: this.dir, t: this.t }]; this.presses = []; }
}

/** A fighter's moves, frames and boxes. Boxes are [x, y, w, h] from the fighter's feet, facing right (flipped for facing -1). */
export class Fighter {
  constructor(moves, { x = 0, y = 0, facing = 1, hurt = [[-12, -80, 24, 80]], hp = 100 } = {}) {
    Object.assign(this, { moves, x, y, facing, hurtBoxes: hurt, hp, maxHp: hp });
    this.move = null; this.frame = 0; this.acc = 0; this.stun = 0; this.stop = 0; this.blocking = false; this.hitThis = new Set(); this.handlers = {};
  }
  on(ev, fn) { (this.handlers[ev] ||= []).push(fn); return this; }
  emit(ev, ...a) { for (const f of this.handlers[ev] || []) f(...a); }
  /** 'start' | 'active' | 'recover' | 'stun' | 'idle' */
  get phase() {
    if (this.stun > 0) return 'stun'; const m = this.moves[this.move]; if (!m) return 'idle';
    return this.frame < m.start ? 'start' : this.frame < m.start + m.active ? 'active' : 'recover';
  }
  get busy() { return this.phase !== 'idle'; }
  /** Whether the move now may be cancelled into `name` (its cancel list, once it has hit; or always on its own cancelAny). */
  canCancel(name) { const m = this.moves[this.move]; return !!m && (m.cancel || []).includes(name) && (this.hitThis.size > 0 || m.cancelAny) && this.phase !== 'start'; }
  /** Starts a move if free (or it cancels the current one). Returns whether it started. */
  start(name) {
    if (!this.moves[name] || this.stun > 0) return false;
    if (this.busy && !this.canCancel(name)) return false;
    this.move = name; this.frame = 0; this.acc = 0; this.hitThis.clear(); this.emit('start', name);
    return true;
  }
  /** Steps frames (not during hit stop). */
  update(dt) {
    if (this.stop > 0) { this.stop -= dt; return this; }
    this.acc += dt;
    while (this.acc >= FRAME) {
      this.acc -= FRAME;
      if (this.stun > 0) { this.stun--; continue; }
      const m = this.moves[this.move]; if (!m) continue;
      const was = this.phase; this.frame++;
      if (was === 'start' && this.phase === 'active') this.emit('active', this.move, m);
      if (this.frame >= m.start + m.active + m.recover) { this.emit('end', this.move); this.move = null; this.frame = 0; }
    }
    return this;
  }
  box(b) { const [bx, by, w, h] = b; return { x: this.facing > 0 ? this.x + bx : this.x - bx - w, y: this.y + by, w, h }; }
  /** The hit boxes now (world rects), during a move's active frames (hit: [[...]] for all, or by active frame: [[[...]], [[...]]]). */
  hitboxes() {
    const m = this.moves[this.move]; if (this.phase !== 'active' || !m.hit) return [];
    const af = this.frame - m.start, set = Array.isArray(m.hit[0]?.[0]) ? m.hit[Math.min(af, m.hit.length - 1)] : m.hit;
    return set.map(b => this.box(b));
  }
  /** The hurt boxes now (a move's own `hurt` replaces them while it runs). */
  hurtboxes() { const m = this.moves[this.move]; return (m?.hurt || this.hurtBoxes).map(b => this.box(b)); }
}

const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/**
 * Whether a's move hits b now (each move hits a fighter once). On a hit: b gets hit stun (move.stun
 * frames) or, while b.blocking and the move isn't `low` (or b blocks low: b.blockLow), block stun
 * (move.blockStun, half by default); both get hit stop (move.stop frames, 6). Returns { move, blocked, x, y } or null.
 */
export function clash(a, b) {
  const hb = a.hitboxes(); if (!hb.length || a.hitThis.has(b)) return null;
  const hurt = b.hurtboxes();
  for (const h of hb) for (const u of hurt) {
    if (!overlap(h, u)) continue;
    const m = a.moves[a.move]; a.hitThis.add(b);
    const blocked = !!b.blocking && !b.busy && (!m.low || !!b.blockLow) && (!m.high || !b.blockLow);
    b.stun = blocked ? (m.blockStun ?? Math.round((m.stun ?? 12) / 2)) : (m.stun ?? 12);
    if (!blocked) { b.move = null; b.frame = 0; }
    a.stop = b.stop = (m.stop ?? 6) * FRAME;
    const x = (Math.max(h.x, u.x) + Math.min(h.x + h.w, u.x + u.w)) / 2, y = (Math.max(h.y, u.y) + Math.min(h.y + h.h, u.y + u.h)) / 2;
    const res = { move: m, name: a.move, blocked, x, y };
    a.emit(blocked ? 'blocked' : 'hit', res, b); b.emit(blocked ? 'block' : 'hurt', res, a);
    return res;
  }
  return null;
}

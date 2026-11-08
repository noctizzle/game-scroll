// Motion moves: the phone's motion sensors turned into moves a player makes with the whole phone.
//
//   const { Moves } = gs.moves;
//   reset() { moves = new Moves(); }
//   moves.on('swing', m => slash(m.dir, m.power));     // dir: 'left' | 'right' | 'up' | 'down'; power 0..1
//   moves.on('punch', m => hit(m.power));              // pushed straight away from you
//   moves.on('throw', m => toss(m.power));             // flung upwards
//   moves.on('flip',  m => flipPancake(m.dir));        // turned over and back ('forward' | 'back')
//   moves.on('twist', m => turnKey(m.dir));            // turned like a key or a steering wheel ('left' | 'right')
//   moves.on('knock', () => door());                   // a sharp tap on the back or side of the phone
//   moves.on('shake', m => ...);                       // shaken hard
//   update(dt) { moves.update(); }                     // the moves are handed to you here, in your update
//   moves.on('any', m => ...) gets every move with m.type.
//
// Moves are spotted between frames but only delivered when you call update(), so your handlers run
// at a safe moment in your game loop. While the game is paused or the round is over, nothing fires.
// On iPhones the player is asked for motion access the first time they tap Play.

import { onMotion, onShake } from './device.js';
import { register } from './cleanup.js';

const live = new Set();
/** Stops every Moves (the app calls this when a round ends or the player leaves a game). */
export function stopMoves() { for (const m of [...live]) m.stop(); }
register('moves', { stop: stopMoves });

export class Moves {
  /** sensitivity: 1 normal, below 1 needs harder moves, above 1 fires more easily. */
  constructor({ sensitivity = 1 } = {}) {
    this.k = sensitivity; this.handlers = {}; this.queue = []; this.last = {}; this.flipAcc = 0; this.twistAcc = 0; this.peak = null; this.on_ = true;
    this.attach();
  }
  attach() {
    this.off = onMotion(m => this.read(m));
    this.offShake = onShake(j => this.fire('shake', { power: Math.min(1, (j - 28) / 40) }));
    live.add(this);
  }
  /** Listens for a move: 'swing', 'punch', 'throw', 'flip', 'twist', 'knock', 'shake' or 'any'. */
  on(type, fn) { (this.handlers[type] ||= []).push(fn); return this; }
  /** Hands out the moves made since the last call (call it from your update). */
  update() {
    if (!this.off) this.attach();   // stopped when the last round ended: listen again
    const q = this.queue; this.queue = [];
    for (const m of q) { for (const fn of this.handlers[m.type] || []) fn(m); for (const fn of this.handlers.any || []) fn(m); }
    return q;
  }
  stop() { this.off?.(); this.offShake?.(); this.off = this.offShake = null; live.delete(this); this.queue = []; }
  fire(type, data, gap = 350) {
    const now = performance.now();
    if (now - (this.last[type] || 0) < gap) return;
    this.last[type] = now;
    if (this.queue.length < 8) this.queue.push({ type, power: 1, ...data, t: now });
  }
  read(m) {
    const k = this.k, dt = Math.min(.1, m.dt || .016);
    // linear acceleration (without gravity); some phones only give it with gravity: high-pass it ourselves
    let ax = m.ax, ay = m.ay, az = m.az;
    if (ax == null) { const g = this.g ||= { x: m.gx, y: m.gy, z: m.gz }; g.x += (m.gx - g.x) * .1; g.y += (m.gy - g.y) * .1; g.z += (m.gz - g.z) * .1; ax = m.gx - g.x; ay = m.gy - g.y; az = m.gz - g.z; }
    const rot = Math.hypot(m.ra, m.rb, m.rg), lin = Math.hypot(ax, ay, az);
    // swing: a big burst of rotation; report it at its peak
    if (rot > 380 / k) { if (!this.peak || rot > this.peak.rot) this.peak = { rot, rb: m.rb, rg: m.rg, ra: m.ra }; }
    else if (this.peak && rot < 200 / k) {
      const p = this.peak; this.peak = null;
      if (Math.abs(p.ra) < Math.max(Math.abs(p.rb), Math.abs(p.rg))) {
        const dir = Math.abs(p.rg) > Math.abs(p.rb) ? (p.rg > 0 ? 'right' : 'left') : (p.rb > 0 ? 'down' : 'up');
        this.fire('swing', { dir, power: Math.min(1, (p.rot - 380 / k) / 900) });
      }
    }
    // flip and twist: add up the turning over a short window
    this.flipAcc = this.flipAcc * Math.pow(.2, dt) + m.rb * dt;
    this.twistAcc = this.twistAcc * Math.pow(.2, dt) + m.ra * dt;
    if (Math.abs(this.flipAcc) > 150 / Math.sqrt(k)) { this.fire('flip', { dir: this.flipAcc > 0 ? 'back' : 'forward' }, 600); this.flipAcc = 0; }
    if (Math.abs(this.twistAcc) > 70 / Math.sqrt(k) && Math.abs(m.ra) > Math.abs(m.rb)) { this.fire('twist', { dir: this.twistAcc > 0 ? 'left' : 'right', amount: Math.abs(this.twistAcc) }, 450); this.twistAcc = 0; }
    // punch: shoved along the screen's facing axis without much turning; throw: flung upwards
    if (rot < 250 && az < -14 / k && Math.abs(az) > Math.abs(ax) && Math.abs(az) > Math.abs(ay)) this.fire('punch', { power: Math.min(1, (-az - 14 / k) / 20) });
    if (rot < 400 && ay > 16 / k && Math.abs(ay) > Math.abs(ax)) this.fire('throw', { power: Math.min(1, (ay - 16 / k) / 20) });
    // knock: a short sharp spike with almost no turning
    const prev = this.prevLin ?? 0; this.prevLin = lin;
    if (rot < 60 && lin > 6 / k && lin - prev > 5 / k && lin < 18) this.fire('knock', { power: Math.min(1, lin / 15) }, 250);
  }
}

// Replays and ghosts. A Ghost records where something went (the player's car, the runner) and plays
// it back, so players can race their best run; it packs small enough to keep with api.save(). A
// Recorder keeps every tap and frame of a round so the whole round can be played again exactly
// (an instant replay, or watching how someone scored), as long as the game's randomness comes from
// the recorder's rng.
//
//   const { Ghost, Recorder, Replayer } = gs.replay;
//   reset() {
//     run = new Ghost();                                         // this run
//     const s = api.load({}); best = s.ghost ? Ghost.unpack(s.ghost) : null;   // the best run so far
//   }
//   update(dt) {
//     run.record(dt, car.x, car.y, car.angle);                   // up to 4 numbers per sample
//     if (best) { const g = best.at(run.time); drawGhostCar = g; } // g.x, g.y, g.v[2]: the ghost now
//   }
//   on a new best: api.save({ ghost: run.pack() });               // about 1 KB for a minute
//
//   Whole-round replays: rec = new Recorder(); r = rec.rng (use it for all randomness);
//   in down/move/up/key: rec.event('down', x, y, id); in update: rec.frame(dt).
//   Later: play = new Replayer(rec.data); each frame: play.step(game) feeds the same taps and dts.

import { rng } from './math.js';

/** A path over time: record(dt, x, y, ...more) a few times a second, at(t) to read it back. */
export class Ghost {
  constructor({ every = .1 } = {}) { this.every = every; this.time = 0; this.next = 0; this.t = []; this.v = []; }
  get length() { return this.t.length ? this.t[this.t.length - 1] : 0; }
  record(dt, ...values) {
    this.time += dt;
    if (this.time >= this.next) { this.t.push(this.time); this.v.push(values.map(Number)); this.next = this.time + this.every; }
    return this;
  }
  /** The recorded values at time t, smoothly between samples: { x, y, v: [all values], done }. */
  at(t) {
    const n = this.t.length; if (!n) return null;
    if (t <= this.t[0]) return this.out(this.v[0], false);
    if (t >= this.t[n - 1]) return this.out(this.v[n - 1], true);
    let lo = 0, hi = n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (this.t[m] <= t) lo = m; else hi = m; }
    const k = (t - this.t[lo]) / (this.t[hi] - this.t[lo] || 1), a = this.v[lo], b = this.v[hi];
    return this.out(a.map((x, i) => x + ((b[i] ?? x) - x) * k), false);
  }
  out(v, done) { return { x: v[0], y: v[1], v, done }; }
  /**
   * A short string of the run, at most maxBytes long (samples are thinned out to fit), to keep with
   * api.save(). Values are kept to 1/precision (default 0.1 units).
   */
  pack(maxBytes = 1200, precision = 10) {
    let step = 1, s;
    do {
      const rows = []; let pt = 0, pv = [];
      for (let i = 0; i < this.t.length; i += step) {
        const t = Math.round(this.t[i] * 100), v = this.v[i].map(x => Math.round(x * precision));
        rows.push([t - pt, ...v.map((x, j) => x - (pv[j] ?? 0))].map(x => x.toString(36)).join(','));
        pt = t; pv = v;
      }
      s = `g1;${precision};` + rows.join(';');
      step++;
    } while (s.length > maxBytes && step < 64);
    return s;
  }
  static unpack(s) {
    const g = new Ghost(), parts = String(s || '').split(';');
    if (parts[0] !== 'g1') return g;
    const precision = +parts[1] || 10; let pt = 0, pv = [];
    for (const row of parts.slice(2)) {
      const n = row.split(',').map(x => parseInt(x, 36)); pt += n[0];
      pv = n.slice(1).map((d, j) => d + (pv[j] ?? 0));
      g.t.push(pt / 100); g.v.push(pv.map(x => x / precision));
    }
    g.time = g.length; return g;
  }
}

/** Records a whole round: every input event and every frame's dt, plus a seed for its randomness. */
export class Recorder {
  constructor({ seed = (Math.random() * 2 ** 32) >>> 0, max = 60 * 60 * 5 } = {}) {
    this.seed = seed; this.rng = rng(seed); this.frames = []; this.pending = []; this.max = max;
  }
  /** An input: rec.event('down', x, y, id), rec.event('key', 'ArrowLeft', true). */
  event(kind, ...args) { this.pending.push([kind, ...args]); return this; }
  /** Call once per update with its dt. */
  frame(dt) { if (this.frames.length < this.max) this.frames.push([dt, this.pending]); this.pending = []; return this; }
  get time() { return this.frames.reduce((s, f) => s + f[0], 0); }
  /** Plain data (to hand to a Replayer). */
  get data() { return { seed: this.seed, frames: this.frames }; }
}

/** Plays a Recorder's data back into a game: the same inputs, the same dts, the same random numbers. */
export class Replayer {
  constructor(data) { this.data = data; this.rng = rng(data.seed); this.i = 0; }
  get done() { return this.i >= this.data.frames.length; }
  /** Feeds one recorded frame: its inputs (game.down, move, up, key), then game.update(dt). Returns dt. */
  step(game) {
    const f = this.data.frames[this.i++]; if (!f) return 0;
    for (const [kind, ...args] of f[1]) game[kind]?.(...args);
    game.update?.(f[0]);
    return f[0];
  }
}

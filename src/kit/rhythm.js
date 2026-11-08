// Rhythm timing: a beat clock that keeps in step with gs.sound.music, note charts written as text,
// Perfect / Good / Miss judging with fair windows, and a tap-lag calibration (screens and Bluetooth
// headphones add delay; the kit remembers the player's lag on this phone and allows for it).
//
//   const { Beat, Chart, Calibrate } = gs.rhythm;
//   reset() {
//     tune = music({ tempo: 120, lead: '...', drums: 'k . h . s . h .' });
//     beat = new Beat({ bpm: 120 });
//     chart = new Chart(`
//       x . . . x . . . | x . x . . . x .
//       . . x . . . x . | . . . . x . . x`, { bpm: 120, per: 2, lead: 2 });   // 2 steps a beat, 2 beats before the first step
//   }
//   update(dt) {
//     if (!tune.playing) { tune.start(); beat.start(); }                  // start both together
//     beat.update(dt);
//     for (const n of chart.missed(beat.time)) feel.hurt();                // notes that went past
//     if (beat.onBeat) pulse = 1;                                           // a new beat this frame
//   }
//   down(x) { const r = chart.hit(laneAt(x), beat.time); if (r) show(r.result); }   // 'perfect' | 'good' | 'miss'
//   draw(c) { for (const n of chart.near(beat.time, 2)) drawNote(n.lane, (n.time - beat.time) * SPEED); }
//
// In a chart each line is a lane; 'x' is a note, '=' holds the note before it, '.' is a rest; spaces
// and '|' are just for reading. A note: { time, lane, beat, hold (seconds), hit, result }.

import { audio } from '../sfx.js';
import { store } from '../util.js';
import { sfx } from '../sfx.js';

const LAG_KEY = 'gs_rhythm_lag';
/** The player's tap lag on this phone, in seconds (from Calibrate). */
export const lag = () => { const v = +store.get(LAG_KEY, 0); return isFinite(v) ? Math.max(-.3, Math.min(.3, v)) : 0; };

export class Beat {
  constructor({ bpm = 120, offset = 0, steps = 2 } = {}) { this.bpm = bpm; this.offset = offset; this.steps = steps; this.time = -offset; this.running = false; this.onBeat = false; this.onStep = false; this.last = -1; this.lastStep = -1; }
  /** Starts counting now (call it the same frame you start the music). */
  start() { const a = audio(); this.t0 = a ? a.ctx.currentTime + .03 : null; this.time = -this.offset - .03; this.running = true; this.last = -1; this.lastStep = -1; return this; }
  stop() { this.running = false; return this; }
  get spb() { return 60 / this.bpm; }
  /** Beats so far (a float). */
  get beat() { return this.time / this.spb; }
  /** 0..1 through the current beat. */
  get phase() { const b = this.beat; return b - Math.floor(b); }
  update(dt) {
    if (!this.running) { this.onBeat = this.onStep = false; return this; }
    this.time += dt;
    // stay in step with the sound card's clock (the music is scheduled on it), gently
    const a = audio();
    if (a && this.t0 != null && a.ctx.state === 'running') {
      const real = a.ctx.currentTime - this.t0 - this.offset, d = real - this.time;
      if (Math.abs(d) < .25) this.time += d * .1; else this.t0 = a.ctx.currentTime - this.time - this.offset;   // a pause or a hiccup: re-anchor
    }
    const b = Math.floor(this.beat), s = Math.floor(this.beat * this.steps);
    this.onBeat = b !== this.last && b >= 0; this.last = b;
    this.onStep = s !== this.lastStep && s >= 0; this.lastStep = s;
    return this;
  }
}

export class Chart {
  /**
   * text: one line per lane. bpm and per (steps per beat, 2 = eighth notes), lead: beats of silence
   * before the first step. windows (seconds either side): perfect .045, good .09, miss .14.
   */
  constructor(text, { bpm = 120, per = 2, lead = 0, windows = {} } = {}) {
    this.w = { perfect: .045, good: .09, miss: .14, ...windows };
    const lines = String(text).split('\n').map(l => l.replace(/[\s|]/g, '')).filter(Boolean);
    const step = 60 / bpm / per; this.notes = []; this.lanes = lines.length;
    lines.forEach((l, lane) => {
      let last = null;
      [...l].forEach((ch, i) => {
        if (ch === 'x' || ch === 'X') { last = { time: (lead * per + i) * step, beat: lead + i / per, lane, hold: 0, hit: false, result: null }; this.notes.push(last); }
        else if (ch === '=' && last) last.hold += step;
        else last = null;
      });
    });
    this.notes.sort((a, b) => a.time - b.time || a.lane - b.lane);
    this.length = this.notes.length ? this.notes[this.notes.length - 1].time + this.notes[this.notes.length - 1].hold : 0;
    this.counts = { perfect: 0, good: 0, miss: 0 }; this.combo = 0; this.best = 0;
  }
  /** A tap in lane at time (the Beat's time): the nearest unplayed note within the miss window. */
  hit(lane, time) {
    const t = time - lag(); let best = null, bd = Infinity;
    for (const n of this.notes) {
      if (n.hit || n.lane !== lane) continue;
      const d = Math.abs(n.time - t); if (d < bd) { bd = d; best = n; }
      if (n.time - t > this.w.miss) break;
    }
    if (!best || bd > this.w.miss) return null;
    const result = bd <= this.w.perfect ? 'perfect' : bd <= this.w.good ? 'good' : 'miss';
    return this.mark(best, result, t - best.time);
  }
  mark(n, result, error = 0) {
    n.hit = true; n.result = result; this.counts[result]++;
    if (result === 'miss') this.combo = 0; else this.best = Math.max(this.best, ++this.combo);
    return { result, note: n, error };
  }
  /** Notes that went past unplayed by time (marked as misses). */
  missed(time) {
    const t = time - lag(), out = [];
    for (const n of this.notes) { if (n.time > t) break; if (!n.hit && t - n.time > this.w.miss) out.push(this.mark(n, 'miss').note); }
    return out;
  }
  /** Unplayed notes from time - behind to time + ahead (seconds), for drawing. */
  near(time, ahead = 2, behind = .2) { return this.notes.filter(n => !n.hit && n.time >= time - behind && n.time <= time + ahead); }
  get done() { return this.notes.every(n => n.hit); }
  /** 0..1: perfect counts 1, good .5. */
  get accuracy() { const n = this.notes.length || 1; return (this.counts.perfect + this.counts.good * .5) / n; }
}

/**
 * Measures the player's tap lag: clicks on the beat, the player taps along, and the middle of their
 * timings is kept for this phone. calib.update(dt) each frame, calib.tap() on each tap; calib.done,
 * then calib.lag (seconds). calib.beat is a Beat for drawing a pulse.
 */
export class Calibrate {
  constructor({ bpm = 100, beats = 12, skip = 3 } = {}) { this.beat = new Beat({ bpm }); this.beats = beats; this.skip = skip; this.taps = []; this.done = false; this.lag = lag(); this.started = false; }
  update(dt) {
    if (!this.started) { this.started = true; this.beat.start(); }
    this.beat.update(dt);
    if (this.beat.onBeat && this.beat.last < this.beats) sfx(this.beat.last % 4 ? 880 : 1320, .05, 'square', .05);
    if (this.beat.last >= this.beats + 1 && !this.done) this.finish();
    return this;
  }
  tap() {
    const b = this.beat.beat, n = Math.round(b);
    if (n >= this.skip && n < this.beats) this.taps.push((b - n) * this.beat.spb);
    return this;
  }
  finish() {
    this.done = true;
    if (this.taps.length >= 4) { const s = this.taps.slice().sort((a, b) => a - b); this.lag = s[s.length >> 1]; store.set(LAG_KEY, +this.lag.toFixed(3)); }
    return this;
  }
}

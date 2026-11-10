// Rounds and scenes: the parts of a round (intro, play, level clear, boss, results) and the moves
// between them, so your update() and draw() don't fill up with "if (phase === ...)". Each scene is
// yours: its own update and draw. The kit only keeps track of which one is on, for how long, and how
// far through a change you are, so you can draw the change however your game looks.
//
//   const { Scenes } = gs.rounds;
//   reset() {
//     scenes = new Scenes({
//       intro: { enter() { say('LEVEL ' + level); }, update(dt, s) { if (s.time > 1.5) s.go('play'); }, draw(c) { ... } },
//       play:  { update(dt) { ...the game... }, draw(c) { ... } },
//       clear: { enter() { feel.win(); }, update(dt, s) { if (s.time > 2) { level++; s.go('intro'); } } },
//     }, 'intro');
//   }
//   update(dt) { scenes.update(dt); }
//   draw(c) { scenes.draw(c); if (scenes.changing) { c.globalAlpha = scenes.cover; c.fillRect(0, 0, W, H); c.globalAlpha = 1; } }
//
// s.go(name, { fade: .4, data }) changes scene: the old scene keeps running for the first half of
// the fade, the new one for the second half. scenes.cover goes 0 → 1 → 0 across it (draw a fade, a
// wipe, an iris, anything); scenes.progress goes 0 → 1. scenes.time is seconds in the current scene,
// scenes.data what was passed in, scenes.prev the scene before. scenes.after(2, 'play') changes later.
//
// Ready: waits for the player's first touch (or key) before the round really starts, so nothing falls,
// scores or ends while they read the screen. One object instead of a hand-written "started" flag:
//
//   const ready = new Ready();                      // in make()
//   reset()      { ready.reset(); ... }
//   update(dt)   { if (!ready.update(dt)) return; ...the game... }
//   down(x, y)   { if (ready.go()) return; ... }   // the first tap only starts (pass { eat: false } to
//   key(k, down) { if (down && ready.go()) return; ... }   // let it also act, e.g. a flap game's first flap)
//   draw(c)      { ...the game...; ready.draw(c, W, H); }   // optional pulsing "Tap to start"; or draw your own
//
// ready.waiting is true until then, ready.t counts seconds waited (for your own idle animation), and
// ready.since seconds since the start. ready.go() from a tilt or a shout starts it the same way.
//
// Levels: new Levels(list) walks a list of your level data: levels.now, levels.index, levels.next()
// (false after the last, or wraps with { loop: true } and counts levels.lap for harder repeats).

import { text as pixelText } from './pixel.js';

export class Ready {
  /** eat: the starting touch does nothing else (true) or also reaches the game (false). text: the prompt draw() shows. */
  constructor({ eat = true, text = 'Tap to start' } = {}) { this.eat = eat; this.text = text; this.reset(); }
  reset() { this.waiting = true; this.t = 0; this.since = 0; return this; }
  /** Counts time; returns true once the round has started (so `if (!ready.update(dt)) return;`). */
  update(dt) { if (this.waiting) this.t += dt; else this.since += dt; return !this.waiting; }
  /** Starts the round. Returns true when this touch should do nothing else (the first one, with eat). */
  go() { if (!this.waiting) return false; this.waiting = false; this.since = 0; return this.eat; }
  get playing() { return !this.waiting; }
  /**
   * Draws the prompt while waiting (and fades it out just after): a gently pulsing line of text.
   * Options: text, x, y (its middle; default the centre, two thirds down), color, size, font, shadow,
   * pixel: true draws gs.pixel text that blinks instead of fading (pixel styles keep their exact shades;
   * pass a palette colour, and a shadow only if you want one).
   */
  draw(c, W, H, { text = this.text, x = W / 2, y = Math.round(H * .66), color = '#ffffff', size, font = 'Rubik, sans-serif', pixel = false, shadow = pixel ? null : '#000000a0' } = {}) {
    if (!text) return this;
    if (pixel) {
      if (!this.waiting || this.t % 1 > .7) return this;
      const k = Math.max(1, Math.round(size || 1));
      pixelText(c, text, Math.round(x), Math.round(y - 2.5 * k), { color, align: 'center', size: k, shadow });
      return this;
    }
    const a = this.waiting ? .65 + .35 * Math.sin(this.t * 4) : 1 - this.since / .25;
    if (a <= 0) return this;
    c.save(); c.globalAlpha = Math.min(1, a);
    c.font = `800 ${size || Math.round(W / 18)}px ${font}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    if (shadow) { c.fillStyle = shadow; c.fillText(text, x + 1, y + 2); }
    c.fillStyle = color; c.fillText(text, x, y);
    c.restore(); return this;
  }
}

export class Scenes {
  constructor(scenes, start, { fade = 0 } = {}) {
    this.scenes = scenes; this.fadeTime = fade; this.name = null; this.prev = null; this.time = 0; this.total = 0;
    this.data = null; this.change = null; this.timer = null;
    if (start) this.enter(start, null);
  }
  get scene() { return this.scenes[this.name]; }
  is(...names) { return names.includes(this.name) || (this.change && names.includes(this.change.to)); }
  /** Changes to another scene. fade: seconds for the change (0 = instant). */
  go(name, { fade = this.fadeTime, data = null } = {}) {
    if (!this.scenes[name]) throw new Error(`No scene called "${name}"`);
    this.timer = null;
    if (!fade) { this.change = null; this.enter(name, data); return this; }
    if (this.change && this.change.to === name) return this;
    this.change = { to: name, data, t: 0, fade, switched: false };
    return this;
  }
  /** Changes scene after this many seconds (in the scene; it pauses with the game). */
  after(sec, name, opts) { this.timer = { at: this.time + sec, name, opts }; return this; }
  enter(name, data) {
    this.scene?.exit?.(this);
    this.prev = this.name; this.name = name; this.time = 0; this.data = data;
    this.scene.enter?.(this, data);
  }
  get changing() { return !!this.change; }
  get progress() { return this.change ? Math.min(1, this.change.t / this.change.fade) : 0; }
  /** 0 → 1 → 0 across a change: how much to cover the screen. */
  get cover() { const p = this.progress; return this.change ? 1 - Math.abs(p * 2 - 1) : 0; }
  update(dt) {
    this.total += dt;
    if (this.change) {
      const ch = this.change; ch.t += dt;
      if (!ch.switched && ch.t >= ch.fade / 2) { ch.switched = true; this.enter(ch.to, ch.data); }
      if (ch.t >= ch.fade) this.change = null;
    }
    this.time += dt;
    if (this.timer && this.time >= this.timer.at) { const t = this.timer; this.timer = null; this.go(t.name, t.opts); }
    this.scene?.update?.(dt, this);
    return this;
  }
  draw(c, ...rest) { this.scene?.draw?.(c, this, ...rest); return this; }
  /** Passes input to the current scene's down/move/up/key, if it has them. */
  input(kind, ...args) { const f = this.scene?.[kind]; if (typeof f === 'function') return f.apply(this.scene, [...args, this]); }
}

export class Levels {
  constructor(list, { loop = false, start = 0 } = {}) { this.list = list; this.loop = loop; this.index = start; this.lap = 0; }
  get now() { return this.list[this.index]; }
  get number() { return this.lap * this.list.length + this.index + 1; }
  get last() { return !this.loop && this.index === this.list.length - 1; }
  /** Moves to the next level. Returns false when there are no more (unless loop). */
  next() {
    if (this.index + 1 < this.list.length) { this.index++; return true; }
    if (!this.loop) return false;
    this.index = 0; this.lap++; return true;
  }
  restart() { this.index = 0; this.lap = 0; return this; }
}

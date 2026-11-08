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
// Levels: new Levels(list) walks a list of your level data: levels.now, levels.index, levels.next()
// (false after the last, or wraps with { loop: true } and counts levels.lap for harder repeats).

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

// Animation states for sprites: idle, run, jump... each with its own frames, speed and looping, and
// events on chosen frames (a footstep sound on frame 1 and 3, the hit landing on frame 2 of a punch).
// It only counts frames; you draw the frame it says, with gs.pixel sprites or your own drawing.
//
//   const { Animator } = gs.anim;
//   reset() {
//     hero.anim = new Animator({
//       idle: { frames: 2, fps: 3 },
//       run:  { frames: 4, fps: 10, events: { 1: 'step', 3: 'step' } },
//       jump: { frames: [4], loop: false },                     // frames: a count, or a list of frame numbers
//       punch: { frames: [5, 6, 7], fps: 14, loop: false, then: 'idle', events: { 1: 'hit' } },
//     }, 'idle');
//     hero.anim.on('step', () => sounds.blip(.6)).on('hit', () => strike());
//   }
//   update(dt) { hero.anim.update(dt, hero.onGround ? (hero.vx ? 'run' : 'idle') : 'jump'); }   // pick a state each frame...
//   if (tapped) hero.anim.play('punch');                          // ...or play one; 'then' says where it goes after
//   draw(c) { sheet[hero.anim.frame].draw(c, hero.x, hero.y); }
//
// A one-shot (loop: false) holds its last frame and sets done; while one plays with lock: true, the
// state you pick in update() waits until it finishes.

export class Animator {
  constructor(states, start = Object.keys(states)[0]) {
    this.states = {};
    for (const [name, s] of Object.entries(states)) {
      const frames = Array.isArray(s.frames) ? s.frames : Array.from({ length: s.frames ?? 1 }, (_, i) => i);
      this.states[name] = { fps: 8, loop: true, lock: s.loop === false, events: {}, ...s, frames };
    }
    this.handlers = {}; this.play(start, true);
  }
  /** The current state's name. */
  get state() { return this.name; }
  /** The frame to draw: a number from the state's frames list. */
  get frame() { const s = this.states[this.name]; return s.frames[this.index]; }
  /** 0..1 through the current state (one-shots: how far through they are). */
  get progress() { const s = this.states[this.name]; return Math.min(1, this.time * s.fps / s.frames.length); }
  on(event, fn) { (this.handlers[event] ||= []).push(fn); return this; }
  emit(ev) { for (const f of this.handlers[ev] || []) f(ev, this); for (const f of this.handlers['*'] || []) f(ev, this); }
  /** Switches to state name (from its first frame). Playing the state that's already on does nothing unless restart. */
  play(name, restart = false) {
    if (!this.states[name]) throw new Error(`Animator has no state "${name}"`);
    if (name === this.name && !restart) return this;
    this.prev = this.name; this.name = name; this.time = 0; this.index = 0; this.done = false;
    const e = this.states[name].events[0]; if (e) this.emit(e);
    return this;
  }
  /** Moves time on; want: the state you'd like (skipped while a locked one-shot plays). */
  update(dt, want) {
    const cur = this.states[this.name];
    if (want && want !== this.name && !(cur.lock && !this.done)) this.play(want);
    const s = this.states[this.name], n = s.frames.length;
    this.time += dt;
    let i = Math.floor(this.time * s.fps);
    if (s.loop) i %= n; else if (i >= n) { i = n - 1; if (!this.done) { this.done = true; this.emit('done'); if (s.then) { this.play(s.then); return this; } } }
    // events on every frame passed since last time (fast animations don't skip them)
    while (this.index !== i) {
      this.index = (this.index + 1) % n;
      const e = s.events[this.index]; if (e) this.emit(e);
      if (!s.loop && this.index >= n - 1) break;
    }
    return this;
  }
}

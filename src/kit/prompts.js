// Quick-time prompts for cinematic moments and melee: "tap now", "hold", "swipe left", "mash!", made
// for touch (big targets, generous timing, a slow-motion moment while the prompt is up if you want
// it). The kit runs the prompts and judges the input; your game draws them (or uses draw()) and
// plays what happens on success or failure.
//
//   const { Prompts } = gs.prompts;
//   qte = new Prompts();
//   qte.start([
//     { kind: 'tap', time: 1.2, x: 120, y: 300 },             // tap inside the ring before it closes
//     { kind: 'swipe', dir: 'left', time: 1 },
//     { kind: 'hold', hold: .8, time: 2 },                     // press and keep holding
//     { kind: 'mash', count: 8, time: 2.5 },                   // tap fast
//   ], { slow: .35 });                                         // the game runs at 35% speed meanwhile
//   update(dt) { qte.update(dt); const gameDt = dt * qte.timeScale; ... }
//   down(x, y) { if (qte.active) return qte.down(x, y); }  move(x, y, p) { qte.move(x, y); }  up(x, y) { qte.up(x, y); }
//   qte.on('pass', p => ...).on('fail', p => ...).on('done', allPassed => ...)
//   draw(c) { qte.draw(c, W, H); }
//
// start(list, { ease: 1.5 }) gives every prompt half as long again (a kinder setting for players who
// want it), and a tap prompt with no x and y takes a tap anywhere on the screen.

const DIRS = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };

export class Prompts {
  constructor({ radius = 46, swipe = 50 } = {}) { this.radius = radius; this.swipeDist = swipe; this.list = []; this.i = 0; this.active = false; this.handlers = {}; this.timeScale = 1; this.passed = 0; }
  on(ev, fn) { (this.handlers[ev] ||= []).push(fn); return this; }
  emit(ev, ...a) { for (const f of this.handlers[ev] || []) f(...a); }
  /** Starts a run of prompts. slow: time scale for the game while they're up (1 = normal speed); ease: more time for each. */
  start(list, { slow = 1, ease = 1 } = {}) {
    this.list = list.map(p => ({ time: 1.2, ...p, time0: (p.time ?? 1.2) * ease })); this.i = 0; this.active = !!this.list.length; this.slow = slow; this.passed = 0;
    this.begin(); return this;
  }
  get now() { return this.active ? this.list[this.i] : null; }
  /** 0..1 of the current prompt's time left (for the shrinking ring). */
  get left() { const p = this.now; return p ? Math.max(0, p.t / p.time0) : 0; }
  begin() { const p = this.now; if (!p) return; p.t = p.time0; p.held = 0; p.hits = 0; p.press = null; this.emit('show', p); }
  update(dt) {
    this.timeScale += ((this.active ? this.slow : 1) - this.timeScale) * Math.min(1, dt * 10);
    const p = this.now; if (!p) return this;
    p.t -= dt;
    if (p.kind === 'hold' && p.press) { p.held += dt; if (p.held >= p.hold) return this.result(true); }
    if (p.kind === 'mash' && p.hits >= p.count) return this.result(true);
    if (p.t <= 0) this.result(false);
    return this;
  }
  inside(p, x, y) { return p.x == null || Math.hypot(x - p.x, y - p.y) <= this.radius * 1.3; }
  down(x, y) {
    const p = this.now; if (!p) return false;
    if (p.kind === 'tap') { if (this.inside(p, x, y)) this.result(true); else if (p.strict) this.result(false); }
    else if (p.kind === 'hold') { if (this.inside(p, x, y)) p.press = { x, y }; }
    else if (p.kind === 'mash') { p.hits++; this.emit('mash', p); }
    else if (p.kind === 'swipe') p.press = { x, y };
    return true;
  }
  move(x, y) {
    const p = this.now; if (!p?.press || p.kind !== 'swipe') return;
    const dx = x - p.press.x, dy = y - p.press.y; if (Math.hypot(dx, dy) < this.swipeDist) return;
    const [ex, ey] = DIRS[p.dir] || [0, 0], ok = (dx * ex + dy * ey) / Math.hypot(dx, dy) > .7;
    p.press = null; this.result(ok);
  }
  up() { const p = this.now; if (p?.kind === 'hold' && p.press) { p.press = null; if (p.held < p.hold) p.held = 0; } }
  result(ok) {
    const p = this.now; if (!p) return this;
    p.ok = ok; if (ok) this.passed++; this.emit(ok ? 'pass' : 'fail', p);
    if (!ok && !p.optional) { this.active = false; this.emit('done', false); return this; }
    this.i++; if (this.i >= this.list.length) { this.active = false; this.emit('done', this.passed === this.list.length); } else this.begin();
    return this;
  }
  cancel() { this.active = false; return this; }
  /** A plain look: a shrinking ring and a word or arrow. */
  draw(c, w, h, { colour = '#ffd25a', ink = '#111' } = {}) {
    const p = this.now; if (!p) return;
    const x = p.x ?? w / 2, y = p.y ?? h * .62, r = this.radius;
    c.save(); c.lineWidth = 5; c.strokeStyle = 'rgba(0,0,0,.4)'; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.stroke();
    c.strokeStyle = colour; c.beginPath(); c.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * this.left); c.stroke();
    if (p.kind === 'hold') { c.fillStyle = colour; c.globalAlpha = .5; c.beginPath(); c.moveTo(x, y); c.arc(x, y, r - 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, p.held / p.hold)); c.fill(); c.globalAlpha = 1; }
    c.fillStyle = colour; c.beginPath(); c.arc(x, y, r * .55, 0, Math.PI * 2); c.fill();
    c.fillStyle = ink; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `800 ${Math.round(r * .42)}px Rubik, sans-serif`;
    const label = p.label ?? (p.kind === 'tap' ? 'TAP' : p.kind === 'hold' ? 'HOLD' : p.kind === 'mash' ? `${Math.max(0, p.count - p.hits)}` : '');
    if (p.kind === 'swipe') { const [ex, ey] = DIRS[p.dir] || [1, 0]; c.translate(x, y); c.rotate(Math.atan2(ey, ex)); c.beginPath(); c.moveTo(r * .35, 0); c.lineTo(-r * .2, -r * .28); c.lineTo(-r * .2, r * .28); c.fill(); }
    else c.fillText(label, x, y);
    c.restore();
  }
}

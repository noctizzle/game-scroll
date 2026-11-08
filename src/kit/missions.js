// Set pieces and missions: write a mission as a script that waits for things to happen ("reach the
// gate", "kill the four guards", "survive 30 seconds") and makes things happen (spawn a wave, drop
// the bridge, open the door), with objectives to show, zones to enter and checkpoints to restart
// from. The script is a generator function, so it reads top to bottom like a story.
//
//   const { Mission, zone } = gs.missions;
//   reset() {
//     mission = new Mission(function* (m) {
//       m.objective('Reach the radio tower');
//       yield m.until(() => zone(tower, 6).has(player));             // wait for a condition
//       m.checkpoint('tower');                                       // you restart here after a loss
//       m.say('Hold them off until the chopper lands!');
//       spawnWave(1); yield m.wait(2); spawnWave(2);
//       yield m.all(m.wait(30), m.until(() => enemies.length === 0)); // both
//       m.objective('Get to the chopper', { at: heli });
//       yield m.until(() => zone(heli, 3).has(player));
//       m.complete();
//     }, { save: () => ({ hp: me.hp }), load: s => { me.hp = s.hp; } });
//   }
//   update(dt) { mission.update(dt); if (mission.failed) ...; }    // mission.fail('You were spotted')
//   draw: mission.objectives ([{ text, at, done }]), mission.lines (things said), mission.time
//
// On a loss call mission.restart(): it goes back to the last checkpoint by running the script from
// the start with every wait passing at once, then calls your load() with what save() gave there.
// Lines, objectives and events before the checkpoint are skipped; your own calls run again, so
// check mission.replaying before spawning things that belong to earlier parts.

/** A zone: circle (x, y, r) or box ({ x, y, w, h }); 3D: pass { x, z } points, they read x and z as x and y. */
export function zone(at, r = null) {
  const box = r == null && at.w != null;
  const P = p => ({ x: p.x, y: p.z ?? p.y });
  const c = P(at);
  return {
    has(p) { const q = P(p); return box ? q.x >= at.x && q.y >= (at.z ?? at.y) && q.x <= at.x + at.w && q.y <= (at.z ?? at.y) + at.h : Math.hypot(q.x - c.x, q.y - c.y) <= r; },
    any(list) { return list.some(p => this.has(p)); },
    count(list) { return list.filter(p => this.has(p)).length; },
  };
}

export class Mission {
  /** script: function* (mission) { ... }. save() / load(data): your own state at checkpoints. */
  constructor(script, { save = null, load = null } = {}) {
    this.script = script; this.saveFn = save; this.loadFn = load; this.handlers = {};
    this.mark = null; this.marks = {}; this.restart(true);
  }
  on(ev, fn) { (this.handlers[ev] ||= []).push(fn); return this; }
  emit(ev, ...a) { for (const f of this.handlers[ev] || []) f(...a); }
  restart(fresh = false) {
    this.objectives = []; this.lines = []; this.time = 0; this.done = false; this.failed = null; this.waiting = null; this.flags = {};
    this.it = this.script(this); this.skipping = !fresh && this.mark != null;
    if (fresh) { this.mark = null; this.marks = {}; }
    this.step();
    return this;
  }
  step(value) {
    // runs the script until it yields something not yet true; while skipping to a checkpoint, waits pass at once
    for (let guard = 0; guard < 10000; guard++) {
      const r = this.it.next(value); value = undefined;
      if (r.done) { this.waiting = null; if (!this.done && !this.failed) this.complete(); return; }
      const w = r.value;
      if (!w) continue;
      if (this.skipping) continue;
      if (w.ready(0)) continue;
      this.waiting = w; return;
    }
  }
  update(dt) {
    if (this.done || this.failed) return this;
    this.time += dt;
    for (const l of this.lines) l.life -= dt; this.lines = this.lines.filter(l => l.life > 0);
    if (this.waiting && this.waiting.ready(dt)) { this.waiting = null; this.step(); }
    return this;
  }
  // ---- things a script yields
  /** Waits this many seconds (game time). */
  wait(seconds) { let t = 0; return { kind: 'wait', ready: dt => (t += dt) >= seconds }; }
  /** Waits until test() is true. */
  until(test) { return { kind: 'until', ready: () => !!test() }; }
  /** Waits until all of these are done. */
  all(...ws) { const done = ws.map(() => false); return { kind: 'all', ready: dt => { ws.forEach((w, i) => { if (!done[i] && w.ready(dt)) done[i] = true; }); return done.every(Boolean); } }; }
  /** Waits until any one is done (the index is in mission.which). */
  any(...ws) { return { kind: 'any', ready: dt => { const i = ws.findIndex(w => w.ready(dt)); if (i >= 0) { this.which = i; return true; } return false; } }; }
  // ---- things a script does
  /** Shows a new objective (the last one is ticked off). at: a point for a marker. */
  objective(text, { at = null, keep = false } = {}) { if (!keep) for (const o of this.objectives) o.done = true; const o = { text, at, done: false }; this.objectives.push(o); if (!this.skipping) this.emit('objective', o); return o; }
  /** True while restart() is racing through the script to the checkpoint. */
  get replaying() { return this.skipping; }
  get current() { return [...this.objectives].reverse().find(o => !o.done) || null; }
  /** A line of dialogue or radio chatter (who is optional), shown for `time` seconds. */
  say(text, { who = null, time = Math.max(2, text.length * .06) } = {}) { if (this.skipping) return; const l = { text, who, life: time }; this.lines.push(l); this.emit('say', l); }
  /** Saves a checkpoint here (restart() comes back to it). */
  checkpoint(name = 'cp' + Object.keys(this.marks).length) {
    if (this.skipping && name === this.mark) { this.skipping = false; if (this.loadFn) this.loadFn(this.marks[name]); this.emit('checkpoint', name, true); return; }
    if (this.skipping) return;
    this.mark = name; this.marks[name] = this.saveFn ? this.saveFn() : null; this.emit('checkpoint', name, false);
  }
  /** Sets and reads flags your script and game share (choices, things found). */
  flag(name, v = true) { this.flags[name] = v; return this; }
  complete() { if (this.done) return; this.done = true; for (const o of this.objectives) o.done = true; this.emit('complete', this.time); }
  fail(reason = 'Mission failed') { if (this.failed || this.done) return; this.failed = reason; this.emit('fail', reason); }
  /** For api.save between sessions: the last checkpoint and its data. */
  save() { return { m: this.mark, d: this.mark ? this.marks[this.mark] : null }; }
  load(s) { if (s?.m) { this.mark = s.m; this.marks[s.m] = s.d; this.restart(); } return this; }
}

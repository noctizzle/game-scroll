// Touch aim assist: the help mobile shooters give thumbs. Aim slows down over a target (sticky aim),
// drifts gently onto it (pull), and can fire by itself once the sights rest on it (auto fire). Your
// game still decides what a shot is, how it looks, the crosshair and the fire rate; this only turns
// "where the thumb points" into "where the gun points" and tells you when it's on target.
//
//   const { AimAssist } = gs.aim;
//   reset() { assist = new AimAssist({ cone: 12, range: 300, pull: .5, slow: .45, autoFire: .15 }); }
//   update(dt) {
//     aim += assist.turn(stickX * 3 * dt);                          // sticky: turning slows on a target
//     const a = assist.update(dt, gun, aim, things.all('enemy'), { sees: (x1, y1, x2, y2) => nav.sees(x1, y1, x2, y2) });
//     aim = a.angle;                                               // pulled onto the target a little
//     if (a.fire && cooldown <= 0) shoot(aim);                     // or fire on a button: your call
//     // a.target (the one being helped onto), a.on (sights on it), a.lock (0..1 how long it's been on)
//   }
//
// 2D: gun is { x, y } and the aim is an angle in radians. 3D: gun is { x, y, z } and the aim is a
// direction { x, y, z }; then a.dir is the helped direction (a THREE.Vector3 works for both).
// Targets need x, y (and z in 3D) and r (their size); dead ones (t.dead) are skipped. Targets that
// move can be led: give them vx, vy (vz) and pass { lead: bulletSpeed }.
// Strength: starts at the player's Aim assist setting (0 off .. 1.5 high, 1 normal); set
// assist.strength yourself only if your game has its own reason to.

import { prefs } from './prefs.js';

const DEG = Math.PI / 180;
const len = v => Math.hypot(v.x, v.y, v.z || 0) || 1;

export class AimAssist {
  constructor({ cone = 10, range = 400, pull = .4, slow = .5, autoFire = 0, stickTime = .12, strength = prefs.aimAssist } = {}) {
    Object.assign(this, { cone, range, pull, slow, autoFire, stickTime, strength });
    this.target = null; this.onTime = 0; this.on = false; this.offTime = 9;
  }
  /** Scales turning input: slower while the sights are on (or just left) a target. */
  turn(amount) { const sticky = this.on || this.offTime < this.stickTime; return sticky ? amount * (1 - (1 - this.slow) * this.strength) : amount; }
  /** Picks the target, pulls the aim onto it and says when to fire. */
  update(dt, gun, aim, targets, { sees, lead = 0 } = {}) {
    const three = typeof aim === 'object';
    const d = three ? { x: aim.x / len(aim), y: aim.y / len(aim), z: aim.z / len(aim) } : { x: Math.cos(aim), y: Math.sin(aim), z: 0 };
    const gz = gun.z || 0;
    let best = null, bestScore = Infinity, bestAim = null;
    for (const t of targets) {
      if (!t || t.dead) continue;
      let tx = t.x, ty = t.y, tz = three ? (t.z || 0) : 0;
      const dist0 = Math.hypot(tx - gun.x, ty - gun.y, tz - gz);
      if (dist0 > this.range + (t.r || 0)) continue;
      if (lead > 0) { const k = dist0 / lead; tx += (t.vx || 0) * k; ty += (t.vy || 0) * k; tz += three ? (t.vz || 0) * k : 0; }
      const vx = tx - gun.x, vy = ty - gun.y, vz = tz - gz, dist = Math.hypot(vx, vy, vz) || 1;
      const cos = (vx * d.x + vy * d.y + vz * d.z) / dist, ang = Math.acos(Math.max(-1, Math.min(1, cos)));
      const size = Math.atan2(t.r || 0, dist);                       // how wide it looks from here
      if (ang - size > this.cone * DEG) continue;
      if (sees && !(three ? sees(gun.x, gun.y, gz, t.x, t.y, tz) : sees(gun.x, gun.y, t.x, t.y))) continue;
      const score = ang / (this.cone * DEG) + dist / this.range * .35 + (t === this.target ? -.3 : 0);   // keep the same target if close
      if (score < bestScore) { bestScore = score; best = t; bestAim = { x: vx / dist, y: vy / dist, z: vz / dist, ang, size }; }
    }
    this.target = best;
    this.on = !!best && bestAim.ang <= bestAim.size;
    if (this.on) { this.onTime += dt; this.offTime = 0; } else { this.onTime = 0; this.offTime += dt; }
    // pull: move the aim part of the way onto the target each second
    let out = d;
    if (best && this.pull > 0 && this.strength > 0) {
      const k = 1 - Math.exp(-this.pull * this.strength * 6 * dt), a = bestAim;
      out = { x: d.x + (a.x - d.x) * k, y: d.y + (a.y - d.y) * k, z: d.z + (a.z - d.z) * k };
      const l = len(out); out = { x: out.x / l, y: out.y / l, z: out.z / l };
    }
    const fire = this.on && this.autoFire > 0 && this.strength > 0 && this.onTime >= this.autoFire;
    const res = { target: best, on: this.on, lock: this.autoFire ? Math.min(1, this.onTime / this.autoFire) : (this.on ? 1 : 0), fire };
    if (three) { res.dir = aim.clone ? aim.clone().set(out.x, out.y, out.z) : out; }
    else res.angle = Math.atan2(out.y, out.x);
    return res;
  }
  reset() { this.target = null; this.onTime = 0; this.on = false; this.offTime = 9; return this; }
}

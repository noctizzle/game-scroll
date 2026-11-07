import { rnd } from '../util.js';
import { sfx } from '../sfx.js';
import { haptic, want } from '../kit/device.js';
import { ARView, arNote, FLOOR } from '../kit/ar3d.js';
import { Particles, pbr, THREE } from '../kit/hd3d.js';
const { Group, Mesh, SphereGeometry, TorusGeometry, CylinderGeometry, ConeGeometry, Vector3 } = THREE;

// Saucer Swarm: little chrome flying saucers invade your room. They hover in from every side, circle
// you and creep closer; if one gets right up to you it zaps a shield. Turn the phone to put the
// crosshair on a saucer and tap to fire. Quick kills chain a combo, gold saucers are worth more and
// give a shield back. The radar at the top and the red edge arrows show where they are.
let W = 300, H = 460;
const SHIELDS = 3;

let MT = null;
function looks() {
  if (MT) return MT;
  MT = {
    chrome: pbr('#d8dde6', { rough: .14, metal: 1 }), gold: pbr('#ffcb4a', { rough: .18, metal: 1 }),
    dome: pbr('#8affdc', { rough: .05, metal: .1, glow: 1.6, clear: 1, transparent: true, opacity: .85 }),
    domeGold: pbr('#fff0a0', { rough: .05, glow: 1.8, clear: 1 }),
    lights: pbr('#ff3a6a', { glow: 3 }), belly: pbr('#40e0ff', { glow: 2.5 }), dark: pbr('#2a2e36', { rough: .4, metal: .8 }),
    G: { disc: new SphereGeometry(1, 32, 16), dome: new SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), ring: new TorusGeometry(1, .06, 8, 40), cyl: new CylinderGeometry(1, 1, 1, 20), leg: new ConeGeometry(1, 1, 8) },
  };
  return MT;
}
function makeSaucer(gold) {
  const m = looks(), G = m.G, g = new Group(), body = gold ? m.gold : m.chrome;
  const disc = new Mesh(G.disc, body); disc.scale.set(.24, .06, .24);
  const dome = new Mesh(G.dome, gold ? m.domeGold : m.dome); dome.scale.set(.1, .09, .1); dome.position.y = .03;
  const ring = new Mesh(G.ring, m.lights); ring.rotation.x = Math.PI / 2; ring.scale.set(.2, .2, .4); ring.position.y = -.005;
  const belly = new Mesh(G.cyl, m.belly); belly.scale.set(.07, .02, .07); belly.position.y = -.055;
  const fin = new Mesh(G.cyl, m.dark); fin.scale.set(.12, .02, .12); fin.position.y = -.035;
  for (const p of [disc, dome, ring, belly, fin]) { p.castShadow = true; g.add(p); }
  g.scale.setScalar(1.7);   // toy-sized: about 80 cm across
  g.userData.ring = ring;
  return g;
}

function make(api) {
  want('motion');
  let v, fx, smoke, saucers, t, score, shields, combo, comboT, cool, spawnT, beam, hitFlash, hurt, kills, tap;
  const pool = [];
  function setup() {
    v = new ARView();
    fx = new Particles(v, { max: 400, additive: true }); smoke = new Particles(v, { max: 120, additive: false });
    for (let i = 0; i < 9; i++) { const s = makeSaucer(i === 8); s.visible = false; v.scene.add(s); pool.push(s); }
  }
  function spawn() {
    const gold = Math.random() < .1 && !saucers.some(s => s.gold);
    const mesh = pool.find(p => !p.visible && (p === pool[8]) === gold); if (!mesh) return;
    const a = kills + saucers.length < 2 ? v.heading() + rnd(-.35, .35) : v.heading() + (Math.random() < .5 ? -1 : 1) * rnd(.5, Math.min(2.8, 1.2 + t / 20));   // the first ones come from in front
    mesh.visible = true;
    saucers.push({ mesh, gold, a, r: rnd(5.5, 7.5), y: rnd(-.5, 1.1), spin: (Math.random() < .5 ? -1 : 1) * rnd(.15, .4), in: rnd(.28, .4) + t / 160, ph: rnd(0, 6), born: 0, hp: gold ? 2 : 1 });
  }
  function pos(s, out = new Vector3()) { return out.set(-Math.sin(s.a) * s.r, s.y + Math.sin(s.ph * 2) * .12, -Math.cos(s.a) * s.r); }
  function boom(p, gold) {
    for (let i = 0; i < 40; i++) fx.emit({ x: p.x, y: p.y, z: p.z, vx: rnd(-2.5, 2.5), vy: rnd(-1.5, 3), vz: rnd(-2.5, 2.5), life: rnd(.4, .9), size: rnd(.03, .07), col: gold ? [3, 2.4, .6] : [3, 1.4, .5], drag: 2, grav: 4, floor: FLOOR });
    for (let i = 0; i < 10; i++) smoke.emit({ x: p.x, y: p.y, z: p.z, vx: rnd(-.5, .5), vy: rnd(0, .7), vz: rnd(-.5, .5), life: rnd(.8, 1.4), size: rnd(.12, .22), grow: 1.5, col: [.4, .4, .45], a: .5, drag: 1.5 });
  }
  function remove(s) { s.mesh.visible = false; saucers.splice(saucers.indexOf(s), 1); }
  function fire() {
    if (cool > 0) return; cool = .16;
    // the saucer closest to the crosshair, if it's within its own size on screen (plus a little help)
    let best = null, bd = 1e9; const p = new Vector3();
    for (const s of saucers) {
      pos(s, p); const [sx, sy, z] = v.toScreen(p.x, p.y, p.z); if (z >= 1) continue;
      const rad = .45 / s.r * (H / 2) / Math.tan(v.cam.fov * Math.PI / 360) + 16, d = Math.hypot(sx - W / 2, sy - H / 2);
      if (d < rad && d < bd) { bd = d; best = s; }
    }
    sfx(1200, .09, 'sawtooth', .035, -900);
    if (!best) { beam = { x: W / 2, y: H / 2, t: .1, hit: false }; combo = 0; haptic('tick'); return; }
    const bp = pos(best); const [sx, sy] = v.toScreen(bp.x, bp.y, bp.z); beam = { x: sx, y: sy, t: .12, hit: true };
    if (--best.hp > 0) { haptic('light'); for (let i = 0; i < 10; i++) fx.emit({ x: bp.x, y: bp.y, z: bp.z, vx: rnd(-1, 1), vy: rnd(-1, 1), vz: rnd(-1, 1), life: .3, size: .04, col: [3, 3, 2] }); return; }
    combo = comboT > 0 ? Math.min(5, combo + 1) : 1; comboT = 1.6; kills++;
    score += best.gold ? 5 * combo : combo; api.score(score);
    if (best.gold) shields = Math.min(SHIELDS, shields + 1);
    boom(bp, best.gold); remove(best); hitFlash = .25;
    haptic(best.gold ? 'success' : 'medium'); sfx(160, .3, 'square', .06, -100); if (combo > 1) sfx(500 + combo * 120, .1, 'triangle', .04, 200);
  }
  return {
    reset() {
      v?.off(); v?.recenter();
      if (v) { fx.clear(); smoke.clear(); }
      for (const p of pool) p.visible = false;
      saucers = []; t = 0; score = 0; shields = SHIELDS; combo = 0; comboT = 0; cool = 0; spawnT = .6; beam = null; hitFlash = 0; hurt = 0; kills = 0; tap = null;
    },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      if (!v) return; v.live(); if (v.calibrating) return;   // floor calibration open: pause
      t += dt; cool -= dt; comboT -= dt; hitFlash = Math.max(0, hitFlash - dt); hurt = Math.max(0, hurt - dt * 1.5);
      const cap = Math.min(7, 2 + Math.floor(t / 10));
      spawnT -= dt; if (spawnT <= 0 && saucers.length < cap) { spawn(); spawnT = Math.max(.5, 1.8 - t / 40); }
      const p = new Vector3();
      for (const s of [...saucers]) {
        s.born += dt; s.ph += dt; s.a += s.spin * dt / Math.max(1, s.r / 3); s.r -= s.in * dt;
        s.mesh.rotation.y += dt * 3; s.mesh.rotation.z = Math.sin(s.ph * 1.7) * .15;
        pos(s, s.mesh.position);
        if (s.r < 1.3) {   // close enough to zap you
          pos(s, p); shields--; hurt = 1; haptic('error'); sfx(90, .4, 'sawtooth', .07, -40);
          for (let i = 0; i < 20; i++) fx.emit({ x: p.x, y: p.y, z: p.z, vx: -p.x * rnd(.5, 2), vy: -p.y * rnd(.5, 2), vz: -p.z * rnd(.5, 2), life: .5, size: .05, col: [3, .5, 1] });
          remove(s); combo = 0;
          if (shields <= 0) { v.off(); return api.over(); }
        }
      }
      fx.update(dt); smoke.update(dt); if (beam) { beam.t -= dt; if (beam.t <= 0) beam = null; }
    },
    fx(dt) { if (v) { fx.update(dt); smoke.update(dt); } },
    draw(c) {
      if (!v) { setup(); this.reset(); }
      v.look(1 / 60);
      v.draw(c, W, H);
      // laser
      if (beam) {
        const k = beam.t / .12; c.save(); c.globalCompositeOperation = 'lighter';
        for (const [w, col] of [[9, '#19e3b155'], [3, '#b0fff0']]) { c.strokeStyle = col; c.lineWidth = w * k + 1; c.beginPath(); c.moveTo(W / 2 - 40, H + 4); c.lineTo(beam.x, beam.y); c.moveTo(W / 2 + 40, H + 4); c.lineTo(beam.x, beam.y); c.stroke(); }
        c.restore();
      }
      // crosshair: turns red when something is under it
      const p = new Vector3(); let lock = false;
      for (const s of saucers || []) { pos(s, p); const [sx, sy, z] = v.toScreen(p.x, p.y, p.z); if (z < 1 && Math.hypot(sx - W / 2, sy - H / 2) < .45 / s.r * (H / 2) / Math.tan(v.cam.fov * Math.PI / 360) + 16) lock = true; }
      c.save(); c.translate(W / 2, H / 2); c.strokeStyle = lock ? '#ff4a6a' : '#ffffffd0'; c.lineWidth = 2;
      c.beginPath(); c.arc(0, 0, 16, 0, 7); c.stroke();
      for (let i = 0; i < 4; i++) { c.rotate(Math.PI / 2); c.beginPath(); c.moveTo(20, 0); c.lineTo(28, 0); c.stroke(); }
      c.fillStyle = c.strokeStyle; c.fillRect(-1.5, -1.5, 3, 3); c.restore();
      // edge arrows and radar
      v.pointers(c, W, H, (saucers || []).map(s => ({ p: pos(s), col: s.gold ? '#ffd24a' : '#ff4a6a' })));
      const rx = W / 2, ry = 46, rr = 26, hd = v.heading();
      c.save(); c.fillStyle = '#04110ecc'; c.strokeStyle = '#19e3b1aa'; c.lineWidth = 1.5; c.beginPath(); c.arc(rx, ry, rr, 0, 7); c.fill(); c.stroke();
      c.fillStyle = '#19e3b133'; c.beginPath(); c.moveTo(rx, ry); c.arc(rx, ry, rr, -Math.PI / 2 - .5, -Math.PI / 2 + .5); c.fill();
      for (const s of saucers || []) { const a = s.a - hd, d = Math.min(1, s.r / 8) * rr; c.fillStyle = s.gold ? '#ffd24a' : '#ff4a6a'; c.beginPath(); c.arc(rx - Math.sin(a) * d, ry - Math.cos(a) * d, 2.6, 0, 7); c.fill(); }
      c.fillStyle = '#fff'; c.fillRect(rx - 1.5, ry - 1.5, 3, 3); c.restore();
      // shields + combo
      c.save(); c.font = '700 12px Rubik, sans-serif'; c.textAlign = 'left';
      for (let i = 0; i < SHIELDS; i++) { c.fillStyle = i < shields ? '#19e3b1' : '#ffffff30'; c.beginPath(); c.roundRect(14 + i * 20, 18, 16, 8, 3); c.fill(); }
      c.fillStyle = '#fff'; c.fillText('SHIELD', 14, 40);
      if (combo > 1 && comboT > 0) { c.textAlign = 'right'; c.font = '800 18px Rubik, sans-serif'; c.fillStyle = '#ffd24a'; c.fillText('x' + combo, W - 14, 74); }
      c.restore();
      if (hurt > 0) { const g = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .3, W / 2, H / 2, Math.max(W, H) * .7); g.addColorStop(0, '#ff000000'); g.addColorStop(1, `rgba(255,30,60,${hurt * .6})`); c.fillStyle = g; c.fillRect(0, 0, W, H); }
      arNote(c, v, W, H);
    },
    // gyro: tap anywhere fires at once. No gyro: drag to look, a tap (no drag) fires.
    down(x, y, id) { if (v?.input('down', x, y, id)) return; if (v?.sensor) return fire(); tap = { x, y, id, moved: 0 }; },
    move(x, y, pressed, id) { if (v?.input('move', x, y, id, pressed)) return; if (!pressed || !tap || tap.id !== id || v.sensor) return; v.drag(x - tap.x, y - tap.y); tap.moved += Math.abs(x - tap.x) + Math.abs(y - tap.y); tap.x = x; tap.y = y; },
    up(x, y, id) { if (v?.input('up', x, y, id)) return; if (tap && tap.id === id && tap.moved < 10 && !v.sensor) fire(); tap = null; },
  };
}

export default {
  id: 'saucer-swarm',
  title: 'Saucer Swarm',
  tag: 'AR · Shooter',
  retro: true, era: 'ar', pal: 'grape',
  w: 300, h: 460, maxW: 600, maxH: 680,
  goal: 40, reward: 20,
  hint: 'Flying saucers invade your room through the camera. Turn your phone to aim the crosshair and tap to zap them before they reach you. Quick kills build a combo; gold saucers restore a shield. No camera? Drag to look around.',
  traits: ['theme:scifi'],
  make,
};

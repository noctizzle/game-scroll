import { clamp, rnd } from '../util.js';
import { sfx } from '../sfx.js';
import { haptic, want } from '../kit/device.js';
import { ARView, arNote, FLOOR } from '../kit/ar3d.js';
import { Particles, pbr, surface, speckle, THREE } from '../kit/hd3d.js';
const { Group, Mesh, CylinderGeometry, TorusGeometry, CircleGeometry, IcosahedronGeometry, Vector3, DoubleSide } = THREE;

// Bin Flick: a metal bin appears on your real floor. Flick a paper ball up the screen to throw it:
// a longer, faster flick throws further, and flicking a little sideways curves the aim. Mind the
// wind from the desk fan. Each basket moves the bin somewhere new (sometimes beside or behind you,
// follow the arrow), a clean swish with no rim scores double, and three misses end the game.
let W = 300, H = 460;
const BR = .17, BH = .38, PR = .045, MISSES = 3;

let MT = null;
function looks() {
  if (MT) return MT;
  const brushed = surface(256, ({ col, h, r, size: S }) => {
    col.fillStyle = '#9aa2ac'; col.fillRect(0, 0, S, S);
    for (let i = 0; i < 260; i++) { const y = Math.random() * S, v = 130 + Math.random() * 60 | 0; col.fillStyle = `rgba(${v},${v + 4},${v + 10},.35)`; col.fillRect(0, y, S, 1); r.fillStyle = Math.random() < .5 ? '#555' : '#888'; r.fillRect(0, y, S, 1); }
    for (let y = 16; y < S; y += 48) { h.fillStyle = '#404040'; h.fillRect(0, y, S, 6); col.fillStyle = '#0002'; col.fillRect(0, y, S, 6); }   // pressed ribs
    speckle(col, S, 300, '#333', 1, .2);
  }, { strength: 3 });
  const paper = surface(128, ({ col, h, size: S }) => {
    col.fillStyle = '#f2f0ea'; col.fillRect(0, 0, S, S);
    for (let i = 0; i < 40; i++) { h.strokeStyle = Math.random() < .5 ? '#fff' : '#000'; h.lineWidth = rnd(1, 3); h.beginPath(); h.moveTo(rnd(0, S), rnd(0, S)); h.lineTo(rnd(0, S), rnd(0, S)); h.stroke(); }
    col.strokeStyle = '#8fb0e0'; col.lineWidth = 1; for (let y = 8; y < S; y += 14) { col.beginPath(); col.moveTo(0, y); col.lineTo(S, y + 4); col.stroke(); }   // ruled lines
  }, { strength: 4 });
  MT = {
    bin: pbr('#ffffff', { tex: brushed.repeat(3, 1), rough: .45, metal: .9, side: DoubleSide }), rim: pbr('#e4e8ee', { rough: .2, metal: 1 }), base: pbr('#3a3e46', { rough: .6, metal: .6 }),
    paper: pbr('#ffffff', { tex: paper, rough: .9 }),
    G: { wall: new CylinderGeometry(BR, BR * .86, BH, 36, 1, true), rim: new TorusGeometry(BR, .012, 8, 48), base: new CircleGeometry(BR * .86, 32), ball: crumple() },
  };
  return MT;
}
function crumple() {   // an icosphere with its points pushed in and out: a scrunched-up sheet
  const g = new IcosahedronGeometry(PR, 2), p = g.attributes.position, v = new Vector3();
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const k = 1 + Math.sin(v.x * 140) * .08 + Math.sin(v.y * 170 + v.z * 90) * .1; v.multiplyScalar(k); p.setXYZ(i, v.x, v.y, v.z); }
  g.computeVertexNormals(); return g;
}

function make(api) {
  want('motion');
  let v, bin, ball, held, conf, flight, bx, bz, score, misses, wind, msg, msgT, flick, t, streak, binA;
  const vtmp = new Vector3();
  function setup() {
    v = new ARView();
    const m = looks(); bin = new Group();
    const wall = new Mesh(m.G.wall, m.bin); wall.position.y = BH / 2; wall.castShadow = wall.receiveShadow = true;
    const rim = new Mesh(m.G.rim, m.rim); rim.rotation.x = Math.PI / 2; rim.position.y = BH; rim.castShadow = true;
    const base = new Mesh(m.G.base, m.base); base.rotation.x = -Math.PI / 2; base.position.y = .004; base.receiveShadow = true;
    bin.add(wall, rim, base); v.scene.add(bin);
    ball = new Mesh(m.G.ball, m.paper); ball.castShadow = true; v.scene.add(ball);
    held = new Mesh(m.G.ball, m.paper); v.cam.add(held); held.position.set(.1, -.16, -.46);
    conf = new Particles(v, { max: 260, additive: false });
  }
  function place(first) {
    // the bin wanders further and further round you; without a gyro it stays in view
    const spread = v.sensor ? Math.min(2.6, .35 + score * .22) : .3;
    const d = first ? 2.4 : clamp(1.6 + score * .14 + rnd(-.2, .3), 1.5, 4.2);
    binA = first ? 0 : clamp(binA + rnd(-1, 1) * spread, -spread, spread);
    bx = -Math.sin(binA) * d; bz = -Math.cos(binA) * d;
    bin.position.set(bx, FLOOR, bz);
    wind = score < 2 ? 0 : Math.round(rnd(-1, 1) * Math.min(1.6, .3 + score * .12) * 10) / 10;
  }
  function say(s, col = '#fff') { msg = { s, col }; msgT = 1.3; }
  function throwBall(dx, dy, ms) {
    const len = Math.hypot(dx, dy), speed = len / Math.max(60, ms);   // px per ms
    const power = clamp(len / (H * .55) * .7 + speed * .45, .15, 1.35);
    const f = v.forward(new Vector3()), yaw = Math.atan2(-f.x, -f.z) - clamp(dx / W, -.6, .6) * .55;
    const pitch = Math.asin(clamp(f.y, -1, 1)), elev = clamp(.62 + pitch * .5, .25, 1.1), sp = 2.1 + power * 4.2;
    const o = held.getWorldPosition(new Vector3());
    flight = { p: o, v: new Vector3(-Math.sin(yaw) * Math.cos(elev) * sp, Math.sin(elev) * sp, -Math.cos(yaw) * Math.cos(elev) * sp), touched: false, t: 0, wr: new Vector3(Math.cos(yaw), 0, -Math.sin(yaw)), spin: new Vector3(rnd(-9, 9), rnd(-9, 9), rnd(-9, 9)), done: 0 };
    ball.position.copy(o); ball.visible = true; held.visible = false;
    haptic('light'); sfx(420, .12, 'triangle', .035, 380);
  }
  function scored(swish) {
    const pts = swish ? 2 : 1; score += pts; streak++; api.score(score);
    say(swish ? 'SWISH! +2' : 'IN! +1', swish ? '#ffd24a' : '#8affdc');
    haptic('success'); sfx(660, .1, 'triangle', .05, 200); setTimeout(() => sfx(990, .14, 'triangle', .05, 200), 90);
    const cols = [[1, .3, .4], [.2, .9, .7], [1, .85, .2], [.3, .6, 1]];
    for (let i = 0; i < 50; i++) conf.emit({ x: bx, y: FLOOR + BH, z: bz, vx: rnd(-1.2, 1.2), vy: rnd(1.5, 3.4), vz: rnd(-1.2, 1.2), life: rnd(1, 1.8), size: rnd(.025, .045), col: cols[i % 4], drag: 1.2, grav: 3.5, floor: FLOOR });
  }
  function missed() {
    misses++; streak = 0; say(misses >= MISSES ? 'Out of paper!' : 'Miss', '#ff8a8a'); haptic('warning'); sfx(200, .2, 'triangle', .04, -80);
  }
  return {
    reset() {
      v?.off(); v?.recenter();
      score = 0; misses = 0; streak = 0; flight = null; flick = null; msg = null; msgT = 0; t = 0; binA = 0; wind = 0;
      if (v) { place(true); ball.visible = false; held.visible = true; conf.clear(); }
    },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      if (!v) return; v.live(); if (v.calibrating) return;   // floor calibration open: pause t += dt; msgT -= dt;
      if (flight) {
        const F = flight, steps = 4, h = dt / steps;
        for (let k = 0; k < steps && !F.done; k++) {
          F.v.addScaledVector(F.wr, wind * .55 * h); F.v.y -= 9.8 * h; F.p.addScaledVector(F.v, h); F.t += h;
          // relative to the bin
          const lx = F.p.x - bx, lz = F.p.z - bz, ly = F.p.y - FLOOR, r = Math.hypot(lx, lz);
          // rim: a ring at the top of the bin; bounce off it
          const dr = r - BR, dy = ly - BH, dRim = Math.hypot(dr, dy);
          if (dRim < PR + .012) {
            const nx = dr / (dRim || 1) * (lx / (r || 1)), ny = dy / (dRim || 1), nz = dr / (dRim || 1) * (lz / (r || 1));
            const vn = F.v.x * nx + F.v.y * ny + F.v.z * nz;
            if (vn < 0) { F.v.x -= 1.6 * vn * nx; F.v.y -= 1.6 * vn * ny; F.v.z -= 1.6 * vn * nz; F.v.multiplyScalar(.75); if (!F.touched) { haptic('tick'); sfx(1400, .05, 'square', .03, -300); } F.touched = true; }
            F.p.x += nx * .004; F.p.y += ny * .004; F.p.z += nz * .004;
          }
          // in: dropped below the rim inside the bin
          if (ly < BH - PR && ly > 0 && r < BR - PR * .5 && F.v.y < 0 && !F.inside) { F.inside = true; scored(!F.touched); }
          if (F.inside) { if (r > BR * .8 - PR) { F.v.x *= -.4; F.v.z *= -.4; F.p.x = bx + lx * .97; F.p.z = bz + lz * .97; } if (ly < PR) { F.p.y = FLOOR + PR; F.v.set(0, 0, 0); F.done = .5; } }
          // outside wall
          else if (ly < BH && ly > 0 && r < BR + PR && r > BR - PR) { const ux = lx / r, uz = lz / r, vn = F.v.x * ux + F.v.z * uz; if (vn < 0) { F.v.x -= 1.5 * vn * ux; F.v.z -= 1.5 * vn * uz; } F.touched = true; }
          // floor
          if (!F.inside && F.p.y < FLOOR + PR) { F.p.y = FLOOR + PR; F.v.y *= -.3; F.v.x *= .5; F.v.z *= .5; if (Math.abs(F.v.y) < .3) { F.done = .7; missed(); } }
          if (F.t > 4 && !F.done) { F.done = .2; missed(); }
        }
        ball.position.copy(F.p); ball.rotation.x += F.spin.x * dt * (F.done ? 0 : 1); ball.rotation.y += F.spin.y * dt * (F.done ? 0 : 1);
        if (F.done) {
          F.done -= dt;
          if (F.done <= 0) {
            flight = null; ball.visible = false; held.visible = true;
            if (misses >= MISSES) { v.off(); return api.over(); }
            if (F.inside) place(false);
          }
        }
      }
      conf.update(dt);
    },
    fx(dt) { if (v) conf.update(dt); },
    draw(c) {
      if (!v) { setup(); this.reset(); }
      v.look(1 / 60);
      held.visible = !flight && !v.calibrating;
      held.rotation.y = t * .6; held.position.y = -.16 + (flick ? Math.min(.04, (flick.y0 - flick.y) / H * .1) : 0);
      v.draw(c, W, H);
      v.pointers(c, W, H, [{ p: vtmp.set(bx, FLOOR + BH / 2, bz), col: '#8affdc' }]);
      // HUD: misses, wind, distance
      c.save(); c.font = '700 12px Rubik, sans-serif'; c.textAlign = 'left'; c.fillStyle = '#fff';
      c.fillText('PAPER', 14, 40);
      for (let i = 0; i < MISSES; i++) { c.fillStyle = i < MISSES - misses ? '#f2f0ea' : '#ffffff30'; c.beginPath(); c.arc(20 + i * 18, 22, 6, 0, 7); c.fill(); }
      const dist = Math.hypot(bx, bz);
      c.textAlign = 'right'; c.fillStyle = '#04110ecc'; c.beginPath(); c.roundRect(W - 112, 12, 98, 40, 10); c.fill();
      c.fillStyle = '#8affdc'; c.font = '600 10px Rubik, sans-serif'; c.fillText(`BIN ${dist.toFixed(1)} m`, W - 22, 28);
      c.fillStyle = '#fff'; c.font = '700 12px Rubik, sans-serif'; c.fillText(wind ? `WIND ${wind > 0 ? '→' : '←'} ${Math.abs(wind).toFixed(1)}` : 'NO WIND', W - 22, 44);
      if (msgT > 0 && msg) { c.textAlign = 'center'; c.font = '800 26px Rubik, sans-serif'; c.globalAlpha = Math.min(1, msgT * 2); c.lineWidth = 4; c.strokeStyle = '#000a'; c.strokeText(msg.s, W / 2, H * .3); c.fillStyle = msg.col; c.fillText(msg.s, W / 2, H * .3); c.globalAlpha = 1; }
      if (!flight && !flick && score === 0 && misses === 0) { c.textAlign = 'center'; c.font = '600 12px Rubik, sans-serif'; c.fillStyle = '#ffffffd0'; c.fillText('Flick up to throw', W / 2, H - 52); }
      c.restore();
      arNote(c, v, W, H);
    },
    down(x, y, id) { if (v?.input?.('down', x, y, id)) return; if (flight || flick) return; flick = { x0: x, y0: y, x, y, id, t: performance.now() }; },
    move(x, y, pressed, id) { if (v?.input?.('move', x, y, id, pressed)) return; if (flick && flick.id === id) { flick.x = x; flick.y = y; } },
    up(x, y, id) {
      if (v?.input?.('up', x, y, id)) return;
      if (!flick || flick.id !== id) return;
      const dx = x - flick.x0, dy = y - flick.y0, ms = performance.now() - flick.t; flick = null;
      if (dy < -25 && ms < 1500 && !flight) throwBall(dx, -dy, ms);
    },
  };
}

export default {
  id: 'bin-flick',
  title: 'Bin Flick',
  tag: 'AR · Sports',
  retro: true, era: 'ar', pal: 'grape',
  w: 300, h: 460, maxW: 600, maxH: 680,
  goal: 10, reward: 20,
  hint: 'A bin appears on your real floor through the camera. Flick a paper ball up the screen to throw it: longer, faster flicks go further. Mind the wind. A swish scores double, each basket moves the bin (follow the arrow), and three misses end it.',
  traits: ['theme:office'],
  make,
};

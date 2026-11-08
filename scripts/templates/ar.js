// __TITLE__: a starter AR · 3D game made with `npm run new`. Change anything you like.
// 3D in the player's real room (src/kit/ar3d.js, see docs/ar-3d.md): the camera picture behind, the
// gyro to look around, a virtual room and drag-to-look when either is missing. Shows gestures (tap
// to pop, drag to look), sounds and 2D juice on the HUD.
import gs from '../gamescroll.js';
const { sounds } = gs.sound;
const { haptic, want } = gs.device;
const { Juice } = gs.juice;
const { Gestures } = gs.controls;
const { Particles, pbr, THREE } = gs.hd;
const { ARView, arNote, FLOOR } = gs.ar;

let W = 300, H = 460;
const COLS = ['#ff4d6d', '#ffd23f', '#3ddc97', '#4fc3ff', '#b388ff'];

function make(api) {
  want('motion');                     // iPhones ask for motion access on the Play tap
  const fx = new Juice();
  let v, balloons, pops, score, t, spawn, escaped;
  const g = new Gestures({
    tap: (x, y) => tapAt(x, y),
    drag: (x, y, dx, dy) => v?.drag(-dx, -dy),   // no gyro: drag to look around
  });

  function setup() {
    v = new ARView();
    pops = new Particles(v, { max: 300, additive: false });
  }
  function addBalloon() {
    // anywhere round the player, 2-4 m away, so they have to turn to find them
    const a = Math.random() * Math.PI * 2 * (v.sensor ? 1 : .15) - (v.sensor ? Math.PI : .15 * Math.PI), d = 2 + Math.random() * 2;
    const col = COLS[(Math.random() * COLS.length) | 0];
    const m = new THREE.Mesh(new THREE.SphereGeometry(.18, 24, 16), pbr(col, { rough: .25, clear: 1 }));
    m.scale.y = 1.2; m.castShadow = true; m.position.set(-Math.sin(a) * d, FLOOR + .3, -Math.cos(a) * d);
    m.userData = { col, rise: .25 + Math.random() * .2 + t * .004 };
    v.scene.add(m); balloons.push(m);
  }
  function tapAt(x, y) {
    if (!v) return;
    let best = null, bd = 34;
    for (const b of balloons) { const [sx, sy, z] = v.toScreen(b.position.x, b.position.y, b.position.z); const d = Math.hypot(sx - x, sy - y); if (z < 1 && d < bd) { bd = d; best = b; } }
    if (!best) return;
    score++; api.score(score); sounds.pop(1 + Math.random() * .3); haptic('medium');
    const c = new THREE.Color(best.userData.col);
    for (let i = 0; i < 40; i++) pops.emit({ x: best.position.x, y: best.position.y, z: best.position.z, vx: (Math.random() - .5) * 2.4, vy: Math.random() * 2, vz: (Math.random() - .5) * 2.4, life: 1.2, size: .03, col: [c.r, c.g, c.b], drag: 1.5, grav: 3, floor: FLOOR });
    fx.pop(x, y - 20, '+1', { size: 20 });
    v.scene.remove(best); balloons.splice(balloons.indexOf(best), 1);
  }

  return {
    reset() {
      if (!v) setup();
      v.off(); v.recenter();
      for (const b of balloons || []) v.scene.remove(b);
      balloons = []; score = 0; t = 0; spawn = 0; escaped = 0; pops.clear(); fx.clear(); g.release();
    },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      v.live(); fx.update(dt); t += dt; spawn -= dt;
      if (spawn <= 0) { spawn = Math.max(.7, 2 - t / 30); addBalloon(); }
      for (const b of [...balloons]) {
        b.position.y += b.userData.rise * dt; b.position.x += Math.sin(t * 1.3 + b.id) * .1 * dt;
        if (b.position.y > 2.2) { v.scene.remove(b); balloons.splice(balloons.indexOf(b), 1); escaped++; sounds.hurt(); haptic('warning'); fx.flash('#ff4060', .2); }
      }
      pops.update(dt);
      if (escaped >= 5) { v.off(); sounds.lose(); api.over(); }
    },
    draw(c) {
      v.look();
      v.draw(c, W, H);                                   // camera picture (or virtual room) + 3D
      v.pointers(c, W, H, balloons.map(b => ({ p: b.position, col: b.userData.col })));   // arrows to balloons off screen
      fx.begin(c); fx.end(c, W, H);
      c.fillStyle = '#fff'; c.font = '700 16px Rubik, sans-serif'; c.textAlign = 'left'; c.fillText('Escaped ' + escaped + '/5', 14, 26);
      arNote(c, v, W, H);
    },
    down: (x, y, id) => g.down(x, y, id),
    move: (x, y, p, id) => g.move(x, y, p, id),
    up: (x, y, id) => g.up(x, y, id),
  };
}

export default {
  id: '__ID__',
  title: '__TITLE__',
  tag: 'AR · Arcade',
  retro: true, era: 'ar', pal: 'grape',
  w: 300, h: 460, maxW: 600, maxH: 680,
  goal: 20,
  hint: 'Balloons float up around your room. Turn the phone to find them and tap to pop them before five escape. No camera? Drag to look around.',
  creator: '__CREATOR__',
  make,
};

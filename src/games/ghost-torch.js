// Ghost Torch: little ghosts are drifting about your room, and you only have a torch. Turn the phone to
// sweep its circle of light across them: a ghost caught in the light shivers, then pops into sparkles.
// They creep closer while you're not looking. Let one reach you and it blows out a candle. Three candles.
import gs from '../gamescroll.js';
const { sounds, sfx, notes } = gs.sound;
const { haptic, want } = gs.device;
const { Juice } = gs.juice;
const { Gestures } = gs.controls;
const { Particles, pbr, THREE } = gs.hd;
const { ARView, arNote } = gs.ar;
const { rnd } = gs.util;

let W = 300, H = 460;

function make(api) {
  want('motion');
  const fx = new Juice();
  let v, geo, ghosts, sparks, score, candles, t, spawnT, on, ended;
  const g = new Gestures({
    tap: () => { if (!on) { on = true; sounds.click(); haptic('light'); } },
    drag: (x, y, dx, dy) => { on = true; v?.drag(-dx, -dy); },
  });
  const R = () => Math.min(W, H) * .26;   // the torch circle on screen

  function setup() {
    v = new ARView();
    sparks = new Particles(v, { max: 400, additive: true });
    geo = { head: new THREE.SphereGeometry(.2, 20, 14), skirt: new THREE.ConeGeometry(.2, .38, 20, 1, true), eye: new THREE.SphereGeometry(.035, 8, 6) };
  }
  function drop(gh) { v.scene.remove(gh.m); gh.m.userData.mat.dispose(); gh.m.userData.eyeMat.dispose(); }
  function ghostMesh() {
    const m = new THREE.Group();
    const mat = pbr('#e8f0ff', { glow: .8, rough: .4, transparent: true, opacity: .1, depthWrite: false });
    const head = new THREE.Mesh(geo.head, mat); head.position.y = .1;
    const skirt = new THREE.Mesh(geo.skirt, mat); skirt.rotation.x = Math.PI; skirt.position.y = -.1;
    const eyeMat = new THREE.MeshBasicMaterial({ color: '#101020', transparent: true, opacity: .1 });
    const e1 = new THREE.Mesh(geo.eye, eyeMat), e2 = e1.clone(); e1.position.set(-.07, .14, .18); e2.position.set(.07, .14, .18);
    m.add(head, skirt, e1, e2); m.userData = { mat, eyeMat };
    return m;
  }
  function addGhost() {
    // anywhere round you; with no gyro, mostly in front so dragging finds them quickly
    const spread = v.sensor ? Math.PI : Math.PI * .5, a = rnd(-spread, spread), d = rnd(3, 4.5);
    const m = ghostMesh(); v.scene.add(m);
    ghosts.push({ m, a, d, y: rnd(-.4, .6), lit: 0, bob: Math.random() * 6, speed: rnd(.12, .2) + Math.min(.2, t / 400) });
  }
  function place(gh) { gh.m.position.set(-Math.sin(gh.a) * gh.d, gh.y + Math.sin(t * 2 + gh.bob) * .08, -Math.cos(gh.a) * gh.d); gh.m.lookAt(0, gh.m.position.y, 0); }

  return {
    reset() {
      if (!v) setup();
      v.off(); v.recenter();
      for (const gh of ghosts || []) drop(gh);
      ghosts = []; score = 0; candles = 3; t = 0; spawnT = 0; on = false; ended = false; sparks.clear(); fx.clear(); g.release();
    },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      v.live(); fx.update(dt); sparks.update(dt);
      if (!on || ended) return;
      t += dt; spawnT -= dt;
      if (spawnT <= 0 && ghosts.length < 7) { spawnT = Math.max(1.6, 3.6 - t / 40); addGhost(); }
      for (const gh of [...ghosts]) {
        place(gh);
        const [sx, sy, z] = v.toScreen(gh.m.position.x, gh.m.position.y, gh.m.position.z);
        const inLight = z < 1 && Math.hypot(sx - W / 2, sy - H / 2) < R();
        if (inLight) { gh.lit += dt; if ((t * 20 | 0) % 3 === 0) haptic('tick'); }
        else { gh.lit = Math.max(0, gh.lit - dt * .5); gh.d -= gh.speed * dt; }
        const show = inLight ? .35 + Math.min(.6, gh.lit) : .1;
        gh.m.userData.mat.opacity = show; gh.m.userData.eyeMat.opacity = show;
        gh.m.position.x += inLight ? Math.sin(t * 60) * .02 * gh.lit : 0;
        if (gh.lit >= 1) {
          score++; api.score(score); notes('E6 G6', { len: .05, vol: .04 }); haptic('success');
          const p = gh.m.position;
          for (let i = 0; i < 50; i++) sparks.emit({ x: p.x, y: p.y, z: p.z, vx: rnd(-1.5, 1.5), vy: rnd(-.5, 2), vz: rnd(-1.5, 1.5), life: 1, size: .04, col: [2, 2.4, 3], drag: 1.5, grav: -.5 });
          fx.pop(sx, sy - 20, '+1', { size: 20, color: '#cfe8ff' });
          drop(gh); ghosts.splice(ghosts.indexOf(gh), 1);
        } else if (gh.d < .7) {
          candles--; sfx(220, .5, 'sine', .06, -120); haptic('error'); fx.flash('#203060', .5).shake(5);
          drop(gh); ghosts.splice(ghosts.indexOf(gh), 1);
          if (candles <= 0) { ended = true; v.off(); sounds.lose(); api.over(); }
        }
      }
    },
    draw(c) {
      v.look();
      v.draw(c, W, H);
      // darkness everywhere but the torch circle
      const r = R(), grd = c.createRadialGradient(W / 2, H / 2, r * .7, W / 2, H / 2, r * 1.15);
      grd.addColorStop(0, '#00000000'); grd.addColorStop(1, on ? '#000010d8' : '#000010a0');
      c.fillStyle = grd; c.fillRect(0, 0, W, H);
      c.strokeStyle = '#fff4c040'; c.lineWidth = 2; c.beginPath(); c.arc(W / 2, H / 2, r, 0, 7); c.stroke();
      v.pointers(c, W, H, ghosts.filter(gh => gh.d < 2.2).map(gh => ({ p: gh.m.position, col: '#9fc4ff' })));
      fx.begin(c); fx.end(c, W, H);
      // candles
      for (let i = 0; i < 3; i++) { const x = 18 + i * 18; c.fillStyle = i < candles ? '#f4ecd8' : '#ffffff30'; c.fillRect(x - 3, 18, 6, 14); if (i < candles) { c.fillStyle = '#ffb040'; c.beginPath(); c.ellipse(x, 13 + Math.sin(t * 9 + i) * .6, 2.5, 4, 0, 0, 7); c.fill(); } }
      c.textAlign = 'center';
      if (!on) { c.fillStyle = '#fff'; c.font = '700 16px Rubik, sans-serif'; c.fillText('Tap to switch on your torch', W / 2, H * .78); c.font = '500 12px Rubik, sans-serif'; c.fillStyle = '#cfe0ff'; c.fillText('Turn the phone (or drag) to catch ghosts in the light', W / 2, H * .78 + 20); }
      arNote(c, v, W, H);
    },
    down: (x, y, id) => g.down(x, y, id),
    move: (x, y, p, id) => g.move(x, y, p, id),
    up: (x, y, id) => g.up(x, y, id),
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'ghost-torch',
  title: 'Ghost Torch',
  tag: 'AR · Spooky',
  retro: true, era: 'ar', pal: 'grape',
  w: 300, h: 460, maxW: 600, maxH: 680,
  goal: 20,
  hint: 'Little ghosts drift round your room. Turn the phone to hold them in your torch light until they pop. Let one reach you and it blows out a candle. No camera? Drag to look around.',
  make,
};

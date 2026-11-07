// __TITLE__: a starter Next Gen · Console game made with `npm run new`. Change anything you like.
// Modern HD 3D (src/kit/hd3d.js, see docs/nextgen-3d.md): PBR materials, real shadows, bloom and
// GPU particles. Shows the two-thumb layout (stick + boost button), sounds and 2D juice for the HUD.
import { haptic } from '../kit/device.js';
import { HDView, Particles, pbr, rbox, sun, surface, speckle, THREE } from '../kit/hd3d.js';
import { Juice } from '../kit/juice.js';
import { sounds } from '../kit/sound.js';
import { twoThumb, Keys } from '../kit/controls.js';

let W = 300, H = 300;
const ARENA = 9;   // metres from the centre to the edge

let v, ball, orbs, sparks, light;
function setup() {
  v = new HDView({ bg: '#0a0e16', fog: .045, env: .4, amb: .35 });
  light = sun('#fff0dc', 3.2, 14); v.scene.add(light, light.target); v.onTier(T => light.setTier(T));
  const tiles = surface(256, ({ col, h, size: S }) => {
    col.fillStyle = '#2a3140'; col.fillRect(0, 0, S, S); speckle(col, S, 700, '#11151d', 1.5, .3);
    h.fillStyle = '#000'; for (let i = 0; i <= S; i += 64) { h.fillRect(i - 2, 0, 4, S); h.fillRect(0, i - 2, S, 4); }
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(ARENA * 2, ARENA * 2), pbr('#ffffff', { tex: tiles, rep: [5, 5], rough: .45, metal: .2 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; v.scene.add(floor);
  for (const [x, z, w, d] of [[0, -ARENA, ARENA * 2, .6], [0, ARENA, ARENA * 2, .6], [-ARENA, 0, .6, ARENA * 2], [ARENA, 0, .6, ARENA * 2]]) {
    const wall = new THREE.Mesh(rbox(w, .8, d, .12), pbr('#5a6578', { rough: .3, metal: .6 })); wall.position.set(x, .4, z); wall.castShadow = wall.receiveShadow = true; v.scene.add(wall);
  }
  ball = new THREE.Mesh(new THREE.SphereGeometry(.45, 32, 20), pbr('#e8eef8', { rough: .15, metal: .9, clear: 1 }));
  ball.castShadow = true; v.scene.add(ball);
  const orbMat = pbr('#40e0ff', { glow: 3, rough: .2 });
  orbs = []; for (let i = 0; i < 4; i++) { const o = new THREE.Mesh(new THREE.IcosahedronGeometry(.28, 1), orbMat); o.castShadow = true; v.scene.add(o); orbs.push(o); }
  sparks = new Particles(v, { max: 300, additive: true });
}

function make(api) {
  const fx = new Juice();
  const pad = twoThumb(W, H, { right: ['GO'] });
  const keys = new Keys();
  let vel, score, t, time, boost;
  const spot = o => { o.position.set((Math.random() * 2 - 1) * (ARENA - 1.5), .6, (Math.random() * 2 - 1) * (ARENA - 1.5)); };

  return {
    reset() {
      if (!v) setup();
      ball.position.set(0, .45, 0); vel = new THREE.Vector3(); score = 0; t = 0; time = 30; boost = 0;
      orbs.forEach(spot); sparks.clear(); fx.clear(); pad.release(); keys.clear();
    },
    resize(w, h) { W = w; H = h; pad.layout(w, h); },
    update(dt) {
      fx.update(dt); t += dt; time -= dt; boost = Math.max(0, boost - dt);
      const k = keys.axis(), ax = pad.left.active ? pad.left.x : k.x, az = pad.left.active ? pad.left.y : k.y;
      if ((pad.buttons.GO.pressed() || keys.held(' ')) && boost <= 0) { boost = 1.2; sounds.powerup(); haptic('medium'); fx.shake(3); }
      const acc = boost > .6 ? 34 : 16;
      vel.x += ax * acc * dt; vel.z += az * acc * dt; vel.multiplyScalar(Math.exp(-1.6 * dt));
      ball.position.addScaledVector(vel, dt);
      for (const a of ['x', 'z']) if (Math.abs(ball.position[a]) > ARENA - .75) { ball.position[a] = Math.sign(ball.position[a]) * (ARENA - .75); if (Math.abs(vel[a]) > 2) { sounds.hit(); haptic('light'); fx.shake(2); } vel[a] *= -.6; }
      ball.rotation.x += vel.z * dt / .45; ball.rotation.z -= vel.x * dt / .45;
      for (const o of orbs) {
        o.rotation.y += dt * 2; o.position.y = .6 + Math.sin(t * 3 + o.position.x) * .12;
        if (o.position.distanceTo(ball.position) < .8) {
          score++; api.score(score); time = Math.min(30, time + 2); sounds.coin(1 + score * .01); haptic('light');
          for (let i = 0; i < 26; i++) sparks.emit({ x: o.position.x, y: o.position.y, z: o.position.z, vx: (Math.random() - .5) * 6, vy: Math.random() * 5, vz: (Math.random() - .5) * 6, life: .7, size: .12, col: [.6, 2.4, 3], drag: 1.5, grav: 6, floor: .02 });
          const [sx, sy] = v.toScreen(o.position.x, o.position.y + .5, o.position.z); fx.pop(sx, sy, '+1 · +2s', { color: '#8ff' });
          spot(o);
        }
      }
      if (boost > .6) sparks.emit({ x: ball.position.x, y: .1, z: ball.position.z, vx: -vel.x * .2, vy: .5, vz: -vel.z * .2, life: .4, size: .1, col: [3, 1.6, .5], drag: 2 });
      sparks.update(dt);
      if (time <= 0) { sounds.lose(); api.over(); }
    },
    draw(c) {
      const p = ball.position;
      v.cam.position.set(p.x * .6, 9, p.z * .6 + 8); v.cam.lookAt(p.x * .8, 0, p.z * .8);
      light.follow(p.x, 0, p.z);
      fx.begin(c); v.render(c, W, H); fx.end(c, W, H);
      pad.draw(c);
      c.fillStyle = time < 8 && (t * 4 | 0) % 2 ? '#ff6070' : '#ffffffdd'; c.font = '700 18px Rubik, sans-serif'; c.textAlign = 'center';
      c.textAlign = 'left'; c.fillText(Math.ceil(Math.max(0, time)) + 's', 14, 28); c.textAlign = 'center';
      if (t < 3) { c.font = '500 12px Rubik, sans-serif'; c.fillStyle = '#fffc'; c.fillText('Left thumb: roll · GO: boost', W / 2, 46); }
    },
    down: (x, y, id) => pad.down(x, y, id),
    move: (x, y, pr, id) => pad.move(x, y, pr, id),
    up: (x, y, id) => pad.up(x, y, id),
    key: (k, d) => keys.key(k, d),
  };
}

export default {
  id: '__ID__',
  title: '__TITLE__',
  tag: 'Next Gen · Arcade',
  retro: true, era: 'nextgen', pal: 'grape',
  w: 300, h: 300, maxW: 600, maxH: 420,
  goal: 15,
  hint: 'Roll the chrome ball with your left thumb and collect the glowing orbs. Each one adds two seconds. Tap GO for a boost.',
  creator: '__CREATOR__',
  make,
};

import { clamp, rnd } from '../util.js';
import { sfx } from '../sfx.js';
import { haptic, want } from '../kit/device.js';
import { ARView, arNote, FLOOR } from '../kit/ar3d.js';
import { Particles, pbr, rbox, THREE } from '../kit/hd3d.js';
const { Group, Mesh, TorusGeometry, CylinderGeometry, IcosahedronGeometry, ConeGeometry, Vector3 } = THREE;

// Hoop Drone: a tiny racing drone buzzes round your room and flies wherever you point the phone.
// Steer it through the glowing hoops floating around you before the clock runs out; every hoop adds
// time and the next one is further round, higher or lower. Spiky mines drift between the hoops:
// clip one and you lose time. The drone has weight, so lead your turns.
let W = 300, H = 460;
const HOOP = .36;

let MT = null;
function looks() {
  if (MT) return MT;
  MT = {
    shell: pbr('#f2f4f8', { rough: .25, clear: 1 }), carbon: pbr('#1c1f24', { rough: .35, metal: .6, clear: .5 }), prop: pbr('#202428', { rough: .5, transparent: true, opacity: .45 }),
    led: pbr('#19e3b1', { glow: 3 }), tail: pbr('#ff3a3a', { glow: 3 }),
    hoop: pbr('#19e3b1', { glow: 2.2, rough: .3 }), next: pbr('#2a8cff', { glow: .9, rough: .3, transparent: true, opacity: .55 }), frame: pbr('#d0d6de', { rough: .2, metal: 1 }),
    mine: pbr('#2a2e36', { rough: .3, metal: .9 }), spike: pbr('#ff3a50', { glow: 1.6 }),
    G: { torus: new TorusGeometry(HOOP, .025, 12, 56), frame: new TorusGeometry(HOOP + .035, .01, 6, 56), cyl: new CylinderGeometry(1, 1, 1, 16), ico: new IcosahedronGeometry(1, 1), cone: new ConeGeometry(1, 1, 6) },
  };
  return MT;
}
function makeDrone() {
  const m = looks(), g = new Group(), props = [];
  const body = new Mesh(rbox(.09, .035, .12, .015), m.shell); g.add(body);
  const cam = new Mesh(rbox(.035, .03, .03, .008), m.carbon); cam.position.set(0, -.005, -.07); g.add(cam);
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const arm = new Mesh(rbox(.11, .012, .018, .005), m.carbon); arm.position.set(x * .045, 0, z * .045); arm.rotation.y = x * z > 0 ? -Math.PI / 4 : Math.PI / 4; g.add(arm);
    const mot = new Mesh(m.G.cyl, m.carbon); mot.scale.set(.014, .02, .014); mot.position.set(x * .08, .01, z * .08); g.add(mot);
    const pr = new Mesh(m.G.cyl, m.prop); pr.scale.set(.05, .002, .05); pr.position.set(x * .08, .022, z * .08); g.add(pr); props.push(pr);
    const led = new Mesh(m.G.cyl, z < 0 ? m.led : m.tail); led.scale.set(.006, .006, .006); led.position.set(x * .08, -.006, z * .08); g.add(led);
  }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  g.userData.props = props; return g;
}
function makeHoop() {
  const m = looks(), g = new Group();
  const ring = new Mesh(m.G.torus, m.hoop), frame = new Mesh(m.G.frame, m.frame);
  ring.castShadow = frame.castShadow = true; g.add(ring, frame); g.userData.ring = ring; return g;
}
function makeMine() {
  const m = looks(), g = new Group(), core = new Mesh(m.G.ico, m.mine); core.scale.setScalar(.07); g.add(core);
  for (const d of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
    const s = new Mesh(m.G.cone, m.spike); s.scale.set(.025, .06, .025); s.position.set(d[0] * .085, d[1] * .085, d[2] * .085);
    s.lookAt(d[0] * 2, d[1] * 2, d[2] * 2); s.rotateX(Math.PI / 2); g.add(s);
  }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; }); return g;
}

function make(api) {
  want('motion');
  let v, drone, hoops, mines, fx, pos, vel, time, score, t, lastA, flash, msg, msgT, tap, buzzT;
  const aim = new Vector3(), f = new Vector3(), tmp = new Vector3(), prev = new Vector3(), nrm = new Vector3(), O = new Vector3();
  let fresh = false;   // during reset: the new round starts at the origin, whatever last round's position was
  const eye = () => !fresh && v.eyePos || O;   // where the player is (older app kits keep it at the origin)
  function setup() {
    v = new ARView();
    drone = makeDrone(); v.scene.add(drone);
    hoops = [0, 1, 2].map(() => { const h = makeHoop(); v.scene.add(h); return { g: h, p: new Vector3() }; });
    mines = [0, 1, 2, 3].map(() => { const g = makeMine(); g.visible = false; v.scene.add(g); return { g, p: new Vector3(), ph: rnd(0, 6), on: false }; });
    fx = new Particles(v, { max: 300, additive: true });
  }
  // the next hoop: a turn left or right from the last, at a new height and distance
  function nextSpot(out) {
    lastA += (Math.random() < .5 ? -1 : 1) * rnd(.45, Math.min(1.5, .6 + score * .06));
    const d = rnd(2, 3), y = clamp(rnd(-.7, .8), FLOOR + .5, 1.2), e = eye();
    return out.set(e.x - Math.sin(lastA) * d, y, e.z - Math.cos(lastA) * d);
  }
  // hoops face the player, so you fly straight through them
  function placeHoop(h, p) { const e = eye(); h.p.copy(p); h.g.position.copy(p); h.g.lookAt(e.x, p.y, e.z); }
  function advance() {
    const [a, b, c] = hoops; hoops = [b, c, a];
    placeHoop(a, nextSpot(tmp));
    hoops.forEach((h, i) => { h.g.userData.ring.material = i ? looks().next : looks().hoop; h.g.visible = i < 2; });   // this hoop and a hint of the next
    // a mine somewhere between this hoop and the next, more of them later on
    const free = mines.find(m => !m.on), n = mines.filter(m => m.on).length;
    if (free && score >= 2 && n < Math.min(4, 1 + score / 5)) { free.on = true; free.g.visible = true; free.p.copy(hoops[0].p).lerp(hoops[1].p, rnd(.35, .65)); free.p.y += rnd(-.15, .15); free.g.position.copy(free.p); }
  }
  function say(s, col) { msg = { s, col }; msgT = 1; }
  return {
    reset() {
      v?.off(); v?.recenter();
      time = 12; score = 0; t = 0; lastA = 0; flash = 0; msg = null; msgT = 0; tap = null; buzzT = 0;
      if (v) {
        pos = new Vector3(0, -.15, -.7); vel = new Vector3(); drone.position.copy(pos);
        fresh = true;
        placeHoop(hoops[0], tmp.set(0, -.1, -2.2)); lastA = 0;
        placeHoop(hoops[1], nextSpot(tmp)); placeHoop(hoops[2], nextSpot(tmp));
        fresh = false;
        hoops.forEach((h, i) => { h.g.userData.ring.material = i ? looks().next : looks().hoop; h.g.visible = i < 2; });
        mines.forEach(m => { m.on = false; m.g.visible = false; }); fx.clear();
      }
    },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      if (!v) return; v.live(); if (v.calibrating) return;   // floor calibration open: pause
      t += dt; msgT -= dt; flash = Math.max(0, flash - dt * 2);
      time -= dt; if (time <= 0) { time = 0; v.off(); haptic('error'); return api.over(); }
      // target: along where the phone points, as far out as the hoop you're going for
      // aim a little past the hoop's depth along that line, so pointing at the hoop flies the drone through it
      const cur = hoops[0]; v.forward(f);
      const along = tmp.copy(cur.p).sub(eye()).dot(f);
      aim.copy(f).multiplyScalar(clamp(along + .45, .5, 3.6)).add(eye());
      aim.y = clamp(aim.y, FLOOR + .15, 1.6);
      prev.copy(pos);
      // spring towards it with drag: weighty, but quick to respond
      tmp.copy(aim).sub(pos).multiplyScalar(14).addScaledVector(vel, -5.2);
      vel.addScaledVector(tmp, dt); if (vel.length() > 4) vel.setLength(4);
      pos.addScaledVector(vel, dt); if (pos.y < FLOOR + .06) { pos.y = FLOOR + .06; vel.y = Math.abs(vel.y) * .3; }
      // drone attitude: face along travel and bank into turns
      drone.position.copy(pos);
      const hv = Math.hypot(vel.x, vel.z);
      if (hv > .05) drone.rotation.y += (((Math.atan2(-vel.x, -vel.z) - drone.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * Math.min(1, dt * 8);
      drone.rotation.x = clamp(-hv * .18, -.5, .5); drone.rotation.z = clamp(Math.sin(t * 9) * .03, -.5, .5);
      for (const p of drone.userData.props) p.rotation.y += dt * 60;
      if (Math.random() < .5) fx.emit({ x: pos.x, y: pos.y - .02, z: pos.z, vx: rnd(-.1, .1), vy: -.4, vz: rnd(-.1, .1), life: .35, size: .025, col: [.3, 2.2, 1.8], a: .5 });
      // through the hoop? crossing its plane inside the ring (or passing right by its middle)
      nrm.set(0, 0, 1).applyQuaternion(cur.g.quaternion);
      const s0 = tmp.copy(prev).sub(cur.p).dot(nrm), s1 = tmp.copy(pos).sub(cur.p).dot(nrm);
      const crossed = s0 * s1 <= 0 && s0 !== s1 && tmp.copy(pos).sub(prev).multiplyScalar(s0 / (s0 - s1)).add(prev).distanceTo(cur.p) < HOOP * .95;
      if (crossed || pos.distanceTo(cur.p) < HOOP * .6) {
        score++; api.score(score); const bonus = Math.max(1.2, 3 - score * .08); time += bonus;
        for (let i = 0; i < 46; i++) { const a = i / 46 * 6.28; tmp.set(Math.cos(a) * HOOP, Math.sin(a) * HOOP, 0).applyQuaternion(cur.g.quaternion).add(cur.p); fx.emit({ x: tmp.x, y: tmp.y, z: tmp.z, vx: (tmp.x - cur.p.x) * 3, vy: (tmp.y - cur.p.y) * 3, vz: (tmp.z - cur.p.z) * 3, life: .6, size: .04, col: [.6, 3, 2.4], drag: 3 }); }
        say(`+${bonus.toFixed(1)}s`, '#8affdc'); haptic('success'); sfx(700 + Math.min(score, 20) * 25, .12, 'triangle', .05, 300);
        advance();
      }
      // mines bob about; touching one costs time and knocks you back
      for (const m of mines) {
        if (!m.on) continue; m.ph += dt; m.g.position.set(m.p.x, m.p.y + Math.sin(m.ph * 2) * .08, m.p.z); m.g.rotation.y += dt; m.g.rotation.x += dt * .7;
        if (pos.distanceTo(m.g.position) < .14) {
          m.on = false; m.g.visible = false; time = Math.max(0, time - 3); flash = 1; vel.addScaledVector(tmp.copy(pos).sub(m.g.position).normalize(), 3);
          for (let i = 0; i < 40; i++) fx.emit({ x: m.g.position.x, y: m.g.position.y, z: m.g.position.z, vx: rnd(-2, 2), vy: rnd(-1, 2.5), vz: rnd(-2, 2), life: rnd(.3, .7), size: rnd(.03, .06), col: [3, .8, .4], drag: 2, grav: 3 });
          say('-3s', '#ff6a7a'); haptic('heavy'); sfx(110, .3, 'sawtooth', .07, -60);
        }
      }
      buzzT -= dt; if (buzzT <= 0) { buzzT = .5; sfx(150 + vel.length() * 40, .08, 'sawtooth', .008, 20); }
      fx.update(dt);
    },
    fx(dt) { if (v) fx.update(dt); },
    draw(c) {
      if (!v) { setup(); this.reset(); }
      v.look(1 / 60);
      for (const h of hoops) h.g.userData.ring.rotation.z += .01;
      v.draw(c, W, H);
      v.pointers(c, W, H, [{ p: hoops[0].p, col: '#8affdc' }]);
      // aim dot where the drone is heading
      c.save(); c.strokeStyle = '#ffffffb0'; c.lineWidth = 1.5; c.beginPath(); c.arc(W / 2, H / 2, 6, 0, 7); c.stroke();
      // timer bar
      const tw = W - 120, k = clamp(time / 15, 0, 1);
      c.fillStyle = '#04110ecc'; c.beginPath(); c.roundRect(60, 16, tw, 12, 6); c.fill();
      c.fillStyle = time < 4 ? '#ff5a6a' : '#19e3b1'; c.beginPath(); c.roundRect(60, 16, Math.max(6, tw * k), 12, 6); c.fill();
      c.fillStyle = '#fff'; c.font = '700 12px Rubik, sans-serif'; c.textAlign = 'center'; c.fillText(`${time.toFixed(1)}s`, W / 2, 44);
      if (msgT > 0 && msg) { c.font = '800 22px Rubik, sans-serif'; c.globalAlpha = Math.min(1, msgT * 2); c.lineWidth = 4; c.strokeStyle = '#000a'; c.strokeText(msg.s, W / 2, H * .32); c.fillStyle = msg.col; c.fillText(msg.s, W / 2, H * .32); c.globalAlpha = 1; }
      if (score === 0) { c.font = '600 12px Rubik, sans-serif'; c.fillStyle = '#ffffffd0'; c.fillText(v.sensor ? 'Point the phone to fly the drone through the hoop' : 'Drag to steer the drone through the hoop', W / 2, H - 52); }
      c.restore();
      if (flash > 0) { c.fillStyle = `rgba(255,60,80,${flash * .3})`; c.fillRect(0, 0, W, H); }
      arNote(c, v, W, H);
    },
    down(x, y, id) { if (v?.input?.('down', x, y, id)) return; tap = { x, y, id }; },
    move(x, y, pressed, id) { if (v?.input?.('move', x, y, id, pressed)) return; if (!pressed || !tap || tap.id !== id) return; v.drag(x - tap.x, y - tap.y); tap.x = x; tap.y = y; },
    up(x, y, id) { if (v?.input?.('up', x, y, id)) return; tap = null; },
  };
}

export default {
  id: 'hoop-drone',
  title: 'Hoop Drone',
  tag: 'AR · Flying',
  retro: true, era: 'ar', pal: 'grape',
  w: 300, h: 460, maxW: 600, maxH: 680,
  goal: 15, reward: 20,
  hint: 'A tiny drone flies round your room through the camera, heading wherever you point your phone. Steer it through the glowing hoops before time runs out: each hoop adds time. Dodge the spiky mines. No motion sensor? Drag to steer.',
  traits: ['theme:scifi'],
  make,
};

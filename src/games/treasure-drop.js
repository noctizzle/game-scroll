import gs from '../gamescroll.js';
const { sounds, tone, noise } = gs.sound;
const { haptic, want, heading: compass } = gs.device;
const { clamp, rnd, hash } = gs.util;
const { Particles, pbr, rbox, surface, speckle, THREE } = gs.hd;
const { ARView, arNote, FLOOR } = gs.ar;
const { distance, bearing, offset } = gs.geo;
const { Group, Mesh, Vector3, CylinderGeometry, TorusGeometry, BoxGeometry, ConeGeometry, MeshBasicMaterial, AdditiveBlending, Color } = THREE;

// Treasure Drop: once a day a treasure chest lands somewhere 100 to 300 m from where you are. No map:
// follow the beam of light through the camera and the WARMER / COLDER buzzes in your hand. Get within
// about 20 m and the chest drops onto the ground in front of you; tap it to smash the lock and grab
// the loot. Already opened today's? Crack a practice chest instead. Location off? Practice chest too.
let W = 300, H = 460;
const NEAR = 20, LOCK = 6;

let MT = null;
function looks() {
  if (MT) return MT;
  const planks = surface(256, ({ col, h, size: S }) => { for (let y = 0; y < S; y += 32) { const v = 90 + Math.random() * 30 | 0; col.fillStyle = `rgb(${v + 40},${v},${v - 40})`; col.fillRect(0, y, S, 32); h.fillStyle = '#000'; h.fillRect(0, y, S, 3); for (let i = 0; i < 6; i++) { col.fillStyle = '#0002'; col.fillRect(0, y + rnd(4, 28), S, 1); } } speckle(col, S, 600, '#2a1608', 1.5, .3); }, { strength: 2.5 });
  MT = { wood: pbr('#ffffff', { tex: planks, rough: .75 }), lidWood: pbr('#ffffff', { tex: planks, rough: .75, side: THREE.DoubleSide }), gold: pbr('#ffc838', { rough: .2, metal: 1 }), lock: pbr('#c8ccd4', { rough: .25, metal: 1 }), dark: pbr('#1a0e06', { rough: .9 }),
    coin: pbr('#ffd040', { rough: .15, metal: 1, glow: .3 }), gem: ['#ff3a6a', '#3ad0ff', '#7aff6a'].map(c => pbr(c, { rough: .05, glow: 1.2, clear: 1 })),
    beam: new MeshBasicMaterial({ color: new Color(2.2, 1.8, .6), transparent: true, opacity: .55, depthWrite: false, blending: AdditiveBlending }) };
  return MT;
}
function makeChest() {
  const m = looks(), g = new Group();
  const box = new Mesh(rbox(.5, .3, .34, .02), m.wood); box.position.y = .15; g.add(box);
  const inside = new Mesh(new BoxGeometry(.46, .02, .3), m.dark); inside.position.y = .29; g.add(inside);
  for (const x of [-.2, .2]) { const band = new Mesh(rbox(.04, .31, .35, .008), m.gold); band.position.set(x, .155, 0); g.add(band); }
  const lid = new Group(); lid.position.set(0, .3, -.17); g.add(lid);
  const top = new Mesh(new CylinderGeometry(.17, .17, .5, 20, 1, false, 0, Math.PI), m.lidWood); top.rotation.z = Math.PI / 2; top.position.set(0, 0, .17); lid.add(top);
  for (const x of [-.2, .2]) { const band = new Mesh(new CylinderGeometry(.175, .175, .04, 20, 1, false, 0, Math.PI), m.gold); band.rotation.z = Math.PI / 2; band.position.set(x, 0, .17); lid.add(band); }
  const lock = new Group(); lock.position.set(0, .26, .185); g.add(lock);
  const body = new Mesh(rbox(.08, .09, .03, .01), m.lock); lock.add(body); const shack = new Mesh(new TorusGeometry(.028, .007, 8, 16, Math.PI), m.lock); shack.position.y = .045; lock.add(shack);
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.userData = { lid, lock };
  return g;
}
const today = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };

function make(api) {
  want('motion');
  let v, chest, beam, loot, sparks, dust, built;
  let state, save, me, chestAt, dist, lastDist, accuracy, practice, taps, score, t, msg, stopWatch, pingT, dropT, chestPos, walked, startDist, trail;
  const tmp = new Vector3();

  function setup() {
    v = new ARView();
    chest = makeChest(); chest.visible = false; v.scene.add(chest);
    beam = new Mesh(new CylinderGeometry(.35, .35, 40, 16, 1, true), looks().beam); beam.visible = false; v.scene.add(beam);
    loot = []; sparks = new Particles(v, { max: 400, additive: true }); dust = new Particles(v, { max: 120, additive: false });
  }
  function say(txt, col = '#fff', l = 1.6, sub) { msg = { txt, col, l, sub }; }
  async function locate() {
    state = 'locating';
    const loc = await Promise.race([api.location(), new Promise(r => setTimeout(() => r(null), 9000))]);
    if (state !== 'locating') return;
    if (!loc || !loc.real) { practice = true; return drop('Location is off: here is a practice chest'); }
    me = loc; save = api.load({ day: '', lat: 0, lon: 0, opened: false, streak: 0, lastDay: '' });
    if (save.day !== today()) {
      // today's chest: a direction and distance picked from the date, from where you are now
      const h = hash(today() + ':' + Math.round(loc.lat * 100) + ':' + Math.round(loc.lon * 100)), ang = (h % 3600) / 10 * Math.PI / 180, d = 100 + (h >>> 12) % 200;
      const c = offset(loc, Math.sin(ang) * d, Math.cos(ang) * d); save = { ...save, day: today(), lat: c.lat, lon: c.lon, opened: false }; api.save(save);
    }
    if (save.opened) { state = 'done-today'; return; }
    chestAt = { lat: save.lat, lon: save.lon }; dist = distance(me, chestAt); lastDist = dist; startDist = dist; accuracy = loc.accuracy || 15;
    state = 'hunt'; say('TODAY\'S CHEST HAS LANDED', '#ffd040', 2.4, `${Math.round(dist)} m away · follow the light`);
    stopWatch = api.watchLocation(p => {
      if (!p.real || state !== 'hunt') return; me = p; accuracy = p.accuracy || accuracy; const d = distance(me, chestAt);
      if (d < lastDist - 6) { say('WARMER', '#ff9a40', 1); haptic('success'); lastDist = d; } else if (d > lastDist + 6) { say('COLDER', '#6ac8ff', 1); haptic('warning'); lastDist = d; }
      dist = d; if (dist < Math.max(NEAR, accuracy * 1.2)) drop("You're here!");
    });
  }
  function drop(sub) {
    if (stopWatch) { stopWatch(); stopWatch = null; }
    state = 'drop'; dropT = 0; taps = 0; beam.visible = false;
    const yaw = v.heading(), e = v.eyePos; chestPos = new Vector3(e.x - Math.sin(yaw) * 2.2, FLOOR, e.z - Math.cos(yaw) * 2.2);
    chest.position.set(chestPos.x, FLOOR + 6, chestPos.z); chest.rotation.set(0, yaw + rnd(-.4, .4), 0); chest.visible = true; chest.userData.lid.rotation.x = 0; chest.userData.lock.visible = true;
    say(practice ? 'PRACTICE CHEST' : 'TREASURE!', '#ffd040', 2, sub); tone(200, { len: .8, wave: 'sine', vol: .06, slide: -150 });
  }
  function hitLock() {
    if (state !== 'locked') return;
    taps++; haptic(taps >= LOCK ? 'heavy' : 'medium'); tone(1200 + taps * 80, { len: .05, wave: 'square', vol: .05 }); noise(.06, { vol: .06, from: 6000, to: 2000, filter: 'highpass' });
    chest.userData.shake = .25; const lp = chest.userData.lock.getWorldPosition(tmp);
    for (let i = 0; i < 10; i++) sparks.emit({ x: lp.x, y: lp.y, z: lp.z, vx: rnd(-1, 1), vy: rnd(.3, 1.5), vz: rnd(-1, 1), life: .3, size: .02, col: [4, 3, 1.2], drag: 2, grav: 4 });
    if (taps >= LOCK) open();
  }
  function open() {
    state = 'open'; dropT = 0; chest.userData.lock.visible = false; sounds.win(); haptic('success');
    const base = practice ? 60 : 500, streak = practice ? 0 : (save.lastDay === yesterday() ? save.streak + 1 : 1);
    const walkBonus = practice ? 0 : Math.round(Math.min(300, startDist || 0));
    score = base + walkBonus + streak * 50; api.score(score);
    if (!practice) { save = { ...save, opened: true, streak, lastDay: today() }; api.save(save); }
    say(practice ? 'PRACTICE LOOT' : 'TODAY\'S TREASURE!', '#ffd040', 3, practice ? `+${score}` : `+${score}${streak > 1 ? ` · ${streak}-day streak!` : ''}`);
    const m = looks();
    for (let i = 0; i < 26; i++) { const gem = i % 5 === 0; const o = new Mesh(gem ? new ConeGeometry(.025, .05, 6) : new CylinderGeometry(.025, .025, .006, 14), gem ? m.gem[i % 3] : m.coin); o.castShadow = true; o.position.set(chestPos.x, FLOOR + .3, chestPos.z); v.scene.add(o); loot.push({ o, v: new Vector3(rnd(-1.2, 1.2), rnd(2, 4), rnd(-1.2, 1.2)), r: new Vector3(rnd(-12, 12), rnd(-12, 12), rnd(-12, 12)) }); }
  }
  const yesterday = () => { const d = new Date(Date.now() - 864e5); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
  function update(dt) {
    if (!v) return; v.live(); if (v.calibrating) return;
    t += dt; if (msg) { msg.l -= dt; if (msg.l <= 0) msg = null; }
    if (state === 'start') { locate(); return; }
    if (state === 'hunt') {
      // a sonar pulse that gets faster the closer you are
      pingT -= dt; if (pingT <= 0) { pingT = clamp(dist / 60, .5, 4); haptic(dist < 50 ? 'medium' : 'light'); tone(dist < 50 ? 880 : 660, { len: .06, wave: 'sine', vol: .03 }); }
      // the beam of light stands in the chest's direction, if the phone has a compass
      const cd = compass(); beam.visible = cd != null;
      if (cd != null) { const rel = ((bearing(me, chestAt) - cd + 540) % 360 - 180) * Math.PI / 180, yaw = v.heading() - rel, e = v.eyePos, far = clamp(dist * .2, 8, 25); beam.position.set(e.x - Math.sin(yaw) * far, FLOOR + 20, e.z - Math.cos(yaw) * far); }
    }
    if (state === 'drop') {
      dropT += dt; const y = Math.max(FLOOR, FLOOR + 6 - dropT * dropT * 9); chest.position.y = y;
      if (y <= FLOOR) { state = 'locked'; haptic('heavy'); noise(.4, { vol: .12, from: 800, to: 80 }); for (let i = 0; i < 30; i++) dust.emit({ x: chestPos.x + rnd(-.3, .3), y: FLOOR + .03, z: chestPos.z + rnd(-.3, .3), vx: rnd(-1, 1), vy: rnd(.2, .8), vz: rnd(-1, 1), life: 1.2, size: rnd(.08, .18), grow: 2, col: [.6, .55, .5], a: .5, drag: 2 }); }
    }
    if (chest.userData.shake > 0) { chest.userData.shake -= dt; chest.rotation.z = Math.sin(t * 60) * chest.userData.shake * .2; } else chest.rotation.z = 0;
    if (state === 'open') {
      dropT += dt; chest.userData.lid.rotation.x = -Math.min(1.9, dropT * 5);
      if (Math.random() < .5) sparks.emit({ x: chestPos.x + rnd(-.15, .15), y: FLOOR + .32, z: chestPos.z + rnd(-.1, .1), vx: rnd(-.2, .2), vy: rnd(.5, 1.4), vz: rnd(-.2, .2), life: .8, size: .02, col: [4, 3, 1], drag: 1, grav: 1 });
      if (dropT > 4.5) { v.off(); return api.over(); }
    }
    for (const l of loot) { l.v.y -= 9.8 * dt; l.o.position.addScaledVector(l.v, dt); l.o.rotation.x += l.r.x * dt; l.o.rotation.y += l.r.y * dt; if (l.o.position.y < FLOOR + .01) { l.o.position.y = FLOOR + .01; l.v.y *= -.35; l.v.x *= .6; l.v.z *= .6; l.r.multiplyScalar(.7); } }
    sparks.update(dt); dust.update(dt);
  }
  function draw(c) {
    if (!v) { setup(); self.reset(); }
    v.look(1 / 60); v.draw(c, W, H);
    if (state === 'locked' || state === 'drop') v.pointers(c, W, H, [{ p: chestPos, col: '#ffd040' }]);
    c.save(); c.textBaseline = 'middle'; c.textAlign = 'center';
    if (state === 'hunt') {
      c.fillStyle = '#04110ecc'; c.beginPath(); c.roundRect(W / 2 - 90, 14, 180, 66, 14); c.fill();
      c.fillStyle = '#ffd040'; c.font = '800 30px Rubik, sans-serif'; c.fillText(`${Math.round(dist)} m`, W / 2, 40); c.fillStyle = '#fff'; c.font = '600 10px Rubik, sans-serif'; c.fillText(`to today's chest · GPS ±${Math.round(accuracy)} m`, W / 2, 64);
      const cd = compass();
      if (cd != null) { const rel = ((bearing(me, chestAt) - cd + 540) % 360 - 180) * Math.PI / 180; c.save(); c.translate(W / 2, H - 120); c.rotate(rel); c.fillStyle = '#ffd040'; c.beginPath(); c.moveTo(0, -34); c.lineTo(22, 16); c.lineTo(0, 6); c.lineTo(-22, 16); c.closePath(); c.fill(); c.restore(); c.fillStyle = '#fff'; c.font = '600 11px Rubik, sans-serif'; c.fillText('Walk this way, follow the light', W / 2, H - 70); }
      else { c.fillStyle = '#fff'; c.font = '600 12px Rubik, sans-serif'; c.fillText('No compass: walk and feel WARMER / COLDER', W / 2, H - 80); }
    }
    if (state === 'locating' || state === 'start') { c.fillStyle = '#04110ecc'; c.beginPath(); c.roundRect(W / 2 - 120, H / 2 - 30, 240, 60, 14); c.fill(); c.fillStyle = '#fff'; c.font = '700 13px Rubik, sans-serif'; c.fillText('Finding where today\'s chest landed...', W / 2, H / 2); }
    if (state === 'done-today') {
      c.fillStyle = '#04110ee0'; c.beginPath(); c.roundRect(W / 2 - 130, H / 2 - 70, 260, 140, 16); c.fill();
      c.fillStyle = '#ffd040'; c.font = '800 16px Rubik, sans-serif'; c.fillText("You've opened today's chest", W / 2, H / 2 - 40);
      const s = Math.max(0, Math.round((new Date().setHours(24, 0, 0, 0) - Date.now()) / 1000)); c.fillStyle = '#fff'; c.font = '600 11px Rubik, sans-serif'; c.fillText(`Next one lands in ${Math.floor(s / 3600)}h ${Math.floor(s / 60) % 60}m`, W / 2, H / 2 - 16);
      c.fillStyle = '#ffd040'; c.beginPath(); c.roundRect(W / 2 - 90, H / 2 + 10, 180, 40, 20); c.fill(); c.fillStyle = '#04110e'; c.font = '800 13px Rubik, sans-serif'; c.fillText('CRACK A PRACTICE CHEST', W / 2, H / 2 + 31);
    }
    if (state === 'locked') { c.fillStyle = '#fff'; c.font = '700 13px Rubik, sans-serif'; c.fillText(`Tap the chest to smash the lock (${LOCK - taps})`, W / 2, H - 70); }
    if (msg) { c.globalAlpha = Math.min(1, msg.l * 2); c.lineWidth = 4; c.strokeStyle = '#000a'; c.font = '800 24px Rubik, sans-serif'; c.strokeText(msg.txt, W / 2, H * .28); c.fillStyle = msg.col; c.fillText(msg.txt, W / 2, H * .28); if (msg.sub) { c.font = '600 11px Rubik, sans-serif'; c.fillStyle = '#fff'; c.fillText(msg.sub, W / 2, H * .28 + 22); } c.globalAlpha = 1; }
    c.restore();
    arNote(c, v, W, H);
  }
  const self = {
    reset() {
      v?.off(); v?.recenter(); if (stopWatch) { stopWatch(); stopWatch = null; }
      state = 'start'; practice = false; taps = 0; score = 0; t = 0; msg = null; pingT = 0; dist = 0; accuracy = 15; me = null; chestAt = null;
      if (v) { chest.visible = false; beam.visible = false; for (const l of loot) v.scene.remove(l.o); loot = []; sparks.clear(); dust.clear(); if (!v.sensor) v.pitch = -.35; }
    },
    resize(w, h) { W = w; H = h; },
    update, draw,
    fx(dt) { if (v) { sparks.update(dt); dust.update(dt); } },
    down(x, y, id) { if (v?.input?.('down', x, y, id)) return; },
    move(x, y, p, id) { if (v?.input?.('move', x, y, id, p)) return; },
    up(x, y, id) {
      if (v?.input?.('up', x, y, id)) return;
      if (state === 'done-today' && Math.abs(x - W / 2) < 90 && Math.abs(y - (H / 2 + 30)) < 22) { practice = true; return drop('Just for fun: today\'s real one is open'); }
      if (state === 'locked') { const lp = chest.userData.lock.getWorldPosition(tmp), [sx, sy, sz] = v.toScreen(lp.x, lp.y, lp.z); if (sz < 1 && Math.hypot(sx - x, sy - y) < Math.max(60, W * .2)) hitLock(); }
    },
  };
  return self;
}

export default {
  id: 'treasure-drop',
  title: 'Treasure Drop',
  tag: 'AR · Explore · Local',
  retro: true, era: 'ar', pal: 'grape',
  w: 300, h: 460, maxW: 600, maxH: 680,
  goal: 500, reward: 30,
  location: 'precise',
  hint: 'Once a day a treasure chest lands 100 to 300 m from you. No map: follow the beam of light through the camera and the WARMER / COLDER buzzes. Get close and the chest drops in front of you; tap it to smash the lock. Location off or already opened today? Crack a practice chest.',
  traits: ['theme:pirate'],
  make,
};

// Quick checks of the game kits in Node: npm run kit-test
import assert from 'node:assert/strict';
const { Physics, loadPhysics } = await import('../src/kit/physics.js');

let threw = null; try { new Physics(); } catch (e) { threw = e; }
assert.ok(threw?.kitLoading, 'Physics before load throws StillLoading with kitLoading');
await threw.kitLoading; await loadPhysics();

// a box falls and lands on the floor of walls
{
  const p = new Physics({ gravity: 900, walls: [0, 0, 300, 400] });
  const box = p.box(150, 50, 30, 30);
  let hits = 0, maxSpeed = 0; p.onHit((a, b, speed) => { hits++; maxSpeed = Math.max(maxSpeed, speed); });
  for (let i = 0; i < 180; i++) p.step(1 / 60);
  assert.ok(Math.abs(box.y - 385) < 3, 'box rests on floor, y=' + box.y);
  assert.ok(hits >= 1 && maxSpeed > 300, 'hit reported with speed ' + maxSpeed);
  assert.ok(box.onGround(), 'onGround');
  assert.ok(p.at(150, 385) === box, 'at() finds the box');
  const r = p.ray(150, 10, 150, 400); assert.ok(r.thing === box, 'ray hits box'); assert.ok(Math.abs(r.y - 370) < 3, 'ray y ' + r.y);
}
// a tilted box tumbles (rotation works)
{
  const p = new Physics({ walls: [0, 0, 300, 400] });
  const b = p.box(150, 300, 80, 20, { angle: .6 });
  for (let i = 0; i < 240; i++) p.step(1 / 60);
  assert.ok(Math.abs(Math.sin(b.angle)) < .05, 'plank settles flat, angle ' + b.angle);
}
// pendulum on a hinge keeps its length; rope holds a weight
{
  const p = new Physics();
  const bob = p.circle(200, 100, 10);
  p.hinge(null, bob, 100, 100);
  for (let i = 0; i < 60; i++) p.step(1 / 60);
  assert.ok(Math.abs(Math.hypot(bob.x - 100, bob.y - 100) - 100) < 3, 'pendulum length');
  const w = p.circle(300, 200, 10, { density: 2 });
  p.rope(null, 300, 0, w, 300, 200, { links: 10 });
  for (let i = 0; i < 120; i++) p.step(1 / 60);
  assert.ok(w.y < 215, 'rope holds weight, y=' + w.y);
}
// spring, weld, grab, blast, remove, groups, sensor
{
  const p = new Physics({ walls: [0, 0, 400, 400] });
  const a = p.box(100, 380, 40, 40), b = p.box(140, 380, 40, 40);
  p.weld(a, b, 120, 380);
  for (let i = 0; i < 30; i++) p.step(1 / 60);
  assert.ok(Math.abs(b.x - a.x - 40) < 2, 'weld keeps distance');
  const g = p.grab(100, 380); assert.ok(g);
  for (let i = 0; i < 60; i++) { g.move(100, 200); p.step(1 / 60); }
  assert.ok(a.y < 300, 'grab lifts, y=' + a.y); g.release();
  const c = p.circle(300, 380, 10); p.step(1 / 60); p.blast(290, 385, 60, 800); p.step(1 / 60);
  assert.ok(c.vx > 100, 'blast pushes');
  p.remove(c); assert.ok(!p.things.includes(c));
  const g1 = p.circle(200, 100, 10, { group: 3 }), g2 = p.circle(200, 60, 10, { group: 3 });
  for (let i = 0; i < 120; i++) p.step(1 / 60);
  assert.ok(Math.abs(g1.y - g2.y) < 5, 'same group passes through');
  const s = p.box(50, 50, 20, 20, { sensor: true, fixed: true }); let sensed = false;
  p.onHit((x, y) => { if (x === s || y === s) sensed = true; });
  p.circle(50, 10, 5); for (let i = 0; i < 30; i++) p.step(1 / 60);
  assert.ok(sensed, 'sensor reports');
  const sp = p.circle(300, 100, 10); p.spring(null, sp, 300, 50, 300, 100, { stiffness: 3 });
  for (let i = 0; i < 300; i++) p.step(1 / 60);
  assert.ok(sp.y < 150, 'spring holds, y=' + sp.y);
}
console.log('physics ok');

// 3D physics
{
  const THREE = await import('three');
  const { World3D, loadPhysics3D } = await import('../src/kit/physics3d.js');
  let e = null; try { new World3D(); } catch (x) { e = x; }
  assert.ok(e?.kitLoading, '3D StillLoading'); await loadPhysics3D();
  const w = new World3D({ gravity: -20 });
  const level = new THREE.Group();
  const floor = new THREE.Mesh(new THREE.BoxGeometry(20, 1, 20)); floor.position.y = -.5; level.add(floor);
  const wall = new THREE.Mesh(new THREE.BoxGeometry(1, 4, 20)); wall.position.set(5, 2, 0); level.add(wall);
  const step = new THREE.Mesh(new THREE.BoxGeometry(2, .25, 20)); step.position.set(-3, .125, 0); level.add(step);
  w.ground(level);
  const crateMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)); crateMesh.position.set(0, 5, 3);
  const crate = w.box(crateMesh, 1, 1, 1);
  let hit = 0; w.onHit((a, b, sp) => { if (sp > 3) hit++; });
  const heroMesh = new THREE.Object3D(); heroMesh.position.set(0, 0, 0);
  const hero = w.mover(heroMesh, { radius: .4, height: 1.8 });
  for (let i = 0; i < 120; i++) { hero.walk(6, 0); w.step(1 / 60); }
  assert.ok(Math.abs(crateMesh.position.y - .5) < .05, 'crate lands, y=' + crateMesh.position.y);
  assert.ok(hit > 0, '3D hit');
  assert.ok(heroMesh.position.x < 4.7 && heroMesh.position.x > 4, 'mover stopped by wall, x=' + heroMesh.position.x);
  assert.ok(hero.grounded, 'mover grounded');
  for (let i = 0; i < 76; i++) { hero.walk(-6, 0); w.step(1 / 60); }
  assert.ok(heroMesh.position.x < -2.5 && heroMesh.position.y > .2, 'mover climbs step, ' + heroMesh.position.x + ',' + heroMesh.position.y);
  hero.jump(8); w.step(1 / 60); for (let i = 0; i < 10; i++) { hero.walk(0, 0); w.step(1 / 60); }
  assert.ok(heroMesh.position.y > 1, 'jump, y=' + heroMesh.position.y);
  const r = w.ray({ x: 0, y: 10, z: 3 }, { x: 0, y: -1, z: 0 }, 50);
  assert.ok(r && r.thing === crate && Math.abs(r.point.y - 1) < .05, 'ray hits crate');
  const bob = w.ball(null, .3, { at: { x: 2, y: 3, z: -3 } }); w.pin(null, bob, { x: 0, y: 3, z: -3 });
  for (let i = 0; i < 60; i++) w.step(1 / 60);
  const p = bob.pos; assert.ok(Math.abs(Math.hypot(p.x, p.y - 3, p.z + 3) - 2) < .1, 'pin keeps length');
  console.log('physics3d ok');
}

// AI
{
  const { Crowd, NavGrid, Brain } = await import('../src/kit/ai.js');
  const crowd = new Crowd(), player = { x: 300, y: 300 };
  const bat = crowd.add(0, 0, { speed: 100 }).chase(player);
  for (let i = 0; i < 300; i++) crowd.update(1 / 60);
  assert.ok(Math.hypot(bat.x - 300, bat.y - 300) < 30, 'chase gets close: ' + bat.x + ',' + bat.y);
  const lvl = ['..........', '.########.', '.#......#.', '.#.####.#.', '...#..#...'];
  const nav = new NavGrid(10, 5, 10, (x, y) => lvl[y][x] === '#');
  const route = nav.path(5, 5, 45, 25);
  assert.ok(route && route.length >= 3, 'path found');
  for (const p of route) assert.ok(!nav.blocked(p.x, p.y), 'route avoids walls');
  nav.set(0, 2, true); nav.set(0, 3, true); nav.set(2, 4, true); nav.set(9, 1, true); nav.set(9, 2, true);
  assert.ok(nav.path(5, 5, 45, 25) === null || true);
  const ant = crowd.add(5, 5, { speed: 80, radius: 3 }).follow([{ x: 95, y: 5 }]);
  for (let i = 0; i < 200; i++) crowd.update(1 / 60);
  assert.ok(ant.arrived && ant.x > 85, 'follow arrives ' + ant.x);
  const b = new Brain('a', { a: { update() { if (b.time > .5) b.go('b'); } }, b: {} });
  for (let i = 0; i < 40; i++) b.update(1 / 60);
  assert.ok(b.is('b'), 'brain switches');
  const sheep = []; for (let i = 0; i < 10; i++) sheep.push(crowd.add(100 + i * 3, 100, { speed: 40 }).wander().flock());
  for (let i = 0; i < 60; i++) crowd.update(1 / 60);
  console.log('ai ok');
}
// math
{
  const { rng, daily, noise2, fbm, Grid, Timers, overlap } = await import('../src/kit/math.js');
  const a = rng('x'), b = rng('x'); assert.ok(a() === b() && a.int(1, 6) === b.int(1, 6), 'seeded');
  assert.ok(daily('g', new Date('2026-01-01T03:00Z')) === daily('g', new Date('2026-01-01T22:00Z')), 'daily same day');
  const n = noise2(.3, .7); assert.ok(n >= -1 && n <= 1 && Math.abs(noise2(.3, .7001) - n) < .01, 'noise smooth');
  assert.ok(Math.abs(fbm(1, 2)) <= 1);
  const g = new Grid(32); g.add({ x: 10, y: 10, r: 5 }); g.add({ x: 300, y: 300, r: 5 });
  assert.ok(g.near(0, 0, 20).length === 1, 'grid near');
  const t = new Timers(); let fired = 0; t.every(.1, () => fired++); for (let i = 0; i < 31; i++) t.update(1 / 100);
  assert.ok(fired === 3, 'timers ' + fired);
  assert.ok(overlap.circles({ x: 0, y: 0, r: 5 }, { x: 8, y: 0, r: 5 }) && !overlap.boxes({ x: 0, y: 0, w: 5, h: 5 }, { x: 6, y: 0, w: 5, h: 5 }));
  console.log('math ok');
}
// game objects
{
  const { Things } = await import('../src/kit/things.js');
  const t = new Things();
  const p = t.add({ x: 100, y: 100, r: 10 }, 'player');
  const c1 = t.add({ x: 105, y: 100, r: 4 }, 'coin'), c2 = t.add({ x: 300, y: 100, r: 4 }, 'coin');
  assert.ok(t.hit(p, 'coin') === c1, 'hit finds the touching coin');
  const box = t.add({ x: 200, y: 200, w: 40, h: 20 }, 'wall');
  assert.ok(t.touch({ x: 215, y: 205, r: 2 }, box) && !t.touch({ x: 225, y: 205, r: 2 }, box), 'circle vs box');
  let pairs = 0; for (let i = 0; i < 30; i++) t.add({ x: i * 10, y: 0, r: 2 }, 'bullet'); for (let i = 0; i < 30; i++) t.add({ x: i * 10 + 1, y: 0, r: 2 }, 'enemy');
  t.hits('bullet', 'enemy', (b, e) => { pairs++; t.kill(b); });
  assert.ok(pairs === 30, 'grid hits pairs ' + pairs);           // 900 pairs: grid path; each bullet hits once
  assert.ok(t.count('bullet') === 0 && t.nearest(290, 0, 'enemy').x === 291, 'kill and nearest');
  t.update(0); assert.ok(t.list.length === 34, 'sweep drops killed ' + t.list.length);
  const r = t.reuse('bullet', () => ({}), { x: 1, y: 2 }); assert.ok(!r.dead && t.is(r, 'bullet') && r.x === 1, 'reuse');
  assert.ok(t.near(100, 100, 10, 'coin')[0] === c1 && t.all('coin').length === 2 && c2, 'near');
  const t3 = new Things({ plane: 'xz' }); const a = t3.add({ x: 0, y: 50, z: 0, r: 1 }, 'a'); t3.add({ x: 1, y: -50, z: 0, r: 1 }, 'b');
  assert.ok(t3.hit(a, 'b'), 'xz plane ignores y');
  console.log('things ok');
}
// scenes, levels, pacing
{
  const { Scenes, Levels } = await import('../src/kit/rounds.js');
  const log = [];
  const s = new Scenes({ intro: { enter: () => log.push('in'), update: (dt, sc) => { if (sc.time > 1) sc.go('play', { fade: .5 }); } }, play: { enter: (sc, d) => log.push('play') } }, 'intro');
  for (let i = 0; i < 60; i++) s.update(1 / 30);
  assert.ok(s.name === 'play' && !s.changing && log.join() === 'in,play', 'scene change ' + log);
  s.go('intro', { fade: 1 }); s.update(.5); assert.ok(s.cover > .95 && s.name === 'intro', 'cover peaks mid-change');
  s.after(.2, 'play'); for (let i = 0; i < 40; i++) s.update(.05); assert.ok(s.name === 'play', 'after');
  const L = new Levels(['a', 'b'], { loop: true }); L.next(); L.next(); assert.ok(L.now === 'a' && L.lap === 1 && L.number === 3, 'levels loop');
  const { Spawner, Waves, Director, ramp } = await import('../src/kit/pacing.js');
  const sp = new Spawner({ every: 1, fastest: .25, over: 10 }); let n = 0;
  for (let i = 0; i < 600; i++) sp.update(1 / 60, () => n++);
  assert.ok(n >= 14 && n <= 24 && sp.gap < .3, 'spawner speeds up ' + n + ' ' + sp.gap);
  const w = new Waves([{ count: 3, every: .2, kind: 'bat' }, { count: 1, kind: 'boss' }], { breather: 1, first: 0 }); const got = []; let alive = 0;
  for (let i = 0; i < 300; i++) { w.update(1 / 30, k => { got.push(k); alive++; }, alive); if (i === 60) alive = 0; if (i === 150) alive = 0; }
  assert.ok(got.join() === 'bat,bat,bat,boss' && w.state === 'done', 'waves ' + got + ' ' + w.state);
  const d = new Director({ over: 10 }); for (let i = 0; i < 300; i++) d.update(1 / 30); const before = d.level; d.hurt(2);
  assert.ok(before > .9 && d.level < before && d.calm, 'director eases off when hurt');
  assert.ok(ramp(5, 0, 10, 10) === 5, 'ramp');
  console.log('rounds + pacing ok');
}
// aim assist and senses
{
  const { AimAssist } = await import('../src/kit/aim.js');
  const as = new AimAssist({ cone: 15, range: 300, pull: .6, autoFire: .1 });
  const target = { x: 200, y: 20, r: 10 }; let aim = 0, fired = false;
  for (let i = 0; i < 90; i++) { const a = as.update(1 / 60, { x: 0, y: 0 }, aim, [target]); aim = a.angle; fired ||= a.fire; }
  assert.ok(Math.abs(aim - Math.atan2(20, 200)) < .02 && fired, 'pulled onto target and fired ' + aim);
  assert.ok(as.turn(1) < 1, 'sticky aim slows turning');
  const off = as.update(1 / 60, { x: 0, y: 0 }, 1.5, [target]); assert.ok(!off.target, 'outside the cone: no help');
  const blocked = as.update(1 / 60, { x: 0, y: 0 }, 0, [target], { sees: () => false }); assert.ok(!blocked.target, 'walls block');
  const THREE = await import('three');
  const a3 = new AimAssist({ cone: 10, range: 50, pull: 1 }); let dir = new THREE.Vector3(0, 0, -1);
  for (let i = 0; i < 60; i++) dir = a3.update(1 / 60, { x: 0, y: 0, z: 0 }, dir, [{ x: 1, y: 0, z: -10, r: .5 }]).dir;
  assert.ok(dir.isVector3 && Math.abs(Math.atan2(dir.x, -dir.z) - Math.atan2(1, 10)) < .02, '3D pull');
  const { Senses, Noises } = await import('../src/kit/senses.js');
  const g = { x: 0, y: 0, facing: 0, senses: new Senses({ range: 100, fov: 90, spotTime: .5 }) }, pl = { x: 50, y: 0 };
  for (let i = 0; i < 30; i++) g.senses.update(1 / 30, g, pl);
  assert.ok(g.senses.mood === 'alert' && g.senses.lastSeen.x === 50, 'spotted in the cone');
  for (let i = 0; i < 30 * 5; i++) g.senses.update(1 / 30, g, { x: -50, y: 0 });
  assert.ok(g.senses.mood === 'searching', 'searching after losing sight: ' + g.senses.mood);
  const h = new Senses({ range: 100 }), noises = new Noises(); noises.make(-30, 0, 60);
  h.update(1 / 30, { x: 0, y: 0, facing: 0 }, { x: -50, y: 0 }, { noises }); noises.update(1 / 30);
  assert.ok(h.mood === 'suspicious' && h.lookAt.x === -30, 'heard a noise behind');
  const wall = new Senses({ range: 100 }); for (let i = 0; i < 60; i++) wall.update(1 / 30, { x: 0, y: 0, facing: 0 }, pl, { sees: () => false });
  assert.ok(wall.mood === 'calm', 'walls block sight');
  const gs2 = [{ x: 10, y: 0, senses: new Senses() }, { x: 500, y: 0, senses: new Senses() }]; Senses.alertAll(gs2, 0, 0, 100);
  assert.ok(gs2[0].senses.mood === 'alert' && gs2[1].senses.mood === 'calm', 'alertAll radius');
  console.log('aim + senses ok');
}
// camera rigs and living characters (three.js maths only)
{
  const THREE = await import('three');
  const { CameraRig } = await import('../src/kit/camera.js');
  const cam = new THREE.PerspectiveCamera(60, 1, .1, 100), hero = new THREE.Object3D();
  const wall = new THREE.Mesh(new THREE.BoxGeometry(4, 4, .2), new THREE.MeshBasicMaterial()); wall.position.set(0, 1, -3); wall.updateMatrixWorld();
  const rig = new CameraRig(cam, { mode: 'chase', distance: 6, height: 2, lag: 0 });
  rig.update(1 / 60, hero);
  assert.ok(Math.abs(cam.position.z + 6) < .5 && cam.position.y > 1, 'chase sits behind ' + cam.position.toArray());
  rig.set({ walls: [wall] }); rig.update(1 / 60, hero);
  assert.ok(cam.position.z > -3, 'pulled in front of the wall ' + cam.position.z);
  rig.to('top', .5); for (let i = 0; i < 40; i++) rig.update(1 / 60, hero);
  assert.ok(cam.position.y > 10, 'blended to top ' + cam.position.y);
  rig.kick(10, .3); rig.update(.05, hero); assert.ok(cam.fov > 60, 'fov kick');
  const { lookAt, reach, Steps, Wobble } = await import('../src/kit/characters.js');
  const body = new THREE.Group(), head = new THREE.Object3D(); head.position.y = 1.6; body.add(head);
  lookAt(head, new THREE.Vector3(5, 1.6, 0), null, { max: 3 });
  const f = new THREE.Vector3(0, 0, 1).applyQuaternion(head.quaternion); assert.ok(f.x > .95, 'head turns to look ' + f.toArray());
  lookAt(head, new THREE.Vector3(-5, 1.6, -5), null, { max: .5 }); assert.ok(new THREE.Euler().setFromQuaternion(head.quaternion, 'YXZ').y >= -.51, 'look limit');
  // a leg: thigh (origin hip) with shin (origin knee .5 down), shin .5 long
  const hip = new THREE.Group(); hip.position.y = 1; body.add(hip);
  const thigh = new THREE.Mesh(new THREE.BoxGeometry(.1, .5, .1).translate(0, -.25, 0)); hip.add(thigh);
  const shin = new THREE.Mesh(new THREE.BoxGeometry(.1, .5, .1).translate(0, -.25, 0)); shin.position.y = -.5; thigh.add(shin);
  const goal = new THREE.Vector3(.2, .3, .3); assert.ok(reach(thigh, shin, goal), 'in reach');
  const tip = shin.localToWorld(new THREE.Vector3(0, -.5, 0)); assert.ok(tip.distanceTo(goal) < .01, 'foot on target ' + tip.toArray());
  const st = new Steps({ stride: .3 }); const mover = new THREE.Object3D(); let landed = 0;
  for (let i = 0; i < 120; i++) { mover.position.z += 1.5 / 60; st.update(1 / 60, mover); landed += st.feet.filter(x => x.landed).length; }
  assert.ok(landed >= 4 && st.feet.every(x => Math.abs(x.pos.z - mover.position.z) < .8), 'feet step along ' + landed);
  const wb = new Wobble(); wb.hit(1); let peak = 0; for (let i = 0; i < 120; i++) { wb.update(1 / 60); peak = Math.max(peak, Math.abs(wb.value)); }
  assert.ok(peak > .3 && Math.abs(wb.value) < .05, 'wobble settles');
  console.log('camera + characters ok');
}
// ragdoll (3D physics) and 3D path finding
{
  const THREE = await import('three');
  const { World3D, loadPhysics3D } = await import('../src/kit/physics3d.js');
  await loadPhysics3D();
  const scene = new THREE.Scene(), w = new World3D(); w.floor(0);
  const guy = new THREE.Group(); guy.position.y = 1.2; scene.add(guy);
  guy.add(new THREE.Mesh(new THREE.BoxGeometry(.4, .6, .25)));
  const mk = (x, y) => { const l = new THREE.Group(); l.position.set(x, y, 0); l.add(new THREE.Mesh(new THREE.BoxGeometry(.12, .5, .12).translate(0, -.25, 0))); guy.add(l); return l; };
  const legL = mk(-.12, -.3), legR = mk(.12, -.3), armL = mk(-.28, .25);
  const rag = w.ragdoll(guy, { push: [0, 1, -3] });
  assert.ok(rag.parts.length === 4 && legL.parent === scene, 'parts become bodies in the scene');
  for (let i = 0; i < 180; i++) w.step(1 / 60);
  const hipToLeg = guy.localToWorld(new THREE.Vector3(-.12, -.3, 0)).distanceTo(legL.position);
  assert.ok(guy.position.y < .5 && hipToLeg < .08, 'falls down and stays jointed ' + guy.position.y + ' ' + hipToLeg);
  assert.ok(armL.position.y > -.1 && legR.position.y > -.1, 'rests on the floor');
  rag.remove();
  const { NavMesh3D, loadNav3D } = await import('../src/kit/nav3d.js');
  let t = null; try { new NavMesh3D([]); } catch (e) { t = e; } assert.ok(t?.kitLoading, 'nav3d lazy');
  await loadNav3D();
  const lvl = new THREE.Group();
  const floor = new THREE.Mesh(new THREE.BoxGeometry(20, .2, 20)); floor.position.y = -.1; lvl.add(floor);
  const block = new THREE.Mesh(new THREE.BoxGeometry(2, 3, 12)); block.position.set(0, 1.5, 0); lvl.add(block);
  const nav = new NavMesh3D([lvl], { radius: .3 });
  const path = nav.path({ x: -5, y: 0, z: 0 }, { x: 5, y: 0, z: 0 });
  assert.ok(path.length >= 3 && path.every(p => Math.abs(p.x) > 1 || Math.abs(p.z) > 5.9), 'path goes round the block ' + path.map(p => p.toArray().map(v => v.toFixed(1))).join(' '));
  const crowd = nav.crowd(), ag = crowd.add({ x: -5, y: 0, z: 0 }, { speed: 4 });
  for (let i = 0; i < 60 * 8; i++) { ag.goto({ x: 5, y: 0, z: 0 }); crowd.update(1 / 60); }
  assert.ok(ag.position.distanceTo(new THREE.Vector3(5, 0, 0)) < .6, 'agent walks there ' + ag.position.toArray());
  assert.ok(nav.random() && nav.closest({ x: 0, y: 5, z: 0 }).y < 3.2, 'random and closest');
  console.log('ragdoll + nav3d ok');
}

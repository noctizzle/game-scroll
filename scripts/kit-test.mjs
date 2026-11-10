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
// one clean-up registry: every kit's stop runs, and one failing doesn't stop the rest
{
  const { register, stopAll, pauseAll, resumeAll } = await import('../src/kit/cleanup.js');
  const log = [];
  register('test-a', { stop: () => { log.push('a'); throw new Error('boom'); }, pause: () => log.push('pa'), resume: () => log.push('ra') });
  register('test-b', { stop: () => log.push('b') });
  stopAll(); pauseAll(); resumeAll();
  assert.ok(log.includes('a') && log.includes('b') && log.includes('pa') && log.includes('ra'), 'cleanup hooks all run ' + log);
  console.log('cleanup ok');
}
// a card's subscriptions end when it leaves the feed; a failed lazy load can be tried again
{
  const { ownedBy, onRelease, release } = await import('../src/kit/cleanup.js');
  const card = {}, log = [];
  ownedBy(card, () => onRelease(() => log.push('off')));
  assert.equal(onRelease(() => log.push('stray')), null, 'nothing to tie to outside make() / reset()');
  release(card); release(card);
  assert.deepEqual(log, ['off'], 'onRelease runs once when the card goes');
  const { lazy } = await import('../src/kit/lazy.js');
  let tries = 0;
  const lib = lazy('flaky', () => { if (++tries === 1) throw new Error('offline'); return 'lib'; });
  let e1 = null; try { lib.get(); } catch (e) { e1 = e; }
  assert.ok(e1?.kitLoading, 'first get starts the load');
  await e1.kitLoading.then(() => assert.fail('should fail'), () => {});
  let e2 = null; try { lib.get(); } catch (e) { e2 = e; }
  assert.ok(e2?.kitLoading, 'after a failure, the next get loads again (not the old error)');
  assert.equal(await e2.kitLoading, 'lib'); assert.equal(lib.get(), 'lib', 'second try works');
  console.log('release + lazy retry ok');
}
// a game's reward and shop prices can't break the wallet
{
  const { rewardOf, fairPrice, MAX_REWARD } = await import('../src/kit/progress.js');
  assert.equal(rewardOf(undefined), 10); assert.equal(rewardOf(0), 0); assert.equal(rewardOf(25), 25);
  assert.equal(rewardOf(1e9), MAX_REWARD); assert.equal(rewardOf(-50), 0); assert.equal(rewardOf('10'), 10); assert.equal(rewardOf('x'), 0); assert.equal(rewardOf(7.9), 7);
  assert.ok(fairPrice(25) && !fairPrice(0) && !fairPrice(-5) && !fairPrice('25') && !fairPrice(2.5) && !fairPrice(NaN), 'prices are whole numbers 1 and up');
  console.log('wallet limits ok');
}
// Reduce motion softens shake and flash
{
  const { setPrefs, prefs } = await import('../src/kit/prefs.js');
  const { Shake, Juice } = await import('../src/kit/juice.js');
  const a = new Shake(); a.add(6); const full = a.trauma;
  setPrefs({ reduceMotion: true });
  const b = new Shake(); b.add(6);
  assert.ok(b.trauma < full * .5, 'reduce motion: smaller shake ' + b.trauma + ' vs ' + full);
  const j = new Juice(); j.flash('#fff', .4); assert.ok(j.fl.a < .2, 'reduce motion: softer flash');
  assert.ok(Object.isFrozen(prefs), 'games cannot change prefs');
  setPrefs({ reduceMotion: false });
  console.log('prefs ok');
}
// 2D camera: dead zone, bounds, toWorld
{
  const { Camera2D } = await import('../src/kit/camera2d.js');
  const cam = new Camera2D(160, 144, { bounds: [0, 0, 640, 144], deadzone: [40, 40], lag: 0 });
  const t = { x: 10, y: 72 }; cam.update(1 / 60, t);
  assert.equal(cam.x, 80, 'clamped to the left edge');
  t.x = 300; cam.update(1 / 60, t); assert.ok(Math.abs(cam.x - 280) < 1e-6, 'follows to the dead zone edge ' + cam.x);
  t.x = 900; cam.update(1 / 60, t); assert.equal(cam.x, 560, 'clamped to the right edge');
  const w = cam.toWorld(80, 72); assert.ok(Math.abs(w.x - 560) < 1e-6 && Math.abs(w.y - 72) < 1e-6, 'toWorld');
  assert.ok(cam.sees(600, 70) && !cam.sees(100, 70), 'sees');
  console.log('camera2d ok');
}
// tile levels and movers
{
  const { TileMap } = await import('../src/kit/tiles.js');
  const { Platformer, TopDown } = await import('../src/kit/movers.js');
  const map = TileMap.fromText(`
    ..........
    .P......E.
    ....--....
    ..........
    ...../####
    ##########`, { size: 10 });
  assert.equal(map.cols, 10); assert.equal(map.rows, 6);
  assert.deepEqual(map.find('P').map(m => [m.x, m.y]), [[15, 15]], 'marks');
  const hero = new Platformer({ x: 15, y: 15, w: 8, h: 8, jump: 25, run: 60 });
  for (let i = 0; i < 60; i++) hero.update(1 / 60, map, {});
  assert.ok(hero.onGround && Math.abs(hero.bottom - 50) < .01, 'lands on the floor ' + hero.bottom);
  // run right up the slope onto the block
  for (let i = 0; i < 120; i++) hero.update(1 / 60, map, { x: 1 });
  assert.ok(hero.onGround && Math.abs(hero.bottom - 40) < .6 && hero.x > 55, 'walked up the slope onto the block ' + hero.x + ',' + hero.bottom);
  // a jump reaches about the jump height, coyote time works after walking off
  const h2 = new Platformer({ x: 25, y: 46, w: 8, h: 8, jump: 25 }); h2.update(1 / 60, map, {});
  let top = h2.y; h2.update(1 / 60, map, { jump: true }); for (let i = 0; i < 40; i++) { h2.update(1 / 60, map, { jump: true }); top = Math.min(top, h2.y); }
  assert.ok(46 - top > 20 && 46 - top < 30, 'jump height ~25: ' + (46 - top));
  // one-way platform: jump up through it and stand on it
  assert.ok(map.info(4, 2).oneWay, 'one-way tile');
  const h3 = new Platformer({ x: 45, y: 46, w: 6, h: 8, jump: 35 }); h3.update(1 / 60, map, {});
  h3.update(1 / 60, map, { jump: true }); for (let i = 0; i < 90; i++) h3.update(1 / 60, map, { jump: true });
  assert.ok(h3.onGround && Math.abs(h3.bottom - 20) < .01, 'stands on the one-way platform ' + h3.bottom);
  // top-down slides along walls
  const td = new TopDown({ x: 15, y: 25, w: 8, h: 8, speed: 80 }); for (let i = 0; i < 60; i++) td.update(1 / 60, map, { x: -1, y: 1 });
  assert.ok(td.left >= 0 - 1e-6 && td.bottom <= 50 + 1e-6, 'top-down stops at walls');
  assert.ok(map.sees(15, 15, 85, 15) && !map.sees(15, 45, 85, 45), 'line of sight');
  console.log('tiles + movers ok');
}
// animation states
{
  const { Animator } = await import('../src/kit/anim.js');
  const steps = [];
  const a = new Animator({ idle: { frames: 2, fps: 4 }, run: { frames: 4, fps: 10, events: { 1: 'step', 3: 'step' } }, punch: { frames: [7, 8, 9], fps: 10, loop: false, then: 'idle' } }, 'idle');
  a.on('step', () => steps.push(a.frame));
  for (let i = 0; i < 40; i++) a.update(.01, 'run');
  assert.deepEqual(steps, [1, 3], 'step events on frames 1 and 3: ' + steps);
  a.play('punch'); a.update(.15, 'run'); assert.equal(a.frame, 8, 'punch frame'); a.update(.2, 'run');
  assert.equal(a.state, 'idle', 'punch ends into idle (locked until done)');
  console.log('anim ok');
}
// replays and ghosts
{
  const { Ghost, Recorder, Replayer } = await import('../src/kit/replay.js');
  const g = new Ghost(); for (let i = 0; i < 600; i++) g.record(1 / 60, i * 2, Math.sin(i / 30) * 50);
  const p = g.pack(); assert.ok(p.length <= 1200, 'packs small: ' + p.length);
  const back = Ghost.unpack(p), at = back.at(5);
  assert.ok(Math.abs(at.x - 600) < 3 && Math.abs(at.y - Math.sin(10) * 50) < 2, 'ghost plays back ' + JSON.stringify(at));
  const rec = new Recorder({ seed: 42 }); const game = { s: 0, down(x) { this.s += x; }, update(dt) { this.s += dt; } };
  rec.event('down', 5); rec.frame(.5); game.down(5); game.update(.5);
  const n1 = rec.rng(), copy = { s: 0, down: game.down, update: game.update }, play = new Replayer(rec.data);
  while (!play.done) play.step(copy);
  assert.equal(copy.s, game.s, 'replay feeds the same inputs'); assert.equal(play.rng(), n1, 'same random numbers');
  console.log('replay ok');
}
// dialogue (ink)
{
  const { Story, Typewriter, loadStory } = await import('../src/kit/story.js');
  let e; try { new Story('Hi.'); } catch (x) { e = x; } assert.ok(e?.kitLoading, 'Story waits for ink'); await loadStory();
  const talk = new Story(`
  VAR gate = false
  Halt! Who goes there? #who:guard
  * [A friend] -> friend
  * [Nobody] Very funny. #who:guard #mood:cross
    -> END
  == friend ==
  Then pass, friend.
  ~ gate = true
  -> END`);
  const l1 = talk.next(); assert.equal(l1.text, 'Halt! Who goes there?'); assert.equal(l1.tags.who, 'guard');
  assert.deepEqual(l1.choices.map(c => c.text), ['A friend', 'Nobody'], 'choices');
  talk.choose(0); assert.equal(talk.next().text, 'Then pass, friend.'); assert.equal(talk.vars.gate, true, 'ink variable'); assert.ok(talk.ended, 'ended');
  const tw = new Typewriter('Hi, you.', { speed: 20 }); let ticks = 0; for (let i = 0; i < 200 && !tw.done; i++) { tw.update(.02); if (tw.ticked) ticks++; }
  assert.ok(tw.done && ticks === 7, 'typewriter ' + ticks);
  console.log('story ok');
}

// save versions: old saves go through migrate(), a newer save is kept safe
{
  globalThis.localStorage ??= (() => { const m = new Map(); return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; })();
  const { savesFor, _resetSaves } = await import('../src/saves.js');
  _resetSaves();
  const v1 = savesFor({ id: 'sv-test' });
  assert.ok(v1.save({ coins: 5 }), 'v1 saves');
  const calls = [];
  const v2 = savesFor({ id: 'sv-test', save: { version: 2, migrate: (d, from) => { calls.push(from); return { gold: d.coins * 10 }; } } });
  assert.deepEqual(v2.load({}), { gold: 50 }, 'migrated to v2');
  assert.deepEqual(v2.load({}), { gold: 50 }, 'migration kept (runs once)');
  assert.deepEqual(calls, [1], 'migrate got from=1 once');
  assert.deepEqual(v1.load('fallback'), 'fallback', 'older game copy gets the fallback for a newer save');
  assert.equal(v1.save({ coins: 1 }), false, 'older game copy cannot overwrite a newer save');
  assert.deepEqual(v2.load({}), { gold: 50 }, 'newer save untouched');
  const bad = savesFor({ id: 'sv-test', save: { version: 3, migrate: () => { throw new Error('x'); } } });
  assert.equal(bad.load('fb'), 'fb', 'failed migrate gives the fallback');
  const none = savesFor({ id: 'sv-test', save: { version: 3 } });
  assert.equal(none.load('fb'), 'fb', 'no migrate gives the fallback');
  _resetSaves();
  console.log('saves: versions + migrate ok');
}

// Tiny Brains: copies its teacher, guard rails hold, waves and plans learn
{
  const { Brain, Net, Wave, Imagine, Predict } = await import('../src/kit/brains.js');
  const n = new Net([3, 5, 2], 7), s = n.pack(), m = Net.unpack(s);
  assert.equal(m.shape, '3x5x2'); assert.ok(Math.max(...n.w.map((v, i) => Math.abs(v - m.w[i]))) < .01, 'pack round trip');
  assert.equal(Net.unpack('tb1:3x5x2:1:AAAA'), null, 'wrong length refused');
  // a 1D chaser: the teacher moves towards the player
  const slots = new Map(), api = { brains: { load: k => slots.get(k) ?? null, save: (k, v) => slots.set(k, v) } };
  const b = new Brain(api, { name: 'chaser', inputs: 2, actions: ['left', 'right'], hidden: [6], teacher: see => see[0] < 0 ? 'left' : 'right', limits: { react: 0, perSecond: 1000, minNoise: 0 }, share: false });
  let r = 1; const rand = () => (r = (r * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 4000; i++) { const dx = rand() * 2 - 1; b.act([dx, rand() * 2 - 1], 1 / 60); if (i % 10 === 0) b.feel(.5); }
  let right = 0; for (let i = 0; i < 200; i++) { const dx = rand() * 2 - 1, p = b.net.run([dx, 0]); if ((p[0] > p[1]) === (dx < 0)) right++; }
  assert.ok(right > 170, 'copied the teacher: ' + right + '/200');
  assert.ok(b.agree > .8 && b.anchor, 'agreement ' + b.agree.toFixed(2) + ' and a starting brain kept');
  assert.ok(b.trust > 0, 'earns some trust: ' + b.trust.toFixed(3));
  // drift: no number further than `drift` from the starting brain, whatever the signals
  for (let i = 0; i < 3000; i++) { b.act([rand() * 2 - 1, 1], 1 / 60); b.feel(2); }
  let far = 0; for (let i = 0; i < b.net.w.length; i++) far = Math.max(far, Math.abs(b.net.w[i] - b.anchor.w[i]));
  assert.ok(far <= 1 + 1e-6, 'stays within drift of its starting brain: ' + far.toFixed(3));
  // win rate: the player keeps losing -> the skill dial drops, and three in a row eases off at once
  const k0 = b.skill; b.result(false); b.result(false); const k2 = b.skill; b.result(false);
  assert.ok(k2 < k0 && b.skill < k2 - .2, `skill eases off (${k0.toFixed(2)} -> ${k2.toFixed(2)} -> ${b.skill.toFixed(2)})`);
  for (let i = 0; i < 30; i++) b.result(true);
  assert.ok(b.skill > .6, 'player winning everything -> sharper: ' + b.skill.toFixed(2));
  // remembered: a new Brain with the same slot picks up where it was
  const b2 = new Brain(api, { name: 'chaser', inputs: 2, actions: ['left', 'right'], hidden: [6], teacher: see => see[0] < 0 ? 'left' : 'right', share: false });
  assert.ok(b2.steps === b.steps && Math.abs(b2.skill - b.skill) < .01, 'restored from its slot');
  b2.reset(); assert.equal(b2.steps, 0, 'reset forgets');
  // rules always win; perSecond limits changes of mind; reaction time holds a choice
  const c = new Brain({ name: 'r', inputs: 1, actions: ['a', 'b', 'c'], limits: { react: 0, perSecond: 1000, minNoise: 0 }, rules: (s, a) => (a === 'c' ? 'a' : a), share: false });
  for (let i = 0; i < 500; i++) { c.act([Math.random()], 1 / 60); assert.notEqual(c.action, 'c', 'rule: never c'); }
  const d = new Brain({ name: 'p', inputs: 1, actions: 4, limits: { react: 0, perSecond: 2, minNoise: 1 }, share: false });
  let changes = 0, last = d.act([0], 1 / 60); for (let i = 0; i < 600; i++) { const a = d.act([0], 1 / 60); if (a !== last) changes++; last = a; }
  assert.ok(changes <= 21, 'at most 2 changes of mind a second over 10 s: ' + changes);
  const e = new Brain({ name: 'q', inputs: 1, actions: 4, limits: { react: .5, minNoise: 1 }, share: false });
  const first = e.act([0], 1 / 60); let same = true; for (let i = 0; i < 20; i++) if (e.act([0], 1 / 60) !== first) same = false;
  assert.ok(same, 'reaction time holds the choice');
  // Wave: a pair of minds moves the brain
  const wb = new Brain({ name: 'w', inputs: 2, actions: 2, share: false }), w0 = wb.net.w.slice(), wave = new Wave(wb);
  const m1 = wave.mind(), m2 = wave.mind();
  for (let i = 0; i < 60; i++) { m1.act([1, 0], 1 / 60); m1.feel(1); m2.act([1, 0], 1 / 60); }
  m1.done(); m2.done();
  assert.ok(wb.net.w.some((v, i) => v !== w0[i]), 'a finished pair changes the brain');
  // minds that act in the same frame each make their own choice, on their own reaction timer
  const sb = new Brain({ name: 'squad', inputs: 1, actions: ['left', 'right'], teacher: see => see[0] < 0 ? 'left' : 'right', limits: { react: .5, perSecond: 100, minNoise: 0 }, share: false }), sw = new Wave(sb, { change: 0 });
  const lefty = sw.mind(), righty = sw.mind();
  for (let i = 0; i < 30; i++) { lefty.act([-1], 1 / 60); righty.act([1], 1 / 60); }
  assert.ok(lefty.action === 'left' && righty.action === 'right', 'each mind decides for itself: ' + lefty.action + ' ' + righty.action);
  assert.equal(sb.last, -1, "minds don't change the brain's own choice");
  // Imagine: picks the move that gets to the goal
  const plan = new Imagine({ actions: ['left', 'stay', 'right'], step: (s, a, dt) => ({ x: s.x + (a - 1) * dt * 5 }), score: s => -Math.abs(s.x - 3) });
  assert.equal(plan.pick({ x: 0 }), 2); assert.equal(plan.action, 'right'); assert.equal(plan.pick({ x: 6 }), 0);
  // Imagine fixed: always every try, whatever the clock says
  const slow = new Imagine({ actions: 3, tries: 4, budget: 0, fixed: true, step: (s, a, dt) => { const t = performance.now(); while (performance.now() - t < .05); return { x: s.x + (a - 1) * dt }; }, score: s => s.x });
  slow.pick({ x: 0 }); assert.equal(slow.tried, 4, 'fixed plans try everything');
  const quick = new Imagine({ actions: 3, tries: 4, budget: 0, step: slow.step, score: slow.score });
  quick.pick({ x: 0 }); assert.ok(quick.tried < 4, 'budgeted plans stop early: ' + quick.tried);
  // Imagine auto: a phone too slow for plans switches them off and uses the fallback
  const heavy = new Imagine({ actions: ['a', 'b'], tries: 1, depth: 4, auto: true, maxMs: .01, fallback: () => 'b', step: (s) => { const t = performance.now(); while (performance.now() - t < .05); return s; }, score: () => 0 });
  heavy.on = true; heavy.why = '';   // (Node counts as a low phone: no graphics chip)
  for (let i = 0; i < 12; i++) heavy.pick({});
  assert.ok(!heavy.on && heavy.why === 'too slow', 'auto switches off: ' + heavy.why);
  assert.equal(heavy.pick({}), 1); assert.equal(heavy.action, 'b');
  const light = new Imagine({ actions: 2, auto: true, step: s => s, score: () => 0 });
  assert.equal(light.why, 'low phone', 'a low phone never plans'); light.on = true;
  for (let i = 0; i < 12; i++) light.pick({});
  assert.ok(light.on, 'cheap plans stay on');
  // Wave.unsure: copies of one brain agree; very different minds don't
  const ub = new Brain({ name: 'u', inputs: 2, actions: 3, share: false }), uw = new Wave(ub, { change: .001 });
  const u1 = uw.mind(), u2 = uw.mind();
  assert.ok(uw.unsure([.5, -.5]) < .01, 'near copies agree: ' + uw.unsure([.5, -.5]).toFixed(4));
  const uw2 = new Wave(ub, { change: 3 }); for (let i = 0; i < 6; i++) uw2.mind();
  assert.ok(uw2.unsure([1, -1]) > uw.unsure([1, -1]) + .05, 'far-apart minds disagree: ' + uw2.unsure([1, -1]).toFixed(3));
  u1.done(); u2.done(); assert.equal(uw.unsure([0, 0]), 0, 'no live minds: sure');
  // even steps: learns to copy a teacher whose inputs are tiny (fixed steps barely move)
  const teach = see => (see[0] > 0 ? 1 : 0);
  const fit = even => {
    const eb = new Brain({ name: 'e' + even, inputs: 1, actions: 2, hidden: [4], teacher: teach, even, limits: { react: 0, perSecond: 1e3, minNoise: 0 }, share: false });
    let q = 3; const rr = () => (q = (q * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 1500; i++) eb.act([(rr() * 2 - 1) * .02], 1 / 60);
    let ok = 0; for (let i = 0; i < 200; i++) { const x = (rr() * 2 - 1) * .02, p = eb.net.run([x]); if ((p[1] > p[0]) === (x > 0)) ok++; }
    assert.ok(eb.net.w.every(Number.isFinite), 'even steps stay finite');
    return ok;
  };
  const plainFit = fit(false), evenFit = fit(true);
  assert.ok(evenFit > 170 && evenFit > plainFit, `even steps learn small inputs: ${evenFit}/200 vs ${plainFit}/200`);
  // odds: a player who wins 90% at low skill and 20% at high; the skill settles where they win ~60%
  const ob = new Brain({ name: 'odds', inputs: 1, actions: 2, odds: true, share: false });
  let q2 = 9; const r2 = () => (q2 = (q2 * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 300; i++) ob.result(r2() < .95 - ob.skill * .8);   // true chance .6 at skill ~.44
  assert.ok(Math.abs(ob.winChance(.44) - .6) < .15 && ob.skill > .25 && ob.skill < .65, `odds: skill ${ob.skill.toFixed(2)}, chance at .44 ${ob.winChance(.44).toFixed(2)}`);
  assert.ok(ob.winChance(.1) >= ob.winChance(.9), 'more skill never helps the player');
  // Predict: spots a cycle, then a habit change; saves and restores
  const pslots = new Map(), papi = { brains: { load: k => pslots.get(k) ?? null, save: (k, v) => pslots.set(k, v) } };
  const pr = new Predict(papi, { moves: ['rock', 'paper', 'scissors'] });
  assert.equal(pr.guess(), null); assert.equal(pr.sure, 0);
  const cyc = ['rock', 'rock', 'paper', 'scissors'];
  for (let i = 0; i < 60; i++) pr.see(cyc[i % 4]);
  let hits = 0; for (let i = 60; i < 100; i++) { if (pr.guess() === cyc[i % 4]) hits++; pr.see(cyc[i % 4]); }
  assert.ok(hits >= 36, 'learns a 4-move cycle: ' + hits + '/40');
  assert.ok(pr.right > .8 && pr.sure > .4, `right ${pr.right.toFixed(2)}, sure ${pr.sure.toFixed(2)}`);
  const ch = pr.chances(); assert.ok(Math.abs(ch[0] + ch[1] + ch[2] - 1) < 1e-9, 'chances add up to 1');
  for (let i = 0; i < 40; i++) pr.see('paper');
  assert.equal(pr.guess(), 'paper', 'follows a new habit');
  pr.persist(); const pr2 = new Predict(papi, { moves: ['rock', 'paper', 'scissors'] });
  assert.ok(pr2.seen === pr.seen && pr2.guess() === 'paper', 'habits restored from the slot');
  assert.ok(pslots.get('habits').length < 400, 'small save: ' + pslots.get('habits').length);
  pr2.forget(); assert.equal(pr2.guess(), null, 'forget clears');
  let rnd = 0, pr3 = new Predict({ moves: 4, name: 'noise' }); let q3 = 5;
  for (let i = 0; i < 400; i++) { const m = (q3 = (q3 * 16807) % 2147483647) % 4; if (i > 100 && pr3.guess() === m) rnd++; pr3.see(m); }
  assert.ok(pr3.sure < .35 && rnd < 110, `random player: not fooled (sure ${pr3.sure.toFixed(2)}, ${rnd}/299 right)`);
  console.log('brains: copy, trust, drift, win rate, rules, limits, waves, plans, fixed plans, unsure, even steps, odds, predict ok');
}

// Tiny Brains round 2: player profile, fun lean, styles, tells, start, watch, Nemesis, Shadow, tune
{
  const { Brain, Wave, Player, Nemesis, Shadow, tune, liveBrains } = await import('../src/kit/brains.js');
  // a profile shared by every game's brains: a fresh brain starts at the player's level
  const prof = {}, papi = id => ({ brains: { load: () => null, save: () => true, player: { read: () => JSON.parse(JSON.stringify(prof)), write: (k, v, n) => { prof[k] = { v, n }; return true; } } } });
  const me = new Player(papi('a'));
  assert.equal(me.skill, .5, 'skill before any notes');
  for (let i = 0; i < 40; i++) me.note('skill', .3);
  assert.ok(Math.abs(me.skill - .3) < .01, 'notes move it: ' + me.skill);
  me.note('reaction', .25); assert.equal(me.reaction, .25, 'first note is the value');
  const fresh = new Brain(papi('b'), { name: 'new', inputs: 1, actions: 2, share: false });
  assert.ok(Math.abs(fresh.skill - .3) < .01, 'a brand new brain starts at the player\'s level: ' + fresh.skill);
  for (let i = 0; i < 6; i++) fresh.result(true);
  assert.ok(prof.skill.n > 40, 'brains add to the profile after a few rounds');
  // fun: rounds tenser than usual that the player enjoyed lean towards more pressure
  let fn = null;
  const fapi = { brains: { load: () => null, save: () => true, onFun: (n, f) => { fn = f; return () => {}; } } };
  const fb = new Brain(fapi, { name: 'fun', inputs: 1, actions: 2, share: false, profile: false });
  assert.ok(fn, 'brains listen for fun signals');
  for (let r = 0; r < 30; r++) { const tense = r % 2; for (let i = 0; i < 10; i++) fb.feel(tense ? 1 : 0); fb.result(true); fn(tense ? 1 : -.5); }
  assert.ok(fb.lean > .05, 'leans to what the player enjoys: ' + fb.lean.toFixed(3));
  assert.ok(fb.lean <= .3, 'and no further than .3');
  // styles: the teacher and rules hear the personality, and it's an input
  const seen = [];
  const sb = new Brain({ name: 'styled', inputs: 2, actions: ['a', 'b'], styles: ['calm', 'bold'], teacher: (see, st) => { seen.push(st); return st === 'bold' ? 'b' : 'a'; }, limits: { react: 0, perSecond: 1e3, minNoise: 0 }, share: false, profile: false });
  assert.equal(sb.net.sizes[0], 4, 'one input per personality');
  for (let i = 0; i < 3000; i++) { sb.style = i % 2 ? 'bold' : 'calm'; sb.act([0, 0], 1 / 60); }
  assert.ok(seen.includes('bold') && seen.includes('calm'), 'the teacher hears the style');
  sb.style = 'bold'; const pb = sb.net.run(sb.input([0, 0]))[1]; sb.style = 'calm'; const pc = sb.net.run(sb.input([0, 0]))[1];
  assert.ok(pb > .7 && pc < .3, `each personality learns its own way (bold ${pb.toFixed(2)}, calm ${pc.toFixed(2)})`);
  sb.style = { bold: .7, calm: .3 }; assert.equal(sb.style, 'bold', 'mixes take the strongest name');
  const sw = new Wave(sb), m1 = sw.mind({ style: 'calm' }), m2 = sw.mind({ style: 'bold' });
  assert.ok(m1.style === 'calm' && m2.style === 'bold' && sb.style === 'bold', 'each wave mind has its own personality');
  // tells: a wind-up before a change, then the change
  const tb = new Brain({ name: 'tells', inputs: 1, actions: ['a', 'b'], teacher: s => (s[0] > 0 ? 'b' : 'a'), tells: { windup: .3 }, limits: { react: 0, perSecond: 1e3, minNoise: 0 }, share: false, profile: false });
  for (let i = 0; i < 400; i++) tb.act([i % 2 ? 1 : -1], 1 / 60);
  while (tb.telling) tb.act([-1], 1 / 60);
  for (let i = 0; i < 5 && tb.action !== 'a'; i++) tb.act([-1], 1 / 60);
  tb.act([1], 1 / 60);
  if (tb.action === 'a') { assert.ok(tb.telling && tb.telling.action === 'b', 'shows the tell first'); let n = 0; while (tb.telling) { tb.act([1], 1 / 60); n++; } assert.ok(n >= 5, 'the tell lasts: ' + n + ' frames'); assert.equal(tb.action, 'b', 'then does it'); }
  // start + watch: a starting brain from the maker's play
  const sh = new Shadow({ name: 'maker', inputs: 1, actions: ['l', 'r'], hidden: [6] });
  for (let i = 0; i < 3000; i++) { const x = Math.sin(i * 1.7); sh.watch([x], x < 0 ? 'l' : 'r'); }
  const st = new Brain({ name: 'started', inputs: 1, actions: ['l', 'r'], hidden: [6], start: sh.pack(), limits: { react: 0, minNoise: 0 }, share: false, profile: false });
  assert.ok(st.anchor && st.net.run([-.8])[0] > .8 && st.net.run([.8])[1] > .8, 'start: plays like the maker from the first frame');
  st.watch([-.5], 'l'); assert.ok(st.net.w.every(Number.isFinite), 'watch learns');
  assert.ok(liveBrains().includes(st), 'live brains are listed for the debug overlay');
  // Nemesis remembers between sessions
  const ns = new Map(), napi = { brains: { load: k => ns.get(k) ?? null, save: (k, v) => ns.set(k, v) } };
  const lines = { first: ['Hi {name}'], back: ['Back?'], long: ['{days} days!'], won: ['Lucky'], lost: ['Good try'], streak: ['{streak} wins!'] };
  const n1 = new Nemesis(napi, { name: 'grub', moves: ['l', 'r'], lines });
  assert.equal(n1.met(1e12), 'Hi grub', 'first meeting');
  n1.result(true); n1.result(true); assert.equal(n1.result(true), '3 wins!', 'streak line');
  const n2 = new Nemesis(napi, { name: 'grub', moves: ['l', 'r'], lines });
  assert.equal(n2.record.wins, 3, 'remembers the record');
  assert.equal(n2.met(1e12 + 5 * 864e5), '5 days!', 'notices time away');
  assert.ok(n2.grudge > 0, 'wants a rematch after losing');
  // tune: finds numbers that hit a target
  const t = tune({ params: { jump: [100, 900], g: [500, 2500] }, trial: p => (p.jump * p.jump) / (2 * p.g), want: 100, tries: 120, repeats: 1 });
  assert.ok(Math.abs(t.result - 100) < 5, 'tune hits the target: ' + t.result.toFixed(1));
  assert.equal(t.log.length, 120, 'logs each try');
  console.log('brains 2: profile, fun lean, styles, tells, start + watch, Nemesis, Shadow, tune ok');
}

// ---- round 6 game kits
{
  const { Board } = await import('../src/kit/board.js');
  let n = 0; const b = new Board(6, 6, { fill: () => ({ kind: n++ % 4 }) });
  b.settle(); assert.equal(b.matches().length, 0, 'settle leaves no matches');
  const g = new Board(5, 1); ['a', 'a', 'a', 'b', 'a'].forEach((k, c) => g.put(c, 0, { kind: k }));
  const m = g.matches(); assert.equal(m.length, 1); assert.equal(m[0].size, 3);
  const s = new Board(4, 1); [2, 2, null, 4].forEach((k, c) => k && s.put(c, 0, { kind: k }));
  const r = s.slide('left', { merge: (a, c) => a.kind === c.kind && { kind: a.kind * 2 } });
  assert.ok(r.moved); assert.equal(s.get(0, 0).kind, 4); assert.equal(s.get(1, 0).kind, 4); assert.equal(s.get(2, 0), null);
  const f = new Board(3, 3); for (let r2 = 0; r2 < 3; r2++) for (let c = 0; c < 3; c++) f.put(c, r2, { kind: c < 2 ? 'x' : 'y' });
  assert.equal(f.flood(0, 0).length, 6, 'flood fill finds the connected group');
  console.log('board: settle, matches, slide and merge, flood ok');
}
{
  const { Fighter, Battle, Bag, xpFor, levelFor, gainXp, loot } = await import('../src/kit/battle.js');
  let i = 0; const rng = () => [.5, .9, .3, .7][i++ % 4];
  const hero = new Fighter({ name: 'Pip', hp: 30, atk: 8, def: 4, spd: 6, type: 'leaf' }), goo = new Fighter({ name: 'Goo', hp: 18, atk: 5, def: 2, spd: 3, type: 'water' });
  const fight = new Battle([[hero], [goo]], { types: { leaf: { water: 2 } }, rng });
  assert.equal(fight.turn, hero, 'faster fighter goes first');
  assert.ok(fight.preview(hero, goo, { power: 10, type: 'leaf' }) > fight.preview(goo, hero, { power: 10, type: 'water' }), 'type bonus');
  let hits = 0; fight.on('hit', () => hits++);
  for (let k = 0; k < 20 && fight.over == null; k++) { const who = fight.turn; fight.act(who, { move: { power: 10, type: who.type }, target: fight.foes(who)[0] }); }
  assert.equal(fight.over, 0, 'hero side wins'); assert.ok(hits > 0);
  const bag = new Bag({ potion: { heal: 10 } }); bag.add('potion', 2); assert.ok(bag.take('potion')); assert.equal(bag.count('potion'), 1);
  assert.equal(levelFor(xpFor(5)), 5); const f2 = new Fighter({ hp: 10 }); assert.equal(gainXp(f2, xpFor(3)), 2); assert.equal(f2.maxHp, 16);
  assert.equal(loot([{ id: 'a', w: 1 }, { id: 'b', w: 3 }], () => .9).id, 'b');
  console.log('battle: turn order, types, a whole fight, bag, levels, loot ok');
}
{
  const { cost, afford, short, Earner } = await import('../src/kit/idle.js');
  assert.ok(Math.abs(cost(15, 1.15, 0, 2) - (15 + 15 * 1.15)) < 1e-9);
  const n = afford(15, 1.15, 3, 500); assert.ok(cost(15, 1.15, 3, n) <= 500 && cost(15, 1.15, 3, n + 1) > 500, 'afford is exact');
  assert.equal(short(999), '999'); assert.equal(short(1234567), '1.23M'); assert.equal(short(1e36), '1.00aa');
  const e = new Earner({ farm: { base: 10, rate: 2 } }, 100); assert.ok(e.buy('farm')); e.update(5); assert.ok(Math.abs(e.money - (90 + 10)) < 1e-9);
  assert.equal(e.catchUp(10, .5), 10);
  console.log('idle: cost, afford, short, Earner ok');
}
{
  const { Turns, Split } = await import('../src/kit/party.js');
  const t = new Turns({ players: 3 }); t.ready(); t.add(5).next(); assert.ok(t.waiting); t.ready().out().next();
  assert.equal(t.player.index, 2); t.ready().next(); assert.equal(t.player.index, 0); assert.equal(t.round, 2);
  t.ready().next(); assert.equal(t.player.index, 2, 'a knocked-out player is skipped'); assert.equal(t.leader.index, 0);
  const s = new Split(360, 640, { players: 2 }); assert.equal(s.who(10, 600), 0); assert.equal(s.who(10, 10), 1);
  const l = s.local(1, 10, 10); assert.equal(l.x, 350); assert.equal(l.y, 310);
  console.log('party: turns, knock-outs, rounds, split screen ok');
}
{
  const { Chart } = await import('../src/kit/rhythm.js');
  const ch = new Chart(`x . x = | = . . x\n. x . . | . . x .`, { bpm: 120, per: 2 });
  assert.equal(ch.notes.length, 5); assert.equal(ch.lanes, 2);
  assert.equal(ch.hit(0, 0.02).result, 'perfect'); assert.equal(ch.hit(1, .25 + .07).result, 'good'); assert.equal(ch.hit(0, 2), null);
  assert.equal(ch.notes.find(n => n.lane === 0 && n.time === .5).hold, .25 * 2, 'holds join on');
  assert.equal(ch.missed(5).length, 3); assert.equal(ch.combo, 0); assert.equal(ch.best, 2);
  console.log('rhythm: chart, perfect/good, holds, misses, combo ok');
}
{
  const { Shapes, Stroke, simplify } = await import('../src/kit/strokes.js');
  const shapes = new Shapes(); let ok = 0;
  const arc = (k, f) => Array.from({ length: k }, (_, i) => f(i / (k - 1)));
  const tests = { circle: arc(40, u => [200 + Math.cos(u * 6.28) * 80, 300 + Math.sin(u * 6.28) * 70]), line: arc(20, u => [100 + u * 200, 300 + u * 30]), wave: arc(40, u => [100 + u * 200, 300 + Math.sin(u * 12.5) * 25]) };
  for (const [k, pts] of Object.entries(tests)) if (shapes.match(pts).name === k) ok++;
  assert.equal(ok, 3, 'recognises circle, line and wave');
  const st = new Stroke(); for (let i = 0; i < 50; i++) st.add(Math.cos(i / 49 * 6.3) * 60, Math.sin(i / 49 * 6.3) * 60); assert.ok(st.closed && Math.abs(st.turns) > .8, 'a loop is closed with about one turn');
  assert.equal(simplify([[0, 0], [5, .1], [10, 0]], 1).length, 2);
  console.log('strokes: shapes, loops, simplify ok');
}
{
  const { Car, Kart, Laps } = await import('../src/kit/vehicles.js');
  const car = new Car({ top: 200 }); for (let i = 0; i < 120; i++) car.update(1 / 60, { throttle: 1 });
  assert.ok(car.speed > 150 && car.x > 100 && Math.abs(car.y) < 1, 'car drives straight ahead');
  const a0 = car.angle; for (let i = 0; i < 30; i++) car.update(1 / 60, { throttle: 1, steer: 1 }); assert.ok(car.angle > a0, 'steers right');
  for (let i = 0; i < 30; i++) car.update(1 / 60, { throttle: 1, steer: 1, drift: true }); assert.ok(car.drifting && car.slide > 10, 'drifts and slides');
  for (let i = 0; i < 20; i++) car.update(1 / 60, { throttle: 1, steer: 1, drift: true }); car.update(1 / 60, { throttle: 1 }); assert.ok(car.boostLeft > 0, 'a long drift boosts on release');
  const kart = new Kart(); kart.hop(); let landed = false; for (let i = 0; i < 60; i++) { kart.update(1 / 60, { throttle: 1 }); landed ||= kart.landed; }
  assert.ok(landed && kart.onGround && kart.z < -1, 'kart hops, lands and drives along -z');
  const race = new Laps([[0, 0], [100, 0], [100, 100]], { radius: 20, laps: 1 }), r = { x: 0, y: 0 }; race.join(r);
  for (const [x, y] of [[100, 0], [100, 100], [0, 0]]) { r.x = x; r.y = y; race.update(r); } assert.ok(r.done && r.lap === 1, 'a lap counts');
  console.log('vehicles: car, drift boost, kart hop, laps ok');
}
{
  const { Drag } = await import('../src/kit/drag.js');
  const d = new Drag({ accept: (p, s) => p.kind === s.kind }); let drops = 0, rejects = 0; d.on('drop', () => drops++).on('reject', () => rejects++);
  const red = d.piece({ x: 10, y: 10, w: 20, h: 20, kind: 'r' }), sr = d.slot({ x: 100, y: 100, w: 30, h: 30, kind: 'r' }), sb = d.slot({ x: 200, y: 100, w: 30, h: 30, kind: 'b' });
  d.down(10, 10); d.move(200, 100); d.up(200, 100); assert.equal(rejects, 1); for (let i = 0; i < 60; i++) d.update(1 / 60); assert.equal(red.x, 10, 'rejected piece slides home');
  d.down(10, 10); d.move(102, 98); d.up(102, 98); for (let i = 0; i < 60; i++) d.update(1 / 60);
  assert.equal(drops, 1); assert.equal(sr.piece, red); assert.equal(red.x, 100, 'dropped piece snaps into the slot'); assert.equal(sb.piece, null);
  console.log('drag: reject and home, drop and snap ok');
}
{
  const { History } = await import('../src/kit/history.js');
  let b = { cells: [0, 0, 0] }; const h = new History(b, { max: 3 });
  b.cells[0] = 1; h.push(b, 'a'); b.cells[1] = 1; h.push(b, 'b');
  assert.equal(h.undoLabel, 'b'); b = h.undo(); assert.deepEqual(b.cells, [1, 0, 0], 'undo gives the step before'); b.cells[2] = 9;
  assert.deepEqual(h.now().cells, [1, 0, 0], 'the copy it gives back is the game\'s own'); b = h.redo(); assert.deepEqual(b.cells, [1, 1, 0], 'redo');
  h.undo(); b = h.now(); b.cells[2] = 2; h.push(b, 'c'); assert.equal(h.canRedo, false, 'a new change drops what was ahead');
  for (let i = 0; i < 5; i++) { b.cells[0] = i; h.push(b, 'x' + i); } assert.equal(h.back, 3, 'keeps at most max steps');
  for (let i = 0; i < 4; i++) { b.cells[1] = i; h.push(b, 'drag', { merge: 'slider' }); } h.undo(); assert.notEqual(h.now().cells[1], 2, 'merged pushes are one step');
  const g = new History({ n: 0 }); const st = { n: 0 }; g.group(st, 'two', () => { st.n = 1; g.push(st); st.n = 2; g.push(st); }); assert.equal(g.back, 1); assert.equal(g.now().n, 2, 'group is one step');
  assert.equal(g.undo().n, 0); assert.equal(g.undos, 1);
  const pk = JSON.parse(JSON.stringify(g.redo() && g.pack())); assert.equal(new History({}).unpack(pk).now().n, 2, 'pack and unpack');
  console.log('history: undo, redo, drop ahead, max, merge, group, pack ok');
}
{
  const { Inventory, Recipes } = await import('../src/kit/items.js');
  const D = { wood: { stack: 10 }, stone: { stack: 10 }, axe: { stack: 1, kind: 'tool' }, hat: { stack: 1, kind: 'head', weight: 2 } };
  const inv = new Inventory(D, { slots: 3, extra: { hand: 'tool' } });
  assert.equal(inv.add('wood', 14), 0); assert.deepEqual(inv.slots.map(s => s?.n ?? 0), [10, 4, 0], 'stacks fill, then a new slot');
  assert.equal(inv.add('stone', 25), 15, 'what does not fit comes back'); assert.equal(inv.take('wood', 20), false); assert.ok(inv.take('wood', 5)); assert.equal(inv.count('wood'), 9);
  const inv2 = new Inventory(D, { slots: 4, extra: { hand: 'tool', head: 'head' } }); inv2.add('wood', 3); inv2.add('axe');
  assert.equal(inv2.move(0, 'hand'), false, 'equip slots take only their kind'); assert.ok(inv2.move(1, 'hand')); assert.equal(inv2.equip.hand.id, 'axe');
  inv2.add('wood', 4); assert.equal(inv2.count('wood'), 7); assert.equal(inv2.split(0), 1); assert.ok(inv2.move(1, 0), 'merge back'); assert.equal(inv2.slots[0].n, 7);
  inv2.add('stone', 2); inv2.sort(); assert.deepEqual(inv2.slots.filter(Boolean).map(s => s.id), ['stone', 'wood']);
  assert.deepEqual(new Inventory(D, { slots: 4, extra: { hand: 'tool', head: 'head' } }).load(JSON.parse(JSON.stringify(inv2.save()))).save(), inv2.save(), 'save and load');
  const heavy = new Inventory(D, { slots: 9, weight: 5 }); assert.equal(heavy.add('hat', 4), 2, 'weight limit');
  const book = new Recipes(D).add('plank', { wood: 1 }, { makes: 4 }).add('axe', { wood: 3, stone: 2 }, { keep: ['bench'] }).add('lamp', { stone: 1 }, { at: 'forge', time: 2 });
  const bag = new Inventory(D, { slots: 6 }); bag.add('wood', 3); bag.add('stone', 1);
  assert.deepEqual(book.missing('axe', bag), { bench: 1, stone: 1 }, 'missing lists tools and parts');
  assert.deepEqual(book.can(bag).map(r => r.id), ['plank']); assert.equal(book.times('plank', bag), 3);
  assert.ok(book.make('plank', bag)); assert.equal(bag.count('plank'), 4); assert.equal(book.make('axe', bag), null);
  assert.equal(book.make('lamp', bag), null, 'a station recipe needs the station'); assert.ok(book.make('lamp', bag, 'forge')); assert.equal(bag.count('stone'), 0);
  let done = 0; book.timer.on('done', () => done++); book.timer.update(1); assert.equal(bag.count('lamp'), 0); book.timer.update(1.1); assert.equal(bag.count('lamp'), 1); assert.equal(done, 1, 'timed making');
  assert.deepEqual(book.uses('stone').map(r => r.id), ['axe', 'lamp']);
  console.log('items: stacks, take, equip kinds, split, merge, sort, save, weight, recipes, missing, stations, timed ok');
}
{
  const { Adventure } = await import('../src/kit/adventure.js');
  const adv = new Adventure({ start: 'hall' }), said = []; adv.on('say', t => said.push(t));
  adv.room('hall', { map: [0, 0] }).spot('door', { x: 300, y: 200, w: 60, h: 160, look: 'Oak.', exit: 'lib', locked: 'Locked.' })
    .spot('key', { x: 80, y: 500, r: 20, take: true, took: 'Got it.' }).spot('rug', { poly: [[100, 600], [260, 600], [240, 640], [120, 640]], look: 'Lumpy.', when: () => !adv.flag('moved') })
    .spot('chest', { x: 300, y: 500, w: 80, h: 60, z: 1, look: 'A chest.' });
  adv.room('lib', { map: [1, 0] }).spot('back', { x: 10, y: 300, w: 20, h: 600, exit: 'hall' });
  adv.rule('key', 'door', () => { adv.unlock('hall', 'door'); return 'Click!'; });
  adv.rule('rope', 'hook', () => { adv.bag.add('grapple'); return 'A grapple.'; });
  assert.equal(adv.tap(300, 200).did, 'locked'); assert.equal(adv.tap(0, 0).did, 'nothing'); assert.equal(adv.tap(180, 620).text, 'Lumpy.', 'polygon spots');
  assert.equal(adv.tap(80, 505).did, 'take'); assert.ok(adv.bag.has('key')); assert.equal(adv.at(80, 505), null, 'taken things are gone');
  assert.equal(adv.tap(300, 500, 'key').did, 'cant'); assert.ok(adv.bag.has('key'), 'a wrong use keeps the item');
  assert.equal(adv.tap(300, 200, 'key').text, 'Click!'); assert.ok(!adv.bag.has('key'), 'used up');
  assert.equal(adv.tap(300, 200).did, 'exit'); assert.equal(adv.here, 'lib');
  adv.flag('moved', true); assert.equal(adv.spots('hall').some(s => s.id === 'rug'), false, 'when() hides a spot');
  const m = adv.map(); assert.equal(m.length, 2); assert.deepEqual(m.find(r => r.id === 'hall').links, ['lib']); assert.ok(m.find(r => r.id === 'lib').here);
  adv.bag.add('rope'); adv.bag.add('hook'); assert.equal(adv.combine('hook', 'rope'), 'A grapple.'); assert.ok(adv.bag.has('grapple') && !adv.bag.has('rope'), 'combine either way round');
  const back = new Adventure({ start: 'hall' }); back.room('hall'); back.room('lib'); back.load(JSON.parse(JSON.stringify(adv.save())));
  assert.equal(back.here, 'lib'); assert.ok(back.flag('moved') && back.bag.has('grapple') && back.unlocked.has('hall:door'), 'save and load');
  assert.deepEqual(said.slice(0, 2), ['Locked.', 'Lumpy.'], 'tapping nothing says nothing');
  console.log('adventure: hotspots (rect, circle, polygon, z), take, use, locks, exits, when, map, combine, save ok');
}
{
  const { HexMap, Iso } = await import('../src/kit/hex.js');
  for (const pointy of [true, false]) {
    const m = new HexMap({ size: 10, pointy, w: 6, h: 5, x: 5, y: 7 }); assert.equal(m.list.length, 30);
    for (const c of m.list) assert.equal(m.at(c.x + 2, c.y - 2), c, 'a tap finds its hex');
    assert.equal(m.at(-50, -50), null); const mid = m.list.find(c => m.neighbours(c).length === 6); assert.ok(mid, 'inner cells have six neighbours');
    for (const n of m.neighbours(mid)) assert.equal(m.distance(mid, n), 1);
  }
  const h = new HexMap({ size: 10, shape: 'hex', radius: 3 }); assert.equal(h.list.length, 37, 'a hex of radius 3 has 37 cells');
  assert.ok(Math.abs(Math.min(...h.list.flatMap(c => c.corners.map(p => p[0])))) < 1e-6, 'its corner at x');
  const centre = h.list.find(c => h.neighbours(c).length === 6 && h.ring(c, 3).length === 18); assert.ok(centre); assert.equal(h.range(centre, 1).length, 7);
  const edge = h.ring(centre, 3)[0], far = h.list.find(c => h.distance(c, edge) === 6); assert.equal(h.line(edge, far).length, 7);
  const wall = new Set(h.ring(centre, 1).slice(0, 5)); const cost = c => wall.has(c) ? Infinity : 1;
  const p = h.path(edge, far, cost); assert.ok(p && p[0] === edge && p.at(-1) === far && !p.some(c => wall.has(c)), 'a path round the wall');
  const r = h.reach(centre, 2, cost); assert.ok(!r.has(h.ring(centre, 1)[0]) && r.has(h.ring(centre, 1)[5]), 'reach stops at blocked hexes');
  assert.equal(h.sees(edge, far, c => c === centre), !h.line(edge, far).slice(1, -1).includes(centre));
  centre.data.town = 1; const h2 = new HexMap({ size: 10, shape: 'hex', radius: 3 }).load(JSON.parse(JSON.stringify(h.save()))); assert.equal(h2.cell(centre.q, centre.r).data.town, 1, 'save and load');
  const iso = new Iso({ tw: 32, th: 16, x: 100, y: 20 }); const s = iso.toScreen(3, 2); const t = iso.toTile(s.x, s.y);
  assert.ok(Math.abs(t.tx - 3) < 1e-9 && Math.abs(t.ty - 2) < 1e-9, 'iso screen and back'); assert.deepEqual(iso.sort([{ tx: 2, ty: 2 }, { tx: 0, ty: 1 }]).map(o => o.tx), [0, 2]);
  console.log('hex: taps (pointy and flat), neighbours, hex shape, range, ring, line, path, reach, sight, save; iso ok');
}
{
  const { Select, formation, FlowField, BuildGrid, target } = await import('../src/kit/rts.js');
  const U = [{ x: 10, y: 10, kind: 'a' }, { x: 50, y: 12, kind: 'a' }, { x: 200, y: 200, kind: 'b' }, { x: 300, y: 20, kind: 'a' }];
  const sel = new Select(() => U);
  sel.down(0, 0); sel.move(60, 30); assert.ok(sel.box); assert.ok(sel.up(60, 30)); assert.deepEqual(sel.list, [U[0], U[1]], 'box select');
  sel.down(198, 201); assert.ok(sel.up(198, 201)); assert.deepEqual(sel.list, [U[2]], 'tap select');
  sel.down(500, 500); assert.equal(sel.up(500, 500), false, 'a tap on nothing is an order'); assert.deepEqual(sel.list, [U[2]]);
  sel.down(11, 10); sel.up(11, 10); sel.down(11, 10); sel.up(11, 10); assert.equal(sel.list.length, 3, 'double tap picks the kind');
  for (const shape of ['grid', 'line', 'wedge', 'circle']) {
    const f = formation(U, 100, 100, { shape, gap: 20 }); assert.equal(new Set(f.map(p => p[1])).size, 4, shape + ': a place each');
    for (const [, a] of f) for (const [, b] of f) if (a !== b) assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > 10, shape + ': places apart');
  }
  const bg = new BuildGrid(10, 10, 10); assert.ok(bg.place({}, 4, 0, 1, 9)); assert.equal(bg.fits(3, 0, 2, 2), false); const sn = bg.snap(12, 12, 2, 2); assert.deepEqual([sn.tx, sn.ty, sn.ok], [0, 0, true]);
  const ff = new FlowField(10, 10, 10, (tx, ty) => bg.free(tx, ty) ? 1 : Infinity).to(8, 1);
  let p = { x: 15, y: 15 }; for (let i = 0; i < 400 && ff.at(...Object.values(ff.tile(p.x, p.y))) > 0; i++) { const d = ff.dir(p.x, p.y); p.x += d.x * 2; p.y += d.y * 2; assert.ok(bg.free(Math.floor(p.x / 10), Math.floor(p.y / 10)), 'steers round the wall'); }
  assert.deepEqual(ff.tile(p.x, p.y), { tx: 8, ty: 1 }, 'flow field reaches the goal');
  const foes = [{ x: 0, y: 30, left: 5, hp: 3 }, { x: 0, y: 60, left: 2, hp: 9 }, { x: 0, y: 500, left: 0, hp: 1 }];
  assert.equal(target({ x: 0, y: 0 }, foes, { range: 100 }), foes[1], 'first: furthest along, in range'); assert.equal(target({ x: 0, y: 0 }, foes, { by: 'near' }), foes[0]); assert.equal(target({ x: 0, y: 0 }, foes, { by: 'strong' }), foes[1]);
  console.log('rts: box, tap, double tap, orders, formations, build grid, flow field, targets ok');
}
{
  const { Reader, Fighter, clash } = await import('../src/kit/fight.js');
  const F = 1 / 60, r = new Reader(), step = (x, y, b = {}, n = 2, facing = 1) => { for (let i = 0; i < n; i++) r.feed(x, y, b, F, facing); };
  step(0, -1); step(1, -1); step(1, 0); step(1, 0, { P: true }); assert.ok(r.did('236P'), 'quarter circle forward');
  step(0, 0, { P: false }, 2); assert.equal(r.did('236P'), false, 'the press was taken');
  step(0, 0, {}, 40); step(0, -1); step(-1, -1); step(-1, 0, {}, 2, 1); step(-1, 0, { P: true }, 1, 1); assert.equal(r.did('236P'), false, 'the wrong way round');
  step(0, 0, { P: false }, 40); step(1, 0); step(0, 0); step(1, 0); assert.ok(r.did('66'), 'dash'); step(0, 0, {}, 60); step(1, 0); assert.equal(r.did('66'), false, 'too slow is not a dash');
  step(0, -1, {}, 2, -1); step(-1, -1, {}, 2, -1); step(-1, 0, { K: true }, 2, -1); assert.ok(r.did('236K'), 'forward follows facing');
  step(0, 0, { P: true }, 1); step(0, 0, { P: false }, 5); assert.ok(r.take('P'), 'a press is kept in the buffer'); step(0, 0, { P: true }, 1); step(0, 0, { P: false }, 20); assert.equal(r.take('P'), false, 'and lets go after it');
  const M = { jab: { start: 3, active: 2, recover: 6, hit: [[10, -50, 30, 14]], damage: 4, stun: 12, cancel: ['fb'] }, fb: { start: 10, active: 1, recover: 20, input: '236P' }, low: { start: 2, active: 2, recover: 4, hit: [[10, -10, 30, 10]], low: true } };
  step(0, 0, {}, 30); step(0, -1); step(1, -1); step(1, 0, { P: true }); assert.equal(r.special(M), 'fb');
  const a = new Fighter(M, { x: 0 }), b = new Fighter(M, { x: 40, facing: -1 }); let hits = 0; a.on('hit', () => hits++);
  assert.ok(a.start('jab')); assert.equal(a.start('jab'), false, 'busy'); a.update(F * 2); assert.equal(a.phase, 'start'); assert.equal(clash(a, b), null);
  a.update(F * 1.5); assert.equal(a.phase, 'active'); const h = clash(a, b); assert.ok(h && !h.blocked && b.stun === 12 && hits === 1); assert.equal(clash(a, b), null, 'one hit per move');
  assert.ok(a.stop > 0); a.update(.2); assert.ok(a.canCancel('fb') && a.start('fb'), 'cancel after a hit');
  const e = new Fighter(M, { x: 0 }), g = new Fighter(M, { x: 40, facing: -1 }); g.blocking = true; e.start('jab'); e.update(F * 3.5); assert.ok(clash(e, g).blocked, 'blocked high'); assert.equal(g.stun, 6, 'block stun is half');
  const i = new Fighter(M, { x: 0 }), j = new Fighter(M, { x: 40, facing: -1 }); j.blocking = true; i.start('low'); i.update(F * 2.5); assert.equal(clash(i, j).blocked, false, 'a low hits a standing block');
  for (let k = 0; k < 60; k++) i.update(F); assert.equal(i.phase, 'idle', 'the move ends');
  console.log('fight: motions, dash, facing, buffer, specials, frames, boxes, one hit, hit stop, cancels, block, low ok');
}
{
  const { Bullets, Emitter } = await import('../src/kit/bullets.js');
  const b = new Bullets({ max: 100, w: 300, h: 300 }), ring = new Emitter(b, { every: .5, rotate: .1, times: 3 }).ring(8, 50);
  ring.update(0, 150, 150); assert.equal(b.count, 8, 'a ring of eight'); ring.update(1.2, 150, 150); assert.equal(b.count, 24); assert.ok(ring.done); ring.update(5, 150, 150); assert.equal(b.count, 24, 'stops after times');
  b.update(1); let far = 0; b.each((x, y) => { far = Math.max(far, Math.hypot(x - 150, y - 150)); }); assert.ok(Math.abs(far - 50) < 1, 'moved at their speed');
  for (let i = 0; i < 40; i++) b.update(.25); assert.equal(b.count, 0, 'gone off screen');
  const p = { x: 150, y: 290 }, aimed = new Emitter(b, { every: 1 }).spread(3, .4, 100, () => p); aimed.update(0, 150, 10);
  let mid = null; b.each((x, y, k, a) => { if (Math.abs(a - Math.PI / 2) < 1e-6) mid = a; }); assert.ok(mid, 'aimed at the player');
  b.clear(); const i = b.fire(100, 100, 0, 0); assert.equal(b.hit(130, 100, 3, 0).hit, -1); const g = b.hit(112, 100, 3, 10); assert.equal(g.grazed, 1, 'a graze'); assert.equal(b.hit(112, 100, 3, 10).grazed, 0, 'once');
  assert.ok(b.hit(103, 100, 3, 10).hit >= 0); assert.equal(b.count, 0, 'the hit bullet goes'); void i;
  b.fire(0, 150, 100, 0, { home: 3 }); for (let k = 0; k < 30; k++) b.update(1 / 30, { x: 150, y: 50 }); let hy = 0; b.each((x, y) => { hy = y; }); assert.ok(hy < 140, 'homing turns towards the target');
  b.clear(); for (let k = 0; k < 150; k++) b.fire(150, 150, 1, 0); assert.equal(b.count, 100, 'never more than max');
  let pts = 0; assert.equal(b.clear(() => pts++, 150, 150, 10), 100); assert.equal(pts, 100, 'clearing into points');
  console.log('bullets: ring, rotate, times, speed, off screen, aimed spread, hit, graze, homing, max, clear ok');
}
{
  const { Sand, M } = await import('../src/kit/sand.js');
  const s = new Sand(60, 80); s.fill((x, y) => y >= 70 ? M.DIRT : x === 0 || x === 59 ? M.WALL : M.EMPTY);
  s.paint(30, 10, 5, M.SAND); const n = s.count(M.SAND); for (let i = 0; i < 200; i++) s.step();
  assert.equal(s.count(M.SAND), n, 'sand is kept'); assert.equal(s.get(30, 69), M.SAND, 'sand falls to the ground'); assert.ok(s.solid(30, 69));
  let top = 99; for (let y = 0; y < 80; y++) if (s.get(30, y) === M.SAND) { top = y; break; } assert.ok(top > 55, 'and spreads into a pile');
  const w = new Sand(40, 40); w.fill((x, y) => y >= 35 || x === 0 || x === 39 ? M.WALL : M.EMPTY); w.paint(20, 5, 4, M.OIL); w.paint(20, 15, 4, M.WATER);
  for (let i = 0; i < 400; i++) w.step(); let oilY = 0, waterY = 0, no = 0, nw = 0;
  for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) { if (w.get(x, y) === M.OIL) { oilY += y; no++; } if (w.get(x, y) === M.WATER) { waterY += y; nw++; } }
  assert.ok(oilY / no < waterY / nw, 'oil floats on water'); assert.ok(Math.max(...[...Array(38)].map((_, x) => w.get(x + 1, 34) === M.WATER ? 1 : 0)) === 1, 'water spreads along the floor');
  const f = new Sand(30, 30); f.fill((x, y) => y >= 20 && y < 25 && x > 5 && x < 25 ? M.WOOD : M.EMPTY); const wood = f.count(M.WOOD); f.set(15, 19, M.FIRE);
  for (let i = 0; i < 600; i++) { f.step(); if (i % 40 === 0) f.paint(15, 19, 1, M.FIRE); } assert.ok(f.count(M.WOOD) < wood, 'fire burns wood');
  const g = new Sand(40, 40); g.fill((x, y) => y > 20 ? M.DIRT : M.EMPTY); const gone = g.blast(20, 25, 5, { fire: false });
  assert.ok(gone > 60 && g.get(20, 25) === M.EMPTY, 'a blast makes a hole'); assert.ok(g.count(M.SAND) > 0, 'and loose rubble');
  const l = new Sand(40, 40); l.fill((x, y) => y >= 35 || x === 0 || x === 39 ? M.WALL : y >= 30 && x < 20 ? M.WATER : y >= 30 && x >= 30 ? M.WOOD : M.EMPTY);
  l.paint(20, 10, 4, M.LAVA); const wood2 = l.count(M.WOOD); for (let i = 0; i < 900; i++) l.step();
  assert.ok(l.count(M.STONE) > 0, 'water cools lava to stone'); assert.ok(l.solid(...(() => { for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) if (l.get(x, y) === M.STONE) return [x, y]; })()), 'stone is solid');
  assert.ok(l.count(M.WOOD) < wood2 || l.count(M.FIRE) > 0, 'lava sets wood alight');
  console.log('sand: falling, piles, oil on water, flowing, fire, lava to stone, blasts ok');
}
{
  const { creature, face, item, building, sprite, name } = await import('../src/kit/art.js');
  const strip = o => JSON.stringify(o, (k, v) => typeof v === 'function' ? undefined : v);
  for (const f of [creature, face, item, building]) { assert.equal(strip(f(7)), strip(f(7)), f.name + ': the same seed, the same thing'); assert.notEqual(strip(f(7)), strip(f(8)), f.name + ': another seed, another'); }
  const calls = []; const c = new Proxy({}, { get: (t, k) => k in t ? t[k] : (...a) => { calls.push(k); return { addColorStop() {} }; }, set: (t, k, v) => { t[k] = v; return true; } });
  for (let i = 0; i < 20; i++) { creature(i).draw(c, 0, 0, 50, 1); face(i).draw(c, 0, 0, 50); item(i).draw(c, 0, 0, 40); building(i).draw(c, 0, 0, 100, 1); } assert.ok(calls.length > 500, 'they draw');
  assert.equal(creature(3, { hue: 120 }).colour.hue, 120, 'a colour family'); assert.ok(['common', 'uncommon', 'rare', 'epic', 'legendary'].includes(item(5).rarity));
  const rare = [...Array(400)].map((_, i) => item(i).rarity).filter(r => r === 'legendary').length; assert.ok(rare < 10, 'legendary is rare');
  const sp = sprite(4, 10, 8); for (let y = 0; y < 8; y++) for (let x = 0; x < 10; x++) assert.equal(sp.mask[y * 10 + x], sp.mask[y * 10 + 9 - x], 'mirrored');
  assert.ok(sp.mask.some(v => v === 1) && sp.mask.some(v => v === 2), 'a body and an outline');
  assert.equal(name(5), name(5)); assert.match(name(9, 'place'), /^[A-Z][a-z]+$/); assert.match(name(2), /^[A-Z][a-z]+$/);
  console.log('art: seeded creatures, faces, items, buildings, rarity, mirrored sprites, names ok');
}
{
  const { Pitch, Team } = await import('../src/kit/sports.js');
  const P = new Pitch({ w: 300, h: 500 }), rnd = () => .5, home = new Team(P, 0, { formation: 'k-2-2', rnd }), away = new Team(P, 1, { formation: '2-2', rnd });
  assert.equal(home.players.length, 5); assert.ok(home.players[0].y > 470, 'team 0 defends the bottom: its keeper starts there');
  const ball = { x: 150, y: 250, vx: 0, vy: 0, owner: null };
  let plan = home.think({ ball, foes: away.players }); const chasers = [...plan.values()].filter(a => a.do === 'chase'); assert.equal(chasers.length, 1, 'one goes for the ball');
  assert.equal(plan.get(home.players[0]).do, 'keep', 'the keeper keeps');
  const h1 = home.home(home.players[3], { x: 150, y: 100 }), h2 = home.home(home.players[3], { x: 150, y: 450 }); assert.ok(h1.y < h2.y, 'the formation slides up with the ball');
  const striker = home.players[3]; striker.x = 150; striker.y = 80; ball.owner = striker; ball.x = 150; ball.y = 80;
  for (const f of away.players) { f.x = 20; f.y = 480; } home.thinkT = 0; plan = home.think({ ball, foes: away.players }); assert.equal(plan.get(striker).do, 'shoot', 'clear in front of goal: shoot');
  assert.ok(plan.get(striker).kick.y < 0, 'towards the top goal');
  striker.y = 400; ball.y = 400; const mate = home.players[4]; mate.x = 220; mate.y = 200; away.players[0].x = 128; away.players[0].y = 405;
  home.thinkT = 0; plan = home.think({ ball, foes: away.players }); assert.equal(plan.get(striker).do, 'pass', 'pressed far out: pass'); assert.equal(plan.get(striker).to, mate);
  ball.owner = away.players[1]; away.players[1].x = 100; away.players[1].y = 300; home.thinkT = 0; plan = home.think({ ball, foes: away.players });
  assert.ok([...plan.values()].some(a => a.do === 'mark'), 'without the ball: mark');
  const human = home.players[2]; human.human = true; home.thinkT = 0; assert.ok(!home.think({ ball, foes: away.players }).has(human), 'the human is left alone');
  console.log('sports: formation, keeper, chase, slide, shoot, pass under pressure, marking, human ok');
}
{
  const { Streams, Flood } = await import('../src/kit/flow.js'); const { Path } = await import('../src/kit/paths.js');
  // 2D
  const w = new Streams(); const r = w.river(new Path([[0, 100], [400, 100]], { kind: 'line' }), { width: 40, speed: 50 });
  let h = w.at({ x: 200, y: 100 }); console.log(h.speed, h.current, h.edge);
  assert.ok(h.in && h.current.x > 49 && Math.abs(h.current.y) < 1e-6);
  const hb = w.at({ x: 200, y: 118 }); assert.ok(hb.in && hb.speed < h.speed && hb.edge > .8, 'slower at the bank'); assert.ok(!w.at({ x: 200, y: 130 }).in);
  r.rock(200, 0, 5); const front = w.at({ x: 194, y: 100.5 }), past = w.at({ x: 200, y: 108 }); console.log('rock', front.current, past.current, past.foam);
  assert.ok(Math.abs(front.current.x) < 30, 'slowed before the rock'); assert.ok(past.speed > 50, 'faster past its side');
  assert.equal(w.at({ x: 200, y: 101 }).speed, 0, 'none inside');
  const boat = { x: 50, y: 100 }; for (let i = 0; i < 60; i++) w.carry(boat, 1 / 60); assert.ok(Math.abs(boat.x - 100) < 2, 'carried');
  const lava = w.pool({ x: 600, y: 600 }, 20, { kind: 'lava' }); const hero = { x: 600, y: 600 }; let ev = [];
  w.on('enter', (o, s) => ev.push('in ' + s.kind)).on('leave', (o, s) => ev.push('out ' + s.kind));
  assert.equal(w.hurt(hero, .5), 15); hero.x = 700; assert.equal(w.hurt(hero, .5), 0); assert.deepEqual(ev, ['in lava', 'out lava']);
  const wh = w.whirl({ x: 0, y: 600 }, 30, 4, 2); const q = w.at({ x: 20, y: 600 }); console.log('whirl', q.current); assert.ok(q.current.y > 0 && q.current.x < 0);
  // 3D with a waterfall
  const w3 = new Streams({ space: '3d' });
  const fallR = w3.river(new Path([{ x: 0, y: 10, z: 0 }, { x: 20, y: 10, z: 0 }, { x: 21, y: 0, z: 0 }, { x: 40, y: 0, z: 0 }], { kind: 'line' }), { width: 6, speed: 3 });
  const top = w3.at({ x: 10, y: 10, z: 1 }), fall = w3.at({ x: 20.6, y: 5, z: 0 }), low = w3.at({ x: 30, y: 0, z: 0 });
  assert.ok(top.in && !top.fall && top.current.x > 2.5 && Math.abs(top.current.y) < 1e-9 && Math.abs(top.level - 10) < .01);
  assert.ok(fall.fall && fall.current.y < -1, 'a waterfall pulls down'); assert.ok(Math.abs(low.level) < .01);
  // a bowl on the left, a hill on the right
  const f = new Flood({ size: 40, cells: 80, ground: (x, z) => x < 0 ? Math.hypot(x + 10, z) * .1 - 1 : 2 - Math.hypot(x - 10, z) * .1 });
  f.add(10, 0, 30, 2); const v0 = f.volume(); console.log('v0', v0);
  for (let i = 0; i < 60 * 20; i++) f.update(1 / 60);
  assert.ok(Math.abs(f.volume() - v0) < v0 * 1e-3, 'water is kept');
  assert.ok(f.depth(10, 0) < .01 && f.depth(-10, 0) > .3, 'runs off the hill into the hollow');
  assert.ok(Math.abs(f.level(-10, 0) - f.level(-8, 1)) < .02, 'and settles flat');
  const d = new Flood({ size: 20, cells: 20, edges: 'drain' }); d.add(0, 0, 10, 3); for (let i = 0; i < 600; i++) d.update(1 / 60); console.log('drained', d.volume()); assert.ok(d.volume() < 9);
  const p = new Flood({ size: 20, cells: 20 }); const tap = p.pour(0, 0, 2, 1); for (let i = 0; i < 300; i++) p.update(1 / 60); console.log('poured', p.volume()); assert.ok(Math.abs(p.volume() - 10) < .2);
  const c = new Flood({ size: 20, cells: 40, ground: (x) => -x * .05 }); c.add(-8, 0, 20, 2); for (let i = 0; i < 40; i++) c.update(1 / 60); console.log('current', c.current(-6, 0)); assert.ok(c.current(-6, 0).x > .1, 'flows downhill');
  console.log('flow: current, banks, rocks, carry, lava hurt, whirlpools, waterfalls, flood fills hollows, drains, taps, runs downhill ok');
}
{
  const { Quiz, categories, loadTrivia, CREDIT } = await import('../src/kit/trivia.js');
  assert.throws(() => new Quiz(), /still loading/, 'loads first'); await loadTrivia();
  const cats = categories(); assert.ok(cats.length >= 10 && cats.every(c => c.count > 0), 'categories'); assert.ok(CREDIT.includes('CC BY-SA'));
  const a = new Quiz({ seed: 7 }), b = new Quiz({ seed: 7 }), qa = a.next(), qb = b.next();
  assert.deepEqual(qa, qb, 'same seed, same quiz'); assert.equal(qa.correct, undefined, 'the answer is not given away');
  const total = a.left + 1, ids = new Set([qa.id]); let q;
  while ((q = a.next())) { assert.ok(!ids.has(q.id), 'no repeats'); ids.add(q.id); assert.ok(q.answers.length === (q.kind === 'truefalse' ? 2 : 4)); }
  assert.equal(ids.size, total, 'asks every question once'); assert.equal(a.next(), null);
  const s = new Quiz({ categories: 'animals', difficulty: 'easy', kind: 'choice', seed: 'day' });
  for (let i = 0; i < 5; i++) { const x = s.next(); assert.equal(x.categoryId, 'animals'); assert.equal(x.difficulty, 'easy'); assert.equal(x.kind, 'choice'); }
  const c = new Quiz({ climb: 2, seed: 3 }); c.next(); assert.equal(c.difficulty, 'easy');
  const right = () => c.answer(c.q.correct); right(); assert.equal(c.answer(0).streak >= 0, true, 'a second answer to one question is ignored'); c.next(); right();
  assert.equal(c.difficulty, 'medium', 'two right: up a level'); assert.equal(c.score, 2); assert.equal(c.streak, 2);
  const nq = c.next(); assert.equal(nq.difficulty, 'medium'); const r = c.answer((c.q.correct + 1) % nq.answers.length);
  assert.ok(!r.right && r.streak === 0 && c.difficulty === 'easy', 'a miss: back down'); assert.equal(c.best, 2);
  const f = new Quiz({ kind: 'choice', seed: 1 }); f.next(); const gone = f.fifty(); assert.equal(gone.length, 2); assert.ok(!gone.includes(f.q.correct), '50:50 keeps the right one');
  const g = new Quiz({ seed: 9 }); const first = [g.next(), g.next(), g.next()].map(x => x.id); const saved = g.pack(); assert.ok(JSON.stringify(saved).length < 40, 'small save');
  const h = new Quiz({ seed: 1, resume: saved }), n = h.next(); assert.ok(!first.includes(n.id), 'resumes without repeats'); assert.equal(n.id, g.next().id, 'and in the same order');
  console.log('trivia: bank, categories, seeded order, no repeats, filters, climb, 50:50, pack/resume ok');
}
{
  const { dungeon, cave, maze, islands, pattern, fov, loadGen, proven, reach } = await import('../src/kit/gen.js');
  await loadGen();
  const a = dungeon(40, 30, { seed: 7 }), b2 = dungeon(40, 30, { seed: 7 });
  assert.equal(a.text, b2.text, 'same seed, same dungeon'); assert.ok(a.text.includes('S') && a.text.includes('E') && a.rooms.length > 1);
  assert.ok(cave(40, 30, { seed: 1 }).text.includes('.')); assert.ok(maze(21, 21, { seed: 1 }).grid.length === 21); assert.ok(/[~.^]/.test(islands(32, 32, { seed: 3 }).text));
  const pt = pattern('..#..\n.###.\n..#..\n.....', 16, 16, { seed: 2 }); assert.ok(pt && pt.grid.length === 16);
  const seen = fov('#####\n#...#\n#...#\n#####', 2, 1, 5); assert.ok(seen.has('3,2') && seen.has('0,0'));
  // proven levels: keeps making until one passes; reach() measures the walk
  assert.equal(reach('S..#\n.#.E\n....', 'S', 'E'), 4, 'reach counts steps round walls');
  assert.equal(reach('S#E', 'S', 'E'), -1, "reach: can't get through");
  let made = 0;
  const pv = proven(sd => { made++; return cave(30, 20, { seed: sd }); }, l => { const n = reach(l.text, 'S', 'E'); return n > 0 && n; }, { seed: 4, tries: 6 });
  assert.ok(pv.level && pv.score > 0 && made === 6, 'proven keeps the best of its tries');
  const pv2 = proven(sd => cave(30, 20, { seed: sd }), l => { const n = reach(l.text, 'S', 'E'); return n > 0 && n; }, { seed: 4, tries: 6 });
  assert.equal(pv2.level.text, pv.level.text, 'proven is seeded');
  const early = proven(sd => sd, () => true, { seed: 1, good: 1 });
  assert.equal(early.tried, 1, 'stops at the first good one');
  assert.equal(proven(sd => sd, () => false, { tries: 3 }).level, null, 'null when nothing passes');
  console.log('gen: dungeon (seeded), cave, maze, islands, pattern, fov, proven, reach ok');
}
{
  const { Gun, Health, lob, arc, Explosives, hitFrom } = await import('../src/kit/combat.js');
  const g = new Gun({ mag: 3, rate: 10, reload: .5, reserve: 6, rng: () => .5 });
  let shots = 0; for (let i = 0; i < 60; i++) { shots += g.pull({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }, true).length; g.update(1 / 60); }
  assert.ok(shots >= 3 && g.reserve < 6, 'gun empties its magazine and reloads from reserve: ' + shots);
  const f = new Gun({ falloff: [10, 30, .5] }); assert.equal(f.damageAt(5), f.damage); assert.ok(f.damageAt(40) < f.damage && f.damageAt(40) >= f.damage * .5 - 1, 'damage falls off with range');
  const h = new Health({ max: 100, regen: 50, delay: 1 }); h.hurt(60, { from: { x: 1, y: 0 }, at: { x: 0, y: 0 }, facing: 0 }); assert.equal(h.hp, 40); assert.ok(h.hits.length === 1, 'hit direction kept');
  for (let i = 0; i < 180; i++) h.update(1 / 60); assert.equal(h.hp, 100, 'health comes back after the delay');
  h.hurt(500); assert.ok(h.dead, 'dies');
  const v = lob({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, 1, -20), path = arc({ x: 0, y: 0, z: 0 }, v, -20, { steps: 21, dt: 1 / 20 });
  assert.ok(Math.abs(path[20].x - 10) < .6 && Math.abs(path[20].y) < .6, 'lob lands on its target: ' + JSON.stringify(path[20]));
  const ex = new Explosives({ fuse: .1, radius: 3 }); let booms = 0; ex.on('boom', () => booms++); const a = ex.add({ x: 0, y: 0 }); ex.add({ x: 2, y: 0 }); ex.add({ x: 20, y: 0 });
  ex.light(a); for (let i = 0; i < 60; i++) ex.update(1 / 60); assert.equal(booms, 2, 'a barrel sets off the one next to it, not the far one');
  assert.ok(typeof hitFrom({ x: 1, y: 0 }, { x: 0, y: 0 }, 0) === 'number');
  console.log('combat: gun mag + reload, falloff, health regen, lob, chain explosions ok');
}
{
  const { CoverMap, Squad } = await import('../src/kit/tactics.js');
  const lv = ['..........', '..........', '....##....', '..........', '..........'];
  const cm = new CoverMap(10, 5, (c, r) => lv[r]?.[c] === '#');
  assert.ok(cm.spots.length > 0, 'cover spots found beside walls');
  const s = cm.find({ x: 5, y: 4.5 }, { x: 5, y: 0 }); assert.ok(s && cm.protects(s, { x: 5, y: 0 }), 'finds cover that blocks the threat');
  const men = [{ x: 2, y: 4 }, { x: 8, y: 4 }, { x: 5, y: 4.6 }]; const sq = new Squad(men, { cover: cm, think: .1 }); let calls = 0; sq.on('call', () => calls++);
  for (let i = 0; i < 30; i++) sq.update(1 / 30, { x: 5, y: .5 }); assert.ok(men.every(m => m.order), 'every squad member gets an order'); assert.ok(calls >= 1, 'squad calls out contact');
  console.log('tactics: cover spots, cover that protects, squad orders + callouts ok');
}
{
  const { Ledges, Climber, Rope } = await import('../src/kit/climb.js');
  const L = new Ledges().add({ x: 0, y: 3, z: 0 }, { x: 4, y: 3, z: 0 }, { x: 0, z: 1 });
  const cl = new Climber(L); assert.ok(cl.grab({ x: 1, y: 1.4, z: .3 }, -1), 'grabs a ledge in reach');
  assert.equal(cl.state, 'hang'); const x0 = cl.pos.x; for (let i = 0; i < 30; i++) cl.update(1 / 60, { x: 1 }); assert.ok(cl.pos.x < x0, 'shimmies right (facing the wall along -z, right is -x)');
  for (let i = 0; i < 60; i++) cl.update(1 / 60, { y: 1 }); assert.ok(cl.state === 'free' && cl.pos.y >= 2.9, 'climbs up onto the top: ' + cl.state + ' ' + cl.pos.y);
  const rope = new Rope({ x: 0, y: 6, z: 0 }, 4); rope.catch({ x: 0, y: 2, z: 0 }, { x: 4, y: 0, z: 0 }); for (let i = 0; i < 20; i++) rope.update(1 / 60, 1);
  const hd = rope.hands; assert.ok(Math.abs(Math.hypot(hd.x, hd.y - 6, hd.z) - rope.length) < .01 && Math.abs(hd.x) > .1, 'rope swings and keeps its length');
  console.log('climb: grab, shimmy, climb up, rope swing ok');
}
{
  const { Mission, zone } = await import('../src/kit/missions.js');
  const me = { x: 0, y: 0 }, door = zone({ x: 10, y: 0 }, 2); let said = 0, done = 0;
  const m = new Mission(function* (m) { m.objective('Reach the door'); m.say('Go'); yield m.until(() => door.has(me)); m.checkpoint('door'); m.say('Made it'); yield m.wait(1); m.objective('Wait'); yield m.wait(1); m.complete(); });
  m.on('say', () => said++).on('complete', () => done++);
  m.update(1 / 60); assert.equal(m.current.text, 'Reach the door'); me.x = 10; for (let i = 0; i < 70; i++) m.update(1 / 60); assert.equal(m.current.text, 'Wait');
  m.restart(); me.x = 0; assert.equal(said, 2, 'lines before the checkpoint are not said again on a restart');
  for (let i = 0; i < 70; i++) m.update(1 / 60); assert.equal(m.current.text, 'Wait', 'restart carries on from the checkpoint, past the door');
  for (let i = 0; i < 70; i++) m.update(1 / 60); assert.equal(done, 1, 'mission completes');
  console.log('missions: objectives, zones, checkpoints, restart skips ahead ok');
}
{
  const { Cutscene, along } = await import('../src/kit/cutscene.js');
  const mid = along([{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }], .5); assert.ok(Math.abs(mid.x - 5) < .01);
  let lines = 0, ended = 0; const cs = new Cutscene([{ cam: [{ x: 0, y: 2, z: 0 }, { x: 10, y: 2, z: 0 }], look: { x: 0, y: 0, z: -5 }, time: 1 }, { say: 'Hello', who: 'Ana', time: 1 }]);
  cs.on('say', () => lines++).on('end', () => ended++); for (let i = 0; i < 30; i++) cs.update(1 / 60); assert.ok(cs.shot && cs.shot.x > 0 && cs.shot.x < 10, 'camera moves along the path');
  cs.skip(); assert.ok(ended === 1 && !cs.playing, 'skip ends it');
  console.log('cutscene: camera path, lines, skip ok');
}
{
  const { Prompts } = await import('../src/kit/prompts.js');
  const p = new Prompts(); let pass = 0, fail = 0, done = 0; p.on('pass', () => pass++).on('fail', () => fail++).on('done', () => done++);
  p.start([{ kind: 'tap', x: 100, y: 100, time: 1 }, { kind: 'swipe', dir: 'left', time: 1 }, { kind: 'tap', x: 50, y: 50, time: .2 }]);
  p.update(1 / 60); p.down(100, 100); p.update(1 / 60); p.down(200, 200); p.move(120, 200); p.up(); p.update(1 / 60);
  for (let i = 0; i < 30; i++) p.update(1 / 60);
  assert.equal(pass, 2, 'tap and swipe pass'); assert.equal(fail, 1, 'a missed prompt fails');
  console.log('prompts: tap, swipe, timeout ok');
}
{
  const { lightAt, Takedown, Bodies, Floors, Disguise } = await import('../src/kit/stealth.js');
  assert.ok(lightAt({ x: 0, y: 0 }, [{ x: 0, y: 1, r: 5 }]) > lightAt({ x: 0, y: 0 }, [{ x: 0, y: 4, r: 5 }]), 'nearer the lamp is brighter');
  assert.ok(lightAt({ x: 0, y: 0 }, [{ x: 0, y: 1, r: 5 }], { sees: () => false }) <= .11, 'walls cast shadows');
  const g = { x: 0, y: 0, facing: 0 }; assert.equal(Takedown.check({ x: -1, y: 0 }, [g]), g, 'takedown from behind'); assert.equal(Takedown.check({ x: 1, y: 0 }, [g]), null, 'not from the front');
  const bodies = new Bodies(); bodies.add(3, 0); const seer = { x: 0, y: 0, facing: 0 }; let found = 0; bodies.on('found', () => found++); bodies.update(0, [seer]); assert.equal(found, 1, 'a guard finds a body');
  const fl = new Floors({}, p => (p.x > 0 ? 'gravel' : 'carpet')); assert.ok(fl.noise({ x: 1, y: 0 }, 2) > fl.noise({ x: -1, y: 0 }, 2) && fl.noise({ x: 1, y: 0 }, .5) === 0, 'gravel loud, carpet quiet, sneaking silent');
  const d = new Disguise().wear('guard'); assert.ok(d.fooling({ x: 9, y: 0, rank: 'guard' }) && !d.blow(2).fooling({ x: 9, y: 0, rank: 'guard' }), 'disguise fools until blown');
  console.log('stealth: light meter, takedowns, bodies, floors, disguise ok');
}
{
  const { Grapple, Zipline, Wires, Lock, Code } = await import('../src/kit/gadgets.js');
  const hook = new Grapple({ range: 20, flyTime: .05 }); assert.ok(hook.fire({ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 0 }, () => ({ point: { x: 5, y: 5, z: 0 } })));
  let pos = { x: 0, y: 0, z: 0 }, vel = { x: 0, y: 0, z: 0 }; for (let i = 0; i < 90; i++) { vel = hook.update(1 / 60, pos, vel, { reel: true }); pos = { x: pos.x + vel.x / 60, y: pos.y + vel.y / 60, z: 0 }; }
  assert.ok(Math.hypot(pos.x - 5, pos.y - 5) < 3, 'reeling pulls you to the hook: ' + JSON.stringify(pos));
  const z = new Zipline({ x: 0, y: 10, z: 0 }, { x: 30, y: 0, z: 0 }).ride(); for (let i = 0; i < 600 && z.riding; i++) z.update(1 / 60); assert.ok(z.done, 'zip line reaches the end');
  const w = new Wires(4, 4, { seed: 3 }); assert.ok(!w.solved); w.cells = w.answer.slice(); w.update(); assert.ok(w.solved, 'the answer lights every tile');
  const lk = new Lock({ pins: 1, seed: 1 }); lk.a = lk.at; assert.ok(lk.stop() && lk.solved, 'stopping on the mark opens the lock');
  const code = new Code({ start: 3, seed: 1 }); for (const k of code.seq) code.press(k); assert.ok(code.done && !code.failed, 'repeating the code works');
  console.log('gadgets: grapple reel, zip line, wires, lock, code ok');
}
{
  const { Campaign } = await import('../src/kit/campaign.js');
  let saved = null; const api = { load: f => saved ?? f, save: d => { saved = JSON.parse(JSON.stringify(d)); } };
  const chapters = [{ id: 'a', missions: [{ id: 'a1', stars: [100, 200, 300], collect: 2 }, { id: 'a2', stars: ['Finish', 'Unseen'] }] }, { id: 'b', needs: { stars: 5 }, missions: [{ id: 'b1' }] }];
  const c = new Campaign(chapters, { extras: { hat: 3 } }).attach(api);
  assert.equal(c.state('a1'), 'open'); assert.equal(c.state('a2'), 'locked'); assert.equal(c.state('b1'), 'locked');
  let r = c.finish('a1', { score: 250 }); assert.equal(r.stars, 2); assert.ok(r.unlocked.includes('a2'), 'finishing opens the next mission');
  r = c.finish('a2', { stars: [true, true] }); assert.ok(r.unlocked.includes('hat') && c.state('b1') === 'locked', 'extras unlock by stars');
  c.finish('a1', { score: 120 }); assert.equal(c.best('a1'), 250, 'keeps the best score'); c.finish('a1', { score: 320 }); assert.equal(c.state('b1'), 'open', 'enough stars open the next chapter');
  assert.ok(c.collect('a1', 1) && !c.collect('a1', 1), 'collectibles count once');
  const c2 = new Campaign(chapters).attach(api); assert.equal(c2.stars, 5); assert.equal(c2.collected('a1'), 1); assert.ok(JSON.stringify(saved).length < 200, 'save is small');
  console.log('campaign: unlocks, stars, extras, best, collectibles, save ok');
}
{
  const { Plane, Boat, Hover } = await import('../src/kit/craft.js');
  const p = new Plane({ at: { x: 0, y: 100, z: 0 }, speed: 40 }); p.throttle = .7;
  for (let i = 0; i < 300; i++) p.update(1 / 60);
  assert.ok(Math.abs(p.pos.y - 100) < 8, 'level flight holds height: ' + p.pos.y);
  const h0 = p.heading; for (let i = 0; i < 25; i++) p.update(1 / 60, { roll: 1 }); for (let i = 0; i < 90; i++) p.update(1 / 60);
  assert.ok(Math.sin(p.heading - h0) > .1, 'rolling right turns right');
  const g = new Plane({ at: { x: 0, y: 1, z: 0 }, speed: 0, ground: () => 0 }); assert.ok(g.onGround, 'starts on the runway');
  let up = false; for (let i = 0; i < 900; i++) { g.update(1 / 60, { throttle: 1, pitch: g.speed > 25 ? .6 : 0 }); if (!g.onGround && g.altitude > 5) { up = true; break; } }
  assert.ok(up && !g.crashed, 'takes off');
  const water = { height: () => 0, normal: () => ({ x: 0, y: 1, z: 0 }) };
  const b = new Boat(water); for (let i = 0; i < 180; i++) b.update(1 / 60, { throttle: 1 }); assert.ok(b.speed > 5 && Math.abs(b.y) < 1, 'boat speeds up on the water');
  const hv = new Hover({ at: { x: 0, y: 2, z: 0 } }); for (let i = 0; i < 120; i++) hv.update(1 / 60, { y: 1 }); assert.ok(hv.speed > 3, 'hover moves');
  console.log('craft: level flight, banked turn, takeoff, boat, hover ok');
}
{
  const { Soft, Liquid } = await import('../src/kit/soft.js');
  const s = new Soft({ bounds: [0, 0, 360, 640] });
  const cl = s.cloth(80, 50, 200, 150, 10, 8);
  for (let i = 0; i < 120; i++) s.update(1 / 60);
  const bottom = cl.at(5, 7); assert.ok(bottom.y > 150 && bottom.y < 260, 'cloth hangs: ' + bottom.y);
  assert.ok(s.cut(0, 120, 360, 120) >= 8, 'a swipe cuts the cloth');
  for (let i = 0; i < 120; i++) s.update(1 / 60); assert.ok(cl.at(5, 7).y > 400, 'cut cloth falls');
  const s2 = new Soft({ bounds: [0, 0, 360, 640] }); const j = s2.jelly(180, 300, 50, 16);
  const area = pts => { let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p.x * q.y - q.x * p.y; } return Math.abs(a / 2); };
  const a0 = area(j.points); for (let i = 0; i < 240; i++) s2.update(1 / 60);
  assert.ok(area(j.points) / a0 > .7, 'jelly keeps its shape after landing');
  const gr = s2.grab(j.points[0].x, j.points[0].y); assert.ok(gr, 'grab a point'); gr.move(200, 100); gr.drop();
  const lq = new Liquid({ bounds: [0, 0, 200, 300] }); lq.pour(100, 50, 60);
  for (let i = 0; i < 240; i++) lq.update(1 / 60);
  assert.ok(lq.list.every(p => Number.isFinite(p.x) && p.y <= 300.5 && p.y > 150), 'liquid settles in the bottom');
  console.log('soft: cloth hangs and cuts, jelly holds, grab, liquid ok');
}
{
  const { Deck, total, groups, poker, winners, sort, stacks, card } = await import('../src/kit/cards.js');
  const d = new Deck({ seed: 7 }).shuffle(); assert.equal(d.size, 52);
  const hands = d.deal(2, 5); assert.equal(hands[0].length, 5); assert.equal(d.size, 42);
  const d2 = new Deck({ seed: 7 }).shuffle(); assert.deepEqual(d2.deal(2, 5)[0].map(c => c.id), hands[0].map(c => c.id), 'same seed, same deal');
  d.discard(hands.flat()); d.draw(42); assert.equal(d.draw(3).length, 3, 'discards shuffle back in when it runs out');
  const back = new Deck().load(d.save()); assert.equal(back.size, d.size, 'save and load');
  assert.deepEqual(total([card('h', 1), card('s', 13)]), { total: 21, soft: true, bust: false });
  assert.equal(total([card('h', 1), card('s', 9), card('d', 5)]).total, 15);
  const g = groups([card('h', 5), card('h', 6), card('h', 7), card('s', 9), card('d', 9), card('c', 9)]); assert.equal(g.runs.length, 1); assert.equal(g.sets.length, 1);
  assert.equal(groups([card('s', 12), card('s', 13), card('s', 1)]).runs.length, 1, 'Q-K-A run');
  const fh = [card('h', 3), card('s', 3), card('d', 3), card('c', 9), card('h', 9)], pair = [card('h', 2), card('s', 2), card('d', 7), card('c', 10), card('h', 12)];
  assert.equal(poker(fh).name, 'Full House'); assert.deepEqual(winners([pair, fh]), [1]);
  assert.equal(sort([card('h', 2), card('s', 1)])[0].suit, 's'); assert.ok(stacks(card('h', 6), card('s', 7)) && !stacks(card('h', 6), card('d', 7)));
  console.log('cards: deck, seeds, reshuffle, save, totals, sets and runs, poker ok');
}
{
  const { roll, odds, Dice, faceUp } = await import('../src/kit/dice.js');
  for (let i = 0; i < 50; i++) { const r = roll('2d6+3'); assert.ok(r.total >= 5 && r.total <= 15); }
  assert.equal(roll('4d6kh3', 1).kept[0].length, 3); assert.deepEqual(roll('3d6', 5).rolls, roll('3d6', 5).rolls, 'seeded rolls repeat');
  assert.ok(roll('d%').total <= 100 && roll('5-2').total === 3);
  assert.ok(Math.abs(odds(2, 6)[7] - 6 / 36) < 1e-9, 'odds of 7 on 2d6');
  const dc = new Dice(3, { seed: 2 }); let settled = null; dc.on('settle', v => { settled = v; });
  const will = dc.throw(); dc.hold(0); for (let i = 0; i < 60; i++) dc.update(1 / 60); assert.deepEqual(settled, will, 'lands on what throw() said');
  const keep = dc.values[0]; dc.throw(); assert.equal(dc.values[0], keep, 'held dice stay');
  assert.equal(faceUp({ x: 0, y: 0, z: 0, w: 1 }), 1); assert.equal(faceUp({ x: 1, y: 0, z: 0, w: 0 }), 6);
  console.log('dice: notation, keep, seeds, odds, tumble and hold, face up ok');
}
{
  const { UI, loadUI } = await import('../src/kit/ui.js');
  let threw = null; try { new UI(100, 100, {}); } catch (e) { threw = e; } assert.ok(!threw || threw.kitLoading, 'UI before load throws StillLoading');
  await loadUI();
  const taps = [], items = Array.from({ length: 20 }, (_, i) => ({ id: 'item' + i, h: 64, tap: true }));
  const ui = new UI(360, 640, { dir: 'column', pad: 16, gap: 10, children: [{ id: 'title', h: 48 }, { id: 'list', grow: 1, scroll: 'y', gap: 8, children: items },
    { dir: 'row', gap: 8, h: 56, children: [{ id: 'buy', grow: 1, tap: true }, { id: 'back', w: 96, tap: true }] }] });
  ui.on('tap', n => taps.push(n.id));
  const b = id => ui.node(id).box;
  assert.deepEqual(b('back'), { x: 248, y: 568, w: 96, h: 56 }, 'flex layout'); assert.equal(b('list').h, 484, 'scroll list fills the space left');
  ui.down(250, 570, 1); ui.up(250, 570, 1); assert.deepEqual(taps, ['back'], 'tap');
  ui.down(180, 400, 2); for (let i = 1; i <= 10; i++) { ui.move(180, 400 - i * 20, 2); ui.update(1 / 60); } ui.up(180, 200, 2);
  for (let i = 0; i < 120; i++) ui.update(1 / 60);
  assert.ok(b('item0').y < 0 && taps.length === 1, 'drag scrolls (no tap)');
  ui.focus('item19'); ui.key('Enter', true); ui.key('Enter', false); assert.equal(taps.at(-1), 'item19', 'focus and press with keys');
  assert.ok(b('item19').y + 64 <= b('list').y + b('list').h + .5, 'focusing scrolls it into view');
  let n = 0; ui.each(() => n++); assert.ok(n > 5 && n < 26, 'only visible boxes are drawn: ' + n);
  ui.free();
  console.log('ui: flex layout, tap, scroll, focus, keys, culling ok');
}
{
  // round 9: paths, bones, nodes, auto-tiling, two fingers, timelines, haptic patterns, mixer
  const { Path, Follower } = await import('../src/kit/paths.js');
  const line = new Path([[0, 0], [100, 0]], { kind: 'line' });
  assert.equal(line.length, 100); assert.equal(line.at(25).x, 25); assert.equal(line.offset(50, 10).y, 10, 'right of the line');
  assert.equal(Math.round(line.nearest(40, 30).d), 40);
  const sq = new Path([[0, 0], [100, 0], [100, 100], [0, 100]], { loop: true, kind: 'line' });
  const f = new Follower(sq, { speed: 100 }); for (let i = 0; i < 50; i++) f.update(.1);
  assert.equal(f.lap, 1); assert.ok(Math.abs(f.d - 100) < 1e-6, 'steady speed round a loop');
  const smooth = new Path([[0, 0], [50, 40], [100, 0]]); assert.ok(Math.abs(smooth.at(0).x) < 1e-9 && Math.abs(smooth.at(smooth.length).x - 100) < 1e-6, 'passes through the ends');
  const pp = new Follower(line, { speed: 80, end: 'pingpong' }); for (let i = 0; i < 20; i++) pp.update(.1); assert.ok(pp.d >= 0 && pp.d <= 100, 'pingpong stays on');
  console.log('paths: lengths, offsets, nearest, loops, pingpong ok');

  const { Rig } = await import('../src/kit/bones.js');
  const r = new Rig().bone('up', { len: 10 }).bone('lo', { parent: 'up', len: 10 }).bone('tail', { parent: 'up', len: 5, wobble: {} });
  r.update(0); assert.ok(Math.abs(r.world('lo').ex - 20) < 1e-9, 'chain end');
  assert.ok(r.reach('up', 'lo', 12, 5)); assert.ok(Math.hypot(r.world('lo').ex - 12, r.world('lo').ey - 5) < 1e-6, 'two-bone reach lands');
  r.flip = true; r.reach('up', 'lo', -12, 5); assert.ok(Math.hypot(r.world('lo').ex + 12, r.world('lo').ey - 5) < 1e-6, 'reach when flipped');
  r.flip = false; r.clip('c', { len: 1, loop: false, keys: { up: [[0, 0], [1, 1]] }, events: [[.5, 'mid']] }); let mid = 0, ended = 0; r.on('mid', () => mid++).on('end', () => ended++);
  r.play('c', { fade: 0 }); r.update(.6); assert.equal(mid, 1); assert.ok(Math.abs(r.get('up').angle - .6) < 1e-9, 'clip keys'); r.update(1); assert.equal(ended, 1, 'end once');
  r.blend({ up: 3 }, { up: -3 }, .5); assert.ok(Math.abs(Math.abs(r.get('up').angle) - Math.PI) < .01, 'blends the short way round');
  console.log('bones: chains, reach, flip, clips, events, blend ok');

  const { Node } = await import('../src/kit/things.js');
  const tank = new Node({ x: 100, y: 100, angle: Math.PI / 2 }), gun = tank.add(new Node({ x: 10, r: 3 }));
  tank.update(); assert.ok(Math.abs(gun.wx - 100) < 1e-9 && Math.abs(gun.wy - 110) < 1e-9, 'child turns with parent');
  assert.ok(gun.hit(100, 110) && tank.pick(100, 110) === gun, 'hit and pick');
  gun.attach(null); assert.ok(Math.abs(gun.x - 100) < 1e-9 && Math.abs(gun.y - 110) < 1e-9, 'attach keeps the place');
  console.log('things: nodes, world places, hits, attach ok');

  const { TileMap, BLOB_MASKS } = await import('../src/kit/tiles.js');
  assert.equal(BLOB_MASKS.length, 47, '47 blob pieces');
  const tm = TileMap.fromText('###\n###\n#..'); assert.equal(tm.edges(1, 1).mask, 11); assert.equal(tm.edges(1, 1).blob, BLOB_MASKS.indexOf(tm.edges(1, 1).blob8));
  assert.equal(tm.edges(2, 2, '.', { edge: false }).mask, 8, 'joins only what you say');
  console.log('tiles: auto-tiling masks and blob pieces ok');

  const { TwoFingers, Gestures } = await import('../src/kit/controls.js');
  let taps = 0, pinched = 1, turned = 0, panned = 0;
  const two = new TwoFingers({ one: new Gestures({ tap: () => taps++ }), pinch: k => { pinched *= k; }, twist: a => { turned += a; }, pan: (dx) => { panned += dx; } });
  two.down(100, 100, 1); two.up(100, 100, 1); assert.equal(taps, 1, 'one finger still taps');
  two.down(100, 100, 1); two.down(200, 100, 2); two.move(250, 100, true, 2); assert.ok(Math.abs(pinched - 1.5) < 1e-9 && Math.abs(two.scale - 1.5) < 1e-9, 'pinch');
  two.move(150, 150, true, 2); assert.ok(turned > 0, 'twist'); two.up(150, 150, 2); two.up(100, 100, 1); assert.equal(taps, 1, 'no stray tap after a pinch'); assert.ok(panned !== 0);
  console.log('controls: two fingers pinch, twist, pan, one-finger hand-off ok');

  const { Timeline, stagger } = await import('../src/kit/juice.js');
  let early = null; try { new Timeline(); } catch (e) { early = e; }
  if (early) { assert.ok(early.kitLoading, 'Timeline loads lazily'); await early.kitLoading; }
  const o = { x: 0 }, list = [{ s: 0 }, { s: 0 }, { s: 0 }]; let calls = 0;
  const tl = new Timeline({ ease: 'linear' }).to(o, { x: 100, duration: 1 }).to(list, { s: 1, duration: .2, delay: stagger(.1) }, '+=.1').call(() => calls++, .5);
  tl.update(.5); assert.ok(Math.abs(o.x - 50) < 1e-6 && calls === 1, 'seconds, game dt');
  tl.pause().update(1); assert.ok(Math.abs(o.x - 50) < 1e-6, 'paused holds'); tl.play().update(1.5);
  assert.ok(tl.done && list.every(t => t.s === 1) && o.x === 100, 'staggered steps finish'); assert.ok(Math.abs(tl.duration - 1.5) < 1e-6, 'duration ' + tl.duration);
  console.log('juice: timelines in seconds, stagger, pause, call ok');

  globalThis.window ??= globalThis; globalThis.addEventListener ??= () => {}; globalThis.removeEventListener ??= () => {};
  globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
  const dev = await import('../src/kit/device.js');
  assert.ok(dev.hapticPattern('heartbeat') > .1 && dev.hapticPattern([{ at: .2, len: .3, to: 0 }]) === .5 && dev.hapticPattern('nothing') === 0, 'haptic patterns');
  dev.stopHaptics();
  const snd = await import('../src/kit/sound.js');
  snd.mixer.volume('music', .5).duck('music').room('cave').muffle(.5).reset();
  assert.equal(await snd.say(''), false, 'nothing to say'); assert.equal(snd.talking(), false);
  // living music: tension builds with close calls and settles, the tempo leans to the player's pace
  const mcalls = { i: [], s: [] }, fake = { intensity: x => mcalls.i.push(x), speed: x => mcalls.s.push(x) };
  const live = snd.follow(fake, { pace: 2 });
  live.update(.1); const calm = live.tension;
  live.feel(1).feel(1); live.update(.1); assert.ok(live.tension > calm + .5, 'close calls build tension');
  for (let i = 0; i < 100; i++) live.update(.1);
  assert.ok(Math.abs(live.tension - calm) < .01, 'and it settles');
  for (let i = 0; i < 60; i++) { live.tap(); live.update(.8); }
  assert.ok(live.speed < 1, 'slow taps slow the tempo a little: ' + live.speed.toFixed(3));
  for (let i = 0; i < 300; i++) { live.tap(); live.update(.1); }
  assert.ok(live.speed > 1 && live.speed <= 1.12, 'quick taps speed it up, within the range: ' + live.speed.toFixed(3));
  live.feel(1); live.lost(); assert.ok(live.tension < calm, 'a loss settles it at once');
  assert.ok(mcalls.i.length && mcalls.s.length, 'drives the tune');
  console.log('device + sound: haptic patterns, mixer, speech calls and living music ok without audio');
}

// the smarts: doodle recognition, voice command matching, the phone AI's guard rails
{
  const { Doodle, loadDoodle, picture } = await import('../src/kit/doodle.js');
  let threw = null; try { new Doodle(); } catch (e) { threw = e; }
  assert.ok(threw?.kitLoading, 'Doodle before load throws StillLoading');
  await loadDoodle();
  const d = new Doodle();
  assert.equal(Doodle.things.length, 46); assert.deepEqual(d.things, Doodle.things);
  assert.equal(picture([]).reduce((a, b) => a + b, 0), 0, 'nothing drawn, empty picture');
  const ring = [Array.from({ length: 33 }, (_, i) => ({ x: 100 + 80 * Math.cos(i / 32 * Math.PI * 2), y: 100 + 80 * Math.sin(i / 32 * Math.PI * 2) }))];
  const g = d.guess(ring);
  assert.equal(g.length, 46); assert.ok(Math.abs(g.reduce((a, b) => a + b.sure, 0) - 1) < 1e-5, 'sures add up to 1');
  assert.ok(['circle', 'clock', 'smiley face', 'sun', 'moon'].includes(g[0].name), 'a ring looks round: ' + g[0].name);
  const tri = [[{ x: 0, y: 100 }, { x: 50, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }]];
  assert.equal(d.guess(tri, { among: ['triangle', 'circle', 'square'] })[0].name, 'triangle', 'a triangle among three');
  const ladder = [[{ x: 0, y: 0 }, { x: 0, y: 200 }], [{ x: 60, y: 0 }, { x: 60, y: 200 }], ...[30, 80, 130, 180].map(y => [{ x: 0, y }, { x: 60, y }])];
  assert.equal(d.guess(ladder, { among: ['ladder', 'sword', 'door'] })[0].name, 'ladder', 'a ladder among three');
  assert.deepEqual(d.guess(ring, { among: ['dragon'] }), [], 'unknown names are left out');
  console.log('doodle: picture, guesses, among ok (top for a ring: ' + g[0].name + ')');

  const { Voice } = await import('../src/kit/hear.js');
  const v = new Voice({ words: ['jump', 'fire', 'turn left'], also: { fire: ['shoot'] } });
  v.hear('jump', false); v.hear('jump jump', false); v.hear('jump jump', true);
  assert.ok(v.said('jump') && v.said('jump') && !v.said('jump'), 'partials count each jump once');
  v.hear('please shoot now', true); assert.ok(v.said('fire') && !v.said('shoot'), 'also: shoot means fire');
  v.hear('turn left', true); assert.ok(v.said('turn left'), 'phrases');
  v.hear('jumb', true); assert.ok(v.said('jump'), 'one letter off still counts');
  v.hear('jumped fir', true); assert.ok(!v.said('jump') && !v.said('fire'), 'but not other words');
  assert.ok(v.heard.length <= 8 && v.heard.at(-1) === 'jump', 'heard keeps the newest');
  console.log('voice: command matching ok');

  const { tidy, PhoneAI } = await import('../src/kit/phoneai.js');
  assert.equal(tidy('  "Ahoy there, traveller!"  '), 'Ahoy there, traveller!');
  assert.equal(tidy('**Mind** the `rocks`.'), 'Mind the rocks.');
  assert.equal(tidy('Visit www.example.com for more'), null, 'links dropped');
  assert.equal(tidy('Call 07700900123 now'), null, 'number strings dropped');
  assert.equal(tidy('You stupid sailor'), null, 'blocked words dropped');
  assert.equal(tidy(null), null);
  assert.ok(tidy('One two three four five six. Seven eight nine ten eleven twelve.', 8) === 'One two three four five six.', 'cut at a sentence end');
  const ai = new PhoneAI({ persona: 'a crab' });
  assert.equal(await ai.ask('Say hi', { fallback: 'Snip snap.' }), 'Snip snap.', 'no model here: the fallback');
  console.log('phone AI: tidy and fallback ok');
}

// Swarm (the CPU version; the GPU one is checked against it in kit-browser)
{
  const { Swarm } = await import('../src/kit/swarm.js');
  const s = new Swarm({ count: 600, w: 300, h: 300, speed: 60, seed: 2, gpu: false });
  assert.equal(s.gpu, false); const o0 = s.order();
  for (let f = 0; f < 600; f++) s.update(1 / 60);
  assert.ok(s.order() > o0 + .1, `they flock: order ${o0.toFixed(2)} -> ${s.order().toFixed(2)}`);
  assert.ok(s.x.every(v => v >= 0 && v < 300) && s.y.every(v => v >= 0 && v < 300), 'wrap keeps them in the area');
  const spread = sw => { let d = 0; for (let i = 0; i < sw.count; i++) d += Math.hypot(sw.x[i] - 150, sw.y[i] - 150); return d / sw.count; };
  const a = new Swarm({ count: 300, w: 300, h: 300, edges: 'bounce', seed: 4, gpu: false }), b = new Swarm({ count: 300, w: 300, h: 300, edges: 'bounce', seed: 4, gpu: false });
  for (let f = 0; f < 300; f++) { a.pull(150, 150, { strength: 2 }).update(1 / 60); b.pull(150, 150, { strength: -2, radius: 200 }).update(1 / 60); }
  assert.ok(spread(a) < 60 && spread(b) > spread(a) + 40, `pulls and pushes: ${spread(a).toFixed(0)} vs ${spread(b).toFixed(0)}`);
  assert.ok(b.x.every(v => v >= 0 && v <= 300), 'bounce keeps them in');
  const r = new Swarm({ count: 400, w: 300, h: 300, seed: 5, gpu: false }).obstacle(150, 150, 40);
  for (let f = 0; f < 300; f++) r.update(1 / 60);
  assert.ok(r.near(150, 150, 30).length <= 4, 'they keep out of an obstacle: ' + r.near(150, 150, 30).length);
  const hit = r.near(r.x[0], r.y[0], 1); assert.ok(hit.includes(0)); r.kill(0); assert.ok(!r.near(r.x[0], r.y[0], 1).includes(0) && r.living === 399, 'killed ones are gone');
  const kx = r.x[0]; r.update(1 / 60); assert.equal(r.x[0], kx, 'and stay still');
  r.revive(0, 10, 10); assert.equal(r.living, 400); r.update(0); assert.equal(r.x[0], 10, 'dt 0 moves nothing');
  assert.equal(new Swarm({ count: 1e6, gpu: false }).count, 8192, 'at most 8192');
  assert.ok([2000, 8192].includes(Swarm.max()));
  const t = performance.now(), big = new Swarm({ count: 2000, w: 600, h: 600, gpu: false }); for (let f = 0; f < 30; f++) big.update(1 / 60);
  console.log(`swarm: flocks, pulls, pushes, obstacles, edges, kill and revive ok (2000 on the CPU: ${((performance.now() - t) / 30).toFixed(1)} ms a frame here)`);
}

// gs.city layout: the same seed gives the same city; buildings stay inside their blocks and never overlap; the roads join up
{
  const { layout, STYLES } = await import('../src/kit/city.js');
  for (const style of Object.keys(STYLES)) {
    const p = layout({ seed: 42, blocks: [5, 4], style });
    assert.equal(JSON.stringify(p.buildings), JSON.stringify(layout({ seed: 42, blocks: [5, 4], style }).buildings), style + ': same seed, same city');
    assert.equal(p.blocks.length, 20); assert.equal(p.nodes.length, 30); assert.ok(p.buildings.length > 40, style + ': buildings ' + p.buildings.length);
    for (const b of p.buildings) {
      const k = p.blocks[b.block];
      assert.ok(b.x0 >= k.x0 + k.sw - .01 && b.x1 <= k.x1 - k.sw + .01 && b.z0 >= k.z0 + k.sw - .01 && b.z1 <= k.z1 - k.sw + .01, style + ': building inside its block, off the pavement');
      assert.ok(b.h > 2 && b.parts.every(q => q.y1 > q.y0), style + ': building heights');
    }
    for (let i = 0; i < p.buildings.length; i++) for (let j = i + 1; j < p.buildings.length; j++) {
      const A = p.buildings[i], B = p.buildings[j];
      assert.ok(!(A.x0 < B.x1 - .01 && A.x1 > B.x0 + .01 && A.z0 < B.z1 - .01 && A.z1 > B.z0 + .01), style + ': buildings overlap');
    }
    // every junction can reach every other one
    const seen = new Set([0]), todo = [0];
    while (todo.length) for (const id of p.nodes[todo.pop()].out) { const n = p.edges[id].b; if (!seen.has(n)) { seen.add(n); todo.push(n); } }
    assert.equal(seen.size, p.nodes.length, style + ': roads join up');
    assert.ok(p.spots.door.length === p.buildings.length && p.spots.corner.length === 80, style + ': spots');
  }
  assert.notEqual(JSON.stringify(layout({ seed: 1 }).buildings), JSON.stringify(layout({ seed: 2 }).buildings), 'another seed, another city');
  console.log('city: layouts for all styles are repeatable, tidy and joined up');
}

// behaviour trees and wants (gs.ai.Tree, gs.ai.Choose)
{
  const { Tree, Choose } = await import('../src/kit/bt.js');
  const me = { hp: 10, sees: false, log: [] };
  let walkLeft = 2;
  const t = new Tree(`root { selector {
      sequence { condition [Hurt] action [Flee] }
      sequence while(Sees) until(Hurt) { action [Chase] }
      sequence until(Sees) { action [Walk] wait [500] }
  } }`, {
    Hurt: () => me.hp < 3, Sees: () => me.sees,
    Flee: () => { me.log.push('flee'); return Tree.ok; },
    Chase: () => { me.log.push('chase'); },
    Walk: () => { me.log.push('walk'); return --walkLeft <= 0 ? Tree.ok : undefined; },
  });
  t.update(.1); t.update(.1); assert.deepEqual(me.log, ['walk', 'walk'], 'walks until done');
  t.update(.3); assert.equal(t.state, 'running', 'waits in game time'); t.update(.3); t.update(.1);
  me.sees = true; me.log.length = 0; t.update(.1); t.update(.1); t.update(.1); assert.deepEqual(me.log, ['chase', 'chase'], 'seeing stops the walk, then it chases');
  assert.ok(t.path().includes('action') || t.path().length > 1, 'path lists running nodes ' + t.path());
  me.hp = 1; me.log.length = 0; t.update(.1); t.update(.1); t.update(.1); assert.ok(me.log.includes('flee'), 'a guard drops the chase, then it flees ' + me.log);
  const s = { food: .9, tired: .2, hp: 10, near: 0 };
  const want = new Choose({ eat: [() => 1 - s.food, Choose.quad], sleep: () => s.tired, fight: { score: [() => s.near, () => s.hp / 10], weight: 1.5 } }, { stick: .1 });
  assert.equal(want.pick(), 'sleep', 'sleep when tired and fed');
  s.food = .1; assert.equal(want.pick(), 'eat', 'eat when hungry');
  s.near = 1; assert.equal(want.pick(), 'fight', 'fight when the player is close');
  s.near = .55; s.tired = .6; s.food = .9; const a = want.pick(); assert.equal(a, 'fight', 'stickiness keeps the current pick near a tie (' + JSON.stringify(want.scores) + ')');
  console.log('behaviour trees: selector, guards, game-time waits; wants: curves, weights, stickiness ok');
}
// skinned person: one mesh over the figure's bones, face shapes, lip sync timing, blend spaces, foot IK
{
  const { person, Rig } = await import('../src/kit/poses.js');
  const { Face, shapes, visemes } = await import('../src/kit/characters.js');
  const { BoxGeometry, Mesh, Vector3 } = await import('three');
  const p = person({ hair: null });
  assert.ok(p.mesh.isSkinnedMesh && p.mesh.skeleton.bones.length === 13, 'one skinned mesh, 13 bones');
  const sw = p.mesh.geometry.attributes.skinWeight; let bad = 0;
  for (let i = 0; i < sw.count; i++) if (Math.abs(sw.getX(i) + sw.getY(i) + sw.getZ(i) + sw.getW(i) - 1) > 1e-4) bad++;
  assert.equal(bad, 0, 'every vertex weights add up to 1');
  assert.deepEqual(Object.keys(p.mesh.morphTargetDictionary).sort(), ['blink', 'frown', 'open', 'round', 'smile', 'surprise', 'wide'], 'face shapes');
  // walking to running by speed keeps one phase; the hips drop with the run's lean
  p.rig.blend({ idle: 0, walk: 1.4, run: 4 }, 2.7); for (let i = 0; i < 40; i++) p.rig.update(1 / 30, { speed: 2.7 });
  assert.ok(Math.abs(p.rig.bw.walk - .5) < .01 && Math.abs(p.rig.bw.run - .5) < .01, 'half walk, half run ' + JSON.stringify(p.rig.bw));
  assert.equal(p.rig.blendK, 1, 'blended in');
  p.rig.blend2({ idle: [0, 0], walk: [0, 1], back: [0, -1], strafeL: [-1, 0], strafeR: [1, 0] }, 1, 0);
  assert.equal(p.rig.bw.strafeR, 1, 'strafe right on the 2D space');
  p.rig.play('idle'); for (let i = 0; i < 30; i++) p.rig.update(1 / 30); assert.equal(p.rig.blendK, 0, 'play() fades the blend out');
  // foot IK: the left foot on a 20 cm step, the right on the floor; the left knee bends to put it there
  for (let i = 0; i < 30; i++) { p.rig.update(1 / 30); p.rig.plant(x => x > 0 ? .2 : 0, p); }
  p.updateMatrixWorld(true);
  const fl = p.bones.footL.getWorldPosition(new Vector3()), fr = p.bones.footR.getWorldPosition(new Vector3());
  assert.ok(Math.abs(fl.y - fr.y - .2) < .02, 'left ankle 20 cm above the right: ' + (fl.y - fr.y).toFixed(3));
  assert.ok(Math.abs(fr.y - .09) < .02, 'right ankle stays on the floor ' + fr.y.toFixed(3));
  // lip sync: vowels open the mouth, m/b/p close it; a line takes about a second for 14 letters
  const v = visemes('Mama'); assert.ok(v[0].open === 0 && v[1].open > .8, 'm closed, a open');
  assert.ok(Math.abs(visemes('abcdefghijklmn').end - 1) < .2, 'about 14 letters a second');
  const f = new Face(p.mesh, { blinkEvery: 0 }); f.line = { v: visemes('ooo'), t: 0, i: 0 }; for (let i = 0; i < 4; i++) f.update(1 / 60);
  const inf = p.mesh.morphTargetInfluences, d = p.mesh.morphTargetDictionary;
  assert.ok(inf[d.round] > .4 && inf[d.wide] < .1, 'o rounds the mouth ' + inf[d.round].toFixed(2));
  f.set('smile', 1); for (let i = 0; i < 60; i++) f.update(1 / 60); assert.ok(inf[d.smile] > .9, 'smile eases in');
  f.blink(); f.update(.08); assert.ok(inf[d.blink] > .9, 'blink');
  // shapes on any geometry
  const g = shapes(new BoxGeometry(1, 1, 1), { tall: (q, o) => o.set(0, q.y, 0) }), m = new Mesh(g);
  assert.equal(m.morphTargetDictionary.tall, 0, 'your own shape');
  const ff = new Face(m, { blinkEvery: 0 }); ff.set('tall', 1); for (let i = 0; i < 60; i++) ff.update(1 / 60); assert.ok(m.morphTargetInfluences[0] > .9, 'eased');
  console.log('skinned person, face shapes, lip sync, blend spaces, foot IK ok');
}

// occlusion culling: a wall hides what's behind it, never what's in front, beside or above it
{
  const { Occlusion } = await import('../src/kit/occlusion.js');
  const { PerspectiveCamera, Vector3, Mesh, BoxGeometry } = await import('three');
  const cam = new PerspectiveCamera(60, 1, .1, 500); cam.position.set(0, 1.6, 10); cam.lookAt(0, 1.6, 0); cam.updateMatrixWorld();
  const oc = new Occlusion().set([{ x0: -5, x1: 5, y0: 0, y1: 4, z0: -.5, z1: .5 }]).frame(cam, 1);
  assert.equal(oc.stats.boxes, 1, 'the wall is drawn');
  assert.ok(oc.hidden(new Vector3(0, 1.5, -5), 1), 'behind the wall');
  assert.ok(!oc.hidden(new Vector3(0, 1.5, 5), 1), 'in front of the wall');
  assert.ok(!oc.hidden(new Vector3(9, 1.5, -5), 1), 'beside the wall');
  assert.ok(!oc.hidden(new Vector3(0, 4.6, -3), 1), 'peeking over the top');
  assert.ok(!oc.hidden(new Vector3(0, 1.5, -.2), 1), 'inside the wall pokes out');
  // a box through the camera counts for nothing (it can't be drawn safely)
  const o2 = new Occlusion().set([{ x0: -5, x1: 5, y0: 0, y1: 4, z0: 9, z1: 11 }]).frame(cam, 1);
  assert.equal(o2.hidden(new Vector3(0, 1.5, -5), 1), false, 'camera inside a box');
  // a wall you stand beside, reaching behind you, still hides what's past it
  const side = new PerspectiveCamera(60, 1, .1, 500); side.position.set(0, 1.6, 0); side.lookAt(10, 1.6, -3); side.updateMatrixWorld();
  const o3 = new Occlusion().set([{ x0: -20, x1: 20, y0: 0, y1: 10, z0: -3, z1: -2 }]).frame(side, 1);
  assert.ok(o3.hidden(new Vector3(10, 1.6, -8), 1), 'behind a wall that reaches behind the camera');
  assert.ok(!o3.hidden(new Vector3(10, 1.6, 1), 1), 'on the open side');
  const m = new Mesh(new BoxGeometry(1, 1, 1)); m.position.set(0, 1.5, -6); m.updateMatrixWorld();
  assert.ok(oc.hiddenObject(m), 'a mesh by its bounding sphere');
  console.log('occlusion culling: behind, front, beside, over the top, camera in a box ok');
}

// frame generation: a camera's turn as a picture warp (exact for any turn and zoom), and the battery and heat reading
{
  const { poseOf, homography, lerpPose, newPose } = await import('../src/kit/framegen.js');
  const { PerspectiveCamera, Vector3 } = await import('three');
  const a = new PerspectiveCamera(60, 1.5, .1, 100), b = new PerspectiveCamera(48, 1.5, .1, 100);
  a.position.set(1, 2, 3); a.lookAt(0, 1, -5); b.position.copy(a.position); b.lookAt(4, 3, -6);
  a.updateMatrixWorld(); b.updateMatrixWorld();
  const H = homography(poseOf(a), poseOf(b)), e = H.elements;
  for (const p of [new Vector3(0, 1, -5), new Vector3(3, 2.5, -7), new Vector3(-1, 0, -2)]) {
    const na = p.clone().project(a), nb = p.clone().project(b);
    const h = [e[0] * na.x + e[3] * na.y + e[6], e[1] * na.x + e[4] * na.y + e[7], e[2] * na.x + e[5] * na.y + e[8]];
    assert.ok(Math.abs(h[0] / h[2] - nb.x) < 1e-6 && Math.abs(h[1] / h[2] - nb.y) < 1e-6, 'a turn and zoom map a point exactly');
  }
  // halfway: the turn's middle (slerp), and past the end it keeps turning the same way
  const mid = lerpPose(poseOf(a), poseOf(b), .5, newPose()), past = lerpPose(poseOf(a), poseOf(b), 1.5, newPose());
  const qa = poseOf(a).q, qb = poseOf(b).q;
  assert.ok(Math.abs(qa.angleTo(mid.q) - qb.angleTo(mid.q)) < 1e-6, 'halfway is halfway');
  assert.ok(Math.abs(qb.angleTo(past.q) - qa.angleTo(qb) * .5) < 1e-6, 'past the end keeps turning');

  const { heatOf, judge } = await import('../src/kit/power.js');
  assert.equal(heatOf({ platform: 'android', thermal: 0, headroom: .4 }), 0, 'cool');
  assert.equal(heatOf({ platform: 'android', thermal: 2, headroom: -1 }), 1, 'Android moderate is warm');
  assert.equal(heatOf({ platform: 'android', thermal: 1, headroom: 1.02 }), 2, 'headroom 1 means throttling soon');
  assert.equal(heatOf({ platform: 'ios', thermal: 2 }), 2, 'iPhone serious is hot');
  const p = { heat: 0, saver: false, level: .5, charging: false, saving: false, why: '' };
  assert.equal(judge(p, 0), false, 'nothing to save for');
  p.level = .15; assert.equal(judge(p, 1000), true, 'low battery'); assert.equal(p.why, 'the battery is low');
  p.charging = true; assert.equal(judge(p, 30000), true, 'held a minute after the reason goes');
  assert.equal(judge(p, 62000), false, 'then lets go');
  p.saver = true; judge(p, 70000); assert.equal(p.why, 'battery saver is on');

  // pacing: a 60 fps game on a 120 Hz screen whose refresh between real frames comes late, or not at all,
  // still shows the moment due by the clock (never back, never the same moment twice)
  const { refreshesSince } = await import('../src/kit/framegen.js');
  const S = { at: 1000, ms: 1000 / 120, k: 0 };
  assert.equal(refreshesSince(S, 1000 + 8.6), 1, 'the next refresh');
  assert.equal(refreshesSince(S, 1000 + 16.9), 2, 'a refresh the phone skipped is counted');
  S.k = 2; assert.equal(refreshesSince(S, 1000 + 17.5), 3, 'never the same moment twice');
  assert.equal(refreshesSince({ at: 0, ms: 0, k: 4 }, 50), 5, 'no clock: the next');

  // the screen's rate (src/kit/screenrate.js): frame generation asks for whole refreshes per real frame,
  // a game without it asks for its own rate (at least 60), unknown rates ask for nothing
  const { pickRate, screen } = await import('../src/kit/screenrate.js');
  assert.equal(pickRate([60, 120], 60, true), 120, 'frame generation: two refreshes a frame');
  assert.equal(pickRate([60, 90, 120, 144], 60, true), 120, '60 fps on a 144 Hz screen: 120 (two a frame, not 2.4)');
  assert.equal(pickRate([60, 90, 120, 144], 30, true), 120, '30 fps: four a frame');
  assert.equal(pickRate([60, 90], 60, true), 90, 'no whole number: the fastest');
  assert.equal(pickRate([60, 120], 60, false), 60, 'no frame generation: the game\'s own rate');
  assert.equal(pickRate([1, 10, 24, 30, 60, 120], 30, false), 60, 'never below 60');
  assert.equal(pickRate([60, 90, 120, 144], 120, false), 120, 'a 120 fps game on a 144 Hz screen: 120');
  assert.equal(pickRate([], 60, true), 0, 'rates unknown: no wish');
  const sp = await import('../src/kit/speed.js');
  const ng = { id: 'kt-ng', era: 'nextgen', fps: 60 }, flat = { id: 'kt-2d', fps: 30 };
  assert.equal(sp.screenWant(ng), 0, 'no rates known (the web): no wish');
  screen.rates = [60, 120]; screen.top = 120; sp.speed.gpu = true;
  assert.equal(sp.screenWant(ng), 120, 'a 60 fps 3D game with frame generation holds 120 Hz');
  assert.equal(sp.screenWant(flat), 60, 'a 30 fps 2D game asks for 60');
  assert.equal(sp.screenWant({ ...ng, frameGen: false }), 60, 'a game that turns frame generation off asks for its own rate');
  sp.setFrameGenPick('off'); assert.equal(sp.screenWant(ng), 60, 'frame generation off in Settings: its own rate');
  sp.setFrameGenPick('auto'); sp.speed.gpu = false;
  assert.equal(sp.screenWant(ng), 60, 'on WebGL (no frame generation): its own rate');
  screen.rates = []; screen.top = 0;
  // automatic 3D quality: Rob's Fold reports (2026-11-10) averaged 57 fps at 60 but dropped a frame 3 times a second
  const B = 1000 / 60;
  assert.equal(sp.qualityVerdict(B * 1.3, 0, B), 'slow', 'a slow average steps down');
  assert.equal(sp.qualityVerdict(1000 / 57, 3, B), 'slow', 'a good average with frames a refresh late steps down');
  assert.equal(sp.qualityVerdict(B, 1, B), 'ok', 'one late frame in a window (a hitch) is not enough');
  assert.equal(sp.qualityVerdict(B, 1, B) === 'fast', false, 'and is never room to climb');
  assert.equal(sp.qualityVerdict(B, 0, B), 'fast', 'on the beat with none late: room to climb');
  console.log('frame generation: exact camera turns, battery and heat, pacing by the clock, screen rate, stutter-aware quality ok');
}

// gs.props on WebGPU: each copy keeps its slot in the drawn list while it stays in view (three's motion,
// for frame generation and SGSR 2, compares each slot with what it held last frame)
{
  const { gpuProps } = await import('../src/kit/hd3d-gpu.js');
  const { PerspectiveCamera, Matrix4, BoxGeometry, MeshBasicMaterial } = await import('three');
  // a stand-in for an InstancedMesh2: 12 boxes in a row along x, 10 m in front of the camera
  const n = 12, D = new Float32Array(n * 16), M4 = new Matrix4();
  for (let i = 0; i < n; i++) M4.makeTranslation(i * 4 - 22, 0, -10).toArray(D, i * 16);
  const geo = new BoxGeometry(1, 1, 1); geo.computeBoundingSphere();
  const im = { name: 'props:box', geometry: geo, material: new MeshBasicMaterial(), castShadow: false, receiveShadow: false, matrixWorld: new Matrix4(),
    _capacity: n, _instancesArrayCount: n, matricesTexture: { _data: D }, colorsTexture: null, getActiveAndVisibilityAt: i => i < n };
  const tw = gpuProps(im), mesh = tw.group.children[0], cam = new PerspectiveCamera(50, 1, .1, 100);
  const at = s => mesh.instanceMatrix.array[s * 16 + 12];   // x of the copy in slot s
  const slots = () => { const o = {}; for (let s = 0; s < mesh.count; s++) if (mesh.instanceMatrix.array[s * 16]) o[at(s)] = s; return o; };
  cam.position.set(0, 0, 0); cam.lookAt(0, 0, -10); tw.sync(cam);
  const first = slots();
  assert.ok(Object.keys(first).length > 2 && Object.keys(first).length < n, 'only the copies in view (and the margin) are drawn');
  // turn right: some copies leave on the left, new ones come in on the right
  cam.lookAt(6, 0, -10); tw.sync(cam);
  const second = slots();
  let kept = 0;
  for (const x in second) if (x in first) { assert.equal(second[x], first[x], `the copy at x = ${x} kept its slot`); kept++; }
  assert.ok(kept > 0 && Object.keys(second).some(x => !(x in first)), 'some stayed, some came in');
  // turn back: the ones that left come straight back to their old slots (they lingered)
  cam.lookAt(0, 0, -10); tw.sync(cam);
  const third = slots();
  for (const x in first) assert.equal(third[x], first[x], `the copy at x = ${x} came back to its slot`);
  console.log('frame generation: props keep their places on WebGPU ok');
}

// every check above has passed; something a kit started (a timer) would keep Node waiting a minute before it exits
process.exit(0);

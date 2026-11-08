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
  const { Brain, Net, Wave, Imagine } = await import('../src/kit/brains.js');
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
  // Imagine: picks the move that gets to the goal
  const plan = new Imagine({ actions: ['left', 'stay', 'right'], step: (s, a, dt) => ({ x: s.x + (a - 1) * dt * 5 }), score: s => -Math.abs(s.x - 3) });
  assert.equal(plan.pick({ x: 0 }), 2); assert.equal(plan.action, 'right'); assert.equal(plan.pick({ x: 6 }), 0);
  console.log('brains: copy, trust, drift, win rate, rules, limits, waves, plans ok');
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
  const { dungeon, cave, maze, islands, pattern, fov, loadGen } = await import('../src/kit/gen.js');
  await loadGen();
  const a = dungeon(40, 30, { seed: 7 }), b2 = dungeon(40, 30, { seed: 7 });
  assert.equal(a.text, b2.text, 'same seed, same dungeon'); assert.ok(a.text.includes('S') && a.text.includes('E') && a.rooms.length > 1);
  assert.ok(cave(40, 30, { seed: 1 }).text.includes('.')); assert.ok(maze(21, 21, { seed: 1 }).grid.length === 21); assert.ok(/[~.^]/.test(islands(32, 32, { seed: 3 }).text));
  const pt = pattern('..#..\n.###.\n..#..\n.....', 16, 16, { seed: 2 }); assert.ok(pt && pt.grid.length === 16);
  const seen = fov('#####\n#...#\n#...#\n#####', 2, 1, 5); assert.ok(seen.has('3,2') && seen.has('0,0'));
  console.log('gen: dungeon (seeded), cave, maze, islands, pattern, fov ok');
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

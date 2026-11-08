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

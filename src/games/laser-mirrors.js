import gs from '../gamescroll.js';
const { sounds, tone } = gs.sound;
const { haptic, want } = gs.device;
const { clamp, rnd } = gs.util;
const { Particles, pbr, rbox, surface, speckle, THREE } = gs.hd;
const { ARView, arNote, FLOOR } = gs.ar;
const { Group, Mesh, Vector3, Vector2, Raycaster, Plane, CylinderGeometry, IcosahedronGeometry, BoxGeometry, PlaneGeometry, MeshBasicMaterial, AdditiveBlending, Color } = THREE;

// Laser Mirrors: a laser puzzle board lies on your real floor. Tap a square to stand a mirror on it,
// tap again to turn it the other way, and again to take it away. Bounce the beam round the stone
// pillars into the crystal before the clock runs out. Each solved board adds time; walk round it (or
// drag to look) when the pillars hide the beam.
let W = 300, H = 460;
const N = 7, CELL = .17;

let MT = null;
function looks() {
  if (MT) return MT;
  const tile = surface(128, ({ col, h, r, size: S }) => { col.fillStyle = '#1c2230'; col.fillRect(0, 0, S, S); speckle(col, S, 400, '#2a3446', 1.5, .4); h.fillStyle = '#000'; h.fillRect(0, 0, S, 3); h.fillRect(0, 0, 3, S); r.fillStyle = '#404040'; r.fillRect(0, 0, S, S); }, { strength: 2 });
  MT = { tile: pbr('#ffffff', { tex: tile.repeat(N, N), rough: .3, metal: .6 }), line: pbr('#2affd0', { glow: 1.4 }), frame: pbr('#c8ccd4', { rough: .2, metal: 1 }),
    mirror: pbr('#e8f4ff', { rough: .02, metal: 1, clear: 1 }), back: pbr('#3a3e46', { rough: .4, metal: .6 }), stone: pbr('#8a8478', { rough: .9 }), emit: pbr('#30343c', { rough: .3, metal: .9 }), lens: pbr('#ff2a2a', { glow: 4 }),
    crystal: pbr('#7a4aff', { glow: 1, rough: .05, metal: .3, clear: 1 }), lit: pbr('#ff8aff', { glow: 5, rough: .05 }),
    beam: new MeshBasicMaterial({ color: new Color(6, .5, .4), transparent: true, opacity: .9, depthWrite: false, blending: AdditiveBlending }) };
  return MT;
}
const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
// '/' and '\' mirrors: which way a beam travelling in direction d leaves
const BOUNCE = { '/': [3, 2, 1, 0], '\\': [1, 0, 3, 2] };

function make(api) {
  want('motion');
  let v, board, beams, sparks, mirrorMeshes, crystal, built;
  let solution = [], state, level, grid, emitter, target, spare, time, score, t, msg, tap, solvedT, path, beamHit, lastLen, mirrorsLeft;
  const ray = new Raycaster(), v2 = new Vector2(), plane = new Plane(new Vector3(0, 1, 0), -FLOOR);
  const cellPos = (i, j) => new Vector3((i - (N - 1) / 2) * CELL, 0, (j - (N - 1) / 2) * CELL);

  function setup() {
    v = new ARView(); board = new Group(); v.scene.add(board); board.visible = false;
    beams = []; for (let i = 0; i < 24; i++) { const b = new Mesh(new CylinderGeometry(.008, .008, 1, 6), looks().beam); b.visible = false; board.add(b); beams.push(b); }
    sparks = new Particles(v, { max: 300, additive: true });
  }
  function say(txt, col = '#fff', l = 1.4, sub) { msg = { txt, col, l, sub }; }
  function newBoard() {
    for (const o of [...board.children]) if (!beams.includes(o)) board.remove(o);
    const m = looks();
    const tiles = new Mesh(new BoxGeometry(N * CELL, .01, N * CELL), m.tile); tiles.position.y = .005; tiles.receiveShadow = true; board.add(tiles);
    for (const s of [-1, 1]) for (const ax of [0, 1]) { const f = new Mesh(rbox(ax ? .02 : N * CELL + .04, .025, ax ? N * CELL + .04 : .02, .006), m.frame); f.position.set(ax ? s * (N * CELL / 2 + .01) : 0, .012, ax ? 0 : s * (N * CELL / 2 + .01)); f.castShadow = f.receiveShadow = true; board.add(f); }
    // build a solution: a beam from one edge that turns a few times and ends in the crystal
    const turns = Math.min(5, 1 + level);
    for (let tries = 0; tries < 400; tries++) {
      grid = Array.from({ length: N }, () => Array(N).fill(null));
      const side = (Math.random() * 4) | 0, k = 1 + ((Math.random() * (N - 2)) | 0);
      let d = side, i = side === 0 ? -1 : side === 2 ? N : k, j = side === 1 ? -1 : side === 3 ? N : k;
      emitter = { i, j, d }; const visited = new Set(); let made = 0, ok = true, steps = 0; const sol = [];
      while (ok) {
        i += DIRS[d][0]; j += DIRS[d][1]; steps++;
        if (i < 0 || j < 0 || i >= N || j >= N || visited.has(i + ',' + j)) { ok = false; break; }
        visited.add(i + ',' + j);
        if (made === turns && steps > 1) { target = { i, j }; break; }
        if (steps > 1 && made < turns && Math.random() < .45) { const kind = Math.random() < .5 ? '/' : '\\'; sol.push({ i, j, kind }); d = BOUNCE[kind][d]; made++; steps = 0; }
      }
      if (!ok || !target || made !== turns) { target = null; continue; }
      path = visited; solution = sol; grid[target.i][target.j] = 'T';
      // stone pillars off the solution path
      const want = Math.min(10, 3 + level * 2); let n = 0;
      for (let q = 0; q < 200 && n < want; q++) { const a = (Math.random() * N) | 0, b = (Math.random() * N) | 0; if (!grid[a][b] && !visited.has(a + ',' + b)) { grid[a][b] = 'X'; n++; } }
      spare = turns + (level < 3 ? 1 : 0); mirrorsLeft = spare;
      break;
    }
    const lineMat = m.line;
    for (let a = 0; a < N; a++) for (let b = 0; b < N; b++) {
      if (grid[a][b] === 'X') { const p = cellPos(a, b), pil = new Mesh(rbox(CELL * .7, rnd(.08, .16), CELL * .7, .015), m.stone); pil.position.set(p.x, pil.geometry.parameters?.height / 2 || .06, p.z); pil.position.y = .06; pil.castShadow = pil.receiveShadow = true; board.add(pil); }
    }
    const ep = cellPos(emitter.i, emitter.j), em = new Group(); em.position.copy(ep); em.rotation.y = Math.atan2(DIRS[emitter.d][0], DIRS[emitter.d][1]);
    const body = new Mesh(rbox(.08, .07, .1, .015), m.emit); body.position.y = .045; body.castShadow = true; em.add(body);
    const lens = new Mesh(new CylinderGeometry(.018, .018, .02, 14), m.lens); lens.rotation.x = Math.PI / 2; lens.position.set(0, .045, .05); em.add(lens); board.add(em);
    const tp = cellPos(target.i, target.j); crystal = new Mesh(new IcosahedronGeometry(.045, 0), m.crystal); crystal.position.set(tp.x, .07, tp.z); crystal.castShadow = true; board.add(crystal);
    const stand = new Mesh(new CylinderGeometry(.03, .04, .025, 12), m.frame); stand.position.set(tp.x, .012, tp.z); board.add(stand);
    mirrorMeshes = {}; state = 'play'; solvedT = 0; v.warmed = false; v.shadowsDirty();
  }
  function setMirror(i, j, kind) {
    const key = i + ',' + j; if (mirrorMeshes[key]) { board.remove(mirrorMeshes[key]); delete mirrorMeshes[key]; }
    grid[i][j] = kind; if (!kind) return;
    const m = looks(), g = new Group(), p = cellPos(i, j); g.position.copy(p); g.rotation.y = kind === '/' ? Math.PI / 4 : -Math.PI / 4;
    const glass = new Mesh(rbox(CELL * .9, .08, .008, .003), m.mirror); glass.position.y = .05; glass.castShadow = true; g.add(glass);
    const back = new Mesh(rbox(CELL * .92, .085, .006, .003), m.back); back.position.set(0, .05, -.007); g.add(back);
    const foot = new Mesh(new CylinderGeometry(.015, .02, .012, 10), m.frame); foot.position.y = .006; g.add(foot);
    g.scale.setScalar(.01); g.userData.pop = 0; board.add(g); mirrorMeshes[key] = g;
  }
  function trace() {
    let { i, j, d } = emitter; const pts = [cellPos(i, j).setY(.045)]; beamHit = false;
    for (let s = 0; s < 80; s++) {
      i += DIRS[d][0]; j += DIRS[d][1];
      if (i < 0 || j < 0 || i >= N || j >= N) { pts.push(cellPos(i - DIRS[d][0] * .5, j - DIRS[d][1] * .5).setY(.045)); break; }
      const c = grid[i][j];
      if (c === 'X') { pts.push(cellPos(i - DIRS[d][0] * .35, j - DIRS[d][1] * .35).setY(.045)); break; }
      if (c === 'T') { pts.push(cellPos(i, j).setY(.06)); beamHit = true; break; }
      if (c === '/' || c === '\\') { pts.push(cellPos(i, j).setY(.045)); d = BOUNCE[c][d]; }
    }
    return pts;
  }
  function tapCell(x, y) {
    ray.setFromCamera(v2.set(x / W * 2 - 1, 1 - y / H * 2), v.cam); plane.constant = -(FLOOR + .01);
    const p = ray.ray.intersectPlane(plane, new Vector3()); if (!p) return; const l = board.worldToLocal(p);
    const i = Math.round(l.x / CELL + (N - 1) / 2), j = Math.round(l.z / CELL + (N - 1) / 2);
    if (i < 0 || j < 0 || i >= N || j >= N) return; const c = grid[i][j]; if (c === 'X' || c === 'T') { haptic('warning'); return; }
    if (!c) { if (mirrorsLeft <= 0) { say('NO MIRRORS LEFT', '#ff8a6a', .9, 'Tap one twice to pick it up'); haptic('warning'); return; } mirrorsLeft--; setMirror(i, j, '/'); }
    else if (c === '/') setMirror(i, j, '\\');
    else { setMirror(i, j, null); mirrorsLeft++; }
    tone(c ? 600 : 900, { len: .05, wave: 'triangle', vol: .04 }); haptic('light');
  }
  function place() {
    const yaw = v.heading(), e = v.eyePos; board.position.set(e.x - Math.sin(yaw) * 1.05, FLOOR, e.z - Math.cos(yaw) * 1.05); board.rotation.y = yaw; board.visible = true;
    newBoard(); say('LEVEL 1', '#fff', 1.6, 'Tap squares to place mirrors');
  }
  function update(dt) {
    if (!v) return; v.live(); if (v.calibrating) return;
    t += dt; if (msg) { msg.l -= dt; if (msg.l <= 0) msg = null; }
    if (state === 'place') { if (t > .8) place(); return; }
    for (const g of Object.values(mirrorMeshes)) { if (g.userData.pop < 1) { g.userData.pop = Math.min(1, g.userData.pop + dt * 6); g.scale.setScalar(.01 + g.userData.pop + Math.sin(g.userData.pop * Math.PI) * .2); } }
    if (state === 'solved') { solvedT -= dt; crystal.rotation.y += dt * 8; crystal.scale.setScalar(1 + (1.2 - solvedT) * .4); if (solvedT <= 0) { level++; newBoard(); say(`LEVEL ${level}`, '#fff', 1.4); } sparks.update(dt); return; }
    time -= dt; crystal.rotation.y += dt;
    if (time <= 0) { time = 0; v.off(); sounds.lose(); return api.over(); }
    sparks.update(dt);
  }
  function draw(c) {
    if (!v) { setup(); self.reset(); }
    v.look(1 / 60);
    // laser beam
    if (state === 'play' || state === 'solved') {
      const pts = trace();
      beams.forEach((b, k) => { const a = pts[k], e = pts[k + 1]; b.visible = !!(a && e); if (!b.visible) return; const d = e.clone().sub(a), L = d.length(); b.position.copy(a).addScaledVector(d, .5); b.scale.set(1 + Math.sin(t * 40 + k) * .15, L, 1 + Math.sin(t * 40 + k) * .15); b.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), d.normalize()); });
      const end = board.localToWorld(pts[pts.length - 1].clone()); if (Math.random() < .6) sparks.emit({ x: end.x, y: end.y, z: end.z, vx: rnd(-.3, .3), vy: rnd(.1, .5), vz: rnd(-.3, .3), life: .3, size: .012, col: [5, .8, .6], drag: 2, grav: 1 });
      if (beamHit && state === 'play') { state = 'solved'; solvedT = 1.4; const pts2 = 100 + Math.round(Math.min(time, 40)) * 3 + mirrorsLeft * 25; score += pts2; api.score(score); time += 20; crystal.material = looks().lit; say('CRYSTAL CHARGED!', '#ff8aff', 1.4, `+${pts2} · +20s`); haptic('success'); sounds.powerup(); const w = board.localToWorld(crystal.position.clone()); for (let k = 0; k < 60; k++) sparks.emit({ x: w.x, y: w.y, z: w.z, vx: rnd(-.8, .8), vy: rnd(.2, 1.5), vz: rnd(-.8, .8), life: rnd(.5, 1), size: .015, col: [3, 1, 4], drag: 1.5, grav: 1.5 }); }
      if (pts.length !== lastLen) { lastLen = pts.length; tone(1800, { len: .02, wave: 'sine', vol: .02 }); }
    }
    v.draw(c, W, H);
    if (state !== 'place' && crystal) v.pointers(c, W, H, [{ p: board.localToWorld(crystal.position.clone()), col: '#ff8aff' }]);
    c.save(); c.textBaseline = 'middle';
    c.fillStyle = '#04110ecc'; c.beginPath(); c.roundRect(10, 10, 132, 36, 10); c.fill();
    c.fillStyle = '#fff'; c.textAlign = 'left'; c.font = '800 16px Rubik, sans-serif'; c.fillText(String(score), 20, 24); c.font = '600 9px Rubik, sans-serif'; c.fillStyle = '#8affdc'; c.fillText(`LEVEL ${level} · MIRRORS ${mirrorsLeft ?? 0}`, 20, 38);
    c.textAlign = 'right'; c.fillStyle = '#04110ecc'; c.beginPath(); c.roundRect(W - 82, 10, 72, 36, 10); c.fill(); c.fillStyle = time < 10 && (t * 4 | 0) % 2 ? '#ff5a5a' : '#fff'; c.font = '800 18px Rubik, sans-serif'; c.fillText(Math.ceil(time) + 's', W - 20, 29);
    c.textAlign = 'center';
    if (msg) { c.globalAlpha = Math.min(1, msg.l * 2); c.lineWidth = 4; c.strokeStyle = '#000a'; c.font = '800 22px Rubik, sans-serif'; c.strokeText(msg.txt, W / 2, H * .2); c.fillStyle = msg.col; c.fillText(msg.txt, W / 2, H * .2); if (msg.sub) { c.font = '600 11px Rubik, sans-serif'; c.fillStyle = '#fff'; c.fillText(msg.sub, W / 2, H * .2 + 20); } c.globalAlpha = 1; }
    if (level === 1 && t < 8 && state === 'play') { c.fillStyle = '#fff'; c.font = '600 11px Rubik, sans-serif'; c.fillText('Tap a square: mirror · again: turn it · again: remove', W / 2, H - 60); }
    c.restore();
    arNote(c, v, W, H);
  }
  const self = {
    reset() {
      v?.off(); v?.recenter(); level = 1; score = 0; time = 50; t = 0; msg = null; tap = null; state = 'place'; lastLen = 0; mirrorsLeft = 0;
      if (v) { board.visible = false; sparks.clear(); if (!v.sensor) v.pitch = -.9; }
    },
    resize(w, h) { W = w; H = h; },
    update, draw,
    fx(dt) { if (v) sparks.update(dt); },
    down(x, y, id) { if (v?.input?.('down', x, y, id)) return; tap = { x0: x, y0: y, x, y, id, moved: 0 }; },
    move(x, y, pressed, id) { if (v?.input?.('move', x, y, id, pressed)) return; if (!tap || tap.id !== id || !pressed) return; const dx = x - tap.x, dy = y - tap.y; tap.moved = Math.max(tap.moved, Math.hypot(x - tap.x0, y - tap.y0)); tap.x = x; tap.y = y; if (tap.moved > 12 && !v.sensor) v.drag(dx, dy); },
    up(x, y, id) { if (v?.input?.('up', x, y, id)) return; const tp = tap; tap = null; if (tp && tp.moved < 12 && state === 'play') tapCell(x, y); },
    get dbg() { return { state, level, solve: () => { for (const q of solution) { setMirror(q.i, q.j, q.kind); mirrorsLeft--; } } }; },
  };
  return self;
}

export default {
  id: 'laser-mirrors',
  title: 'Laser Mirrors',
  tag: 'AR · Puzzle',
  retro: true, era: 'ar', pal: 'grape',
  w: 300, h: 460, maxW: 600, maxH: 680,
  goal: 500, reward: 20,
  hint: 'A laser puzzle board lies on your real floor. Tap a square to stand a mirror on it, tap again to turn it, again to pick it up. Bounce the red beam round the stone pillars into the crystal before time runs out: every solved board adds 20 seconds. Walk round it or drag to look.',
  traits: ['theme:lab'],
  make,
};

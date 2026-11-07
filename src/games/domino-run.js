import { clamp, rnd } from '../util.js';
import { haptic, want } from '../kit/device.js';
import { ARView, arNote, FLOOR } from '../kit/ar3d.js';
import { Particles, pbr, rbox, surface, speckle, THREE } from '../kit/hd3d.js';
import { sounds, tone } from '../kit/sound.js';
const { Group, Mesh, Vector3, Vector2, Raycaster, Plane, OctahedronGeometry, CylinderGeometry, CircleGeometry, RingGeometry } = THREE;

// Domino Run: draw a path across your real floor with your finger and dominoes pop up along it.
// Run the line past every gold star, then press TIP and watch the chain go. Dominoes are limited,
// blocks are in the way, and a turn that's too sharp breaks the chain (the domino goes red to warn
// you). Every star collected clears the level; miss one and it's over.
let W = 300, H = 460;
const DH = .1, DW = .05, DT = .015, SP = .062, TURN = .9;   // domino height/width/thickness, spacing, sharpest safe turn (rad)
const COLS = ['#ff4a5a', '#ffb02a', '#ffe23a', '#3ad07a', '#2aa8ff', '#9a5aff'];

let MT = null;
function looks() {
  if (MT) return MT;
  const wood = surface(128, ({ col, h, size: S }) => { col.fillStyle = '#a8743c'; col.fillRect(0, 0, S, S); for (let y = 0; y < S; y += 3) { col.fillStyle = `rgba(80,40,10,${Math.random() * .25})`; col.fillRect(0, y, S, 2); h.fillStyle = Math.random() < .5 ? '#999' : '#777'; h.fillRect(0, y, S, 2); } }, { strength: 1.5 });
  MT = { dom: COLS.map(c => pbr(c, { rough: .25, clear: 1 })), bad: pbr('#ff2020', { rough: .3, glow: .6 }), pip: pbr('#ffffff', { rough: .3 }), star: pbr('#ffd040', { glow: 2.2, rough: .2, metal: .6 }), got: pbr('#ffffff', { glow: 3 }),
    block: pbr('#ffffff', { tex: wood, rough: .7 }), pad: pbr('#8affdc', { glow: 1.2, transparent: true, opacity: .55 }) };
  return MT;
}

function make(api) {
  want('motion');
  let v, board, sparks, built;
  let state, level, base, yaw, doms, stars, blocks, budget, score, t, msg, draw0, fallI, fallen, tipBtn, undoBtn, endT;
  const ray = new Raycaster(), v2 = new Vector2(), plane = new Plane(new Vector3(0, 1, 0), -FLOOR), tmp = new Vector3();

  function setup() { v = new ARView(); board = new Group(); v.scene.add(board); sparks = new Particles(v, { max: 300, additive: true }); }
  function say(txt, col = '#fff', l = 1.4, sub) { msg = { txt, col, l, sub }; }
  function clearBoard() { for (const o of [...board.children]) board.remove(o); doms = []; stars = []; blocks = []; }
  function makeLevel() {
    clearBoard(); const m = looks();
    budget = 34 + level * 8; fallI = -1; fallen = 0; endT = 0;
    // start pad + first domino
    const pad = new Mesh(new RingGeometry(.05, .07, 32), m.pad); pad.rotation.x = -Math.PI / 2; pad.position.set(0, .002, 0); board.add(pad);
    addDomino(new Vector3(0, 0, 0), new Vector3(0, 0, 1), true);
    // stars spread over the floor in front, never too close to each other
    const n = Math.min(6, 2 + level);
    for (let i = 0; i < 200 && stars.length < n; i++) {
      const p = new Vector3(rnd(-.7, .7), 0, rnd(.35, 1.5)); if (stars.some(s => s.p.distanceTo(p) < .3)) continue;
      const g = new Mesh(new OctahedronGeometry(.03), m.star); g.position.set(p.x, .09, p.z); g.castShadow = true; board.add(g);
      const ring = new Mesh(new RingGeometry(.06, .07, 24), m.pad); ring.rotation.x = -Math.PI / 2; ring.position.set(p.x, .002, p.z); board.add(ring);
      stars.push({ p, g, got: false });
    }
    // wooden blocks in the way from level 2
    for (let i = 0; i < 200 && blocks.length < Math.min(5, level - 1); i++) {
      const p = new Vector3(rnd(-.6, .6), 0, rnd(.3, 1.4)); if (p.length() < .25 || stars.some(s => s.p.distanceTo(p) < .2) || blocks.some(b => b.p.distanceTo(p) < .3)) continue;
      const w = rnd(.12, .24), d = rnd(.08, .16), b = new Mesh(rbox(w, .06, d, .01), m.block); b.position.set(p.x, .03, p.z); b.rotation.y = rnd(0, Math.PI); b.castShadow = b.receiveShadow = true; board.add(b);
      blocks.push({ p, w, d, a: b.rotation.y, m: b });
    }
    state = 'draw'; v.warmed = false;
  }
  function inBlock(p) { return blocks.some(b => { const dx = p.x - b.p.x, dz = p.z - b.p.z, c = Math.cos(b.a), s = Math.sin(b.a), lx = dx * c - dz * s, lz = dx * s + dz * c; return Math.abs(lx) < b.w / 2 + .025 && Math.abs(lz) < b.d / 2 + .025; }); }
  function addDomino(p, dir, first) {
    const m = looks(), g = new Group(); g.position.copy(p).addScaledVector(dir, DT / 2); g.rotation.y = Math.atan2(dir.x, dir.z);
    const prev = doms[doms.length - 1]; let sharp = false;
    if (prev) { let da = Math.abs(g.rotation.y - prev.g.rotation.y); if (da > Math.PI) da = Math.PI * 2 - da; sharp = da > TURN; }
    const mat = sharp ? m.bad : m.dom[Math.floor(doms.length / 4) % COLS.length];
    const mesh = new Mesh(rbox(DW, DH, DT, .004), mat); mesh.position.set(0, DH / 2, -DT / 2); mesh.castShadow = mesh.receiveShadow = true; g.add(mesh);
    const pip = new Mesh(new CylinderGeometry(.005, .005, .002, 8), m.pip); pip.rotation.x = Math.PI / 2; pip.position.set(0, DH * .7, -DT - .0005); g.add(pip);
    g.scale.y = first ? 1 : .01; board.add(g);
    doms.push({ g, p: p.clone(), dir: dir.clone(), th: 0, w: 0, falling: false, done: false, sharp, grow: first ? 1 : 0 });
    if (!first) { tone(700 + (doms.length % 8) * 60, { len: .025, wave: 'triangle', vol: .025 }); if (doms.length % 3 === 0) haptic('tick'); }
  }
  // extend the line from the last domino towards a floor point (straight steps, stopping at blocks)
  function extend(to) {
    let last = doms[doms.length - 1];
    for (let k = 0; k < 6; k++) {
      if (doms.length - 1 >= budget) return;
      const d = tmp.copy(to).sub(last.p); d.y = 0; const L = d.length(); if (L < SP) return;
      // follow the finger, but a little smoothly so the line curves rather than kinks
      const dir = d.normalize().lerp(last.dir, .25).normalize(), np = last.p.clone().addScaledVector(dir, SP);
      if (inBlock(np)) { if (!last.blockedT) { haptic('warning'); last.blockedT = 1; } return; }
      addDomino(np, dir); last = doms[doms.length - 1];
    }
  }
  function floorAt(x, y) {
    ray.setFromCamera(v2.set(x / W * 2 - 1, 1 - y / H * 2), v.cam); const p = ray.ray.intersectPlane(plane, new Vector3());
    if (!p || p.distanceTo(v.cam.position) > 6) return null; return board.worldToLocal(p);
  }
  function place() {
    yaw = v.heading(); const e = v.eyePos; base = new Vector3(e.x - Math.sin(yaw) * .75, FLOOR, e.z - Math.cos(yaw) * .75);
    board.position.copy(base); board.rotation.y = yaw + Math.PI; makeLevel(); say(`LEVEL ${level}`, '#fff', 1.6, 'Draw a line through every star');
  }
  function tip() { if (state !== 'draw' || doms.length < 2) return; state = 'run'; fallI = 0; doms[0].falling = true; doms[0].w = 2.5; haptic('medium'); tone(300, { len: .1, wave: 'triangle', vol: .04 }); }
  function undo() { if (state !== 'draw') return; for (let i = 0; i < 6 && doms.length > 1; i++) board.remove(doms.pop().g); haptic('light'); }
  function finish() {
    const got = stars.filter(s => s.got).length, all = got === stars.length;
    const left = budget - (doms.length - 1);
    if (all) { const bonus = 100 + left * 3; score += bonus; api.score(score); say('LEVEL CLEAR!', '#8affdc', 2, `+${bonus} (${left} dominoes spare)`); haptic('success'); sounds.win(); state = 'next'; endT = 2.2; }
    else { say(`${stars.length - got} STAR${stars.length - got > 1 ? 'S' : ''} MISSED`, '#ff6a5a', 2.4); haptic('error'); sounds.lose(); state = 'lost'; endT = 2.4; }
  }
  function update(dt) {
    if (!v) return; v.live(); if (v.calibrating) return;
    t += dt; if (msg) { msg.l -= dt; if (msg.l <= 0) msg = null; }
    if (state === 'place') { if (t > .8) place(); return; }
    for (const d of doms) { if (d.grow < 1) { d.grow = Math.min(1, d.grow + dt * 7); d.g.scale.y = .01 + d.grow * .99 + Math.sin(d.grow * Math.PI) * .25; } if (d.blockedT) d.blockedT = Math.max(0, d.blockedT - dt); }
    if (state === 'run') {
      let any = false;
      for (let i = 0; i < doms.length; i++) {
        const d = doms[i]; if (!d.falling || d.done) continue; any = true;
        const next = doms[i + 1], gap = next ? next.p.distanceTo(d.p) - DT : 1;
        d.w += 30 * Math.sin(d.th + .08) * dt; d.th += d.w * dt;
        const lean = next && !next.sharp ? Math.asin(clamp(gap / DH, 0, 1)) : Math.PI / 2 - .02;
        if (d.th >= lean) { d.th = lean; d.done = true; fallen++; tone(1400 + (i % 6) * 40, { len: .02, wave: 'square', vol: .02 }); if (i % 2 === 0) haptic('tick');
          for (const s of stars) if (!s.got && s.p.distanceTo(d.p) < .09) { s.got = true; s.g.material = looks().got; score += 25; api.score(score); haptic('success'); sounds.coin(1.3); const w = board.localToWorld(s.p.clone().setY(.09)); for (let k = 0; k < 30; k++) sparks.emit({ x: w.x, y: w.y, z: w.z, vx: rnd(-.5, .5), vy: rnd(.2, 1), vz: rnd(-.5, .5), life: .8, size: .015, col: [3, 2.4, .6], drag: 1.5, grav: 1.5 }); }
          if (next && !next.sharp) { next.falling = true; next.w = d.w * .85 + 1; score += 1; } else if (next && next.sharp) { say('TOO SHARP: CHAIN BROKEN', '#ff6a5a', 1.6); }
        }
        d.g.rotation.x = d.th;
      }
      api.score(score);
      if (!any) finish();
    }
    for (const s of stars) { s.g.rotation.y += dt * 2; s.g.position.y = .09 + Math.sin(t * 3 + s.p.x * 9) * .01; }
    if (endT > 0) { endT -= dt; if (endT <= 0) { if (state === 'next') { level++; makeLevel(); say(`LEVEL ${level}`, '#fff', 1.6, `${stars.length} stars · ${budget} dominoes`); } else { v.off(); return api.over(); } } }
    sparks.update(dt);
  }
  function draw(c) {
    if (!v) { setup(); self.reset(); }
    v.look(1 / 60); v.draw(c, W, H);
    if (state === 'draw' || state === 'run') v.pointers(c, W, H, stars.filter(s => !s.got).map(s => ({ p: board.localToWorld(s.p.clone().setY(.08)), col: '#ffd040' })));
    c.save(); c.textBaseline = 'middle';
    c.fillStyle = '#04110ecc'; c.beginPath(); c.roundRect(10, 10, 140, 36, 10); c.fill();
    c.fillStyle = '#fff'; c.textAlign = 'left'; c.font = '800 16px Rubik, sans-serif'; c.fillText(String(score), 20, 24);
    c.font = '600 9px Rubik, sans-serif'; c.fillStyle = '#8affdc'; c.fillText(`LEVEL ${level} · ★ ${stars ? stars.filter(s => s.got).length : 0}/${stars ? stars.length : 0}`, 20, 38);
    if (doms) { const left = budget - (doms.length - 1); c.textAlign = 'right'; c.fillStyle = '#04110ecc'; c.beginPath(); c.roundRect(W - 112, 10, 102, 36, 10); c.fill(); c.fillStyle = left < 6 ? '#ff6a5a' : '#fff'; c.font = '800 16px Rubik, sans-serif'; c.fillText(String(left), W - 20, 24); c.font = '600 9px Rubik, sans-serif'; c.fillStyle = '#8affdc'; c.fillText('DOMINOES LEFT', W - 20, 38); }
    // buttons
    tipBtn = { x: W - 104, y: H - 104, w: 88, h: 44 }; undoBtn = { x: 16, y: H - 104, w: 80, h: 44 };
    if (state === 'draw') {
      for (const [b, label, col] of [[tipBtn, 'TIP!', '#ffd040'], [undoBtn, 'UNDO', '#ffffffc0']]) { c.fillStyle = '#04110ee0'; c.beginPath(); c.roundRect(b.x, b.y, b.w, b.h, 22); c.fill(); c.strokeStyle = col; c.lineWidth = 2; c.stroke(); c.fillStyle = col; c.textAlign = 'center'; c.font = '800 15px Rubik, sans-serif'; c.fillText(label, b.x + b.w / 2, b.y + b.h / 2 + 1); }
      if (doms && doms.length < 3) { c.textAlign = 'center'; c.fillStyle = '#fff'; c.font = '600 12px Rubik, sans-serif'; c.fillText('Drag on the floor to lay dominoes from the start ring', W / 2, H - 132); }
    }
    if (msg) { c.textAlign = 'center'; c.globalAlpha = Math.min(1, msg.l * 2); c.lineWidth = 4; c.strokeStyle = '#000a'; c.font = '800 22px Rubik, sans-serif'; c.strokeText(msg.txt, W / 2, H * .22); c.fillStyle = msg.col; c.fillText(msg.txt, W / 2, H * .22); if (msg.sub) { c.font = '600 11px Rubik, sans-serif'; c.fillStyle = '#fff'; c.fillText(msg.sub, W / 2, H * .22 + 20); } c.globalAlpha = 1; }
    c.restore();
    arNote(c, v, W, H);
  }
  const inB = (b, x, y) => b && x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h;
  const self = {
    reset() {
      v?.off(); v?.recenter(); level = 1; score = 0; t = 0; msg = null; draw0 = null; state = 'place';
      if (v) { clearBoard(); sparks.clear(); if (!v.sensor) v.pitch = -.85; }
    },
    resize(w, h) { W = w; H = h; },
    update, draw,
    fx(dt) { if (v) sparks.update(dt); },
    down(x, y, id) {
      if (v?.input?.('down', x, y, id)) return; if (state !== 'draw') return;
      if (inB(tipBtn, x, y)) return tip(); if (inB(undoBtn, x, y)) return undo();
      draw0 = { id }; const p = floorAt(x, y); if (p) extend(p);
    },
    move(x, y, pressed, id) { if (v?.input?.('move', x, y, id, pressed)) return; if (!draw0 || draw0.id !== id || !pressed || state !== 'draw') return; const p = floorAt(x, y); if (p) extend(p); },
    up(x, y, id) { if (v?.input?.('up', x, y, id)) return; if (draw0?.id === id) draw0 = null; },
    key(k, d) { if (!d) return; if (k === ' ' || k === 'Enter') tip(); if (k === 'Backspace') undo(); },
  };
  return self;
}

export default {
  id: 'domino-run',
  title: 'Domino Run',
  tag: 'AR · Puzzle',
  retro: true, era: 'ar', pal: 'grape',
  w: 300, h: 460, maxW: 600, maxH: 680,
  goal: 300, reward: 20,
  hint: 'Drag a line across your real floor and dominoes pop up along it. Lay the line past every gold star, then tap TIP! and watch the chain fall. Dominoes are limited, blocks get in the way, and a turn that is too sharp (red domino) breaks the chain. Collect every star to clear the level.',
  traits: ['theme:toys'],
  make,
};

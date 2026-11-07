import { clamp, rnd } from '../util.js';
import { haptic, want } from '../kit/device.js';
import { ARView, arNote, FLOOR } from '../kit/ar3d.js';
import { Particles, pbr, rbox, surface, speckle, THREE } from '../kit/hd3d.js';
import { sounds, tone, noise } from '../kit/sound.js';
const { Group, Mesh, Vector3, Vector2, Raycaster, Plane, CylinderGeometry, SphereGeometry, CircleGeometry, PlaneGeometry, BoxGeometry, DoubleSide } = THREE;

// Floor Golf: a mini golf course rolls out across your real floor, one hole at a time. Put your
// finger on the ball and pull back, like a slingshot: the further you pull, the harder the putt.
// Walk round to read the line (or drag to look). Bumpers, doglegs and a sliding gate get in the way.
// Six holes; the fewer strokes, the more points, and a hole in one is worth a lot.
let W = 300, H = 460;
const BR = .021, CUP = .054, MAXS = 6;
// holes in metres: green rectangles [x0, z0, x1, z1] (the tee is near z = 0, the course runs away from you)
const HOLES = [
  { par: 2, green: [[-.3, 0, .3, 2.2]], tee: [0, .2], cup: [0, 1.95], block: [] },
  { par: 2, green: [[-.3, 0, .3, 2.3]], tee: [0, .2], cup: [.1, 2.05], block: [[-.3, .85, -.04, .95], [.04, 1.4, .3, 1.5]] },
  { par: 3, green: [[-.3, 0, .3, 1.6], [-.3, 1.0, 1.3, 1.6]], tee: [0, .2], cup: [1.1, 1.3], block: [[.25, 1.0, .45, 1.15]] },
  { par: 2, green: [[-.35, 0, .35, 2.2]], tee: [0, .2], cup: [0, 1.95], block: [], mover: { r: [-.12, 1.1, .12, 1.2], amp: .23, sp: 1.6 } },
  { par: 3, green: [[-.3, 0, .3, 1.0], [-.3, .7, .9, 1.0], [.6, .7, .9, 2.0]], tee: [0, .2], cup: [.75, 1.8], block: [] },
  { par: 3, green: [[-.5, 0, .5, 2.4]], tee: [0, .2], cup: [0, 2.15], block: [[-.25, 1.75, -.05, 1.85], [.05, 1.75, .25, 1.85], [-.5, 1.0, -.15, 1.1], [.15, 1.3, .5, 1.4]], mover: { r: [-.1, .6, .1, .7], amp: .35, sp: 2.2 } },
];

let MT = null;
function looks() {
  if (MT) return MT;
  const felt = surface(256, ({ col, h, size: S }) => { col.fillStyle = '#2a9a4a'; col.fillRect(0, 0, S, S); speckle(col, S, 4000, '#1a7a38', 1, .4); speckle(col, S, 2000, '#4aba62', 1, .3); speckle(h, S, 5000, '#fff', .8, .4); for (let y = 0; y < S; y += 32) { col.fillStyle = '#ffffff08'; col.fillRect(0, y, S, 16); } }, { strength: 1.2 });
  const dimple = surface(128, ({ col, h, size: S }) => { col.fillStyle = '#fafafa'; col.fillRect(0, 0, S, S); for (let y = 4; y < S; y += 9) for (let x = (y % 18 ? 4 : 8); x < S; x += 9) { h.fillStyle = '#404040'; h.beginPath(); h.arc(x, y, 3, 0, 7); h.fill(); } }, { strength: 2 });
  MT = { felt: pbr('#ffffff', { tex: felt.repeat(2, 6), rough: .95, sheen: .5 }), rail: pbr('#f2f0ea', { rough: .3, clear: .8 }), block: pbr('#ff6a3a', { rough: .3, clear: 1 }), mover: pbr('#3a8aff', { rough: .3, clear: 1 }),
    ball: pbr('#ffffff', { tex: dimple, rough: .25, clear: 1 }), cup: pbr('#0a0a0a', { rough: .9 }), pole: pbr('#f0f0f0', { rough: .2, metal: .5 }), flag: pbr('#ff3050', { rough: .5, side: DoubleSide }), aim: pbr('#ffffff', { glow: 1.5, transparent: true, opacity: .8 }) };
  return MT;
}

function make(api) {
  want('motion');
  let v, course, ball, mover, flag, sparkle, built;
  let state, hi, hole, base, yaw, bp, bv, strokes, total, score, t, msg, aim, tap, moverT, sunk, lastHit, cards;
  const tmp = new Vector3(), ray = new Raycaster(), v2 = new Vector2(), plane = new Plane(new Vector3(0, 1, 0), 0);

  function setup() {
    v = new ARView(); course = new Group(); v.scene.add(course); course.visible = false;
    ball = new Mesh(new SphereGeometry(BR, 20, 14), looks().ball); ball.castShadow = true; course.add(ball);
    sparkle = new Particles(v, { max: 200, additive: true });
  }
  const inRect = (r, x, z, pad = 0) => x > r[0] - pad && x < r[2] + pad && z > r[1] - pad && z < r[3] + pad;
  const onGreen = (x, z) => hole.green.some(r => inRect(r, x, z, -BR));
  const blocked = (x, z) => hole.block.some(r => inRect(r, x, z, BR)) || (hole.mover && inRect(moverRect(), x, z, BR));
  function moverRect() { const m = hole.mover, o = Math.sin(moverT * m.sp) * m.amp; return [m.r[0] + o, m.r[1], m.r[2] + o, m.r[3]]; }
  function buildHole() {
    const m = looks();
    for (const o of [...course.children]) if (o !== ball) { course.remove(o); o.traverse?.(q => q.geometry?.dispose?.()); }
    hole = HOLES[hi]; moverT = 0;
    for (const r of hole.green) { const w = r[2] - r[0], d = r[3] - r[1], g = new Mesh(new BoxGeometry(w, .012, d), m.felt); g.position.set((r[0] + r[2]) / 2, .006, (r[1] + r[3]) / 2); g.receiveShadow = true; course.add(g); }
    // rails: along every green edge, except where it opens into another green
    const step = .05;
    for (const r of hole.green) {
      for (const [ax, az, bx, bz, nx, nz] of [[r[0], r[1], r[2], r[1], 0, -1], [r[0], r[3], r[2], r[3], 0, 1], [r[0], r[1], r[0], r[3], -1, 0], [r[2], r[1], r[2], r[3], 1, 0]]) {
        const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / step)); let run = null;
        const flush = () => { if (!run) return; const [s, e] = run, sx = ax + (bx - ax) * s, sz = az + (bz - az) * s, ex = ax + (bx - ax) * e, ez = az + (bz - az) * e, L = Math.hypot(ex - sx, ez - sz) + .03; const rl = new Mesh(rbox(nx ? .03 : L, .045, nx ? L : .03, .008), m.rail); rl.position.set((sx + ex) / 2 + nx * .015, .022, (sz + ez) / 2 + nz * .015); rl.castShadow = rl.receiveShadow = true; course.add(rl); run = null; };
        for (let i = 0; i < n; i++) { const k0 = i / n, k1 = (i + 1) / n, mx = ax + (bx - ax) * (k0 + k1) / 2 + nx * .03, mz = az + (bz - az) * (k0 + k1) / 2 + nz * .03; const open = hole.green.some(q => q !== r && inRect(q, mx, mz)); if (open) flush(); else run = run ? [run[0], k1] : [k0, k1]; }
        flush();
      }
    }
    for (const r of hole.block) { const b = new Mesh(rbox(r[2] - r[0], .05, r[3] - r[1], .01), m.block); b.position.set((r[0] + r[2]) / 2, .025, (r[1] + r[3]) / 2); b.castShadow = b.receiveShadow = true; course.add(b); }
    mover = null; if (hole.mover) { const r = hole.mover.r; mover = new Mesh(rbox(r[2] - r[0], .05, r[3] - r[1], .01), m.mover); mover.position.set(0, .025, (r[1] + r[3]) / 2); mover.castShadow = true; course.add(mover); }
    const cup = new Mesh(new CircleGeometry(CUP, 24), m.cup); cup.rotation.x = -Math.PI / 2; cup.position.set(hole.cup[0], .0125, hole.cup[1]); course.add(cup);
    const pole = new Mesh(new CylinderGeometry(.003, .003, .4, 6), m.pole); pole.position.set(hole.cup[0], .2, hole.cup[1]); pole.castShadow = true; course.add(pole);
    flag = new Mesh(new PlaneGeometry(.1, .065), m.flag); flag.position.set(hole.cup[0] + .05, .36, hole.cup[1]); flag.castShadow = true; course.add(flag);
    bp = new Vector3(hole.tee[0], 0, hole.tee[1]); bv = new Vector3(); strokes = 0; sunk = 0; ball.visible = true; lastHit = 0;
    v.warmed = false; v.shadowsDirty();
  }
  function say(txt, col = '#fff', l = 1.3, sub) { msg = { txt, col, l, sub }; }
  async function placeAt(x, y) {
    let p = null;
    if (v.mode === 'world' && v.hit) { const h = await v.hit(x, y); if (h) p = h.p; }
    yaw = v.heading(); const e = v.eyePos;
    if (!p) p = new Vector3(e.x - Math.sin(yaw) * .9, FLOOR, e.z - Math.cos(yaw) * .9);
    base = p.clone(); course.position.copy(base); course.rotation.y = yaw + Math.PI; course.visible = true;
    state = 'play'; buildHole(); say(`HOLE 1 · PAR ${hole.par}`, '#fff', 1.6, 'Pull back from the ball to putt'); haptic('success');
  }
  // screen point -> course-local point on the green's plane
  function local(x, y) {
    ray.setFromCamera(v2.set(x / W * 2 - 1, 1 - y / H * 2), v.cam); plane.constant = -(base.y + .012);
    const p = ray.ray.intersectPlane(plane, new Vector3()); return p ? course.worldToLocal(p) : null;
  }
  function putt() {
    const pull = aim.from.clone().sub(aim.to); pull.y = 0; const k = power(); if (k < .05 || pull.lengthSq() < 1e-6) return;
    bv.copy(pull.normalize().multiplyScalar(k * 3.4)); strokes++; total++;
    tone(500 + k * 350, { len: .05, wave: 'square', vol: .05 }); noise(.04, { vol: .05, from: 5000, to: 2500, filter: 'highpass' }); haptic('medium');
  }
  // putt strength comes from how far the finger is pulled on screen (the same feel near or far)
  const power = () => aim?.sx == null ? 0 : clamp(Math.hypot(aim.cx - aim.sx, aim.cy - aim.sy) / (Math.min(W, H) * .45), 0, 1);
  function holeDone(inCup) {
    const p = hole.par, s = strokes, ace = inCup && s === 1;
    const pts = inCup ? Math.max(0, (p + 3 - s)) * 40 + (ace ? 200 : 0) : 0; score += pts; api.score(score);
    const name = !inCup ? 'PICKED UP' : ace ? 'HOLE IN ONE!' : s <= p - 2 ? 'EAGLE!' : s === p - 1 ? 'BIRDIE!' : s === p ? 'PAR' : s === p + 1 ? 'BOGEY' : `+${s - p}`;
    say(name, ace ? '#ffd040' : inCup && s <= p ? '#8affdc' : '#fff', 2, `+${pts}`);
    cards.push(s);
    if (inCup) { haptic('success'); sounds.win(); const c = course.localToWorld(new Vector3(hole.cup[0], .05, hole.cup[1])); for (let i = 0; i < 50; i++) sparkle.emit({ x: c.x, y: c.y, z: c.z, vx: rnd(-.6, .6), vy: rnd(.6, 1.6), vz: rnd(-.6, .6), life: rnd(.6, 1.2), size: .015, col: [rnd(1, 3), rnd(1, 3), rnd(.5, 2)], drag: 1, grav: 2 }); }
    sunk = 2.2;
  }
  function update(dt) {
    if (!v) return; v.live(); if (v.calibrating) return;
    t += dt; moverT += dt; lastHit -= dt; if (msg) { msg.l -= dt; if (msg.l <= 0) msg = null; }
    if (state === 'place') { if (v.mode !== 'world' && t > 1) placeAt(W / 2, H / 2); return; }
    if (sunk > 0) { sunk -= dt; if (sunk <= 0) { if (hi + 1 >= HOLES.length) { v.off(); return api.over(); } hi++; buildHole(); say(`HOLE ${hi + 1} · PAR ${hole.par}`, '#fff', 1.6); } sparkle.update(dt); return; }
    // ball physics in small steps: rolling friction, rails, blocks, the cup
    const n = 6, h = dt / n;
    for (let k = 0; k < n; k++) {
      const sp = bv.length(); if (sp < .001) { bv.set(0, 0, 0); break; }
      bv.multiplyScalar(Math.max(0, sp - 1.25 * h) / sp);
      const nx = bp.x + bv.x * h, nz = bp.z + bv.z * h;
      let hit = false;
      if (!onGreen(nx, bp.z) || blocked(nx, bp.z)) { bv.x *= -.72; hit = true; } else bp.x = nx;
      if (!onGreen(bp.x, nz) || blocked(bp.x, nz)) { bv.z *= -.72; hit = true; } else bp.z = nz;
      if (hit && lastHit <= 0 && sp > .2) { lastHit = .08; tone(900, { len: .03, wave: 'triangle', vol: Math.min(.06, sp * .02) }); haptic('tick'); }
      // the cup: slow enough and close enough drops in; too fast lips out
      const dc = Math.hypot(bp.x - hole.cup[0], bp.z - hole.cup[1]);
      if (dc < CUP - BR * .4) { if (sp < 1.4) { ball.visible = false; bv.set(0, 0, 0); tone(300, { len: .08, wave: 'sine', vol: .07 }); setTimeout(() => tone(200, { len: .1, wave: 'sine', vol: .06 }), 80); return holeDone(true); } bv.x += (bp.x - hole.cup[0]) * 6 * h; bv.z += (bp.z - hole.cup[1]) * 6 * h; }
      else if (dc < CUP) { const pull = (CUP - dc) * 8 * h; bv.x -= (bp.x - hole.cup[0]) / dc * pull; bv.z -= (bp.z - hole.cup[1]) / dc * pull; }
    }
    if (bv.lengthSq() === 0 && strokes >= MAXS) holeDone(false);
    sparkle.update(dt);
  }
  function draw(c) {
    if (!v) { setup(); self.reset(); }
    v.look(1 / 60);
    if (state === 'place') { const yy = v.heading(), e = v.eyePos; course.visible = false; }
    if (hole) { ball.position.set(bp.x, .012 + BR, bp.z); ball.rotation.x += bv.z * .6; ball.rotation.z -= bv.x * .6; if (mover) { const r = moverRect(); mover.position.x = (r[0] + r[2]) / 2; } flag.rotation.y = Math.sin(t * 3) * .3; }
    v.draw(c, W, H);
    c.save(); c.textBaseline = 'middle';
    // aim line: from the ball, the way it will go, longer for a harder putt
    if (aim && aim.to) {
      const pull = aim.from.clone().sub(aim.to); pull.y = 0; const k = power();
      if (k > .05 && pull.lengthSq() > 1e-6) {
        const end = bp.clone().addScaledVector(pull.normalize(), .15 + k * .7); const a = course.localToWorld(new Vector3(bp.x, .03, bp.z)), b = course.localToWorld(new Vector3(end.x, .03, end.z));
        const [ax, ay] = v.toScreen(a.x, a.y, a.z), [bx, by] = v.toScreen(b.x, b.y, b.z);
        c.setLineDash([6, 6]); c.strokeStyle = `hsl(${120 - k * 120}, 90%, 60%)`; c.lineWidth = 3; c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.stroke(); c.setLineDash([]);
        c.fillStyle = '#00000080'; c.beginPath(); c.roundRect(W / 2 - 60, H - 110, 120, 12, 6); c.fill(); c.fillStyle = `hsl(${120 - k * 120}, 90%, 55%)`; c.beginPath(); c.roundRect(W / 2 - 60, H - 110, Math.max(12, 120 * k), 12, 6); c.fill();
      }
    }
    c.fillStyle = '#04110ecc'; c.beginPath(); c.roundRect(10, 10, 150, 36, 10); c.fill();
    c.fillStyle = '#fff'; c.textAlign = 'left'; c.font = '800 16px Rubik, sans-serif'; c.fillText(String(score), 20, 24);
    c.font = '600 9px Rubik, sans-serif'; c.fillStyle = '#8affdc'; c.fillText(hole ? `HOLE ${hi + 1}/${HOLES.length} · PAR ${hole.par} · STROKE ${strokes}` : 'FLOOR GOLF', 20, 38);
    c.textAlign = 'center';
    if (state === 'place') { c.fillStyle = '#04110ecc'; c.beginPath(); c.roundRect(W / 2 - 130, H - 120, 260, 44, 12); c.fill(); c.fillStyle = '#fff'; c.font = '700 13px Rubik, sans-serif'; c.fillText(v.mode === 'world' ? 'Tap the floor where you want the tee' : 'Laying out the course...', W / 2, H - 98); }
    if (msg) { c.globalAlpha = Math.min(1, msg.l * 2); c.lineWidth = 4; c.strokeStyle = '#000a'; c.font = '800 24px Rubik, sans-serif'; c.strokeText(msg.txt, W / 2, H * .22); c.fillStyle = msg.col; c.fillText(msg.txt, W / 2, H * .22); if (msg.sub) { c.font = '600 11px Rubik, sans-serif'; c.fillStyle = '#fff'; c.fillText(msg.sub, W / 2, H * .22 + 20); } c.globalAlpha = 1; }
    if (state === 'play' && hole && strokes === 0 && !aim && hi === 0 && bv.lengthSq() === 0) { const b = course.localToWorld(new Vector3(bp.x, .03, bp.z)), [sx, sy] = v.toScreen(b.x, b.y, b.z); c.strokeStyle = '#ffffffc0'; c.lineWidth = 2; c.beginPath(); c.arc(sx, sy, 18 + Math.sin(t * 5) * 3, 0, 7); c.stroke(); c.fillStyle = '#fff'; c.font = '600 11px Rubik, sans-serif'; c.fillText('Touch the ball, pull back, let go', W / 2, H - 62); }
    c.restore();
    arNote(c, v, W, H);
  }
  const self = {
    reset() {
      v?.off(); v?.recenter();
      state = 'place'; hi = 0; hole = null; total = 0; score = 0; t = 0; msg = null; aim = null; tap = null; sunk = 0; cards = []; bp = new Vector3(); bv = new Vector3(); base = new Vector3(0, FLOOR, -.9);
      if (v) { course.visible = false; sparkle.clear(); if (!v.sensor) v.pitch = -.75; }
    },
    resize(w, h) { W = w; H = h; },
    update, draw,
    fx(dt) { if (v) sparkle.update(dt); },
    down(x, y, id) {
      if (v?.input?.('down', x, y, id)) return; tap = { x0: x, y0: y, x, y, id, moved: 0 };
      if (state !== 'play' || !hole || sunk > 0 || bv.lengthSq() > 0) return;
      const b = course.localToWorld(new Vector3(bp.x, .03, bp.z)), [sx, sy, sz] = v.toScreen(b.x, b.y, b.z);
      if (sz < 1 && Math.hypot(sx - x, sy - y) < 60) { const p = local(x, y); if (p) aim = { from: p, to: p.clone(), id, sx: x, sy: y, cx: x, cy: y }; }
    },
    move(x, y, pressed, id) {
      if (v?.input?.('move', x, y, id, pressed)) return; if (!tap || tap.id !== id || !pressed) return;
      const dx = x - tap.x, dy = y - tap.y; tap.moved = Math.max(tap.moved, Math.hypot(x - tap.x0, y - tap.y0)); tap.x = x; tap.y = y;
      if (aim && aim.id === id) { aim.cx = x; aim.cy = y; const p = local(x, y); if (p) aim.to = p; } else if (!v.sensor && tap.moved > 8) v.drag(dx, dy);
    },
    up(x, y, id) {
      if (v?.input?.('up', x, y, id)) return; const tp = tap; tap = null;
      if (aim && aim.id === id) { putt(); aim = null; return; }
      if (state === 'place' && tp && tp.moved < 12) placeAt(x, y);
    },
    get dbg() { const b = hole && course.localToWorld(new Vector3(bp.x, .03, bp.z)); return { state, hole: hi, strokes, score, ball: b && v.toScreen(b.x, b.y, b.z), moving: bv.length() }; },
  };
  return self;
}

export default {
  id: 'floor-golf',
  title: 'Floor Golf',
  tag: 'AR · Sports',
  retro: true, era: 'ar', pal: 'grape',
  w: 300, h: 460, maxW: 600, maxH: 680,
  goal: 600, reward: 20,
  hint: 'Mini golf on your real floor: six holes with bumpers, doglegs and a sliding gate. Touch the ball and pull back like a slingshot, then let go to putt; pull further for more power. Walk round to read the line (or drag to look around). Fewer strokes, more points.',
  traits: ['theme:sport'],
  make,
};

// Carrom: the flicking game of India's front rooms. Slide your striker along the baseline, pull back
// from it and let go to flick it into the pack. Sink your pale discs in the corner pockets (1 point
// each) or the red queen (3); a disc of yours down means another go, and a striker in the pocket is a
// foul that gives a disc back. First to 6 points wins. Nuri plays the dark discs from the far side.
// The discs slide in gs.physics (real collisions); the board stands in a 3D room or on your floor in AR.
import gs from '../gamescroll.js';
const { haptic } = gs.device;
const { Physics } = gs.physics;
const { Table, slab, disc, dot, sounds } = gs.tabletop;
const { clamp } = gs.util;

let W = 300, H = 460;
const GOAL = 6, HALF = 4, RD = .27, RS = .36, BASE = 2.95, REACH = 2.5, POCKET = 3.64, MOUTH = .5;
const POCKETS = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => ({ x: a * POCKET, z: b * POCKET }));
const WHO = [{ name: 'You', col: '#ecd9a8' }, { name: 'Nuri', col: '#4a3a34' }];
const QUEEN = 2, STRIKER = 3;
const START = () => {                                               // the queen in the middle, two rings round her
  const out = [{ kind: QUEEN, x: 0, z: 0 }], d1 = RD * 2 + .03, d2 = d1 * 2 * Math.cos(Math.PI / 6);
  for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; out.push({ kind: k % 2, x: Math.cos(a + Math.PI / 6) * d1, z: Math.sin(a + Math.PI / 6) * d1 }, { kind: 1 - k % 2, x: Math.cos(a) * d2, z: Math.sin(a) * d2 }); }
  return out;
};
// how near point p comes to the line from a to b
const off = (p, ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az, l = dx * dx + dz * dz || 1, k = clamp(((p.x - ax) * dx + (p.z - az) * dz) / l, 0, 1); return Math.hypot(p.x - ax - dx * k, p.z - az - dz * k); };

function make(api) {
  let T, phys, men, S, dots, state, turn, pts, queenBy, sunk, settled, still, age, pull, slideId, note, lastHit;

  function setup() {
    T = new Table(api, { span: 10, room: 'parlour', table: 'square', pitch: 63 });
    T.board.add(slab({ w: HALF * 2, d: HALF * 2, rim: .55, thick: .34, wood: '#4c2e1a', rough: .42, paint(g, Z) {
      const c = g.col, X = v => (v / (HALF * 2) + .5) * Z, L = v => v / (HALF * 2) * Z;
      c.fillStyle = '#e4c58c'; c.fillRect(0, 0, Z, Z);
      for (let i = 0; i < 240; i++) { c.strokeStyle = Math.random() < .6 ? '#d2ae72' : '#f0d8a6'; c.globalAlpha = .12 + Math.random() * .16; c.lineWidth = 1 + Math.random() * 2; const y = Math.random() * Z; c.beginPath(); c.moveTo(0, y); c.bezierCurveTo(Z * .3, y + 7, Z * .6, y - 7, Z, y + 3); c.stroke(); }
      c.globalAlpha = 1; c.strokeStyle = '#3a2618'; c.lineCap = 'round';
      for (let q = 0; q < 4; q++) {                                 // the four baselines, and an arrow towards each pocket
        c.save(); c.translate(Z / 2, Z / 2); c.rotate(q * Math.PI / 2); c.translate(-Z / 2, -Z / 2);
        c.lineWidth = L(.035); for (const z of [BASE - .2, BASE + .2]) { c.beginPath(); c.moveTo(X(-REACH), X(z)); c.lineTo(X(REACH), X(z)); c.stroke(); }
        for (const x of [-REACH - .12, REACH + .12]) { c.fillStyle = '#b5382e'; c.beginPath(); c.arc(X(x), X(BASE), L(.2), 0, 7); c.fill(); c.stroke(); }
        c.lineWidth = L(.03); c.beginPath(); c.moveTo(X(1.5), X(1.5)); c.lineTo(X(2.95), X(2.95)); c.stroke(); c.beginPath(); c.arc(X(1.42), X(1.42), L(.2), 0, 7); c.stroke();
        c.restore();
      }
      c.lineWidth = L(.04); c.beginPath(); c.arc(Z / 2, Z / 2, L(1.12), 0, 7); c.stroke();
      c.fillStyle = '#b5382e'; for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; c.beginPath(); c.moveTo(Z / 2 + Math.cos(a) * L(1.06), Z / 2 + Math.sin(a) * L(1.06)); c.lineTo(Z / 2 + Math.cos(a + .32) * L(.42), Z / 2 + Math.sin(a + .32) * L(.42)); c.lineTo(Z / 2 + Math.cos(a - .32) * L(.42), Z / 2 + Math.sin(a - .32) * L(.42)); c.fill(); }
      c.fillStyle = '#e4c58c'; c.beginPath(); c.arc(Z / 2, Z / 2, L(.34), 0, 7); c.fill(); c.stroke();
      for (const p of POCKETS) for (const [k, ctx] of [[0, c], [1, g.h]]) {   // the pockets: dark, and sunk into the height layer
        const gr = ctx.createRadialGradient(X(p.x), X(p.z), L(.2), X(p.x), X(p.z), L(MOUTH));
        gr.addColorStop(0, k ? '#202020' : '#0e0a08'); gr.addColorStop(.85, k ? '#2c2c2c' : '#1c1410'); gr.addColorStop(1, k ? '#808080' : '#4a3626');
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(X(p.x), X(p.z), L(MOUTH), 0, 7); ctx.fill();
      }
    } }));
    phys = new Physics({ gravity: 0, scale: 1 });
    phys.walls(-HALF, -HALF, HALF * 2, HALF * 2, { bounce: .72, friction: .05 });
    phys.onHit((a, b, speed) => { if (speed < .6 || T.t - lastHit < .04) return; lastHit = T.t; if (a.tag === 'wall' || b.tag === 'wall') sounds.thud(Math.min(.7, speed / 14)); else { sounds.clack(Math.min(1.2, .3 + speed / 9)); if (speed > 5) haptic('tick'); } });
    const body = (r, heavy) => phys.circle(0, 0, r, { bounce: .78, friction: .05, drag: .75, spinDrag: 3, density: heavy ? 1.7 : 1, bullet: true });
    men = START().map(m => { const mesh = disc(m.kind === QUEEN ? '#c2303a' : WHO[m.kind].col, { r: RD, h: .12 }); T.board.add(mesh); return { kind: m.kind, mesh, t: body(RD), out: false }; });
    S = { kind: STRIKER, mesh: disc('#3f8fd6', { r: RS, h: .13 }), t: body(RS, true), out: false }; T.board.add(S.mesh);
    dots = Array.from({ length: 7 }, (_, i) => { const d = dot('#ffffff', { r: .075 - i * .004, glow: 1.1 }); d.visible = false; T.board.add(d); return d; });
  }
  const all = () => [...men, S];
  const put = (m, x, z) => { m.out = false; m.t.place(x, z, 0); m.t.vx = 0; m.t.vy = 0; m.t.spin = 0; m.mesh.visible = true; m.mesh.scale.setScalar(1); m.mesh.position.set(x, 0, z); };
  const away = (m, i) => { m.out = true; m.t.place(40 + i * 2, 40, 0); m.t.vx = 0; m.t.vy = 0; };
  const free = (x, z, r, skip) => men.every(m => m.out || m === skip || Math.hypot(m.t.x - x, m.t.y - z) > r + RD + .02);
  function strikerTo(x, who = turn) {                              // onto who's baseline at x (or the nearest clear spot)
    const z = who ? -BASE : BASE; x = clamp(x, -REACH, REACH);
    for (let k = 0; k < 60; k++) { const tx = x + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * .09; if (Math.abs(tx) <= REACH && free(tx, z, RS)) { x = tx; break; } }
    put(S, x, z);
  }
  function aimDots(x, z, ax, az, power) { dots.forEach((d, i) => { d.visible = power > 0; const k = (i + 1) * (.3 + power * .5) + RS; d.position.set(x + ax * k, .03, z + az * k); }); }
  function sink(m, p) {
    const i = all().indexOf(m), x = m.t.x, z = m.t.y; away(m, i); if (state === 'rolling') sunk.push(m);
    sounds.thud(1); haptic('medium'); T.puff({ x: p.x, y: .1, z: p.z }, { n: 6, speed: 1, size: .3 });
    T.tween(.22, k => { m.mesh.position.set(x + (p.x - x) * k, -k * .1, z + (p.z - z) * k); m.mesh.scale.setScalar(1 - k * .55); }).then(() => { if (m.out) m.mesh.visible = false; });
  }
  const tell = quiet => { pts = [0, 1].map(w => men.filter(m => m.out && m.kind === w).length + (queenBy === w ? 3 : 0)); if (!quiet || pts[0]) api.score(pts[0]); };
  const keep = () => api.save({ m: men.map(m => (m.out ? 0 : [Math.round(m.t.x * 100), Math.round(m.t.y * 100)])), q: queenBy });

  function plan() {                                                // Nuri's shot: line a disc of hers up with a pocket, then miss by a little
    let best = null, bv = -1e9;
    for (const d of men) {
      if (d.out || d.kind === 0) continue;
      const p0 = { x: d.t.x, z: d.t.y };
      for (const pk of POCKETS) {
        const tx = pk.x - p0.x, tz = pk.z - p0.z, tl = Math.hypot(tx, tz) || 1, ux = tx / tl, uz = tz / tl, gx = p0.x - ux * (RD + RS), gz = p0.z - uz * (RD + RS);   // where the striker must be when it meets the disc
        for (let sx = -REACH; sx <= REACH; sx += .25) {
          if (!free(sx, -BASE, RS)) continue;
          const ax = gx - sx, az = gz + BASE, al = Math.hypot(ax, az); if (al < .4) continue;
          const cut = (ax * ux + az * uz) / al; if (cut < .5) continue;
          let v = cut * 3 - tl * .22 - al * .1 + (d.kind === QUEEN ? .5 : 0);
          for (const o of men) { if (o === d || o.out) continue; const q = { x: o.t.x, z: o.t.y }; if (off(q, sx, -BASE, gx, gz) < RD + RS) v -= 3; if (off(q, p0.x, p0.z, pk.x, pk.z) < RD * 2) v -= 2; }
          if (v > bv) { bv = v; best = { sx, ax: ax / al, az: az / al, power: clamp(.34 + (al + tl) * .075, .45, 1) }; }
        }
      }
    }
    if (!best) { const d = men.find(m => !m.out && m.kind !== 0), ax = d.t.x, az = d.t.y + BASE, al = Math.hypot(ax, az) || 1; best = { sx: 0, ax: ax / al, az: az / al, power: .7 }; }
    const wob = (Math.random() - .5) * .075, c = Math.cos(wob), s = Math.sin(wob);
    return { sx: best.sx, ax: best.ax * c - best.az * s, az: best.ax * s + best.az * c, power: best.power };
  }
  async function shot(who, ax, az, power) {                        // flick, wait for everything to stop, then count up; true if `who` goes again
    state = 'rolling'; sunk = []; still = 0; age = 0; note = '';
    const v = 5 + power * 20; S.t.vx = ax * v; S.t.vy = az * v; sounds.clack(1.1); haptic('medium');
    await T.until(new Promise(res => { settled = res; }));
    const foul = sunk.includes(S), queen = sunk.find(m => m.kind === QUEEN);
    if (queen) queenBy = who;
    let again = !foul && sunk.some(m => m.kind === who || m.kind === QUEEN);
    if (foul) {                                                    // the striker went down: one of the shooter's discs comes back to the middle
      const back = men.find(m => m.out && m.kind === who); note = (who ? 'Nuri' : 'You') + ' sank the striker: a disc comes back';
      if (back) { let x = 0, z = 0; for (let k = 0; k < 40 && !free(x, z, RD, back); k++) { const a = k * 2.4; x = Math.cos(a) * .12 * k; z = Math.sin(a) * .12 * k; } put(back, x, z); await T.drop(back.mesh, { from: 2 }); }
      sounds.thud(1.2); haptic('warning');
    } else if (queen) { note = (who ? 'Nuri takes' : 'You take') + ' the queen: 3 points'; sounds.chime(); }
    tell();
    if (pts[0] >= GOAL || pts[1] >= GOAL) {
      state = 'done'; const won = pts[0] >= GOAL && (pts[1] < GOAL || who === 0); note = won ? 'You win!' : 'Nuri wins';
      if (won) { sounds.gong(); haptic('success'); api.win(); } else sounds.thud(1.4);
      await T.wait(1.7); api.clearSave(); T.stop(); api.over(); return false;
    }
    await T.wait(foul || queen ? 1.1 : .35);
    return again;
  }
  async function play(ax, az, power) {                             // your flick, then Nuri's, until it's your go again
    let who = 0;
    for (;;) {
      const again = await shot(who, ax, az, power); if (state === 'done') return;
      if (!again) who = 1 - who; else if (!note) note = who ? 'Nuri goes again' : 'One down: go again';
      turn = who; strikerTo(0, who);
      if (who === 0) { state = 'aim'; keep(); return; }
      state = 'think'; await T.wait(.8);
      const p = plan(); strikerTo(p.sx, 1); note = '';
      aimDots(S.t.x, S.t.y, p.ax, p.az, p.power); await T.wait(.55); aimDots(0, 0, 0, 0, 0);
      ({ ax, az, power } = p);
    }
  }

  return {
    reset() {
      if (!T) setup();
      T.reset();
      const v = api.load(null), ok = v && Array.isArray(v.m) && v.m.length === men.length && v.m.some(p => p) && v.m.every(p => p === 0 || (Array.isArray(p) && p.length === 2 && p.every(n => Math.abs(n) <= HALF * 100)));
      const at = START(); queenBy = ok && (v.q === 0 || v.q === 1) ? v.q : -1;
      men.forEach((m, i) => { const p = ok ? v.m[i] : null; if (ok && !p) { away(m, i); m.mesh.visible = false; } else put(m, ok ? p[0] / 100 : at[i].x, ok ? p[1] / 100 : at[i].z); });
      if (ok && queenBy < 0 && men[0].out) queenBy = 0;
      turn = 0; state = 'aim'; sunk = []; settled = null; pull = null; slideId = null; note = ''; lastHit = 0;
      strikerTo(0, 0); aimDots(0, 0, 0, 0, 0); tell(true);
    },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      if (!T.update(dt)) return;
      phys.step(dt);
      for (const m of all()) {
        if (m.out) continue;
        const sp = m.t.speed; if (sp > 0) { const k = Math.max(0, sp - 2.4 * dt) / sp; m.t.vx *= k; m.t.vy *= k; }   // the board's rub: a sliding disc stops dead, it doesn't creep
        m.mesh.position.x = m.t.x; m.mesh.position.z = m.t.y; m.mesh.rotation.y = -m.t.angle;
        if (state === 'rolling') for (const p of POCKETS) if (Math.hypot(m.t.x - p.x, m.t.y - p.z) < MOUTH - .04) { sink(m, p); break; }
      }
      if (state === 'rolling') {
        age += dt; still = all().some(m => !m.out && m.t.speed > .06) ? 0 : still + dt;
        if (still > .3 || age > 9) { for (const m of all()) if (!m.out) { m.t.vx = 0; m.t.vy = 0; } const r = settled; settled = null; r?.(); }
      }
    },
    draw(c) {
      T.draw(c, W, H);
      const y = T.strip(c, W, WHO.map((w, i) => ({ name: w.name, col: w.col, score: pts[i] })), state === 'done' ? -1 : turn);
      T.status(c, W, y, note || (state === 'aim' ? (pull ? 'Let go to flick' : 'Pull back from the blue striker') : state === 'think' ? 'Nuri lines up a shot…' : ''));
      T.hud(c, W, H);
    },
    down(x, y, id) {
      if (T.down(x, y, id) || state !== 'aim' || T.busy || T.hidden || pull || slideId != null) return;
      const p = T.pick(x, y); if (!p) return;
      const [sx, sy] = T.toScreen({ x: S.t.x, y: .1, z: S.t.y });
      if (Math.hypot(sx - x, sy - y) < 30 || Math.hypot(p.x - S.t.x, p.z - S.t.y) < RS * 1.5) { pull = { id, ax: 0, az: -1, power: 0 }; T.claim(id); haptic('light'); note = ''; }
      else if (p.z > BASE - .9 && p.z < HALF + .8 && Math.abs(p.x) < HALF) { slideId = id; T.claim(id); strikerTo(p.x, 0); sounds.tick(); note = ''; }
    },
    move(x, y, pressed, id) {
      if (T.move(x, y, pressed, id) || !pressed) return;
      const p = T.pick(x, y); if (!p) return;
      if (pull && pull.id === id) {
        const dx = S.t.x - p.x, dz = S.t.y - p.z, l = Math.hypot(dx, dz), was = pull.power;
        pull.power = clamp((l - .25) / 2.3, 0, 1); if (l > .05) { pull.ax = dx / l; pull.az = dz / l; }
        if (Math.floor(pull.power * 8) !== Math.floor(was * 8)) haptic('tick');
        aimDots(S.t.x, S.t.y, pull.ax, pull.az, pull.power);
      } else if (slideId === id) strikerTo(p.x, 0);
    },
    up(x, y, id) {
      T.up(x, y, id);
      if (slideId === id) slideId = null;
      if (!pull || pull.id !== id) return;
      const { ax, az, power } = pull; pull = null; aimDots(0, 0, 0, 0, 0);
      if (power > .06 && state === 'aim') T.run(() => play(ax, az, power));
    },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'carrom',
  title: 'Carrom',
  tag: 'Board · Flick',
  retro: true, era: 'board', pal: 'grape', music: { mood: 'happy', vol: .5 },
  w: 300, h: 460, maxW: 600, maxH: 680,
  goal: GOAL,
  hint: 'Pull back from the blue striker and let go to flick it (drag along your line to move it first). Sink your pale discs for a point each or the red queen for 3; first to 6 wins, and don’t sink the striker. Tap AR to play on your floor.',
  creator: 'Game Scroll',
  make,
};

import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { haptic } = gs.device;
const { clamp, rnd } = gs.util;

// A sweet hangs on one or two ropes. Swipe across a rope to cut it, timing the cut so the sweet
// flies into the jar. Every level is checked to have a winning cut before you see it. Three drops and you're out.
const W = 360, H = 640, G = 1400, STEP = 1 / 120, CR = 14;

// Fixed-step pendulum on inextensible ropes (position-based). Used for play and for the solver.
function stepSim(s) {
  const vx = (s.x - s.px) * .999, vy = (s.y - s.py) * .999;
  s.px = s.x; s.py = s.y; s.x += vx; s.y += vy + G * STEP * STEP;
  for (let it = 0; it < 4; it++) for (const r of s.ropes) {
    if (r.cut) continue; const dx = s.x - r.ax, dy = s.y - r.ay, d = Math.hypot(dx, dy);
    if (d > r.len) { s.x = r.ax + dx / d * r.len; s.y = r.ay + dy / d * r.len; }
  }
}
const inJar = (s, j) => s.y - s.py > 0 && s.py < j.y && s.y >= j.y && Math.abs(s.x - j.x) < j.w / 2 - CR * .4;
const lost = s => s.y > H + 40 || s.x < -60 || s.x > W + 60;

function make(api) {
  let sim, jar, level, lives, t, acc, swipe, state, wait, msg, cuts;
  // Can this level be won? Try cutting rope A (and then B) at every moment of the first few seconds.
  function solvable(base) {
    const order = base.ropes.length === 1 ? [[0]] : [[0, 1], [1, 0]];
    for (const ord of order) {
      for (let c1 = 0; c1 < 360; c1 += 3) {
        const s = clone(base); let n = 0, cut2 = -1;
        for (let i = 0; i < 900; i++) {
          if (i === 0 && ord.length === 2) s.ropes[ord[0]].cut = true;
          if (i === c1) { s.ropes[ord[ord.length - 1]].cut = true; cut2 = i; }
          stepSim(s); n++;
          if (cut2 >= 0 && inJar(s, base.jar)) return true;
          if (lost(s)) break;
        }
      }
    }
    return false;
  }
  const clone = b => ({ x: b.x, y: b.y, px: b.px, py: b.py, ropes: b.ropes.map(r => ({ ...r })) });
  function build() {
    for (let tries = 0; tries < 60; tries++) {
      const two = level >= 2 && Math.random() < .55;
      let s;
      if (!two) {
        const ax = rnd(110, 250), ay = rnd(110, 170), len = rnd(110, 190), a0 = rnd(.6, 1.1) * (Math.random() < .5 ? -1 : 1);
        const x = ax + Math.sin(a0) * len, y = ay + Math.cos(a0) * len; s = { x, y, px: x, py: y, ropes: [{ ax, ay, len }] };
      } else {
        const a1 = { ax: rnd(40, 140), ay: rnd(100, 160) }, a2 = { ax: rnd(220, 320), ay: rnd(100, 160) }, x = rnd(140, 220), y = rnd(250, 320);
        s = { x, y, px: x, py: y, ropes: [{ ...a1, len: Math.hypot(x - a1.ax, y - a1.ay) }, { ...a2, len: Math.hypot(x - a2.ax, y - a2.ay) }] };
        for (let i = 0; i < 240; i++) { stepSim(s); s.px += (s.x - s.px) * .2; s.py += (s.y - s.py) * .2; }   // settle
        s.px = s.x; s.py = s.y;
      }
      const jw = Math.max(64, 96 - level * 3);
      s.jar = { x: rnd(jw / 2 + 10, W - jw / 2 - 10), y: rnd(430, 560), w: jw };
      if (Math.abs(s.jar.x - s.x) < 30 && s.ropes.length === 1) continue;   // too easy: just drop it
      if (solvable(s)) return s;
    }
    const x = 180, y = 300; return { x, y, px: x - 3, py: y, ropes: [{ ax: 180, ay: 150, len: 150 }], jar: { x: 180, y: 520, w: 90 } };
  }
  function start() { sim = build(); jar = sim.jar; state = 'play'; acc = 0; cuts = 0; }
  return {
    reset() { level = 0; lives = 3; t = 0; swipe = null; msg = null; wait = 0; start(); },
    update(dt) {
      t += dt; if (msg) msg.l -= dt;
      if (state === 'wait') { wait -= dt; if (wait <= 0) { if (lives <= 0) return api.over(); start(); } return; }
      acc += dt; while (acc >= STEP) {
        acc -= STEP; stepSim(sim);
        if (cuts && inJar(sim, jar)) { level++; api.score(level); state = 'wait'; wait = .9; msg = { txt: 'SWEET!', l: 1, good: true }; haptic('success'); sfx(880, .2, 'triangle', .06, 300); return; }
        if (lost(sim)) { lives--; state = 'wait'; wait = .7; msg = { txt: lives ? 'DROPPED' : 'OUT OF SWEETS', l: 1 }; haptic('error'); sfx(160, .3, 'triangle', .05, -60); return; }
      }
    },
    draw(c) {
      const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#ffd9ec'); g.addColorStop(1, '#ffb3d1'); c.fillStyle = g; c.fillRect(0, 0, W, H);
      c.fillStyle = '#ffffff40'; for (let i = 0; i < 10; i++) c.fillRect(0, i * 64, W, 32);
      // jar
      const j = jar; c.fillStyle = '#ffffff70'; c.beginPath(); c.roundRect(j.x - j.w / 2, j.y, j.w, 70, [4, 4, 18, 18]); c.fill();
      c.strokeStyle = '#ffffffdd'; c.lineWidth = 4; c.beginPath(); c.moveTo(j.x - j.w / 2, j.y - 6); c.lineTo(j.x - j.w / 2, j.y + 52); c.quadraticCurveTo(j.x - j.w / 2, j.y + 70, j.x - j.w / 2 + 18, j.y + 70); c.lineTo(j.x + j.w / 2 - 18, j.y + 70); c.quadraticCurveTo(j.x + j.w / 2, j.y + 70, j.x + j.w / 2, j.y + 52); c.lineTo(j.x + j.w / 2, j.y - 6); c.stroke();
      c.fillStyle = '#c0567f'; c.font = '400 9px "Press Start 2P", monospace'; c.textAlign = 'center'; c.fillText('JAR', j.x, j.y + 42);
      for (const r of sim.ropes) {
        c.fillStyle = '#8a4a6a'; c.beginPath(); c.arc(r.ax, r.ay, 7, 0, 7); c.fill();
        if (r.cut) continue;
        c.strokeStyle = '#8a5a3a'; c.lineWidth = 3; c.setLineDash([6, 3]); c.beginPath(); c.moveTo(r.ax, r.ay); c.lineTo(sim.x, sim.y); c.stroke(); c.setLineDash([]);
      }
      // sweet
      c.save(); c.translate(sim.x, sim.y); c.rotate((sim.x - sim.px) * .2);
      c.fillStyle = '#ff4f8b'; c.beginPath(); c.moveTo(-CR, 0); c.lineTo(-CR - 10, -8); c.lineTo(-CR - 10, 8); c.fill(); c.beginPath(); c.moveTo(CR, 0); c.lineTo(CR + 10, -8); c.lineTo(CR + 10, 8); c.fill();
      c.fillStyle = '#ff7aa8'; c.beginPath(); c.arc(0, 0, CR, 0, 7); c.fill(); c.strokeStyle = '#fff'; c.lineWidth = 3; c.beginPath(); c.arc(0, 0, CR - 5, .5, 2.5); c.stroke();
      c.restore();
      if (swipe && swipe.pts.length > 1) { c.strokeStyle = '#ffffffcc'; c.lineWidth = 4; c.lineCap = 'round'; c.beginPath(); swipe.pts.slice(-8).forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)); c.stroke(); c.lineCap = 'butt'; }
      c.font = '400 9px "Press Start 2P", monospace'; c.textAlign = 'left'; c.fillStyle = '#c0567f'; c.fillText('SWEETS', 12, 20);
      for (let i = 0; i < 3; i++) { c.fillStyle = i < lives ? '#ff4f8b' : '#ffffff80'; c.beginPath(); c.arc(18 + i * 16, 34, 6, 0, 7); c.fill(); }
      if (level === 0 && t < 5) { c.fillStyle = '#a0406a'; c.font = '600 14px Rubik, sans-serif'; c.textAlign = 'center'; c.fillText('swipe across the rope to cut it', W / 2, H - 20); }
      if (msg && msg.l > 0) { c.globalAlpha = clamp(msg.l * 2, 0, 1); c.fillStyle = msg.good ? '#ffffff' : '#a0406a'; c.font = '400 16px "Press Start 2P", monospace'; c.textAlign = 'center'; c.fillText(msg.txt, W / 2, 80); c.globalAlpha = 1; }
    },
    down(x, y) { swipe = { pts: [{ x, y }] }; },
    move(x, y) {
      if (!swipe || state !== 'play') return; const a = swipe.pts[swipe.pts.length - 1]; swipe.pts.push({ x, y });
      for (const r of sim.ropes) {
        if (r.cut) continue;
        if (segX(a.x, a.y, x, y, r.ax, r.ay, sim.x, sim.y)) { r.cut = true; cuts++; haptic('medium'); sfx(1200, .05, 'sawtooth', .03, -800); }
      }
    },
    up() { swipe = null; },
    key(k, d) { if (d && k === ' ') { const r = sim.ropes.find(q => !q.cut); if (r) { r.cut = true; cuts++; } } },
  };
}
function segX(ax, ay, bx, by, cx, cy, dx, dy) {
  const d = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx); if (!d) return false;
  const u = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / d, v = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / d;
  return u >= 0 && u <= 1 && v >= 0 && v <= 1;
}

export default {
  id: 'candy-swing', title: 'Candy Swing', tag: 'Casual · Physics', retro: false, w: W, h: H, goal: 6,
  hint: 'Swipe across a rope to cut it. Time the cut so the sweet swings and flies into the jar. Every level has a winning cut.',
  make,
};

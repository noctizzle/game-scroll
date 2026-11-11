import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { PAL } = gs.palettes;
const { haptic } = gs.device;
const { Feel } = gs.effects; const { Ready } = gs.rounds;

// Grow the worm by eating seeds without biting yourself.
function make(api, p) {
  const R = PAL[p.pal], N = p.grid, S = 160 / N;
  const feel = new Feel({ pixel: true, sound: false, buzz: false });   // the game has its own sounds and buzzes
  const ready = new Ready({ eat: false });                              // the worm waits for the first swipe or tap
  let sn, dir, q, foods, acc, step, score, pd, t, dead, rocks;
  function die() { haptic('error'); sfx(120, .4, 'square', .05, -40); feel.juice.shake(4).burst((sn[0].x + .5) * S, (sn[0].y + .5) * S, { n: 10, speed: 60, life: .5, size: 2, color: [R[0], R[1]] }); return api.over(); }
  const taken = (x, y) => sn.some(s => s.x === x && s.y === y) || rocks.some(r => r.x === x && r.y === y) || foods.some(f => f.x === x && f.y === y);
  function freeCell() { let c; do { c = { x: Math.random() * N | 0, y: Math.random() * N | 0 }; } while (taken(c.x, c.y)); return c; }
  function turn(dx, dy) { const l = q.length ? q[q.length - 1] : dir; if ((l.x === -dx && l.y === -dy) || (l.x === dx && l.y === dy)) return; if (q.length < 3) q.push({ x: dx, y: dy }); }
  return {
    reset() {
      const m = N >> 1; sn = [{ x: 3, y: m }, { x: 2, y: m }, { x: 1, y: m }]; dir = { x: 1, y: 0 }; q = []; acc = 0; step = p.step; score = 0; pd = null; t = 0; dead = 0; rocks = []; foods = []; feel.clear(); ready.reset();
      for (let i = 0; i < p.rocks; i++) { const c = freeCell(); if (c.y !== m) rocks.push(c); }
      for (let i = 0; i < p.seeds; i++) foods.push(freeCell());
    },
    update(dt) {
      feel.update(dt); t += dt; if (!ready.update(dt)) return;
      acc += dt;
      while (acc >= step) {
        acc -= step; if (q.length) dir = q.shift();
        let h = { x: sn[0].x + dir.x, y: sn[0].y + dir.y };
        if (p.wrap) h = { x: (h.x + N) % N, y: (h.y + N) % N };
        else if (h.x < 0 || h.y < 0 || h.x >= N || h.y >= N) return die();
        if (sn.slice(0, -1).some(s => s.x === h.x && s.y === h.y) || rocks.some(r => r.x === h.x && r.y === h.y)) return die();
        sn.unshift(h);
        const fi = foods.findIndex(f => f.x === h.x && f.y === h.y);
        if (fi >= 0) { score++; api.score(score); sfx(880, .06); haptic('light'); feel.juice.burst((h.x + .5) * S, (h.y + .5) * S, { n: 6, speed: 50, life: .3, size: 2, color: [R[0], R[1]] }); step = Math.max(p.stepMin, step - .005); foods.splice(fi, 1); foods.push(freeCell()); }
        else sn.pop();
      }
    },
    fx(dt) { dead += dt; t += dt; feel.update(dt); },
    draw(c) {
      c.fillStyle = R[3]; c.fillRect(0, 0, 160, 160);
      feel.begin(c); this.world(c); feel.end(c, 160, 160);
      ready.draw(c, 160, 160, { pixel: true, color: R[0], y: 50, text: 'SWIPE TO START' });
    },
    world(c) {
      c.fillStyle = R[2]; for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if ((x + y) % 2 === 0) c.fillRect(x * S + S / 2 - 1, y * S + S / 2 - 1, 2, 2);
      if (!p.wrap) { c.fillStyle = R[1]; c.fillRect(0, 0, 160, 1); c.fillRect(0, 159, 160, 1); c.fillRect(0, 0, 1, 160); c.fillRect(159, 0, 1, 160); }
      for (const r of rocks) { c.fillStyle = R[1]; c.fillRect(r.x * S, r.y * S, S, S); c.fillStyle = R[0]; c.fillRect(r.x * S + 2, r.y * S + 2, S - 4, S - 4); }
      if ((t * 4 | 0) % 2 === 0 || dead) { c.fillStyle = R[0]; const a = S * .3, b = S * .8; for (const f of foods) { c.fillRect(f.x * S + (S - a) / 2, f.y * S + (S - b) / 2, a, b); c.fillRect(f.x * S + (S - b) / 2, f.y * S + (S - a) / 2, b, a); } }
      if (dead && (dead * 10 | 0) % 2) return;
      sn.forEach((s, i) => {
        c.fillStyle = i === 0 ? R[0] : R[1]; c.fillRect(s.x * S + 1, s.y * S + 1, S - 2, S - 2);
        const n = sn[i + 1];
        if (n && Math.abs(s.x - n.x) + Math.abs(s.y - n.y) === 1) c.fillRect(Math.min(s.x, n.x) * S + 1 + (s.x !== n.x ? S - 2 : 0), Math.min(s.y, n.y) * S + 1 + (s.y !== n.y ? S - 2 : 0), s.x !== n.x ? 2 : S - 2, s.y !== n.y ? 2 : S - 2);
      });
      const h = sn[0], e = Math.max(1, S / 5 | 0); c.fillStyle = R[3];
      if (dir.x) { c.fillRect(h.x * S + S / 2 - e / 2 + dir.x * e, h.y * S + S * .25, e, e); c.fillRect(h.x * S + S / 2 - e / 2 + dir.x * e, h.y * S + S * .6, e, e); }
      else { c.fillRect(h.x * S + S * .25, h.y * S + S / 2 - e / 2 + dir.y * e, e, e); c.fillRect(h.x * S + S * .6, h.y * S + S / 2 - e / 2 + dir.y * e, e, e); }
    },
    down(x, y) { ready.go(); pd = { x, y, moved: false }; },
    move(x, y) { if (!pd) return; const dx = x - pd.x, dy = y - pd.y; if (Math.max(Math.abs(dx), Math.abs(dy)) > 7) { Math.abs(dx) > Math.abs(dy) ? turn(Math.sign(dx), 0) : turn(0, Math.sign(dy)); pd = { x, y, moved: true }; } },
    up(x, y) { if (pd && !pd.moved) { const last = q.length ? q[q.length - 1] : dir, hx = (sn[0].x + .5) * S, hy = (sn[0].y + .5) * S; if (last.x) turn(0, y < hy ? -1 : 1); else turn(x < hx ? -1 : 1, 0); } pd = null; },
    key(k, d) { if (!d) return; ready.go(); const m = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[k]; if (m) turn(...m); },
  };
}

const base = { pal: 'ice', grid: 16, step: .16, stepMin: .075, wrap: false, seeds: 1, rocks: 0 };

export default {
  id: 'worm', title: 'Pixel Worm', tag: 'Pocket · Classic', retro: true, w: 160, h: 160,
  hint: 'Swipe or tap beside the head to turn. Eat seeds, not yourself.',
  pal: base.pal,
  goal: 15,
  make: api => make(api, base),
};

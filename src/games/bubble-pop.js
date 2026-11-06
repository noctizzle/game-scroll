import { clamp } from '../util.js';
import { sfx } from '../sfx.js';
import { haptic } from '../kit/device.js';

// Aim and fire bubbles into the cluster. Three or more of a colour pop, and anything left hanging drops too.
const W = 360, H = 640, R = 18, D = R * 2, COLS_N = 9, ROW_H = D * .866, TOPY = 70, SX = W / 2, SY = H - 70, LIMIT = 15;
const COLS = ['#ff5d73', '#ffb020', '#3ddc97', '#5aa8ff', '#b28cff'];

function make(api) {
  let grid, shot, cur, nxt, aim, aiming, score, shots, t, falls, dead, ncol;
  const ox = r => (r % 2 ? R * 2 : R) + (W - COLS_N * D - R) / 2;
  const pos = (r, c) => ({ x: ox(r) + c * D, y: TOPY + R + r * ROW_H });
  const key = (r, c) => r * 20 + c;
  const nbrs = (r, c) => { const o = r % 2 ? [[0, -1], [0, 1], [-1, 0], [-1, 1], [1, 0], [1, 1]] : [[0, -1], [0, 1], [-1, -1], [-1, 0], [1, -1], [1, 0]]; return o.map(([dr, dc]) => [r + dr, c + dc]).filter(([a, b]) => a >= 0 && b >= 0 && b < COLS_N - (a % 2)); };
  const randCol = () => { const present = [...new Set([...grid.values()])]; return present.length ? present[Math.random() * present.length | 0] : Math.random() * ncol | 0; };
  function addRowTop() { const g = new Map(); for (const [k, v] of grid) { const r = k / 20 | 0, c = k % 20; g.set(key(r + 2, c), v); } grid = g; for (let r = 0; r < 2; r++) for (let c = 0; c < COLS_N - (r % 2); c++) grid.set(key(r, c), Math.random() * ncol | 0); }
  return {
    reset() { grid = new Map(); ncol = 4; for (let r = 0; r < 5; r++) for (let c = 0; c < COLS_N - (r % 2); c++) grid.set(key(r, c), Math.random() * ncol | 0); cur = randCol(); nxt = randCol(); shot = null; aim = -Math.PI / 2; aiming = false; score = 0; shots = 0; t = 0; falls = []; dead = 0; },
    update(dt) {
      t += dt;
      for (const f of falls) { f.vy += 1400 * dt; f.y += f.vy * dt; f.x += f.vx * dt; } falls = falls.filter(f => f.y < H + 40);
      if (!shot) return;
      for (let s = 0; s < 6; s++) {
        shot.x += shot.vx * dt / 6; shot.y += shot.vy * dt / 6;
        if (shot.x < R) { shot.x = R; shot.vx = -shot.vx; } if (shot.x > W - R) { shot.x = W - R; shot.vx = -shot.vx; }
        let stick = shot.y < TOPY + R;
        if (!stick) for (const k of grid.keys()) { const p = pos(k / 20 | 0, k % 20); if (Math.hypot(p.x - shot.x, p.y - shot.y) < D - 4) { stick = true; break; } }
        if (stick) { this.place(); return; }
      }
    },
    place() {
      let best = null, bd = 1e9;
      for (let r = 0; r < LIMIT + 2; r++) for (let c = 0; c < COLS_N - (r % 2); c++) { if (grid.has(key(r, c))) continue; const p = pos(r, c), d = Math.hypot(p.x - shot.x, p.y - shot.y); if (d < bd) { bd = d; best = [r, c]; } }
      const [r, c] = best; grid.set(key(r, c), shot.col); shot = null; shots++;
      const same = new Set([key(r, c)]), st = [[r, c]];
      while (st.length) { const [a, b] = st.pop(); for (const [x, y] of nbrs(a, b)) { const k = key(x, y); if (!same.has(k) && grid.get(k) === grid.get(key(r, c))) { same.add(k); st.push([x, y]); } } }
      if (same.size >= 3) {
        for (const k of same) { const p = pos(k / 20 | 0, k % 20); falls.push({ ...p, vx: (Math.random() - .5) * 120, vy: -200, col: grid.get(k) }); grid.delete(k); }
        const keep = new Set(), q = [...grid.keys()].filter(k => (k / 20 | 0) === 0); q.forEach(k => keep.add(k));
        while (q.length) { const k = q.pop(); for (const [x, y] of nbrs(k / 20 | 0, k % 20)) { const kk = key(x, y); if (grid.has(kk) && !keep.has(kk)) { keep.add(kk); q.push(kk); } } }
        let drop = 0; for (const k of [...grid.keys()]) if (!keep.has(k)) { const p = pos(k / 20 | 0, k % 20); falls.push({ ...p, vx: 0, vy: 0, col: grid.get(k) }); grid.delete(k); drop++; }
        score += same.size * 10 + drop * 20; api.score(score); haptic(drop ? 'medium' : 'light'); sfx(600 + same.size * 40, .12, 'triangle', .05, 200);
      } else sfx(320, .05, 'triangle', .03);
      if (!grid.size) { score += 200; api.score(score); ncol = Math.min(COLS.length, ncol + 1); for (let r = 0; r < 5; r++) for (let c = 0; c < COLS_N - (r % 2); c++) grid.set(key(r, c), Math.random() * ncol | 0); haptic('success'); }
      if (shots % 6 === 0) addRowTop();
      cur = nxt; nxt = randCol();
      if ([...grid.keys()].some(k => (k / 20 | 0) >= LIMIT - 1)) { haptic('error'); sfx(140, .5, 'sawtooth', .05, -60); api.over(); }
    },
    fx(dt) { dead += dt; for (const f of falls) { f.vy += 1400 * dt; f.y += f.vy * dt; } },
    draw(c) {
      c.fillStyle = '#1b1530'; c.fillRect(0, 0, W, H);
      const lim = TOPY + (LIMIT - 1) * ROW_H; c.strokeStyle = '#ff5d7355'; c.setLineDash([6, 6]); c.beginPath(); c.moveTo(0, lim); c.lineTo(W, lim); c.stroke(); c.setLineDash([]);
      const bub = (x, y, col) => { c.fillStyle = COLS[col]; c.beginPath(); c.arc(x, y, R - 1, 0, 7); c.fill(); c.fillStyle = '#ffffff55'; c.beginPath(); c.arc(x - 6, y - 6, 5, 0, 7); c.fill(); };
      for (const [k, v] of grid) { const p = pos(k / 20 | 0, k % 20); bub(p.x, p.y, v); }
      for (const f of falls) bub(f.x, f.y, f.col);
      if (aiming && !shot) { c.strokeStyle = '#ffffff55'; c.setLineDash([4, 8]); c.lineWidth = 2; c.beginPath(); let x = SX, y = SY, vx = Math.cos(aim), vy = Math.sin(aim); c.moveTo(x, y);
        for (let i = 0; i < 60 && y > TOPY; i++) { x += vx * 10; y += vy * 10; if (x < R || x > W - R) { vx = -vx; c.lineTo(x, y); } } c.lineTo(x, y); c.stroke(); c.setLineDash([]); }
      if (shot) bub(shot.x, shot.y, shot.col); else bub(SX, SY, cur);
      bub(SX + 60, SY + 22, nxt); c.fillStyle = '#ffffff66'; c.font = '600 11px Rubik, sans-serif'; c.textAlign = 'center'; c.fillText('next', SX + 60, SY + 54);
      c.fillText(`new row in ${6 - shots % 6}`, 60, SY + 22);
    },
    down(x, y) { aiming = true; this.move(x, y); },
    move(x, y) { if (!aiming) return; aim = clamp(Math.atan2(y - SY, x - SX), -Math.PI + .15, -.15); },
    up() { if (!aiming) return; aiming = false; if (shot || dead) return; shot = { x: SX, y: SY, vx: Math.cos(aim) * 900, vy: Math.sin(aim) * 900, col: cur }; sfx(700, .04, 'triangle', .03, -200); },
    key(k, d) { if (!d) return; if (k === 'ArrowLeft') aim = clamp(aim - .08, -Math.PI + .15, -.15); if (k === 'ArrowRight') aim = clamp(aim + .08, -Math.PI + .15, -.15); if (k === ' ') { aiming = true; this.up(); } },
  };
}

export default {
  id: 'bubble-pop', title: 'Bubble Pop', tag: 'Casual · Shooter', retro: false, w: W, h: H, goal: 300,
  hint: 'Drag to aim, let go to fire. Match three of a colour to pop them. Bounce shots off the walls.',
  make,
};

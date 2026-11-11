import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { haptic } = gs.device;
const { Feel } = gs.effects;

// Drag the three offered blocks onto the 8x8 board. Fill a whole row or column to clear it. Ends when nothing fits.
const W = 360, H = 640, N = 8, CS = 40, OX = (W - N * CS) / 2, OY = 120, TRAY = 520;
const SHAPES = [[[0, 0]], [[0, 0], [1, 0]], [[0, 0], [0, 1]], [[0, 0], [1, 0], [2, 0]], [[0, 0], [0, 1], [0, 2]], [[0, 0], [1, 0], [0, 1], [1, 1]],
  [[0, 0], [1, 0], [2, 0], [3, 0]], [[0, 0], [0, 1], [0, 2], [0, 3]], [[0, 0], [0, 1], [1, 1]], [[1, 0], [0, 1], [1, 1]], [[0, 0], [1, 0], [1, 1]], [[0, 0], [1, 0], [0, 1]],
  [[0, 0], [0, 1], [0, 2], [1, 2]], [[0, 0], [1, 0], [2, 0], [1, 1]], [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1], [0, 2], [1, 2], [2, 2]], [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2]]];
const HUES = [350, 30, 50, 140, 190, 220, 265, 310];

function make(api) {
  const feel = new Feel({ sound: false, buzz: false });   // the game has its own sounds and buzzes
  let grid, tray, drag, score, combo, clears, t, dead;
  const fits = (sh, gx, gy) => sh.every(([x, y]) => { const cx = gx + x, cy = gy + y; return cx >= 0 && cy >= 0 && cx < N && cy < N && !grid[cy * N + cx]; });
  const anyFit = sh => { for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (fits(sh, x, y)) return true; return false; };
  function deal() { tray = [0, 1, 2].map(i => ({ sh: SHAPES[Math.random() * SHAPES.length | 0], hue: HUES[Math.random() * HUES.length | 0], slot: i })); }
  const slotPos = i => ({ x: 60 + i * 120, y: TRAY + 40 });
  const dims = sh => ({ w: Math.max(...sh.map(p => p[0])) + 1, h: Math.max(...sh.map(p => p[1])) + 1 });
  function cell(c, x, y, s, hue, a = 1) { c.globalAlpha = a; c.fillStyle = `hsl(${hue} 75% 58%)`; c.beginPath(); c.roundRect(x + 1, y + 1, s - 2, s - 2, 6); c.fill(); c.fillStyle = `hsl(${hue} 85% 72%)`; c.fillRect(x + 5, y + 4, s - 10, 4); c.globalAlpha = 1; }
  function target() { if (!drag) return null; const d = dims(drag.p.sh); const gx = Math.round((drag.x - d.w * CS / 2 - OX) / CS), gy = Math.round((drag.y - 70 - d.h * CS / 2 - OY) / CS); return fits(drag.p.sh, gx, gy) ? { gx, gy } : null; }
  return {
    reset() { grid = Array(N * N).fill(0); score = 0; combo = 0; clears = []; t = 0; drag = null; dead = 0; feel.clear(); deal(); },
    update(dt) { feel.update(dt); t += dt; for (const k of clears) k.life -= dt; clears = clears.filter(k => k.life > 0); },
    fx(dt) { dead += dt; this.update(dt); },
    draw(c) {
      c.fillStyle = '#141b2d'; c.fillRect(0, 0, W, H);
      feel.begin(c);
      c.fillStyle = '#0d1220'; c.beginPath(); c.roundRect(OX - 8, OY - 8, N * CS + 16, N * CS + 16, 12); c.fill();
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const v = grid[y * N + x]; if (v) cell(c, OX + x * CS, OY + y * CS, CS, v); else { c.fillStyle = '#ffffff08'; c.fillRect(OX + x * CS + 2, OY + y * CS + 2, CS - 4, CS - 4); } }
      const tg = target(); if (tg) for (const [x, y] of drag.p.sh) cell(c, OX + (tg.gx + x) * CS, OY + (tg.gy + y) * CS, CS, drag.p.hue, .35);
      for (const k of clears) { c.fillStyle = `rgba(255,255,255,${k.life * 2})`; if (k.row != null) c.fillRect(OX, OY + k.row * CS, N * CS, CS); else c.fillRect(OX + k.col * CS, OY, CS, N * CS); }
      for (const p of tray) { if (drag && drag.p === p) continue; const d = dims(p.sh), s = 22, { x, y } = slotPos(p.slot), ok = anyFit(p.sh); for (const [px, py] of p.sh) cell(c, x - d.w * s / 2 + px * s, y - d.h * s / 2 + py * s, s, p.hue, ok ? 1 : .3); }
      if (drag) { const d = dims(drag.p.sh); for (const [px, py] of drag.p.sh) cell(c, drag.x - d.w * CS / 2 + px * CS, drag.y - 70 - d.h * CS / 2 + py * CS, CS, drag.p.hue, .9); }
      feel.end(c, W, H);
      if (combo > 1) { c.fillStyle = '#ffd34a'; c.font = '400 12px "Press Start 2P", monospace'; c.textAlign = 'center'; c.fillText(`COMBO ×${combo}`, W / 2, 96); }
    },
    down(x, y) { if (y < TRAY - 20) return; let best = null, bd = 1e9; for (const p of tray) { const s = slotPos(p.slot), d = Math.abs(s.x - x); if (d < bd) { bd = d; best = p; } } if (best && bd < 60) { drag = { p: best, x, y }; haptic('tick'); } },
    move(x, y) { if (drag) { drag.x = x; drag.y = y; } },
    up() {
      if (!drag) return; const tg = target(), p = drag.p; drag = null; if (!tg) return;
      for (const [x, y] of p.sh) grid[(tg.gy + y) * N + tg.gx + x] = p.hue; score += p.sh.length; tray = tray.filter(q => q !== p);
      const rows = [], cols = []; for (let i = 0; i < N; i++) { let r = true, cl = true; for (let j = 0; j < N; j++) { if (!grid[i * N + j]) r = false; if (!grid[j * N + i]) cl = false; } if (r) rows.push(i); if (cl) cols.push(i); }
      for (const r of rows) for (let j = 0; j < N; j++) grid[r * N + j] = 0; for (const cl of cols) for (let j = 0; j < N; j++) grid[j * N + cl] = 0;
      const n = rows.length + cols.length;
      for (const r of rows) for (let j = 0; j < N; j++) feel.juice.burst(OX + (j + .5) * CS, OY + (r + .5) * CS, { n: 3, speed: 110, life: .45, size: 4, color: [`hsl(${p.hue} 85% 72%)`, '#ffffff'], shape: 'square', gravity: 260 });
      for (const cl of cols) for (let j = 0; j < N; j++) feel.juice.burst(OX + (cl + .5) * CS, OY + (j + .5) * CS, { n: 3, speed: 110, life: .45, size: 4, color: [`hsl(${p.hue} 85% 72%)`, '#ffffff'], shape: 'square', gravity: 260 });
      if (n) { feel.juice.shake(2 + n * 2).pop(OX + (tg.gx + 1) * CS, OY + tg.gy * CS, `+${n * 10 * n * (combo + 1)}`, { color: '#ffd34a', size: 18 + n * 3 });
        combo++; score += n * 10 * n * combo; rows.forEach(r => clears.push({ row: r, life: .35 })); cols.forEach(cl => clears.push({ col: cl, life: .35 })); haptic(n > 1 ? 'medium' : 'light'); sfx(520 + n * 120, .15, 'triangle', .05, 200); }
      else { combo = 0; sfx(300, .05, 'triangle', .03); }
      api.score(score);
      if (!tray.length) deal();
      if (!tray.some(q => anyFit(q.sh))) { feel.juice.shake(7); haptic('error'); sfx(140, .5, 'sawtooth', .05, -60); api.over(); }
    },
  };
}

export default {
  id: 'block-fit', title: 'Block Fit', tag: 'Casual · Block puzzle', retro: false, w: W, h: H, goal: 150,
  hint: 'Drag blocks onto the board. Fill a row or column to clear it. Clear several in a row for combos.',
  make,
};

import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { haptic } = gs.device;
const { PAL } = gs.palettes;

// Falling two-tone capsules: line up four of the same shade (germs count) to wipe them out. Clear every germ to go up a level.
// Swipe left/right to move, tap to rotate, swipe down to drop.
const R = PAL.moss, W = 160, H = 160, GC = 8, GR = 16, CS = 8, OX = 48, OY = 22;

function make(api) {
  let grid, cap, fallT, level, score, t, pd, dead, nextPid, clearing;
  const idx = (x, y) => y * GC + x, get = (x, y) => (x < 0 || x >= GC || y >= GR) ? { wall: 1 } : y < 0 ? null : grid[idx(x, y)];
  function cells(k) { const [dx, dy] = [[1, 0], [0, -1], [-1, 0], [0, 1]][k.rot]; return [{ x: k.x, y: k.y, c: k.c[0] }, { x: k.x + dx, y: k.y + dy, c: k.c[1] }]; }
  const free = k => cells(k).every(p => !get(p.x, p.y));
  function spawn() { cap = { x: 3, y: 0, rot: 0, c: [Math.random() * 3 | 0, Math.random() * 3 | 0] }; if (!free(cap)) { haptic('error'); sfx(140, .5, 'sawtooth', .05, -60); api.over(); } }
  function setup() { grid = Array(GC * GR).fill(null); const n = Math.min(40, 4 + level * 4); let placed = 0; while (placed < n) { const x = Math.random() * GC | 0, y = 6 + (Math.random() * (GR - 6) | 0); if (!grid[idx(x, y)]) { grid[idx(x, y)] = { c: placed % 3, germ: true }; placed++; } } spawn(); }
  function lock() {
    const pid = ++nextPid; for (const p of cells(cap)) grid[idx(p.x, p.y)] = { c: p.c, pid }; cap = null; sfx(260, .04, 'square', .03); resolve();
  }
  function resolve() {
    let total = 0;
    for (;;) {
      const kill = new Set();
      for (let y = 0; y < GR; y++) for (let x = 0; x < GC; x++) for (const [dx, dy] of [[1, 0], [0, 1]]) {
        const a = grid[idx(x, y)]; if (!a) continue; let n = 1; while (true) { const b = get(x + dx * n, y + dy * n); if (!b || b.wall || b.c !== a.c) break; n++; }
        if (n >= 4) for (let i = 0; i < n; i++) kill.add(idx(x + dx * i, y + dy * i));
      }
      if (!kill.size) break;
      let germs = 0; for (const k of kill) { if (grid[k].germ) germs++; grid[k] = null; } total += germs;
      score += germs * 100 + kill.size * 5; api.score(score); haptic(germs ? 'medium' : 'light'); sfx(500 + germs * 120, .12, 'square', .04, 300);
      let moved = true; while (moved) { moved = false;   // let unsupported halves fall (keeping horizontal pairs together)
        for (let y = GR - 2; y >= 0; y--) for (let x = 0; x < GC; x++) { const a = grid[idx(x, y)]; if (!a || a.germ) continue;
          const mate = a.pid && [[1, 0], [-1, 0]].map(([dx]) => [x + dx, y]).find(([mx, my]) => grid[idx(mx, my)]?.pid === a.pid && mx >= 0 && mx < GC);
          if (mate) { const [mx] = mate; if (mx < x) continue; if (!grid[idx(x, y + 1)] && !grid[idx(mx, y + 1)]) { grid[idx(x, y + 1)] = a; grid[idx(mx, y + 1)] = grid[idx(mx, y)]; grid[idx(x, y)] = grid[idx(mx, y)] = null; moved = true; } }
          else if (!grid[idx(x, y + 1)]) { grid[idx(x, y + 1)] = a; grid[idx(x, y)] = null; moved = true; } } }
    }
    if (!grid.some(v => v && v.germ)) { level++; score += 500; api.score(score); haptic('success'); sfx(880, .3, 'square', .05, 400); setup(); return; }
    spawn();
  }
  function tryMove(dx, dy, rot) { if (!cap) return false; const n = { ...cap, x: cap.x + dx, y: cap.y + dy, rot: rot ?? cap.rot }; if (free(n)) { cap = n; return true; } return false; }
  return {
    reset() { level = 1; score = 0; t = 0; pd = null; dead = 0; nextPid = 0; fallT = 0; setup(); },
    update(dt) { t += dt; fallT += dt; const sp = Math.max(.18, .7 - level * .05); if (fallT >= sp) { fallT = 0; if (!tryMove(0, 1)) lock(); } },
    fx(dt) { dead += dt; },
    draw(c) {
      c.fillStyle = R[3]; c.fillRect(0, 0, W, H);
      c.fillStyle = R[1]; c.fillRect(OX - 3, OY - 3, GC * CS + 6, GR * CS + 6); c.fillStyle = R[3]; c.fillRect(OX - 1, OY - 1, GC * CS + 2, GR * CS + 2);
      c.fillStyle = R[1]; c.fillRect(OX + 22, OY - 8, 20, 6);
      const block = (x, y, col, germ) => { const X = OX + x * CS, Y = OY + y * CS;
        if (col === 0) { c.fillStyle = R[0]; c.fillRect(X + 1, Y + 1, 6, 6); }
        else if (col === 1) { c.fillStyle = R[1]; c.fillRect(X + 1, Y + 1, 6, 6); c.fillStyle = R[0]; c.fillRect(X + 3, Y + 3, 2, 2); }
        else { c.fillStyle = R[0]; c.fillRect(X + 1, Y + 1, 6, 6); c.fillStyle = R[2]; c.fillRect(X + 2, Y + 2, 4, 4); }
        if (germ) { c.fillStyle = R[3]; c.fillRect(X + 2, Y + 2, 1, 2); c.fillRect(X + 5, Y + 2, 1, 2); if ((t * 3 | 0) % 2) { c.fillStyle = col === 0 ? R[1] : R[0]; c.fillRect(X, Y + 7, 2, 1); c.fillRect(X + 6, Y + 7, 2, 1); } } };
      for (let y = 0; y < GR; y++) for (let x = 0; x < GC; x++) { const v = grid[idx(x, y)]; if (v) block(x, y, v.c, v.germ); }
      if (cap && (!dead || (dead * 10 | 0) % 2)) for (const p of cells(cap)) if (p.y >= 0) block(p.x, p.y, p.c, false);
      c.fillStyle = R[0]; c.font = '6px "Press Start 2P", monospace'; c.textAlign = 'left'; c.fillText(`LV${level}`, 4, 30);
      c.fillText('GERMS', 4, 50); c.fillText(String(grid.filter(v => v && v.germ).length), 4, 60);
      c.textAlign = 'right'; c.fillText('TAP', W - 4, 30); c.fillText('SPIN', W - 4, 38);
    },
    down(x, y) { pd = { x, y, moved: false }; },
    move(x, y, p) { if (!p || !pd) return; const dx = x - pd.x, dy = y - pd.y; if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) { tryMove(Math.sign(dx), 0); pd = { x, y, moved: true }; } else if (dy > 20) { while (tryMove(0, 1)); fallT = 99; pd = { x, y, moved: true }; } },
    up() { if (pd && !pd.moved && cap) { const r = (cap.rot + 1) % 4; if (!tryMove(0, 0, r)) tryMove(-1, 0, r); sfx(600, .03, 'square', .02); } pd = null; },
    key(k, d) { if (!d) return; if (k === 'ArrowLeft') tryMove(-1, 0); if (k === 'ArrowRight') tryMove(1, 0); if (k === 'ArrowDown') tryMove(0, 1); if (k === 'ArrowUp' || k === ' ') { const r = (cap.rot + 1) % 4; tryMove(0, 0, r); } },
  };
}

export default {
  id: 'germ-buster', title: 'Germ Buster', tag: 'Pocket · Puzzle', retro: true, w: W, h: H, pal: 'moss', goal: 400,
  hint: 'Swipe to move the capsule, tap to spin it, swipe down to drop. Four of a shade in a line clears them.',
  make,
};

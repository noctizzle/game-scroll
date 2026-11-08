import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { haptic } = gs.device;
const { PAL } = gs.palettes;

// Flood the board from the top-left corner: pick a shade and your area swallows every touching tile of it.
// Fill the whole board within the move limit.
const R = PAL.mint, W = 160, H = 160, N = 10, CS = 12, OX = 20, OY = 16, K = 4;

function make(api) {
  let g, moves, limit, score, t, dead, win, boards;
  function region(grid) { const c = grid[0], seen = new Set([0]), st = [0]; while (st.length) { const k = st.pop(), x = k % N, y = k / N | 0; for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) { if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue; const kk = ny * N + nx; if (!seen.has(kk) && grid[kk] === c) { seen.add(kk); st.push(kk); } } } return seen; }
  function apply(grid, col) { const r = region(grid), out = grid.slice(); for (const k of r) out[k] = col; return out; }
  function greedy(grid) { let n = 0; while (region(grid).size < N * N && n < 60) { let best = null, bs = -1; for (let col = 0; col < K; col++) { if (col === grid[0]) continue; const s = region(apply(grid, col)).size; if (s > bs) { bs = s; best = col; } } grid = apply(grid, best); n++; } return n; }
  function build() { g = Array.from({ length: N * N }, () => Math.random() * K | 0); limit = greedy(g.slice()) + Math.max(0, 3 - (boards >> 1)); moves = 0; win = 0; }
  const tile = (c, X, Y, col, s = CS) => { c.fillStyle = R[col]; c.fillRect(X, Y, s, s); if (col === 3) { c.fillStyle = R[2]; c.fillRect(X, Y, s, 1); c.fillRect(X, Y, 1, s); } if (col === 1) { c.fillStyle = R[2]; c.fillRect(X + s / 2 - 1, Y + s / 2 - 1, 2, 2); } };
  return {
    reset() { score = 0; boards = 0; t = 0; dead = 0; build(); },
    update(dt) { t += dt; if (win) { win += dt; if (win > .6) { boards++; build(); } } },
    fx(dt) { dead += dt; },
    draw(c) {
      c.fillStyle = R[3]; c.fillRect(0, 0, W, H); const mine = region(g);
      for (let i = 0; i < N * N; i++) tile(c, OX + (i % N) * CS, OY + (i / N | 0) * CS, g[i]);
      if ((t * 3 | 0) % 2) { c.strokeStyle = R[0]; c.lineWidth = 1; c.strokeRect(OX - .5, OY - .5, CS + 1, CS + 1); }
      for (let col = 0; col < K; col++) { const X = 20 + col * 32, Y = 140; c.fillStyle = R[0]; c.fillRect(X - 1, Y - 1, 26, 16); tile(c, X, Y, col, 24); c.fillRect(X, Y, 24, 0); if (col === g[0]) { c.fillStyle = R[0]; c.fillRect(X + 10, Y - 5, 4, 3); } }
      c.fillStyle = R[0]; c.font = '6px "Press Start 2P", monospace'; c.textAlign = 'left'; c.fillText(`${moves}/${limit}`, 4, 10); c.textAlign = 'right'; c.fillText(`${mine.size}%`, W - 4, 10);
    },
    down(x, y) {
      if (win || y < 136) return; const col = Math.floor((x - 20) / 32); if (col < 0 || col >= K || col === g[0]) return;
      const before = region(g).size; g = apply(g, col); moves++; const after = region(g).size; score += after - before; api.score(score); haptic(after - before > 8 ? 'light' : 'tick'); sfx(300 + after * 4, .05, 'square', .03);
      if (after === N * N) { win = .001; score += (limit - moves) * 20 + 50; api.score(score); haptic('success'); sfx(880, .3, 'square', .05, 300); }
      else if (moves >= limit) { haptic('error'); sfx(150, .5, 'sawtooth', .05, -60); api.over(); }
    },
    key(k, d) { if (d && '1234'.includes(k)) this.down(20 + (+k - 1) * 32 + 4, 145); },
  };
}

export default {
  id: 'colour-flood', title: 'Colour Flood', tag: 'Pocket · Puzzle', retro: true, w: W, h: H, pal: 'mint', goal: 250,
  hint: 'Tap a shade at the bottom. Your area in the top-left takes every touching tile of it. Fill the board in time.',
  make,
};

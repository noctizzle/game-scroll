import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { haptic } = gs.device;
const { PAL } = gs.palettes;

// A daily switch puzzle generated from your neighbourhood: everyone within a few kilometres gets the same boards today.
// Tapping a lamp flips it and its four neighbours. Turn every lamp off. Solve as many boards as you can in 90 seconds.
const R = PAL.amber, W = 160, H = 160, N = 5, CS = 25, OX = (W - N * CS) / 2, OY = 20;

function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; }; }
function seedFor(loc, n) {
  const d = new Date(), day = d.getFullYear() * 400 + d.getMonth() * 32 + d.getDate();
  const cell = loc ? Math.round(loc.lat / .05) * 7919 + Math.round(loc.lon / .05) * 104729 : 0;
  return (day * 2654435761 + cell * 40503 + n * 97) >>> 0;
}

function make(api) {
  let grid, board, moves, time, score, t, area, state, dead, flash;
  function build() {
    const r = rng(seedFor(area, board)); grid = Array(N * N).fill(0);
    const presses = 4 + Math.min(10, board * 2);
    for (let i = 0; i < presses; i++) flip(r() * N | 0, r() * N | 0);
    if (grid.every(v => !v)) flip(2, 2);
    moves = 0;
  }
  function flip(x, y) { for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < N && ny < N) grid[ny * N + nx] ^= 1; } }
  return {
    reset() { time = 90; score = 0; t = 0; board = 0; dead = 0; flash = 0; state = area === undefined ? 'locating' : 'play'; grid = Array(N * N).fill(0); if (state === 'play') build(); },
    update(dt) {
      t += dt; flash = Math.max(0, flash - dt);
      if (state === 'locating') {
        if (!this._asked) { this._asked = true; Promise.race([api.location(), new Promise(r => setTimeout(() => r(null), 5000))]).then(l => { area = l && l.real ? l : null; state = 'play'; build(); }); }
        return;
      }
      time -= dt; if (time <= 0) { time = 0; haptic('warning'); return api.over(); }
    },
    fx(dt) { dead += dt; },
    draw(c) {
      c.fillStyle = R[3]; c.fillRect(0, 0, W, H);
      c.fillStyle = R[0]; c.font = '6px "Press Start 2P", monospace'; c.textAlign = 'center';
      if (state === 'locating') { c.fillText('FINDING YOUR AREA', W / 2, 76); c.fillText('.'.repeat(1 + (t * 3 | 0) % 3), W / 2, 90); return; }
      c.textAlign = 'left'; c.fillText(area ? 'LOCAL' : 'TODAY', 4, 10); c.textAlign = 'right'; c.fillText(`B${board + 1}`, W - 4, 10); c.textAlign = 'center';
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const on = grid[y * N + x], px = OX + x * CS, py = OY + y * CS;
        c.fillStyle = R[1]; c.fillRect(px + 12, py + 14, 2, 10);
        c.fillStyle = on ? R[0] : R[2]; c.fillRect(px + 6, py + 4, 14, 10);
        if (on) { c.fillStyle = R[3]; c.fillRect(px + 9, py + 7, 3, 3); c.fillStyle = R[2]; c.fillRect(px + 3, py + 2, 2, 2); c.fillRect(px + 21, py + 2, 2, 2); }
      }
      c.fillStyle = R[1]; c.fillRect(OX, 155, N * CS, 3); c.fillStyle = R[0]; c.fillRect(OX, 155, N * CS * time / 90, 3);
      c.fillStyle = R[1]; c.fillText(`MOVES ${moves}`, W / 2, 152);
      if (flash > 0) { c.fillStyle = R[0]; c.globalAlpha = flash; c.fillRect(0, 0, W, H); c.globalAlpha = 1; }
    },
    down(x, y) {
      if (state !== 'play') return;
      const cx = Math.floor((x - OX) / CS), cy = Math.floor((y - OY) / CS); if (cx < 0 || cy < 0 || cx >= N || cy >= N) return;
      flip(cx, cy); moves++; haptic('tick'); sfx(grid[cy * N + cx] ? 520 : 330, .05, 'square', .03);
      if (grid.every(v => !v)) { score++; api.score(score); board++; flash = .5; time += 10; haptic('success'); sfx(784, .3, 'square', .05, 400); build(); }
    },
  };
}

export default {
  id: 'street-lamps', title: 'Street Lamps', tag: 'Pocket · Puzzle · Local', retro: true, w: W, h: H, pal: 'amber', goal: 1, location: 'coarse',
  hint: 'Tap a lamp to flip it and its neighbours. Switch them all off. Boards are shared with everyone near you today.',
  make,
};

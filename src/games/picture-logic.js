import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { haptic } = gs.device;
const { PAL } = gs.palettes;
const { Feel } = gs.effects;

// Picture logic: the numbers say how many filled squares run in a row or column, in order. Fill the grid to match.
const R = PAL.mono, W = 160, H = 160, N = 5, CS = 18, OX = 58, OY = 54;

function make(api) {
  const feel = new Feel({ pixel: true, sound: false, buzz: false });   // the game has its own sounds and buzzes
  let sol, fill, rowC, colC, time, score, t, dead, flash, size, started;
  const runs = a => { const out = []; let n = 0; for (const v of a) { if (v) n++; else if (n) { out.push(n); n = 0; } } if (n) out.push(n); return out.length ? out : [0]; };
  function newPuzzle() {
    do { sol = Array.from({ length: N * N }, () => Math.random() < .58 ? 1 : 0); } while (sol.every(v => v) || sol.filter(v => v).length < 8);
    fill = Array(N * N).fill(0);
    rowC = [...Array(N)].map((_, y) => runs(sol.slice(y * N, y * N + N)));
    colC = [...Array(N)].map((_, x) => runs([...Array(N)].map((_, y) => sol[y * N + x])));
  }
  const ok = () => [...Array(N)].every((_, y) => runs(fill.slice(y * N, y * N + N)).join() === rowC[y].join()) && [...Array(N)].every((_, x) => runs([...Array(N)].map((_, y) => fill[y * N + x])).join() === colC[x].join());
  return {
    reset() { time = 75; score = 0; t = 0; dead = 0; flash = 0; started = false; feel.clear(); newPuzzle(); },
    update(dt) { feel.update(dt); t += dt; flash = Math.max(0, flash - dt); if (started) time -= dt;   // the clock waits for the first square
      if (time <= 0) { haptic('warning'); feel.juice.shake(4); return api.over(); } },
    fx(dt) { dead += dt; feel.update(dt); },
    draw(c) {
      c.fillStyle = R[3]; c.fillRect(0, 0, W, H);
      feel.begin(c);
      c.font = '6px "Press Start 2P", monospace'; c.fillStyle = R[0];
      c.textAlign = 'right'; rowC.forEach((r, y) => c.fillText(r.join(' '), OX - 4, OY + y * CS + 12));
      c.textAlign = 'center'; colC.forEach((col, x) => col.forEach((v, i) => c.fillText(String(v), OX + x * CS + CS / 2, OY - 4 - (col.length - 1 - i) * 8)));
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const X = OX + x * CS, Y = OY + y * CS; c.fillStyle = R[1]; c.fillRect(X, Y, CS, CS); c.fillStyle = R[3]; c.fillRect(X + 1, Y + 1, CS - 2, CS - 2);
        if (fill[y * N + x]) { c.fillStyle = R[0]; c.fillRect(X + 2, Y + 2, CS - 4, CS - 4); }
      }
      c.fillStyle = R[0]; c.fillRect(OX + 2 * CS + CS - 1, OY, 1, N * CS); c.fillRect(OX, OY + 2 * CS + CS - 1, N * CS, 1);
      feel.end(c, W, H);
      c.fillStyle = R[1]; c.fillRect(8, 150, 144, 3); c.fillStyle = time < 10 && (t * 4 | 0) % 2 ? R[1] : R[0]; c.fillRect(8, 150, 144 * Math.min(1, time / 75), 3);
      c.textAlign = 'left'; c.fillStyle = R[1]; c.fillText(`#${score + 1}`, 4, 10);
      if (flash > 0) { c.globalAlpha = flash; c.fillStyle = R[0]; c.fillRect(OX, OY, N * CS, N * CS); c.globalAlpha = 1; }
    },
    down(x, y) {
      const cx = Math.floor((x - OX) / CS), cy = Math.floor((y - OY) / CS); if (cx < 0 || cy < 0 || cx >= N || cy >= N) return;
      fill[cy * N + cx] ^= 1; started = true; haptic('tick'); sfx(fill[cy * N + cx] ? 500 : 300, .03, 'square', .02);
      if (ok()) { score++; api.score(score); time += 20; flash = .5; haptic('success'); sfx(880, .25, 'square', .05, 300); feel.juice.burst(OX + N * CS / 2, OY + N * CS / 2, { n: 18, speed: 70, life: .55, size: 2, color: [R[0], R[1]] }).pop(OX + N * CS / 2, OY - 14, '+20S', { color: R[0], size: 6 }); newPuzzle(); }
    },
  };
}

export default {
  id: 'picture-logic', title: 'Picture Logic', tag: 'Pocket · Logic', retro: true, w: W, h: H, pal: 'mono', goal: 2,
  hint: 'Each number is a run of filled squares in that row or column. Tap squares to fill them until every clue fits.',
  make,
};

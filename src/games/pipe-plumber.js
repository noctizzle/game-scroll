import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { haptic } = gs.device;
const { PAL } = gs.palettes;
const { Feel } = gs.effects;
const { Ready } = gs.rounds;

// Tap pipes to turn them so the water reaches the drain. The water starts flowing when the countdown hits zero.
const R = PAL.ice, W = 160, H = 160, N = 6, CS = 22, OX = 14, OY = 20, Nb = 1, E = 2, S = 4, Wb = 8;
const rot = m => ((m << 1) | (m >> 3)) & 15, opp = d => ({ 1: 4, 2: 8, 4: 1, 8: 2 })[d], step = { 1: [0, -1], 2: [1, 0], 4: [0, 1], 8: [-1, 0] };

function make(api) {
  const feel = new Feel({ pixel: true, sound: false, buzz: false });   // the game has its own sounds and buzzes
  const ready = new Ready({ eat: false });                             // the countdown starts at the first tap
  let g, src, drn, wait, flow, level, score, t, dead, filled;
  function build() {
    src = Math.random() * N | 0; drn = Math.random() * N | 0; g = Array(N * N).fill(0);
    let x = 0, y = src, from = Wb; const path = [];
    while (true) {
      let to; if (x === N - 1 && y === drn) to = E;
      else { const opts = []; if (x < N - 1) opts.push(E, E); if (y > 0 && !path.some(p => p.x === x && p.y === y - 1)) opts.push(Nb); if (y < N - 1 && !path.some(p => p.x === x && p.y === y + 1)) opts.push(S); if (x === N - 1) { opts.length = 0; opts.push(y < drn ? S : Nb); } to = opts[Math.random() * opts.length | 0]; }
      path.push({ x, y }); g[y * N + x] = from | to; if (to === E && x === N - 1) break;
      const [dx, dy] = step[to]; x += dx; y += dy; from = opp(to);
    }
    for (let i = 0; i < N * N; i++) { if (!g[i]) g[i] = [Nb | S, Nb | E, Nb | E, 15][Math.random() * 4 | 0]; const turns = Math.random() * 4 | 0; for (let k = 0; k < turns; k++) g[i] = rot(g[i]); }
    wait = Math.max(6, 14 - level); flow = { x: 0, y: src, from: Wb, k: 0 }; filled = new Map();
  }
  return {
    reset() { level = 1; score = 0; t = 0; dead = 0; feel.clear(); ready.reset(); build(); },
    update(dt) {
      feel.update(dt); if (!ready.update(dt)) return;
      t += dt; if (wait > 0) { wait -= dt; return; }
      flow.k += dt / Math.max(.35, .75 - level * .04);
      if (flow.k < 1) return;
      const m = g[flow.y * N + flow.x];
      if (!(m & flow.from)) { haptic('error'); sfx(150, .5, 'sawtooth', .05, -60); spill(); return api.over(); }
      const out = m === 15 ? opp(flow.from) : (m & ~flow.from);
      filled.set(flow.y * N + flow.x, (filled.get(flow.y * N + flow.x) || 0) | flow.from | out); score++; api.score(score); sfx(300 + score * 8, .04, 'triangle', .03);
      if (flow.x === N - 1 && flow.y === drn && out === E) { level++; score += 10; api.score(score); haptic('success'); sfx(880, .3, 'square', .05, 400); feel.juice.pop(W - 30, OY + drn * CS + 4, '+10', { color: R[0], size: 6 }); build(); return; }
      const [dx, dy] = step[out], nx = flow.x + dx, ny = flow.y + dy;
      if (nx < 0 || ny < 0 || nx >= N || ny >= N) { haptic('error'); sfx(150, .5, 'sawtooth', .05, -60); spill(); return api.over(); }
      flow = { x: nx, y: ny, from: opp(out), k: 0 };
    },
    fx(dt) { dead += dt; feel.update(dt); },
    draw(c) {
      c.fillStyle = R[3]; c.fillRect(0, 0, W, H);
      feel.begin(c);
      const pipe = (X, Y, m, col, w) => { c.fillStyle = col; const h = CS / 2, o = (CS - w) / 2; if (m & Nb) c.fillRect(X + o, Y, w, h + w / 2); if (m & S) c.fillRect(X + o, Y + h - w / 2, w, h + w / 2); if (m & Wb) c.fillRect(X, Y + o, h + w / 2, w); if (m & E) c.fillRect(X + h - w / 2, Y + o, h + w / 2, w); };
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const X = OX + x * CS, Y = OY + y * CS, i = y * N + x; c.fillStyle = R[2]; c.fillRect(X + 1, Y + 1, CS - 2, CS - 2);
        pipe(X, Y, g[i], R[0], 8); pipe(X, Y, g[i], R[3], 4); if (filled.has(i)) pipe(X, Y, filled.get(i), R[1], 4);
      }
      if (wait <= 0 && !dead) { const X = OX + flow.x * CS + CS / 2, Y = OY + flow.y * CS + CS / 2, [dx, dy] = step[flow.from]; c.fillStyle = R[1]; c.fillRect(X + dx * CS / 2 * (1 - flow.k) - 2, Y + dy * CS / 2 * (1 - flow.k) - 2, 4, 4); }
      c.fillStyle = R[0]; c.fillRect(0, OY + src * CS + 6, OX, 10); c.fillRect(OX + N * CS, OY + drn * CS + 6, W - OX - N * CS, 10);
      c.fillStyle = R[1]; c.fillRect(2, OY + src * CS + 9, OX - 2, 4);
      feel.end(c, W, H);
      c.fillStyle = R[0]; c.font = '6px "Press Start 2P", monospace'; c.textAlign = 'left'; c.fillText(wait > 0 ? `FLOW ${Math.ceil(wait)}` : 'FLOWING', 4, 10);   // short, so it stays clear of the score in the middle c.textAlign = 'right'; c.fillText(`LV${level}`, W - 4, 10);
    },
    down(x, y) {
      ready.go();
      const cx = Math.floor((x - OX) / CS), cy = Math.floor((y - OY) / CS); if (cx < 0 || cy < 0 || cx >= N || cy >= N) return;
      const i = cy * N + cx; if (filled.has(i) || (wait <= 0 && flow.x === cx && flow.y === cy)) return;
      g[i] = rot(g[i]); haptic('tick'); sfx(600, .03, 'square', .02);
    },
    key(k, d) { if (d && k === ' ') { ready.go(); wait = 0; } },
  };
  function spill() { feel.juice.shake(5).burst(OX + flow.x * CS + CS / 2, OY + flow.y * CS + CS / 2, { n: 12, speed: 50, life: .5, size: 2, color: [R[1], R[0]], gravity: 100 }); }
}

export default {
  id: 'pipe-plumber', title: 'Pipe Plumber', tag: 'Pocket · Puzzle', retro: true, w: W, h: H, pal: 'ice', goal: 15,
  hint: 'Tap pipes to rotate them and build a path from the inlet to the drain before the water arrives.',
  make,
};

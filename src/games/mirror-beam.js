import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { haptic } = gs.device;
const { PAL } = gs.palettes;

// Tap mirrors to flip them and bounce the laser into the receiver.
const R = PAL.rose, W = 160, H = 160, N = 7, CS = 18, OX = (W - N * CS) / 2 + 4, OY = 20;
const DIRS = { E: [1, 0], W: [-1, 0], N: [0, -1], S: [0, 1] };
const BOUNCE = { '/': { E: 'N', N: 'E', W: 'S', S: 'W' }, '\\': { E: 'S', S: 'E', W: 'N', N: 'W' } };

function make(api) {
  let m, srcRow, target, beam, hit, time, score, t, dead, win;
  function build() {
    for (;;) {
      m = new Map(); srcRow = Math.random() * N | 0; let x = 0, y = srcRow, d = 'E'; const seen = new Set(); let turns = 0, len = 0, ok = true;
      while (len < 30) {
        seen.add(y * N + x); len++;
        const want = Math.min(6, 2 + (score >> 1));
        if (len > 2 && turns >= want && Math.random() < .4) break;
        if (Math.random() < .45 && len > 1) { const opts = d === 'E' || d === 'W' ? ['N', 'S'] : ['E', 'W']; const nd = opts[Math.random() * 2 | 0]; const mir = Object.keys(BOUNCE).find(k => BOUNCE[k][d] === nd); m.set(y * N + x, mir); d = nd; turns++; }
        const nx = x + DIRS[d][0], ny = y + DIRS[d][1]; if (nx < 0 || ny < 0 || nx >= N || ny >= N || seen.has(ny * N + nx)) { ok = false; break; } x = nx; y = ny;
      }
      if (!ok || turns < 2 || m.has(y * N + x)) continue;
      target = { x, y };
      for (const k of m.keys()) if (Math.random() < .65) m.set(k, m.get(k) === '/' ? '\\' : '/');
      for (let i = 0; i < 4; i++) { const k = Math.random() * N * N | 0; if (!m.has(k) && !seen.has(k)) m.set(k, Math.random() < .5 ? '/' : '\\'); }
      trace(); if (hit) continue; win = 0; return;
    }
  }
  function trace() {
    beam = [[OX - 6, OY + srcRow * CS + CS / 2]]; hit = false; let x = 0, y = srcRow, d = 'E';
    for (let i = 0; i < 80; i++) {
      if (x < 0 || y < 0 || x >= N || y >= N) { beam.push([OX + x * CS + CS / 2 - DIRS[d][0] * CS / 2, OY + y * CS + CS / 2 - DIRS[d][1] * CS / 2]); return; }
      beam.push([OX + x * CS + CS / 2, OY + y * CS + CS / 2]);
      if (x === target.x && y === target.y) { hit = true; return; }
      const mir = m.get(y * N + x); if (mir) d = BOUNCE[mir][d];
      x += DIRS[d][0]; y += DIRS[d][1];
    }
  }
  return {
    reset() { time = 60; score = 0; t = 0; dead = 0; build(); },
    update(dt) { t += dt; time -= dt; if (time <= 0) { haptic('warning'); return api.over(); } if (win) { win += dt; if (win > .6) { score++; api.score(score); time += 12; build(); } } },
    fx(dt) { dead += dt; },
    draw(c) {
      c.fillStyle = R[0]; c.fillRect(0, 0, W, H);
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { c.fillStyle = R[1]; c.fillRect(OX + x * CS + 8, OY + y * CS + 8, 2, 2); }
      c.fillStyle = R[2]; c.fillRect(OX - 12, OY + srcRow * CS + 4, 8, 10);
      const TX = OX + target.x * CS, TY = OY + target.y * CS; c.strokeStyle = hit ? R[3] : R[2]; c.lineWidth = 2; c.strokeRect(TX + 3, TY + 3, CS - 6, CS - 6); c.fillStyle = hit && (t * 10 | 0) % 2 ? R[3] : R[1]; c.fillRect(TX + 7, TY + 7, 4, 4);
      c.strokeStyle = R[3]; c.lineWidth = (t * 12 | 0) % 2 ? 2 : 1; c.beginPath(); beam.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.stroke();
      c.lineWidth = 3; c.strokeStyle = R[2]; for (const [k, v] of m) { const X = OX + (k % N) * CS, Y = OY + (k / N | 0) * CS; c.beginPath(); if (v === '/') { c.moveTo(X + 3, Y + CS - 3); c.lineTo(X + CS - 3, Y + 3); } else { c.moveTo(X + 3, Y + 3); c.lineTo(X + CS - 3, Y + CS - 3); } c.stroke(); }
      c.fillStyle = R[3]; c.font = '6px "Press Start 2P", monospace'; c.textAlign = 'left'; c.fillText(`${Math.ceil(time)}s`, 4, 10);
    },
    down(x, y) {
      if (win) return; const cx = Math.floor((x - OX) / CS), cy = Math.floor((y - OY) / CS), k = cy * N + cx; if (cx < 0 || cy < 0 || cx >= N || cy >= N || !m.has(k)) return;
      m.set(k, m.get(k) === '/' ? '\\' : '/'); haptic('tick'); sfx(700, .03, 'square', .02); trace();
      if (hit) { win = .001; haptic('success'); sfx(990, .3, 'square', .05, 300); }
    },
  };
}

export default {
  id: 'mirror-beam', title: 'Mirror Beam', tag: 'Pocket · Puzzle', retro: true, w: W, h: H, pal: 'rose', goal: 3,
  hint: 'Tap a mirror to flip it. Bounce the laser from the emitter on the left into the receiver.',
  make,
};

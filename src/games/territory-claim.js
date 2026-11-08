import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { haptic } = gs.device;
const { PAL } = gs.palettes;

// Fence off the field. Drag to move; leaving claimed ground draws a line. Get back to claimed ground to fill the area
// the spark is NOT in. If the spark touches your line, you're out. Claim 75% to clear the level.
const R = PAL.rose, W = 160, H = 160, S = 2, GW = 76, GH = 70, OX = 4, OY = 16, TARGET = .75;

function make(api) {
  let g, px, py, dir, drawing, sparks, level, claimed, score, t, dead, moveT, held;
  const at = (x, y) => (x < 0 || y < 0 || x >= GW || y >= GH) ? 1 : g[y * GW + x];
  function newLevel() {
    g = new Uint8Array(GW * GH);
    for (let x = 0; x < GW; x++) { g[x] = 1; g[(GH - 1) * GW + x] = 1; } for (let y = 0; y < GH; y++) { g[y * GW] = 1; g[y * GW + GW - 1] = 1; }
    px = GW >> 1; py = GH - 1; drawing = false; dir = null; claimed = 0;
    sparks = Array.from({ length: Math.min(4, level) }, () => ({ x: 20 + Math.random() * 36, y: 15 + Math.random() * 30, vx: (Math.random() < .5 ? -1 : 1) * (14 + level * 3), vy: (Math.random() < .5 ? -1 : 1) * (12 + level * 3) }));
  }
  function close() {
    const seen = new Uint8Array(GW * GH), st = [];
    for (const s of sparks) { const k = (s.y | 0) * GW + (s.x | 0); if (!g[k] && !seen[k]) { seen[k] = 1; st.push(k); } }
    while (st.length) { const k = st.pop(), x = k % GW, y = k / GW | 0; for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) { if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue; const kk = ny * GW + nx; if (!g[kk] && !seen[kk]) { seen[kk] = 1; st.push(kk); } } }
    let got = 0; for (let k = 0; k < g.length; k++) { if (g[k] === 2) g[k] = 1; else if (!g[k] && !seen[k]) { g[k] = 1; got++; } }
    let n = 0; for (const v of g) if (v === 1) n++; claimed = n / g.length;
    score += Math.round(got / 10); api.score(score); haptic(got > 300 ? 'medium' : 'light'); sfx(400 + Math.min(600, got), .15, 'square', .04, 200);
    if (claimed >= TARGET) { level++; score += 50; api.score(score); haptic('success'); sfx(880, .3, 'square', .05, 400); newLevel(); }
  }
  return {
    reset() { level = 1; score = 0; t = 0; dead = 0; moveT = 0; held = false; newLevel(); },
    update(dt) {
      t += dt;
      for (const s of sparks) {
        let nx = s.x + s.vx * dt, ny = s.y + s.vy * dt;
        if (at(nx | 0, s.y | 0) === 1) { s.vx = -s.vx; nx = s.x; } if (at(s.x | 0, ny | 0) === 1) { s.vy = -s.vy; ny = s.y; }
        s.x = nx; s.y = ny;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (at((s.x | 0) + dx, (s.y | 0) + dy) === 2) { haptic('error'); sfx(120, .5, 'sawtooth', .05, -60); return api.over(); }
        if (drawing && Math.abs(s.x - px) < 1.5 && Math.abs(s.y - py) < 1.5) { haptic('error'); return api.over(); }
      }
      moveT -= dt;
      if (held && dir && moveT <= 0) {
        moveT = .028; const nx = px + dir[0], ny = py + dir[1];
        if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) return; const v = g[ny * GW + nx];
        if (v === 2) return;
        if (v === 0) { if (!drawing && g[py * GW + px] === 1) drawing = true; g[ny * GW + nx] = 2; px = nx; py = ny; }
        else { px = nx; py = ny; if (drawing) { drawing = false; close(); } }
      }
    },
    fx(dt) { dead += dt; },
    draw(c) {
      c.fillStyle = R[0]; c.fillRect(0, 0, W, H);
      for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) { const v = g[y * GW + x]; c.fillStyle = v === 1 ? R[2] : v === 2 ? R[3] : R[0]; c.fillRect(OX + x * S, OY + y * S, S, S); }
      c.fillStyle = R[1]; for (let i = 0; i < 30; i++) { const x = (i * 37) % GW, y = (i * 53) % GH; if (!g[y * GW + x]) c.fillRect(OX + x * S, OY + y * S, 1, 1); }
      for (const s of sparks) { c.fillStyle = (t * 10 | 0) % 2 ? R[3] : R[1]; c.fillRect(OX + (s.x | 0) * S - 2, OY + (s.y | 0) * S - 2, 5, 5); c.fillStyle = R[3]; c.fillRect(OX + (s.x | 0) * S, OY + (s.y | 0) * S - 4, 1, 9); c.fillRect(OX + (s.x | 0) * S - 4, OY + (s.y | 0) * S, 9, 1); }
      if (!dead || (dead * 10 | 0) % 2) { c.fillStyle = R[3]; c.fillRect(OX + px * S - 2, OY + py * S - 2, 6, 6); c.fillStyle = R[0]; c.fillRect(OX + px * S, OY + py * S, 2, 2); }
      c.fillStyle = R[1]; c.fillRect(OX, 4, 152, 4); c.fillStyle = R[3]; c.fillRect(OX, 4, 152 * claimed / TARGET > 152 ? 152 : 152 * claimed / TARGET, 4);
      c.fillStyle = R[3]; c.font = '6px "Press Start 2P", monospace'; c.textAlign = 'right'; c.fillText(`${Math.round(claimed * 100)}%`, W - 4, 15);
    },
    down(x, y) { held = true; this._o = { x, y }; },
    move(x, y, p) { if (!p || !this._o) return; const dx = x - this._o.x, dy = y - this._o.y; if (Math.max(Math.abs(dx), Math.abs(dy)) > 4) { dir = Math.abs(dx) > Math.abs(dy) ? [Math.sign(dx), 0] : [0, Math.sign(dy)]; this._o = { x, y }; } },
    up() { held = false; },
    key(k, d) { const m = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[k]; if (m) { dir = m; held = d; } },
  };
}

export default {
  id: 'territory-claim', title: 'Territory Claim', tag: 'Pocket · Arcade', retro: true, w: W, h: H, pal: 'rose', goal: 60,
  hint: 'Drag in a direction to move. Cut across open ground and return to your side to claim it. Avoid the spark.',
  make,
};

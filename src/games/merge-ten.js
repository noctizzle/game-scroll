import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { haptic } = gs.device;
const { Feel } = gs.effects;

// Tap a group of touching equal numbers to fuse them into one number higher. New tiles drop in. Reach 10!
const W = 360, H = 640, N = 5, CS = 64, OX = (W - N * CS) / 2, OY = 180;
const HUE = n => (n * 37 + 190) % 360;

function make(api) {
  const feel = new Feel({ sound: false, buzz: false });   // the game has its own sounds and buzzes
  let g, score, best, t, pops, dead, fallY;
  function group(i) { const v = g[i], seen = new Set([i]), st = [i]; while (st.length) { const k = st.pop(), x = k % N, y = k / N | 0; for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) { if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue; const kk = ny * N + nx; if (!seen.has(kk) && g[kk] === v) { seen.add(kk); st.push(kk); } } } return seen; }
  const stuck = () => g.every((v, i) => group(i).size < 2);
  return {
    reset() { best = 3; g = Array.from({ length: N * N }, () => 1 + (Math.random() * 3 | 0)); while (stuck()) g[Math.random() * N * N | 0] = g[0]; score = 0; t = 0; pops = []; dead = 0; fallY = Array(N * N).fill(0); feel.clear(); },
    update(dt) { feel.update(dt); t += dt; for (const p of pops) p.l -= dt; pops = pops.filter(p => p.l > 0); fallY = fallY.map(v => Math.max(0, v - dt * 900)); },
    fx(dt) { dead += dt; this.update(dt); },
    draw(c) {
      c.fillStyle = '#121a26'; c.fillRect(0, 0, W, H);
      c.fillStyle = '#ffffffcc'; c.font = '700 16px Rubik, sans-serif'; c.textAlign = 'center'; c.fillText(`Highest: ${best}`, W / 2, 120);
      feel.begin(c);
      for (let i = 0; i < N * N; i++) { const v = g[i], x = OX + (i % N) * CS, y = OY + (i / N | 0) * CS - fallY[i];
        c.fillStyle = `hsl(${HUE(v)} 65% ${40 + Math.min(v, 10) * 2}%)`; c.beginPath(); c.roundRect(x + 4, y + 4, CS - 8, CS - 8, 12); c.fill();
        c.fillStyle = '#ffffff30'; c.fillRect(x + 10, y + 9, CS - 20, 5);
        c.fillStyle = '#fff'; c.font = `800 ${v > 9 ? 24 : 28}px Rubik, sans-serif`; c.textBaseline = 'middle'; c.fillText(v, x + CS / 2, y + CS / 2 + 2); c.textBaseline = 'alphabetic'; }
      for (const p of pops) { c.strokeStyle = `rgba(255,255,255,${p.l * 2})`; c.lineWidth = 3; c.beginPath(); c.roundRect(p.x + 4 - (1 - p.l * 2) * 8, p.y + 4 - (1 - p.l * 2) * 8, CS - 8 + (1 - p.l * 2) * 16, CS - 8 + (1 - p.l * 2) * 16, 14); c.stroke(); }
      feel.end(c, W, H);
      c.font = '500 12px Rubik, sans-serif'; c.fillStyle = '#ffffff77'; c.fillText('Tap two or more touching equal numbers', W / 2, OY + N * CS + 40);
    },
    down(x, y) {
      const cx = Math.floor((x - OX) / CS), cy = Math.floor((y - OY) / CS); if (cx < 0 || cy < 0 || cx >= N || cy >= N) return;
      const i = cy * N + cx, grp = group(i); if (grp.size < 2) { haptic('tick'); sfx(180, .05, 'square', .02); return; }
      const v = g[i] + 1; score += g[i] * grp.size;
      for (const k of grp) feel.juice.burst(OX + (k % N + .5) * CS, OY + ((k / N | 0) + .5) * CS, { n: 4, speed: 120, life: .35, size: 4, color: [`hsl(${HUE(g[i])} 65% 60%)`, '#ffffff'], shape: 'square' });
      feel.juice.pop(OX + (cx + .5) * CS, OY + cy * CS, `+${g[i] * grp.size}`, { color: '#ffffff', size: 14 + Math.min(12, grp.size * 2) });
      for (const k of grp) if (k !== i) g[k] = null; g[i] = v; pops.push({ x: OX + cx * CS, y: OY + cy * CS, l: .5 });
      for (let col = 0; col < N; col++) { const vals = []; for (let r = N - 1; r >= 0; r--) if (g[r * N + col] !== null) vals.push([g[r * N + col], r]); for (let r = N - 1, k = 0; r >= 0; r--, k++) { const idx = r * N + col; if (k < vals.length) { g[idx] = vals[k][0]; fallY[idx] = (r - vals[k][1]) * CS; } else { g[idx] = Math.max(1, Math.min(best - 1, 1 + (Math.random() * Math.max(2, best - 2) | 0))); fallY[idx] = (r + 2) * CS; } } }
      if (v > best) { best = v; score += v * 10; feel.juice.shake(4).flash('#ffffff', .15).pop(W / 2, 150, `NEW HIGH ${v}! +${v * 10}`, { color: '#ffd34a', size: 20 }); haptic(v >= 10 ? 'success' : 'medium'); sfx(400 + v * 60, .25, 'triangle', .06, 300); } else { haptic('light'); sfx(400 + v * 40, .1, 'triangle', .04, 100); }
      api.score(score);
      if (stuck()) { feel.juice.shake(7); haptic('error'); sfx(140, .5, 'sawtooth', .05, -60); api.over(); }
    },
  };
}

export default {
  id: 'merge-ten', title: 'Merge Ten', tag: 'Casual · Merge', retro: false, w: W, h: H, goal: 500,
  hint: 'Tap a group of touching equal numbers to fuse them into one, a step higher. Keep going until nothing touches.',
  make,
};

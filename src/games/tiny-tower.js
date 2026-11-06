import { clamp } from '../util.js';
import { sfx } from '../sfx.js';
import { haptic } from '../kit/device.js';

// Bugs march along the path toward your picnic. Tap an empty pad to build: pick a dart tower (fast),
// a frost tower (slows) or a boom tower (splash). Kills earn coins for more towers. Survive five waves.
const W = 360, H = 640, WAVES = 5;
const TYPES = [
  { k: 'dart', cost: 30, range: 80, rate: .6, dmg: 1, col: '#4ad3ff' },
  { k: 'frost', cost: 40, range: 70, rate: .9, dmg: .4, slow: .5, col: '#c8f0ff' },
  { k: 'boom', cost: 60, range: 90, rate: 1.5, dmg: 2, splash: 34, col: '#ff8a3d' },
];
const PATHS = [
  [[-20, 130], [280, 130], [280, 260], [80, 260], [80, 400], [300, 400], [300, 530], [180, 530], [180, 660]],
  [[60, -20], [60, 200], [300, 200], [300, 330], [60, 330], [60, 470], [300, 470], [300, 660]],
];

function make(api) {
  let path, segs, total, pads, towers, bugs, shots, coins, lives, wave, toSpawn, spawnT, gap, t, pick, kills, booms;
  function at(d) { for (const s of segs) { if (d <= s.len) return { x: s.a[0] + (s.b[0] - s.a[0]) * d / s.len, y: s.a[1] + (s.b[1] - s.a[1]) * d / s.len }; d -= s.len; } return { x: path[path.length - 1][0], y: path[path.length - 1][1] }; }
  function setup() {
    path = PATHS[Math.random() * PATHS.length | 0]; if (Math.random() < .5) path = path.map(([x, y]) => [W - x, y]);
    segs = []; total = 0; for (let i = 1; i < path.length; i++) { const a = path[i - 1], b = path[i], len = Math.hypot(b[0] - a[0], b[1] - a[1]); segs.push({ a, b, len }); total += len; }
    pads = []; // candidate pads: grid points not too close to the path, but within reach of it
    for (let y = 100; y < 600; y += 58) for (let x = 40; x < W - 20; x += 64) {
      let dmin = 1e9; for (let d = 0; d < total; d += 10) { const p = at(d); dmin = Math.min(dmin, Math.hypot(p.x - x, p.y - y)); }
      if (dmin > 30 && dmin < 64) pads.push({ x, y });
    }
  }
  function startWave() { wave++; toSpawn = 6 + wave * 3; spawnT = 1; gap = Math.max(.35, .9 - wave * .1); }
  return {
    reset() { setup(); towers = []; bugs = []; shots = []; booms = []; coins = 70; lives = 10; wave = 0; t = 0; pick = null; kills = 0; startWave(); },
    update(dt) {
      t += dt;
      if (toSpawn > 0) { spawnT -= dt; if (spawnT <= 0) { spawnT = gap; toSpawn--; const big = wave >= 3 && toSpawn % 5 === 0; bugs.push({ d: 0, hp: (big ? 8 : 2) + wave * (big ? 3 : 1.5), max: (big ? 8 : 2) + wave * (big ? 3 : 1.5), sp: big ? 32 : 48 + wave * 3, slow: 0, big }); } }
      for (const b of bugs) {
        b.slow = Math.max(0, b.slow - dt); b.d += b.sp * (b.slow ? .5 : 1) * dt;
        if (b.d >= total) { b.dead = true; lives -= b.big ? 3 : 1; haptic('error'); sfx(150, .2, 'square', .04, -40); if (lives <= 0) { lives = 0; return api.over(); } }
      }
      for (const tw of towers) {
        tw.cd -= dt; if (tw.cd > 0) continue; const T = TYPES[tw.type];
        let best = null; for (const b of bugs) { if (b.dead) continue; const p = at(b.d); if (Math.hypot(p.x - tw.x, p.y - tw.y) < T.range && (!best || b.d > best.d)) best = b; }
        if (best) { tw.cd = T.rate; const p = at(best.d); shots.push({ x: tw.x, y: tw.y, tx: p.x, ty: p.y, b: best, type: tw.type, k: 0 }); if (tw.type === 0) sfx(900, .02, 'square', .015); }
      }
      for (const s of shots) {
        s.k += dt * 6; if (s.k < 1) continue; s.done = true; const T = TYPES[s.type];
        const hit = T.splash ? bugs.filter(b => !b.dead && Math.hypot(at(b.d).x - s.tx, at(b.d).y - s.ty) < T.splash) : [s.b];
        if (T.splash) { booms.push({ x: s.tx, y: s.ty, l: .3 }); sfx(120, .15, 'square', .04, -40); }
        for (const b of hit) { if (b.dead) continue; b.hp -= T.dmg; if (T.slow) b.slow = 1.2; if (b.hp <= 0) { b.dead = true; kills++; coins += b.big ? 10 : 4; api.score(kills); haptic('tick'); } }
      }
      shots = shots.filter(s => !s.done); bugs = bugs.filter(b => !b.dead);
      for (const b of booms) b.l -= dt; booms = booms.filter(b => b.l > 0);
      if (toSpawn <= 0 && !bugs.length) { if (wave >= WAVES) { kills += lives * 3; api.score(kills); haptic('success'); return api.over(); } coins += 20; haptic('success'); sfx(880, .2, 'triangle', .05, 200); startWave(); }
    },
    draw(c) {
      c.fillStyle = '#7cc46a'; c.fillRect(0, 0, W, H);
      c.strokeStyle = '#d9c08a'; c.lineWidth = 34; c.lineJoin = 'round'; c.beginPath(); path.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.stroke();
      c.strokeStyle = '#c8ad74'; c.lineWidth = 2; c.setLineDash([6, 8]); c.stroke(); c.setLineDash([]);
      const end = path[path.length - 1]; c.fillStyle = '#ff6b8a'; c.fillRect(clamp(end[0], 30, W - 30) - 30, clamp(end[1], 0, H - 40) - 6, 60, 40);
      for (const p of pads) { if (towers.some(tw => tw.x === p.x && tw.y === p.y)) continue; c.fillStyle = pick === p ? '#ffffffaa' : '#ffffff40'; c.beginPath(); c.arc(p.x, p.y, 16, 0, 7); c.fill(); }
      for (const tw of towers) {
        const T = TYPES[tw.type]; c.fillStyle = '#5a4a3a'; c.beginPath(); c.arc(tw.x, tw.y, 17, 0, 7); c.fill(); c.fillStyle = T.col; c.beginPath(); c.arc(tw.x, tw.y, 11, 0, 7); c.fill();
        c.fillStyle = '#222'; c.font = '700 10px Rubik, sans-serif'; c.textAlign = 'center'; c.fillText(T.k[0].toUpperCase(), tw.x, tw.y + 4);
      }
      for (const b of bugs) {
        const p = at(b.d), r = b.big ? 13 : 9; c.fillStyle = b.slow ? '#7ab8d8' : b.big ? '#6a2a6a' : '#3a2a2a'; c.beginPath(); c.ellipse(p.x, p.y, r, r * .8, 0, 0, 7); c.fill();
        c.fillStyle = '#222'; c.fillRect(p.x - r, p.y - r - 6, r * 2, 3); c.fillStyle = '#7dff9a'; c.fillRect(p.x - r, p.y - r - 6, r * 2 * Math.max(0, b.hp / b.max), 3);
      }
      for (const s of shots) { c.fillStyle = TYPES[s.type].col; const x = s.x + (s.tx - s.x) * s.k, y = s.y + (s.ty - s.y) * s.k; c.beginPath(); c.arc(x, y, s.type === 2 ? 5 : 3, 0, 7); c.fill(); }
      for (const b of booms) { c.fillStyle = `rgba(255,140,60,${b.l * 2})`; c.beginPath(); c.arc(b.x, b.y, 34 * (1 - b.l), 0, 7); c.fill(); }
      // top bar
      c.fillStyle = '#00000070'; c.fillRect(0, 0, W, 50); c.fillStyle = '#fff'; c.font = '400 9px "Press Start 2P", monospace'; c.textAlign = 'left';
      c.fillText(`WAVE ${wave}/${WAVES}`, 10, 20); c.fillText(`♥${lives}`, 10, 38); c.textAlign = 'right'; c.fillText(`$${coins}`, W - 10, 20);
      if (pick) {
        c.fillStyle = '#000000b0'; c.beginPath(); c.roundRect(20, H - 96, W - 40, 82, 14); c.fill();
        TYPES.forEach((T, i) => { const x = 40 + i * 100; c.fillStyle = coins >= T.cost ? T.col : '#555'; c.beginPath(); c.roundRect(x, H - 86, 80, 62, 10); c.fill(); c.fillStyle = '#222'; c.font = '700 13px Rubik, sans-serif'; c.textAlign = 'center'; c.fillText(T.k.toUpperCase(), x + 40, H - 58); c.fillText(`$${T.cost}`, x + 40, H - 38); });
      } else if (t < 6) { c.fillStyle = '#1a3a1acc'; c.font = '600 14px Rubik, sans-serif'; c.textAlign = 'center'; c.fillText('tap a pad to build a tower', W / 2, H - 20); }
    },
    down(x, y) {
      if (pick && y > H - 96) { const i = Math.floor((x - 40) / 100); const T = TYPES[i]; if (T && coins >= T.cost) { coins -= T.cost; towers.push({ x: pick.x, y: pick.y, type: i, cd: 0 }); haptic('medium'); sfx(500, .1, 'triangle', .05, 200); } pick = null; return; }
      const p = pads.find(q => Math.hypot(q.x - x, q.y - y) < 22 && !towers.some(tw => tw.x === q.x && tw.y === q.y));
      pick = p || null; if (p) haptic('tick');
    },
    key(k, d) { if (d && k === ' ') { const p = pads.find(q => !towers.some(tw => tw.x === q.x && tw.y === q.y)); if (p && coins >= 30) { coins -= 30; towers.push({ x: p.x, y: p.y, type: 0, cd: 0 }); } } },
  };
}

export default {
  id: 'tiny-tower', title: 'Tiny Tower Defense', tag: 'Casual · Strategy', retro: false, w: W, h: H, goal: 60,
  hint: 'Tap a pad, then pick a tower: Dart is quick, Frost slows bugs, Boom hits a crowd. Kills earn coins. Survive five waves without losing your picnic.',
  make,
};

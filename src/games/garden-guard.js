import { clamp, rnd } from '../util.js';
import { sfx } from '../sfx.js';
import { haptic } from '../kit/device.js';

// Weed beetles are marching across your vegetable patch. Tap the glowing dew drops to collect
// them, tap a card at the top, then tap a square to plant it. Dew Lilies make more dew, Pea Pods
// shoot down their row, Bramble Walls hold beetles up and Pepper Pops blow up everything nearby.
// If a beetle reaches your house, you lose a garden gnome. Lose all three and the patch is lost.
const PLANTS = [
  { k: 'lily', n: 'LILY', cost: 25, hp: 6, col: '#f0d040', cd: 4 },
  { k: 'pod', n: 'POD', cost: 50, hp: 6, col: '#58c050', cd: 4 },
  { k: 'wall', n: 'WALL', cost: 50, hp: 40, col: '#7a5a30', cd: 12 },
  { k: 'pepper', n: 'POP', cost: 100, hp: 99, col: '#e04030', cd: 20 },
];
const BUGS = { beetle: { hp: 10, sp: 4.5, dmg: 4, col: '#6a4a8a' }, armour: { hp: 26, sp: 5, dmg: 4, col: '#4a5a6a' }, hopper: { hp: 9, sp: 9, dmg: 3, col: '#5a8a3a', hop: true }, stag: { hp: 60, sp: 3.5, dmg: 10, col: '#7a3020' } };
const COLS = 8, ROWS = 5;
let W = 240, H = 176;

function make(api) {
  let grid, bugs, seeds, dews, dew, sel, cds, gnomes, wave, waveT, spawnQ, spawnT, kills, t, parts, msg, dead, skyT;
  const top = 26, cell = () => Math.min(Math.floor((W - 20) / COLS), Math.floor((H - top - 4) / ROWS)), ox = () => W - COLS * cell() - 4, oy = () => top + ((H - top - ROWS * cell()) >> 1);
  const cx = c => ox() + (c + .5) * cell(), cy = r => oy() + (r + .5) * cell();
  function startWave() {
    wave++; const n = 2 + wave * 2; spawnQ = [];
    for (let i = 0; i < n; i++) { const r = Math.random(); spawnQ.push(wave > 4 && i === n - 1 ? 'stag' : r < .55 || wave < 2 ? 'beetle' : r < .8 ? (wave > 2 ? 'armour' : 'beetle') : 'hopper'); }
    spawnT = wave === 1 ? 8 : 3; msg = { txt: wave === 1 ? 'PLANT LILIES FIRST!' : `WAVE ${wave}`, l: 1.6 };
  }
  function burst(x, y, col, n = 8) { for (let i = 0; i < n; i++) parts.push({ x, y, vx: rnd(-50, 50), vy: rnd(-60, 10), l: .45, col }); }
  function hitBug(b, d) { b.hp -= d; b.flash = .1; if (b.hp <= 0 && !b.dead) { b.dead = true; kills++; api.score(kills); burst(b.x, b.y, b.col); sfx(300, .08, 'square', .04, -100); } }
  const self = {
    reset() { grid = Array.from({ length: ROWS }, () => Array(COLS).fill(null)); bugs = []; seeds = []; dews = []; dew = 150; sel = -1; cds = PLANTS.map(() => 0); gnomes = 3; wave = 0; waveT = 0; kills = 0; t = 0; parts = []; dead = 0; skyT = 3; startWave(); },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      t += dt; for (const p of parts) { p.l -= dt; if (p.vx != null) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 200 * dt; } else p.y -= 14 * dt; } parts = parts.filter(p => p.l > 0);
      if (msg) { msg.l -= dt; if (msg.l <= 0) msg = null; }
      if (dead) { dead += dt; if (dead > 1.6) api.over(); return; }
      cds = cds.map(v => Math.max(0, v - dt)); const C = cell();
      // dew falls from the sky now and then; lilies make it too
      skyT -= dt; if (skyT <= 0) { skyT = rnd(4, 6.5); dews.push({ x: rnd(ox() + 8, W - 8), y: top, ty: rnd(oy() + 10, H - 10), l: 9, v: 25 }); }
      for (const d of dews) { if (d.y < d.ty) d.y += 30 * dt; d.l -= dt; } dews = dews.filter(d => d.l > 0);
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        const p = grid[r][c]; if (!p) continue; p.t += dt;
        if (p.k === 'lily' && p.t > 9) { p.t = 0; dews.push({ x: cx(c) + rnd(-4, 4), y: cy(r) - 6, ty: cy(r) + 4, l: 8, v: 25 }); }
        if (p.k === 'pod' && p.t > 1.5 && bugs.some(b => !b.dead && b.r === r && b.x > cx(c) && b.x < W + 4)) { p.t = 0; seeds.push({ x: cx(c) + 5, r }); sfx(700, .03, 'square', .02, 200); }
        if (p.k === 'pepper' && p.t > .8) { grid[r][c] = null; for (const b of bugs) if (Math.abs(b.r - r) <= 1 && Math.abs(b.x - cx(c)) < C * 1.6) hitBug(b, 90); burst(cx(c), cy(r), '#f86020', 24); haptic('heavy'); sfx(80, .4, 'sawtooth', .06, -30); }
      }
      for (const s of seeds) { s.x += 120 * dt; for (const b of bugs) if (!b.dead && b.r === s.r && Math.abs(b.x - s.x) < 5) { hitBug(b, 2); s.done = true; break; } }
      seeds = seeds.filter(s => !s.done && s.x < W + 6);
      // spawn
      if (spawnQ.length) { spawnT -= dt; if (spawnT <= 0) { const k = spawnQ.shift(); bugs.push({ k, ...BUGS[k], max: BUGS[k].hp, x: W + 6, y: 0, r: Math.random() * ROWS | 0, eat: 0, flash: 0, hopped: false }); spawnT = Math.max(2.2, 9 - wave * .6) * rnd(.6, 1.3); } }
      else if (!bugs.some(b => !b.dead)) { waveT += dt; if (waveT > 3) { waveT = 0; startWave(); } }
      for (const b of bugs) {
        if (b.dead) continue; b.flash = Math.max(0, b.flash - dt); b.y = cy(b.r);
        const c = Math.floor((b.x - ox() - 2) / C), p = c >= 0 && c < COLS ? grid[b.r][c] : null;
        if (p && p.k !== 'pepper' && b.x - cx(c) < C * .5) {
          if (b.hop && !b.hopped) { b.hopped = true; b.x -= C; continue; }
          b.eat += dt; if (b.eat > 1) { b.eat = 0; p.hp -= b.dmg / 2; p.hit = .15; sfx(200, .03, 'square', .02); if (p.hp <= 0) { grid[b.r][c] = null; burst(cx(c), cy(b.r), p.col); } }
        } else b.x -= b.sp * (C / 20) * dt;
        if (b.x < ox() - 4) { b.dead = true; gnomes--; haptic('error'); sfx(150, .5, 'sawtooth', .05, -60); msg = { txt: gnomes > 0 ? 'A GNOME GOT EATEN!' : 'THE PATCH IS LOST', l: 1.4 }; for (const o of bugs) if (o.r === b.r) o.dead = true; if (gnomes <= 0) { dead = .01; return; } }
      }
      bugs = bugs.filter(b => !b.dead);
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (grid[r][c] && grid[r][c].hit) grid[r][c].hit = Math.max(0, grid[r][c].hit - dt);
    },
    draw(c) {
      const C = cell(), X = ox(), Y = oy();
      c.fillStyle = '#4a8a3a'; c.fillRect(0, 0, W, H);
      for (let r = 0; r < ROWS; r++) for (let cc = 0; cc < COLS; cc++) { c.fillStyle = (r + cc) % 2 ? '#78b850' : '#68a848'; c.fillRect(X + cc * C, Y + r * C, C, C); }
      // house and gnomes
      c.fillStyle = '#c8b090'; c.fillRect(0, Y, X - 2, ROWS * C); c.fillStyle = '#a04030'; c.beginPath(); c.moveTo(0, Y); c.lineTo((X - 2) / 2, Y - 10); c.lineTo(X - 2, Y); c.fill();
      for (let i = 0; i < 3; i++) { const gx = (X - 2) / 2, gy = Y + 14 + i * ((ROWS * C - 20) / 3); c.fillStyle = i < gnomes ? '#e04040' : '#80706080'; c.beginPath(); c.moveTo(gx - 4, gy); c.lineTo(gx, gy - 9); c.lineTo(gx + 4, gy); c.fill(); if (i < gnomes) { c.fillStyle = '#f8f0e0'; c.fillRect(gx - 3, gy, 6, 4); c.fillStyle = '#3858a0'; c.fillRect(gx - 3, gy + 4, 6, 4); } }
      // plants
      for (let r = 0; r < ROWS; r++) for (let cc = 0; cc < COLS; cc++) {
        const p = grid[r][cc]; if (!p) continue; const x = cx(cc), y = cy(r), s = C / 20;
        c.fillStyle = p.hit ? '#ffffff' : p.col;
        if (p.k === 'lily') { for (let i = 0; i < 5; i++) { const a = i * 1.257 + t; c.beginPath(); c.arc(x + Math.cos(a) * 4 * s, y - 2 * s + Math.sin(a) * 4 * s, 3 * s, 0, 7); c.fill(); } c.fillStyle = '#f89020'; c.beginPath(); c.arc(x, y - 2 * s, 2.5 * s, 0, 7); c.fill(); }
        else if (p.k === 'pod') { c.fillRect(x - 1, y - 2 * s, 2, 8 * s); c.beginPath(); c.ellipse(x + 1 * s, y - 4 * s, 6 * s, 4 * s, 0, 0, 7); c.fill(); c.fillStyle = '#306828'; c.fillRect(x + 5 * s, y - 5 * s, 3 * s, 2 * s); c.fillStyle = '#202020'; c.fillRect(x + 1 * s, y - 6 * s, 1.5 * s, 1.5 * s); }
        else if (p.k === 'wall') { c.fillRect(x - 6 * s, y - 8 * s, 12 * s, 14 * s); c.fillStyle = '#4a3418'; for (let i = 0; i < 4; i++) c.fillRect(x - 6 * s + i * 3 * s, y - 8 * s + (i % 2) * 5 * s, 2 * s, 2 * s); c.fillStyle = '#ffffff40'; c.fillRect(x - 6 * s, y + 7 * s, 12 * s * p.hp / 40, 1.5); }
        else { const k = 1 + Math.sin(p.t * 30) * .15 * p.t; c.beginPath(); c.ellipse(x, y, 5 * s * k, 7 * s * k, 0, 0, 7); c.fill(); c.fillStyle = '#38a038'; c.fillRect(x - 1, y - 9 * s, 2, 3 * s); }
      }
      for (const s of seeds) { c.fillStyle = '#90e060'; c.beginPath(); c.arc(s.x, cy(s.r) - 4 * C / 20, 2, 0, 7); c.fill(); }
      for (const b of bugs) {
        const s = C / 20 * (b.k === 'stag' ? 1.4 : 1), x = b.x, y = b.y + (b.k === 'hopper' && !b.hopped ? -Math.abs(Math.sin(t * 6)) * 3 : 0);
        c.fillStyle = b.flash > 0 ? '#ffffff' : b.col; c.beginPath(); c.ellipse(x, y, 7 * s, 5 * s, 0, 0, 7); c.fill(); c.beginPath(); c.arc(x - 6 * s, y - 1 * s, 3 * s, 0, 7); c.fill();
        c.fillStyle = '#202020'; for (let i = -1; i <= 1; i++) c.fillRect(x + i * 4 * s, y + 4 * s, 1, 3 * s);
        if (b.k === 'stag' || b.k === 'armour') { c.fillStyle = '#c0c8d0'; c.fillRect(x - 3 * s, y - 5 * s, 8 * s, 2 * s); }
        if (b.k === 'stag') { c.strokeStyle = '#3a1810'; c.lineWidth = 2; c.beginPath(); c.moveTo(x - 8 * s, y - 2 * s); c.lineTo(x - 13 * s, y - 7 * s); c.moveTo(x - 8 * s, y); c.lineTo(x - 13 * s, y + 3 * s); c.stroke(); c.lineWidth = 1; }
        c.fillStyle = '#f8f040'; c.fillRect(x - 7 * s, y - 2 * s, 1.5, 1.5);
        if (b.hp < b.max) { c.fillStyle = '#000a'; c.fillRect(x - 6, y - 9 * s - 3, 12, 2); c.fillStyle = '#f86060'; c.fillRect(x - 6, y - 9 * s - 3, 12 * b.hp / b.max, 2); }
      }
      for (const d of dews) { const a = d.l < 2 ? d.l / 2 : 1; c.globalAlpha = a; c.fillStyle = '#80d8ff'; c.beginPath(); c.arc(d.x, d.y, 5 + Math.sin(t * 6) * .6, 0, 7); c.fill(); c.fillStyle = '#e0f8ff'; c.fillRect(d.x - 2, d.y - 3, 2, 2); c.globalAlpha = 1; }
      for (const p of parts) { c.fillStyle = p.col; c.fillRect(p.x, p.y, 2, 2); }
      // cards
      c.fillStyle = '#3a2a18'; c.fillRect(0, 0, W, top - 2);
      c.font = '6px "Press Start 2P", monospace'; c.textAlign = 'left'; c.fillStyle = '#80d8ff'; c.fillText(`◆${dew}`, 4, 15);
      const cw = Math.min(44, (W - 44) / 4 - 3);
      PLANTS.forEach((p, i) => { const x = 40 + i * (cw + 3), can = dew >= p.cost && cds[i] <= 0; c.fillStyle = sel === i ? '#f8e8b0' : can ? '#c8b088' : '#6a5a48'; c.fillRect(x, 3, cw, top - 8); c.fillStyle = p.col; c.beginPath(); c.arc(x + 7, 12, 4, 0, 7); c.fill(); c.fillStyle = '#2a1a08'; c.textAlign = 'left'; c.fillText(String(p.cost), x + 13, 11); c.fillText(p.n, x + 13, 19); if (cds[i] > 0) { c.fillStyle = '#0008'; c.fillRect(x, 3, cw, (top - 8) * cds[i] / p.cd); } });
      c.textAlign = 'right'; c.fillStyle = '#f8f0d0'; c.fillText(`W${wave}`, W - 4, 15);
      if (msg) { c.textAlign = 'center'; c.fillStyle = '#000a'; c.fillRect(0, H / 2 - 9, W, 13); c.fillStyle = dead ? '#f86060' : '#f8e040'; c.fillText(msg.txt, W / 2, H / 2); }
    },
    down(x, y) {
      if (dead) return;
      for (const d of dews) if (Math.hypot(d.x - x, d.y - y) < 12) { d.l = 0; dew += d.v; haptic('light'); sfx(1200, .06, 'triangle', .04, 400); return; }
      if (y < top) { const cw = Math.min(44, (W - 44) / 4 - 3), i = Math.floor((x - 40) / (cw + 3)); if (i >= 0 && i < 4 && x - 40 - i * (cw + 3) < cw) { if (dew >= PLANTS[i].cost && cds[i] <= 0) { sel = sel === i ? -1 : i; haptic('tick'); sfx(600, .04, 'square', .03); } else { haptic('error'); sfx(150, .06, 'square', .03); } } return; }
      const C = cell(), c = Math.floor((x - ox()) / C), r = Math.floor((y - oy()) / C);
      if (sel < 0 || c < 0 || c >= COLS || r < 0 || r >= ROWS || grid[r][c]) return;
      const P = PLANTS[sel]; if (dew < P.cost) return;
      dew -= P.cost; cds[sel] = P.cd; grid[r][c] = { ...P, t: P.k === 'lily' ? 6 : 0, hit: 0 }; sel = -1; haptic('medium'); sfx(400, .08, 'square', .04, 200); burst(cx(c), cy(r) + 4, '#8a6a40', 5);
    },
    move() {}, up() {},
    key(k, d) { if (d && '1234'.includes(k)) sel = +k - 1; },
  };
  return self;
}

export default {
  id: 'garden-guard', title: 'Garden Guard', tag: 'Console · Defence', retro: true, era: 'console', pal: 'teal', w: 240, h: 176, maxW: 360, maxH: 260, goal: 60,
  hint: 'Tap glowing dew drops to collect them. Tap a card at the top, then a square to plant it. Lilies make more dew, Pea Pods shoot along their row, Walls hold beetles back and Pepper Pops blow up everything nearby. Each beetle that reaches the house eats a gnome: lose three and it\'s over.',
  make,
};

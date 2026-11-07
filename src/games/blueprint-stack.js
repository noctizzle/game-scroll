import { clamp } from '../util.js';
import { sfx } from '../sfx.js';
import { haptic } from '../kit/device.js';
import { brick, BRICK_KEYS } from '../kit/bricks.js';

// Build the model on the blueprint. A brick slides back and forth along the top: tap to drop it.
// It falls straight down and lands on whatever is below. Fill the dotted outline: every cell inside
// scores, every brick sticking outside costs you, and gaps under a brick can't be filled later.
// Hit 60% to pass the plan. Three failed plans and the build is over.
const PLANS = [
  ['...##...', '..####..', '.######.', '.##..##.', '.##..##.', '.######.'],
  ['..####..', '.######.', '########', '########', '.##..##.', '.##..##.'],
  ['...##...', '..####..', '.######.', '...##...', '...##...', '..####..'],
  ['...##...', '..####..', '..####..', '..####..', '.######.', '##....##'],
  ['##.##.##', '########', '.######.', '.##..##.', '.##..##.', '.######.'],
  ['.....##.', '....###.', '.#######', '########', '.######.', '..####..'],
  ['#......#', '##....##', '########', '##.##.##', '########', '.######.'],
];
const COLS = 8, ROWS = 6;

let W = 176, H = 192;

function make(api) {
  let plan, grid, cur, x, dir, speed, drop, plans, lives, score, t, msg, result, parts, dead, used, budget;
  const cell = () => Math.max(12, Math.min(26, Math.floor((W - 12) / COLS), Math.floor((H - 70) / (ROWS + 3))));
  const ox = () => (W - COLS * cell()) >> 1, floorY = () => H - 12;
  function newPlan() {
    plan = PLANS[(plans + Math.floor(Math.random() * 3)) % PLANS.length].map(r => [...r].map(ch => ch === '#'));
    grid = Array.from({ length: ROWS }, () => Array(COLS).fill(null)); used = 0;
    budget = plan.flat().filter(Boolean).length; speed = 3.6 + Math.min(4, plans * .4); result = null; next();
    msg = { txt: `PLAN ${plans + 1}`, l: 1 };
  }
  function need(c, r) { return plan[ROWS - 1 - r][c]; }
  function fits(w) { for (let c0 = 0; c0 + w <= COLS; c0++) { const r = landRow(c0, w); if (r < ROWS && [...Array(w).keys()].every(i => need(c0 + i, r) && landRow(c0 + i, 1) === r)) return true; } return false; }
  function next() { const opts = [1, 2, 2, 3, 3, 4].filter(fits), w = opts.length && Math.random() < .85 ? opts[Math.random() * opts.length | 0] : [1, 2, 3, 4][Math.random() * 4 | 0]; cur = { w, col: BRICK_KEYS[Math.random() * BRICK_KEYS.length | 0] }; x = 0; dir = 1; }
  function landRow(c0, w) { let r = 0; for (let c = c0; c < c0 + w; c++) for (let rr = ROWS - 1; rr >= 0; rr--) if (grid[rr][c]) { r = Math.max(r, rr + 1); break; } return r; }
  function evaluate() {
    let good = 0, bad = 0, total = 0;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) { if (need(c, r)) { total++; if (grid[r][c]) good++; } else if (grid[r][c]) bad++; }
    const pct = Math.max(0, Math.round((good - bad) / total * 100)); const pass = pct >= 60;
    score += Math.max(0, good - bad) + (pct === 100 ? 20 : 0); api.score(score);
    result = { pct, pass, t: 0 }; if (pass) { plans++; haptic('success'); sfx(pct === 100 ? 1040 : 880, .4, 'square', .05, 500); } else { lives--; haptic('error'); sfx(150, .4, 'sawtooth', .05, -60); }
  }
  const self = {
    reset() { plans = 0; lives = 3; score = 0; t = 0; parts = []; dead = 0; drop = null; newPlan(); },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      t += dt; if (msg) { msg.l -= dt; if (msg.l <= 0) msg = null; }
      for (const p of parts) { p.l -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 200 * dt; } parts = parts.filter(p => p.l > 0);
      if (dead) { dead += dt; if (dead > 1.4) api.over(); return; }
      if (result) { result.t += dt; if (result.t > 1.8) { if (lives <= 0) { dead = .01; return; } newPlan(); } return; }
      if (drop) {
        drop.y -= dt * 28; if (drop.y <= drop.to) {
          const r = drop.to; if (r >= ROWS) { drop = null; evaluate(); return; }
          let outside = 0; for (let c = drop.c; c < drop.c + drop.w; c++) { grid[r][c] = drop.col; if (!need(c, r)) outside++; }
          haptic(outside ? 'medium' : 'light'); sfx(outside ? 200 : 400 + r * 60, .06, 'square', .05, outside ? -60 : 100);
          if (outside) for (let i = 0; i < 6; i++) parts.push({ x: ox() + (drop.c + drop.w / 2) * cell(), y: floorY() - (r + .5) * cell(), vx: (Math.random() - .5) * 60, vy: -Math.random() * 60, l: .4, col: '#f86060' });
          drop = null; used++;
          const left = plan.flat().length && [...Array(ROWS).keys()].some(rr => [...Array(COLS).keys()].some(cc => need(cc, rr) && !grid[rr][cc] && landRow(cc, 1) <= rr));
          if (!left || used >= budget + 5) { evaluate(); return; }
          next();
        }
        return;
      }
      x += dir * speed * dt; if (x + cur.w > COLS) { x = COLS - cur.w; dir = -1; } if (x < 0) { x = 0; dir = 1; }
    },
    draw(c) {
      const C = cell(), X = ox(), F = floorY();
      c.fillStyle = '#20406c'; c.fillRect(0, 0, W, H);
      c.strokeStyle = '#30588c'; c.lineWidth = 1; for (let i = 0; i <= COLS; i++) { c.beginPath(); c.moveTo(X + i * C + .5, 14); c.lineTo(X + i * C + .5, F); c.stroke(); } for (let y = F; y > 14; y -= C) { c.beginPath(); c.moveTo(X, y + .5); c.lineTo(X + COLS * C, y + .5); c.stroke(); }
      for (let r = 0; r < ROWS; r++) for (let cc = 0; cc < COLS; cc++) if (need(cc, r)) { c.fillStyle = '#ffffff18'; c.fillRect(X + cc * C + 1, F - (r + 1) * C + 1, C - 2, C - 2); c.strokeStyle = '#a8d0ff'; c.setLineDash([2, 2]); c.strokeRect(X + cc * C + 1.5, F - (r + 1) * C + 1.5, C - 3, C - 3); c.setLineDash([]); }
      brick(c, X - 4, F, COLS * C + 8, 8, 'grey', C / 2);
      for (let r = 0; r < ROWS; r++) for (let cc = 0; cc < COLS; cc++) if (grid[r][cc]) { brick(c, X + cc * C, F - (r + 1) * C, C, C, grid[r][cc], C / 2); if (!need(cc, r)) { c.fillStyle = '#f8404070'; c.fillRect(X + cc * C, F - (r + 1) * C, C - 1, C - 1); } }
      const topY = F - (ROWS + 2) * C;
      if (drop) brick(c, X + drop.c * C, F - (drop.y + 1) * C, drop.w * C, C, drop.col, C / 2);
      else if (!result && !dead) { brick(c, X + x * C, topY, cur.w * C, C, cur.col, C / 2); const lc = clamp(Math.round(x), 0, COLS - cur.w), lr = landRow(lc, cur.w); c.fillStyle = '#ffffff20'; c.fillRect(X + lc * C, F - (lr + 1) * C, cur.w * C, C); }
      for (const p of parts) { c.fillStyle = p.col; c.fillRect(p.x, p.y, 2, 2); }
      c.font = '6px "Press Start 2P", monospace'; c.fillStyle = '#102038'; c.fillRect(0, 0, W, 13);
      c.textAlign = 'left'; for (let i = 0; i < 3; i++) { c.fillStyle = i < lives ? '#f0c020' : '#304060'; c.fillRect(4 + i * 8, 4, 6, 5); }
      c.textAlign = 'right'; c.fillStyle = '#e0f0ff'; c.fillText(`BRICKS ${Math.max(0, budget + 5 - used)}`, W - 4, 10);
      c.textAlign = 'center';
      if (result) { c.fillStyle = '#000b'; c.fillRect(0, H * .3 - 12, W, 22); c.fillStyle = result.pass ? '#58e070' : '#f86060'; c.fillText(`${result.pct}% ${result.pct === 100 ? 'PERFECT!' : result.pass ? 'PASSED' : 'REJECTED'}`, W / 2, H * .3 + 2); }
      if (msg) { c.fillStyle = '#e0f0ff'; c.fillText(msg.txt, W / 2, 24); }
      if (dead) { c.fillStyle = '#000b'; c.fillRect(0, H / 2 - 9, W, 14); c.fillStyle = '#f86060'; c.fillText('BUILD OVER', W / 2, H / 2); }
      if (t < 7 && !msg && !result) { c.fillStyle = '#e0f0ff'; c.fillText('TAP DROP · SWIPE UP SKIP', W / 2, 24); }
    },
    down(px, py) { this._sw = { y: py ?? 0, skip: false }; },
    move(px, py, p) { if (p && this._sw && !this._sw.skip && py - this._sw.y < -24) { this._sw.skip = true; if (!dead && !result && !drop) { used++; if (used >= budget + 5) { evaluate(); return; } next(); sfx(300, .05, 'square', .03, 300); haptic('tick'); } } },
    up() { const sw = this._sw; this._sw = null; if (sw && sw.skip) return; self.drop(); },
    drop() {
      if (dead || result || drop) return;
      const c0 = clamp(Math.round(x), 0, COLS - cur.w), to = landRow(c0, cur.w);
      drop = { c: c0, w: cur.w, col: cur.col, y: ROWS + 2, to }; sfx(600, .03, 'square', .03);
    },
    key(k, d) { if (d && (k === ' ' || k === 'ArrowDown')) self.drop(); if (d && k === 'ArrowUp' && !result && !drop) { used++; if (used >= budget + 5) evaluate(); else next(); } },
  };
  return self;
}

export default {
  id: 'blueprint-stack', title: 'Blueprint Stack', tag: 'Bricks · Puzzle', retro: true, era: 'console', pal: 'teal', w: 176, h: 192, maxW: 260, maxH: 320, goal: 150,
  hint: 'A brick slides along the top: tap to drop it. Fill the dotted blueprint. Cells inside score, bricks outside cost you, and holes under a brick can\'t be filled later. Swipe up to skip a brick that won\'t fit (it still uses one up). Score 60% or better to pass. Three rejected plans and the build is over.',
  make,
};

import { clamp } from '../util.js';
import { sfx } from '../sfx.js';
import { haptic } from '../kit/device.js';

// A match-three with no swapping: drag a whole row or column and it slides round like a loop.
// Line up three or more of a kind to clear them. A slide that makes no match springs back for free. 20 slides.
const W = 360, H = 640, N = 6, CS = 56, OX = (W - N * CS) / 2, OY = 190, KINDS = 5, MOVES = 20;
const COLS = ['#ff5a7a', '#ffd34a', '#4ad3ff', '#7dff9a', '#c18bff'];

function make(api) {
  let g, off, drag, moves, score, chain, busy, pops, t, msg, fall, lastAxis = null;
  const at = (x, y) => g[y * N + x];
  function rnd() { return Math.random() * KINDS | 0; }
  function findMatches() {
    const hit = new Set();
    for (let y = 0; y < N; y++) for (let x = 0; x < N - 2; x++) { const k = at(x, y); if (k >= 0 && k === at(x + 1, y) && k === at(x + 2, y)) { hit.add(y * N + x); hit.add(y * N + x + 1); hit.add(y * N + x + 2); } }
    for (let x = 0; x < N; x++) for (let y = 0; y < N - 2; y++) { const k = at(x, y); if (k >= 0 && k === at(x, y + 1) && k === at(x, y + 2)) { hit.add(y * N + x); hit.add((y + 1) * N + x); hit.add((y + 2) * N + x); } }
    return hit;
  }
  function fresh() { do { g = [...Array(N * N)].map(rnd); } while (findMatches().size); fall = new Float32Array(N * N); }
  function shift(axis, idx, k, arr = g) {
    const out = arr.slice(); k = ((k % N) + N) % N;
    for (let i = 0; i < N; i++) { const j = (i + k) % N; if (axis === 'row') out[idx * N + j] = arr[idx * N + i]; else out[j * N + idx] = arr[i * N + idx]; }
    return out;
  }
  function bestSlide() {
    for (let i = 0; i < N * 2; i++) for (let k = 1; k < N; k++) { const ax = i < N ? 'row' : 'col', sv = g; g = shift(ax, i % N, k); const ok = findMatches().size; g = sv; if (ok) return { ax, idx: i % N, k }; }
    return null;
  }
  function resolve() {
    const hit = findMatches();
    if (!hit.size) { busy = 0; chain = 0; if (moves <= 0) return api.over(); if (!bestSlide()) { fresh(); msg = { txt: 'SHUFFLE', l: 1 }; } return; }
    chain++; const pts = hit.size * chain; score += pts; api.score(score);
    for (const i of hit) pops.push({ x: OX + (i % N + .5) * CS, y: OY + ((i / N | 0) + .5) * CS, k: g[i], l: .35 });
    if (chain > 1) msg = { txt: `CHAIN x${chain}`, l: 1 };
    haptic(chain > 1 ? 'success' : 'medium'); sfx(500 + chain * 120, .1, 'triangle', .05, 200);
    for (const i of hit) g[i] = -1;
    for (let x = 0; x < N; x++) {   // drop and refill, remembering how far each gem fell for the animation
      let w = N - 1; for (let y = N - 1; y >= 0; y--) { const k = at(x, y); if (k >= 0) { g[w * N + x] = k; fall[w * N + x] = (w - y) * CS; w--; } }
      for (let y = w; y >= 0; y--) { g[y * N + x] = rnd(); fall[y * N + x] = (w + 1) * CS + 20; }
    }
    busy = .35;
  }
  return {
    reset() { fresh(); off = 0; drag = null; moves = MOVES; score = 0; chain = 0; busy = 0; pops = []; t = 0; msg = null; },
    update(dt) {
      t += dt; for (let i = 0; i < N * N; i++) fall[i] = Math.max(0, fall[i] - dt * 900);
      for (const p of pops) p.l -= dt; pops = pops.filter(p => p.l > 0); if (msg) msg.l -= dt;
      if (busy > 0) { busy -= dt; if (busy <= 0) resolve(); }
      if (!drag && off) { off *= Math.pow(.0001, dt); if (Math.abs(off) < .5) off = 0; }
    },
    draw(c) {
      c.fillStyle = '#1a1430'; c.fillRect(0, 0, W, H);
      c.fillStyle = '#ffffff0c'; c.beginPath(); c.roundRect(OX - 8, OY - 8, N * CS + 16, N * CS + 16, 14); c.fill();
      c.save(); c.beginPath(); c.rect(OX, OY, N * CS, N * CS); c.clip();
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const k = at(x, y); if (k < 0) continue;
        let px = OX + x * CS, py = OY + y * CS - fall[y * N + x];
        const moving = drag && drag.axis && ((drag.axis === 'row' && drag.idx === y) || (drag.axis === 'col' && drag.idx === x));
        const o = moving ? off : (!drag && off && lastAxis && ((lastAxis.axis === 'row' && lastAxis.idx === y) || (lastAxis.axis === 'col' && lastAxis.idx === x)) ? off : 0);
        for (const wrap of o ? [-N * CS, 0, N * CS] : [0]) {
          const dx = (moving || o) && (drag?.axis || lastAxis?.axis) === 'row' ? o + wrap : 0, dy = (moving || o) && (drag?.axis || lastAxis?.axis) === 'col' ? o + wrap : 0;
          gem(c, px + dx + CS / 2, py + dy + CS / 2, k, 1);
        }
      }
      c.restore();
      for (const p of pops) gem(c, p.x, p.y, p.k, 1 + (.35 - p.l) * 2, p.l / .35);
      c.font = '400 10px "Press Start 2P", monospace'; c.textAlign = 'left'; c.fillStyle = '#ffffffaa'; c.fillText('SLIDES', 14, 24); c.fillStyle = moves <= 3 ? '#ff6060' : '#fff'; c.font = '400 18px "Press Start 2P", monospace'; c.fillText(String(moves), 14, 50);
      if (t < 4 && moves === MOVES) { c.fillStyle = '#ffffffaa'; c.font = '600 14px Rubik, sans-serif'; c.textAlign = 'center'; c.fillText('drag a row or column to slide it', W / 2, OY + N * CS + 50); }
      if (msg && msg.l > 0) { c.globalAlpha = clamp(msg.l * 2, 0, 1); c.fillStyle = '#ffd34a'; c.font = '400 16px "Press Start 2P", monospace'; c.textAlign = 'center'; c.fillText(msg.txt, W / 2, OY - 30); c.globalAlpha = 1; }
    },
    down(x, y) { if (busy > 0 || moves <= 0) return; const cx = Math.floor((x - OX) / CS), cy = Math.floor((y - OY) / CS); if (cx < 0 || cy < 0 || cx >= N || cy >= N) return; drag = { x, y, cx, cy, axis: null }; off = 0; lastAxis = null; },
    move(x, y) {
      if (!drag) return; const dx = x - drag.x, dy = y - drag.y;
      if (!drag.axis && Math.hypot(dx, dy) > 10) { drag.axis = Math.abs(dx) > Math.abs(dy) ? 'row' : 'col'; drag.idx = drag.axis === 'row' ? drag.cy : drag.cx; }
      if (drag.axis) { const no = drag.axis === 'row' ? dx : dy; if (Math.round(no / CS) !== Math.round(off / CS)) haptic('tick'); off = no; }
    },
    up() {
      if (!drag) return; const d = drag; drag = null; if (!d.axis) return;
      const k = Math.round(off / CS); lastAxis = { axis: d.axis, idx: d.idx };
      if (k % N === 0) return;   // springs back
      const ng = shift(d.axis, d.idx, k), save = g; g = ng;
      if (!findMatches().size) { g = save; sfx(200, .08, 'triangle', .04); haptic('warning'); return; }
      off -= k * CS; moves--; chain = 0; resolve();
    },
    key(k, d) { if (d && k === ' ' && busy <= 0 && moves > 0) { const b = bestSlide(); if (b) { g = shift(b.ax, b.idx, b.k); moves--; chain = 0; resolve(); } } },
  };
}
function gem(c, x, y, k, s = 1, a = 1) {
  c.globalAlpha = a; c.fillStyle = COLS[k]; c.beginPath(); const r = 20 * s;
  if (k === 0) c.arc(x, y, r, 0, 7);
  else if (k === 1) { for (let i = 0; i < 5; i++) { const an = i / 5 * 6.283 - 1.571, an2 = an + .628; c.lineTo(x + Math.cos(an) * r, y + Math.sin(an) * r); c.lineTo(x + Math.cos(an2) * r * .5, y + Math.sin(an2) * r * .5); } }
  else if (k === 2) { c.moveTo(x, y - r); c.lineTo(x + r, y); c.lineTo(x, y + r); c.lineTo(x - r, y); }
  else if (k === 3) c.roundRect(x - r * .85, y - r * .85, r * 1.7, r * 1.7, 6 * s);
  else { for (let i = 0; i < 6; i++) { const an = i / 6 * 6.283; c.lineTo(x + Math.cos(an) * r, y + Math.sin(an) * r); } }
  c.fill(); c.fillStyle = '#ffffff55'; c.beginPath(); c.arc(x - r * .3, y - r * .35, r * .22, 0, 7); c.fill(); c.globalAlpha = 1;
}

export default {
  id: 'gem-slide', title: 'Gem Slide', tag: 'Casual · Puzzle', retro: false, w: W, h: H, goal: 120,
  hint: 'Drag any row sideways or any column up and down. Gems wrap round the edge. Line up three of a kind to clear them. Slides that match nothing are free.',
  make,
};

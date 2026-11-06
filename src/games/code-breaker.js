import { sfx } from '../sfx.js';
import { PAL } from '../palettes.js';
import { haptic } from '../kit/device.js';

// Crack a hidden code of four symbols (six kinds, repeats allowed) in eight tries. After each guess,
// a black pip means right symbol, right place; a white pip means right symbol, wrong place.
const P = PAL.mono, W = 160, H = 160, TRIES = 8;

function sym(c, x, y, k, col) {
  c.fillStyle = col;
  if (k === 0) c.fillRect(x - 3, y - 3, 7, 7);
  else if (k === 1) { c.beginPath(); c.arc(x + .5, y + .5, 3.5, 0, 7); c.fill(); }
  else if (k === 2) { c.beginPath(); c.moveTo(x + .5, y - 4); c.lineTo(x + 4.5, y + 4); c.lineTo(x - 3.5, y + 4); c.fill(); }
  else if (k === 3) { c.fillRect(x - 3, y, 7, 1); c.fillRect(x, y - 3, 1, 7); c.fillRect(x - 1, y - 1, 3, 3); }
  else if (k === 4) { c.beginPath(); c.moveTo(x + .5, y - 4); c.lineTo(x + 4.5, y + .5); c.lineTo(x + .5, y + 5); c.lineTo(x - 3.5, y + .5); c.fill(); }
  else { c.fillRect(x - 3, y - 3, 7, 2); c.fillRect(x - 3, y + 2, 7, 2); }
}

function make(api) {
  let code, rows, cur, score, solved, t, wait, reveal;
  function newCode() { code = [0, 1, 2, 3].map(() => Math.random() * 6 | 0); rows = []; cur = []; reveal = false; }
  function grade(g) {
    let black = 0, white = 0; const cc = [0, 0, 0, 0, 0, 0], gc = [0, 0, 0, 0, 0, 0];
    g.forEach((v, i) => { if (v === code[i]) black++; else { cc[code[i]]++; gc[v]++; } });
    for (let k = 0; k < 6; k++) white += Math.min(cc[k], gc[k]);
    return { black, white };
  }
  function submit() {
    if (cur.length < 4 || wait > 0) return; const r = grade(cur); rows.push({ g: cur, ...r }); cur = [];
    if (r.black === 4) { solved++; score += TRIES - rows.length + 1 + 2; api.score(score); haptic('success'); sfx(990, .25, 'square', .05, 300); wait = 1.2; reveal = true; }
    else if (rows.length >= TRIES) { haptic('error'); sfx(130, .4, 'square', .05, -40); reveal = true; wait = 1.6; solved = -1; }
    else { haptic(r.black ? 'medium' : 'light'); sfx(400 + r.black * 120 + r.white * 40, .06, 'square', .03); }
  }
  return {
    reset() { score = 0; solved = 0; t = 0; wait = 0; newCode(); },
    update(dt) { t += dt; if (wait > 0) { wait -= dt; if (wait <= 0) { if (solved < 0) return api.over(); newCode(); } } },
    draw(c) {
      c.fillStyle = P[3]; c.fillRect(0, 0, W, H);
      // board: 8 rows of guesses
      for (let i = 0; i < TRIES; i++) {
        const y = 28 + i * 11.4, row = rows[i], live = i === rows.length;
        c.fillStyle = live ? P[2] : P[3]; c.fillRect(20, y - 5, 88, 10);
        for (let j = 0; j < 4; j++) {
          const v = row ? row.g[j] : live ? cur[j] : undefined;
          if (v != null) sym(c, 30 + j * 20, y, v, P[0]); else { c.fillStyle = P[2]; c.fillRect(29 + j * 20, y, 2, 1); }
        }
        if (row) { for (let k = 0; k < 4; k++) { const px = 114 + (k % 2) * 6, py = y - 4 + (k >> 1) * 5; c.fillStyle = k < row.black ? P[0] : k < row.black + row.white ? P[1] : P[2]; c.fillRect(px, py, 4, 4); if (k >= row.black && k < row.black + row.white) { c.fillStyle = P[3]; c.fillRect(px + 1, py + 1, 2, 2); } } }
      }
      if (reveal) { c.fillStyle = P[0]; c.fillRect(126, 40, 30, 50); for (let j = 0; j < 4; j++) sym(c, 141, 48 + j * 11, code[j], P[3]); }
      else { c.fillStyle = P[1]; c.font = '6px "Press Start 2P", monospace'; c.textAlign = 'center'; c.fillText('?', 141, 66); }
      // symbol keypad + controls
      for (let k = 0; k < 6; k++) { const x = 6 + k * 22; c.fillStyle = P[1]; c.fillRect(x, 120, 20, 18); sym(c, x + 10, 129, k, P[3]); }
      c.fillStyle = P[1]; c.fillRect(138, 120, 18, 18); c.fillStyle = P[3]; c.font = '6px "Press Start 2P", monospace'; c.textAlign = 'center'; c.fillText('<', 147, 132);
      c.fillStyle = cur.length === 4 ? P[0] : P[2]; c.fillRect(6, 141, 150, 15); c.fillStyle = P[3]; c.fillText('CHECK', 81, 152);
      c.fillStyle = P[0]; c.textAlign = 'left'; c.fillText(`#${Math.max(0, solved) + 1}`, 4, 8);
    },
    down(x, y) {
      if (wait > 0) return;
      if (y >= 118 && y < 139) { if (x >= 136) { cur.pop(); haptic('tick'); return; } const k = Math.floor((x - 6) / 22); if (k >= 0 && k < 6 && cur.length < 4) { cur.push(k); haptic('tick'); sfx(500 + k * 60, .03, 'square', .03); } }
      else if (y >= 139) submit();
    },
    key(k, d) { if (!d) return; const n = '123456'.indexOf(k); if (n >= 0 && cur.length < 4) cur.push(n); if (k === 'Backspace') cur.pop(); if (k === 'Enter') submit(); if (k === ' ') { cur = code.slice(); submit(); } },
  };
}

export default {
  id: 'code-breaker', title: 'Code Breaker', tag: 'Pocket · Logic', retro: true, w: W, h: H, pal: 'mono', goal: 12,
  hint: 'Guess the hidden 4-symbol code. A solid pip means right symbol in the right place; a hollow pip means right symbol, wrong place. Crack it in 8 tries. Fewer tries score more.',
  make,
};

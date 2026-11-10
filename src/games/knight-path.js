// Knight Path: a lone knight on a little board, moving the way chess knights do (an L: two squares one
// way, one square across). Tap a square the knight can reach to jump there. Land on every lit square
// to clear the board before the sand timer runs out. Dark squares are holes.
import gs from '../gamescroll.js';
const { Feel } = gs.effects;
const { PAL } = gs.palettes;
const { text } = gs.pixel;
const { haptic } = gs.device;
const { sfx, notes } = gs.sound;

const R = PAL.mono;
let W = 160, H = 160;
const JUMPS = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];

function make(api) {
  const feel = new Feel({ pixel: true });
  let tmax, n, cells, kx, ky, lit, level, score, time, t, banner, hop, trail;

  const at = (x, y) => x >= 0 && y >= 0 && x < n && y < n ? cells[y * n + x] : -1;   // 0 floor, 1 lit, 2 hole
  const moves = (x, y) => JUMPS.map(([dx, dy]) => [x + dx, y + dy]).filter(([a, b]) => at(a, b) === 0 || at(a, b) === 1);

  function newBoard() {
    n = level < 3 ? 5 : level < 6 ? 6 : 7;
    // make the lit squares by walking a real knight's tour, so every board can be cleared
    for (let tries = 0; tries < 100; tries++) {
      cells = new Array(n * n).fill(0);
      kx = Math.random() * n | 0; ky = Math.random() * n | 0;
      let x = kx, y = ky; const path = new Set([ky * n + kx]), want = Math.min(n * n - 4, 4 + level * 2);
      for (let s = 0; s < want; s++) {
        const opts = JUMPS.map(([dx, dy]) => [x + dx, y + dy]).filter(([a, b]) => a >= 0 && b >= 0 && a < n && b < n && !path.has(b * n + a));
        if (!opts.length) break; [x, y] = opts[Math.random() * opts.length | 0]; path.add(y * n + x); cells[y * n + x] = 1;
      }
      lit = cells.filter(v => v === 1).length;
      if (lit < Math.min(want, 4 + level)) continue;
      // holes on squares the tour didn't use
      const holes = Math.min(n * 2, level - 1);
      for (let h = 0; h < holes; h++) { const i = Math.random() * n * n | 0; if (cells[i] === 0 && !path.has(i)) cells[i] = 2; }
      break;
    }
    time = tmax = 12 + lit * 2.2; trail = [];
    banner = { txt: `BOARD ${level}`, l: 1 };
  }
  function jump(x, y) {
    if (banner) return;
    if (!JUMPS.some(([dx, dy]) => kx + dx === x && ky + dy === y) || at(x, y) < 0 || at(x, y) === 2) { sfx(110, .06, 'square', .03); haptic('warning'); time -= .5; return; }
    trail.push([kx, ky]); if (trail.length > 3) trail.shift();
    hop = { fx: kx, fy: ky, k: 0 }; kx = x; ky = y;
    if (cells[y * n + x] === 1) {
      cells[y * n + x] = 0; lit--; score++; api.score(score); sfx(600 + (20 - lit) * 30, .06, 'square', .04); haptic('light');
      if (lit === 0) { const bonus = Math.floor(time / 3); score += bonus; api.score(score); notes('C5 E5 G5 C6', { len: .07 }); feel.win(W / 2, H / 2); banner = { txt: 'CLEAR!', sub: `+${bonus} TIME BONUS`, l: 1.4, next: true }; }
    } else { sfx(330, .04, 'square', .03); haptic('tick'); }
  }

  return {
    reset() { level = 1; score = 0; t = 0; hop = null; feel.clear(); newBoard(); },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      feel.update(dt); if (feel.frozen) return;
      t += dt;
      if (banner) { banner.l -= dt; if (banner.l <= 0) { const b = banner; banner = null; if (b.over) return api.over(); if (b.next) { level++; newBoard(); } } return; }
      if (hop) { hop.k += dt * 7; if (hop.k >= 1) hop = null; }
      time -= dt;
      if (time <= 0) { feel.lose(); banner = { txt: 'TIME UP', l: 1.2, over: true }; }
      else if (!moves(kx, ky).length) { feel.lose(); banner = { txt: 'STUCK!', l: 1.2, over: true }; }
    },
    draw(c) {
      c.fillStyle = R[3]; c.fillRect(0, 0, W, H);
      const top = 14, cs = Math.floor(Math.min((W - 8) / n, (H - top - 8) / n)), ox = Math.round((W - cs * n) / 2), oy = top + Math.round((H - top - 4 - cs * n) / 2);
      const can = new Set(moves(kx, ky).map(([a, b]) => b * n + a));
      feel.begin(c);
      for (let i = 0; i < n * n; i++) {
        const x = ox + (i % n) * cs, y = oy + (i / n | 0) * cs, v = cells[i], dark = ((i % n) + (i / n | 0)) % 2;
        if (v === 2) { c.fillStyle = R[0]; c.fillRect(x, y, cs, cs); continue; }
        c.fillStyle = dark ? R[2] : R[3]; c.fillRect(x, y, cs, cs);
        if (v === 1) { const p = 2 + ((t * 4 | 0) % 2); c.fillStyle = R[1]; c.fillRect(x + p, y + p, cs - p * 2, cs - p * 2); c.fillStyle = R[3]; c.fillRect(x + (cs >> 1) - 1, y + (cs >> 1) - 1, 2, 2); }
        if (can.has(i) && !banner) { c.fillStyle = (t * 3 | 0) % 2 ? R[0] : R[1]; c.fillRect(x + 1, y + 1, cs - 2, 1); c.fillRect(x + 1, y + cs - 2, cs - 2, 1); c.fillRect(x + 1, y + 1, 1, cs - 2); c.fillRect(x + cs - 2, y + 1, 1, cs - 2); }
      }
      c.fillStyle = R[0]; c.fillRect(ox - 1, oy - 1, cs * n + 2, 1); c.fillRect(ox - 1, oy + cs * n, cs * n + 2, 1); c.fillRect(ox - 1, oy, 1, cs * n); c.fillRect(ox + cs * n, oy, 1, cs * n);
      // the knight: a horse-head piece, hopping in an arc
      let px = kx, py = ky, lift = 0; if (hop) { const k = hop.k; px = hop.fx + (kx - hop.fx) * k; py = hop.fy + (ky - hop.fy) * k; lift = Math.sin(k * Math.PI) * cs * .6; }
      const x = Math.round(ox + px * cs + cs / 2), y = Math.round(oy + py * cs + cs / 2 - lift);
      c.fillStyle = R[0]; c.fillRect(x - 4, y + 3, 9, 3); c.fillRect(x - 3, y - 1, 6, 4); c.fillRect(x - 2, y - 6, 5, 5); c.fillRect(x - 4, y - 5, 3, 3); c.fillRect(x + 1, y - 8, 2, 2);
      c.fillStyle = R[3]; c.fillRect(x, y - 5, 1, 1);
      feel.end(c, W, H);
      // sand timer bar
      c.fillStyle = R[0]; c.fillRect(4, 4, 50, 5); c.fillStyle = R[3]; c.fillRect(5, 5, 48, 3); c.fillStyle = time < 5 && (t * 6 | 0) % 2 ? R[0] : R[1]; c.fillRect(5, 5, Math.round(48 * Math.max(0, Math.min(1, time / tmax))), 3);
      text(c, `${lit} LEFT`, W - 4, 4, { color: R[0], align: 'right' });
      if (banner) { text(c, banner.txt, W / 2, H / 2 - 6, { font: 'big', align: 'center', color: R[3], outline: R[0] }); if (banner.sub) text(c, banner.sub, W / 2, H / 2 + 8, { align: 'center', color: R[0] }); }
      else if (level === 1 && t < 4) text(c, 'TAP A MARKED SQUARE', W / 2, H - 9, { align: 'center', color: R[0] });
    },
    down(x, y) {
      const top = 14, cs = Math.floor(Math.min((W - 8) / n, (H - top - 8) / n)), ox = Math.round((W - cs * n) / 2), oy = top + Math.round((H - top - 4 - cs * n) / 2);
      const cx = Math.floor((x - ox) / cs), cy = Math.floor((y - oy) / cs);
      if (cx >= 0 && cy >= 0 && cx < n && cy < n) jump(cx, cy);
    },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'knight-path',
  title: 'Knight Path',
  tag: 'Pocket · Logic',
  retro: true, pal: 'mono',
  w: 160, h: 160, maxW: 220, maxH: 240,
  goal: 30,
  hint: 'The knight jumps in an L. Tap a marked square to jump, and land on every lit square before the sand runs out. Get stuck and it is over.',
  make,
};

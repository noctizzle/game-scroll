// Mirror Draw: trace the dotted shape, but your pen is mirrored. Move your finger right and the pen
// goes left (later: upside down, then both). Cover the whole shape without wandering off it. A badly
// traced shape costs a heart.
import gs from '../gamescroll.js';
const { Feel } = gs.effects;
const { C16 } = gs.palettes;
const { text } = gs.pixel;
const { haptic } = gs.device;
const { sfx, notes } = gs.sound;

let W = 160, H = 192;
const SHAPES = [
  [[0, 1], [.5, 0], [1, 1]],                                         // tent
  [[0, .5], [.25, 0], [.5, .5], [.75, 0], [1, .5]],                   // zigzag
  [[0, 1], [0, .35], [.5, 0], [1, .35], [1, 1], [0, 1]],              // house
  [[0, 0], [1, 0], [1, 1], [0, 1], [0, .2]],                          // box
  [[.5, 0], [.62, .38], [1, .38], [.69, .62], [.81, 1], [.5, .76], [.19, 1], [.31, .62], [0, .38], [.38, .38], [.5, 0]],  // star
  [[0, .2], [.3, 0], [.6, .3], [.3, .6], [.7, 1], [1, .7]],             // squiggle
  [[0, 1], [0, 0], [.5, .5], [1, 0], [1, 1]],                          // M
];
const MODES = ['MIRROR', 'UPSIDE DOWN', 'BOTH'];

function make(api) {
  const feel = new Feel({ pixel: true });
  let pts, hit, pen, ink, off, mode, level, score, hearts, time, t, banner, last;

  function newShape() {
    const sh = SHAPES[Math.random() * SHAPES.length | 0], s = Math.min(W - 40, H - 70), x0 = (W - s) / 2, y0 = 30 + (H - 50 - s) / 2;
    pts = [];
    for (let i = 1; i < sh.length; i++) { const [ax, ay] = sh[i - 1], [bx, by] = sh[i], n = Math.ceil(Math.hypot(bx - ax, by - ay) * s / 4); for (let k = 0; k < n; k++) pts.push([x0 + (ax + (bx - ax) * k / n) * s, y0 + (ay + (by - ay) * k / n) * s]); }
    pts.push([x0 + sh[sh.length - 1][0] * s, y0 + sh[sh.length - 1][1] * s]);
    hit = new Array(pts.length).fill(false); ink = []; off = 0; pen = null; last = null;
    mode = level < 3 ? 0 : level < 5 ? 1 : (Math.random() * 3 | 0);
    time = 9 + pts.length * .1;
    banner = { txt: MODES[mode], l: 1 };
  }
  const flip = (x, y) => [mode !== 1 ? W - x : x, mode !== 0 ? (30 + (H - 20)) - y : y];
  function finish() {
    const cov = hit.filter(Boolean).length / hit.length, pen0 = Math.min(3, Math.floor(off / 40));
    if (cov < .6) { hearts--; feel.hurt(W / 2, H / 2); haptic('error'); banner = { txt: `${Math.round(cov * 100)}%`, sub: hearts > 0 ? 'TOO MESSY' : 'OUT OF HEARTS', l: 1.3, next: hearts > 0 ? 'go' : 'over' }; return; }
    const pts2 = Math.max(1, Math.round(cov * 6) - pen0 + (mode === 2 ? 2 : mode)); score += pts2; api.score(score);
    feel.win(W / 2, H / 2); notes('C5 E5 G5', { len: .07 }); haptic('success');
    banner = { txt: `${Math.round(cov * 100)}%`, sub: `+${pts2}`, l: 1.1, next: 'go' };
  }

  return {
    reset() { level = 1; score = 0; hearts = 3; t = 0; feel.clear(); newShape(); },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      feel.update(dt); if (feel.frozen) return;
      t += dt;
      if (banner) { banner.l -= dt; if (banner.l <= 0) { const b = banner; banner = null; if (b.next === 'over') return api.over(); if (b.next === 'go') { level++; newShape(); } } return; }
      if (ink.length) time -= dt;
      if (time <= 0) return finish();
      if (hit.filter(Boolean).length / hit.length >= .97) finish();
    },
    draw(c) {
      c.fillStyle = C16[1]; c.fillRect(0, 0, W, H);
      c.fillStyle = C16[14]; for (let y = 24; y < H; y += 8) c.fillRect(0, y, W, 1);
      feel.begin(c);
      pts.forEach(([x, y], i) => { c.fillStyle = hit[i] ? C16[5] : C16[13]; if (hit[i] || i % 2 === 0) c.fillRect(Math.round(x) - 1, Math.round(y) - 1, 2, 2); });
      c.fillStyle = C16[2]; const [sx, sy] = pts[0]; c.fillRect(Math.round(sx) - 2, Math.round(sy) - 2, 5, 5);
      for (const p of ink) { c.fillStyle = p[2] ? C16[8] : C16[2]; c.fillRect(Math.round(p[0]), Math.round(p[1]), 1, 1); }
      if (pen) { c.fillStyle = C16[0]; c.fillRect(Math.round(pen[0]) - 1, Math.round(pen[1]) - 3, 3, 3); c.fillStyle = C16[9]; c.fillRect(Math.round(pen[0]) - 1, Math.round(pen[1]) - 6, 3, 3); }
      feel.end(c, W, H);
      c.fillStyle = C16[9]; c.fillRect(0, 0, W, 14); text(c, MODES[mode], 4, 4, { color: C16[1] });
      text(c, ink.length ? `${Math.max(0, time).toFixed(1)}` : 'START ON RED', W - 4, 4, { color: C16[4], align: 'right' });
      for (let i = 0; i < hearts; i++) { c.fillStyle = C16[2]; c.fillRect(4 + i * 7, H - 9, 5, 4); c.fillRect(5 + i * 7, H - 5, 3, 1); }
      const cov = hit.filter(Boolean).length / hit.length; c.fillStyle = C16[14]; c.fillRect(W - 54, H - 9, 50, 4); c.fillStyle = C16[5]; c.fillRect(W - 54, H - 9, Math.round(50 * cov), 4);
      if (banner) { text(c, banner.txt, W / 2, H / 2 - 8, { font: 'big', align: 'center', color: C16[9], outline: C16[1] }); if (banner.sub) text(c, banner.sub, W / 2, H / 2 + 6, { align: 'center', color: C16[0] }); }
    },
    down(x, y) { if (banner) return; pen = flip(x, y); last = pen; },
    move(x, y, p) {
      if (!p || banner || !pen) return;
      pen = flip(x, y);
      const d = Math.hypot(pen[0] - last[0], pen[1] - last[1]);
      if (d < 1) return;
      let near = 99; pts.forEach(([px, py], i) => { const e = Math.hypot(px - pen[0], py - pen[1]); if (e < near) near = e; if (e < 6 && !hit[i]) { hit[i] = true; if (Math.random() < .3) sfx(800 + i * 3, .02, 'square', .015); } });
      const on = near < 8; if (!on) { off += d; if (Math.random() < .3) haptic('tick'); }
      for (let k = 0; k < d; k++) ink.push([last[0] + (pen[0] - last[0]) * k / d, last[1] + (pen[1] - last[1]) * k / d, on]);
      if (ink.length > 3000) ink.splice(0, 500);
      last = pen;
    },
    up() { if (ink.length > 20 && !banner) finish(); pen = null; },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'mirror-draw',
  title: 'Mirror Draw',
  tag: 'Color · Brain',
  retro: true, era: 'color', pal: 'berry',
  w: 160, h: 192, maxW: 220, maxH: 240,
  goal: 30,
  hint: 'Trace the dotted shape in one go, starting on red. Your pen is mirrored: right moves left. Later it flips upside down too.',
  make,
};

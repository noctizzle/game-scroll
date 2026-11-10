// Lamp Flip: a grid of lamps, some on and some off. Tapping a lamp flips it and the lamps next to it
// (up, down, left, right). Turn every lamp on before the fuse burns down. Do it in as few taps as the
// puzzle was scrambled with for a bonus. The grid grows as you go.
import gs from '../gamescroll.js';
const { Feel } = gs.effects;
const { PAL } = gs.palettes;
const { text } = gs.pixel;
const { haptic } = gs.device;
const { sfx, notes } = gs.sound;

const R = PAL.berry;
let W = 160, H = 160;

function make(api) {
  const feel = new Feel({ pixel: true });
  let n, on, par, taps, fuse, fmax, score, lives, solved, t, banner;
  const CS = () => Math.floor(Math.min(W - 16, H - 36) / n), GX = () => Math.round((W - CS() * n) / 2), GY = () => 20 + Math.round((H - 28 - CS() * n) / 2);

  function flip(i) { const r = Math.floor(i / n), c = i % n; for (const [dr, dc] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) { const rr = r + dr, cc = c + dc; if (rr >= 0 && rr < n && cc >= 0 && cc < n) on[rr * n + cc] = !on[rr * n + cc]; } }
  function newGrid() {
    n = solved < 3 ? 3 : solved < 8 ? 4 : 5;
    on = new Array(n * n).fill(true);
    const presses = new Set(); par = Math.min(n * n - 1, 2 + Math.floor(solved / 2));
    while (presses.size < par) presses.add(Math.random() * n * n | 0);
    for (const i of presses) flip(i);
    if (on.every(Boolean)) flip(0);
    taps = 0; fmax = fuse = 8 + par * 3;
  }

  return {
    reset() { score = 0; lives = 3; solved = 0; t = 0; banner = null; feel.clear(); newGrid(); },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      feel.update(dt); if (feel.frozen) return;
      t += dt;
      if (banner) { banner.l -= dt; if (banner.l <= 0) { const b = banner; banner = null; if (b.over) return api.over(); newGrid(); } return; }
      fuse -= dt;
      if (fuse <= 0) { lives--; feel.hurt(W / 2, H / 2); haptic('error'); sfx(120, .3, 'square', .04); banner = { txt: 'FUSE OUT', l: 1.2, over: lives <= 0 }; }
    },
    draw(c) {
      c.fillStyle = R[0]; c.fillRect(0, 0, W, H);
      const cs = CS(), gx = GX(), gy = GY();
      feel.begin(c);
      for (let i = 0; i < n * n; i++) {
        const x = gx + (i % n) * cs, y = gy + Math.floor(i / n) * cs, m = Math.max(2, Math.floor(cs * .12));
        c.fillStyle = R[1]; c.fillRect(x + 1, y + 1, cs - 2, cs - 2);
        c.fillStyle = on[i] ? R[3] : R[0]; c.fillRect(x + m, y + m, cs - m * 2, cs - m * 2);
        if (on[i]) { c.fillStyle = R[2]; c.fillRect(x + m + 2, y + m + 2, cs - m * 2 - 4, 2); }
      }
      feel.end(c, W, H);
      // the fuse along the top
      c.fillStyle = R[1]; c.fillRect(30, 6, W - 60, 3); c.fillStyle = R[3]; const fw = Math.round((W - 60) * Math.max(0, fuse / fmax)); c.fillRect(30, 6, fw, 3);
      if (Math.floor(t * 10) % 2) { c.fillStyle = R[2]; c.fillRect(30 + fw - 1, 4, 3, 3); }
      text(c, `${score}`, 4, 3, { color: R[3] });
      for (let i = 0; i < lives; i++) { c.fillStyle = R[3]; c.fillRect(W - 8 - i * 6, 4, 4, 4); }
      text(c, solved === 0 && t < 5 ? 'LIGHT EVERY LAMP' : `TAPS ${taps}/${par}`, W / 2, H - 8, { align: 'center', color: R[2] });
      if (banner) { c.fillStyle = R[0]; c.fillRect(0, H / 2 - 9, W, 18); text(c, banner.txt, W / 2, H / 2 - 4, { font: 'big', align: 'center', color: R[3] }); }
    },
    down(x, y) {
      if (banner) return;
      const cs = CS(), c0 = Math.floor((x - GX()) / cs), r0 = Math.floor((y - GY()) / cs);
      if (c0 < 0 || c0 >= n || r0 < 0 || r0 >= n) return;
      flip(r0 * n + c0); taps++; sfx(on[r0 * n + c0] ? 900 : 500, .04, 'square', .03); haptic('tick');
      if (on.every(Boolean)) {
        solved++; const pts = 1 + n - 2 + (taps <= par ? 2 : 0); score += pts; api.score(score);
        notes('C5 E5 G5 C6', { len: .05 }); feel.win(W / 2, H / 2); haptic('success');
        banner = { txt: taps <= par ? 'PERFECT!' : 'ALL LIT', l: .9 };
      }
    },
    key(k, d) { if (d && k >= '1' && k <= '9') { const i = +k - 1; if (i < n * n) this.down(GX() + (i % n + .5) * CS(), GY() + (Math.floor(i / n) + .5) * CS()); } },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'lamp-flip',
  title: 'Lamp Flip',
  tag: 'Pocket · Logic',
  retro: true, pal: 'berry',
  w: 160, h: 160, maxW: 220, maxH: 240,
  goal: 25,
  hint: 'Tapping a lamp flips it and its neighbours. Light every lamp before the fuse burns out; matching the tap count earns a bonus.',
  make,
};

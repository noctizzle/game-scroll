// Cup Shuffle: a pea goes under one of the cups, then the cups swap places, faster and faster. Keep
// your eye on the right cup and tap it when they stop. More cups and quicker swaps each round. Three
// wrong guesses and the show packs up.
import gs from '../gamescroll.js';
const { Feel } = gs.effects;
const { C16 } = gs.palettes;
const { text } = gs.pixel;
const { haptic } = gs.device;
const { sfx, notes } = gs.sound;

let W = 160, H = 176;
const K = C16;

function make(api) {
  const feel = new Feel({ pixel: true });
  let cups, pea, phase, pt, swaps, cur, round, score, misses, t, picked, lift;
  const slotX = (i, n) => Math.round(W * (i + .5) / n);
  const CY = () => Math.round(H * .58);

  function newRound() {
    round++;
    const n = round < 4 ? 3 : round < 9 ? 4 : 5;
    cups = []; for (let i = 0; i < n; i++) cups.push({ slot: i, x: slotX(i, n), y: CY(), from: i, to: i });
    pea = Math.random() * n | 0;
    swaps = 4 + round; cur = null; picked = -1;
    phase = 'show'; pt = 1.2; lift = 1;
  }
  function nextSwap() {
    const n = cups.length, a = Math.random() * n | 0; let b = Math.random() * (n - 1) | 0; if (b >= a) b++;
    const dur = Math.max(.16, .5 - round * .03);
    cur = { a, b, k: 0, dur, up: Math.random() < .5 };
    sfx(300 + Math.random() * 80, .05, 'square', .02); haptic('tick');
  }

  return {
    reset() { round = 0; score = 0; misses = 0; t = 0; feel.clear(); newRound(); },
    resize(w, h) { W = w; H = h; if (cups) cups.forEach(c => { c.x = slotX(c.slot, cups.length); c.y = CY(); }); },
    update(dt) {
      feel.update(dt); if (feel.frozen) return;
      t += dt;
      const n = cups.length;
      if (phase === 'show') { pt -= dt; lift = pt > .4 ? 1 : Math.max(0, pt / .4); if (pt <= 0) { phase = 'shuffle'; lift = 0; } return; }
      if (phase === 'shuffle') {
        if (!cur) { if (swaps-- <= 0) { phase = 'pick'; return; } nextSwap(); }
        cur.k += dt / cur.dur;
        const A = cups[cur.a], B = cups[cur.b], k = Math.min(1, cur.k), e = k * k * (3 - 2 * k);
        const xa = slotX(A.slot, n), xb = slotX(B.slot, n), arc = Math.sin(k * Math.PI) * 14 * (cur.up ? 1 : -1);
        A.x = xa + (xb - xa) * e; A.y = CY() - arc; B.x = xb + (xa - xb) * e; B.y = CY() + arc;
        if (k >= 1) { const s = A.slot; A.slot = B.slot; B.slot = s; A.x = slotX(A.slot, n); B.x = slotX(B.slot, n); A.y = B.y = CY(); cur = null; }
        return;
      }
      if (phase === 'reveal') { lift = Math.min(1, lift + dt * 4); pt -= dt; if (pt <= 0) { if (misses >= 3) return api.over(); newRound(); } }
    },
    draw(c) {
      c.fillStyle = K[9]; c.fillRect(0, 0, W, H);
      // striped tent back and a table
      c.fillStyle = K[10]; for (let x = 0; x < W; x += 16) c.fillRect(x, 0, 8, Math.round(H * .4));
      c.fillStyle = K[12]; c.fillRect(0, CY() + 12, W, H - CY() - 12); c.fillStyle = K[11]; c.fillRect(0, CY() + 10, W, 4);
      feel.begin(c);
      const n = cups.length;
      // the pea sits on the table under its cup
      const pc = cups[pea];
      if (phase === 'show' || phase === 'reveal') { c.fillStyle = K[5]; c.fillRect(Math.round(pc.x) - 3, CY() + 5, 6, 5); c.fillStyle = K[1]; c.fillRect(Math.round(pc.x) - 2, CY() + 5, 2, 2); }
      const order = cups.map((cp, i) => i).sort((a, b) => cups[a].y - cups[b].y);
      for (const i of order) {
        const cp = cups[i], up = (phase === 'show' || (phase === 'reveal' && (i === pea || i === picked))) ? lift * 22 : 0;
        const x = Math.round(cp.x), y = Math.round(cp.y - up), w = Math.min(34, Math.floor(W / n) - 8) & ~1;
        c.fillStyle = K[0]; c.fillRect(x - w / 2 - 1, y - 20, w + 2, 32);
        c.fillStyle = K[2]; c.fillRect(x - w / 2, y - 18, w, 29); c.fillRect(x - w / 2 + 3, y - 20, w - 6, 2);
        c.fillStyle = K[1]; c.fillRect(x - w / 2 + 2, y - 2, w - 4, 3);
        c.fillStyle = K[10]; c.fillRect(x - w / 2 + 3, y - 15, 2, 10);
        if (phase === 'pick') { c.fillStyle = K[4]; if (Math.floor(t * 3) % 2) c.fillRect(x - 2, y - 28, 4, 3); }
      }
      feel.end(c, W, H);
      text(c, `ROUND ${round}`, 4, 3, { color: K[1] });
      for (let i = 0; i < 3 - misses; i++) { c.fillStyle = K[4]; c.fillRect(W - 9 - i * 7, 3, 5, 5); }
      if (phase === 'show') text(c, 'WATCH THE PEA', W / 2, H - 16, { align: 'center', color: K[1] });
      if (phase === 'pick') text(c, 'WHICH CUP?', W / 2, H - 16, { align: 'center', color: K[4] });
      if (phase === 'reveal') text(c, picked === pea ? 'FOUND IT!' : 'NOT THAT ONE', W / 2, H - 16, { align: 'center', color: picked === pea ? K[5] : K[4] });
    },
    down(x, y) {
      if (phase !== 'pick') return;
      let best = -1, bd = 1e9;
      cups.forEach((cp, i) => { const d = Math.abs(cp.x - x); if (d < bd) { bd = d; best = i; } });
      if (bd > W / cups.length / 2 + 4) return;
      picked = best; phase = 'reveal'; pt = 1.2; lift = 0;
      if (best === pea) { score += cups.length - 2; api.score(score); notes('C5 E5 G5', { len: .06 }); feel.coin(cups[best].x, CY() - 20); haptic('success'); }
      else { misses++; feel.hurt(cups[best].x, CY() - 20); haptic('error'); sfx(130, .25, 'square', .04); }
    },
    key(k, d) { if (d && k >= '1' && k <= '5' && phase === 'pick') { const s = +k - 1, i = cups.findIndex(cp => cp.slot === s); if (i >= 0) this.down(cups[i].x, CY()); } },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'cup-shuffle',
  title: 'Cup Shuffle',
  tag: 'Color · Eye',
  retro: true, era: 'color', pal: 'lemon',
  w: 160, h: 176, maxW: 220, maxH: 240,
  goal: 12,
  hint: 'Watch which cup hides the pea while they swap, then tap that cup. Three wrong guesses and it is over.',
  make,
};

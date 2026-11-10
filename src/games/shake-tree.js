// Shake Tree: shake the phone (or tap the trunk fast) to shake apples out of the tree into your basket.
// But there's a beehive up there, and every shake makes it buzz louder. Tap the basket to carry your
// apples home before the bees come out; if they do, you drop the lot. Three stings and you're done.
import gs from '../gamescroll.js';
const { Feel } = gs.effects;
const { text } = gs.pixel;
const { haptic, onShake } = gs.device;
const { sfx, notes, noise } = gs.sound;
const { rnd } = gs.util;

let W = 176, H = 176;

function make(api) {
  const feel = new Feel({ pixel: true });
  let apples, falling, basket, anger, calm, score, stings, t, wob, bees, banner, tree, taps;
  onShake(() => shake(1));

  function grow() {
    tree++;
    apples = []; for (let i = 0; i < 10 + tree * 2; i++) { const a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * 46; apples.push({ x: Math.round(W / 2 + Math.cos(a) * r), y: Math.round(62 + Math.sin(a) * r * .55), gold: Math.random() < .08 }); }
    falling = []; basket = 0; anger = 0; calm = rnd(.45, .8) - Math.min(.2, tree * .02); bees = null;
  }
  function shake(power) {
    if (banner || bees) return;
    wob = 1; haptic('light'); noise(.08, { vol: .04, from: 1500, to: 400 });
    // each shake knocks some apples loose and stirs the hive
    const n = Math.min(apples.length, Math.random() < .5 * power ? 2 : 1);
    for (let i = 0; i < n; i++) { const a = apples.splice(Math.random() * apples.length | 0, 1)[0]; falling.push({ ...a, vy: 0 }); }
    anger += rnd(.03, .09) * power;
    if (anger > calm) { bees = { t: 0, x: W / 2 + 30, y: 34 }; sfx(220, .6, 'sawtooth', .04, 40); haptic('error'); }
  }

  return {
    reset() { score = 0; stings = 0; t = 0; wob = 0; banner = null; tree = 0; taps = 0; grow(); feel.clear(); },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      feel.update(dt); if (feel.frozen) return;
      t += dt; wob = Math.max(0, wob - dt * 4); anger = Math.max(0, anger - dt * .02);
      for (const f of falling) { f.vy += 300 * dt; f.y += f.vy * dt; if (f.y > H - 34 && !f.in) { f.in = true; basket += f.gold ? 5 : 1; sfx(500 + basket * 10, .03, 'square', .02); } }
      falling = falling.filter(f => !f.in);
      if (bees) {
        bees.t += dt;
        if (bees.t > 1.4) { stings++; feel.hurt(W / 2, H - 30); banner = { txt: 'STUNG! APPLES DROPPED', l: 1.4, over: stings >= 3 }; bees = null; basket = 0; }
      }
      if (banner) { banner.l -= dt; if (banner.l <= 0) { const b = banner; banner = null; if (b.over) return api.over(); grow(); } }
      if (!banner && !bees && apples.length === 0 && falling.length === 0) bank();
    },
    draw(c) {
      c.fillStyle = '#98d8f8'; c.fillRect(0, 0, W, H);
      c.fillStyle = '#58b848'; c.fillRect(0, H - 30, W, 30); c.fillStyle = '#48a038'; for (let x = 0; x < W; x += 6) c.fillRect(x, H - 30, 3, 2);
      feel.begin(c);
      const sx = Math.round(Math.sin(t * 40) * wob * 3);
      // trunk and crown
      c.fillStyle = '#885830'; c.fillRect(W / 2 - 8, 80, 16, H - 110); c.fillStyle = '#704820'; c.fillRect(W / 2 - 8, 80, 4, H - 110);
      c.fillStyle = '#287838'; c.fillRect(W / 2 - 58 + sx, 28, 116, 70); c.fillRect(W / 2 - 46 + sx, 18, 92, 90);
      c.fillStyle = '#389848'; c.fillRect(W / 2 - 40 + sx, 24, 30, 20); c.fillRect(W / 2 + 8 + sx, 38, 34, 22);
      for (const a of apples) { c.fillStyle = a.gold ? '#f8d038' : '#e83838'; c.fillRect(a.x - 3 + sx, a.y - 3, 6, 6); c.fillStyle = '#ffffff80'; c.fillRect(a.x - 2 + sx, a.y - 2, 2, 2); }
      // the hive, buzzing harder as it gets angry
      const hx = W / 2 + 30 + sx + Math.round(Math.sin(t * 50) * anger * 3), hy = 30;
      c.fillStyle = '#c89838'; c.fillRect(hx - 7, hy, 14, 16); c.fillStyle = '#a07020'; c.fillRect(hx - 7, hy + 4, 14, 2); c.fillRect(hx - 7, hy + 9, 14, 2); c.fillStyle = '#202020'; c.fillRect(hx - 2, hy + 12, 4, 3);
      for (const f of falling) { c.fillStyle = f.gold ? '#f8d038' : '#e83838'; c.fillRect(Math.round(f.x) - 3, Math.round(f.y) - 3, 6, 6); }
      if (bees) for (let i = 0; i < 8; i++) { const a = bees.t * 6 + i, d = bees.t * 60 + i * 4, x = Math.round(hx + Math.cos(a) * d * .6 + (W / 2 - hx) * Math.min(1, bees.t)), y = Math.round(hy + 10 + Math.sin(a * 1.3) * 10 + (H - 40 - hy) * Math.min(1, bees.t / 1.2)); c.fillStyle = '#f8d038'; c.fillRect(x - 2, y - 1, 4, 3); c.fillStyle = '#202020'; c.fillRect(x, y - 1, 1, 3); }
      // basket
      const bx = Math.round(W / 2) - 20, by = H - 34;
      c.fillStyle = '#a06838'; c.fillRect(bx, by, 40, 14); c.fillStyle = '#c08048'; for (let x = bx + 2; x < bx + 40; x += 5) c.fillRect(x, by + 2, 2, 10);
      c.fillStyle = '#704820'; c.fillRect(bx + 4, by - 6, 2, 6); c.fillRect(bx + 34, by - 6, 2, 6); c.fillRect(bx + 4, by - 8, 32, 2);
      feel.end(c, W, H);
      // hive mood meter
      c.fillStyle = '#00000040'; c.fillRect(W - 46, 4, 40, 5); c.fillStyle = anger / calm > .7 ? '#e83838' : '#f8a838'; c.fillRect(W - 46, 4, Math.round(40 * Math.min(1, anger / calm)), 5);
      text(c, 'HIVE', W - 66, 3, { color: '#202028' });
      text(c, `${score}`, 4, 3, { color: '#202028' });
      for (let i = 0; i < 3 - stings; i++) { c.fillStyle = '#e83838'; c.fillRect(4 + i * 7, 12, 5, 5); }
      text(c, `BASKET ${basket}`, W / 2, H - 12, { align: 'center', color: '#f8f8f0', outline: '#284028' });
      if (banner) { c.fillStyle = '#202028d0'; c.fillRect(0, H / 2 - 12, W, 22); text(c, banner.txt, W / 2, H / 2 - 5, { align: 'center', color: '#f8d038' }); }
      else if (tree === 1 && t < 6) text(c, 'SHAKE OR TAP THE TREE', W / 2, 112, { align: 'center', color: '#f8f8f0', outline: '#202028' });
      else if (basket && !bees) text(c, 'TAP BASKET TO BANK', W / 2, 112, { align: 'center', color: '#f8f8f0', outline: '#202028' });
    },
    down(x, y) {
      if (banner || bees) return;
      if (y > H - 46 && Math.abs(x - W / 2) < 30) return bank();
      if (y < H - 40) { taps++; shake(.8); }
    },
    key(k, d) { if (!d) return; if (k === ' ') shake(.8); if (k === 'Enter') bank(); },
  };

  function bank() {
    if (bees || banner) return;
    if (basket) { score += basket; api.score(score); notes('C5 E5 G5', { len: .05 }); feel.coin(W / 2, H - 34); haptic('success'); }
    banner = { txt: basket ? `BANKED ${basket}` : 'NEW TREE', l: 1 }; basket = 0;
  }
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'shake-tree',
  title: 'Shake Tree',
  tag: 'Advance · Luck',
  retro: true, era: 'advance', pal: 'grape',
  w: 176, h: 176, maxW: 240, maxH: 240,
  goal: 80,
  hint: 'Shake the phone (or tap the tree) to drop apples into the basket, then tap the basket to bank them before the angry bees come out. Three stings and it is over.',
  make,
};

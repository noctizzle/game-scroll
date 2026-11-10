// Till Rush: you run the corner shop's till. Each customer's shopping comes to a price and they hand
// you a note. Tap coins from the till to count out their change, then tap GIVE. Exact change keeps
// the queue happy; using the fewest coins earns a tip. Get it wrong three times and the boss steps in.
import gs from '../gamescroll.js';
const { Feel } = gs.effects;
const { text } = gs.pixel;
const { haptic } = gs.device;
const { sfx, notes } = gs.sound;
const { art } = gs;

let W = 176, H = 224;
const COINS = [1, 2, 5, 10, 20, 50];
const CC = { 1: '#c87838', 2: '#c87838', 5: '#d8d8e0', 10: '#d8d8e0', 20: '#f8d038', 50: '#f8d038' };

function make(api) {
  const feel = new Feel({ pixel: true });
  let price, paid, given, patience, pmax, served, score, strikes, t, banner, face, queue;
  const best = n => { let k = 0; for (const c of [...COINS].reverse()) while (n >= c) { n -= c; k++; } return k; };
  const sum = () => given.reduce((a, b) => a + b, 0);
  const top = () => Math.max(160, H - 80);
  const coinXY = i => { const cols = 3, w = (W - 16) / cols, row = Math.floor(i / cols), col = i % cols, gap = Math.min(30, (H - top() - 8) / 2); return [Math.round(8 + w * col + w / 2), Math.round(top() + gap / 2 + 4 + row * gap)]; };
  const giveBtn = () => ({ x: W - 50, y: 116, w: 44, h: 18 });

  function next() {
    served++;
    const hard = Math.min(1, served / 12);
    price = 1 + Math.random() * (40 + hard * 50) | 0;
    paid = price < 20 ? 20 : price < 50 ? 50 : 100;
    if (Math.random() < .3 && price < 90 && price % 5 !== 0) { paid += price % 10; }   // some hand over odd coins too
    if (paid === price) paid = price < 50 ? 50 : 100;
    given = []; pmax = patience = Math.max(6, 14 - served * .35);
    face = art.face(served * 7919 + 3);
  }
  function give() {
    if (banner) return;
    const want = paid - price, s = sum();
    if (s === want) {
      const tip = given.length <= best(want) ? 2 : 0, pts = 2 + tip + (patience > pmax / 2 ? 1 : 0);
      score += pts; api.score(score); notes('E5 G5', { len: .06 }); feel.coin(W / 2, 60); haptic('success');
      banner = { txt: tip ? 'THANKS! +TIP' : 'THANKS!', sub: `+${pts}`, l: .8 };
    } else {
      strikes++; feel.hurt(W / 2, 60); haptic('error'); sfx(140, .2, 'square', .04);
      banner = { txt: s < want ? 'SHORT CHANGED!' : 'TOO MUCH!', sub: `CHANGE WAS ${want}`, l: 1.3, over: strikes >= 3 };
    }
  }

  return {
    reset() { served = 0; score = 0; strikes = 0; t = 0; queue = 3; banner = null; feel.clear(); next(); },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      feel.update(dt); if (feel.frozen) return;
      t += dt;
      if (banner) { banner.l -= dt; if (banner.l <= 0) { const b = banner; banner = null; if (b.over) return api.over(); next(); } return; }
      patience -= dt;
      if (patience <= 0) { strikes++; feel.hurt(W / 2, 60); haptic('error'); banner = { txt: 'WALKED OUT!', sub: `CHANGE WAS ${paid - price}`, l: 1.3, over: strikes >= 3 }; }
    },
    draw(c) {
      c.fillStyle = '#f0e0c0'; c.fillRect(0, 0, W, H);
      // shelves behind
      c.fillStyle = '#a06838'; for (let y = 8; y < 90; y += 26) c.fillRect(0, y + 18, W, 3);
      const goods = ['#e85858', '#58a8e8', '#f8c838', '#68c868', '#c878e8'];
      for (let y = 8; y < 90; y += 26) for (let x = 4; x < W; x += 12) { c.fillStyle = goods[(x * 7 + y) % 5]; c.fillRect(x, y + 8 + ((x + y) % 3), 8, 10 - ((x + y) % 3)); }
      // customer
      c.fillStyle = '#58689880'; c.fillRect(W / 2 - 26, 40, 52, 70);
      face.draw(c, W / 2, 62, 40, Math.max(-1, Math.min(1, patience / pmax * 2 - 1)));
      // counter and receipt
      c.fillStyle = '#704828'; c.fillRect(0, 108, W, 6); c.fillStyle = '#885830'; c.fillRect(0, 114, W, H - 114);
      c.fillStyle = '#f8f8f0'; c.fillRect(6, 118, 76, 34);
      text(c, `PRICE  ${price}`, 10, 122, { color: '#202028' });
      text(c, `PAID   ${paid}`, 10, 131, { color: '#202028' });
      text(c, `CHANGE ${sum()}`, 10, 142, { color: sum() > paid - price ? '#e04040' : '#2a7a3a' });
      const g = giveBtn(); c.fillStyle = '#38a858'; c.fillRect(g.x, g.y, g.w, g.h); c.fillStyle = '#287838'; c.fillRect(g.x, g.y + g.h - 2, g.w, 2); text(c, 'GIVE', g.x + g.w / 2, g.y + 6, { align: 'center', color: '#f8f8f0' });
      // the coins you've counted out on the counter
      given.forEach((v, i) => { const x = 90 + (i % 6) * 13, y = 140 + Math.floor(i / 6) * 7; c.fillStyle = CC[v]; c.fillRect(x - 5, y - 3, 11, 7); c.fillStyle = '#00000040'; c.fillRect(x - 5, y + 3, 11, 1); });
      if (given.length) text(c, 'TAP TO TAKE BACK', 132, 153, { align: 'center', color: '#f0d0a0' });
      // patience
      c.fillStyle = '#00000040'; c.fillRect(W / 2 - 26, 114 - 4, 52, 3); c.fillStyle = patience < pmax * .3 ? '#e04040' : '#f8c838'; c.fillRect(W / 2 - 26, 110, Math.round(52 * Math.max(0, patience / pmax)), 3);
      feel.begin(c);
      // the till drawer
      c.fillStyle = '#383840'; c.fillRect(4, top(), W - 8, H - top() - 4);
      COINS.forEach((v, i) => { const [x, y] = coinXY(i), r = v >= 20 ? 11 : v >= 5 ? 10 : 9; c.fillStyle = '#202028'; c.fillRect(x - r - 1, y - r + 1, r * 2 + 2, r * 2 - 2); c.fillStyle = CC[v]; c.fillRect(x - r, y - r + 2, r * 2, r * 2 - 4); c.fillRect(x - r + 2, y - r, r * 2 - 4, r * 2); c.fillStyle = '#ffffff50'; c.fillRect(x - r + 2, y - r + 2, 3, 3); text(c, String(v), x, y - 2, { align: 'center', color: '#202028' }); });
      feel.end(c, W, H);
      text(c, `SERVED ${served - 1}`, 4, 2, { color: '#704828' });
      for (let i = 0; i < 3 - strikes; i++) { c.fillStyle = '#e04040'; c.fillRect(W - 10 - i * 7, 2, 5, 5); }
      if (banner) { c.fillStyle = '#202028d0'; c.fillRect(0, 70, W, 30); text(c, banner.txt, W / 2, 75, { font: 'big', align: 'center', color: '#f8f8f0' }); text(c, banner.sub, W / 2, 89, { align: 'center', color: '#f8d038' }); }
      else if (served === 1 && t < 5) text(c, 'TAP COINS, THEN GIVE', W / 2, 100, { align: 'center', color: '#f8f8f0', outline: '#202028' });
    },
    down(x, y) {
      if (banner) return;
      const g = giveBtn(); if (x > g.x - 3 && x < g.x + g.w + 3 && y > g.y - 3 && y < g.y + g.h + 3) return give();
      if (y > 132 && y < 160 && x > 84 && given.length) { const v = given.pop(); sfx(500 + v * 8, .03, 'square', .02); haptic('tick'); return; }
      COINS.forEach((v, i) => { const [cx, cy] = coinXY(i); if (Math.abs(x - cx) < 22 && Math.abs(y - cy) < 14) { given.push(v); sfx(900 + v * 10, .04, 'square', .03); haptic('light'); } });
    },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'till-rush',
  title: 'Till Rush',
  tag: 'Advance · Shop',
  retro: true, era: 'advance', pal: 'lemon',
  w: 176, h: 224, maxW: 240, maxH: 280,
  goal: 30,
  hint: 'Work out the change: tap coins from the till to make paid minus price, then tap GIVE. Fewest coins earns a tip.',
  make,
};

// Auction Snipe: treasures come up one at a time at the market auction. The appraiser gives a rough idea
// of each one's worth, and three other bidders want it too. Tap +5 or +20 to bid; a bid in the last two
// seconds adds time. Win things for less than they're worth. Your score is the profit you make.
import gs from '../gamescroll.js';
const { Feel } = gs.effects;
const { haptic } = gs.device;
const { sfx, notes } = gs.sound;
const { art } = gs;
const { rnd } = gs.util;

let W = 360, H = 640;
const BASE = { common: 20, uncommon: 40, rare: 80, epic: 150, legendary: 280 };

function make(api) {
  const feel = new Feel();
  let cash, profit, lot, lots, item, value, est, price, leader, clock, bots, phase, t, msg, ml, ended, history;

  function newLot() {
    lot++;
    const seed = (Math.random() * 1e9) | 0;
    item = art.item(seed);
    value = Math.round(BASE[item.rarity] * (.7 + item.power / 100 * .6) * rnd(.85, 1.2));
    const spread = Math.round(value * rnd(.25, .45));
    est = [Math.max(5, value - spread + Math.round(rnd(-.1, .1) * value)), value + spread];
    price = Math.max(5, Math.round(est[0] * .3 / 5) * 5); leader = null; clock = 8; phase = 'bid';
    // each bidder values it a little differently; one is often too keen
    bots.forEach((b, i) => { b.max = Math.round(value * rnd(.6, i === lot % 3 ? 1.25 : 1.05)); b.next = rnd(.6, 2); });
  }

  return {
    reset() {
      cash = 200; profit = 0; lot = 0; lots = 10; t = 0; msg = ''; ml = 0; ended = false; history = [];
      bots = [0, 1, 2].map(i => { const s = (Math.random() * 1e9) | 0; return { name: art.name(s, 'person').split(' ')[0], face: art.face(s), max: 0, next: 0, col: ['#e76f51', '#2a9d8f', '#8338ec'][i] }; });
      newLot(); feel.clear();
    },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      feel.update(dt); if (feel.frozen) return;
      t += dt; if (ml > 0) ml -= dt;
      if (phase === 'sold') { clock -= dt; if (clock <= 0) { if (lot >= lots || cash < 5) { if (!ended) { ended = true; api.over(); } return; } newLot(); } return; }
      clock -= dt;
      for (const b of bots) {
        b.next -= dt;
        if (b.next <= 0 && leader !== b && price + 5 <= b.max) {
          price += price < 60 ? 5 : 10; leader = b; b.next = rnd(.7, 2.2) + (clock < 2 ? -.4 : 0);
          if (clock < 2) clock = 2; sfx(330, .05, 'triangle', .03);
        } else if (b.next <= 0) b.next = rnd(.5, 1.5);
      }
      if (clock <= 0) {
        phase = 'sold'; clock = 2.2;
        if (leader === 'you') {
          cash -= price; const gain = value - price; profit += gain; history.push(gain);
          api.score(Math.max(0, profit));
          msg = gain >= 0 ? `Worth ${value}! +${gain}` : `Worth only ${value}. ${gain}`; ml = 2;
          if (gain >= 0) { notes('C5 E5 G5', { len: .06 }); feel.coin(W / 2, 200); haptic('success'); } else { feel.hurt(W / 2, 200); haptic('error'); }
        } else if (leader) { msg = `${leader.name} won it (worth ${value})`; ml = 2; }
        else { msg = 'No sale'; ml = 2; }
      }
    },
    draw(c) {
      c.fillStyle = '#fdf0d5'; c.fillRect(0, 0, W, H);
      c.fillStyle = '#780000'; c.fillRect(0, 0, W, 34); for (let x = 0; x < W; x += 24) { c.fillStyle = '#c1121f'; c.beginPath(); c.moveTo(x, 34); c.lineTo(x + 24, 34); c.lineTo(x + 12, 48); c.fill(); }
      c.textAlign = 'left'; c.fillStyle = '#003049'; c.font = '700 14px Rubik, sans-serif'; c.fillText(`Lot ${lot} of ${lots}`, 16, 70);
      c.textAlign = 'right'; c.fillText(`Cash ${cash}`, W - 16, 70);
      // the item on a stand
      c.fillStyle = '#669bbc'; c.beginPath(); c.roundRect(W / 2 - 80, 84, 160, 150, 14); c.fill();
      feel.begin(c);
      item.draw(c, W / 2, 158, 90);
      feel.end(c, W, H);
      c.textAlign = 'center'; c.fillStyle = item.rarityColour; c.font = '800 14px Rubik, sans-serif'; c.fillText(item.rarity.toUpperCase() + ' ' + item.kind.toUpperCase(), W / 2, 254);
      c.fillStyle = '#003049'; c.font = '600 14px Rubik, sans-serif'; c.fillText(`Appraiser says: ${est[0]} to ${est[1]}`, W / 2, 276);
      // price and clock
      c.font = '800 44px Rubik, sans-serif'; c.fillStyle = leader === 'you' ? '#2a9d8f' : '#780000'; c.fillText(price, W / 2, 334);
      c.font = '600 14px Rubik, sans-serif'; c.fillStyle = '#003049'; c.fillText(leader === 'you' ? 'You are winning' : leader ? `${leader.name} leads` : 'Opening price', W / 2, 356);
      if (phase === 'bid') { c.fillStyle = '#00304920'; c.fillRect(40, 368, W - 80, 10); c.fillStyle = clock < 2 ? '#c1121f' : '#003049'; c.fillRect(40, 368, (W - 80) * Math.min(1, clock / 8), 10); }
      // the other bidders
      bots.forEach((b, i) => { const x = W / 2 + (i - 1) * 100, y = 430; b.face.draw(c, x, y, 50, leader === b ? 1 : 0); c.fillStyle = leader === b ? b.col : '#003049'; c.font = '700 12px Rubik, sans-serif'; c.fillText(b.name, x, y + 42); });
      // bid buttons
      const btn = (x, label, on) => { c.fillStyle = on ? '#c1121f' : '#c1121f60'; c.beginPath(); c.roundRect(x - 70, H - 110, 140, 56, 12); c.fill(); c.fillStyle = '#fff'; c.font = '800 22px Rubik, sans-serif'; c.fillText(label, x, H - 74); };
      const can = phase === 'bid' && leader !== 'you';
      btn(W / 2 - 80, '+5', can && cash >= price + 5); btn(W / 2 + 80, '+20', can && cash >= price + 20);
      if (ml > 0) { c.fillStyle = '#003049'; c.font = '700 17px Rubik, sans-serif'; c.fillText(msg, W / 2, 500); }
      c.fillStyle = '#003049a0'; c.font = '600 13px Rubik, sans-serif'; c.fillText(`profit so far ${profit}`, W / 2, H - 24);
    },
    down(x, y) {
      if (phase !== 'bid' || leader === 'you' || y < H - 116) return;
      const add = x < W / 2 ? 5 : 20; if (cash < price + add) { sfx(150, .1, 'square', .03); return; }
      price += add; leader = 'you'; if (clock < 2) clock = 2;
      sfx(600, .05, 'square', .04); haptic('light');
    },
    key(k, d) { if (d && (k === '1' || k === '2')) this.down(k === '1' ? 10 : W - 10, H - 80); },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'auction-snipe',
  title: 'Auction Snipe',
  tag: 'Casual · Trading',
  retro: false,
  w: 360, h: 640, maxH: 800,
  goal: 80,
  hint: 'Read the appraiser\'s guess, then tap +5 or +20 to outbid the others. Bids near the end add time. Win treasures for less than they are worth; your profit is your score.',
  make,
};

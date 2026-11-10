// Sevens: a card game for you and three robots. Each suit opens with its 7, then builds up to the King and
// down to the Ace, one card at a time. On your turn tap a card that fits (they glow); if none fits you
// have to knock and pass. Empty your hand first. Three rounds, points for first, second and third.
import gs from '../gamescroll.js';
const { Feel } = gs.effects;
const { Deck, SUITS, SUIT_SIGN, sort } = gs.cards;
const { haptic } = gs.device;
const { sfx, notes } = gs.sound;
const { art } = gs;

let W = 360, H = 640;
const RANK = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };

function make(api) {
  const feel = new Feel();
  let hands, rows, turn, wait, order, round, score, t, msg, ml, ended, names, faces, knocks;

  function deal() {
    round++;
    const deck = new Deck(); deck.shuffle();
    hands = deck.deal(4, 13).map(h => sort(h, { by: 'suit' }));
    rows = {}; for (const s of SUITS) rows[s] = null;
    order = []; knocks = [0, 0, 0, 0];
    // whoever holds the 7 of diamonds starts
    turn = hands.findIndex(h => h.some(c => c.suit === 'd' && c.rank === 7)); wait = .8;
  }
  const fits = c => { const r = rows[c.suit]; if (!r) return c.rank === 7; return c.rank === r.lo - 1 || c.rank === r.hi + 1; };
  const legal = i => hands[i].filter(c => fits(c) && (rows.d || (c.suit === 'd' && c.rank === 7)));   // the 7 of diamonds always opens
  function play(i, c) {
    hands[i] = hands[i].filter(x => x !== c);
    const r = rows[c.suit]; if (!r) rows[c.suit] = { lo: 7, hi: 7 }; else if (c.rank < r.lo) r.lo = c.rank; else r.hi = c.rank;
    sfx(500 + c.rank * 30, .05, 'triangle', .04);
    if (!hands[i].length) { order.push(i); if (i === 0) { const pts = [5, 3, 1, 0][order.length - 1]; score += pts; api.score(score); msg = ['You went out first!', 'Second place', 'Third place'][order.length - 1]; ml = 1.6; notes('C5 E5 G5 C6', { len: .06 }); feel.win(W / 2, H * .7); haptic('success'); } }
    next();
  }
  function next() {
    if (order.length >= 3) { // round over
      const last = [0, 1, 2, 3].find(i => !order.includes(i)); order.push(last);
      if (last === 0) { msg = 'Last this round'; ml = 1.6; feel.lose(); }
      turn = -1; wait = 2; return;
    }
    do { turn = (turn + 1) % 4; } while (!hands[turn].length);
    wait = turn === 0 ? 0 : .55;
  }

  return {
    reset() { round = 0; score = 0; t = 0; msg = ''; ml = 0; ended = false; names = ['You', ...[1, 2, 3].map(i => art.name(i * 977 + (Math.random() * 1e6 | 0), 'person').split(' ')[0])]; faces = [null, ...[1, 2, 3].map(i => art.face((Math.random() * 1e9) | 0))]; deal(); feel.clear(); },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      feel.update(dt); if (feel.frozen) return;
      t += dt; if (ml > 0) ml -= dt;
      if (wait > 0) { wait -= dt; if (wait > 0) return; }
      if (turn === -1) { if (round >= 3) { if (!ended) { ended = true; api.over(); } return; } deal(); return; }
      if (turn === 0) { if (!legal(0).length) { knocks[0]++; msg = 'No card fits: knock'; ml = 1; sfx(200, .1, 'square', .03); haptic('tick'); wait = .5; next(); } return; }
      // robots: play the card that keeps the most of their own suit behind it, or knock
      const opts = legal(turn);
      if (!opts.length) { knocks[turn]++; sfx(160, .06, 'square', .02); next(); return; }
      opts.sort((a, b) => hands[turn].filter(x => x.suit === b.suit).length - hands[turn].filter(x => x.suit === a.suit).length || Math.abs(b.rank - 7) - Math.abs(a.rank - 7));
      play(turn, Math.random() < .8 ? opts[0] : opts[opts.length - 1]);
    },
    draw(c) {
      c.fillStyle = '#1b4332'; c.fillRect(0, 0, W, H);
      c.fillStyle = '#2d6a4f'; c.beginPath(); c.roundRect(14, 120, W - 28, 250, 20); c.fill();
      // the other players across the top
      for (let i = 1; i < 4; i++) { const x = W * (i / 4), y = 72; faces[i].draw(c, x, y, 40, turn === i ? 1 : 0); c.fillStyle = turn === i ? '#ffd166' : '#fff'; c.font = '700 12px Rubik, sans-serif'; c.textAlign = 'center'; c.fillText(`${names[i]} · ${hands[i].length}`, x, y + 34); if (order.includes(i)) { c.fillStyle = '#ffd166'; c.fillText(['1st', '2nd', '3rd', '4th'][order.indexOf(i)], x, y - 28); } }
      // the four suit rows
      const cw = 22, ch = 34;
      SUITS.forEach((s, si) => {
        const y = 140 + si * 56, r = rows[s], red = s === 'h' || s === 'd';
        c.fillStyle = '#ffffff30'; c.font = '700 20px sans-serif'; c.textAlign = 'left'; c.fillText(SUIT_SIGN[s], 24, y + 24);
        for (let k = 1; k <= 13; k++) {
          const x = 50 + (k - 1) * cw, on = r && k >= r.lo && k <= r.hi;
          c.fillStyle = on ? '#fff' : '#ffffff10'; c.beginPath(); c.roundRect(x, y, cw - 3, ch, 4); c.fill();
          if (on) { c.fillStyle = red ? '#d00000' : '#111'; c.font = '700 11px Rubik, sans-serif'; c.textAlign = 'center'; c.fillText(RANK[k] || k, x + (cw - 3) / 2, y + 15); c.font = '11px sans-serif'; c.fillText(SUIT_SIGN[s], x + (cw - 3) / 2, y + 28); }
        }
      });
      feel.begin(c);
      // your hand in two rows
      const hand = hands[0], ok = turn === 0 ? legal(0) : [], per = 7, hw = (W - 20) / per;
      hand.forEach((cd, i) => {
        const row = Math.floor(i / per), col = i % per, x = 10 + col * hw, y = H - 190 + row * 78 - (ok.includes(cd) ? 10 : 0), red = cd.red;
        c.fillStyle = ok.includes(cd) ? '#fffbe6' : '#e9ecef'; c.beginPath(); c.roundRect(x + 2, y, hw - 4, 70, 8); c.fill();
        if (ok.includes(cd)) { c.strokeStyle = '#ffd166'; c.lineWidth = 3; c.stroke(); }
        c.fillStyle = red ? '#d00000' : '#111'; c.textAlign = 'center'; c.font = '800 20px Rubik, sans-serif'; c.fillText(RANK[cd.rank] || cd.rank, x + hw / 2, y + 28); c.font = '20px sans-serif'; c.fillText(SUIT_SIGN[cd.suit], x + hw / 2, y + 54);
      });
      feel.end(c, W, H);
      c.textAlign = 'center'; c.fillStyle = '#fff'; c.font = '700 14px Rubik, sans-serif';
      c.fillText(ml > 0 ? msg : turn === 0 ? 'Your turn: tap a glowing card' : turn > 0 ? `${names[turn]} is thinking...` : `Round ${round} done`, W / 2, 398);
      c.fillStyle = '#ffffff90'; c.font = '600 12px Rubik, sans-serif'; c.fillText(`Round ${round} of 3`, W / 2, 418);
    },
    down(x, y) {
      if (turn !== 0 || wait > 0) return;
      const per = 7, hw = (W - 20) / per, ok = legal(0);
      hands[0].forEach((cd, i) => { const row = Math.floor(i / per), col = i % per, cx = 10 + col * hw, cy = H - 190 + row * 78 - 10; if (x > cx && x < cx + hw && y > cy && y < cy + 80 && ok.includes(cd)) { haptic('light'); play(0, cd); } });
    },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'sevens-cards',
  title: 'Sevens',
  tag: 'Casual · Cards',
  retro: false,
  w: 360, h: 640, maxH: 800,
  goal: 10,
  hint: 'Each suit starts with its 7 and grows up to the King and down to the Ace. Tap a glowing card that fits, or knock if none do. Empty your hand first; three rounds.',
  make,
};

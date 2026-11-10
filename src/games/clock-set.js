// Clock Set: the card says a time ("quarter to nine", "16:40", "20 minutes after 3:50"). Drag the long
// hand round the clock (the short hand follows, like a real clock) and tap SET. Close is good, exact
// is better. Quick answers score more. Three wrong sets and you're late.
import gs from '../gamescroll.js';
const { Feel } = gs.effects;
const { haptic } = gs.device;
const { sfx, notes } = gs.sound;

let W = 360, H = 640;
const NUM = ['twelve', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven'];

function make(api) {
  const feel = new Feel();
  let mins, goal, card, kind, score, strikes, t, qt, qmax, banner, grab, round, lastStep;
  const C = () => [W / 2, H * .5], R = () => Math.min(W * .4, H * .26);
  const fmt = m => { const h = Math.floor(m / 60) % 12 || 12, mm = m % 60; return `${h}:${String(mm).padStart(2, '0')}`; };
  function words(m) {
    const h = Math.floor(m / 60) % 12, mm = m % 60, nx = NUM[(h + 1) % 12];
    if (mm === 0) return `${NUM[h]} o'clock`;
    if (mm === 15) return `quarter past ${NUM[h]}`; if (mm === 30) return `half past ${NUM[h]}`; if (mm === 45) return `quarter to ${nx}`;
    if (mm < 30) return `${mm} past ${NUM[h]}`; return `${60 - mm} to ${nx}`;
  }
  function newQ() {
    round++;
    const k = Math.random(), step = round < 4 ? 15 : 5;
    goal = (Math.random() * 12 | 0) * 60 + (Math.random() * (60 / step) | 0) * step;
    if (round < 3 || k < .4) { kind = 'words'; card = words(goal); }
    else if (k < .7) { kind = 'digital'; const pm = Math.random() < .5; card = `${String(Math.floor(goal / 60) + (pm ? 12 : 0)).padStart(2, '0')}:${String(goal % 60).padStart(2, '0')}`; }
    else { kind = 'sum'; const add = [10, 15, 20, 25, 35, 40, 45][Math.random() * 7 | 0]; const from = (goal - add + 720) % 720; card = `${add} minutes after ${fmt(from)}`; }
    mins = (goal + 180 + Math.random() * 300 | 0) % 720; mins -= mins % 5;
    qmax = qt = Math.max(7, 16 - round * .4);
  }
  function set() {
    if (banner) return;
    let d = Math.abs(mins - goal) % 720; d = Math.min(d, 720 - d);
    if (d <= 2) { const pts = 2 + Math.ceil(qt / qmax * 4) + (kind === 'words' ? 0 : 1); score += pts; api.score(score); feel.win(W / 2, H * .5); notes('E5 G5 C6', { len: .06 }); haptic('success'); banner = { txt: d === 0 ? 'Spot on!' : 'Right on time', sub: `+${pts}`, l: .9 }; }
    else if (d <= 7) { score += 1; api.score(score); haptic('light'); sfx(600, .08, 'triangle', .04); banner = { txt: 'Close enough', sub: `it was ${fmt(goal)} · +1`, l: 1.2 }; }
    else { strikes++; feel.hurt(W / 2, H * .5); haptic('error'); banner = { txt: 'Wrong time', sub: `it was ${fmt(goal)}`, l: 1.4, over: strikes >= 3 }; }
  }

  return {
    reset() { score = 0; strikes = 0; t = 0; round = 0; grab = false; banner = null; feel.clear(); newQ(); },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      feel.update(dt); if (feel.frozen) return;
      t += dt;
      if (banner) { banner.l -= dt; if (banner.l <= 0) { const b = banner; banner = null; if (b.over) return api.over(); newQ(); } return; }
      qt -= dt; if (qt <= 0) { strikes++; feel.hurt(W / 2, H * .5); haptic('error'); banner = { txt: 'Too slow', sub: `it was ${fmt(goal)}`, l: 1.4, over: strikes >= 3 }; }
    },
    draw(c) {
      c.fillStyle = '#fef6e4'; c.fillRect(0, 0, W, H);
      // the card
      c.fillStyle = '#fff'; c.beginPath(); c.roundRect(24, 50, W - 48, 92, 16); c.fill(); c.strokeStyle = '#f3d2c1'; c.lineWidth = 3; c.stroke();
      c.fillStyle = '#001858'; c.textAlign = 'center'; c.font = `800 ${card.length > 18 ? 22 : 28}px Rubik, sans-serif`; c.fillText(card, W / 2, 104);
      c.fillStyle = '#f3d2c1'; c.fillRect(24, 132, (W - 48) * Math.max(0, qt / qmax), 6);
      const [cx, cy] = C(), r = R();
      feel.begin(c);
      c.fillStyle = '#8bd3dd'; c.beginPath(); c.arc(cx, cy, r + 14, 0, 7); c.fill();
      c.fillStyle = '#fff'; c.beginPath(); c.arc(cx, cy, r, 0, 7); c.fill();
      for (let i = 0; i < 60; i++) { const a = i / 60 * Math.PI * 2 - Math.PI / 2, l = i % 5 ? 6 : 14; c.strokeStyle = '#001858'; c.lineWidth = i % 5 ? 2 : 4; c.beginPath(); c.moveTo(cx + Math.cos(a) * (r - 4), cy + Math.sin(a) * (r - 4)); c.lineTo(cx + Math.cos(a) * (r - 4 - l), cy + Math.sin(a) * (r - 4 - l)); c.stroke(); }
      c.fillStyle = '#001858'; c.font = '700 20px Rubik, sans-serif'; c.textBaseline = 'middle';
      for (let i = 1; i <= 12; i++) { const a = i / 12 * Math.PI * 2 - Math.PI / 2; c.fillText(i, cx + Math.cos(a) * (r - 34), cy + Math.sin(a) * (r - 34)); }
      c.textBaseline = 'alphabetic';
      const ha = (mins / 720) * Math.PI * 2 - Math.PI / 2, ma = (mins % 60) / 60 * Math.PI * 2 - Math.PI / 2;
      c.lineCap = 'round';
      c.strokeStyle = '#001858'; c.lineWidth = 10; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(ha) * r * .5, cy + Math.sin(ha) * r * .5); c.stroke();
      c.strokeStyle = grab ? '#f582ae' : '#172c66'; c.lineWidth = 6; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(ma) * r * .82, cy + Math.sin(ma) * r * .82); c.stroke();
      c.fillStyle = '#f582ae'; c.beginPath(); c.arc(cx + Math.cos(ma) * r * .82, cy + Math.sin(ma) * r * .82, 10, 0, 7); c.fill();
      c.fillStyle = '#001858'; c.beginPath(); c.arc(cx, cy, 8, 0, 7); c.fill();
      feel.end(c, W, H);
      // SET button
      const by = cy + r + 40; c.fillStyle = '#f582ae'; c.beginPath(); c.roundRect(W / 2 - 70, by, 140, 54, 27); c.fill(); c.fillStyle = '#fff'; c.textAlign = 'center'; c.font = '800 22px Rubik, sans-serif'; c.fillText('SET', W / 2, by + 35);
      c.fillStyle = '#001858'; c.font = '700 18px Rubik, sans-serif'; c.textAlign = 'left'; c.fillText('⏰'.repeat(3 - strikes), 20, H - 24);
      if (round === 1 && t < 5 && !banner) { c.textAlign = 'center'; c.fillStyle = '#8b8bab'; c.font = '600 14px Rubik, sans-serif'; c.fillText('Drag the long hand round, then tap SET', W / 2, cy + r + 120); }
      if (banner) { c.fillStyle = '#001858e8'; c.fillRect(0, H * .5 - 44, W, 88); c.fillStyle = '#fff'; c.textAlign = 'center'; c.font = '800 28px Rubik, sans-serif'; c.fillText(banner.txt, W / 2, H * .5 - 4); c.font = '600 16px Rubik, sans-serif'; c.fillText(banner.sub, W / 2, H * .5 + 26); }
    },
    down(x, y) {
      if (banner) return;
      const [cx, cy] = C(), r = R(), by = cy + r + 40;
      if (y > by - 6 && y < by + 60 && Math.abs(x - W / 2) < 80) return set();
      if (Math.hypot(x - cx, y - cy) < r + 30) { grab = true; lastStep = null; this.move(x, y, true); }
    },
    move(x, y, p) {
      if (!p || !grab || banner) return;
      const [cx, cy] = C(); let a = Math.atan2(y - cy, x - cx) + Math.PI / 2; if (a < 0) a += Math.PI * 2;
      const mm = Math.round(a / (Math.PI * 2) * 60) % 60, cur = mins % 60;
      let d = mm - cur; if (d > 30) d -= 60; if (d < -30) d += 60;   // going past 12 moves the hour on
      if (d) { mins = (mins + d + 720) % 720; if (mins % 5 === 0) { haptic('tick'); sfx(1500, .01, 'square', .015); } }
    },
    up() { grab = false; },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'clock-set',
  title: 'Clock Set',
  tag: 'Casual · Brain',
  retro: false,
  w: 360, h: 640, maxH: 800,
  goal: 40,
  hint: 'Drag the long hand to set the clock to the time on the card, then tap SET. Faster is better. Three wrong sets and you are late.',
  make,
};

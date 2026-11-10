// Tally Count: a flock of sheep runs across the field. Count only the ones the card asks for (the dark
// ones, the ones wearing bells, the ones running backwards...). When they've gone, tap your answer.
// Spot on scores most; one out still scores a little. Three bad counts and the farmer gives up.
import gs from '../gamescroll.js';
const { Feel } = gs.effects;
const { PAL } = gs.palettes;
const { text } = gs.pixel;
const { haptic } = gs.device;
const { sfx, notes } = gs.sound;

const R = PAL.moss;
let W = 160, H = 160;
const ASKS = [
  { txt: 'DARK SHEEP', is: s => s.dark },
  { txt: 'SHEEP WITH BELLS', is: s => s.bell },
  { txt: 'SHEEP GOING LEFT', is: s => s.vx < 0 },
  { txt: 'DARK SHEEP WITH BELLS', is: s => s.dark && s.bell },
  { txt: 'JUMPING SHEEP', is: s => s.jump },
];

function make(api) {
  const feel = new Feel({ pixel: true });
  let sheep, ask, answer, choices, phase, round, score, strikes, t, pt, banner;

  function newRound() {
    round++;
    const n = Math.min(26, 8 + round * 2), speed = 30 + round * 3;
    ask = round < 3 ? ASKS[0] : ASKS[Math.random() * Math.min(ASKS.length, 2 + round / 2) | 0];
    sheep = [];
    for (let i = 0; i < n; i++) {
      const left = ask === ASKS[2] ? Math.random() < .4 : Math.random() < .12;
      sheep.push({ x: left ? W + 10 + i * 9 + Math.random() * 30 : -10 - i * 9 - Math.random() * 30, y: 40 + Math.random() * (H - 70), vx: (left ? -1 : 1) * (speed + Math.random() * 15), dark: Math.random() < .35, bell: Math.random() < .3, jump: Math.random() < .25, ph: Math.random() * 6 });
    }
    answer = sheep.filter(ask.is).length;
    const set = new Set([answer]); while (set.size < 4) { const d = answer + (Math.random() < .5 ? -1 : 1) * (1 + Math.random() * 3 | 0); if (d >= 0) set.add(d); }
    choices = [...set].sort((a, b) => a - b);
    phase = 'card'; pt = 1.8;
  }
  const btn = i => { const w = (W - 10) / 4; return [5 + i * w, H - 30, w - 4, 24]; };

  return {
    reset() { round = 0; score = 0; strikes = 0; t = 0; banner = null; feel.clear(); newRound(); },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      feel.update(dt); if (feel.frozen) return;
      t += dt;
      if (banner) { banner.l -= dt; if (banner.l <= 0) { const b = banner; banner = null; if (b.over) return api.over(); newRound(); } return; }
      if (phase === 'card') { pt -= dt; if (pt <= 0) phase = 'run'; return; }
      if (phase === 'run') {
        for (const s of sheep) { s.x += s.vx * dt; s.ph += dt * 10; }
        if (sheep.every(s => s.x > W + 12 || s.x < -12)) { phase = 'ask'; sfx(600, .1, 'square', .03); }
        if (Math.random() < dt * 3) sfx(300 + Math.random() * 100, .04, 'square', .015);
      }
    },
    draw(c) {
      c.fillStyle = R[3]; c.fillRect(0, 0, W, H);
      c.fillStyle = R[2]; for (let i = 0; i < 40; i++) c.fillRect((i * 37) % W, 30 + (i * 23) % (H - 60), 2, 1);
      c.fillStyle = R[1]; c.fillRect(0, 26, W, 2); for (let x = 2; x < W; x += 10) c.fillRect(x, 20, 2, 8);
      feel.begin(c);
      if (phase === 'run') for (const s of [...sheep].sort((a, b) => a.y - b.y)) {
        const x = Math.round(s.x), y = Math.round(s.y - (s.jump ? Math.abs(Math.sin(s.ph * .5)) * 8 : 0)), f = s.vx < 0 ? -1 : 1;
        c.fillStyle = R[0]; c.fillRect(x - 6, y - 4, 12, 7);
        c.fillStyle = s.dark ? R[1] : R[3]; c.fillRect(x - 5, y - 3, 10, 5);
        c.fillStyle = R[0]; c.fillRect(x + f * 6 - (f < 0 ? 3 : 0), y - 5, 3, 4);
        const leg = (s.ph | 0) % 2; c.fillRect(x - 4, y + 3, 1, 2 + leg); c.fillRect(x + 3, y + 3, 1, 3 - leg);
        if (s.bell) { c.fillStyle = R[0]; c.fillRect(x + f * 4, y + 2, 2, 2); }
      }
      feel.end(c, W, H);
      if (phase === 'card') { c.fillStyle = R[0]; c.fillRect(10, H / 2 - 22, W - 20, 40); text(c, 'COUNT THE', W / 2, H / 2 - 16, { align: 'center', color: R[3] }); text(c, ask.txt, W / 2, H / 2 - 4, { font: ask.txt.length > 14 ? 'small' : 'big', align: 'center', color: R[3] }); }
      if (phase === 'ask' || banner) {
        text(c, `HOW MANY ${ask.txt}?`, W / 2, H / 2 - 20, { align: 'center', color: R[0] });
        for (let i = 0; i < 4; i++) { const [x, y, w, h] = btn(i), right = banner && choices[i] === answer; c.fillStyle = right ? R[0] : R[1]; c.fillRect(Math.round(x), y, Math.round(w), h); text(c, String(choices[i]), Math.round(x + w / 2), y + 8, { font: 'big', align: 'center', color: R[3] }); }
      }
      text(c, `ROUND ${round}`, 4, 4, { color: R[0] });
      for (let i = 0; i < 3 - strikes; i++) { c.fillStyle = R[0]; c.fillRect(W - 8 - i * 6, 4, 4, 4); }
      if (banner) text(c, banner.txt, W / 2, H / 2, { font: 'big', align: 'center', color: R[0] });
    },
    down(x, y) {
      if (phase !== 'ask' || banner) return;
      for (let i = 0; i < 4; i++) {
        const [bx, by, w, h] = btn(i); if (x < bx || x > bx + w || y < by - 4 || y > by + h + 4) continue;
        const d = Math.abs(choices[i] - answer);
        if (d === 0) { score += 3; api.score(score); notes('C5 E5 G5', { len: .06 }); feel.coin(bx + w / 2, by); haptic('success'); banner = { txt: 'SPOT ON!', l: 1 }; }
        else if (d === 1) { score += 1; api.score(score); sfx(500, .08, 'square', .03); haptic('light'); banner = { txt: 'NEARLY', l: 1.2 }; }
        else { strikes++; feel.hurt(bx + w / 2, by); haptic('error'); banner = { txt: `IT WAS ${answer}`, l: 1.4, over: strikes >= 3 }; }
        return;
      }
    },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'tally-count',
  title: 'Tally Count',
  tag: 'Pocket · Brain',
  retro: true, pal: 'moss',
  w: 160, h: 160, maxW: 220, maxH: 240,
  goal: 30,
  hint: 'Read the card, then count only those sheep as the flock runs past. Tap your answer. Three bad counts and it is over.',
  make,
};

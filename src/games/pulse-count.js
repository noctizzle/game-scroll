// Pulse Count: hold the phone, close your eyes if you like, and count the buzzes. They come quicker and
// in trickier rhythms each round. Then tap how many you felt. Spot on scores most; one out still scores
// a little. Three bad counts and it's over. No buzzer? The heart flashes and ticks instead.
import gs from '../gamescroll.js';
const { Feel } = gs.effects;
const { PAL } = gs.palettes;
const { text } = gs.pixel;
const { haptic, canBuzz, hapticPattern } = gs.device;
const { sfx, notes } = gs.sound;

const R = PAL.rose;
let W = 160, H = 160;

function make(api) {
  const feel = new Feel({ pixel: true });
  let phase, times, k, pt, answer, score, misses, round, t, glow, banner, buzz;
  const btn = i => { const bw = Math.floor((W - 12) / 4), bh = 18; return [6 + (i % 4) * bw, H - 66 + Math.floor(i / 4) * (bh + 3), bw - 3, bh]; };

  function newRound() {
    round++;
    answer = 3 + Math.floor(Math.random() * Math.min(10, 3 + round));
    if (answer > 12) answer = 12;
    // gaps get shorter and more uneven
    const base = Math.max(.16, .5 - round * .03), wob = Math.min(.5, round * .05);
    times = []; let at = .8;
    for (let i = 0; i < answer; i++) { times.push(at); at += base * (1 + (Math.random() * 2 - 1) * wob) + (Math.random() < .15 ? .3 : 0); }
    k = 0; pt = 0; phase = 'feel'; glow = 0;
  }

  return {
    reset() { score = 0; misses = 0; round = 0; t = 0; banner = null; buzz = canBuzz(); feel.clear(); newRound(); },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      feel.update(dt); if (feel.frozen) return;
      t += dt; glow = Math.max(0, glow - dt * 6);
      if (banner) { banner.l -= dt; if (banner.l <= 0) { const b = banner; banner = null; if (b.over) return api.over(); newRound(); } return; }
      if (phase === 'feel') {
        pt += dt;
        while (k < times.length && pt >= times[k]) {
          k++;
          if (buzz) hapticPattern([{ at: 0, len: .05, strength: 1, sharpness: .6 }]); else { glow = 1; sfx(180, .05, 'sine', .05); }
        }
        if (k >= times.length && pt > times[times.length - 1] + .8) phase = 'ask';
      }
    },
    draw(c) {
      c.fillStyle = R[3]; c.fillRect(0, 0, W, H);
      const cx = Math.round(W / 2), cy = phase === 'ask' ? 40 : Math.round(H * .45), s = 3 + (glow > 0 ? 1 : 0);
      // a pixel heart
      const heart = ['.XX.XX.', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'];
      feel.begin(c);
      heart.forEach((row, ry) => [...row].forEach((ch, rx) => { if (ch === 'X') { c.fillStyle = glow > 0 ? R[0] : R[1]; c.fillRect(cx - 7 * s / 2 + rx * s, cy - 3 * s + ry * s, s, s); } }));
      feel.end(c, W, H);
      text(c, `${score}`, 4, 3, { color: R[0] });
      for (let i = 0; i < 3 - misses; i++) { c.fillStyle = R[0]; c.fillRect(W - 8 - i * 6, 3, 4, 4); }
      if (phase === 'feel') text(c, buzz ? 'COUNT THE BUZZES' : 'COUNT THE BEATS', W / 2, H - 24, { align: 'center', color: R[0] });
      if (phase === 'ask' && !banner) {
        text(c, 'HOW MANY?', W / 2, 62, { align: 'center', color: R[0] });
        for (let i = 0; i < 12; i++) { const [x, y, w, h] = btn(i); c.fillStyle = R[1]; c.fillRect(x, y, w, h); text(c, String(i + 1), x + Math.floor(w / 2), y + 6, { align: 'center', color: R[3] }); }
      }
      if (banner) text(c, banner.txt, W / 2, H - 40, { font: 'big', align: 'center', color: R[0] });
      if (round === 1 && phase === 'feel' && t < 3) text(c, 'HOLD THE PHONE', W / 2, H - 14, { align: 'center', color: R[1] });
    },
    down(x, y) {
      if (phase !== 'ask' || banner) return;
      for (let i = 0; i < 12; i++) {
        const [bx, by, w, h] = btn(i); if (x < bx || x > bx + w || y < by - 1 || y > by + h + 1) continue;
        const d = Math.abs(i + 1 - answer);
        if (d === 0) { score += 3; api.score(score); notes('C5 E5 G5', { len: .06 }); feel.coin(W / 2, 40); haptic('success'); banner = { txt: 'SPOT ON', l: 1 }; }
        else if (d === 1) { score += 1; api.score(score); sfx(500, .08, 'square', .03); banner = { txt: `IT WAS ${answer}`, l: 1.2 }; }
        else { misses++; feel.hurt(W / 2, 40); haptic('error'); banner = { txt: `IT WAS ${answer}`, l: 1.4, over: misses >= 3 }; }
        return;
      }
    },
    key(k2, d) { if (d && phase === 'ask' && /^[0-9]$/.test(k2)) { const n = k2 === '0' ? 10 : +k2; const [x, y, w, h] = btn(n - 1); this.down(x + w / 2, y + h / 2); } },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'pulse-count',
  title: 'Pulse Count',
  tag: 'Pocket · Feel',
  retro: true, pal: 'rose',
  w: 160, h: 160, maxW: 220, maxH: 240,
  goal: 25,
  hint: 'Hold the phone and count the buzzes (or the heart beats without a buzzer), then tap how many. Three bad counts and it is over.',
  make,
};

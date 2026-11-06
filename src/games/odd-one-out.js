import { clamp, rnd } from '../util.js';
import { sfx } from '../sfx.js';
import { haptic } from '../kit/device.js';

// A grid of little critters that all look the same, except one. Tap the odd one out.
// The grid grows and the difference gets subtler. A wrong tap costs time.
const W = 360, H = 640, TOP = 120, SIZE = 340;
const BODY = ['#ff8a5a', '#5ac8ff', '#7dd36a', '#c18bff', '#ffd34a'];

function critter(c, x, y, s, f) {
  c.save(); c.translate(x, y); c.scale(s, s); if (f.flip) c.scale(-1, 1); c.rotate(f.tilt);
  c.fillStyle = f.col; c.beginPath(); c.ellipse(0, 0, 20, 18 * f.tall, 0, 0, 7); c.fill();
  c.fillStyle = '#fff'; for (const ex of f.eyes === 1 ? [0] : [-7, 7]) { c.beginPath(); c.arc(ex, -4, 5, 0, 7); c.fill(); c.fillStyle = '#222'; c.beginPath(); c.arc(ex + f.look, -4, 2.4, 0, 7); c.fill(); c.fillStyle = '#fff'; }
  c.strokeStyle = '#222'; c.lineWidth = 2; c.beginPath(); if (f.smile) c.arc(0, 5, 6, .2, Math.PI - .2); else { c.moveTo(-5, 8); c.lineTo(5, 8); } c.stroke();
  if (f.horns) { c.fillStyle = f.col; c.beginPath(); c.moveTo(-12, -12); c.lineTo(-8, -24); c.lineTo(-4, -14); c.fill(); c.beginPath(); c.moveTo(12, -12); c.lineTo(8, -24); c.lineTo(4, -14); c.fill(); }
  if (f.spot) { c.fillStyle = '#00000030'; c.beginPath(); c.arc(9, 8, 3, 0, 7); c.fill(); }
  c.restore();
}

function make(api) {
  let n, base, odd, oddI, time, score, t, flash, wrong;
  function round() {
    n = clamp(3 + Math.floor(score / 3), 3, 8);
    base = { col: BODY[Math.random() * 5 | 0], tall: 1, eyes: 2, look: rnd(-2, 2), smile: Math.random() < .5, horns: Math.random() < .4, spot: Math.random() < .4, flip: false, tilt: 0 };
    odd = { ...base }; const level = Math.min(4, Math.floor(score / 4));
    const tweaks = [
      () => { odd.col = BODY.filter(c => c !== base.col)[Math.random() * 4 | 0]; },
      () => { odd.smile = !base.smile; }, () => { odd.horns = !base.horns; }, () => { odd.eyes = 1; },
      () => { odd.spot = !base.spot; }, () => { odd.look = base.look > 0 ? -2.4 : 2.4; }, () => { odd.tall = 1.18; }, () => { odd.tilt = .35; },
    ];
    // early rounds use bold differences, later ones subtle
    const pool = level < 1 ? tweaks.slice(0, 4) : level < 3 ? tweaks.slice(1, 7) : tweaks.slice(4);
    pool[Math.random() * pool.length | 0]();
    oddI = Math.random() * n * n | 0; time = Math.max(4, 10 - score * .15);
  }
  const self = {
    reset() { score = 0; t = 0; flash = 0; wrong = null; round(); },
    update(dt) { t += dt; flash = Math.max(0, flash - dt * 3); if (wrong) { wrong.l -= dt; if (wrong.l <= 0) wrong = null; } time -= dt; if (time <= 0) { haptic('error'); sfx(140, .3, 'triangle', .05, -40); return api.over(); } },
    draw(c) {
      c.fillStyle = '#f4efe6'; c.fillRect(0, 0, W, H);
      c.fillStyle = '#00000014'; c.fillRect(30, 80, 300, 10); c.fillStyle = time < 3 ? '#ff5a5a' : '#5a8aff'; c.fillRect(30, 80, 300 * clamp(time / Math.max(4, 10 - score * .15), 0, 1), 10);
      const cs = SIZE / n, s = cs / 52, ox = (W - SIZE) / 2;
      for (let i = 0; i < n * n; i++) {
        const x = ox + (i % n + .5) * cs, y = TOP + ((i / n | 0) + .5) * cs;
        critter(c, x, y, s, i === oddI ? odd : base);
        if (wrong && wrong.i === i) { c.strokeStyle = '#ff3d3d'; c.lineWidth = 3; c.beginPath(); c.arc(x, y, cs * .45, 0, 7); c.stroke(); }
      }
      if (flash) { c.fillStyle = `rgba(125,255,154,${flash * .4})`; c.fillRect(0, 0, W, H); }
      c.fillStyle = '#5a4a3a'; c.font = '600 14px Rubik, sans-serif'; c.textAlign = 'center'; c.fillText('tap the one that is different', W / 2, 520);
    },
    down(x, y) {
      const cs = SIZE / n, ox = (W - SIZE) / 2, cx = Math.floor((x - ox) / cs), cy = Math.floor((y - TOP) / cs); if (cx < 0 || cy < 0 || cx >= n || cy >= n) return;
      const i = cy * n + cx;
      if (i === oddI) { score++; api.score(score); flash = 1; haptic('success'); sfx(700 + score * 15, .1, 'triangle', .05, 200); round(); }
      else { time -= 2; wrong = { i, l: .5 }; haptic('warning'); sfx(200, .12, 'triangle', .04, -60); }
    },
    key(k, d) { if (d && k === ' ') { const cs = SIZE / n; self.down((W - SIZE) / 2 + (oddI % n + .5) * cs, TOP + ((oddI / n | 0) + .5) * cs); } },
  };
  return self;
}

export default {
  id: 'odd-one-out', title: 'Odd One Out', tag: 'Casual · Eyes', retro: false, w: W, h: H, goal: 20,
  hint: 'One critter is different: its colour, eyes, mouth, horns, spot, height or tilt. Tap it before the bar runs out. Wrong taps cost 2 seconds.',
  make,
};

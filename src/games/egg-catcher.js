import { sfx } from '../sfx.js';
import { PAL } from '../palettes.js';
import { haptic } from '../kit/device.js';

// Four hens lay eggs that roll down four ramps. Tap a corner to move the basket under that ramp.
// Eggs speed up as you go. Three broken eggs ends it. A classic LCD handheld idea, with its own art.
const P = PAL.amber, W = 160, H = 160;
// Ramps: hen at the top end, egg rolls toward the catch point at the bottom end.
const RAMPS = [
  { x0: 6, y0: 40, x1: 52, y1: 64 }, { x0: 6, y0: 86, x1: 52, y1: 110 },
  { x0: 154, y0: 40, x1: 108, y1: 64 }, { x0: 154, y0: 86, x1: 108, y1: 110 },
];

function make(api) {
  let eggs, pos, spawn, score, broken, t, splats, speed, chick;
  return {
    reset() { eggs = []; pos = 0; spawn = 1; score = 0; broken = 0; t = 0; splats = []; speed = .55; chick = null; },
    update(dt) {
      t += dt; speed = Math.min(1.6, .55 + score * .018); spawn -= dt;
      if (spawn <= 0) {
        spawn = Math.max(.42, 1.5 - score * .02) * (Math.random() * .5 + .75);
        eggs.push({ r: Math.random() * 4 | 0, k: 0, gold: Math.random() < .08 });
      }
      for (const e of eggs) {
        const step = Math.floor(e.k * 5); e.k += dt * speed * .55;
        if (Math.floor(e.k * 5) !== step && e.k < 1) sfx(e.r < 2 ? 520 : 620, .02, 'square', .02);  // tick as it rolls a notch
      }
      for (const e of eggs.filter(e => e.k >= 1)) {
        if (e.r === pos) { score += e.gold ? 5 : 1; api.score(score); haptic(e.gold ? 'success' : 'light'); sfx(e.gold ? 990 : 760, .06, 'square', .04, 120); }
        else {
          broken++; haptic('error'); sfx(130, .25, 'square', .05, -50);
          splats.push({ x: RAMPS[e.r].x1, l: 1.2 }); if (Math.random() < .5) chick = { x: RAMPS[e.r].x1, l: 2 };
          if (broken >= 3) return api.over();
        }
      }
      eggs = eggs.filter(e => e.k < 1);
      for (const s of splats) s.l -= dt; splats = splats.filter(s => s.l > 0);
      if (chick) { chick.l -= dt; chick.x += (chick.x < 80 ? -1 : 1) * dt * 30; if (chick.l <= 0) chick = null; }
    },
    draw(c) {
      c.fillStyle = P[3]; c.fillRect(0, 0, W, H);
      c.fillStyle = P[2]; c.fillRect(0, 140, W, 20);
      for (const [i, r] of RAMPS.entries()) {
        c.strokeStyle = P[1]; c.lineWidth = 2; c.beginPath(); c.moveTo(r.x0, r.y0 + 6); c.lineTo(r.x1, r.y1 + 6); c.stroke();
        // hen
        const hx = r.x0 + (r.x0 < 80 ? 2 : -14), hy = r.y0 - 12, lay = eggs.some(e => e.r === i && e.k < .1);
        c.fillStyle = P[1]; c.fillRect(hx, hy + 2, 12, 8); c.fillRect(hx + (r.x0 < 80 ? 8 : 0), hy - 2 + (lay ? 1 : 0), 4, 5);
        c.fillStyle = P[0]; c.fillRect(hx + (r.x0 < 80 ? 10 : 1), hy, 1, 1);
      }
      for (const e of eggs) {
        const r = RAMPS[e.r], k = Math.floor(e.k * 5) / 5;   // eggs move in LCD-style notches
        const x = r.x0 + (r.x1 - r.x0) * k, y = r.y0 + (r.y1 - r.y0) * k;
        c.fillStyle = e.gold ? P[2] : P[0]; c.beginPath(); c.ellipse(x, y + 1, 3, 4, 0, 0, 7); c.fill();
        if (e.gold) { c.strokeStyle = P[0]; c.lineWidth = 1; c.stroke(); }
      }
      // keeper with basket
      const left = pos < 2, top = pos % 2 === 0, bx = left ? 58 : 102, by = top ? 68 : 114;
      c.fillStyle = P[0]; c.fillRect(74, 104, 12, 30); c.fillRect(76, 94, 8, 9); c.fillRect(72, 134, 6, 6); c.fillRect(82, 134, 6, 6);
      c.strokeStyle = P[0]; c.lineWidth = 2; c.beginPath(); c.moveTo(left ? 74 : 86, 110); c.lineTo(bx, by); c.stroke();
      c.fillStyle = P[1]; c.fillRect(bx - 8, by - 2, 16, 7); c.fillStyle = P[0]; c.fillRect(bx - 8, by - 2, 16, 1);
      for (const s of splats) { c.fillStyle = P[1]; c.globalAlpha = Math.min(1, s.l * 2); c.fillRect(s.x - 6, 138, 12, 2); c.fillRect(s.x - 3, 136, 6, 2); c.globalAlpha = 1; }
      if (chick) { c.fillStyle = P[2]; c.fillRect(chick.x - 2, 134, 5, 4); c.fillStyle = P[0]; c.fillRect(chick.x + 1, 134, 1, 1); }
      for (let i = 0; i < 3; i++) { c.fillStyle = i < broken ? P[0] : P[2]; c.beginPath(); c.ellipse(W - 8 - i * 9, 7, 3, 4, 0, 0, 7); c.fill(); }
      if (t < 3) { c.fillStyle = P[1]; c.font = '6px "Press Start 2P", monospace'; c.textAlign = 'left'; c.fillText('TAP A CORNER', 4, 10); }
    },
    down(x, y) { pos = (x < 80 ? 0 : 2) + (y < 88 ? 0 : 1); sfx(300, .02, 'square', .02); haptic('tick'); },
    key(k, d) {
      if (!d) return; const l = pos < 2, tp = pos % 2 === 0;
      if (k === 'ArrowLeft') pos = tp ? 0 : 1; if (k === 'ArrowRight') pos = tp ? 2 : 3;
      if (k === 'ArrowUp') pos = l ? 0 : 2; if (k === 'ArrowDown') pos = l ? 1 : 3;
    },
  };
}

export default {
  id: 'egg-catcher', title: 'Egg Catcher', tag: 'Pocket · Reflex', retro: true, w: W, h: H, pal: 'amber', goal: 40,
  hint: 'Tap the corner an egg is rolling toward to swing your basket there. Gold eggs score 5. Three broken eggs and it is over.',
  make,
};

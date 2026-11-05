import { clamp } from '../util.js';
import { sfx } from '../sfx.js';
import { haptic } from '../kit/device.js';

// An arrow appears: swipe the way it points. A red arrow means swipe the OPPOSITE way. Later a
// double arrow wants two swipes. The time per arrow keeps shrinking.
const W = 360, H = 640, DIRS = [[0, -1, 'up'], [1, 0, 'right'], [0, 1, 'down'], [-1, 0, 'left']];

function make(api) {
  let dir, red, twice, done, time, limit, score, t, start, fly, combo;
  function next() {
    dir = Math.random() * 4 | 0; red = score >= 5 && Math.random() < .35; twice = score >= 12 && Math.random() < .25; done = 0;
    limit = Math.max(.7, 1.8 - score * .03) * (twice ? 1.6 : 1); time = limit;
  }
  function swipe(d) {
    const want = red ? (dir + 2) % 4 : dir;
    if (d !== want) { haptic('error'); sfx(140, .3, 'square', .05, -40); fly = { d, l: .4, bad: true }; return api.over(); }
    done++; fly = { d, l: .3 };
    if (twice && done < 2) { haptic('tick'); sfx(500, .04, 'square', .03); return; }
    score++; combo++; api.score(score); haptic('light'); sfx(500 + Math.min(combo, 30) * 20, .05, 'square', .04, 200); next();
  }
  return {
    reset() { score = 0; t = 0; start = null; fly = null; combo = 0; next(); },
    update(dt) { t += dt; if (fly) { fly.l -= dt; if (fly.l <= 0) fly = null; } time -= dt; if (time <= 0) { haptic('error'); sfx(140, .3, 'square', .05, -40); return api.over(); } },
    draw(c) {
      c.fillStyle = red ? '#2a0f14' : '#0f1a2a'; c.fillRect(0, 0, W, H);
      c.fillStyle = '#ffffff20'; c.fillRect(40, 120, 280, 8); c.fillStyle = '#ffffffcc'; c.fillRect(40, 120, 280 * clamp(time / limit, 0, 1), 8);
      const [dx, dy] = DIRS[dir], col = red ? '#ff4d5e' : '#4dd2ff';
      const arrow = (ox, oy, s) => {
        c.save(); c.translate(W / 2 + ox, 330 + oy); c.rotate(Math.atan2(dy, dx)); c.scale(s, s);
        c.fillStyle = col; c.beginPath(); c.moveTo(70, 0); c.lineTo(10, -55); c.lineTo(10, -22); c.lineTo(-70, -22); c.lineTo(-70, 22); c.lineTo(10, 22); c.lineTo(10, 55); c.fill(); c.restore();
      };
      if (twice) { arrow(-dx * 40 - dy * 0, -dy * 40, .7 + (done ? 0 : 0)); if (!done) arrow(dx * 40, dy * 40, .7); } else arrow(0, 0, 1);
      if (fly) { const [fx, fy] = DIRS[fly.d]; c.globalAlpha = fly.l * 2; c.strokeStyle = fly.bad ? '#ff4d5e' : '#ffffff'; c.lineWidth = 6; c.beginPath(); c.moveTo(W / 2, 330); c.lineTo(W / 2 + fx * (1 - fly.l) * 300, 330 + fy * (1 - fly.l) * 300); c.stroke(); c.globalAlpha = 1; }
      c.fillStyle = '#ffffffaa'; c.font = '600 15px Rubik, sans-serif'; c.textAlign = 'center';
      c.fillText(red ? 'RED: swipe the other way!' : twice ? 'swipe it twice' : score < 3 ? 'swipe the way it points' : '', W / 2, 520);
    },
    down(x, y) { start = { x, y }; },
    move(x, y) {
      if (!start) return; const dx = x - start.x, dy = y - start.y; if (Math.hypot(dx, dy) < 40) return;
      start = null; swipe(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0));
    },
    up() { start = null; },
    key(k, d) { if (!d) return; const i = { ArrowUp: 0, ArrowRight: 1, ArrowDown: 2, ArrowLeft: 3 }[k]; if (i != null) swipe(i); },
  };
}

export default {
  id: 'swipe-arrow', title: 'Swipe the Arrow', tag: 'Casual · Reflex', retro: false, w: W, h: H, goal: 30,
  hint: 'Swipe the way the arrow points. Red arrows mean swipe the opposite way. Double arrows need two swipes. Be quick.',
  make,
};

import { clamp, rnd } from '../util.js';
import { sfx } from '../sfx.js';
import { tilt, calibrateTilt, want, haptic } from '../kit/device.js';

// Balance a marble on a round tray while gusts of wind shove it about. Tilt to fight back and keep it
// near the middle: the inner rings score faster. The tray slowly shrinks. Roll off and it's over.
const W = 360, H = 640, CX = W / 2, CY = 340;

function make(api) {
  want('motion');
  let b, R, gust, gt, score, t, drag, mult, trail;
  return {
    reset() { calibrateTilt(); b = { x: CX, y: CY, vx: 0, vy: 0 }; R = 150; gust = { x: 0, y: 0 }; gt = 1.5; score = 0; t = 0; drag = null; mult = 1; trail = []; },
    update(dt) {
      t += dt; R = Math.max(80, 150 - t * 1.2); gt -= dt;
      if (gt <= 0) { gt = rnd(.8, 2.2); const a = rnd(0, 6.28), f = Math.min(320, 100 + t * 5); gust = { x: Math.cos(a) * f, y: Math.sin(a) * f }; haptic('tick'); sfx(160, .3, 'sine', .015, 60); }
      const tl = tilt(); let ax = 0, ay = 0;
      if (drag && drag.cur) { ax = clamp((drag.cur.x - drag.x) / 60, -1, 1); ay = clamp((drag.cur.y - drag.y) / 60, -1, 1); }
      else if (tl) { ax = tl.x; ay = tl.y; }
      b.vx += (ax * 520 + gust.x) * dt; b.vy += (ay * 520 + gust.y) * dt; b.vx *= Math.pow(.4, dt); b.vy *= Math.pow(.4, dt);
      b.x += b.vx * dt; b.y += b.vy * dt;
      const d = Math.hypot(b.x - CX, b.y - CY);
      mult = d < R * .25 ? 4 : d < R * .55 ? 2 : 1;
      score += mult * dt * 3; api.score(Math.floor(score));
      trail.push({ x: b.x, y: b.y }); if (trail.length > 14) trail.shift();
      if (d > R) { haptic('error'); sfx(120, .4, 'triangle', .06, -50); return api.over(); }
    },
    fx(dt) { b.x += b.vx * dt; b.y += b.vy * dt; },
    draw(c) {
      c.fillStyle = '#132a2a'; c.fillRect(0, 0, W, H);
      c.fillStyle = '#00000040'; c.beginPath(); c.arc(CX + 6, CY + 10, R + 10, 0, 7); c.fill();
      c.fillStyle = '#c99a5b'; c.beginPath(); c.arc(CX, CY, R + 8, 0, 7); c.fill();
      for (const [k, col] of [[1, '#e8c890'], [.55, '#f2d9a8'], [.25, '#ffefc8']]) { c.fillStyle = col; c.beginPath(); c.arc(CX, CY, R * k, 0, 7); c.fill(); }
      c.fillStyle = '#8a6a3a'; c.font = '400 8px "Press Start 2P", monospace'; c.textAlign = 'center'; c.fillText('x4', CX, CY - R * .25 + 12); c.fillText('x2', CX, CY - R * .55 + 12);
      c.strokeStyle = '#ffffff30'; c.lineWidth = 2; const gl = Math.hypot(gust.x, gust.y);
      if (gl > 1) { for (let i = 0; i < 5; i++) { const off = ((t * 300 + i * 70) % 360) - 180; c.beginPath(); c.moveTo(CX + gust.x / gl * off - gust.y / gl * (i - 2) * 60, CY + gust.y / gl * off + gust.x / gl * (i - 2) * 60); c.lineTo(CX + gust.x / gl * (off + 40) - gust.y / gl * (i - 2) * 60, CY + gust.y / gl * (off + 40) + gust.x / gl * (i - 2) * 60); c.stroke(); } }
      trail.forEach((p, i) => { c.fillStyle = `rgba(80,120,255,${i / trail.length * .25})`; c.beginPath(); c.arc(p.x, p.y, 10, 0, 7); c.fill(); });
      const g = c.createRadialGradient(b.x - 5, b.y - 6, 2, b.x, b.y, 16); g.addColorStop(0, '#cfe0ff'); g.addColorStop(1, '#3d5bd6'); c.fillStyle = g; c.beginPath(); c.arc(b.x, b.y, 14, 0, 7); c.fill();
      c.fillStyle = mult === 4 ? '#ffd34a' : '#ffffffaa'; c.font = '400 12px "Press Start 2P", monospace'; c.textAlign = 'left'; c.fillText(`x${mult}`, 14, 30);
      if (t < 5) { c.fillStyle = '#ffffffaa'; c.font = '600 14px Rubik, sans-serif'; c.textAlign = 'center'; c.fillText(tilt() ? 'tilt to keep the marble in the middle' : 'drag to tilt the tray', W / 2, 600); }
    },
    down(x, y) { drag = { x, y, cur: { x, y } }; },
    move(x, y) { if (drag) drag.cur = { x, y }; },
    up() { drag = null; },
  };
}

export default {
  id: 'steady-hand', title: 'Steady Hand', tag: 'Casual · Motion', retro: false, w: W, h: H, goal: 120,
  hint: 'Tilt your phone to keep the marble on the tray as the wind gusts. The middle rings score 2x and 4x. The tray shrinks over time. No tilt? Drag.',
  make,
};

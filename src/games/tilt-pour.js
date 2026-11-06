import { clamp, rnd } from '../util.js';
import { sfx } from '../sfx.js';
import { tilt, calibrateTilt, want, haptic } from '../kit/device.js';

// Glasses roll past on a belt. Tilt your phone to tip the jug and fill each one to its line.
// Close to the line scores best; spill over and you lose a glass. No tilt sensor? Drag to tip.
const W = 360, H = 640, JX = 180, JY = 170;

function make(api) {
  want('motion');
  let glasses, belt, ang, stream, score, lost, t, drag, spawn, drops, served;
  function add() { const cap = rnd(60, 110); glasses.push({ x: -50, w: rnd(46, 64), h: cap + 30, line: cap * rnd(.45, .8), fill: 0, done: false, spill: 0 }); }
  return {
    reset() { calibrateTilt(); glasses = []; belt = 45; ang = 0; stream = 0; score = 0; lost = 0; t = 0; drag = null; spawn = 0; drops = []; served = 0; },
    update(dt) {
      t += dt; belt = Math.min(110, 45 + served * 3);
      spawn -= dt; if (spawn <= 0) { spawn = rnd(150, 210) / belt; add(); }
      const tl = tilt(); let want = 0;
      if (drag) want = clamp((drag.x - drag.x0) / 120, 0, 1); else if (tl) want = clamp(-tl.x, 0, 1) || clamp(tl.x, 0, 1);
      ang += (want - ang) * Math.min(1, dt * 8);
      stream = ang > .25 ? (ang - .25) / .75 : 0;
      const sx = JX + 40 + ang * 20;
      for (const g of glasses) {
        g.x += belt * dt;
        if (stream > 0 && Math.abs(g.x - sx) < g.w / 2 - 4 && !g.done) {
          g.fill += stream * belt * 2.2 * dt; if (Math.random() < dt * 30) haptic('tick');
          if (g.fill > g.h - 30) { g.spill += dt; }
        }
        if (stream > 0 && Math.random() < dt * 30) drops.push({ x: sx + rnd(-3, 3), y: JY + 30, vy: 200 });
        if (!g.done && g.x > W + 40) {
          g.done = true; served++;
          const err = Math.abs(g.fill - g.line) / g.line;
          if (g.spill > 0 || g.fill < g.line * .5) { lost++; haptic('error'); sfx(150, .3, 'triangle', .05, -40); if (lost >= 3) return api.over(); }
          else { const pts = err < .05 ? 5 : err < .15 ? 3 : 1; score += pts; api.score(score); haptic(pts === 5 ? 'success' : 'light'); sfx(600 + pts * 80, .12, 'triangle', .05, 200); }
        }
      }
      glasses = glasses.filter(g => g.x < W + 60);
      for (const d of drops) { d.vy += 900 * dt; d.y += d.vy * dt; } drops = drops.filter(d => d.y < 560);
    },
    draw(c) {
      c.fillStyle = '#20303a'; c.fillRect(0, 0, W, H);
      c.fillStyle = '#3a4a56'; c.fillRect(0, 560, W, 30); c.fillStyle = '#2a3640'; for (let x = (t * belt) % 30 - 30; x < W; x += 30) c.fillRect(x, 566, 14, 18);
      for (const g of glasses) {
        const bx = g.x - g.w / 2, by = 560 - g.h;
        const lv = Math.min(g.fill, g.h - 30); c.fillStyle = g.spill ? '#ff6a6a' : '#5ac8ff'; c.fillRect(bx + 4, 556 - lv, g.w - 8, lv);
        if (g.spill) { c.fillStyle = '#5ac8ffaa'; c.fillRect(bx - 6, 552, g.w + 12, 6); }
        c.strokeStyle = '#ffffffcc'; c.lineWidth = 3; c.beginPath(); c.moveTo(bx, by + 30); c.lineTo(bx + 2, 560); c.lineTo(bx + g.w - 2, 560); c.lineTo(bx + g.w, by + 30); c.stroke();
        c.strokeStyle = '#ffd34a'; c.lineWidth = 2; c.setLineDash([4, 3]); c.beginPath(); c.moveTo(bx + 2, 556 - g.line); c.lineTo(bx + g.w - 2, 556 - g.line); c.stroke(); c.setLineDash([]);
      }
      for (const d of drops) { c.fillStyle = '#5ac8ff'; c.fillRect(d.x - 2, d.y, 4, 8); }
      // jug
      c.save(); c.translate(JX, JY); c.rotate(ang * 1.2);
      c.fillStyle = '#d8e8f0'; c.beginPath(); c.moveTo(-40, -50); c.lineTo(40, -50); c.lineTo(52, -62); c.lineTo(46, 40); c.lineTo(-40, 40); c.fill();
      c.fillStyle = '#5ac8ff'; c.fillRect(-34, -20, 74, 54); c.strokeStyle = '#d8e8f0'; c.lineWidth = 8; c.beginPath(); c.arc(-46, -6, 18, 1.6, 4.7); c.stroke();
      c.restore();
      c.font = '400 9px "Press Start 2P", monospace'; c.textAlign = 'left'; c.fillStyle = '#ffffffaa'; c.fillText('SPILLS', 12, 22);
      for (let i = 0; i < 3; i++) { c.fillStyle = i < lost ? '#ff6a6a' : '#ffffff20'; c.fillRect(14 + i * 14, 30, 10, 10); }
      if (t < 5) { c.fillStyle = '#ffffffaa'; c.font = '600 14px Rubik, sans-serif'; c.textAlign = 'center'; c.fillText(tilt() ? 'tilt to pour to the yellow line' : 'drag right to pour to the yellow line', W / 2, 620); }
    },
    down(x) { drag = { x0: x, x }; },
    move(x) { if (drag) drag.x = x; },
    up() { drag = null; },
    key(k, d) { if (k === ' ') drag = d ? { x0: 0, x: 120 } : null; },
  };
}

export default {
  id: 'tilt-pour', title: 'Tilt Pour', tag: 'Casual · Motion', retro: false, w: W, h: H, goal: 25,
  hint: 'Tilt your phone to tip the jug and fill each passing glass to its yellow line. Spill or underfill three and you are done. No tilt? Drag right.',
  make,
};

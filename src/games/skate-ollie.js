import { clamp, rnd } from '../util.js';
import { sfx } from '../sfx.js';
import { haptic } from '../kit/device.js';

// Skate down the street. Tap to ollie over cones and benches. While in the air, swipe left or right
// to spin a kickflip, up for a grab: each trick scores, but you must land with the board level.
const W = 360, H = 640, GROUND = 470, SX = 100, G = 2200;

function make(api) {
  let y, vy, air, board, trick, tricks, obs, speed, dist, t, score, msg, combo, swipe, bail;
  function addObs() { const r = Math.random(); obs.push(r < .5 ? { k: 'cone', x: W + 30, w: 18, h: 30 } : r < .8 ? { k: 'bench', x: W + 30, w: 60, h: 36 } : { k: 'gap', x: W + 30, w: 70, h: 0 }); }
  return {
    reset() { y = GROUND; vy = 0; air = false; board = 0; trick = null; tricks = []; obs = []; speed = 220; dist = 0; t = 0; score = 0; msg = null; combo = 0; swipe = null; bail = 0; addObs(); },
    update(dt) {
      t += dt; if (msg) msg.l -= dt;
      speed = Math.min(420, 220 + dist / 40); const dx = speed * dt; dist += dx;
      for (const o of obs) o.x -= dx; obs = obs.filter(o => o.x + o.w > -20);
      const last = obs[obs.length - 1]; if (!last || last.x < W - rnd(220, 380)) addObs();
      if (air) {
        vy += G * dt; y += vy * dt;
        if (trick) { trick.k += dt / trick.dur; board = trick.type === 'flip' ? trick.dir * trick.k * Math.PI * 2 : 0; if (trick.k >= 1) { tricks.push(trick.type); combo++; const pts = trick.type === 'flip' ? 3 : 2; score += pts * combo; api.score(score); msg = { txt: `${trick.type === 'flip' ? 'KICKFLIP' : 'GRAB'} x${combo}`, l: .8 }; trick = null; board = 0; haptic('light'); sfx(700 + combo * 60, .06, 'square', .03, 150); } }
        const gap = obs.find(o => o.k === 'gap' && SX > o.x && SX < o.x + o.w);
        if (y >= GROUND && !gap) {
          y = GROUND; air = false; vy = 0;
          if (trick) { bail = 1; msg = { txt: 'BAIL!', l: 1 }; haptic('error'); sfx(120, .4, 'square', .05, -40); return api.over(); }
          if (tricks.length) haptic('success'); else haptic('tick'); sfx(150, .05, 'square', .05);
          tricks = []; combo = 0;
        }
      } else {
        const gap = obs.find(o => o.k === 'gap' && SX > o.x + 6 && SX < o.x + o.w - 6);
        if (gap) { air = true; vy = 0; }
      }
      if (y > GROUND + 60) { msg = { txt: 'FELL IN', l: 1 }; haptic('error'); return api.over(); }
      for (const o of obs) if (o.k !== 'gap' && SX + 16 > o.x && SX - 16 < o.x + o.w && y > GROUND - o.h) { bail = 1; msg = { txt: 'OUCH', l: 1 }; haptic('error'); sfx(100, .4, 'square', .05, -40); return api.over(); }
      for (const o of obs) if (!o.passed && o.x + o.w < SX - 16) { o.passed = true; score += 1; api.score(score); }
    },
    fx(dt) { bail += dt; },
    draw(c) {
      c.fillStyle = '#ffd8a8'; c.fillRect(0, 0, W, H);
      c.fillStyle = '#e8b888'; for (let i = 0; i < 6; i++) { const x = ((i * 90 - dist * .2) % 540 + 540) % 540 - 90; c.fillRect(x, 220 - (i % 3) * 40, 70, GROUND - 220 + (i % 3) * 40); }
      c.fillStyle = '#7a7a8a'; c.fillRect(0, GROUND, W, H - GROUND); c.fillStyle = '#9a9aaa'; for (let x = -(dist % 60); x < W; x += 60) c.fillRect(x, GROUND + 20, 30, 4);
      for (const o of obs) {
        if (o.k === 'gap') { c.fillStyle = '#2a2a33'; c.fillRect(o.x, GROUND, o.w, H - GROUND); continue; }
        if (o.k === 'cone') { c.fillStyle = '#ff7a2a'; c.beginPath(); c.moveTo(o.x, GROUND); c.lineTo(o.x + o.w / 2, GROUND - o.h); c.lineTo(o.x + o.w, GROUND); c.fill(); c.fillStyle = '#fff'; c.fillRect(o.x + 5, GROUND - 14, o.w - 10, 4); }
        else { c.fillStyle = '#7a4a2a'; c.fillRect(o.x, GROUND - o.h, o.w, 8); c.fillRect(o.x + 6, GROUND - o.h, 6, o.h); c.fillRect(o.x + o.w - 12, GROUND - o.h, 6, o.h); }
      }
      // skater
      c.save(); c.translate(SX, y);
      if (bail) c.rotate(Math.min(1.4, bail * 4));
      const grab = trick && trick.type === 'grab';
      c.fillStyle = '#3a5ad0'; c.fillRect(-8, -60 + (grab ? 14 : 0), 16, 30); c.fillStyle = '#f2c79a'; c.beginPath(); c.arc(0, -70 + (grab ? 14 : 0), 9, 0, 7); c.fill();
      c.strokeStyle = '#2a2a3a'; c.lineWidth = 5; c.beginPath(); c.moveTo(-4, -30 + (grab ? 14 : 0)); c.lineTo(-10, -8); c.moveTo(4, -30 + (grab ? 14 : 0)); c.lineTo(10, -8); c.stroke();
      if (grab) { c.strokeStyle = '#f2c79a'; c.lineWidth = 4; c.beginPath(); c.moveTo(6, -40); c.lineTo(14, -6); c.stroke(); }
      c.save(); c.translate(0, -4); c.scale(1, Math.cos(board)); c.fillStyle = '#d04a4a'; c.fillRect(-22, -3, 44, 5); c.restore();
      c.fillStyle = '#222'; c.beginPath(); c.arc(-14, 2, 3, 0, 7); c.arc(14, 2, 3, 0, 7); c.fill();
      c.restore();
      if (msg && msg.l > 0) { c.globalAlpha = clamp(msg.l * 2, 0, 1); c.fillStyle = msg.txt === 'BAIL!' || msg.txt === 'OUCH' || msg.txt === 'FELL IN' ? '#d03a3a' : '#3a2a6a'; c.font = '400 14px "Press Start 2P", monospace'; c.textAlign = 'center'; c.fillText(msg.txt, W / 2, 160); c.globalAlpha = 1; }
      if (t < 5) { c.fillStyle = '#5a3a2a'; c.font = '600 14px Rubik, sans-serif'; c.textAlign = 'center'; c.fillText('tap to ollie · swipe in the air for tricks', W / 2, 600); }
    },
    down(x, y2) { swipe = { x, y: y2, t: t }; },
    up(x, y2) {
      if (!swipe) return; const dx = x - swipe.x, dy = y2 - swipe.y; swipe = null;
      if (!air) { if (Math.hypot(dx, dy) < 30) { air = true; vy = -880; haptic('medium'); sfx(260, .08, 'square', .04, 300); } return; }
      if (trick) return;
      if (Math.abs(dx) > 30 && Math.abs(dx) > Math.abs(dy)) trick = { type: 'flip', dir: Math.sign(dx), k: 0, dur: .32 };
      else if (dy < -30) trick = { type: 'grab', k: 0, dur: .28 };
    },
    key(k, d) { if (!d) return; if ((k === ' ' || k === 'ArrowUp') && !air) { air = true; vy = -880; } else if (air && !trick && (k === 'ArrowLeft' || k === 'ArrowRight')) trick = { type: 'flip', dir: k === 'ArrowLeft' ? -1 : 1, k: 0, dur: .32 }; },
  };
}

export default {
  id: 'skate-ollie', title: 'Skate Ollie', tag: 'Casual · Action', retro: false, w: W, h: H, goal: 40,
  hint: 'Tap to ollie over cones, benches and gaps. In the air, swipe sideways for a kickflip or up for a grab. Tricks chain into combos, but land before a trick ends and you bail.',
  make,
};

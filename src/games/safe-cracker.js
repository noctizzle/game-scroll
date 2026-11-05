import { clamp, rnd } from '../util.js';
import { sfx } from '../sfx.js';
import { haptic } from '../kit/device.js';

// Feel for the combination: drag the dial round; the phone ticks on every number and thumps on the right one.
// Lift your finger on it to lock that number in. Three numbers open the safe.
const W = 360, H = 640, CX = W / 2, CY = 330, DR = 120, NUMS = 40;

function make(api) {
  let ang, combo, idx, time, score, t, grab, lastNum, glow, open, wrong, dead;
  function newSafe() { combo = [0, 0, 0].map(() => rnd(0, NUMS) | 0); idx = 0; open = 0; }
  const num = () => ((Math.round(-ang / (Math.PI * 2) * NUMS) % NUMS) + NUMS) % NUMS;
  return {
    reset() { ang = 0; time = 40; score = 0; t = 0; grab = null; lastNum = 0; glow = 0; wrong = 0; dead = 0; newSafe(); },
    update(dt) {
      t += dt; glow = Math.max(0, glow - dt * 2); wrong = Math.max(0, wrong - dt); open = Math.max(0, open - dt);
      time -= dt; if (time <= 0) { time = 0; haptic('error'); return api.over(); }
    },
    fx(dt) { dead += dt; },
    draw(c) {
      const g = c.createRadialGradient(CX, CY, 40, CX, CY, 420); g.addColorStop(0, '#3a3f4a'); g.addColorStop(1, '#14161b'); c.fillStyle = g; c.fillRect(0, 0, W, H);
      c.fillStyle = '#20242c'; c.beginPath(); c.roundRect(30, 150, W - 60, 360, 24); c.fill(); c.strokeStyle = '#4a505e'; c.lineWidth = 3; c.stroke();
      for (const [x, y] of [[50, 170], [W - 50, 170], [50, 490], [W - 50, 490]]) { c.fillStyle = '#4a505e'; c.beginPath(); c.arc(x, y, 6, 0, 7); c.fill(); }
      c.save(); c.translate(CX, CY); c.rotate(ang);
      const dg = c.createRadialGradient(-30, -30, 10, 0, 0, DR); dg.addColorStop(0, '#d9dde6'); dg.addColorStop(1, '#7c8394'); c.fillStyle = dg; c.beginPath(); c.arc(0, 0, DR, 0, 7); c.fill();
      c.fillStyle = '#2b2f38'; c.textAlign = 'center'; c.textBaseline = 'middle';
      for (let i = 0; i < NUMS; i++) { const a = i / NUMS * Math.PI * 2 - Math.PI / 2; c.save(); c.rotate(a + Math.PI / 2); c.fillRect(-1, -DR + 4, 2, i % 5 ? 8 : 16); if (i % 5 === 0) { c.font = '700 13px Rubik, sans-serif'; c.fillText(i, 0, -DR + 30); } c.restore(); }
      c.fillStyle = '#5b6170'; c.beginPath(); c.arc(0, 0, 34, 0, 7); c.fill(); c.fillStyle = '#9aa1b0'; c.fillRect(-6, -30, 12, 60);
      c.restore();
      c.textAlign = 'center'; c.textBaseline = 'alphabetic';
      c.fillStyle = glow > 0 ? `rgba(255,211,74,${.4 + glow * .6})` : '#ffd34a88'; c.beginPath(); c.moveTo(CX, CY - DR - 4); c.lineTo(CX - 10, CY - DR - 22); c.lineTo(CX + 10, CY - DR - 22); c.fill();
      for (let i = 0; i < 3; i++) { const x = CX - 50 + i * 50, y = 200; c.fillStyle = i < idx ? '#3ddc97' : (wrong > 0 && i === idx) ? '#ff5d73' : '#2b2f38'; c.beginPath(); c.arc(x, y, 12, 0, 7); c.fill(); c.strokeStyle = '#4a505e'; c.lineWidth = 2; c.stroke(); }
      c.fillStyle = '#e8ecf5'; c.font = '400 18px "Press Start 2P", monospace'; c.fillText(String(num()).padStart(2, '0'), CX, 470);
      c.font = '400 14px "Press Start 2P", monospace'; c.fillStyle = time < 8 ? '#ff6b6b' : '#e8ecf5aa'; c.fillText(`${Math.ceil(time)}s`, CX, 120);
      c.font = '500 13px Rubik, sans-serif'; c.fillStyle = '#e8ecf599'; c.fillText('Feel for the heavy click, then let go', CX, 560);
      if (open > 0) { c.fillStyle = `rgba(61,220,151,${open})`; c.font = '400 20px "Press Start 2P", monospace'; c.fillText('OPEN!', CX, CY); }
    },
    down(x, y) { grab = Math.atan2(y - CY, x - CX); },
    move(x, y, p) {
      if (!p || grab == null) return; const a = Math.atan2(y - CY, x - CX); let d = a - grab; d = Math.atan2(Math.sin(d), Math.cos(d)); ang += d; grab = a;
      const n = num(); if (n !== lastNum) { lastNum = n; if (n === combo[idx]) { haptic('heavy'); glow = 1; sfx(140, .06, 'square', .06); } else { haptic('tick'); sfx(1400, .01, 'square', .015); } }
    },
    up() {
      if (grab == null) return; grab = null;
      if (num() === combo[idx]) { idx++; sfx(600 + idx * 120, .1, 'triangle', .05); haptic('medium');
        if (idx === 3) { score++; api.score(score); time += 15; open = 1; haptic('success'); sfx(880, .3, 'triangle', .06, 400); newSafe(); } }
      else { wrong = .5; time = Math.max(0, time - 3); haptic('warning'); sfx(200, .15, 'sawtooth', .04, -60); }
    },
    key(k, d) { if (!d) return; if (k === 'ArrowLeft' || k === 'ArrowRight') { const s = k === 'ArrowLeft' ? -1 : 1; this.down(CX + DR, CY); this.move(CX + DR * Math.cos(s * Math.PI / NUMS * 2), CY + DR * Math.sin(s * Math.PI / NUMS * 2), true); grab = null; } if (k === ' ') { grab = 0; this.up(); } },
  };
}

export default {
  id: 'safe-cracker', title: 'Safe Cracker', tag: 'Casual · Haptics', retro: false, w: W, h: H, goal: 2,
  hint: 'Turn the dial slowly. Every number ticks; the right one thumps and the arrow glows. Let go on it.',
  make,
};

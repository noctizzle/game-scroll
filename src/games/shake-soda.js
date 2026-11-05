import { clamp, rnd } from '../util.js';
import { sfx } from '../sfx.js';
import { onShake, want, haptic } from '../kit/device.js';

// Shake the phone (or tap fast) to build fizz. When the timer runs out the pressure must sit inside the green zone.
const W = 360, H = 640, BX = 130, BY = 150, BW = 100, BH = 360;

function make(api) {
  want('motion');
  let p, zone, timer, round, score, bubbles, pop, off, t, dead, shook;
  function newRound() { const w = Math.max(10, 26 - round * 2); const lo = rnd(25, 92 - w); zone = [lo, lo + w]; timer = 4.5; p = Math.max(0, p - 30); }
  return {
    reset() { off?.(); off = onShake(j => { if (this._live) { p += clamp(j / 4, 5, 14); shook = true; haptic('light'); sfx(300 + p * 4, .04, 'triangle', .02); } }); p = 0; round = 0; score = 0; bubbles = []; pop = 0; t = 0; dead = 0; shook = false; this._live = false; newRound(); },
    update(dt) {
      this._live = true; t += dt; timer -= dt; pop = Math.max(0, pop - dt);
      p = Math.max(0, p - dt * (6 + p * .12)); p = Math.min(110, p);
      if (Math.random() < p / 60) bubbles.push({ x: BX + rnd(12, BW - 12), y: BY + BH - 10, v: rnd(40, 120) + p, r: rnd(2, 5) });
      for (const b of bubbles) b.y -= b.v * dt; bubbles = bubbles.filter(b => b.y > BY + 40 + (1 - Math.min(1, p / 100)) * 0);
      if (timer <= 0) {
        if (p >= zone[0] && p <= zone[1]) { score++; round++; api.score(score); pop = .6; haptic('success'); sfx(880, .2, 'triangle', .06, 400); newRound(); }
        else { this._live = false; haptic('error'); sfx(140, .4, 'sawtooth', .05, -60); return api.over(); }
      }
    },
    fx(dt) { dead += dt; this._live = false; },
    draw(c) {
      c.fillStyle = '#123b3a'; c.fillRect(0, 0, W, H);
      c.fillStyle = '#ffffff0c'; for (let i = 0; i < 12; i++) c.fillRect(0, i * 56, W, 28);
      const gx = W - 70, gy = BY, gh = BH;   // gauge
      c.fillStyle = '#0a2221'; c.fillRect(gx, gy, 30, gh);
      c.fillStyle = '#3ddc97'; c.fillRect(gx, gy + gh * (1 - zone[1] / 110), 30, gh * (zone[1] - zone[0]) / 110);
      c.fillStyle = '#ffd34a'; const py = gy + gh * (1 - Math.min(110, p) / 110); c.fillRect(gx - 8, py - 2, 46, 4);
      const shake = this._live ? Math.min(6, p / 15) : 0, sx = rnd(-shake, shake);
      c.save(); c.translate(sx, 0);
      c.fillStyle = '#8be9ff22'; c.beginPath(); c.roundRect(BX, BY + 40, BW, BH - 40, 26); c.fill();
      c.fillStyle = '#8be9ff33'; c.fillRect(BX + 30, BY, BW - 60, 50);
      c.fillStyle = '#ff5d73'; c.fillRect(BX + 26, BY - 16, BW - 52, 20);
      const lg = c.createLinearGradient(0, BY + 80, 0, BY + BH); lg.addColorStop(0, '#ffb020'); lg.addColorStop(1, '#ff7a20'); c.fillStyle = lg; c.beginPath(); c.roundRect(BX + 8, BY + 80, BW - 16, BH - 88, 20); c.fill();
      c.fillStyle = '#fff8'; for (const b of bubbles) { c.beginPath(); c.arc(b.x, b.y, b.r, 0, 7); c.fill(); }
      c.fillStyle = '#ffffff30'; c.fillRect(BX + 14, BY + 60, 8, BH - 100);
      c.restore();
      if (pop > 0) { c.fillStyle = `rgba(255,255,255,${pop})`; for (let i = 0; i < 14; i++) { const a = i / 14 * 6.28; c.beginPath(); c.arc(BX + BW / 2 + Math.cos(a) * (1 - pop) * 140, BY - 10 + Math.sin(a) * (1 - pop) * 90, 6, 0, 7); c.fill(); } }
      c.textAlign = 'center'; c.fillStyle = timer < 1.5 ? '#ff6b6b' : '#e8fff6'; c.font = '400 22px "Press Start 2P", monospace'; c.fillText(Math.max(0, timer).toFixed(1), W / 2, 110);
      c.font = '500 13px Rubik, sans-serif'; c.fillStyle = '#e8fff6aa'; c.fillText(shook ? 'Land the needle in the green' : 'Shake your phone, or tap fast', W / 2, H - 60);
    },
    down() { p += 6; haptic('tick'); sfx(260 + p * 4, .03, 'triangle', .02); },
    key(k, d) { if (d && k === ' ') this.down(); },
  };
}

export default {
  id: 'shake-soda', title: 'Shake Soda', tag: 'Casual · Motion', retro: false, w: W, h: H, goal: 4,
  hint: 'Shake to build fizz, but not too much. Stop the needle in the green when the timer hits zero.',
  make,
};

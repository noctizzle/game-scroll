import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { startMic, stopMic, haptic } = gs.device;
const { clamp, rnd } = gs.util;

// Your voice is the throttle: make noise to climb, go quiet to fall, and fly through the rings. Holding the screen also thrusts.
const W = 360, H = 640, RX = 90;

function make(api) {
  let y, vy, rings, spawn, score, lives, hold, mic, asked, level, t, dead, flames;
  return {
    reset() { stopMic(); mic = null; y = H / 2; vy = 0; rings = []; spawn = 1; score = 0; lives = 3; hold = false; asked = false; level = 0; t = 0; dead = 0; flames = []; },
    update(dt) {
      t += dt;
      if (!asked) { asked = true; startMic().then(m => { mic = m; }); }
      level = Math.max(hold ? .55 : 0, mic ? clamp((mic.level() - .04) * 2.2, 0, 1) : 0);
      vy += (520 - level * 1350) * dt; vy = clamp(vy, -420, 420); y += vy * dt;
      if (y < 30) { y = 30; vy = 0; } if (y > H - 40) { y = H - 40; vy = 0; }
      if (level > .1) flames.push({ x: RX - 26, y: y + rnd(-3, 3), vx: -rnd(120, 220), life: .3 * level + .05 });
      for (const f of flames) { f.x += f.vx * dt; f.life -= dt; } flames = flames.filter(f => f.life > 0);
      spawn -= dt; const sp = 150 + Math.min(140, score * 6);
      if (spawn <= 0) { spawn = rnd(1.4, 2) * 150 / sp + .6; const last = rings[rings.length - 1]; const ry = clamp((last ? last.y : H / 2) + rnd(-200, 200), 110, H - 120); rings.push({ x: W + 40, y: ry, gap: Math.max(80, 140 - score * 3), done: false }); }
      for (const r of rings) {
        r.x -= sp * dt;
        if (!r.done && r.x < RX) { r.done = true; if (Math.abs(y - r.y) < r.gap / 2) { score++; api.score(score); haptic('light'); sfx(600 + score * 20, .1, 'triangle', .05, 200); } else { lives--; r.miss = true; haptic('warning'); sfx(150, .3, 'sawtooth', .05, -60); if (lives <= 0) { haptic('error'); stopMic(); return api.over(); } } }
      }
      rings = rings.filter(r => r.x > -60);
    },
    fx(dt) { dead += dt; vy += 600 * dt; y = Math.min(H - 40, y + vy * dt); },
    draw(c) {
      const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#1a1446'); g.addColorStop(1, '#3a1d4a'); c.fillStyle = g; c.fillRect(0, 0, W, H);
      c.fillStyle = '#ffffff22'; for (let i = 0; i < 30; i++) { const x = ((i * 89 - t * 40 * (1 + i % 3)) % W + W) % W; c.fillRect(x, (i * 67) % H, 2, 2); }
      for (const r of rings) {   // back half, rocket, front half gives a fly-through look
        c.strokeStyle = r.miss ? '#ff5d73' : r.done ? '#7dffb2' : '#ffd34a'; c.lineWidth = 7;
        c.beginPath(); c.ellipse(r.x, r.y, 14, r.gap / 2, 0, Math.PI / 2, Math.PI * 1.5); c.stroke();
      }
      for (const f of flames) { c.fillStyle = `rgba(255,${120 + f.life * 300 | 0},60,${f.life * 3})`; c.beginPath(); c.arc(f.x, f.y, 4 + f.life * 20, 0, 7); c.fill(); }
      c.save(); c.translate(RX, y); c.rotate(clamp(vy / 900, -.5, .5));
      c.fillStyle = '#e8ecf5'; c.beginPath(); c.moveTo(26, 0); c.quadraticCurveTo(10, -14, -22, -11); c.lineTo(-22, 11); c.quadraticCurveTo(10, 14, 26, 0); c.fill();
      c.fillStyle = '#ff5d73'; c.beginPath(); c.moveTo(-14, -11); c.lineTo(-28, -20); c.lineTo(-22, -6); c.fill(); c.beginPath(); c.moveTo(-14, 11); c.lineTo(-28, 20); c.lineTo(-22, 6); c.fill();
      c.fillStyle = '#6ad1ff'; c.beginPath(); c.arc(6, 0, 5, 0, 7); c.fill(); c.restore();
      for (const r of rings) { c.strokeStyle = r.miss ? '#ff5d73' : r.done ? '#7dffb2' : '#ffd34a'; c.lineWidth = 7; c.beginPath(); c.ellipse(r.x, r.y, 14, r.gap / 2, 0, -Math.PI / 2, Math.PI / 2); c.stroke(); }
      // voice meter
      c.fillStyle = '#ffffff18'; c.fillRect(16, H - 30, W - 32, 10); c.fillStyle = level > .6 ? '#ff8a3d' : '#7dffb2'; c.fillRect(16, H - 30, (W - 32) * level, 10);
      c.fillStyle = '#ffffffaa'; c.font = '500 12px Rubik, sans-serif'; c.textAlign = 'left'; c.fillText(mic ? 'Make noise to climb' : 'Hold to climb (allow the mic to use your voice)', 16, H - 38);
      for (let i = 0; i < 3; i++) { c.fillStyle = i < lives ? '#ff5d73' : '#ff5d7333'; c.beginPath(); c.arc(W - 24 - i * 22, 28, 7, 0, 7); c.fill(); }
    },
    down() { hold = true; }, up() { hold = false; },
    key(k, d) { if (k === ' ') hold = d; },
  };
}

export default {
  id: 'shout-rocket', title: 'Shout Rocket', tag: 'Casual · Voice', retro: false, w: W, h: H, goal: 10,
  hint: 'Shout, sing or hum to climb. Fly through the rings. Hold the screen if you need to be quiet.',
  make,
};

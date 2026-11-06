import { clamp, rnd } from '../util.js';
import { sfx } from '../sfx.js';
import { haptic } from '../kit/device.js';

// Keep the ball off the ground. Tap the ball to kick it up: tap its left side to send it right
// and its right side to send it left. Wind picks up after ten kicks. Dead-centre kicks score double.
const W = 360, H = 640, R = 30, G = 1250, FLOOR = H - 70;

function make(api) {
  let ball, score, wind, windT, t, pops, kicks, dead, foot;
  const self = {
    reset() { ball = { x: W / 2, y: 260, vx: 0, vy: 0, rot: 0, live: false }; score = 0; wind = 0; windT = 3; t = 0; pops = []; kicks = 0; dead = 0; foot = null; },
    update(dt) {
      t += dt; for (const p of pops) p.l -= dt; pops = pops.filter(p => p.l > 0); if (foot) { foot.l -= dt; if (foot.l <= 0) foot = null; }
      if (!ball.live) { ball.y = 260 + Math.sin(t * 3) * 8; return; }
      if (kicks >= 10) { windT -= dt; if (windT <= 0) { windT = rnd(2, 4); wind = rnd(-1, 1) * Math.min(260, 60 + kicks * 6); } }
      ball.vx += wind * dt; ball.vy += G * dt; ball.x += ball.vx * dt; ball.y += ball.vy * dt; ball.rot += ball.vx * dt / R;
      if (ball.x < R) { ball.x = R; ball.vx = Math.abs(ball.vx) * .8; sfx(200, .03, 'triangle', .03); }
      if (ball.x > W - R) { ball.x = W - R; ball.vx = -Math.abs(ball.vx) * .8; sfx(200, .03, 'triangle', .03); }
      if (ball.y < R) { ball.y = R; ball.vy = Math.abs(ball.vy) * .5; }
      if (ball.y > FLOOR - R) { ball.y = FLOOR - R; haptic('error'); sfx(120, .3, 'triangle', .06, -30); return api.over(); }
    },
    fx(dt) { dead += dt; },
    draw(c) {
      const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#79c7ff'); g.addColorStop(1, '#c8ecff'); c.fillStyle = g; c.fillRect(0, 0, W, H);
      c.fillStyle = '#ffffffaa'; for (let i = 0; i < 4; i++) { const cx = ((i * 130 + t * (12 + wind * .2)) % 520 + 520) % 520 - 80; c.beginPath(); c.ellipse(cx, 90 + i * 60, 46, 14, 0, 0, 7); c.fill(); }
      c.fillStyle = '#4caf50'; c.fillRect(0, FLOOR, W, H - FLOOR); c.fillStyle = '#3d8f41'; for (let x = 0; x < W; x += 24) c.fillRect(x, FLOOR, 12, H - FLOOR);
      const sh = clamp(1 - (FLOOR - ball.y) / 600, .2, 1); c.fillStyle = '#00000030'; c.beginPath(); c.ellipse(ball.x, FLOOR + 4, R * sh, 6 * sh, 0, 0, 7); c.fill();
      c.save(); c.translate(ball.x, ball.y); c.rotate(ball.rot);
      c.fillStyle = '#fff'; c.beginPath(); c.arc(0, 0, R, 0, 7); c.fill();
      c.fillStyle = '#222'; c.beginPath(); for (let i = 0; i < 5; i++) { const a = i / 5 * 6.283 - 1.57; c.lineTo(Math.cos(a) * 10, Math.sin(a) * 10); } c.fill();
      for (let i = 0; i < 5; i++) { const a = i / 5 * 6.283 - 1.57; c.beginPath(); c.arc(Math.cos(a) * 26, Math.sin(a) * 26, 7, 0, 7); c.fill(); }
      c.restore();
      if (foot) { c.globalAlpha = foot.l * 3; c.strokeStyle = '#ffffff'; c.lineWidth = 3; c.beginPath(); c.arc(foot.x, foot.y, 14 + (1 - foot.l * 3) * 20, 0, 7); c.stroke(); c.globalAlpha = 1; }
      if (Math.abs(wind) > 20) { c.fillStyle = '#ffffffcc'; c.font = '400 9px "Press Start 2P", monospace'; c.textAlign = wind > 0 ? 'right' : 'left'; c.fillText(wind > 0 ? 'WIND >>' : '<< WIND', wind > 0 ? W - 12 : 12, 22); }
      for (const p of pops) { c.globalAlpha = clamp(p.l * 2, 0, 1); c.fillStyle = '#1a3a6a'; c.font = '400 12px "Press Start 2P", monospace'; c.textAlign = 'center'; c.fillText(p.txt, p.x, p.y - (1 - p.l) * 40); c.globalAlpha = 1; }
      if (!ball.live) { c.fillStyle = '#1a3a6acc'; c.font = '600 14px Rubik, sans-serif'; c.textAlign = 'center'; c.fillText('tap the ball to kick it up', W / 2, 360); }
    },
    down(x, y) {
      const dx = x - ball.x, dy = y - ball.y; if (Math.hypot(dx, dy) > R + 26) return;
      const centre = Math.abs(dx) < 7; ball.live = true; kicks++;
      ball.vy = -Math.min(980, 820 + kicks * 3); ball.vx = clamp(-dx * 9 + ball.vx * .2, -420, 420);
      const pts = centre ? 2 : 1; score += pts; api.score(score);
      foot = { x, y, l: .3 }; haptic(centre ? 'medium' : 'light'); sfx(centre ? 660 : 440, .06, 'triangle', .06, 120);
      if (centre) pops.push({ x: ball.x, y: ball.y - 50, txt: 'SWEET +2', l: .8 });
    },
    key(k, d) { if (d && k === ' ') self.down(ball.x + rnd(-5, 5), ball.y); },
  };
  return self;
}

export default {
  id: 'juggle-kick', title: 'Juggle Kick', tag: 'Casual · Sports', retro: false, w: W, h: H, goal: 25,
  hint: 'Tap the ball to kick it up. Tap off-centre to push it sideways. A dead-centre kick scores 2. Do not let it touch the grass.',
  make,
};

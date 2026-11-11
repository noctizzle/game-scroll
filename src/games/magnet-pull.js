import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { haptic } = gs.device;
const { clamp, rnd } = gs.util;
const { Feel } = gs.effects;

// You can't touch the steel ball, but your finger is a magnet. Hold near it to pull it along,
// steer round the spikes and into the goal ring. Each goal is a new layout and adds time.
const W = 360, H = 640, BR = 13;

function make(api) {
  const feel = new Feel({ sound: false, buzz: false });   // the game has its own sounds and buzzes
  let ball, goal, spikes, mag, time, score, t, trail, burst;
  function layout() {
    ball = { x: rnd(60, 300), y: rnd(470, 560), vx: 0, vy: 0 };
    goal = { x: rnd(60, 300), y: rnd(120, 220), r: Math.max(26, 40 - score) };
    spikes = []; const n = Math.min(10, 3 + score);
    for (let i = 0; i < n * 4 && spikes.length < n; i++) {
      const s = { x: rnd(30, W - 30), y: rnd(150, 520), r: rnd(14, 24) };
      if (Math.hypot(s.x - ball.x, s.y - ball.y) < 80 || Math.hypot(s.x - goal.x, s.y - goal.y) < 70) continue;
      if (spikes.some(o => Math.hypot(o.x - s.x, o.y - s.y) < o.r + s.r + 40)) continue;   // always leave room to pass
      spikes.push(s);
    }
    trail = [];
  }
  return {
    get _s() { return { ball, goal }; },
    reset() { score = 0; time = 30; t = 0; mag = null; burst = 0; feel.clear(); layout(); },
    fx(dt) { feel.update(dt); },
    update(dt) {
      feel.update(dt); t += dt; time -= dt; burst = Math.max(0, burst - dt * 2); if (time <= 0) { haptic('error'); return api.over(); }
      if (mag) {
        const dx = mag.x - ball.x, dy = mag.y - ball.y, d = Math.max(30, Math.hypot(dx, dy)), f = Math.min(800, 1.2e6 / (d * d));
        ball.vx += dx / d * f * dt; ball.vy += dy / d * f * dt; if (Math.random() < dt * 10) haptic('tick');
      }
      ball.vx *= Math.pow(.35, dt); ball.vy *= Math.pow(.35, dt);
      ball.x += ball.vx * dt; ball.y += ball.vy * dt;
      if (ball.x < BR) { ball.x = BR; ball.vx = Math.abs(ball.vx) * .5; } if (ball.x > W - BR) { ball.x = W - BR; ball.vx = -Math.abs(ball.vx) * .5; }
      if (ball.y < 60 + BR) { ball.y = 60 + BR; ball.vy = Math.abs(ball.vy) * .5; } if (ball.y > H - BR) { ball.y = H - BR; ball.vy = -Math.abs(ball.vy) * .5; }
      trail.push({ x: ball.x, y: ball.y }); if (trail.length > 16) trail.shift();
      for (const s of spikes) if (Math.hypot(s.x - ball.x, s.y - ball.y) < s.r + BR - 3) { feel.juice.burst(ball.x, ball.y, { n: 18, speed: 220, life: .5, size: 3.5, color: ['#ff4d6a', '#ffffff', '#6a7a90'] }).shake(9).flash('#ff4d6a', .25); haptic('error'); sfx(120, .4, 'sawtooth', .05, -40); return api.over(); }
      if (Math.hypot(goal.x - ball.x, goal.y - ball.y) < goal.r - BR * .4 && Math.hypot(ball.vx, ball.vy) < 260) {
        feel.juice.burst(goal.x, goal.y, { n: 24, speed: 220, life: .6, size: 4, color: ['#7dff9a', '#ffffff'] }).pop(goal.x, goal.y - goal.r - 10, '+6s', { color: '#7dff9a', size: 20 });
        score++; api.score(score); time += 6; burst = 1; haptic('success'); sfx(880, .2, 'triangle', .06, 300); layout();
      }
    },
    draw(c) {
      c.fillStyle = '#1b2333'; c.fillRect(0, 0, W, H);
      c.strokeStyle = '#ffffff08'; c.lineWidth = 1; for (let x = 0; x < W; x += 30) { c.beginPath(); c.moveTo(x, 60); c.lineTo(x, H); c.stroke(); } for (let y = 60; y < H; y += 30) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
      feel.begin(c);
      c.strokeStyle = '#7dff9a'; c.lineWidth = 4; c.setLineDash([8, 6]); c.beginPath(); c.arc(goal.x, goal.y, goal.r, 0, 7); c.stroke(); c.setLineDash([]);
      c.fillStyle = '#7dff9a22'; c.beginPath(); c.arc(goal.x, goal.y, goal.r, 0, 7); c.fill();
      for (const s of spikes) { c.fillStyle = '#ff4d6a'; c.beginPath(); for (let i = 0; i < 16; i++) { const a = i / 16 * 6.283, r = i % 2 ? s.r * .6 : s.r; c.lineTo(s.x + Math.cos(a) * r, s.y + Math.sin(a) * r); } c.fill(); }
      trail.forEach((p, i) => { c.fillStyle = `rgba(180,200,230,${i / trail.length * .2})`; c.beginPath(); c.arc(p.x, p.y, BR, 0, 7); c.fill(); });
      const g = c.createRadialGradient(ball.x - 4, ball.y - 5, 2, ball.x, ball.y, BR); g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#6a7a90'); c.fillStyle = g; c.beginPath(); c.arc(ball.x, ball.y, BR, 0, 7); c.fill();
      if (mag) {
        c.strokeStyle = '#6ab8ff60'; c.lineWidth = 2; for (let k = 1; k < 4; k++) { c.beginPath(); c.arc(mag.x, mag.y, k * 18 + (t * 40 % 18), 0, 7); c.stroke(); }
        c.save(); c.translate(mag.x, mag.y); c.rotate(Math.atan2(ball.y - mag.y, ball.x - mag.x) + Math.PI / 2);
        c.lineWidth = 10; c.strokeStyle = '#e83a3a'; c.beginPath(); c.arc(0, 0, 14, Math.PI, 0); c.stroke(); c.fillStyle = '#ddd'; c.fillRect(-19, -1, 10, 8); c.fillRect(9, -1, 10, 8); c.restore();
      }
      if (burst) { c.strokeStyle = `rgba(125,255,154,${burst})`; c.lineWidth = 6; c.beginPath(); c.arc(W / 2, H / 2, (1 - burst) * 300, 0, 7); c.stroke(); }
      feel.end(c, W, H);
      c.fillStyle = time < 6 ? '#ff6060' : '#ffffffcc'; c.font = '400 10px "Press Start 2P", monospace'; c.textAlign = 'left'; c.fillText(`${Math.ceil(time)}s`, 12, 26);
      if (t < 5 && score === 0) { c.fillStyle = '#ffffffaa'; c.font = '600 14px Rubik, sans-serif'; c.textAlign = 'center'; c.fillText('hold near the ball to pull it to the ring', W / 2, 620); }
    },
    down(x, y) { mag = { x, y }; sfx(200, .1, 'sine', .03, 100); },
    move(x, y) { if (mag) mag = { x, y }; },
    up() { mag = null; },
    key(k, d) { if (k === ' ') mag = d ? { x: goal.x, y: goal.y } : null; },
  };
}

export default {
  id: 'magnet-pull', title: 'Magnet Pull', tag: 'Casual · Physics', retro: false, w: W, h: H, goal: 6,
  hint: 'Your finger is a magnet. Hold near the steel ball to pull it, and let go to coast. Guide it into the green ring without touching a spike.',
  make,
};
